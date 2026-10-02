#!/usr/bin/env node
/**
 * Génère les visuels des commerces fictifs du mois de test : une devanture illustrée (couverture, 1200×600)
 * et un logo rond (256×256) par métier, en trois variantes de couleurs (une ville sur trois a la même).
 * Palette NOOVA uniquement (valeurs de tokens.css). Aucun texte : rien ne dépend d'une police.
 * Si une vraie photo du métier est fournie (scripts/commerce-photos/<metier>.jpg), elle remplace la devanture dessinée.
 *   node scripts/gen-commerce-visuals.js     → img/commerces/<metier>-<1|2|3>.svg et <metier>-logo-<1|2|3>.svg
 */
const fs = require("fs"), path = require("path");
const OUT = path.join(__dirname, "..", "img", "commerces");

// tokens.css : --marque-creme, --marque-encre, --marque-brule, --marque-or-1, --marque-or-2, --jaune,
// --jaune-pale, --surface, --surface-2, --trait, --text-2
const C = { creme: "#FFFBD7", encre: "#1C0E02", brule: "#A14E08", or1: "#F29715", or2: "#FFDA09", jaune: "#FFC300",
  pale: "#FFF3D1", surf: "#2A1A0B", surf2: "#3A2715", trait: "#4A3420", text2: "#D9C9A8" };

// Trois ambiances de façade : mur, store (deux bandes), cadre, vitrine éclairée, porte, trottoir.
const V = [
  { wall: C.brule, wall2: "#8F4507", awA: C.creme, awB: C.encre, frame: C.encre, glass: C.pale, door: C.surf2, walk: C.encre, walk2: C.surf, logoBg: C.brule, logoInk: C.creme },
  { wall: C.surf, wall2: C.surf2, awA: C.jaune, awB: C.encre, frame: C.encre, glass: C.pale, door: C.brule, walk: C.encre, walk2: C.trait, logoBg: C.encre, logoInk: C.jaune },
  { wall: C.pale, wall2: C.creme, awA: C.brule, awB: C.creme, frame: C.encre, glass: C.or2, door: C.brule, walk: C.trait, walk2: C.surf2, logoBg: C.pale, logoInk: C.encre },
];

// ── Motifs par métier, dessinés dans une boîte 200×200 centrée en (0,0) ──
const ICON = {
  cafe: (ink, acc) => `
    <path d="M-30 -78c-10 14 10 22 0 36M0 -84c-10 14 10 22 0 36M30 -78c-10 14 10 22 0 36" fill="none" stroke="${ink}" stroke-width="9" stroke-linecap="round"/>
    <path d="M-62 -26h112v40a56 56 0 0 1-56 56h0a56 56 0 0 1-56-56z" fill="${ink}"/>
    <path d="M50 -10h10a24 24 0 0 1 0 48h-14" fill="none" stroke="${ink}" stroke-width="12"/>
    <rect x="-86" y="74" width="164" height="14" rx="7" fill="${ink}"/>
    <path d="M-44 -8h76" stroke="${acc}" stroke-width="8" stroke-linecap="round"/>`,
  coiffeur: (ink, acc) => `
    <circle cx="-38" cy="52" r="26" fill="none" stroke="${ink}" stroke-width="13"/>
    <circle cx="38" cy="52" r="26" fill="none" stroke="${ink}" stroke-width="13"/>
    <path d="M-22 32L52 -84M22 32L-52 -84" stroke="${ink}" stroke-width="15" stroke-linecap="round"/>
    <circle cx="0" cy="6" r="7" fill="${acc}"/>`,
  fleuriste: (ink, acc) => `
    <path d="M0 4V-40M0 4C-6 -20-30 -34-44 -50M0 4C6 -20 30 -34 44 -50" fill="none" stroke="${ink}" stroke-width="8" stroke-linecap="round"/>
    <g fill="${acc}" stroke="${ink}" stroke-width="5">
      <circle cx="0" cy="-62" r="22"/><circle cx="-50" cy="-62" r="18"/><circle cx="50" cy="-62" r="18"/>
    </g>
    <g fill="${ink}"><circle cx="0" cy="-62" r="7"/><circle cx="-50" cy="-62" r="6"/><circle cx="50" cy="-62" r="6"/></g>
    <path d="M-48 4h96l-14 84h-68z" fill="${ink}"/>
    <path d="M-40 26h80" stroke="${acc}" stroke-width="8"/>`,
  superette: (ink, acc) => `
    <path d="M-92 -58h26l22 104h108l18-74H-56" fill="none" stroke="${ink}" stroke-width="13" stroke-linejoin="round" stroke-linecap="round"/>
    <g fill="${acc}" stroke="${ink}" stroke-width="5"><circle cx="-18" cy="-44" r="20"/><circle cx="22" cy="-50" r="22"/><circle cx="58" cy="-40" r="16"/></g>
    <path d="M-40 -12h112" stroke="${ink}" stroke-width="9" stroke-linecap="round"/>
    <circle cx="-26" cy="74" r="14" fill="${ink}"/><circle cx="58" cy="74" r="14" fill="${ink}"/>`,
  bar: (ink, acc) => `
    <path d="M-72 -70h144L8 6v58h34v18h-84v-18h34V6z" fill="${ink}" stroke="${ink}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M-44 -44h88L0 -2z" fill="${acc}"/>
    <circle cx="52" cy="-82" r="16" fill="none" stroke="${ink}" stroke-width="7"/>
    <path d="M40 -92l-24 26" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>`,
};

// Éléments posés devant la boutique, propres au métier.
const PROPS = {
  cafe: (v) => ardoise(1010, v) + table(165, v),
  coiffeur: (v) => poteau(1000, v) + plante(190, v),
  fleuriste: (v) => seaux(950, v) + seaux(160, v),
  superette: (v) => cageots(960, v) + cageots(140, v),
  bar: (v) => ardoise(1010, v) + tonneau(175, v),
};
function ardoise(x, v) { return `<g transform="translate(${x} 470)"><path d="M-48 70L-30 -60h60L48 70" fill="none" stroke="${C.encre}" stroke-width="10"/><rect x="-44" y="-62" width="88" height="96" rx="6" fill="${C.encre}" stroke="${v.door}" stroke-width="6"/><path d="M-26 -36h52M-26 -16h36M-26 4h46" stroke="${C.creme}" stroke-width="6" stroke-linecap="round" opacity=".85"/></g>`; }
function table(x, v) { return `<g transform="translate(${x} 470)"><circle cy="-36" r="0"/><rect x="-60" y="-20" width="120" height="14" rx="7" fill="${C.encre}"/><path d="M0 -6v76M-30 70h60" stroke="${C.encre}" stroke-width="10" stroke-linecap="round"/><path d="M-20 -40h30v20h-30zM10 -34h8a6 6 0 0 1 0 12h-8" fill="${v.awA}" stroke="${C.encre}" stroke-width="5"/></g>`; }
function poteau(x, v) { return `<g transform="translate(${x} 400)"><rect x="-22" y="-120" width="44" height="200" rx="22" fill="${C.creme}" stroke="${C.encre}" stroke-width="8"/><path d="M-22 -96l44 -26M-22 -46l44 -26M-22 4l44 -26M-22 54l44 -26" stroke="${C.brule}" stroke-width="14"/><rect x="-30" y="-136" width="60" height="22" rx="8" fill="${C.encre}"/><rect x="-30" y="76" width="60" height="22" rx="8" fill="${C.encre}"/><path d="M0 98v42" stroke="${C.encre}" stroke-width="10"/></g>`; }
function plante(x, v) { return `<g transform="translate(${x} 470)"><path d="M0 0C-50 -40-40 -110 0 -140C40 -110 50 -40 0 0z" fill="${C.surf2}" stroke="${C.encre}" stroke-width="6"/><path d="M0 0V-120" stroke="${C.encre}" stroke-width="6"/><path d="M-40 0h80l-12 70h-56z" fill="${C.brule}" stroke="${C.encre}" stroke-width="6"/></g>`; }
function seaux(x, v) { const f = (dx, col) => `<g transform="translate(${dx} 0)"><path d="M0 -10V-70" stroke="${C.encre}" stroke-width="5"/><circle cy="-84" r="18" fill="${col}" stroke="${C.encre}" stroke-width="5"/><circle cy="-84" r="5" fill="${C.encre}"/></g>`;
  return `<g transform="translate(${x} 470)">${f(-40, C.jaune)}${f(0, C.creme)}${f(40, C.or1)}${f(-20, C.brule)}${f(22, C.pale)}<path d="M-64 -10h128l-14 80h-100z" fill="${C.surf2}" stroke="${C.encre}" stroke-width="6"/><path d="M-56 18h112" stroke="${C.text2}" stroke-width="5"/></g>`; }
function cageots(x, v) { const cg = (dy, a, b) => `<g transform="translate(0 ${dy})"><g stroke="${C.encre}" stroke-width="4">${[-50, -18, 14, 46].map((cx, i) => `<circle cx="${cx}" cy="-16" r="15" fill="${i % 2 ? b : a}"/>`).join("")}</g><rect x="-70" y="-6" width="140" height="44" fill="${C.brule}" stroke="${C.encre}" stroke-width="6"/><path d="M-70 16h140" stroke="${C.encre}" stroke-width="4"/></g>`;
  return `<g transform="translate(${x} 520)">${cg(-56, C.or1, C.jaune)}${cg(0, C.creme, C.or2)}</g>`; }
function tonneau(x, v) { return `<g transform="translate(${x} 480)"><path d="M-46 -70C-60 -20-60 30-46 80h92C60 30 60 -20 46 -70z" fill="${C.brule}" stroke="${C.encre}" stroke-width="7"/><path d="M-56 -30h112M-56 40h112" stroke="${C.encre}" stroke-width="8"/><ellipse cy="-70" rx="46" ry="10" fill="${C.surf2}" stroke="${C.encre}" stroke-width="6"/></g>`; }

function cover(type, vi) {
  const v = V[vi], ink = C.encre, acc = vi === 1 ? C.jaune : vi === 2 ? C.creme : C.or1;
  // Briques discrètes sur le mur
  let bricks = "";
  for (let y = 40; y < 520; y += 46) for (let x = (y / 46) % 2 ? -40 : 0; x < 1200; x += 120) {
    if (x > 300 && x < 860 && y > 110) continue;
    bricks += `<rect x="${x + 6}" y="${y}" width="104" height="34" rx="3" fill="${v.wall2}"/>`;
  }
  // Store à festons (12 bandes)
  let awning = "", scallop = "";
  const ax = 330, aw = 540, n = 12, bw = aw / n;
  for (let i = 0; i < n; i++) {
    const x = ax + i * bw, col = i % 2 ? v.awB : v.awA;
    awning += `<path d="M${x} 212h${bw}l12 56h-${bw + 24}z" transform="translate(${-6 + (i - n / 2) * 1.2} 0)" fill="${col}"/>`;
    scallop += `<path d="M${x - 10} 266a${bw / 2 + 5} 22 0 0 0 ${bw + 10} 0z" fill="${col}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600" width="1200" height="600" role="img">
  <rect width="1200" height="600" fill="${v.wall}"/>
  ${bricks}
  <rect y="520" width="1200" height="80" fill="${v.walk}"/>
  <path d="M0 536h1200" stroke="${v.walk2}" stroke-width="6"/>
  <g>${[60, 300, 540, 780, 1020].map((x) => `<path d="M${x} 560h120" stroke="${v.walk2}" stroke-width="5" stroke-linecap="round"/>`).join("")}</g>
  <!-- façade -->
  <rect x="310" y="110" width="580" height="414" fill="${v.frame}"/>
  <rect x="330" y="128" width="540" height="72" rx="6" fill="${v.awA === C.encre ? C.surf : v.door}"/>
  <g transform="translate(600 166) scale(.3)">${ICON[type](acc, v.awA === C.creme ? C.brule : C.encre)}</g>
  <circle cx="380" cy="164" r="9" fill="${acc}"/><circle cx="820" cy="164" r="9" fill="${acc}"/>
  <!-- lampes -->
  <g fill="${ink}"><path d="M360 96h40l-8 18h-24z"/><path d="M800 96h40l-8 18h-24z"/></g>
  <g fill="${C.jaune}"><circle cx="380" cy="118" r="6"/><circle cx="820" cy="118" r="6"/></g>
  <!-- vitrine -->
  <rect x="340" y="268" width="340" height="236" fill="${v.glass}"/>
  <path d="M340 432h340" stroke="${ink}" stroke-width="8"/>
  <path d="M372 300l40 -26M372 330l70 -48" stroke="${C.creme}" stroke-width="10" stroke-linecap="round" opacity=".55"/>
  <g transform="translate(510 360) scale(.62)">${ICON[type](ink, vi === 2 ? C.brule : C.or1)}</g>
  <rect x="340" y="432" width="340" height="72" fill="${C.surf2}"/>
  <path d="M360 468h300" stroke="${C.trait}" stroke-width="6"/>
  <!-- porte -->
  <rect x="704" y="268" width="150" height="256" fill="${v.door}" stroke="${ink}" stroke-width="8"/>
  <rect x="724" y="292" width="110" height="110" rx="4" fill="${v.glass}"/>
  <path d="M724 347h110" stroke="${ink}" stroke-width="6"/>
  <circle cx="830" cy="430" r="8" fill="${C.jaune}" stroke="${ink}" stroke-width="4"/>
  <!-- store -->
  ${awning}${scallop}
  <rect x="322" y="204" width="556" height="12" rx="6" fill="${ink}"/>
  ${PROPS[type](v)}
</svg>
`;
}

function logo(type, vi) {
  const v = V[vi], acc = vi === 0 ? C.jaune : vi === 1 ? C.or1 : C.brule;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img">
  <rect width="256" height="256" fill="${v.logoBg}"/>
  <circle cx="128" cy="128" r="104" fill="none" stroke="${v.logoInk}" stroke-width="6" stroke-dasharray="2 12" stroke-linecap="round"/>
  <g transform="translate(128 132) scale(.78)">${ICON[type](v.logoInk, acc)}</g>
</svg>
`;
}

// Vraie photo du métier (scripts/commerce-photos/<metier>.jpg, 960×640) : si elle existe, la devanture est la
// photo, intégrée dans le SVG pour garder les mêmes adresses (aucune mise à jour de la base nécessaire).
const PHOTOS = path.join(__dirname, "commerce-photos");
function photoCover(type) {
  const f = path.join(PHOTOS, `${type}.jpg`);
  if (!fs.existsSync(f)) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 640" width="960" height="640" role="img"><image width="960" height="640" preserveAspectRatio="xMidYMid slice" href="data:image/jpeg;base64,${fs.readFileSync(f).toString("base64")}"/></svg>\n`;
}

fs.mkdirSync(OUT, { recursive: true });
for (const type of Object.keys(ICON)) for (let vi = 0; vi < 3; vi++) {
  fs.writeFileSync(path.join(OUT, `${type}-${vi + 1}.svg`), photoCover(type) || cover(type, vi));
  fs.writeFileSync(path.join(OUT, `${type}-logo-${vi + 1}.svg`), logo(type, vi));
}
console.log("Visuels écrits dans " + path.relative(process.cwd(), OUT));
