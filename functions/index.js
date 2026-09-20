const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const logger = require("firebase-functions/logger");

admin.initializeApp();
const db = getFirestore();

// App Check : passer à true UNIQUEMENT quand les 3 pages envoient un jeton (APP_CHECK_SITE_KEY renseignée
// et statistiques de la console à ~100 % de requêtes vérifiées), sinon toutes les fonctions seraient refusées.
const ENFORCE_APP_CHECK = false;
setGlobalOptions({ region: "europe-west1", maxInstances: 10, enforceAppCheck: ENFORCE_APP_CHECK });

// Système de notifications (web push habitant, email + in-app commerçant) : voir notifications.js.
Object.assign(exports, (({ _t, ...fns }) => fns)(require("./notifications")));
// Reveal, compatibilité, prédiction, actualités : voir engagement.js.
Object.assign(exports, (({ _t, ...fns }) => fns)(require("./engagement")));
Object.assign(exports, (({ _t, ...fns }) => fns)(require("./impact")));
Object.assign(exports, (({ _t, ...fns }) => fns)(require("./configStore")));
Object.assign(exports, (({ _t, ...fns }) => fns)(require("./counters")));
Object.assign(exports, (({ _t, ...fns }) => fns)(require("./quota")));

// Économie NOOVA : seules les N premières réponses de la journée rapportent des POINTS échangeables ;
// au-delà (« mode libre »), chaque réponse rapporte des NOOVS. Toutes les valeurs : engagementConfig.js.
const CFG = require("./engagementConfig");
const { sectorCategory, parisDay, ADMIN_EMAILS } = require("./lib");
const NOOVS_PER_ANSWER = CFG.POINTS.NOOVS_PER_ANSWER;
const MAX_POINT_ANSWERS_PER_DAY = CFG.POINTS.MAX_ANSWERS_PER_DAY;
const MIN_ANSWER_MS = CFG.RESPONSE_TIME.MIN_FOR_GAIN_MS;
const DEMO_POINTS = CFG.POINTS.DEMO_POINTS;
const POINTS_BY_INDEX = CFG.POINTS.BY_QUESTION_INDEX;

// « Aujourd'hui » = jour civil à Paris (le quota se réinitialise à minuit en France, pas à 1h/2h du matin).
function todayStr() {
  return parisDay(Date.now());
}
function yesterdayStr() {
  return parisDay(Date.now() - 86400000);
}

/**
 * beginQuestion — horodate CÔTÉ SERVEUR l'affichage d'une question. submitAnswer s'appuie sur
 * cette heure (et non sur une durée envoyée par le client) pour appliquer le délai de lecture.
 */
exports.beginQuestion = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi pour répondre.");
  const { campaignId, questionIdx } = request.data || {};
  if (!campaignId || typeof questionIdx !== "number") throw new HttpsError("invalid-argument", "Paramètres invalides.");
  const qIdx = Math.max(0, Math.min(2, Math.floor(questionIdx)));
  await db.collection("users").doc(uid).update({ lastQuestionStart: { key: `${campaignId}_${qIdx}`, at: Date.now() } });
  return { ok: true };
});

/**
 * submitAnswer — crédite une réponse côté serveur (remplace l'écriture directe
 * client de responses.js). Le client ne peut plus jamais écrire points/xp/
 * answersCount lui-même : cette fonction est la seule voie, avec droits admin,
 * après re-vérification complète de l'éligibilité et du barème.
 */
exports.submitAnswer = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi pour répondre.");

  const { campaignId, questionIdx, answerValue } = request.data || {};
  if (!campaignId || typeof questionIdx !== "number") {
    throw new HttpsError("invalid-argument", "Paramètres de réponse invalides.");
  }
  const qIdx = Math.max(0, Math.min(2, Math.floor(questionIdx)));
  const answerRef = db.collection("answers").doc(`${uid}_${campaignId}_q${qIdx}`);
  const userRef = db.collection("users").doc(uid);
  const campaignRef = db.collection("campaigns").doc(campaignId);

  return db.runTransaction(async (tx) => {
    const [userSnap, campSnap, existingAnswerSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(campaignRef),
      tx.get(answerRef),
    ]);

    if (existingAnswerSnap.exists) {
      throw new HttpsError("already-exists", "Tu as déjà répondu à cette question.");
    }
    if (!userSnap.exists) throw new HttpsError("failed-precondition", "Profil introuvable.");
    if (!campSnap.exists) throw new HttpsError("not-found", "Campagne introuvable.");

    const user = userSnap.data();
    const camp = campSnap.data();

    // ── Re-vérification serveur de l'éligibilité (jamais confiance au client) ──
    if (camp.status !== "active" || (camp.endsAt && camp.endsAt.toMillis && camp.endsAt.toMillis() < Date.now())) {
      throw new HttpsError("failed-precondition", "Cette campagne n'est plus active.");
    }
    const userCity = (user.city || "").toLowerCase();
    const campCity = (camp.targetCity || camp.city || "").toLowerCase();
    if (!userCity || userCity !== campCity) {
      throw new HttpsError("permission-denied", "Cette campagne n'est pas disponible dans ta ville.");
    }
    // Modèle « demande d'ami » : aucune question d'un commerce sans autorisation explicite.
    const authorized = user.authorizedMerchants || [];
    if (camp.merchantId && !authorized.includes(camp.merchantId)) {
      throw new HttpsError("permission-denied", "Tu n'as pas autorisé ce commerce.");
    }
    const ageRanges = camp.ageRanges || [];
    const userAge = user.ageRange || user.age || "";
    if (ageRanges.length && userAge && !ageRanges.includes(userAge)) {
      throw new HttpsError("permission-denied", "Cette campagne ne cible pas ta tranche d'âge.");
    }
    const targetVolume = Number(camp.targetVolume ?? camp.volumeTarget ?? 100) || 100;
    const currentVolume = camp.answersCount || camp.responsesCount || 0;
    if (currentVolume >= targetVolume) {
      throw new HttpsError("resource-exhausted", "Cette campagne a atteint son volume cible.");
    }

    // ── Score qualité (réponse trop rapide pour être lue) ──
    // Temps mesuré CÔTÉ SERVEUR depuis beginQuestion : sans appel préalable (script qui saute
    // l'écran de question) ou en moins de 2,5 s, la réponse est marquée « rapide » et ne rapporte rien.
    const started = user.lastQuestionStart;
    const serverElapsed = (started && started.key === `${campaignId}_${qIdx}` && typeof started.at === "number") ? Date.now() - started.at : null;
    const flagged = serverElapsed === null || serverElapsed < MIN_ANSWER_MS;
    // Marquage « suspect » (seuil plus large, configurable) : SANS exclusion, pour analyse ultérieure.
    const suspect = serverElapsed === null || serverElapsed < CFG.RESPONSE_TIME.SUSPECT_MS;
    const qualityScore = flagged ? 0 : 1;

    // ── Barème : 3 réponses/jour en points, ensuite des NOOVS ──
    const today = todayStr();
    const answersToday = user.dailyAnswerDate === today ? (user.dailyAnswerCount || 0) : 0;
    const pointsEligible = answersToday < MAX_POINT_ANSWERS_PER_DAY;

    let earnedPts = 0, streakBonus = 0, serieBonus = 0, noovsEarned = 0;
    let newStreak = user.streak || 0;
    let newLastAnswerDate = user.lastAnswerDate || null;
    if (!flagged) {
      if (pointsEligible) {
        earnedPts = POINTS_BY_INDEX[qIdx] || 10;
        if (user.lastAnswerDate !== today) {
          streakBonus = CFG.POINTS.STREAK_BONUS;
          newStreak = user.lastAnswerDate === yesterdayStr() ? (user.streak || 0) + 1 : 1;
          newLastAnswerDate = today;
        }
        if (qIdx === 2) serieBonus = CFG.POINTS.SERIE_BONUS;
      } else {
        noovsEarned = NOOVS_PER_ANSWER;
      }
    }
    const totalEarned = earnedPts + streakBonus + serieBonus;
    // Une réponse trop rapide (non lue) ne consomme pas le quota du jour.
    const newAnswersToday = answersToday + (flagged ? 0 : 1);

    // Reveal : index de l'option choisie (question à choix) ; le texte reste la référence stockée.
    const qDef = (camp.questions && camp.questions[qIdx]) || { format: camp.format, options: camp.options };
    const optionIdx = (qDef.format === "mcq" && Array.isArray(qDef.options)) ? qDef.options.indexOf(answerValue != null ? String(answerValue) : "") : -1;
    const counted = optionIdx >= 0 && (CFG.REVEAL.COUNT_SUSPECT || !suspect) && (CFG.REVEAL.COUNT_FLAGGED || !flagged);

    // ── Écritures (transaction atomique) ──
    if (counted) {
      // Compteur serveur-seul par option : le client ne peut jamais lire la répartition avant d'avoir répondu.
      tx.set(db.collection("campaignStats").doc(campaignId), { [`q${qIdx}`]: { n: FieldValue.increment(1), c: { [String(optionIdx)]: FieldValue.increment(1) } } }, { merge: true });
    }
    tx.set(answerRef, {
      campaignId,
      userId: uid,
      merchantId: camp.merchantId || null,
      questionIdx: qIdx,
      brand: camp.merchantName || "",
      question: (camp.question || (camp.questions && camp.questions[qIdx] && camp.questions[qIdx].q) || "").toString().substring(0, 120),
      ico: camp.brandEmoji || "❓",
      answer: answerValue != null ? String(answerValue).substring(0, 500) : "",
      pointsAwarded: totalEarned,
      noovsAwarded: noovsEarned,
      qualityScore,
      flagged,
      responseMs: serverElapsed,
      suspect,
      category: sectorCategory(camp.sector || camp.merchantTheme),
      optionIdx,
      respondentAge: userAge,
      respondentCity: user.city || "",
      respondentInterests: user.interests || [],
      createdAt: FieldValue.serverTimestamp(),
    });

    const userUpdate = {
      ans: FieldValue.increment(1),
      dailyAnswerCount: newAnswersToday,
      dailyAnswerDate: today,
      dailyPointsDate: today,
      dailyPoints: (user.dailyPointsDate === today ? (user.dailyPoints || 0) : 0) + totalEarned,
      lastAnswerDate: newLastAnswerDate,
      streak: newStreak,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!flagged) {
      // Sert à envoyer la question du jour à l'heure habituelle de réponse (médiane des 5 dernières).
      const hh = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
      const minutes = +hh.find((x) => x.type === "hour").value * 60 + +hh.find((x) => x.type === "minute").value;
      userUpdate.answerMinutes = [...(user.answerMinutes || []), minutes].slice(-5);
    }
    if (totalEarned > 0) { userUpdate.points = FieldValue.increment(totalEarned); userUpdate.xp = FieldValue.increment(totalEarned); }
    if (noovsEarned > 0) userUpdate.noovs = FieldValue.increment(noovsEarned);
    if (qIdx === 0) userUpdate.answeredCampaigns = FieldValue.arrayUnion(campaignId);
    tx.update(userRef, userUpdate);

    tx.update(campaignRef, {
      answersCount: FieldValue.increment(1),
      responsesCount: FieldValue.increment(1),
    });

    if (user.city) {
      tx.set(db.collection("communityEvents").doc(), {
        type: "answer",
        userId: uid,
        displayName: user.name || "—",
        city: user.city,
        merchantId: camp.merchantId || null,
        brand: camp.merchantName || "",
        text: `a répondu à une question de ${camp.merchantName || "un commerce"}`,
        likeCount: 0,
        commentCount: 0,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return {
      pointsAwarded: totalEarned,
      noovsAwarded: noovsEarned,
      totalPoints: (user.points || 0) + totalEarned,
      totalXp: (user.xp || 0) + totalEarned,
      totalNoovs: (user.noovs || 0) + noovsEarned,
      pointsToday: (user.dailyPointsDate === today ? (user.dailyPoints || 0) : 0) + totalEarned,
      pointAnswersLimit: MAX_POINT_ANSWERS_PER_DAY,
      answersToday: newAnswersToday,
      pointAnswersLeft: Math.max(0, MAX_POINT_ANSWERS_PER_DAY - newAnswersToday),
      streak: newStreak,
      flagged,
    };
  });
});

/**
 * countConsent — tient à jour merchants/{id}.consentCount (audience affichée dans le
 * dashboard) à chaque événement de consentement. Faite côté serveur : les règles
 * interdisent à un habitant d'écrire sur le document d'un commerçant.
 */
exports.countConsent = onDocumentCreated("consentEvents/{eventId}", async (event) => {
  const e = event.data && event.data.data();
  if (!e || !e.merchantId || !["granted", "revoked"].includes(e.action)) return;
  const ref = db.collection("merchants").doc(e.merchantId);
  const snap = await ref.get();
  if (!snap.exists) return;
  await ref.update({ consentCount: FieldValue.increment(e.action === "granted" ? 1 : -1) });
});

/**
 * claimDemoPoints — crédite une seule fois les 10 points de la question d'essai
 * (répondue avant la création du compte). Idempotent : le drapeau demoClaimed
 * empêche tout second crédit, même si le client rappelle la fonction.
 */
exports.claimDemoPoints = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi pour récupérer tes points.");
  const userRef = db.collection("users").doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new HttpsError("failed-precondition", "Profil introuvable.");
    if (snap.data().demoClaimed) return { claimed: false, points: 0 };
    tx.update(userRef, {
      points: FieldValue.increment(DEMO_POINTS),
      xp: FieldValue.increment(DEMO_POINTS),
      demoClaimed: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { claimed: true, points: DEMO_POINTS };
  });
});

/**
 * estimateReach — portée estimée d'une campagne : nombre d'habitants de la ville du
 * commerçant, dont ceux intéressés par sa catégorie. Passe par une fonction car les
 * règles interdisent au commerçant de lire les comptes habitants ; seuls des nombres
 * agrégés sont renvoyés, jamais d'identité.
 */
exports.estimateReach = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi.");
  const mSnap = await db.collection("merchants").doc(uid).get();
  if (!mSnap.exists) throw new HttpsError("permission-denied", "Réservé aux commerçants.");
  const m = mSnap.data();
  const city = String(m.city || "").toLowerCase();
  const category = sectorCategory(m.sector);
  const base = db.collection("users").where("city", "==", city);
  const total = (await base.count().get()).data().count;
  let matching = null;
  try { matching = (await base.where("interests", "array-contains", category).count().get()).data().count; } catch (e) { logger.warn("estimateReach: matching", { message: e.message }); }
  return { city: m.cityLabel || m.city || "", total, matching, category };
});


/**
 * adminResetAllData — remise à zéro complète avant lancement (réservé admin).
 * Le client (SDK web) ne peut jamais supprimer un compte Firebase Auth autre que le
 * sien : seul le SDK Admin le peut, d'où cette Cloud Function. Supprime toutes les
 * données Firestore de test (récursivement, sous-collections comprises) ET tous les
 * comptes Auth sauf les comptes admin eux-mêmes (pour ne pas se déconnecter soi-même).
 */
exports.adminResetAllData = onCall({ timeoutSeconds: 300 }, async (request) => {
  const email = request.auth && request.auth.token && request.auth.token.email;
  if (!email || !ADMIN_EMAILS.includes(email)) {
    throw new HttpsError("permission-denied", "Réservé aux administrateurs Noova.");
  }

  const collectionsToWipe = [
    "merchants", "users", "campaigns", "rewards", "answers", "redemptions",
    "communityEvents", "weeklyQuestions", "chats", "friendCodes",
    "friendNotifications", "consentEvents", "planRequests", "invoices", "broadcasts",
  ];
  for (const name of collectionsToWipe) {
    await db.recursiveDelete(db.collection(name));
  }

  // Réinitialise les compteurs de villes sans supprimer le référentiel (label/active).
  const citiesSnap = await db.collection("cities").get();
  if (!citiesSnap.empty) {
    const cityBatch = db.batch();
    citiesSnap.forEach((d) => cityBatch.update(d.ref, { count: 0 }));
    await cityBatch.commit();
  }

  // Supprime tous les comptes Firebase Auth, sauf les comptes admin eux-mêmes.
  let deletedAuthCount = 0;
  let pageToken;
  do {
    const result = await getAuth().listUsers(1000, pageToken);
    const toDelete = result.users
      .filter((u) => !ADMIN_EMAILS.includes(u.email))
      .map((u) => u.uid);
    for (let i = 0; i < toDelete.length; i += 1000) {
      const chunk = toDelete.slice(i, i + 1000);
      if (chunk.length) {
        const res = await getAuth().deleteUsers(chunk);
        deletedAuthCount += res.successCount;
      }
    }
    pageToken = result.pageToken;
  } while (pageToken);

  return { deletedAuthCount };
});

/**
 * adminDeleteAccount — supprime un seul compte (commerçant ou habitant), Firestore
 * (données liées comprises) ET le compte Auth associé. Réservé admin.
 */
exports.adminDeleteAccount = onCall(async (request) => {
  const email = request.auth && request.auth.token && request.auth.token.email;
  if (!email || !ADMIN_EMAILS.includes(email)) {
    throw new HttpsError("permission-denied", "Réservé aux administrateurs Noova.");
  }
  const { uid, role } = request.data || {};
  if (!uid || !["merchant", "user"].includes(role)) {
    throw new HttpsError("invalid-argument", "Paramètres invalides (uid, role).");
  }

  if (role === "merchant") {
    const [campSnap, rewSnap, redemSnap, answSnap, consentSnap, invSnap] = await Promise.all([
      db.collection("campaigns").where("merchantId", "==", uid).get(),
      db.collection("rewards").where("merchantId", "==", uid).get(),
      db.collection("redemptions").where("merchantId", "==", uid).get(),
      db.collection("answers").where("merchantId", "==", uid).get(),
      db.collection("consentEvents").where("merchantId", "==", uid).get(),
      db.collection("invoices").where("merchantId", "==", uid).get(),
    ]);
    const merchantDocs = [...campSnap.docs, ...rewSnap.docs, ...redemSnap.docs, ...answSnap.docs, ...consentSnap.docs, ...invSnap.docs];
    for (const d of merchantDocs) await db.recursiveDelete(d.ref);
    await db.recursiveDelete(db.collection("merchants").doc(uid));
  } else {
    const [answSnap, redemSnap, commSnap, friendCodeSnap, chatSnap, consentSnap, notifFromSnap, notifToSnap] = await Promise.all([
      db.collection("answers").where("userId", "==", uid).get(),
      db.collection("redemptions").where("userId", "==", uid).get(),
      db.collection("communityEvents").where("userId", "==", uid).get(),
      db.collection("friendCodes").where("uid", "==", uid).get(),
      db.collection("chats").where("participants", "array-contains", uid).get(),
      db.collection("consentEvents").where("userId", "==", uid).get(),
      db.collection("friendNotifications").where("fromUid", "==", uid).get(),
      db.collection("friendNotifications").where("toUid", "==", uid).get(),
    ]);
    const userDocs = [...answSnap.docs, ...redemSnap.docs, ...commSnap.docs, ...friendCodeSnap.docs, ...chatSnap.docs, ...consentSnap.docs, ...notifFromSnap.docs, ...notifToSnap.docs];
    for (const d of userDocs) await db.recursiveDelete(d.ref);
    await db.recursiveDelete(db.collection("users").doc(uid));
  }

  try {
    await getAuth().deleteUser(uid);
  } catch (e) {
    // Compte Auth déjà absent ou introuvable : les données Firestore sont supprimées
    // quand même, ce n'est pas bloquant.
  }
  return { ok: true };
});
