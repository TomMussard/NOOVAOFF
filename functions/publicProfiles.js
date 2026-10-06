"use strict";
/**
 * Copies publiques réduites, tenues à jour par le serveur (RGPD : minimisation des données).
 *
 * La fiche complète d'un habitant (users/{uid} : e-mail, tranche d'âge, centres d'intérêt, appareils, points…) et celle
 * d'un commerçant (merchants/{uid} : e-mail, téléphone, nom du gérant, SIRET, pièce d'identité…) ne sont lisibles que par
 * leur propriétaire et l'admin. Les autres comptes ne lisent que ces copies, limitées au strict nécessaire :
 *  - cityBoard/{uid}      : classement et groupes de la ville (nom, photo, XP, série, groupes, ville) ;
 *  - publicProfiles/{uid} : profil vu par ses amis réciproques (nom, photo, XP, série, partage des réponses) ;
 *  - merchantsPublic/{uid}: vitrine d'un commerce vérifié (nom, secteur, ville, adresse, description, logo, photo…).
 * Un champ absent de ces listes n'est jamais copié : ajouter un champ privé à une fiche ne l'expose pas.
 */
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const db = () => getFirestore();
const pick = (src, keys) => { const o = {}; keys.forEach((k) => { if (src[k] !== undefined) o[k] = src[k]; }); return o; };
const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : null);

function boardOf(u) {
  if (!u || (u.role && u.role !== "user") || !u.city) return null;
  return {
    name: str(u.name, 40) || "Anonyme", photoUrl: str(u.photoUrl, 600), xp: Number(u.xp) || 0, streak: Number(u.streak) || 0,
    groups: Array.isArray(u.groups) ? u.groups.filter((g) => typeof g === "string").slice(0, 20) : [], city: String(u.city).toLowerCase(),
  };
}
function profileOf(u) {
  if (!u || (u.role && u.role !== "user")) return null;
  return { name: str(u.name, 40) || "Ami", photoUrl: str(u.photoUrl, 600), xp: Number(u.xp) || 0, streak: Number(u.streak) || 0, shareAnswers: u.shareAnswers !== false };
}
const MERCHANT_PUBLIC = ["brandName", "name", "sector", "theme", "city", "cityLabel", "address", "description", "website", "logoUrl", "coverUrl", "status", "broadcast", "isTest", "lat", "lng", "createdAt"];
function merchantOf(m) {
  if (!m || m.status !== "verified") return null;      // seuls les commerces vérifiés ont une vitrine publique
  return pick(m, MERCHANT_PUBLIC);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function mirror(ref, before, after) {
  if (!after) { await ref.delete().catch(() => {}); return "deleted"; }
  if (before && same(before, after)) return "unchanged";
  await ref.set({ ...after, updatedAt: FieldValue.serverTimestamp() });
  return "written";
}

async function syncUser(uid, before, after) {
  await Promise.all([
    mirror(db().collection("cityBoard").doc(uid), boardOf(before), boardOf(after)),
    mirror(db().collection("publicProfiles").doc(uid), profileOf(before), profileOf(after)),
  ]);
}
async function syncMerchant(mid, before, after) {
  await mirror(db().collection("merchantsPublic").doc(mid), merchantOf(before), merchantOf(after));
}

const syncUserPublic = onDocumentWritten({ document: "users/{uid}", region: "europe-west1" }, async (event) => {
  const b = event.data.before.exists ? event.data.before.data() : null, a = event.data.after.exists ? event.data.after.data() : null;
  await syncUser(event.params.uid, b, a);
});
const syncMerchantPublic = onDocumentWritten({ document: "merchants/{mid}", region: "europe-west1" }, async (event) => {
  const b = event.data.before.exists ? event.data.before.data() : null, a = event.data.after.exists ? event.data.after.data() : null;
  await syncMerchant(event.params.mid, b, a);
});

// Remplissage initial (comptes existants avant cette mise à jour) : appelé une fois par l'admin. Reprend tout, sans risque.
async function backfill() {
  let users = 0, merchants = 0;
  for (const d of (await db().collection("users").get()).docs) { await syncUser(d.id, null, d.data()); users++; }
  for (const d of (await db().collection("merchants").get()).docs) { await syncMerchant(d.id, null, d.data()); merchants++; }
  await db().collection("config").doc("publicProfiles").set({ version: 1, users, merchants, at: FieldValue.serverTimestamp() });
  return { users, merchants };
}
const adminSyncPublic = onCall({ region: "europe-west1", timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
  if (!require("./lib").isAdminRequest(request)) throw new HttpsError("permission-denied", "Réservé aux administrateurs Noova.");
  if (request.data && request.data.ifNeeded) {
    const c = await db().collection("config").doc("publicProfiles").get();
    if (c.exists && (c.data().version || 0) >= 1) return { skipped: true };
  }
  return backfill();
});

// Remplissage automatique juste après le déploiement : toutes les 10 minutes, une seule lecture tant que c'est fait ;
// la première fois, recopie tous les comptes existants (plus besoin d'ouvrir l'admin).
async function backfillIfNeeded() {
  const c = await db().collection("config").doc("publicProfiles").get();
  if (c.exists && (c.data().version || 0) >= 1) return { skipped: true };
  return backfill();
}
const publicProfilesAutoSync = onSchedule({ schedule: "every 10 minutes", region: "europe-west1", timeoutSeconds: 540, memory: "512MiB", retryCount: 0 }, async () => {
  await backfillIfNeeded();
});

module.exports = { syncUserPublic, syncMerchantPublic, adminSyncPublic, publicProfilesAutoSync, _t: { backfillIfNeeded, boardOf, profileOf, merchantOf, backfill, MERCHANT_PUBLIC } };
