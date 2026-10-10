"use strict";
/**
 * Ouverture automatique d'une zone (déploiement progressif dans toute la France).
 *
 * Quand un habitant s'inscrit (ou change de ville) dans une commune :
 *  - qui est déjà une zone NOOVA (une des 10 villes de départ ou une zone créée automatiquement) : rien à faire ;
 *  - à moins de 25 km d'une zone : il est rattaché à cette zone (son nom de commune reste affiché) ;
 *  - à plus de 25 km de toute zone, et reconnue par l'API officielle des communes : sa commune devient une nouvelle
 *    zone, avec 30 commerces test (un par métier, voir testMonthCatalog.js), leurs récompenses et leurs questions, qui
 *    vivent ensuite tout seuls comme ceux du mois de test (une question par jour et par commerce).
 * Garde-fous : seuls de vrais comptes habitants déclenchent la création (jamais l'appel sans connexion utilisé à
 * l'inscription), une commune inconnue de l'API ne crée rien, et au plus MAX_PER_DAY zones sont ouvertes par jour.
 */
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

const db = () => getFirestore();
const MAX_PER_DAY = 30;
const parisDay = (ms) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
const cap = (s) => String(s || "").trim().replace(/^./, (c) => c.toUpperCase()).slice(0, 60);

async function ensureZoneCore(uid, before, after, now = Date.now()) {
  if (!after || (after.role && after.role !== "user")) return { skipped: "not_user" };
  const city = String(after.city || "").toLowerCase().trim();
  if (!city || !/^[a-z0-9-]{1,60}$/.test(city)) return { skipped: "no_city" };
  if (before && String(before.city || "").toLowerCase().trim() === city) return { skipped: "unchanged" };
  const Z = require("./cityZones")._t;
  const label = cap(after.cityLabel || city);
  const r = await Z.resolveZoneCore(city, label);
  if (r.isZone) return { zone: city, existing: true };
  if (r.matched) {
    // Commune à moins de 25 km d'une zone : rattachée à cette zone (le nom saisi reste dans cityLabel).
    await db().collection("users").doc(uid).update({ city: r.slug });
    return { zone: r.slug, attached: true, km: r.km };
  }
  if (r.unknown) return { skipped: "unknown_commune" };

  // Nouvelle zone : une seule création même si plusieurs habitants de la commune s'inscrivent en même temps.
  const zoneRef = db().collection("zones").doc(city), capRef = db().collection("config").doc("autoZones");
  const day = parisDay(now);
  const ok = await db().runTransaction(async (tx) => {
    const [z, c] = await Promise.all([tx.get(zoneRef), tx.get(capRef)]);
    if (z.exists) return false;
    const n = c.exists && c.data().day === day ? c.data().count || 0 : 0;
    if (n >= MAX_PER_DAY) return "cap";
    tx.set(zoneRef, { label, auto: true, createdBy: uid, createdAt: FieldValue.serverTimestamp() });
    tx.set(capRef, { day, count: n + 1 });
    return true;
  });
  if (ok === "cap") { logger.warn("autoZones: plafond du jour atteint", { city }); return { skipped: "daily_cap" }; }
  if (!ok) return { zone: city, existing: true };
  Z.resetZonesCache();
  const res = await require("./testMonth")._t.createTestZone(city, label, now);
  logger.info("autoZones: nouvelle zone", { city, label, ...res });
  return { zone: city, created: true, ...res };
}

const ensureZone = onDocumentWritten({ document: "users/{uid}", region: "europe-west1", timeoutSeconds: 120 }, async (event) => {
  const b = event.data.before.exists ? event.data.before.data() : null, a = event.data.after.exists ? event.data.after.data() : null;
  try { await ensureZoneCore(event.params.uid, b, a); } catch (e) { logger.error("autoZones", { message: e.message }); }
});

// Habitants inscrits AVANT l'ouverture automatique des zones (ou pendant un jour où le plafond était atteint) :
// une fois par heure, chaque commune d'habitant qui n'est encore rattachée à aucune zone est traitée comme une
// nouvelle inscription. Une seule lecture de config quand tout est fait.
const BACKFILL_VERSION = 1;
async function backfillCore(now = Date.now()) {
  const cfgRef = db().collection("config").doc("autoZonesBackfill");
  const c = await cfgRef.get();
  if (c.exists && (c.data().version || 0) >= BACKFILL_VERSION) return { skipped: true };
  const Z = require("./cityZones")._t;
  const zones = new Set((await Z.allZones()).map((z) => z.slug));
  const seen = new Set();
  let done = 0, capped = false;
  for (const d of (await db().collection("users").get()).docs) {
    const u = d.data(), city = String(u.city || "").toLowerCase().trim();
    if ((u.role && u.role !== "user") || !city || zones.has(city)) continue;   // chaque habitant (rattachement individuel)
    seen.add(city);
    const r = await ensureZoneCore(d.id, null, u, now).catch((e) => ({ error: e.message }));
    if (r.skipped === "daily_cap") { capped = true; break; }
    if (r.created || r.attached) done++;
    if (r.created) zones.add(city);
  }
  if (!capped) await cfgRef.set({ version: BACKFILL_VERSION, cities: seen.size, done, at: FieldValue.serverTimestamp() });
  return { cities: seen.size, done, capped };
}
const autoZonesBackfill = onSchedule({ schedule: "every 60 minutes", region: "europe-west1", timeoutSeconds: 540, retryCount: 0 }, async () => {
  const r = await backfillCore();
  if (!r.skipped) logger.info("autoZonesBackfill", r);
});

module.exports = { ensureZone, autoZonesBackfill, _t: { ensureZoneCore, backfillCore, MAX_PER_DAY } };
