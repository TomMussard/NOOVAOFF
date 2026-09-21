"use strict";
/**
 * Quota de questions par commerçant et par mois. Modèle NOOVA : pas d'abonnement ni de facture, la ville
 * achète NOOVA et propose aux commerçants une quantité fixe de questions chaque mois.
 *  - Le quota vient de merchants.monthlyQuestionQuota (fixé par l'admin), sinon du défaut réglable
 *    (QUOTA.DEFAULT_MONTHLY_QUESTIONS, carte « Réglages de l'engagement » de l'admin).
 *  - Une campagne consomme autant de questions qu'elle en contient, dès sa CRÉATION (brouillon compris),
 *    et supprimer la campagne ne rend rien (et n'ajoute rien) : un registre (quotaLedger) garde la trace,
 *    même si la campagne est supprimée avant que le comptage ait tourné (le déclencheur reçoit une copie de ses données).
 *  - Au-delà du quota, la campagne est bloquée (status « blocked ») et n'est jamais diffusée ni notifiée.
 *    Les règles Firestore interdisent au commerçant de la débloquer ou d'ajouter des questions après coup.
 * Le mois est le mois calendaire à Paris.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const CFG = require("./engagementConfig");
const { parisDay, ADMIN_EMAILS } = require("./lib");
const { applyOverrides } = require("./configStore")._t;

const db = () => getFirestore();
// Horloge : réelle, sauf dans l'émulateur où les tests peuvent poser une date (comme pour les notifications).
const nowMs = () => require("./notifications")._t.nowMs();
const monthOf = (ms) => parisDay(ms).slice(0, 7);
const nextMonthStart = (ms) => { const [y, m] = monthOf(ms).split("-").map(Number); return new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).toISOString().slice(0, 10); };
const questionsOf = (camp) => Math.max(1, Math.min(3, (camp.questions && camp.questions.length) || 1));

async function quotaOf(mid) {
  await applyOverrides();
  const m = (await db().collection("merchants").doc(mid).get()).data() || {};
  const own = Number(m.monthlyQuestionQuota);
  return Number.isInteger(own) && own >= 0 ? own : CFG.QUOTA.DEFAULT_MONTHLY_QUESTIONS;
}

async function stateOf(mid, now) {
  if (now == null) now = await nowMs();
  const month = monthOf(now);
  const [quota, u] = await Promise.all([quotaOf(mid), db().collection("merchants").doc(mid).collection("quota").doc(month).get()]);
  const used = (u.data() || {}).used || 0;
  return { quota, used, remaining: Math.max(0, quota - used), month, resetsOn: nextMonthStart(now) };
}

// Enregistre la consommation d'une nouvelle campagne. Renvoie true si elle est autorisée, false si elle est bloquée.
async function accountCampaign(campaignId, camp, now) {
  if (!camp || !camp.merchantId) return true;
  if (now == null) now = await nowMs();
  await applyOverrides();
  const mid = camp.merchantId, n = questionsOf(camp), month = monthOf(now);
  const quota = await quotaOf(mid);
  const merchantRef = db().collection("merchants").doc(mid);
  const ledgerRef = merchantRef.collection("quotaLedger").doc(campaignId);
  const usedRef = merchantRef.collection("quota").doc(month);
  const campRef = db().collection("campaigns").doc(campaignId);
  return db().runTransaction(async (tx) => {
    const [l, u, c] = await Promise.all([tx.get(ledgerRef), tx.get(usedRef), tx.get(campRef)]);
    if (l.exists) return l.data().allowed === true;                              // déjà comptée (déclencheur livré deux fois)
    const used = (u.data() || {}).used || 0;
    if (used + n > quota) {
      tx.set(ledgerRef, { n, month, allowed: false, createdAt: FieldValue.serverTimestamp() });
      if (c.exists) tx.update(campRef, { status: "blocked", blockedReason: "quota" });   // supprimée entre-temps : rien à bloquer
      return false;
    }
    tx.set(usedRef, { used: used + n, month }, { merge: true });
    tx.set(ledgerRef, { n, month, allowed: true, createdAt: FieldValue.serverTimestamp() });
    return true;
  });
}

const getMyQuota = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi.");
  return stateOf(uid);
});

const setMerchantQuota = onCall(async (request) => {
  const email = request.auth && request.auth.token && request.auth.token.email;
  if (!email || !ADMIN_EMAILS.includes(email)) throw new HttpsError("permission-denied", "Réservé aux administrateurs Noova.");
  const { merchantId, quota } = request.data || {};
  if (!merchantId || typeof merchantId !== "string") throw new HttpsError("invalid-argument", "Commerçant invalide.");
  const ref = db().collection("merchants").doc(merchantId);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "Commerçant introuvable.");
  if (quota === null) await ref.update({ monthlyQuestionQuota: FieldValue.delete() });
  else {
    if (!Number.isInteger(quota) || quota < 0 || quota > 1000) throw new HttpsError("invalid-argument", "Quota invalide (entier de 0 à 1000).");
    await ref.update({ monthlyQuestionQuota: quota });
  }
  return stateOf(merchantId);
});

module.exports = { getMyQuota, setMerchantQuota, _t: { accountCampaign, stateOf, quotaOf, monthOf, nextMonthStart } };
