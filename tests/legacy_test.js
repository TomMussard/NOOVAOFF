process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const puppeteer = require('puppeteer-core');
const admin = require(__dirname+'/helpers/admin');
admin.initializeApp({ projectId: 'noova-366d0' });
const adb = admin.firestore();
const CHROME = (process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const DASH = 'http://localhost:8950/dash.html', APP = 'http://localhost:8950/app.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok: !!ok, extra }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  -> ' + extra : '')); };
async function step(name, fn) { try { await fn(); } catch (e) { check(name + ' (exception)', false, String(e.message).split('\n')[0]); } }

function luhnSiret() {
  const base = '7328293200007'.split('').map(Number);
  for (let c = 0; c < 10; c++) {
    const d = [...base, c]; let sum = 0;
    for (let i = 0; i < 14; i++) { let n = d[13 - i]; if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; } sum += n; }
    if (sum % 10 === 0) return d.join('');
  }
}
const SIRET = luhnSiret();
const setVal = (page, sel, v) => page.$eval(sel, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const waitFn = (page, fn, arg, t = 20000) => page.waitForFunction(fn, { timeout: t, polling: 200 }, arg);
const stamp = Date.now();
const MEMAIL = `merchant${stamp}@test.fr`, UEMAIL = `habitant${stamp}@test.fr`;

(async () => {
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents', { method: 'DELETE' });
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts', { method: 'DELETE' });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const errors = [];
  const attach = (page, tag) => { page.on('pageerror', e => errors.push(tag + ': ' + e.message)); };

  // ================= COMMERÇANT =================
  const mctx = await browser.createBrowserContext();
  const mp = await mctx.newPage(); await mp.setViewport({ width: 1280, height: 900 }); attach(mp, 'dash');
  let muid, campId;
  await step('merchant intro', async () => {
    await mp.goto(DASH, { waitUntil: 'load' });
    await waitFn(mp, () => document.getElementById('pro-intro') && document.getElementById('pro-intro').style.display === 'flex');
    check('C1 présentation affichée au premier passage', true);
    await mp.evaluate(() => { proIntroNext(); proIntroNext(); proIntroNext(); });
    await waitFn(mp, () => document.getElementById('auth-wall').style.display === 'flex' && _awMode === 'register');
    check('C1 fin de présentation -> inscription', true);
  });
  await step('merchant register 2 steps', async () => {
    // Étape 1 : l'établissement, SIRET en premier (il remplit le reste quand il est valide)
    const first = await mp.evaluate(() => { const ids = ['aw-siret','aw-brand','aw-sector','aw-city','aw-address'].map(i => document.getElementById(i)); return { vis: ids.map(e => e.offsetParent !== null), firstSiret: document.getElementById('aw-siret').compareDocumentPosition(document.getElementById('aw-brand')) & 4, lbl: document.getElementById('aw-p-lbl').textContent, email: document.getElementById('aw-email').offsetParent !== null }; });
    check('C2 étape 1 = établissement, SIRET en premier, e-mail/mot de passe pas encore demandés', first.vis.every(Boolean) && first.firstSiret && /Votre établissement/.test(first.lbl) && !first.email, JSON.stringify(first));
    await mp.evaluate(() => awSubmit());
    const errS = await mp.$eval('#aw-err', e => e.style.display === 'block' ? e.textContent : '');
    check('C2 sans SIRET : « Commence par ton numéro SIRET »', /SIRET/.test(errS), errS);
    await setVal(mp, '#aw-siret', '12345678901234');
    await mp.evaluate(() => awSubmit());
    const err2 = await mp.$eval('#aw-err', e => e.style.display === 'block' ? e.textContent : '');
    check('C2 SIRET invalide refusé (Luhn)', /SIRET invalide/.test(err2), err2);
    await setVal(mp, '#aw-siret', SIRET);
    await mp.evaluate(() => awSubmit());
    const err = await mp.$eval('#aw-err', e => e.style.display === 'block' ? e.textContent : '');
    check('C2 champs établissement obligatoires', /obligatoires/.test(err), err);
    await setVal(mp, '#aw-brand', 'Boulangerie du Centre'); await setVal(mp, '#aw-sector', 'Restauration');
    await setVal(mp, '#aw-city', 'Le Mans'); await setVal(mp, '#aw-address', '12 rue Gambetta');
    await mp.evaluate(() => awSubmit());
    await waitFn(mp, () => _awStep === 2);
    check('C2 étape 1 -> étape 2 (vous)', true);
    await mp.evaluate(() => awSubmit());
    const errP = await mp.$eval('#aw-err', e => e.style.display === 'block' ? e.textContent : '');
    check('C2 étape 2 : champs personnels obligatoires', /Remplis tous les champs/.test(errP), errP);
    await setVal(mp, '#aw-firstname', 'Marie'); await setVal(mp, '#aw-lastname', 'Dupont');
    await setVal(mp, '#aw-phone', '0612345678'); await setVal(mp, '#aw-email', MEMAIL); await setVal(mp, '#aw-pass', 'secret123');
    await mp.evaluate(() => awSubmit());
    await waitFn(mp, () => document.getElementById('verif-banner').style.display === 'block', null, 30000);
    muid = await mp.evaluate(() => auth.currentUser.uid);
    const m = (await adb.doc('merchants/' + muid).get()).data();
    check('C2 compte créé en pending', m && m.status === 'pending' && m.siret === SIRET, JSON.stringify({ status: m && m.status }));
    const banner = await mp.$eval('#verif-banner', e => e.textContent);
    check('C3 dashboard accessible non vérifié + bandeau', /Vérification en cours/.test(banner) && /48 h ouvrées/.test(banner));
    const launchLocked = await mp.evaluate(() => [...document.querySelectorAll('.wiz-btn-launch')].every(b => b.disabled));
    check('C3 bouton Lancer désactivé', launchLocked);
  });
  await step('merchant rewards while pending + gate', async () => {
    await mp.evaluate(() => { closeMobMenu && 0; endDashTour(); loadMerchantRewards(); });
    await sleep(800);
    for (let i = 1; i <= 5; i++) {
      await mp.evaluate(async (i) => {
        openRewardForm(i);                                                   // « Ma vitrine récompenses » : suggestion pré-remplie
        document.getElementById('rf-label-' + i).value = 'Récompense ' + i;
        document.getElementById('rf-price-' + i).checked = true;
        await saveReward(i, { disabled: false, textContent: '' });
      }, i);
      await waitFn(mp, n => _rewardSlots.length >= n, i, 8000).catch(() => {});
      if (i === 4) {
        await mp.evaluate(() => navTo('create', document.getElementById('nav-create')));
        await sleep(1200);
        const page = await mp.evaluate(() => curPage);
        check('C4 création bloquée avec 4 récompenses', page !== 'create', 'page=' + page);
      }
    }
    const rw = await adb.collection('rewards').where('merchantId', '==', muid).get();
    check('C4 5 paliers créés par un commerçant non vérifié (règles) : un document par palier, coût imposé par le palier', rw.size === 5 && rw.docs.every(d => d.id === muid + '_p' + d.data().tier && d.data().cost === [150, 300, 500, 900, 1500][d.data().tier - 1] && d.data().status === 'pending' && d.data().approved === false && d.data().priceConfirmed === true), rw.docs.map(d => d.id + ':' + d.data().cost).join());
    await mp.evaluate(() => navTo('create', document.getElementById('nav-create')));
    await waitFn(mp, () => curPage === 'create', null, 8000).catch(() => {});
    check('C4 création autorisée avec 5 récompenses', await mp.evaluate(() => curPage === 'create'));
    await mp.evaluate(() => { showToast = showToast; });
    await mp.evaluate(async () => { await launchCampaign(); });
    await sleep(600);
    const toast = await mp.$eval('#toast-msg', e => e.textContent);
    check('C3 lancement refusé tant que non vérifié', /débloqué après la vérification/.test(toast), toast);
  });
  await step('admin verifies', async () => {
    await adb.doc('merchants/' + muid).update({ status: 'verified' });
    const rw = await adb.collection('rewards').where('merchantId', '==', muid).get();
    for (const d of rw.docs) await d.ref.update({ status: 'approved', active: true, approved: true });
    await mp.reload({ waitUntil: 'load' });
    await waitFn(mp, () => typeof _mData !== 'undefined' && _mData && _mData.status === 'verified' && document.getElementById('verif-banner').style.display === 'none', null, 20000);
    check('C5 compte vérifié : bandeau retiré', true);
    await mp.evaluate(() => { closeVerifiedModal(); endDashTour(); });
  });
  await step('merchant reach + launch + cashier', async () => {
    await mp.evaluate(() => { navTo('create', document.getElementById('nav-create')); });
    await waitFn(mp, () => curPage === 'create', null, 8000);
    await mp.evaluate(() => {
      document.getElementById('q-text-inp').value = 'Voulez-vous une ouverture le dimanche ?';
      const o = document.querySelectorAll('#mcq-options .mcq-opt-inp'); if (o[0]) o[0].value = 'Oui'; if (o[1]) o[1].value = 'Non';
      document.getElementById('camp-name-inp').value = 'Test dimanche';
      wzGo(3);
    });
    await waitFn(mp, () => !/Calcul/.test(document.getElementById('recap-reach').textContent), null, 15000);
    const reach = await mp.$eval('#recap-reach', e => e.textContent);
    check('C6 portée estimée affichée', /habitant/.test(reach), reach);
    await mp.evaluate(() => { launchCampaign(); });
    await waitFn(mp, () => document.getElementById('cashier-modal').style.display === 'flex', null, 8000);
    check('C4 étape caisse obligatoire avant le 1er lancement', true);
    await mp.evaluate(() => { document.getElementById('cashier-check').click(); document.getElementById('cashier-ok').click(); });
    await sleep(3500);
    const camps = await adb.collection('campaigns').where('merchantId', '==', muid).get();
    check('C6 campagne créée (règles + cashierAck)', camps.size === 1 && camps.docs[0].data().status === 'active', 'n=' + camps.size);
    campId = camps.docs[0] && camps.docs[0].id;
    const m = (await adb.doc('merchants/' + muid).get()).data();
    check('C4 cashierAck enregistré', m.cashierAck === true);
    { const cd = camps.docs[0].data(); check('C6 durée facultative : sans choix, ni date de fin ni objectif de volume ; ville = celle du commerce', cd.endsAt === undefined && cd.targetVolume === undefined && cd.volumeTarget === undefined && cd.durationDays === undefined && cd.targetCity === 'le-mans', JSON.stringify({ endsAt: cd.endsAt, tv: cd.targetVolume, city: cd.targetCity })); }
    await sleep(1500);
    const acq = await mp.$eval('#acq-card', e => e.style.display + '|' + e.textContent.slice(0, 60));
    check('C7 carte acquisition (affiche/QR/visuels)', /block/.test(acq), acq);
  });

  // ================= HABITANT =================
  const uctx = await browser.createBrowserContext();
  const up = await uctx.newPage(); await up.setViewport({ width: 430, height: 900 }); attach(up, 'app');
  let uuid;
  await step('user demo + register', async () => {
    await up.goto(APP, { waitUntil: 'load' });
    await waitFn(up, () => document.getElementById('onboard').classList.contains('active'), null, 25000);
    check('U1 présentation affichée', true);
    await up.evaluate(() => { obNext(); obNext(); });
    await waitFn(up, () => document.getElementById('demo-q').classList.contains('active'));
    check('U2 question de démonstration', true);
    await up.evaluate(() => { document.querySelectorAll('#demo-opts .mcq-opt')[0].click(); submitDemo(); });
    await waitFn(up, () => document.getElementById('demo-result').classList.contains('active'));
    check('U3 résultat + points en attente', await up.evaluate(() => !!localStorage.getItem('nv_demo')));
    await up.evaluate(() => showAuthWall('register'));
    await setVal(up, '#aw-name', 'Test Habitant'); await setVal(up, '#aw-city', 'Le Mans');
    await setVal(up, '#aw-email', UEMAIL); await setVal(up, '#aw-pass', 'secret123');
    await up.evaluate(() => awSubmit());
    await waitFn(up, () => document.getElementById('claim-splash').style.display === 'flex' || document.getElementById('cat-wall').style.display === 'flex', null, 30000);
    await waitFn(up, () => document.getElementById('cat-wall').style.display === 'flex', null, 15000);
    uuid = await up.evaluate(() => auth.currentUser.uid);
    const u = (await adb.doc('users/' + uuid).get()).data();
    check('U4 +50 points de bienvenue crédités par le serveur (claimWelcomeBonus), une seule fois', u.points === 50 && u.welcomeClaimed === true && !!u.lastActivityAt, 'points=' + u.points);
    await up.evaluate(() => { document.querySelector('#cat-grid [data-cat=restauration]').click(); saveCategories(); });
    await waitFn(up, () => document.getElementById('home').classList.contains('active') && S.user, null, 25000);
    check('U5 catégories enregistrées puis accueil', (await adb.doc('users/' + uuid).get()).data().interests.includes('restauration'));
  });
  await step('user discovery -> answer -> follow', async () => {
    await waitFn(up, () => S.qs.length === 1 && S.qs[0]._discovery === true, null, 20000);
    check('U6 la question du commerce arrive directement sur l\'accueil, en « découverte » (plus de demande à autoriser)', await up.evaluate(() => document.getElementById('home-requests').textContent.trim() === '' && document.getElementById('today-card').classList.contains('disc') && /Boulangerie du Centre/.test(document.getElementById('tc-brand').textContent)));
    await up.evaluate(() => openQ(0));
    await waitFn(up, () => document.querySelectorAll('#ans-area .mcq-opt').length > 0);
    await up.evaluate(() => document.querySelector('#ans-area .mcq-opt').click());
    await sleep(3600);
    await up.evaluate(() => submitAns());
    await sleep(3500);
    const ans = await adb.collection('answers').where('userId', '==', uuid).get();
    const u = (await adb.doc('users/' + uuid).get()).data();
    check('U6 réponse validée côté serveur (submitAnswer), sans profil pour un commerce non suivi', ans.size === 1 && u.points === 65 && ans.docs[0].data().discovery === true && ans.docs[0].data().respondentAge === '', 'answers=' + ans.size + ' points=' + u.points);
    await waitFn(up, () => document.querySelector('#rw-follow .follow-card'), null, 10000);
    check('U6 proposition de suivre le commerce après la réponse', true);
    await up.evaluate(() => document.querySelector('#rw-follow .btn-p').click());
    await waitFn(up, () => S._authorizedMerchants.length === 1, null, 15000);
    for (let i = 0; i < 30 && !((await adb.doc('merchants/' + muid).get()).data() || {}).consentCount; i++) await sleep(500);
    const ce = await adb.collection('consentEvents').where('userId', '==', uuid).get();
    const mm = (await adb.doc('merchants/' + muid).get()).data();
    check('Consentement journalisé + countConsent serveur', ce.size === 1 && mm.consentCount === 1, 'events=' + ce.size + ' count=' + mm.consentCount);
  });
  await step('strict authorization server-side', async () => {
    const camp2 = await adb.collection('campaigns').add({ merchantId: 'other', merchantName: 'Autre', status: 'active', targetCity: 'le-mans', city: 'le-mans', question: 'Q ?', questions: [{ q: 'Q ?', format: 'mcq', options: ['a', 'b'] }], targetVolume: 100, answersCount: 0 });
    const res = await up.evaluate(async (id) => { try { await callSubmitAnswer({ campaignId: id, questionIdx: 0, answerValue: 'a', elapsedMs: 3000 }); return 'ok'; } catch (e) { return e.code + '|' + e.message; } }, camp2.id);
    check('Serveur refuse un commerce non autorisé', /permission-denied/.test(res), res);
  });
  await step('redeem + voucher + merchant validate', async () => {
    await adb.doc('users/' + uuid).update({ points: 400 });   // le solde ne s'écrit que côté serveur : on le pose ici en administrateur
    const rw = (await adb.collection('rewards').where('merchantId', '==', muid).get()).docs.find(d => d.data().tier === 1);
    const rdata = { id: rw.id, ...rw.data() };
    await up.evaluate(r => { window.__p = redeemReward(r); }, rdata);
    await waitFn(up, () => document.getElementById('redeem-confirm'), null, 8000);
    const conf = await up.$eval('#redeem-confirm', e => e.textContent);
    check('Confirmation d\'échange maison (« Palier 1 · 150 pts », solde restant, validité), sans aucun euro', /Débité/.test(conf) && /Palier 1 · 150 pts/.test(conf) && /250 pts/.test(conf) && /24 h/.test(conf) && !/€/.test(conf), conf.replace(/\s+/g, ' ').slice(0, 120));
    await up.evaluate(() => document.getElementById('rc-yes').click());
    await waitFn(up, () => document.getElementById('voucher-full'), null, 10000);
    const red = await adb.collection('redemptions').where('userId', '==', uuid).get();
    const code = red.docs[0].data().code, redId = red.docs[0].id;
    const shown = await up.$eval('#voucher-full', e => e.textContent);
    check('Code à 4 caractères affiché plein écran', /^[A-Z2-9]{4}$/.test(code) && shown.includes(code) && /Valable encore/.test(shown), 'code=' + code);
    const u = (await adb.doc('users/' + uuid).get()).data();
    check('Points débités à l\'échange par le serveur (150 pts, palier 1)', u.points === 250 && red.docs[0].data().tier === 1 && red.docs[0].data().cost === 150, 'points=' + u.points);
    // marchand valide le code
    await mp.evaluate(() => { navTo('validate', document.getElementById('nav-validate')); });
    await setVal(mp, '#voucher-code-inp', code.toLowerCase());
    await mp.evaluate(() => validateVoucher());
    await waitFn(mp, () => /Confirmer l/.test(document.getElementById('voucher-result').innerHTML), null, 10000);
    check('C7 Valider un code : bon reconnu', true);
    await mp.evaluate(() => document.querySelector('#voucher-result button').click());
    await sleep(2500);
    check('C7 bon passé en used par le commerçant', (await adb.doc('redemptions/' + redId).get()).data().status === 'used');
    // second bon : l'habitant presse « C'est validé »
    const r2 = await adb.collection('redemptions').add({ userId: uuid, merchantId: muid, rewardId: rw.id, cost: 0, label: 'Test', merchantName: 'X', code: 'ZZ22', status: 'pending', createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt: new Date(Date.now() + 3600000) });
    await up.evaluate(id => { closeVoucherFull(); showVoucherModal({ id, code: 'ZZ22', label: 'Test', merchantName: 'X', cost: 0, expiresAt: new Date(Date.now() + 3600000) }); }, r2.id);
    await up.evaluate(() => document.getElementById('vf-ok').click());
    await up.evaluate(() => document.getElementById('vf-ok').click());
    await sleep(2500);
    check('Habitant : « C\'est validé » (double appui) -> used (règles)', (await r2.get()).data().status === 'used');
  });
  await step('results threshold + csv', async () => {
    await mp.evaluate(id => viewCampaign(id), campId);
    await waitFn(mp, () => /Encore \d+ réponse/.test((document.getElementById('results-content') || {}).textContent || ''), null, 10000);
    const t = await mp.$eval('#results-content', e => e.textContent);
    check('C7 seuil 5 réponses (résultats masqués sous le seuil)', /Encore 4 réponses avant d'afficher les résultats/.test(t));
    check('C7 boutons export CSV présents', /Résumé \(CSV\)/.test(t) && /Réponses \(CSV\)/.test(t));
  });
  await step('reject + resubmit', async () => {
    await adb.doc('merchants/' + muid).update({ status: 'rejected', rejectionReason: 'SIRET introuvable. Photo illisible.' });
    await mp.reload({ waitUntil: 'load' });
    await waitFn(mp, () => document.getElementById('verif-banner').style.display === 'block' && /corrections/.test(document.getElementById('verif-banner').textContent), null, 20000);
    const b = await mp.$eval('#verif-banner', e => e.textContent);
    check('C5 dossier refusé : motif de l\'équipe affiché tel quel', /SIRET introuvable\. Photo illisible\./.test(b) && /Corriger et renvoyer/.test(b));
    await mp.evaluate(() => { endDashTour(); closeVerifiedModal(); openResubmit(); });
    await setVal(mp, '#rs-siret', SIRET);
    await mp.evaluate(() => submitResubmit());
    await sleep(2500);
    const m = (await adb.doc('merchants/' + muid).get()).data();
    check('C5 Corriger et renvoyer : repasse en pending (règles)', m.status === 'pending' && !m.rejectionReason, 'status=' + m.status);
    await mp.evaluate(() => { _mData.status = 'verified'; });
  });
  await step('security rules', async () => {
    const r = await mp.evaluate(async () => { try { await db.collection('merchants').doc(auth.currentUser.uid).update({ status: 'verified' }); return 'allowed'; } catch (e) { return e.code; } });
    check('Règles : un commerçant ne peut pas se vérifier lui-même', r === 'permission-denied', r);
    const r2 = await up.evaluate(async () => { try { await db.collection('users').doc(auth.currentUser.uid).update({ points: 99999 }); return 'allowed'; } catch (e) { return e.code; } });
    check('Règles : un habitant ne peut pas s\'ajouter des points', r2 === 'permission-denied', r2);
  });
  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log('\n===== ' + (results.length - failed.length) + '/' + results.length + ' OK =====');
  if (errors.length) console.log('JS page errors:\n' + [...new Set(errors)].join('\n'));
  process.exit(0);
})();
