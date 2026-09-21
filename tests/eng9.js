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

const call=async(name,data,token)=>{const r=await fetch('http://127.0.0.1:5001/noova-366d0/europe-west1/'+name,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({data})});const tx=await r.text();let j;try{j=JSON.parse(tx);}catch(e){throw new Error(name+': '+tx.slice(0,200));}if(j.error)throw new Error(name+': '+j.error.message);return j.result;};
const path=require('path');
(async()=>{
  await T('noovs',async()=>{
    await wipe();
    await db.doc('merchants/m1').set({brandName:'Le Fournil',sector:'Boulangerie',city:'le-mans',status:'verified',monthlyQuestionQuota:50});
    for(let i=0;i<9;i++)await mkCampaign('c'+i,{targetVolume:1000,question:'Question '+i+' ?',questions:[{q:'Question '+i+' ?',format:'mcq',options:['Oui','Non']}]});
    await mkUser('me',{email:'me@t.fr',birthYear:1990,age:30});
    await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});await aauth.createUser({uid:'adm',email:'tomussproduction@gmail.com',password:'secret123'});
    const tok=await idTokenOf('me@t.fr'),tadm=await idTokenOf('tomussproduction@gmail.com');
    await sleep(3000);                                                        // laisse passer les déclencheurs de création
    let n=0;
    const answer=async(ms)=>{const id='c'+(n++);await call('beginQuestion',{campaignId:id,questionIdx:0},tok);await sleep(ms);const r=await call('submitAnswer',{campaignId:id,questionIdx:0,answerValue:'Oui'},tok);return {id,...r};};
    await call('setEngagementConfig',{values:{'NOOVS.DAILY_CAP':2}},tadm);
    const r=[];for(let i=0;i<3;i++)r.push(await answer(4300));
    check('Les 3 premières réponses du jour rapportent des points, pas de NOOVS',r.every(x=>x.pointsAwarded>0&&x.noovsAwarded===0&&!x.noovsWithheld),r.map(x=>[x.pointsAwarded,x.noovsAwarded]));
    const r4=await answer(4300),r5=await answer(4300);
    check('Réponses 4 et 5 : 1 NOOV chacune',r4.noovsAwarded===1&&r5.noovsAwarded===1&&r5.totalNoovs===2,[r4.noovsAwarded,r5.noovsAwarded,r5.totalNoovs]);
    const r6=await answer(4300);
    check('Plafond quotidien (2) atteint : la réponse est enregistrée mais 0 NOOV, motif « cap »',r6.noovsAwarded===0&&r6.noovsWithheld==='cap'&&r6.totalNoovs===2,r6);
    const u=(await db.doc('users/me').get()).data();
    check('Compteur du jour côté serveur (2) ; le client ne peut pas le modifier',u.dailyNoovs===2&&u.noovs===2,{d:u.dailyNoovs,n:u.noovs});
    const a6=(await db.doc('answers/me_c5_q0').get()).data();
    check('Réponse au-delà du plafond : enregistrée (données utilisables), sans NOOV',a6&&a6.noovsAwarded===0&&a6.noovsWithheld==='cap');
    const a4=(await db.doc('answers/me_c3_q0').get()).data();
    const days=(a4.noovsAvailableAt.toMillis()-a4.createdAt.toMillis())/86400000;
    check('Chaque NOOV a une date de disponibilité (délai de validation de 3 jours)',days>2.99&&days<3.01,days);
    // plafond relevé, délai de réponse minimum
    await call('setEngagementConfig',{values:{'NOOVS.DAILY_CAP':30,'NOOVS.MIN_RESPONSE_MS':6000}},tadm);await sleep(800);
    const r7=await answer(4300);
    check('Temps minimum pour les NOOVS (6 s) : une réponse à 4,3 s est enregistrée sans NOOV, motif « suspect »',r7.noovsAwarded===0&&r7.noovsWithheld==='suspect',r7);
    const r8=await answer(6400);
    check('… et une réponse à 6,4 s rapporte son NOOV',r8.noovsAwarded===1&&r8.totalNoovs===3,r8);
    const acc=await (async()=>{const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});const p=await b.newPage();await p.goto(APP,{waitUntil:'load'});await sleep(1200);const c=await p.evaluate(async()=>{await auth.signInWithEmailAndPassword('me@t.fr','secret123');const t=async fn=>{try{await fn();return 'allowed';}catch(e){return e.code;}};return {a:await t(()=>db.collection('users').doc(auth.currentUser.uid).update({dailyNoovs:0})),b:await t(()=>db.collection('users').doc(auth.currentUser.uid).update({noovs:9999}))};});await b.close();return c;})();
    check('Sécurité : le client ne peut modifier ni son plafond du jour ni son solde de NOOVS',acc.a==='permission-denied'&&acc.b==='permission-denied',acc);
  });
  await T('régions',async()=>{
    const {spawnSync}=require('child_process');
    const r=spawnSync(process.execPath,['-e',"const m=require('./index.js');const o={};for(const [k,v] of Object.entries(m)){if(v&&v.__endpoint)o[k]=[].concat(v.__endpoint.region||[]).join();}console.log(JSON.stringify(o));process.exit(0)"],{cwd:path.join(__dirname,'..','functions'),encoding:'utf8',env:{...process.env,GCLOUD_PROJECT:'noova-366d0'}});
    const o=JSON.parse(r.stdout.trim().split('\n').pop());
    const bad=Object.entries(o).filter(([,v])=>v!=='europe-west1');
    check('Toutes les fonctions ('+Object.keys(o).length+') sont déclarées en europe-west1 (un import trop tôt les enverrait en us-central1)',bad.length===0&&Object.keys(o).length>=25,bad);
  });
  console.log(`\n===== ${pass}/${pass+fail} OK =====`);process.exit(fail?1:0);
})();
