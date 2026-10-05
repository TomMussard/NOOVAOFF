"use strict";
/**
 * Alertes e-mail pour l'équipe NOOVA (les adresses admin) :
 *  - un nouveau commerce s'inscrit (à valider) ;
 *  - un testeur envoie un retour (« Ton avis sur NOOVA ») ;
 *  - un résumé chaque soir à 20h (inscriptions, actifs, réponses, commerces, bons, retours).
 *
 * Les e-mails passent par la collection « mail » et sont envoyés par functions/mailer.js (SMTP, secret SMTP_PASSWORD),
 * comme les e-mails aux commerçants. Le résultat de l'envoi est écrit sur le document (delivery.state).
 * Réglages (adresses, types d'alertes) dans config/adminAlerts, modifiables depuis l'admin.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const { ADMIN_EMAILS, parisDay } = require("./lib");

const db = () => getFirestore();
const CFG_REF = () => db().collection("config").doc("adminAlerts");
const DEFAULTS = { to: ADMIN_EMAILS, user: true, merchant: true, feedback: true, digest: true };
const ADMIN_URL = "https://noovaoff.fr/noova_admin.html";
const isAdmin = (request) => { const e = request.auth && request.auth.token && request.auth.token.email; return !!e && ADMIN_EMAILS.includes(e); };
const escH = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const validEmail = (e) => typeof e === "string" && /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,}$/i.test(e.trim());

async function settings() {
  const s = await CFG_REF().get();
  const d = s.exists ? s.data() : {};
  const to = Array.isArray(d.to) && d.to.filter(validEmail).length ? d.to.filter(validEmail) : DEFAULTS.to;
  return { to, user: d.user !== false, merchant: d.merchant !== false, feedback: d.feedback !== false, digest: d.digest !== false };
}

// Un e-mail dans la file d'envoi (functions/mailer.js). id déterministe : un déclencheur livré deux fois n'envoie qu'un e-mail.
async function queueMail(id, to, subject, lines, cta) {
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#1C0E02;max-width:560px">`
    + `<div style="font-weight:800;font-size:18px;margin-bottom:12px">NOOVA</div>`
    + lines.map((l) => `<p style="margin:0 0 8px;line-height:1.5">${l}</p>`).join("")
    + (cta ? `<p style="margin:16px 0"><a href="${cta.url}" style="background:#FFC300;color:#1C0E02;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:700">${escH(cta.label)}</a></p>` : "")
    + `<p style="color:#8C7A62;font-size:12px;margin-top:20px">Alerte automatique NOOVA. Réglages : admin, onglet Notifications.</p></div>`;
  const text = lines.map((l) => l.replace(/<[^>]+>/g, "")).join("\n") + (cta ? `\n\n${cta.label} : ${cta.url}` : "");
  // create (et non set) : un e-mail déjà en file n'est jamais réécrit, donc jamais renvoyé ni privé de son résultat.
  try { await db().collection("mail").doc(id.slice(0, 400)).create({ to, message: { subject, text, html }, type: "admin_alert", createdAt: FieldValue.serverTimestamp() }); }
  catch (e) { if (e.code !== 6 && !/already exists/i.test(String(e.message))) throw e; }
}

// ── Nouveau commerce inscrit (hors commerces fictifs du mois de test)
async function onMerchantCore(mid, m) {
  if (!m || m.isTest) return false;
  const s = await settings();
  if (!s.merchant) return false;
  const name = m.brandName || m.name || "Nouveau commerce";
  await queueMail(`alert_merchant_${mid}`, s.to, `Nouveau commerce inscrit : ${name}`, [
    `<b>${escH(name)}</b> vient de créer son compte commerçant.`,
    `${escH(m.sector || "Secteur non renseigné")}, ${escH(m.cityLabel || m.city || "ville non renseignée")}${m.address ? ", " + escH(m.address) : ""}.`,
    `Contact : ${escH([m.firstName, m.lastName].filter(Boolean).join(" ") || "—")}, ${escH(m.email || "")}${m.phone ? ", " + escH(m.phone) : ""}.`,
    m.siret ? `SIRET : ${escH(m.siret)}.` : "",
    "Il attend ta validation pour lancer sa première question.",
  ].filter(Boolean), { label: "Valider dans l'admin", url: ADMIN_URL });
  return true;
}
const alertNewMerchant = onDocumentCreated({ document: "merchants/{mid}", region: "europe-west1" }, async (event) => {
  await onMerchantCore(event.params.mid, event.data && event.data.data());
});

// ── Nouvel habitant inscrit
async function onUserCore(uid, u) {
  if (!u || (u.role && u.role !== "user")) return false;
  const s = await settings();
  if (!s.user) return false;
  const name = u.name || "Un habitant";
  await queueMail(`alert_user_${uid}`, s.to, `Nouvel inscrit : ${name}${u.cityLabel || u.city ? " (" + (u.cityLabel || u.city) + ")" : ""}`, [
    `<b>${escH(name)}</b> vient de créer son compte NOOVA.`,
    `Ville : ${escH(u.cityLabel || u.city || "pas encore renseignée")}.`,
    u.email ? `E-mail : ${escH(u.email)}.` : "",
  ].filter(Boolean), { label: "Voir les statistiques", url: ADMIN_URL });
  return true;
}
const alertNewUser = onDocumentCreated({ document: "users/{uid}", region: "europe-west1" }, async (event) => {
  await onUserCore(event.params.uid, event.data && event.data.data());
});

// ── Retour d'un testeur
const KIND = { idee: "une idée", bug: "un bug", remarque: "une remarque" };
async function onFeedbackCore(id, f) {
  if (!f) return false;
  const s = await settings();
  if (!s.feedback) return false;
  const who = f.name || "Un testeur";
  await queueMail(`alert_feedback_${id}`, s.to, `${f.kind === "bug" ? "Bug signalé" : "Nouveau retour"} : ${who}${f.rating ? ` (${f.rating}/5)` : ""}`, [
    `<b>${escH(who)}</b>${f.city ? " (" + escH(f.city) + ")" : ""} a envoyé ${KIND[f.kind] || "un retour"}${f.rating ? `, note ${f.rating}/5` : ""}.`,
    f.text ? `« ${escH(f.text)} »` : "",
    (f.likes || []).length ? `Aime : ${escH(f.likes.join(", "))}.` : "",
    (f.dislikes || []).length ? `À revoir : ${escH(f.dislikes.join(", "))}.` : "",
    `Appareil : ${escH(f.platform || "?")}${f.standalone ? " (app installée)" : ""}.`,
  ].filter(Boolean), { label: "Voir les retours", url: ADMIN_URL });
  return true;
}
const alertNewFeedback = onDocumentCreated({ document: "feedback/{id}", region: "europe-west1" }, async (event) => {
  await onFeedbackCore(event.params.id, event.data && event.data.data());
});

// ── Résumé du soir
async function digestCore(now = Date.now()) {
  const s = await settings();
  if (!s.digest) return { skipped: true };
  const st = await require("./adminStats")._t.computeStats(now);
  const day = parisDay(now), S = st.series || {}, last = (a) => (a || [])[(a || []).length - 1] || 0;
  const T = st.totals || {}, A = st.active || {};
  const fbSnap = await db().collection("feedback").where("status", "==", "nouveau").get().catch(() => ({ size: 0 }));
  const lines = [
    `<b>Résumé du ${day.slice(8, 10)}/${day.slice(5, 7)}</b>`,
    `Inscriptions aujourd'hui : <b>${last(S.signups)}</b> (${T.users ?? "—"} habitants au total).`,
    `Actifs aujourd'hui : <b>${A.today ?? "—"}</b>, sur 7 jours : ${A.week ?? "—"}.`,
    `Réponses aujourd'hui : <b>${last(S.answers)}</b> (${T.answers ?? "—"} au total).`,
    `Bons créés aujourd'hui : ${last(S.redemptions)}, utilisés au total : ${T.redemptionsUsed ?? "—"}.`,
    `Commerces vérifiés : ${T.merchantsVerified ?? "—"}${T.merchantsPending ? `, <b>${T.merchantsPending} en attente de validation</b>` : ""}.`,
    `Notifications activées : ${T.users ? Math.round(((T.pushEnabled || 0) * 100) / T.users) : 0} % des habitants.`,
    `Retours à traiter : <b>${fbSnap.size}</b>.`,
  ];
  await queueMail(`alert_digest_${day}`, s.to, `NOOVA, résumé du ${day.slice(8, 10)}/${day.slice(5, 7)} : ${last(S.signups)} inscriptions, ${last(S.answers)} réponses`, lines, { label: "Ouvrir les statistiques", url: ADMIN_URL });
  return { sent: true };
}
const adminDailyDigest = onSchedule({ schedule: "0 20 * * *", timeZone: "Europe/Paris", region: "europe-west1", retryCount: 0, timeoutSeconds: 120, memory: "512MiB" }, async () => {
  logger.info("adminDailyDigest", await digestCore());
});

// ── Réglages et e-mail de test (admin)
const adminAlerts = onCall({ region: "europe-west1" }, async (request) => {
  if (!isAdmin(request)) throw new HttpsError("permission-denied", "Réservé aux administrateurs Noova.");
  const d = request.data || {};
  if (d.action === "save") {
    const to = (Array.isArray(d.to) ? d.to : []).map((e) => String(e).trim()).filter(validEmail).slice(0, 5);
    if (!to.length) throw new HttpsError("invalid-argument", "Indique au moins une adresse e-mail valide.");
    await CFG_REF().set({ to, user: d.user !== false, merchant: d.merchant !== false, feedback: d.feedback !== false, digest: d.digest !== false, updatedAt: FieldValue.serverTimestamp() });
    return settings();
  }
  if (d.action === "test") {
    const s = await settings();
    const id = `alert_test_${Date.now()}`;
    await queueMail(id, s.to, "Test des alertes NOOVA", ["Si tu lis ce message, les alertes e-mail NOOVA fonctionnent."], { label: "Ouvrir l'admin", url: ADMIN_URL });
    return { id, to: s.to };
  }
  if (d.action === "status") {
    // mailer.js écrit delivery.state (PROCESSING, SUCCESS, ERROR) sur le document : sans ce champ, la fonction
    // d'envoi n'est pas déployée.
    const m = await db().collection("mail").doc(String(d.id || "x")).get();
    const del = m.exists ? m.data().delivery : null;
    return { exists: m.exists, state: del ? del.state : null, error: del && del.error ? String(del.error).slice(0, 300) : null };
  }
  return settings();
});

module.exports = { alertNewUser, alertNewMerchant, alertNewFeedback, adminDailyDigest, adminAlerts, _t: { onUserCore, onMerchantCore, onFeedbackCore, digestCore, settings } };
