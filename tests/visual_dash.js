// Captures de chaque onglet du dashboard commerçant (bureau et mobile), pour la revue visuelle.
// Lancer : SUITES=visual_dash sh tests/run.sh
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
const reveal=(uid,cid,o={})=>E.revealCore(uid,{campaignId:cid,questionIdx:0},o);
const predict=(uid,cid,g,o={})=>E.predictCore(uid,{campaignId:cid,questionIdx:0,guessIdx:g},o);
const compat=(uid,d={})=>E.compatCore(uid,d);
const byName=(r,u)=>r.friends.find(f=>f.uid===u);
const err=async fn=>{try{await fn();return null;}catch(e){return e.code||String(e);}};



const N=require(__dirname+'/../functions/notifications.js')._t;
const DAY=86400000, HOUR=3600000;
const T0=Date.parse('2026-09-21T10:00:00Z');                    // 12h00 à Paris
const DASH='http://localhost:8950/dash.html',ADMIN='http://localhost:8950/admin.html';
const setClock=ms=>db.doc('_testClock/now').set({ms});
const sink=async u=>(await db.collection('_pushSink').where('uid','==',u).get()).docs.map(d=>d.data()).sort((a,b)=>a.at-b.at);
const until=async(fn,t=15000)=>{const s=Date.now();while(Date.now()-s<t){if(await fn())return true;await sleep(300);}return false;};
const mkU=(uid,o={})=>db.doc('users/'+uid).set({role:'user',welcomeClaimed:true,name:'User '+uid,city:'le-mans',cityLabel:'Le Mans',pushEnabled:true,fcmTokens:['tok_'+uid],authorizedMerchants:['m1'],declinedMerchants:[],interests:['boulangerie'],answeredCampaigns:[],friendUids:[],points:0,xp:0,streak:0,onboardingStep:'done',seenHomeTour:true,...o});
const mkM=(id,o={})=>db.doc('merchants/'+id).set({role:'merchant',ownerUid:id,brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:id+'@shop.fr',...o});
const ansM=(uid,cid,o={})=>db.doc(`answers/${uid}_${cid}_q0`).set({userId:uid,campaignId:cid,merchantId:'m1',questionIdx:0,answer:'Café',flagged:!!o.flagged,pointsAwarded:0,createdAt:Timestamp.now()});
const post=(id,o={})=>db.doc('merchantPosts/'+id).set({merchantId:'m1',merchantName:'Le Fournil',text:'Suite à vos avis, nous ouvrons dès 6h30 le samedi.',campaignIds:[],status:'pending',city:'le-mans',createdAt:Timestamp.now(),...o});
const publish=async(id)=>db.doc('merchantPosts/'+id).update({status:'published',publishedAt:Timestamp.now(),reviewedAt:Timestamp.now()});
const settle=async()=>{await sleep(4500);for(const c of ['_pushSink','notifLog','notifQueue','mail'])for(const d of (await db.collection(c).get()).docs)await d.ref.delete();for(const d of (await db.collection('users').get()).docs)await d.ref.update({notifDaily:admin.firestore.FieldValue.delete(),notifStats:admin.firestore.FieldValue.delete()});for(const d of (await db.collection('notifMetrics').get()).docs)await d.ref.delete();};

const W=+(process.env.W||390),H=+(process.env.H||844);
(async()=>{
  await wipe();
  await mkM('m1',{plan:'starter',consentCount:42,verifiedPopupShown:true,seenDashTour:true});
  await db.doc('merchants/m1').update({address:'12 rue de la République, 72000 Le Mans',phone:'0243000000',siret:'73282932000074',logoUrl:null});
  const qs=['Quelle est ta boisson préférée le matin ?','Que penses-tu de nos nouveaux horaires d\'ouverture le samedi ?','Quel produit aimerais-tu voir plus souvent en boutique ?'];
  const cids=[];
  for(let i=0;i<3;i++){const id='c'+i;cids.push(id);await mkCampaign(id,{question:qs[i],name:'Campagne '+(i+1),questions:[{q:qs[i],format:'mcq',options:['Café','Thé','Chocolat']}],answersCount:i===0?34:i===1?12:3,targetVolume:100,status:i===2?'paused':'active',endsAt:Timestamp.fromMillis(Date.now()+20*86400000)});}
  for(let i=0;i<34;i++){await db.doc(`answers/u${i}_c0_q0`).set({userId:'u'+i,merchantId:'m1',campaignId:'c0',questionIdx:0,question:qs[0],answer:['Café','Thé','Chocolat'][i%3],respondentAge:20+i%30,respondentCity:'le-mans',respondentInterests:['boulangerie'],pointsAwarded:10,qualityScore:80,flagged:false,createdAt:Timestamp.fromMillis(Date.now()-i*3600000)});}
  for(let i=0;i<5;i++)await db.doc('rewards/m1_p'+(i+1)).set({merchantId:'m1',merchantName:'Le Fournil',city:'le-mans',label:['Café offert','Croissant offert','Baguette offerte','Menu midi -20%','Panier surprise'][i],tier:(i+1),slot:(i+1),cost:[150,300,500,900,1500][(i+1)-1],priceConfirmed:true,monthlyQuota:20,timeSlots:[],withPurchase:false,minPurchase:null,status:'approved',active:true,approved:true,redeemedCount:0,icon:'',createdAt:Timestamp.now()});
  for(let i=0;i<4;i++)await db.doc('redemptions/x'+i).set({merchantId:'m1',userId:'u'+i,label:'Café offert',code:'NVA-ABC-000'+i,cost:50,status:i<2?'pending':'used',createdAt:Timestamp.now(),expiresAt:Timestamp.fromMillis(Date.now()+86400000)});
  for(let i=0;i<6;i++)await db.doc('consentEvents/e'+i).set({merchantId:'m1',userId:'u'+i,action:i%2?'granted':'revoked',segment:'Boulangerie',createdAt:Timestamp.now()});
  await db.doc('merchants/m1/notifications/n1').set({type:'paliers',title:'Vos 5 premières réponses sont là',message:'Vous avez reçu vos 5 premières réponses, les résultats sont disponibles.',read:false,createdAt:Timestamp.now()});
  await db.doc('merchantPosts/p1').set({merchantId:'m1',merchantName:'Le Fournil',text:'Suite à vos avis, nous ouvrons dès 6h30 le samedi. Merci à tous pour vos retours !',campaignIds:['c0'],status:'published',city:'le-mans',notifySent:20,notifyNote:'sent',createdAt:Timestamp.now()});
  await db.doc('merchantPosts/p2').set({merchantId:'m1',merchantName:'Le Fournil',text:'Achetez 2 baguettes, la 3e offerte !',campaignIds:[],status:'rejected',rejectionReason:'Trop promotionnel',city:'le-mans',createdAt:Timestamp.now()});
  await aauth.createUser({uid:'m1',email:'m1@shop.fr',password:'secret123'});
  const OUT=process.env.SHOTS_DIR||'/tmp/shots/visual';require('fs').mkdirSync(OUT,{recursive:true});
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  for(const [vw,vh,label,mob] of [[1280,800,'dash_desktop',false],[390,844,'dash_mobile',true]]){
    const ctx=await browser.createBrowserContext();const p=await ctx.newPage();await p.setViewport({width:vw,height:vh,deviceScaleFactor:1,isMobile:mob,hasTouch:mob});
    if(process.env.FIREBASE_SDK_DIR){await p.setRequestInterception(true);p.on('request',r=>{const u=r.url();if(/^https?:\/\/(localhost|127\.0\.0\.1)/.test(u)||u.startsWith('data:'))return r.continue();return r.abort();});}
    const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.evaluateOnNewDocument(()=>{try{localStorage.setItem('nv_pro_intro','1');}catch(e){}});
    await p.goto(DASH,{waitUntil:'load'});await wf(p,()=>document.getElementById('auth-wall').style.display==='flex',null,30000);
    await sleep(600);await p.screenshot({path:`${OUT}/${label}_auth.png`});
    await p.evaluate(()=>awTab('login'));await setVal(p,'#aw-email','m1@shop.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>typeof _mData!=='undefined'&&_mData&&_mData.brandName==='Le Fournil'&&_mCampaigns&&_mCampaigns.length>=3,null,25000);
    await p.evaluate(()=>{try{endDashTour();}catch(e){}});
    await p.evaluate(()=>{const v=document.getElementById('verified-popup');if(v)v.remove();document.querySelectorAll('.modal-bg.show,.overlay.show').forEach(e=>e.classList.remove('show'));});
    await sleep(1500);
    for(const pg of ['dashboard','create','campaigns','results','consents','validate','news','rewards','settings']){
      await p.evaluate(pg=>{const b=[...document.querySelectorAll('.sb-item')].find(x=>(x.getAttribute('onclick')||'').includes("'"+pg+"'"));navTo(pg,b);},pg);await sleep(1200);
      await p.screenshot({path:`${OUT}/${label}_${pg}.png`,fullPage:!mob});
    }
    console.log((errs.length?'FAIL ':'PASS ')+label+' : erreurs JS '+JSON.stringify(errs.slice(0,3)));
    await ctx.close();
  }
  await browser.close();process.exit(0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
