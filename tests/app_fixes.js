// Retours testeurs (octobre) : solde de points jamais faux après une réponse, bouton retour du téléphone, onglet déjà
// ouvert, « Pas intéressé » réversible, retour vers Données et confidentialité, historique « Voir tout »,
// déconnexion discrète, adresse et texte alternatif sur les cartes, compteur des points du jour.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();const {Timestamp}=admin.firestore;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,3).join(' | '));}};
const wf=(p,fn,t=30000)=>p.waitForFunction(fn,{timeout:t,polling:150});
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const parisDay=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Paris'});
(async()=>{
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});
  const M=(id,o)=>db.doc('merchants/'+id).set({role:'merchant',ownerUid:id,city:'le-mans',cityLabel:'Le Mans',status:'verified',email:id+'@s.fr',...o});
  await M('m1',{brandName:'Le Zinc',name:'Le Zinc',sector:'Bar',address:'12 rue Gambetta, 72000 Le Mans',coverUrl:'http://localhost:8950/bg-accueil.svg'});
  await M('m2',{brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',address:'Place de la République, Le Mans'});
  await M('m3',{brandName:'Salon Mèche',name:'Salon Mèche',sector:'Coiffeur',address:'Rue Nationale, Le Mans'});
  const C=(id,o)=>db.doc('campaigns/'+id).set({status:'active',targetCity:'le-mans',city:'le-mans',questions:[{q:o.question,format:'mcq',options:['Oui','Non']}],createdAt:Timestamp.now(),...o});
  await C('c1',{merchantId:'m1',merchantName:'Le Zinc',sector:'Bar',question:'Un concert le jeudi ?'});
  await C('c2',{merchantId:'m2',merchantName:'Le Fournil',sector:'Boulangerie',question:'Baguette tradition ?'});
  // 3 réponses à points déjà prises aujourd'hui : la prochaine ne rapporte pas de points (NOOVS)
  const hist=[];for(let i=0;i<9;i++)hist.push(i);
  await db.doc('users/me').set({role:'user',name:'Moi',email:'me@t.fr',city:'le-mans',cityLabel:'Le Mans',welcomeClaimed:true,onboardingStep:'done',seenHomeTour:true,authorizedMerchants:['m1','m2'],declinedMerchants:['m3'],answeredCampaigns:[],points:85,xp:85,streak:1,ageRange:'25-34',interests:['restauration'],friendUids:[],fcmTokens:[],dailyAnswerDate:parisDay(),dailyAnswerCount:3});
  for(const i of hist)await db.collection('answers').doc('old'+i).set({userId:'me',campaignId:'old',questionIdx:0,merchantId:'m2',merchantName:'Le Fournil',question:'Ancienne question '+i,answer:'Oui',pointsAwarded:10,createdAt:Timestamp.fromMillis(Date.now()-(i+1)*3600000)});
  await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});
  const b=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:'new',args:['--no-sandbox']});
  const p=await b.newPage();await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8950/app.html',{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'));
  await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
  await wf(p,()=>document.getElementById('home').classList.contains('active')&&document.querySelectorAll('#hm-feed-q .hq-card').length===2);await sleep(1500);
  await p.evaluate(()=>{document.querySelectorAll('.nv-modal').forEach(m=>{m.style.display='none';});});

  await T('cartes et accueil',async()=>{
    const c=await p.evaluate(()=>[...document.querySelectorAll('#hm-feed-q .hq-card')].map(x=>({addr:(x.querySelector('.hq-addr')||{}).textContent||'',alt:(x.querySelector('.hq-ph img')||{}).alt})));
    check('Adresse courte sur la carte, sans la ville (« 12 rue Gambetta »)',c.some(x=>x.addr==='12 rue Gambetta')&&c.some(x=>x.addr==='Place de la République'),c);
    check('Photo de couverture : texte alternatif « Devanture de … »',c.some(x=>x.alt==='Devanture de Le Zinc'),c);
    const t=await p.$eval('#daily-track',e=>e.textContent);
    check('Compteur du jour : points validés et « de nouveau des points dans … h … »',/pts du jour sont validés · de nouveau des points dans \d+ h \d{2}/.test(t),t);
  });
  await T('solde après une réponse sans points',async()=>{
    const seen=[];
    await p.exposeFunction('nvSeen',v=>seen.push(v));
    await p.evaluate(()=>{const el=document.getElementById('home-pts')||document.querySelector('#rw-total');const obs=new MutationObserver(()=>{const a=document.getElementById('rw-total');if(a)window.nvSeen(a.textContent);});['rw-total'].forEach(id=>{const e=document.getElementById(id);if(e)obs.observe(e,{childList:true,characterData:true,subtree:true});});});
    await p.evaluate(()=>openQ(S.qs.findIndex(q=>q._firestoreId==='c1')));await sleep(300);
    await p.evaluate(()=>document.querySelector('#ans-area .mcq-opt').click());await sleep(3300);await p.evaluate(()=>submitAns());
    await wf(p,()=>document.getElementById('reward').classList.contains('active'),15000);await sleep(1500);
    const st=await p.evaluate(()=>({pts:S.pts,tot:(document.getElementById('rw-total')||{}).textContent}));
    const srv=(await db.doc('users/me').get()).data().points;
    check('L\'écran de gain affiche d\'emblée le solde du serveur, jamais un chiffre provisoire',st.pts===srv&&st.tot===srv+' pts'&&seen.every(v=>v===srv+' pts'),{st,seen,srv});
  });
  await T('bouton retour du téléphone',async()=>{
    // Une fenêtre ouverte (demande de notifications, célébration) se ferme d'abord au retour :
    await sleep(2500);   // la demande de notifications arrive ~2 s après le gain
    const open=()=>p.evaluate(()=>[...document.querySelectorAll('.nv-modal')].some(m=>getComputedStyle(m).display!=='none')||document.getElementById('celebrate-sheet').classList.contains('open'));
    let n=0;while(await open()&&n<6){await p.evaluate(()=>history.back());await sleep(450);n++;}
    check('Les fenêtres ouvertes (gain, notifications) se ferment une à une au retour, sans quitter l\'écran',n>0&&!(await open())&&await p.evaluate(()=>cur==='reward'),n);
    await p.evaluate(()=>history.back());await sleep(500);
    check('Retour depuis l\'écran de gain : l\'accueil (jamais la question déjà répondue)',await p.evaluate(()=>cur==='home'));
    await p.evaluate(()=>goNav('home'));await sleep(400);
    await p.evaluate(()=>goNav('profile'));await sleep(300);
    await p.evaluate(()=>openPrivacyData());await sleep(300);
    await p.evaluate(()=>openManageMerchants());await wf(p,()=>document.getElementById('manage-merchants').classList.contains('active'));await sleep(800);
    await p.evaluate(()=>history.back());await sleep(600);
    check('Retour depuis « Gérer mes commerces » : Données et confidentialité (pas le profil)',await p.evaluate(()=>cur==='privacy-data'));
    await p.evaluate(()=>history.back());await sleep(600);
    check('Retour encore : le profil',await p.evaluate(()=>cur==='profile'));
    await p.evaluate(()=>history.back());await sleep(600);
    check('Retour depuis un onglet : l\'accueil',await p.evaluate(()=>cur==='home'));
    await p.evaluate(()=>openRewardsSheet&&openRewardsSheet());await sleep(400);
    await p.evaluate(()=>history.back());await sleep(500);
    check('Une feuille ouverte se ferme d\'abord, on reste dans l\'app',await p.evaluate(()=>!document.getElementById('rewards-sheet').classList.contains('open')&&cur==='home'));
    await p.evaluate(()=>history.back());await sleep(500);
    const t=await p.evaluate(()=>({cur,url:location.pathname,toast:(document.querySelector('.toast,#toast')||{}).textContent||document.body.innerText.match(/Appuie encore sur retour/)?.[0]||''}));
    check('Sur l\'accueil : on ne quitte pas au 1er appui (« Appuie encore sur retour pour quitter »)',t.cur==='home'&&/app\.html/.test(t.url)&&/Appuie encore/.test(t.toast),t);
  });
  await T('onglet déjà ouvert',async()=>{
    await p.evaluate(()=>{window._rh=0;const o=refreshHome;window.refreshHome=function(){window._rh++;return o.apply(this,arguments);};});
    await p.evaluate(()=>{document.getElementById('home').scrollTop=400;document.getElementById('nav-home').click();});await sleep(700);
    check('Toucher l\'onglet affiché : pas de rechargement, retour en haut',await p.evaluate(()=>window._rh===0&&document.getElementById('home').scrollTop<50));
  });
  await T('« Pas intéressé » réversible',async()=>{
    await p.evaluate(()=>goNav('profile'));await sleep(500);
    const btn=await p.evaluate(()=>{const b=[...document.querySelectorAll('#consent-mgmt button')].find(x=>/Gérer mes commerces/.test(x.textContent));return b&&b.textContent;});
    check('Profil > Commerces autorisés : « Gérer mes commerces (1 « Pas intéressé ») »',/Gérer mes commerces \(1 « Pas intéressé »\)/.test(btn||''),btn);
    await p.evaluate(()=>[...document.querySelectorAll('#consent-mgmt button')].find(x=>/Gérer mes commerces/.test(x.textContent)).click());
    await wf(p,()=>document.getElementById('mm-declined-section').style.display!=='none'&&/Salon Mèche/.test(document.getElementById('mm-declined-list').textContent),10000);
    check('Section « Pas intéressé » avec le commerce écarté',true);
    await p.evaluate(()=>{const i=document.querySelector('#mm-declined-list input');i.checked=true;i.dispatchEvent(new Event('change'));});
    await p.evaluate(()=>saveMerchantConsents());await sleep(1500);
    const u=(await db.doc('users/me').get()).data();
    check('Le suivre à nouveau : suivi, et plus écarté',u.authorizedMerchants.includes('m3')&&!(u.declinedMerchants||[]).includes('m3'),u);
    check('Après l\'enregistrement : retour au profil',await p.evaluate(()=>cur==='profile'));
  });
  await T('profil',async()=>{
    await p.evaluate(()=>refreshProfile());await sleep(800);
    const h=await p.evaluate(()=>({n:document.querySelectorAll('#hist-list .hist-it').length,more:(document.querySelector('#hist-list .hist-more')||{}).textContent}));
    check('Historique : 6 réponses puis « Voir tout (10) »',h.n===6&&/Voir tout \(\d+\)/.test(h.more||''),h);
    await p.evaluate(()=>document.querySelector('#hist-list .hist-more').click());await sleep(400);
    check('« Voir tout » : toutes les réponses',await p.evaluate(()=>document.querySelectorAll('#hist-list .hist-it').length>6));
    const lo=await p.evaluate(()=>{const b=document.querySelector('.logout-link');const cs=getComputedStyle(b);return {bg:cs.backgroundColor,td:cs.textDecorationLine,t:b.textContent.trim()};});
    check('Déconnexion : simple lien souligné, plus un gros bouton de la couleur du fond',/rgba\(0, 0, 0, 0\)|transparent/.test(lo.bg)&&lo.td==='underline'&&/Se déconnecter/.test(lo.t),lo);
  });
  check('Aucune erreur JavaScript',errs.length===0,errs);
  await b.close();
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(fail?1:0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
