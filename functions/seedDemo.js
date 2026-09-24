/**
 * seedDemo.js — création ponctuelle de comptes habitants de démo, réalistes, basés au Mans,
 * pour une présentation (investisseurs / mairie). Réservé aux comptes admin (voir ADMIN_EMAILS,
 * même garde que adminCreateNoovaCampaign) — déclenché depuis le panneau admin, jamais côté client.
 * À retirer après la démo si les comptes ne sont plus utiles (voir noova_deploy_state).
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { ADMIN_EMAILS } = require("./lib");
const db = getFirestore();

const NAMES = [
  "Camille Dubois", "Lucas Martin", "Chloé Bernard", "Hugo Petit", "Manon Rousseau",
  "Louis Fontaine", "Léa Girard", "Nathan Morel", "Emma Lambert", "Théo Faure",
  "Sarah Bonnet", "Maxime Roux", "Julie Vincent", "Antoine Blanc", "Inès Mercier",
];
const CATS = ["restauration", "boulangerie", "sport", "beaute", "culture", "commerce", "services"];
const pick = (arr, n) => { const c = [...arr]; const out = []; while (out.length < n && c.length) out.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]); return out; };
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

exports.adminSeedDemoUsers = onCall({ region: "europe-west1", timeoutSeconds: 120 }, async (request) => {
  const email = request.auth && request.auth.token && request.auth.token.email;
  if (!email || !ADMIN_EMAILS.includes(email)) {
    throw new HttpsError("permission-denied", "Réservé aux administrateurs Noova.");
  }
  const merchSnap = await db.collection("merchants").where("status", "==", "verified").where("city", "==", "le-mans").get();
  const merchants = merchSnap.docs.map((d) => d.id);
  const campSnap = await db.collection("campaigns").where("status", "==", "active").where("targetCity", "==", "le-mans").get();
  const campaigns = campSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const mcqCampaigns = campaigns.filter((c) => {
    const qs = Array.isArray(c.questions) && c.questions.length ? c.questions : [{ format: c.format, options: c.options }];
    return (qs[0].format || c.format) === "mcq" && Array.isArray(qs[0].options || c.options) && (qs[0].options || c.options).length;
  });

  const created = [];
  const auth = getAuth();
  for (let i = 0; i < NAMES.length; i++) {
    const name = NAMES[i];
    const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, "").split(" ").join(".");
    const demoEmail = `${slug}.demo@noovaoff.fr`;
    let uid;
    try {
      const existing = await auth.getUserByEmail(demoEmail);
      uid = existing.uid;
    } catch (e) {
      const u = await auth.createUser({ email: demoEmail, password: "Demo2026!", displayName: name });
      uid = u.uid;
    }
    const myMerchants = merchants.length ? pick(merchants, Math.min(merchants.length, rint(2, Math.min(5, merchants.length)))) : [];
    await db.doc("users/" + uid).set({
      role: "user", welcomeClaimed: true, name, city: "le-mans", cityLabel: "Le Mans",
      authorizedMerchants: myMerchants, declinedMerchants: [], friendUids: [],
      answeredCampaigns: [], points: rint(40, 620), xp: rint(40, 620), streak: rint(0, 9),
      interests: pick(CATS, rint(2, 3)), onboardingStep: "done", seenHomeTour: true,
      photoUrl: null, createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    created.push({ uid, name, email: demoEmail });
  }

  // Amis réciproques : un petit réseau, pas un graphe complet (plus réaliste pour la démo).
  const batch1 = db.batch();
  created.forEach((u, i) => {
    const others = created.filter((_, j) => j !== i).map((x) => x.uid);
    const friends = pick(others, rint(2, 4));
    batch1.set(db.doc("users/" + u.uid), { friendUids: FieldValue.arrayUnion(...friends) }, { merge: true });
    friends.forEach((f) => batch1.set(db.doc("users/" + f), { friendUids: FieldValue.arrayUnion(u.uid) }, { merge: true }));
  });
  await batch1.commit();

  // Quelques réponses réelles sur les vraies campagnes MCQ actives du Mans, pour que reveal/résultats
  // affichent de vrais chiffres pendant la démo plutôt qu'un état vide.
  let answersWritten = 0;
  for (const camp of mcqCampaigns.slice(0, 3)) {
    const qs = Array.isArray(camp.questions) && camp.questions.length ? camp.questions : [{ format: camp.format, options: camp.options }];
    const opts = qs[0].options || camp.options || [];
    if (!opts.length) continue;
    const answerers = pick(created, rint(5, Math.min(10, created.length)));
    let n = 0; const counts = {};
    const batch2 = db.batch();
    for (const u of answerers) {
      const idx = Math.floor(Math.random() * opts.length);
      batch2.set(db.doc(`answers/${u.uid}_${camp.id}_q0`), {
        campaignId: camp.id, userId: u.uid, merchantId: camp.merchantId || null, questionIdx: 0,
        brand: camp.merchantName || "", question: (camp.question || qs[0].q || "").toString().slice(0, 120),
        answer: opts[idx], pointsAwarded: 20, noovsAwarded: 0, noovsWithheld: null,
        qualityScore: 1, flagged: false, responseMs: 6000, suspect: false,
        optionIdx: idx, respondentAge: "", respondentCity: "le-mans", respondentInterests: [],
        discovery: false, createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      batch2.set(db.doc("users/" + u.uid), { answeredCampaigns: FieldValue.arrayUnion(camp.id) }, { merge: true });
      counts[idx] = (counts[idx] || 0) + 1; n++;
    }
    batch2.set(db.doc("campaignStats/" + camp.id), { q0: { n: FieldValue.increment(n), c: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, FieldValue.increment(v)])) } }, { merge: true });
    batch2.set(db.doc("campaigns/" + camp.id), { answersCount: FieldValue.increment(n), responsesCount: FieldValue.increment(n) }, { merge: true });
    await batch2.commit();
    answersWritten += n;
  }

  return { created: created.map((c) => ({ name: c.name, email: c.email })), merchantsFound: merchants.length, campaignsFound: campaigns.length, answersWritten };
});
