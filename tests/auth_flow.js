// Inscription, connexion, session gardée, déconnexion, cookies refusés, et les cas qui donnaient « Erreur. Réessaie. » :
//  - mot de passe refusé par les règles réglées dans Firebase (minuscule, majuscule, chiffre, caractère spécial) ;
//  - compte créé mais fiche non enregistrée (réseau coupé) ;
//  - compte sans fiche ou sans ville (inscription interrompue).
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,3).join(' | '));}};
const wf=(p,fn,arg,t=25000)=>p.waitForFunction(fn,{timeout:t,polling:200},arg);
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const CHROME=(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const APP='http://localhost:8950/app.html',DASH='http://localhost:8950/dash.html';
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
// Les règles de la vraie base (lues le 9 octobre 2026) : 6 caractères, minuscule, majuscule, chiffre, caractère spécial.
const PROD_POLICY=()=>{auth.validatePassword=async v=>{const s={passwordPolicy:{customStrengthOptions:{minPasswordLength:6}},meetsMinPasswordLength:v.length>=6,containsLowercaseLetter:/[a-z]/.test(v),containsUppercaseLetter:/[A-Z]/.test(v),containsNumericCharacter:/[0-9]/.test(v),containsNonAlphanumericCharacter:/[\^$*.\[\]{}()?"!@#%&\/\\,><':;|_~`-]/.test(v)};s.isValid=['meetsMinPasswordLength','containsLowercaseLetter','containsUppercaseLetter','containsNumericCharacter','containsNonAlphanumericCharacter'].every(k=>s[k]);return s;};};
const onboard=p=>wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
const home=p=>wf(p,()=>document.getElementById('home').classList.contains('active')&&document.getElementById('auth-wall').style.display==='none',null,25000);
// La déconnexion recharge la page : on attend le rechargement avant de surveiller l'écran.
async function logoutWait(p){await Promise.all([p.waitForNavigation({waitUntil:'load',timeout:20000}),p.evaluate(()=>logout())]);await onboard(p);}
async function finishCats(p){
  await wf(p,()=>document.getElementById('cat-wall').style.display==='flex',null,20000);
  await p.evaluate(()=>{document.querySelector('#cat-grid [data-cat=all]').click();document.querySelector('#cat-age-grid [data-age="25-34"]').click();saveCategories();});
  await home(p);
}

(async()=>{
  await wipe();
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const ctx=await browser.createBrowserContext();
  let p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});

  await T('inscription : règles du mot de passe affichées et vérifiées avant l\'envoi',async()=>{
    await p.goto(APP,{waitUntil:'load'});await onboard(p);
    await p.evaluate(PROD_POLICY);
    await p.evaluate(()=>showAuthWall('register'));await sleep(300);
    const rules=await p.$$eval('#pw-rules li',l=>l.map(x=>x.textContent));
    check('La liste des règles est visible dès l\'onglet « Créer un compte »',rules.length===5&&rules.join().includes('une majuscule')&&rules.join().includes('caractère spécial'),rules);
    await setVal(p,'#aw-name','Léa');await setVal(p,'#aw-city','Le Mans');await setVal(p,'#aw-email','lea@t.fr');await setVal(p,'#aw-pass','secret123');await sleep(300);
    const ok=await p.$$eval('#pw-rules li.ok',l=>l.map(x=>x.textContent));
    check('« secret123 » : longueur, minuscule et chiffre cochés, pas la majuscule ni le caractère spécial',ok.length===3&&!ok.join().includes('majuscule'),ok);
    await p.evaluate(()=>awSubmit());await sleep(600);
    const err=await p.$eval('#aw-err',e=>e.offsetParent?e.textContent:'');
    check('Message clair : ce qui manque est nommé (plus de « Erreur. Réessaie. »)',/une majuscule/.test(err)&&/caractère spécial/.test(err)&&!/Erreur\. Réessaie/.test(err),err);
    check('Aucun compte créé',(await aauth.listUsers()).users.length===0);
    check('Code inconnu : le code est montré pour qu\'on puisse le signaler',await p.evaluate(()=>awFrErr('auth/internal-error')).then(t=>/internal-error/.test(t)));
    check('Refus des règles par Firebase traduit',await p.evaluate(()=>awFrErr('auth/password-does-not-meet-requirements')).then(t=>/trop simple/.test(t)));
    await setVal(p,'#aw-pass','Secret12!');await sleep(300);
    check('« Secret12! » : toutes les règles cochées',await p.$$eval('#pw-rules li.ok',l=>l.length)===5);
    await p.evaluate(()=>awSubmit());
    await finishCats(p);
    const uid=await p.evaluate(()=>auth.currentUser.uid);
    const u=(await db.doc('users/'+uid).get()).data();
    check('Compte créé avec sa fiche (ville du Mans, e-mail)',u&&u.city==='le-mans'&&u.email==='lea@t.fr'&&u.role==='user',u);
  });

  await T('session gardée : rechargement et réouverture sans se reconnecter',async()=>{
    await p.reload({waitUntil:'load'});await home(p);
    check('Après rechargement : directement sur l\'accueil, même compte',await p.evaluate(()=>auth.currentUser&&auth.currentUser.email)==='lea@t.fr');
    await p.close();
    p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    await p.goto(APP,{waitUntil:'load'});await home(p);
    check('Nouvel onglet (app rouverte) : toujours connectée',await p.evaluate(()=>auth.currentUser&&auth.currentUser.email)==='lea@t.fr');
  });

  await T('déconnexion puis connexion',async()=>{
    await logoutWait(p);
    check('Déconnectée : écran d\'accueil des nouveaux',await p.evaluate(()=>!auth.currentUser));
    await p.evaluate(()=>showAuthWall('login'));await sleep(200);
    check('Onglet connexion : pas de liste de règles, saisie « mot de passe actuel »',await p.evaluate(()=>document.getElementById('pw-rules').hidden&&document.getElementById('aw-pass').autocomplete==='current-password'));
    await setVal(p,'#aw-email','lea@t.fr');await setVal(p,'#aw-pass','mauvais1!A');
    await p.evaluate(()=>awSubmit());await wf(p,()=>document.getElementById('aw-err').offsetParent!==null,null,10000);
    const err=await p.$eval('#aw-err',e=>e.textContent);
    check('Mauvais mot de passe : message clair',/incorrect/.test(err),err);
    await setVal(p,'#aw-email','  lea@t.fr ');await setVal(p,'#aw-pass','Secret12!');
    await p.evaluate(()=>awSubmit());await home(p);
    check('Bon mot de passe (espaces autour de l\'e-mail ignorés) : accueil',true);
    await logoutWait(p);
  });

  await T('mot de passe oublié',async()=>{
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','lea@t.fr');
    await p.evaluate(()=>awForgotPassword());await sleep(1500);
    const t=await p.evaluate(()=>{const e=document.getElementById('aw-err');return (e.offsetParent?e.textContent:'')+' '+document.getElementById('aw-forgot').textContent;});
    check('Lien de réinitialisation envoyé, sans erreur',/un email a été envoyé/.test(t)&&!/Erreur|erreur est survenue/.test(t),t);
  });

  await T('compte sans fiche (inscription interrompue) : terminé sur « Dernière étape »',async()=>{
    await aauth.createUser({uid:'orphan',email:'orphan@t.fr',password:'Secret12!'});
    await p.goto(APP,{waitUntil:'load'});await onboard(p);
    await p.evaluate(()=>showAuthWall('login'));
    await setVal(p,'#aw-email','orphan@t.fr');await setVal(p,'#aw-pass','Secret12!');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('google-city-wall').style.display==='flex',null,15000);
    check('Écran « Dernière étape » au lieu d\'un accueil vide',true);
    await setVal(p,'#gcw-city','Le Mans');await p.evaluate(()=>saveGoogleCity());
    await finishCats(p);
    const u=(await db.doc('users/orphan').get()).data();
    check('Fiche créée (habitant du Mans, e-mail, nom tiré de l\'e-mail)',u&&u.role==='user'&&u.city==='le-mans'&&u.email==='orphan@t.fr'&&u.name==='orphan',u);
    await logoutWait(p);
  });

  await T('compte créé mais fiche non enregistrée (réseau coupé) : pas bloqué',async()=>{
    await p.evaluate(PROD_POLICY);
    await p.evaluate(()=>{const ref=firebase.firestore.DocumentReference.prototype,o=ref.set;ref.set=function(...a){if(this.path.startsWith('users/')&&!window._failOnce){window._failOnce=1;return Promise.reject(Object.assign(new Error('offline'),{code:'unavailable'}));}return o.apply(this,a);};});
    await p.evaluate(()=>showAuthWall('register'));
    await setVal(p,'#aw-name','Max');await setVal(p,'#aw-city','Le Mans');await setVal(p,'#aw-email','max@t.fr');await setVal(p,'#aw-pass','Secret12!');
    await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('google-city-wall').style.display==='flex',null,15000);
    check('Fiche refusée : l\'inscription continue sur « Dernière étape » (pas « e-mail déjà utilisé » au prochain essai)',true);
    await setVal(p,'#gcw-city','Le Mans');await p.evaluate(()=>saveGoogleCity());
    await finishCats(p);
    const uid=await p.evaluate(()=>auth.currentUser.uid);
    const u=(await db.doc('users/'+uid).get()).data();
    check('Fiche finalement créée',u&&u.city==='le-mans'&&u.email==='max@t.fr',u);
    await logoutWait(p);
  });

  await T('Google interrompu (fiche sans ville) : ville redemandée à la reconnexion',async()=>{
    await aauth.createUser({uid:'gnocity',email:'g@t.fr',password:'Secret12!'});
    await db.doc('users/gnocity').set({role:'user',name:'Gil',email:'g@t.fr',city:'',cityLabel:'',points:0,xp:0,streak:0,interests:[],onboardingStep:'merchants'});
    await p.evaluate(()=>showAuthWall('login'));
    await setVal(p,'#aw-email','g@t.fr');await setVal(p,'#aw-pass','Secret12!');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('google-city-wall').style.display==='flex',null,15000);
    check('Ville redemandée',true);
    await setVal(p,'#gcw-city','Le Mans');await p.evaluate(()=>saveGoogleCity());
    await finishCats(p);
    check('Ville enregistrée sans toucher au reste',(await db.doc('users/gnocity').get()).data().name==='Gil');
    await logoutWait(p);
  });

  await T('cookies refusés : inscription et connexion fonctionnent',async()=>{
    const c2=await browser.createBrowserContext();const q=await c2.newPage();q.on('pageerror',e=>errs.push(e.message));
    await q.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    await q.goto(APP+'?noconsent',{waitUntil:'load'});await onboard(q);
    await wf(q,()=>!!document.querySelector('[data-nvc=no]'),null,10000);
    await q.click('[data-nvc=no]');await sleep(300);
    check('Bandeau cookies : « Refuser » enregistré',await q.evaluate(()=>JSON.parse(localStorage.getItem('nv_consent')||'{}').analytics===false));
    await q.evaluate(()=>showAuthWall('register'));
    await setVal(q,'#aw-name','Zoé');await setVal(q,'#aw-city','Le Mans');await setVal(q,'#aw-email','zoe@t.fr');await setVal(q,'#aw-pass','Secret12!');
    await q.evaluate(()=>awSubmit());await finishCats(q);
    await q.reload({waitUntil:'load'});await home(q);
    check('Cookies refusés : compte créé et session gardée après rechargement',await q.evaluate(()=>auth.currentUser&&auth.currentUser.email)==='zoe@t.fr');
    await c2.close();
  });

  await T('tableau de bord commerçant : refus des règles traduit',async()=>{
    const d=await ctx.newPage();await d.goto(DASH,{waitUntil:'load'});await sleep(800);
    const t=await d.evaluate(()=>awFrErr('auth/password-does-not-meet-requirements'));
    check('Message commerçant : ce qu\'il faut dans le mot de passe',/majuscule/.test(t)&&/caractère spécial/.test(t),t);
    await d.close();
  });

  check('Aucune erreur JavaScript',errs.length===0,errs);
  await browser.close();
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(fail?1:0);
})();
