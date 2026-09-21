# Parcours commerçant — `noovaoff.fr/dashboard`

Objectif : ne jamais laisser le commerçant attendre sans rien faire, et ne jamais supprimer un compte refusé.

```
C1 Présentation (3 écrans, skippable)
C2 Création de compte + informations pro
C3 Accès immédiat au dashboard en mode non vérifié
C4 Préparation : récompenses puis première question
C5 Validation par l'équipe NOOVA
C6 Lancement de campagne
C7 Affiche QR et suivi des résultats
```

---

## C1 · Présentation — 3 écrans

**Écran 1** — « Sachez ce que vos clients veulent vraiment. » Aperçu d'un vrai résultat : une question, une répartition de réponses.
**Écran 2** — « Vous choisissez la récompense. Elle ramène le client chez vous. » Exemple concret : 1 chocolat acheté → -15 % sur un café.
**Écran 3** — « Et vous êtes visible auprès de Manceaux qui ne vous connaissent pas encore. »

Le premier écran doit montrer une capture de dashboard réelle. Un commerçant achète la sortie, pas le principe.

## C2 · Création de compte

Deux étapes, séparées visuellement par un indicateur de progression.

**Étape 1 — Vous**
Prénom, nom, email professionnel, mot de passe, téléphone.

**Étape 2 — Votre établissement**
Nom commercial, SIRET, adresse, catégorie, site ou page sociale (facultatif), photo de devanture (facultative mais fortement incitée : « les commerces avec photo reçoivent nettement plus de réponses »).

- Validation du format SIRET côté client (14 chiffres, clé de Luhn). Vérification métier côté serveur.
- Pré-remplir via l'API entreprise si le SIRET est reconnu, et laisser le commerçant corriger.
- Message clair en fin d'étape : « Votre compte est créé. Vous pouvez préparer votre campagne pendant que nous vérifions votre établissement, sous 48 h ouvrées. »

## C3 · Dashboard en mode non vérifié

Accès immédiat, aucun écran d'attente.

- Bandeau permanent en haut : « Vérification en cours — vous pouvez tout préparer, le lancement sera débloqué après validation. » Couleur neutre, pas d'alerte rouge.
- Tout est accessible et modifiable : profil, récompenses, questions, aperçu.
- Seul le bouton **Lancer la campagne** est désactivé, avec une infobulle qui explique pourquoi.

## C4 · Préparation

### Ma vitrine récompenses

**Les 5 paliers doivent être remplis avant de lancer la première campagne.** NOOVA fixe les paliers, identiques pour tous les commerçants (150, 300, 500, 900 et 1 500 pts : voir `NOOVA_POINTS_SYSTEM.md`). Le commerçant **ne saisit jamais ni prix ni points**.

- Par palier : choisir une récompense parmi des suggestions liées à sa catégorie (la première est préremplie) ou écrire la sienne, puis cocher « le prix carte de cet article est entre X et Y € » (1–3 €, 3–6 €, 6–10 €, 10–18 €, 18–30 €).
- Réglages par récompense : quota mensuel, créneaux horaires (facultatif), option « avec achat » (achat minimum ≤ 2 × prix carte maximum du palier), bouton pause.
- Statuts : en attente de validation → approuvée (seul NOOVA valide) → en pause. Pas de suppression : les 5 paliers existent toujours.
- Vocabulaire : jamais « coût » ni « valeur » dans cet écran.

### Question

- 1 à 3 questions par campagne, 4 options maximum par question.
- Bibliothèque de modèles par catégorie (horaires, nouveau produit, ambiance, tarifs, services).
- Compteur de caractères, aperçu mobile en direct à droite.
- Garde-fou : interdire les questions permettant d'identifier une personne, et afficher un rappel — « Vos réponses sont agrégées. Vous ne verrez jamais qui a répondu. »

### Comprendre la réclamation en caisse — étape obligatoire

Un écran que le commerçant doit valider avant de pouvoir lancer :

1. Le client présente un code à 4 caractères sur son téléphone.
2. Vous le saisissez dans l'onglet « Valider un code » du dashboard, ou vous appuyez sur « C'est validé » sur son écran.
3. Le code devient inutilisable.

Case à cocher « J'ai compris et j'ai informé mon équipe », plus une fiche imprimable d'une page à afficher en caisse. Sans cette étape, le premier client repart sans sa récompense et les deux côtés sont perdus.

## C5 · Validation par l'équipe

Trois statuts, jamais de suppression.

| Statut | Comportement |
|---|---|
| `en_attente` | Mode non vérifié, préparation possible, lancement bloqué |
| `valide` | Lancement débloqué, email + notification dans le dashboard |
| `a_corriger` | Le compte reste actif et les données sont conservées. Bandeau listant les points précis à corriger (« SIRET introuvable », « le nom ne correspond pas à l'établissement », « photo illisible »). Bouton « Corriger et renvoyer » qui rouvre uniquement les champs concernés. |

Le motif de refus est rédigé par l'équipe dans le back-office et affiché tel quel. Jamais de message générique.

## C6 · Lancement de campagne

Écran récapitulatif avant lancement :
- La ou les questions, telles que l'utilisateur les verra
- Les récompenses actives
- La portée estimée : nombre d'utilisateurs de la ville correspondant à la catégorie
- Durée de la campagne

Bouton « Lancer la campagne ». Confirmation immédiate + accès direct à l'affiche QR.

## C7 · Suivi et acquisition

### État vide du dashboard — écran le plus important du lancement

Zéro réponse le premier jour est la norme. Cet écran ne doit pas afficher des graphiques vides.

Il affiche :
1. « Votre campagne est en ligne. Voici comment faire venir les premières réponses. »
2. **L'affiche A4 avec QR code, téléchargeable en PDF et imprimable** — à coller en vitrine et en caisse. C'est le principal canal d'acquisition d'utilisateurs tant que la base est petite : les clients du commerce deviennent les répondants.
3. Un visuel carré et un visuel story prêts pour les réseaux sociaux.
4. Un texte prêt à copier pour la page Instagram ou Facebook du commerce.

### Résultats

- Répartition par question, en barres, avec le nombre total de réponses.
- Aucune donnée individuelle, jamais. Seuil minimum de 5 réponses avant affichage d'une répartition, sinon « Encore X réponses avant les résultats » — protège l'anonymat et évite les conclusions sur 2 réponses.
- Évolution dans le temps si la campagne dure plus d'une semaine.
- Export CSV.

### Récompenses

- Compteur : débloquées, échangées, en attente de retrait. Sur le tableau de bord : clients ramenés ce mois, dont nouveaux clients, panier moyen des clients NOOVA.
- À la validation d'un code : montant du panier et « nouveau client » (avec « avec achat », le panier doit atteindre l'achat minimum).
- Onglet « Valider un code » avec un champ de saisie à 4 caractères, gros, utilisable sur mobile en caisse.

## Règles transverses dashboard

- Desktop d'abord, mais l'écran « Valider un code » et le suivi doivent être parfaitement utilisables sur mobile : le commerçant est derrière son comptoir, pas devant un ordinateur.
- Même design system que l'app, même jaune, mêmes cartes. Le commerçant doit reconnaître le produit que ses clients utilisent.
- Chaque écran de statistiques a un état vide rédigé, avec une action proposée.
