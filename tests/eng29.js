// Audit de bout en bout — commerçant + admin : inscription réelle, admin qui VALIDE puis REFUSE une entreprise
// (avec motif), approbation d'une récompense, création d'une campagne. Setup minimal via SDK admin (comme les
// autres suites), le reste piloté par de vrais clics dans le navigateur — pour attraper les régressions
// d'intégration que les tests unitaires isolés ne voient pas.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,4).join(' | '));}};
const wf=(p,fn,arg,t=20000)=>p.waitForFunction(fn,{timeout:t,polling:200},arg);
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const CHROME=(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const DASH='http://localhost:8950/dash.html',ADMIN='http://localhost:8950/admin.html';
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
const errs=[];
const track=(p,label)=>{p.on('pageerror',e=>errs.push(label+' : '+e.message));};

(async()=>{
  await wipe();
  await aauth.createUser({uid:'admtest',email:'tomussproduction@gmail.com',password:'secret123'});
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox'],protocolTimeout:120000});

  const mctx=await browser.createBrowserContext();const mp=await mctx.newPage();track(mp,'commerçant');
  await mp.setViewport({width:1280,height:1000});
  await mp.evaluateOnNewDocument(()=>{try{localStorage.setItem('nv_pro_intro','1');}catch(e){}});

  await T('commerçant : inscription réelle (SIRET → étape 2 → compte créé, en attente)',async()=>{
    await mp.goto(DASH,{waitUntil:'load'});await wf(mp,()=>document.getElementById('auth-wall').style.display==='flex',null,30000);
    await mp.evaluate(()=>awTab('register'));
    await setVal(mp,'#aw-siret','73282932000074');await setVal(mp,'#aw-brand','Le Fournil du Mans');await setVal(mp,'#aw-sector','Boulangerie');
    await setVal(mp,'#aw-city','Le Mans');await setVal(mp,'#aw-address','12 rue Gambetta');
    await mp.evaluate(()=>awSubmit());await sleep(500);
    check('Étape 1 → 2 (infos personnelles)',await mp.evaluate(()=>_awStep===2));
    await setVal(mp,'#aw-firstname','Marie');await setVal(mp,'#aw-lastname','Dupont');await setVal(mp,'#aw-phone','0612345678');
    await setVal(mp,'#aw-email','fournil@shop.fr');await setVal(mp,'#aw-pass','secret123');
    await mp.evaluate(()=>awSubmit());
    await wf(mp,()=>document.getElementById('verif-banner').style.display==='block',null,20000);
    const banner=await mp.$eval('#verif-banner',e=>e.textContent);
    check('Bandeau « vérification en cours », bouton Lancer verrouillé',/en cours/i.test(banner)&&await mp.evaluate(()=>[...document.querySelectorAll('.wiz-btn-launch')].every(b=>b.disabled)),banner);
  });

  const uid=await mp.evaluate(()=>auth.currentUser.uid);
  await T('commerçant : crée sa 1re récompense (les 4 autres, seedées, pour aller vite)',async()=>{
    await mp.evaluate(()=>{try{endDashTour();}catch(e){}navTo('rewards',document.getElementById('nav-rewards'));});await sleep(500);
    await mp.evaluate(()=>openRewardForm(1));await sleep(200);
    await mp.evaluate(()=>{document.getElementById('rf-price-1').checked=true;document.getElementById('rf-label-1').value='Café offert';});
    await mp.evaluate(()=>saveReward(1,{disabled:false,textContent:''}));
    await wf(mp,()=>_rewardSlots.length>=1,null,10000);
    const r1=(await db.doc('rewards/'+uid+'_p1').get()).data();
    check('Palier 1 créé via l\'interface, en attente de validation, coût imposé (150 pts)',r1&&r1.status==='pending'&&r1.approved===false&&r1.cost===150,r1);
  });

  const TIERS=require('../functions/tiers.js');
  for(let n=2;n<=5;n++) await db.doc('rewards/'+uid+'_p'+n).set({merchantId:uid,merchantName:'Le Fournil du Mans',city:'le-mans',tier:n,slot:n,cost:TIERS[n-1].pts,label:'Palier '+n,icon:'🎁',priceConfirmed:true,monthlyQuota:20,timeSlots:[],withPurchase:false,minPurchase:null,status:'pending',active:false,approved:false,redeemedCount:0,createdAt:Timestamp.now(),updatedAt:Timestamp.now()});

  const actx=await browser.createBrowserContext();const ap=await actx.newPage();track(ap,'admin');
  await ap.setViewport({width:1280,height:1000});

  await T('admin : peut VALIDER une entreprise, puis ses récompenses',async()=>{
    await ap.goto(ADMIN,{waitUntil:'load'});await sleep(1500);
    await ap.evaluate(async()=>{await auth.signInWithEmailAndPassword('tomussproduction@gmail.com','secret123');});
    await wf(ap,()=>typeof allMerchants!=='undefined'&&allMerchants.length>=1,null,20000);
    check('Le commerçant apparaît en attente',await ap.evaluate(()=>allMerchants.some(m=>m.brandName==='Le Fournil du Mans'&&m.status==='pending')));
    ap.once('dialog',d=>d.accept());   // approveMerchant() utilise confirm() natif, sinon la boîte reste ouverte et bloque toute la page
    await ap.evaluate(()=>{const row=[...document.querySelectorAll('#list-pending .merchant-row')].find(r=>/Le Fournil du Mans/.test(r.textContent));row.querySelector('.btn-approve').click();});
    await wf(ap,uid=>allMerchants.find(m=>m.id===uid).status==='verified',uid,15000);
    check('Statut passé à « verified » en base',(await db.doc('merchants/'+uid).get()).data().status==='verified');
    await ap.evaluate(()=>{document.getElementById('tab-moderation').style.display='block';loadModeration();});
    await sleep(1000);
    const rw=await db.collection('rewards').where('merchantId','==',uid).get();
    for(const d of rw.docs) await ap.evaluate(id=>approveReward(id,null),d.id);
    await sleep(1200);
    const rw2=await db.collection('rewards').where('merchantId','==',uid).get();
    check('Les 5 paliers approuvés (approved, status, active) via l\'admin',rw2.size===5&&rw2.docs.every(d=>d.data().approved===true&&d.data().status==='approved'&&d.data().active===true),rw2.docs.map(d=>d.data().status));
  });

  await T('admin : peut REFUSER une entreprise, avec motif visible par le commerçant',async()=>{
    await db.doc('merchants/rej1').set({role:'merchant',ownerUid:'rej1',brandName:'À Refuser',name:'À Refuser',sector:'Sport',city:'le-mans',cityLabel:'Le Mans',email:'rej1@shop.fr',status:'pending',createdAt:Timestamp.now()});
    await aauth.createUser({uid:'rej1',email:'rej1@shop.fr',password:'secret123'});
    await ap.evaluate(()=>{document.getElementById('tab-entreprises').style.display='block';loadMerchants();});
    await wf(ap,()=>allMerchants.some(m=>m.brandName==='À Refuser'),null,15000);
    ap.once('dialog',d=>d.accept('Photo illisible'));
    await ap.evaluate(()=>{const row=[...document.querySelectorAll('#list-pending .merchant-row')].find(r=>/À Refuser/.test(r.textContent));row.querySelector('.btn-reject').click();});
    await sleep(1200);
    const m=(await db.doc('merchants/rej1').get()).data();
    check('Statut « rejected » avec le motif exact enregistré',m.status==='rejected'&&m.rejectionReason==='Photo illisible',m);
    await ap.evaluate(()=>filterMerchants('rejected'));await sleep(400);
    check('Apparaît bien dans l\'onglet « Rejetés »',/À Refuser/.test(await ap.$eval('#list-all',e=>e.textContent)));
    check('Aucune erreur JavaScript côté admin',!errs.some(e=>e.startsWith('admin')),errs);
  });

  await T('commerçant vérifié : crée une campagne de bout en bout',async()=>{
    await mp.reload({waitUntil:'load'});await wf(mp,()=>typeof _mData!=='undefined'&&_mData&&_mData.status==='verified',null,20000);
    await mp.evaluate(()=>{try{closeVerifiedModal();}catch(e){}try{endDashTour();}catch(e){}});
    await mp.evaluate(()=>navTo('create',document.getElementById('nav-create')));await wf(mp,()=>curPage==='create',null,10000);
    await mp.evaluate(()=>{document.getElementById('q-text-inp').value='Voulez-vous une ouverture le dimanche ?';const o=document.querySelectorAll('#mcq-options .mcq-opt-inp');if(o[0])o[0].value='Oui';if(o[1])o[1].value='Non';document.getElementById('camp-name-inp').value='Test dimanche';wzGo(3);});
    await wf(mp,()=>!/Calcul/.test(document.getElementById('recap-reach').textContent),null,15000);
    await mp.evaluate(()=>launchCampaign());
    await wf(mp,()=>document.getElementById('cashier-modal').style.display==='flex',null,10000);
    await mp.evaluate(()=>{document.getElementById('cashier-check').click();document.getElementById('cashier-ok').click();});
    await sleep(2000);
    const camps=await db.collection('campaigns').where('merchantId','==',uid).get();
    check('Campagne créée et active',camps.size===1&&camps.docs[0].data().status==='active',camps.docs.map(d=>d.data().status));
    check('Aucune erreur JavaScript côté commerçant',!errs.some(e=>e.startsWith('commerçant')),errs);
  });

  console.log('MERCHANT_UID='+uid);   // repris par eng30.js
  await browser.close();
  console.log('\n'+pass+' ok, '+fail+' échec(s)');process.exit(fail?1:0);
})();
