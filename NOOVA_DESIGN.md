# NOOVA — Règles de design

Ce fichier fait autorité sur tout le visuel de l'app.
En cas de doute, applique ce fichier, ne réinvente pas.

---

## 1. Le sujet

NOOVA est une app de quartier. Les commerçants du Mans posent une question,
les habitants répondent en 30 secondes et échangent leurs points contre une
récompense en boutique.

Références visuelles : l'étiquette de prix, le ticket de caisse, l'ardoise du
commerçant, le tampon d'une vieille maison. Pas la fintech, pas la Silicon
Valley, pas le jeu mobile clinquant.

Ton : direct, chaleureux, jamais infantilisant. Tutoiement.

---

## 2. Le principe unique

**Une seule idée forte : le ticket.**

Toute récompense, tout gain de points, tout code à présenter en caisse est un
ticket : bordure nette, coin encoché, chiffres alignés.

### Une app mixte, assumée

NOOVA ne vit pas dans une seule couleur. Chaque écran a une **ambiance**, choisie
pour ce qu'il raconte, et c'est voulu : une app de quartier n'a pas l'uniformité
d'un produit sorti d'un générateur.

| Ambiance | Classe | Écrans |
|---|---|---|
| Crème | `amb-creme` | Accueil, Question (bulle), Récompenses, Profil |
| Marron à carreaux | `amb-marron` | Communauté |
| Sombre (par défaut) | aucune | Bienvenue, connexion, sous-pages et réglages, page commerce, question plein écran |

Une ambiance ne change **que les couleurs** (fond, surface, texte, trait).
Tout le reste est identique partout, et c'est ce qui fait que l'app reste une
seule app : la même police, la même échelle de tailles, les quatre mêmes rayons,
les mêmes boutons, les mêmes libellés, les mêmes marges.

Le design a le droit d'être spectaculaire à deux endroits : le ticket (ci-dessus)
et le fond de marque plein écran (illustrations de question, bandeau du profil,
feuille des récompenses). Tout le reste — listes, réglages, fiches — est calme,
plat et répétitif. Si un écran hésite entre sobre et spectaculaire, il est sobre.

### Ce qui trahit une app « faite par une IA » — à ne jamais faire

- Des cartes très arrondies (20px et plus) partout, avec une ombre douce.
- De petits sur-titres espacés (`letter-spacing`) au-dessus de chaque titre.
- Des pastilles de toutes les couleurs (violet, rose, bleu, vert) pour des catégories.
- Des listes qui apparaissent en fondu, carte après carte.
- Des emojis à la place des icônes, des `✨` pour dire « nouveau ».
- Des flèches `→` dans chaque bouton.
- Des méta-infos enfilées avec des `·`.

---

## 3. Interdits absolus

- Formes décoratives de fond : blobs, vagues, diagonales, dégradés d'ambiance,
  SVG décoratifs. Un fond est une couleur unie (celle de son ambiance).
  **Exceptions : les fonds de marque listés au §2** (illustrations de question
  `bg-question-*.svg`, feuille des récompenses `bg-recompenses.svg`, carreaux de
  Communauté, bandeau du profil).
- `box-shadow`. Aucune, nulle part. La séparation se fait par une bordure 1px
  ou par un changement de fond.
- Dégradés, sauf un dégradé noir vers transparent pour la lisibilité d'un
  texte posé sur une image.
- Le jaune en fond d'écran ou en fond de grande zone.
- Plus d'un bouton jaune par écran.
- Un rayon hors de l'échelle : `--r-xs` 4px (étiquettes), `--r-sm` 10px
  (boutons, champs), `--r-md` 14px (cartes), `--r-lg` 20px (feuilles du bas et
  bandeaux de marque uniquement). `--r-pill` est réservé aux avatars et interrupteurs.
- Libellés en majuscules (`text-transform: uppercase`) ou espacés (`letter-spacing` positif).
- Flèches `→` ou `›` collées au texte d'un bouton.
- Méta-informations jointes par des points médians (`Boulangerie · le-mans`).
- Emojis en guise d'icônes.
- Texte centré, sauf sur un écran de succès ou un état vide.
- Valeurs de couleur, d'espacement ou de rayon écrites en dur. Tout vient de
  `tokens.css`.

---

## 4. Tokens

Toutes les valeurs sont dans `tokens.css`. Aucune exception.
Pour ajouter une couleur, ajoute un token — ne l'écris jamais dans un composant.

Espacements : uniquement des multiples de 4px, via `--s1` à `--s7`.

Typographie : deux familles auto-hébergées, `--font-titre` (Bricolage Grotesque,
titres et chiffres) et `--font` (Plus Jakarta Sans, texte). Neuf tailles, pas une
de plus : `--fs-1` 11px, `--fs-2` 13px, `--fs-3` 15px, `--fs-4` 17px, `--fs-5` 21px,
`--fs-6` 28px, `--fs-7` 34px, `--fs-8` 48px, `--fs-9` 72px.

Couleurs de marque brutes (`--marque-creme`, `--marque-encre`, `--marque-marron`,
`--marque-or-1/2`, `--marque-brule`) : pour les fonds de marque et les ambiances,
jamais directement dans un composant.

---

## 5. Usage de la couleur

Le jaune sert à trois choses, et à rien d'autre :

1. le bouton d'action principal de l'écran (un seul) ;
2. les points et les compteurs de gain ;
3. l'élément actif : onglet en cours, option sélectionnée.

Le vert sert uniquement à confirmer une action réussie. Un encadré
d'information (« Tu gardes le contrôle ») est neutre : `--surface-2`, texte `--text-2`.
Le rouge sert uniquement à une erreur ou une suppression.
Tout le reste vit en noir, gris et blanc cassé.

---

## 6. Structure d'un écran

```
┌──────────────────────────────┐
│ Barre de stats (fixe, plate) │  fond --surface, bordure basse 1px
├──────────────────────────────┤
│                              │
│ Titre                        │  --t-title, aligné à gauche
│ Sous-titre                   │  --text-2
│                              │
│ [ contenu ]                  │  cartes plates, gap --s3
│                              │
│                              │
├──────────────────────────────┤
│ Action principale            │  collée en bas, pleine largeur
└──────────────────────────────┘
```

- Marge latérale de l'écran : `--s4` (16px). Identique partout.
- Écart entre deux cartes d'une même liste : `--s2` (8px).
- Écart entre deux blocs différents : `--s5` (24px).
- Un titre d'écran est aligné à gauche, jamais centré.
- Aucune carte ne touche le bord de l'écran.

---

## 7. Composants

### Carte
Fond `--surface`, bordure 1px `--trait`, rayon `--r-md`, padding `--s4`.
Aucune ombre. L'état actif change la bordure en `--jaune`, jamais le fond.

### Bouton principal
Fond `--jaune`, texte `--jaune-ink`, rayon `--r-sm`, hauteur 52px,
pleine largeur, graisse 600. Le texte dit l'action : « Répondre »,
« Échanger », « Enregistrer ». Sans flèche.

### Bouton secondaire
Fond transparent, bordure 1px `--trait`, texte `--blanc`, même hauteur.

### Option de réponse
Carte plate en liste verticale, gap `--s2`, hauteur minimale 56px.
Non sélectionnée : bordure `--trait`. Sélectionnée : bordure `--jaune` 1px et
fond `--surface-2`. Pas de coche, pas de rond à gauche : la bordure suffit.

### Ticket (récompense, code en caisse, gain)
Le seul composant expressif. Fond `--jaune`, texte `--jaune-ink`,
coin encoché en haut à droite, ligne pointillée de séparation,
montant en très grand avec `tabular-nums`.

### Barre de stats
Plate, fond `--surface`, bordure basse 1px `--trait`, hauteur 56px.
Trois valeurs maximum. Les chiffres en `--blanc`, les libellés en `--text-2`.

### Libellé de section
Sentence case, `--t-label`, couleur `--text-2`. Pas de majuscules, pas
d'espacement de lettres. « Confidentialité », pas « CONFIDENTIALITÉ ».

### Sur-titre d'écran (`.auth-badge`)
Une seule forme : étiquette `--r-xs`, fond `--surface-2`, texte `--text-2`,
`--fs-2`. Jamais colorée selon l'écran.

### Avatars et pastilles de catégorie
Tons chauds de la marque uniquement (or brûlé, ocre, brun, encre).
Jamais de violet, de rose, de bleu ou de vert.

---

## 8. Chiffres

Tous les chiffres qui bougent (points, NOOVS, série, pourcentages) :
`font-variant-numeric: tabular-nums`. Sinon la mise en page sautille.

---

## 9. Mouvement

Une seule animation orchestrée dans toute l'app : le crédit des points après
une réponse. Le reste ne s'anime qu'en réponse directe à un geste
(ouverture, sélection, validation).

Pas d'apparition en fondu sur chaque section. Pas d'effet au survol des
cartes. Respecter `prefers-reduced-motion`.

---

## 10. Écriture

- Le libellé d'un bouton dit ce qui se passe, et le même mot revient après :
  le bouton « Échanger » produit « Échangé ».
- Un écran vide est une invitation, pas une excuse :
  « Aucune question pour l'instant. Reviens demain matin. »
- Une erreur dit ce qui s'est passé et quoi faire. Elle ne s'excuse pas.
- Jamais « Tes avis valent de l'argent » ni « sondage rémunéré ».
  La promesse est : savoir ce que pensent les gens du quartier, et faire
  bouger les commerces où tu vas.

---

## 11. Plancher de qualité

- Responsive jusqu'à 360px de large.
- Zone tactile de 44px minimum.
- Focus clavier visible.
- Contraste AA sur tout texte.
- Le fond couvre tout l'écran, y compris sous les zones sûres
  (`env(safe-area-inset-*)`).

---

## 12. Cohérence à vérifier avant chaque livraison

- Un seul bouton jaune par écran.
- Aucune ombre dans le CSS produit.
- Aucune valeur en dur hors de `tokens.css`.
- Espace insécable avant `?`, `!`, `:` et `;` (typographie française).
- Captures avant / après : `SUITES=visual_shots sh tests/run.sh` (images dans `/tmp/shots/visual`).
- Le nombre de points affiché est le même partout pour une même action.
- Chaque commerce affiche sa vraie catégorie.
- Aucun texte de remplissage générique n'est resté à l'écran.
