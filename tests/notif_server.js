process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FUNCTIONS_EMULATOR = 'true';
const admin = require(__dirname+'/helpers/admin');
admin.initializeApp({ projectId: 'noova-366d0' });
const db = admin.firestore();
const { Timestamp } = admin.firestore;
const N = require(__dirname+'/../functions/notifications.js')._t;
const P = require(__dirname+'/../functions/points.js')._t;
const CFG = require(__dirname+'/../functions/engagementConfig.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (x !== undefined && (!ok || process.env.V) ? '  -> ' + JSON.stringify(x) : '')); };
const T = async (n, fn) => { try { await fn(); } catch (e) { fail++; console.log('FAIL ' + n + ' (exception) -> ' + String(e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const until = async (fn, ms = 12000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(250); } return false; };

const D1 = '2026-01-14';                                     // mercredi, heure d'hiver (UTC+1)
const at = (day, hm) => Date.parse(`${day}T${hm}:00+01:00`);
const addDays = (day, n) => new Date(Date.parse(day + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const setClock = ms => db.doc('_testClock/now').set({ ms });
const sink = async (uid) => (await db.collection('_pushSink').where('uid', '==', uid).get()).docs.map(d => d.data()).sort((a, b) => a.at - b.at);
const QUESTION = 'Quelle est ta boisson préférée ?';

async function wipe() {
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents', { method: 'DELETE' });
  await sleep(300);
}
async function mkUser(uid, o = {}) {
  await db.doc('users/' + uid).set({ role: 'user', name: 'User ' + uid, city: 'le-mans', pushEnabled: true, fcmTokens: ['tok_' + uid], authorizedMerchants: ['m1'], declinedMerchants: [], interests: ['restauration'], answeredCampaigns: [], friendUids: [], points: 0, xp: 0, streak: 0, ...o });
}
async function mkMerchant(id, o = {}) {
  await db.doc('merchants/' + id).set({ brandName: 'Le Fournil', name: 'Le Fournil', sector: 'Boulangerie', city: 'le-mans', cityLabel: 'Le Mans', status: 'verified', email: id + '@shop.fr', ...o });
}
async function mkCampaign(id, o = {}) {
  await db.doc('campaigns/' + id).set({ merchantId: 'm1', merchantName: 'Le Fournil', status: 'active', targetCity: 'le-mans', city: 'le-mans', question: QUESTION, questions: [{ q: QUESTION, format: 'mcq', options: ['Café', 'Thé'] }], targetVolume: 500, answersCount: 0, name: 'Boissons', createdAt: Timestamp.now(), ...o });
}
async function mkReward(id, o = {}) {
  await db.doc('rewards/' + id).set({ merchantId: 'm2', merchantName: 'Café de la place', city: 'le-mans', label: 'café', cost: 200, status: 'approved', active: true, ...o });
}
const tick = (day, hm) => N.runTick(at(day, hm));

(async () => {
  // ═════════ QUESTION DU JOUR ═════════
  await T('qdj', async () => {
    await wipe();
    await mkMerchant('m1'); await mkCampaign('c1');
    await mkUser('u1');                                              // heure par défaut 12h30
    await tick(D1, '12:29'); check('QDJ : rien avant 12h30 (heure par défaut)', (await sink('u1')).length === 0);
    await tick(D1, '12:30');
    let s = await sink('u1');
    check('QDJ : envoyée à 12h30 par défaut', s.length === 1);
    check('QDJ : titre nomme le commerce, corps écrit le gain', s[0] && s[0].title === 'Le Fournil veut ton avis' && s[0].body === '30 secondes, +10 points', s[0] && [s[0].title, s[0].body]);
    check('QDJ : la question n\'est PAS révélée (pas de spoil)', s[0] && !(s[0].title + s[0].body).includes('boisson') && !(s[0].title + s[0].body).includes(QUESTION));
    await tick(D1, '12:45'); await tick(D1, '15:00');
    check('QDJ : une seule par jour', (await sink('u1')).length === 1);
    await tick(addDays(D1, 1), '12:30');
    check('QDJ : renvoyée le lendemain', (await sink('u1')).length === 2);
  });
  await T('qdj habit', async () => {
    await wipe();
    await mkMerchant('m1'); await mkCampaign('c1');
    await mkUser('u1', { answerMinutes: [500, 505, 510, 520, 530] });   // ~8h40 -> ramené à 9h (silence 21h-9h)
    await mkUser('u2', { answerMinutes: [1130, 1140, 1150, 1160, 1170] }); // ~19h00
    await mkUser('u3', { answerMinutes: [1300, 1310, 1320, 1330, 1340] }); // ~22h -> ramené à 20h45
    await mkUser('u4', { answerMinutes: [60, 1140, 1145, 1150, 1155] });   // médiane des 5 dernières
    await tick(D1, '08:59'); check('Habitude : jamais avant 9h', (await sink('u1')).length === 0);
    await tick(D1, '09:00'); check('Habitude : ~8h40 -> envoyée à 9h', (await sink('u1')).length === 1);
    await tick(D1, '19:09'); check('Habitude : pas avant l\'heure de u2', (await sink('u2')).length === 0);
    await tick(D1, '19:10'); check('Habitude : médiane des 5 dernières réponses (19h10)', (await sink('u2')).length === 1);
    await tick(D1, '20:44'); check('Habitude : 22h ramenée avant le silence, pas avant 20h45', (await sink('u3')).length === 0);
    await tick(D1, '20:45'); check('Habitude : 22h -> 20h45', (await sink('u3')).length === 1);
    check('Habitude : médiane robuste à une valeur isolée', N.habitMinutes({ answerMinutes: [60, 1140, 1145, 1150, 1155] }) === 1145);
    check('Habitude : par défaut 12h30', N.habitMinutes({}) === 750);
  });
  await T('qdj conditions', async () => {
    await wipe();
    await mkMerchant('m1'); await mkCampaign('c1');
    await mkUser('a', { dailyAnswerDate: D1, dailyAnswerCount: 1 });                   // a déjà répondu
    await mkUser('b', { answeredCampaigns: ['c1'] });                                  // plus de question dispo
    await mkUser('c', { authorizedMerchants: [] });                                    // commerce non autorisé
    await mkUser('d', { notifPrefs: { question: false } });                            // réglage coupé
    await mkUser('e', { fcmTokens: [] });                                              // pas de push
    await mkUser('f', { city: 'angers' });                                             // autre ville
    await mkUser('g', { dailyAnswerDate: addDays(D1, -1), dailyAnswerCount: 2 });      // a répondu HIER -> reçoit
    await tick(D1, '13:00');
    const got = {};
    for (const u of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) got[u] = (await sink(u)).length;
    check('QDJ : jamais le jour où il a déjà répondu', got.a === 0, got);
    check('QDJ : jamais sans question à répondre', got.b === 0 && got.c === 0 && got.f === 0, got);
    check('QDJ : respecte l\'interrupteur du type', got.d === 0);
    check('QDJ : jamais sans jeton push', got.e === 0);
    check('QDJ : réponse d\'hier n\'empêche pas l\'envoi d\'aujourd\'hui', got.g === 1, got);
  });
  await T('imminent', async () => {
    await wipe();
    await mkMerchant('m1'); await mkCampaign('c1'); await mkReward('r1');
    await mkUser('two', { points: 185 }); await mkUser('one', { points: 195 }); await mkUser('far', { points: 100 }); await mkUser('off', { points: 195, notifPrefs: { recompenses: false } });
    await tick(D1, '12:30');
    const two = await sink('two'), one = await sink('one'), far = await sink('far'), off = await sink('off');
    check('Récompense imminente (2 réponses) fusionnée avec la question du jour', two.length === 1 && two[0].title === 'Plus que 2 réponses' && two[0].body === 'et ton café chez Café de la place est à toi', two[0] && [two[0].title, two[0].body]);
    check('Récompense imminente (1 réponse)', one.length === 1 && one[0].title === 'Plus qu\'une réponse', one[0] && one[0].title);
    check('Loin du seuil : question du jour normale', far.length === 1 && far[0].title === 'Le Fournil veut ton avis');
    check('Jamais envoyée seule : une seule notification, type question_du_jour', two.length === 1 && two[0].ntype === 'question_du_jour');
    check('« Mes récompenses » coupé : pas de fusion, question normale', off.length === 1 && off[0].title === 'Le Fournil veut ton avis');
    const nb = await db.collection('_pushSink').get();
    check('Aucune notification d\'imminence isolée', nb.docs.every(d => d.data().ntype === 'question_du_jour'));
  });

  // ═════════ PLAFOND, SILENCE, EXCEPTIONS ═════════
  await T('cap', async () => {
    await wipe();
    await mkMerchant('m1'); await mkCampaign('c1');
    await mkUser('u', { streak: 5, lastAnswerDate: addDays(D1, -1) });
    await tick(D1, '12:30');
    await tick(D1, '20:00');
    let s = await sink('u');
    check('Plafond : QDJ 12h30 + série en danger 20h = 2 (normale + exceptionnelle)', s.length === 2 && s.map(x => x.ntype).join() === 'question_du_jour,serie_en_danger', s.map(x => x.ntype));
    check('Série en danger : titre et consigne (3 réponses), sans culpabilisation', s[1] && s[1].title === 'Ta série est à 5 jours' && /réponds à 3 questions/.test(s[1].body) && !/manqu|perds|derni/i.test(s[1].title + s[1].body), s[1] && [s[1].title, s[1].body]);
    const now = at(D1, '20:30');
    const r1 = await N.deliver('u', 'ami', N.copy.amiRequest({ name: 'Zoé' }), { key: 'x1', now });
    check('Plafond : une 3e notification NORMALE (pas exceptionnelle) est refusée — 2 normales par jour au maximum', r1.status === 'skip' && r1.reason === 'cap', r1);
    const r2 = await N.deliver('u', 'recompense_debloquee', N.copy.recompense({ reward: 'café', merchant: 'Café', cost: 200 }), { key: 'x2', now });
    check('Plafond : une notification EXCEPTIONNELLE peut prendre le 3e créneau du jour — jusqu\'à 3 au total', r2.status === 'sent', r2);
    check('Plafond : 3 envoyées ce jour-là', (await sink('u')).length === 3);
    const r3 = await N.deliver('u', 'recompense_debloquee', N.copy.recompense({ reward: 'thé', merchant: 'Café', cost: 300 }), { key: 'x3', now: at(D1, '20:31') });
    check('Plafond : une 4e, même exceptionnelle, est refusée — jamais plus de 3 par jour, reportée au lendemain', r3.status === 'queued', r3);
    await N.drainQueue(at(addDays(D1, 1), '09:00'));
    const s2 = await sink('u');
    check('Reportée : envoyée le lendemain à 9h (4e au total)', s2.length === 4 && s2[3].ntype === 'recompense_debloquee', s2.map(x => x.ntype));
  });
  await T('quiet', async () => {
    await wipe();
    await mkUser('u');
    const r = await N.deliver('u', 'nouveau_commerce', N.copy.nouveauCommerce({ merchant: 'Le Fournil', known: true }), { key: 'k', now: at(D1, '22:00') });
    check('Silence 21h-9h : nouveau commerce mis en attente', r.status === 'queued' && (await sink('u')).length === 0, r);
    await N.drainQueue(at(addDays(D1, 1), '08:59')); check('Silence : toujours rien à 8h59', (await sink('u')).length === 0);
    await N.drainQueue(at(addDays(D1, 1), '09:00')); check('Silence : envoyée à 9h', (await sink('u')).length === 1);
    const r2 = await N.deliver('u', 'question_du_jour', N.copy.questionDuJour({ merchant: 'X' }), { key: 'q', now: at(addDays(D1, 2), '07:30') });
    check('Silence : la question du jour n\'est jamais envoyée la nuit', r2.status === 'skip' && r2.reason === 'quiet', r2);
    check('Silence : 21h00 pile est déjà silencieux', N.parisParts(at(D1, '21:00')).min >= 21 * 60);
  });
  await T('own action exempt', async () => {
    await wipe();
    await mkUser('u', { dailyAnswerDate: D1, dailyAnswerCount: 2 });
    const now = at(D1, '15:00');
    const a = await N.deliver('u', 'nouveau_commerce', N.copy.nouveauCommerce({ merchant: 'X', known: true }), { key: 'a', now });
    const b = await N.deliver('u', 'ami', N.copy.amiRequest({ name: 'Zoé' }), { key: 'b', now });
    check('Déjà répondu aujourd\'hui : les relances (commerce, ami) sont supprimées', a.reason === 'answered_today' && b.reason === 'answered_today', [a, b]);
    const c = await N.deliver('u', 'recompense_debloquee', N.copy.recompense({ reward: 'café', merchant: 'Café', cost: 200 }), { key: 'c', now });
    check('Déjà répondu : la récompense débloquée (fruit de sa réponse) reste envoyée', c.status === 'sent', c);
  });

  // ═════════ NOUVEAU COMMERCE (déclencheur réel) ═════════
  await T('new merchant', async () => {
    await wipe();
    await setClock(at(D1, '14:00'));
    await mkMerchant('m2', { brandName: 'Boulangerie Martin', sector: 'Boulangerie' });
    await mkUser('A', { interests: ['boulangerie'], authorizedMerchants: [] });
    await mkUser('B', { interests: ['sport'], authorizedMerchants: [] });
    await mkUser('C', { city: 'angers', interests: ['boulangerie'] });
    await mkUser('D', { interests: ['boulangerie'], authorizedMerchants: ['m2'] });
    await mkUser('E', { interests: ['boulangerie'], authorizedMerchants: [], declinedMerchants: ['m2'] });
    await mkUser('F', { interests: ['boulangerie'], authorizedMerchants: [], fcmTokens: [] });
    await mkUser('G', { interests: [], authorizedMerchants: [] });                       // ancien profil : tout
    await mkCampaign('n1', { merchantId: 'm2', merchantName: 'Boulangerie Martin', sector: 'Boulangerie' });
    await until(async () => (await db.collection('_pushSink').get()).size >= 3);
    await sleep(800);
    const has = async u => (await sink(u)).length;
    check('Nouveau commerce : habitant de la ville et de la catégorie', await has('A') === 1);
    const sa = await sink('A');
    check('Nouveau commerce (pas encore autorisé) : titre, corps, sans spoil', sa[0] && sa[0].title === 'Boulangerie Martin veut te poser une question' && !sa[0].body.includes('boisson'), sa[0] && [sa[0].title, sa[0].body]);
    const sd = await sink('D');
    check('Nouveau commerce (déjà autorisé) : « veut ton avis » + gain', sd[0] && sd[0].title === 'Boulangerie Martin veut ton avis' && sd[0].body === '30 secondes, +10 points', sd[0] && [sd[0].title, sd[0].body]);
    check('Nouveau commerce : pas hors catégorie / autre ville / refus / sans push', await has('B') === 0 && await has('C') === 0 && await has('E') === 0 && await has('F') === 0);
    check('Nouveau commerce : profil ancien sans catégorie = tout', await has('G') === 1);
    await mkMerchant('m3', { brandName: 'Salon Belle', sector: 'Beauté' });
    await setClock(at(addDays(D1, 2), '14:00'));
    await mkCampaign('n2', { merchantId: 'm3', merchantName: 'Salon Belle', sector: 'Beauté' });
    await sleep(3000);
    check('Nouveau commerce : maximum 1 par semaine et par habitant', await has('G') === 1 && await has('A') === 1);
    await setClock(at(addDays(D1, 9), '14:00'));
    await mkCampaign('n3', { merchantId: 'm3', merchantName: 'Salon Belle 2', sector: 'Beauté' });
    await until(async () => (await sink('G')).length === 2);
    check('Nouveau commerce : de nouveau possible après 7 jours', (await sink('G')).length === 2);
    await setClock(at(addDays(D1, 10), '22:30'));
    await mkCampaign('n4', { merchantId: 'm3', merchantName: 'Salon Nuit', sector: 'Beauté' });
    await sleep(3000);
    const q = await db.collection('notifQueue').get();
    check('Nouveau commerce lancé la nuit : mis en file jusqu\'à 9h (ou refusé par la limite hebdo)', q.size >= 0 && (await sink('G')).length === 2);
  });

  // ═════════ RÉSULTAT DISPONIBLE, RÉCOMPENSE, AMIS, CODE ═════════
  await T('results', async () => {
    await wipe();
    await setClock(at(D1, '14:00'));
    await mkMerchant('m1');
    await mkCampaign('c50', { answersCount: 49 });
    const batch = db.batch();
    for (let i = 0; i < 50; i++) {
      await mkUser('r' + i, { authorizedMerchants: ['m1'], dailyAnswerDate: '2000-01-01', dailyAnswerCount: 0 });
      batch.set(db.doc(`answers/r${i}_c50_q0`), { userId: 'r' + i, campaignId: 'c50', merchantId: 'm1', questionIdx: 0, answer: i < 31 ? 'Café' : 'Thé', pointsAwarded: 0, flagged: false, brand: 'Le Fournil' });
    }
    await batch.commit();
    await sleep(2500);
    await db.doc('campaigns/c50').update({ answersCount: 50 });
    await until(async () => (await db.collection('_pushSink').get()).size >= 50, 20000);
    const a = await sink('r0'), b = await sink('r40');
    check('Résultat dispo : envoyé aux 50 répondants au 50e', (await db.collection('_pushSink').get()).size === 50);
    check('Résultat dispo : « 62 % de tes voisins pensent comme toi »', a[0] && a[0].title === '62 % de tes voisins pensent comme toi' && a[0].body === 'Découvre le résultat de Le Fournil', a[0] && [a[0].title, a[0].body]);
    check('Résultat dispo : pourcentage propre à chaque réponse (38 %)', b[0] && b[0].title === '38 % de tes voisins pensent comme toi', b[0] && b[0].title);
    await db.doc('campaigns/c50').update({ answersCount: 51 }); await sleep(2500);
    check('Résultat dispo : une seule fois', (await db.collection('_pushSink').get()).size === 50);
    await mkCampaign('ctext', { answersCount: 49, questions: [{ q: QUESTION, format: 'text' }], format: 'text' });
    for (let i = 0; i < 3; i++) await db.doc(`answers/r${i}_ctext_q0`).set({ userId: 'r' + i, campaignId: 'ctext', merchantId: 'm1', questionIdx: 0, answer: 'libre ' + i, pointsAwarded: 0, flagged: false, brand: 'Le Fournil' });
    await setClock(at(addDays(D1, 1), '14:00'));
    await db.doc('campaigns/ctext').update({ answersCount: 50 });
    await until(async () => (await sink('r0')).length === 2);
    const t = (await sink('r0'))[1];
    check('Résultat dispo (réponse libre) : formulation sans pourcentage', t && t.title === 'Les résultats de Le Fournil sont là', t && t.title);
  });
  await T('reward unlocked', async () => {
    await wipe();
    await setClock(at(D1, '15:00'));
    await mkReward('r1'); await mkUser('u', { points: 205, dailyAnswerDate: D1, dailyAnswerCount: 1 });
    await db.doc('answers/u_cx_q0').set({ userId: 'u', campaignId: 'cx', questionIdx: 0, answer: 'Café', pointsAwarded: 10, flagged: false, brand: 'Le Fournil' });
    await until(async () => (await sink('u')).length === 1);
    const s = await sink('u');
    check('Récompense débloquée : « Ton café chez Café de la place est à toi »', s[0] && s[0].title === 'Ton café chez Café de la place est à toi' && s[0].body === 'Échange-le contre tes 200 points', s[0] && [s[0].title, s[0].body]);
    check('Récompense débloquée : envoyée même le jour de la réponse', s.length === 1 && s[0].ntype === 'recompense_debloquee');
    await db.doc('users/u').update({ points: 215 });
    await db.doc('answers/u_cy_q0').set({ userId: 'u', campaignId: 'cy', questionIdx: 0, answer: 'Café', pointsAwarded: 10, flagged: false, brand: 'X' });
    await sleep(2500);
    check('Récompense : rien si le seuil n\'est pas franchi par cette réponse', (await sink('u')).length === 1);
  });
  await T('friends', async () => {
    await wipe();
    await setClock(at(D1, '16:00'));
    await mkUser('A', { friendUids: ['B'] }); await mkUser('B', { friendUids: ['A'] }); await mkUser('C', { friendUids: ['A'] });   // C->A non réciproque
    await mkUser('Z');
    await db.doc('users/Z/notifications/friendreq_A').set({ type: 'friend_request', fromUid: 'A', fromName: 'Alice', read: false });
    await until(async () => (await sink('Z')).length === 1);
    const z = await sink('Z');
    check('Ami : demande reçue -> « Alice veut être ton ami »', z[0] && z[0].title === 'Alice veut être ton ami', z[0] && z[0].title);
    await db.doc('users/Z/notifications/friendacc_B').set({ type: 'friend_accepted', fromUid: 'B', fromName: 'Bob', read: false });
    await sleep(2500);
    check('Ami : 1 par jour maximum', (await sink('Z')).length === 1);
    await db.doc('answers/A_c1_q0').set({ userId: 'A', campaignId: 'c1', questionIdx: 0, answer: 'Café', pointsAwarded: 10, flagged: false, brand: 'Le Fournil' });
    await sleep(1500);
    await db.doc('answers/B_c1_q0').set({ userId: 'B', campaignId: 'c1', questionIdx: 0, answer: 'café ', pointsAwarded: 10, flagged: false, brand: 'Le Fournil' });
    await until(async () => (await sink('A')).length === 1);
    const a = await sink('A');
    check('Ami : « Bob a répondu comme toi » envoyé à celui qui avait répondu avant', a[0] && a[0].title === 'User B a répondu comme toi' && a[0].body === 'Sur une question de Le Fournil', a[0] && [a[0].title, a[0].body]);
    check('Ami : ni la question ni la réponse ne sont révélées', a[0] && !/Café|café|boisson/.test(a[0].title + a[0].body));
    await db.doc('answers/C_c1_q0').set({ userId: 'C', campaignId: 'c1', questionIdx: 0, answer: 'Café', pointsAwarded: 10, flagged: false, brand: 'Le Fournil' });
    await sleep(2500);
    check('Ami : amitié non réciproque = aucune notification', (await sink('A')).length === 1);
    await mkUser('D', { friendUids: ['A'] }); await db.doc('users/A').update({ friendUids: ['B', 'D'] });
    await db.doc('answers/D_c1_q0').set({ userId: 'D', campaignId: 'c1', questionIdx: 0, answer: 'Thé', pointsAwarded: 10, flagged: false, brand: 'Le Fournil' });
    await sleep(2500);
    check('Ami : réponse différente = aucune notification', (await sink('A')).length === 1);
  });
  await T('code expire', async () => {
    await wipe();
    await mkUser('u');
    const soon = Timestamp.fromMillis(at(D1, '15:00') + 20 * 3600000), far = Timestamp.fromMillis(at(D1, '10:00') + 5 * 86400000);
    await db.doc('redemptions/red1').set({ userId: 'u', status: 'pending', label: 'café', merchantName: 'Café de la place', code: 'AB7K', expiresAt: soon, merchantId: 'm2' });
    await db.doc('redemptions/red2').set({ userId: 'u', status: 'pending', label: 'gâteau', merchantName: 'Café de la place', code: 'ZZ22', expiresAt: far, merchantId: 'm2' });
    await db.doc('redemptions/red3').set({ userId: 'u', status: 'used', label: 'thé', merchantName: 'Café de la place', code: 'QQ11', expiresAt: soon, merchantId: 'm2' });
    await tick(D1, '10:45'); check('Code : jamais avant 11h', (await sink('u')).length === 0);
    await tick(D1, '11:00');
    const s = await sink('u');
    check('Code : à 11h, une seule notification (pas le code lointain ni le code utilisé)', s.length === 1 && /café/.test(s[0].title), s.map(x => x.title));
    check('Code : le code lui-même n\'apparaît jamais dans la notification', s[0] && !/AB7K/.test(s[0].title + s[0].body), s[0] && [s[0].title, s[0].body]);
    check('Code : titre < 60 caractères, échéance et commerce nommés', s[0] && s[0].title.length < 60 && /expire/.test(s[0].title) && /Café de la place/.test(s[0].body), s[0] && [s[0].title, s[0].body]);
    await tick(D1, '11:15'); check('Code : une seule fois par code', (await sink('u')).length === 1);
  });

  // ═════════ DÉCROISSANCE, OUVERTURES, RÉGLAGES, MÉTRIQUES ═════════
  await T('decay', async () => {
    await wipe();
    await mkUser('u');
    let day = D1, sent = 0, log = [];
    const send = async (d) => { const r = await N.deliver('u', 'question_du_jour', N.copy.questionDuJour({ merchant: 'X' }), { key: d, now: at(d, '12:30') }); if (r.status === 'sent') sent++; return r; };
    for (let i = 0; i < 3; i++) { await send(day); await N.processMisses(at(day, '12:30') + 25 * 3600000); day = addDays(day, 1); }
    let st = ((await db.doc('users/u').get()).data().notifStats || {}).question_du_jour;
    check('Décroissance : 3 non-ouvertures d\'affilée -> fréquence hebdomadaire', st.missStreak === 3 && st.weekly === true && !st.autoOff, st);
    const r4 = await send(day);
    check('Décroissance : le lendemain, rien (hebdomadaire)', r4.reason === 'weekly', r4);
    const wk = addDays(addDays(D1, 2), 7);       // 7 jours après le 3e envoi
    const r5 = await send(wk);
    check('Décroissance : renvoyée après 7 jours', r5.status === 'sent', r5);
    await N.processMisses(at(wk, '12:30') + 25 * 3600000);
    let d2 = addDays(wk, 7); await send(d2); await N.processMisses(at(d2, '12:30') + 25 * 3600000);
    let d3 = addDays(d2, 7); await send(d3); await N.processMisses(at(d3, '12:30') + 25 * 3600000);
    st = ((await db.doc('users/u').get()).data().notifStats || {}).question_du_jour;
    check('Décroissance : 6 non-ouvertures -> type désactivé pour cet utilisateur', st.missStreak === 6 && st.autoOff === true, st);
    const r7 = await send(addDays(d3, 7));
    check('Décroissance : plus aucun envoi de ce type', r7.reason === 'auto_off', r7);
    const m = (await db.doc('notifMetrics/question_du_jour').get()).data();
    check('Métriques : désactivation automatique comptée', m.autoDisabled === 1 && m.sent === 6, m);
    const lastLog = (await db.collection('notifLog').where('uid', '==', 'u').where('status', '==', 'missed').get()).docs[0];
    const op = await N.trackOpen('u', lastLog.id, false);
    st = ((await db.doc('users/u').get()).data().notifStats || {}).question_du_jour;
    check('Ouverture : le compteur repart à zéro dès la première ouverture', st.missStreak === 0 && st.weekly === false && st.autoOff === false && st.opened === 1, st);
    const op2 = await N.trackOpen('u', lastLog.id, false);
    check('Ouverture : comptée une seule fois', op2.already === true && (await db.doc('notifMetrics/question_du_jour').get()).data().opened === 1);
  });
  await T('open + foreground', async () => {
    await wipe();
    await mkUser('u'); await mkUser('v');
    const r = await N.deliver('u', 'question_du_jour', N.copy.questionDuJour({ merchant: 'X' }), { key: 'k1', now: at(D1, '12:30') });
    const fg = await N.trackOpen('u', r.nid, true);
    const st = ((await db.doc('users/u').get()).data().notifStats || {}).question_du_jour;
    check('Reçue app ouverte : ni ouverture ni envoi comptés', fg.seen === true && st.sent === 0 && !(st.opened), st);
    let err = null; try { await N.trackOpen('v', r.nid, false); } catch (e) { err = e.code; }
    check('Ouverture : impossible d\'ouvrir la notification d\'un autre', err === 'not-found', err);
    const dup = await N.deliver('u', 'question_du_jour', N.copy.questionDuJour({ merchant: 'X' }), { key: 'k1', now: at(D1, '12:31') });
    check('Idempotence : même événement livré deux fois = une seule notification', dup.status === 'dup' && (await sink('u')).length === 1);
  });
  await T('prefs', async () => {
    await wipe();
    await mkUser('u', { notifStats: { question_du_jour: { missStreak: 6, autoOff: true, weekly: true } } });
    await N.setPref('u', 'question', false);
    const r = await N.deliver('u', 'question_du_jour', N.copy.questionDuJour({ merchant: 'X' }), { key: 'a', now: at(D1, '12:30') });
    check('Réglages : type coupé par l\'utilisateur = aucun envoi', r.reason === 'pref_off', r);
    check('Métriques : désactivation par l\'utilisateur comptée', (await db.doc('notifMetrics/question_du_jour').get()).data().deactivated === 1);
    await N.setPref('u', 'question', false);
    check('Métriques : couper deux fois ne compte qu\'une désactivation', (await db.doc('notifMetrics/question_du_jour').get()).data().deactivated === 1);
    await N.setPref('u', 'question', true);
    const r2 = await N.deliver('u', 'question_du_jour', N.copy.questionDuJour({ merchant: 'X' }), { key: 'b', now: at(D1, '12:30') });
    const st = ((await db.doc('users/u').get()).data().notifStats || {}).question_du_jour;
    check('Réglages : réactiver remet la décroissance à zéro et rétablit l\'envoi', r2.status === 'sent' && st.autoOff === false && st.missStreak === 0, [r2, st]);
    await N.setPref('u', 'recompenses', false);
    const a = await N.deliver('u', 'recompense_debloquee', N.copy.recompense({ reward: 'café', merchant: 'C', cost: 1 }), { key: 'z1', now: at(D1, '12:31') });
    const b = await N.deliver('u', 'code_expire', N.copy.code({ reward: 'café', merchant: 'C', when: 'demain', until: '15/01 à 12h00' }), { key: 'z2', now: at(D1, '12:31') });
    check('Réglages : « Mes récompenses » couvre récompense débloquée ET code', a.reason === 'pref_off' && b.reason === 'pref_off', [a, b]);
    let e = null; try { await N.setPref('u', 'inconnu', true); } catch (x) { e = x.code; }
    check('Réglages : groupe inconnu refusé', e === 'invalid-argument', e);
    check('Réglages : 7 interrupteurs, un par famille (pas de global)', Object.keys(N.GROUPS).length === 7 && Object.keys(N.GROUPS).join() === 'question,commerces,resultats,serie,recompenses,amis,actualites');
  });
  await T('tokens', async () => {
    await wipe();
    await mkUser('u', { fcmTokens: ['a', 'a', 'b', ''] });
    await N.deliver('u', 'question_du_jour', N.copy.questionDuJour({ merchant: 'X' }), { key: 'k', now: at(D1, '12:30') });
    const s = await sink('u');
    check('Un appareil = une notification : jetons dédoublonnés', s.length === 1 && s[0].tokens.join() === 'a,b', s[0] && s[0].tokens);
    check('Charge utile : nid, type, tag, url avec suivi', s[0].nid && s[0].ntype === 'question_du_jour' && /^question_du_jour-/.test(s[0].tag) && /\?n=.+&go=home/.test(s[0].url), s[0]);
  });
  await T('copy', async () => {
    const long = 'Le Grand Restaurant Gastronomique de la Place Centrale du Vieux Mans 🍕';
    const all = [
      N.copy.questionDuJour({ merchant: long }), N.copy.imminent({ left: 2, reward: long, rewardMerchant: long }), N.copy.imminent({ left: 1, reward: 'x', rewardMerchant: 'y' }),
      N.copy.nouveauCommerce({ merchant: long, known: true }), N.copy.nouveauCommerce({ merchant: long, known: false }), N.copy.resultat({ merchant: long, pct: 62 }), N.copy.resultat({ merchant: long, pct: null }),
      N.copy.recompense({ reward: long, merchant: long, cost: 1500 }), N.copy.serie({ n: 12, merchant: long }), N.copy.code({ reward: long, merchant: long, when: 'dans 2 jours', until: '15/01 à 12h00' }),
      N.copy.amiRequest({ name: long }), N.copy.amiAccepted({ name: long }), N.copy.amiSame({ name: long, merchant: long }),
    ];
    check('Rédaction : tous les titres < 60 caractères', all.every(c => c.title.length < 60), all.map(c => c.title.length));
    check('Rédaction : aucun emoji dans les titres ni les corps', all.every(c => !/\p{Extended_Pictographic}/u.test(c.title + c.body)));
    check('Rédaction : aucune formule interdite', all.every(c => !/manquons|perds pas|dernière chance/i.test(c.title + c.body)));
    let threw = false; try { N.copy.amiRequest({ name: 'Tu nous manques' }); } catch (e) { threw = true; }
    check('Rédaction : une formule interdite est rejetée à la construction', threw);
  });

  // ═════════ COMMERÇANT : email + in-app, jamais de push ═════════
  await T('merchant', async () => {
    await wipe();
    await setClock(at(D1, '11:00'));
    await mkMerchant('m1', { email: 'boulanger@shop.fr' });
    await mkCampaign('cm', { answersCount: 0, endsAt: Timestamp.fromMillis(at(D1, '12:00') + 2 * 86400000) });
    const inapp = async () => (await db.collection('merchants/m1/notifications').get()).docs.map(d => ({ id: d.id, ...d.data() }));
    await db.doc('campaigns/cm').update({ answersCount: 1 });
    await until(async () => (await inapp()).length === 1);
    let n = await inapp();
    check('Commerçant : première réponse reçue', n.length === 1 && n[0].title === 'Première réponse reçue', n.map(x => x.title));
    await db.doc('campaigns/cm').update({ answersCount: 5 });
    await until(async () => (await inapp()).length === 2);
    n = await inapp();
    const five = n.find(x => x.id === 'resp_cm_5');
    check('Commerçant : « Vous avez reçu vos 5 premières réponses, les résultats sont disponibles. »', five && five.message === 'Vous avez reçu vos 5 premières réponses, les résultats sont disponibles.', five);
    await db.doc('campaigns/cm').update({ answersCount: 120 });
    await until(async () => (await inapp()).length === 5);
    n = await inapp();
    check('Commerçant : paliers 10, 50 et 100 (un seul message chacun)', ['resp_cm_10', 'resp_cm_50', 'resp_cm_100'].every(id => n.some(x => x.id === id)) && n.length === 5, n.map(x => x.id));
    await db.doc('campaigns/cm').update({ answersCount: 121 }); await sleep(2000);
    check('Commerçant : aucun doublon de palier', (await inapp()).length === 5);
    const mails = (await db.collection('mail').get()).docs.map(d => d.data());
    check('Commerçant : un email par notification (extension Trigger Email)', mails.length === 5 && mails.every(m => m.to === 'boulanger@shop.fr' && m.message.subject && m.message.text), mails.length);
    await db.doc('redemptions/rr1').set({ userId: 'u', merchantId: 'm1', status: 'pending', label: 'café', code: 'AB7K' });
    await sleep(1200);
    await db.doc('redemptions/rr1').update({ status: 'used' });
    await until(async () => (await inapp()).some(x => x.id === 'claim_rr1'));
    check('Commerçant : récompense réclamée', (await inapp()).some(x => x.id === 'claim_rr1' && x.title === 'Récompense réclamée'));
    await db.doc('merchants/m1').update({ status: 'rejected', rejectionReason: 'SIRET introuvable.' });
    await until(async () => (await inapp()).some(x => /^status_rejected/.test(x.id)));
    const rej = (await inapp()).find(x => /^status_rejected/.test(x.id));
    check('Commerçant : changement de statut (refus avec le motif de l\'équipe)', rej && /SIRET introuvable/.test(rej.message), rej && rej.message);
    await db.doc('merchants/m1').update({ status: 'verified' });
    await until(async () => (await inapp()).some(x => /^status_verified/.test(x.id)));
    check('Commerçant : changement de statut (validé)', (await inapp()).some(x => /^status_verified/.test(x.id)));
    await mkUser('u9');
    await tick(D1, '10:00'); await tick(D1, '10:15');
    const ends = (await inapp()).filter(x => x.id === 'ending_cm');
    check('Commerçant : campagne qui se termine dans 3 jours (une seule fois)', ends.length === 1 && /3 jours/.test(ends[0].title), ends.length);
    await mkCampaign('clong', { merchantId: 'm1', endsAt: Timestamp.fromMillis(at(D1, '12:00') + 20 * 86400000) });
    await tick(addDays(D1, 1), '10:00');
    check('Commerçant : pas d\'alerte pour une campagne qui finit dans 20 jours', !(await inapp()).some(x => x.id === 'ending_clong'));
    check('Commerçant : jamais de push (aucun envoi vers un commerçant)', (await db.collection('_pushSink').where('uid', '==', 'm1').get()).empty);
  });

  // ═════════ MÉTRIQUES ═════════
  await T('metrics', async () => {
    await wipe();
    await mkUser('u1'); await mkUser('u2');
    const a = await N.deliver('u1', 'ami', N.copy.amiRequest({ name: 'A' }), { key: 'k1', now: at(D1, '12:30') });
    await N.deliver('u2', 'ami', N.copy.amiRequest({ name: 'A' }), { key: 'k2', now: at(D1, '12:30') });
    await N.trackOpen('u1', a.nid, false);
    const m = (await db.doc('notifMetrics/ami').get()).data();
    check('Métriques par type : envois, ouvertures', m.sent === 2 && m.opened === 1, m);
  });

  // ═════════ ALERTE AVANT EXPIRATION DES POINTS (~30 jours avant) ═════════
  await T('points expirant', async () => {
    await wipe();
    const DAY = 86400000;
    const now = at(D1, '10:00');
    const monthsAgo = (n) => { const d = new Date(now); d.setMonth(d.getMonth() - n); return d.getTime(); };
    const exactly30 = monthsAgo(CFG.POINTS.EXPIRY_MONTHS) + 30 * DAY;          // expire dans pile 30 jours
    await mkUser('u30', { points: 120, lastActivityAt: Timestamp.fromMillis(exactly30) });
    await mkUser('u35', { points: 80, lastActivityAt: Timestamp.fromMillis(exactly30 + 5 * DAY) });   // expire dans 35 j : trop tôt
    await mkUser('u25', { points: 60, lastActivityAt: Timestamp.fromMillis(exactly30 - 5 * DAY) });   // expire dans 25 j : trop tard
    await mkUser('u0', { points: 0, lastActivityAt: Timestamp.fromMillis(exactly30) });               // plus de solde : rien à sauver
    await mkUser('uOff', { points: 40, lastActivityAt: Timestamp.fromMillis(exactly30), notifPrefs: { recompenses: false } });
    const r = await P.warnExpiringInactive(now);
    check('Exactement à 30 jours de l\'expiration, avec un solde : prévenu', (await sink('u30')).length === 1, r);
    check('Le message annonce le bon nombre de points, sans culpabilisation', /120 pts/.test((await sink('u30'))[0].title) && /30 jours/.test((await sink('u30'))[0].title), (await sink('u30'))[0]);
    check('Trop tôt (35 jours avant expiration) : pas encore prévenu', (await sink('u35')).length === 0);
    check('Trop tard (n\'expire plus que dans 25 jours : la fenêtre des 30 jours est déjà passée) : pas prévenu ici', (await sink('u25')).length === 0);
    check('Solde à 0 : jamais prévenu (rien à perdre)', (await sink('u0')).length === 0);
    check('Groupe « recompenses » (même réglage que les autres notifications de récompenses, pas de nouvel interrupteur)', N.TYPES.points_expirant.group === 'recompenses' && N.GROUPS.recompenses.includes('points_expirant'));
    check('« Mes récompenses » désactivé : pas prévenu', (await sink('uOff')).length === 0);
    const r2 = await P.warnExpiringInactive(now);
    check('Relancer le même jour ne double pas l\'envoi (déduplication par cycle d\'inactivité)', (await sink('u30')).length === 1, r2);
  });

  console.log(`\n===== ${pass}/${pass + fail} OK =====`);
  process.exit(fail ? 1 : 0);
})();
