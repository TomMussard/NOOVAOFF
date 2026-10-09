"use strict";
/**
 * Relances « profil incomplet » : âge, centres d'intérêt, ville, notifications.
 *
 * Chaque jour (et à la demande depuis l'admin), un habitant à qui il manque quelque chose reçoit UNE relance :
 *  - une ligne dans sa cloche, avec un bouton qui ouvre directement le bon écran ;
 *  - une notification sur son téléphone (si elles sont activées), qui ouvre le même écran.
 * Garde-fous : 3 jours entre deux relances du même manque, 3 relances au plus par manque, jamais le jour de
 * l'inscription, une seule relance par jour et par habitant (la plus utile d'abord). Coupable par l'habitant
 * avec « Annonces de NOOVA » dans son profil.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

const db = () => getFirestore();
const DAY = 86400000;
const GAP_DAYS = 3, MAX_PER_ITEM = 3;
const tokensOf = (u) => [...new Set((u.fcmTokens || []).filter(Boolean))];

// Dans l'ordre de priorité : la ville d'abord (sans elle, aucune question), puis les notifications, l'âge, les goûts.
const NUDGES = [
  { key: "city", go: "fix-city", miss: (u) => !u.city,
    title: "Indique ta ville", body: "Sans ta ville, NOOVA ne peut pas te montrer les questions des commerces près de chez toi. 10 secondes." },
  { key: "notifs", go: "fix-notifs", miss: (u) => !tokensOf(u).length,
    title: "Active tes notifications", body: "Sois prévenu quand un commerce a besoin de ton avis : quelques notifications par jour, jamais la nuit." },
  { key: "age", go: "fix-age", miss: (u) => !u.ageRange && !u.age,
    title: "Plus que ton âge à indiquer", body: "Les commerces te posent des questions faites pour toi. Une tranche d'âge suffit, c'est anonyme." },
  { key: "interests", go: "fix-interests", miss: (u) => !(u.interests || []).length,
    title: "Dis-nous ce qui t'intéresse", body: "Choisis tes centres d'intérêt : tu recevras les questions des commerces qui te ressemblent." },
];
const BY_KEY = Object.fromEntries(NUDGES.map((n) => [n.key, n]));

const isHabitant = (u) => (!u.role || u.role === "user") && u.isTest !== true;
const createdMs = (u) => (u.createdAt && u.createdAt.toMillis ? u.createdAt.toMillis() : 0);

// Ce qui manque à un habitant (pour l'admin et pour la relance).
function missingOf(u) { return NUDGES.filter((n) => n.miss(u)).map((n) => n.key); }

// La relance à envoyer maintenant, ou null. force (admin) : on ignore l'écart de 3 jours mais jamais plus d'une par jour.
function pickNudge(u, now, only, force) {
  if (!isHabitant(u)) return null;
  if (createdMs(u) && now - createdMs(u) < DAY) return null;       // inscrit aujourd'hui : on le laisse finir tranquillement
  const st = u.profileNudges || {};
  if (st.lastAt && now - st.lastAt < DAY - 3600000) return null;   // une relance par jour au plus, tous manques confondus
  for (const n of NUDGES) {
    if (only && n.key !== only) continue;
    if (!n.miss(u)) continue;
    const s = st[n.key] || {};
    if ((s.n || 0) >= MAX_PER_ITEM && !force) continue;
    if (!force && s.last && now - s.last < GAP_DAYS * DAY - 3600000) continue;
    return n;
  }
  return null;
}

async function nudgeUser(doc, now, opts = {}) {
  const u = doc.data();
  const n = pickNudge(u, now, opts.only, opts.force);
  if (!n) return null;
  const s = (u.profileNudges || {})[n.key] || {};
  const count = (s.n || 0) + 1;
  // La cloche (toujours, même sans notifications activées) : remplacée à chaque relance, remontée en non lue.
  await doc.ref.collection("notifications").doc("profil_" + n.key).set({
    type: "profil", fix: n.go, title: n.title, message: n.body, read: false, createdAt: FieldValue.serverTimestamp(),
  });
  await doc.ref.update({
    [`profileNudges.${n.key}.n`]: count, [`profileNudges.${n.key}.last`]: now, "profileNudges.lastAt": now,
  });
  let push = null;
  if (n.key !== "notifs" && tokensOf(u).length) {
    const N = require("./notifications")._t;
    push = await N.deliver(doc.id, "profil", { title: n.title, body: n.body, screen: n.go }, { key: `${n.key}_${count}`, now }).catch((e) => ({ status: "error", reason: e.message }));
  }
  return { key: n.key, push: push && push.status };
}

async function runNudges(opts = {}) {
  const N = require("./notifications")._t;
  const now = opts.now || await N.nowMs();
  const users = (await db().collection("users").where("role", "==", "user").get()).docs;
  const out = { checked: users.length, sent: 0, push: 0, byKey: {} };
  for (const d of users) {
    const r = await nudgeUser(d, now, opts).catch((e) => { logger.warn("nudge", { uid: d.id, message: e.message }); return null; });
    if (!r) continue;
    out.sent++; out.byKey[r.key] = (out.byKey[r.key] || 0) + 1;
    if (r.push === "sent" || r.push === "queued") out.push++;
  }
  return out;
}

// Tous les jours à 11h47 (heure de Paris) : relances automatiques.
const profileNudgesDaily = onSchedule({ schedule: "47 11 * * *", timeZone: "Europe/Paris", region: "europe-west1", timeoutSeconds: 540, retryCount: 0 }, async () => {
  const r = await runNudges();
  logger.info("relances profil", r);
});

// Admin : relancer maintenant (un manque précis ou tous), sans attendre les 3 jours.
const adminProfileNudges = onCall({ region: "europe-west1", timeoutSeconds: 300 }, async (request) => {
  if (!require("./lib").isAdminRequest(request)) throw new HttpsError("permission-denied", "Réservé aux administrateurs Noova.");
  const only = request.data && request.data.only;
  if (only && !BY_KEY[only]) throw new HttpsError("invalid-argument", "Relance inconnue.");
  return await runNudges({ only: only || null, force: true });
});

module.exports = { profileNudgesDaily, adminProfileNudges, _t: { runNudges, pickNudge, missingOf, NUDGES, GAP_DAYS, MAX_PER_ITEM } };
