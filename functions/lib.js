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
// Jour calendaire à Paris (AAAA-MM-JJ) : base de tous les plafonds « par jour ».
function parisDay(ms) {
  return new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}
// Comptes autorisés dans le back-office (doit rester aligné sur isAdmin() de firestore.rules).
const ADMIN_EMAILS = ["noovaoffr@gmail.com", "tomussproduction@gmail.com"];
module.exports = { sectorCategory, parisDay, ADMIN_EMAILS };
