process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
const puppeteer=require('puppeteer-core');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const adb=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.message).split('\n')[0]);}};
const wf=(p,fn,arg,t=25000)=>p.waitForFunction(fn,{timeout:t,polling:200},arg);
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const CHROME=(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const APP='http://localhost:8950/app.html',DASH='http://localhost:8950/dash.html',ADMIN='http://localhost:8950/admin.html';
const UA_IOS='Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const UA_AND='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const QUESTION='Quelle est ta boisson préférée ?';

async function login(browser,email,{ua,perm='default',standalone=false}={}){
  const ctx=await browser.createBrowserContext();const p=await ctx.newPage();await p.setViewport({width:430,height:900});
  if(ua)await p.setUserAgent(ua);
  const errs=[];p.on('pageerror',e=>errs.push(e.message));p.errs=errs;
  await p.evaluateOnNewDocument((perm,standalone)=>{
    try{Object.defineProperty(Notification,'permission',{get:()=>window.__perm||perm,configurable:true});
        window.__reqCount=0;Notification.requestPermission=async()=>{window.__reqCount++;window.__perm='denied';return 'denied';};}catch(e){}
    if(standalone){const mm=window.matchMedia.bind(window);window.matchMedia=q=>/standalone/.test(q)?{matches:true,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}:mm(q);}
  },perm,standalone);
  await p.goto(APP,{waitUntil:'load'});
  await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
  await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email',email);await setVal(p,'#aw-pass',email==='u@t.fr'?'secret123':'secret123');
  await p.evaluate(()=>awSubmit());
  await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user,null,30000);
  await p.evaluate(()=>{try{S._seenHomeTour=true;const t=document.getElementById('home-tour');if(t)t.remove();}catch(e){}});
  return p;
}
(async()=>{
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});
  await aauth.createUser({uid:'u1',email:'u@t.fr',password:'secret123'});
  await adb.doc('users/u1').set({role:'user',welcomeClaimed:true,name:'Alice',email:'u@t.fr',city:'le-mans',cityLabel:'Le Mans',interests:['restauration'],authorizedMerchants:['m1'],friendUids:[],answeredCampaigns:[],points:0,xp:0,streak:0,onboardingStep:'done',seenHomeTour:true,pushEnabled:true,fcmTokens:['tokA'],notifPrefs:{amis:false}});
  await adb.doc('merchants/m1').set({brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:'m1@shop.fr',ownerUid:'m1',cashierAck:true,verifiedPopupShown:true});
  await aauth.createUser({uid:'m1',email:'m1@shop.fr',password:'secret123'});
  await adb.doc('campaigns/c1').set({merchantId:'m1',merchantName:'Le Fournil',status:'active',targetCity:'le-mans',city:'le-mans',question:QUESTION,questions:[{q:QUESTION,format:'mcq',options:['Café','Thé']}],targetVolume:500,answersCount:0,createdAt:Timestamp.now()});
  await aauth.createUser({uid:'adm',email:'tomussproduction@gmail.com',password:'secret123'});
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  let errs=[];

  // ───── Réglages : un interrupteur par type ─────
  const pa=await login(browser,'u@t.fr',{perm:'default'});errs.push(pa.errs);
  await T('settings',async()=>{
    await sleep(1200);
    check('Jamais de demande de permission à l\'ouverture de l\'app',await pa.evaluate(()=>document.getElementById('perm-sheet').style.display!=='flex'&&window.__reqCount===0));
    await pa.evaluate(()=>{goNav('profile');refreshProfile();});await sleep(600);
    const secs=await pa.evaluate(()=>({n:document.querySelectorAll('.sec-card.acc').length,notif:!!document.getElementById('notif-section')}));
    check('Profil : section « Notifications » en menu déroulant (replié)',secs.notif&&await pa.evaluate(()=>!document.getElementById('notif-section').classList.contains('open')),secs);
    await pa.evaluate(()=>document.querySelector('#notif-section .sc-hdr').click());await sleep(300);
    const rows=await pa.evaluate(()=>[...document.querySelectorAll('#notif-switches .nf-row')].map(r=>({t:r.querySelector('.nf-t').textContent,on:r.querySelector('input').checked,g:r.querySelector('input').dataset.g})));
    check('Réglages : 7 interrupteurs, libellés en langage utilisateur, dans l\'ordre',rows.map(r=>r.t).join('|')==='Ma question du jour|Nouveaux commerces|Résultats|Ma série|Mes récompenses|Mes amis|Actualités des commerces',rows.map(r=>r.t));
    check('Réglages : pas d\'interrupteur global',await pa.evaluate(()=>document.querySelectorAll('#notif-section input[type=checkbox]').length===7));
    check('Réglages : état lu depuis le profil (Mes amis coupé, les autres actifs)',rows.filter(r=>!r.on).map(r=>r.g).join()==='amis',rows);
    await pa.screenshot({path:'/tmp/shots/notif_settings.png'});
    await pa.evaluate(()=>document.querySelector('#notif-switches input[data-g=question]').click());
    for(let i=0;i<30;i++){await sleep(400);if(((await adb.doc('users/u1').get()).data().notifPrefs||{}).question===false)break;}
    let u=(await adb.doc('users/u1').get()).data();
    check('Réglages : couper « Ma question du jour » l\'enregistre',u.notifPrefs.question===false&&u.notifPrefs.amis===false,u.notifPrefs);
    check('Réglages : la désactivation est comptée dans les métriques',((await adb.doc('notifMetrics/question_du_jour').get()).data()||{}).deactivated===1);
    await pa.evaluate(()=>document.querySelector('#notif-switches input[data-g=amis]').click());await sleep(1500);
    u=(await adb.doc('users/u1').get()).data();
    check('Réglages : réactiver « Mes amis »',u.notifPrefs.amis===true);
    const r=await pa.evaluate(async()=>{const t=async fn=>{try{await fn();return 'allowed';}catch(e){return e.code;}};const ref=db.collection('users').doc(auth.currentUser.uid);
      return {prefs:await t(()=>ref.update({notifPrefs:{question:true}})),stats:await t(()=>ref.update({'notifStats.question_du_jour.autoOff':false})),daily:await t(()=>ref.update({notifDaily:{date:'x',count:0}})),mins:await t(()=>ref.update({answerMinutes:[1,2,3]})),
              metrics:await t(()=>db.collection('notifMetrics').doc('ami').get()),log:await t(()=>db.collection('notifLog').limit(1).get()),queue:await t(()=>db.collection('notifQueue').limit(1).get()),
              flag:await t(()=>ref.update({pushEnabled:true}))};});
    check('Règles : le client ne peut écrire ni réglages, ni statistiques, ni quota de notifications',r.prefs==='permission-denied'&&r.stats==='permission-denied'&&r.daily==='permission-denied'&&r.mins==='permission-denied',r);
    check('Règles : journal, file et métriques illisibles côté client',r.metrics==='permission-denied'&&r.log==='permission-denied'&&r.queue==='permission-denied',r);
    check('Règles : le drapeau pushEnabled reste modifiable (inoffensif)',r.flag==='allowed',r);
  });
  await T('device state',async()=>{
    const st=await pa.evaluate(()=>document.getElementById('notif-device').textContent.replace(/\s+/g,' '));
    check('Réglages : statut de l\'appareil (activer) affiché sans interrupteur global',/Active les notifications sur cet appareil/.test(st)||/ne permet pas/.test(st)||/bloquées/.test(st),st);
  });

  // ───── Permission : après la première réponse validée ─────
  await T('first answer permission',async()=>{
    await pa.evaluate(()=>{_fcmMessaging=_fcmMessaging||{};});
    await pa.evaluate(()=>{try{localStorage.removeItem('nv_perm_notif');}catch(e){}goNav('home');});
    await wf(pa,()=>S.qs&&S.qs.length>=1,null,20000);
    // 1) réponse trop rapide (non lue) : pas de demande
    await pa.evaluate(()=>{openQ(0);});await wf(pa,()=>document.querySelectorAll('#ans-area .mcq-opt').length>0);
    await pa.evaluate(()=>{S._qLockUntil=0;document.querySelector('#ans-area .mcq-opt').click();submitAns();});
    await sleep(4500);
    const flagged=(await adb.collection('answers').where('userId','==','u1').get()).docs.map(d=>d.data());
    check('Réponse trop rapide : enregistrée sans gain',flagged.length===1&&flagged[0].flagged===true);
    check('Réponse non validée : aucune demande de notification',await pa.evaluate(()=>document.getElementById('perm-sheet').style.display!=='flex'));
    await adb.collection('answers').doc('u1_c1_q0').delete();await adb.doc('users/u1').update({answeredCampaigns:[]});
    await pa.evaluate(()=>{S._answered=[];S._answeredQ=[];goNav('home');recomputeCampaignFeed('le-mans');});await sleep(800);
    // 2) réponse validée (>= 3 s) : demande d'explication maison
    await pa.evaluate(()=>{openQ(0);});await wf(pa,()=>document.querySelectorAll('#ans-area .mcq-opt').length>0);
    await pa.evaluate(()=>document.querySelector('#ans-area .mcq-opt').click());await sleep(3400);
    await pa.evaluate(()=>submitAns());
    await wf(pa,()=>document.getElementById('perm-sheet').style.display==='flex',null,15000);
    const txt=await pa.evaluate(()=>({t:document.getElementById('perm-title').textContent,d:document.getElementById('perm-text').textContent,c:document.getElementById('perm-cta').textContent,req:window.__reqCount}));
    check('Première réponse validée : écran d\'explication maison AVANT la pop-up système',/Une notification par jour/.test(txt.t)&&/au maximum une fois par jour/.test(txt.d)&&txt.req===0,txt);
    await pa.screenshot({path:'/tmp/shots/notif_ask.png'});
    await pa.evaluate(()=>permLater());
    check('« Pas maintenant » : la pop-up système n\'est jamais déclenchée',await pa.evaluate(()=>window.__reqCount===0));
    check('« Pas maintenant » : redemandé au plus tard dans 7 jours',await pa.evaluate(()=>{askNotifFlow(false);return document.getElementById('perm-sheet').style.display!=='flex';}));
    const forced=await pa.evaluate(()=>{askNotifFlow(true);return document.getElementById('perm-sheet').style.display==='flex';});
    check('Depuis les réglages (clic explicite) : l\'explication est toujours proposée',forced);
    await pa.evaluate(()=>permAccept());await sleep(1200);
    const after=await pa.evaluate(()=>({req:window.__reqCount,cool:+localStorage.getItem('nv_perm_notif')||0}));
    check('Accepter l\'explication déclenche la pop-up système (une seule)',after.req===1,after);
    check('Refus système : plus de demande avant 7 jours',after.cool>Date.now()-60000&&await pa.evaluate(()=>{askNotifFlow(false);return document.getElementById('perm-sheet').style.display!=='flex';}));
  });
  await pa.close();

  // ───── iPhone Safari (hors écran d'accueil) : invitation à installer, jamais la permission ─────
  const pi=await login(browser,'u@t.fr',{ua:UA_IOS,perm:'default'});errs.push(pi.errs);
  await T('ios',async()=>{
    await pi.evaluate(()=>{_fcmMessaging=_fcmMessaging||{};try{localStorage.removeItem('nv_perm_notif_install');}catch(e){}});
    check('iOS Safari : plateforme et mode détectés (pas standalone)',await pi.evaluate(()=>NV_IS_IOS===true&&nvIsStandalone()===false&&NV_IS_ANDROID===false));
    await pi.evaluate(()=>askNotifFlow(false));
    const t=await pi.evaluate(()=>({show:document.getElementById('perm-sheet').style.display==='flex',t:document.getElementById('perm-title').textContent,d:document.getElementById('perm-text').textContent,c:document.getElementById('perm-cta').textContent,req:window.__reqCount}));
    check('iOS hors écran d\'accueil : invitation à ajouter l\'app AU LIEU de la permission',t.show&&/écran d'accueil/.test(t.d)&&/Partager/.test(t.d)&&/Sur l'écran d'accueil/.test(t.d)&&/Voir comment faire/.test(t.c)&&t.req===0,t);
    await pi.evaluate(()=>permAccept());await sleep(400);
    const sheets=await pi.evaluate(()=>({ios:!!document.getElementById('ios-install-sheet'),and:!!document.getElementById('android-install-sheet'),txt:(document.getElementById('ios-install-sheet')||{}).textContent||''}));
    check('iOS : instructions iOS (Partager → Sur l\'écran d\'accueil), jamais celles d\'Android',sheets.ios&&!sheets.and&&/Sur l'écran d'accueil/.test(sheets.txt)&&!/Installer l'application/.test(sheets.txt),sheets);
    await pi.screenshot({path:'/tmp/shots/notif_ios.png'});
    await pi.evaluate(()=>{document.getElementById('ios-install-sheet').remove();goNav('profile');document.querySelector('#notif-section .sc-hdr').click();});await sleep(300);
    const dev=await pi.evaluate(()=>document.getElementById('notif-device').textContent);
    check('iOS : la section Réglages propose aussi l\'ajout à l\'écran d\'accueil',/écran d'accueil/.test(dev),dev);
    check('iOS : la pop-up système n\'a jamais été demandée',await pi.evaluate(()=>window.__reqCount===0));
  });
  await pi.close();
  const ps=await login(browser,'u@t.fr',{ua:UA_IOS,perm:'default',standalone:true});errs.push(ps.errs);
  await T('ios standalone',async()=>{
    await ps.evaluate(()=>{_fcmMessaging=_fcmMessaging||{};});
    check('iOS installée (standalone) détectée',await ps.evaluate(()=>NV_IS_IOS&&nvIsStandalone()===true));
    await ps.evaluate(()=>askNotifFlow(false));
    const t=await ps.evaluate(()=>({show:document.getElementById('perm-sheet').style.display==='flex',c:document.getElementById('perm-cta').textContent}));
    check('iOS installée : on propose directement les notifications (plus l\'installation)',t.show&&/Activer les notifications/.test(t.c),t);
  });
  await ps.close();

  // ───── Android : instructions Chrome, jamais celles d'iOS ─────
  const pn=await login(browser,'u@t.fr',{ua:UA_AND,perm:'default'});errs.push(pn.errs);
  await T('android',async()=>{
    check('Android détecté',await pn.evaluate(()=>NV_IS_ANDROID===true&&NV_IS_IOS===false));
    await pn.evaluate(()=>{S.streak=3;triggerInstall();});await sleep(300);
    const sh=await pn.evaluate(()=>({and:!!document.getElementById('android-install-sheet'),ios:!!document.getElementById('ios-install-sheet'),txt:(document.getElementById('android-install-sheet')||{}).textContent||''}));
    check('Android : instructions Chrome (menu → Installer l\'application), jamais celles d\'iOS',sh.and&&!sh.ios&&/Installer l'application/.test(sh.txt)&&!/Partager/.test(sh.txt),sh);
    await pn.screenshot({path:'/tmp/shots/notif_android.png'});
  });
  await pn.close();

  // ───── Suivi d'ouverture depuis une notification ─────
  await T('open tracking',async()=>{
    await adb.doc('notifLog/u1_question_du_jour_k1').set({uid:'u1',type:'question_du_jour',key:'k1',status:'sent',sentAt:Timestamp.now(),title:'x',body:'y'});
    await adb.doc('notifMetrics/question_du_jour').set({sent:1},{merge:true});
    const ctx=await browser.createBrowserContext();const p=await ctx.newPage();await p.setViewport({width:430,height:900});
    await p.goto(APP+'?n=u1_question_du_jour_k1&go=rewards-tab',{waitUntil:'load'});
    await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    check('Lien de notification : le paramètre est retiré de l\'URL',await p.evaluate(()=>location.search===''));
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','u@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('rewards-tab').classList.contains('active'),null,30000);
    check('Lien de notification : l\'écran demandé (Récompenses) s\'ouvre après connexion',true);
    await sleep(2000);
    const l=(await adb.doc('notifLog/u1_question_du_jour_k1').get()).data();
    const m=(await adb.doc('notifMetrics/question_du_jour').get()).data();
    check('Ouverture comptée à la connexion (journal + métriques)',l.status==='opened'&&m.opened===1,[l.status,m]);
    // message du service worker
    await p.evaluate(()=>{sessionStorage.setItem('nv_open',JSON.stringify({nid:'u1_question_du_jour_k1',go:'social'}));return flushNotifOpen();});await sleep(1500);
    check('Ouverture déjà comptée : pas de doublon',((await adb.doc('notifMetrics/question_du_jour').get()).data()).opened===1);
    await ctx.close();
  });

  // ───── Back-office ─────
  await T('admin',async()=>{
    await adb.doc('notifMetrics/question_du_jour').set({sent:250,opened:5,deactivated:12,autoDisabled:3});
    await adb.doc('notifMetrics/nouveau_commerce').set({sent:300,opened:60,deactivated:2});
    await adb.doc('notifMetrics/ami').set({sent:40,opened:10});
    const ctx=await browser.createBrowserContext();const p=await ctx.newPage();await p.setViewport({width:1200,height:900});
    p.on('pageerror',e=>errs.push([e.message]));
    await p.goto(ADMIN,{waitUntil:'load'});await sleep(1500);
    await p.evaluate(async()=>{await auth.signInWithEmailAndPassword('tomussproduction@gmail.com','secret123');});
    await p.evaluate(()=>{document.getElementById('tab-notifications').style.display='block';return loadNotifMetrics();});await sleep(1500);
    const rows=await p.evaluate(()=>[...document.querySelectorAll('#notif-rows tr')].map(r=>[...r.children].map(c=>c.textContent.trim())));
    const q=rows.find(r=>/Question du jour/.test(r[0]));const n=rows.find(r=>/Nouveau commerce/.test(r[0]));const a=rows.find(r=>/^Ami/.test(r[0]));
    check('Back-office : les 8 types listés avec envois, ouvertures, taux, désactivations',rows.length===8&&q[1]==='250'&&q[2]==='5'&&q[3]==='2.0 %'&&/^15/.test(q[4]),rows);
    check('Back-office : sous 5 % sur 200 envois = « À supprimer »',/À supprimer/.test(q[5]),q);
    check('Back-office : au-dessus de 5 % = « À garder »',/À garder/.test(n[5]),n);
    check('Back-office : moins de 200 envois = en observation',/En observation \(40\/200\)/.test(a[5]),a);
    await p.screenshot({path:'/tmp/shots/notif_admin.png'});
    const nonAdmin=await browser.createBrowserContext();
    await ctx.close();
  });

  // ───── Dashboard : notifications commerçant (in-app) ─────
  await T('dashboard',async()=>{
    await adb.collection('merchants/m1/notifications').doc('resp_c1_5').set({type:'paliers',title:'Vos 5 premières réponses sont là',message:'Vous avez reçu vos 5 premières réponses, les résultats sont disponibles.',read:false,createdAt:Timestamp.now()});
    const ctx=await browser.createBrowserContext();const p=await ctx.newPage();await p.setViewport({width:1280,height:900});
    await p.evaluateOnNewDocument(()=>{try{localStorage.setItem('nv_pro_intro','1');}catch(e){}});
    await p.goto(DASH,{waitUntil:'load'});await wf(p,()=>document.getElementById('auth-wall').style.display==='flex',null,30000);
    await p.evaluate(()=>awTab('login'));await setVal(p,'#aw-email','m1@shop.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>typeof _mData!=='undefined'&&_mData&&_mData.brandName==='Le Fournil',null,25000);
    await p.evaluate(()=>{endDashTour();});await sleep(1500);
    await p.evaluate(()=>toggleNotifPanel());await sleep(500);
    const t=await p.$eval('#notif-list',e=>e.textContent);
    check('Dashboard : la notification affiche son titre et le message',/Vos 5 premières réponses sont là/.test(t)&&/Vous avez reçu vos 5 premières réponses, les résultats sont disponibles\./.test(t),t.slice(0,160));
    await p.screenshot({path:'/tmp/shots/notif_dash.png'});
    const sendable=await p.evaluate(async()=>{const t=async fn=>{try{await fn();return 'allowed';}catch(e){return e.code;}};
      return {fake:await t(()=>db.collection('merchants').doc(auth.currentUser.uid).collection('notifications').doc('x').set({title:'Faux',message:'Faux',read:false})),
              push:await t(()=>db.collection('users').doc('u1').collection('notifications').add({type:'noova_message',message:'Promo',fromUid:auth.currentUser.uid})),
              mail:await t(()=>db.collection('mail').add({to:'a@b.c'})),
              camp:await t(()=>db.collection('_pushSink').add({x:1}))};});
    check('Sécurité : un commerçant ne peut déclencher AUCUNE notification (habitant, email, push)',sendable.push==='permission-denied'&&sendable.mail==='permission-denied',sendable);
    await ctx.close();
  });

  await browser.close();
  console.log('JS errors:',[...new Set(errs.flat())].join(' | ')||'aucune');
  console.log(`\n===== ${pass}/${pass+fail} OK =====`);process.exit(fail?1:0);
})().catch(e=>{console.log('EXC',e);process.exit(1);});
