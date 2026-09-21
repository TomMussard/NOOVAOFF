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



const DASH='http://localhost:8950/dash.html';
const AUTH='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake';
const idTokenOf=async(email)=>(await (await fetch(AUTH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'secret123',returnSecureToken:true})})).json()).idToken;
const callFn=async(name,data,token)=>{const r=await fetch('http://127.0.0.1:5001/noova-366d0/europe-west1/'+name,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({data})});const j=await r.json();return j.error?{error:j.error.status,message:j.error.message}:j.result;};
const QT=require(__dirname+'/../functions/quota.js')._t;
const setClock=ms=>db.doc('_testClock/now').set({ms});
const T0=Date.parse('2026-09-21T10:00:00Z');
const camp=async(id,nq,o={})=>{const qs=[];for(let i=0;i<nq;i++)qs.push({q:'Question '+id+'-'+i+' ?',format:'mcq',options:['Oui','Non']});await db.doc('campaigns/'+id).set({merchantId:'m1',merchantName:'Le Fournil',sector:'Boulangerie',status:'active',targetCity:'le-mans',city:'le-mans',question:qs[0].q,questions:qs,targetVolume:100,answersCount:0,createdAt:Timestamp.now(),...o});};
const st=async id=>(await db.doc('campaigns/'+id).get()).data();
const used=async()=>((await db.doc('merchants/m1/quota/2026-09').get()).data()||{}).used||0;

const camps=async()=>(await db.collection('campaigns').get()).docs.map(d=>({id:d.id,...d.data()}));
(async()=>{
  await T('création multi-questions',async()=>{
    await wipe();
    await db.doc('merchants/m1').set({role:'merchant',ownerUid:'m1',brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:'m1@shop.fr',seenDashTour:true,verifiedPopupShown:true,cashierAck:true,monthlyQuestionQuota:50});
    for(let i=1;i<=5;i++)await db.doc('rewards/r'+i).set({merchantId:'m1',merchantName:'Le Fournil',city:'le-mans',label:'Cadeau '+i,slot:i,cost:50*i,valueEuros:i,status:'approved',active:true,createdAt:Timestamp.now()});
    await aauth.createUser({uid:'m1',email:'m1@shop.fr',password:'secret123'});
    const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
    const p=await browser.newPage();PG=p;await p.setViewport({width:1280,height:1000});const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.evaluateOnNewDocument(()=>{try{localStorage.setItem('nv_pro_intro','1');}catch(e){}});
    await p.goto(DASH,{waitUntil:'load'});await wf(p,()=>document.getElementById('auth-wall').style.display==='flex',null,30000);
    await p.evaluate(()=>awTab('login'));await setVal(p,'#aw-email','m1@shop.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>typeof _mData!=='undefined'&&_mData&&_mData.brandName==='Le Fournil',null,25000);
    await p.evaluate(()=>{try{endDashTour();}catch(e){}});
    await p.evaluate(()=>{window.__toasts=[];const o=window.showToast;window.showToast=(m,i)=>{window.__toasts.push(m);return o(m,i);};});
    const fill=(sel,vals)=>p.evaluate((sel,vals)=>{const ins=[...document.querySelectorAll(sel+' .mcq-opt-inp')];vals.forEach((v,i)=>{if(!ins[i]){const box=document.querySelector(sel);const d=document.createElement('div');d.className='mcq-option-row';d.innerHTML='<input class="mcq-opt-inp" placeholder="Option…">';box.appendChild(d);ins.push(d.firstChild);}ins[i].value=v;});},sel,vals);
    const reset=async()=>{await sleep(2300);await p.evaluate(()=>{navTo('create',document.getElementById('nav-create'));});};      // laisse passer la redirection automatique après un lancement
    const toasts=()=>p.evaluate(()=>window.__toasts.slice());
    // ── Cas 1 : Q1 choix, Q2 choix, Q3 échelle avec des options « fantômes » saisies avant de changer de format
    await reset();await sleep(800);
    await p.evaluate(()=>{document.getElementById('q-text-inp').value='Quelle est ta boisson préférée ?';addWizQ();addWizQ();document.getElementById('q2-text-inp').value='Tu viens à quelle heure ?';document.getElementById('q3-text-inp').value='Ta note globale ?';document.getElementById('camp-name-inp').value='Cas 1';});
    await fill('#mcq-options',['Café','Thé','Chocolat']);
    await fill('#q2-mcq-opts',['Matin','Midi','Soir']);
    await p.evaluate(()=>{const s=document.getElementById('q3-fmt-sel');s.value='mcq';showMcqForQ(3,'mcq');});
    await fill('#q3-mcq-opts',['Fantôme 1','Fantôme 2']);
    await p.evaluate(()=>{const s=document.getElementById('q3-fmt-sel');s.value='scale';showMcqForQ(3,'scale');});
    await p.evaluate(()=>launchCampaign());
    await until(async()=>(await camps()).some(c=>c.name==='Cas 1'));
    const c1=(await camps()).find(c=>c.name==='Cas 1');
    check('Q1 : ses options seulement (Café, Thé, Chocolat), sans celles des questions 2 et 3',c1&&c1.questions[0].options.join()==='Café,Thé,Chocolat',c1&&c1.questions[0]);
    check('Q2 : ses propres options (Matin, Midi, Soir)',c1.questions[1].format==='mcq'&&c1.questions[1].options.join()==='Matin,Midi,Soir',c1.questions[1]);
    check('Q3 en échelle : aucune option (les options « fantômes » du bloc caché ne sont pas enregistrées)',c1.questions[2].format==='scale'&&c1.questions[2].options.length===0,c1.questions[2]);
    check('Champs de la campagne : options = celles de Q1, format de Q1, schéma 2',c1.options.join()==='Café,Thé,Chocolat'&&c1.format==='mcq'&&c1.questionsSchema===2,{o:c1.options,f:c1.format,s:c1.questionsSchema});
    // ── Cas 2 : classement en Q1 et en Q2
    await reset();await sleep(800);
    await p.evaluate(()=>{document.getElementById('q-text-inp').value='Classe ces produits';selFmt(document.querySelectorAll('.fmt-card')[2],'rank');addWizQ();document.getElementById('q2-text-inp').value='Classe ces services';document.getElementById('q2-fmt-sel').value='rank';showMcqForQ(2,'rank');document.getElementById('camp-name-inp').value='Cas 2';});
    const bt=await p.$eval('#mcq-builder .qb-title',e=>e.textContent);
    await fill('#mcq-options',['Pain','Croissant','Tarte']);
    await fill('#q2-mcq-opts',['Livraison','Click&collect']);
    await p.evaluate(()=>launchCampaign());
    await until(async()=>(await camps()).some(c=>c.name==='Cas 2'));
    const c2=(await camps()).find(c=>c.name==='Cas 2');
    check('Classement : le constructeur d\'éléments s\'affiche (« Éléments à classer ») pour Q1 et Q2',bt==='Éléments à classer'&&await p.$eval('#q2-mcq-builder',e=>getComputedStyle(e).display!=='none'),bt);
    check('Classement : les éléments de Q1 et de Q2 sont enregistrés séparément',c2.questions[0].format==='rank'&&c2.questions[0].options.join()==='Pain,Croissant,Tarte'&&c2.questions[1].format==='rank'&&c2.questions[1].options.join()==='Livraison,Click&collect',c2.questions);
    // ── Cas 3 : validations
    const before=(await camps()).length;
    await reset();await sleep(800);
    await p.evaluate(()=>{window.__toasts=[];document.getElementById('q-text-inp').value='Une seule option ?';document.getElementById('camp-name-inp').value='Cas 3';});
    await fill('#mcq-options',['Seule','','']);
    await p.evaluate(()=>launchCampaign());await sleep(1200);
    check('Q1 avec une seule option : lancement refusé avec un message clair',(await camps()).length===before&&(await toasts()).some(t=>/Question 1 : ajoutez au moins 2/.test(t)),await toasts());
    await p.evaluate(()=>{window.__toasts=[];});
    await fill('#mcq-options',['Oui','oui','OUI']);
    await p.evaluate(()=>launchCampaign());await sleep(1200);
    check('Options identiques (Oui / oui / OUI) : comptées comme une seule → refusé',(await camps()).length===before&&(await toasts()).some(t=>/Question 1 : ajoutez au moins 2/.test(t)),await toasts());
    await fill('#mcq-options',['Oui','Non','']);
    await p.evaluate(()=>{window.__toasts=[];addWizQ();});
    await p.evaluate(()=>launchCampaign());await sleep(1200);
    check('Question 2 ajoutée mais vide : refusé (« rédigez-la ou retirez-la »)',(await camps()).length===before&&(await toasts()).some(t=>/Question 2 vide/.test(t)),await toasts());
    await p.evaluate(()=>{window.__toasts=[];document.getElementById('q2-text-inp').value='Et celle-ci ?';});
    await fill('#q2-mcq-opts',['Seule','']);
    await p.evaluate(()=>launchCampaign());await sleep(1200);
    check('Question 2 avec une seule option : refusé avec son numéro',(await camps()).length===before&&(await toasts()).some(t=>/Question 2 : ajoutez au moins 2/.test(t)),await toasts());
    await browser.close();
    console.log('JS errors:',[...new Set(errs)].join(' | ')||'aucune');
  });

  await T('assistant : une question = un bloc',async()=>{
    await wipe();
    await db.doc('merchants/m1').set({role:'merchant',ownerUid:'m1',brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:'m1@shop.fr',seenDashTour:true,verifiedPopupShown:true,cashierAck:true});
    for(let i=1;i<=5;i++)await db.doc('rewards/r'+i).set({merchantId:'m1',merchantName:'Le Fournil',city:'le-mans',label:'Cadeau '+i,slot:i,cost:50*i,valueEuros:i,status:'approved',active:true,createdAt:Timestamp.now()});
    await aauth.createUser({uid:'m1',email:'m1@shop.fr',password:'secret123'});
    const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
    const p=await browser.newPage();PG=p;await p.setViewport({width:1280,height:1100});const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.evaluateOnNewDocument(()=>{try{localStorage.setItem('nv_pro_intro','1');}catch(e){}});
    await p.goto(DASH,{waitUntil:'load'});await wf(p,()=>document.getElementById('auth-wall').style.display==='flex',null,30000);
    await p.evaluate(()=>awTab('login'));await setVal(p,'#aw-email','m1@shop.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>typeof _mData!=='undefined'&&_mData&&_mData.brandName==='Le Fournil',null,25000);
    await p.evaluate(()=>{try{endDashTour();}catch(e){}});
    await p.evaluate(()=>navTo('create',document.getElementById('nav-create')));await sleep(900);
    const st=await p.evaluate(()=>({steps:[...document.querySelectorAll('.wiz-step-btn .wiz-step-lbl')].map(e=>e.textContent),panels:document.querySelectorAll('.step-panel').length,
      q1:{text:!!document.querySelector('#wz-q-1 #q-text-inp'),fmt:document.querySelectorAll('#wz-q-1 #fmt-grid .fmt-card').length,opts:!!document.querySelector('#wz-q-1 #mcq-options')}}));
    check('Assistant en 4 étapes : Questions, Audience, Durée, Validation (plus d\'étape « Format » séparée)',st.steps.join()==='Questions,Audience,Durée,Validation'&&st.panels===4,st);
    check('Question 1 : rédaction, format de réponse et options dans le MÊME bloc',st.q1.text&&st.q1.fmt===3&&st.q1.opts,st.q1);
    await p.evaluate(()=>{addWizQ();});
    const q2=await p.evaluate(()=>({text:!!document.querySelector('#wz-q-extra-2 #q2-text-inp'),fmt:document.querySelectorAll('#wz-q-extra-2 .qfmt .fmt-card').length,opts:!!document.querySelector('#wz-q-extra-2 #q2-mcq-opts'),vis:getComputedStyle(document.getElementById('wz-q-extra-2')).display}));
    check('Question 2 ajoutée : son propre bloc avec rédaction, 3 formats et options',q2.text&&q2.fmt===3&&q2.opts&&q2.vis!=='none',q2);
    await p.evaluate(()=>document.querySelectorAll('#q2-fmt .fmt-card')[2].click());
    const r=await p.evaluate(()=>({val:document.getElementById('q2-fmt-sel').value,title:document.querySelector('#q2-mcq-builder .qb-title').textContent,shown:getComputedStyle(document.getElementById('q2-mcq-builder')).display!=='none',sel:[...document.querySelectorAll('#q2-fmt .fmt-card')].map(c=>c.classList.contains('sel'))}));
    check('Question 2 → Classement : format mémorisé, constructeur « Éléments à classer » affiché, bouton actif',r.val==='rank'&&r.title==='Éléments à classer'&&r.shown&&r.sel.join()==='false,false,true',r);
    await p.evaluate(()=>document.querySelectorAll('#q2-fmt .fmt-card')[1].click());
    check('Question 2 → Échelle : plus d\'options à saisir',await p.evaluate(()=>document.getElementById('q2-fmt-sel').value==='scale'&&getComputedStyle(document.getElementById('q2-mcq-builder')).display==='none'));
    check('Le format de la question 1 n\'a pas bougé (choix multiple)',await p.evaluate(()=>curFmt==='mcq'&&document.querySelectorAll('#fmt-grid .fmt-card')[0].classList.contains('sel')));
    // aperçu + récapitulatif
    await p.evaluate(()=>{document.getElementById('q-text-inp').value='Quelle boisson ?';document.querySelectorAll('#mcq-options .mcq-opt-inp').forEach((i,k)=>{i.value=['Café','Thé','Chocolat'][k]||'';i.dispatchEvent(new Event('input',{bubbles:true}));});document.getElementById('q2-text-inp').value='Ta note ?';document.getElementById('camp-name-inp').value='Aperçu';});
    await sleep(200);
    const pv=await p.$eval('#wz-panel-0 .preview-ans-placeholder',e=>e.textContent.replace(/\s+/g,' '));
    check('Aperçu de l\'app : affiche les options saisies pour la question 1',/Café/.test(pv)&&/Thé/.test(pv)&&/Chocolat/.test(pv),pv);
    await p.evaluate(()=>document.querySelectorAll('#fmt-grid .fmt-card')[1].click());await sleep(150);
    check('Aperçu de l\'app : format échelle → curseur',/Pas du tout/.test(await p.$eval('#wz-panel-0 .preview-ans-placeholder',e=>e.textContent)));
    await p.evaluate(()=>document.querySelectorAll('#fmt-grid .fmt-card')[0].click());
    await p.evaluate(()=>{wzGo(3);});await sleep(400);
    const rc=await p.evaluate(()=>({q:document.getElementById('recap-q').textContent,f:document.getElementById('recap-fmt').textContent}));
    check('Validation : récapitulatif de toutes les questions et de leurs formats',/Quelle boisson/.test(rc.q)&&/\+ 1 autre question/.test(rc.q)&&/Q1 Choix multiple \(3\)/.test(rc.f)&&/Q2 Échelle 1–10/.test(rc.f),rc);
    await p.evaluate(()=>wzGo(0));await sleep(300);
    await p.screenshot({path:'/tmp/shots/wizard_new.png'});
    await browser.close();
    console.log('JS errors:',[...new Set(errs)].join(' | ')||'aucune');
  });

  await T('anciennes campagnes (données déjà mélangées)',async()=>{
    await wipe();
    await db.doc('merchants/m1').set({brandName:'Le Fournil',sector:'Boulangerie',city:'le-mans',status:'verified'});
    // campagne créée AVANT la correction : options de Q1 = Q2 (X,Y) + Q3 (P,Q) + Q1 (A,B,C), dans l'ordre de la page
    await mkCampaign('old',{question:'Q1 ?',format:'mcq',options:['X','Y','P','Q','A','B','C'],questions:[{q:'Q1 ?',format:'mcq',options:['X','Y','P','Q','A','B','C']},{q:'Q2 ?',format:'mcq',options:['X','Y']},{q:'Q3 ?',format:'rank',options:['P','Q']}]});
    // campagne récente : deux questions aux options en partie communes → aucune réparation
    await mkCampaign('new',{question:'N1 ?',format:'mcq',options:['Jamais','Parfois','Souvent','Toujours'],questionsSchema:2,questions:[{q:'N1 ?',format:'mcq',options:['Jamais','Parfois','Souvent','Toujours']},{q:'N2 ?',format:'mcq',options:['Jamais','Parfois']}]});
    await mkUser('me',{email:'me@t.fr'});await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});
    for(let i=0;i<6;i++)await ans('s'+i,'old',['A','B','C'][i%3]);
    await ans('me','old','A');await db.doc('campaignStats/old').delete().catch(()=>{});
    const r=await E.revealCore('me',{campaignId:'old',questionIdx:0});
    check('Reveal (serveur) d\'une ancienne campagne : seulement les options de Q1 (A, B, C)',r.options.map(o=>o.text).join()==='A,B,C',r.options.map(o=>o.text));
    const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
    const p=await browser.newPage();PG=p;await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user&&S.qs.length>=2,null,30000);
    const qs=await p.evaluate(()=>S.qs.map(q=>({id:q._firestoreId,opts:q.opts,survey:(q.survey||[]).map(s=>({t:s.type,o:s.opts}))})));
    const old=qs.find(q=>q.id==='old'),nw=qs.find(q=>q.id==='new');
    check('App : ancienne campagne → Q1 affiche A, B, C ; Q2 affiche X, Y ; Q3 (classement) P, Q',old.opts.join()==='A,B,C'&&old.survey[0].o.join()==='X,Y'&&old.survey[1].t==='rank'&&old.survey[1].o.join()==='P,Q',old);
    check('App : campagne récente (schéma 2) jamais « réparée », même si les listes se recoupent',nw.opts.join()==='Jamais,Parfois,Souvent,Toujours'&&nw.survey[0].o.join()==='Jamais,Parfois',nw);
    // démarrage depuis la page du commerce : options propres à chaque question + questions suivantes
    await p.evaluate(()=>{S._answered=[];startCampaignById('new');});
    await wf(p,()=>document.getElementById('question').classList.contains('active'),null,10000);
    const bp=await p.evaluate(()=>({opts:[...document.querySelectorAll('#ans-area .mcq-opt span')].map(e=>e.textContent),survey:(S.curQ.survey||[]).length}));
    check('Démarrage depuis la page du commerce : les options de Q1 et les questions suivantes sont bien chargées',bp.opts.join()==='Jamais,Parfois,Souvent,Toujours'&&bp.survey===1,bp);
    await browser.close();
  });
  console.log(`\n===== ${pass}/${pass+fail} OK =====`);process.exit(fail?1:0);
})();
