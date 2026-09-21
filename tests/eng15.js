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

const T3=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e).slice(0,300));}};
// Pilote la page « fournisseur d'identité » de l'émulateur d'authentification (à la place de la page Apple)
async function idp(pg,mode){
  await pg.bringToFront();
  await pg.waitForSelector('#add-account-button',{timeout:20000});
  if(mode==='new'){const n=++__acc;
    await pg.click('#add-account-button button');await sleep(1200);await pg.waitForSelector('#email-input',{timeout:10000});
    for(let k=0;k<8;k++){await pg.evaluate(()=>{document.getElementById('email-input').value='';document.getElementById('display-name-input').value='';});await pg.click('#email-input',{clickCount:3}).catch(()=>{});await pg.type('#email-input','apple'+n+'@privaterelay.test');await pg.click('#display-name-input',{clickCount:3}).catch(()=>{});await pg.type('#display-name-input','Camille Apple '+n);if(await pg.evaluate(()=>document.getElementById('email-input').value&&document.getElementById('display-name-input').value))break;await sleep(600);}
    await sleep(300);await pg.click('#sign-in');}
  else{await pg.click('#accounts-list ul li:not(#add-account-button)');}
}
let __acc=0;
const popupPage=b=>b.waitForTarget(t=>t.type()==='page'&&/emulator\/auth\/handler/.test(t.url()),{timeout:20000}).then(t=>t.page());
const openApp=async(browser,q='')=>{const ctx=await browser.createBrowserContext();const p=await ctx.newPage();await p.setViewport({width:1000,height:800});p.__errs=[];p.on('pageerror',e=>p.__errs.push(e.message));await p.goto(APP+q,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);return p;};
(async()=>{
  await wipe();
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  let p;
  await T3('bouton',async()=>{
    p=await openApp(browser);
    for(const tab of ['register','login']){
      await p.evaluate(t=>showAuthWall(t),tab);await sleep(400);
      const b=await p.evaluate(()=>{const a=document.getElementById('aw-apple-btn'),g=document.querySelector('#auth-wall button[onclick*="signInWithGoogle"]');const q=x=>{const r=x.getBoundingClientRect(),c=getComputedStyle(x);return {w:Math.round(r.width),h:Math.round(r.height),bg:c.backgroundColor,fg:c.color,vis:r.height>0&&c.visibility!=='hidden'&&c.display!=='none'};};return {a:q(a),g:q(g),label:a.getAttribute('aria-label'),txt:a.textContent.trim(),svg:!!a.querySelector('svg[aria-hidden=true]')};});
      check('Écran « '+tab+' » : bouton « Continuer avec Apple » visible, noir avec texte blanc, aussi grand que celui de Google',b.a.vis&&b.a.bg==='rgb(0, 0, 0)'&&b.a.fg==='rgb(255, 255, 255)'&&b.a.w===b.g.w&&b.a.h>=44&&b.a.h>=b.g.h-2&&/Continuer avec Apple/.test(b.txt)&&b.label==='Continuer avec Apple'&&b.svg,b);
    }
    check('Messages d\'erreur en français pour les cas Apple/Google (compte existant, méthode non activée, réseau)',await p.evaluate(()=>['auth/account-exists-with-different-credential','auth/operation-not-allowed','auth/network-request-failed'].every(c=>awFrErr(c)!=='Erreur. Réessaie.')&&/pas encore disponible/.test(awFrErr('auth/operation-not-allowed'))));
  });
  await T3('popup nouveau compte',async()=>{
    await p.evaluate(()=>showAuthWall('register'));await sleep(300);
    const pp=popupPage(browser);
    await p.evaluate(()=>document.getElementById('aw-apple-btn').click());
    const pop=await pp;
    const url=pop.url();
    check('Le bouton ouvre bien la connexion du fournisseur « apple.com » avec les autorisations e-mail et nom',/providerId=apple\.com/.test(url)&&/scopes=email%2Cname/.test(url),url);
    await idp(pop,'new');
    await wf(p,()=>document.getElementById('google-city-wall').style.display==='flex',null,20000);
    const u=(await aauth.listUsers()).users.find(x=>x.providerData.some(d=>d.providerId==='apple.com'));
    check('Compte Apple créé côté authentification (fournisseur apple.com)',!!u,u&&u.providerData);
    const doc=u&&(await db.doc('users/'+u.uid).get()).data();
    check('Nouveau compte : profil créé à zéro (role user, 0 point, 0 NOOV, ville vide) et page « Dernière étape » affichée',doc&&doc.role==='user'&&doc.points===0&&doc.xp===0&&doc.city===''&&doc.email===u.email&&doc.authorizedMerchants.length===0,doc);
    check('Pas d\'accueil ni de didacticiel avant la ville (le mur reste au premier plan)',await p.evaluate(()=>!document.getElementById('home').classList.contains('active')));
    await setVal(p,'#gcw-city','Le Mans');
    await p.evaluate(()=>saveGoogleCity());
    await wf(p,()=>document.getElementById('google-city-wall').style.display==='none',null,20000);
    const doc2=(await db.doc('users/'+u.uid).get()).data();
    check('« Dernière étape » enregistrée : ville sur le profil, l\'inscription continue (étape suivante « catégories »)',/mans/i.test(doc2.city||'')&&doc2.onboardingStep==='categories',{city:doc2.city,step:doc2.onboardingStep});
    check('Aucune erreur JavaScript pendant le parcours',p.__errs.length===0,p.__errs);
    global.__uid=u.uid;
    await db.doc('users/'+u.uid).update({onboardingStep:'done',seenHomeTour:true,interests:['sport']});
    await p.evaluate(()=>auth.signOut());await sleep(1500);
  });
  await T3('popup compte existant',async()=>{
    await p.evaluate(()=>showAuthWall('login'));await sleep(300);
    const pp=popupPage(browser);
    await p.evaluate(()=>document.getElementById('aw-apple-btn').click());
    const pop=await pp;await idp(pop,'existing');
    await wf(p,()=>S&&S.user&&S.user.uid&&document.getElementById('bnav').classList.contains('show'),null,25000);
    check('Compte existant : retour direct dans l\'app (aucune page « Dernière étape »)',await p.evaluate(u=>S.user.uid===u&&document.getElementById('google-city-wall').style.display!=='flex',global.__uid));
    await p.evaluate(()=>auth.signOut());await sleep(1500);
  });
  await T3('popup fermée',async()=>{
    await p.evaluate(()=>showAuthWall('login'));await sleep(300);
    const pp=popupPage(browser);
    await p.evaluate(()=>document.getElementById('aw-apple-btn').click());
    const pop=await pp;await pop.close();await sleep(2500);
    check('Fenêtre Apple fermée par l\'utilisateur : aucun message d\'erreur, on reste sur l\'écran de connexion',await p.evaluate(()=>{const e=document.getElementById('aw-err');return (!e||e.style.display==='none'||!e.textContent.trim())&&document.getElementById('auth-wall').style.display!=='none';}));
    await p.browserContext().close();
  });
  await T3('fenêtre bloquée',async()=>{
    // iPhone en mode application / bloqueur de fenêtres : window.open renvoie null
    p=await openApp(browser);
    await p.evaluate(()=>{window.open=()=>null;showAuthWall('register');});await sleep(300);
    await p.evaluate(()=>document.getElementById('aw-apple-btn').click());await sleep(2500);
    const r=await p.evaluate(()=>{const e=document.getElementById('aw-err');return {txt:e.textContent,shown:e.style.display!=='none',skip:_skipNextAuth,wall:document.getElementById('auth-wall').style.display};});
    check('Fenêtre bloquée : message clair en français (autoriser les fenêtres / utiliser l\'email), on reste sur l\'écran de connexion',r.shown&&/fenêtre de connexion/.test(r.txt)&&/email/.test(r.txt)&&r.wall!=='none'&&r.skip===false,r);
    check('Fenêtre bloquée : aucune redirection, aucune erreur JavaScript',!/emulator\/auth\/handler/.test(p.url())&&p.__errs.length===0,p.__errs);
    await p.browserContext().close();
  });
  await browser.close();
  console.log('\n'+pass+' ok, '+fail+' échec(s)');process.exit(fail?1:0);
})();
