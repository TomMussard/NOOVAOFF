# Parcours utilisateur — `noovaoff.fr/app`

Objectif : faire vivre la boucle complète (question → réponse → résultat → points) avant de demander la moindre information.

```
U1 Présentation (2 écrans, skippable)
U2 Question de démonstration
U3 Résultat + points en attente
U4 Création de compte (minimal)
U5 Ville et catégories
U6 Accueil — première vraie question
U7 Permissions en contexte (déclenchées plus tard)
```

---

## U1 · Présentation — 2 écrans

Deux, pas trois. Le troisième argument se découvre en utilisant l'app.

**Écran 1** — « Les commerces du Mans te posent une question. Tu réponds en 30 secondes. »
**Écran 2** — « Tes réponses te rapportent des points, échangeables chez eux. » (10 points par réponse, pour tes 3 premières réponses du jour.)

- Fond crème, une illustration ou photo pleine largeur par écran, texte en bas, bouton `.btn--yellow` « Suivant ».
- « Passer » en haut à droite, toujours visible, `--muted`.
- Indicateur de progression : deux segments.
- Skip et fin de présentation mènent au même endroit : U2.

## U2 · Question de démonstration

L'écran `2 · Répondre` des maquettes, sans compte.

- Question réelle d'un commerce du Mans, marquée « Exemple » en pastille discrète si aucune campagne n'est active.
- 4 options maximum, une seule réponse.
- Pas de bouton « Passer » ici : la seule sortie est de répondre ou de revenir.
- La réponse est stockée côté client (session anonyme) et rattachée au compte à la création.

## U3 · Résultat + points en attente

L'écran `3 · Résultat` des maquettes, avec deux différences :

- Le bloc jaune affiche « +50 points de bienvenue en attente » au lieu de « points gagnés ».
- Le bouton bas devient « Récupérer mes 50 points » → U4.
- Un lien secondaire « Plus tard » ramène à U2 avec une autre question de démonstration (maximum 2, ensuite le compte devient obligatoire).

C'est le moment de conversion. L'utilisateur a vu la valeur, il a quelque chose à perdre.

## U4 · Création de compte — 4 champs

Prénom, email, mot de passe, ville. Rien d'autre.

- Un champ par ligne, labels au-dessus, clavier adapté (`type="email"`, `autocomplete`).
- Ville : champ avec autocomplétion, Le Mans proposé par défaut.
- Bouton « Créer mon compte » désactivé tant que les champs requis sont vides, avec message d'erreur sous le champ concerné, jamais en pop-up.
- Connexion sociale si disponible, au-dessus du formulaire.
- Mention RGPD en une phrase sous le bouton, avec lien vers la politique.
- À la création : le bonus de bienvenue (+50 points, une seule fois) est crédité côté serveur, avec une animation de compteur.

**Pas demandé ici** : photo de profil, intérêts, contacts, date de naissance, numéro de téléphone.

## U5 · Ville et catégories

Un seul écran, 6 à 8 catégories en pastilles sélectionnables (Restauration, Boulangerie, Sport, Beauté, Culture, Commerce de proximité, Ville et services).

- Multi-sélection, minimum 1, « Tout m'intéresse » possible.
- Sert à filtrer les questions proposées, pas à autoriser des commerces.
- Bouton « Continuer ».

## U6 · Accueil

L'écran `1 · Accueil` des maquettes. Une seule bulle contextuelle au premier affichage, ancrée sur la carte jaune : « Une à trois questions par jour. Ça prend 30 secondes. » Bouton « Compris », jamais réaffichée.

### États de l'accueil

| État | Contenu |
|---|---|
| Question disponible | Carte jaune avec la question, compteur « 1 sur 3 aujourd'hui » |
| Tout répondu | Carte jaune remplacée par un bloc « C'est fait pour aujourd'hui » + récompense la plus proche mise en avant + aperçu du résultat de la question du jour |
| Aucun commerce actif dans la ville | Bloc « NOOVA arrive au Mans » + champ pour suggérer un commerce + bouton de partage. **C'est l'état par défaut au lancement, à soigner en priorité.** |

## U7 · Permissions, en contexte

Aucune pendant l'inscription. Chaque permission est précédée d'un écran maison qui explique le bénéfice, puis déclenche la pop-up système. Si l'utilisateur refuse, l'app continue de fonctionner et ne redemande pas avant 7 jours.

| Permission | Déclencheur |
|---|---|
| Notifications | Après la première réponse validée. « Une notification par jour, quand un commerce a besoin de ton avis. » |
| Géolocalisation | Au premier tap sur la carte ou sur « À deux pas ». Jamais au démarrage. |
| Contacts | Après le déblocage de la première récompense uniquement. Alternative toujours visible : partager son code par message. |
| Ajout à l'écran d'accueil | Au 2e jour de série ou à la première récompense débloquée. Instructions différentes iOS (Partager → Sur l'écran d'accueil) et Android (menu → Installer l'application). Détecter la plateforme, ne jamais afficher les deux. Ne plus proposer si déjà installée (`display-mode: standalone`). |

## Autorisation des commerces — modèle « demande d'ami »

Pas de pop-up listant tous les commerces à l'inscription : au lancement elle serait vide.

- Quand un commerce de la ville de l'utilisateur lance une campagne correspondant à ses catégories, il apparaît sur l'accueil sous forme de demande : photo, nom, distance, « veut te poser des questions » → **Autoriser** / **Non merci**.
- Tant qu'il n'a pas répondu, aucune question de ce commerce ne lui est envoyée.
- Toutes les autorisations restent révocables depuis le profil, avec le nombre de questions déjà posées affiché (écran `8 · Profil`).

## Réclamation d'une récompense

1. Écran Cadeaux → carte « Débloqué » (« Palier N · X pts », jamais un montant en euros) → bouton « Échanger ». Une récompense par commerçant et par semaine.
2. Confirmation : ce qui est débrité, ce qu'il reste, durée de validité. Action irréversible, donc confirmation explicite.
3. Écran code plein écran : luminosité au maximum, code en très grande taille, nom du commerce, compte à rebours de validité, bouton « C'est validé » que le commerçant ou l'utilisateur presse en caisse.
4. Écran de confirmation + proposition de partage.

## Règles transverses

- Padding bas de toute page scrollable = hauteur de la nav + 16px, sinon la nav flottante masque le dernier élément.
- Aucun écran de chargement vide : squelettes de cartes aux bonnes dimensions.
- Les erreurs s'affichent au niveau du champ ou en bandeau inline, jamais en alerte système.
- Verbes à la première personne dans les boutons d'action de l'utilisateur, impératif partout ailleurs. Une action garde le même nom du bouton jusqu'au message de confirmation.
