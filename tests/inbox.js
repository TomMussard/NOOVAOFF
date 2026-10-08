// Messages : icône à côté des notifications (nombre de conversations non lues), liste des conversations (la plus
// récente en haut, aperçu, heure, non lu), « Écrire à un ami », retour à la liste après une conversation.
// Serveur : résumé de chaque conversation écrit à chaque message, rattrapage des anciennes conversations, règles.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp,FieldValue}=admin.firestore;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,3).join(' | '));}};
const wf=(p,fn,arg,t=25000)=>p.waitForFunction(fn,{timeout:t,polling:200},arg);
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const until=async(fn,t=20000)=>{const s=Date.now();while(Date.now()-s<t){if(await fn())return true;await sleep(300);}return false;};
const CHROME=(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const APP='http://localhost:8950/app.html';
const AUTH='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake';
const FS='http://127.0.0.1:8080/v1/projects/noova-366d0/databases/(default)/documents';
const tok=async(email)=>(await (await fetch(AUTH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'secret123',returnSecureToken:true})})).json()).idToken;
async function wipe(){await fetch(FS.replace('/v1/','/emulator/v1/'),{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
const base={role:'user',city:'le-mans',cityLabel:'Le Mans',welcomeClaimed:true,onboardingStep:'done',seenHomeTour:true,authorizedMerchants:[],answeredCampaigns:[],points:0,xp:0,streak:0,ageRange:'25-34',interests:['sport']};
const msg=(chat,id,from,text,ms,o={})=>db.doc(`chats/${chat}/messages/${id}`).set({fromUid:from,text,createdAt:Timestamp.fromMillis(ms),...o});
(async()=>{
  await wipe();
  for(const [u,n,f] of [['ana','Ana',['ben','cle','dan']],['ben','Ben',['ana']],['cle','Clé',['ana']],['dan','Dan',['ana']],['fay','Fay',[]]]){
    await db.doc('users/'+u).set({...base,name:n,email:u+'@t.fr',friendUids:f});await aauth.createUser({uid:u,email:u+'@t.fr',password:'secret123'});
  }
  const now=Date.now();
  await T('serveur',async()=>{
    await db.doc('chats/ana_ben').set({participants:{ana:true,ben:true}});
    await msg('ana_ben','a','ana','Tu viens samedi ?',now-3600000);
    await msg('ana_ben','b','ben','Oui, à quelle heure ?',now-60000);
    await db.doc('chats/ana_cle').set({participants:{ana:true,cle:true}});
    await msg('ana_cle','a','ana','Merci pour hier',now-2*86400000);
    const ok=await until(async()=>{const d=(await db.doc('chats/ana_ben').get()).data();return d.lastText==='Oui, à quelle heure ?';});
    const d=(await db.doc('chats/ana_ben').get()).data();
    check('Résumé écrit par le serveur : membres, dernier message, auteur, prénoms',ok&&d.members.sort().join()==='ana,ben'&&d.lastFrom==='ben'&&d.who.ben.name==='Ben'&&d.lastType==='text',d);
    await until(async()=>(await db.doc('chats/ana_cle').get()).data().lastText==='Merci pour hier');
    // Ancienne conversation (avant la mise à jour) : sans résumé, rattrapée une fois.
    await db.doc('chats/ana_dan').set({participants:{ana:true,dan:true}});
    await msg('ana_dan','a','dan','Sondage du jour',now-5*86400000,{type:'poll',options:['Oui','Non']});
    await until(async()=>!!(await db.doc('chats/ana_dan').get()).data().members);
    await db.doc('chats/ana_dan').update({members:FieldValue.delete(),lastText:FieldValue.delete(),lastAt:FieldValue.delete(),lastFrom:FieldValue.delete(),lastType:FieldValue.delete(),who:FieldValue.delete()});
    const r=await require(__dirname+'/../functions/social.js')._t.backfillChatsIfNeeded();
    const dd=(await db.doc('chats/ana_dan').get()).data();
    check('Anciennes conversations résumées une fois après le déploiement',r.chats>=1&&dd.members&&dd.lastType==='poll'&&dd.lastText==='Sondage du jour',{r,dd});
    check('… et pas deux fois',(await require(__dirname+'/../functions/social.js')._t.backfillChatsIfNeeded()).skipped===true);
    const A=await tok('ana@t.fr'),F=await tok('fay@t.fr');
    const q=async t=>(await fetch(`${FS}:runQuery`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify({structuredQuery:{from:[{collectionId:'chats'}],where:{fieldFilter:{field:{fieldPath:'members'},op:'ARRAY_CONTAINS',value:{stringValue:t===A?'ana':'ana'}}}}})})).status;
    check('« Mes conversations » : lisible par moi',await q(A)===200);
    check('Les conversations des autres : refusées',await q(F)===403);
    const w=await fetch(`${FS}/chats/ana_ben?updateMask.fieldPaths=lastText`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+A},body:JSON.stringify({fields:{lastText:{stringValue:'falsifié'}}})});
    check('Le résumé ne peut pas être modifié depuis l\'app',w.status===403,w.status);
  });

  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  await T('interface',async()=>{
    const p=await browser.newPage();await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','ana@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active')&&S._chats&&S._chats.length===3,null,30000);
    await p.evaluate(()=>goNav('social'));await sleep(500);
    const hdr=await p.evaluate(()=>{const m=document.getElementById('nav-inbox'),pr=document.getElementById('nav-profile');return {side:!!m&&!!pr&&m.nextElementSibling===pr&&m.closest('#bnav')!==null,badge:getComputedStyle(document.getElementById('msg-badge')).display!=='none'?document.getElementById('msg-badge').textContent:'',label:m.getAttribute('aria-label')};});
    check('Messages dans la barre du bas, juste avant Profil, avec le nombre de conversations non lues (Ben et Dan)',hdr.side&&hdr.badge==='2'&&/2 non lus/.test(hdr.label),hdr);
    if(process.env.SHOTS_DIR)await p.screenshot({path:process.env.SHOTS_DIR+'/inbox_hdr.png'}).catch(()=>{});
    await p.click('#nav-inbox');
    await wf(p,()=>cur==='inbox'&&document.querySelectorAll('#inbox-list .ib-row').length===3,null,10000);
    const rows=await p.evaluate(()=>[...document.querySelectorAll('#inbox-list .ib-row')].map(r=>({n:r.querySelector('.ib-name').textContent,t:r.querySelector('.ib-time').textContent,l:r.querySelector('.ib-last').textContent,u:r.classList.contains('unread')})));
    if(process.env.SHOTS_DIR){await sleep(700);await p.screenshot({path:process.env.SHOTS_DIR+'/inbox.png'}).catch(()=>{});}
    check('Liste : la plus récente en haut (Ben, Clé, Dan)',rows.map(r=>r.n).join()==='Ben,Clé,Dan',rows);
    check('Aperçu du dernier message, « Toi : » pour les miens, « Sondage : » pour un sondage',rows[0].l==='Oui, à quelle heure ?'&&rows[1].l==='Toi : Merci pour hier'&&rows[2].l==='Sondage : Sondage du jour',rows.map(r=>r.l));
    check('Heure aujourd\'hui, sinon jour ou date',/^\d\d:\d\d$/.test(rows[0].t)&&rows[1].t&&rows[2].t,rows.map(r=>r.t));
    check('Non lu mis en évidence (Ben et Dan), pas Clé (dernier message de moi)',rows[0].u&&!rows[1].u&&rows[2].u,rows.map(r=>r.u));
    await p.evaluate(()=>document.querySelector('#inbox-list .ib-row').click());
    await wf(p,()=>cur==='chat'&&document.getElementById('ch-name').textContent==='Ben'&&/quelle heure/.test(document.getElementById('chat-msgs').textContent),null,10000);
    check('Toucher une conversation l\'ouvre',true);
    await until(async()=>{const d=(await db.doc('chats/ana_ben').get()).data();return d.lastRead&&d.lastRead.ana;});
    await p.evaluate(()=>{document.getElementById('chat-inp').value='À 15h !';sendMsg();});
    await sleep(800);
    await p.evaluate(()=>leaveChat());
    check('Retour : on revient à la liste des messages',await p.evaluate(()=>cur==='inbox'));
    await wf(p,()=>{const r=document.querySelector('#inbox-list .ib-row');return r&&/Toi : À 15h/.test(r.textContent)&&!r.classList.contains('unread');},null,15000).catch(()=>{});
    const r0=await p.evaluate(()=>{const r=document.querySelector('#inbox-list .ib-row');return {t:r.textContent,u:r.classList.contains('unread'),b:document.getElementById('msg-badge').textContent};});
    check('Après lecture et réponse : « Toi : À 15h ! », plus en non lu, 1 seule conversation non lue',/Toi : À 15h/.test(r0.t)&&!r0.u&&r0.b==='1',r0);
    // Nouveau message reçu pendant qu'on regarde la liste
    await msg('ana_cle','b','cle','Avec plaisir !',Date.now());
    await wf(p,()=>{const r=document.querySelector('#inbox-list .ib-row');return r&&/Avec plaisir/.test(r.textContent)&&r.classList.contains('unread');},null,15000).catch(()=>{});
    const r1=await p.evaluate(()=>({first:document.querySelector('#inbox-list .ib-name').textContent,b:document.getElementById('msg-badge').textContent}));
    check('Message reçu : la conversation remonte en haut, en non lu, en direct',r1.first==='Clé'&&r1.b==='2',r1);
    await db.doc('chats/ana_dan/messages/a').delete();await db.doc('chats/ana_dan').delete();await db.doc('users/ana').update({friendUids:['ben','cle','dan']});
    await p.evaluate(()=>{S._chats=S._chats.filter(c=>c.id!=='ana_dan');renderInbox();});
    await wf(p,()=>/Dan/.test((document.querySelector('#inbox-list .ib-new')||{}).textContent||''),null,15000).catch(()=>{});
    check('« Écrire à un ami » propose les amis sans conversation',await p.evaluate(()=>/Dan/.test((document.querySelector('#inbox-list .ib-new')||{}).textContent||'')));
    await p.evaluate(()=>document.querySelector('#inbox-list .ib-new button').click());
    await wf(p,()=>cur==='chat'&&document.getElementById('ch-name').textContent==='Dan',null,10000).catch(()=>{});
    check('… et ouvre la conversation',await p.evaluate(()=>cur==='chat'&&document.getElementById('ch-name').textContent==='Dan'));
    // Conversation lancée sans message : elle entre dans la liste et n'en sort plus.
    await p.evaluate(()=>leaveChat());
    await wf(p,()=>[...document.querySelectorAll('#inbox-list .ib-row')].some(r=>/Dan/.test(r.textContent)&&/Conversation démarrée/.test(r.textContent)),null,10000).catch(()=>{});
    check('Conversation ouverte sans message : déjà dans la liste (« Conversation démarrée »)',await p.evaluate(()=>[...document.querySelectorAll('#inbox-list .ib-row')].some(r=>/Dan/.test(r.textContent)&&/Conversation démarrée/.test(r.textContent))));
    await db.doc('users/ana').update({friendUids:['ben','cle']});await db.doc('users/dan').update({friendUids:[]});
    await sleep(1500);await p.evaluate(()=>renderInbox());
    check('… et y reste, même si l\'amitié est retirée',await p.evaluate(()=>[...document.querySelectorAll('#inbox-list .ib-name')].some(e=>e.textContent==='Dan')));
    // Message reçu pendant qu'on est ailleurs dans l'app : bandeau en haut, qui ouvre la conversation.
    await p.evaluate(()=>goNav('home'));await sleep(500);
    await msg('ana_ben','z','ben','Tu es où ?',Date.now());
    await wf(p,()=>document.getElementById('msg-banner').classList.contains('show')&&/Tu es où/.test(document.getElementById('msg-banner').textContent),null,15000).catch(()=>{});
    const bn=await p.evaluate(()=>({show:document.getElementById('msg-banner').classList.contains('show'),t:document.getElementById('msg-banner').textContent}));
    check('App ouverte sur l\'accueil : bandeau « Ben — Tu es où ? »',bn.show&&/Ben/.test(bn.t)&&/Tu es où/.test(bn.t),bn);
    await p.evaluate(()=>document.getElementById('msg-banner').click());
    await wf(p,()=>cur==='chat'&&document.getElementById('ch-name').textContent==='Ben',null,10000).catch(()=>{});
    check('… le toucher ouvre la conversation',await p.evaluate(()=>cur==='chat'&&document.getElementById('ch-name').textContent==='Ben'));
    await msg('ana_ben','y','ben','Je t\'attends',Date.now()+1000);await sleep(2500);
    check('Dans la conversation elle-même : pas de bandeau',await p.evaluate(()=>!/attends/.test(document.getElementById('msg-banner').textContent)));
    check('Aucune erreur JavaScript',errs.length===0,errs);
    await p.close();
  });
  await browser.close();
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
