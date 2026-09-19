"use strict";
// Petits utilitaires partagés par les fonctions.
function sectorCategory(sec) {
  const s = String(sec || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/boulang|patiss|viennois/.test(s)) return "boulangerie";
  if (/restau|cafe|\bbar\b|traiteur|pizz|kebab|snack/.test(s)) return "restauration";
  if (/sport|fitness|gym/.test(s)) return "sport";
  if (/beaut|coiff|esthet|\bspa\b|barbier/.test(s)) return "beaute";
  if (/cultur|librair|cinema|musee|musique/.test(s)) return "culture";
  if (/service|mairie|ville/.test(s)) return "services";
  return "commerce";
}
module.exports = { sectorCategory };
