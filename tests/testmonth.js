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


// ─── Mois de test : 45 commerces fictifs autonomes (préparation, pilote automatique, app, échange simulé, arrêt) ───
const TM=require(__dirname+'/../functions/testMonth.js')._t;
(async()=>{
  await wipe();
  // Un commerce réel, avec une campagne et une récompense : doit disparaître si la suppression est demandée.
  await db.doc('merchants/real1').set({role:'merchant',ownerUid:'real1',brandName:'Vraie Boulangerie',name:'Vraie Boulangerie',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:'real1@shop.fr'});
  await db.doc('campaigns/realc').set({merchantId:'real1',status:'active',targetCity:'le-mans',city:'le-mans',question:'Q ?',questions:[{q:'Q ?',format:'mcq',options:['A','B']}],createdAt:Timestamp.now()});
  await db.doc('rewards/real1_p1').set({merchantId:'real1',city:'le-mans',tier:1,cost:150,active:true,approved:true,status:'approved'});
  const r=await TM.setupCore({deleteReal:true});
  check('Commerce réel supprimé avec sa campagne et sa récompense',r.deleted.includes('Vraie Boulangerie')&&!(await db.doc('merchants/real1').get()).exists&&!(await db.doc('campaigns/realc').get()).exists&&!(await db.doc('rewards/real1_p1').get()).exists,r.deleted);
  const ms=(await db.collection('merchants').get()).docs.map(d=>d.data());
  check('45 commerces fictifs (9 villes × 5), tous vérifiés et marqués isTest',ms.length===45&&ms.every(m=>m.isTest===true&&m.status==='verified'),ms.length);
  check('Chaque ville a son café, coiffeur, fleuriste, supérette et bar',TM.CITIES.every(c=>['Café','Coiffeur','Fleuriste','Supérette','Bar'].every(s=>ms.some(m=>m.city===c.slug&&m.sector===s))));
  const fs=require('fs');
  check('Chaque commerce fictif a un logo et une devanture, et les fichiers existent',ms.every(m=>/^\/img\/commerces\/[a-z]+-logo-[123]\.svg$/.test(m.logoUrl||'')&&/^\/img\/commerces\/[a-z]+-[123]\.svg$/.test(m.coverUrl||'')&&fs.existsSync(__dirname+'/..'+m.logoUrl)&&fs.existsSync(__dirname+'/..'+m.coverUrl)),ms.filter(m=>!m.coverUrl).length);
  await db.doc('merchants/'+TM.merchantId('angers','cafe')).update({logoUrl:admin.firestore.FieldValue.delete(),coverUrl:admin.firestore.FieldValue.delete()});
  const nv=await TM.visualsCore();const back=(await db.doc('merchants/'+TM.merchantId('angers','cafe')).get()).data();
  check('Mise à jour des visuels : ne touche que les commerces sans visuel, et les remet',nv===1&&back.coverUrl==='/img/commerces/cafe-2.svg'&&back.logoUrl==='/img/commerces/cafe-logo-2.svg',{nv,back:[back.logoUrl,back.coverUrl]});
  const names=ms.map(m=>m.brandName);check('Aucun nom en double',new Set(names).size===45,names.length);
  const rw=(await db.collection('rewards').get()).docs.map(d=>d.data());
  check('Vitrine de 5 paliers par commerce (225 récompenses validées, sans alcool mis en avant)',rw.length===225&&rw.every(x=>x.isTest&&x.approved&&x.active)&&!rw.some(x=>/bière|vin|alcool(?! )/i.test(x.label.replace(/sans alcool/gi,''))),rw.length);
  const cs1=(await db.collection('campaigns').get()).docs.map(d=>d.data());
  check('Première vague : une question par commerce (45), liée à son métier',cs1.length===45&&cs1.every(c=>c.isTest&&c.status==='active'&&c.questions[0].options.length>=3),cs1.length);
  check('9 villes ouvertes',(await Promise.all(TM.CITIES.map(c=>db.doc('cities/'+c.slug).get()))).every(d=>d.exists&&d.data().active===true));
  // Pilote automatique : la question suivante de la banque, jamais la même
  const a=await TM.autopilotCore(Date.now());
  const cs2=(await db.collection('campaigns').where('merchantId','==','test_paris_cafe').get()).docs.map(d=>d.data().question);
  check('Pilote automatique : une nouvelle question par commerce, différente de la précédente',a.questions===45&&cs2.length===2&&cs2[0]!==cs2[1],cs2);
  check('Banque : 15 questions par métier, sans doublon',Object.values(TM.BANK).every(b=>b.length>=12&&new Set(b.map(x=>x[0])).size===b.length));
  // App : un habitant de Paris voit les questions des commerces fictifs de Paris, étiquetées « Commerce test »
  await mkUser('uPA',{email:'uPA@t.fr',city:'paris',cityLabel:'Paris',authorizedMerchants:TM.CITIES.length?['test_paris_cafe','test_paris_bar','test_paris_coiffeur','test_paris_fleuriste','test_paris_superette']:[],points:400,interests:[]});
  await aauth.createUser({uid:'uPA',email:'uPA@t.fr',password:'secret123'});
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const p=await browser.newPage();PG=p;await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
  await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','uPA@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
  await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user,null,30000);await sleep(3500);
  const v=await p.evaluate(()=>({brands:[...new Set((S.qs||[]).map(q=>q.brand))],tagged:(S.qs||[]).every(q=>q._isTest),today:document.getElementById('tc-brand').innerHTML}));
  check('App (Paris) : les questions viennent des 5 commerces fictifs de Paris',v.brands.length===5,v.brands);
  check('App : étiquette « Commerce test » sur la question du jour',v.tagged&&/Commerce test/.test(v.today),v.today);
  // Échange simulé : un bon est émis, marqué test
  const red=await p.evaluate(async()=>{try{return (await fx.httpsCallable('redeemReward')({rewardId:'test_paris_cafe_p1'})).data;}catch(e){return {err:e.code||String(e)};}});
  check('Échange simulé : bon émis et marqué « test »',red&&red.code&&red.isTest===true,red);
  await p.evaluate(r=>showVoucherModal({isTest:true,id:r.redemptionId,code:r.code,label:r.label,merchantName:r.merchantName,cost:r.cost,expiresAt:new Date(r.expiresAt)}),red);await sleep(400);
  check('Écran du bon : mention « Bon de test, sans valeur »',await p.evaluate(()=>/Bon de test, sans valeur/.test(document.getElementById('voucher-full').innerText)));
  await p.screenshot({path:'/tmp/shots/testmonth_voucher.png'});
  await browser.close();
  // Arrêt : plus de question automatique ; fin du test : commerces masqués, questions closes
  await TM.stopCore({hide:false});
  check('Arrêt : le pilote ne pose plus de question',(await TM.autopilotCore(Date.now())).skipped===true);
  const st=await TM.stopCore({hide:true});
  check('Fin du test : 45 commerces masqués, questions closes',st.hidden===45&&(await db.collection('campaigns').where('status','==','active').get()).size===0,st);
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(fail?1:0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,500));process.exit(1);});
