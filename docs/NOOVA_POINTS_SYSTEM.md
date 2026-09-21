# NOOVA — Système de points & récompenses

> **État : à jour au 21 septembre 2026.** Ce document décrit le modèle de points et de récompenses en vigueur.
> Les valeurs chiffrées vivent à **un seul endroit** : `functions/engagementConfig.js` (gains, plafonds, expiration) et `functions/tiers.js` (les 5 paliers). Le client n'affiche que ce que le serveur décide.

---

## 0. Le principe en une phrase

Répondre à une question rapporte des **points** (un solde dépensable) et de l'**XP** (le statut à vie). Les points s'échangent contre la récompense que chaque commerçant a choisie pour l'un des **5 paliers fixes** — les mêmes pour tous. Ni l'habitant ni le commerçant ne voient ou ne saisissent jamais un prix en points ou en euros qui ne soit pas un palier.

---

## 1. Les deux compteurs (inchangé)

Sur `users/{uid}` :

- **`points`** = solde dépensable (wallet). Monte quand on répond, descend quand on échange, retombe à 0 à l'expiration (§3).
- **`xp`** = expérience à vie. Monte avec les points gagnés, **ne descend jamais** (ni à l'échange, ni à l'expiration). Pilote le statut (Curieux → Légende, seuils 0 / 1 000 / 3 000 / 6 000 / 10 000).

Le solde est **universel** : utilisable chez tous les commerçants de la ville de l'habitant.

---

## 2. Gagner des points

| Source | Points | Règle |
|---|---|---|
| Réponse | **10** | Quelle que soit la question (1re, 2e ou 3e d'une campagne). |
| Plafond du jour | **3 réponses** | Seules les 3 premières réponses du jour rapportent des points : **30 pts par jour au maximum**. Au-delà, on peut répondre sans points (mode libre, NOOVS). |
| Bonus de bienvenue | **+50** | Une seule fois, à l'inscription (`welcomeClaimed`). |
| Bonus découverte | **+5** | La première fois qu'on répond à un commerçant donné, **une fois par jour au maximum** (`answeredMerchants`, `discoveryBonusDate`). |
| Expiration | — | Les points expirent après **6 mois sans aucune activité** (§3). |

Il n'y a **plus** de bonus « série complète » ni de bonus de série quotidienne : la série (`streak`) reste un simple compteur de jours d'affilée, sans points.

**Tout le crédit se fait côté serveur**, jamais côté client :

- réponse et bonus découverte → Cloud Function `submitAnswer` (transaction) ;
- bonus de bienvenue → Cloud Function `claimWelcomeBonus` (idempotente) ;
- les règles Firestore interdisent au client d'écrire `points`, `xp`, `welcomeClaimed`, `lastActivityAt`, `answeredMerchants`, `discoveryBonusDate`… (pas même pour débiter : l'échange passe aussi par une fonction, §6).

Une réponse lue trop vite (moins de 2,5 s) est « flaggée » : elle est enregistrée mais ne rapporte ni points, ni bonus découverte, et ne consomme pas le quota du jour.

Le total gagné (réponse + bonus) est aussi ajouté à `merchants/{id}.pointsGenerated` : les points générés par les questions de ce commerçant (visible dans l'admin).

---

## 3. Expiration

Chaque activité (réponse, échange, bonus de bienvenue) met à jour `users.lastActivityAt`. La fonction planifiée `expirePoints` (tous les jours à 4 h 30, heure de Paris) remet à 0 le solde `points` des comptes dont `lastActivityAt` a plus de **6 mois**, et journalise chaque expiration dans `pointsExpirations`. L'`xp` n'est jamais touché.

---

## 4. Les 5 paliers (identiques pour tous les commerçants)

Constante unique : `TIERS` dans `functions/tiers.js` (copie identique `tiers.js` à la racine pour les pages web ; les règles Firestore répètent les valeurs — un test vérifie que les trois restent identiques).

| Palier | Points | Prix carte de l'article offert |
|---|---|---|
| Palier 1 | **150 pts** | 1 à 3 € |
| Palier 2 | **300 pts** | 3 à 6 € |
| Palier 3 | **500 pts** | 6 à 10 € |
| Palier 4 | **900 pts** | 10 à 18 € |
| Palier 5 (gros lot) | **1 500 pts** | 18 à 30 € |

Les points ne sont **pas** une valeur en euros : aucune conversion n'existe, aucune n'est affichée.

---

## 5. Récompenses côté commerçant — « Ma vitrine récompenses »

- Le commerçant doit **remplir les 5 paliers** avant de lancer sa première campagne (contrôle dans le dashboard **et** dans les règles Firestore : création d'une campagne active refusée s'il manque un palier).
- Il **ne saisit jamais** ni prix ni points. Par palier, il choisit une récompense parmi des **suggestions liées à sa catégorie** (la première est pré-remplie) ou un texte libre, puis coche : « le prix carte de cet article est entre X et Y € ».
- Réglages par récompense : **quota mensuel**, **créneaux horaires** (facultatif, jusqu'à 3), option **« avec achat »** (achat minimum ≤ 2 × le prix carte maximum du palier), bouton **pause**.
- Statut : `pending` → `approved` (**seul l'admin valide**) → `paused` (le commerçant peut mettre en pause et reprendre une récompense déjà approuvée). Changer l'intitulé ou l'icône la remet en attente de validation ; les réglages (quota, créneaux, avec achat) et la pause n'en ont pas besoin.
- Il n'y a plus de « supprimer » côté commerçant (les 5 paliers doivent toujours exister) : il met en pause.
- Vocabulaire côté commerçant : on ne parle jamais de « coût » ni de « valeur » (ni d'un prix en points).

Le dashboard affiche : **clients ramenés ce mois**, **dont nouveaux clients**, **panier moyen des clients NOOVA**. Ces chiffres viennent des bons validés au comptoir (le commerçant indique le montant du panier et s'il s'agit d'un nouveau client ; avec « avec achat », le panier doit atteindre l'achat minimum).

L'admin voit, pour chaque commerçant, les **points générés par ses questions** (`pointsGenerated`) et les **points dépensés chez lui** (`pointsSpent`).

### `rewards/{merchantId}_p{1..5}`

Un document par palier, à l'identifiant imposé : jamais plus de 5 récompenses par commerçant, jamais deux fois le même palier.

```
merchantId, merchantName, city
tier (1..5), slot (= tier), cost (= points du palier, imposé par les règles)
label, icon, priceConfirmed: true
monthlyQuota (1..1000), timeSlots [{days:[0..6], from:"HH:MM", to:"HH:MM"}] (0 à 3), withPurchase, minPurchase
status: "pending" | "approved" | "paused" | "rejected", active (= approved et pas en pause)
approved (booléen réservé à l'admin), approvedAt, rejectionReason
redeemedCount, createdAt, updatedAt
rewards/{id}/monthly/{YYYY-MM} : { used }   // compteur du quota mensuel (serveur seul)
```

---

## 6. Échanger une récompense (habitant)

Côté habitant : **« Palier N · X pts »**, jamais un euro, nulle part.

L'échange est la Cloud Function `redeemReward` (le client n'écrit ni `points` ni `redemptions`). Dans **une seule transaction**, elle vérifie : récompense approuvée et active · commerçant vérifié · même ville · créneau horaire (heure de Paris) · **quota mensuel** non atteint · **une récompense par commerçant et par utilisateur sur 7 jours glissants** (`users/{uid}/redeemLimits/{merchantId}`) · **solde suffisant** (le solde ne peut jamais devenir négatif). Le coût vient toujours du palier, jamais du document de la récompense.

Elle débite les points, crée le bon (`redemptions`, code à 4 caractères valable 24 h, `status: "pending"`), incrémente le quota du mois, `redeemedCount` et `merchants.pointsSpent`.

### Validation au comptoir (dashboard)

Le commerçant saisit le code → si `pending` et non expiré → `status: "used"`, `usedAt`, plus `basketEuros` (montant du panier) et `newCustomer`. Usage unique.

### `redemptions/{id}`

```
userId, rewardId, merchantId, merchantName, city
tier, cost, label, icon, purchaseCondition (« Valable avec un achat… », sans montant côté habitant), minPurchase (côté commerçant)
code, status: "pending" | "used", createdAt, expiresAt, usedAt, basketEuros?, newCustomer?
```

---

## 7. Anti-abus

- Crédit et débit **uniquement côté serveur** ; règles Firestore : aucun champ de solde ni de compteur d'activité modifiable par le client.
- 3 réponses payées par jour, réponses lues trop vite exclues, bonus découverte 1 fois par jour.
- Une récompense par commerçant et par semaine, quota mensuel par récompense, bons à usage unique, valables 24 h.
- Un commerçant ne peut ni s'approuver, ni modifier le palier ou les points d'une récompense, ni créer plus de 5 paliers.

---

## 8. Règles Firestore (résumé)

- `users` : création avec `points = xp = noovs = 0`, `welcomeClaimed = false` ; aucune mise à jour cliente des champs de solde/activité.
- `rewards` : identifiant `{merchantId}_p{tier}`, `cost == points du palier`, `priceConfirmed`, quota 1–1000, `minPurchase ≤ 2 × prix carte max`, création toujours `pending` / `active: false` / `approved: false` ; un commerçant ne peut ni écrire `approved` ni passer de `pending` à `approved` (seul l'admin) ; l'admin ne peut approuver qu'un palier valide au bon coût ; suppression réservée à l'admin.
- `redemptions` : création interdite au client ; le commerçant ne peut que passer le bon à `used` (avec panier et nouveau client) ; l'habitant peut aussi marquer son propre bon comme utilisé.
- `campaigns` : création d'une campagne active refusée sans les 5 paliers.
- `merchants` : `pointsGenerated` et `pointsSpent` non modifiables par le client.

---

## 9. Définition de « terminé »

- [x] Modèle unique : 10 pts/réponse, 3 réponses payées par jour, +50 bienvenue, +5 découverte, expiration à 6 mois d'inactivité — crédits côté serveur.
- [x] 5 paliers fixes dans une constante unique (`TIERS`), identiques pour tous les commerçants.
- [x] « Ma vitrine récompenses » : 5 paliers obligatoires avant la première campagne, aucune saisie de prix ni de points, suggestions par catégorie, quota / créneaux / avec achat / pause, validation admin.
- [x] Échange côté serveur : quota mensuel, une récompense par commerçant et par semaine, solde jamais négatif.
- [x] Côté habitant : « Palier N · X pts », aucun euro. Côté commerçant : ni « coût » ni « valeur ».
- [x] Dashboard : clients ramenés, nouveaux clients, panier moyen. Admin : points générés / dépensés par commerçant.
- [x] Règles Firestore et tests à jour (voir `tests/eng21.js`, `tests/eng22.js`).
