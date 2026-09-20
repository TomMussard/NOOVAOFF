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



const fs=require('fs'),path=require('path');
const DASH='http://localhost:8950/dash.html';
const AXE=fs.readFileSync(path.join(__dirname,'node_modules/axe-core/axe.min.js'),'utf8');
const SEE=process.env.A11Y_REPORT==='1';       // A11Y_REPORT=1 : affiche le détail de tout ce qui reste
const BLOCK=['critical','serious'];             // ces niveaux font échouer la suite (sauf exceptions ci-dessous)
const SKIP_RULES=(process.env.A11Y_SKIP||'').split(',').filter(Boolean);   // règles à ignorer (aucune par défaut : le contraste des couleurs est audité aussi)
const run=async(p,name)=>{
  await p.evaluate(AXE);
  const r=await p.evaluate(async(skip)=>{const res=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']},rules:Object.fromEntries(skip.map(s=>[s,{enabled:false}]))});return res.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,n:v.nodes.length,ex:v.nodes.slice(0,v.id==='color-contrast'?60:3).map(n=>{const d=(n.any[0]&&n.any[0].data)||{};return n.target.join(' ')+' :: '+(n.html||'').slice(0,70)+(d.fgColor?'  ['+d.fgColor+' sur '+d.bgColor+' = '+d.contrastRatio+' (min '+d.expectedContrastRatio+', '+d.fontSize+')]':'');})}));},SKIP_RULES);
  const bad=r.filter(v=>BLOCK.includes(v.impact));
  console.log((bad.length?'FAIL ':'PASS ')+'Accessibilité '+name+' : '+(bad.length?bad.map(v=>v.id+' ×'+v.n).join(', '):'aucune violation critique/sérieuse')+(r.length-bad.length?'  (+'+(r.length-bad.length)+' mineures)':''));
  if(SEE||bad.length)r.forEach(v=>console.log('   ['+v.impact+'] '+v.id+' ×'+v.n+' — '+v.help+'\n      '+v.ex.join('\n      ')));
};
(async()=>{
  await wipe();
  await db.doc('merchants/m1').set({role:'merchant',ownerUid:'m1',brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:'m1@shop.fr',seenDashTour:true,verifiedPopupShown:true});
  await mkCampaign('c1');await mkUser('me',{name:'Moi',email:'me@t.fr',friendUids:['f1']});await mkUser('f1',{name:'Léa',friendUids:['me']});
  await db.doc('communityEvents/e1').set({type:'answer',userId:'f1',displayName:'Léa',city:'le-mans',text:'a répondu à une question de',brand:'Le Fournil',likeCount:1,commentCount:0,createdAt:Timestamp.now()});
  for(let i=0;i<3;i++)await db.doc('rewards/r'+i).set({merchantId:'m1',merchantName:'Le Fournil',city:'le-mans',label:'Café offert '+i,slot:i+1,cost:50*(i+1),valueEuros:1,status:'approved',active:true,createdAt:Timestamp.now()});
  await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});await aauth.createUser({uid:'m1',email:'m1@shop.fr',password:'secret123'});
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  // ── App habitant (mobile)
  let p=await browser.newPage();await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
  await run(p,'app : présentation');
  await p.evaluate(()=>showAuthWall('login'));await run(p,'app : connexion');
  await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
  await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user&&S.friends&&S.friends.length>=1,null,30000);
  await sleep(1200);await p.evaluate(()=>{document.querySelectorAll('[id*=tour],.tour-ov').forEach(e=>e.remove());});
  await run(p,'app : accueil');
  await p.evaluate(()=>goNav('social'));await wf(p,()=>document.querySelector('#feed-content .feed-post'),null,15000);await run(p,'app : communauté (fil)');
  await p.evaluate(()=>socTab('friends',document.querySelector('.tab-btn[onclick*="friends"]')));await sleep(1500);await run(p,'app : amis');
  await p.evaluate(()=>{goNav('profile');refreshProfile();});await sleep(600);await run(p,'app : profil');
  await p.evaluate(()=>goNav('rewards-tab'));await sleep(600);await run(p,'app : récompenses');
  await p.evaluate(()=>openBrandById('m1','Le Fournil'));await sleep(1500);await run(p,'app : page d\'un commerce');
  await p.evaluate(()=>{openReward({title:'Bien joué !',sub:'test'});});await sleep(600);await run(p,'app : écran récompense');
  await p.close();
  // ── Dashboard commerçant (mobile)
  p=await browser.newPage();await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await p.evaluateOnNewDocument(()=>{try{localStorage.setItem('nv_pro_intro','1');}catch(e){}});
  await p.goto(DASH,{waitUntil:'load'});await wf(p,()=>document.getElementById('auth-wall').style.display==='flex',null,30000);
  await p.evaluate(()=>awTab('login'));await run(p,'dashboard : connexion');
  await setVal(p,'#aw-email','m1@shop.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
  await wf(p,()=>typeof _mData!=='undefined'&&_mData&&_mData.brandName==='Le Fournil',null,25000);await sleep(1500);
  for(const pg of ['dashboard','create','campaigns','results','consents','validate','news','rewards','settings']){
    await p.evaluate(pg=>{const b=[...document.querySelectorAll('.sb-item')].find(x=>(x.getAttribute('onclick')||'').includes("'"+pg+"'"));navTo(pg,b);},pg);await sleep(700);await run(p,'dashboard : '+pg);
  }
  // ── Site vitrine et pages légales (bandeau de cookies affiché : il est audité avec la page)
  for(const [file,name] of [['index.html','site vitrine'],['cookies.html','cookies'],['confidentialite.html','confidentialité'],['cgu.html','CGU'],['mentions-legales.html','mentions légales'],['accessibilite.html','accessibilité']]){
    p=await browser.newPage();await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    await p.goto('http://localhost:8950/'+file,{waitUntil:'load'});
    if(file==='index.html'){await sleep(3200);await p.evaluate(()=>document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in')));}
    await sleep(400);await run(p,name+' (avec bandeau cookies)');await p.close();
  }
  await browser.close();process.exit(0);
})();
