"use strict";
/**
 * Points NOOVA : tout ce qui crédite ou débite le solde d'un habitant passe par le serveur (règles Firestore : aucune
 * écriture cliente de points). Ce fichier regroupe :
 *  - claimWelcomeBonus : +50 pts, une seule fois, à l'inscription ;
 *  - redeemReward : échange d'une récompense contre des points (palier fixe : voir tiers.js), avec toutes les vérifications
 *    (récompense approuvée, commerçant vérifié, même ville, créneau horaire, quota mensuel, une récompense par commerçant et
 *    par semaine, solde jamais négatif) dans UNE transaction ;
 *  - expirePoints : les points d'un compte sans aucune activité depuis 6 mois retombent à zéro (le statut / xp ne bouge pas).
 * Le crédit d'une réponse et le bonus découverte sont dans submitAnswer (index.js). Toutes les valeurs : engagementConfig.js.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { FieldValue, Timestamp, getFirestore } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const crypto = require("crypto");
const CFG = require("./engagementConfig");
const { parisDay } = require("./lib");

const db = () => getFirestore();
// Horloge : réelle, sauf dans l'émulateur où les tests peuvent poser une date (comme pour les notifications).
const nowMs = () => require("./notifications")._t.nowMs();
const DAY = 86400000;

// ─────────────────────────── Bonus de bienvenue ───────────────────────────
// Idempotent : le drapeau welcomeClaimed est lu et posé dans la même transaction. Un compte créé il y a plus de 3 jours
// (ancien compte non migré) ne le reçoit pas : le bonus récompense l'inscription, pas une connexion tardive.
const claimWelcomeBonus = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi.");
  const ref = db().collection("users").doc(uid);
  const now = await nowMs();
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Profil introuvable.");
    const u = snap.data();
    if (u.welcomeClaimed === true) return { claimed: false, points: 0, totalPoints: u.points || 0 };
    const created = u.createdAt && u.createdAt.toMillis ? u.createdAt.toMillis() : null;
    if (created !== null && now - created > 3 * DAY) {
      tx.update(ref, { welcomeClaimed: true });
      return { claimed: false, points: 0, totalPoints: u.points || 0 };
    }
    const bonus = CFG.POINTS.WELCOME_BONUS;
    tx.update(ref, {
      welcomeClaimed: true,
      points: FieldValue.increment(bonus),
      xp: FieldValue.increment(bonus),
      lastActivityAt: FieldValue.serverTimestamp(),
    });
    return { claimed: true, points: bonus, totalPoints: (u.points || 0) + bonus };
  });
});

// ─────────────────────────── Échange de récompense ───────────────────────────
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // sans 0/O ni 1/I : se lit et se saisit en caisse
function newCode() {
  let c = "";
  for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return c;
}

// Jour de la semaine (0 = dimanche) et minutes depuis minuit, à Paris.
function parisClock(ms) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t).value;
  return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")), minutes: +get("hour") * 60 + +get("minute") };
}
const toMin = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "")); return m ? +m[1] * 60 + +m[2] : null; };

// Créneaux facultatifs [{days:[0..6], from:"HH:MM", to:"HH:MM"}] : liste vide = à tout moment.
function inTimeSlots(slots, ms) {
  if (!Array.isArray(slots) || !slots.length) return true;
  const { day, minutes } = parisClock(ms);
  return slots.some((s) => {
    const from = toMin(s && s.from), to = toMin(s && s.to);
    if (from === null || to === null) return false;
    const days = Array.isArray(s.days) && s.days.length ? s.days : [0, 1, 2, 3, 4, 5, 6];
    return days.includes(day) && minutes >= from && minutes < to;
  });
}
const fmtSlots = (slots) => (slots || []).map((s) => `${s.from}–${s.to}`).join(", ");

const redeemReward = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi pour échanger tes points.");
  const rewardId = request.data && request.data.rewardId;
  if (!rewardId || typeof rewardId !== "string") throw new HttpsError("invalid-argument", "Récompense invalide.");
  const now = await nowMs();
  const month = parisDay(now).slice(0, 7);

  const userRef = db().collection("users").doc(uid);
  const rewardRef = db().collection("rewards").doc(rewardId);
  const redemRef = db().collection("redemptions").doc();

  return db().runTransaction(async (tx) => {
    const [userSnap, rewardSnap] = await Promise.all([tx.get(userRef), tx.get(rewardRef)]);
    if (!userSnap.exists) throw new HttpsError("not-found", "Profil introuvable.");
    if (!rewardSnap.exists) throw new HttpsError("not-found", "Cette récompense n'existe plus.");
    const user = userSnap.data(), r = rewardSnap.data();
    if (r.approved !== true || r.status !== "approved" || r.active !== true) throw new HttpsError("failed-precondition", "Cette récompense n'est pas disponible pour le moment.");
    const tier = CFG.TIERS.find((t) => t.n === r.tier);
    if (!tier) throw new HttpsError("failed-precondition", "Cette récompense n'est pas disponible pour le moment.");
    const cost = tier.pts;                                   // le coût vient TOUJOURS du palier, jamais du document
    const mid = r.merchantId;
    const merchantRef = db().collection("merchants").doc(mid);
    const limitRef = userRef.collection("redeemLimits").doc(mid);
    const monthRef = rewardRef.collection("monthly").doc(month);
    const [mSnap, limitSnap, monthSnap] = await Promise.all([tx.get(merchantRef), tx.get(limitRef), tx.get(monthRef)]);
    const m = mSnap.exists ? mSnap.data() : null;
    if (!m || m.status !== "verified") throw new HttpsError("failed-precondition", "Ce commerce n'est pas disponible pour le moment.");
    const city = String(user.city || "").toLowerCase();
    if (!city || city !== String(r.city || "").toLowerCase()) throw new HttpsError("permission-denied", "Cette récompense n'est pas disponible dans ta ville.");

    if (!inTimeSlots(r.timeSlots, now)) {
      throw new HttpsError("failed-precondition", `Cette récompense s'échange uniquement sur les créneaux : ${fmtSlots(r.timeSlots)}.`);
    }
    // Une récompense par commerçant et par utilisateur sur 7 jours glissants (anti-abus).
    const lastAt = limitSnap.exists ? Number(limitSnap.data().at) || 0 : 0;
    const limitMs = CFG.REWARDS.EXCHANGE_LIMIT_DAYS * DAY;
    if (lastAt && now - lastAt < limitMs) {
      const again = new Date(lastAt + limitMs).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long" });
      throw new HttpsError("resource-exhausted", `Tu as déjà échangé une récompense chez ce commerçant cette semaine. Tu pourras à nouveau à partir du ${again}.`);
    }
    // Quota mensuel de la récompense.
    const quota = Number.isInteger(r.monthlyQuota) ? r.monthlyQuota : 0;
    const used = monthSnap.exists ? monthSnap.data().used || 0 : 0;
    if (used >= quota) throw new HttpsError("resource-exhausted", "Cette récompense n'est plus disponible ce mois-ci. Elle revient le mois prochain.");
    // Solde : jamais négatif.
    const balance = user.points || 0;
    if (balance < cost) throw new HttpsError("failed-precondition", `Il te manque ${cost - balance} pts pour cette récompense.`);

    const code = newCode();
    const minPurchase = r.withPurchase === true && typeof r.minPurchase === "number" ? r.minPurchase : null;
    // Côté habitant, aucun montant en € : seule la mention « avec achat » (le minimum figure sur le bon, côté commerçant).
    const purchaseCondition = minPurchase ? "Valable avec un achat chez le commerçant" : null;
    const expiresAt = Timestamp.fromMillis(now + CFG.REWARDS.VOUCHER_HOURS * 3600000);

    tx.set(redemRef, {
      userId: uid, rewardId, merchantId: mid, merchantName: r.merchantName || m.brandName || "", city: r.city || "",
      tier: tier.n, cost, label: r.label || "Récompense", icon: r.icon || null,
      purchaseCondition, minPurchase, code, status: "pending",
      createdAt: FieldValue.serverTimestamp(), expiresAt, usedAt: null,
    });
    tx.update(userRef, { points: balance - cost, lastActivityAt: FieldValue.serverTimestamp() });
    tx.set(limitRef, { at: now, rewardId });
    tx.set(monthRef, { used: used + 1, month }, { merge: true });
    tx.update(rewardRef, { redeemedCount: FieldValue.increment(1) });
    tx.update(merchantRef, { pointsSpent: FieldValue.increment(cost) });   // points dépensés chez ce commerçant (affichés dans l'admin)
    return {
      redemptionId: redemRef.id, code, cost, tier: tier.n, label: r.label || "Récompense", merchantName: r.merchantName || "",
      purchaseCondition, expiresAt: expiresAt.toMillis(), totalPoints: balance - cost,
    };
  });
});

// ─────────────────────────── Expiration des points ───────────────────────────
// Un compte sans aucune activité (réponse, échange, bonus) depuis EXPIRY_MONTHS voit son solde retomber à zéro. Le statut (xp)
// ne baisse jamais. Chaque expiration est journalisée (pointsExpirations) pour répondre à une réclamation.
async function expireInactive(now) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - CFG.POINTS.EXPIRY_MONTHS);
  const snap = await db().collection("users").where("lastActivityAt", "<", Timestamp.fromDate(cutoff)).get();
  let expired = 0;
  for (const d of snap.docs) {
    try {
      await db().runTransaction(async (tx) => {
        const s = await tx.get(d.ref);
        const u = s.data() || {};
        const last = u.lastActivityAt && u.lastActivityAt.toMillis ? u.lastActivityAt.toMillis() : now;
        if (!(u.points > 0) || last >= cutoff.getTime()) return;
        tx.update(d.ref, { points: 0 });
        tx.set(db().collection("pointsExpirations").doc(`${d.id}_${parisDay(now)}`), { userId: d.id, points: u.points, lastActivityAt: u.lastActivityAt, expiredAt: FieldValue.serverTimestamp() });
        expired++;
      });
    } catch (e) { logger.warn("expirePoints", d.id, e.message); }
  }
  return { checked: snap.size, expired };
}

const expirePoints = onSchedule({ schedule: "every day 04:30", timeZone: "Europe/Paris", retryCount: 0 }, async () => {
  const r = await expireInactive(await nowMs());
  logger.info("expirePoints", r);
});

// ─────────────────────────── Alerte avant expiration ───────────────────────────
// Prévient ~30 jours avant que le solde ne tombe à 0 (expireInactive ci-dessus, silencieux) : jamais de perte de points
// sans préavis. Le balayage quotidien capte chaque compte à ce moment précis (fenêtre d'un jour, mois calendaires comme
// expireInactive) ; la clé de dédoublonnage de deliver() (le jour visé) garantit un seul envoi par cycle d'inactivité.
const EXPIRY_WARNING_DAYS = 30;
async function warnExpiringInactive(now) {
  const N = require("./notifications")._t;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - CFG.POINTS.EXPIRY_MONTHS);
  const upper = cutoff.getTime() + EXPIRY_WARNING_DAYS * DAY;       // lastActivityAt à cette date : expire dans pile 30 jours
  const lower = upper - DAY;
  const snap = await db().collection("users")
    .where("lastActivityAt", ">", Timestamp.fromMillis(lower))
    .where("lastActivityAt", "<=", Timestamp.fromMillis(upper))
    .get();
  let sent = 0;
  for (const d of snap.docs) {
    const u = d.data();
    if (!(u.points > 0)) continue;
    const last = u.lastActivityAt.toMillis();
    const expiresAt = new Date(last); expiresAt.setMonth(expiresAt.getMonth() + CFG.POINTS.EXPIRY_MONTHS);
    const expiresOn = parisDay(expiresAt.getTime());
    try {
      const content = N.copy.pointsExpirant({ points: u.points });
      const r = await N.deliver(d.id, "points_expirant", content, { key: `expiry_${expiresOn}`, now });
      if (r.status === "sent") sent++;
    } catch (e) { logger.warn("warnExpiringInactive", d.id, e.message); }
  }
  return { checked: snap.size, sent };
}

const notifyPointsExpiring = onSchedule({ schedule: "every day 10:00", timeZone: "Europe/Paris", retryCount: 0 }, async () => {
  const r = await warnExpiringInactive(await nowMs());
  logger.info("notifyPointsExpiring", r);
});

// Suppression d'un compte (par l'habitant lui-même, depuis l'app) : le client ne peut pas effacer les données de points gérées
// par le serveur (limites d'échange, journal d'expiration) — elles partent ici avec le profil (droit à l'effacement).
const onUserDeletedPoints = onDocumentDeleted("users/{uid}", async (event) => {
  const uid = event.params.uid;
  await db().recursiveDelete(db().collection("users").doc(uid).collection("redeemLimits"));
  const ex = await db().collection("pointsExpirations").where("userId", "==", uid).get();
  for (const d of ex.docs) await d.ref.delete();
});

module.exports = { claimWelcomeBonus, redeemReward, expirePoints, notifyPointsExpiring, onUserDeletedPoints, _t: { expireInactive, warnExpiringInactive, inTimeSlots, parisClock, newCode } };
