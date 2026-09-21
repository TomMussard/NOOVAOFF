"use strict";
/**
 * Migration des données vers le nouveau système de points (à lancer UNE fois, avant de déployer règles + fonctions,
 * ou juste après : les deux ordres sont sans danger).
 *
 *   Simulation (n'écrit rien, affiche ce qui serait fait) :  node scripts/migrate-points.js
 *   Application :                                            node scripts/migrate-points.js --apply
 *
 * Identifiants : GOOGLE_APPLICATION_CREDENTIALS (clé de compte de service du projet noova-366d0), ou
 * FIRESTORE_EMULATOR_HOST pour l'émulateur. Sans --apply, aucune écriture.
 *
 * Ce que fait la migration :
 *  1. Récompenses : un document par palier, à l'identifiant {merchantId}_p{1..5}. Le contenu (intitulé, icône) est conservé,
 *     le coût devient celui du palier (functions/tiers.js), les anciens champs (valueEuros, stock, perUserLimit, purchaseCondition,
 *     expiresAt) disparaissent. Chaque récompense repasse « en attente » : le commerçant doit confirmer que le prix carte est dans
 *     la fourchette de son palier (elle n'a jamais été saisie ainsi), puis l'admin la valide. Les bons déjà émis restent valables.
 *  2. Habitants : welcomeClaimed = true (pas de bonus de bienvenue rétroactif), lastActivityAt = maintenant (les 6 mois
 *     d'expiration démarrent à la migration, personne ne perd ses points le jour du déploiement), answeredMerchants reconstitué
 *     depuis les réponses (pas de bonus découverte pour un commerçant déjà répondu).
 *  3. Commerçants : pointsGenerated (somme des points des réponses reçues) et pointsSpent (somme des bons émis).
 */
const path = require("path");
const TIERS = require("../functions/tiers");

function adminDeps() {
  const base = path.join(__dirname, "..", "functions", "node_modules");
  const { initializeApp, getApps } = require(path.join(base, "firebase-admin", "lib", "app"));
  const { getFirestore, FieldValue, Timestamp } = require(path.join(base, "firebase-admin", "lib", "firestore"));
  return { initializeApp, getApps, getFirestore, FieldValue, Timestamp };
}

async function migrate(db, { apply = false, FieldValue, log = console.log } = {}) {
  const stats = { rewardsMoved: 0, rewardsSkipped: 0, usersUpdated: 0, merchantsUpdated: 0 };
  let batch = db.batch(), n = 0;
  const flush = async (force) => { if (apply && (force || n >= 400) && n > 0) { await batch.commit(); batch = db.batch(); n = 0; } };
  const write = async (fn) => { if (apply) { fn(batch); n++; await flush(false); } };

  // ── 1. Récompenses ──
  const rewards = await db.collection("rewards").get();
  const byMerchant = new Map();
  rewards.forEach((d) => { const r = d.data(); if (!r.merchantId) { stats.rewardsSkipped++; return; } (byMerchant.get(r.merchantId) || byMerchant.set(r.merchantId, []).get(r.merchantId)).push({ id: d.id, ref: d.ref, r }); });
  for (const [mid, list] of byMerchant) {
    // Palier : déjà migré (identifiant conforme) sinon `slot` s'il est valide et libre, sinon 1er palier libre par coût croissant.
    const taken = new Set();
    const plan = [];
    for (const it of list) if (it.id === `${mid}_p${it.r.tier}` && it.r.tier >= 1 && it.r.tier <= 5) { taken.add(it.r.tier); }
    const todo = list.filter((it) => !(it.id === `${mid}_p${it.r.tier}` && it.r.tier >= 1 && it.r.tier <= 5)).sort((a, b) => (a.r.slot || 9) - (b.r.slot || 9) || (a.r.cost || 0) - (b.r.cost || 0));
    for (const it of todo) {
      let t = Number.isInteger(it.r.slot) && it.r.slot >= 1 && it.r.slot <= 5 && !taken.has(it.r.slot) ? it.r.slot : null;
      if (t === null) t = [1, 2, 3, 4, 5].find((x) => !taken.has(x)) || null;
      if (t === null) { stats.rewardsSkipped++; log(`  ! ${mid} : plus de palier libre pour « ${it.r.label} » (${it.id}) — laissée telle quelle, à supprimer à la main`); continue; }
      taken.add(t);
      plan.push({ it, tier: t });
    }
    for (const { it, tier } of plan) {
      const r = it.r, tp = TIERS.find((x) => x.n === tier);
      const ref = db.collection("rewards").doc(`${mid}_p${tier}`);
      const doc = {
        merchantId: mid, merchantName: r.merchantName || "", city: r.city || "",
        tier, slot: tier, cost: tp.pts,
        label: r.label || "Récompense", icon: r.icon || null, priceConfirmed: false,
        monthlyQuota: Number.isInteger(r.stock) && r.stock >= 1 ? Math.min(r.stock, 1000) : 20,
        timeSlots: [], withPurchase: false, minPurchase: null,
        status: "pending", active: false, approved: false,
        redeemedCount: r.redeemedCount || 0,
        createdAt: r.createdAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      };
      log(`  récompense ${it.id} → ${ref.id} (palier ${tier}, ${tp.pts} pts, en attente de validation) « ${doc.label} »`);
      await write((b) => { b.set(ref, doc); if (it.ref.path !== ref.path) b.delete(it.ref); });
      stats.rewardsMoved++;
    }
  }

  // ── Réponses : merchants vus par habitant + points générés par commerçant ──
  const seen = new Map(), generated = new Map();
  const answers = await db.collection("answers").get();
  answers.forEach((d) => {
    const a = d.data();
    if (a.userId && a.merchantId && !a.flagged) (seen.get(a.userId) || seen.set(a.userId, new Set()).get(a.userId)).add(a.merchantId);
    if (a.merchantId) generated.set(a.merchantId, (generated.get(a.merchantId) || 0) + (a.pointsAwarded || 0));
  });
  const spent = new Map();
  (await db.collection("redemptions").get()).forEach((d) => { const r = d.data(); if (r.merchantId) spent.set(r.merchantId, (spent.get(r.merchantId) || 0) + (r.cost || 0)); });

  // ── 2. Habitants ──
  const users = await db.collection("users").get();
  for (const d of users.docs) {
    const u = d.data();
    if (u.role === "merchant") continue;
    const upd = {};
    if (u.welcomeClaimed === undefined) upd.welcomeClaimed = true;
    if (!u.lastActivityAt) upd.lastActivityAt = FieldValue.serverTimestamp();
    if (!Array.isArray(u.answeredMerchants)) upd.answeredMerchants = [...(seen.get(d.id) || [])];
    if (!Object.keys(upd).length) continue;
    await write((b) => b.update(d.ref, upd));
    stats.usersUpdated++;
  }

  // ── 3. Commerçants ──
  const merchants = await db.collection("merchants").get();
  for (const d of merchants.docs) {
    const upd = { pointsGenerated: generated.get(d.id) || 0, pointsSpent: spent.get(d.id) || 0 };
    await write((b) => b.update(d.ref, upd));
    stats.merchantsUpdated++;
  }
  await flush(true);
  log(`${apply ? "APPLIQUÉ" : "SIMULATION (rien n'a été écrit)"} : ${stats.rewardsMoved} récompense(s) migrée(s), ${stats.rewardsSkipped} ignorée(s), ${stats.usersUpdated} habitant(s), ${stats.merchantsUpdated} commerçant(s).`);
  return stats;
}

module.exports = { migrate };

if (require.main === module) {
  const { initializeApp, getApps, getFirestore, FieldValue } = adminDeps();
  if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT || "noova-366d0" });
  migrate(getFirestore(), { apply: process.argv.includes("--apply"), FieldValue }).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
}
