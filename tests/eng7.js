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
async function mkUser(uid,o={}){await db.doc('users/'+uid).set({role:'user',welcomeClaimed:true,name:'User '+uid,city:'le-mans',cityLabel:'Le Mans',authorizedMerchants:['m1'],friendUids:[],answeredCampaigns:[],points:0,xp:0,streak:0,interests:['restauration'],onboardingStep:'done',seenHomeTour:true,...o});}
async function mkCampaign(id,o={}){await db.doc('campaigns/'+id).set({merchantId:'m1',merchantName:'Le Fournil',sector:'Boulangerie',status:'active',targetCity:'le-mans',city:'le-mans',question:Q,questions:[{q:Q,format:'mcq',options:OPTS}],targetVolume:500,answersCount:0,createdAt:Timestamp.now(),...o});}
async function ans(uid,cid,answer,o={}){await db.doc(`answers/${uid}_${cid}_q${o.q||0}`).set({userId:uid,campaignId:cid,questionIdx:o.q||0,answer,flagged:!!o.flagged,suspect:!!o.suspect,pointsAwarded:0,createdAt:Timestamp.now()});}
const compat=(uid,d={})=>E.compatCore(uid,d);
const byName=(r,u)=>r.friends.find(f=>f.uid===u);
const err=async fn=>{try{await fn();return null;}catch(e){return e.code||String(e);}};


const until=async(fn,t=15000)=>{const s=Date.now();while(Date.now()-s<t){if(await fn())return true;await sleep(300);}return false;};
const ADMIN='http://localhost:8950/admin.html';


(async()=>{
  // ═════════ Compteurs du fil ═════════
  await T('compteurs',async()=>{
    await wipe();
    await db.doc('communityEvents/e1').set({type:'answer',userId:'a',displayName:'A',city:'le-mans',text:'a répondu',brand:'X',likeCount:0,commentCount:0,createdAt:Timestamp.now()});
    const like=u=>db.doc('communityEvents/e1/likes/'+u).set({createdAt:Timestamp.now()});
    const cnt=async f=>(await db.doc('communityEvents/e1').get()).data()[f];
    await like('u1');await until(async()=>(await cnt('likeCount'))===1);
    check('Serveur : un « j\'aime » → likeCount = 1',(await cnt('likeCount'))===1);
    await like('u2');await like('u3');await until(async()=>(await cnt('likeCount'))===3);
    check('Serveur : trois « j\'aime » → 3 (recalcul exact)',(await cnt('likeCount'))===3);
    await db.doc('communityEvents/e1/likes/u2').delete();await until(async()=>(await cnt('likeCount'))===2);
    check('Serveur : un « j\'aime » retiré → 2',(await cnt('likeCount'))===2);
    await db.collection('communityEvents/e1/comments').add({userId:'u1',text:'Super',createdAt:Timestamp.now()});
    await db.collection('communityEvents/e1/comments').add({userId:'u2',text:'Merci',createdAt:Timestamp.now()});
    await until(async()=>(await cnt('commentCount'))===2);
    check('Serveur : deux commentaires → commentCount = 2',(await cnt('commentCount'))===2);
    await db.doc('communityEvents/gone').delete().catch(()=>{});
    await db.doc('communityEvents/gone/likes/u1').set({createdAt:Timestamp.now()});await sleep(1500);
    check('Serveur : « j\'aime » sur une publication supprimée : aucune publication recréée',!(await db.doc('communityEvents/gone').get()).exists);
  });

  // ═════════ Interface : fil, page commerce, écran récompense ═════════
  await T('ui actualités et fil',async()=>{
    await wipe();
    await db.doc('merchants/m1').set({brandName:'Le Fournil',sector:'Boulangerie',city:'le-mans',status:'verified'});
    await mkCampaign('c1');await mkCampaign('c2');
    await mkUser('me',{name:'Moi',email:'me@t.fr'});await mkUser('f1',{name:'Léa',friendUids:['me']});
    await db.doc('users/me').update({friendUids:['f1']});
    await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});
    const T1=Timestamp.fromMillis(Date.now()-3*86400000),T2=Timestamp.fromMillis(Date.now()-86400000);
    const post=(id,o)=>db.doc('merchantPosts/'+id).set({merchantId:'m1',merchantName:'Le Fournil',text:'Texte '+id+' de plus de dix caractères.',campaignIds:[],status:'published',city:'le-mans',createdAt:T1,...o});
    await post('old',{text:'Ancienne actualité : ouverture dès 7h.',createdAt:T1});
    await post('new',{text:'Nouvelle actualité : ouverture dès 6h30.',createdAt:T2,campaignIds:['c1']});
    await post('pend',{status:'pending',text:'En attente : ne doit pas apparaître.'});
    await post('rej',{status:'rejected',text:'Refusée : ne doit pas apparaître.'});
    await post('other',{merchantId:'m2',merchantName:'Autre',text:'Autre commerce.'});
    // fil : publications avec compteurs / sans compteurs
    const ev=(id,o)=>db.doc('communityEvents/'+id).set({type:'levelup',level:'Actif',userId:'f1',displayName:'Léa',city:'le-mans',text:'a atteint le palier Actif',brand:'',createdAt:Timestamp.now(),...o});
    await ev('withc',{likeCount:5,commentCount:2});
    await ev('legacy',{createdAt:Timestamp.fromMillis(Date.now()-60000)});
    await db.doc('communityEvents/legacy/likes/x1').set({createdAt:Timestamp.now()});await db.doc('communityEvents/legacy/likes/x2').set({createdAt:Timestamp.now()});
    await db.doc('communityEvents/withc/likes/me').set({createdAt:Timestamp.now()});await sleep(2500);
    await db.doc('communityEvents/withc').update({likeCount:5,commentCount:2});         // valeurs de test fixes
    const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
    const p=await browser.newPage();PG=p;await p.setViewport({width:430,height:900});const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user&&S.friends&&S.friends.length>=1,null,30000);
    await p.addStyleTag({content:'body>div[style*="emulator"]{display:none!important}'});
    await p.evaluate(()=>goNav('social'));
    await wf(p,()=>document.querySelectorAll('#feed-content .feed-post').length>=2,null,20000);await sleep(800);
    const fd=await p.evaluate(()=>[...document.querySelectorAll('#feed-content .feed-post')].map(e=>({like:e.querySelector('.fp-like-count').textContent.trim(),com:e.querySelector('.fp-com-count').textContent.trim(),liked:e.querySelector('.fp-like-btn').classList.contains('liked')})));
    check('Fil : publication avec compteurs → 5 « j\'aime » et 2 commentaires (sans lire les sous-collections)',fd.some(x=>x.like==='5'&&x.com==='2'),fd);
    check('Fil : mon « j\'aime » reconnu (cœur plein)',fd.some(x=>x.like==='5'&&x.liked),fd);
    check('Fil : ancienne publication sans compteur → repli sur le comptage (2)',fd.some(x=>x.like==='2'&&!x.liked),fd);
    await p.screenshot({path:'/tmp/shots/feed_counters.png'});
    // like via l'interface → compteur serveur
    await p.evaluate(()=>{const b=[...document.querySelectorAll('#feed-content .fp-like-btn')].find(x=>x.querySelector('.fp-like-count').textContent.trim()==='2');b.click();});
    await until(async()=>{const l=await db.collection('communityEvents/legacy/likes').get();return l.size===3;});
    check('J\'aime via l\'interface : enregistré, et le compteur serveur suit (3)',await until(async()=>(await db.doc('communityEvents/legacy').get()).data().likeCount===3));
    // page commerce
    await p.evaluate(()=>openBrandById('m1','Le Fournil'));
    await wf(p,()=>document.querySelector('#bp-wrap .bp-news'),null,15000);
    const bp=await p.evaluate(()=>[...document.querySelectorAll('#bp-wrap .bp-news .bp-news-d')].map(e=>e.textContent));
    await p.screenshot({path:'/tmp/shots/brand_news.png'});
    check('Page du commerce : actualités publiées de CE commerce, la plus récente d\'abord',bp.length===2&&/Nouvelle/.test(bp[0])&&/Ancienne/.test(bp[1]),bp);
    check('Page du commerce : ni en attente, ni refusée, ni d\'un autre commerce',!bp.join('').match(/attente|Refusée|Autre commerce/),bp);
    // écran récompense
    await p.evaluate(()=>{goTo('reward');});
    await p.evaluate(()=>showLinkedNews({_firestoreId:'c1'}));
    const rn=await p.evaluate(()=>document.getElementById('rw-news').textContent);
    check('Écran récompense : actualité rattachée à la question affichée',/Ce que les avis ont changé chez Le Fournil/.test(rn)&&/6h30/.test(rn),rn);
    await p.evaluate(()=>showLinkedNews({_firestoreId:'c2'}));
    check('Écran récompense : rien si aucune actualité n\'est rattachée à la question',await p.evaluate(()=>document.getElementById('rw-news').textContent)==='');
    await browser.close();
    console.log('JS errors:',[...new Set(errs)].join(' | ')||'aucune');
  });
  console.log(`\n===== ${pass}/${pass+fail} OK =====`);process.exit(fail?1:0);
})();
