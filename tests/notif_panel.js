// Bulle de notifications : une ligne alignée par notification (icône, titre, texte, heure), seulement les non lues et
// celles des 7 derniers jours, « Tout lire » (sauf les demandes d'ami qui attendent une réponse).
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();const {Timestamp}=admin.firestore;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const SH=process.env.SHOTS_DIR;
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const wf=(p,fn,t=30000)=>p.waitForFunction(fn,{timeout:t,polling:200});
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
(async()=>{
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});
  await db.doc('users/me').set({role:'user',name:'Moi',email:'me@t.fr',city:'le-mans',cityLabel:'Le Mans',welcomeClaimed:true,onboardingStep:'done',seenHomeTour:true,authorizedMerchants:[],answeredCampaigns:[],points:0,xp:0,streak:0,ageRange:'25-34',interests:['sport'],friendUids:[]});
  await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});
  const N=(id,o,h)=>db.doc('users/me/notifications/'+id).set({read:false,createdAt:Timestamp.fromMillis(Date.now()-h*3600000),...o});
  await N('a',{type:'friend_request',fromUid:'ben',fromName:'Benjamin Durand'},1);
  await N('b',{type:'friend_accepted',fromUid:'cle',fromName:'Clé'},5);
  await N('c',{type:'noova_message',title:'Nouveau : les sondages entre amis',message:'Pose une question à tes amis depuis la messagerie. Ils répondent d\'un toucher.'},26);
  await N('d',{type:'noova_message',message:'Ancien message de diffusion sans titre, assez long pour passer sur deux lignes au moins.',read:true},24*9);
  for(let i=0;i<12;i++)await N('o'+i,{type:'noova_message',message:'Vieille notification '+i,read:true},24*(12+i));
  const b=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:'new',args:['--no-sandbox']});
  const p=await b.newPage();await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:2});
  await p.goto('http://localhost:8950/app.html',{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'));
  await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
  await wf(p,()=>document.getElementById('home').classList.contains('active'));await sleep(2000);
  await p.evaluate(()=>goNav('social'));await sleep(800);await p.evaluate(()=>toggleNotifPanel());await sleep(800);
  if(SH)await p.screenshot({path:SH+'/notif.png'}).catch(()=>{});
  const r=await p.evaluate(()=>{const items=[...document.querySelectorAll('#notif-list .notif-item')];return {n:items.length,
    aligned:items.every(it=>{const t=it.querySelector('.notif-t'),x=it.querySelector('.notif-txt'),m=it.querySelector('.notif-meta');return [x,m].filter(Boolean).every(e=>Math.abs(e.getBoundingClientRect().left-t.getBoundingClientRect().left)<1);}),
    noova:(items.find(i=>/sondages/.test(i.textContent))||{}).textContent,foot:!!document.querySelector('.notif-foot'),icons:items.every(i=>i.querySelector('.notif-ic'))};});
  check('Seules les non lues et celles des 7 derniers jours (3 sur 16)',r.n===3&&r.foot,r);
  check('Chaque ligne alignée : titre, texte et heure à la même marge, icône à gauche',r.aligned&&r.icons,r);
  check('Annonce NOOVA : titre puis message, sur une seule colonne',/^Nouveau : les sondages entre amisPose une question/.test((r.noova||'').trim()),r.noova);
  await p.click('#notif-all');
  const ok=await (async()=>{for(let i=0;i<20;i++){const d=(await db.collection('users/me/notifications').where('read','==',false).get()).docs.map(x=>x.id);if(d.length===1)return d;await sleep(300);}return (await db.collection('users/me/notifications').where('read','==',false).get()).docs.map(x=>x.id);})();
  check('« Tout lire » : tout passe en lu, sauf la demande d\'ami en attente',ok.join()==='a',ok);
  console.log(`\n${pass} ok, ${fail} échec(s)`);await b.close();process.exit(0);
})().catch(e=>{console.log('FAIL '+e);process.exit(1);});
