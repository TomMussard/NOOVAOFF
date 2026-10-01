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


const fs=require('fs'),path=require('path');
const DASH='http://localhost:8950/dash.html';
const I=require(__dirname+'/../functions/interests.js');
// ─── Centres d'intérêt : une seule liste (app, dashboard, serveur) et un ciblage réellement appliqué ───
(async()=>{
  check('interests.js : la copie serveur est identique à celle du site',fs.readFileSync(path.join(__dirname,'../interests.js'),'utf8')===fs.readFileSync(path.join(__dirname,'../functions/interests.js'),'utf8'));
  check('Liste sans doublon',new Set(I.KEYS).size===I.KEYS.length&&new Set(I.INTERESTS.map(i=>i.label)).size===I.KEYS.length,I.KEYS);
  await wipe();
  await db.doc('merchants/m1').set({role:'merchant',ownerUid:'m1',brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:'m1@shop.fr',verifiedPopupShown:true,seenDashTour:true});
  await aauth.createUser({uid:'m1',email:'m1@shop.fr',password:'secret123'});
  for(const [id,t] of [['cSport',['sport']],['cBeaute',['beaute']],['cTous',[]],['cAncien',['Sport','Gastronomie']]])
    await mkCampaign(id,{targetInterests:t,question:'Q '+id+' ?',questions:[{q:'Q '+id+' ?',format:'mcq',options:['Oui','Non']}]});
  const U={uSport:['sport'],uCulture:['culture'],uTout:I.KEYS.slice(),uAucun:[]};
  for(const [uid,ints] of Object.entries(U)){await mkUser(uid,{email:uid+'@t.fr',interests:ints,authorizedMerchants:['m1']});await aauth.createUser({uid,email:uid+'@t.fr',password:'secret123'});}
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const login=async(ctx,uid)=>{const p=await ctx.newPage();PG=p;await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email',uid+'@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user,null,30000);await sleep(3000);return p;};
  const expect={uSport:['cAncien','cSport','cTous'],uCulture:['cAncien','cTous'],uTout:['cAncien','cBeaute','cSport','cTous'],uAucun:['cAncien','cBeaute','cSport','cTous']};
  for(const uid of Object.keys(U)){
    const ctx=await browser.createBrowserContext();const p=await login(ctx,uid);
    const ids=(await p.evaluate(()=>(S.qs||[]).map(q=>q._firestoreId))).sort();
    check(`${uid} : ne reçoit que les campagnes qui le ciblent (${expect[uid].join(', ')})`,JSON.stringify(ids)===JSON.stringify(expect[uid]),ids);
    if(uid==='uCulture'){
      // Le serveur refuse aussi : on ne contourne pas le ciblage en appelant la fonction directement.
      const e=await p.evaluate(async()=>{try{await fx.httpsCallable('beginQuestion')({campaignId:'cSport',questionIdx:0});await fx.httpsCallable('submitAnswer')({campaignId:'cSport',questionIdx:0,answerValue:'Oui'});return 'ok';}catch(x){return x.code||String(x);}});
      check('Serveur : réponse à une campagne qui ne cible pas ses centres d\'intérêt refusée',/permission-denied/.test(e),e);
      // Les deux écrans de choix de l'app proposent exactement la liste partagée
      const lists=await p.evaluate(()=>{showCategoryWall(auth.currentUser.uid);const a=[...document.querySelectorAll('#cat-grid .int-chip')].map(c=>c.dataset.cat).filter(c=>c!=='all');document.getElementById('cat-wall').style.display='none';
        openInterestsEditSheet();const b=[...document.querySelectorAll('#interests-edit-grid .int-chip')].map(c=>c.dataset.cat);closeInterestsEditSheet();return {a,b};});
      check('App : inscription et profil proposent exactement la liste partagée',JSON.stringify(lists.a)===JSON.stringify(I.KEYS)&&JSON.stringify(lists.b)===JSON.stringify(I.KEYS),lists);
    }
    await ctx.close();
  }
  // Dashboard : le commerçant cible avec la même liste, enregistrée en clés
  const ctx=await browser.createBrowserContext();const d=await ctx.newPage();PG=d;await d.setViewport({width:1280,height:800});
  await d.evaluateOnNewDocument(()=>{try{localStorage.setItem('nv_pro_intro','1');}catch(e){}});
  await d.goto(DASH,{waitUntil:'load'});await wf(d,()=>document.getElementById('auth-wall').style.display==='flex',null,30000);
  await d.evaluate(()=>awTab('login'));await setVal(d,'#aw-email','m1@shop.fr');await setVal(d,'#aw-pass','secret123');await d.evaluate(()=>awSubmit());
  await wf(d,()=>typeof _mData!=='undefined'&&_mData&&_mData.brandName==='Le Fournil',null,25000);await sleep(800);
  const dv=await d.evaluate(()=>{const chips=[...document.querySelectorAll('#theme-grid .th-chip')];const keys=chips.map(c=>c.dataset.key),labels=chips.map(c=>c.textContent.trim());
    chips.find(c=>c.dataset.key==='sport').click();return {keys,labels,sel:wzThemes()};});
  check('Dashboard : mêmes centres d\'intérêt que l\'app, mêmes libellés, aucun doublon',JSON.stringify(dv.keys)===JSON.stringify(I.KEYS)&&JSON.stringify(dv.labels)===JSON.stringify(I.INTERESTS.map(i=>i.label)),dv);
  check('Dashboard : le choix est enregistré en clé (« sport »), celle que lit l\'app',JSON.stringify(dv.sel)===JSON.stringify(['sport']),dv.sel);
  const est=await d.evaluate(async()=>(await fx.httpsCallable('estimateCampaign')({ageRanges:[],interests:['sport'],questions:1})).data);
  check('Estimation d\'audience : les centres d\'intérêt réduisent le nombre d\'habitants éligibles (3 sur 4 : sport, tout, aucun)',est.totalUsers===4&&est.pool===3,est);
  await ctx.close();await browser.close();
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(fail?1:0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
