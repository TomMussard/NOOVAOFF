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
async function mkUser(uid,o={}){await db.doc('users/'+uid).set({role:'user',welcomeClaimed:true,name:'User '+uid,city:'le-mans',cityLabel:'Le Mans',authorizedMerchants:['m1'],friendUids:[],answeredCampaigns:[],points:0,xp:0,streak:0,interests:['restauration'],onboardingStep:'done',seenHomeTour:true,...o});}
async function mkCampaign(id,o={}){await db.doc('campaigns/'+id).set({merchantId:'m1',merchantName:'Le Fournil',sector:'Boulangerie',status:'active',targetCity:'le-mans',city:'le-mans',question:Q,questions:[{q:Q,format:'mcq',options:OPTS}],targetVolume:500,answersCount:0,createdAt:Timestamp.now(),...o});}

const DASH='http://localhost:8950/dash.html';
const AUTH='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake';
const idTokenOf=async(email)=>(await (await fetch(AUTH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'secret123',returnSecureToken:true})})).json()).idToken;
const callFn=async(name,data,token)=>{const r=await fetch('http://127.0.0.1:5001/noova-366d0/europe-west1/'+name,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({data})});const j=await r.json();return j.error?{error:j.error.status,message:j.error.message}:j.result;};
const until=async(fn,t=15000)=>{const s=Date.now();while(Date.now()-s<t){if(await fn())return true;await sleep(300);}return false;};
const N=require(__dirname+'/../functions/notifications.js')._t;
const T6=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e).slice(0,400));if(PG)console.log('DBG',JSON.stringify(await PG.evaluate(()=>({est:typeof _est!=='undefined'?_est:null,cnt:(document.getElementById('aud-count')||{}).textContent,foot:(document.getElementById('aud-footer')||{}).textContent,key:typeof _estKey!=='undefined'?_estKey:null})).catch(x=>String(x))),PG.__errs);}};
const luhn=(base)=>{const b=base.split('').map(Number);for(let c=0;c<10;c++){const d=[...b,c];let sum=0;for(let i=0;i<14;i++){let n=d[13-i];if(i%2===1){n*=2;if(n>9)n-=9;}sum+=n;}if(sum%10===0)return d.join('');}};
const SIRET_A=luhn('7328293200007'),SIRET_B=luhn('5520818500011'),SIRET_C=luhn('4433221100099');
const DAY=86400000;
(async()=>{
  await wipe();
  const mkM=(id,o={})=>db.doc('merchants/'+id).set({role:'merchant',ownerUid:id,brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:id+'@shop.fr',seenDashTour:true,verifiedPopupShown:true,cashierAck:true,...o});
  await mkM('m1');await mkM('m2',{brandName:'Le Bar',name:'Le Bar',sector:'Restauration'});await mkM('m3',{brandName:'Petit Angers',name:'Petit Angers',city:'angers',cityLabel:'Angers'});
  for(let i=1;i<=5;i++)await db.doc('rewards/m1_p'+i).set({merchantId:'m1',merchantName:'Le Fournil',city:'le-mans',label:'Récompense '+i,tier:i,slot:i,cost:[150,300,500,900,1500][i-1],priceConfirmed:true,monthlyQuota:20,timeSlots:[],withPurchase:false,minPurchase:null,status:'approved',active:true,approved:true,redeemedCount:0,createdAt:Timestamp.now()});
  // 60 habitants au Mans : 36 de 18-24 ans, 24 de 35-49 ans ; 5 à Angers
  for(let i=0;i<60;i++)await db.doc('users/u'+i).set({role:'user',welcomeClaimed:true,name:'U'+i,city:'le-mans',cityLabel:'Le Mans',ageRange:i<36?'18-24':'35-49',authorizedMerchants:['m1'],points:0,xp:0,createdAt:Timestamp.now()});
  for(let i=0;i<5;i++)await db.doc('users/a'+i).set({role:'user',welcomeClaimed:true,name:'A'+i,city:'angers',ageRange:'18-24',authorizedMerchants:[],points:0,xp:0,createdAt:Timestamp.now()});
  // 28 réponses valides sur 14 jours au Mans (2 par jour), 5 signalées (ignorées), 1 ancienne (ignorée)
  for(let i=0;i<28;i++)await db.doc('answers/x'+i).set({userId:'u'+(i%60),campaignId:'cx',respondentCity:'le-mans',flagged:false,createdAt:Timestamp.fromMillis(Date.now()-(i%13)*DAY-3600000)});
  for(let i=0;i<5;i++)await db.doc('answers/f'+i).set({userId:'u'+i,campaignId:'cx',respondentCity:'le-mans',flagged:true,createdAt:Timestamp.fromMillis(Date.now()-DAY)});
  await db.doc('answers/old').set({userId:'u1',campaignId:'cx',respondentCity:'le-mans',flagged:false,createdAt:Timestamp.fromMillis(Date.now()-40*DAY)});
  await db.doc('campaigns/other').set({merchantId:'m2',merchantName:'Le Bar',status:'active',targetCity:'le-mans',city:'le-mans',question:'Q ?',questions:[{q:'Q ?',format:'mcq',options:['a','b']}],answersCount:0,createdAt:Timestamp.now()});
  for(const id of ['m1','m2','m3'])await aauth.createUser({uid:id,email:id+'@shop.fr',password:'secret123'});
  await aauth.createUser({uid:'uu',email:'uu@t.fr',password:'secret123'});
  const t1=await idTokenOf('m1@shop.fr'),t3=await idTokenOf('m3@shop.fr'),tu=await idTokenOf('uu@t.fr');

  await T6('estimation serveur',async()=>{
    const e=await callFn('estimateCampaign',{ageRanges:['18-24'],questions:1},t1);
    check('Estimation : habitants de la ville du commerçant seulement (60, pas les 5 d\'Angers)',e.totalUsers===60&&e.city==='le-mans'&&e.cityLabel==='Le Mans',e);
    check('Estimation : filtre d\'âge « 18-24 » → 36 habitants éligibles (60 %)',e.pool===36&&Math.abs(e.share-0.6)<1e-9,e);
    check('Estimation : rythme réel = 28 réponses valides sur 14 jours (signalées et anciennes ignorées) = 2 par jour',e.answers14===28&&Math.abs(e.cityAnswersPerDay-2)<1e-9,e);
    check('Estimation : partagée avec la campagne déjà active (÷ 2) et le filtre d\'âge (× 0,6) = 0,6 réponse par jour ; assez de données',e.activeCampaigns===1&&Math.abs(e.perDay-0.6)<1e-9&&e.enoughData===true,e);
    check('Estimation : répartition réelle par âge des habitants (60 % de 18-24 ans, 40 % de 35-49 ans, 0 % ailleurs)',Math.abs(e.ageShare['18-24']-0.6)<1e-9&&Math.abs(e.ageShare['35-49']-0.4)<1e-9&&e.ageShare['65+']===0&&e.ageShare.unknown===0,e.ageShare);
    const e2=await callFn('estimateCampaign',{},t1);
    check('Sans filtre d\'âge : tous les habitants sont éligibles (60)',e2.pool===60&&e2.share===1,e2);
    const e3=await callFn('estimateCampaign',{ageRanges:['<script>','99-99'],questions:9},t1);
    check('Valeurs invalides ignorées (âge inconnu → pas de filtre ; questions bornées à 3)',e3.pool===60&&e3.questions===3,e3);
    const a=await callFn('estimateCampaign',{},t3);
    check('Commerçant d\'Angers : 5 habitants seulement, pas assez d\'activité → estimation non fiable annoncée',a.totalUsers===5&&a.city==='angers'&&a.enoughData===false&&a.perDay===0,a);
    check('Réservé aux commerçants connectés',(await callFn('estimateCampaign',{},tu)).error==='PERMISSION_DENIED'&&(await callFn('estimateCampaign',{},null)).error==='UNAUTHENTICATED');
  });

  await T6('objectif de volume facultatif + fin de campagne (serveur)',async()=>{
    const camp=(id,o={})=>db.doc('campaigns/'+id).set({merchantId:'m1',merchantName:'Le Fournil',sector:'Boulangerie',status:'active',targetCity:'le-mans',city:'le-mans',question:'Boisson ?',questions:[{q:'Boisson ?',format:'mcq',options:['Café','Thé']}],answersCount:0,createdAt:Timestamp.now(),...o});
    await camp('free',{answersCount:500});                                 // aucun objectif : pas de plafond
    await camp('legacy',{volumeTarget:10,answersCount:10});               // ancienne campagne avec objectif atteint
    await db.doc('users/uu').set({role:'user',welcomeClaimed:true,name:'Uu',email:'uu@t.fr',city:'le-mans',ageRange:'18-24',authorizedMerchants:['m1'],points:0,xp:0,answeredCampaigns:[]});
    await callFn('beginQuestion',{campaignId:'free',questionIdx:0},tu);await sleep(3300);
    const ok=await callFn('submitAnswer',{campaignId:'free',questionIdx:0,answerValue:'Café'},tu);
    check('Campagne sans objectif de volume : une 501e réponse est acceptée (aucun plafond)',!ok.error,ok);
    await callFn('beginQuestion',{campaignId:'legacy',questionIdx:0},tu);await sleep(3300);
    const ko=await callFn('submitAnswer',{campaignId:'legacy',questionIdx:0,answerValue:'Café'},tu);
    check('Ancienne campagne avec objectif atteint : toujours refusée (volume cible)',ko.error==='RESOURCE_EXHAUSTED',ko);
    // fin de campagne
    const now=Date.now();
    await camp('past',{endsAt:Timestamp.fromMillis(now-3600000)});await camp('future',{endsAt:Timestamp.fromMillis(now+5*DAY)});await camp('nolimit',{});
    const n=await N.expireCampaigns(now);
    const s=id=>db.doc('campaigns/'+id).get().then(d=>d.data().status);
    check('Balayage des campagnes : seule celle dont la durée est écoulée passe à « Terminée » (raison « duration »)',n>=1&&await s('past')==='completed'&&(await db.doc('campaigns/past').get()).data().completedReason==='duration'&&await s('future')==='active'&&await s('nolimit')==='active',n);
    await callFn('beginQuestion',{campaignId:'past',questionIdx:0},tu);
    const late=await callFn('submitAnswer',{campaignId:'past',questionIdx:0,answerValue:'Café'},tu);
    check('Répondre à une campagne terminée est refusé côté serveur',late.error==='FAILED_PRECONDITION',late);
  });

  // remise à l'état initial avant les tests d'interface : ni campagnes ni réponses ni habitant supplémentaires
  for(const id of ['free','legacy','past','future','nolimit'])await db.doc('campaigns/'+id).delete();
  for(const d of (await db.collection('answers').where('userId','==','uu').get()).docs)await d.ref.delete();
  await db.doc('users/uu').update({city:'zz'});
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const open=async(viewport={width:1280,height:900})=>{const ctx=await browser.createBrowserContext();const p=await ctx.newPage();await p.setViewport(viewport);p.__errs=[];p.on('pageerror',e=>p.__errs.push(e.message));p.on('dialog',d=>d.accept());await p.evaluateOnNewDocument(()=>{try{localStorage.setItem('nv_pro_intro','1');}catch(e){}});return p;};
  const p=await open();PG=p;
  await p.goto(DASH,{waitUntil:'load'});await wf(p,()=>document.getElementById('auth-wall').style.display==='flex',null,30000);
  await p.evaluate(()=>awTab('login'));await setVal(p,'#aw-email','m1@shop.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
  await wf(p,()=>typeof _mData!=='undefined'&&_mData&&_mData.brandName==='Le Fournil'&&document.getElementById('quota-card').style.display==='block',null,30000);
  await sleep(800);await p.evaluate(()=>{try{endDashTour();}catch(e){}closeVerifiedModal&&closeVerifiedModal();});
  const q=()=>callFn('getMyQuota',{},t1);

  await T6('assistant : localisation et durée',async()=>{
    await p.evaluate(()=>navTo('create',document.getElementById('nav-create')));await wf(p,()=>curPage==='create',null,8000);
    await p.evaluate(()=>{document.getElementById('q-text-inp').value='Quelle boisson préférez-vous ?';const o=document.querySelectorAll('#mcq-options .mcq-opt-inp');o[0].value='Café';o[1].value='Thé';document.getElementById('camp-name-inp').value='Test durée';wzGo(1);});
    await sleep(600);
    const loc=await p.evaluate(()=>({sel:!!document.getElementById('aud-loc-sel'),opt:document.querySelectorAll('#wz-panel-1 select option').length,txt:document.getElementById('wz-panel-1').textContent.replace(/\s+/g,' '),city:document.getElementById('aud-loc-city').textContent}));
    check('Localisation : plus aucun choix de ville ni de région (ni liste, ni « Toute la France »)',!loc.sel&&loc.opt===0&&!/Toute la France|Grandes régions|Villes actives/.test(loc.txt),loc);
    check('Localisation : affichée en lecture seule = la ville du commerce (Le Mans)',loc.city==='Le Mans'&&/habitants de Le Mans/.test(loc.txt),loc.city);
    await p.evaluate(()=>{document.querySelectorAll('.age-chip.sel').forEach(c=>c.classList.remove('sel'));document.querySelectorAll('.age-chip')[1].classList.add('sel');updAud();});
    await wf(p,()=>document.getElementById('aud-count').textContent==='36',null,10000);
    check('Profils éligibles : chiffre réel du serveur (36 habitants de 18-24 ans au Mans), plus une formule inventée',await p.evaluate(()=>document.getElementById('aud-count').textContent==='36'&&/60 habitants inscrits à Le Mans/.test(document.getElementById('aud-footer').textContent)),await p.evaluate(()=>document.getElementById('aud-footer').textContent));
    await p.screenshot({path:'/tmp/shots/dash_audience.png'});
    const dist=await p.evaluate(()=>({rows:[...document.querySelectorAll('#aud-preview-bars .aud-row')].map(r=>r.querySelector('.aud-lbl').textContent+'='+r.querySelector('.aud-val').textContent+(r.querySelector('.aud-fill').style.background.includes('coral')?'*':'')),title:document.getElementById('aud-dist-title').textContent,note:/ne restreignent pas encore/.test(document.getElementById('wz-panel-1').textContent)}));
    check('Répartition par âge = données réelles de la ville (18-24 ans 60 %, 35-49 ans 40 %), tranche choisie en couleur, titre avec la ville ; thèmes signalés comme indicatifs',dist.title==='Habitants de Le Mans par âge'&&dist.rows.join()==='16-17 ans=0%,18-24 ans=60%*,25-34 ans=0%,35-49 ans=40%,50-64 ans=0%,65+ ans=0%'&&dist.note,dist);
    await p.evaluate(()=>wzGo(2));await sleep(400);
    const d0=await p.evaluate(()=>({lbl:document.querySelector('#wz-panel-2 .step-card-title').textContent.replace(/\s+/g,' '),chips:[...document.querySelectorAll('#dur-chips .dur-chip')].map(b=>b.textContent+(b.classList.contains('sel')?'*':'')),est:document.getElementById('dur-est').textContent.replace(/\s+/g,' '),end:document.getElementById('dur-end').textContent,step:document.querySelectorAll('.wiz-step-lbl')[2].textContent,vol:!!document.getElementById('vol-sl')||!!document.getElementById('vol-num')}));
    check('Étape 3 « Durée » : facultative, « Sans limite » présélectionnée, options 7 / 14 / 30 / 60 / 90 jours, plus de curseur de volume',/Durée de la campagne facultatif/.test(d0.lbl)&&d0.chips.join()==='Sans limite*,7 jours,14 jours,30 jours,60 jours,90 jours'&&d0.step==='Durée'&&!d0.vol&&/Sans limite/.test(d0.end),d0);
    check('Estimation « sans limite » : par période de 30 jours = 11 à 25 réponses (0,6/jour, plafond 36 habitants), avec la base de calcul',/11 à 25 réponses/.test(d0.est)&&/par période de 30 jours/.test(d0.est)&&/60 habitants inscrits à Le Mans \(36 éligibles\)/.test(d0.est)&&/1 campagne déjà en ligne/.test(d0.est)&&/indicative/.test(d0.est),d0.est);
    await p.evaluate(()=>document.querySelector('#dur-chips .dur-chip[data-days="14"]').click());
    const d1=await p.evaluate(()=>({est:document.getElementById('dur-est').textContent.replace(/\s+/g,' '),end:document.getElementById('dur-end').textContent,sel:[...document.querySelectorAll('#dur-chips .dur-chip.sel')].map(b=>b.textContent),pressed:document.querySelector('#dur-chips .dur-chip[data-days="14"]').getAttribute('aria-pressed')}));
    const end14=new Date(Date.now()+14*DAY).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
    check('14 jours : estimation 5 à 12 réponses « sur 14 jours », date de fin affichée, bouton coché (aria-pressed)',/5 à 12 réponses/.test(d1.est)&&/sur 14 jours/.test(d1.est)&&d1.end==='La campagne se terminera le '+end14+'.'&&d1.sel.join()==='14 jours'&&d1.pressed==='true',d1);
    await setVal(p,'#dur-days','21');
    const d2=await p.evaluate(()=>({sel:document.querySelectorAll('#dur-chips .dur-chip.sel').length,est:document.getElementById('dur-est').textContent.replace(/\s+/g,' '),sim:document.getElementById('sim-delay').textContent,recapNow:_wzDays}));
    check('Nombre de jours libre (21) : boutons décochés, estimation recalculée, calendrier mis à jour',d2.sel===0&&/sur 21 jours/.test(d2.est)&&d2.sim==='21 jours'&&d2.recapNow===21,d2);
    await p.screenshot({path:'/tmp/shots/dash_duration.png'});
    await p.evaluate(()=>wzGo(3));await wf(p,()=>/éligible/.test(document.getElementById('recap-reach').textContent),null,10000);
    const rc=await p.evaluate(()=>({dur:document.getElementById('recap-vol').textContent,lbl:[...document.querySelectorAll('#wz-panel-3 .recap-lbl')].map(x=>x.textContent).join('|'),reach:document.getElementById('recap-reach').textContent,aud:document.getElementById('recap-aud').textContent}));
    check('Récapitulatif : « Durée 21 jours » (plus de « Volume »), audience = Le Mans + tranche, portée estimée avec les habitants éligibles',rc.dur==='21 jours'&&/Durée/.test(rc.lbl)&&!/Volume/.test(rc.lbl)&&/Le Mans · 18-24/.test(rc.aud)&&/sur 21 jours/.test(rc.reach)&&/36 habitants éligibles à Le Mans/.test(rc.reach),rc);
    await p.screenshot({path:'/tmp/shots/dash_recap.png'});
    // lancement avec durée
    const q0=(await q()).used;
    await p.evaluate(()=>launchCampaign());
    await until(async()=>(await db.collection('campaigns').where('merchantId','==','m1').where('name','==','Test durée').get()).size===1);
    const c1=(await db.collection('campaigns').where('name','==','Test durée').get()).docs[0].data();
    check('Campagne créée avec durée : durationDays 21, endsAt ≈ +21 jours, aucun objectif de volume, ville = Le Mans, tranche 18-24',c1.durationDays===21&&Math.abs(c1.endsAt.toMillis()-Date.now()-21*DAY)<3600000&&c1.targetVolume===undefined&&c1.volumeTarget===undefined&&c1.targetCity==='le-mans'&&c1.ageRanges.join()==='18-24',c1);
    await until(async()=>(await q()).used===q0+1);
    check('Le quota a compté la question (+1)',(await q()).used===q0+1,await q());
    // 2e campagne, cette fois sans limite (rien choisi)
    await p.evaluate(()=>{navTo('create',document.getElementById('nav-create'));});await sleep(600);
    await p.evaluate(()=>{resetWizard();document.getElementById('q-text-inp').value='Ouvert le dimanche ?';const o=document.querySelectorAll('#mcq-options .mcq-opt-inp');o[0].value='Oui';o[1].value='Non';document.getElementById('camp-name-inp').value='Sans limite';});
    check('Nouvelle campagne : la durée précédente n\'est pas reprise (« Sans limite »)',await p.evaluate(()=>_wzDays===null&&document.getElementById('dur-days').value===''&&document.querySelector('#dur-chips .dur-chip.sel').textContent==='Sans limite'));
    await p.evaluate(()=>launchCampaign());
    await until(async()=>(await db.collection('campaigns').where('name','==','Sans limite').get()).size===1);
    const c2=(await db.collection('campaigns').where('name','==','Sans limite').get()).docs[0].data();
    check('Campagne « Sans limite » : ni date de fin ni durée ni objectif',c2.endsAt===undefined&&c2.durationDays===undefined&&c2.targetVolume===undefined&&c2.volumeTarget===undefined,c2);
    global.__ids={timed:(await db.collection('campaigns').where('name','==','Test durée').get()).docs[0].id,free:(await db.collection('campaigns').where('name','==','Sans limite').get()).docs[0].id};
    check('Aucune erreur JavaScript dans l\'assistant',p.__errs.length===0,p.__errs);
  });

  await T6('liste et modification des campagnes',async()=>{
    await db.doc('campaigns/oldone').set({merchantId:'m1',merchantName:'Le Fournil',name:'Terminée par la durée',status:'active',targetCity:'le-mans',city:'le-mans',question:'Q ?',questions:[{q:'Q ?',format:'mcq',options:['a','b']}],answersCount:4,createdAt:Timestamp.fromMillis(Date.now()-20*DAY),endsAt:Timestamp.fromMillis(Date.now()-2*DAY),durationDays:18});
    await p.evaluate(()=>navTo('campaigns',document.querySelector('.sb-item[onclick*="campaigns"]')));
    await wf(p,()=>document.querySelectorAll('#page-campaigns .camp-row').length>=3,null,10000);
    const rows=await p.evaluate(()=>[...document.querySelectorAll('#page-campaigns .camp-row')].map(r=>({name:(r.querySelector('.camp-name')||{}).textContent,pill:(r.querySelector('.status-pill')||{}).textContent,prog:(r.querySelector('.camp-prog')||{}).textContent.replace(/\s+/g,' ').trim(),all:r.textContent.replace(/\s+/g,' ')})));
    const by=n=>rows.find(r=>(r.name||'').includes(n))||{};
    check('Liste : campagne à durée → « En cours » + « Fin le … » avec barre d\'avancement ; campagne sans limite → « Sans limite » ; plus d\'« obj. »',/^Fin le /.test(by('Test durée').prog)&&by('Test durée').pill==='En cours'&&by('Sans limite').prog==='Sans limite'&&!rows.some(r=>/obj\./.test(r.all)),rows);
    check('Liste : une campagne dont la durée est écoulée s\'affiche « Terminée » (même si le serveur ne l\'a pas encore passée en base)',by('Terminée par la durée').pill==='Terminée'&&/^Terminée le /.test(by('Terminée par la durée').prog),by('Terminée par la durée'));
    // modification de la durée d'une campagne terminée → elle repart
    await p.evaluate(()=>openEditCamp('oldone'));await sleep(300);
    const opts=await p.evaluate(()=>[...document.querySelectorAll('#edit-camp-dur option')].map(o=>o.textContent));
    check('Modification : champ « Durée » (facultatif) avec « inchangée », « Sans limite » et des durées à partir d\'aujourd\'hui',/Terminée le/.test(opts[0])&&/inchangée/.test(opts[0])&&opts[1]==='Sans limite de durée'&&opts.length===7,opts);
    await p.evaluate(()=>{document.getElementById('edit-camp-dur').value='30';saveEditCamp('oldone');});
    await until(async()=>{const d=(await db.doc('campaigns/oldone').get()).data();return d.durationDays===30;});
    const o1=(await db.doc('campaigns/oldone').get()).data();
    check('Prolonger une campagne terminée de 30 jours : elle repasse « En cours », nouvelle fin ≈ +30 jours',o1.status==='active'&&Math.abs(o1.endsAt.toMillis()-Date.now()-30*DAY)<3600000&&o1.durationDays===30,o1);
  });
  await T6('modification : retirer la durée',async()=>{
    await p.evaluate(id=>{openEditCamp(id);document.getElementById('edit-camp-dur').value='none';saveEditCamp(id);},global.__ids.timed);
    await until(async()=>(await db.doc('campaigns/'+global.__ids.timed).get()).data().endsAt===undefined);
    const t=(await db.doc('campaigns/'+global.__ids.timed).get()).data();
    check('« Sans limite de durée » : la date de fin est retirée',t.endsAt===undefined&&t.durationDays===undefined&&t.status==='active',t);
  });

  await T6('quota : la suppression est définitive et ne change pas le décompte',async()=>{
    const before=(await q()).used;
    const ids=(await db.collection('campaigns').where('merchantId','==','m1').get()).docs.filter(d=>d.data().name==='Sans limite').map(d=>d.id);
    let msg='';p.removeAllListeners('dialog');p.on('dialog',async d=>{msg=d.message();await d.accept();});
    await p.evaluate(id=>deleteCampaign(id,'Sans limite'),ids[0]);
    await until(async()=>!(await db.doc('campaigns/'+ids[0]).get()).exists);
    check('Suppression : la campagne disparaît définitivement de la base',!(await db.doc('campaigns/'+ids[0]).get()).exists);
    check('Le message de confirmation dit « définitivement », « irréversible » et que le quota n\'est ni rendu ni modifié',/définitivement/.test(msg)&&/irréversible/.test(msg)&&/ni rendues ni ajoutées/.test(msg),msg);
    await sleep(800);
    const after=await q();
    check('Après suppression : le quota du mois reste incrémenté (aucune question rendue)',after.used===before&&after.used>=2,{before,after:after.used});
    await p.evaluate(()=>loadQuota());await sleep(600);
    check('La carte « Questions de ce mois » du dashboard affiche le même décompte',await p.evaluate(u=>document.getElementById('quota-card').textContent.includes(u+' / 10'),after.used));
    await p.evaluate(()=>{navTo('create',document.getElementById('nav-create'));});await sleep(400);
    await p.evaluate(()=>{resetWizard();document.getElementById('q-text-inp').value='Nouvelle question ?';const o=document.querySelectorAll('#mcq-options .mcq-opt-inp');o[0].value='A';o[1].value='B';document.getElementById('camp-name-inp').value='Après suppression';launchCampaign();});
    await until(async()=>(await q()).used===before+1);
    check('Une nouvelle campagne s\'ajoute au décompte (+1) : ce qui est supprimé n\'est jamais retiré',(await q()).used===before+1,await q());
    // suppression avant même que le comptage ait tourné : la question est comptée quand même, sans erreur
    const ref=db.collection('campaigns').doc('flash');
    await ref.set({merchantId:'m1',merchantName:'Le Fournil',status:'active',targetCity:'le-mans',city:'le-mans',question:'Q ?',questions:[{q:'Q ?',format:'mcq',options:['a','b']}],answersCount:0,createdAt:Timestamp.now()});
    await ref.delete();
    await until(async()=>(await q()).used===before+2);
    check('Campagne créée puis supprimée aussitôt : sa question est comptée quand même',(await q()).used===before+2,await q());
  });

  await T6('inscription commerçant : SIRET en premier',async()=>{
    const s=await open({width:430,height:900});
    const api={};
    api[SIRET_A]={nom_complet:'BOULANGERIE DU CENTRE SARL',activite_principale:'10.71C',siege:{siret:SIRET_A},matching_etablissements:[{siret:SIRET_A,nom_commercial:'Boulangerie du Centre',adresse:'12 RUE GAMBETTA 72000 LE MANS',libelle_commune:'LE MANS',etat_administratif:'A',activite_principale:'10.71C'}]};
    api[SIRET_B]={nom_complet:'SALON BELLE SARL',activite_principale:'96.02A',siege:{siret:SIRET_B},matching_etablissements:[{siret:SIRET_B,nom_commercial:'',adresse:'5 PLACE DE LA REPUBLIQUE 49000 ANGERS',libelle_commune:'ANGERS',etat_administratif:'A',activite_principale:'96.02A'}]};
    api[SIRET_C]={nom_complet:'ANCIEN COMMERCE',activite_principale:'47.11B',siege:{siret:SIRET_C},matching_etablissements:[{siret:SIRET_C,nom_commercial:'Ancien commerce',adresse:'1 RUE X 72000 LE MANS',libelle_commune:'LE MANS',etat_administratif:'F',activite_principale:'47.11B'}]};
    s.__api=[];await s.setRequestInterception(true);
    s.on('request',r=>{const u=r.url();if(/recherche-entreprises\.api\.gouv\.fr/.test(u)){const k=(u.match(/q=(\d+)/)||[])[1];s.__api.push(k);return r.respond({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({results:api[k]?[api[k]]:[]})});}r.continue();});
    await s.goto(DASH,{waitUntil:'load'});await wf(s,()=>document.getElementById('auth-wall').style.display==='flex',null,30000);
    await s.evaluate(()=>awTab('register'));await sleep(300);
    const first=await s.evaluate(()=>{const vis=[...document.querySelectorAll('#auth-wall input, #auth-wall textarea, #auth-wall label')].filter(e=>e.offsetParent!==null&&e.id).map(e=>e.id);return {vis,intro:document.getElementById('aw-siret-intro').textContent,lbl:document.getElementById('aw-p-lbl').textContent};});
    check('Créer un compte : le premier champ est le SIRET (avec explication), puis nom, catégorie, ville, adresse ; e-mail et mot de passe à l\'étape suivante',first.vis[0]==='aw-siret'&&first.vis.includes('aw-brand')&&first.vis.includes('aw-address')&&!first.vis.includes('aw-email')&&/numéro SIRET/.test(first.intro)&&/Votre établissement/.test(first.lbl),first);
    await setVal(s,'#aw-siret',SIRET_A);
    await wf(s,()=>document.getElementById('aw-brand').value!=='',null,10000);
    const f1=await s.evaluate(()=>({brand:document.getElementById('aw-brand').value,sector:document.getElementById('aw-sector').value,city:document.getElementById('aw-city').value,addr:document.getElementById('aw-address').value,note:document.getElementById('aw-siret-note').textContent}));
    check('SIRET valide : nom, catégorie (NAF 10.71C → Boulangerie), ville et adresse remplis automatiquement',f1.brand==='Boulangerie du Centre'&&f1.sector==='Boulangerie'&&/^Le mans$/i.test(f1.city)&&f1.addr==='12 RUE GAMBETTA 72000 LE MANS'&&/Établissement trouvé/.test(f1.note),f1);
    await s.screenshot({path:'/tmp/shots/dash_signup.png'});
    // la personne corrige un champ, puis change de SIRET : ce qu'elle a écrit est conservé, le reste suit le nouveau SIRET
    await setVal(s,'#aw-brand','Ma Boulangerie à moi');
    await setVal(s,'#aw-siret',SIRET_B);
    await wf(s,()=>/Salon|SALON|Angers|ANGERS/.test(document.getElementById('aw-address').value),null,10000);
    const f2=await s.evaluate(()=>({brand:document.getElementById('aw-brand').value,sector:document.getElementById('aw-sector').value,city:document.getElementById('aw-city').value,addr:document.getElementById('aw-address').value}));
    check('Autre SIRET : le nom saisi à la main est conservé ; adresse, ville et catégorie (Beauté) suivent le nouvel établissement',f2.brand==='Ma Boulangerie à moi'&&f2.sector==='Beauté'&&/^Angers$/i.test(f2.city)&&/ANGERS/.test(f2.addr),f2);
    await setVal(s,'#aw-siret',SIRET_C);
    await wf(s,()=>/fermé/.test(document.getElementById('aw-siret-note').textContent),null,10000);
    await s.evaluate(()=>awSubmit());
    const errC=await s.$eval('#aw-err',e=>e.style.display==='block'?e.textContent:'');
    check('Établissement fermé dans le répertoire : signalé, et on ne peut pas continuer',/fermé/.test(errC)&&await s.evaluate(()=>_awStep===1),errC);
    await setVal(s,'#aw-siret','12345678901234');
    check('SIRET mal saisi : message immédiat (sans appel au répertoire)',await s.evaluate(()=>/ne semble pas valide/.test(document.getElementById('aw-siret-note').textContent)),null);
    await setVal(s,'#aw-siret','73282932');
    check('SIRET incomplet : aucune alerte',await s.evaluate(()=>document.getElementById('aw-siret-note').style.display==='none'));
    await setVal(s,'#aw-siret',SIRET_A);await wf(s,()=>/Établissement trouvé/.test(document.getElementById('aw-siret-note').textContent),null,10000);
    // étape 2 puis inscription complète
    await s.evaluate(()=>{document.getElementById('aw-sector').value='Boulangerie';});
    await s.evaluate(()=>awSubmit());await wf(s,()=>_awStep===2,null,8000);
    const step2=await s.evaluate(()=>({email:document.getElementById('aw-email').offsetParent!==null,name:document.getElementById('aw-firstname').offsetParent!==null,siret:document.getElementById('aw-siret').offsetParent!==null,lbl:document.getElementById('aw-p-lbl').textContent,btn:document.getElementById('aw-submit').textContent}));
    check('Étape 2 : prénom, nom, téléphone, e-mail, mot de passe ; bouton « Créer mon compte »',step2.email&&step2.name&&!step2.siret&&/Vous/.test(step2.lbl)&&step2.btn==='Créer mon compte',step2);
    await setVal(s,'#aw-firstname','Marie');await setVal(s,'#aw-lastname','Dupont');await setVal(s,'#aw-phone','0612345678');await setVal(s,'#aw-email','nouveau@shop.fr');await setVal(s,'#aw-pass','secret123');
    await s.evaluate(()=>awSubmit());
    await until(async()=>(await db.collection('merchants').where('email','==','nouveau@shop.fr').get()).size===1,25000);
    const nm=(await db.collection('merchants').where('email','==','nouveau@shop.fr').get()).docs[0].data();
    check('Compte créé « en attente » : SIRET, ville (le-mans), adresse issus du remplissage automatique, nom corrigé à la main conservé, catégorie',nm.status==='pending'&&nm.siret===SIRET_A&&nm.brandName==='Ma Boulangerie à moi'&&nm.city==='le-mans'&&/GAMBETTA/.test(nm.address)&&nm.sector==='Boulangerie'&&nm.firstName==='Marie',nm);
    await s.browserContext().close();
    // mur Google : même principe
    const g=await open({width:430,height:900});g.__api=[];await g.setRequestInterception(true);
    g.on('request',r=>{const u=r.url();if(/recherche-entreprises\.api\.gouv\.fr/.test(u)){const k=(u.match(/q=(\d+)/)||[])[1];return r.respond({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({results:api[k]?[api[k]]:[]})});}r.continue();});
    await g.goto(DASH,{waitUntil:'load'});await wf(g,()=>document.getElementById('auth-wall').style.display==='flex',null,30000);
    await g.evaluate(()=>{document.getElementById('auth-wall').style.display='none';document.getElementById('google-merchant-wall').style.display='flex';});
    const firstG=await g.evaluate(()=>[...document.querySelectorAll('#google-merchant-wall input')].map(i=>i.id)[0]);
    await setVal(g,'#gmw-siret',SIRET_A);await wf(g,()=>document.getElementById('gmw-brand').value!=='',null,10000);
    const gf=await g.evaluate(()=>({brand:document.getElementById('gmw-brand').value,sector:document.getElementById('gmw-sector').value,city:document.getElementById('gmw-city').value,addr:document.getElementById('gmw-address').value}));
    check('Inscription via Google : le SIRET est aussi demandé en premier et remplit le reste',firstG==='gmw-siret'&&gf.brand==='Boulangerie du Centre'&&gf.sector==='Boulangerie'&&/^Le mans$/i.test(gf.city)&&/GAMBETTA/.test(gf.addr),{firstG,gf});
    await g.browserContext().close();
  });
  check('Aucune erreur JavaScript côté dashboard',p.__errs.length===0,p.__errs);
  await browser.close();
  console.log('\n'+pass+' ok, '+fail+' échec(s)');process.exit(fail?1:0);
})();
