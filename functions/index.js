const { onCall, HttpsError } = require("firebase-functions/v2/https");
const INTERESTS = require("./interests");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { FieldValue, Timestamp, getFirestore } = require("firebase-admin/firestore");
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
// Points : bonus de bienvenue, échange de récompenses (serveur seul), expiration des points : voir points.js.
Object.assign(exports, (({ _t, ...fns }) => fns)(require("./points")));
// Zone de correspondance (25 km) autour d'une ville NOOVA : voir cityZones.js.
Object.assign(exports, (({ _t, ...fns }) => fns)(require("./cityZones")));
// Comptes de démo (présentation investisseurs / mairie) — à retirer après usage, voir seedDemo.js.
Object.assign(exports, require("./seedDemo"));
// Mois de test : commerces fictifs autonomes (voir testMonth.js).
Object.assign(exports, (({ _t, ...fns }) => fns)(require("./testMonth")));
Object.assign(exports, (({ _t, ...fns }) => fns)(require("./publicProfiles")));
Object.assign(exports, (({ _t, ...fns }) => fns)(require("./autoZones")));
Object.assign(exports, (({ _t, ...fns }) => fns)(require("./adminStats")));
Object.assign(exports, (({ _t, ...fns }) => fns)(require("./adminAlerts")));
Object.assign(exports, (({ _t, ...fns }) => fns)(require("./mailer")));

// Économie NOOVA : seules les N premières réponses de la journée rapportent des POINTS échangeables ;
// au-delà (« mode libre »), chaque réponse rapporte des NOOVS. Toutes les valeurs : engagementConfig.js.
const CFG = require("./engagementConfig");
const { sectorCategory, parisDay, ADMIN_EMAILS, campaignQuestions } = require("./lib");
const NOOVS_PER_ANSWER = CFG.POINTS.NOOVS_PER_ANSWER;
const MAX_POINT_ANSWERS_PER_DAY = CFG.POINTS.MAX_ANSWERS_PER_DAY;
const MIN_ANSWER_MS = CFG.RESPONSE_TIME.MIN_FOR_GAIN_MS;

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
  // Chargé ici et non en tête de fichier : configStore déclare des fonctions, qui doivent l'être APRÈS setGlobalOptions (région).
  await require("./configStore")._t.applyOverrides();   // réglages modifiables depuis l'admin (plafond de NOOVS…)
  const answerRef = db.collection("answers").doc(`${uid}_${campaignId}_q${qIdx}`);
  const userRef = db.collection("users").doc(uid);
  const campaignRef = db.collection("campaigns").doc(campaignId);

  // Montée en charge : la campagne et le commerçant sont lus HORS transaction. Dans une transaction, chaque réponse
  // verrouillait la fiche de la campagne : à l'heure de pointe (des milliers d'habitants sur la même question du jour),
  // les réponses se bloquaient entre elles et échouaient. La transaction ne porte plus que sur ce qui appartient à
  // l'habitant (sa fiche, sa réponse) ; les compteurs partagés sont incrémentés juste après, sans verrou (voir `shared`).
  const [campSnap0] = await Promise.all([campaignRef.get()]);
  const camp0 = campSnap0.exists ? campSnap0.data() : null;
  const merchantRef0 = camp0 && camp0.merchantId ? db.collection("merchants").doc(String(camp0.merchantId)) : null;
  const merchantSnap0 = merchantRef0 ? await merchantRef0.get() : null;
  const shared = [];   // écritures sur des documents partagés, faites après la transaction

  const result = await db.runTransaction(async (tx) => {
    shared.length = 0;   // la transaction peut être rejouée : on repart de zéro à chaque essai
    const campSnap = campSnap0;
    const [userSnap, existingAnswerSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(answerRef),
    ]);

    if (existingAnswerSnap.exists) {
      throw new HttpsError("already-exists", "Tu as déjà répondu à cette question.");
    }
    if (!userSnap.exists) throw new HttpsError("failed-precondition", "Profil introuvable.");
    if (!campSnap.exists) throw new HttpsError("not-found", "Campagne introuvable.");

    const user = userSnap.data();
    const camp = campSnap.data();
    // Commerçant lu AVANT toute écriture (transaction) : compteur « points générés par ses questions ».
    const merchantRef = merchantRef0;
    const merchantSnap = merchantSnap0;

    // ── Re-vérification serveur de l'éligibilité (jamais confiance au client) ──
    if (camp.status !== "active" || (camp.endsAt && camp.endsAt.toMillis && camp.endsAt.toMillis() < Date.now())) {
      throw new HttpsError("failed-precondition", "Cette campagne n'est plus active.");
    }
    const userCity = (user.city || "").toLowerCase();
    const campCity = (camp.targetCity || camp.city || "").toLowerCase();
    // Compte de diffusion NOOVA (activé par l'admin sur la fiche du commerçant) : sa question vaut pour toutes les villes.
    const mm0 = merchantSnap && merchantSnap.exists ? merchantSnap.data() : null;
    const broadcastQ = !!camp.merchantId && campCity === "toutes" && camp.broadcast === true && !!mm0 && mm0.broadcast === true && mm0.status === "verified";
    if (!userCity || (userCity !== campCity && !broadcastQ)) {
      throw new HttpsError("permission-denied", "Cette campagne n'est pas disponible dans ta ville.");
    }
    // Commerce suivi (autorisé) : réponse complète. Commerce PAS ENCORE suivi : question « découverte » — l'habitant choisit
    // librement d'y répondre ; le commerce reçoit alors la réponse SANS le profil (âge, centres d'intérêt), et l'habitant
    // décidera ensuite de le suivre ou non. Un commerce que l'habitant a écarté, non vérifié ou d'une autre ville : refusé.
    const authorized = user.authorizedMerchants || [];
    let discovery = false;
    if (camp.merchantId && !broadcastQ && !authorized.includes(camp.merchantId)) {
      if ((user.declinedMerchants || []).includes(camp.merchantId)) {
        throw new HttpsError("permission-denied", "Tu as choisi de ne plus voir ce commerce.");
      }
      const mm = merchantSnap && merchantSnap.exists ? merchantSnap.data() : null;
      if (!mm || mm.status !== "verified" || String(mm.city || "").toLowerCase() !== userCity) {
        throw new HttpsError("permission-denied", "Ce commerce n'est pas disponible dans ta ville.");
      }
      discovery = true;
    }
    const ageRanges = camp.ageRanges || [];
    const userAge = user.ageRange || user.age || "";
    if (ageRanges.length && userAge && !ageRanges.includes(userAge)) {
      throw new HttpsError("permission-denied", "Cette campagne ne cible pas ta tranche d'âge.");
    }
    // Centres d'intérêt ciblés par le commerçant : même règle que l'app (interests.js).
    if (!INTERESTS.targetsUser(camp.targetInterests, user.interests)) {
      throw new HttpsError("permission-denied", "Cette campagne ne cible pas tes centres d'intérêt.");
    }
    // Réponse valide pour le format de la question (jamais confiance au client : réponse vide ou hors liste refusée).
    {
      const qd = campaignQuestions(camp)[qIdx] || {};
      const val = answerValue == null ? "" : String(answerValue);
      const opts = Array.isArray(qd.options) ? qd.options.map(String) : [];
      let ok = true;
      if (qd.format === "mcq") ok = opts.includes(val);
      else if (qd.format === "scale") ok = /^([1-9]|10)$/.test(val);
      else if (qd.format === "rank") { const parts = val.split(" > "); ok = parts.length === opts.length && [...parts].sort().join("\u0000") === [...opts].sort().join("\u0000"); }
      else if (qd.format === "text") ok = val.trim().length >= 5;
      if (!ok) throw new HttpsError("invalid-argument", "Réponse invalide pour cette question.");
    }
    // Objectif de réponses FACULTATIF (anciennes campagnes seulement) : sans valeur, aucun plafond.
    const targetVolume = Number(camp.targetVolume ?? camp.volumeTarget) || 0;
    const currentVolume = camp.answersCount || camp.responsesCount || 0;
    if (targetVolume > 0 && currentVolume >= targetVolume) {
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
    // Question posée par NOOVA (compte de diffusion) : uniquement des NOOVS, jamais de points, et elle ne compte ni
    // dans les 3 réponses à points du jour ni dans la série.
    const noovaQ = !camp.merchantId || broadcastQ;
    const pointsEligible = !noovaQ && answersToday < MAX_POINT_ANSWERS_PER_DAY;

    let earnedPts = 0, discoveryBonus = 0, noovsEarned = 0, noovsWithheld = null;
    const noovsToday = user.dailyNoovsDate === today ? (user.dailyNoovs || 0) : 0;
    let newStreak = user.streak || 0;
    let newLastAnswerDate = user.lastAnswerDate || null;
    // Dernier jour compté dans la série (comptes antérieurs : dernier jour répondu).
    let newStreakDate = user.streakDate !== undefined ? user.streakDate : (user.lastAnswerDate || null);
    if (!flagged) {
      newLastAnswerDate = today;
      if (pointsEligible) {
        earnedPts = CFG.POINTS.PER_ANSWER;               // 10 pts par réponse, quelle que soit la question
      } else if (CFG.NOOVS.MIN_RESPONSE_MS > 0 && serverElapsed < CFG.NOOVS.MIN_RESPONSE_MS) {
        noovsWithheld = "suspect";            // lue très vite : compte pour les résultats, pas de NOOVS
      } else if (noovsToday >= CFG.NOOVS.DAILY_CAP) {
        noovsWithheld = "cap";                // plafond du jour atteint
      } else {
        noovsEarned = Math.min(NOOVS_PER_ANSWER, CFG.NOOVS.DAILY_CAP - noovsToday);
      }
      // Question posée par NOOVA : des NOOVS à chaque fois (et rien d'autre), hors plafond du jour.
      if (noovaQ) { noovsEarned = CFG.NOOVS.PER_NOOVA_QUESTION; noovsWithheld = null; }
      // Bonus découverte : 1re réponse à ce commerçant, une fois par jour au maximum (même au-delà des 3 réponses du jour).
      if (!noovaQ && camp.merchantId && !(user.answeredMerchants || []).includes(camp.merchantId) && user.discoveryBonusDate !== today) {
        discoveryBonus = CFG.POINTS.DISCOVERY_BONUS;
      }
    }
    const totalEarned = earnedPts + discoveryBonus;
    // Une réponse trop rapide (non lue) ne consomme pas le quota du jour.
    const newAnswersToday = answersToday + (flagged || noovaQ ? 0 : 1);
    // Série : un jour compte à partir de 3 réponses — ou plus tôt si l'habitant a répondu à TOUTES les campagnes
    // actuellement actives de sa ville (une ville qui démarre n'offre pas toujours 3 questions par jour). Cette
    // deuxième vérification ne coûte qu'une requête, et seulement tant que nécessaire (jamais une fois le seuil
    // atteint, ni si la journée est déjà validée) : au plus une fois par jour et par habitant.
    let streakValidatedNow = false;
    if (!flagged && !noovaQ && newStreakDate !== today) {
      if (newAnswersToday >= CFG.STREAK.MIN_ANSWERS_PER_DAY) {
        streakValidatedNow = true;
      } else {
        const answeredSet = new Set(user.answeredCampaigns || []);
        if (qIdx === 0) answeredSet.add(campaignId);
        // (questions de commerces de sa ville seulement : celles de NOOVA ne comptent pas dans la série)
        const cityCampaigns = await db.collection("campaigns")
          .where("status", "==", "active").where("targetCity", "==", userCity)
          .select("ageRanges", "endsAt", "merchantId").limit(200).get();
        const nowMs = Date.now();
        const stillAvailable = cityCampaigns.docs.some((d) => {
          if (d.id === campaignId || answeredSet.has(d.id)) return false;
          const dd = d.data();
          if (!dd.merchantId) return false;
          if (dd.endsAt && dd.endsAt.toMillis && dd.endsAt.toMillis() < nowMs) return false;
          const ar = dd.ageRanges || [];
          return !(ar.length && userAge && !ar.includes(userAge));
        });
        if (!stillAvailable) streakValidatedNow = true;
      }
      if (streakValidatedNow) {
        newStreak = newStreakDate === yesterdayStr() ? (user.streak || 0) + 1 : 1;
        newStreakDate = today;
      }
    }
    // Palier de statut atteint (fil des amis) : comparé avant / après ce gain d'xp.
    const statusOf = (xp) => CFG.STATUS.filter((t) => xp >= t.min).pop();
    const oldStatus = statusOf(user.xp || 0), newStatus = statusOf((user.xp || 0) + totalEarned);

    // Reveal : index de l'option choisie (question à choix) ; le texte reste la référence stockée.
    const qDef = campaignQuestions(camp)[qIdx] || { format: camp.format, options: camp.options };
    const optionIdx = (qDef.format === "mcq" && Array.isArray(qDef.options)) ? qDef.options.indexOf(answerValue != null ? String(answerValue) : "") : -1;
    const counted = optionIdx >= 0 && (CFG.REVEAL.COUNT_SUSPECT || !suspect) && (CFG.REVEAL.COUNT_FLAGGED || !flagged);

    // ── Écritures (transaction atomique) ──
    if (counted) {
      // Compteur serveur-seul par option : le client ne peut jamais lire la répartition avant d'avoir répondu.
      shared.push(() => db.collection("campaignStats").doc(campaignId).set({ [`q${qIdx}`]: { n: FieldValue.increment(1), c: { [String(optionIdx)]: FieldValue.increment(1) } } }, { merge: true }));
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
      noovsWithheld,
      noovsAvailableAt: noovsEarned > 0 ? Timestamp.fromMillis(Date.now() + CFG.NOOVS.PENDING_DAYS * 86400000) : null,
      qualityScore,
      flagged,
      responseMs: serverElapsed,
      suspect,
      category: sectorCategory(camp.sector || camp.merchantTheme),
      optionIdx,
      respondentAge: discovery ? "" : userAge,
      respondentCity: user.city || "",
      respondentInterests: discovery ? [] : (user.interests || []),
      discovery,
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
      streakDate: newStreakDate,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!flagged) {
      // Sert à envoyer la question du jour à l'heure habituelle de réponse (médiane des 5 dernières).
      const hh = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
      const minutes = +hh.find((x) => x.type === "hour").value * 60 + +hh.find((x) => x.type === "minute").value;
      userUpdate.answerMinutes = [...(user.answerMinutes || []), minutes].slice(-5);
    }
    userUpdate.lastActivityAt = FieldValue.serverTimestamp();          // les points expirent après 6 mois sans activité
    if (!flagged && camp.merchantId) userUpdate.answeredMerchants = FieldValue.arrayUnion(camp.merchantId);
    if (discoveryBonus > 0) userUpdate.discoveryBonusDate = today;
    if (totalEarned > 0) { userUpdate.points = FieldValue.increment(totalEarned); userUpdate.xp = FieldValue.increment(totalEarned); }
    if (noovsEarned > 0) { userUpdate.noovs = FieldValue.increment(noovsEarned); if (!noovaQ) { userUpdate.dailyNoovs = noovsToday + noovsEarned; userUpdate.dailyNoovsDate = today; } }
    if (qIdx === 0) userUpdate.answeredCampaigns = FieldValue.arrayUnion(campaignId);
    tx.update(userRef, userUpdate);

    shared.push(() => campaignRef.update({
      answersCount: FieldValue.increment(1),
      responsesCount: FieldValue.increment(1),
    }));
    // Points générés par les questions de ce commerçant (affichés dans l'admin).
    if (merchantSnap && merchantSnap.exists && totalEarned > 0) shared.push(() => merchantRef.update({ pointsGenerated: FieldValue.increment(totalEarned) }));

    // Jalon de série (3, 7, 14… jours d'affilée) : annoncé aux amis dans le fil, une seule fois, à la 1re réponse du jour.
    if (user.city && streakValidatedNow && CFG.COMMUNITY.STREAK_MILESTONES.includes(newStreak)) {
      tx.set(db.collection("communityEvents").doc(), {
        type: "streak", userId: uid, displayName: user.name || "—", city: user.city, brand: "", streak: newStreak,
        text: `est à ${newStreak} jours d'affilée`, likeCount: 0, commentCount: 0, createdAt: FieldValue.serverTimestamp(),
      });
    }
    // Palier de statut franchi : annoncé aux amis dans le fil (jamais la réponse elle-même : le fil ne montre plus ce que les gens répondent).
    if (user.city && newStatus.n !== oldStatus.n) {
      tx.set(db.collection("communityEvents").doc(), {
        type: "levelup", userId: uid, displayName: user.name || "—", city: user.city, brand: "", level: newStatus.n,
        text: `a atteint le palier ${newStatus.n}`, likeCount: 0, commentCount: 0, createdAt: FieldValue.serverTimestamp(),
      });
    }

    return {
      pointsAwarded: totalEarned,
      discoveryBonus,
      noovsAwarded: noovsEarned,
      noovsWithheld,
      totalPoints: (user.points || 0) + totalEarned,
      totalXp: (user.xp || 0) + totalEarned,
      totalNoovs: (user.noovs || 0) + noovsEarned,
      pointsToday: (user.dailyPointsDate === today ? (user.dailyPoints || 0) : 0) + totalEarned,
      pointAnswersLimit: MAX_POINT_ANSWERS_PER_DAY,
      answersToday: newAnswersToday,
      pointAnswersLeft: Math.max(0, MAX_POINT_ANSWERS_PER_DAY - newAnswersToday),
      streak: newStreak,
      streakToday: newStreakDate === today,
      flagged,
    };
  });
  // Compteurs partagés : incréments sans lecture (aucun verrou). Un échec ici n'annule jamais la réponse de
  // l'habitant, déjà enregistrée ; il est seulement journalisé, avec un nouvel essai.
  await Promise.all(shared.map(async (w) => {
    for (let i = 0; i < 3; i++) {
      try { await w(); return; } catch (e) { if (i === 2) logger.error("submitAnswer: compteur partagé", { campaignId, message: e.message }); else await new Promise((r) => setTimeout(r, 150 * (i + 1))); }
    }
  }));
  return result;
});

/**
 * onWeeklyVote — totaux de la question de la semaine tenus sur la question elle-même (voteCounts, voteTotal).
 * L'app affichait les résultats en lisant TOUS les votes un par un : à 50 000 votants, 50 000 lectures par
 * habitant. Désormais elle lit un seul document. Incréments sans lecture : aucun verrou, aucune contention.
 */
exports.onWeeklyVote = onDocumentCreated("weeklyQuestions/{qId}/votes/{uid}", async (event) => {
  const v = event.data && event.data.data();
  if (!v || !Number.isInteger(v.optionIndex) || v.optionIndex < 0) return;
  await db.collection("weeklyQuestions").doc(event.params.qId).set({
    voteCounts: { [String(v.optionIndex)]: FieldValue.increment(1) },
    voteTotal: FieldValue.increment(1),
  }, { merge: true });
  await awardWeeklyNoovs(event.params.uid, event.params.qId);
});

// Question de la semaine (posée par NOOVA) : des NOOVS au votant, une seule fois par question, même si le
// déclencheur est livré deux fois (marqueur sur le compte, vérifié dans une transaction).
async function awardWeeklyNoovs(uid, qId) {
  const ref = db.collection("users").doc(uid);
  await db.runTransaction(async (tx) => {
    const u = await tx.get(ref);
    if (!u.exists || (u.data().weeklyNoovs || []).includes(qId)) return;
    tx.update(ref, { noovs: FieldValue.increment(CFG.NOOVS.PER_NOOVA_QUESTION), weeklyNoovs: FieldValue.arrayUnion(qId) });
  });
}

/**
 * countConsent — tient à jour merchants/{id}.consentCount (audience affichée dans le
 * dashboard) à chaque événement de consentement. Faite côté serveur : les règles
 * interdisent à un habitant d'écrire sur le document d'un commerçant.
 */
exports.countConsent = onDocumentCreated("consentEvents/{eventId}", async (event) => {
  const e = event.data && event.data.data();
  if (!e || !e.merchantId || !e.userId || !["granted", "revoked"].includes(e.action)) return;
  const ref = db.collection("merchants").doc(String(e.merchantId));
  // État par habitant et par commerce : un même habitant ne compte qu'une fois, même s'il envoie 100 « granted »
  // (le journal reste complet ; seul le compteur affiché est protégé contre le gonflage).
  const stateRef = db.collection("consentState").doc(`${e.merchantId}_${e.userId}`.slice(0, 400));
  await db.runTransaction(async (tx) => {
    const [m, st] = await Promise.all([tx.get(ref), tx.get(stateRef)]);
    if (!m.exists) return;
    const was = st.exists && st.data().granted === true, now = e.action === "granted";
    if (was === now) return;
    tx.set(stateRef, { granted: now, at: FieldValue.serverTimestamp() });
    tx.update(ref, { consentCount: FieldValue.increment(now ? 1 : -1) });
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
  // Compte NOOVA (diffusion) : tous les habitants, toutes villes confondues.
  const base = m.broadcast === true ? db.collection("users").where("role", "==", "user") : db.collection("users").where("city", "==", city);
  const total = (await base.count().get()).data().count;
  let matching = null;
  try { matching = (await base.where("interests", "array-contains", category).count().get()).data().count; } catch (e) { logger.warn("estimateReach: matching", { message: e.message }); }
  return { city: m.broadcast === true ? "Toutes les villes" : (m.cityLabel || m.city || ""), total, matching, category };
});


/**
 * estimateCampaign — estimation des réponses d'une campagne à partir des données réelles de la ville du commerçant :
 *  - habitants inscrits (et part qui correspond aux tranches d'âge et aux centres d'intérêt choisis : les filtres appliqués à l'envoi),
 *  - réponses valides des 14 derniers jours dans la ville (rythme réel de l'activité) et nombre de campagnes actives
 *    qui se partagent cette attention.
 * Seuls des nombres agrégés sont renvoyés. Le client en déduit l'estimation pour la durée choisie.
 */
const AGE_BUCKETS = ["16-17", "18-24", "25-34", "35-49", "50-64", "65+"];
exports.estimateCampaign = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi.");
  const mSnap = await db.collection("merchants").doc(uid).get();
  if (!mSnap.exists) throw new HttpsError("permission-denied", "Réservé aux commerçants.");
  const m = mSnap.data();
  const city = String(m.city || "").toLowerCase();
  const d = request.data || {};
  const ageRanges = (Array.isArray(d.ageRanges) ? d.ageRanges : []).filter((a) => AGE_BUCKETS.includes(a));
  const interests = INTERESTS.valid(d.interests);
  const questions = Math.max(1, Math.min(3, parseInt(d.questions, 10) || 1));
  const all = m.broadcast === true;   // compte NOOVA : estimation sur tous les habitants, toutes villes confondues
  if (!city && !all) return { city: "", cityLabel: "", totalUsers: 0, pool: 0, questions, enoughData: false, perDay: 0, cityAnswersPerDay: 0, activeCampaigns: 0 };

  const SAMPLE = 3000, WINDOW_DAYS = 14;
  const usersRef = all ? db.collection("users").where("role", "==", "user") : db.collection("users").where("city", "==", city);
  const answersRef = all ? db.collection("answers") : db.collection("answers").where("respondentCity", "==", city);
  const [totalUsers, sample, answers14, activeCampaigns] = await Promise.all([
    usersRef.count().get().then((r) => r.data().count),
    usersRef.select("ageRange", "age", "interests").limit(SAMPLE).get(),
    answersRef.where("flagged", "==", false)
      .where("createdAt", ">=", Timestamp.fromMillis(Date.now() - WINDOW_DAYS * 86400000)).count().get().then((r) => r.data().count).catch((e) => { logger.warn("estimateCampaign: answers", { message: e.message }); return null; }),
    db.collection("campaigns").where("targetCity", "==", all ? "toutes" : city).where("status", "==", "active").count().get().then((r) => r.data().count).catch(() => 0),
  ]);
  // Même règle que submitAnswer : un habitant sans tranche d'âge renseignée n'est jamais exclu.
  let matching = 0;
  const ages = { unknown: 0 }; AGE_BUCKETS.forEach((b) => { ages[b] = 0; });
  sample.forEach((doc) => { const u = doc.data(), a = u.ageRange || u.age || ""; ages[AGE_BUCKETS.includes(a) ? a : "unknown"]++; if ((!ageRanges.length || !a || ageRanges.includes(a)) && INTERESTS.targetsUser(interests, u.interests)) matching++; });
  const share = sample.size ? matching / sample.size : 1;
  const pool = Math.round(totalUsers * share);
  const cityAnswersPerDay = answers14 == null ? 0 : answers14 / WINDOW_DAYS;
  // La nouvelle campagne se partage l'activité de la ville avec les campagnes déjà actives.
  const perDay = cityAnswersPerDay * share / (activeCampaigns + 1);
  const enoughData = answers14 != null && answers14 >= 10 && totalUsers >= 5;
  // Répartition par âge des habitants de la ville (part de l'échantillon, 0 à 1) : affichée telle quelle dans l'assistant.
  const ageShare = {}; Object.keys(ages).forEach((k) => { ageShare[k] = sample.size ? ages[k] / sample.size : 0; });
  return { city: all ? "toutes" : city, cityLabel: all ? "Toutes les villes" : (m.cityLabel || m.city || ""), totalUsers, pool, share, questions, answers14, cityAnswersPerDay, activeCampaigns, perDay, enoughData, ageShare };
});

/**
 * adminResetAllData — remise à zéro complète avant lancement (réservé admin).
 * Le client (SDK web) ne peut jamais supprimer un compte Firebase Auth autre que le
 * sien : seul le SDK Admin le peut, d'où cette Cloud Function. Supprime toutes les
 * données Firestore de test (récursivement, sous-collections comprises) ET tous les
 * comptes Auth sauf les comptes admin eux-mêmes (pour ne pas se déconnecter soi-même).
 */
exports.adminResetAllData = onCall({ timeoutSeconds: 300 }, async (request) => {
  if (!require("./lib").isAdminRequest(request)) {
    throw new HttpsError("permission-denied", "Réservé aux administrateurs Noova.");
  }

  const collectionsToWipe = [
    "merchants", "users", "campaigns", "rewards", "answers", "redemptions",
    "communityEvents", "weeklyQuestions", "chats", "friendCodes", "pointsExpirations",
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
 * adminNoovaQuestions — les anciennes « questions NOOVA » (posées depuis l'admin, sans commerce : on n'en voyait ni les
 * réponses ni les résultats, et on ne pouvait pas les supprimer). count : combien il en reste ; purge : les supprime
 * toutes, avec leurs réponses. Les points et NOOVS déjà gagnés par les habitants restent acquis.
 */
exports.adminNoovaQuestions = onCall({ timeoutSeconds: 300 }, async (request) => {
  if (!require("./lib").isAdminRequest(request)) {
    throw new HttpsError("permission-denied", "Réservé aux administrateurs Noova.");
  }
  const camps = await db.collection("campaigns").where("merchantId", "==", null).get();
  if (!(request.data && request.data.purge)) return { campaigns: camps.size };
  let answers = 0;
  for (const c of camps.docs) {
    const a = await db.collection("answers").where("campaignId", "==", c.id).get();
    for (let i = 0; i < a.docs.length; i += 400) {
      const batch = db.batch();
      a.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    answers += a.size;
    await db.recursiveDelete(c.ref);
  }
  return { campaigns: camps.size, answers };
});

/**
 * adminDeleteAccount — supprime un seul compte (commerçant ou habitant), Firestore
 * (données liées comprises) ET le compte Auth associé. Réservé admin.
 */
exports.adminDeleteAccount = onCall(async (request) => {
  if (!require("./lib").isAdminRequest(request)) {
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
