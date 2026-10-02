// Audit du scroll : sur chaque écran de l'app, du dashboard et de l'admin, chaque bouton, lien, champ
// ou interrupteur visible doit pouvoir être amené à l'écran en défilant, et ne pas être recouvert
// (barre du bas, bandeau « version test », en-tête collant...). Aucun débordement horizontal.
// Deux tailles d'écran : 390×844 (iPhone courant) et 360×640 (petit Android).
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const wf=(p,fn,arg,t=30000)=>p.waitForFunction(fn,{timeout:t,polling:200},arg);
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const CHROME=(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const BASE='http://localhost:8950/';
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}

// Exécuté dans la page : pour chaque élément actionnable visible de `root`, on le fait défiler au
// centre puis on vérifie qu'il est bien à l'écran et que c'est lui qui reçoit le doigt.
function pageAudit(rootSel){
  const root=document.querySelector(rootSel);if(!root)return{err:'introuvable : '+rootSel};
  if(!document.getElementById('__nosmooth')){const s=document.createElement('style');s.id='__nosmooth';s.textContent='*,*::before,*::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}';document.head.appendChild(s);}
  const desc=e=>{if(!e)return 'rien';const t=(e.getAttribute('aria-label')||e.textContent||e.value||e.placeholder||'').replace(/\s+/g,' ').trim().slice(0,32);return e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(typeof e.className==='string'&&e.className?'.'+e.className.trim().split(/\s+/)[0]:'')+(t?' «'+t+'»':'');};
  const shown=e=>{const r=e.getBoundingClientRect();if(r.width<4||r.height<4)return false;for(let a=e;a&&a!==document.documentElement;a=a.parentElement){const cs=getComputedStyle(a);if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity<0.05)return false;}return true;};
  const sel='button,a[href],[onclick],input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=switch],label.tgl';
  // Fonds cliquables d'une feuille (fermer en touchant à côté) : recouverts par la feuille, c'est voulu.
  const backdrop=e=>/event\.target===this/.test(e.getAttribute('onclick')||'')||/(^|[\s-])(ov|overlay|backdrop)($|\s)/.test(typeof e.className==='string'?e.className:'');
  // Bouton volontairement inactif (minuterie de lecture, formulaire incomplet) : pas un défaut d'affichage.
  const inert=e=>e.disabled||getComputedStyle(e).pointerEvents==='none';
  const els=[...root.querySelectorAll(sel)].filter(e=>shown(e)&&!backdrop(e)&&!inert(e));
  document.querySelectorAll('.firebase-emulator-warning').forEach(x=>x.remove());
  const scrollers=[];for(let a=root;a;a=a.parentElement)scrollers.push([a,a.scrollTop]);
  const bad=[];
  for(const e of els){
    e.scrollIntoView({block:'center',inline:'center'});
    // Lien sur plusieurs lignes : on vise le premier morceau de texte, pas le centre du cadre.
    const rs=e.getClientRects(),r=getComputedStyle(e).display==='inline'&&rs.length>1?rs[0]:e.getBoundingClientRect(),W=innerWidth,H=innerHeight;
    const top=Math.max(r.top,0),bot=Math.min(r.bottom,H),left=Math.max(r.left,0),right=Math.min(r.right,W);
    if(bot-top<Math.min(r.height,24)*0.6||right-left<Math.min(r.width,24)*0.6){bad.push({el:desc(e),pb:'hors écran, inatteignable en défilant',r:[r.left|0,r.top|0,r.width|0,r.height|0]});continue;}
    const cx=(left+right)/2,cy=(top+bot)/2,hit=document.elementFromPoint(cx,cy);
    const ok=hit&&(hit===e||e.contains(hit)||(e.labels&&[...e.labels].some(l=>l.contains(hit)))||(hit.tagName==='LABEL'&&hit.control===e));
    if(!ok)bad.push({el:desc(e),pb:'recouvert par '+desc(hit)});
  }
  scrollers.forEach(([a,t])=>{a.scrollTop=t;});
  const ow=root.scrollWidth>root.clientWidth+1&&getComputedStyle(root).overflowX!=='hidden'?root.scrollWidth+'/'+root.clientWidth:null;
  const dw=document.documentElement.scrollWidth>innerWidth+1?document.documentElement.scrollWidth+'/'+innerWidth:null;
  let wide=[];if(ow||dw){const R=root.getBoundingClientRect().right;wide=[...root.querySelectorAll('*')].filter(x=>shown(x)&&x.getBoundingClientRect().right>Math.min(R,innerWidth)+1&&![...x.children].some(c=>c.getBoundingClientRect().right>Math.min(R,innerWidth)+1)).slice(0,4).map(desc);}
  return{n:els.length,bad,ow:(ow||dw)?[ow||dw].concat(wide):null};
}

(async()=>{
  await wipe();
  // ── Données : commerces, questions, récompenses, amis, notifications ──
  const M=(id,o)=>db.doc('merchants/'+id).set({role:'merchant',ownerUid:id,city:'le-mans',cityLabel:'Le Mans',status:'verified',email:id+'@shop.fr',verifiedPopupShown:true,seenDashTour:true,...o});
  await M('m1',{brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',address:'12 rue de la République, 72000 Le Mans',plan:'starter',consentCount:42,description:'Boulangerie artisanale depuis 1987.'});
  await M('m2',{brandName:'Café Plumes',name:'Café Plumes',sector:'Café'});
  for(const [i,n,sec] of [[3,'Studio Fit','Sport'],[4,'La Cave du Coin','Caviste'],[5,'Fleurs de Lune','Fleuriste'],[6,'Le Petit Atelier','Créateur'],[7,'Chez Lili','Restaurant']])await M('m'+i,{brandName:n,name:n,sector:sec});
  const qs=[['Quelle est ta boisson préférée le matin ?',['Café','Thé','Chocolat chaud']],['Tu viendrais pour un brunch le dimanche ?',['Oui, sûrement','Peut-être','Non']],['Que penses-tu de nos nouveaux horaires ?',['Super','Bof','Je ne savais pas']]];
  for(let i=0;i<qs.length;i++)await db.doc('campaigns/c'+i).set({merchantId:i===1?'m2':'m1',merchantName:i===1?'Café Plumes':'Le Fournil',sector:i===1?'Café':'Boulangerie',status:i===2?'paused':'active',targetCity:'le-mans',city:'le-mans',name:'Campagne '+(i+1),question:qs[i][0],questions:[{q:qs[i][0],format:'mcq',options:qs[i][1]}],targetVolume:100,answersCount:[34,12,3][i],pointsPerAnswer:10,createdAt:Timestamp.now(),endsAt:Timestamp.fromMillis(Date.now()+7*86400000)});
  for(let i=0;i<34;i++)await db.doc(`answers/u${i}_c0_q0`).set({userId:'u'+i,merchantId:'m1',campaignId:'c0',questionIdx:0,question:qs[0][0],answer:qs[0][1][i%3],respondentAge:20+i%30,respondentCity:'le-mans',respondentInterests:['restauration'],pointsAwarded:10,qualityScore:80,flagged:false,createdAt:Timestamp.now()});
  const labels=['Café offert','Croissant offert','Baguette offerte','Menu midi -20 %','Panier surprise'];
  for(let i=0;i<5;i++)await db.doc('rewards/m1_p'+(i+1)).set({merchantId:'m1',merchantName:'Le Fournil',city:'le-mans',label:labels[i],tier:i+1,slot:i+1,cost:[150,300,500,900,1500][i],priceConfirmed:true,monthlyQuota:20,timeSlots:[],withPurchase:false,status:'approved',active:true,createdAt:Timestamp.now()});
  await db.doc('merchantPosts/p1').set({merchantId:'m1',merchantName:'Le Fournil',text:'Suite à vos avis, nous ouvrons dès 6h30 le samedi. Merci à tous pour vos retours !',campaignIds:['c0'],status:'published',city:'le-mans',createdAt:Timestamp.now(),publishedAt:Timestamp.now()});
  for(let i=0;i<4;i++)await db.doc('redemptions/x'+i).set({merchantId:'m1',userId:'u'+i,merchantName:'Le Fournil',label:'Café offert',code:'NVA-ABC-000'+i,cost:150,status:i<2?'pending':'used',createdAt:Timestamp.now(),expiresAt:Timestamp.fromMillis(Date.now()+86400000)});
  await db.doc('merchants/m1/notifications/n1').set({type:'paliers',title:'Vos 5 premières réponses sont là',message:'Les résultats sont disponibles.',read:false,createdAt:Timestamp.now()});
  await db.doc('users/me').set({role:'user',welcomeClaimed:true,name:'Camille',email:'me@t.fr',city:'le-mans',cityLabel:'Le Mans',authorizedMerchants:['m1','m2','m3','m4','m5'],friendUids:['f1','f2'],answeredCampaigns:[],points:420,xp:1300,streak:4,interests:['restauration'],onboardingStep:'done',seenHomeTour:true,birthYear:1995});
  await db.doc('users/f1').set({role:'user',name:"Inès N'Diaye",city:'le-mans',cityLabel:'Le Mans',friendUids:['me'],xp:2400,points:200,streak:9,onboardingStep:'done'});
  await db.doc('users/f2').set({role:'user',name:'Hugo',city:'le-mans',cityLabel:'Le Mans',friendUids:['me'],xp:800,points:90,streak:2,onboardingStep:'done'});
  await db.doc('users/f3').set({role:'user',name:"Chloé D'Amico",city:'le-mans',cityLabel:'Le Mans',friendUids:[],xp:100,onboardingStep:'done'});
  await db.doc('users/me/notifications/friendreq_f3').set({type:'friend_request',fromUid:'f3',fromName:"Chloé D'Amico",read:false,createdAt:Timestamp.now()});
  await db.doc('users/me/notifications/n2').set({type:'noova_message',message:'Le Fournil a publié une nouveauté suite à vos avis.',read:false,createdAt:Timestamp.now()});
  await db.doc('weeklyQuestions/w1').set({active:true,city:'le-mans',text:'Pizza ananas : crime ou génie ?',options:['Crime','Génie','Ça dépend'],createdAt:Timestamp.now()});
  await db.doc('redemptions/r1').set({userId:'me',merchantId:'m1',merchantName:'Le Fournil',label:'Café offert',cost:150,status:'used',code:'B2C4',createdAt:Timestamp.fromMillis(Date.now()-5*86400000),usedAt:Timestamp.fromMillis(Date.now()-5*86400000+3600000),expiresAt:Timestamp.fromMillis(Date.now()-4*86400000)});
  await db.doc('redemptions/r2').set({userId:'me',merchantId:'m1',merchantName:'Le Fournil',label:'Croissant offert',cost:300,status:'pending',code:'A7K2',createdAt:Timestamp.now(),expiresAt:Timestamp.fromMillis(Date.now()+86400000)});
  await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});
  await aauth.createUser({uid:'m1',email:'m1@shop.fr',password:'secret123'});
  await aauth.createUser({uid:'adm',email:'tomussproduction@gmail.com',password:'secret123'});

  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  for(const [w,h] of [[390,844],[360,640]]){
    const sz=w+'×'+h;
    const ctx=await browser.createBrowserContext();const p=await ctx.newPage();
    await p.setViewport({width:w,height:h,isMobile:true,hasTouch:true,deviceScaleFactor:1});
    const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.dismiss().catch(()=>{}));
    const audit=async(name,rootSel)=>{
      await sleep(900);
      const r=await p.evaluate(pageAudit,rootSel);
      if(r.err){check(`${sz} ${name} : écran ouvert`,false,r.err);return;}
      check(`${sz} ${name} : ${r.n} éléments, tous atteignables et non recouverts`,r.n>0&&!r.bad.length,r.n?r.bad.slice(0,6):'aucun élément');
      check(`${sz} ${name} : pas de débordement horizontal`,!r.ow,r.ow);
    };
    const step=async(name,fn,rootSel)=>{try{await fn();await audit(name,rootSel);}catch(e){check(`${sz} ${name}`,false,String(e.message||e).slice(0,200));}};

    // ═════ App habitant ═════
    await p.goto(BASE+'app.html',{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'));
    await audit('app accueil non connecté','#onboard');
    await step('app connexion',()=>p.evaluate(()=>showAuthWall('login')),'#auth-wall');
    await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active'));await sleep(2500);
    await audit('app accueil','#home');
    await step('app accueil, plus de commerces',()=>p.evaluate(()=>{const b=document.getElementById('dnb-more');if(b)b.click();}),'#home');
    await step('app communauté',()=>p.evaluate(()=>goNav('social')),'#social');
    await step('app classement',()=>p.evaluate(()=>{const b=[...document.querySelectorAll('#social .tab-btn')].find(x=>/Classement/.test(x.textContent));if(b)b.click();}),'#social');
    await step('app récompenses',()=>p.evaluate(()=>goNav('rewards-tab')),'#rewards-tab');
    await step('app profil (sections ouvertes)',async()=>{await p.evaluate(()=>goNav('profile'));await sleep(1200);await p.evaluate(()=>document.querySelectorAll('#profile .sc-hdr').forEach(h=>{const s=h.closest('.sc,section,[id$="-section"]');if(!s||!s.classList.contains('open'))h.click();}));},'#profile');
    for(const id of ['how-it-works','brands','manage-merchants','privacy-data'])await step('app '+id,()=>p.evaluate(id=>goTo(id),id),'#'+id);
    await step('app page commerce',()=>p.evaluate(()=>openBrandById('m1','Le Fournil')),'#brand-page');
    await step('app question',()=>p.evaluate(()=>{goNav('home');openQ(0);}),'#question');
    await step('app question, réponse choisie',()=>p.evaluate(()=>{const b=document.querySelector('#question .qopt, #question .mcq-opt');if(b)b.click();}),'#question');
    await step('app feuille des récompenses',async()=>{await p.evaluate(()=>goNav('home'));await sleep(800);await p.evaluate(()=>openRewardsSheet());},'#rewards-sheet');
    await p.evaluate(()=>{try{closeRewardsSheet()}catch(e){}});
    await step('app notifications',async()=>{await p.evaluate(()=>goNav('social'));await sleep(800);await p.evaluate(()=>toggleNotifPanel());},'#notif-panel');
    await p.evaluate(()=>{try{closeNotifPanel()}catch(e){}});
    await step('app profil d\'un ami',async()=>{await p.evaluate(()=>goNav('social'));await sleep(1500);await p.evaluate(()=>openFriendProfile((S.friends||[])[0]));},'#fprofile');
    await step('app discussion',()=>p.evaluate(()=>openChatFor((S.friends||[])[0])),'#chat');
    await step('app bon en caisse',()=>p.evaluate(()=>showVoucherModal({id:'r2',code:'A7K2',label:'Croissant offert',merchantName:'Le Fournil',cost:300,purchaseCondition:null,expiresAt:new Date(Date.now()+86400000)})),'#voucher-full');
    await p.evaluate(()=>{try{closeVoucherFull()}catch(e){}});
    await p.evaluate(()=>goNav('profile'));await sleep(800);
    await step('app modifier son profil',()=>p.evaluate(()=>editUserField('name','Prénom','Camille')),'#user-edit-modal');
    await p.evaluate(()=>closeUserEditModal());
    await step('app supprimer son compte',()=>p.evaluate(()=>deleteMyAccount()),'#delete-account-modal');
    await p.evaluate(()=>closeDeleteAccountModal());
    await step('app demande d\'autorisation',()=>p.evaluate(()=>askPerm({key:'audit',force:true,title:'Être prévenu des nouvelles questions',text:'Une notification quand un commerce que tu suis pose une question.',cta:'Activer',onAccept:()=>{}})),'#perm-sheet');
    await p.evaluate(()=>permLater());
    await step('app célébration',()=>p.evaluate(()=>showCelebration({icon:'fire',title:'7 jours d’affilée !',subtitle:'Continue comme ça.'})),'#celebrate-sheet');
    await p.evaluate(()=>{try{closeCelebration()}catch(e){}});
    await step('app récompense gagnée',()=>p.evaluate(()=>openReward({title:'Bien joué !',sub:'Ta réponse aide Le Fournil.'})),'#reward');

    // ═════ Dashboard commerçant ═════
    const d=await ctx.newPage();await d.setViewport({width:w,height:h,isMobile:true,hasTouch:true,deviceScaleFactor:1});d.on('pageerror',e=>errs.push('dash: '+e.message));d.on('dialog',x=>x.dismiss().catch(()=>{}));
    await d.evaluateOnNewDocument(()=>{try{localStorage.setItem('nv_pro_intro','1');}catch(e){}});
    await d.goto(BASE+'dash.html',{waitUntil:'load'});await wf(d,()=>document.getElementById('auth-wall').style.display==='flex');
    const pageSave=p;
    const auditD=async(name,rootSel)=>{await sleep(900);const r=await d.evaluate(pageAudit,rootSel);if(r.err){check(`${sz} ${name}`,false,r.err);return;}
      check(`${sz} ${name} : ${r.n} éléments, tous atteignables et non recouverts`,r.n>0&&!r.bad.length,r.n?r.bad.slice(0,6):'aucun élément');check(`${sz} ${name} : pas de débordement horizontal`,!r.ow,r.ow);};
    await auditD('dashboard connexion','#auth-wall');
    await d.evaluate(()=>awTab('login'));await setVal(d,'#aw-email','m1@shop.fr');await setVal(d,'#aw-pass','secret123');await d.evaluate(()=>awSubmit());
    await wf(d,()=>typeof _mData!=='undefined'&&_mData&&_mData.brandName==='Le Fournil');
    await d.evaluate(()=>{try{endDashTour();}catch(e){}const v=document.getElementById('verified-popup');if(v)v.remove();});await sleep(1200);
    for(const pg of ['dashboard','create','campaigns','results','consents','news','rewards','validate','settings']){
      try{await d.evaluate(pg=>{const b=[...document.querySelectorAll('.sb-item')].find(x=>(x.getAttribute('onclick')||'').includes("'"+pg+"'"));navTo(pg,b);},pg);await auditD('dashboard '+pg,'.page.active');}catch(e){check(`${sz} dashboard ${pg}`,false,String(e.message).slice(0,200));}
    }
    try{await d.evaluate(()=>{navTo('create',document.getElementById('nav-create'));});for(let i=0;i<4;i++){await d.evaluate(i=>wzGo(i),i);await auditD('dashboard création étape '+(i+1),'.page.active');}}catch(e){check(`${sz} dashboard création`,false,String(e.message).slice(0,200));}
    try{await d.evaluate(()=>viewCampaign('c0'));await auditD('dashboard résultats d\'une question','.page.active');}catch(e){check(`${sz} dashboard résultats`,false,String(e.message).slice(0,200));}
    try{await d.evaluate(()=>{navTo('campaigns',document.getElementById('nav-campaigns'));openEditCamp('c2');});await auditD('dashboard modifier une question','#camp-modal');await d.evaluate(()=>closeCampModal());}catch(e){check(`${sz} dashboard modifier une question`,false,String(e.message).slice(0,200));}
    try{await d.evaluate(()=>{navTo('settings',document.getElementById('nav-settings'));editSetting('description','Description','Boulangerie artisanale');});await auditD('dashboard modifier un réglage','#edit-field-modal');await d.evaluate(()=>closeEditFieldModal());}catch(e){check(`${sz} dashboard modifier un réglage`,false,String(e.message).slice(0,200));}
    try{await d.evaluate(()=>openCashierModal());await auditD('dashboard fiche caisse','#cashier-modal');await d.evaluate(()=>{document.getElementById('cashier-modal').style.display='none';});}catch(e){check(`${sz} dashboard fiche caisse`,false,String(e.message).slice(0,200));}
    try{await d.evaluate(()=>{navTo('dashboard',document.getElementById('nav-dashboard'));toggleMobMenu();});await auditD('dashboard menu','#sidebar');await d.evaluate(()=>toggleMobMenu());}catch(e){check(`${sz} dashboard menu`,false,String(e.message).slice(0,200));}

    // ═════ Admin ═════
    const a=await ctx.newPage();await a.setViewport({width:w,height:h,isMobile:true,hasTouch:true,deviceScaleFactor:1});a.on('pageerror',e=>errs.push('admin: '+e.message));a.on('dialog',x=>x.dismiss().catch(()=>{}));
    await a.goto(BASE+'admin.html',{waitUntil:'load'});await sleep(1500);
    await a.evaluate(async()=>{await auth.signInWithEmailAndPassword('tomussproduction@gmail.com','secret123');});
    await wf(a,()=>typeof allMerchants!=='undefined'&&allMerchants.length>=7,null,20000).catch(()=>{});await sleep(1000);
    for(const tab of ['entreprises','utilisateurs','diffusion','lancement','moderation','notifications','danger']){
      try{await a.evaluate(tab=>{const b=[...document.querySelectorAll('.tab-btn-main')].find(x=>(x.getAttribute('onclick')||'').includes("'"+tab+"'"));switchTab(tab,b);},tab);await sleep(900);
        const r=await a.evaluate(pageAudit,'#tab-'+tab);if(r.err){check(`${sz} admin ${tab}`,false,r.err);continue;}
        check(`${sz} admin ${tab} : ${r.n} éléments, tous atteignables et non recouverts`,!r.bad.length,r.bad.slice(0,6));check(`${sz} admin ${tab} : pas de débordement horizontal`,!r.ow,r.ow);
      }catch(e){check(`${sz} admin ${tab}`,false,String(e.message).slice(0,200));}
    }
    check(`${sz} aucune erreur JavaScript`,!errs.length,[...new Set(errs)].slice(0,5));
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${pass} ok, ${fail} échec(s)`);
  process.exit(0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,500));process.exit(1);});
