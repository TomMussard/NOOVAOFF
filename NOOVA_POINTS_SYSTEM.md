# NOOVA — Système de points & récompenses (à rendre FONCTIONNEL)

> **Pour Claude Code.** Ce fichier **complète** `NOOVA_SPEC.md` (même stack, même arborescence, même approche Firestore/règles de sécurité). Lis d'abord `NOOVA_SPEC.md`, puis implémente ce système de points **dans l'app utilisateur ET dans le dashboard commerçant**. On n'est plus en démo : **aucune fausse donnée**, tout passe par Firestore. **Ne change pas le design** (voir la capture de l'écran Récompenses qui existe déjà), tu ne fais que le brancher sur les bonnes valeurs.

---

## 0. Le principe en une phrase

Répondre à une question crédite **deux compteurs à la fois** : un **solde dépensable** (la monnaie) et une **XP à vie** (le statut). On dépense le solde, jamais l'XP.

---

## 1. LES DEUX COMPTEURS (le point le plus important)

Aujourd'hui l'app confond « Mon solde » et la barre de niveau : c'est un bug. Un utilisateur qui dépense ses points redescendrait de niveau. Il faut **deux valeurs distinctes** sur `users/{uid}` :

- **`points`** = **solde dépensable (wallet)**. Monte quand on répond, **descend quand on échange** une récompense. C'est la monnaie.
- **`xp`** = **expérience à vie**. Monte quand on répond, **ne descend JAMAIS**. Pilote le statut (Curieux → Légende).

**Câblage sur l'écran Récompenses existant (sans toucher au design) :**
- Le grand nombre « **Mon solde : X pts** » = `points` (wallet).
- La **barre de progression** + le libellé « Niveau X · Curieux » + le seuil « 1000 pts » = basés sur **`xp`** (progression vers le prochain palier de statut).
- La section « **Paliers** » (Curieux/Actif/Expert/Ambassadeur/Légende) = basée sur **`xp`**.
- La section « **Récompenses près de toi** » = les vraies récompenses des commerçants de la ville (vide tant qu'aucun commerçant n'en a créé → garder l'état vide actuel).

> Tant que personne n'a rien dépensé, `points == xp` et l'écran est identique. La séparation ne se voit qu'à la première dépense — mais elle est indispensable.

---

## 2. GAGNER DES POINTS

Le commerçant pose **jusqu'à 3 questions** (Q1 montrée directement, Q2/Q3 optionnelles). On récompense la profondeur avec un **barème en escalier fixé par NOOVA** (le commerçant ne fixe PAS les points — NOOVA possède l'économie de points, pour rester cohérent partout) :

| Élément | Points |
|---|---|
| Question 1 | **10** |
| Question 2 | **15** |
| Question 3 | **20** |
| Bonus « série complète » (les 3 d'une campagne) | **+10** |
| Bonus de série quotidienne (streak, 1×/jour) | **+5** |

→ Répondre aux 3 questions d'un commerçant = **55 pts** (+5 si streak du jour).

**Règles d'attribution (dans `responses.js`) :**
- À chaque réponse valide : `points += montant` **ET** `xp += montant`, dans **une transaction Firestore atomique** (avec `campaigns.responsesCount += 1`).
- Le montant par question dépend de **sa position** dans la campagne (index 0/1/2 → 10/15/20), pas d'une valeur libre du commerçant.
- Le bonus +10 est crédité **une seule fois**, quand la 3ᵉ réponse d'une même campagne est enregistrée.
- Le streak +5 est crédité **une fois par jour** (au premier point du jour), et met à jour `streak` + `lastAnswerDate`.
- **Plafond quotidien** : `dailyEarned` ne peut pas dépasser **~300 pts/jour** (paramétrable), remis à 0 chaque jour (`dailyEarnedDate`). Au-delà, les réponses restent possibles mais ne créditent plus (anti-abus).
- **Score qualité** : si `qualityScore` d'une réponse est sous le seuil (réponse trop rapide / vide / incohérente), la réponse rapporte **0 pt** et est marquée `flagged: true`. Voir §7.

**Repère de valeur (à mémoriser pour toute l'économie) : 1 pt ≈ 1 centime de valeur perçue.** Sert à calibrer les prix des récompenses côté commerçant.

---

## 3. STATUT (paliers à vie, pilotés par `xp`)

Seuils **déjà présents dans l'UI**, à conserver :

| Statut | XP requise |
|---|---|
| Curieux | 0 (dès le départ) |
| Actif | 1 000 |
| Expert | 3 000 |
| Ambassadeur | 6 000 |
| Légende | 10 000 |

- Le statut se **calcule** depuis `xp` (fonction `getStatut(xp)`), pas besoin de le stocker (ou le stocker en cache dénormalisé, au choix).
- **En beta, le statut est cosmétique** (fierté / badge / classement), il ne débloque pas d'avantage. *(Hook prévu : plus tard, un palier haut pourra débloquer des récompenses exclusives ou un petit multiplicateur — laisse le code prêt à l'accueillir, mais ne l'active pas maintenant.)*

---

## 4. SOLDE UNIVERSEL

Le solde `points` est **utilisable chez TOUS les commerçants** que l'utilisateur peut voir (sa ville, autorisés). Peu importe où les points ont été gagnés. Raison : avec 3 questions max par commerçant, un solde cloisonné par commerce serait inatteignable. La récompense, elle, reste **100 % contrôlée par le commerçant** (voir §5), donc échanger chez lui = une visite garantie dans SA boutique, ce qu'il veut.

---

## 5. RÉCOMPENSES CÔTÉ COMMERÇANT (dashboard)

**C'est le commerçant qui crée et finance ses récompenses**, pas NOOVA. Il faut donc une **section « Récompenses » dans le dashboard** où il configure **jusqu'à 5 récompenses** (5 slots). NOOVA fixe l'échelle de points ; le commerçant remplit le contenu.

**Champs d'une récompense (`rewards/{rewardId}`) configurables par le commerçant :**
- `label` (ex. « Café offert »), `icon`
- `cost` : prix en points (le commerçant le fixe, guidé par des suggestions — voir plus bas)
- `stock` : nombre total d'échanges possibles (ex. 50), OU illimité
- `perUserLimit` : par défaut **1** (une fois par personne)
- `expiresAt` : date de fin de validité de l'offre
- `purchaseCondition` : optionnel (ex. « pour un plat acheté », « -20 % sur l'addition ») → garantit la marge sur les grosses offres
- `active` : true/false
- `redeemedCount` : compteur (géré par le système, pas éditable)

**Prix suggérés (pré-remplis selon la catégorie, modifiables) — sur la base 1 pt ≈ 1 cent :**
- Petit geste (café, cookie, -10 %) : **≈ 200 pts**
- Moyen (dessert, boisson, -15 %) : **≈ 350 pts**
- Belle offre (-20 %, entrée offerte) : **≈ 500 pts**
- Grosse offre (menu, -30 %, produit premium, **avec** condition d'achat) : **≈ 800–1 000 pts**

Au premier accès, proposer au commerçant un **jeu d'exemples selon son thème** (café / resto / coiffeur…) qu'il **valide ou modifie** — jamais imposé, et rien n'est publié tant qu'il n'a pas confirmé.

---

## 6. ÉCHANGE (app) + VALIDATION AU COMPTOIR (dashboard)

C'est ce qui rend le système **réel** et non décoratif.

**Côté app (échange) — dans une transaction :**
1. L'utilisateur peut échanger une récompense si : `points >= reward.cost` **ET** stock dispo (`redeemedCount < stock`) **ET** pas déjà prise par lui (`perUserLimit`) **ET** non expirée **ET** `active`.
2. Transaction atomique : `points -= reward.cost`, `reward.redeemedCount += 1`, création d'un doc `redemptions` avec un **code unique** + `expiresAt` + `status: "pending"`.
3. L'app affiche le **bon avec son code** (et la condition d'achat éventuelle).

**Côté dashboard (validation) :**
- Écran **« Valider un bon »** : le commerçant saisit/scanne le code → on cherche la `redemption` correspondante → si `pending` et non expirée → passage à `status: "used"`, `usedAt: now`.
- **Usage unique** : un code déjà `used` ou expiré est refusé. Zéro fraude possible.

---

## 7. ANTI-ABUS (garde-fous)

Un gros répondeur ne doit pas pouvoir ruiner le modèle. Mécanismes à implémenter :

- **Offre de points finie** : 3 questions max/commerçant + nombre fini de commerçants/ville → pas de farm infini. Renforcé par le **plafond quotidien** (§2).
- **Score qualité** sur chaque réponse (temps de rédaction, longueur/cohérence minimale) : sous le seuil → 0 pt + `flagged`. Protège la data ET les points.
- **Le vrai garde-fou est côté récompense** : chaque offre est bornée par le commerçant (`stock`, `perUserLimit: 1`, `expiresAt`, `purchaseCondition`). Même un user avec 50 000 pts ne prend une offre donnée **qu'une fois**, dans la limite du stock. L'exposition du commerçant dépend de **ses** réglages, pas du solde du user.
- **Réponses non dupliquables** : id déterministe `${userId}_${campaignId}_${qid}` (déjà dans `NOOVA_SPEC.md`).
- **Bons à usage unique** : code validé une seule fois (§6).

---

## 8. MODÈLE DE DONNÉES (compléments à `NOOVA_SPEC.md`)

### `users/{uid}` — ajouter / préciser
```
points: 0            // solde dépensable (wallet) — descend à l'échange
xp: 0                // à vie — ne descend jamais, pilote le statut
streak: 0
lastAnswerDate: null // "YYYY-MM-DD"
dailyEarned: 0       // points gagnés aujourd'hui (plafond)
dailyEarnedDate: null
```

### `rewards/{rewardId}` — étendre
```
merchantId, merchantName, city, slot (1..5)
label, icon, cost
stock            // ou null = illimité
perUserLimit: 1
expiresAt
purchaseCondition   // null ou texte
active: true
redeemedCount: 0
createdAt, updatedAt
```

### `redemptions/{redemptionId}`
```
userId, rewardId, merchantId
cost, code (unique)
status: "pending" | "used" | "expired"
createdAt, expiresAt, usedAt
```

### `responses/{responseId}` — ajouter
```
pointsAwarded    // ce qui a réellement été crédité (0 si flaggé)
qualityScore
flagged: false
```

### Index composites à ajouter
- `rewards` : `city` + `active`
- `rewards` : `merchantId` + `slot`
- `redemptions` : `userId` + `rewardId` (contrôle du perUserLimit)
- `redemptions` : `merchantId` + `status` (validation au comptoir)

---

## 9. RÈGLES DE SÉCURITÉ & INTÉGRITÉ

- Un utilisateur **ne peut jamais écrire librement** `points`/`xp` sur son propre doc. Le crédit passe **uniquement** par la transaction de `responses.js` (création de réponse + incrément), et le débit par la transaction d'échange.
- Les règles Firestore valident au mieux : une réponse ne peut pas déclarer un `pointsAwarded` supérieur au barème autorisé pour sa position, et le débit d'un échange doit correspondre à `reward.cost`.
- **Limite honnête à me signaler :** avec du 100 % client, un utilisateur techniquement malveillant pourrait tenter de forger un solde. Pour la beta/démo fonctionnelle, la transaction client + règles suffisent. **En production, déplacer l'attribution des points et la validation des bons dans une Cloud Function** (plan Blaze) pour une intégrité totale. Prépare le code pour que ce basculement soit simple (logique d'attribution isolée dans une fonction dédiée).

---

## 10. ÉTATS VIDES & DESIGN

- « Récompenses près de toi » **vide** tant qu'aucun commerçant de la ville n'a créé de récompense active → garder le message existant (« Les récompenses arrivent bientôt dans ta ville »).
- Dashboard sans récompense → état vide + CTA « Crée ta première récompense ».
- Aucune récompense/valeur d'exemple codée en dur. Tout vient de Firestore.
- **Design préservé à l'identique** — tu ne fais que lier les bons compteurs et brancher les actions.

---

## 11. PLAN D'IMPLÉMENTATION (par phases, commit à chaque étape)

- **Phase A** — Séparer les compteurs : ajouter `xp`, câbler le grand nombre sur `points` (wallet) et la barre/paliers sur `xp`. (Aucune régression visuelle.)
- **Phase B** — `responses.js` : barème 10/15/20 + bonus série +10 + streak +5, transaction (crédit `points` & `xp`, `responsesCount`), plafond quotidien, `qualityScore`.
- **Phase C** — Statut : `getStatut(xp)` + affichage (cosmétique).
- **Phase D** — Dashboard : section « Récompenses » (5 slots) avec suggestions par catégorie → écriture dans `rewards`.
- **Phase E** — App : « Récompenses près de toi » alimentée par `rewards` (ville) + flux d'échange (transaction : débit, `redemptions`, code, stock/perUserLimit/expiration).
- **Phase F** — Dashboard : écran « Valider un bon » (code → `used`).
- **Phase G** — Anti-abus : score qualité, plafond quotidien, contrôles de récompense, tests.
- **Phase H** — Règles de sécurité + index + états vides/chargement. Note sur le passage en Cloud Function pour la prod.

---

## 12. DEFINITION OF DONE
- [ ] `points` (wallet) et `xp` (statut) **séparés** ; dépenser ne fait plus baisser le niveau.
- [ ] Répondre crédite les deux compteurs via **transaction** ; barème 10/15/20 + bonus série + streak ; **plafond quotidien** actif.
- [ ] Solde **universel** utilisable chez tous les commerçants visibles de la ville.
- [ ] Le commerçant configure **jusqu'à 5 récompenses** (prix en points, stock, 1/personne, expiration, condition d'achat) depuis son dashboard.
- [ ] Échange fonctionnel : débit du solde + **bon à code unique** + respect stock/limite/expiration.
- [ ] Validation du bon au comptoir dans le dashboard (usage unique).
- [ ] Score qualité + garde-fous anti-abus en place.
- [ ] Zéro donnée statique ; états vides partout ; design inchangé.
- [ ] Data model, règles et index à jour ; note sur l'intégrité prod (Cloud Function).
