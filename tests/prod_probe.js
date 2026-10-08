// À relancer après chaque déploiement important (avec l'accord des fondateurs) :
//   NODE_USE_ENV_PROXY=1 node tests/prod_probe.js firestore.rules /tmp/rapport.txt
// Crée un compte jetable, lit tout ce qu'il peut, puis supprime le compte. N'affiche jamais de donnée personnelle.
// Test d'attaque sur la VRAIE base NOOVA (autorisé par le propriétaire). Lecture seule envers les autres comptes.
// Ce que fait un attaquant : il ne connaît que la clé publique de l'app (visible dans la page) et se crée un compte.
// Rien de personnel n'est jamais affiché : seulement collection, nom de champ et nombre de documents.
const fs = require('fs'), crypto = require('crypto');
const KEY = 'AIzaSyCU52SgKoIS_P-SEiXFC4d8lQ1rz5mG4to', P = 'noova-366d0';
const FS = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents`;
const FN = n => `https://europe-west1-${P}.cloudfunctions.net/${n}`;
const rules = fs.readFileSync(process.argv[2], 'utf8');
const colls = [...new Set([...rules.matchAll(/^    match \/([A-Za-z_]+)\/\{/gm)].map(m => m[1]))].concat(['mail', 'rateLimits', 'emailIndex']);
const H = t => t ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t } : { 'Content-Type': 'application/json' };
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, PHONE = /(?:\+33|0)\s?[1-9](?:[\s.-]?\d{2}){4}/, SIRET = /\b\d{14}\b/;
const PII_KEYS = /^(email|phone|tel|telephone|mobile|lastName|birth|birthDate|siret|iban|fcmTokens|idDoc|kbis|password|ownerAddress|firstName)$/i;
const out = [];
const log = s => { out.push(s); console.log(s); };
function walk(fields, path, hits) {
  for (const [k, v] of Object.entries(fields || {})) {
    const p = path ? path + '.' + k : k;
    if (PII_KEYS.test(k)) hits.add('champ « ' + p + ' »');
    if (v.mapValue) walk(v.mapValue.fields, p, hits);
    else if (v.arrayValue) (v.arrayValue.values || []).forEach(x => x.mapValue ? walk(x.mapValue.fields, p, hits) : x.stringValue && scan(x.stringValue, p, hits));
    else if (v.stringValue) scan(v.stringValue, p, hits);
  }
}
function scan(s, p, hits) {
  if (EMAIL.test(s)) hits.add('e-mail dans « ' + p + ' »');
  if (PHONE.test(s) && !/^https?:/.test(s)) hits.add('n° de téléphone dans « ' + p + ' »');
  if (SIRET.test(s) && !/^https?:/.test(s)) hits.add('n° à 14 chiffres dans « ' + p + ' »');
}
async function sweep(label, t, extraAllowed = () => false) {
  log(`\n── ${label}`);
  let readableColls = 0;
  for (const c of colls) {
    const r = await fetch(`${FS}:runQuery`, { method: 'POST', headers: H(t), body: JSON.stringify({ structuredQuery: { from: [{ collectionId: c }], limit: 25 } }) });
    if (r.status !== 200) continue;
    const rows = (await r.json()).filter(x => x.document);
    const hits = new Set();
    rows.forEach(x => walk(x.document.fields, '', hits));
    const bad = [...hits].filter(h => !extraAllowed(c, h));
    readableColls++;
    log(`  ${c} : liste lisible (${rows.length} doc.)` + (bad.length ? `  ⚠ ${bad.join(', ')}` : ''));
    if (bad.length) LEAKS.push(c + ' : ' + bad.join(', '));
  }
  for (const cg of ['messages', 'notifications', 'quotaLedger', 'likes', 'comments', 'votes']) {
    const r = await fetch(`${FS}:runQuery`, { method: 'POST', headers: H(t), body: JSON.stringify({ structuredQuery: { from: [{ collectionId: cg, allDescendants: true }], limit: 5 } }) });
    if (r.status === 200) { const rows = (await r.json()).filter(x => x.document); if (rows.length) { log(`  ⚠ sous-collections « ${cg} » de tout le monde : ${rows.length} doc. lisibles`); LEAKS.push('groupe ' + cg); } }
  }
  if (!readableColls) log('  aucune collection lisible');
}
const LEAKS = [];
(async () => {
  log('Test d\'attaque — base de production ' + P + ' — ' + new Date().toISOString());
  await sweep('1. Sans compte (visiteur anonyme)', null);
  const r0 = await fetch(`${FS}/users`, { headers: H() }); log(`  lecture directe /users sans compte : HTTP ${r0.status}`);

  // 2. Compte d'attaque créé comme le ferait n'importe qui
  const email = `audit.securite.${crypto.randomBytes(4).toString('hex')}@example.com`, password = crypto.randomBytes(18).toString('base64url') + '!aA9';
  const su = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, { method: 'POST', headers: H(), body: JSON.stringify({ email, password, returnSecureToken: true }) })).json();
  if (!su.idToken) { log('Création du compte de test impossible : ' + JSON.stringify(su.error && su.error.message)); return finish(); }
  const T = su.idToken, uid = su.localId;
  log(`\nCompte de test créé (${email})`);
  try {
    await sweep('2. Connecté, sans profil', T);
    // 3. Profil d'habitant au Mans (comme une vraie inscription) : accès aux données de la ville
    const doc = { fields: { role: { stringValue: 'user' }, name: { stringValue: 'Audit' }, city: { stringValue: 'le-mans' }, cityLabel: { stringValue: 'Le Mans' }, email: { stringValue: email }, onboardingStep: { stringValue: 'done' }, discoverable: { booleanValue: false } } };
    const cr = await fetch(`${FS}/users?documentId=${uid}`, { method: 'POST', headers: H(T), body: JSON.stringify(doc) });
    log(`\nProfil de test créé au Mans : HTTP ${cr.status}`);
    await new Promise(r => setTimeout(r, 4000));
    // Vitrines : l'adresse professionnelle d'un commerce est publique (voulu) ; noms du classement : prénom + initiale.
    await sweep('3. Habitant connecté au Mans (le cas réel)', T);
    // Requêtes exactement comme l'app (filtrées sur la ville) : ce qu'un habitant du Mans peut réellement lire.
    log('  ── lectures filtrées sur la ville (comme l\'app)');
    const Q = async (coll, field, val, lim = 300) => { const r = await fetch(`${FS}:runQuery`, { method: 'POST', headers: H(T), body: JSON.stringify({ structuredQuery: { from: [{ collectionId: coll }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: val } } }, limit: lim } }) }); return r.status === 200 ? (await r.json()).filter(x => x.document) : r.status; };
    for (const [coll, field] of [['cityBoard', 'city'], ['merchantsPublic', 'city'], ['campaigns', 'targetCity'], ['rewards', 'city'], ['communityEvents', 'city'], ['weeklyQuestions', 'city'], ['merchantPosts', 'city'], ['users', 'city'], ['merchants', 'city'], ['answers', 'city']]) {
      const rows = await Q(coll, field, 'le-mans');
      if (typeof rows === 'number') { log(`  ${coll} (ville) : refusé (HTTP ${rows})`); continue; }
      const hits = new Set(); rows.forEach(x => walk(x.document.fields, '', hits));
      log(`  ${coll} (ville) : ${rows.length} doc. lisibles` + (hits.size ? `  ⚠ ${[...hits].join(', ')}` : ', aucune donnée personnelle'));
      if (hits.size) LEAKS.push(coll + ' (ville) : ' + [...hits].join(', '));
    }
    const board = await Q('cityBoard', 'city', 'le-mans');
    if (typeof board !== 'number') { const long = board.filter(x => { const n = ((x.document.fields.name || {}).stringValue) || ''; return n.split(/\s+/).length > 1 && !/^\S+ \S\.$/.test(n); }).length;
      log(`  classement du Mans : ${board.length} habitants, ${long} nom(s) au-delà de « Prénom I. »`); if (long) LEAKS.push(`classement : ${long} nom(s) complets`); }
    const and = (f) => ({ compositeFilter: { op: 'AND', filters: f.map(([k, v]) => ({ fieldFilter: { field: { fieldPath: k }, op: 'EQUAL', value: typeof v === 'boolean' ? { booleanValue: v } : { stringValue: v } } })) } });
    for (const [lbl, where] of [['vitrines du Mans', and([['status', 'verified'], ['city', 'le-mans']])], ['vitrine du compte NOOVA', and([['broadcast', true], ['status', 'verified']])]]) {
      const r = await fetch(`${FS}:runQuery`, { method: 'POST', headers: H(T), body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'merchantsPublic' }], where, limit: 300 } }) });
      if (r.status !== 200) { log(`  ${lbl} : refusé (HTTP ${r.status})`); continue; }
      const rows = (await r.json()).filter(x => x.document); const hits = new Set(); rows.forEach(x => walk(x.document.fields, '', hits));
      const addr = lbl.includes('NOOVA') ? rows.filter(x => x.document.fields.address || x.document.fields.lat).length : 0;
      log(`  ${lbl} : ${rows.length} lisible(s)` + (hits.size ? `  ⚠ ${[...hits].join(', ')}` : ', ni e-mail, ni téléphone, ni SIRET') + (lbl.includes('NOOVA') ? `, ${addr} avec adresse/position` : ''));
      if (hits.size) LEAKS.push(lbl + ' : ' + [...hits].join(', ')); if (addr) LEAKS.push('vitrine NOOVA avec adresse');
    }
    const cb = await fetch(`${FS}:runQuery`, { method: 'POST', headers: H(T), body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'cityBoard' }], limit: 300 } }) });
    if (cb.status === 200) {
      const rows = (await cb.json()).filter(x => x.document).map(x => x.document.fields);
      const long = rows.filter(f => { const n = (f.name && f.name.stringValue) || ''; return n.split(/\s+/).length > 1 && !/^\S+ \S\.$/.test(n); }).length;
      log(`  classement : ${rows.length} habitants, ${long} nom(s) qui ne sont pas « Prénom I. »`);
      if (long) LEAKS.push(`classement : ${long} nom(s) complets`);
    }
    const np = await fetch(`${FS}/merchantsPublic`, { headers: H(T) });
    const pub = await fetch(`${FS}:runQuery`, { method: 'POST', headers: H(T), body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'merchantsPublic' }], where: { fieldFilter: { field: { fieldPath: 'broadcast' }, op: 'EQUAL', value: { booleanValue: true } } }, limit: 5 } }) });
    if (pub.status === 200) {
      const rows = (await pub.json()).filter(x => x.document).map(x => x.document.fields);
      const withAddr = rows.filter(f => f.address || f.lat || f.lng).length;
      log(`  vitrine du compte NOOVA : ${rows.length} trouvée(s), ${withAddr} avec adresse ou position`);
      if (withAddr) LEAKS.push('vitrine NOOVA avec adresse');
    }
    log('\n── 4. Fonctions serveur : non testables d\'ici (réseau de la session), couvertes par les tests locaux');
  } finally {
    // 5. Nettoyage : profil puis compte supprimés
    const d1 = await fetch(`${FS}/users/${uid}`, { method: 'DELETE', headers: H(T) });
    const d2 = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${KEY}`, { method: 'POST', headers: H(), body: JSON.stringify({ idToken: T }) });
    log(`\nNettoyage : profil supprimé (HTTP ${d1.status}), compte supprimé (HTTP ${d2.status})`);
  }
  finish();
})().catch(e => { log('ERREUR ' + e.message); finish(); });
function finish() {
  log('\n════ Résultat : ' + (LEAKS.length ? LEAKS.length + ' problème(s) : ' + LEAKS.join(' | ') : 'aucune donnée personnelle accessible'));
  fs.writeFileSync(process.argv[3], out.join('\n'));
}
