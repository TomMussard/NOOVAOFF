"use strict";
/**
 * Newsletter NOOVA (admin, onglet Diffusion) : une base d'adresses — y compris des personnes pas encore inscrites sur
 * l'app — importée par l'admin depuis un CSV (lu dans son navigateur), puis des envois depuis l'adresse NOOVA
 * (functions/mailer.js, SMTP), un e-mail par personne — jamais en copie, personne ne voit les autres adresses.
 *
 *  - newsletter/{hash} : { email, status: "active" | "unsub", token, source, addedAt } ; jamais lu par le navigateur.
 *    Une personne désinscrite le reste : un nouvel import ne la réabonne pas.
 *  - adminMailCampaign : (admin) import d'un CSV, compteurs, désinscription manuelle (réponse STOP), envoi d'essai à
 *    soi-même, envoi à toute la base.
 *  - mailCampaignTick : toutes les 2 minutes, 20 e-mails au plus par passage et 450 par jour (Gmail en accepte 500 :
 *    on garde de la marge pour les alertes de l'équipe). 400 abonnés : ~40 minutes.
 *  - newsletterUnsub : lien « Se désinscrire » en un clic présent dans chaque e-mail (et en-tête List-Unsubscribe).
 *  - Fin d'envoi : les e-mails envoyés sont effacés ; la campagne ne garde que ses compteurs.
 */
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");
const logger = require("firebase-functions/logger");

const db = () => getFirestore();
const MAX_IMPORT = 5000, MAX_BASE = 10000, PER_RUN = 20, DAILY_CAP = 450;
const REPLY_TO = "noovaoffr@gmail.com";
const EMAIL_RE = /^[^\s@,;<>"']+@[^\s@,;<>"']+\.[a-z]{2,}$/i;

const parisDay = (ms) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const idOf = (e) => crypto.createHash("sha256").update(e).digest("hex").slice(0, 32);
const unsubUrl = (id, token) => {
  const p = process.env.GCLOUD_PROJECT || "noova-366d0";
  const base = process.env.FUNCTIONS_EMULATOR === "true" ? `http://127.0.0.1:5001/${p}/europe-west1` : `https://europe-west1-${p}.cloudfunctions.net`;
  return `${base}/newsletterUnsub?id=${id}&t=${token}`;
};

// Corps de l'e-mail : texte saisi par l'admin (paragraphes, liens cliquables), puis le pied de page légal.
function build(subject, text, unsub) {
  const footer = "Tu reçois cet e-mail parce que tu fais partie de la communauté NOOVA.";
  const stop = unsub ? `Se désinscrire : ${unsub}` : "Pour ne plus recevoir nos e-mails, réponds simplement STOP.";
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1C0E02;line-height:1.55;font-size:15px">`
    + String(text).trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#A14E08;font-weight:bold">$1</a>')}</p>`).join("")
    + `<p style="margin:24px 0 0;font-size:12px;color:#6b5a48">${esc(footer)} `
    + (unsub ? `<a href="${esc(unsub)}" style="color:#6b5a48">Se désinscrire</a>` : esc(stop)) + `</p></div>`;
  return { subject: String(subject).slice(0, 120), text: `${String(text).trim()}\n\n—\n${footer}\n${stop}`, html };
}
const headersFor = (unsub) => unsub
  ? { "List-Unsubscribe": `<${unsub}>, <mailto:${REPLY_TO}?subject=STOP>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
  : { "List-Unsubscribe": `<mailto:${REPLY_TO}?subject=STOP>` };

function cleanList(list) {
  const seen = new Set(), out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const e = String(raw || "").trim().toLowerCase();
    if (!EMAIL_RE.test(e) || /@test\.noova\.fr$/.test(e) || seen.has(e)) continue;
    seen.add(e); out.push(e);
  }
  return out;
}

async function counts() {
  const c = db().collection("newsletter");
  const [a, u] = await Promise.all([c.where("status", "==", "active").count().get(), c.where("status", "==", "unsub").count().get()]);
  return { active: a.data().count, unsub: u.data().count };
}

function checkMsg(subject, text) {
  if (!subject || String(subject).trim().length < 3 || String(subject).length > 120) throw new HttpsError("invalid-argument", "Objet : entre 3 et 120 caractères.");
  if (!text || String(text).trim().length < 10 || String(text).length > 5000) throw new HttpsError("invalid-argument", "Message : entre 10 et 5 000 caractères.");
}

const adminMailCampaign = onCall({ region: "europe-west1", timeoutSeconds: 300 }, async (request) => {
  if (!require("./lib").isAdminRequest(request)) throw new HttpsError("permission-denied", "Réservé aux administrateurs Noova.");
  const { action, subject, text, recipients, consent, source, email } = request.data || {};

  if (action === "stats") return counts();

  if (action === "import") {
    if (consent !== true) throw new HttpsError("failed-precondition", "Confirme que ces personnes ont accepté de recevoir des e-mails de NOOVA.");
    const list = cleanList(recipients);
    if (!list.length) throw new HttpsError("invalid-argument", "Aucune adresse e-mail valide dans le fichier.");
    if (list.length > MAX_IMPORT) throw new HttpsError("invalid-argument", `${MAX_IMPORT} adresses au plus par import.`);
    const before = await counts();
    if (before.active + before.unsub + list.length > MAX_BASE) throw new HttpsError("resource-exhausted", `La base est limitée à ${MAX_BASE} adresses.`);
    const col = db().collection("newsletter");
    let added = 0, already = 0, unsub = 0;
    for (let i = 0; i < list.length; i += 300) {
      const part = list.slice(i, i + 300), refs = part.map((e) => col.doc(idOf(e)));
      const snaps = await db().getAll(...refs);
      const b = db().batch();
      snaps.forEach((s, k) => {
        if (s.exists) { s.data().status === "unsub" ? unsub++ : already++; return; }
        b.create(refs[k], { email: part[k], status: "active", token: crypto.randomBytes(12).toString("hex"), source: String(source || "import").slice(0, 60), addedAt: FieldValue.serverTimestamp() });
        added++;
      });
      await b.commit();
    }
    logger.info("newsletter : import", { added, already, unsub });
    return { added, already, unsub, ...(await counts()) };
  }

  if (action === "unsub") {                          // réponse « STOP » reçue : l'admin désinscrit l'adresse
    const e = String(email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(e)) throw new HttpsError("invalid-argument", "Adresse e-mail invalide.");
    await db().collection("newsletter").doc(idOf(e)).set({ email: e, status: "unsub", unsubAt: FieldValue.serverTimestamp(), token: crypto.randomBytes(12).toString("hex") }, { merge: true });
    return counts();
  }

  checkMsg(subject, text);
  if (request.data && request.data.test) {
    const me = request.auth.token.email, msg = build(subject, text, null);
    await db().collection("mail").add({ to: me, message: { ...msg, subject: "[Essai] " + msg.subject }, replyTo: REPLY_TO, headers: headersFor(null), type: "campaign", createdAt: FieldValue.serverTimestamp() });
    return { test: true, to: me };
  }

  if (action !== "send") throw new HttpsError("invalid-argument", "Action inconnue.");
  if ((await db().collection("mailCampaigns").where("status", "==", "sending").limit(1).get()).size) throw new HttpsError("failed-precondition", "Un envoi est déjà en cours : attends qu'il se termine.");
  const subs = (await db().collection("newsletter").where("status", "==", "active").get()).docs;
  if (!subs.length) throw new HttpsError("failed-precondition", "La base est vide : importe d'abord un fichier CSV.");
  const ref = db().collection("mailCampaigns").doc();
  await ref.set({ subject: String(subject).trim().slice(0, 120), text: String(text).trim(), total: subs.length, sent: 0, skipped: 0, status: "sending", by: request.auth.token.email || "", createdAt: FieldValue.serverTimestamp() });
  for (let i = 0; i < subs.length; i += 400) {
    const b = db().batch();
    subs.slice(i, i + 400).forEach((s) => b.set(ref.collection("to").doc(s.id), { state: "pending" }));
    await b.commit();
  }
  logger.info("newsletter : envoi créé", { id: ref.id, total: subs.length });
  return { id: ref.id, total: subs.length, minutes: Math.ceil(subs.length / PER_RUN) * 2, days: Math.ceil(subs.length / DAILY_CAP) };
});

// Un passage : envoie les suivants des campagnes en cours, dans la limite du jour ; termine et efface ce qui est fini.
async function tickCore(now = Date.now()) {
  const camps = (await db().collection("mailCampaigns").where("status", "in", ["sending", "done"]).get()).docs;
  if (!camps.length) return { idle: true };
  const dayRef = db().collection("config").doc("mailDaily"), day = parisDay(now);
  const dd = (await dayRef.get()).data() || {};
  let used = dd.day === day ? dd.n || 0 : 0, queued = 0;
  for (const c of camps) {
    const d = c.data();
    if (d.status === "done") {                       // envoyée : on efface les e-mails une fois partis
      const mails = (await db().collection("mail").where("campaignId", "==", c.id).limit(400).get()).docs;
      if (mails.some((m) => !(m.data().delivery && /SUCCESS|ERROR|SKIPPED/.test(m.data().delivery.state || "")))) continue;
      const errors = mails.filter((m) => m.data().delivery.state === "ERROR").length;
      const b = db().batch(); mails.forEach((m) => b.delete(m.ref));
      b.update(c.ref, { errors: FieldValue.increment(errors), ...(mails.length < 400 ? { status: "purged", purgedAt: FieldValue.serverTimestamp() } : {}) });
      await b.commit();
      continue;
    }
    const room = Math.min(PER_RUN - queued, DAILY_CAP - used);
    if (room <= 0) break;
    const todo = (await c.ref.collection("to").where("state", "==", "pending").limit(room).get()).docs;
    if (!todo.length) { await c.ref.update({ status: "done", doneAt: FieldValue.serverTimestamp() }); continue; }
    const subs = await db().getAll(...todo.map((t) => db().collection("newsletter").doc(t.id)));
    const b = db().batch();
    let n = 0, skipped = 0;
    todo.forEach((t, k) => {
      const s = subs[k].exists ? subs[k].data() : null;
      b.delete(t.ref);
      if (!s || s.status !== "active") { skipped++; return; }   // désinscrit entre-temps
      const u = unsubUrl(t.id, s.token);
      b.set(db().collection("mail").doc(`camp_${c.id}_${t.id}`), { to: s.email, message: build(d.subject, d.text, u), replyTo: REPLY_TO, headers: headersFor(u), type: "campaign", campaignId: c.id, createdAt: FieldValue.serverTimestamp() });
      n++;
    });
    b.update(c.ref, { sent: FieldValue.increment(n), skipped: FieldValue.increment(skipped) });
    await b.commit();
    queued += n; used += n;
  }
  if (queued) await dayRef.set({ day, n: used });
  return { queued, usedToday: used };
}

const mailCampaignTick = onSchedule({ schedule: "every 2 minutes", region: "europe-west1", timeoutSeconds: 120, retryCount: 0 }, async () => {
  const r = await tickCore();
  if (!r.idle) logger.info("newsletter", r);
});

// Lien « Se désinscrire » : GET depuis l'e-mail, POST pour le désabonnement en un clic de Gmail (List-Unsubscribe-Post).
const page = (title, body) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>`
  + `<body style="margin:0;background:#F6EEDF;font-family:Arial,Helvetica,sans-serif;color:#1C0E02"><div style="max-width:420px;margin:15vh auto;padding:28px 24px;background:#fff;border-radius:20px;text-align:center">`
  + `<h1 style="font-size:22px;margin:0 0 10px">${title}</h1><p style="margin:0;line-height:1.5">${body}</p></div></body></html>`;
async function unsubCore(id, token) {
  if (!/^[0-9a-f]{32}$/.test(String(id || "")) || !/^[0-9a-f]{24}$/.test(String(token || ""))) return false;
  const ref = db().collection("newsletter").doc(id), s = await ref.get();
  if (!s.exists || s.data().token !== token) return false;
  if (s.data().status !== "unsub") await ref.update({ status: "unsub", unsubAt: FieldValue.serverTimestamp() });
  return true;
}
const newsletterUnsub = onRequest({ region: "europe-west1", cors: false }, async (req, res) => {
  const ok = await unsubCore(req.query.id, req.query.t);
  res.set("Cache-Control", "no-store");
  if (!ok) { res.status(404).send(page("Lien invalide", "Ce lien de désinscription n'est pas valide. Réponds STOP à notre e-mail, on s'en occupe.")); return; }
  res.status(200).send(page("C'est fait", "Tu ne recevras plus d'e-mails de NOOVA. Ton compte sur l'app, si tu en as un, n'est pas touché."));
});

module.exports = { adminMailCampaign, mailCampaignTick, newsletterUnsub, _t: { tickCore, build, cleanList, unsubCore, PER_RUN, DAILY_CAP } };
