process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const E=require(__dirname+'/../functions/engagement.js')._t;
const CFG=require(__dirname+'/../functions/engagementConfig.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
let PG=null;const T=async(n,fn)=>{try{await fn();}catch(e){if(PG){console.log('DBG',JSON.stringify(await PG.evaluate(()=>({cur,fr:(S.friends||[]).map(f=>f.uid),wrap:(document.getElementById('compat-wrap')||{}).style&&document.getElementById('compat-wrap').style.display,list:(document.getElementById('compat-list')||{}).innerHTML,cache:S._compat&&S._compat.data})).catch(x=>String(x))).slice(0,1500));await PG.screenshot({path:'/tmp/shots/dbg2.png'});}fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,3).join(' | '));}};
const wf=(p,fn,arg,t=25000)=>p.waitForFunction(fn,{timeout:t,polling:200},arg);
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const CHROME=(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const APP='http://localhost:8950/app.html';
const Q='Quelle est ta boisson préférée ?';
const OPTS=['Café','Thé','Chocolat'];
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
async function mkUser(uid,o={}){await db.doc('users/'+uid).set({role:'user',name:'User '+uid,city:'le-mans',cityLabel:'Le Mans',authorizedMerchants:['m1'],friendUids:[],answeredCampaigns:[],points:0,xp:0,streak:0,interests:['restauration'],onboardingStep:'done',seenHomeTour:true,...o});}
async function mkCampaign(id,o={}){await db.doc('campaigns/'+id).set({merchantId:'m1',merchantName:'Le Fournil',sector:'Boulangerie',status:'active',targetCity:'le-mans',city:'le-mans',question:Q,questions:[{q:Q,format:'mcq',options:OPTS}],targetVolume:500,answersCount:0,createdAt:Timestamp.now(),...o});}
async function ans(uid,cid,answer,o={}){await db.doc(`answers/${uid}_${cid}_q${o.q||0}`).set({userId:uid,campaignId:cid,questionIdx:o.q||0,answer,flagged:!!o.flagged,suspect:!!o.suspect,pointsAwarded:0,createdAt:Timestamp.now()});}
const compat=(uid,d={})=>E.compatCore(uid,d);
const byName=(r,u)=>r.friends.find(f=>f.uid===u);
const err=async fn=>{try{await fn();return null;}catch(e){return e.code||String(e);}};


const until=async(fn,t=15000)=>{const s=Date.now();while(Date.now()-s<t){if(await fn())return true;await sleep(300);}return false;};
const ADMIN='http://localhost:8950/admin.html';



const DASH='http://localhost:8950/dash.html';
const AUTH='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake';
const idTokenOf=async(email)=>(await (await fetch(AUTH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'secret123',returnSecureToken:true})})).json()).idToken;
const callFn=async(name,data,token)=>{const r=await fetch('http://127.0.0.1:5001/noova-366d0/europe-west1/'+name,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({data})});const j=await r.json();return j.error?{error:j.error.status,message:j.error.message}:j.result;};
const QT=require(__dirname+'/../functions/quota.js')._t;
const setClock=ms=>db.doc('_testClock/now').set({ms});
const T0=Date.parse('2026-09-21T10:00:00Z');
const camp=async(id,nq,o={})=>{const qs=[];for(let i=0;i<nq;i++)qs.push({q:'Question '+id+'-'+i+' ?',format:'mcq',options:['Oui','Non']});await db.doc('campaigns/'+id).set({merchantId:'m1',merchantName:'Le Fournil',sector:'Boulangerie',status:'active',targetCity:'le-mans',city:'le-mans',question:qs[0].q,questions:qs,targetVolume:100,answersCount:0,createdAt:Timestamp.now(),...o});};
const st=async id=>(await db.doc('campaigns/'+id).get()).data();
const used=async()=>((await db.doc('merchants/m1/quota/2026-09').get()).data()||{}).used||0;
(async()=>{
  await T('quota serveur',async()=>{
    await wipe();
    await db.doc('merchants/m1').set({role:'merchant',ownerUid:'m1',brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:'m1@shop.fr',seenDashTour:true,verifiedPopupShown:true,cashierAck:true});
    await db.doc('merchants/m2').set({role:'merchant',ownerUid:'m2',brandName:'Le Bar',sector:'Restauration',city:'le-mans',status:'verified',email:'m2@shop.fr'});
    await mkUser('u1',{email:'u1@t.fr'});await db.doc('users/u1').update({pushEnabled:true,fcmTokens:['tok1']});
    await aauth.createUser({uid:'m1',email:'m1@shop.fr',password:'secret123'});await aauth.createUser({uid:'m2',email:'m2@shop.fr',password:'secret123'});
    await aauth.createUser({uid:'adm',email:'tomussproduction@gmail.com',password:'secret123'});
    const tm1=await idTokenOf('m1@shop.fr'),tm2=await idTokenOf('m2@shop.fr'),tadm=await idTokenOf('tomussproduction@gmail.com');
    await setClock(T0);
    let g=await callFn('getMyQuota',{},tm1);
    check('Quota par défaut : 10 questions par mois, 0 utilisée',g.quota===10&&g.used===0&&g.remaining===10&&g.month==='2026-09'&&/^2026-10-01$/.test(g.resetsOn)||g.resetsOn==='2026-10-01',g);
    check('getMyQuota exige d\'être connecté',(await callFn('getMyQuota',{},null)).error==='UNAUTHENTICATED');
    // consommation
    await camp('a',3);await camp('b',3);await camp('c',3);
    await until(async()=>(await used())===9);
    check('Trois campagnes de 3 questions → 9 questions utilisées, toutes actives',(await used())===9&&(await st('a')).status==='active'&&(await st('c')).status==='active',await used());
    await camp('d',3);                                              // 9 + 3 > 10
    await until(async()=>(await st('d')).status==='blocked');
    const d=await st('d');
    check('Au-delà du quota : la campagne est bloquée (raison « quota »), rien de consommé',d.status==='blocked'&&d.blockedReason==='quota'&&(await used())===9,d);
    await camp('e',1);await until(async()=>(await used())===10);
    check('Il reste 1 question : une campagne d\'une question passe (10 / 10)',(await used())===10&&(await st('e')).status==='active');
    await camp('f',1);await until(async()=>(await st('f')).status==='blocked');
    check('Quota épuisé : la suivante est bloquée',(await st('f')).status==='blocked'&&(await used())===10);
    await db.doc('campaigns/a').delete();await sleep(800);
    check('Supprimer une campagne ne rend pas les questions (registre)',(await used())===10);
    g=await callFn('getMyQuota',{},tm1);
    check('getMyQuota : 10 / 10, 0 restante',g.used===10&&g.remaining===0,g);
    // brouillon = consommé aussi (pas de contournement par activation ultérieure)
    await db.doc('merchants/m2').update({monthlyQuestionQuota:2});
    await camp('g',2,{merchantId:'m2',status:'draft'});
    await until(async()=>((await db.doc('merchants/m2/quota/2026-09').get()).data()||{}).used===2);
    check('Un brouillon consomme le quota dès sa création',((await db.doc('merchants/m2/quota/2026-09').get()).data()||{}).used===2);
    await camp('h',1,{merchantId:'m2'});await until(async()=>(await st('h')).status==='blocked');
    check('… donc l\'activer plus tard ne contourne rien, et une autre campagne est bloquée',(await st('h')).status==='blocked');
    // doublon de déclencheur
    const again=await QT.accountCampaign('b',(await st('b')));
    check('Comptabilité idempotente (même campagne comptée une seule fois)',again===true&&(await used())===10);
    // mois suivant
    const nxt=await QT.stateOf('m1',T0+32*86400000);
    check('Mois suivant : compteur remis à zéro',nxt.used===0&&nxt.remaining===10&&nxt.month==='2026-10',nxt);
    // quota propre par l'admin
    check('Fixer un quota : refusé à un commerçant',(await callFn('setMerchantQuota',{merchantId:'m1',quota:99},tm1)).error==='PERMISSION_DENIED');
    check('Fixer un quota : valeur invalide refusée',(await callFn('setMerchantQuota',{merchantId:'m1',quota:-3},tadm)).error==='INVALID_ARGUMENT'&&(await callFn('setMerchantQuota',{merchantId:'m1',quota:2.5},tadm)).error==='INVALID_ARGUMENT');
    const s1=await callFn('setMerchantQuota',{merchantId:'m1',quota:12},tadm);
    check('Admin : quota propre à 12 → 2 questions restantes',s1.quota===12&&s1.remaining===2,s1);
    const s2=await callFn('setMerchantQuota',{merchantId:'m1',quota:null},tadm);
    check('Admin : quota vide → retour au défaut (10)',s2.quota===10,s2);
    // le défaut n'est plus réglable depuis l'admin (réglage retiré) : il reste à 10 et l'ancien réglage est refusé
    const old=await callFn('setEngagementConfig',{values:{'QUOTA.DEFAULT_MONTHLY_QUESTIONS':20}},tadm);
    g=await callFn('getMyQuota',{},tm1);
    check('Le défaut n\'est plus modifiable depuis l\'admin : ancien réglage refusé, le quota par défaut reste 10',!!old.error&&g.quota===10,{old:old.error,g});
    // notifications : une campagne bloquée n'est jamais notifiée
    await db.doc('merchants/m3').set({role:'merchant',brandName:'Snack',sector:'Restauration',city:'le-mans',status:'verified',monthlyQuestionQuota:0});
    await db.doc('users/u1').update({authorizedMerchants:['m1','m3']});
    await camp('z',1,{merchantId:'m3',merchantName:'Snack'});await until(async()=>(await st('z')).status==='blocked');await sleep(2500);
    check('Campagne bloquée : aucune notification envoyée aux habitants',(await db.collection('_pushSink').get()).empty);
    await db.doc('merchants/m3').update({monthlyQuestionQuota:5});
    await camp('y',1,{merchantId:'m3',merchantName:'Snack'});await until(async()=>!(await db.collection('_pushSink').get()).empty,15000);
    check('Campagne autorisée : notification « nouveau commerce » envoyée',!(await db.collection('_pushSink').get()).empty);
  });

  await T('quota règles et interface',async()=>{
    const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
    const ctx=await browser.createBrowserContext();const p=await ctx.newPage();PG=p;await p.setViewport({width:1280,height:900});const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.evaluateOnNewDocument(()=>{try{localStorage.setItem('nv_pro_intro','1');}catch(e){}});
    await p.goto(DASH,{waitUntil:'load'});await wf(p,()=>document.getElementById('auth-wall').style.display==='flex',null,30000);
    await p.evaluate(()=>awTab('login'));await setVal(p,'#aw-email','m1@shop.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>typeof _mData!=='undefined'&&_mData&&_mData.brandName==='Le Fournil',null,25000);
    await wf(p,()=>document.querySelector('#quota-card .card'),null,15000);
    const qc=await p.$eval('#quota-card',e=>e.textContent.replace(/\s+/g,' '));
    check('Dashboard : carte « Questions de ce mois » (10 / 10, renouvelée le 1er octobre)',/Questions de ce mois/.test(qc)&&/10 \/ 10/.test(qc)&&/utilisé toutes vos questions/.test(qc)&&/1 octobre/.test(qc)&&/Offertes par votre ville/.test(qc),qc);
    await p.screenshot({path:'/tmp/shots/quota_card.png'});
    const side=await p.evaluate(()=>({brand:document.querySelector('.sb-brand-plan').textContent,plans:!!document.getElementById('page-plans'),billing:!!document.getElementById('page-billing'),txt:/€\s*\/\s*mois|abonnement|Starter|forfait de base|facturée/i.test(document.body.innerText)}));
    check('Plus de plan ni de facturation : libellé = ville, pages Formules/Facturation supprimées, aucun tarif affiché',side.brand==='Le Mans'&&!side.plans&&!side.billing&&!side.txt,side);
    const blocked=await p.evaluate(async()=>{const ok=await ensureQuotaFor(1);return {ok,toast:document.getElementById('toast-msg')&&document.getElementById('toast-msg').textContent};});
    check('Lancement refusé côté interface quand le quota est épuisé, avec la date de renouvellement',blocked.ok===false&&/Quota du mois atteint/.test(blocked.toast||'')&&/1 octobre/.test(blocked.toast||''),blocked);
    // règles côté commerçant
    const rules=await p.evaluate(async()=>{const t=async fn=>{try{await fn();return 'allowed';}catch(e){return e.code;}};const uid=auth.currentUser.uid;
      return {unblock:await t(()=>db.collection('campaigns').doc('d').update({status:'active'})),
        grow:await t(()=>db.collection('campaigns').doc('e').update({questions:[{q:'a',format:'mcq',options:['x','y']},{q:'b',format:'mcq',options:['x','y']}]})),
        edit:await t(()=>db.collection('campaigns').doc('e').update({name:'Renommée'})),
        quotaSelf:await t(()=>db.collection('merchants').doc(uid).update({monthlyQuestionQuota:9999})),
        quotaRead:await t(()=>db.collection('merchants').doc(uid).collection('quota').doc('2026-09').get()),
        ledgerRead:await t(()=>db.collection('merchants').doc(uid).collection('quotaLedger').doc('a').get()),
        blockedReason:await t(()=>db.collection('campaigns').doc('e').update({blockedReason:'x'}))};});
    check('Règles : une campagne bloquée ne peut pas être réactivée par le commerçant',rules.unblock==='permission-denied',rules);
    check('Règles : impossible d\'ajouter des questions après coup ; renommer reste possible',rules.grow==='permission-denied'&&rules.edit==='allowed',rules);
    check('Règles : le commerçant ne peut pas modifier son quota ni lire les compteurs',rules.quotaSelf==='permission-denied'&&rules.quotaRead==='permission-denied'&&rules.ledgerRead==='permission-denied'&&rules.blockedReason==='permission-denied',rules);
    // liste : étiquette de campagne bloquée
    await p.evaluate(()=>navTo('campaigns',document.getElementById('nav-campaigns')));await sleep(1200);
    check('Liste des campagnes : « Quota atteint » sur la campagne bloquée',/Quota atteint/.test(await p.$eval('#page-campaigns',e=>e.textContent)));
    await browser.close();
    console.log('JS errors:',[...new Set(errs)].join(' | ')||'aucune');
  });
  console.log(`\n===== ${pass}/${pass+fail} OK =====`);process.exit(fail?1:0);
})();
