"use strict";
/**
 * Engagement au-delà des 3 réponses payées : reveal des réponses, compatibilité entre amis,
 * mode prédiction, actualités « impact ». Valeurs chiffrées : engagementConfig.js.
 *
 * Règle d'or : un client ne lit JAMAIS les réponses des autres. Tout passe par ces fonctions, qui
 * vérifient que l'habitant a répondu, appliquent le seuil d'affichage et le réglage de
 * confidentialité « Montrer mes réponses à mes amis » (users.shareAnswers, activé par défaut).
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const CFG = require("./engagementConfig");

const db = () => admin.firestore();
const uniq = (a) => [...new Set((a || []).filter(Boolean))];

// Définition d'une question d'une campagne (les anciennes campagnes n'ont pas de tableau `questions`).
const qDefOf = (camp, idx) => (camp.questions && camp.questions[idx]) || { q: camp.question, format: camp.format, options: camp.options };
const clampIdx = (v) => Math.max(0, Math.min(2, Math.floor(Number(v) || 0)));

// ─────────────────────────── Comptage des réponses ───────────────────────────
// campaignStats/{campagne} : { q0: { n, c: { "0": x, "1": y } }, ... } incrémenté par submitAnswer.
// Les réponses antérieures à ce compteur (ou un document incomplet) sont recomptées une fois, puis
// le drapeau `bf` évite de recommencer.
async function loadStats(campaignId, camp) {
  const ref = db().collection("campaignStats").doc(campaignId);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data().bf) return snap.data();
    const answers = await tx.get(db().collection("answers").where("campaignId", "==", campaignId));
    const stats = { bf: true };
    answers.forEach((d) => {
      const a = d.data(), idx = a.questionIdx || 0, def = qDefOf(camp, idx);
      if (def.format !== "mcq") return;
      const oi = (def.options || []).map(String).indexOf(String(a.answer || ""));
      if (oi < 0) return;
      if (!CFG.REVEAL.COUNT_SUSPECT && a.suspect) return;
      if (!CFG.REVEAL.COUNT_FLAGGED && a.flagged) return;
      const k = `q${idx}`;
      stats[k] = stats[k] || { n: 0, c: {} };
      stats[k].n++;
      stats[k].c[oi] = (stats[k].c[oi] || 0) + 1;
    });
    tx.set(ref, stats);
    return stats;
  });
}

// ─────────────────────────── Amis qui ont répondu ───────────────────────────
// Uniquement les amis RÉCIPROQUES qui partagent leurs réponses, et qui ont répondu à cette question.
async function friendsWhoAnswered(uid, user, campaignId, qIdx, options) {
  const ids = uniq(user.friendUids).filter((f) => f !== uid).slice(0, CFG.REVEAL.MAX_FRIENDS);
  if (!ids.length) return [];
  const [fUsers, fAnswers] = await Promise.all([
    db().getAll(...ids.map((f) => db().collection("users").doc(f))),
    db().getAll(...ids.map((f) => db().collection("answers").doc(`${f}_${campaignId}_q${qIdx}`))),
  ]);
  const out = [];
  ids.forEach((fid, i) => {
    const fu = fUsers[i], fa = fAnswers[i];
    if (!fu.exists || !fa.exists) return;
    const f = fu.data();
    if (!(f.friendUids || []).includes(uid)) return;       // amitié non réciproque
    if (f.shareAnswers === false) return;                  // a coupé « Montrer mes réponses à mes amis »
    const ans = String(fa.data().answer || "");
    out.push({ uid: fid, name: f.name || "Ami", photoUrl: f.photoUrl || null, optionIdx: options.indexOf(ans), answer: ans });
  });
  return out;
}

// ─────────────────────────── Reveal ───────────────────────────
async function revealCore(uid, data) {
  const campaignId = data && data.campaignId;
  if (!campaignId || typeof campaignId !== "string") throw new HttpsError("invalid-argument", "Question invalide.");
  const qIdx = clampIdx(data.questionIdx);
  const [aSnap, cSnap, uSnap] = await Promise.all([
    db().collection("answers").doc(`${uid}_${campaignId}_q${qIdx}`).get(),
    db().collection("campaigns").doc(campaignId).get(),
    db().collection("users").doc(uid).get(),
  ]);
  // Les résultats ne sont visibles qu'après avoir répondu.
  if (!aSnap.exists) throw new HttpsError("permission-denied", "Réponds d'abord à cette question pour voir les résultats.");
  if (!cSnap.exists) throw new HttpsError("not-found", "Campagne introuvable.");
  const camp = cSnap.data(), def = qDefOf(camp, qIdx);
  if (!CFG.REVEAL.FORMATS.includes(def.format)) return { available: false, reason: "format" };

  const options = (def.options || []).map(String);
  const myIdx = options.indexOf(String(aSnap.data().answer || ""));
  const stats = await loadStats(campaignId, camp);
  const st = stats[`q${qIdx}`] || { n: 0, c: {} };
  const n = st.n || 0, min = CFG.REVEAL.MIN_ANSWERS;

  const out = { available: true, myIdx, n, min, options: options.map((text, i) => ({ text })) };
  if (n >= min) {
    out.options = options.map((text, i) => { const count = (st.c && st.c[i]) || 0; return { text, count, pct: Math.round((count * 100) / n) }; });
  } else {
    // Sous le seuil : pas de pourcentage (évite les « 100 % sur 1 réponse »).
    out.belowThreshold = true;
    out.needed = min - n;
  }
  out.friends = await friendsWhoAnswered(uid, uSnap.data() || {}, campaignId, qIdx, options);
  return out;
}

const getReveal = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi.");
  return revealCore(uid, request.data || {});
});

module.exports = {
  getReveal,
  _t: { revealCore, loadStats, friendsWhoAnswered, qDefOf, uniq },
};
