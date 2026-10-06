// Injection de code (XSS) : un commerçant malveillant met du code dans son nom, sa description, son adresse, son secteur
// et le texte de sa question. Chez l'habitant, aucune de ces chaînes ne doit s'exécuter (accueil, fiche commerce, liste
// des commerces, historique).
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const wf=(p,fn,arg,t=25000)=>p.waitForFunction(fn,{timeout:t,polling:200},arg);
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const CHROME=(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const APP='http://localhost:8950/app.html';
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
const X=n=>`<img src=x onerror="window.__pwn=(window.__pwn||[]).concat('${n}')">`;
const J=n=>`');window.__pwn=(window.__pwn||[]).concat('${n}');//`;
(async()=>{
  await wipe();
  await db.doc('merchants/m1').set({role:'merchant',ownerUid:'m1',brandName:'Le Fournil'+J('nom'),name:'Le Fournil',sector:'Boulangerie'+X('secteur'),city:'le-mans',cityLabel:'Le Mans',status:'verified',description:'Bon pain'+X('description'),address:'1 rue'+X('adresse')});
  await db.doc('campaigns/c1').set({merchantId:'m1',merchantName:'Le Fournil'+J('nom'),brandEmoji:X('emoji'),usage:X('usage'),status:'active',targetCity:'le-mans',city:'le-mans',question:'Ton pain préféré ?'+X('question'),questions:[{q:'Ton pain préféré ?'+X('question'),format:'mcq',options:['Baguette','Pavé']}],answersCount:0,createdAt:Timestamp.now()});
  await db.doc('users/me').set({role:'user',name:'Alex',email:'me@t.fr',city:'le-mans',cityLabel:'Le Mans',welcomeClaimed:true,onboardingStep:'done',seenHomeTour:true,authorizedMerchants:['m1'],answeredCampaigns:[],interests:[],points:0,xp:0,streak:0,friendUids:[]});
  await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});
  for(let i=0;i<40&&!(await db.doc('merchantsPublic/m1').get()).exists;i++)await sleep(300);
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const p=await browser.newPage();await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  try{
    await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.qs&&S.qs.length>0,null,30000);
    await sleep(1200);
    check('Accueil : la question piégée est affichée comme du texte, rien ne s\'exécute',await p.evaluate(()=>!window.__pwn),await p.evaluate(()=>window.__pwn));
    await p.evaluate(()=>{try{openBrandById('m1')}catch(e){}});await sleep(2500);
    check('Fiche du commerce (nom, description, secteur, adresse, question) : rien ne s\'exécute',await p.evaluate(()=>!window.__pwn),await p.evaluate(()=>window.__pwn));
    check('… et la description reste lisible en texte',await p.evaluate(()=>/Bon pain<img/.test(document.body.innerText)));
    await p.evaluate(()=>{try{renderBrandsFromFirestore([{id:'m1',brandName:'Le Fournil'+"');window.__pwn=(window.__pwn||[]).concat('liste');//",sector:'Boulangerie',address:'1 rue<img src=x onerror="window.__pwn=(window.__pwn||[]).concat(\'liste-adresse\')">',city:'le-mans',logoUrl:'https://firebasestorage.googleapis.com/x/o/merchants%2Fm1%2Fbad.png'}]);}catch(e){}});
    await sleep(1500);
    check('Liste des commerces (inscription), logo cassé compris : rien ne s\'exécute',await p.evaluate(()=>!window.__pwn),await p.evaluate(()=>window.__pwn));
  }catch(e){fail++;console.log('FAIL exception -> '+String(e.stack||e).slice(0,300));}
  await browser.close();
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
