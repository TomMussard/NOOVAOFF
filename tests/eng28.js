// Zone de correspondance (25 km) autour d'une ville NOOVA : functions/cityZones.js. Une commune qui n'est pas elle-même
// une ville NOOVA (Le Mans, Angers) est rattachée à la plus proche si elle est à moins de 25 km — jamais au-delà, jamais
// sans ville NOOVA assez proche — et ça marche quelle que soit la commune de départ, pas seulement une liste figée.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const CZ=require(__dirname+'/../functions/cityZones.js')._t;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,3).join(' | '));}};
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
const wf=(p,fn,arg,t=25000)=>p.waitForFunction(fn,{timeout:t,polling:200},arg);
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const CHROME=(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const APP='http://localhost:8950/app.html',DASH='http://localhost:8950/dash.html';
// Repère fixe : Le Mans à (48.00,0.20). 1° de latitude ≈ 111 km ; on ne fait varier que la latitude pour un calcul simple à vérifier.
const LE_MANS={lat:48.00,lng:0.20}, ANGERS={lat:47.47,lng:-0.55};

(async()=>{
  await T('haversineKm : cohérent avec la géométrie (1° de latitude ≈ 111 km)',async()=>{
    const km=CZ.haversineKm({lat:48.00,lng:0.20},{lat:49.00,lng:0.20});
    check('Distance ~111 km pour 1° de latitude d\'écart',Math.abs(km-111.2)<2,km);
    check('Distance nulle entre un point et lui-même',CZ.haversineKm(LE_MANS,LE_MANS)===0);
  });

  await T('resolveZoneCore (fonction pure, coordonnées injectées)',async()=>{
    const coords={'le mans':LE_MANS,'angers':ANGERS,'proche':{lat:48.08,lng:0.20},'loin':{lat:49.50,lng:2.00},'pres-angers':{lat:47.50,lng:-0.58},'introuvable':null};
    let calls=0;
    CZ.setGeocodeFn(async(label)=>{calls++;const c=coords[String(label||'').toLowerCase()];return c?{lat:c.lat,lng:c.lng}:null;});   // geocodeFn est appelée avec le LABEL (« Le Mans »), pas le slug
    check('Ville NOOVA elle-même (« le-mans ») : rien à résoudre',JSON.stringify(await CZ.resolveZoneCore('le-mans','le-mans'))===JSON.stringify({slug:'le-mans',matched:false}));
    const r1=await CZ.resolveZoneCore('proche','proche');
    check('Commune à ~9 km du Mans : rattachée, avec la distance renvoyée',r1.slug==='le-mans'&&r1.matched===true&&r1.km>0&&r1.km<25,r1);
    const r2=await CZ.resolveZoneCore('loin','loin');
    check('Commune à plus de 25 km de toute ville NOOVA : pas rattachée, reste elle-même (jamais forcée)',r2.slug==='loin'&&r2.matched===false,r2);
    const r3=await CZ.resolveZoneCore('introuvable','introuvable');
    check('Commune introuvable (géocodage en échec) : pas rattachée, aucune erreur levée (fail closed)',r3.slug==='introuvable'&&r3.matched===false,r3);
    const r4=await CZ.resolveZoneCore('pres-angers','pres-angers');
    check('Point proche d\'Angers : rattaché à Angers, pas systématiquement au Mans (l\'ordre de HUB_CITIES ne force rien)',r4.matched===true&&r4.slug==='angers'&&r4.km<25,r4);
  });

  await T('mise en cache : une commune n\'est géocodée qu\'une seule fois',async()=>{
    await db.collection('cities').doc('cache-test').delete().catch(()=>{});
    let calls=0;
    CZ.setGeocodeFn(async()=>{calls++;return {lat:48.01,lng:0.21};});
    await CZ.coordsOf('cache-test','Cache Test');
    await CZ.coordsOf('cache-test','Cache Test');
    check('geocodeFn appelée une seule fois (2e lecture depuis le cache Firestore)',calls===1,calls);
    const doc=(await db.doc('cities/cache-test').get()).data();
    check('Coordonnées mises en cache sur cities/{slug}',doc.lat===48.01&&doc.lng===0.21,doc);
  });

  // ── De bout en bout, via le vrai callable HTTP (émulateur), géocodage simulé par des documents _testGeocode ──
  await wipe();
  await db.doc('_testGeocode/le mans').set(LE_MANS);
  await db.doc('_testGeocode/angers').set(ANGERS);
  await db.doc('_testGeocode/testville proche').set({lat:48.08,lng:0.20});   // ≈ 9 km du Mans
  await db.doc('_testGeocode/testville loin').set({lat:49.50,lng:2.00});    // ≈ 190 km : hors de portée de toute ville NOOVA
  await db.doc('merchants/m1').set({role:'merchant',ownerUid:'m1',brandName:'Le Fournil',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:'m1@shop.fr'});
  await db.doc('campaigns/c1').set({merchantId:'m1',merchantName:'Le Fournil',sector:'Boulangerie',status:'active',targetCity:'le-mans',city:'le-mans',question:'Q ?',questions:[{q:'Q ?',format:'mcq',options:['A','B']}],targetVolume:500,answersCount:0,createdAt:admin.firestore.Timestamp.now()});

  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});

  await T('inscription habitant : commune proche (jamais listée) rattachée au Mans',async()=>{
    const ctx=await browser.createBrowserContext();const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await p.evaluate(()=>showAuthWall('register'));
    await setVal(p,'#aw-name','Nao');await setVal(p,'#aw-city','Testville Proche');await setVal(p,'#aw-email','nao@t.fr');await setVal(p,'#aw-pass','secret123');
    await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('cat-wall').style.display==='flex',null,20000);
    const uid=await p.evaluate(()=>auth.currentUser.uid);
    const u=(await db.doc('users/'+uid).get()).data();
    check('« Testville Proche » (jamais listée nulle part, juste proche du Mans) → city = « le-mans », cityLabel conservé',u.city==='le-mans'&&u.cityLabel==='Testville Proche',u);
    check('Aucune erreur JavaScript',errs.length===0,errs);
    await ctx.close();
  });

  await T('inscription habitant : commune trop loin, jamais rattachée, inscription refusée',async()=>{
    const ctx=await browser.createBrowserContext();const p=await ctx.newPage();
    await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await p.evaluate(()=>showAuthWall('register'));
    await setVal(p,'#aw-name','Far');await setVal(p,'#aw-city','Testville Loin');await setVal(p,'#aw-email','far@t.fr');await setVal(p,'#aw-pass','secret123');
    await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('cat-wall').style.display==='flex',null,20000);   // pas de ville « fermée » par défaut (fail-open) : l'inscription passe
    const uid=await p.evaluate(()=>auth.currentUser.uid);
    const u=(await db.doc('users/'+uid).get()).data();
    check('« Testville Loin » (≈190 km, hors de portée) : jamais rattachée au Mans — reste sa propre ville, isolée',u.city==='testville-loin'&&u.cityLabel==='Testville Loin',u);
    await ctx.close();
  });

  await T('inscription commerçant : commune proche rattachée, campagne visible aux habitants du Mans',async()=>{
    const ctx=await browser.createBrowserContext();const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.setViewport({width:1200,height:1000});
    await p.evaluateOnNewDocument(()=>{try{localStorage.setItem('nv_pro_intro','1');}catch(e){}});
    await p.goto(DASH,{waitUntil:'load'});await wf(p,()=>document.getElementById('auth-wall').style.display==='flex',null,30000);
    await p.evaluate(()=>awTab('register'));
    await setVal(p,'#aw-siret','73282932000074');await setVal(p,'#aw-brand','Testville Boulangerie');await setVal(p,'#aw-sector','Boulangerie');
    await setVal(p,'#aw-city','Testville Proche');await setVal(p,'#aw-address','1 rue Test');
    await p.evaluate(()=>awSubmit());await sleep(500);
    await setVal(p,'#aw-firstname','A');await setVal(p,'#aw-lastname','B');await setVal(p,'#aw-phone','0612345678');
    await setVal(p,'#aw-email','testm@shop.fr');await setVal(p,'#aw-pass','secret123');
    await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('verif-banner').style.display==='block',null,25000);
    const uid=await p.evaluate(()=>auth.currentUser.uid);
    const m=(await db.doc('merchants/'+uid).get()).data();
    check('Commerçant de « Testville Proche » → city = « le-mans », cityLabel conservé',m.city==='le-mans'&&m.cityLabel==='Testville Proche',m);
    check('Aucune erreur JavaScript',errs.length===0,errs);
    await ctx.close();
  });

  await browser.close();
  console.log('\n'+pass+' ok, '+fail+' échec(s)');process.exit(fail?1:0);
})();
