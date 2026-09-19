const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ region: "europe-west1", maxInstances: 10 });

const DAILY_CAP = 300;
const MIN_ANSWER_MS = 900;
const DEMO_POINTS = 10;
const POINTS_BY_INDEX = [10, 15, 20]; // Q1/Q2/Q3, barème fixé par NOOVA (§2 NOOVA_POINTS_SYSTEM.md)

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function yesterdayStr() {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10);
}

/**
 * submitAnswer — crédite une réponse côté serveur (remplace l'écriture directe
 * client de responses.js). Le client ne peut plus jamais écrire points/xp/
 * answersCount lui-même : cette fonction est la seule voie, avec droits admin,
 * après re-vérification complète de l'éligibilité et du barème.
 */
exports.submitAnswer = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi pour répondre.");

  const { campaignId, questionIdx, answerValue, elapsedMs } = request.data || {};
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
    if (camp.status !== "active") {
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

    // ── Score qualité (réponse trop rapide pour être un vrai choix humain) ──
    // Un elapsedMs manquant ou invalide est traité comme suspect (fail-safe) : le client
    // ne peut pas contourner l'anti-triche en omettant simplement ce champ.
    const flagged = typeof elapsedMs !== "number" || elapsedMs < 0 || elapsedMs < MIN_ANSWER_MS;
    const qualityScore = flagged ? 0 : 1;

    // ── Barème (§2 NOOVA_POINTS_SYSTEM.md) ──
    const today = todayStr();
    let dailyEarned = user.dailyEarnedDate === today ? (user.dailyEarned || 0) : 0;

    let earnedPts = flagged ? 0 : (POINTS_BY_INDEX[qIdx] || 10);

    let streakBonus = 0;
    let newStreak = user.streak || 0;
    let newLastAnswerDate = user.lastAnswerDate || null;
    if (!flagged && earnedPts > 0 && user.lastAnswerDate !== today) {
      streakBonus = 5;
      newStreak = user.lastAnswerDate === yesterdayStr() ? (user.streak || 0) + 1 : 1;
      newLastAnswerDate = today;
    }

    let serieBonus = 0;
    if (!flagged && qIdx === 2 && earnedPts > 0) serieBonus = 10;

    // Le cap journalier s'applique au TOTAL (points + bonus streak/série), pas seulement
    // aux points de base — sinon les bonus permettaient de le dépasser de 15 pts.
    let totalEarned = earnedPts + streakBonus + serieBonus;
    if (dailyEarned + totalEarned > DAILY_CAP) totalEarned = Math.max(0, DAILY_CAP - dailyEarned);
    dailyEarned += totalEarned;

    // ── Écritures (transaction atomique) ──
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
      qualityScore,
      flagged,
      respondentAge: userAge,
      respondentCity: user.city || "",
      respondentInterests: user.interests || [],
      createdAt: FieldValue.serverTimestamp(),
    });

    const userUpdate = {
      points: FieldValue.increment(totalEarned),
      xp: FieldValue.increment(totalEarned),
      ans: FieldValue.increment(1),
      dailyEarned,
      dailyEarnedDate: today,
      lastDailyDate: today,
      lastAnswerDate: newLastAnswerDate,
      streak: newStreak,
      updatedAt: FieldValue.serverTimestamp(),
    };
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
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return {
      pointsAwarded: totalEarned,
      totalPoints: (user.points || 0) + totalEarned,
      totalXp: (user.xp || 0) + totalEarned,
      streak: newStreak,
      flagged,
    };
  });
});

/**
 * notifyNewCampaign — push aux habitants de la ville ciblée quand un commerçant lance
 * une nouvelle campagne (déclenché à la création du doc, toujours status "active" dès
 * la création côté dashboard — cf. launchCampaign dans noova_dashboard.html).
 */
exports.notifyNewCampaign = onDocumentCreated("campaigns/{campaignId}", async (event) => {
  const camp = event.data && event.data.data();
  if (!camp || camp.status !== "active") { logger.info("notifyNewCampaign: ignorée (statut)", { status: camp && camp.status }); return; }
  const city = (camp.targetCity || camp.city || "").toLowerCase();
  if (!city) { logger.info("notifyNewCampaign: campagne sans ville"); return; }

  const usersSnap = await db.collection("users").where("city", "==", city).get();
  // Deux populations : ceux qui ont déjà autorisé le commerce (« a une question pour toi »)
  // et ceux à qui il s'adresse pour la première fois (« veut te poser des questions »).
  // Ceux qui ont refusé ne sont jamais notifiés.
  // Un même appareil ne doit recevoir qu'UNE notification : les tokens sont dédoublonnés sur
  // l'ensemble des comptes (un téléphone partagé peut figurer dans plusieurs fiches), et la
  // variante « déjà autorisé » l'emporte sur « demande ».
  const byToken = new Map();
  usersSnap.forEach((doc) => {
    const u = doc.data();
    if ((u.declinedMerchants || []).includes(camp.merchantId)) return;
    const group = (u.authorizedMerchants || []).includes(camp.merchantId) ? "known" : "request";
    if (!Array.isArray(u.fcmTokens)) return;
    u.fcmTokens.forEach((tok) => {
      const prev = byToken.get(tok);
      if (!prev || (prev.group === "request" && group === "known")) byToken.set(tok, { group, ref: doc.ref });
    });
  });
  const groups = { known: { tokens: [], owners: [] }, request: { tokens: [], owners: [] } };
  byToken.forEach((v, tok) => { groups[v.group].tokens.push(tok); groups[v.group].owners.push(v.ref); });
  logger.info("notifyNewCampaign: ciblage", { city, users: usersSnap.size, known: groups.known.tokens.length, request: groups.request.tokens.length });

  const name = camp.merchantName || "Un commerce";
  const question = (camp.question || "Réponds en 30 secondes et gagne des points.").toString().substring(0, 120);
  const messages = {
    known: { title: `${name} a une question pour toi`, body: question },
    request: { title: `${name} veut te poser des questions`, body: "Ouvre NOOVA pour l'autoriser et répondre en 30 secondes." },
  };
  const deadCodes = ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"];

  for (const key of ["known", "request"]) {
    const { tokens, owners } = groups[key];
    // FCM limite sendEachForMulticast à 500 tokens par appel.
    for (let i = 0; i < tokens.length; i += 500) {
      const chunkTokens = tokens.slice(i, i + 500);
      const chunkOwners = owners.slice(i, i + 500);
      let res;
      try {
        res = await admin.messaging().sendEachForMulticast({
          tokens: chunkTokens,
          notification: messages[key],
          webpush: {
            notification: { icon: "/icon-192.png", tag: `camp-${event.params.campaignId}` },
            fcmOptions: { link: "https://noovaoff.fr/app-v2" },
          },
        });
      } catch (e) {
        logger.error("notifyNewCampaign: échec d'envoi", { message: e.message });
        continue;
      }
      logger.info("notifyNewCampaign: envoi", { group: key, success: res.successCount, failure: res.failureCount, errors: res.responses.filter((r) => !r.success).map((r) => r.error && r.error.code) });
      // Purge les tokens qui ne sont plus valides (désinstallation, permission révoquée...).
      res.responses.forEach((r, idx) => {
        if (!r.success && r.error && deadCodes.includes(r.error.code)) {
          chunkOwners[idx].update({ fcmTokens: FieldValue.arrayRemove(chunkTokens[idx]) }).catch(() => {});
        }
      });
    }
  }
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
function sectorCategory(sec) {
  const s = String(sec || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/boulang|patiss|viennois/.test(s)) return "boulangerie";
  if (/restau|cafe|\bbar\b|traiteur|pizz|kebab|snack/.test(s)) return "restauration";
  if (/sport|fitness|gym/.test(s)) return "sport";
  if (/beaut|coiff|esthet|\bspa\b|barbier/.test(s)) return "beaute";
  if (/cultur|librair|cinema|musee|musique/.test(s)) return "culture";
  if (/service|mairie|ville/.test(s)) return "services";
  return "commerce";
}
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

const ADMIN_EMAILS = ["noovaoffr@gmail.com", "tomussproduction@gmail.com"];

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
    const result = await admin.auth().listUsers(1000, pageToken);
    const toDelete = result.users
      .filter((u) => !ADMIN_EMAILS.includes(u.email))
      .map((u) => u.uid);
    for (let i = 0; i < toDelete.length; i += 1000) {
      const chunk = toDelete.slice(i, i + 1000);
      if (chunk.length) {
        const res = await admin.auth().deleteUsers(chunk);
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
    await admin.auth().deleteUser(uid);
  } catch (e) {
    // Compte Auth déjà absent ou introuvable : les données Firestore sont supprimées
    // quand même, ce n'est pas bloquant.
  }
  return { ok: true };
});
