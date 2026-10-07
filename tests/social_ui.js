// Interface : pop-ups de lancement (âge et centres d'intérêt manquants, notifications), conversation privée (jour,
// heure, sondage, « Vu »), suggestions d'amis.
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
const CHROME=(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const APP='http://localhost:8950/app.html';
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
const login=async(p,email,q='')=>{await p.goto(APP+q,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email',email);await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());};
const base={role:'user',city:'le-mans',cityLabel:'Le Mans',welcomeClaimed:true,onboardingStep:'done',seenHomeTour:true,authorizedMerchants:[],answeredCampaigns:[],points:0,xp:0,streak:0};
(async()=>{
  await wipe();
  await db.doc('users/old').set({...base,name:'Ancien',email:'old@t.fr',interests:[],friendUids:[]});
  await db.doc('users/ana').set({...base,name:'Ana',email:'ana@t.fr',ageRange:'25-34',interests:['restauration'],friendUids:['ben','cle']});
  await db.doc('users/ben').set({...base,name:'Ben',email:'ben@t.fr',ageRange:'25-34',interests:['restauration'],friendUids:['ana']});
  await db.doc('users/cle').set({...base,name:'Clé',email:'cle@t.fr',ageRange:'25-34',interests:['sport'],friendUids:['ana','dan']});
  await db.doc('users/dan').set({...base,name:'Dan',email:'dan@t.fr',ageRange:'18-24',interests:['sport'],friendUids:['cle']});
  for(const u of ['old','ana','ben','cle','dan'])await aauth.createUser({uid:u,email:u+'@t.fr',password:'secret123'});
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});

  await T('pop-ups de lancement',async()=>{
    const p=await browser.newPage();await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    await login(p,'old@t.fr','?prompts=1');
    await wf(p,()=>document.getElementById('cat-wall').style.display==='flex',null,25000);
    const st=await p.evaluate(()=>({age:getComputedStyle(document.getElementById('cat-age-wrap')).display!=='none',int:getComputedStyle(document.getElementById('cat-int-wrap')).display!=='none'}));
    check('Compte sans âge ni centres d\'intérêt : pop-up qui demande les deux',st.age&&st.int,st);
    await p.evaluate(()=>{document.querySelector('#cat-age-grid [data-age="35-49"]').click();document.querySelector('#cat-grid [data-cat=restauration]').click();saveCategories();});
    await wf(p,()=>document.getElementById('cat-wall').style.display==='none',null,10000);
    await sleep(800);
    const u=(await db.doc('users/old').get()).data();
    check('… enregistrés, la pop-up se ferme',u.ageRange==='35-49'&&u.interests.includes('restauration'),{a:u.ageRange,i:u.interests});
    const never=await p.evaluate(()=>{_permKey='notif';permLater();return localStorage.getItem('nv_notif_never');});
    check('Notifications refusées (« Plus tard ») : plus jamais redemandées d\'office',never==='1');
    const asked=await p.evaluate(()=>{document.getElementById('perm-sheet').style.display='none';askNotifFlow(false);return document.getElementById('perm-sheet').style.display;});
    check('… la pop-up ne revient pas',asked==='none',asked);
    await p.evaluate(()=>auth.signOut());await sleep(500);
    await p.close();
  });

  await T('conversation',async()=>{
    await db.doc('chats/ana_ben').set({participants:{ana:true,ben:true}});
    const yest=Date.now()-26*3600000;
    await db.doc('chats/ana_ben/messages/a').set({fromUid:'ben',text:'Coucou hier',createdAt:Timestamp.fromMillis(yest)});
    await db.doc('chats/ana_ben/messages/b').set({fromUid:'ana',text:'Salut !',createdAt:Timestamp.now()});
    await db.doc('chats/ana_ben/messages/c').set({fromUid:'ben',type:'poll',text:'Café samedi ?',options:['Oui','Non'],votes:{ben:0},createdAt:Timestamp.fromMillis(Date.now()+1000)});
    const p=await browser.newPage();await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await login(p,'ana@t.fr');
    await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.friends&&S.friends.some(f=>f.uid==='ben'),null,30000);
    await p.evaluate(()=>openChatFor(S.friends.find(f=>f.uid==='ben')));
    await wf(p,()=>document.querySelectorAll('#chat-msgs .poll-opt').length===2,null,15000);
    const days=await p.evaluate(()=>[...document.querySelectorAll('#chat-msgs .chat-day')].map(e=>e.textContent));
    check('Jours affichés : « Hier » puis « Aujourd\'hui »',days.join()==='Hier,Aujourd\'hui',days);
    check('Heure sous chaque message',await p.evaluate(()=>[...document.querySelectorAll('#chat-msgs .msg-t')].every(e=>/\d\d:\d\d/.test(e.textContent))));
    await p.evaluate(()=>document.querySelectorAll('#chat-msgs .poll-opt')[1].click());
    const v=await (async()=>{for(let i=0;i<30;i++){const d=(await db.doc('chats/ana_ben/messages/c').get()).data();if(d.votes&&d.votes.ana===1)return d.votes;await sleep(300);}return (await db.doc('chats/ana_ben/messages/c').get()).data().votes;})();
    check('Sondage : Ana vote « Non » d\'un toucher',v.ana===1&&v.ben===0,v);
    await wf(p,()=>/2 votes/.test(document.querySelector('#chat-msgs .poll-n').textContent),null,10000).catch(()=>{});
    check('Sondage : nombre de votes affiché',await p.evaluate(()=>document.querySelector('#chat-msgs .poll-n').textContent)==='2 votes');
    const lr=await (async()=>{for(let i=0;i<20;i++){const d=(await db.doc('chats/ana_ben').get()).data();if(d.lastRead&&d.lastRead.ana)return true;await sleep(300);}return false;})();
    check('Ouvrir la conversation la marque lue (pour l\'ami)',lr);
    await db.doc('chats/ana_ben').update({'lastRead.ben':Timestamp.fromMillis(Date.now()+5000)});
    await wf(p,()=>[...document.querySelectorAll('#chat-msgs .msg-t.r')].some(e=>/Vu/.test(e.textContent)),null,10000).catch(()=>{});
    check('« Vu » sous mon dernier message quand Ben a lu',await p.evaluate(()=>[...document.querySelectorAll('#chat-msgs .msg-t.r')].map(e=>e.textContent).some(t=>/· Vu$/.test(t))));
    await p.evaluate(()=>{openPollComposer();document.getElementById('poll-q').value='Ciné ce soir ?';});
    await p.evaluate(()=>sendPoll());
    await sleep(1500);
    const polls=(await db.collection('chats/ana_ben/messages').where('type','==','poll').get()).docs.map(d=>d.data().text);
    check('Créer un sondage depuis le « + »',polls.includes('Ciné ce soir ?'),polls);
    // Suggestions d'amis
    await p.evaluate(()=>{goNav('social');socTab('friends',document.querySelector('.tab-btn[onclick*="friends"]'));});
    await wf(p,()=>/Dan/.test((document.getElementById('friend-sugg')||{}).textContent||''),null,15000).catch(()=>{});
    const sg=await p.evaluate(()=>(document.getElementById('friend-sugg')||{}).textContent||'');
    check('Suggestions : Dan, ami de Clé (1 ami en commun)',/Dan/.test(sg)&&/1 ami en commun/.test(sg),sg);
    await p.evaluate(()=>document.querySelector('#friend-sugg button').click());await sleep(1500);
    check('« Ajouter » envoie la demande d\'ami',(await db.doc('users/dan/notifications/friendreq_ana').get()).exists);
    check('Aucune erreur JavaScript',errs.length===0,errs);
    await p.close();
  });
  await browser.close();
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
