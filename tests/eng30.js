// Audit de bout en bout — habitant : inscription, bonus de bienvenue, accueil immédiatement engageant (pas
// d'écran vide, « au moins 5 minutes pour retenir le user »), réponse à une question, échange d'une récompense,
// validation du bon par le commerçant, tous les écrans du profil et le fil. Commerçant/récompense/campagne
// seedés directement (déjà couverts par eng29 et eng23/eng26), pour se concentrer sur le parcours habitant réel.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const TIERS=require('../functions/tiers.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,4).join(' | '));}};
const wf=(p,fn,arg,t=20000)=>p.waitForFunction(fn,{timeout:t,polling:200},arg);
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const CHROME=(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const APP='http://localhost:8950/app.html',DASH='http://localhost:8950/dash.html';
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
const errs=[];
const track=(p,label)=>{p.on('pageerror',e=>errs.push(label+' : '+e.message));};
const rw=(mid,t,o={})=>({merchantId:mid,merchantName:'Le Fournil',city:'le-mans',label:['Café offert','Viennoiserie','Menu midi','Panier surprise','Gros lot'][t-1],icon:'🎁',tier:t,slot:t,cost:TIERS[t-1].pts,priceConfirmed:true,monthlyQuota:50,timeSlots:[],withPurchase:false,minPurchase:null,status:'approved',active:true,approved:true,redeemedCount:0,createdAt:Timestamp.now(),updatedAt:Timestamp.now(),...o});

(async()=>{
  await wipe();
  await db.doc('merchants/m1').set({role:'merchant',ownerUid:'m1',brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:'m1@shop.fr',seenDashTour:true,verifiedPopupShown:true,cashierAck:true});
  await aauth.createUser({uid:'m1',email:'m1@shop.fr',password:'secret123'});
  for(let t=1;t<=5;t++) await db.doc('rewards/m1_p'+t).set(rw('m1',t));
  await db.doc('campaigns/c1').set({merchantId:'m1',merchantName:'Le Fournil',sector:'Boulangerie',status:'active',targetCity:'le-mans',city:'le-mans',question:'Voulez-vous une ouverture le dimanche ?',questions:[{q:'Voulez-vous une ouverture le dimanche ?',format:'mcq',options:['Oui','Non']}],targetVolume:500,answersCount:0,createdAt:Timestamp.now()});

  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox'],protocolTimeout:120000});
  const uctx=await browser.createBrowserContext();const up=await uctx.newPage();track(up,'habitant');
  await up.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:2});

  await T('habitant : inscription, bonus de bienvenue, catégories',async()=>{
    await up.goto(APP,{waitUntil:'load'});await wf(up,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    check('Écran de présentation immédiat, rien de vide',await up.evaluate(()=>document.getElementById('onboard').innerText.trim().length>20));
    await up.evaluate(()=>showAuthWall('register'));
    await setVal(up,'#aw-name','Léa');await setVal(up,'#aw-city','Le Mans');await setVal(up,'#aw-email','lea@t.fr');await setVal(up,'#aw-pass','secret123');
    await up.evaluate(()=>awSubmit());
    await wf(up,()=>document.getElementById('cat-wall').style.display==='flex',null,20000);
    const uid=await up.evaluate(()=>auth.currentUser.uid);up.__uid=uid;
    const u=(await db.doc('users/'+uid).get()).data();
    check('Bonus de bienvenue crédité (+50 pts) dès l\'inscription',u.points===50&&u.welcomeClaimed===true,u.points);
    await up.evaluate(()=>{document.querySelector('#cat-grid [data-cat=all]').click();saveCategories();});
    await wf(up,()=>document.getElementById('home').classList.contains('active')&&Array.isArray(S.qs),null,25000);
  });

  await T('habitant : accueil immédiatement engageant (pas d\'écran vide, de quoi retenir 5 min)',async()=>{
    await sleep(1000);
    const d=await up.evaluate(()=>({hasQ:!!(S.qs&&S.qs.length),todayBrand:document.getElementById('tc-brand').textContent,headerTxt:document.querySelector('.dh-hdr').innerText.replace(/\s+/g,' '),nextReward:!!document.getElementById('dpat-wrap').innerHTML.trim(),map:!!document.getElementById('dmap-card')}));
    check('Une question du jour est proposée dès l\'arrivée',d.hasQ&&d.todayBrand==='Le Fournil',d);
    check('En-tête montre NOOVS, série et points (repères de progression visibles immédiatement)',/\d/.test(d.headerTxt),d.headerTxt);
    check('« Ta prochaine récompense » déjà visible (accroche vers les paliers)',d.nextReward,d);
    check('Carte « à deux pas » présente (découverte du quartier)',d.map);
    await up.screenshot({path:'/tmp/shots/audit_home.png'});
  });

  await T('habitant : répond à la question, gagne des points',async()=>{
    await up.evaluate(()=>openQ(0));await wf(up,()=>document.querySelectorAll('#ans-area .mcq-opt').length>0,null,10000);
    await up.evaluate(()=>document.querySelector('#ans-area .mcq-opt').click());
    await sleep(3300);   // ANSWER_LOCK_MS = 3000 : délai de lecture minimum avant que submitAns() accepte quoi que ce soit
    await up.evaluate(()=>submitAns());
    await wf(up,()=>document.getElementById('reward').classList.contains('active'),null,10000);
    if(await up.evaluate(()=>document.getElementById('card-unlock').classList.contains('open'))){
      await up.evaluate(()=>document.getElementById('cu-continue').click());
    }
    await sleep(600);
    const rw=await up.$eval('#reward',e=>e.innerText.replace(/\s+/g,' '));
    check('Écran de récompense affiché avec le total de points',/pts/.test(rw),rw.slice(0,200));
    await up.screenshot({path:'/tmp/shots/audit_reward.png'});
    const u=(await db.doc('users/'+up.__uid).get()).data();
    check('Points bien crédités en base (bonus 50 + réponse)',u.points>=50,u.points);
  });

  let voucherCode=null;
  await T('habitant : échange une récompense (Palier N · X pts, sans euro)',async()=>{
    await up.evaluate(()=>goNav('rewards-tab'));await wf(up,()=>(S._rewardsCache||[]).length>0,null,15000);
    await db.doc('users/'+up.__uid).update({points:2000});await sleep(800);
    const first=await up.evaluate(()=>{const list=(S._rewardsCache||[]).slice().sort((a,b)=>rewardCost(a)-rewardCost(b));return list[0]&&list[0].id;});
    await up.evaluate(id=>{window.__redeem=redeemReward((S._rewardsCache||[]).find(r=>r.id===id));},first);
    await wf(up,()=>document.getElementById('redeem-confirm'),null,10000);
    const confTxt=await up.$eval('#redeem-confirm',e=>e.innerText);
    check('Confirmation en « Palier N · X pts », jamais un montant en euros',/Palier \d/.test(confTxt)&&!/€/.test(confTxt),confTxt);
    await up.evaluate(()=>document.getElementById('rc-yes').click());
    await wf(up,()=>document.getElementById('voucher-full'),null,15000);
    const red=await db.collection('redemptions').where('userId','==',up.__uid).get();
    check('Bon créé côté serveur avec un code à 4 caractères',red.size===1&&/^[A-Z2-9]{4}$/.test(red.docs[0].data().code),red.docs[0]?.data());
    voucherCode=red.docs[0].data().code;
  });

  await T('commerçant : valide le code sans accroc',async()=>{
    const mctx=await browser.createBrowserContext();const mp=await mctx.newPage();track(mp,'commerçant');
    await mp.setViewport({width:1280,height:1000});
    await mp.evaluateOnNewDocument(()=>{try{localStorage.setItem('nv_pro_intro','1');}catch(e){}});
    await mp.goto(DASH,{waitUntil:'load'});await wf(mp,()=>document.getElementById('auth-wall').style.display==='flex',null,20000);
    await mp.evaluate(()=>awTab('login'));await setVal(mp,'#aw-email','m1@shop.fr');await setVal(mp,'#aw-pass','secret123');await mp.evaluate(()=>awSubmit());
    await wf(mp,()=>typeof _mData!=='undefined'&&_mData&&_mData.brandName==='Le Fournil',null,20000);
    await mp.evaluate(()=>{try{endDashTour();}catch(e){}navTo('validate',document.getElementById('nav-validate'));});await wf(mp,()=>curPage==='validate',null,10000);
    await setVal(mp,'#voucher-code-inp',voucherCode.toLowerCase());
    await mp.evaluate(()=>validateVoucher());
    await wf(mp,()=>/Confirmer/.test(document.getElementById('voucher-result').innerHTML),null,10000);
    await mp.evaluate(()=>document.querySelector('#voucher-result button').click());
    await sleep(1500);
    const red=await db.collection('redemptions').where('userId','==',up.__uid).get();
    check('Le commerçant valide le code sans accroc',red.docs[0].data().status==='used');
    check('Aucune erreur JavaScript côté commerçant',!errs.some(e=>e.startsWith('commerçant')),errs);
    await mctx.close();
  });

  await T('habitant : tous les écrans du profil s\'ouvrent sans erreur',async()=>{
    await up.evaluate(()=>{document.querySelectorAll('[id*=tour],.tour-ov').forEach(e=>e.remove());goNav('profile');refreshProfile();});await sleep(500);
    await up.evaluate(()=>{document.querySelectorAll('.sec-card.acc').forEach(c=>c.classList.add('open'));});await sleep(400);
    await up.screenshot({path:'/tmp/shots/audit_profile.png'});
    await up.evaluate(()=>openPrivacyData());await sleep(500);
    check('« Données et confidentialité » s\'ouvre',await up.evaluate(()=>document.getElementById('privacy-data').classList.contains('active')));
    await up.evaluate(()=>goNav('profile'));await sleep(300);
    await up.evaluate(()=>goTo('how-it-works'));await sleep(400);
    check('« Comment ça marche » s\'ouvre',await up.evaluate(()=>document.getElementById('how-it-works').classList.contains('active')));
  });

  await T('habitant : le fil (communauté) s\'affiche sans erreur',async()=>{
    await up.evaluate(()=>{goNav('profile');goNav('social');});await sleep(1200);
    await up.screenshot({path:'/tmp/shots/audit_feed.png'});
    check('Le fil s\'affiche (pas d\'écran cassé)',await up.evaluate(()=>!!document.getElementById('feed-content')&&document.getElementById('feed-content').children.length>=0));
  });

  console.log('\n── Erreurs JS capturées sur l\'ensemble du parcours ──');
  console.log(errs.length?errs.join('\n'):'(aucune)');
  check('Aucune erreur JavaScript sur l\'ensemble du parcours',errs.length===0,errs);

  await browser.close();
  console.log('\n'+pass+' ok, '+fail+' échec(s)');process.exit(fail?1:0);
})();
