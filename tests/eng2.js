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

(async()=>{
  // ═════════ COMPATIBILITÉ : logique serveur ═════════
  await T('compat core',async()=>{
    await wipe();
    await db.doc('merchants/m1').set({brandName:'Le Fournil',sector:'Boulangerie',city:'le-mans',status:'verified'});
    const sect={c1:'Boulangerie',c2:'Boulangerie',c3:'Boulangerie',c4:'Boulangerie',c5:'Restauration',c6:'Restauration',c7:'Restauration',c8:'Sport',c9:'Sport'};
    for(const [id,sector] of Object.entries(sect)) await mkCampaign(id,{sector});
    await mkCampaign('ct',{questions:[{q:'Libre ?',format:'text'}]});
    for(const u of ['me','fA','fB','fC','fD','fE']) await mkUser(u,{name:'User '+u});
    await db.doc('users/me').update({friendUids:['fA','fB','fC','fD','fE']});
    for(const u of ['fA','fB','fC','fE']) await db.doc('users/'+u).update({friendUids:['me']});
    await db.doc('users/fC').update({shareAnswers:false});
    const ids=Object.keys(sect);
    for(const c of ids){await ans('me',c,'Café');await ans('fA',c,c==='c7'?'Thé':'Café');await ans('fC',c,'Café');await ans('fD',c,'Café');}
    for(const c of ['c1','c2','c3'])await ans('fB',c,'Café');
    for(const [c,a] of [['c1','Café'],['c2','Café'],['c3','Café'],['c4','Thé'],['c5','Thé'],['c6','Thé']])await ans('fE',c,a);
    await ans('me','ct','du texte');await ans('fA','ct','du texte');
    let r=await compat('me');
    const A=byName(r,'fA'),B=byName(r,'fB'),C=byName(r,'fC'),D=byName(r,'fD'),Ef=byName(r,'fE');
    check('Compat : ami avec 9 questions en commun (8 identiques) = 89 %',A&&A.state==='ok'&&A.pct===89&&A.common===9&&A.agree===8,A);
    check('Compat : la question texte n\'est pas comptée (format non comparable)',A.common===9);
    check('Compat : détail par catégorie (≥ 3 en commun) : Boulangerie 100 %, Restauration 67 % ; Sport (2) masqué',A.categories.map(c=>c.category+':'+c.pct).join()==='boulangerie:100,restauration:67',A.categories);
    check('Compat : 6 en commun, 3 identiques = 50 %',Ef.state==='ok'&&Ef.pct===50&&Ef.common===6,Ef);
    check('Compat : sous le seuil (3 en commun) = « encore 2 », aucun pourcentage',B.state==='need'&&B.needed===2&&B.pct===undefined&&B.common===3,B);
    check('Compat : ami qui a coupé le partage = « private », aucun pourcentage',C.state==='private'&&C.pct===undefined&&C.common===undefined,C);
    check('Compat : amitié non réciproque exclue',!D);
    check('Compat : tri par % décroissant, puis « encore N », puis privé',r.friends.map(f=>f.uid).join()==='fA,fE,fB,fC',r.friends.map(f=>f.uid));
    check('Compat : aucune réponse individuelle dans la réponse serveur',!/Café|Thé|Chocolat/.test(JSON.stringify(r)),JSON.stringify(r).slice(0,200));
    check('Compat : cache de paire enregistré',(await db.doc('compatCache/fA_me').get()).exists);
    // cache : un changement de réponse n'apparaît pas avant expiration
    await ans('fA','c1','Thé');
    r=await compat('me');check('Compat : cache 10 min (changement pas encore visible)',byName(r,'fA').pct===89,byName(r,'fA').pct);
    r=await compat('me',{},Date.now());await db.doc('compatCache/fA_me').delete();
    r=await compat('me');check('Compat : cache vidé → recalcul (7/9 = 78 %)',byName(r,'fA').pct===78,byName(r,'fA').pct);
    const later=await E.compatCore('me',{},Date.now()+(CFG.COMPAT.CACHE_MINUTES+1)*60000);
    check('Compat : cache expiré après CACHE_MINUTES → recalcul',!!byName(later,'fA'));
    // détail d'un seul ami
    r=await compat('me',{friendUid:'fA'});check('Compat : détail d\'un seul ami',r.friends.length===1&&r.friends[0].uid==='fA');
    check('Compat : détail d\'un ami non réciproque : rien (pas de fuite)',(await compat('me',{friendUid:'fD'})).friends.length===0);
    check('Compat : détail d\'un inconnu refusé',await err(()=>compat('me',{friendUid:'nobody'}))==='permission-denied');
    // je coupe mon partage
    await db.doc('users/me').update({shareAnswers:false});
    r=await compat('me');check('Compat : si JE ne partage pas, rien n\'est comparé',r.sharing===false&&r.friends.length===0,r);
    await db.doc('users/me').update({shareAnswers:true});
    // ancienne réponse sans catégorie : déduite du secteur de la campagne
    // symétrie
    const r2=await compat('fA');const m=byName(r2,'me');
    check('Compat : symétrique (vu de fA : 78 % avec me)',m&&m.pct===78,m);
    check('Compat : vu de fA, me reste visible (il partage)',m.state==='ok');
  });

  // ═════════ COMPATIBILITÉ : règles + interface ═════════
  await T('compat ui',async()=>{
    await db.doc('users/fC').update({shareAnswers:false});
    await db.doc('compatCache/fA_me').delete().catch(()=>{});
    await mkCampaign('c10',{sector:'Boulangerie'});
    await ans('fA','c10','Café');await ans('fC','c10','Thé');
    await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});
    await db.doc('users/me').update({email:'me@t.fr',name:'Moi'});
    const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
    const p=await browser.newPage();PG=p;await p.setViewport({width:430,height:900});
    const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.goto(APP,{waitUntil:'load'});
    await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    try{await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user&&S.friends&&S.friends.length>=4,null,30000);}catch(e){console.log('DBG',JSON.stringify(await p.evaluate(()=>({cur:typeof cur!=='undefined'?cur:null,user:!!S.user,fr:(S.friends||[]).length,fu:S._friendUids,err:document.getElementById('aw-err')&&document.getElementById('aw-err').textContent}))));throw e;}
    await p.addStyleTag({content:'body>div[style*="emulator"]{display:none!important}'});
    const shot=async n=>{await p.evaluate(()=>{try{closeCelebration()}catch(e){}});await sleep(600);await p.screenshot({path:'/tmp/shots/'+n+'.png'});};
    await p.evaluate(()=>goNav('social'));
    await p.evaluate(()=>socTab('friends',document.querySelector('.tab-btn[onclick*="friends"]')));
    await wf(p,()=>document.querySelectorAll('#compat-list .cp-row').length>=4,null,20000);
    const rows=await p.evaluate(()=>[...document.querySelectorAll('#compat-list .cp-row')].map(r=>({n:r.querySelector('.cp-name').textContent,p:r.querySelector('.cp-pct').textContent.trim(),s:r.querySelector('.cp-sub').textContent,bar:!!r.querySelector('.cp-bar')})));
    await shot('compat_list');
    check('Liste « Mes compatibilités » : 4 amis triés (78 → 50 → encore N → privé)',rows.map(r=>r.n).join()==='User fA,User fE,User fB,User fC',rows);
    check('Liste : pourcentage et barre pour les scores',rows[0].p==='78 %'&&rows[0].bar&&rows[1].p==='50 %',rows.slice(0,2));
    check('Liste : « Répondez à 2 questions de plus… » sous le seuil, sans barre',/Répondez à 2 questions de plus/.test(rows[2].s)&&!rows[2].bar&&rows[2].p==='—',rows[2]);
    check('Liste : « Ne partage pas ses réponses » pour l\'ami privé',/Ne partage pas/.test(rows[3].s),rows[3]);
    check('Liste : l\'ami non réciproque n\'apparaît pas',!rows.some(r=>r.n==='User fD'));
    // profil d'ami
    await p.evaluate(()=>document.querySelector('#compat-list .cp-row').click());
    await wf(p,()=>document.getElementById('fprofile').classList.contains('active')&&document.querySelector('#fp-compat .fpr-big'),null,15000);
    const prof=await p.evaluate(()=>({name:document.querySelector('.fpr-name').textContent,big:document.querySelector('.fpr-big').textContent,lbl:document.querySelector('.fpr-lbl').textContent,cats:[...document.querySelectorAll('.fpr-cat')].map(c=>c.textContent.replace(/\s+/g,' ').trim()),nav:document.getElementById('bnav').classList.contains('show')}));
    await shot('compat_profile');
    check('Profil d\'ami : nom, score, détail',prof.name==='User fA'&&prof.big==='78 %'&&/7 des 9/.test(prof.lbl),prof);
    check('Profil d\'ami : catégories Boulangerie 75 % et Restauration 67 %',prof.cats.length===2&&/Boulangerie.*75 %/.test(prof.cats[0])&&/Restauration.*67 %/.test(prof.cats[1]),prof.cats);
    await p.evaluate(()=>document.querySelector('#fprofile .fpr-btn').click());
    await wf(p,()=>document.getElementById('chat').classList.contains('active'),null,10000);
    check('Profil d\'ami : « Envoyer un message » ouvre la conversation',(await p.$eval('#ch-name',e=>e.textContent))==='User fA');
    await p.evaluate(()=>leaveChat());
    // profil d'un ami sous le seuil
    await p.evaluate(()=>openFriendProfile(S.friends.find(f=>f.uid==='fB')));
    await wf(p,()=>document.querySelector('#fp-compat .fpr-lbl'),null,10000);
    const need=await p.$eval('#fp-compat',e=>e.textContent);
    check('Profil d\'ami sous le seuil : « Répondez à 2 questions de plus », pas de score',/Répondez à 2 questions de plus/.test(need)&&!/%/.test(need),need);
    await p.evaluate(()=>goTo('social'));
    // règles : réponses d'un ami qui ne partage pas
    const acc=await p.evaluate(async()=>{const t=async fn=>{try{await fn();return 'allowed';}catch(e){return e.code;}};
      return {ok:await t(()=>db.collection('answers').doc('fA_c1_q0').get()),off:await t(()=>db.collection('answers').doc('fC_c1_q0').get()),
        stranger:await t(()=>db.collection('answers').doc('fD_c1_q0').get()),cache:await t(()=>db.collection('compatCache').doc('fA_me').get()),
        friendsAns:S._friendAnswers&&S._friendAnswers['c10']};});
    check('Règles : réponse d\'un ami qui partage lisible',acc.ok==='allowed',acc);
    check('Règles : réponse d\'un ami qui a coupé le partage = refusée (même en lecture directe)',acc.off==='permission-denied',acc);
    check('Règles : réponse d\'un non-ami refusée ; compatCache illisible',acc.stranger==='permission-denied'&&acc.cache==='permission-denied',acc);
    // feed « ce que mes amis ont répondu » : l'ami privé est absent, l'autre reste
    const feed=await p.evaluate(async()=>{await loadFriendAnswers();return Object.values(S._friendAnswers).flat().map(a=>a.uid).sort();});
    check('Feed amis : réponses de fA présentes, celles de fC (privé) absentes, aucune erreur',feed.includes('fA')&&!feed.includes('fC'),feed);
    // mon partage coupé : invitation à l'activer
    await p.evaluate(()=>{S._shareAnswers=false;});
    await p.evaluate(async()=>{await db.collection('users').doc(auth.currentUser.uid).update({shareAnswers:false});S._compat=null;});
    await p.evaluate(()=>{socTab('friends',document.querySelector('.tab-btn[onclick*="friends"]'));renderCompatList();});
    await wf(p,()=>document.querySelector('#compat-list .cp-off'),null,15000);
    await shot('compat_off');
    check('Partage coupé : la liste propose de l\'activer',/Montrer mes réponses à mes amis/.test(await p.$eval('#compat-list .cp-off',e=>e.textContent)));
    await p.evaluate(()=>document.querySelector('#compat-list .cp-off button').click());
    await wf(p,()=>document.querySelectorAll('#compat-list .cp-row').length>=4,null,20000);
    check('« Activer » réactive le partage et recharge la liste',(await db.doc('users/me').get()).data().shareAnswers===true);
    await browser.close();
    console.log('JS errors:',[...new Set(errs)].join(' | ')||'aucune');
  });
  console.log(`\n===== ${pass}/${pass+fail} OK =====`);process.exit(fail?1:0);
})();
