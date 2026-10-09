// Compte commerçant NOOVA : l'admin coche « Diffuser dans toutes les villes » ; ses questions déjà publiées passent à
// toutes les villes et arrivent dans l'onglet « NOOVA » de l'app (habitants du Mans comme d'Angers). Décocher les rend à sa ville.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();const {Timestamp}=admin.firestore;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const wf=(p,fn,t=30000)=>p.waitForFunction(fn,{timeout:t,polling:200});
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
(async()=>{
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});
  // Compte NOOVA créé comme un commerçant (Google), vérifié par l'admin, une question publiée avant la diffusion.
  await db.doc('merchants/nv').set({role:'merchant',ownerUid:'nv',brandName:'NOOVA',name:'NOOVA',sector:'Application',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:'noova@t.fr'});
  await db.doc('campaigns/q1').set({merchantId:'nv',merchantName:'NOOVA',status:'active',targetCity:'le-mans',city:'le-mans',cityLabel:'Le Mans',question:'Tu nous recommandes à un ami ?',questions:[{q:'Tu nous recommandes à un ami ?',format:'mcq',options:['Oui','Non']}],createdAt:Timestamp.now()});
  await db.doc('campaigns/q0').set({merchantId:'nv',merchantName:'NOOVA',status:'ended',targetCity:'le-mans',city:'le-mans',question:'Ancienne',questions:[{q:'Ancienne',format:'mcq',options:['A','B']}],createdAt:Timestamp.now()});
  for(const [u,c,l] of [['lm','le-mans','Le Mans'],['an','angers','Angers']]){
    await db.doc('users/'+u).set({role:'user',name:'U '+u,email:u+'@t.fr',city:c,cityLabel:l,welcomeClaimed:true,onboardingStep:'done',seenHomeTour:true,authorizedMerchants:[],answeredCampaigns:[],points:0,xp:0,streak:0,ageRange:'25-34',interests:['restauration'],friendUids:[]});
    await aauth.createUser({uid:u,email:u+'@t.fr',password:'secret123'});
  }
  await aauth.createUser({uid:'adm',email:'tomussproduction@gmail.com',password:'secret123',emailVerified:true});
  const b=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:'new',args:['--no-sandbox']});
  const errs=[];
  try{
    const a=await b.newPage();a.on('pageerror',e=>errs.push(e.message));await a.setViewport({width:1280,height:900});
    await a.goto('http://localhost:8950/admin.html',{waitUntil:'load'});await sleep(1200);
    await a.evaluate(async()=>{await auth.signInWithEmailAndPassword('tomussproduction@gmail.com','secret123');});
    await wf(a,()=>document.getElementById('main').style.display==='block');
    await a.evaluate(async()=>{const el=document.createElement('input');el.type='checkbox';el.checked=true;await saveMerchantBroadcast('nv',el);});
    const q1=(await db.doc('campaigns/q1').get()).data(),q0=(await db.doc('campaigns/q0').get()).data();
    check('Diffusion cochée : la question publiée passe à toutes les villes',q1.targetCity==='toutes'&&q1.broadcast===true&&q1.cityLabel==='Toutes les villes',q1);
    check('Une question terminée n\'est pas touchée',q0.targetCity==='le-mans'&&!q0.broadcast,q0);
    check('Compte marqué « diffusion »',(await db.doc('merchants/nv').get()).data().broadcast===true);
    // Vitrine publique recopiée par le serveur (avec broadcast)
    for(let i=0;i<40;i++){const d=await db.doc('merchantsPublic/nv').get();if(d.exists&&d.data().broadcast===true)break;await sleep(250);}
    for(const [u,lbl] of [['lm','Le Mans'],['an','Angers']]){
      const ctx=await b.createBrowserContext();const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
      await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
      await p.goto('http://localhost:8950/app.html',{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'));
      await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email',u+'@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
      await wf(p,()=>document.getElementById('home').classList.contains('active')&&document.querySelectorAll('#hm-feed-noova .hq-card').length>0,30000).catch(()=>{});
      const r=await p.evaluate(()=>({noova:[...document.querySelectorAll('#hm-feed-noova .hq-card')].map(c=>c.textContent),q:[...document.querySelectorAll('#hm-feed-q .hq-card')].map(c=>c.textContent)}));
      check(`Habitant de ${lbl} : la question du compte NOOVA est dans l'onglet « NOOVA », pas dans « Questions »`,r.noova.some(t=>/recommandes/.test(t))&&!r.q.some(t=>/recommandes/.test(t)),r);
      await ctx.close();
    }
    await a.evaluate(async()=>{const el=document.createElement('input');el.type='checkbox';el.checked=false;await saveMerchantBroadcast('nv',el);});
    const back=(await db.doc('campaigns/q1').get()).data();
    check('Diffusion décochée : la question revient à la ville du commerce',back.targetCity==='le-mans'&&back.broadcast===false&&back.cityLabel==='Le Mans',back);
  }catch(e){fail++;console.log('FAIL exception -> '+String(e.stack||e).slice(0,300));}
  check('Aucune erreur JavaScript',errs.length===0,errs);
  await b.close();
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(fail?1:0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
