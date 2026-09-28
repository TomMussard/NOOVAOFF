process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const E=require(__dirname+'/../functions/engagement.js')._t;
const CFG=require(__dirname+'/../functions/engagementConfig.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,3).join(' | '));}};
const wf=(p,fn,arg,t=25000)=>p.waitForFunction(fn,{timeout:t,polling:200},arg);
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const CHROME=(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const APP='http://localhost:8950/app.html';
const Q='Quelle est ta boisson préférée ?';
const OPTS=['Café','Thé','Chocolat'];
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
async function mkUser(uid,o={}){await db.doc('users/'+uid).set({role:'user',welcomeClaimed:true,name:'User '+uid,city:'le-mans',cityLabel:'Le Mans',authorizedMerchants:['m1'],friendUids:[],answeredCampaigns:[],points:0,xp:0,streak:0,interests:['restauration'],onboardingStep:'done',seenHomeTour:true,...o});}
async function mkCampaign(id,o={}){await db.doc('campaigns/'+id).set({merchantId:'m1',merchantName:'Le Fournil',sector:'Boulangerie',status:'active',targetCity:'le-mans',city:'le-mans',question:Q,questions:[{q:Q,format:'mcq',options:OPTS}],targetVolume:500,answersCount:0,createdAt:Timestamp.now(),...o});}
async function ans(uid,cid,answer,o={}){await db.doc(`answers/${uid}_${cid}_q${o.q||0}`).set({userId:uid,campaignId:cid,questionIdx:o.q||0,answer,flagged:!!o.flagged,suspect:!!o.suspect,pointsAwarded:0,createdAt:Timestamp.now()});}
const reveal=(uid,cid,q=0)=>E.revealCore(uid,{campaignId:cid,questionIdx:q});
const err=async fn=>{try{await fn();return null;}catch(e){return e.code||String(e);}};

(async()=>{
  // ═════════ REVEAL : logique serveur ═════════
  await T('reveal core',async()=>{
    await wipe();
    await db.doc('merchants/m1').set({brandName:'Le Fournil',sector:'Boulangerie',city:'le-mans',status:'verified'});
    await mkCampaign('c1');
    for(const u of ['me','a','b','c','d','e','f','g']) await mkUser(u);
    await mkUser('nofriend');
    check('Reveal : refusé tant qu\'on n\'a pas répondu',await err(()=>reveal('me','c1'))==='permission-denied');
    await ans('me','c1','Café');
    let r=await reveal('me','c1');
    check('Reveal : pas de seuil minimum, pourcentage dès la 1re réponse',r.available&&!r.belowThreshold&&r.n===1&&r.options[0].pct===100,r);
    for(const [u,a] of [['a','Café'],['b','Café'],['c','Café']]) await ans(u,'c1',a);
    await db.doc('campaignStats/c1').delete();                       // réponses insérées à la main : on force le recomptage
    r=await reveal('me','c1');
    check('Reveal : 4 réponses, toujours pas de seuil, pourcentages exacts',!r.belowThreshold&&r.n===4,r);
    for(const [u,a] of [['d','Thé'],['e','Thé'],['f','Chocolat'],['g','Café']]) await ans(u,'c1',a);
    await db.doc('campaignStats/c1').delete();
    r=await reveal('me','c1');
    check('Reveal : au seuil, pourcentages exacts (5 Café / 2 Thé / 1 Chocolat sur 8)',r.n===8&&!r.belowThreshold&&r.options.map(o=>o.pct).join()==='63,25,13'&&r.options.map(o=>o.count).join()==='5,2,1',r.options);
    check('Reveal : ma réponse est identifiée',r.myIdx===0);
    check('Reveal : aucune identité d\'inconnu dans la réponse (pas d\'ami)',r.friends.length===0&&!JSON.stringify(r).includes('User a'));
    check('Reveal : recomptage automatique des anciennes réponses (drapeau bf)',(await db.doc('campaignStats/c1').get()).data().bf===true);
    // amis
    await db.doc('users/me').update({friendUids:['a','b','c','d','ghost','nofriend']});
    await db.doc('users/a').update({friendUids:['me']});                    // réciproque, partage par défaut
    await db.doc('users/b').update({friendUids:['me'],shareAnswers:false}); // réciproque, partage coupé
    await db.doc('users/c').update({friendUids:[]});                        // NON réciproque
    await db.doc('users/d').update({friendUids:['me'],photoUrl:'https://x/y.jpg'});
    r=await reveal('me','c1');
    const fr=r.friends.map(f=>f.uid).sort().join();
    check('Reveal amis : réciproques qui partagent (a, d) ; pas b (partage coupé), pas c (non réciproque), pas d\'inconnu',fr==='a,d',r.friends);
    check('Reveal amis : chacun sous son option, avec nom et photo',r.friends.find(f=>f.uid==='a').optionIdx===0&&r.friends.find(f=>f.uid==='d').optionIdx===1&&r.friends.find(f=>f.uid==='d').photoUrl==='https://x/y.jpg');
    check('Reveal : l\'ami qui coupe le partage compte toujours dans le global',r.n===8&&r.options[0].count===5);
    // format non concerné
    await mkCampaign('ct',{questions:[{q:'Libre ?',format:'text'}]});await ans('me','ct','du texte');
    r=await reveal('me','ct');
    check('Reveal : questions à texte libre exclues',r.available===false&&r.reason==='format',r);
    // question 2 d'une campagne
    await mkCampaign('c2',{questions:[{q:Q,format:'mcq',options:OPTS},{q:'Autre ?',format:'mcq',options:['Oui','Non']}]});
    await ans('me','c2','Café'); await ans('me','c2','Oui',{q:1});
    for(const u of ['a','b','c','d']) await ans(u,'c2','Non',{q:1});
    await db.doc('campaignStats/c2').delete();
    r=await reveal('me','c2',1);
    check('Reveal : par question d\'une campagne (Q2 : 1 Oui / 4 Non)',r.n===5&&r.options.map(o=>o.count).join()==='1,4',r);
    // réponse à une option modifiée depuis
    await ans('e','c2','Option disparue',{q:1});
    await db.doc('campaignStats/c2').delete();
    r=await reveal('me','c2',1);
    check('Reveal : une réponse à une option supprimée est ignorée (pas de crash)',r.n===5);
    // suspectes comptées, flaggées (trop rapides pour avoir été lues) exclues des résultats du commerçant
    await mkCampaign('c3');for(const [u,a,f,s] of [['me','Café',0,0],['a','Café',0,1],['b','Thé',1,1],['c','Thé',0,0],['d','Café',0,0],['e','Thé',0,0]]) await ans(u,'c3',a,{flagged:f,suspect:s});
    r=await reveal('me','c3');
    check('Reveal : les réponses suspectes comptent, la flaggée (b) est exclue (5 sur 6 écrites)',r.n===5,r.n);
    check('Reveal : campagne inconnue = refusé (pas de réponse à cette question)',await err(()=>E.revealCore('me',{campaignId:'zzz',questionIdx:0}))==='permission-denied');
    check('Reveal : entrée invalide refusée',await err(()=>E.revealCore('me',{}))==='invalid-argument');
    check('Config : le seuil vient de engagementConfig.js',CFG.REVEAL.MIN_ANSWERS===1&&CFG.RESPONSE_TIME.SUSPECT_MS===4000);
  });

  // ═════════ INTERFACE + submitAnswer réel ═════════
  await T('ui',async()=>{
    await wipe();
    await db.doc('merchants/m1').set({brandName:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified'});
    for(const u of ['u1','f1','f2','f3']) await aauth.createUser({uid:u,email:u+'@t.fr',password:'secret123'});
    await mkUser('u1',{email:'u1@t.fr',name:'Alice',friendUids:['f1','f2']});
    await mkUser('f1',{name:'Bob',friendUids:['u1']});
    await mkUser('f2',{name:'Chloé',friendUids:['u1'],shareAnswers:false});
    await mkUser('f3',{name:'Inconnu'});
    for(let i=1;i<=5;i++) await mkCampaign('k'+i,{name:'Camp '+i,question:'Question '+i+' ?',questions:[{q:'Question '+i+' ?',format:'mcq',options:['Oui','Non']}],createdAt:Timestamp.fromMillis(Date.now()-i*1000)});
    // Bob a déjà répondu à k1 (« Non »), Chloé (partage coupé) aussi ; 3 autres inconnus (« Oui »)
    await ans('f1','k1','Non');await ans('f2','k1','Non');await ans('f3','k1','Oui');
    for(const u of ['x1','x2','x3']) await ans(u,'k1','Oui');
    const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
    const p=await browser.newPage();await p.setViewport({width:430,height:900});
    const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.goto(APP,{waitUntil:'load'});
    await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','u1@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user&&S.qs.length>=5,null,30000);
    await p.addStyleTag({content:'body>div[style*="emulator"]{display:none!important}'});
    const answerFirst=async(idx,choice)=>{
      await p.evaluate(()=>{const t=document.getElementById('reveal-sheet');if(t)t.style.display='none';goNav('home');});
      await p.evaluate(i=>openQ(i),0);
      await wf(p,()=>document.querySelectorAll('#ans-area .mcq-opt').length>0);
      await p.evaluate(c=>{[...document.querySelectorAll('#ans-area .mcq-opt')].find(o=>o.textContent.trim()===c).click();},choice);
      await sleep(3300);
      await p.evaluate(()=>submitAns());
      await wf(p,()=>document.getElementById('reward').classList.contains('active'),null,15000);
    };
    // 1re réponse : k1 (sur laquelle il y a déjà 6 réponses + 1 = 7)
    const qid0=await p.evaluate(()=>S.qs[0]._firestoreId);
    check('Ordre du test : la première question est bien k1',qid0==='k1',qid0);
    await answerFirst(0,'Oui');
    await wf(p,()=>document.querySelector('#rw-reveal .rv:not(.rv-skel) .rv-row'),null,15000);
    await sleep(500);
    const rv=await p.evaluate(()=>({rows:[...document.querySelectorAll('#rw-reveal .rv-row')].map(r=>({l:r.querySelector('.rv-l').textContent.trim(),p:(r.querySelector('.rv-p')||{}).textContent,mine:r.classList.contains('mine'),av:r.querySelectorAll('.rv-av').length,names:[...r.querySelectorAll('.rv-av')].map(a=>a.title)})),h:document.querySelector('#rw-reveal .rv-h').textContent,foot:(document.querySelector('#rw-reveal .rv-foot')||{}).textContent,info:!!document.querySelector('#rw-reveal .rv-info')}));
    await p.evaluate(()=>{try{closeCelebration()}catch(e){}});await sleep(700);await p.screenshot({path:'/tmp/shots/reveal1.png'});
    check('Reveal (écran final) : répartition globale (Oui 5 / Non 2 sur 7 → 71 % / 29 %)',rv.rows[0].p==='71 %'&&rv.rows[1].p==='29 %'&&rv.rows[0].mine===true&&/7 réponses/.test(rv.foot),rv);
    check('Reveal : Bob sous « Non » avec son avatar ; Chloé (partage coupé) absente',rv.rows[1].av===1&&rv.rows[1].names.join()==='Bob'&&rv.rows[0].av===0,rv.rows);
    check('Reveal : information de confidentialité affichée la première fois',rv.info===true);
    // stats serveur produites par le vrai submitAnswer
    const st=(await db.doc('campaignStats/k1').get()).data();
    check('submitAnswer : compteurs par option mis à jour (bf + q0)',st&&st.q0&&st.q0.n>=7&&st.q0.c['0']===5,st);
    const a1=(await db.doc('answers/u1_k1_q0').get()).data();
    check('Temps de réponse enregistré côté serveur (≥ 3 s), catégorie et option',typeof a1.responseMs==='number'&&a1.responseMs>=3000&&a1.responseMs<9000&&a1.category==='boulangerie'&&a1.optionIdx===0,{ms:a1.responseMs,cat:a1.category,opt:a1.optionIdx});
    check('Réponse lue normalement : non suspecte ; seuil = 4 s',a1.suspect===false||a1.responseMs<4000,a1);
    let u=(await db.doc('users/u1').get()).data();
    check('Points du jour cumulés côté serveur',u.dailyPoints===15&&u.dailyPointsDate,{p:u.dailyPoints});
    const sub1=await p.$eval('#reward .rw-sub',e=>e.textContent);
    check('1re réponse : le bonus découverte est annoncé, plus de compte à rebours « encore X réponses »',/bonus découverte/.test(sub1)&&!/Encore \d+ réponse/.test(sub1),sub1);
    // 2e visite : l'info ne réapparaît pas
    await answerFirst(0,'Non');
    await wf(p,()=>document.querySelector('#rw-reveal .rv:not(.rv-skel) .rv-row'),null,15000);await sleep(500);
    check('Reveal : l\'information de confidentialité n\'apparaît qu\'une fois',await p.evaluate(()=>!document.querySelector('#rw-reveal .rv-info')));
    // 3e réponse : message de palier
    await answerFirst(0,'Oui');await sleep(1200);
    const palier=await p.$eval('#reward .rw-sub',e=>e.textContent.replace(/\s+/g,' '));
    await p.evaluate(()=>{try{closeCelebration()}catch(e){}});await sleep(700);await p.screenshot({path:'/tmp/shots/palier.png'});
    u=(await db.doc('users/u1').get()).data();
    check('3e réponse : « Tes X pts du jour sont validés » (montant réel, sans « mode libre »)',new RegExp('Tes '+u.dailyPoints+' pts du jour sont validés').test(palier)&&!/mode libre/i.test(palier)&&!/plus de points|ne gagnes plus/i.test(palier),[palier,u.dailyPoints]);
    check('3e réponse : le montant affiché est bien celui gagné (10+10+10 + 5 de bonus série)',u.dailyPoints===35,u.dailyPoints);
    // 4e question : mode libre
    await p.evaluate(()=>goNav('home'));await sleep(600);
    const home=await p.evaluate(()=>({tag:document.getElementById('tc-pts').textContent,track:document.getElementById('daily-track').textContent}));
    check('Accueil : la carte du jour affiche « +1 NOOV » ; le suivi parle de palier validé, sans « mode libre »',home.tag==='+1 NOOV'&&!/mode libre/i.test(home.track)&&/Tes 35 pts du jour sont validés/.test(home.track),home);
    await p.evaluate(()=>openQ(0));await wf(p,()=>document.querySelectorAll('#ans-area .mcq-opt').length>0);
    const q4=await p.evaluate(()=>({tag:document.getElementById('q-pts-tag').textContent,free:document.getElementById('q-pts-tag').classList.contains('free'),hint:document.getElementById('q-hint').textContent}));
    await p.evaluate(()=>{try{closeCelebration()}catch(e){}});await sleep(700);await p.screenshot({path:'/tmp/shots/freemode.png'});
    check('Question suivante : pastille « +1 NOOV », aucun texte « mode libre », pas de mention d\'interdiction',q4.tag==='+1 NOOV'&&!/mode libre/i.test(q4.hint)&&!/interdit|plus de points/i.test(q4.hint),q4);
    // réglage de confidentialité
    await p.evaluate(()=>{goNav('profile');refreshProfile();document.getElementById('share-answers-card').classList.add('open');});await sleep(400);
    check('Réglages : « Montrer mes réponses à mes amis » activé par défaut',await p.evaluate(()=>document.getElementById('share-answers-inp').checked===true));
    await p.evaluate(()=>document.getElementById('share-answers-inp').click());
    for(let i=0;i<20;i++){await sleep(300);if((await db.doc('users/u1').get()).data().shareAnswers===false)break;}
    check('Réglages : la désactivation est enregistrée',(await db.doc('users/u1').get()).data().shareAnswers===false);
    await p.evaluate(()=>{try{closeCelebration()}catch(e){}});await sleep(700);await p.screenshot({path:'/tmp/shots/privacy.png'});
    // client : aucun accès aux compteurs ni aux réponses des autres
    const acc=await p.evaluate(async()=>{const t=async fn=>{try{await fn();return 'allowed';}catch(e){return e.code;}};
      return {stats:await t(()=>db.collection('campaignStats').doc('k1').get()),other:await t(()=>db.collection('answers').doc('x1_k1_q0').get()),friendOk:await t(()=>db.collection('answers').doc('f1_k1_q0').get()),
        write:await t(()=>db.collection('users').doc(auth.currentUser.uid).update({dailyPoints:9999})),wpred:await t(()=>db.collection('users').doc(auth.currentUser.uid).update({predStats:{streak:99}}))};});
    check('Sécurité : compteurs de réponses illisibles côté client',acc.stats==='permission-denied',acc);
    check('Sécurité : réponse d\'un inconnu illisible',acc.other==='permission-denied',acc);
    check('Sécurité : le client ne peut pas modifier ses points du jour ni ses stats de prédiction',acc.write==='permission-denied'&&acc.wpred==='permission-denied',acc);
    const early=await p.evaluate(async()=>{try{await callGetReveal({campaignId:'k4',questionIdx:0});return 'ok';}catch(e){return e.code;}});
    check('Sécurité : getReveal refusé sur une question à laquelle on n\'a pas répondu',early==='functions/permission-denied',early);
    await browser.close();
    console.log('JS errors:',[...new Set(errs)].join(' | ')||'aucune');
  });
  console.log(`\n===== ${pass}/${pass+fail} OK =====`);process.exit(fail?1:0);
})();
