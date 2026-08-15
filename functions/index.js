const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ region: "europe-west1", maxInstances: 10 });

const DAILY_CAP = 300;
const MIN_ANSWER_MS = 900;
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
    const authorized = user.authorizedMerchants || [];
    if (camp.merchantId && authorized.length && !authorized.includes(camp.merchantId)) {
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
    const flagged = typeof elapsedMs === "number" && elapsedMs >= 0 && elapsedMs < MIN_ANSWER_MS;
    const qualityScore = flagged ? 0 : 1;

    // ── Barème (§2 NOOVA_POINTS_SYSTEM.md) ──
    const today = todayStr();
    let dailyEarned = user.dailyEarnedDate === today ? (user.dailyEarned || 0) : 0;

    let earnedPts = flagged ? 0 : (POINTS_BY_INDEX[qIdx] || 10);
    if (dailyEarned + earnedPts > DAILY_CAP) earnedPts = Math.max(0, DAILY_CAP - dailyEarned);

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

    const totalEarned = earnedPts + streakBonus + serieBonus;
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
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const userUpdate = {
      points: admin.firestore.FieldValue.increment(totalEarned),
      xp: admin.firestore.FieldValue.increment(totalEarned),
      ans: admin.firestore.FieldValue.increment(1),
      dailyEarned,
      dailyEarnedDate: today,
      lastDailyDate: today,
      lastAnswerDate: newLastAnswerDate,
      streak: newStreak,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (qIdx === 0) userUpdate.answeredCampaigns = admin.firestore.FieldValue.arrayUnion(campaignId);
    tx.update(userRef, userUpdate);

    tx.update(campaignRef, {
      answersCount: admin.firestore.FieldValue.increment(1),
      responsesCount: admin.firestore.FieldValue.increment(1),
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
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
