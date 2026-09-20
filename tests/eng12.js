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

const call=async(name,data,token)=>{const r=await fetch('http://127.0.0.1:5001/noova-366d0/europe-west1/'+name,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({data})});const tx=await r.text();let j;try{j=JSON.parse(tx);}catch(e){throw new Error(name+': '+tx.slice(0,200));}if(j.error)throw new Error(name+': '+j.error.message);return j.result;};

const AUTH2='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake';
(async()=>{
  await T('parcours multi-questions côté habitant',async()=>{
    await wipe();
    await db.doc('merchants/m1').set({brandName:'Le Fournil',sector:'Boulangerie',city:'le-mans',status:'verified'});
    await db.doc('campaigns/c1').set({merchantId:'m1',merchantName:'Le Fournil',sector:'Boulangerie',status:'active',targetCity:'le-mans',city:'le-mans',question:'Boisson ?',format:'mcq',options:['A','B'],questionsSchema:2,targetVolume:500,answersCount:0,createdAt:Timestamp.now(),
      questions:[{q:'Boisson ?',format:'mcq',options:['A','B']},{q:'Heure ?',format:'mcq',options:['X','Y']},{q:'Classe ces produits',format:'rank',options:['P','Q','R']}]});
    await mkUser('me',{email:'me@t.fr',age:30,birthYear:1990});
    await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});
    const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
    const p=await browser.newPage();PG=p;await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});const errs=[];p.on('pageerror',e=>errs.push(e.message));
    p.on('dialog',async d=>{console.log('DIALOG',d.message());await d.dismiss();});
    await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user&&S.qs.length>=1,null,30000);
    await p.addStyleTag({content:'body>div[style*="emulator"]{display:none!important}'});
    const pick=async(text)=>{await p.evaluate(t=>{[...document.querySelectorAll('#ans-area .mcq-opt')].find(o=>o.textContent.trim()===t).click();},text);};
    const submit=async()=>{await sleep(3400);await p.evaluate(()=>document.getElementById('sub-btn').click());};
    // Q1
    await p.evaluate(()=>openQ(0));await wf(p,()=>document.querySelectorAll('#ans-area .mcq-opt').length===2,null,10000);
    await pick('A');await submit();
    await until(async()=>(await db.doc('answers/me_c1_q0').get()).exists);
    check('Question 1 : réponse enregistrée',(await db.doc('answers/me_c1_q0').get()).data().answer==='A');
    // Q2
    await wf(p,()=>document.getElementById('survey-offer')||typeof S.sv==='object'&&S.sv,null,10000);
    await p.evaluate(()=>startSurvey());
    await wf(p,()=>document.getElementById('q-text').textContent==='Heure ?'&&document.querySelectorAll('#ans-area .mcq-opt').length===2,null,10000);
    await sleep(600);
    check('Question 2 : « Valider » inactif tant qu\'aucune réponse n\'est choisie (plus de bouton réactivé par erreur)',await p.evaluate(()=>document.getElementById('sub-btn').disabled===true));
    check('Question 2 : ses propres options (X, Y), pas celles de la question 1',(await p.evaluate(()=>[...document.querySelectorAll('#ans-area .mcq-opt')].map(o=>o.textContent.trim()))).join()==='X,Y');
    await pick('X');
    check('Question 2 : après un choix, « Valider » s\'active',await p.evaluate(()=>document.getElementById('sub-btn').disabled===false));
    await submit();
    await until(async()=>(await db.doc('answers/me_c1_q1').get()).exists);
    const a2=(await db.doc('answers/me_c1_q1').get());
    check('Question 2 : la réponse est validée et enregistrée (le bug : impossible à valider)',a2.exists&&a2.data().answer==='X',a2.exists&&a2.data());
    // Q3 classement
    await wf(p,()=>document.getElementById('q-text').textContent==='Classe ces produits'&&document.querySelectorAll('#ans-area .rank-item').length===3,null,10000);
    await submit();
    await until(async()=>(await db.doc('answers/me_c1_q2').get()).exists);
    const a3=(await db.doc('answers/me_c1_q2').get());
    check('Question 3 (classement) : validée, ordre enregistré (P > Q > R)',a3.exists&&a3.data().answer==='P > Q > R',a3.exists&&a3.data());
    await wf(p,()=>document.getElementById('reward').classList.contains('active'),null,10000);
    check('Fin de questionnaire : écran « Questionnaire terminé »',/Questionnaire terminé/.test(await p.$eval('#reward .rw-title',e=>e.textContent)));
    await browser.close();
    console.log('JS errors:',[...new Set(errs)].join(' | ')||'aucune');
  });

  await T('réponses invalides refusées par le serveur',async()=>{
    for(const [id,q] of [['m1',{q:'Choix ?',format:'mcq',options:['Oui','Non']}],['s',{q:'Note ?',format:'scale'}],['r',{q:'Classe',format:'rank',options:['P','Q','R']}],['t',{q:'Ton avis ?',format:'text'}]])
      await db.doc('campaigns/k_'+id).set({merchantId:'m1',merchantName:'Le Fournil',status:'active',targetCity:'le-mans',city:'le-mans',question:q.q,format:q.format,options:q.options||[],questionsSchema:2,questions:[q],targetVolume:500,answersCount:0,createdAt:Timestamp.now()});
    await db.doc('users/me').update({authorizedMerchants:['m1'],lastQuestionStart:admin.firestore.FieldValue.delete()});
    const tok=(await (await fetch(AUTH2,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'me@t.fr',password:'secret123',returnSecureToken:true})})).json()).idToken;
    const call=async(name,data)=>{const r=await fetch('http://127.0.0.1:5001/noova-366d0/europe-west1/'+name,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify({data})});const j=await r.json();return j.error?j.error.status:'OK';};
    const tryAns=async(id,val,wait=false)=>{await call('beginQuestion',{campaignId:id,questionIdx:0});if(wait)await sleep(3000);return call('submitAnswer',{campaignId:id,questionIdx:0,answerValue:val});};
    check('Choix multiple : réponse vide refusée',await tryAns('k_m1','')==='INVALID_ARGUMENT');
    check('Choix multiple : réponse hors liste refusée',await tryAns('k_m1','Peut-être')==='INVALID_ARGUMENT');
    check('Échelle : 11 refusé, texte refusé',await tryAns('k_s','11')==='INVALID_ARGUMENT'&&await tryAns('k_s','beaucoup')==='INVALID_ARGUMENT');
    check('Classement : ordre incomplet ou élément inconnu refusé',await tryAns('k_r','P > Q')==='INVALID_ARGUMENT'&&await tryAns('k_r','P > Q > Z')==='INVALID_ARGUMENT');
    check('Texte libre : moins de 5 caractères refusé',await tryAns('k_t','ok')==='INVALID_ARGUMENT');
    check('Réponse valide (choix multiple) acceptée',await tryAns('k_m1','Oui',true)==='OK');
    check('Réponse valide (échelle 7) acceptée',await tryAns('k_s','7',true)==='OK');
  });
  console.log(`\n===== ${pass}/${pass+fail} OK =====`);process.exit(fail?1:0);
})();
