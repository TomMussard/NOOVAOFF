"use strict";
/**
 * Système de notifications NOOVA (web push PWA côté habitant ; email + in-app côté commerçant).
 *
 * Principes : tout est déclenché par un événement (jamais d'envoi manuel, un commerçant ne peut
 * rien envoyer). Toutes les règles de limitation passent par UN seul point d'entrée, deliver(), qui
 * décide dans une transaction : plafond quotidien, heures de silence, réponse déjà donnée
 * aujourd'hui, réglages par type, décroissance automatique. Un identifiant de journal
 * déterministe (uid + type + clé d'événement) rend tout doublon structurellement impossible,
 * même si un trigger Firestore est livré deux fois.
 */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { FieldValue, Timestamp, getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const logger = require("firebase-functions/logger");
const CFG = require("./engagementConfig");

const db = () => getFirestore();

// ─────────────────────────── Configuration ───────────────────────────
const DAY = 86400000;
const QUIET_FROM = 21 * 60;      // 21h
const QUIET_TO = 9 * 60;         // 9h
const DEFAULT_HABIT_MIN = 12 * 60 + 30;
const WEEKLY_AFTER_MISSES = 3;
const OFF_AFTER_MISSES = 6;
const MISS_AFTER_MS = 24 * 3600000;
const RESULT_THRESHOLD = 50;
const IMMINENT_UNIT_PTS = CFG.POINTS.PER_ANSWER;    // points d'une réponse (barème unique)

// Un type = une famille de règles. « nudge » : relance soumise à la règle « aucune notification
// le jour où l'habitant a déjà répondu ». Les types issus de sa propre action (récompense, résultat,
// code) n'y sont pas soumis. « exceptional » : peut utiliser la 2e notification autorisée du jour.
const TYPES = {
  question_du_jour:     { group: "question",    nudge: true,  gapDays: 1 },
  nouveau_commerce:     { group: "commerces",   nudge: true,  gapDays: 7, deferQuiet: true, ttlH: 24 },
  resultat_dispo:       { group: "resultats",   nudge: false, deferQuiet: true, deferBusy: true, ttlH: 72 },
  recompense_debloquee: { group: "recompenses", nudge: false, exceptional: true, deferQuiet: true, deferBusy: true, ttlH: 48 },
  serie_en_danger:      { group: "serie",       nudge: true,  exceptional: true, gapDays: 1 },
  code_expire:          { group: "recompenses", nudge: false, exceptional: true },
  points_expirant:      { group: "recompenses", nudge: false, exceptional: true, deferQuiet: true, ttlH: 72 },
  ami:                  { group: "amis",        nudge: true,  gapDays: 1, deferQuiet: true, ttlH: 12 },
  // « Ton avis a compté » : issu de l'action de l'habitant (il a répondu), donc pas une relance.
  impact:               { group: "actualites",  nudge: false, deferQuiet: true, ttlH: 48 },
};
const GROUPS = {
  question: ["question_du_jour"],
  commerces: ["nouveau_commerce"],
  resultats: ["resultat_dispo"],
  serie: ["serie_en_danger"],
  recompenses: ["recompense_debloquee", "code_expire", "points_expirant"],
  amis: ["ami"],
  actualites: ["impact"],
};
const CAT_KEYS = ["restauration", "boulangerie", "sport", "beaute", "culture", "commerce", "services"];

// ─────────────────────────── Temps (Paris) ───────────────────────────
function parisParts(ms) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = {};
  f.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
  const hour = +p.hour, minute = +p.minute;
  return { day: `${p.year}-${p.month}-${p.day}`, hour, minute, min: hour * 60 + minute };
}
const isQuiet = (p) => p.min >= QUIET_FROM || p.min < QUIET_TO;
function next9h(ms) {
  const base = Math.ceil(ms / 900000) * 900000;
  for (let i = 1; i <= 200; i++) { const t = base + i * 900000; if (parisParts(t).min === QUIET_TO) return t; }
  return ms + 12 * 3600000;
}
const yesterdayDay = (ms) => parisParts(ms - DAY).day;

// ─────────────────────────── Rédaction ───────────────────────────
// Règles : titre < 60 caractères, le commerce est nommé, le gain est écrit, jamais d'emoji dans le
// titre, jamais la question elle-même (pas de spoil), ni culpabilisation ni fausse urgence.
const EMOJI_RE = /[\p{Extended_Pictographic}️‍]/gu;
const clean = (s) => String(s || "").replace(EMOJI_RE, "").replace(/\s+/g, " ").trim();
const short = (s, n) => { s = clean(s); return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…"; };
const FORBIDDEN = /tu nous manques|ne perds pas|derni[eè]re chance/i;

function finish(o) {
  const title = short(o.title, 59), body = clean(o.body);
  if (FORBIDDEN.test(title + " " + body)) throw new Error("copy interdite: " + title);
  return { title, body, screen: o.screen || "home" };
}
const copy = {
  questionDuJour: ({ merchant }) => finish({ title: `${short(merchant, 30)} veut ton avis`, body: "30 secondes, +10 points", screen: "home" }),
  imminent: ({ left, reward, rewardMerchant }) => finish({
    title: left === 1 ? "Plus qu'une réponse" : `Plus que ${left} réponses`,
    body: `et ton ${short(reward, 30)} chez ${short(rewardMerchant, 30)} est à toi`, screen: "home",
  }),
  nouveauCommerce: ({ merchant, known }) => known
    ? finish({ title: `${short(merchant, 30)} veut ton avis`, body: "30 secondes, +10 points", screen: "home" })
    : finish({ title: `${short(merchant, 26)} veut te poser une question`, body: "Autorise-le, puis 30 secondes pour +10 points", screen: "home" }),
  resultat: ({ merchant, pct }) => pct != null
    ? finish({ title: `${pct} % de tes voisins pensent comme toi`, body: `Découvre le résultat de ${short(merchant, 30)}`, screen: "home" })
    : finish({ title: `Les résultats de ${short(merchant, 30)} sont là`, body: "Découvre ce qu'ont répondu tes voisins", screen: "home" }),
  recompense: ({ reward, merchant, cost }) => finish({ title: `Ton ${short(reward, 26)} chez ${short(merchant, 20)} est à toi`, body: `Échange-le contre tes ${cost} points`, screen: "rewards-tab" }),
  serie: ({ n, merchant }) => finish({ title: `Ta série est à ${n} jours`, body: `${short(merchant, 30)} a une question : réponds à 3 questions aujourd'hui pour la garder`, screen: "home" }),
  code: ({ reward, merchant, when, until }) => finish({ title: `Ton ${short(reward, 26)} expire ${when}`, body: `Chez ${short(merchant, 30)}, à utiliser avant ${until}`, screen: "rewards-tab" }),
  pointsExpirant: ({ points }) => finish({ title: `Tes ${points} pts expirent dans 30 jours`, body: "Réponds à une question pour les garder", screen: "rewards-tab" }),
  impact: ({ merchant, text }) => finish({ title: `Ton avis a compté chez ${short(merchant, 30)}`, body: short(text, 110), screen: "social" }),
  amiRequest: ({ name }) => finish({ title: `${short(name, 30)} veut être ton ami`, body: "Accepte sa demande dans NOOVA", screen: "social" }),
  amiAccepted: ({ name }) => finish({ title: `${short(name, 30)} est maintenant ton ami`, body: "Découvre votre classement", screen: "social" }),
  amiSame: ({ name, merchant }) => finish({ title: `${short(name, 30)} a répondu comme toi`, body: `Sur une question de ${short(merchant, 30)}`, screen: "social" }),
};

// ─────────────────────────── Envoi ───────────────────────────
// Horloge : Date.now(), sauf dans l'émulateur Firebase où les tests peuvent poser une heure
// (document _testClock/now) pour vérifier les heures de silence et les créneaux sans attendre.
async function nowMs() {
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    const d = await db().doc("_testClock/now").get();
    if (d.exists) return d.data().ms;
  }
  return Date.now();
}
const uniq = (a) => [...new Set((a || []).filter(Boolean))];

async function sendPush(uid, tokens, payload) {
  // Émulateur : pas de FCM, on consigne l'envoi (permet de tester les vrais déclencheurs).
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    await db().collection("_pushSink").add({ uid, tokens, ...payload, at: Date.now() });
    return { successCount: tokens.length, failureCount: 0 };
  }
  // Message « data » SEUL : une seule voie d'affichage (le service worker), `tag` unique par
  // notification. Un bloc `notification` serait en plus affiché par le navigateur (doublon).
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    data: { title: payload.title, body: payload.body, url: payload.url, tag: payload.tag, nid: payload.nid, ntype: payload.ntype },
    webpush: { headers: { Urgency: "high", TTL: "86400" } },
  });
  const dead = ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"];
  const toRemove = [];
  res.responses.forEach((r, i) => { if (!r.success && r.error && dead.includes(r.error.code)) toRemove.push(tokens[i]); });
  if (toRemove.length) await db().collection("users").doc(uid).update({ fcmTokens: FieldValue.arrayRemove(...toRemove) }).catch(() => {});
  return res;
}

const answeredToday = (u, day) => u.dailyAnswerDate === day && (u.dailyAnswerCount || 0) > 0;

/**
 * Point d'entrée UNIQUE. Retourne { status: sent | dup | skip | blocked | queued, reason }.
 * content = { title, body, screen }.
 */
async function deliver(uid, type, content, opts = {}) {
  const cfg = TYPES[type];
  if (!cfg) throw new Error("type inconnu: " + type);
  const now = opts.now || await nowMs();
  const p = parisParts(now);
  const key = String(opts.key || p.day).replace(/[\/\s]/g, "_");
  const logId = `${uid}_${type}_${key}`.slice(0, 400);
  const userRef = db().collection("users").doc(uid);
  const logRef = db().collection("notifLog").doc(logId);
  const metricsRef = db().collection("notifMetrics").doc(type);
  let out = { status: "skip", reason: "unknown" };

  await db().runTransaction(async (tx) => {
    const [uSnap, lSnap] = await Promise.all([tx.get(userRef), tx.get(logRef)]);
    if (lSnap.exists) { out = { status: "dup" }; return; }
    if (!uSnap.exists) { out = { status: "skip", reason: "no_user" }; return; }
    const u = uSnap.data();
    const tokens = uniq(u.fcmTokens);
    if (!tokens.length) { out = { status: "skip", reason: "no_push" }; return; }
    if ((u.notifPrefs || {})[cfg.group] === false) { out = { status: "skip", reason: "pref_off" }; return; }
    const stat = (u.notifStats || {})[type] || {};
    if (stat.autoOff) { out = { status: "skip", reason: "auto_off" }; return; }
    if (isQuiet(p)) { out = { status: "blocked", reason: "quiet" }; return; }
    if (cfg.nudge && answeredToday(u, p.day)) { out = { status: "skip", reason: "answered_today" }; return; }
    const weekly = !!stat.weekly || cfg.gapDays >= 7;
    if (weekly) { if (now - (stat.lastSentAt || 0) < 7 * DAY - 3600000) { out = { status: "skip", reason: "weekly" }; return; } }
    else if (cfg.gapDays === 1 && stat.lastSentDay === p.day) { out = { status: "skip", reason: "once_a_day" }; return; }
    const daily = u.notifDaily && u.notifDaily.date === p.day ? u.notifDaily.count || 0 : 0;
    if (daily >= (cfg.exceptional ? 2 : 1)) { out = { status: "blocked", reason: "cap" }; return; }

    tx.update(userRef, {
      notifDaily: { date: p.day, count: daily + 1 },
      [`notifStats.${type}.sent`]: FieldValue.increment(1),
      [`notifStats.${type}.lastSentAt`]: now,
      [`notifStats.${type}.lastSentDay`]: p.day,
    });
    tx.set(logRef, { uid, type, key, status: "sent", title: content.title, body: content.body, sentAt: Timestamp.fromMillis(now), day: p.day });
    tx.set(metricsRef, { sent: FieldValue.increment(1) }, { merge: true });
    out = { status: "sent", tokens };
  });

  if (out.status === "sent") {
    const payload = {
      title: content.title, body: content.body, tag: `${type}-${key}`.slice(0, 120), nid: logId, ntype: type,
      url: `/app-v2?n=${encodeURIComponent(logId)}&go=${content.screen || "home"}`,
    };
    let res = null;
    try { res = await sendPush(uid, out.tokens, payload); } catch (e) { logger.error("sendPush", { message: e.message, type }); }
    if (!res || res.successCount === 0) await revertSend(uid, type, logId, p.day).catch(() => {});
    return { status: "sent", nid: logId };
  }
  if (out.status === "blocked") {
    const defer = (out.reason === "quiet" && cfg.deferQuiet) || (out.reason === "cap" && cfg.deferBusy);
    if (defer) {
      const expiresAt = opts.expiresAt || now + (cfg.ttlH || 24) * 3600000;
      const notBefore = next9h(now);
      if (notBefore <= expiresAt) {
        await db().collection("notifQueue").doc(logId).set({ uid, type, key, content, notBefore, expiresAt });
        return { status: "queued", reason: out.reason };
      }
    }
    return { status: "skip", reason: out.reason };
  }
  return out;
}

// Envoi FCM totalement échoué : on annule la comptabilité (sinon l'habitant serait pénalisé par la
// décroissance pour une notification qu'il n'a jamais pu recevoir).
async function revertSend(uid, type, logId, day) {
  const batch = db().batch();
  batch.update(db().collection("notifLog").doc(logId), { status: "failed" });
  batch.update(db().collection("users").doc(uid), { [`notifStats.${type}.sent`]: FieldValue.increment(-1), [`notifStats.${type}.lastSentDay`]: "", "notifDaily.count": FieldValue.increment(-1) });
  batch.set(db().collection("notifMetrics").doc(type), { sent: FieldValue.increment(-1) }, { merge: true });
  await batch.commit();
}

// ─────────────────────────── Suivi : ouvertures, non-ouvertures, décroissance ───────────────────────────
async function trackOpen(uid, nid, foreground) {
  const logRef = db().collection("notifLog").doc(String(nid));
  const userRef = db().collection("users").doc(uid);
  let res = { ok: true };
  await db().runTransaction(async (tx) => {
    const l = await tx.get(logRef);
    if (!l.exists || l.data().uid !== uid) throw new HttpsError("not-found", "Notification introuvable.");
    const d = l.data();
    if (d.status === "opened") { res = { ok: true, already: true }; return; }
    const metrics = db().collection("notifMetrics").doc(d.type);
    if (foreground && d.status === "sent") {
      // Reçue pendant que l'app était ouverte : ni ouverture ni non-ouverture, et non comptée comme envoi.
      tx.update(logRef, { status: "seen" });
      tx.update(userRef, { [`notifStats.${d.type}.sent`]: FieldValue.increment(-1) });
      tx.set(metrics, { sent: FieldValue.increment(-1) }, { merge: true });
      res = { ok: true, seen: true };
      return;
    }
    tx.update(logRef, { status: "opened", openedAt: FieldValue.serverTimestamp() });
    // Première ouverture : le compteur de non-ouvertures repart de zéro et le type retrouve son rythme normal.
    tx.update(userRef, {
      [`notifStats.${d.type}.opened`]: FieldValue.increment(1),
      [`notifStats.${d.type}.missStreak`]: 0,
      [`notifStats.${d.type}.weekly`]: false,
      [`notifStats.${d.type}.autoOff`]: false,
    });
    tx.set(metrics, { opened: FieldValue.increment(1) }, { merge: true });
  });
  return res;
}

async function processMisses(now) {
  const snap = await db().collection("notifLog").where("status", "==", "sent").where("sentAt", "<=", Timestamp.fromMillis(now - MISS_AFTER_MS)).limit(300).get();
  let n = 0;
  for (const doc of snap.docs) {
    await db().runTransaction(async (tx) => {
      const l = await tx.get(doc.ref);
      if (!l.exists || l.data().status !== "sent") return;
      const { uid, type } = l.data();
      const userRef = db().collection("users").doc(uid);
      const u = await tx.get(userRef);
      tx.update(doc.ref, { status: "missed" });
      if (!u.exists) return;
      const st = ((u.data().notifStats || {})[type]) || {};
      const ms = (st.missStreak || 0) + 1;
      const upd = { [`notifStats.${type}.missStreak`]: ms };
      if (ms >= WEEKLY_AFTER_MISSES) upd[`notifStats.${type}.weekly`] = true;
      if (ms >= OFF_AFTER_MISSES && !st.autoOff) {
        upd[`notifStats.${type}.autoOff`] = true;
        tx.set(db().collection("notifMetrics").doc(type), { autoDisabled: FieldValue.increment(1) }, { merge: true });
      }
      tx.update(userRef, upd);
    });
    n++;
  }
  return n;
}

async function drainQueue(now) {
  const snap = await db().collection("notifQueue").where("notBefore", "<=", now).limit(200).get();
  let n = 0;
  for (const doc of snap.docs) {
    const q = doc.data();
    if (now > q.expiresAt) { await doc.ref.delete(); continue; }
    const r = await deliver(q.uid, q.type, q.content, { key: q.key, now, expiresAt: q.expiresAt });
    if (r.status !== "queued") await doc.ref.delete();
    n++;
  }
  return n;
}

// ─────────────────────────── Données de ciblage ───────────────────────────
const { sectorCategory } = require("./lib");
// Un profil sans catégorie reconnue (ancien compte) ou « tout m'intéresse » voit tout.
function matchesCategory(u, sector) {
  const ints = (u.interests || []).filter((i) => CAT_KEYS.includes(i));
  if (!ints.length || ints.length === CAT_KEYS.length) return true;
  return ints.includes(sectorCategory(sector));
}
const toMs = (t) => (t && t.toMillis ? t.toMillis() : typeof t === "number" ? t : 0);

function habitMinutes(u) {
  const a = (u.answerMinutes || []).filter(Number.isFinite);
  if (!a.length) return DEFAULT_HABIT_MIN;
  const s = [...a].sort((x, y) => x - y);
  return Math.min(20 * 60 + 45, Math.max(QUIET_TO, s[Math.floor(s.length / 2)]));
}

async function loadCaches(now) {
  const [cs, rs] = await Promise.all([
    db().collection("campaigns").where("status", "==", "active").get(),
    db().collection("rewards").where("active", "==", true).get(),
  ]);
  const campaigns = new Map(), rewards = new Map();
  cs.forEach((d) => {
    const c = { id: d.id, ...d.data() };
    if (c.endsAt && toMs(c.endsAt) < now) return;
    const city = String(c.targetCity || c.city || "").toLowerCase();
    if (!campaigns.has(city)) campaigns.set(city, []);
    campaigns.get(city).push(c);
  });
  rs.forEach((d) => {
    const r = { id: d.id, ...d.data() };
    if (r.status !== "approved") return;
    const city = String(r.city || "").toLowerCase();
    if (!rewards.has(city)) rewards.set(city, []);
    rewards.get(city).push(r);
  });
  return { campaigns, rewards };
}

// Questions que l'habitant peut réellement répondre aujourd'hui (mêmes critères que submitAnswer).
function availableFor(u, list) {
  const authorized = u.authorizedMerchants || [], answered = u.answeredCampaigns || [];
  const age = u.ageRange || u.age || "";
  return (list || []).filter((c) => {
    if (answered.includes(c.id) || !authorized.includes(c.merchantId)) return false;
    if ((c.ageRanges || []).length && age && !c.ageRanges.includes(age)) return false;
    const target = Number(c.targetVolume ?? c.volumeTarget) || 0;   // objectif facultatif : sans valeur, pas de plafond
    return !(target > 0 && (c.answersCount || 0) >= target);
  }).sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
}

// Récompense la plus proche pas encore atteinte, exprimée en nombre de réponses restantes.
function nearestReward(u, list) {
  const pts = u.points || 0;
  const above = (list || []).filter((r) => (r.cost || 0) > pts).sort((a, b) => a.cost - b.cost)[0];
  if (!above) return null;
  return { reward: above, left: Math.ceil((above.cost - pts) / IMMINENT_UNIT_PTS) };
}

// ─────────────────────────── Tick planifié ───────────────────────────
async function runTick(now = Date.now()) {
  const p = parisParts(now);
  const out = { queue: await drainQueue(now), misses: await processMisses(now), qdj: 0, serie: 0, code: 0, ending: 0 };
  const caches = await loadCaches(now);
  const users = await db().collection("users").where("pushEnabled", "==", true).get();

  const work = users.docs.map((doc) => async () => {
    const u = doc.data(), uid = doc.id;
    if (!u.city || !uniq(u.fcmTokens).length) return;
    const city = String(u.city).toLowerCase();
    const avail = availableFor(u, caches.campaigns.get(city));
    // Question du jour : à l'heure habituelle de réponse, jamais si déjà répondu, jamais sans question à répondre.
    if (p.min >= habitMinutes(u) && p.min < QUIET_FROM && avail.length && !answeredToday(u, p.day)
        && ((u.notifStats || {}).question_du_jour || {}).lastSentDay !== p.day) {
      let content = copy.questionDuJour({ merchant: avail[0].merchantName });
      // « Récompense imminente » : jamais envoyée seule, fusionnée avec la question du jour.
      if (((u.notifPrefs || {}).recompenses) !== false) {
        const near = nearestReward(u, caches.rewards.get(city));
        if (near && (near.left === 1 || near.left === 2)) content = copy.imminent({ left: near.left, reward: near.reward.label, rewardMerchant: near.reward.merchantName });
      }
      const r = await deliver(uid, "question_du_jour", content, { key: p.day, now });
      if (r.status === "sent") out.qdj++;
    }
    // Série en danger : 20h, série >= 3 jours encore vivante (répondu hier), rien répondu aujourd'hui.
    if (p.hour === 20 && (u.streak || 0) >= 3 && (u.streakDate !== undefined ? u.streakDate : u.lastAnswerDate) === yesterdayDay(now) && avail.length && !answeredToday(u, p.day)) {
      const r = await deliver(uid, "serie_en_danger", copy.serie({ n: u.streak, merchant: avail[0].merchantName }), { key: p.day, now });
      if (r.status === "sent") out.serie++;
    }
  });
  for (let i = 0; i < work.length; i += 10) await Promise.all(work.slice(i, i + 10).map((f) => f()));

  if (p.hour === 11) out.code = await notifyExpiringCodes(now);
  if (p.hour === 10) out.ending = await notifyEndingCampaigns(now, caches);
  out.expired = await expireCampaigns(now);
  return out;
}

async function notifyExpiringCodes(now) {
  const snap = await db().collection("redemptions").where("status", "==", "pending")
    .where("expiresAt", ">", Timestamp.fromMillis(now)).where("expiresAt", "<=", Timestamp.fromMillis(now + 3 * DAY)).get();
  let n = 0;
  for (const d of snap.docs) {
    const r = d.data();
    if (!r.userId) continue;
    const exp = toMs(r.expiresAt), pe = parisParts(exp), pn = parisParts(now);
    const days = Math.round((Date.parse(pe.day) - Date.parse(pn.day)) / DAY);
    const when = days <= 0 ? "aujourd'hui" : days === 1 ? "demain" : `dans ${days} jours`;
    const until = `${pe.day.slice(8, 10)}/${pe.day.slice(5, 7)} à ${String(pe.hour).padStart(2, "0")}h${String(pe.minute).padStart(2, "0")}`;
    const res = await deliver(r.userId, "code_expire", copy.code({ reward: r.label, merchant: r.merchantName, when, until }), { key: d.id, now });
    if (res.status === "sent") n++;
  }
  return n;
}

// ─────────────────────────── Commerçant : email + in-app (jamais de push) ───────────────────────────
async function notifyMerchant(mid, key, { title, message, type }) {
  if (!mid) return false;
  const ref = db().collection("merchants").doc(mid).collection("notifications").doc(key);
  try { await ref.create({ title, message, type, read: false, createdAt: FieldValue.serverTimestamp() }); }
  catch (e) { return false; } // déjà créée : jamais deux fois la même
  const m = await db().collection("merchants").doc(mid).get();
  const to = m.exists && m.data().email;
  if (to) {
    // Format de l'extension Firebase « Trigger Email from Firestore » : l'envoi réel demande de la
    // configurer avec un SMTP (Firebase Console > Extensions). Sans elle, seul l'in-app est actif.
    await db().collection("mail").doc(`${mid}_${key}`).set({
      to, type, message: {
        subject: title,
        text: `${message}\n\nVoir mon dashboard : https://noovaoff.fr/dashboard\n\nL'équipe NOOVA`,
        html: `<p>${message}</p><p><a href="https://noovaoff.fr/dashboard">Voir mon dashboard</a></p><p>L'équipe NOOVA</p>`,
      }, createdAt: FieldValue.serverTimestamp(),
    }).catch(() => {});
  }
  return true;
}

// Une campagne dont la durée est écoulée passe à « Terminée » (elle n'était déjà plus diffusée : submitAnswer et l'app
// ignorent les campagnes dont endsAt est passé). Le commerçant peut la relancer en prolongeant sa durée.
async function expireCampaigns(now) {
  try {
    const snap = await db().collection("campaigns").where("status", "==", "active").where("endsAt", "<=", Timestamp.fromMillis(now)).get();
    let n = 0;
    for (const d of snap.docs) { await d.ref.update({ status: "completed", completedReason: "duration", completedAt: FieldValue.serverTimestamp() }); n++; }
    return n;
  } catch (e) { logger.warn("expireCampaigns", { message: e.message }); return 0; }
}

async function notifyEndingCampaigns(now, caches) {
  let n = 0;
  for (const list of caches.campaigns.values()) {
    for (const c of list) {
      const end = toMs(c.endsAt);
      if (!end || end <= now || end > now + 3 * DAY) continue;
      const name = clean(c.name || c.question || "votre campagne");
      const ok = await notifyMerchant(c.merchantId, `ending_${c.id}`, {
        type: "campagne_fin", title: "Votre campagne se termine dans 3 jours",
        message: `« ${short(name, 60)} » se termine bientôt : ${c.answersCount || 0} réponses reçues pour l'instant.`,
      });
      if (ok) n++;
    }
  }
  return n;
}

// ─────────────────────────── Fonctions exportées ───────────────────────────
const notifTick = onSchedule({ schedule: "every 15 minutes", timeZone: "Europe/Paris", retryCount: 0 }, async () => {
  const r = await runTick(Date.now());
  logger.info("notifTick", r);
});

// Un commerce lance une campagne → « nouveau commerce » pour les habitants de sa ville et de ses catégories.
const notifyNewCampaign = onDocumentCreated("campaigns/{campaignId}", async (event) => {
  const camp = event.data && event.data.data();
  if (!camp) return;
  // Quota mensuel de questions : comptabilisé pour toute nouvelle campagne ; au-delà, elle est bloquée et jamais notifiée.
  if (!(await require("./quota")._t.accountCampaign(event.params.campaignId, camp))) return;
  if (camp.status !== "active") return;
  const city = String(camp.targetCity || camp.city || "").toLowerCase();
  if (!city) return;
  const m = await db().collection("merchants").doc(camp.merchantId).get();
  const sector = m.exists ? m.data().sector : camp.sector;
  const snap = await db().collection("users").where("city", "==", city).where("pushEnabled", "==", true).get();
  const work = snap.docs.filter((d) => {
    const u = d.data();
    return !(u.declinedMerchants || []).includes(camp.merchantId) && !(u.answeredCampaigns || []).includes(event.params.campaignId) && matchesCategory(u, sector);
  }).map((d) => () => deliver(d.id, "nouveau_commerce",
    copy.nouveauCommerce({ merchant: camp.merchantName, known: (d.data().authorizedMerchants || []).includes(camp.merchantId) }),
    { key: event.params.campaignId }));
  for (let i = 0; i < work.length; i += 20) await Promise.all(work.slice(i, i + 20).map((f) => f()));
});

// Réponse enregistrée → récompense débloquée, et amis qui ont répondu la même chose.
const onAnswerNotifs = onDocumentCreated("answers/{answerId}", async (event) => {
  const a = event.data && event.data.data();
  if (!a || a.flagged || !a.userId) return;
  const uSnap = await db().collection("users").doc(a.userId).get();
  if (!uSnap.exists) return;
  const u = uSnap.data();

  if ((a.pointsAwarded || 0) > 0) {
    const pts = u.points || 0, prev = pts - a.pointsAwarded;
    const city = String(u.city || "").toLowerCase();
    const rs = await db().collection("rewards").where("city", "==", city).where("active", "==", true).get();
    const crossed = rs.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.status === "approved" && r.cost > prev && r.cost <= pts).sort((x, y) => y.cost - x.cost)[0];
    if (crossed) await deliver(a.userId, "recompense_debloquee", copy.recompense({ reward: crossed.label, merchant: crossed.merchantName, cost: crossed.cost }), { key: event.params.answerId });
  }

  if (a.answer && String(a.answer).length <= 60) {
    const norm = (s) => String(s).trim().toLowerCase();
    for (const fid of uniq(u.friendUids).slice(0, 30)) {
      const [f, fa] = await Promise.all([db().collection("users").doc(fid).get(), db().collection("answers").doc(`${fid}_${a.campaignId}_q${a.questionIdx}`).get()]);
      // Amitié réciproque uniquement, et c'est l'ami qui avait répondu AVANT qui est prévenu.
      if (!f.exists || !(f.data().friendUids || []).includes(a.userId) || !fa.exists || fa.data().flagged) continue;
      if (norm(fa.data().answer) !== norm(a.answer)) continue;
      await deliver(fid, "ami", copy.amiSame({ name: u.name || "Un ami", merchant: a.brand }), { key: `same_${a.campaignId}_${a.questionIdx}_${a.userId}` });
    }
  }
});

// Demande d'ami reçue / acceptée → « ami ».
const onFriendNotif = onDocumentCreated("users/{uid}/notifications/{nid}", async (event) => {
  const n = event.data && event.data.data();
  if (!n || !["friend_request", "friend_accepted"].includes(n.type)) return;
  const name = n.fromName || "Un ami";
  await deliver(event.params.uid, "ami", n.type === "friend_request" ? copy.amiRequest({ name }) : copy.amiAccepted({ name }), { key: event.params.nid });
});

// Campagne : paliers de réponses → commerçant (email + in-app) et « résultat disponible » aux répondants.
const MILESTONES = [1, 5, 10, 50, 100];
const onCampaignProgress = onDocumentUpdated("campaigns/{campaignId}", async (event) => {
  const before = event.data.before.data(), after = event.data.after.data();
  const b = before.answersCount || 0, a = after.answersCount || 0;
  if (a <= b) return;
  const id = event.params.campaignId;
  const name = clean(after.name || after.question || "votre campagne");
  for (const t of MILESTONES.filter((x) => b < x && a >= x)) {
    const msg = t === 1
      ? { title: "Première réponse reçue", message: `Une première personne a répondu à « ${short(name, 60)} ». Les résultats s'affichent dès 5 réponses, pour protéger l'anonymat.` }
      : t === 5
        ? { title: "Vos 5 premières réponses sont là", message: "Vous avez reçu vos 5 premières réponses, les résultats sont disponibles." }
        : { title: `${t} réponses reçues`, message: `« ${short(name, 60)} » vient d'atteindre ${t} réponses.` };
    await notifyMerchant(after.merchantId, `resp_${id}_${t}`, { type: "paliers", ...msg });
  }
  if (b < RESULT_THRESHOLD && a >= RESULT_THRESHOLD) await notifyResults(id, after);
});

async function notifyResults(campaignId, camp) {
  const snap = await db().collection("answers").where("campaignId", "==", campaignId).get();
  const q0 = snap.docs.map((d) => d.data()).filter((x) => (x.questionIdx || 0) === 0 && !x.flagged);
  const fmt = ((camp.questions && camp.questions[0] && camp.questions[0].format) || camp.format || "text");
  const norm = (s) => String(s || "").trim().toLowerCase();
  const counts = {};
  q0.forEach((x) => { counts[norm(x.answer)] = (counts[norm(x.answer)] || 0) + 1; });
  const seen = new Set();
  const work = [];
  q0.forEach((x) => {
    if (seen.has(x.userId)) return; seen.add(x.userId);
    const pct = fmt === "text" ? null : Math.round((counts[norm(x.answer)] / q0.length) * 100);
    work.push(() => deliver(x.userId, "resultat_dispo", copy.resultat({ merchant: camp.merchantName, pct }), { key: `res_${campaignId}` }));
  });
  for (let i = 0; i < work.length; i += 20) await Promise.all(work.slice(i, i + 20).map((f) => f()));
}

const onRedemptionUpdated = onDocumentUpdated("redemptions/{rid}", async (event) => {
  const b = event.data.before.data(), a = event.data.after.data();
  if (b.status === "used" || a.status !== "used" || !a.merchantId) return;
  await notifyMerchant(a.merchantId, `claim_${event.params.rid}`, { type: "recompense_reclamee", title: "Récompense réclamée", message: `Un client a réclamé « ${short(a.label || "une récompense", 60)} ».` });
});

const onMerchantStatus = onDocumentUpdated("merchants/{mid}", async (event) => {
  const b = event.data.before.data(), a = event.data.after.data();
  if (b.status === a.status) return;
  if (a.status === "verified") await notifyMerchant(event.params.mid, `status_verified_${Date.now()}`, { type: "statut", title: "Votre établissement est vérifié", message: "Bonne nouvelle : votre établissement est vérifié, vous pouvez lancer vos campagnes." });
  else if (a.status === "rejected") await notifyMerchant(event.params.mid, `status_rejected_${Date.now()}`, { type: "statut", title: "Votre dossier demande des corrections", message: `${a.rejectionReason || "Ouvrez votre dashboard pour voir les points à corriger."} Votre compte reste actif et vos données sont conservées.` });
});

// ─────────────────────────── Appels depuis l'app ───────────────────────────
const trackNotifOpen = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi.");
  const { nid, foreground } = request.data || {};
  if (!nid || typeof nid !== "string") throw new HttpsError("invalid-argument", "Notification invalide.");
  return trackOpen(uid, nid, !!foreground);
});

async function setPref(uid, group, enabled) {
  if (!GROUPS[group]) throw new HttpsError("invalid-argument", "Réglage inconnu.");
  const userRef = db().collection("users").doc(uid);
  await db().runTransaction(async (tx) => {
    const u = await tx.get(userRef);
    if (!u.exists) throw new HttpsError("failed-precondition", "Profil introuvable.");
    const was = ((u.data().notifPrefs || {})[group]) !== false;
    const upd = { [`notifPrefs.${group}`]: !!enabled };
    if (enabled) {
      // Réactivation volontaire : la décroissance repart de zéro pour ces types.
      GROUPS[group].forEach((t) => { upd[`notifStats.${t}.missStreak`] = 0; upd[`notifStats.${t}.weekly`] = false; upd[`notifStats.${t}.autoOff`] = false; });
    } else if (was) {
      GROUPS[group].forEach((t) => tx.set(db().collection("notifMetrics").doc(t), { deactivated: FieldValue.increment(1) }, { merge: true }));
    }
    tx.update(userRef, upd);
  });
  return { ok: true };
}
const setNotifPref = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi.");
  const { group, enabled } = request.data || {};
  return setPref(uid, String(group), enabled !== false);
});

module.exports = {
  notifTick, notifyNewCampaign, onAnswerNotifs, onFriendNotif, onCampaignProgress, onRedemptionUpdated, onMerchantStatus,
  trackNotifOpen, setNotifPref,
  // Internes exposés aux tests
  _t: { deliver, runTick, nowMs, trackOpen, setPref, processMisses, drainQueue, habitMinutes, parisParts, next9h, copy, TYPES, GROUPS, notifyMerchant, notifyExpiringCodes, notifyEndingCampaigns, expireCampaigns, loadCaches, sectorCategory },
};
