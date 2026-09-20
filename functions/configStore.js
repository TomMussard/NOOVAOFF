"use strict";
/**
 * Réglages d'engagement modifiables SANS redéployer : l'admin change quelques seuils depuis son
 * tableau de bord (document appConfig/engagement, illisible et non modifiable côté client).
 * Seules les clés listées dans TUNABLE, dans leurs bornes, sont acceptées. Le barème de points et les
 * seuils anti-fraude ne sont volontairement PAS modifiables ici.
 * Les valeurs par défaut restent celles de engagementConfig.js.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const CFG = require("./engagementConfig");
const { ADMIN_EMAILS } = require("./lib");

const db = () => getFirestore();

const TUNABLE = {
  "REVEAL.MIN_ANSWERS":               { min: 2, max: 50, int: true, label: "Reveal : réponses minimum avant d'afficher les pourcentages" },
  "COMPAT.MIN_COMMON":                { min: 2, max: 30, int: true, label: "Compatibilité : questions en commun minimum" },
  "COMPAT.MIN_COMMON_PER_CATEGORY":   { min: 1, max: 20, int: true, label: "Compatibilité : questions en commun minimum par catégorie" },
  "PREDICTION.MIN_ANSWERS":           { min: 5, max: 200, int: true, label: "Prédiction : réponses minimum sur la question" },
  "PREDICTION.PROBABILITY":           { min: 0, max: 1, int: false, label: "Prédiction : probabilité d'être proposée (0 à 1)" },
  "PREDICTION.MAX_PER_ROLLING_WEEK":  { min: 0, max: 14, int: true, label: "Prédiction : maximum par semaine glissante" },
  "PREDICTION.MAX_PER_DAY":           { min: 0, max: 3, int: true, label: "Prédiction : maximum par jour" },
  "NOOVS.DAILY_CAP":                  { min: 1, max: 500, int: true, label: "NOOVS : plafond par jour et par habitant" },
  "NOOVS.MIN_RESPONSE_MS":            { min: 0, max: 15000, int: true, label: "NOOVS : temps de réponse minimum en ms (0 = désactivé)" },
  "NOOVS.PENDING_DAYS":               { min: 0, max: 30, int: true, label: "NOOVS : jours de validation avant utilisation" },
  "COMMUNITY.MIN_PULSE":              { min: 1, max: 100, int: true, label: "Communauté : réponses de la ville avant d'afficher les chiffres" },
  "QUOTA.DEFAULT_MONTHLY_QUESTIONS":  { min: 1, max: 500, int: true, label: "Quota par défaut : questions par mois et par commerçant" },
  "IMPACT.NOTIFY_GAP_DAYS":           { min: 1, max: 90, int: true, label: "Actualités : jours entre deux actualités notifiées d'un même commerce" },
};
const split = (k) => k.split(".");
const DEFAULTS = {};
Object.keys(TUNABLE).forEach((k) => { const [g, n] = split(k); DEFAULTS[k] = CFG[g][n]; });

const valid = (k, v) => {
  const b = TUNABLE[k];
  return b && typeof v === "number" && isFinite(v) && v >= b.min && v <= b.max && (!b.int || Number.isInteger(v));
};

let loadedAt = 0;
const TTL = () => (process.env.FUNCTIONS_EMULATOR === "true" ? 500 : 60000);

// Applique les réglages enregistrés sur l'objet CFG partagé (défauts pour toute clé absente ou invalide).
async function applyOverrides(force) {
  if (!force && Date.now() - loadedAt < TTL()) return;
  loadedAt = Date.now();
  let saved = {};
  try { saved = (await db().collection("appConfig").doc("engagement").get()).data() || {}; } catch (e) { saved = {}; }
  Object.keys(TUNABLE).forEach((k) => {
    const [g, n] = split(k);
    const v = saved[g] && saved[g][n];
    CFG[g][n] = valid(k, v) ? v : DEFAULTS[k];
  });
}

function effective() {
  const out = {};
  Object.keys(TUNABLE).forEach((k) => { const [g, n] = split(k); out[k] = CFG[g][n]; });
  return out;
}
function assertAdmin(request) {
  const email = request.auth && request.auth.token && request.auth.token.email;
  if (!email || !ADMIN_EMAILS.includes(email)) throw new HttpsError("permission-denied", "Réservé aux administrateurs Noova.");
  return email;
}

const getEngagementConfig = onCall(async (request) => {
  assertAdmin(request);
  await applyOverrides(true);
  return { values: effective(), defaults: DEFAULTS, bounds: TUNABLE };
});

// values : { "REVEAL.MIN_ANSWERS": 3, ... } ; une clé à null revient à la valeur par défaut.
const setEngagementConfig = onCall(async (request) => {
  const email = assertAdmin(request);
  const values = (request.data && request.data.values) || {};
  const doc = {};
  for (const [k, v] of Object.entries(values)) {
    if (!TUNABLE[k]) throw new HttpsError("invalid-argument", `Réglage inconnu : ${k}`);
    if (v === null) continue;
    if (!valid(k, v)) throw new HttpsError("invalid-argument", `Valeur invalide pour « ${TUNABLE[k].label} » (entre ${TUNABLE[k].min} et ${TUNABLE[k].max}${TUNABLE[k].int ? ", entier" : ""}).`);
    const [g, n] = split(k);
    (doc[g] = doc[g] || {})[n] = v;
  }
  await db().collection("appConfig").doc("engagement").set({ ...doc, updatedAt: FieldValue.serverTimestamp(), updatedBy: email });
  await applyOverrides(true);
  return { values: effective() };
});

module.exports = { getEngagementConfig, setEngagementConfig, _t: { applyOverrides, TUNABLE, DEFAULTS, effective } };
