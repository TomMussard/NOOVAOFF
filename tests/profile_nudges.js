// Relances « profil incomplet » : cloche + notification avec un bouton qui ouvre le bon écran ; une par jour, 3 jours entre
// deux relances du même manque, 3 au plus ; jamais le jour de l'inscription ; carte « Profils incomplets » de l'admin.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();const {Timestamp}=admin.firestore;
const PN=require(__dirname+'/../functions/profileNudges.js')._t;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const DAY=86400000;
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,3).join(' | '));}};
const wf=(p,fn,t=30000)=>p.waitForFunction(fn,{timeout:t,polling:200});
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const AUTH='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake';
const idTokenOf=async(email)=>(await (await fetch(AUTH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'secret123',returnSecureToken:true})})).json()).idToken;
const call=async(name,data,token)=>{const r=await fetch('http://127.0.0.1:5001/noova-366d0/europe-west1/'+name,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({data})});const j=await r.json();if(j.error)throw new Error(j.error.message);return j.result;};
const sink=async(uid)=>(await db.collection('_pushSink').where('uid','==',uid).get()).docs.map(d=>d.data());
(async()=>{
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});
  const old=Timestamp.fromMillis(Date.now()-5*DAY);
  const U=(uid,o)=>db.doc('users/'+uid).set({role:'user',name:'U '+uid,email:uid+'@t.fr',city:'le-mans',cityLabel:'Le Mans',welcomeClaimed:true,onboardingStep:'done',seenHomeTour:true,authorizedMerchants:[],answeredCampaigns:[],points:0,xp:0,streak:0,ageRange:'25-34',interests:['restauration'],friendUids:[],fcmTokens:['tok_'+uid],createdAt:old,...o});
  await U('a',{ageRange:''});                       // âge manquant, notifications activées
  await U('b',{fcmTokens:[]});                       // notifications pas activées
  await U('c',{});                                   // complet
  await U('d',{ageRange:'',createdAt:Timestamp.now()});   // inscrit aujourd'hui
  await U('e',{interests:[],ageRange:''});           // âge ET centres d'intérêt : une seule relance par jour
  for(const u of ['a','b','c','d','e'])await aauth.createUser({uid:u,email:u+'@t.fr',password:'secret123'});
  await aauth.createUser({uid:'adm',email:'tomussproduction@gmail.com',password:'secret123',emailVerified:true});

  await T('relance depuis l\'admin',async()=>{
    check('Réservé aux admins',/administrateurs/.test(await call('adminProfileNudges',{},await idTokenOf('c@t.fr')).then(()=>'',e=>e.message)));
    const r=await call('adminProfileNudges',{},await idTokenOf('tomussproduction@gmail.com'));
    check('3 relances : a (âge), b (notifications), e (âge d\'abord) ; ni le profil complet, ni l\'inscrit du jour',r.sent===3&&r.byKey.age===2&&r.byKey.notifs===1,r);
    const bell=(await db.doc('users/a/notifications/profil_age').get()).data();
    check('Cloche : ligne « âge » avec le bouton vers le bon écran',bell&&bell.type==='profil'&&bell.fix==='fix-age'&&bell.read===false,bell);
    const sa=await sink('a');
    check('Notification sur le téléphone, qui ouvre l\'écran de l\'âge',sa.length===1&&sa[0].ntype==='profil'&&/go=fix-age/.test(sa[0].url),sa.map(x=>[x.ntype,x.url]));
    check('Notifications pas activées : relance dans la cloche seulement',(await db.doc('users/b/notifications/profil_notifs').get()).exists&&(await sink('b')).length===0);
    check('Rien pour le profil complet ni pour l\'inscrit du jour',!(await db.collection('users/c/notifications').get()).size&&!(await db.collection('users/d/notifications').get()).size);
    const r2=await call('adminProfileNudges',{},await idTokenOf('tomussproduction@gmail.com'));
    check('Relancer une 2e fois le même jour : personne (une relance par jour au plus)',r2.sent===0,r2);
  });

  await T('relances automatiques : 3 jours d\'écart, 3 fois au plus',async()=>{
    const t0=Date.now();
    let r=await PN.runNudges({now:t0+1*DAY});
    check('Le lendemain : pas de 2e relance « âge » pour a (3 jours d\'écart) ; d (inscrit la veille) reçoit sa 1re, e une relance pour un autre manque',r.byKey.age===1&&r.byKey.interests===1&&(await db.doc('users/a').get()).data().profileNudges.age.n===1&&(await db.doc('users/d').get()).data().profileNudges.age.n===1,r);
    r=await PN.runNudges({now:t0+2*DAY});
    check('Le surlendemain : personne',r.sent===0,r);
    r=await PN.runNudges({now:t0+3*DAY+3600000});
    check('3 jours après : 2e relance « âge »',r.byKey.age>=1&&((await db.doc('users/a').get()).data().profileNudges.age.n===2),r);
    await PN.runNudges({now:t0+6*DAY+7200000});
    await PN.runNudges({now:t0+9*DAY+10800000});
    check('Jamais plus de 3 relances pour le même manque',(await db.doc('users/a').get()).data().profileNudges.age.n===3);
  });

  const b=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:'new',args:['--no-sandbox']});
  const errs=[];
  await T('app : le bouton de la cloche ouvre le bon écran, la ligne disparaît une fois fait',async()=>{
    await db.doc('users/a').update({'profileNudges.lastAt':0});
    const p=await b.newPage();p.on('pageerror',e=>errs.push(e.message));await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    await p.goto('http://localhost:8950/app.html',{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'));
    await p.evaluate(()=>{try{localStorage.setItem('nv_pop_seen_a',String(Date.now()));}catch(e){}showAuthWall('login');});
    await setVal(p,'#aw-email','a@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active'));
    // Les pop-ups d'ouverture (âge manquant) peuvent passer d'abord : on les ferme.
    await sleep(2500);await p.evaluate(()=>{const w=document.getElementById('cat-wall');if(w&&w.style.display==='flex'&&typeof closeCategoryWall==='function')closeCategoryWall();document.querySelectorAll('.nv-modal').forEach(m=>{m.style.display='none';});});
    await p.evaluate(()=>document.getElementById('notif-panel').classList.add('open'));
    await wf(p,()=>{renderNotifications();return [...document.querySelectorAll('#notif-list .notif-item')].some(n=>/âge/.test(n.textContent));},15000);
    const btn=await p.evaluate(()=>{const it=[...document.querySelectorAll('#notif-list .notif-item')].find(n=>/âge/.test(n.textContent));return it.querySelector('.notif-btn').textContent;});
    check('Ligne de la cloche avec le bouton « Indiquer mon âge »',btn==='Indiquer mon âge',btn);
    await p.evaluate(()=>{const it=[...document.querySelectorAll('#notif-list .notif-item')].find(n=>/âge/.test(n.textContent));it.querySelector('.notif-btn').click();});
    await wf(p,()=>document.getElementById('cat-wall').style.display==='flex',8000);
    check('Le bouton ouvre l\'écran de l\'âge (âge seul)',await p.evaluate(()=>document.getElementById('cat-age-wrap').style.display!=='none'&&document.getElementById('cat-int-wrap').style.display==='none'));
    await p.evaluate(()=>{document.querySelector('#cat-age-grid [data-age="25-34"]').click();saveCategories();});
    await wf(p,()=>!!S._age,10000);await p.evaluate(()=>renderNotifications());
    check('Une fois l\'âge indiqué, la relance disparaît de la cloche',await p.evaluate(()=>![...document.querySelectorAll('#notif-list .notif-item')].some(n=>/âge/.test(n.textContent))));
    // Ouverture depuis une notification : go=fix-interests
    await db.doc('users/a').update({interests:[]});await wf(p,()=>!(S._interests||[]).length,10000);
    await p.evaluate(()=>{try{sessionStorage.setItem('nv_open',JSON.stringify({nid:'x',go:'fix-interests'}));}catch(e){}flushNotifOpen();});
    await wf(p,()=>document.getElementById('cat-wall').style.display==='flex'&&document.getElementById('cat-int-wrap').style.display!=='none',8000);
    check('Notification « centres d\'intérêt » : ouvre directement le choix des centres d\'intérêt',true);
    await p.close();
  });

  await T('admin : carte « Profils incomplets »',async()=>{
    const a=await b.newPage();a.on('pageerror',e=>errs.push(e.message));await a.setViewport({width:1280,height:900});
    await a.goto('http://localhost:8950/admin.html',{waitUntil:'load'});await sleep(1200);
    await a.evaluate(async()=>{await auth.signInWithEmailAndPassword('tomussproduction@gmail.com','secret123');});
    await wf(a,()=>document.getElementById('main').style.display==='block');
    await a.evaluate(()=>{const b=[...document.querySelectorAll('.tab-btn-main')].find(x=>/Utilisateurs/.test(x.textContent));b.click();});
    await wf(a,()=>/sans notifications/.test(document.getElementById('nudge-rows').textContent),20000);
    const t=await a.$eval('#nudge-rows',e=>e.textContent.replace(/\s+/g,' '));
    check('Compte par manque, avec un bouton « Relancer »',/1 sans notifications/.test(t)&&/Relancer/.test(t),t);
    await a.close();
  });
  check('Aucune erreur JavaScript',errs.length===0,errs);
  await b.close();
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(fail?1:0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
