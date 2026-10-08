// Annonces de NOOVA (onglet Diffusion) : l'admin crée une annonce ; chaque habitant visé la reçoit sur son téléphone,
// dans sa cloche, et la voit en carte en haut de l'accueil jusqu'à ce qu'il la ferme ; « importante » : pop-up à
// l'ouverture. Ciblage par ville. Seul l'admin peut en créer.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,600):''));};
const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,3).join(' | '));}};
const wf=(p,fn,arg,t=25000)=>p.waitForFunction(fn,{timeout:t,polling:200},arg);
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const until=async(fn,t=20000)=>{const s=Date.now();while(Date.now()-s<t){if(await fn())return true;await sleep(300);}return false;};
const CHROME=(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const APP='http://localhost:8950/app.html';
const AUTH='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake';
const FS='http://127.0.0.1:8080/v1/projects/noova-366d0/databases/(default)/documents';
const tok=async(email)=>(await (await fetch(AUTH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'secret123',returnSecureToken:true})})).json()).idToken;
const H=t=>({'Content-Type':'application/json',Authorization:'Bearer '+t});
const sink=async uid=>(await db.collection('_pushSink').where('uid','==',uid).get()).docs.map(d=>d.data());
const base={role:'user',welcomeClaimed:true,onboardingStep:'done',seenHomeTour:true,authorizedMerchants:[],answeredCampaigns:[],points:0,xp:0,streak:0,ageRange:'25-34',interests:['sport'],pushEnabled:true};
const day=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Paris'});
const create=(t,o)=>fetch(`${FS}/announcements`,{method:'POST',headers:H(t),body:JSON.stringify({fields:Object.fromEntries(Object.entries(o).map(([k,v])=>[k,typeof v==='boolean'?{booleanValue:v}:{stringValue:v}]))})}).then(async r=>{if(r.status!==200)return r.status;const id=(await r.json()).name.split('/').pop();return id;});
// createdAt = heure serveur : écrite via un commit avec transformation
const commitAnn=async(t,o)=>{const id='a'+Math.random().toString(36).slice(2,10);const r=await fetch(`${FS}:commit`,{method:'POST',headers:H(t),body:JSON.stringify({writes:[{update:{name:`projects/noova-366d0/databases/(default)/documents/announcements/${id}`,fields:Object.fromEntries(Object.entries(o).map(([k,v])=>[k,typeof v==='boolean'?{booleanValue:v}:{stringValue:v}]))},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}],currentDocument:{exists:false}}]})});return r.status===200?id:r.status;};
(async()=>{
  await fetch(FS.replace('/v1/','/emulator/v1/'),{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);
  await db.doc('_testClock/now').set({ms:Date.parse(day+'T14:00:00+02:00')});
  await db.doc('users/lm').set({...base,name:'Lou',email:'lm@t.fr',city:'le-mans',cityLabel:'Le Mans',fcmTokens:['tok_lm']});
  await db.doc('users/an').set({...base,name:'Ana',email:'an@t.fr',city:'angers',cityLabel:'Angers',fcmTokens:['tok_an']});
  await db.doc('users/off').set({...base,name:'Off',email:'off@t.fr',city:'le-mans',cityLabel:'Le Mans',fcmTokens:['tok_off'],notifPrefs:{noova:false}});
  await db.doc('merchants/m1').set({role:'merchant',ownerUid:'m1',brandName:'Le Fournil',city:'le-mans',status:'verified',email:'m1@shop.fr'});
  for(const u of ['lm','an','off'])await aauth.createUser({uid:u,email:u+'@t.fr',password:'secret123'});
  await aauth.createUser({uid:'adm',email:'tomussproduction@gmail.com',password:'secret123',emailVerified:true});
  const A=await tok('tomussproduction@gmail.com'),U=await tok('lm@t.fr');
  let a1,a2;
  await T('serveur',async()=>{
    check('Un habitant ne peut pas créer d\'annonce',await commitAnn(U,{title:'Faux',message:'x',cta:'',city:'all',forUsers:true,forMerchants:false,important:false})===403);
    a1=await commitAnn(A,{title:'Nouveau : les sondages entre amis',message:'Pose une question à tes amis depuis la messagerie.',cta:'friends',city:'all',forUsers:true,forMerchants:true,important:false,sentBy:'tomussproduction@gmail.com'});
    check('L\'admin crée une annonce',typeof a1==='string',a1);
    const ok=await until(async()=>(await sink('lm')).some(x=>x.ntype==='annonce'));
    const p=(await sink('lm')).find(x=>x.ntype==='annonce')||{};
    check('Notification sur le téléphone avec le titre et le message',ok&&p.title==='Nouveau : les sondages entre amis'&&/Pose une question/.test(p.body),p);
    check('… pour toutes les villes (Angers aussi)',await until(async()=>(await sink('an')).some(x=>x.ntype==='annonce')));
    check('… mais pas pour qui a coupé « Annonces de NOOVA »',!(await sink('off')).some(x=>x.ntype==='annonce'));
    check('Dans la cloche de chaque habitant',(await db.doc(`users/lm/notifications/ann_${a1}`).get()).exists&&(await db.doc(`users/off/notifications/ann_${a1}`).get()).exists);
    check('Et dans celle des commerçants',(await db.doc(`merchants/m1/notifications/ann_${a1}`).get()).exists);
    await until(async()=>(await db.doc('announcements/'+a1).get()).data().recipientCount!=null);
    const d=(await db.doc('announcements/'+a1).get()).data();
    check('Bilan pour l\'admin : 4 destinataires, 2 notifications téléphone',d.recipientCount===4&&d.pushSent===2,d);
    a2=await commitAnn(A,{title:'Le Mans : soirée NOOVA',message:'Rendez-vous samedi.',cta:'',city:'le-mans',forUsers:true,forMerchants:false,important:true,sentBy:'x'});
    await until(async()=>(await db.doc(`users/lm/notifications/ann_${a2}`).get()).exists);await sleep(1500);
    check('Annonce pour Le Mans : pas pour Angers',!(await db.doc(`users/an/notifications/ann_${a2}`).get()).exists&&!(await sink('an')).some(x=>/soirée/.test(x.title)));
    const Ang=await tok('an@t.fr');
    check('Un habitant d\'Angers ne peut pas lire l\'annonce du Mans',(await fetch(`${FS}/announcements/${a2}`,{headers:H(Ang)})).status===403);
  });
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  await T('app',async()=>{
    const p=await browser.newPage();await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.goto(APP+'?prompts=1',{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','lm@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>{const v=document.getElementById('nv-pop');return v&&v.style.display==='flex';},null,30000);
    const pop=await p.evaluate(()=>document.getElementById('nv-pop').textContent.replace(/\s+/g,' '));
    check('Annonce importante : pop-up au centre à l\'ouverture',/Le Mans : soirée NOOVA/.test(pop)&&/Rendez-vous samedi/.test(pop),pop);
    if(process.env.SHOTS_DIR)await p.screenshot({path:process.env.SHOTS_DIR+'/ann_pop.png'}).catch(()=>{});
    await p.click('#nv-pop-cta');await sleep(800);
    // Les pop-ups suivantes de la file (notifications…) : fermées, comme le ferait l'habitant.
    for(let i=0;i<10;i++){await sleep(400);await p.evaluate(()=>{if(document.getElementById('nv-pop').style.display==='flex')closePop();if(document.getElementById('perm-sheet').style.display==='flex')permLater();const w=document.getElementById('cat-wall');if(w.style.display==='flex'&&w._closable)closeCategoryWall();});}
    await wf(p,()=>/sondages entre amis/.test((document.getElementById('ann-card')||{}).textContent||''),null,15000);
    const card=await p.evaluate(()=>{const c=document.querySelector('#ann-card .ann-card'),t=document.getElementById('today-card');return {txt:c.textContent.replace(/\s+/g,' '),above:!!(c.compareDocumentPosition(t)&Node.DOCUMENT_POSITION_FOLLOWING),cta:(c.querySelector('.ann-cta')||{}).textContent,x:!!c.querySelector('.ann-x')};});
    check('Après « Compris » : la pop-up ne reste pas ; l\'annonce suivante en carte en haut de l\'accueil, au-dessus de la question du jour',card.above&&/Annonce NOOVA/.test(card.txt)&&/Pose une question/.test(card.txt),card);
    check('… avec son bouton « Voir mes amis » et une croix pour la fermer',card.cta==='Voir mes amis'&&card.x,card);
    if(process.env.SHOTS_DIR){await p.evaluate(()=>document.getElementById('ann-card').scrollIntoView());await p.screenshot({path:process.env.SHOTS_DIR+'/ann_card.png'}).catch(()=>{});}
    await p.click('#ann-card .ann-x');await sleep(500);
    check('Croix : la carte disparaît',await p.evaluate(()=>!document.querySelector('#ann-card .ann-card')));
    await until(async()=>(await db.doc(`users/lm/notifications/ann_${a1}`).get()).data().read===true,8000);
    check('… et la ligne de la cloche passe en lu',(await db.doc(`users/lm/notifications/ann_${a1}`).get()).data().read===true);
    await p.reload({waitUntil:'load'});await wf(p,()=>document.getElementById('home').classList.contains('active'),null,30000);await sleep(3500);
    const after=await p.evaluate(()=>({card:!!document.querySelector('#ann-card .ann-card'),pop:document.getElementById('nv-pop').style.display}));
    check('Rouverte : ni la carte fermée ni la pop-up déjà vue ne reviennent',!after.card&&after.pop!=='flex',after);
    // Suppression par l'admin pendant que l'app est ouverte : la carte disparaît en direct, la cloche aussi.
    const a3=await commitAnn(A,{title:'Annonce à retirer',message:'Erreur de date.',cta:'',city:'all',forUsers:true,forMerchants:false,important:false,sentBy:'x'});
    await wf(p,()=>/Annonce à retirer/.test((document.getElementById('ann-card')||{}).textContent||''),null,15000);
    await until(async()=>(await db.doc(`users/lm/notifications/ann_${a3}`).get()).exists);
    check('Un habitant ne peut pas supprimer une annonce',(await fetch(`${FS}/announcements/${a3}`,{method:'DELETE',headers:H(U)})).status===403);
    const del=await fetch(`${FS}/announcements/${a3}`,{method:'DELETE',headers:H(A)});
    await wf(p,()=>!/Annonce à retirer/.test((document.getElementById('ann-card')||{}).textContent||''),null,10000).catch(()=>{});
    check('Admin supprime : la carte disparaît de l\'accueil en direct',del.status===200&&await p.evaluate(()=>!/Annonce à retirer/.test(document.getElementById('ann-card').textContent)));
    check('… et de la cloche de chacun',await until(async()=>!(await db.doc(`users/lm/notifications/ann_${a3}`).get()).exists&&!(await db.doc(`users/an/notifications/ann_${a3}`).get()).exists));
    // Vue il y a plus de 3 jours : elle s'efface d'elle-même.
    const a4=await commitAnn(A,{title:'Vue il y a longtemps',message:'…',cta:'',city:'all',forUsers:true,forMerchants:false,important:false,sentBy:'x'});
    await wf(p,()=>/Vue il y a longtemps/.test((document.getElementById('ann-card')||{}).textContent||''),null,15000);
    const seen=await p.evaluate(id=>JSON.parse(localStorage.getItem('nv_ann_seen')||'{}')[id]>0,a4);
    await p.evaluate(id=>{const s=JSON.parse(localStorage.getItem('nv_ann_seen')||'{}');s[id]=Date.now()-4*86400000;localStorage.setItem('nv_ann_seen',JSON.stringify(s));renderAnnCard();},a4);
    check('Vue pour la première fois il y a plus de 3 jours : la carte s\'efface toute seule',seen&&await p.evaluate(()=>!/Vue il y a longtemps/.test(document.getElementById('ann-card').textContent)));
    check('Réglages : « Annonces de NOOVA » peut être coupé',await p.evaluate(()=>NOTIF_GROUPS.some(g=>g.g==='noova')));
    check('Aucune erreur JavaScript',errs.length===0,errs);
    await p.close();
  });
  await T('admin : bouton Supprimer',async()=>{
    const a5=await commitAnn(A,{title:'Test suppression admin',message:'x',cta:'',city:'all',forUsers:true,forMerchants:false,important:false,sentBy:'tomussproduction@gmail.com'});
    await until(async()=>(await db.doc('announcements/'+a5).get()).data().recipientCount!=null);
    const p=await browser.newPage();await p.setViewport({width:1280,height:900});p.on('dialog',d=>d.accept());
    await p.goto('http://localhost:8950/admin.html',{waitUntil:'load'});await sleep(1200);
    await p.evaluate(async()=>{await auth.signInWithEmailAndPassword('tomussproduction@gmail.com','secret123');});
    await wf(p,()=>document.getElementById('main').style.display==='block',null,20000);
    await p.evaluate(()=>{const b=[...document.querySelectorAll('.tab-btn-main')].find(x=>(x.getAttribute('onclick')||'').includes("'diffusion'"));switchTab('diffusion',b);});
    await wf(p,()=>/Test suppression admin/.test(document.getElementById('broadcast-history').textContent),null,15000);
    await p.evaluate(()=>{const row=[...document.querySelectorAll('#broadcast-history .act-row')].find(r=>/Test suppression admin/.test(r.textContent));row.querySelector('button.btn-reject').click();});
    await wf(p,()=>!/Test suppression admin/.test(document.getElementById('broadcast-history').textContent),null,15000).catch(()=>{});
    check('Admin : « Supprimer » sur une annonce de l\'historique la supprime',!(await db.doc('announcements/'+a5).get()).exists&&await p.evaluate(()=>!/Test suppression admin/.test(document.getElementById('broadcast-history').textContent)));
    await p.close();
  });
  await browser.close();
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
