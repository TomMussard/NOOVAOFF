# NOOVA — Brief technique pour Claude Code

> **Comment utiliser ce fichier :** place-le à la racine de ton repo, ouvre Claude Code dans VS Code et écris :
> *« Lis `NOOVA_SPEC.md` en entier. Avant d'écrire une seule ligne, fais l'audit demandé en Phase 0 et propose-moi le plan + le modèle de données. On valide, puis tu codes phase par phase. »*

---

## 1. Ton rôle

Tu es un développeur fullstack. Ta mission : transformer NOOVA, aujourd'hui **statique** (interfaces HTML/CSS finies mais remplies de fausses données d'exemple), en une application **100 % fonctionnelle**, où l'app utilisateur et le dashboard commerçant sont reliés par une vraie base de données. **Tu ne touches pas au design** : toute l'interface visuelle est validée, tu la conserves à l'identique et tu la « branches » derrière.

---

## 2. Le produit NOOVA

NOOVA est une app **hyperlocale** de feedback commerçant. Deux interfaces :

- **App utilisateur** (`app.html` — c'est le prototype actuel) : les habitants répondent aux questions des commerces **de leur ville**, gagnent des points, les échangent contre des récompenses.
- **Dashboard commerçant** (`dashboard.html`) : les commerçants s'inscrivent, se font vérifier, créent des campagnes de questions ciblées et consultent les réponses.

**Règle absolue du produit : tout est cloisonné par ville.** Un utilisateur ne voit **que** les questions de commerçants de **sa** ville. C'est le cœur du concept, ça ne doit jamais fuiter entre villes.

---

## 3. Stack & choix d'architecture (imposés)

- **Front** : HTML/CSS existant + JavaScript en **modules ES natifs** (`<script type="module">`). **Pas de framework, pas de bundler** au départ (les fichiers doivent pouvoir être servis en statique). Si tu juges Vite nécessaire plus tard, propose-le d'abord, ne l'impose pas.
- **Backend / base de données** : **Firebase** — Authentication (Email/Password + Google), **Cloud Firestore**, Storage (pour les logos, optionnel).
- **Firebase SDK v10 modular**, importé depuis le CDN gstatic (`https://www.gstatic.com/firebasejs/...`).
- **Hébergement** : **Vercel** (statique). **Domaine** : **OVH** (DNS pointant vers Vercel).
- Les **clés Firebase Web** (`apiKey`, etc.) sont **publiques par nature** : les mettre dans `src/firebase/config.js` est acceptable. La sécurité réelle est assurée par les **règles Firestore**, pas par le secret des clés. **Aucune clé admin / service account ne doit jamais être committée.**

---

## 4. Règles d'or (non négociables)

1. **Zéro donnée statique.** Supprime TOUS les tableaux d'exemple codés en dur dans le HTML actuel (ex. `BD`, `QS`, `FEED`, `BRANDPROFILE`, `GIFTS`, `BRANDMETA`, etc.). Tout vient de Firestore.
2. **Conserver le design pixel-perfect.** Tu n'ajoutes que de la logique JS et du câblage. Tu ne modifies pas le HTML/CSS visuel.
3. **Cloisonnement par ville strict**, partout.
4. **États vides obligatoires.** S'il n'y a aucun commerçant / aucune campagne dans la ville de l'utilisateur → écran vide propre (« Aucune question dans ta ville pour l'instant »). Dashboard sans campagne → état vide avec CTA. **Jamais de faux exemples pour « remplir ».**
5. **Requêtes rangées.** Toutes les requêtes Firestore sont centralisées dans des **modules dédiés par collection** (`users.js`, `merchants.js`, `campaigns.js`, `responses.js`…). **Aucune requête Firestore écrite en vrac dans le code d'interface.** Nommage cohérent, fonctions courtes, une responsabilité par fichier.
6. **Gestion d'erreurs + chargement** systématique (spinner/skeleton pendant les requêtes, messages d'erreur clairs).
7. **Commentaires en français**, code lisible.

---

## 5. Arborescence cible du projet

```
noova/
├── public/                        # tout ce qui est servi en statique (Vercel)
│   ├── index.html                 # page d'accueil / redirection (choix app vs pro)
│   ├── app/
│   │   └── index.html             # app utilisateur (= le prototype actuel)
│   ├── dashboard/
│   │   └── index.html             # dashboard commerçant
│   └── assets/                    # css, images, polices, logo
│
├── src/
│   ├── firebase/
│   │   ├── config.js              # init Firebase (clés web publiques)
│   │   ├── auth.js                # login / signup / logout / rôle courant
│   │   ├── users.js               # profil utilisateur + onboarding
│   │   ├── merchants.js           # commerçants + vérification 24h
│   │   ├── campaigns.js           # campagnes + règle "max 3 questions"
│   │   ├── responses.js           # soumission réponses + points (transaction)
│   │   ├── rewards.js             # récompenses + échanges
│   │   └── community.js           # feed communauté + classement ville
│   │
│   ├── app/                       # logique de l'app utilisateur
│   │   ├── onboarding.js          # étape 2 (intérêts) + étape 3 (établissements)
│   │   ├── feed.js                # question du jour + file, filtrées par ville
│   │   ├── answer.js              # câblage de la réponse aux écrans existants
│   │   ├── wallet.js              # points + récompenses
│   │   └── community.js
│   │
│   └── dashboard/                 # logique du dashboard commerçant
│       ├── merchant-onboarding.js # inscription + état "en attente 24h"
│       ├── campaign-create.js     # formulaire campagne (ville, âge, volume, ≤3 questions)
│       ├── analytics.js           # agrégation des réponses + avancement du volume
│       └── pricing.js             # calcul tarifaire (placeholder)
│
├── firestore.rules                # règles de sécurité
├── firestore.indexes.json         # index composites
├── vercel.json                    # rewrites /app et /dashboard
├── .gitignore                     # ignore .env, service-account, node_modules…
└── README.md                      # setup Firebase + déploiement Vercel + DNS OVH
```

> Adapte les noms si mes fichiers réels diffèrent (`app.html`, `dashboard.html`). Confirme-moi la correspondance en Phase 0.

---

## 6. Modèle de données Firestore

Toutes les villes sont stockées en **slug normalisé** (minuscules, sans accents, tirets) : `"le-mans"`, `"angers"`. Toujours matcher sur le slug, jamais sur le libellé.

### `users/{uid}`
```
role: "user"
email, displayName
city: "le-mans"          // slug
cityLabel: "Le Mans"
ageRange: "25-34"        // ex : 18-24 / 25-34 / 35-44 / 45-54 / 55+
interests: ["restauration","cafe-boulangerie", ...]   // slugs de thèmes (étape 2)
authorizedMerchants: ["merchantId1", ...]             // établissements autorisés (étape 3)
points: 0
onboardingStep: "interests" | "merchants" | "done"
streak: 0
lastDailyDate: null      // date (YYYY-MM-DD) de la dernière "question du jour" répondue
createdAt, updatedAt
```

### `merchants/{merchantId}`  (utilise `merchantId = ownerUid`)
```
role: "merchant"
ownerUid
name, email
theme: "restauration"    // catégorie/slug
city: "le-mans"          // slug
cityLabel, address
logoUrl (optionnel)
status: "pending" | "verified" | "rejected"
submittedAt              // sert au délai de 24h
verifiedAt (optionnel)
createdAt, updatedAt
```

### `campaigns/{campaignId}`
```
merchantId, merchantName, merchantTheme
city: "le-mans"          // recopié depuis le commerçant
cityLabel
ageRanges: ["18-24","25-34"]     // ciblage renseigné par le commerçant
targetVolume: 100                // nb de réponses souhaité
status: "active" | "paused" | "completed" | "draft"
questions: [                     // MAX 3 éléments
  { qid, type: "mcq"|"scale"|"rank", text, options?, items?, points }
]
responsesCount: 0                // incrémenté à chaque réponse
estimatedPrice: null             // rempli plus tard par pricing.js
createdAt, updatedAt
```

### `responses/{responseId}`
> **Id déterministe** = `` `${userId}_${campaignId}_${qid}` `` pour empêcher toute double réponse.
```
userId, userCity
campaignId, merchantId, qid
type, value              // la réponse (selon le type)
points
answeredAt
```

### `rewards/{rewardId}`
```
merchantId, merchantName, city
label, cost (points), icon
active: true
```

### `redemptions/{redemptionId}`
```
userId, rewardId, merchantId, cost, code, status, redeemedAt
```

### `communityEvents/{eventId}`  (le feed communauté, généré à partir du réel)
```
type: "answer" | "badge" | "rank"
userId, displayName, city
merchantId?, text
createdAt
```

### `cities/{slug}`  (référentiel, pour peupler les menus et garder un matching cohérent)
```
label, country, active
```

### Index composites à créer (`firestore.indexes.json`)
- `campaigns` : `city` + `status`
- `responses` : `userId` + `campaignId`
- `communityEvents` : `city` + `createdAt` (desc)
- `users` : `city` + `points` (desc) — classement ville
- `rewards` : `city` + `active`

---

## 7. Règles de sécurité Firestore (à écrire dans `firestore.rules`)

Principe : les clés web sont publiques, **les règles sont la seule barrière**. À implémenter :

- `users/{uid}` : lecture/écriture **uniquement** si `request.auth.uid == uid`.
- `merchants/{id}` : **lecture** autorisée si `status == "verified"` (pour que les users listent/autorisent les commerces de leur ville) **ou** si `request.auth.uid == ownerUid`. **Écriture** réservée au propriétaire (`ownerUid`).
- `campaigns/{id}` : **lecture** si `status == "active"` (le filtrage ville se fait côté requête). **Création/écriture** réservée au commerçant propriétaire, **avec validation** : `questions.size() <= 3`, `city == merchant.city`, `status` valide.
- `responses/{id}` : **création** si `request.auth.uid == request.resource.data.userId` (l'id déterministe bloque les doublons). **Lecture** si l'utilisateur est l'auteur **ou** le commerçant propriétaire de `merchantId` (pour ses stats).
- `rewards/{id}` : lecture si `active == true`, écriture par le commerçant propriétaire.
- `redemptions/{id}` : création par l'utilisateur concerné ; lecture par l'utilisateur et le commerçant concerné.
- `communityEvents/{id}` : lecture par tout utilisateur connecté (le filtre ville se fait à la requête), création par un utilisateur pour lui-même.

---

## 8. Flux fonctionnels à implémenter

### 8.1 Authentification & rôles
- Signup depuis **`app.html`** → crée un doc `users/{uid}` (`role: "user"`).
- Signup depuis **`dashboard.html`** → crée un doc `merchants/{uid}` (`role: "merchant"`, `status: "pending"`, `submittedAt: now`).
- Au login, détecter le rôle (dans quelle collection vit le uid) et router vers la bonne interface.
- Le login utilisateur **fonctionne déjà visuellement** : branche-le sur Firebase Auth sans casser l'écran.

### 8.2 Onboarding utilisateur
- **Étape 2 — Intérêts** : l'utilisateur choisit ses thèmes → `users.interests`. (Le bouton « tout sélectionner » existe déjà, garde-le.)
- **Étape 3 — Établissements autorisés** : afficher les commerçants **`verified` de sa ville** (filtrés éventuellement par ses intérêts) → il en autorise → `users.authorizedMerchants`. (Le bouton « tout autoriser » existe déjà.)
- Cette liste reste **modifiable plus tard** (nouveaux commerçants qui arrivent dans la ville).
- Marque `onboardingStep` à chaque étape ; à la fin `"done"`.

### 8.3 Question du jour + file de réponses (app utilisateur)
Un campaign/question est **éligible** pour un utilisateur si **TOUTES** ces conditions sont vraies :
1. `campaign.city === user.city` **(obligatoire)**
2. `campaign.status === "active"` et le commerçant est `verified`
3. `user.ageRange` ∈ `campaign.ageRanges`
4. `campaign.merchantId` ∈ `user.authorizedMerchants`
5. la question n'a **pas déjà** été répondue (`responses/{userId_campaignId_qid}` inexistant)
6. `campaign.responsesCount < campaign.targetVolume` (sinon la campagne est pleine)

- **Question du jour** : parmi les questions éligibles non répondues, en mettre **une** en avant par jour calendaire. L'utilisateur y répond, puis peut **« répondre à plus »** : les autres questions éligibles (mêmes règles, même ville) défilent.
- Un commerçant pose **au maximum 3 questions** (par campagne) : c'est déjà borné à la création, respecte-le côté affichage.

### 8.4 Répondre & points
- À la soumission : créer le doc `responses/...` (id déterministe), **incrémenter `users.points` et `campaigns.responsesCount` dans une transaction Firestore** (atomique).
- Mettre à jour `streak` / `lastDailyDate` si c'était la question du jour.
- Réutiliser l'écran de récompense/confettis existant, mais avec les **vrais** points.

### 8.5 Récompenses (wallet)
- Le catalogue vient de `rewards` (commerçants de la ville). Garde l'UI actuelle.
- Échange : vérifier `points >= cost`, **déduire les points + créer une `redemption` + générer un code**, le tout en transaction. Afficher le code.

### 8.6 Communauté (finir le « static »)
- Le feed communauté doit être **réel** : requête `communityEvents` où `city == user.city`, triés par date.
- Générer un `communityEvent` à chaque réponse (« X a répondu à une question de [commerce] »), badge de récompense, changement de classement.
- **Classement de la ville** : `users` où `city == user.city`, triés par `points` desc (top N).
- Supprime tout le feed d'exemple codé en dur.

### 8.7 Dashboard — inscription commerçant & vérification 24h
- Après signup : `status: "pending"`, `submittedAt: now`.
- Le dashboard affiche un **état « en attente de vérification (24h) »** tant que `status !== "verified"` (avec un compte à rebours indicatif basé sur `submittedAt`).
- Passage à `verified` :
  - **MVP** : vérification manuelle (toi via la console Firestore, ou un petit script admin) **ou** déverrouillage automatique après 24h.
  - **Prod recommandée** : Cloud Function planifiée qui passe les `pending` de plus de 24h à `verified`. Signale-moi si tu l'ajoutes (nécessite le plan Blaze).
- Une fois `verified`, le dashboard est accessible mais **vide** (aucune fausse donnée) jusqu'à ce que le commerçant crée une campagne.

### 8.8 Dashboard — création de campagne
Formulaire (réutilise l'UI existante) qui renseigne :
- **ville** (par défaut celle du commerçant, non modifiable pour rester cohérent),
- **tranche(s) d'âge** ciblée(s),
- **volume de réponses** souhaité,
- **1 à 3 questions** (types `mcq` / `scale` / `rank`), **borné à 3**.

À la validation → doc `campaigns` avec `status: "active"`. Ces champs (ville + âge + volume) serviront plus tard au **tarif** : stocke-les proprement.

### 8.9 Diffusion & connexion app ↔ dashboard
- Dès qu'une campagne `active` est créée, elle **apparaît automatiquement** dans l'app des utilisateurs **de la même ville** qui satisfont les règles d'éligibilité (§8.3). C'est LE test de bout en bout à réussir.

### 8.10 Analytics commerçant
- Le commerçant voit, par campagne : nb de réponses / `targetVolume` (barre d'avancement), répartition des réponses par question, et la liste des réponses (agrégées, sans exposer d'infos perso au-delà du nécessaire).

### 8.11 Tarification (placeholder)
- `pricing.js` : une fonction `estimatePrice({ city, ageRanges, volume })` qui renvoie une valeur stub (formule simple à ajuster plus tard), stockée dans `campaign.estimatedPrice`. Ne pas surinvestir maintenant.

---

## 9. États vides & chargement (rappel, c'est critique)
- Aucun écran ne doit afficher de fausse donnée « pour faire joli ».
- Partout : **état de chargement** (skeleton/spinner) → puis **données réelles** OU **état vide explicite**.
- App sans commerçant/campagne dans la ville → écran vierge et message clair.
- Dashboard sans campagne → écran vierge + CTA « Crée ta première campagne ».

---

## 10. Déploiement

### Firebase
1. Créer le projet Firebase, région Firestore **europe (`eur3`)**.
2. Activer Auth : **Email/Password** + **Google**.
3. Créer Firestore en **mode production**, déployer `firestore.rules` et `firestore.indexes.json`.
4. Renseigner la config web dans `src/firebase/config.js`.
5. **Authorized domains** (Auth → Settings) : ajouter `localhost`, le domaine `*.vercel.app` et le domaine OVH final.

### Vercel
- Importer le repo, preset **« Other »** (statique), racine = `public/`.
- `vercel.json` : rewrites pour servir `/app` → `public/app/index.html` et `/dashboard` → `public/dashboard/index.html`.
- Ajouter le domaine personnalisé dans **Settings → Domains**.

### OVH (DNS)
- Dans la zone DNS OVH, créer les enregistrements **exactement avec les valeurs que Vercel affiche** dans Settings → Domains (en général un `A` sur `@` et un `CNAME` sur `www`). **Ne pas deviner d'IP** : recopie celles fournies par Vercel.
- Documente la procédure dans le `README.md`.

---

## 11. Plan de travail (procède phase par phase, en committant à chaque étape)

- **Phase 0 — Audit (AVANT DE CODER).** Lis `app.html` et `dashboard.html`. Liste : tous les écrans, tous les tableaux de données statiques à remplacer, et la correspondance avec les collections. Propose le modèle de données + l'arborescence. **Attends ma validation.**
- **Phase 1** — Scaffolding + `config.js` + `auth.js`. Brancher login/signup (user & merchant) sur Firebase, routage par rôle.
- **Phase 2** — Onboarding utilisateur (étapes 2 & 3) → Firestore.
- **Phase 3** — Signup commerçant + état « attente 24h » + dashboard vide.
- **Phase 4** — Création de campagne (ville, âge, volume, ≤3 questions).
- **Phase 5** — Feed utilisateur : question du jour + file, filtrage §8.3, réponse + points (transaction).
- **Phase 6** — Récompenses + échanges.
- **Phase 7** — Communauté réelle + classement ville.
- **Phase 8** — Analytics commerçant + pricing placeholder.
- **Phase 9** — Règles de sécurité + index + polissage des états vides/chargement.
- **Phase 10** — `vercel.json` + `README.md` (setup Firebase, déploiement Vercel, DNS OVH).

À chaque phase : **ne casse pas le design**, teste, et fais un commit clair.

---

## 12. Definition of Done
- [ ] Plus **aucune** donnée statique/exemple : tout vient de Firestore.
- [ ] App et dashboard **reliés** : une campagne créée dans le dashboard apparaît chez les utilisateurs de **la même ville** qui remplissent les critères.
- [ ] **Cloisonnement par ville** strict, jamais de fuite.
- [ ] Onboarding utilisateur (intérêts + établissements autorisés) fonctionnel.
- [ ] Question du jour + file de réponses + points cumulés + récompenses fonctionnels.
- [ ] Commerçant : signup → attente 24h → vérifié → dashboard vide → création campagne (≤3 questions) → analytics.
- [ ] Communauté et classement pilotés par des données réelles.
- [ ] États vides et de chargement partout.
- [ ] Requêtes centralisées par module, arborescence propre, code commenté en français.
- [ ] Règles de sécurité + index en place ; aucun secret committé.
- [ ] Déployable sur Vercel avec Firebase, procédure DNS OVH documentée.

---

## 13. Points à me confirmer en Phase 0
1. Noms réels des fichiers (`app.html` / `dashboard.html` ?) et où est le proto actuel.
2. « 3 questions max » = **par campagne** (mon hypothèse) ou par commerçant au total ?
3. Vérification 24h : automatique (Cloud Function, plan Blaze) ou manuelle pour le MVP ?
4. Un utilisateur ne voit que les campagnes des commerçants qu'il a **explicitement autorisés** (mon hypothèse), ou aussi celles qui matchent ses **intérêts** même sans autorisation ?
