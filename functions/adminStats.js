"use strict";
/**
 * Statistiques du back-office (onglet « Statistiques »). Tout est calculé par des agrégations Firestore
 * (count / sum) : une agrégation coûte 1 lecture par tranche de 1 000 documents comptés, donc le tableau de bord
 * tient à 50 000 habitants sans charger un seul compte dans le navigateur. Résultat mis en cache 5 minutes
 * (config/adminStats) pour que plusieurs admins ou rafraîchissements ne multiplient pas le coût.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, Timestamp, AggregateField } = require("firebase-admin/firestore");
const { parisDay, ADMIN_EMAILS } = require("./lib");
const INTERESTS = require("./interests");
const { HUB_CITIES } = require("./cityZones")._t;

const db = () => getFirestore();
const DAY = 86400000;
const CACHE_MS = 5 * 60 * 1000;
const SERIES_DAYS = 30;
const AGES = ["16-17", "18-24", "25-34", "35-49", "50-64", "65+"];

const count = async (q) => { try { return (await q.count().get()).data().count; } catch (e) { return null; } };
const sum = async (q, field) => { try { return (await q.aggregate({ s: AggregateField.sum(field) }).get()).data().s || 0; } catch (e) { return null; } };

// Minuit (heure de Paris) du jour `day` (AAAA-MM-JJ), en millisecondes.
function parisMidnight(day) {
  const guess = Date.parse(day + "T00:00:00Z");
  const off = (ms) => { const p = new Date(ms).toLocaleString("sv-SE", { timeZone: "Europe/Paris" }).replace(" ", "T"); return Date.parse(p + "Z") - ms; };
  return guess - off(guess);
}
const between = (col, field, a, b) => db().collection(col).where(field, ">=", Timestamp.fromMillis(a)).where(field, "<", Timestamp.fromMillis(b));

async function computeStats(now = Date.now()) {
  const users = db().collection("users"), merchants = db().collection("merchants"), answers = db().collection("answers");
  const campaigns = db().collection("campaigns"), redemptions = db().collection("redemptions");
  const today = parisDay(now), dayOf = (n) => parisDay(now - n * DAY);
  const days = Array.from({ length: SERIES_DAYS }, (_, i) => dayOf(SERIES_DAYS - 1 - i));
  const starts = days.map(parisMidnight), end = parisMidnight(parisDay(now + DAY));

  const [totals, active, series, cities, ages, interests, topSnap, notifSnap] = await Promise.all([
    (async () => {
      const [users_, verified, pending, campActive, answers_, flagged, redPending, redUsed, push, streak3, streak7, points, redAll] = await Promise.all([
        count(users), count(merchants.where("status", "==", "verified")), count(merchants.where("status", "==", "pending")),
        count(campaigns.where("status", "==", "active")), count(answers), count(answers.where("flagged", "==", true)),
        count(redemptions.where("status", "==", "pending")), count(redemptions.where("status", "==", "used")),
        count(users.where("pushEnabled", "==", true)), count(users.where("streak", ">=", 3)), count(users.where("streak", ">=", 7)),
        sum(users, "points"), count(redemptions),
      ]);
      return { users: users_, merchantsVerified: verified, merchantsPending: pending, campaignsActive: campActive, answers: answers_,
        answersFlagged: flagged, redemptionsPending: redPending, redemptionsUsed: redUsed, redemptions: redAll, pushEnabled: push, streak3, streak7, pointsHeld: points };
    })(),
    (async () => {
      const [d1, d7, d30] = await Promise.all([
        count(users.where("dailyAnswerDate", "==", today)),
        count(users.where("lastAnswerDate", ">=", dayOf(6))),
        count(users.where("lastAnswerDate", ">=", dayOf(29))),
      ]);
      return { today: d1, week: d7, month: d30 };
    })(),
    (async () => {
      const per = (col) => Promise.all(starts.map((a, i) => count(between(col, "createdAt", a, starts[i + 1] || end))));
      const [signups, answersPerDay, redPerDay] = await Promise.all([per("users"), per("answers"), per("redemptions")]);
      return { days, signups, answers: answersPerDay, redemptions: redPerDay };
    })(),
    // Toutes les villes (villes NOOVA + villes créées à l'inscription), comptées pour de vrai. Le compteur « count »
    // stocké sur chaque ville est remis à la valeur réelle : il ne redescendait pas quand des comptes étaient supprimés.
    (async () => {
      const snap = await db().collection("cities").get().catch(() => ({ docs: [] }));
      const docs = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
      const list = HUB_CITIES.map((c) => ({ slug: c.slug, label: c.label, hub: true }))
        .concat(Object.keys(docs).filter((id) => !HUB_CITIES.some((h) => h.slug === id)).map((id) => ({ slug: id, label: docs[id].label || id, hub: false })));
      const out = await Promise.all(list.map(async (c) => ({ ...c, users: await count(users.where("city", "==", c.slug)), active: docs[c.slug] ? docs[c.slug].active !== false : true })));
      await Promise.all(out.filter((c) => docs[c.slug] && c.users != null && docs[c.slug].count !== c.users)
        .map((c) => db().collection("cities").doc(c.slug).update({ count: c.users }).catch(() => {})));
      return out;
    })(),
    Promise.all(AGES.map(async (a) => ({ key: a, users: await count(users.where("ageRange", "==", a)) }))),
    Promise.all(INTERESTS.INTERESTS.map(async (i) => ({ key: i.key, label: i.label, users: await count(users.where("interests", "array-contains", i.key)) }))),
    campaigns.orderBy("answersCount", "desc").limit(200).get().catch(() => ({ docs: [] })),
    db().collection("notifMetrics").get().catch(() => ({ docs: [] })),
  ]);

  // Questions et commerces les plus répondus (sur les 200 questions qui ont le plus de réponses).
  const camps = topSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const topCampaigns = camps.slice(0, 10).map((c) => ({ id: c.id, question: c.question || c.name || "", merchant: c.merchantName || "", city: c.cityLabel || c.city || "", answers: c.answersCount || 0, target: c.targetVolume || null, status: c.status || "", isTest: !!c.isTest }));
  const byMerchant = {};
  for (const c of camps) {
    const k = c.merchantId || c.merchantName; if (!k) continue;
    const m = byMerchant[k] || (byMerchant[k] = { name: c.merchantName || "", city: c.cityLabel || c.city || "", answers: 0, questions: 0, isTest: !!c.isTest });
    m.answers += c.answersCount || 0; m.questions++;
  }
  const topMerchants = Object.values(byMerchant).sort((a, b) => b.answers - a.answers).slice(0, 10);
  const notifications = notifSnap.docs.map((d) => { const x = d.data(); return { type: d.id, sent: x.sent || 0, opened: x.opened || 0, disabled: x.deactivated || 0 }; })
    .filter((x) => x.sent > 0).sort((a, b) => b.sent - a.sent);

  return { at: now, today, totals, active, series, cities, ages, interests, topCampaigns, topMerchants, notifications };
}

const adminStats = onCall({ region: "europe-west1", timeoutSeconds: 120, memory: "512MiB" }, async (request) => {
  if (!require("./lib").isAdminRequest(request)) throw new HttpsError("permission-denied", "Réservé aux administrateurs Noova.");
  const ref = db().collection("config").doc("adminStats");
  if (!(request.data && request.data.force)) {
    const c = await ref.get();
    if (c.exists && Date.now() - (c.data().at || 0) < CACHE_MS) return c.data();
  }
  const s = await computeStats();
  await ref.set(s);
  return s;
});

module.exports = { adminStats, _t: { computeStats, parisMidnight } };
