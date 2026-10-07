// Pop-ups d'ouverture : centrées, l'app figée dessous (inert), croix pour fermer ; enchaînées par priorité (profil
// incomplet, demande d'ami, messages non lus, nouvel ami, nouveau commerce), 3 au plus par ouverture.
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
const APP='http://localhost:8950/app.html';
const base={role:'user',city:'le-mans',cityLabel:'Le Mans',welcomeClaimed:true,onboardingStep:'done',seenHomeTour:true,authorizedMerchants:[],answeredCampaigns:[],points:0,xp:0,streak:0};
const popShown=()=>{const v=[...document.querySelectorAll('.nv-modal')].filter(m=>m.style.display==='flex');if(v.length!==1)return null;
  const c=v[0].querySelector('.nv-modal-card').getBoundingClientRect();
  return {id:v[0].id,t:v[0].textContent.replace(/\s+/g,' ').trim().slice(0,400),inert:[...document.getElementById('app').children].some(c=>c.inert)&&!v[0].inert&&!v[0].closest('[inert]'),
    centered:Math.abs((c.left+c.right)/2-innerWidth/2)<4&&Math.abs((c.top+c.bottom)/2-innerHeight/2)<innerHeight*0.12,
    x:!!v[0].querySelector('.nv-modal-x')&&getComputedStyle(v[0].querySelector('.nv-modal-x')).display!=='none'};};
(async()=>{
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);
  await db.doc('users/me').set({...base,name:'Moi',email:'me@t.fr',interests:[],friendUids:['cle','dan']});
  await db.doc('users/ben').set({...base,name:'Ben',email:'ben@t.fr',ageRange:'25-34',interests:['sport'],friendUids:['me']});
  await db.doc('users/cle').set({...base,name:'Clé',email:'cle@t.fr',ageRange:'25-34',interests:['sport'],friendUids:['me']});
  await db.doc('users/dan').set({...base,name:'Dan',email:'dan@t.fr',ageRange:'25-34',interests:['sport'],friendUids:['me']});
  for(const u of ['me','ben','cle','dan'])await aauth.createUser({uid:u,email:u+'@t.fr',password:'secret123'});
  await db.doc('users/me/notifications/friendreq_ben').set({type:'friend_request',fromUid:'ben',fromName:'Ben',read:false,createdAt:Timestamp.now()});
  await db.doc('users/me/notifications/friendacc_dan').set({type:'friend_accepted',fromUid:'dan',fromName:'Dan',read:false,createdAt:Timestamp.now()});
  await db.doc('chats/cle_me').set({participants:{cle:true,me:true}});
  await db.doc('chats/cle_me/messages/a').set({fromUid:'cle',text:'On se voit ce soir ?',createdAt:Timestamp.now()});
  await sleep(3000);
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  await T('pop-ups',async()=>{
    const p=await browser.newPage();await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    const errs=[],logs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>logs.push(m.text().slice(0,200)));
    await p.goto(APP+'?prompts=1',{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,popShown,null,30000);
    let s=await p.evaluate(popShown);
    check('1re pop-up : âge et centres d\'intérêt manquants, au centre de l\'écran, avec une croix',s.id==='cat-wall'&&s.centered&&s.x&&/Ton âge/.test(s.t)&&/Ce qui t'intéresse/.test(s.t),s);
    check('L\'app est figée dessous (inerte) tant que la pop-up est ouverte',s.inert);
    if(process.env.SHOTS_DIR)await p.screenshot({path:process.env.SHOTS_DIR+'/pop1.png'}).catch(()=>{});
    await p.click('#cat-close');
    await wf(p,()=>document.getElementById('perm-sheet').style.display==='flex',null,15000);
    s=await p.evaluate(popShown);
    check('Croix : fermée ; 2e pop-up : activer les notifications, au centre, avec une croix',s.id==='perm-sheet'&&s.centered&&s.x&&s.inert&&/notifications/i.test(s.t),s);
    await p.click('#perm-sheet .nv-modal-x');
    await wf(p,()=>{const v=document.getElementById('nv-pop');return v.style.display==='flex'&&/veut être ton ami/.test(v.textContent);},null,15000);
    s=await p.evaluate(popShown);
    check('3e pop-up : demande d\'ami de Ben, avec « Accepter »',/Ben veut être ton ami/.test(s.t)&&/Accepter/.test(s.t)&&s.centered&&s.inert,s);
    if(process.env.SHOTS_DIR)await p.screenshot({path:process.env.SHOTS_DIR+'/pop2.png'}).catch(()=>{});
    await p.click('#nv-pop-cta');
    const ok=await (async()=>{for(let i=0;i<30;i++){if(((await db.doc('users/me').get()).data().friendUids||[]).includes('ben'))return true;await sleep(300);}return false;})();
    check('« Accepter » : Ben devient ami',ok);
    await sleep(2500);
    check('3 pop-ups au plus par ouverture (messages et nouvel ami attendront) ; l\'app redevient utilisable',await p.evaluate(()=>![...document.querySelectorAll('.nv-modal')].some(m=>m.style.display==='flex')&&![...document.getElementById('app').children].some(c=>c.inert)));
    // Ouverture suivante : profil complété entre-temps, notifications redemandées dans 3 jours : messages et nouvel ami.
    await db.doc('users/me').update({ageRange:'25-34',interests:['sport']});
    await db.doc('users/me/notifications/friendacc_cle').set({type:'friend_accepted',fromUid:'cle',fromName:'Clé',read:false,createdAt:Timestamp.now()});   // après la visite précédente
    await p.reload({waitUntil:'load'});
    await wf(p,()=>{const v=document.getElementById('nv-pop');return v&&v.style.display==='flex';},null,30000);
    s=await p.evaluate(popShown);
    check('Ouverture suivante : « Clé t\'a écrit » avec son message',/Clé t'a écrit/.test(s.t)&&/On se voit ce soir/.test(s.t),s);
    await p.evaluate(()=>closePop());
    await wf(p,()=>{const v=document.getElementById('nv-pop');return v.style.display==='flex'&&/accepté ta demande/.test(v.textContent);},null,15000).catch(()=>{});
    s=await p.evaluate(popShown);
    check('Puis le nouvel ami depuis la dernière visite (« Clé a accepté ta demande »), pas l\'ancien (Dan)',!!s&&/Clé a accepté ta demande/.test(s.t),s);
    await p.evaluate(()=>closePop());
    check('Aucune erreur JavaScript',errs.length===0,errs);
    await p.close();
  });
  await browser.close();
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
