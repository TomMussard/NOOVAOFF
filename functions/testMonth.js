"use strict";
/**
 * Mois de test — 45 commerces FICTIFS (9 villes × café, coiffeur, fleuriste, supérette, bar) qui posent chacun
 * 3 questions par semaine (lundi, mercredi, vendredi à 9h), en totale autonomie, pour faire vivre l'app pendant la
 * phase de test sans aucune vraie entreprise.
 *
 *  - adminSetupTestMonth : (admin) supprime, si demandé ET confirmé, les commerces réels ; crée ou met à jour les
 *    commerces fictifs et leurs vitrines ; ouvre les 9 villes ; active le pilote ; pose une première question.
 *  - adminStopTestMonth : (admin) arrête le pilote ; peut aussi masquer les commerces fictifs et clore leurs questions.
 *  - testMonthAutopilot : chaque lundi, mercredi et vendredi, une nouvelle question par commerce fictif.
 *
 * Tout le reste est le fonctionnement normal de NOOVA : notifications, question du jour, points, séries, classement,
 * réponses visibles dans le dashboard (via l'admin). Chaque document porte isTest: true (étiquette « Commerce test »
 * côté app, bon d'échange marqué « test, sans valeur »).
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const logger = require("firebase-functions/logger");
const { ADMIN_EMAILS } = require("./lib");
const TIERS = require("./tiers");

const db = () => getFirestore();
const DAY = 86400000;
const QUESTION_DAYS = 7;          // une question reste ouverte une semaine
const CONFIG_REF = () => db().collection("config").doc("testMonth");

const CITIES = [
  { slug: "le-mans", label: "Le Mans" }, { slug: "angers", label: "Angers" }, { slug: "paris", label: "Paris" },
  { slug: "nantes", label: "Nantes" }, { slug: "bordeaux", label: "Bordeaux" }, { slug: "marseille", label: "Marseille" },
  { slug: "toulouse", label: "Toulouse" }, { slug: "lille", label: "Lille" }, { slug: "dijon", label: "Dijon" },
];

// Noms inventés (un par ville, même ordre que CITIES). L'étiquette « Commerce test » lève toute ambiguïté.
const TYPES = {
  cafe: {
    sector: "Café", emoji: "☕", interest: "restauration",
    names: ["Café Tilleul & Cie", "La Tasse Vagabonde", "Café Hirondelle", "Le Moulin à Café Bleu", "Café Boussole", "La Théière Rousse", "Café Nuage d'Ambre", "Le Comptoir Filament", "Café Pistache Lunaire"],
    desc: "Café de quartier : torréfaction maison, pâtisseries du matin et brunch le week-end.",
    rewards: ["Café offert", "Viennoiserie et café", "Petit-déjeuner complet", "Brunch pour une personne", "Brunch pour deux"],
  },
  coiffeur: {
    sector: "Coiffeur", emoji: "✂️", interest: "beaute",
    names: ["Ciseaux d'Argile", "Peigne & Plume", "Studio Boucle Douce", "La Frange Céleste", "Mèche & Miel", "Salon Brin de Soie", "Les Ciseaux Voyageurs", "Coiff' Comète", "L'Atelier Mèche Folle"],
    desc: "Salon de coiffure mixte : coupes, couleurs et soins, avec ou sans rendez-vous.",
    rewards: ["Shampoing soin offert", "Brushing offert", "Coupe offerte", "Coupe et soin", "Coloration offerte"],
  },
  fleuriste: {
    sector: "Fleuriste", emoji: "💐", interest: "commerce",
    names: ["Pétale Funambule", "Fleur de Brume", "L'Herbier Joyeux", "Bouquet Boréal", "La Tige Rêveuse", "Corolle & Compagnie", "Les Pivoines Pressées", "Graine d'Étoile", "Les Jardins de Mirabelle"],
    desc: "Fleuriste : bouquets de saison, plantes et compositions pour toutes les occasions.",
    rewards: ["Une fleur offerte", "Petit bouquet", "Plante verte", "Bouquet de saison", "Grande composition"],
  },
  superette: {
    sector: "Supérette", emoji: "🛒", interest: "commerce",
    names: ["Le Cabas Malin", "Supérette Bon Voisin", "Le Petit Panier Rond", "Marché Express Noisette", "L'Épicerie des Lilas Bleus", "Proxi Tournesol", "Le Panier du Quartier Nova", "Supérette Le Comptoir Vert", "Épicerie Petit Marché Lune"],
    desc: "Supérette de proximité : produits du quotidien, fruits et légumes, ouverte tard.",
    rewards: ["Boisson fraîche offerte", "Panier goûter", "Sac de courses du quotidien", "Panier de produits locaux", "Grand panier gourmand"],
  },
  bar: {
    sector: "Bar", emoji: "🍹", interest: "restauration",
    names: ["Le Zinc Rêveur", "Le Comptoir des Lucioles", "Le Héron Bleu", "Le Quai des Hiboux", "Le Petit Phare", "Le Tonneau Céleste", "Le Bar à Coulisses", "La Lanterne Douce", "Le Mélusine Bar"],
    desc: "Bar de quartier : planches à partager, soirées à thème et cocktails sans alcool.",
    // Loi Évin : aucune récompense ne met l'alcool en avant.
    rewards: ["Cocktail sans alcool offert", "Planche apéro", "Deux boissons sans alcool", "Planche et deux boissons sans alcool", "Planche géante pour quatre"],
  },
};

// Banque de questions par métier (15 chacune : 4 semaines × 3 sans répétition, avec de la marge).
const BANK = {
  cafe: [
    ["À quelle heure aimerais-tu qu'on ouvre le matin ?", ["7h", "7h30", "8h", "Peu importe"]],
    ["Tu viendrais pour un brunch le dimanche ?", ["Oui, sûrement", "Peut-être", "Non"]],
    ["Quel lait préfères-tu dans ton café ?", ["Lait de vache", "Avoine", "Amande", "Sans lait"]],
    ["Qu'est-ce qui te ferait venir plus souvent ?", ["Une carte de fidélité", "Plus de places assises", "Le wifi", "Des pâtisseries maison"]],
    ["Tu prends plutôt ton café sur place ou à emporter ?", ["Sur place", "À emporter", "Ça dépend"]],
    ["Quelle viennoiserie manque le plus à notre comptoir ?", ["Pain aux raisins", "Chausson aux pommes", "Brioche", "Croissant aux amandes"]],
    ["Un café de spécialité à 3,50 €, ça te paraît…", ["Raisonnable", "Un peu cher", "Trop cher"]],
    ["Tu aimerais une formule déjeuner le midi ?", ["Oui, salée", "Oui, sucrée", "Non"]],
    ["Quel moment de la journée tu viens le plus ?", ["Le matin", "Le midi", "L'après-midi", "Le week-end"]],
    ["Tu serais partant pour un atelier dégustation de cafés ?", ["Oui", "Peut-être", "Non"]],
    ["Quelle boisson chaude on devrait ajouter ?", ["Chaï latte", "Matcha", "Chocolat épicé", "Golden latte"]],
    ["Tu préfères une ambiance plutôt…", ["Calme pour travailler", "Animée", "Musique douce"]],
    ["Tu apporterais ta propre tasse contre une petite réduction ?", ["Oui", "Peut-être", "Non"]],
    ["Quelle option sans gluten t'intéresserait ?", ["Cookies", "Cake", "Pain", "Aucune"]],
    ["Tu voudrais pouvoir commander à l'avance depuis ton téléphone ?", ["Oui", "Peut-être", "Non"]],
  ],
  coiffeur: [
    ["Tu préfères prendre rendez-vous ou passer sans rendez-vous ?", ["Rendez-vous", "Sans rendez-vous", "Les deux"]],
    ["Quel créneau t'arrange le mieux ?", ["Tôt le matin", "Pause déjeuner", "Après 18h", "Le samedi"]],
    ["Tu changes de coupe à quelle fréquence ?", ["Tous les mois", "Tous les 2-3 mois", "Deux fois par an", "Rarement"]],
    ["Quel service aimerais-tu qu'on propose ?", ["Barbe", "Soins du cuir chevelu", "Coiffure de soirée", "Conseil couleur"]],
    ["Une coupe à 25 €, ça te paraît…", ["Raisonnable", "Un peu cher", "Trop cher"]],
    ["Tu serais intéressé par une coupe express de 15 minutes ?", ["Oui", "Peut-être", "Non"]],
    ["Qu'est-ce qui compte le plus pour toi chez un coiffeur ?", ["Le prix", "Le résultat", "L'accueil", "La rapidité"]],
    ["Tu aimerais des produits naturels ou bio pour tes soins ?", ["Oui, c'est important", "Pourquoi pas", "Peu importe"]],
    ["Tu réserverais en ligne si c'était possible ?", ["Oui", "Peut-être", "Non, je préfère appeler"]],
    ["Quelle couleur tenterais-tu cet hiver ?", ["Châtain chaud", "Blond polaire", "Cuivré", "Rien, je garde ma couleur"]],
    ["Tu viendrais à un atelier « coiffer ses cheveux soi-même » ?", ["Oui", "Peut-être", "Non"]],
    ["Pour toi, la séance idéale dure…", ["Moins de 30 min", "30 min à 1 h", "Le temps qu'il faut"]],
    ["Tu prends des conseils pour entretenir ta coupe chez toi ?", ["Oui, toujours", "Parfois", "Jamais"]],
    ["Une offre étudiante te ferait venir ?", ["Oui", "Peut-être", "Je ne suis pas concerné"]],
    ["Quel jour fermerait le moins bien le salon pour toi ?", ["Lundi", "Mercredi", "Samedi", "Peu importe"]],
  ],
  fleuriste: [
    ["Tu achètes des fleurs plutôt pour…", ["Offrir", "Chez moi", "Un événement", "Rarement"]],
    ["Quelle fleur aimerais-tu voir plus souvent en boutique ?", ["Pivoines", "Renoncules", "Tulipes", "Fleurs séchées"]],
    ["Tu serais intéressé par un abonnement bouquet chaque semaine ?", ["Oui", "Peut-être", "Non"]],
    ["Un bouquet du quotidien, tu le vois à combien ?", ["Moins de 15 €", "15 à 25 €", "25 à 40 €", "Plus de 40 €"]],
    ["Tu préfères des bouquets…", ["Colorés", "Tout blancs", "Champêtres", "Graphiques"]],
    ["La livraison à domicile, ça t'intéresserait ?", ["Oui", "Peut-être", "Non"]],
    ["Tu viendrais à un atelier composition florale ?", ["Oui", "Peut-être", "Non"]],
    ["Les fleurs locales et de saison, c'est important pour toi ?", ["Très important", "Un peu", "Pas vraiment"]],
    ["Quelle plante d'intérieur te tente ?", ["Monstera", "Pothos", "Cactus", "Plante fleurie"]],
    ["Tu commanderais un bouquet en ligne pour le retirer en boutique ?", ["Oui", "Peut-être", "Non"]],
    ["Pour quelle occasion achètes-tu le plus de fleurs ?", ["Anniversaire", "Fête des mères", "Saint-Valentin", "Sans occasion"]],
    ["Tu aimerais des conseils d'entretien avec chaque plante ?", ["Oui", "Parfois", "Non"]],
    ["Un rayon de fleurs séchées, ça te plairait ?", ["Oui", "Peut-être", "Non"]],
    ["Quel horaire t'arrangerait pour passer ?", ["Avant 9h", "Le midi", "Après 19h", "Le dimanche matin"]],
    ["Tu offrirais une plante plutôt qu'un bouquet ?", ["Plutôt une plante", "Plutôt un bouquet", "Ça dépend"]],
  ],
  superette: [
    ["Jusqu'à quelle heure aimerais-tu qu'on reste ouvert ?", ["20h", "21h", "22h", "Minuit"]],
    ["Quel rayon devrait-on agrandir ?", ["Fruits et légumes", "Produits locaux", "Vrac", "Plats préparés"]],
    ["Tu fais tes courses chez nous plutôt…", ["Tous les jours", "Quelques fois par semaine", "En dépannage"]],
    ["Le vrac (pâtes, riz, céréales), tu l'utiliserais ?", ["Oui, souvent", "Parfois", "Non"]],
    ["Un service de commande à retirer en magasin, ça t'aiderait ?", ["Oui", "Peut-être", "Non"]],
    ["Qu'est-ce qui te ferait venir plus souvent ?", ["Des prix plus bas", "Plus de choix", "Des horaires plus larges", "Une carte de fidélité"]],
    ["Tu aimerais trouver du pain frais chez nous ?", ["Oui", "Peut-être", "Non"]],
    ["Quel produit local mettrais-tu en avant ?", ["Fromages", "Miel", "Œufs", "Bière artisanale"]],
    ["Tu paies plutôt…", ["Par carte", "Sans contact sur téléphone", "En espèces"]],
    ["Des paniers anti-gaspi à petit prix, ça te plairait ?", ["Oui", "Peut-être", "Non"]],
    ["Tu préfères les caisses classiques ou les caisses automatiques ?", ["Classiques", "Automatiques", "Peu importe"]],
    ["Quel jour fais-tu tes plus grosses courses ?", ["En semaine", "Le samedi", "Le dimanche"]],
    ["La livraison en vélo dans le quartier, tu l'utiliserais ?", ["Oui", "Peut-être", "Non"]],
    ["Tu aimerais plus de produits bio ?", ["Oui", "Un peu plus", "Non, ça me va"]],
    ["Un coin café en entrée de magasin, ça te tenterait ?", ["Oui", "Peut-être", "Non"]],
  ],
  bar: [
    ["Quel soir viendrais-tu le plus volontiers ?", ["Jeudi", "Vendredi", "Samedi", "En semaine"]],
    ["Quelle soirée à thème te ferait venir ?", ["Quiz", "Concert acoustique", "Jeux de société", "Karaoké"]],
    ["Tu aimerais une carte de cocktails sans alcool plus large ?", ["Oui", "Peut-être", "Non"]],
    ["Les planches à partager, tu les préfères…", ["Charcuterie", "Fromages", "Végétariennes", "Mixtes"]],
    ["Une terrasse chauffée l'hiver, ça te ferait venir ?", ["Oui", "Peut-être", "Non"]],
    ["À quelle heure aimerais-tu un « happy hour » ?", ["17h-19h", "18h-20h", "19h-21h", "Pas besoin"]],
    ["Tu préfères une ambiance…", ["Calme pour discuter", "Animée", "Avec de la musique live"]],
    ["Tu viendrais regarder les grands matchs chez nous ?", ["Oui", "Peut-être", "Non"]],
    ["Qu'est-ce qui compte le plus dans un bar ?", ["L'ambiance", "Les prix", "La carte", "L'accueil"]],
    ["Tu aimerais pouvoir réserver une table en ligne ?", ["Oui", "Peut-être", "Non"]],
    ["Un brunch le dimanche au bar, ça te plairait ?", ["Oui", "Peut-être", "Non"]],
    ["Tu viendrais à une soirée « jeux de société » en semaine ?", ["Oui", "Peut-être", "Non"]],
    ["Quelle boisson sans alcool devrait-on ajouter ?", ["Kombucha", "Limonade maison", "Thé glacé", "Bière sans alcool"]],
    ["Tu préfères commander au comptoir ou être servi à table ?", ["Au comptoir", "À table", "Peu importe"]],
    ["Jusqu'à quelle heure aimerais-tu qu'on reste ouvert le week-end ?", ["Minuit", "1h", "2h", "Peu importe"]],
  ],
};

const merchantId = (city, type) => `test_${city}_${type}`;

function isAdmin(request) {
  const email = request.auth && request.auth.token && request.auth.token.email;
  return !!email && ADMIN_EMAILS.includes(email);
}

// Supprime un commerce et tout ce qui lui est rattaché (même périmètre que adminDeleteAccount).
async function deleteMerchant(uid) {
  const [campSnap, rewSnap, redemSnap, answSnap, consentSnap, invSnap, postSnap] = await Promise.all([
    db().collection("campaigns").where("merchantId", "==", uid).get(),
    db().collection("rewards").where("merchantId", "==", uid).get(),
    db().collection("redemptions").where("merchantId", "==", uid).get(),
    db().collection("answers").where("merchantId", "==", uid).get(),
    db().collection("consentEvents").where("merchantId", "==", uid).get(),
    db().collection("invoices").where("merchantId", "==", uid).get(),
    db().collection("merchantPosts").where("merchantId", "==", uid).get(),
  ]);
  for (const d of [...campSnap.docs, ...rewSnap.docs, ...redemSnap.docs, ...answSnap.docs, ...consentSnap.docs, ...invSnap.docs, ...postSnap.docs]) await db().recursiveDelete(d.ref);
  await db().recursiveDelete(db().collection("merchants").doc(uid));
  try { await getAuth().deleteUser(uid); } catch (e) { if (e.code !== "auth/user-not-found") logger.warn("deleteMerchant auth", { uid, message: e.message }); }
}

// Crée ou met à jour les 45 commerces fictifs et leurs vitrines (idempotent : relancer ne duplique rien).
async function upsertTestMerchants() {
  let n = 0;
  for (const [ci, c] of CITIES.entries()) {
    await db().collection("cities").doc(c.slug).set({ label: c.label, active: true }, { merge: true });
    for (const [type, t] of Object.entries(TYPES)) {
      const id = merchantId(c.slug, type), name = t.names[ci];
      await db().collection("merchants").doc(id).set({
        role: "merchant", ownerUid: id, brandName: name, name, sector: t.sector, theme: t.sector,
        city: c.slug, cityLabel: c.label, address: `Centre-ville, ${c.label}`,
        description: t.desc, status: "verified", isTest: true, email: `${id}@test.noova.fr`,
        verifiedPopupShown: true, seenDashTour: true, updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      for (const tier of TIERS) {
        await db().collection("rewards").doc(`${id}_p${tier.n}`).set({
          merchantId: id, merchantName: name, city: c.slug, label: t.rewards[tier.n - 1], tier: tier.n, slot: tier.n,
          cost: tier.pts, priceConfirmed: true, monthlyQuota: 1000, timeSlots: [], withPurchase: false, minPurchase: null,
          status: "approved", active: true, approved: true, isTest: true, icon: "",
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      n++;
    }
  }
  return n;
}

// Une nouvelle question pour chaque commerce fictif (la suivante de sa banque, sans répétition).
async function postNextQuestions(now = Date.now()) {
  const snap = await db().collection("merchants").where("isTest", "==", true).where("status", "==", "verified").get();
  let created = 0;
  for (const doc of snap.docs) {
    const m = doc.data();
    const type = String(doc.id).split("_").pop();
    const t = TYPES[type], bank = BANK[type];
    if (!t || !bank) continue;
    const idx = Number(m.testQIdx) || 0;
    const [q, options] = bank[idx % bank.length];
    await db().collection("campaigns").add({
      merchantId: doc.id, merchantName: m.brandName, merchantTheme: t.sector, brandEmoji: "🏪",
      name: q.slice(0, 60), sector: t.sector, question: q,
      questions: [{ q, format: "mcq", options }], questionsSchema: 2, format: "mcq", options,
      city: m.city, cityLabel: m.cityLabel, targetCity: m.city,
      ageRanges: [], targetInterests: [],                      // ouvert à tous : portée maximale pendant le test
      pointsPerAnswer: 20, answersCount: 0, responsesCount: 0, status: "active", isTest: true,
      durationDays: QUESTION_DAYS, endsAt: Timestamp.fromMillis(now + QUESTION_DAYS * DAY),
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    await doc.ref.update({ testQIdx: idx + 1 });
    created++;
  }
  return created;
}

async function setupCore({ deleteReal = false } = {}) {
  let deleted = [];
  if (deleteReal) {
    const all = await db().collection("merchants").get();
    const real = all.docs.filter((d) => d.data().isTest !== true);
    for (const d of real) { await deleteMerchant(d.id); deleted.push(d.data().brandName || d.data().name || d.id); }
  }
  const merchants = await upsertTestMerchants();
  await CONFIG_REF().set({ active: true, startedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const questions = await postNextQuestions();
  return { deleted, merchants, questions, cities: CITIES.length };
}

async function stopCore({ hide = false } = {}) {
  await CONFIG_REF().set({ active: false, stoppedAt: FieldValue.serverTimestamp() }, { merge: true });
  let hidden = 0, closed = 0;
  if (hide) {
    const ms = await db().collection("merchants").where("isTest", "==", true).get();
    for (const d of ms.docs) { await d.ref.update({ status: "suspended" }); hidden++; }
    const cs = await db().collection("campaigns").where("isTest", "==", true).where("status", "==", "active").get();
    for (const d of cs.docs) { await d.ref.update({ status: "completed", completedReason: "test_end", completedAt: FieldValue.serverTimestamp() }); closed++; }
    const rs = await db().collection("rewards").where("isTest", "==", true).get();
    for (const d of rs.docs) await d.ref.update({ active: false });
  }
  return { hidden, closed };
}

async function autopilotCore(now = Date.now()) {
  const cfg = await CONFIG_REF().get();
  if (!cfg.exists || cfg.data().active !== true) return { skipped: true };
  return { questions: await postNextQuestions(now) };
}

const adminSetupTestMonth = onCall({ region: "europe-west1", timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
  if (!isAdmin(request)) throw new HttpsError("permission-denied", "Réservé aux administrateurs Noova.");
  const { deleteReal, confirm } = request.data || {};
  if (deleteReal && confirm !== "SUPPRIMER") throw new HttpsError("failed-precondition", "Tape SUPPRIMER pour confirmer la suppression des commerces réels.");
  const r = await setupCore({ deleteReal: !!deleteReal });
  logger.info("adminSetupTestMonth", { by: request.auth.token.email, ...r, deleted: r.deleted.length });
  return r;
});

const adminStopTestMonth = onCall({ region: "europe-west1", timeoutSeconds: 300 }, async (request) => {
  if (!isAdmin(request)) throw new HttpsError("permission-denied", "Réservé aux administrateurs Noova.");
  return stopCore({ hide: !!(request.data && request.data.hide) });
});

const testMonthAutopilot = onSchedule({ schedule: "0 9 * * 1,3,5", timeZone: "Europe/Paris", retryCount: 0, timeoutSeconds: 300 }, async () => {
  const r = await autopilotCore(Date.now());
  logger.info("testMonthAutopilot", r);
});

module.exports = { adminSetupTestMonth, adminStopTestMonth, testMonthAutopilot, _t: { setupCore, stopCore, autopilotCore, postNextQuestions, CITIES, TYPES, BANK, merchantId } };
