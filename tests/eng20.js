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
const AXE=require('fs').readFileSync(require('path').join(__dirname,'node_modules/axe-core/axe.min.js'),'utf8');
const axeCheck=async(p,name)=>{await p.evaluate(AXE);const r=await p.evaluate(async()=>{const res=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}});return res.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id+' ×'+v.nodes.length+' '+v.nodes.slice(0,3).map(n=>n.target.join(' ')+' '+((n.any[0]&&n.any[0].data&&n.any[0].data.fgColor)?n.any[0].data.fgColor+'/'+n.any[0].data.bgColor+' '+n.any[0].data.contrastRatio:'')).join(' ; '));});check('Accessibilité (axe, contraste compris) : '+name,r.length===0,r);};
const until=async(fn,t=15000)=>{const s=Date.now();while(Date.now()-s<t){if(await fn())return true;await sleep(300);}return false;};
const T8=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e).slice(0,400));}};
const DAY=86400000,NOW=Date.now();
(async()=>{
  await wipe();
  await db.doc('merchants/m1').set({role:'merchant',ownerUid:'m1',brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:'m1@shop.fr',seenDashTour:true,verifiedPopupShown:true,cashierAck:true,consentCount:3});
  await aauth.createUser({uid:'m1',email:'m1@shop.fr',password:'secret123'});
  const qs=[{q:'Quelle boisson préférez-vous ?',format:'mcq',options:['Café','Thé','Chocolat']},{q:'Note globale de notre accueil',format:'scale'},{q:'Que devrions-nous améliorer ?',format:'text'}];
  const base={merchantId:'m1',merchantName:'Le Fournil',sector:'Boulangerie',targetCity:'le-mans',city:'le-mans',cityLabel:'Le Mans',questions:qs,question:qs[0].q,questionsSchema:2};
  await db.doc('campaigns/cDone').set({...base,name:'Enquête accueil',status:'completed',completedReason:'duration',answersCount:72,createdAt:Timestamp.fromMillis(NOW-12*DAY),endsAt:Timestamp.fromMillis(NOW-2*DAY),durationDays:10,ageRanges:['18-24','35-49']});
  await db.doc('campaigns/cLive').set({...base,name:'Nouvelle carte',status:'active',answersCount:4,createdAt:Timestamp.fromMillis(NOW-2*DAY),questions:[qs[0]],question:qs[0].q});
  await db.doc('campaigns/cArch').set({...base,name:'Ancienne enquête',status:'completed',archived:true,archivedAt:Timestamp.now(),answersCount:6,createdAt:Timestamp.fromMillis(NOW-60*DAY),endsAt:Timestamp.fromMillis(NOW-40*DAY),questions:[qs[0]],question:qs[0].q});
  const A=(uid,cid,qi,answer,o={})=>db.doc(`answers/${uid}_${cid}_q${qi}`).set({userId:uid,campaignId:cid,merchantId:'m1',questionIdx:qi,answer,flagged:false,suspect:false,respondentCity:'le-mans',respondentAge:'',respondentInterests:[],discovery:false,responseMs:4000+((+uid.slice(1))%5)*1000,pointsAwarded:15,createdAt:Timestamp.fromMillis(NOW-(3+(+uid.slice(1)%8))*DAY-(+uid.slice(1))*3600000),...o});
  const boissons=[...Array(15).fill('Café'),...Array(9).fill('Thé'),...Array(6).fill('Chocolat')];
  const words=['pain frais chaque matin','plus de choix de pain','le pain est frais mais la file est longue','file d\'attente trop longue','pain sans gluten svp','ouvrir plus tôt le dimanche','ouvrir le dimanche matin','très bon accueil merci','prix un peu élevés','plus de viennoiseries','parking difficile','rien à signaler'];
  for(let i=0;i<30;i++){
    const aged=i<20, disc=i>=20;
    const prof=aged?{respondentAge:i<12?'18-24':'35-49',respondentInterests:i%2?['boulangerie','sport']:['boulangerie']}:{discovery:true};
    await A('u'+i,'cDone',0,boissons[i],prof);
    await A('u'+i,'cDone',1,String(1+(i%10)),prof);
    if(i<12)await A('u'+i,'cDone',2,words[i],prof);
  }
  for(let i=30;i<33;i++)await A('u'+i,'cDone',0,'Café',{flagged:true,suspect:true});   // lues trop vite : écartées
  for(let i=0;i<4;i++)await A('l'+i,'cLive',0,['Café','Thé'][i%2]);
  for(let i=0;i<6;i++)await A('a'+i,'cArch',0,'Café');
  for(let i=0;i<3;i++)await db.doc('consentEvents/e'+i).set({userId:'u'+i,merchantId:'m1',action:'granted',createdAt:Timestamp.fromMillis(NOW-(4+i)*DAY)});
  await db.doc('consentEvents/eOld').set({userId:'u9',merchantId:'m1',action:'granted',createdAt:Timestamp.fromMillis(NOW-100*DAY)});

  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const p=await browser.newPage();PG=p;await p.setViewport({width:1280,height:1000});const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.evaluateOnNewDocument(()=>{try{localStorage.setItem('nv_pro_intro','1');}catch(e){}});
  await p.goto(DASH,{waitUntil:'load'});await wf(p,()=>document.getElementById('auth-wall').style.display==='flex',null,30000);
  await p.evaluate(()=>awTab('login'));await setVal(p,'#aw-email','m1@shop.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
  await wf(p,()=>typeof _mCampaigns!=='undefined'&&_mCampaigns.length===3,null,30000);await sleep(800);
  await p.evaluate(()=>{try{endDashTour();}catch(e){}closeVerifiedModal&&closeVerifiedModal();});
  const goRes=()=>p.evaluate(()=>{closeResults();navTo('results',[...document.querySelectorAll('.sb-item')].find(b=>(b.getAttribute('onclick')||'').includes("'results'")));});

  await T8('liste des résultats',async()=>{
    await goRes();await sleep(400);
    const l=await p.evaluate(()=>({tabs:[...document.querySelectorAll('#results-camp-selector .rs-tab')].map(t=>t.textContent.replace(/\s+/g,' ').trim()+(t.classList.contains('on')?'*':'')),cards:[...document.querySelectorAll('#results-content .rs-card')].map(c=>({t:c.querySelector('.rs-card-t').textContent,pill:c.querySelector('.rs-pill').textContent,btns:[...c.querySelectorAll('button')].map(b=>b.textContent),n:c.querySelector('.rs-card-n').textContent.replace(/\s+/g,' ').trim(),d:c.querySelector('.rs-card-d').textContent}))}));
    check('Résultats : trois onglets Terminées (1) / En cours (1) / Archivées (1), « Terminées » ouvert par défaut',l.tabs.join()==='Terminées 1*,En cours 1,Archivées 1',l.tabs);
    check('Campagne terminée : pastille, dates (du … au …), nombre de réponses, boutons « Voir les résultats » et « Archiver »',l.cards.length===1&&l.cards[0].t==='Enquête accueil'&&l.cards[0].pill==='Terminée'&&/^Du .* au /.test(l.cards[0].d)&&/72 réponses/.test(l.cards[0].n)&&l.cards[0].btns.join()==='Voir les résultats,Archiver',l.cards);
    await axeCheck(p,'Résultats : liste');
    await p.evaluate(()=>document.querySelectorAll('#results-camp-selector .rs-tab')[1].click());
    const live=await p.evaluate(()=>[...document.querySelectorAll('#results-content .rs-card')].map(c=>({t:c.querySelector('.rs-card-t').textContent,btns:[...c.querySelectorAll('button')].map(b=>b.textContent)})));
    check('Onglet « En cours » : la campagne en cours, sans bouton Archiver (archivable seulement une fois terminée)',live.length===1&&live[0].t==='Nouvelle carte'&&live[0].btns.join()==='Voir les résultats',live);
  });

  await T8('détail d\'une campagne terminée',async()=>{
    await goRes();await sleep(300);
    await p.evaluate(()=>openResults('cDone'));await wf(p,()=>document.querySelectorAll('#results-content .rs-kpi').length===6,null,15000);await sleep(400);
    const d=await p.evaluate(()=>({head:document.querySelector('.rs-head').textContent.replace(/\s+/g,' '),kpis:[...document.querySelectorAll('.rs-kpi')].map(k=>k.textContent.replace(/\s+/g,' ').trim()),hl:[...document.querySelectorAll('.rs-hl li')].map(x=>x.textContent),rects:document.querySelectorAll('.rs-sec svg rect').length,bars:[...document.querySelectorAll('.rs-q:nth-of-type(1) .rs-bar-row')].length,qs:[...document.querySelectorAll('.rs-q')].map(q=>q.querySelector('.rs-q-n').textContent+'|'+q.querySelector('.rs-q-f').textContent),btns:[...document.querySelectorAll('.rs-actions button')].map(b=>b.textContent)}));
    check('En-tête : nom, question(s), pastille Terminée, dates, ville, tranches d\'âge ciblées ; boutons Archiver, Résumé, Réponses, Modifier, Supprimer',/Enquête accueil/.test(d.head)&&/Terminée/.test(d.head)&&/Le Mans/.test(d.head)&&/18-24, 35-49 ans/.test(d.head)&&/1\. Quelle boisson/.test(d.head)&&d.btns.join()==='Archiver la campagne,Résumé (CSV),Réponses (CSV),Modifier,Supprimer',d);
    // 30 répondants ; valides = 30 + 30 + 12 = 72 ; 3 écartées ; découverte = (10+10)/72 ; abonnés gagnés = 3 dans la période ; points 72 × 15
    check('Indicateurs : 72 réponses valides (3 écartées lues trop vite), 30 répondants (40 % ont répondu à toutes les questions), temps médian, 28 % de découverte, 3 nouveaux abonnés, 1 080 points',/^72réponses valides3 écartées/.test(d.kpis[0])&&/^30répondants40 % ont répondu à toutes/.test(d.kpis[1])&&/^\d+(,\d)? stemps de réponse médian/.test(d.kpis[2])&&/^28 %de découverte20 réponses/.test(d.kpis[3])&&/^3nouveaux abonnés/.test(d.kpis[4])&&/^1[\s\u202f\u00a0]?080points offerts/.test(d.kpis[5]),d.kpis);
    check('« À retenir » : réponse en tête (Café 50 %), participation, part de découverte, nouveaux abonnés',d.hl.some(x=>/Question 1 : « Café » arrive en tête avec 50 %/.test(x))&&d.hl.some(x=>/^3 nouveaux abonnés pendant la campagne/.test(x))&&d.hl.some(x=>/ne vous suivaient pas encore/.test(x)),d.hl);
    check('Calendrier des réponses : graphique par jour (une barre par jour de la campagne)',d.rects>=9&&d.rects<=13,d.rects);
    check('Trois blocs de questions, un par format (choix multiple, échelle, texte) avec leur nombre de réponses',d.qs.length===3&&/Question 1 \/ 3\|Choix multiple · 30 réponses/.test(d.qs[0])&&/Question 2 \/ 3\|Échelle 1–10 · 30 réponses/.test(d.qs[1])&&/Question 3 \/ 3\|Texte libre · 12 réponses/.test(d.qs[2]),d.qs);
    const q1=await p.evaluate(()=>{const q=document.querySelectorAll('.rs-q')[0];return {rows:[...q.querySelectorAll('.rs-bar-row')].map(r=>r.textContent.replace(/\s+/g,' ').trim()),tbl:!!q.querySelector('table'),head:[...q.querySelectorAll('thead th')].map(t=>t.textContent).join(),cafe:[...q.querySelectorAll('tbody tr')].find(r=>/Café/.test(r.textContent)).textContent.replace(/\s+/g,' ')};});
    check('Question à choix : Café 50 % (15), Thé 30 % (9), Chocolat 20 % (6), classées par score',q1.rows[0]==='Café50 % (15)'&&q1.rows[1]==='Thé30 % (9)'&&q1.rows[2]==='Chocolat20 % (6)',q1.rows);
    check('Croisement réponse × tranche d\'âge (abonnés) : tableau 18-24 / 35-49 avec les pourcentages',q1.tbl&&q1.head==='Réponse,18-24,35-49'&&/Café/.test(q1.cafe),q1);
    const q2=await p.evaluate(()=>{const q=document.querySelectorAll('.rs-q')[1];return {v:q.querySelector('.rs-scale-v').textContent,d:q.querySelector('.rs-scale-d').textContent,bars:q.querySelectorAll('.rs-bar-row').length};});
    check('Question échelle : moyenne 5,5/10 (notes 1 à 10 en nombre égal), médiane, part de notes ≥ 8 et ≤ 4, histogramme de 10 barres',/^5,5/.test(q2.v)&&/médiane 5,5/.test(q2.d)&&/30 % de notes ≥ 8/.test(q2.d)&&/40 % de notes ≤ 4/.test(q2.d)&&q2.bars===10,q2);
    const q3=await p.evaluate(()=>{const q=document.querySelectorAll('.rs-q')[2];return {words:[...q.querySelectorAll('.rs-word')].map(w=>w.textContent.replace(/\s+/g,' ').trim()),verb:q.querySelectorAll('.rs-verb').length,btn:(q.querySelector('button')||{}).textContent};});
    check('Question texte : « mots qui reviennent » (pain, dimanche, file…), 8 réponses affichées puis bouton « Voir les 12 réponses »',q3.words.some(w=>/^pain \d+$/.test(w))&&q3.words.some(w=>/^dimanche 2$/.test(w))&&q3.verb===8&&q3.btn==='Voir les 12 réponses',q3);
    await p.evaluate(()=>document.querySelectorAll('.rs-q')[2].querySelector('button').click());await sleep(300);
    check('« Voir les 12 réponses » : toutes les réponses s\'affichent (puis « Réduire »)',await p.evaluate(()=>document.querySelectorAll('.rs-q')[2].querySelectorAll('.rs-verb').length===12&&document.querySelectorAll('.rs-q')[2].querySelector('button').textContent==='Réduire'));
    const w=await p.evaluate(()=>({sections:[...document.querySelectorAll('.rs-sec-t')].map(x=>x.textContent.replace(/\s+/g,' ').trim()),notes:[...document.querySelectorAll('.rs-note')].map(x=>x.textContent)}));
    check('Moment de la journée, jour de la semaine, profil (âge des 20 abonnés, centres d\'intérêt), note « pas d\'âge pour les réponses découverte », comparaison à vos autres campagnes (5 réponses en moyenne)',w.sections.some(x=>/^Moment de la journée/.test(x))&&w.sections.some(x=>/^Jour de la semaine/.test(x))&&w.sections.some(x=>/^Âge \(20 abonnés\)/.test(x))&&w.sections.some(x=>/^Centres d'intérêt/.test(x))&&w.notes.some(x=>/réponses « découverte » n'en portent pas/.test(x))&&w.notes.some(x=>/Moyenne de vos autres campagnes : 5 réponses/.test(x)),w);
    await p.screenshot({path:'/tmp/shots/res_detail.png',fullPage:false});
    await axeCheck(p,'Résultats : détail d\'une campagne terminée');
    // exports
    await p.evaluate(()=>{window.__csv=[];window.csvDownload=(rows,n)=>{window.__csv.push({rows,n});};exportCampCSV();exportCampRawCSV();});
    const csv=await p.evaluate(()=>window.__csv);
    const raw=csv[1].rows;
    check('Export résumé : options de la question 1 (Café 15 / Thé 9 / Chocolat 6), sans les réponses écartées',csv[0].rows[0].join()==='Question,Réponse,Nombre,Pourcentage'&&csv[0].rows.some(r=>r[1]==='Café'&&r[2]===15)&&/^noova-resume-/.test(csv[0].n),csv[0].rows.slice(0,5));
    check('Export des réponses : 72 lignes (valides seulement), tranche d\'âge et origine (abonné / découverte), temps de réponse ; jamais d\'identifiant d\'habitant',raw.length===73&&raw[0].join()==='Date,Question n°,Question,Réponse,Tranche d\'âge,Origine,Temps de réponse (s)'&&raw.slice(1).filter(r=>r[5]==='découverte').length===20&&!/u\d+|userId/.test(JSON.stringify(raw)),{n:raw.length});
  });

  await T8('campagne en cours (seuil d\'anonymat)',async()=>{
    await goRes();await p.evaluate(()=>openResults('cLive'));await wf(p,()=>document.querySelectorAll('#results-content .rs-kpi').length===6,null,15000);
    const l=await p.evaluate(()=>({q:document.querySelector('.rs-q').textContent.replace(/\s+/g,' '),prof:[...document.querySelectorAll('.rs-masked')].map(x=>x.textContent).join('|'),act:[...document.querySelectorAll('.rs-actions button')].map(b=>b.textContent).join(),hint:(document.querySelector('.rs-hint')||{}).textContent}));
    check('En cours, 4 réponses : la question est masquée (« Encore 1 réponse … anonymat »), profil masqué, pas de bouton Archiver mais « Archivable une fois terminée »',/Encore 1 réponse avant d'afficher les résultats/.test(l.q)&&/à partir de 5 répondants/.test(l.prof)&&!/Archiver/.test(l.act)&&l.hint==='Archivable une fois terminée',l);
  });

  await T8('archiver / désarchiver',async()=>{
    await goRes();await p.evaluate(()=>openResults('cDone'));await wf(p,()=>document.querySelectorAll('#results-content .rs-kpi').length===6,null,15000);
    await p.evaluate(()=>[...document.querySelectorAll('.rs-actions button')].find(b=>/Archiver la campagne/.test(b.textContent)).click());
    await until(async()=>(await db.doc('campaigns/cDone').get()).data().archived===true);
    const d=(await db.doc('campaigns/cDone').get()).data();
    check('Archiver : la campagne est marquée archivée (statut Terminée conservé), avec la date d\'archivage',d.archived===true&&d.status==='completed'&&!!d.archivedAt,d);
    await sleep(500);
    const t=await p.evaluate(()=>({tabs:[...document.querySelectorAll('#results-camp-selector .rs-tab')].map(x=>x.textContent.replace(/\s+/g,' ').trim()+(x.classList.contains('on')?'*':'')),cards:[...document.querySelectorAll('#results-content .rs-card')].map(c=>c.querySelector('.rs-card-t').textContent+':'+[...c.querySelectorAll('button')].map(b=>b.textContent).join('/'))}));
    check('Après archivage : retour à la liste sur l\'onglet « Archivées » (2), avec « Désarchiver »',t.tabs.join()==='Terminées 0,En cours 1,Archivées 2*'&&t.cards.includes('Enquête accueil:Voir les résultats/Désarchiver'),t);
    await p.evaluate(()=>navTo('campaigns',[...document.querySelectorAll('.sb-item')].find(b=>(b.getAttribute('onclick')||'').includes("'campaigns'"))));await sleep(600);
    const list=await p.evaluate(()=>[...document.querySelectorAll('#page-campaigns .camp-row .camp-name')].map(x=>x.textContent));
    check('Mes campagnes : la campagne archivée n\'y figure plus (seule la campagne en cours reste)',list.length===1&&/Nouvelle carte/.test(list[0]),list);
    await p.evaluate(()=>{document.getElementById('camp-status-sel').value='archived';filterCampaigns();});await sleep(300);
    const arch=await p.evaluate(()=>[...document.querySelectorAll('#page-campaigns .camp-row')].map(x=>x.textContent.replace(/\s+/g,' ')));
    check('Filtre « Archivée » de Mes campagnes : les deux campagnes archivées',arch.length===2&&arch.some(x=>/Enquête accueil/.test(x))&&arch.some(x=>/Ancienne enquête/.test(x)),arch);
    await p.evaluate(()=>{document.getElementById('camp-status-sel').value='completed';filterCampaigns();});await sleep(300);
    check('Filtre « Terminée » (corrigé : il ne trouvait jamais rien) : aucune campagne non archivée terminée ici',await p.evaluate(()=>[...document.querySelectorAll('#page-campaigns .camp-row')].every(x=>!/Nouvelle carte/.test(x.textContent))));
    await p.evaluate(()=>{document.getElementById('camp-status-sel').value='';filterCampaigns();});
    await goRes();await p.evaluate(()=>{resTab('archived');});await sleep(200);
    await p.evaluate(()=>[...document.querySelectorAll('#results-content .rs-card')].find(c=>/Enquête accueil/.test(c.textContent)).querySelector('.tb-btn-ghost').click());
    await until(async()=>(await db.doc('campaigns/cDone').get()).data().archived===false);
    check('Désarchiver : la campagne revient dans « Terminées » et dans Mes campagnes',(await db.doc('campaigns/cDone').get()).data().archived===false&&await p.evaluate(()=>resGroups().done.some(c=>c.id==='cDone')),(await db.doc('campaigns/cDone').get()).data());
  });

  await T8('règles : on n\'archive qu\'une campagne terminée',async()=>{
    const r=await p.evaluate(async()=>{const t=async fn=>{try{await fn();return 'autorisé';}catch(e){return e.code;}};return {live:await t(()=>db.collection('campaigns').doc('cLive').update({archived:true})),done:await t(()=>db.collection('campaigns').doc('cDone').update({archived:true})),create:await t(()=>db.collection('campaigns').add({merchantId:auth.currentUser.uid,status:'completed',archived:true,questions:[{q:'x',format:'text'}],targetCity:'le-mans'}))};});
    check('Règles Firestore : archiver une campagne en cours est refusé ; une campagne terminée, autorisé ; créer une campagne déjà archivée, refusé',r.live==='permission-denied'&&r.done==='autorisé'&&r.create==='permission-denied',r);
    await db.doc('campaigns/cDone').update({archived:false});
  });
  check('Aucune erreur JavaScript',errs.length===0,errs);
  await browser.close();
  console.log('\n'+pass+' ok, '+fail+' échec(s)');process.exit(fail?1:0);
})();
