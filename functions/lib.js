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
// Questions d'une campagne. Les campagnes créées avant la correction du 2026-09-20 (sans questionsSchema: 2) avaient les
// champs d'options des questions 2 et 3 (placés AVANT ceux de la question 1 dans la page) ajoutés au DÉBUT de la liste
// de la question 1 : [options Q2, options Q3, options Q1]. On retire ce début. Les index des options de Q1 sont alors
// décalés par rapport aux anciennes statistiques (elles n'existent que pour des campagnes de test).
function campaignQuestions(camp) {
  const base = (camp && Array.isArray(camp.questions) && camp.questions.length)
    ? camp.questions : [{ q: camp && camp.question, format: camp && camp.format, options: camp && camp.options }];
  if (camp && camp.questionsSchema === 2 || base.length < 2) return base;
  const qs = base.map((x) => ({ ...x, options: Array.isArray(x.options) ? [...x.options] : x.options }));
  const first = qs[0];
  if (!Array.isArray(first.options)) return qs;
  let o = first.options;
  for (let i = 1; i < qs.length; i++) {                       // Q2 puis Q3, dans l'ordre où elles s'étaient accumulées
    const head = qs[i].options;
    if (!Array.isArray(head) || !head.length) continue;
    if (o.length - head.length >= 2 && head.every((v, k) => o[k] === v)) o = o.slice(head.length);
  }
  first.options = o;
  return qs;
}
module.exports = { sectorCategory, parisDay, ADMIN_EMAILS, campaignQuestions };
