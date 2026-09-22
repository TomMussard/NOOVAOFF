// Zone « Le Mans » : les communes de Le Mans Métropole (Allonnes, Arnage, Yvré-l'Évêque…) sont rattachées au même
// slug « le-mans » que la ville elle-même — un commerce de l'une de ces communes doit apparaître aux habitants
// du Mans, et réciproquement — tout en gardant leur nom affiché (cityLabel) tel qu'ils l'ont saisi.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,3).join(' | '));}};
const wf=(p,fn,arg,t=25000)=>p.waitForFunction(fn,{timeout:t,polling:200},arg);
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const CHROME=(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const APP='http://localhost:8950/app.html',DASH='http://localhost:8950/dash.html';
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
const mkCamp=(id,o={})=>db.doc('campaigns/'+id).set({merchantId:'m1',merchantName:'Le Fournil',sector:'Boulangerie',status:'active',targetCity:'le-mans',city:'le-mans',question:'Quelle boisson préfères-tu ?',questions:[{q:'Quelle boisson préfères-tu ?',format:'mcq',options:['Café','Thé','Chocolat']}],targetVolume:500,answersCount:0,createdAt:Timestamp.now(),...o});

(async()=>{
  await wipe();
  await db.doc('merchants/m1').set({role:'merchant',ownerUid:'m1',brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:'m1@shop.fr'});
  await mkCamp('c1');
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});

  await T('normalizeCity : communes de la zone (app + dashboard)',async()=>{
    const p=await browser.newPage();await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    const inZone=['Allonnes','ALLONNES','allonnes','Arnage',"Yvré-l'Évêque",'Yvre l Eveque','Sargé-lès-Le Mans','La Chapelle-Saint-Aubin','Coulaines','Le Mans','lemans'];
    const r=await p.evaluate(list=>list.map(x=>normalizeCity(x)),inZone);
    check('Chaque commune de la zone (et Le Mans lui-même, toutes graphies) résout vers « le-mans »',r.every(x=>x==='le-mans'),{inZone,r});
    const other=await p.evaluate(()=>[normalizeCity('Angers'),normalizeCity('Paris'),normalizeCity('Sarge')]);
    check('Une ville hors zone (Angers, Paris) et une commune non listée (Sarge, tronquée) ne sont pas absorbées dans « le-mans »',other[0]==='angers'&&other[1]==='paris'&&other[2]!=='le-mans',other);
    await p.close();
    const d=await browser.newPage();await d.goto(DASH,{waitUntil:'load'});await sleep(800);
    const rd=await d.evaluate(list=>list.map(x=>normalizeCity(x)),inZone);
    check('Même résolution côté dashboard (copie dupliquée du code)',rd.every(x=>x==='le-mans'),rd);
    await d.close();
  });

  await T('inscription habitant à Allonnes : voit les campagnes du Mans, garde « Allonnes » affiché',async()=>{
    const ctx=await browser.createBrowserContext();const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await p.evaluate(()=>showAuthWall('register'));
    await setVal(p,'#aw-name','Léa');await setVal(p,'#aw-city','Allonnes');await setVal(p,'#aw-email','lea@t.fr');await setVal(p,'#aw-pass','secret123');
    await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('cat-wall').style.display==='flex'||document.getElementById('claim-splash').style.display==='flex',null,20000);
    await wf(p,()=>document.getElementById('cat-wall').style.display==='flex',null,15000);
    const uid=await p.evaluate(()=>auth.currentUser.uid);
    const u=(await db.doc('users/'+uid).get()).data();
    check('Compte créé : city = « le-mans » (zone), cityLabel = « Allonnes » (ce qu\'elle a tapé)',u.city==='le-mans'&&u.cityLabel==='Allonnes',u);
    await p.evaluate(()=>{document.querySelector('#cat-grid [data-cat=all]').click();saveCategories();});   // « Tout m'intéresse » : la campagne (secteur Boulangerie) apparaît sans dépendre du tirage aléatoire de découverte
    await wf(p,()=>document.getElementById('home').classList.contains('active')&&Array.isArray(S.qs),null,25000);
    check('Elle voit bien la campagne du Fournil (ville « Le Mans ») bien qu\'elle habite Allonnes',await p.evaluate(()=>S.qs.some(q=>q._firestoreId==='c1')));
    await p.evaluate(()=>{goNav('profile');refreshProfile();});await sleep(300);
    const prof=await p.$eval('#set-u-city',e=>e.textContent);
    check('Son profil affiche toujours « Allonnes », jamais « le-mans »',prof==='Allonnes',prof);
    check('Aucune erreur JavaScript',errs.length===0,errs);
    await ctx.close();
  });

  await T('inscription commerçant à Yvré-l\'Évêque : rattaché à la zone du Mans',async()=>{
    const ctx=await browser.createBrowserContext();const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.setViewport({width:1200,height:1000});
    await p.evaluateOnNewDocument(()=>{try{localStorage.setItem('nv_pro_intro','1');}catch(e){}});
    await p.goto(DASH,{waitUntil:'load'});await wf(p,()=>document.getElementById('auth-wall').style.display==='flex',null,30000);
    await p.evaluate(()=>awTab('register'));
    await setVal(p,'#aw-siret','73282932000074');await setVal(p,'#aw-brand','Le Petit Atelier');await setVal(p,'#aw-sector','Boulangerie');
    await setVal(p,"#aw-city","Yvré-l'Évêque");await setVal(p,'#aw-address','1 rue de la Mairie');
    await p.evaluate(()=>awSubmit());await sleep(500);
    await setVal(p,'#aw-firstname','Sam');await setVal(p,'#aw-lastname','D');await setVal(p,'#aw-phone','0612345678');
    await setVal(p,'#aw-email','yvre@t.fr');await setVal(p,'#aw-pass','secret123');
    await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('verif-banner').style.display==='block',null,25000);
    const uid=await p.evaluate(()=>auth.currentUser.uid);
    const m=(await db.doc('merchants/'+uid).get()).data();
    check('Commerçant créé : city = « le-mans » (zone), cityLabel = « Yvré-l\'Évêque » (ce qu\'il a tapé)',m.city==='le-mans'&&m.cityLabel==="Yvré-l'Évêque",m);
    check('Aucune erreur JavaScript',errs.length===0,errs);
    await ctx.close();
  });

  await T('auto-canonicalisation : un compte déjà enregistré sous l\'ancien nom de commune se corrige tout seul',async()=>{
    await db.doc('users/oldu').set({role:'user',welcomeClaimed:true,name:'Ancien',city:'allonnes',cityLabel:'Allonnes',authorizedMerchants:[],friendUids:[],answeredCampaigns:[],points:0,xp:0,streak:0,interests:[],onboardingStep:'done',seenHomeTour:true});
    await aauth.createUser({uid:'oldu',email:'oldu@t.fr',password:'secret123'});
    const ctx=await browser.createBrowserContext();const p=await ctx.newPage();
    await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','oldu@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user,null,25000);
    await sleep(1500);
    check('city corrigé en « le-mans » à la première connexion, sans script de migration',(await db.doc('users/oldu').get()).data().city==='le-mans');
    await ctx.close();
  });

  await browser.close();
  console.log('\n'+pass+' ok, '+fail+' échec(s)');process.exit(fail?1:0);
})();
