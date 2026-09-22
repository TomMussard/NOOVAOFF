"use strict";
/**
 * Zone de correspondance autour d'une ville NOOVA (25 km) : un habitant ou un commerçant dans une commune qui n'est
 * pas elle-même une ville NOOVA (voir HUB_CITIES ci-dessous) peut quand même être rattaché à la ville NOOVA la plus
 * proche — jamais au-delà de 25 km, et jamais si aucune ville NOOVA n'est assez proche (fail closed : mieux vaut
 * « pas encore ouvert dans ta ville » qu'une correspondance à l'autre bout de la France). Volontairement PAS basé
 * sur le champ cities/{slug}.active (fail-open ailleurs pour l'inscription — pas le bon signal ici) : la liste des
 * villes NOOVA est un choix produit explicite, tenue à jour ici à la main (à synchroniser avec NOOVA_KNOWN_CITIES
 * côté client, qui gère en plus les variantes d'écriture et la liste figée des communes de Le Mans Métropole).
 *
 * Coordonnées obtenues via l'API officielle « geo.api.gouv.fr » (gratuite, sans clé), mises en cache sur chaque
 * document cities/{slug} pour ne géocoder une commune donnée qu'une seule fois.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

const db = () => getFirestore();
const MAX_KM = 25;
const HUB_CITIES = [{ slug: "le-mans", label: "Le Mans" }, { slug: "angers", label: "Angers" }];

// Émulateur uniquement : si un document _testGeocode/{nom en minuscules} existe, on l'utilise au lieu d'appeler la
// vraie API — les tests restent déterministes et n'ont jamais besoin d'un accès réseau réel.
async function realGeocode(name) {
  const url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(name)}&fields=centre,nom&boost=population&limit=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const arr = await res.json();
  const c = arr && arr[0];
  if (!c || !c.centre || !Array.isArray(c.centre.coordinates)) return null;
  const [lng, lat] = c.centre.coordinates;
  return { lat, lng };
}
let geocodeFn = async (name) => {
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    const stub = await db().collection("_testGeocode").doc(String(name || "").toLowerCase().trim()).get();
    if (stub.exists) return stub.data();
  }
  try { return await realGeocode(name); } catch (e) { logger.warn("geocode", name, e.message); return null; }
};
function setGeocodeFn(fn) { geocodeFn = fn; }   // remplacé dans les tests unitaires (résolution pure, sans Firestore ni réseau)

function haversineKm(a, b) {
  const R = 6371, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Coordonnées d'un slug quelconque : lues en cache (cities/{slug}.lat/lng), sinon géocodées puis mises en cache.
async function coordsOf(slug, label) {
  const ref = db().collection("cities").doc(slug);
  const snap = await ref.get();
  const d = snap.exists ? snap.data() : null;
  if (d && typeof d.lat === "number" && typeof d.lng === "number") return { lat: d.lat, lng: d.lng };
  const geo = await geocodeFn(label || slug);
  if (!geo || typeof geo.lat !== "number" || typeof geo.lng !== "number") return null;
  await ref.set({ lat: geo.lat, lng: geo.lng }, { merge: true });
  return { lat: geo.lat, lng: geo.lng };
}

// Résout un slug quelconque vers la ville NOOVA la plus proche à moins de MAX_KM, s'il y en a une.
async function resolveZoneCore(rawSlug, rawLabel) {
  const hub = HUB_CITIES.find((h) => h.slug === rawSlug);
  if (hub) return { slug: rawSlug, matched: false };            // déjà une ville NOOVA elle-même : rien à faire
  const here = await coordsOf(rawSlug, rawLabel);
  if (!here) return { slug: rawSlug, matched: false };          // commune introuvable : on ne force rien (fail closed)
  let best = null;
  for (const h of HUB_CITIES) {
    const there = await coordsOf(h.slug, h.label);
    if (!there) continue;
    const km = haversineKm(here, there);
    if (km <= MAX_KM && (!best || km < best.km)) best = { slug: h.slug, km };
  }
  return best ? { slug: best.slug, matched: true, km: Math.round(best.km * 10) / 10 } : { slug: rawSlug, matched: false };
}

const resolveCityZone = onCall(async (request) => {
  const { slug, label } = request.data || {};
  if (!slug || typeof slug !== "string") throw new HttpsError("invalid-argument", "Ville invalide.");
  try {
    return await resolveZoneCore(slug, String(label || slug));
  } catch (e) {
    logger.warn("resolveCityZone", slug, e.message);
    return { slug, matched: false };   // erreur réseau ou autre : on ne bloque jamais une inscription
  }
});

module.exports = { resolveCityZone, _t: { resolveZoneCore, haversineKm, coordsOf, setGeocodeFn, MAX_KM, HUB_CITIES } };
