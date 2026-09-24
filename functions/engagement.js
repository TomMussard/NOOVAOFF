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
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const CFG = require("./engagementConfig");
const crypto = require("crypto");
const { sectorCategory, parisDay, campaignQuestions } = require("./lib");
const { applyOverrides } = require("./configStore")._t;

const db = () => getFirestore();
const uniq = (a) => [...new Set((a || []).filter(Boolean))];

// Définition d'une question d'une campagne (les anciennes campagnes n'ont pas de tableau `questions`).
const qDefOf = (camp, idx) => campaignQuestions(camp)[idx] || { q: camp.question, format: camp.format, options: camp.options };
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
    if (!CFG.REVEAL.COUNT_FLAGGED && fa.data().flagged) return;   // réponse trop rapide pour avoir été lue : pas affichée comme un vrai avis d'ami
    const ans = String(fa.data().answer || "");
    out.push({ uid: fid, name: f.name || "Ami", photoUrl: f.photoUrl || null, optionIdx: options.indexOf(ans), answer: ans });
  });
  return out;
}

// ─────────────────────────── Reveal ───────────────────────────
async function revealCore(uid, data, opts = {}) {
  await applyOverrides();
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

  // Mode prédiction : la répartition est retenue jusqu'à ce que l'habitant ait deviné (ou passé).
  if (n >= CFG.PREDICTION.MIN_ANSWERS && await maybeOfferPrediction(uid, keyOf(campaignId, qIdx), opts)) {
    return { available: true, myIdx, prediction: { offered: true }, options: options.map((text) => ({ text })) };
  }
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

// ─────────────────────────── Mode prédiction ───────────────────────────
// Après sa réponse, l'habitant peut deviner l'option la plus choisie AVANT de voir les résultats.
// Proposé rarement (hasard stable par utilisateur+question, plafonds par jour et par semaine glissante),
// jamais de points. Tout l'état vit dans users.predStats, que seuls les serveurs écrivent :
//   { streak, best, total, right, offers:[ms], offeredKeys:[clé], pendingKey, pendingAt }
const keyOf = (campaignId, qIdx) => `${campaignId}#${qIdx}`;
// Nombre pseudo-aléatoire stable dans [0,1) : recharger la page ne relance pas le tirage.
const rollOf = (uid, key) => parseInt(crypto.createHash("sha1").update(`${uid}|${key}`).digest("hex").slice(0, 8), 16) / 0x100000000;

async function maybeOfferPrediction(uid, key, opts = {}) {
  const P = CFG.PREDICTION, now = opts.now != null ? opts.now : Date.now();
  const ref = db().collection("users").doc(uid);
  return db().runTransaction(async (tx) => {
    const ps = ((await tx.get(ref)).data() || {}).predStats || {};
    if (ps.pendingKey === key && now - (ps.pendingAt || 0) < P.PENDING_MINUTES * 60000) return true;   // déjà en cours
    if ((ps.offeredKeys || []).includes(key)) return false;                                            // déjà proposée
    if ((opts.roll != null ? opts.roll : rollOf(uid, key)) >= P.PROBABILITY) return false;
    const offers = (ps.offers || []).filter((t) => now - t < 7 * 86400000);
    if (offers.length >= P.MAX_PER_ROLLING_WEEK) return false;
    const day = parisDay(now);
    if (offers.filter((t) => parisDay(t) === day).length >= P.MAX_PER_DAY) return false;
    tx.update(ref, {
      "predStats.offers": [...offers, now].slice(-20),
      "predStats.offeredKeys": [...(ps.offeredKeys || []), key].slice(-P.OFFER_HISTORY),
      "predStats.pendingKey": key,
      "predStats.pendingAt": now,
    });
    return true;
  });
}

// guessIdx = null → « Passer » : la série n'est pas touchée.
async function predictCore(uid, data, opts = {}) {
  await applyOverrides();
  const campaignId = data && data.campaignId;
  if (!campaignId || typeof campaignId !== "string") throw new HttpsError("invalid-argument", "Question invalide.");
  const qIdx = clampIdx(data.questionIdx), key = keyOf(campaignId, qIdx);
  const now = opts.now != null ? opts.now : Date.now();
  const guess = data.guessIdx == null ? null : Number(data.guessIdx);
  const camp = (await db().collection("campaigns").doc(campaignId).get()).data();
  if (!camp) throw new HttpsError("not-found", "Campagne introuvable.");
  const options = (qDefOf(camp, qIdx).options || []).map(String);
  if (guess !== null && !(Number.isInteger(guess) && guess >= 0 && guess < options.length)) throw new HttpsError("invalid-argument", "Choix invalide.");
  const st = (await loadStats(campaignId, camp))[`q${qIdx}`] || { n: 0, c: {} };
  const counts = options.map((_, i) => (st.c && st.c[i]) || 0), max = Math.max(...counts);
  const top = counts.map((c, i) => (c === max ? i : -1)).filter((i) => i >= 0);   // égalité : toute option en tête est bonne

  const ref = db().collection("users").doc(uid);
  const result = await db().runTransaction(async (tx) => {
    const ps = ((await tx.get(ref)).data() || {}).predStats || {};
    if (ps.pendingKey !== key || now - (ps.pendingAt || 0) >= CFG.PREDICTION.PENDING_MINUTES * 60000) {
      throw new HttpsError("failed-precondition", "Aucune prédiction en attente pour cette question.");
    }
    if (guess === null) {
      tx.update(ref, { "predStats.pendingKey": null, "predStats.pendingAt": null });
      return { skipped: true, streak: ps.streak || 0, best: ps.best || 0 };
    }
    const correct = top.includes(guess);
    const streak = correct ? (ps.streak || 0) + 1 : 0, best = Math.max(ps.best || 0, streak);
    tx.update(ref, {
      "predStats.streak": streak, "predStats.best": best,
      "predStats.total": (ps.total || 0) + 1, "predStats.right": (ps.right || 0) + (correct ? 1 : 0),
      "predStats.pendingKey": null, "predStats.pendingAt": null,
    });
    return { correct, streak, best, total: (ps.total || 0) + 1, right: (ps.right || 0) + (correct ? 1 : 0), majority: top };
  });
  return { prediction: result, reveal: await revealCore(uid, { campaignId, questionIdx: qIdx }, opts) };
}

const submitPrediction = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi.");
  return predictCore(uid, request.data || {});
});

// ─────────────────────────── Compatibilité entre amis ───────────────────────────
// Accord = part des questions à choix (répondues par les DEUX) où l'on a donné la même réponse.
// Jamais de réponse individuelle renvoyée : seulement un pourcentage, et seulement si l'ami partage
// ses réponses (users.shareAnswers) et si les deux ont assez de questions en commun.
const pairId = (a, b) => [a, b].sort().join("_");

async function answersOf(uid) {
  const snap = await db().collection("answers").where("userId", "==", uid)
    .select("campaignId", "questionIdx", "answer", "category", "flagged").limit(CFG.COMPAT.MAX_ANSWERS_SCAN).get();
  const m = new Map();
  // Une réponse trop rapide pour avoir été lue ne doit pas compter dans la compatibilité (ni comme un
  // point d'accord, ni comme un point de désaccord) : même logique que pour le reveal (CFG.REVEAL.COUNT_FLAGGED).
  snap.forEach((d) => { const a = d.data(); if (!CFG.REVEAL.COUNT_FLAGGED && a.flagged) return; m.set(`${a.campaignId}#${a.questionIdx || 0}`, a); });
  return m;
}

async function campaignsOf(ids, memo) {
  const need = ids.filter((id) => !memo.has(id));
  if (need.length) {
    const snaps = await db().getAll(...need.map((id) => db().collection("campaigns").doc(id)));
    snaps.forEach((s, i) => memo.set(need[i], s.exists ? s.data() : null));
  }
  return memo;
}

// { common, agree, cats: { boulangerie: { c, a } } } — mis en cache CACHE_MINUTES (id de paire).
async function pairStats(uid, fid, mine, memo, now) {
  const ref = db().collection("compatCache").doc(pairId(uid, fid));
  const cached = await ref.get();
  if (cached.exists && now - cached.data().computedAt < CFG.COMPAT.CACHE_MINUTES * 60000) return cached.data();
  const theirs = await answersOf(fid);
  const keys = [...mine.keys()].filter((k) => theirs.has(k));
  await campaignsOf(uniq(keys.map((k) => k.split("#")[0])), memo);
  const out = { computedAt: now, common: 0, agree: 0, cats: {} };
  keys.forEach((k) => {
    const [cid, qi] = k.split("#");
    const camp = memo.get(cid);
    if (!camp) return;
    const def = qDefOf(camp, Number(qi));
    if (!CFG.COMPAT.FORMATS.includes(def.format)) return;
    const same = String(mine.get(k).answer) === String(theirs.get(k).answer);
    const cat = mine.get(k).category || sectorCategory(camp.sector || camp.merchantTheme);
    out.common++;
    if (same) out.agree++;
    out.cats[cat] = out.cats[cat] || { c: 0, a: 0 };
    out.cats[cat].c++;
    if (same) out.cats[cat].a++;
  });
  await ref.set(out);
  return out;
}

const pctOf = (a, c) => Math.round((a * 100) / c);

async function compatCore(uid, data, now = Date.now()) {
  await applyOverrides();
  const meSnap = await db().collection("users").doc(uid).get();
  const me = meSnap.data() || {};
  if (me.shareAnswers === false) return { sharing: false, friends: [] };  // il faut partager pour comparer
  let ids = uniq(me.friendUids).filter((f) => f !== uid).slice(0, CFG.COMPAT.MAX_FRIENDS);
  const only = data && data.friendUid;
  if (only) {
    if (!ids.includes(only)) throw new HttpsError("permission-denied", "Cette personne n'est pas dans tes amis.");
    ids = [only];
  }
  const fUsers = ids.length ? await db().getAll(...ids.map((f) => db().collection("users").doc(f))) : [];
  const mine = await answersOf(uid);
  const memo = new Map();
  const list = [];
  for (let i = 0; i < ids.length; i++) {
    const fu = fUsers[i];
    if (!fu.exists) continue;
    const f = fu.data();
    if (!(f.friendUids || []).includes(uid)) continue;               // amitié non réciproque
    const row = { uid: ids[i], name: f.name || "Ami", photoUrl: f.photoUrl || null };
    if (f.shareAnswers === false) { list.push({ ...row, state: "private" }); continue; }
    const st = await pairStats(uid, ids[i], mine, memo, now);
    if (st.common < CFG.COMPAT.MIN_COMMON) {
      list.push({ ...row, state: "need", common: st.common, needed: CFG.COMPAT.MIN_COMMON - st.common });
      continue;
    }
    const cats = Object.entries(st.cats)
      .filter(([, v]) => v.c >= CFG.COMPAT.MIN_COMMON_PER_CATEGORY)
      .map(([category, v]) => ({ category, common: v.c, pct: pctOf(v.a, v.c) }))
      .sort((a, b) => b.pct - a.pct || b.common - a.common);
    list.push({ ...row, state: "ok", pct: pctOf(st.agree, st.common), agree: st.agree, common: st.common, categories: cats });
  }
  const rank = { ok: 0, need: 1, private: 2 };
  list.sort((a, b) => rank[a.state] - rank[b.state] || (b.pct || 0) - (a.pct || 0) || (b.common || 0) - (a.common || 0));
  return { sharing: true, min: CFG.COMPAT.MIN_COMMON, friends: list };
}

const getCompat = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi.");
  return compatCore(uid, request.data || {});
});

module.exports = {
  getReveal,
  getCompat,
  submitPrediction,
  _t: { predictCore, maybeOfferPrediction, rollOf, compatCore, revealCore, loadStats, friendsWhoAnswered, qDefOf, uniq },
};
