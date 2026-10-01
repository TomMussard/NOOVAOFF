/* Centres d'intérêt NOOVA — SOURCE UNIQUE.
 * Les mêmes pour l'habitant (inscription, profil) et pour le commerçant (ciblage d'une campagne dans le dashboard).
 * Chaque clé correspond aussi au secteur d'un commerce (voir sectorCategory dans functions/lib.js).
 * Ce fichier existe en deux exemplaires strictement identiques (un test le vérifie) : interests.js (racine du site,
 * chargé par l'app et le dashboard) et functions/interests.js (serveur). Ajouter un centre d'intérêt = modifier les deux. */
(function (root) {
  var INTERESTS = [
    { key: "restauration", label: "Restauration" },
    { key: "boulangerie",  label: "Boulangerie et pâtisserie" },
    { key: "sport",        label: "Sport et bien-être" },
    { key: "beaute",       label: "Beauté et coiffure" },
    { key: "culture",      label: "Culture et loisirs" },
    { key: "commerce",     label: "Boutiques et commerces" },
    { key: "services",     label: "Ville et services" }
  ];
  var KEYS = INTERESTS.map(function (i) { return i.key; });
  function valid(list) {
    return (Array.isArray(list) ? list : []).filter(function (k, n, a) { return KEYS.indexOf(k) !== -1 && a.indexOf(k) === n; });
  }
  function label(key) {
    for (var i = 0; i < INTERESTS.length; i++) if (INTERESTS[i].key === key) return INTERESTS[i].label;
    return String(key || "");
  }
  // Règle de ciblage, la même partout (app, réponse côté serveur, notifications, estimation d'audience) :
  //  - campagne sans centre d'intérêt ciblé : tout le monde ;
  //  - habitant sans centre d'intérêt (ancien compte) ou qui les a tous (« Tout m'intéresse ») : toutes les campagnes ;
  //  - sinon : au moins un centre d'intérêt en commun.
  function targetsUser(campaignTargets, userInterests) {
    var t = valid(campaignTargets);
    if (!t.length) return true;
    var u = valid(userInterests);
    if (!u.length || u.length === KEYS.length) return true;
    return t.some(function (k) { return u.indexOf(k) !== -1; });
  }
  var api = { INTERESTS: INTERESTS, KEYS: KEYS, valid: valid, label: label, targetsUser: targetsUser };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NOOVA_INTERESTS = api;
})(typeof window !== "undefined" ? window : this);
