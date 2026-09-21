/* Paliers de récompenses NOOVA — SOURCE UNIQUE des valeurs.
 * Fixes et identiques pour tous les commerçants : le commerçant ne saisit jamais de prix ni de points.
 *  - pts        : ce que l'habitant dépense pour obtenir la récompense du palier
 *  - min / max  : fourchette du prix carte (en €) de l'article que le commerçant propose sur ce palier
 * Ce fichier existe en deux exemplaires strictement identiques (un test le vérifie) : functions/tiers.js (serveur,
 * déployé avec les fonctions) et tiers.js (racine du site, chargé par l'app, le dashboard et l'admin).
 * Les règles Firestore (firestore.rules) ne peuvent pas importer de fichier : leurs fonctions tierPts/tierMin/tierMax
 * répètent ces valeurs, et le même test les compare. Changer un palier = modifier ce fichier, sa copie et les règles. */
(function (root) {
  var TIERS = [
    { n: 1, pts: 150,  min: 1,  max: 3  },
    { n: 2, pts: 300,  min: 3,  max: 6  },
    { n: 3, pts: 500,  min: 6,  max: 10 },
    { n: 4, pts: 900,  min: 10, max: 18 },
    { n: 5, pts: 1500, min: 18, max: 30 }, // gros lot
  ];
  if (typeof module !== "undefined" && module.exports) module.exports = TIERS;
  else root.NOOVA_TIERS = TIERS;
})(typeof window !== "undefined" ? window : this);
