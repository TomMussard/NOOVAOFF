// Interfaces du nouveau système de points : « Ma vitrine récompenses » (dashboard), clients ramenés / panier moyen, validation d'un bon
// avec panier, points générés / dépensés (admin), et côté habitant « Palier N · X pts » sans aucun euro.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const TIERS=require(__dirname+'/../functions/tiers.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
let PG=null;const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,3).join(' | '));}};
const wf=(p,fn,arg,t=25000)=>p.waitForFunction(fn,{timeout:t,polling:200},arg);
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const CHROME=(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const DASH='http://localhost:8950/dash.html',APP='http://localhost:8950/app.html',ADMIN='http://localhost:8950/admin.html';
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
const AXE=require('fs').readFileSync(require('path').join(__dirname,'node_modules/axe-core/axe.min.js'),'utf8');
const axeCheck=async(p,name)=>{await p.evaluate(AXE);const r=await p.evaluate(async()=>{const res=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}});return res.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id+' ×'+v.nodes.length+' '+v.nodes.slice(0,3).map(n=>n.target.join(' ')+' '+((n.any[0]&&n.any[0].data&&n.any[0].data.fgColor)?n.any[0].data.fgColor+'/'+n.any[0].data.bgColor+' '+n.any[0].data.contrastRatio:'')).join(' ; '));});check('Accessibilité (axe, contraste compris) : '+name,r.length===0,r);};
const DAY=86400000;
const rw=(mid,tier,o={})=>({merchantId:mid,merchantName:'Le Fournil',city:'le-mans',label:'Récompense '+tier,icon:'🎁',tier,slot:tier,cost:TIERS[tier-1].pts,priceConfirmed:true,monthlyQuota:20,timeSlots:[],withPurchase:false,minPurchase:null,status:'approved',active:true,approved:true,redeemedCount:0,createdAt:Timestamp.now(),...o});

(async()=>{
  await wipe();
  await db.doc('merchants/m1').set({role:'merchant',ownerUid:'m1',brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:'m1@shop.fr',seenDashTour:true,verifiedPopupShown:true,cashierAck:true,monthlyQuestionQuota:50,pointsGenerated:45,pointsSpent:300});
  await aauth.createUser({uid:'m1',email:'m1@shop.fr',password:'secret123'});await aauth.createUser({uid:'adm',email:'tomussproduction@gmail.com',password:'secret123'});
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const p=await browser.newPage();PG=p;await p.setViewport({width:1280,height:1000});const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.evaluateOnNewDocument(()=>{try{localStorage.setItem('nv_pro_intro','1');}catch(e){}});
  await p.goto(DASH,{waitUntil:'load'});await wf(p,()=>document.getElementById('auth-wall').style.display==='flex',null,30000);
  await p.evaluate(()=>awTab('login'));await setVal(p,'#aw-email','m1@shop.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
  await wf(p,()=>typeof _mData!=='undefined'&&_mData&&_mData.brandName==='Le Fournil',null,25000);
  await p.evaluate(()=>{try{endDashTour();}catch(e){}});
  await p.evaluate(()=>{window.__toasts=[];const o=window.showToast;window.showToast=(m,i)=>{window.__toasts.push(m);return o(m,i);};});
  const toasts=()=>p.evaluate(()=>window.__toasts.splice(0));
  const doc=async id=>(await db.doc('rewards/'+id).get()).data();

  await T('vitrine : affichage',async()=>{
    await p.evaluate(()=>navTo('rewards',document.getElementById('nav-rewards')));await wf(p,()=>document.querySelectorAll('#reward-slots .card').length===5,null,10000);
    const v=await p.evaluate(()=>({nav:document.getElementById('nav-rewards').textContent.trim(),title:document.querySelector('#page-rewards').firstElementChild.textContent.replace(/\s+/g,' ').trim().slice(0,60),txt:document.getElementById('page-rewards').innerText.replace(/\s+/g,' '),inputs:document.querySelectorAll('#page-rewards input').length,heads:[...document.querySelectorAll('#reward-slots .card')].map(c=>c.firstElementChild.firstElementChild.firstElementChild.textContent.replace(/\s+/g,' ').trim()),prog:document.getElementById('rewards-progress').textContent.replace(/\s+/g,' ')}));
    check('Le menu et le titre sont renommés « Ma vitrine récompenses » (plus « Mes récompenses »)',v.nav==='Ma vitrine récompenses'&&/Ma vitrine récompenses/.test(v.title)&&!/Mes récompenses/.test(v.txt),v);
    check('5 cartes de palier : Palier N · X pts (150 / 300 / 500 / 900 / 1500, gros lot au 5e)',v.heads.length===5&&TIERS.every((t,i)=>v.heads[i].startsWith('Palier '+t.n+' · '+t.pts+' pts'))&&/gros lot/.test(v.heads[4]),v.heads);
    check('Fourchette de prix carte par palier : 1–3 €, 3–6 €, 6–10 €, 10–18 €, 18–30 €',TIERS.every(t=>v.txt.includes('entre '+t.min+' € et '+t.max+' €')),v.txt.slice(0,300));
    check('Aucun champ de saisie de prix ni de points avant de choisir une récompense',v.inputs===0,v.inputs);
    check('Les mots « coût » et « valeur » n\'apparaissent nulle part dans la vitrine',!/co[uû]t|valeur/i.test(v.txt),v.txt.match(/.{20}(co[uû]t|valeur).{20}/i));
    check('Progression : 0 / 5 paliers remplis, il faut remplir les 5 avant la première campagne',/0 \/ 5 paliers remplis/.test(v.prog)&&/avant de lancer votre première campagne/.test(v.prog),v.prog);
  });

  await T('vitrine : remplir les paliers',async()=>{
    await p.evaluate(()=>openRewardForm(1));
    const f=await p.evaluate(()=>({label:document.getElementById('rf-label-1').value,icon:document.getElementById('rf-icon-1').value,chips:[...document.querySelectorAll('#rf-chips-1 button')].map(b=>b.textContent),price:document.getElementById('rf-price-1').parentElement.textContent.replace(/\s+/g,' ').trim(),quota:document.getElementById('rf-quota-1').value,inputs:[...document.querySelectorAll('#rw-card-1 input')].map(i=>i.id||i.className).join(),txt:document.getElementById('rw-card-1').innerText.replace(/\s+/g,' ')}));
    check('Suggestions liées à la catégorie (boulangerie, palier 1) et 1re suggestion pré-remplie',f.label==='Viennoiserie offerte'&&f.chips.length===3&&f.chips.some(c=>/Cookie offert/.test(c)),f);
    check('Case à cocher « le prix carte de cet article est entre 1 € et 3 € »',/prix carte de cet article est entre 1 € et 3 €/.test(f.price),f.price);
    check('Formulaire : aucun champ prix ni points (seulement récompense, quota, créneaux, avec achat)',!/co[uû]t|valeur|points?\b/i.test(f.txt.replace(/Palier 1 · 150 pts/,''))&&!/value|cost|pts|price-eur/i.test(f.inputs.replace('rf-price-1','')),f.inputs);
    await p.evaluate(()=>{document.querySelector('#rf-chips-1 button:nth-child(2)').click();});
    check('Cliquer une suggestion remplit l\'intitulé et l\'icône',await p.evaluate(()=>document.getElementById('rf-label-1').value==='Cookie offert'&&document.getElementById('rf-icon-1').value==='🍪'));
    await p.evaluate(()=>saveReward(1,{disabled:false,textContent:''}));await sleep(500);
    check('Sans confirmer la fourchette de prix : refusé (message), rien n\'est enregistré',(await toasts()).some(t=>/Confirmez que le prix carte/.test(t))&&!(await doc('m1_p1')));
    await p.evaluate(()=>{document.getElementById('rf-price-1').checked=true;});
    await setVal(p,'#rf-quota-1','0');await p.evaluate(()=>saveReward(1,{disabled:false,textContent:''}));await sleep(500);
    check('Quota 0 : refusé',(await toasts()).some(t=>/quota mensuel/.test(t))&&!(await doc('m1_p1')));
    await setVal(p,'#rf-quota-1','15');await p.evaluate(()=>saveReward(1,{disabled:false,textContent:''}));await wf(p,()=>_rewardSlots.length===1,null,10000);
    const d=await doc('m1_p1');
    check('Palier 1 enregistré : identifiant m1_p1, coût 150 imposé par le palier, en attente de validation, prix confirmé, quota 15',d&&d.tier===1&&d.cost===150&&d.status==='pending'&&d.approved===false&&d.active===false&&d.priceConfirmed===true&&d.monthlyQuota===15&&d.label==='Cookie offert'&&d.withPurchase===false,d);
    // palier 2 : créneau + avec achat
    await p.evaluate(()=>openRewardForm(2));
    await p.evaluate(()=>{document.getElementById('rf-price-2').checked=true;addRewardSlotRow(2);document.getElementById('rf-buy-2').click();});
    await setVal(p,'#rf-min-2','13');await p.evaluate(()=>saveReward(2,{disabled:false,textContent:''}));await sleep(500);
    check('« Avec achat » : achat minimum de 13 € au palier 2 (max 12 €) refusé',(await toasts()).some(t=>/ne peut pas dépasser 12 €/.test(t))&&!(await doc('m1_p2')));
    await setVal(p,'#rf-min-2','12');await p.evaluate(()=>{const r=document.querySelector('#rf-slots-2 .rw-slot');r.querySelectorAll('.rw-day').forEach(c=>{c.checked=[1,2,3].includes(+c.value);});});
    await p.evaluate(()=>saveReward(2,{disabled:false,textContent:''}));await wf(p,()=>_rewardSlots.length===2,null,10000);
    const d2=await doc('m1_p2');
    check('Palier 2 : coût 300, créneaux lun–mer 14h–17h, avec achat minimum 12 €',d2&&d2.cost===300&&d2.withPurchase===true&&d2.minPurchase===12&&d2.timeSlots.length===1&&d2.timeSlots[0].from==='14:00'&&d2.timeSlots[0].to==='17:00'&&d2.timeSlots[0].days.slice().sort().join()==='1,2,3',d2);
    await p.evaluate(()=>navTo('create',document.getElementById('nav-create')));await sleep(1200);
    check('Première campagne bloquée tant que les 5 paliers ne sont pas remplis (2 sur 5)',await p.evaluate(()=>curPage)!=='create'&&(await toasts()).some(t=>/Remplissez encore 3 palier/.test(t)));
    for(const t of [3,4,5]){await p.evaluate(t=>{openRewardForm(t);document.getElementById('rf-price-'+t).checked=true;document.getElementById('rf-label-'+t).value='Ma récompense libre '+t;},t);await p.evaluate(t=>saveReward(t,{disabled:false,textContent:''}),t);await wf(p,n=>_rewardSlots.length>=n,t,10000);}
    const all=(await db.collection('rewards').where('merchantId','==','m1').get()).docs.map(x=>x.id+':'+x.data().cost).sort().join();
    check('Texte libre accepté ; 5 paliers, un document par palier, coût = celui du palier',all==='m1_p1:150,m1_p2:300,m1_p3:500,m1_p4:900,m1_p5:1500',all);
    check('Progression : « 5 / 5 paliers remplis »',/5 \/ 5 paliers remplis/.test(await p.evaluate(()=>document.getElementById('rewards-progress').textContent)));
    await p.evaluate(()=>navTo('create',document.getElementById('nav-create')));await wf(p,()=>curPage==='create',null,8000).catch(()=>{});
    check('Avec les 5 paliers remplis : la création de campagne s\'ouvre',await p.evaluate(()=>curPage)==='create');
  });

  await T('vitrine : validation, pause, réglages',async()=>{
    await p.evaluate(()=>navTo('rewards',document.getElementById('nav-rewards')));await sleep(600);
    check('Avant validation : badge « En attente de validation », aucun bouton de pause',await p.evaluate(()=>/En attente de validation/.test(document.getElementById('rw-card-1').textContent)&&!/pause/i.test(document.getElementById('rw-card-1').textContent)));
    await db.doc('rewards/m1_p1').update({status:'approved',active:true,approved:true,approvedAt:Timestamp.now()});
    await wf(p,()=>/Approuvée/.test(document.getElementById('rw-card-1').textContent),null,8000);
    await p.evaluate(()=>toggleRewardPause(1));await sleep(1000);
    let d=await doc('m1_p1');
    check('Pause : statut « paused », inactive',d.status==='paused'&&d.active===false&&await p.evaluate(()=>/En pause/.test(document.getElementById('rw-card-1').textContent)&&/Reprendre/.test(document.getElementById('rw-card-1').textContent)),d);
    await p.evaluate(()=>toggleRewardPause(1));await sleep(1000);d=await doc('m1_p1');
    check('Reprise : de nouveau approuvée et active',d.status==='approved'&&d.active===true,d);
    await p.evaluate(()=>openRewardForm(1));await setVal(p,'#rf-quota-1','30');await p.evaluate(()=>saveReward(1,{disabled:false,textContent:''}));await sleep(1200);d=await doc('m1_p1');
    check('Modifier seulement le quota : reste approuvée (pas de nouvelle validation)',d.monthlyQuota===30&&d.status==='approved'&&d.active===true,d);
    await p.evaluate(()=>openRewardForm(1));await setVal(p,'#rf-label-1','Cookie maison offert');await p.evaluate(()=>saveReward(1,{disabled:false,textContent:''}));await sleep(1200);d=await doc('m1_p1');
    check('Modifier l\'intitulé : repasse en attente de validation, désactivée',d.label==='Cookie maison offert'&&d.status==='pending'&&d.active===false,d);
    await p.evaluate(()=>openRewardForm(3));await sleep(300);
    await p.screenshot({path:'/tmp/shots/vitrine.png'});await axeCheck(p,'dashboard : Ma vitrine récompenses (formulaire ouvert)');
    await p.evaluate(()=>closeRewardForm());
  });

  await T('KPIs et validation au comptoir',async()=>{
    const now=Date.now(),monthAgo=Date.now()-40*DAY;
    const used=(id,uid,basket,fresh,at)=>db.doc('redemptions/'+id).set({userId:uid,merchantId:'m1',rewardId:'m1_p1',tier:1,cost:150,label:'x',code:id.toUpperCase().slice(0,4),status:'used',createdAt:Timestamp.fromMillis(at),usedAt:Timestamp.fromMillis(at),...(basket?{basketEuros:basket}:{}),...(fresh===null?{}:{newCustomer:fresh})});
    await used('ua1','u1',10,true,now-3600000);await used('ub2','u2',12,false,now-7200000);await used('uc3','u1',11,false,now-1800000);await used('ud4','u3',20,true,monthAgo);
    await wf(p,()=>document.getElementById('bring-val-0').textContent==='2',null,10000);
    const k=await p.evaluate(()=>({v:[0,1,2].map(i=>document.getElementById('bring-val-'+i).textContent),l:[...document.querySelectorAll('#bring-row .kpi-lbl')].map(x=>x.textContent)}));
    check('Tableau de bord : 2 clients ramenés ce mois (le bon d\'il y a 40 jours n\'est pas compté), dont 1 nouveau client, panier moyen 11,00 €',k.v.join('|')==='2|1|11,00 €'&&k.l.join('|')==='Clients ramenés ce mois|dont nouveaux clients|Panier moyen des clients NOOVA',k);
    await db.doc('redemptions/rd1').set({userId:'u9',merchantId:'m1',rewardId:'m1_p2',tier:2,cost:300,label:'Formule',code:'ABCD',status:'pending',minPurchase:8,createdAt:Timestamp.now(),expiresAt:Timestamp.fromMillis(Date.now()+3600000),usedAt:null});
    await p.evaluate(()=>navTo('validate',document.getElementById('nav-validate')));
    await setVal(p,'#voucher-code-inp','abcd');await p.evaluate(()=>validateVoucher());await wf(p,()=>/Confirmer l/.test(document.getElementById('voucher-result').innerHTML),null,8000);
    const vt=await p.$eval('#voucher-result',e=>e.innerText.replace(/\s+/g,' '));
    check('Bon reconnu : « Palier 2 » et achat minimum de 8 € visibles côté commerçant, champs panier + nouveau client',/Palier 2/.test(vt)&&/minimum 8 €/.test(vt)&&/Montant du panier/.test(vt)&&/nouveau client/.test(vt)&&!/co[uû]t|valeur/i.test(vt),vt);
    await p.evaluate(()=>document.querySelector('#voucher-result button').click());await sleep(700);
    check('Confirmer sans panier alors qu\'un achat minimum existe : refusé, bon toujours en attente',(await toasts()).some(t=>/Indiquez le montant du panier/.test(t))&&(await db.doc('redemptions/rd1').get()).data().status==='pending');
    await setVal(p,'#vch-basket','5');await p.evaluate(()=>document.querySelector('#voucher-result button').click());await sleep(700);
    check('Panier de 5 € sous l\'achat minimum de 8 € : refusé',(await toasts()).some(t=>/inférieur à l'achat minimum/.test(t))&&(await db.doc('redemptions/rd1').get()).data().status==='pending');
    await setVal(p,'#vch-basket','9.5');await p.evaluate(()=>{document.getElementById('vch-new').click();document.querySelector('#voucher-result button').click();});await sleep(1500);
    const r=(await db.doc('redemptions/rd1').get()).data();
    check('Panier de 9,50 € + nouveau client : bon validé avec le montant et l\'indicateur',r.status==='used'&&r.basketEuros===9.5&&r.newCustomer===true,r);
    await wf(p,()=>document.getElementById('bring-val-0').textContent==='3'&&document.getElementById('bring-val-1').textContent==='2',null,10000);
    check('Les KPIs suivent en direct (3 clients dont 2 nouveaux, panier moyen des 4 bons)',/^3\|2\|10,6[23] €$/.test(await p.evaluate(()=>[0,1,2].map(i=>document.getElementById('bring-val-'+i).textContent).join('|'))));
  });
  check('Aucune erreur JavaScript dans le dashboard',errs.length===0,errs);

  await T('admin : points générés / dépensés',async()=>{
    const a=await browser.newPage();const aerrs=[];a.on('pageerror',e=>aerrs.push(e.message));await a.setViewport({width:1200,height:1000});
    await a.goto(ADMIN,{waitUntil:'load'});await sleep(1500);
    await a.evaluate(async()=>{await auth.signInWithEmailAndPassword('tomussproduction@gmail.com','secret123');});
    await wf(a,()=>typeof allMerchants!=='undefined'&&allMerchants.length===1,null,20000);
    await a.evaluate(()=>filterMerchants('verified'));
    const row=await a.$eval('#list-all',e=>e.innerText.replace(/\s+/g,' '));
    check('Admin, liste des commerçants : « Points générés : 45 · dépensés chez lui : 300 »',/Points générés : 45 · dépensés chez lui : 300/.test(row),row);
    await a.evaluate(()=>openModal('m1'));await sleep(600);
    const md=await a.evaluate(()=>({g:document.getElementById('md-pts-gen').textContent,s:document.getElementById('md-pts-spent').textContent}));
    check('Admin, fiche du commerçant : points générés par ses questions (45 pts) et points dépensés chez lui (300 pts)',md.g==='45 pts'&&md.s==='300 pts',md);
    // Récompenses en attente : palier, prix carte confirmé, quota
    await db.doc('rewards/m1_p4').update({status:'pending',active:false});
    await a.evaluate(()=>loadRewardModeration());await sleep(800);
    await a.evaluate(()=>approveReward('m1_p4',null));await sleep(1200);
    const d=(await db.doc('rewards/m1_p4').get()).data();
    check('Admin : la validation d\'une récompense pose approved, status, active et approvedAt',d.approved===true&&d.status==='approved'&&d.active===true&&!!d.approvedAt,d);
    check('Aucune erreur JavaScript dans l\'admin',aerrs.length===0,aerrs);
    await a.close();
  });

  await T('app habitant : Palier N · X pts, aucun euro',async()=>{
    await wipe();
    await db.doc('merchants/m1').set({role:'merchant',ownerUid:'m1',brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:'m1@shop.fr'});
    await db.doc('users/me').set({role:'user',welcomeClaimed:true,name:'Alex',email:'me@t.fr',city:'le-mans',cityLabel:'Le Mans',authorizedMerchants:['m1'],friendUids:[],answeredCampaigns:[],points:400,xp:400,streak:0,interests:['restauration'],onboardingStep:'done',seenHomeTour:true});
    await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});
    for(let t=1;t<=5;t++)await db.doc('rewards/m1_p'+t).set(rw('m1',t,{label:['Café offert','Viennoiserie','Menu midi','Panier surprise','Gros lot'][t-1],withPurchase:t===2,minPurchase:t===2?12:null,monthlyQuota:50}));
    const u=await browser.newPage();const uerrs=[];u.on('pageerror',e=>uerrs.push(e.message));await u.setViewport({width:390,height:900,isMobile:true,hasTouch:true});
    await u.goto(APP,{waitUntil:'load'});await wf(u,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await u.evaluate(()=>showAuthWall('login'));await setVal(u,'#aw-email','me@t.fr');await setVal(u,'#aw-pass','secret123');await u.evaluate(()=>awSubmit());
    await wf(u,()=>document.getElementById('home').classList.contains('active')&&S.user&&(S._rewardsCache||[]).length===5,null,30000);
    await u.evaluate(()=>{document.querySelectorAll('[id*=tour],.tour-ov').forEach(e=>e.remove());openRewardsSheet();});await sleep(800);
    const g=await u.evaluate(()=>({cards:[...document.querySelectorAll('#gift-grid .gift-c')].map(c=>c.textContent.replace(/\s+/g,' ').trim()),sheet:document.getElementById('rewards-sheet').innerText,locked:document.querySelectorAll('#gift-grid .gift-c.locked').length}));
    check('Cartes : « Palier N · X pts » pour chaque récompense (150, 300, 500 débloquées avec 400 pts : 2 ; 900 et 1500 verrouillées)',g.cards.length===5&&g.cards[0].includes('Palier 1 · 150 pts')&&g.cards[4].includes('Palier 5 · 1500 pts')&&g.locked===3,g);
    check('Aucun euro nulle part côté habitant (feuille des récompenses)',!/€|euro/i.test(g.sheet),g.sheet.match(/.{15}(€|euro).{15}/i));
    await u.evaluate(()=>closeRewardsSheet&&closeRewardsSheet());
    await u.evaluate(()=>goNav('rewards-tab'));await sleep(800);
    const rt=await u.$eval('#rewards-tab',e=>e.innerText);
    check('Écran Récompenses : « Palier … » et aucun euro',/Palier \d · \d+ pts|Échanger/.test(rt)&&!/€|euro/i.test(rt),rt.match(/.{15}(€|euro).{15}/i));
    // échange puis limite hebdomadaire
    await u.evaluate(()=>{window.__r=redeemReward((S._rewardsCache||[]).find(r=>r.tier===2));});await wf(u,()=>document.getElementById('redeem-confirm'),null,8000);
    const conf=await u.$eval('#redeem-confirm',e=>e.innerText.replace(/\s+/g,' '));
    check('Confirmation : Palier 2 · 300 pts, il reste 100 pts, sans euro',/Palier 2 · 300 pts/.test(conf)&&/100 pts/.test(conf)&&!/€/.test(conf),conf);
    await u.evaluate(()=>document.getElementById('rc-yes').click());await wf(u,()=>document.getElementById('voucher-full'),null,15000);
    const vt=await u.$eval('#voucher-full',e=>e.innerText.replace(/\s+/g,' '));
    check('Bon plein écran : le code, la condition « avec un achat » SANS montant en euros',/Valable avec un achat/.test(vt)&&!/€/.test(vt)&&/^[A-Z2-9]{4}$/.test((await db.collection('redemptions').where('userId','==','me').get()).docs[0].data().code),vt);
    check('Solde débité côté serveur (400 → 100)',(await db.doc('users/me').get()).data().points===100);
    await u.evaluate(()=>closeVoucherFull());
    await db.doc('users/me').update({points:2000});await sleep(800);
    await u.evaluate(()=>{window.__toasts=[];const o=window.showToast;window.showToast=(m,i)=>{window.__toasts.push(m);return o(m,i);};window.__r=redeemReward((S._rewardsCache||[]).find(r=>r.tier===1));});await sleep(1500);
    const tt=await u.evaluate(()=>window.__toasts.join(' | '));
    check('Une récompense par commerçant et par semaine : message « Tu pourras à nouveau à partir du … », sans confirmation ni débit',/cette semaine/.test(tt)&&/Tu pourras à nouveau à partir du/.test(tt)&&(await db.doc('users/me').get()).data().points===2000,tt);
    check('Aucune erreur JavaScript dans l\'app',uerrs.length===0,uerrs);
  });

  await browser.close();
  console.log('\n'+pass+' ok, '+fail+' échec(s)');process.exit(fail?1:0);
})();
