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
async function mkUser(uid,o={}){await db.doc('users/'+uid).set({role:'user',name:'User '+uid,city:'le-mans',cityLabel:'Le Mans',authorizedMerchants:['m1'],friendUids:[],answeredCampaigns:[],points:0,xp:0,streak:0,interests:['restauration'],onboardingStep:'done',seenHomeTour:true,...o});}
async function mkCampaign(id,o={}){await db.doc('campaigns/'+id).set({merchantId:'m1',merchantName:'Le Fournil',sector:'Boulangerie',status:'active',targetCity:'le-mans',city:'le-mans',question:Q,questions:[{q:Q,format:'mcq',options:OPTS}],targetVolume:500,answersCount:0,createdAt:Timestamp.now(),...o});}
async function ans(uid,cid,answer,o={}){await db.doc(`answers/${uid}_${cid}_q${o.q||0}`).set({userId:uid,campaignId:cid,questionIdx:o.q||0,answer,flagged:!!o.flagged,suspect:!!o.suspect,pointsAwarded:0,createdAt:Timestamp.now()});}
const compat=(uid,d={})=>E.compatCore(uid,d);
const byName=(r,u)=>r.friends.find(f=>f.uid===u);
const err=async fn=>{try{await fn();return null;}catch(e){return e.code||String(e);}};


const until=async(fn,t=15000)=>{const s=Date.now();while(Date.now()-s<t){if(await fn())return true;await sleep(300);}return false;};
const ADMIN='http://localhost:8950/admin.html';

const AUTH='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake';
const idTokenOf=async(email)=>(await (await fetch(AUTH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'secret123',returnSecureToken:true})})).json()).idToken;
const callFn=async(name,data,token)=>{const r=await fetch('http://127.0.0.1:5001/noova-366d0/europe-west1/'+name,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({data})});const j=await r.json();return j.error?{error:j.error.status,message:j.error.message}:j.result;};
(async()=>{
  // ═════════ Réglages d'engagement modifiables ═════════
  await T('config admin',async()=>{
    await wipe();
    await db.doc('merchants/m1').set({brandName:'Le Fournil',sector:'Boulangerie',city:'le-mans',status:'verified'});
    await mkCampaign('c1');
    for(const u of ['me','a','b','x'])await mkUser(u,{email:u+'@t.fr'});
    await ans('me','c1','Café');await ans('a','c1','Café');await ans('b','c1','Thé');                  // 3 réponses
    await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});
    await aauth.createUser({uid:'adm',email:'tomussproduction@gmail.com',password:'secret123'});
    const tokUser=await idTokenOf('me@t.fr'),tokAdmin=await idTokenOf('tomussproduction@gmail.com');
    check('Réglages : refusés à un simple utilisateur (lecture et écriture)',(await callFn('getEngagementConfig',{},tokUser)).error==='PERMISSION_DENIED'&&(await callFn('setEngagementConfig',{values:{'REVEAL.MIN_ANSWERS':2}},tokUser)).error==='PERMISSION_DENIED');
    check('Réglages : refusés sans connexion',(await callFn('getEngagementConfig',{},null)).error==='PERMISSION_DENIED'||(await callFn('getEngagementConfig',{},null)).error==='UNAUTHENTICATED');
    let g=await callFn('getEngagementConfig',{},tokAdmin);
    check('Réglages : l\'admin lit valeurs, défauts et bornes (reveal 5 par défaut)',g.values['REVEAL.MIN_ANSWERS']===5&&g.defaults['REVEAL.MIN_ANSWERS']===5&&g.bounds['REVEAL.MIN_ANSWERS'].min===2&&Object.keys(g.bounds).length===7&&!Object.keys(g.bounds).some(k=>/^PREDICTION|^COMMUNITY|^QUOTA/.test(k)),g);
    check('Réglages : le barème de points et l\'anti-fraude ne sont pas réglables',!Object.keys(g.bounds).some(k=>/^POINTS|^RESPONSE_TIME/.test(k)));
    let r=await E.revealCore('me',{campaignId:'c1',questionIdx:0});
    check('Avant : 3 réponses < seuil 5 → pas de pourcentage',r.belowThreshold===true&&r.needed===2,r);
    check('Valeur hors bornes refusée (1 < 2)',(await callFn('setEngagementConfig',{values:{'REVEAL.MIN_ANSWERS':1}},tokAdmin)).error==='INVALID_ARGUMENT');
    check('Valeur non entière refusée pour un entier',(await callFn('setEngagementConfig',{values:{'REVEAL.MIN_ANSWERS':2.5}},tokAdmin)).error==='INVALID_ARGUMENT');
    check('Réglage inconnu refusé (POINTS.MAX_ANSWERS_PER_DAY)',(await callFn('setEngagementConfig',{values:{'POINTS.MAX_ANSWERS_PER_DAY':9}},tokAdmin)).error==='INVALID_ARGUMENT');
    const s1=await callFn('setEngagementConfig',{values:{'REVEAL.MIN_ANSWERS':3,'COMPAT.MIN_COMMON':3}},tokAdmin);
    check('Enregistrement : valeurs effectives mises à jour',s1.values['REVEAL.MIN_ANSWERS']===3&&s1.values['COMPAT.MIN_COMMON']===3,s1);
    check('Le document est illisible côté client (règles)',await (async()=>{const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});const p=await b.newPage();await p.goto(APP,{waitUntil:'load'});await sleep(1200);const c=await p.evaluate(async()=>{await auth.signInWithEmailAndPassword('me@t.fr','secret123');try{await db.collection('appConfig').doc('engagement').get();return 'allowed';}catch(e){return e.code;}});await b.close();return c==='permission-denied';})());
    await sleep(800);
    r=await E.revealCore('me',{campaignId:'c1',questionIdx:0});
    check('Après : seuil abaissé à 3 → les pourcentages s\'affichent (67 / 33)',!r.belowThreshold&&r.options.map(o=>o.pct).join()==='67,33,0',r.options);
    const s2=await callFn('setEngagementConfig',{values:{'REVEAL.MIN_ANSWERS':null,'COMPAT.MIN_COMMON':null}},tokAdmin);
    await sleep(800);
    r=await E.revealCore('me',{campaignId:'c1',questionIdx:0});
    check('Retour aux défauts (null) : seuil de 5 rétabli',s2.values['REVEAL.MIN_ANSWERS']===5&&r.belowThreshold===true);
    // interface admin
    const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
    const p=await b.newPage();PG=p;await p.setViewport({width:1200,height:900});const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.goto(ADMIN,{waitUntil:'load'});await sleep(1500);
    await p.evaluate(async()=>{await auth.signInWithEmailAndPassword('tomussproduction@gmail.com','secret123');});
    await p.evaluate(()=>{document.getElementById('tab-moderation').style.display='block';loadEngagementConfig();});
    await wf(p,()=>document.querySelectorAll('#eng-cfg-rows input').length===7,null,15000);
    await p.screenshot({path:'/tmp/shots/admin_cfg.png'});
    await p.evaluate(()=>{document.querySelector('#eng-cfg-rows input[data-k="REVEAL.MIN_ANSWERS"]').value='12';saveEngagementConfig();});
    await until(async()=>((await db.doc('appConfig/engagement').get()).data()||{}).REVEAL&&(await db.doc('appConfig/engagement').get()).data().REVEAL.MIN_ANSWERS===12);
    check('Admin (interface) : la modification est enregistrée avec l\'auteur',(await db.doc('appConfig/engagement').get()).data().REVEAL.MIN_ANSWERS===12&&(await db.doc('appConfig/engagement').get()).data().updatedBy==='tomussproduction@gmail.com');
    await p.evaluate(()=>{window.confirm=()=>true;resetEngagementConfig();});
    await until(async()=>!((await db.doc('appConfig/engagement').get()).data()||{}).REVEAL);
    check('Admin (interface) : « valeurs par défaut » efface les réglages',!((await db.doc('appConfig/engagement').get()).data()||{}).REVEAL);
    await b.close();
    console.log('JS errors admin:',[...new Set(errs)].join(' | ')||'aucune');
  });

  // ═════════ Invitation d'amis ═════════
  await T('invitation',async()=>{
    await wipe();
    await mkUser('inv',{name:'Inviteur',email:'inv@t.fr',friendCode:'NOOVA-INV123'});
    await db.doc('friendCodes/NOOVA-INV123').set({uid:'inv'});
    await mkUser('new',{name:'Nouveau',email:'new@t.fr'});
    await mkUser('old',{name:'Ancien',email:'old@t.fr',friendCode:'NOOVA-OLD456',friendUids:['inv']});
    await db.doc('friendCodes/NOOVA-OLD456').set({uid:'old'});
    for(const u of ['inv','new','old'])await aauth.createUser({uid:u,email:u+'@t.fr',password:'secret123'});
    const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
    const errs=[];
    const open=async(url)=>{const ctx=await browser.createBrowserContext();const p=await ctx.newPage();PG=p;await p.setViewport({width:430,height:900});p.on('pageerror',e=>errs.push(e.message));await p.goto(url,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);await p.evaluate(()=>{window.__toasts=[];const o=window.showToast;window.showToast=(m,i)=>{window.__toasts.push(m);return o(m,i);};});return p;};
    const login=async(p,email)=>{await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','#'.replace('#',email));await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user&&S._friendCode,null,30000);};
    // lien d'invitation ouvert par un visiteur non connecté
    let p=await open(APP+'?invite=noova-inv123&x=1');
    const st=await p.evaluate(()=>({key:localStorage.getItem('nv_invite'),url:location.search}));
    check('Lien d\'invitation : code mémorisé (en majuscules) et retiré de l\'adresse (autres paramètres gardés)',st.key==='NOOVA-INV123'&&!/invite/.test(st.url)&&/x=1/.test(st.url),st);
    await login(p,'new@t.fr');
    await until(async()=>(await db.doc('users/inv/notifications/friendreq_new').get()).exists);
    const fr=(await db.doc('users/inv/notifications/friendreq_new').get()).data();
    check('Après connexion : demande d\'ami envoyée automatiquement à l\'inviteur',fr&&fr.type==='friend_request'&&fr.fromUid==='new'&&fr.fromName==='Nouveau',fr);
    check('Invitation consommée (clé effacée), rien renvoyé au prochain chargement',await p.evaluate(()=>localStorage.getItem('nv_invite'))===null);
    const toast=(await p.evaluate(()=>window.__toasts)).join(' | ');
    check('Confirmation affichée à l\'invité',/Demande d'ami envoyée/.test(toast),toast);
    // messages de partage
    const msgs=await p.evaluate(()=>({link:inviteLink(),msg:inviteMessage()}));
    check('Lien de partage : https://noovaoff.fr/app-v2?invite=<mon code> dans le message',/^https:\/\/noovaoff\.fr\/app-v2\?invite=NOOVA-/.test(msgs.link)&&msgs.msg.includes(msgs.link),msgs);
    // écran récompense : invitation quand on n'a aucun ami, une fois par jour
    await p.evaluate(()=>{openReward({title:'Bien joué !',sub:'test'});});
    const pr1=await p.evaluate(()=>document.querySelector('#rw-invite .inv-prompt')&&document.querySelector('#rw-invite').textContent);
    check('Sans ami : l\'écran récompense propose d\'inviter un ami',/Tes amis répondent aussi/.test(pr1||'')&&/Inviter un ami/.test(pr1||''),pr1);
    await p.screenshot({path:'/tmp/shots/invite_prompt.png'});
    await p.evaluate(()=>{openReward({title:'Bien joué !',sub:'test'});});
    check('… mais une seule fois par jour',await p.evaluate(()=>!document.querySelector('#rw-invite .inv-prompt')));
    // pas d'invitation si on a déjà des amis
    await p.evaluate(()=>{localStorage.removeItem('nv_invite_prompt');S.friends=[{uid:'z',n:'Z',xp:0,str:0}];openReward({title:'Bien joué !',sub:'test'});});
    check('Avec des amis : pas d\'invitation',await p.evaluate(()=>!document.querySelector('#rw-invite .inv-prompt')));
    // état vide de l'onglet Amis
    await p.evaluate(()=>{S.friends=[];goNav('social');socTab('friends',document.querySelector('.tab-btn[onclick*="friends"]'));renderFriends();});
    check('Onglet Amis vide : bouton « Inviter un ami »',await p.evaluate(()=>/Inviter un ami/.test(document.getElementById('friends-list').textContent)));
    await p.close();
    // auto-invitation et code invalide
    p=await open(APP+'?invite=NOOVA-OLD456');
    await login(p,'old@t.fr');await sleep(1500);
    check('Sa propre invitation : aucune demande envoyée à soi-même',(await db.collection('users/old/notifications').get()).empty);
    await p.close();
    p=await open(APP+'?invite=<script>alert(1)</script>');
    check('Code invalide (injection) : ignoré, rien mémorisé',await p.evaluate(()=>localStorage.getItem('nv_invite'))===null);
    await p.close();
    p=await open(APP+'?invite=NOOVA-INV123');
    await login(p,'old@t.fr');await sleep(1500);
    check('Déjà amis : aucune nouvelle demande',!(await db.doc('users/inv/notifications/friendreq_old').get()).exists);
    await browser.close();
    console.log('JS errors invitation:',[...new Set(errs)].join(' | ')||'aucune');
  });
  console.log(`\n===== ${pass}/${pass+fail} OK =====`);process.exit(fail?1:0);
})();
