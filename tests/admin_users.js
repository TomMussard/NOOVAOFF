// Admin, onglet Utilisateurs : TOUS les habitants (plus seulement les 10 derniers), recherche, filtre par ville, tri, pagination.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const wf=(p,fn,arg,t=25000)=>p.waitForFunction(fn,{timeout:t,polling:200},arg);
const CHROME=(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
(async()=>{
  await wipe();
  const b=db.batch();
  for(let i=0;i<60;i++)b.set(db.doc('users/u'+String(i).padStart(2,'0')),{role:'user',name:'Habitant '+i,email:'h'+i+'@t.fr',city:i<40?'le-mans':'angers',cityLabel:i<40?'Le Mans':'Angers',points:i*10,xp:i,streak:i%7,createdAt:Timestamp.fromMillis(Date.now()-i*3600000)});
  await b.commit();
  await aauth.createUser({uid:'adm',email:'tomussproduction@gmail.com',password:'secret123',emailVerified:true});
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const p=await browser.newPage();await p.setViewport({width:1280,height:900});
  try{
    await p.goto('http://localhost:8950/admin.html',{waitUntil:'load'});await sleep(1200);
    await p.evaluate(async()=>{await auth.signInWithEmailAndPassword('tomussproduction@gmail.com','secret123');});
    await wf(p,()=>document.getElementById('main').style.display==='block',null,20000);
    await p.evaluate(()=>{const b=[...document.querySelectorAll('.tab-btn-main')].find(x=>/Utilisateurs/.test(x.textContent));b.click();});
    await wf(p,()=>document.querySelectorAll('#recent-users-wrap tbody tr').length>0,null,20000);
    const r=await p.evaluate(()=>({rows:document.querySelectorAll('#recent-users-wrap tbody tr').length,count:document.getElementById('u-recent-count').textContent,more:document.getElementById('ul-more').style.display,first:document.querySelector('#recent-users-wrap tbody tr td').textContent}));
    check('Les 60 habitants comptés, 50 affichés, bouton « Afficher 50 de plus », plus récent en premier',r.rows===50&&r.count==='60 habitants'&&r.more==='block'&&r.first==='Habitant 0',r);
    await p.evaluate(()=>document.querySelector('#ul-more button').click());
    check('« Afficher 50 de plus » : les 60',await p.evaluate(()=>document.querySelectorAll('#recent-users-wrap tbody tr').length)===60);
    await p.evaluate(()=>{const s=document.getElementById('ul-city');s.value='Angers';s.dispatchEvent(new Event('change'));});
    check('Filtre par ville : 20 habitants d\'Angers',await p.evaluate(()=>document.querySelectorAll('#recent-users-wrap tbody tr').length)===20);
    await p.evaluate(()=>{const s=document.getElementById('ul-city');s.value='';s.dispatchEvent(new Event('change'));const q=document.getElementById('ul-q');q.value='h42@';q.dispatchEvent(new Event('input'));});
    check('Recherche par e-mail',await p.evaluate(()=>[...document.querySelectorAll('#recent-users-wrap tbody tr')].map(t=>t.firstChild.textContent).join())==='Habitant 42');
    await p.evaluate(()=>{const q=document.getElementById('ul-q');q.value='';q.dispatchEvent(new Event('input'));const s=document.getElementById('ul-sort');s.value='points';s.dispatchEvent(new Event('change'));});
    check('Tri par points : le plus haut en premier',await p.evaluate(()=>document.querySelector('#recent-users-wrap tbody tr td').textContent)==='Habitant 59');
  }catch(e){fail++;console.log('FAIL exception -> '+String(e.stack||e).slice(0,300));}
  await browser.close();
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
