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
const VIEWPORTS=[[390,844,'iphone'],[360,640,'petit'],[1280,800,'desktop']];
const near=(a,b,t=3)=>Math.abs(a-b)<=t;
// Mesure une étape de didacticiel : le halo est-il sur la cible, visible, et la carte lisible ?
const measure=(cfg)=>({...cfg});
async function stepInfo(p,kind){
  return p.evaluate((kind)=>{
    const steps=kind==='app'?HOME_TOUR_STEPS:DASH_TOUR_STEPS, idx=kind==='app'?_tourIdx:_dTourIdx;
    const s=steps[idx], el=document.querySelector(s.sel), r=el.getBoundingClientRect();
    const ov=document.getElementById(kind==='app'?'home-tour':'dash-tour');
    const spot=ov.querySelector(kind==='app'?'.tour-spot':'.dtour-spot').getBoundingClientRect();
    const card=ov.querySelector(kind==='app'?'.tour-card':'.dtour-card').getBoundingClientRect();
    return {sel:s.sel,idx,vw:innerWidth,vh:innerHeight,target:{t:r.top,l:r.left,w:r.width,h:r.height},spot:{t:spot.top,l:spot.left,w:spot.width,h:spot.height},card:{t:card.top,l:card.left,w:card.width,h:card.height},
      targetVisible:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,
      elAtCenter:(()=>{const e=document.elementFromPoint(r.left+r.width/2,Math.min(innerHeight-1,Math.max(0,r.top+r.height/2)));return e&&(el.contains(e)||e.closest('#home-tour,#dash-tour')?'covered':'other');})()};
  },kind);
}
const verdict=(name,i)=>{
  const okAlign=near(i.spot.t+8,i.target.t)&&near(i.spot.l+8,i.target.l)&&near(i.spot.w-16,i.target.w)&&near(i.spot.h-16,i.target.h);
  const inView=i.spot.t>=-1&&i.spot.l>=-1&&i.spot.t+i.spot.h<=i.vh+1&&i.spot.l+i.spot.w<=i.vw+1;
  const cardIn=i.card.t>=0&&i.card.l>=0&&i.card.t+i.card.h<=i.vh&&i.card.l+i.card.w<=i.vw;
  const overlap=!(i.card.t>=i.spot.t+i.spot.h||i.card.t+i.card.h<=i.spot.t||i.card.l>=i.spot.l+i.spot.w||i.card.l+i.card.w<=i.spot.l);
  check(`${name} étape ${i.idx+1} (${i.sel}) : halo aligné sur la cible`,okAlign,{spot:i.spot,target:i.target});
  check(`${name} étape ${i.idx+1} : cible entièrement visible à l'écran`,inView&&i.targetVisible,{spot:i.spot,vh:i.vh,vw:i.vw});
  check(`${name} étape ${i.idx+1} : carte d'explication dans l'écran et sans masquer la cible`,cardIn&&!overlap,{card:i.card,spot:i.spot});
};
(async()=>{
  await wipe();
  await db.doc('merchants/m1').set({role:'merchant',ownerUid:'m1',brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:'m1@shop.fr',verifiedPopupShown:true});
  await mkCampaign('c1');
  await mkUser('me',{name:'Moi',email:'me@t.fr',seenHomeTour:false});
  await db.doc('users/me').update({seenHomeTour:false});
  await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});await aauth.createUser({uid:'m1',email:'m1@shop.fr',password:'secret123'});
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  for(const [w,h,label] of VIEWPORTS){
    // ── app (mobile seulement)
    if(w<600){
      await db.doc('users/me').update({seenHomeTour:false});
      const ctx=await browser.createBrowserContext();const p=await ctx.newPage();PG=p;await p.setViewport({width:w,height:h,isMobile:true,hasTouch:true,deviceScaleFactor:2});
      await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
      await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
      await wf(p,()=>document.getElementById('home-tour')&&document.getElementById('home-tour').classList.contains('show'),null,30000);
      const n=await p.evaluate(()=>HOME_TOUR_STEPS.length);
      for(let k=0;k<n;k++){
        await sleep(900);
        const i=await stepInfo(p,'app');
        await p.screenshot({path:`/tmp/shots/tour_app_${label}_${k}.png`});
        verdict('App '+label,i);
        const last=await p.evaluate(()=>_tourIdx>=HOME_TOUR_STEPS.length-1);
        await p.evaluate(()=>document.querySelector('#home-tour .tour-next').click());
        if(last)break;
      }
      await ctx.close();
    }
    // ── dashboard
    await db.doc('merchants/m1').update({seenDashTour:false});
    const ctx2=await browser.createBrowserContext();const q=await ctx2.newPage();PG=q;await q.setViewport({width:w,height:h,isMobile:w<600,hasTouch:w<600,deviceScaleFactor:w<600?2:1});
    await q.evaluateOnNewDocument(()=>{try{localStorage.setItem('nv_pro_intro','1');}catch(e){}});
    await q.goto(DASH,{waitUntil:'load'});await wf(q,()=>document.getElementById('auth-wall').style.display==='flex',null,30000);
    await q.evaluate(()=>awTab('login'));await setVal(q,'#aw-email','m1@shop.fr');await setVal(q,'#aw-pass','secret123');await q.evaluate(()=>awSubmit());
    await wf(q,()=>document.getElementById('dash-tour')&&document.getElementById('dash-tour').classList.contains('show'),null,30000);
    const n2=await q.evaluate(()=>DASH_TOUR_STEPS.length);
    for(let k=0;k<n2;k++){
      await sleep(900);
      const i=await stepInfo(q,'dash');
      await q.screenshot({path:`/tmp/shots/tour_dash_${label}_${k}.png`});
      verdict('Dashboard '+label,i);
      const last=await q.evaluate(()=>_dTourIdx>=DASH_TOUR_STEPS.length-1);
      await q.evaluate(()=>document.querySelector('#dash-tour .dtour-next').click());
      if(last)break;
    }
    await ctx2.close();
  }
    // ═════ Robustesse : décalage de la page, cible hors écran, clavier ═════
  await db.doc('users/me').update({seenHomeTour:false});
  const ctx3=await browser.createBrowserContext();const r=await ctx3.newPage();PG=r;await r.setViewport({width:390,height:700,isMobile:true,hasTouch:true,deviceScaleFactor:2});
  await r.goto(APP,{waitUntil:'load'});await wf(r,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
  await r.evaluate(()=>{                                                        // contenu tardif : une grande bannière qui pousse la suite vers le bas
    const t=document.getElementById('today-card');const sp=document.createElement('div');sp.id='test-spacer';sp.style.cssText='height:0';t.parentNode.insertBefore(sp,t);
  }).catch(()=>{});
  await r.evaluate(()=>showAuthWall('login'));await setVal(r,'#aw-email','me@t.fr');await setVal(r,'#aw-pass','secret123');await r.evaluate(()=>awSubmit());
  await wf(r,()=>document.getElementById('home-tour')&&document.getElementById('home-tour').classList.contains('show'),null,30000);
  await sleep(900);
  let i0=await stepInfo(r,'app');
  await r.evaluate(()=>{const t=document.getElementById('today-card');const sp=document.createElement('div');sp.style.cssText='height:140px';t.parentNode.insertBefore(sp,t);});   // la page bouge APRÈS l'affichage du halo
  await sleep(900);
  let i1=await stepInfo(r,'app');
  check('La page se décale après coup (+140 px) : le halo suit la cible',near(i1.spot.t+8,i1.target.t)&&i1.target.t>i0.target.t+100,{avant:i0.target,apres:i1.target,spot:i1.spot});
  const foc=await r.evaluate(()=>document.activeElement&&document.activeElement.className);
  check('Clavier : le bouton « Suivant » a le focus dès l\'ouverture',/tour-next/.test(foc),foc);
  await r.keyboard.press('Tab');
  check('Clavier : Tab reste dans la bulle (boucle Suivant → Passer)',await r.evaluate(()=>/tour-skip/.test(document.activeElement.className)));
  await r.keyboard.press('Tab');
  check('Clavier : Tab revient sur « Suivant » (pas de fuite vers la page cachée)',await r.evaluate(()=>/tour-next/.test(document.activeElement.className)));
  await r.keyboard.press('Enter');await sleep(700);
  check('Clavier : Entrée passe à l\'étape suivante',await r.evaluate(()=>_tourIdx)===1,await r.evaluate(()=>_tourIdx));
  // cible hors écran : on repousse la carte de série sous la ligne de flottaison
  await r.evaluate(()=>{const el=document.querySelector('.dstreak-card');const sp=document.createElement('div');sp.style.cssText='height:1200px';el.parentNode.insertBefore(sp,el);_homeTour.show(1);});
  await sleep(1200);
  const i2=await stepInfo(r,'app');
  check('Cible hors écran : elle est ramenée à l\'écran et le halo est dessus',i2.targetVisible&&near(i2.spot.t+8,i2.target.t),{t:i2.target,vh:i2.vh});
  await r.screenshot({path:'/tmp/shots/tour_offscreen.png'});
  await r.keyboard.press('Escape');await sleep(500);
  check('Échap termine la visite et la marque comme vue',await r.evaluate(()=>!document.getElementById('home-tour').classList.contains('show'))&&(await db.doc('users/me').get()).data().seenHomeTour===true);
  await ctx3.close();
  await browser.close();
  console.log(`\n===== ${pass}/${pass+fail} OK =====`);process.exit(fail?1:0);
})();
