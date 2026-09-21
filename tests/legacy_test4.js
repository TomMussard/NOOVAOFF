process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const admin = require(__dirname+'/helpers/admin');
admin.initializeApp({ projectId: 'noova-366d0' });
const adb = admin.firestore(), aauth = admin.auth();
const CHROME = (process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const APP = 'http://localhost:8950/app.html', DASH = 'http://localhost:8950/dash.html';
const SHOTS = '/tmp/shots'; fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const check = (n, ok, x) => console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? '  -> ' + x : ''));
const wf = (p, fn, arg, t = 25000) => p.waitForFunction(fn, { timeout: t, polling: 200 }, arg);
const setVal = (p, sel, v) => p.$eval(sel, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const URL_OF = (folder, id) => `https://firebasestorage.googleapis.com/v0/b/noova-366d0.firebasestorage.app/o/${folder}%2F${id}%2Favatar.jpg?alt=media&token=t`;
const T = async (name, fn) => { try { await fn(); } catch (e) { check(name + ' (exception)', false, String(e.message).split('\n')[0]); } };

async function mkUser(uid, email, name, city, extra = {}) {
  await aauth.createUser({ uid, email, password: 'secret123' });
  await adb.doc('users/' + uid).set({ role: 'user', name, email, city, cityLabel: city === 'le-mans' ? 'Le Mans' : 'Angers', points: 0, xp: 0, streak: 0, ans: 0, interests: ['restauration'], authorizedMerchants: [], friendUids: [], answeredCampaigns: [], onboardingStep: 'done', seenHomeTour: true, createdAt: admin.firestore.FieldValue.serverTimestamp(), ...extra });
}
async function mkMerchant(uid, email, brand, sector, address, extra = {}) {
  await aauth.createUser({ uid, email, password: 'secret123' });
  await adb.doc('merchants/' + uid).set({ role: 'merchant', ownerUid: uid, name: brand, brandName: brand, email, sector, city: 'le-mans', cityLabel: 'Le Mans', address, status: 'verified', verifiedPopupShown: true, cashierAck: true, plan: 'starter', ...extra });
}
async function loginApp(ctx, email) {
  const p = await ctx.newPage(); await p.setViewport({ width: 430, height: 900 });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.errs = errs;
  await p.goto(APP, { waitUntil: 'load' });
  await wf(p, () => document.getElementById('onboard').classList.contains('active'), null, 30000);
  await p.evaluate(() => showAuthWall('login'));
  await setVal(p, '#aw-email', email); await setVal(p, '#aw-pass', 'secret123');
  await p.evaluate(() => awSubmit());
  await wf(p, () => document.getElementById('home').classList.contains('active') && S.user, null, 30000);
  return p;
}

(async () => {
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents', { method: 'DELETE' });
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts', { method: 'DELETE' });
  await mkUser('uA', 'a@t.fr', 'Alice', 'le-mans', { friendCode: 'NOOVA-AAAAAA', authorizedMerchants: ['mM1'], fcmTokens: ['tokX'] });
  await adb.doc('friendCodes/NOOVA-AAAAAA').set({ uid: 'uA', name: 'Alice' });
  await mkUser('uB', 'b@t.fr', 'Bob', 'le-mans', { friendCode: 'NOOVA-BBBBBB', fcmTokens: ['tokX', 'tokZ'] });
  await adb.doc('friendCodes/NOOVA-BBBBBB').set({ uid: 'uB', name: 'Bob' });
  await mkUser('uC', 'c@t.fr', 'Carl', 'angers', { friendCode: 'NOOVA-AAAAAA' });   // collision volontaire
  await mkMerchant('mM1', 'm1@t.fr', 'Le Bistrot', 'Restauration', 'Place de la République');
  await mkMerchant('mM2', 'm2@t.fr', 'Boulangerie Martin', 'Boulangerie', 'Rue Nationale');
  await mkMerchant('mM3', 'm3@t.fr', 'Salon Belle', 'Beauté', 'Rue Gambetta', { logoUrl: URL_OF('merchants', 'mM3') });
  const now = admin.firestore.FieldValue.serverTimestamp();
  for (const lv of ['Actif', 'Expert']) await adb.collection('communityEvents').add({ type: 'levelup', level: lv, userId: 'uB', displayName: 'Bob', city: 'le-mans', text: 'a atteint le palier ' + lv, brand: '', likeCount: 0, commentCount: 0, createdAt: now });

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const ctxA = await browser.createBrowserContext(), ctxB = await browser.createBrowserContext(), ctxC = await browser.createBrowserContext();
  const pA = await loginApp(ctxA, 'a@t.fr'), pB = await loginApp(ctxB, 'b@t.fr'), pC = await loginApp(ctxC, 'c@t.fr');

  // ---------- AMIS ----------
  await T('friend request', async () => {
    await pA.evaluate(() => { goNav('social'); initFriendsPanel(); });
    await setVal(pA, '#fi-inp', 'NOOVA-BBBBBB');
    await pA.evaluate(() => addFriend()); await sleep(1500);
    await setVal(pA, '#fi-inp', 'NOOVA-BBBBBB');
    await pA.evaluate(() => addFriend()); await sleep(700);
    const err = await pA.$eval('#fi-err', e => e.textContent);
    const n = await adb.collection('users/uB/notifications').get();
    check('Demande d\'ami envoyée 2 fois -> 1 seule notification chez le destinataire', n.size === 1 && n.docs[0].id === 'friendreq_uA', 'n=' + n.size + ' id=' + (n.docs[0] && n.docs[0].id) + ' msg=' + err);
    check('Renvoi refusé proprement (« déjà envoyée »)', /déjà envoyée/.test(err), err);
  });
  await T('accept twice concurrently', async () => {
    await wf(pB, () => (_notifs || []).some(n => n.type === 'friend_request'), null, 15000);
    await pB.evaluate(async () => { const n = _notifs.find(n => n.type === 'friend_request'); await Promise.all([acceptFriendRequest(n.id, n.fromUid, n.fromName), acceptFriendRequest(n.id, n.fromUid, n.fromName)]); });
    await sleep(2500);
    const b = (await adb.doc('users/uB').get()).data(), a0 = (await adb.doc('users/uA').get()).data();
    const acc = await adb.collection('users/uA/notifications').get();
    check('Double clic « Accepter » -> ami ajouté une seule fois', b.friendUids.length === 1 && b.friendUids[0] === 'uA', JSON.stringify(b.friendUids));
    check('Une seule notification d\'acceptation (id déterministe)', acc.size === 1 && acc.docs[0].id === 'friendacc_uB', 'n=' + acc.size);
    await wf(pA, () => (S._friendUids || []).length === 1, null, 15000);
    await sleep(1500);
    const a1 = (await adb.doc('users/uA').get()).data();
    check('Côté demandeur : ajout automatique sans doublon', a1.friendUids.length === 1 && a1.friendUids[0] === 'uB', JSON.stringify(a1.friendUids));
    const cntA = await pA.evaluate(() => { const s = new Set(S.friends.map(f => f.uid)); return [S.friends.length, s.size]; });
    const cntB = await pB.evaluate(() => { const s = new Set(S.friends.map(f => f.uid)); return [S.friends.length, s.size]; });
    check('Liste d\'amis sans doublon des deux côtés', cntA[0] === 1 && cntA[1] === 1 && cntB[0] === 1 && cntB[1] === 1, JSON.stringify([cntA, cntB]));
    await pA.evaluate(() => { socTab('ranking', document.querySelectorAll('.tab-btn')[2]); renderRanking(); });
    const rows = await pA.evaluate(() => document.querySelectorAll('#ranking-list .drank-row, #drank-podium .podium-slot').length);
    check('Classement : chaque personne une seule fois', rows === 2, 'rows=' + rows);
  });
  await T('forged notifications + non-mutual friendship', async () => {
    const r = await pC.evaluate(async () => {
      const out = {};
      const t = async (k, fn) => { try { await fn(); out[k] = 'allowed'; } catch (e) { out[k] = e.code; } };
      await t('fakeMsg', () => db.collection('users').doc('uA').collection('notifications').add({ type: 'noova_message', message: 'Vous avez gagné', fromUid: auth.currentUser.uid }));
      await t('wrongId', () => db.collection('users').doc('uA').collection('notifications').doc('friendreq_uB').set({ type: 'friend_request', fromUid: auth.currentUser.uid, fromName: 'X', read: false }));
      await t('okReq', () => db.collection('users').doc('uA').collection('notifications').doc('friendreq_' + auth.currentUser.uid).set({ type: 'friend_request', fromUid: auth.currentUser.uid, fromName: 'Carl', read: false }));
      await t('selfAdd', () => db.collection('users').doc(auth.currentUser.uid).update({ friendUids: ['uA'] }));
      await t('readStranger', () => db.collection('users').doc('uA').get());
      return out;
    });
    check('Fausse notification refusée', r.fakeMsg === 'permission-denied', r.fakeMsg);
    check('Notification avec identifiant usurpé refusée', r.wrongId === 'permission-denied', r.wrongId);
    check('Demande d\'ami légitime acceptée', r.okReq === 'allowed', r.okReq);
    check('Ajout unilatéral : le profil d\'un inconnu reste illisible (amitié réciproque)', r.readStranger === 'permission-denied', r.readStranger);
  });
  await T('friend code collision', async () => {
    await sleep(2500);
    const c = (await adb.doc('users/uC').get()).data();
    const owner = (await adb.doc('friendCodes/NOOVA-AAAAAA').get()).data();
    const mine = (await adb.doc('friendCodes/' + c.friendCode).get()).data();
    check('Code ami en collision : remplacé, celui d\'Alice intact', c.friendCode !== 'NOOVA-AAAAAA' && owner.uid === 'uA' && mine && mine.uid === 'uC', 'new=' + c.friendCode);
  });

  // ---------- PHOTOS ----------
  await T('photo rules', async () => {
    const own = URL_OF('users', 'uA'), other = URL_OF('users', 'uB');
    const r = await pA.evaluate(async ([own, other]) => {
      const t = async fn => { try { await fn(); return 'allowed'; } catch (e) { return e.code; } };
      return { own: await t(() => db.collection('users').doc('uA').update({ photoUrl: own })), other: await t(() => db.collection('users').doc('uA').update({ photoUrl: other })), ext: await t(() => db.collection('users').doc('uA').update({ photoUrl: 'https://evil.example/x.jpg' })), xss: await t(() => db.collection('users').doc('uA').update({ photoUrl: own + '"onerror="alert(1)' })) };
    }, [own, other]);
    check('Photo de profil : son propre fichier accepté', r.own === 'allowed', r.own);
    check('Photo de profil : fichier d\'un autre compte refusé', r.other === 'permission-denied', r.other);
    check('Photo de profil : URL externe refusée', r.ext === 'permission-denied', r.ext);
    check('Photo de profil : URL piégée (guillemets) refusée', r.xss === 'permission-denied', r.xss);
  });

  // ---------- FEED ----------
  await T('feed', async () => {
    await pA.evaluate(() => { goNav('social'); socTab('feed', document.querySelectorAll('.tab-btn')[0]); });
    await wf(pA, () => document.querySelectorAll('.feed-post').length >= 2, null, 20000);
    await pA.evaluate(() => document.querySelector('.fp-like-btn').click()); await sleep(1500);
    const pid = await pA.evaluate(() => document.querySelector('.fp-like-btn').dataset.postId);
    const likes = await adb.collection('communityEvents/' + pid + '/likes').get();
    const shown = await pA.evaluate(() => document.querySelector('.fp-like-count').textContent);
    check('Feed : « J\'aime » enregistre le like', likes.size === 1 && shown === '1', 'likes=' + likes.size + ' shown=' + shown);
    await pA.evaluate(() => document.querySelector('.fp-like-btn').click()); await sleep(1200);
    check('Feed : second clic retire le like', (await adb.collection('communityEvents/' + pid + '/likes').get()).size === 0);
    await pA.evaluate(id => toggleComments(id), pid);
    await wf(pA, id => document.getElementById('cmi-' + id), pid, 8000);
    await setVal(pA, '#cmi-' + pid, 'Super commerce !');
    await pA.evaluate(id => sendComment(id), pid); await sleep(1800);
    const cm = await adb.collection('communityEvents/' + pid + '/comments').get();
    const cmText = await pA.$eval('#cm-' + pid, e => e.textContent);
    const cnt = await pA.$eval(`[data-post-id="${pid}"] .fp-com-count`, e => e.textContent);
    check('Feed : commentaire publié, affiché et compté', cm.size === 1 && cm.docs[0].data().userId === 'uA' && /Super commerce/.test(cmText) && cnt === '1', 'n=' + cm.size + ' count=' + cnt);
    const rr = await pB.evaluate(async id => { try { await db.collection('communityEvents').doc(id).collection('comments').add({ userId: 'uA', name: 'Alice', text: 'usurpé' }); return 'allowed'; } catch (e) { return e.code; } }, pid);
    check('Feed : impossible de commenter au nom d\'un autre', rr === 'permission-denied', rr);
    await pA.evaluate(() => { window.__clip = null; Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__clip = t; return Promise.resolve(); } }, configurable: true }); shareFeedPost('Bob', 'a répondu à', 'Le Bistrot'); });
    await sleep(500);
    check('Feed : Partager copie le lien avec confirmation', await pA.evaluate(() => /noovaoff\.fr/.test(window.__clip || '')));
    await pA.screenshot({ path: SHOTS + '/feed.png' });
  });

  // ---------- PROFIL ----------
  await T('profile accordions', async () => {
    await pA.evaluate(() => goNav('profile')); await sleep(600);
    const st = await pA.evaluate(() => ({ n: document.querySelectorAll('.sec-card.acc').length, open: document.querySelectorAll('.sec-card.acc.open').length, vis: [...document.querySelectorAll('.sec-card.acc .acc-body')].filter(b => b.offsetHeight > 0).length }));
    check('Profil : 6 sections en menus déroulants, toutes repliées', st.n === 6 && st.open === 0 && st.vis === 0, JSON.stringify(st));
    await pA.evaluate(() => document.querySelectorAll('.sec-card.acc .sc-hdr')[0].click()); await sleep(300);
    const o = await pA.evaluate(() => [...document.querySelectorAll('.sec-card.acc .acc-body')].filter(b => b.offsetHeight > 0).length);
    check('Profil : un clic déroule la section', o === 1, 'ouvertes=' + o);
    await pA.screenshot({ path: SHOTS + '/profile.png' });
    await pA.evaluate(() => document.querySelectorAll('.sec-card.acc .sc-hdr')[0].click());
    await pA.evaluate(() => { document.querySelectorAll('.sec-card.acc .sc-hdr')[1].click(); }); await sleep(300);
    await pA.screenshot({ path: SHOTS + '/profile2.png' });
  });

  // ---------- CARTE ----------
  await T('map', async () => {
    const ctx = pA.browserContext();
    await ctx.overridePermissions('http://localhost:8950', ['geolocation']);
    await pA.setGeolocation({ latitude: 48.0061, longitude: 0.1996 });
    await pA.evaluate(() => { localStorage.setItem('nv_geo_ok', '1'); goNav('home'); });
    await wf(pA, () => Object.keys(_verifiedMerchantsCache || {}).length === 3, null, 15000);
    await pA.evaluate(() => openFullMap());
    await wf(pA, () => document.querySelectorAll('#mf-list .mf-row').length === 3, null, 10000);
    check('Carte : les 3 commerces de la ville listés (pas seulement les autorisés)', true);
    await wf(pA, () => _mapSt.list.filter(m => m.lat != null).length >= 2, null, 60000).catch(() => {});
    const geo = await pA.evaluate(() => _mapSt.list.filter(m => m.lat != null).length);
    check('Carte : adresses géocodées et pins posés', geo >= 2, 'pins=' + geo);
    await sleep(1500);
    const st = await pA.evaluate(() => ({ chips: document.querySelectorAll('.mf-chip').length, user: !!_mapSt.userMarker, markers: document.querySelectorAll('.leaflet-marker-icon').length, dir: document.querySelectorAll('.mf-act button.alt').length }));
    check('Carte : filtres, position de l\'utilisateur, itinéraires', st.chips >= 4 && st.user && st.dir >= 2, JSON.stringify(st));
    await pA.evaluate(() => mapSetFilter('boulangerie')); await sleep(400);
    check('Carte : filtre par catégorie', await pA.evaluate(() => document.querySelectorAll('#mf-list .mf-row').length === 1));
    await pA.evaluate(() => mapSetFilter('all')); await sleep(300);
    await pA.evaluate(() => mapSelect(_mapSt.list.find(m => m.lat != null).id, true)); await sleep(1500);
    await pA.screenshot({ path: SHOTS + '/map.png' });
    await pA.evaluate(() => mapToggleSheet()); await sleep(500);
    await pA.screenshot({ path: SHOTS + '/map2.png' });
  });

  // ---------- DASHBOARD : pas de photo d'un autre compte ----------
  await T('dashboard isolation', async () => {
    const ctx = await browser.createBrowserContext();
    const d = await ctx.newPage(); await d.setViewport({ width: 1280, height: 900 });
    await d.evaluateOnNewDocument(() => { try { localStorage.setItem('nv_pro_intro', '1'); } catch (e) {} });
    await d.goto(DASH, { waitUntil: 'load' });
    await wf(d, () => document.getElementById('auth-wall').style.display === 'flex', null, 30000);
    await d.evaluate(() => awTab('login')); await setVal(d, '#aw-email', 'm3@t.fr'); await setVal(d, '#aw-pass', 'secret123'); await d.evaluate(() => awSubmit());
    await wf(d, () => typeof _mData !== 'undefined' && _mData && _mData.brandName === 'Salon Belle', null, 25000);
    await d.evaluate(() => { endDashTour(); });
    const hasImg = await d.evaluate(() => !!document.querySelector('.sb-brand-av img') || document.querySelector('.sb-brand-av').innerHTML.includes('svg'));
    check('Dashboard : compte avec logo connecté', hasImg);
    await d.evaluate(() => { document.querySelector('.sb-brand-av').innerHTML = '<img id="leftover" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">'; logout(); });
    await d.waitForNavigation({ waitUntil: 'load', timeout: 20000 }).catch(() => {});
    await wf(d, () => document.getElementById('auth-wall').style.display === 'flex', null, 30000);
    check('Déconnexion : page rechargée, plus aucune donnée du compte précédent', await d.evaluate(() => !document.getElementById('leftover') && !auth.currentUser && !(typeof _mData !== 'undefined' && _mData)));
    await d.evaluate(() => awTab('login')); await setVal(d, '#aw-email', 'm2@t.fr'); await setVal(d, '#aw-pass', 'secret123'); await d.evaluate(() => awSubmit());
    await wf(d, () => typeof _mData !== 'undefined' && _mData && _mData.brandName === 'Boulangerie Martin', null, 25000);
    await sleep(800);
    const r = await d.evaluate(() => ({ img: !!document.querySelector('.sb-brand-av img'), prev: /salon/i.test(document.querySelector('.sb-brand-name').textContent), cover: !!document.querySelector('#set-cover-preview img'), logoPrev: !!document.querySelector('#set-logo-preview img') }));
    check('Commerce sans logo : aucune photo héritée du compte précédent', !r.img && !r.prev && !r.cover && !r.logoPrev, JSON.stringify(r));
    const logo = await d.evaluate(async () => { const t = async fn => { try { await fn(); return 'allowed'; } catch (e) { return e.code; } }; return { other: await t(() => db.collection('merchants').doc(auth.currentUser.uid).update({ logoUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/merchants%2FmM3%2Flogo.jpg?alt=media' })), own: await t(() => db.collection('merchants').doc(auth.currentUser.uid).update({ coverUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/merchants%2F' + auth.currentUser.uid + '%2Fcover.jpg?alt=media' })) }; });
    check('Logo d\'un autre commerce refusé, le sien accepté', logo.other === 'permission-denied' && logo.own === 'allowed', JSON.stringify(logo));
  });

  await browser.close();
  const errs = [...pA.errs, ...pB.errs, ...pC.errs];
  console.log('JS errors:', [...new Set(errs)].join(' | ') || 'aucune');
  process.exit(0);
})().catch(e => { console.log('EXC', e); process.exit(1); });
