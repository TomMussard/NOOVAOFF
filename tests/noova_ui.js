// Compte NOOVA dans l'app : question visible dans toutes les villes avec ses visuels (logo, photo) à jour en direct,
// étiquette « +1 NOOV », fond NOOVA en plein écran.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const wf=(p,fn,arg,t=25000)=>p.waitForFunction(fn,{timeout:t,polling:200},arg);
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const CHROME=(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const APP='http://localhost:8950/app.html';
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
const login=async(p,email)=>{await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email',email);await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());};
// Deux petites images différentes (PNG 1×1) : photo de devanture avant / après modification
const PNG1='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG2='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
(async()=>{
  await wipe();
  await db.doc('merchants/nv').set({role:'merchant',ownerUid:'nv',brandName:'NOOVA',name:'NOOVA',sector:'NOOVA',city:'le-mans',cityLabel:'Le Mans',status:'verified',broadcast:true,coverUrl:PNG1});
  await db.doc('campaigns/bc').set({merchantId:'nv',merchantName:'NOOVA',broadcast:true,status:'active',targetCity:'toutes',city:'toutes',cityLabel:'Toutes les villes',question:'Qu\'aimerais-tu voir dans NOOVA ?',questions:[{q:'Qu\'aimerais-tu voir dans NOOVA ?',format:'mcq',options:['Plus de commerces','Plus de récompenses']}],answersCount:0,createdAt:Timestamp.now()});
  await db.doc('users/pa').set({role:'user',name:'Paul',email:'pa@t.fr',city:'paris',cityLabel:'Paris',welcomeClaimed:true,onboardingStep:'done',seenHomeTour:true,authorizedMerchants:[],declinedMerchants:['nv'],answeredCampaigns:[],interests:[],points:0,xp:0,noovs:0,streak:0,friendUids:[]});
  await aauth.createUser({uid:'pa',email:'pa@t.fr',password:'secret123'});
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const p=await browser.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:2});
  try{
    await login(p,'pa@t.fr');
    await wf(p,()=>document.getElementById('home').classList.contains('active')&&/NOOVA/.test(document.getElementById('tc-brand').textContent),null,30000);
    const card=()=>p.evaluate(()=>({brand:document.getElementById('tc-brand').textContent,pts:document.getElementById('tc-pts').textContent,img:(document.querySelector('#dtoday-photo > img')||{}).src||''}));
    await wf(p,()=>!!document.querySelector('#dtoday-photo > img'),null,10000).catch(()=>{});
    let c=await card();
    check('Habitant de Paris (qui avait écarté NOOVA) : la question NOOVA est en tête de l\'accueil, « +1 NOOV »',/NOOVA/.test(c.brand)&&c.pts==='+1 NOOV',c);
    check('La photo de devanture du compte NOOVA s\'affiche en arrière-plan de la carte',c.img===PNG1,c.img.slice(0,40));
    await db.doc('merchants/nv').update({coverUrl:PNG2});
    await wf(p,png=>(document.querySelector('#dtoday-photo > img')||{}).src===png,PNG2,15000).catch(()=>{});
    c=await card();
    check('Photo changée dans le dashboard NOOVA : l\'arrière-plan se met à jour dans l\'app, sans recharger',c.img===PNG2,c.img.slice(0,40));
    await p.evaluate(()=>openQ(0));await sleep(700);
    const q=await p.evaluate(()=>{const el=document.getElementById('question');return {active:el.classList.contains('active'),full:el.classList.contains('qfull'),noova:el.classList.contains('qmode-noova'),pts:(document.getElementById('q-pts-tag')||{}).textContent};});
    check('Question NOOVA ouverte : plein écran sur le fond NOOVA, « +1 NOOV »',q.active&&q.full&&q.noova&&q.pts==='+1 NOOV',q);
    check('Aucune erreur JavaScript',errs.length===0,errs);
  }catch(e){fail++;console.log('FAIL exception -> '+String(e.stack||e).slice(0,300));}
  await browser.close();
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
