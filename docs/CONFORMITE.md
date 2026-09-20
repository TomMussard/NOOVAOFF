# Conformité (RGPD / cookies / LCEN / accessibilité) — état au 20 septembre 2026

> Ce document est un état des lieux technique, **pas un avis juridique**. Les pages légales publiées
> (confidentialité, cookies, CGU, mentions légales, accessibilité) sont des textes rédigés à partir du
> fonctionnement réel de l'application : elles doivent être relues par un avocat ou un DPO avant lancement.

## 1. Ce qui est en place dans le code

| Sujet | Ce qui a été fait | Vérifié par |
|---|---|---|
| Consentement aux cookies | `consent.js` : bandeau « Refuser / Accepter » identiques, sans réponse = refus, pas de « cookie wall », choix mémorisé 6 mois, retrait via « Gérer mes cookies » (pied de page, Profil de l'app, page Cookies), suppression des cookies `_ga*` au refus | `tests/eng14.js` |
| Mesure d'audience | Google Analytics 4 (landing) et Firebase Analytics (app) ne se chargent **qu'après « Accepter »** ; l'ancienne balise GA en dur dans l'app est supprimée (double comptage) ; signaux publicitaires Google désactivés ; cookies limités à 13 mois | `tests/eng14.js` |
| Minimisation | Présence « en ligne » (écriture toutes les 60 s dans le profil) supprimée + nettoyage des anciens champs `online`/`lastSeen` ; appel `dns.google` (le domaine de l'e-mail était envoyé à Google) supprimé ; Google Fonts, unpkg et jsDelivr remplacés par des fichiers auto-hébergés (`fonts/`, `vendor/`) : plus aucune IP envoyée à ces tiers | `tests/eng14.js` |
| Pages légales | `cookies.html`, `mentions-legales.html`, `accessibilite.html` (nouvelles) ; `confidentialite.html` et `cgu.html` réécrites (bases légales, sous-traitants, liste d'attente, mineurs, notes internes retirées) ; liens depuis la landing, l'app (connexion + Profil) et le dashboard | `tests/eng14.js` |
| Accessibilité | `alt` sur toutes les images (statiques et générées en JS), icônes SVG décoratives en `aria-hidden`, lien d'évitement, `<main>`, zoom autorisé (plus de `user-scalable=no`), `prefers-reduced-motion`, boutons FAQ `aria-expanded`, champs étiquetés, tableaux défilants accessibles au clavier | `tests/a11y_audit.js` (axe-core, WCAG 2.x A/AA) |
| Contrastes | Règle `color-contrast` désormais **active** dans l'audit (elle était ignorée) ; teintes de texte corrigées : app (`--ink2`, `--ink3`), dashboard/admin (`--ink2`, `--ink3`, nouveaux `--coral-text`, `--mint-text`, `--red-text`, texte sombre sur boutons orange), landing | `tests/a11y_audit.js` |
| Agents IA / SEO | `robots.txt` (assistants IA nommés, dashboard/admin exclus), `sitemap.xml`, `llms.txt`, JSON-LD (WebSite, Organization, WebApplication, FAQPage), canonical/OpenGraph sur `https://www.noovaoff.fr`, `noindex` sur dashboard/admin (meta + en-tête) | `tests/eng14.js` |
| En-têtes de sécurité | `vercel.json` : nosniff, Referrer-Policy, X-Frame-Options, Permissions-Policy | `tests/eng14.js` |

## 2. À FAIRE AVANT DE METTRE EN LIGNE (bloquant — je ne peux pas l'inventer)

Les champs en surbrillance jaune dans les pages publiques sont des trous à remplir :

- **Mentions légales** (`mentions-legales.html`) — obligatoires (LCEN, art. 6-III) : dénomination sociale (ou nom/prénom si personne physique), forme juridique et capital, SIREN/SIRET + RCS (ou « en cours d'immatriculation »), adresse du siège, téléphone, directeur de la publication, entité contractante Google (adresse indiquée dans votre console Google Cloud).
- **Politique de confidentialité** — éditeur (renvoie aux mentions légales), **durée de conservation des adresses de la liste d'attente**, **région du projet Supabase**, et le rôle de la **ville** (statistiques agrégées reçues : sous-traitant ou responsable conjoint ?).
- **CGU** — le paragraphe des NOOVS échangeables contre de l'argent contient encore un champ à préciser (seuils, identité, coordonnées bancaires, fiscalité, règlement de concours).

## 3. À vérifier dans les consoles (je n'y ai pas accès)

- **Google Analytics** (deux flux : `G-6M20ZMJBX8` landing, `G-3E6ZPKLY64` app) : *Admin → Collecte de données → Conservation* = 2 ou 14 mois (jamais plus) ; **Google Signals désactivé** ; partage des données avec Google/produits publicitaires désactivé ; accepter les conditions de traitement des données. Après mise en ligne, accepter le bandeau et contrôler dans les outils de développement que les cookies `_ga*` ne dépassent pas 13 mois pour **l'app** (la limite est configurée par code pour la landing ; côté app elle est demandée à l'API `gtag` mais je n'ai pas pu la vérifier en conditions réelles).
- **Supabase** (table `subscribers`) : région du projet ; règles RLS = `INSERT` seul pour la clé publique (aucune lecture publique) ; procédure pour supprimer une adresse sur demande et purger après la durée annoncée ; contrat de traitement (DPA) signé.
- **Firebase Storage** : région du bucket `noova-366d0.firebasestorage.app` (photos de profil, logos) — non vérifiable en ligne de commande ; à indiquer dans la politique de confidentialité si hors UE. La base Firestore est bien en `eur3` (vérifié).
- **Vercel / Google Cloud** : contrats de traitement des données (DPA) acceptés.

## 4. Points juridiques à faire trancher (avocat / DPO)

Reprend les notes internes retirées des pages publiques, plus les nouveaux points :

1. Partage des réponses aux amis **activé par défaut** (désactivable) : faut-il un consentement explicite à l'inscription ?
2. Durée de conservation des journaux de notifications et des sauvegardes (14 jours annoncés).
3. Transferts hors UE (Google, Vercel, Supabase) : garanties contractuelles à confirmer.
4. **Mineurs de 16–17 ans** : la tranche existe dans l'app ; les pages disent « 16 ans et plus » (au-dessus de la majorité numérique de 15 ans en France) — à valider, notamment pour le contrat.
5. **NOOVS échangeables contre de l'argent / concours / bons** : nature juridique (monnaie de jeu, loterie ou jeu concours, monnaie électronique), coordonnées bancaires, pièce d'identité, fiscalité. Les points sont décrits comme sans valeur monétaire, les NOOVS non.
6. **Rôle de la ville** acheteuse : quelles données/statistiques reçoit-elle et avec quel statut ?
7. **Affirmations publicitaires de la landing** (pratiques commerciales trompeuses, C. conso L121-2) : « **312 personnes déjà inscrites** » (chiffre écrit en dur dans la page — doit être exact ou retiré), « bonus de bienvenue pour les 500 premiers inscrits » (conditions à définir et à tenir), « un peu de **cashback** » (voir point 5).
8. Registre des traitements (art. 30 RGPD) et procédure de réponse aux demandes de droits (30 jours) : à formaliser ; désignation d'un DPO non obligatoire a priori mais à examiner.
9. Médiation de la consommation (C. conso L612-1) : à examiner si des contrats sont conclus avec des consommateurs.
10. Modération des commentaires du fil (statut d'hébergeur de contenus, procédure de signalement).

## 5. Pas fait volontairement

- **Content-Security-Policy** : le code utilise beaucoup de scripts et styles en ligne ; une CSP mal réglée casserait l'app. À faire dans un second temps, en mode « report-only » d'abord.
- **Audit RGAA complet** par un tiers, tests avec de vraies personnes utilisant un lecteur d'écran (VoiceOver / NVDA) et test sous Safari : l'audit automatique (axe-core) ne détecte qu'une partie des défauts. La page Accessibilité l'annonce honnêtement (« non évalué »).
- Alternative textuelle des graphiques du dashboard commerçant, carte Leaflet utilisable au lecteur d'écran : listées comme limites connues.
