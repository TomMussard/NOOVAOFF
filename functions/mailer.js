"use strict";
/**
 * Envoi des e-mails NOOVA, sans extension Firebase (les extensions s'arrêtent le 31 mars 2027).
 *
 * Tout e-mail est un document de la collection « mail » (alertes de l'équipe, e-mails aux commerçants), au même
 * format que l'extension « Trigger Email » : { to, message: { subject, text, html } }. Cette fonction l'envoie par
 * SMTP et écrit le résultat sur le document : delivery.state = SUCCESS ou ERROR (+ error), comme l'extension, donc
 * l'admin lit le résultat de la même façon.
 *
 * Réglages (déploiement) :
 *  - SMTP_PASSWORD : secret (mot de passe d'application Gmail, ou clé SMTP Brevo), demandé une seule fois par
 *    `firebase functions:secrets:set SMTP_PASSWORD` ou au premier déploiement — jamais écrit dans le code ;
 *  - SMTP_USER, SMTP_HOST, SMTP_PORT, MAIL_FROM : valeurs par défaut pour Gmail (noovaoffr@gmail.com), modifiables
 *    dans functions/.env si l'on change de boîte d'envoi.
 * Dans l'émulateur (tests), aucun envoi réel : le message est seulement préparé et marqué SUCCESS.
 */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret, defineString } = require("firebase-functions/params");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const nodemailer = require("nodemailer");

const SMTP_PASSWORD = defineSecret("SMTP_PASSWORD");
const SMTP_USER = defineString("SMTP_USER", { default: "noovaoffr@gmail.com" });
const SMTP_HOST = defineString("SMTP_HOST", { default: "smtp.gmail.com" });
const SMTP_PORT = defineString("SMTP_PORT", { default: "465" });
const MAIL_FROM = defineString("MAIL_FROM", { default: "NOOVA <noovaoffr@gmail.com>" });

const db = () => getFirestore();
const emulator = () => process.env.FUNCTIONS_EMULATOR === "true";

let _transport = null;
function transport() {
  if (_transport) return _transport;
  if (emulator()) _transport = nodemailer.createTransport({ jsonTransport: true });
  else {
    const port = Number(SMTP_PORT.value()) || 465;
    _transport = nodemailer.createTransport({
      host: SMTP_HOST.value(), port, secure: port === 465,
      auth: { user: SMTP_USER.value(), pass: String(SMTP_PASSWORD.value() || "").replace(/\s+/g, "") },
    });
  }
  return _transport;
}

// Message d'erreur compréhensible pour l'admin, à partir des erreurs SMTP les plus courantes.
function explain(e) {
  const msg = String((e && e.message) || e || "erreur inconnue");
  if (/Application-specific password required|InvalidSecondFactor/i.test(msg)) return "Gmail demande un mot de passe d'application (16 lettres), pas le mot de passe du compte. " + msg;
  if (/Invalid login|Username and Password not accepted|BadCredentials|535/i.test(msg)) return "Identifiant ou mot de passe SMTP refusé. " + msg;
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(msg)) return "Serveur SMTP injoignable (adresse ou port). " + msg;
  return msg;
}

async function sendCore(ref, data) {
  if (!data || (data.delivery && data.delivery.state)) return { skipped: true };     // déjà traité
  const to = (Array.isArray(data.to) ? data.to : [data.to]).filter(Boolean);
  const m = data.message || {};
  if (!to.length || !m.subject) {
    await ref.update({ delivery: { state: "ERROR", error: "E-mail incomplet (destinataire ou objet manquant).", endTime: FieldValue.serverTimestamp() } });
    return { error: "incomplete" };
  }
  await ref.update({ delivery: { state: "PROCESSING", startTime: FieldValue.serverTimestamp(), attempts: 1 } });
  try {
    const info = await transport().sendMail({
      from: emulator() ? "NOOVA <test@noova.local>" : MAIL_FROM.value(),
      replyTo: data.replyTo || undefined, to, subject: String(m.subject).slice(0, 300), text: m.text || "", html: m.html || undefined,
    });
    await ref.update({ delivery: { state: "SUCCESS", attempts: 1, messageId: info.messageId || null, endTime: FieldValue.serverTimestamp() } });
    return { ok: true };
  } catch (e) {
    const error = explain(e).slice(0, 500);
    logger.warn("mailer", { id: ref.id, error });
    await ref.update({ delivery: { state: "ERROR", attempts: 1, error, endTime: FieldValue.serverTimestamp() } });
    return { error };
  }
}

const sendMail = onDocumentCreated({ document: "mail/{id}", region: "europe-west1", secrets: [SMTP_PASSWORD], retry: false }, async (event) => {
  if (!event.data) return;
  await sendCore(event.data.ref, event.data.data());
});

module.exports = { sendMail, _t: { sendCore, explain } };
