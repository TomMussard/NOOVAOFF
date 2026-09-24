"use strict";
/**
 * Toutes les valeurs chiffrées de l'engagement (points, temps de réponse, reveal, prédiction,
 * compatibilité, actualités) sont ICI, et nulle part ailleurs. Pour ajuster un seuil ou une
 * fréquence : modifier ce fichier puis redéployer les fonctions (`firebase deploy --only functions`).
 * Le client (app_DEF.html) n'a besoin que de MAX_ANSWERS_PER_DAY (bloc ENGAGEMENT en tête de script) ;
 * tout le reste est décidé côté serveur.
 */
module.exports = {
  // ─── Points ─── (modèle unique : 10 pts par réponse, 3 réponses par jour, aucun prix ni « valeur en € » nulle part)
  POINTS: {
    PER_ANSWER: 10,              // chaque réponse valide, quelle que soit sa position dans la campagne
    MAX_ANSWERS_PER_DAY: 3,      // seules les N premières réponses du jour rapportent des points (30 pts/jour au maximum)
    WELCOME_BONUS: 50,           // une seule fois, à l'inscription
    DISCOVERY_BONUS: 5,          // 1re réponse à un commerçant donné, 1 fois par jour au maximum
    EXPIRY_MONTHS: 6,            // les points expirent après ce délai sans aucune activité (réponse ou échange)
    NOOVS_PER_ANSWER: 1,         // au-delà du quota du jour (« mode libre ») : monnaie séparée, inchangée
  },

  // ─── Paliers de récompenses ─── (source unique : voir tiers.js)
  TIERS: require("./tiers"),

  // ─── Série (streak) ───
  // Un jour compte dans la série quand l'habitant a répondu à au moins ce nombre de questions ce jour-là (se connecter ne suffit pas).
  STREAK: { MIN_ANSWERS_PER_DAY: 3 },

  // ─── Statuts à vie (pilotés par l'xp) ─── mêmes seuils que l'app (TIERS) : sert au fil « un ami a atteint le palier… ».
  STATUS: [
    { n: "Curieux", min: 0 }, { n: "Actif", min: 1000 }, { n: "Expert", min: 3000 }, { n: "Ambassadeur", min: 6000 }, { n: "Légende", min: 10000 },
  ],

  // ─── Échanges de récompenses ───
  REWARDS: {
    EXCHANGE_LIMIT_DAYS: 7,      // une récompense par commerçant et par utilisateur sur cette durée
    VOUCHER_HOURS: 24,           // validité du bon (code à montrer en caisse)
    MAX_MIN_PURCHASE_FACTOR: 2,  // achat minimum ≤ 2 × prix carte maximum du palier
    MONTHLY_QUOTA_MAX: 1000,
  },

  // ─── Temps de réponse (mesuré côté serveur depuis beginQuestion) ───
  RESPONSE_TIME: {
    MIN_FOR_GAIN_MS: 2500,       // en dessous : réponse « flaggée » = 0 gain, quota non consommé (anti-farm)
    SUSPECT_MS: 4000,            // en dessous : réponse marquée « suspecte » (marquage seul, rien n'est exclu)
    CLIENT_LOCK_MS: 3000,        // « Valider » verrouillé côté écran (barre jaune)
  },

  // ─── Reveal (comment les autres ont répondu) ───
  REVEAL: {
    FORMATS: ["mcq"],            // formats de question concernés (choix multiple uniquement)
    MIN_ANSWERS: 1,              // pas de seuil : dès qu'il y a une réponse, le pourcentage s'affiche
    MAX_FRIENDS: 30,             // amis regardés au maximum
    COUNT_SUSPECT: true,         // les réponses « suspectes » comptent dans les pourcentages (seuil large, pour ne pas exclure un vrai lecteur rapide)
    COUNT_FLAGGED: false,        // les réponses « flaggées » (trop rapides pour avoir été lues, < MIN_FOR_GAIN_MS) N'entrent PAS dans les résultats — sinon une réponse déjà repérée comme non lue fausse quand même ce que voit le commerçant
  },

  // ─── Mode prédiction ─── (étape 3)
  PREDICTION: {
    MIN_ANSWERS: 20,             // réponses minimum sur la question pour qu'une « majorité » ait du sens
    PROBABILITY: 0.3,            // chance de proposer le mode sur une réponse éligible
    MAX_PER_ROLLING_WEEK: 4,     // par utilisateur, sur 7 jours glissants
    MAX_PER_DAY: 1,
    PENDING_MINUTES: 10,         // au-delà, une prédiction laissée sans réponse est considérée comme passée
    OFFER_HISTORY: 30,           // dernières questions proposées (évite de reproposer la même)
  },

  // ─── Compatibilité entre amis ─── (étape 2)
  COMPAT: {
    MIN_COMMON: 1,               // pas de seuil : dès qu'une question est en commun, le score s'affiche
    MIN_COMMON_PER_CATEGORY: 1,  // idem pour le détail d'une catégorie de commerce
    CACHE_MINUTES: 10,
    FORMATS: ["mcq"],            // formats comparables (un accord n'a de sens que sur un choix fermé)
    MAX_ANSWERS_SCAN: 500,       // réponses les plus récentes lues par personne
    MAX_FRIENDS: 30,
  },

  // ─── NOOVS (monnaie virtuelle) ─── bornent le coût et la fraude avant toute conversion (bons, argent…)
  NOOVS: {
    DAILY_CAP: 30,               // NOOVS maximum par jour et par habitant (les réponses restent enregistrées au-delà)
    PENDING_DAYS: 3,             // délai de validation avant qu'un NOOV soit utilisable (enregistré sur la réponse)
    MIN_RESPONSE_MS: 0,          // temps minimum (mesuré serveur) pour gagner des NOOVS ; 0 = désactivé (à monter si des abus apparaissent)
  },

  // ─── Onglet Communauté ───
  COMMUNITY: {
    STREAK_MILESTONES: [3, 7, 14, 30, 60, 100],   // séries annoncées à tes amis dans le fil
  },

  // ─── Quota de questions par commerçant ─── (pas d'abonnement : la ville offre une quantité fixe par mois)
  QUOTA: {
    DEFAULT_MONTHLY_QUESTIONS: 10,   // questions par mois et par commerçant, sauf quota propre fixé par l'admin
  },

  // ─── Impact visible ─── (étape 4)
  IMPACT: {
    MAX_TEXT: 200,               // longueur d'une actualité commerçant
    MIN_TEXT: 10,
    MAX_CAMPAIGNS_LINKED: 3,     // questions auxquelles une actualité peut être rattachée
    NOTIFY_GAP_DAYS: 14,         // au plus une actualité notifiée par commerce tous les N jours
    MAX_AUDIENCE_SCAN: 5000,     // réponses lues pour retrouver les habitants concernés
  },
};
