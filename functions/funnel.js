"use strict";
/**
 * Compteur du parcours d'entrée (onglet Statistiques de l'admin) : combien de personnes ouvrent l'app, regardent la
 * présentation, répondent aux questions d'essai, ouvrent l'inscription et créent leur compte. Sert à savoir où les
 * gens décrochent.
 *
 *  - trackFunnel : appelé par l'app, sans compte. Ne reçoit QUE le nom de l'étape (aucun identifiant, aucune donnée
 *    personnelle) ; l'app ne l'envoie qu'une fois par étape et par visite, sans rien stocker sur l'appareil.
 *  - Comptes créés : comptés côté serveur à la création de la fiche habitant (toutes méthodes : e-mail, Google, Apple).
 *  - funnelDaily/{AAAA-MM-JJ} et funnelDaily/total : { open: 12, demo_1: 5, … } ; lus par l'admin.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const db = () => getFirestore();
const STEPS = ["open", "onboard_2", "demo_start", "demo_1", "demo_2", "demo_3", "signup_open", "signup_done"];
const CLIENT_STEPS = STEPS.filter((s) => s !== "signup_done");
const parisDay = (ms) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

async function bump(step, now = Date.now()) {
  const inc = { [step]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() };
  const b = db().batch();
  b.set(db().collection("funnelDaily").doc(parisDay(now)), inc, { merge: true });
  b.set(db().collection("funnelDaily").doc("total"), inc, { merge: true });
  await b.commit();
}

const trackFunnel = onCall({ region: "europe-west1", maxInstances: 5 }, async (request) => {
  const step = String((request.data || {}).step || "");
  if (!CLIENT_STEPS.includes(step)) throw new HttpsError("invalid-argument", "Étape inconnue.");
  await bump(step);
  return { ok: true };
});

const funnelSignup = onDocumentCreated({ document: "users/{uid}", region: "europe-west1" }, async (event) => {
  const u = event.data && event.data.data();
  if (!u || (u.role && u.role !== "user") || u.isTest || u.isDemo) return;
  await bump("signup_done");
});

// Erreurs d'inscription / de connexion vues par les habitants (retour : « des personnes ont des messages d'erreur ») :
// code d'erreur, étape et type d'appareil seulement — jamais l'e-mail ni le mot de passe. Lues dans l'admin (Statistiques).
const ERR_WHERE = ["register", "login", "google", "apple", "profile", "reset"];
const logClientError = onCall({ region: "europe-west1", maxInstances: 5 }, async (request) => {
  const d = request.data || {};
  const where = ERR_WHERE.includes(d.where) ? d.where : "other";
  const code = String(d.code || "inconnu").replace(/[^a-z0-9/_.-]/gi, "").slice(0, 60) || "inconnu";
  const device = ["android", "ios", "desktop"].includes(d.device) ? d.device : "autre";
  await db().collection("clientErrors").add({ where, code, device, inApp: !!d.inApp, standalone: !!d.standalone, day: parisDay(Date.now()), at: FieldValue.serverTimestamp() });
  return { ok: true };
});

module.exports = { trackFunnel, funnelSignup, logClientError, _t: { bump, STEPS } };
