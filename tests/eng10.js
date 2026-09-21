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
  await T('finitions app',async()=>{
    await wipe();
    await db.doc('merchants/m1').set({brandName:'Le Fournil',sector:'Boulangerie',city:'le-mans',status:'verified'});
    await mkCampaign('c1',{question:'Quelle boisson ?',questions:[{q:'Quelle boisson ?',format:'mcq',options:['Café','Thé']}]});
    await mkCampaign('c2',{question:'Ton avis ?',questions:[{q:'Ton avis ?',format:'text'}]});
    await mkUser('me',{name:'Alex Martin',email:'alex@t.fr',streak:0,points:100,xp:100,seenHomeTour:true});
    await aauth.createUser({uid:'me',email:'alex@t.fr',password:'secret123'});
    const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
    const p=await browser.newPage();PG=p;await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    check('Chargement différé : ni « stockage » ni « statistiques » au démarrage',await p.evaluate(()=>!document.querySelector('script[src*="firebase-storage"]')&&!document.querySelector('script[src*="firebase-analytics"]')&&typeof firebase.storage!=='function'));
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','alex@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user&&S.qs.length>=2,null,30000);
    await p.addStyleTag({content:'body>div[style*="emulator"]{display:none!important}'});
    await sleep(2500);
    check('Statistiques : le choix « refusé » est respecté — bibliothèque jamais chargée, aucun événement en file (le cas « accepté » est testé dans eng14)',await p.evaluate(()=>typeof firebase.analytics!=='function'&&analytics===null&&_trackQueue.length===0));
    check('Photo de profil : la bibliothèque de stockage se charge à la demande',await p.evaluate(async()=>{await loadFirebaseSdk('storage');return typeof firebase.storage==='function';}));
    check('Police auto-hébergée : aucune requête vers Google Fonts, la police est bien appliquée',await p.evaluate(async()=>{await document.fonts.ready;const f=[...document.fonts].filter(x=>x.family.replace(/["']/g,'')==='Plus Jakarta Sans'&&x.status==='loaded').length;return f>=1&&!document.querySelector('link[href*="fonts.googleapis"]')&&getComputedStyle(document.body).fontFamily.includes('Jakarta');}));
    // accueil
    const h=await p.evaluate(()=>({sec:[...document.querySelectorAll('#home .sec-lbl')].map(e=>e.textContent),streak:document.getElementById('streak-title').textContent,sub:document.getElementById('streak-sub').textContent}));
    check('Accueil : section « À répondre » (plus « En attente »)',h.sec.includes('À répondre')&&!h.sec.includes('En attente'),h.sec);
    check('Série à 0 : « Lance ta série aujourd\'hui » (plus « 0 jour(s) »)',/Lance ta série/.test(h.streak)&&!/jour\(s\)/.test(h.streak)&&/garder ta série/.test(h.sub)&&!/bonus/.test(h.sub),h);
    const st=await p.evaluate(()=>{const out=[];for(const n of [1,2,7]){S.streak=n;refreshHome();out.push(document.getElementById('streak-title').textContent.replace(/\s+/g,' ').trim());}return out;});
    check('Série 1 / 2 / 7 : accord singulier-pluriel correct',st.join('|')==='1 jour d\'affilée|2 jours d\'affilée|7 jours d\'affilée',st);
    const chip=await p.evaluate(()=>{const e=document.querySelector('#home .q-type-t');return e?getComputedStyle(e).color:null;});
    check('Pastille de format plus lisible (texte foncé)',!!chip&&(chip.match(/\d+/g).map(Number)[0]<120),chip);
    // question : consigne et verrou de lecture
    await p.evaluate(()=>openQ(S.qs.findIndex(q=>q.type==='mcq')));await sleep(400);
    const q1=await p.evaluate(()=>({hint:document.getElementById('q-hint').textContent,usage:document.getElementById('bh-usage').textContent,btn:document.getElementById('sub-btn').textContent}));
    check('Question à choix : consigne adaptée, plus de « Donne ton avis »',/Choisis la réponse/.test(q1.hint)&&!/Donne ton avis/.test(q1.hint),q1);
    check('Ligne d\'utilité sans répéter le nom (« Ta réponse aide … »)',/^Ta réponse aide/.test(q1.usage)&&!/veut ton avis/.test(q1.usage),q1.usage);
    check('Bouton verrouillé pendant la lecture : « Prends le temps de lire… »',/Prends le temps de lire/.test(q1.btn),q1.btn);
    await sleep(3300);
    check('… puis retrouve son libellé « Valider »',/Valider/.test(await p.$eval('#sub-btn',e=>e.textContent)),await p.$eval('#sub-btn',e=>e.textContent));
    await p.evaluate(()=>{goNav('home');openQ(S.qs.findIndex(q=>q.type==='text'));});await sleep(400);
    check('Question texte : consigne « Écris ce que tu en penses »',/Écris ce que tu en penses/.test(await p.$eval('#q-hint',e=>e.textContent)));
    // cadeaux + profil
    await p.evaluate(()=>{goNav('rewards-tab');});await sleep(800);
    const rw=await p.evaluate(()=>({noov:document.querySelector('.noov-d').textContent,lbl:(document.getElementById('reward-featured-label')||{}).textContent||''}));
    check('Cadeaux : texte des NOOVS aligné sur le catalogue',/bons chez les commerçants/.test(rw.noov)&&!/cash et bons cadeaux/.test(rw.noov),rw.noov);
    check('Cadeaux : plus d\'emoji dans le titre de section',!/\p{Extended_Pictographic}/u.test(rw.lbl),rw.lbl);
    await p.evaluate(()=>{S.friends=[{uid:'f1',n:'Léa',xp:410,str:1},{uid:'f2',n:'Tom',xp:20,str:0}];goNav('social');socTab('ranking',document.querySelector('.tab-btn[onclick*="ranking"]'));renderRanking();});await sleep(600);
    const rk=await p.$eval('#ranking-list',e=>e.textContent);
    check('Classement : quand tout le monde est sur le podium, une invitation remplace la zone vide',/Tout le monde est sur le podium/.test(rk)&&/Inviter un ami/.test(rk),rk);
    await p.evaluate(()=>{goNav('profile');refreshProfile();});await sleep(500);
    check('Carte : Leaflet absent au démarrage, chargé à la première ouverture de la carte',await p.evaluate(async()=>{const before=typeof window.L;const had=!!document.querySelector('script[src*="leaflet"]');await loadLeaflet();return before==='undefined'&&!had&&typeof L==='object'&&typeof L.map==='function';}));
    const pr=await p.$eval('#prof-email',e=>e.textContent);
    check('Profil : le prénom s\'affiche (plus l\'adresse e-mail)',pr==='Alex Martin',pr);
    await p.screenshot({path:'/tmp/shots/polish_profile.png'});
    await browser.close();
    console.log('JS errors:',[...new Set(errs)].join(' | ')||'aucune');
  });
  console.log(`\n===== ${pass}/${pass+fail} OK =====`);process.exit(fail?1:0);
})();
