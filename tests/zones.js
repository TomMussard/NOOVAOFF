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


// ─── Zones : un habitant ne voit jamais les questions ni les commerces d'une autre ville (hors rayon de 25 km) ───
(async()=>{
  await wipe();
  const M=(id,name,city,label)=>db.doc('merchants/'+id).set({role:'merchant',ownerUid:id,brandName:name,name,sector:'Boulangerie',city,cityLabel:label,status:'verified',email:id+'@shop.fr',verifiedPopupShown:true});
  await M('mLM','Le Fournil','le-mans','Le Mans');await M('mPA','Boulangerie Parisienne','paris','Paris');
  await db.doc('cities/paris').set({label:'Paris',active:true});await db.doc('cities/le-mans').set({label:'Le Mans',active:true});
  const C=(id,mid,name,city)=>db.doc('campaigns/'+id).set({merchantId:mid,merchantName:name,sector:'Boulangerie',status:'active',targetCity:city,city,question:'Question de '+name+' ?',questions:[{q:'Question de '+name+' ?',format:'mcq',options:['Oui','Non']}],targetVolume:500,answersCount:0,createdAt:Timestamp.now()});
  await C('cLM','mLM','Le Fournil','le-mans');await C('cPA','mPA','Boulangerie Parisienne','paris');
  for(const [uid,city,label] of [['uPA','paris','Paris'],['uLM','le-mans','Le Mans']]){
    // Les deux habitants ont « autorisé » les deux commerces (compte ancien, déménagement) : la ville doit primer.
    await mkUser(uid,{email:uid+'@t.fr',city,cityLabel:label,authorizedMerchants:['mLM','mPA']});
    await aauth.createUser({uid,email:uid+'@t.fr',password:'secret123'});
  }
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  for(const [uid,mine,other] of [['uPA','Boulangerie Parisienne','Le Fournil'],['uLM','Le Fournil','Boulangerie Parisienne']]){
    const ctx=await browser.createBrowserContext();const p=await ctx.newPage();PG=p;await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email',uid+'@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user,null,30000);await sleep(3500);
    const v=await p.evaluate(()=>({qs:(S.qs||[]).map(q=>q.brand),merchants:mapMerchants().map(m=>m.name),home:document.getElementById('home').innerText}));
    check(`${uid} : questions uniquement de sa ville (${mine})`,v.qs.length>0&&v.qs.every(b=>b===mine),v.qs);
    check(`${uid} : aucun commerce de l'autre ville, même autorisé (${other})`,!v.merchants.includes(other)&&!v.home.includes(other),v.merchants);
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(fail?1:0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
