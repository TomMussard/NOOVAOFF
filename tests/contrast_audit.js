// Audit du contraste : sur chaque écran de l'app, du dashboard et de l'admin, chaque bouton, lien, onglet ou
// interrupteur visible doit se voir. Texte lisible sur son fond réel (4,5:1, ou 3:1 pour le gros texte), icône seule à 3:1,
// et un bouton qui a son propre fond ne doit pas se fondre dans ce qui l'entoure.
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

// Exécuté dans la page : pour chaque élément actionnable visible de `root`, contraste du texte (ou de l'icône) sur
// son fond réel, et visibilité du bouton lui-même sur ce qui l'entoure.
function contrastAudit(rootSel){
  const MIN_DE=6;   // en dessous, le fond (ou la bordure) du bouton se confond avec ce qui l'entoure
  const root=document.querySelector(rootSel);if(!root)return{err:'introuvable : '+rootSel};
  if(!document.getElementById('__nosmooth')){const s=document.createElement('style');s.id='__nosmooth';s.textContent='*,*::before,*::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}';document.head.appendChild(s);}
  document.querySelectorAll('.firebase-emulator-warning').forEach(x=>x.remove());
  const desc=e=>{const t=(e.getAttribute('aria-label')||e.textContent||e.value||e.placeholder||'').replace(/\s+/g,' ').trim().slice(0,30);return e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(typeof e.className==='string'&&e.className?'.'+e.className.trim().split(/\s+/)[0]:'')+(t?' «'+t+'»':'');};
  const shown=e=>{const r=e.getBoundingClientRect();if(r.width<4||r.height<4)return false;for(let a=e;a&&a!==document.documentElement;a=a.parentElement){const cs=getComputedStyle(a);if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity<0.05)return false;}return true;};
  const cv=document.createElement('canvas').getContext('2d');
  const parse=c=>{if(!c||c==='transparent')return [0,0,0,0];let m=c.match(/rgba?\(([^)]+)\)/);if(!m){cv.fillStyle='#000';cv.fillStyle=c;const f=cv.fillStyle;if(f[0]==='#'){const n=parseInt(f.slice(1),16);return [n>>16&255,n>>8&255,n&255,1];}m=f.match(/rgba?\(([^)]+)\)/);if(!m)return null;}const p=m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);return [p[0],p[1],p[2],p.length>3?p[3]:1];};
  const over=(top,bot)=>{const a=top[3]+bot[3]*(1-top[3]);if(!a)return [0,0,0,0];return [0,1,2].map(i=>(top[i]*top[3]+bot[i]*bot[3]*(1-top[3]))/a).concat(a);};
  const lum=c=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]);};
  const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
  const stops=s=>(s.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}\b/gi)||[]).map(parse).filter(Boolean);
  // Fond réel derrière un élément : liste de couleurs possibles (plusieurs si dégradé), ou null s'il est posé sur une image.
  const bgOf=(el)=>{
    const layers=[];
    for(let a=el;a;a=a.parentElement){
      const cs=getComputedStyle(a),bi=cs.backgroundImage;
      const c=parse(cs.backgroundColor);
      if(bi&&bi!=='none'){
        if(/url\(/.test(bi))return null;
        const st=stops(bi).filter(x=>x[3]>0.5);       // motif léger (carreaux) : ignoré, seul un vrai dégradé compte
        if(st.length){layers.push({grad:st.map(g=>c&&c[3]>0?over(g,c):g)});if(st.every(x=>x[3]>=0.99))break;continue;}
      }
      if(c&&c[3]>0){layers.push({c});if(c[3]>=0.99)break;}
    }
    let base=[[255,255,255,1]];
    for(let i=layers.length-1;i>=0;i--){const L=layers[i];if(L.grad)base=L.grad.map(g=>over(g,base[0]));else base=base.map(b=>over(L.c,b));}
    return base;
  };
  // Écart de couleur perçu (CIE76) : un bouton jaune sur crème se voit très bien même si leur luminosité est proche.
  const lab=c=>{const f=v=>{v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);};const [r,g,b]=[f(c[0]),f(c[1]),f(c[2])];
    const X=(r*0.4124+g*0.3576+b*0.1805)/0.95047,Y=r*0.2126+g*0.7152+b*0.0722,Z=(r*0.0193+g*0.1192+b*0.9505)/1.08883;
    const h=t=>t>0.008856?Math.cbrt(t):7.787*t+16/116;return [116*h(Y)-16,500*(h(X)-h(Y)),200*(h(Y)-h(Z))];};
  const dE=(a,b)=>{const x=lab(a),y=lab(b);return Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2]);};
  const opac=el=>{let o=1;for(let a=el;a&&a!==document.documentElement;a=a.parentElement)o*=+getComputedStyle(a).opacity;return o;};
  const minR=(fg,bgs)=>Math.min(...bgs.map(b=>ratio(over(fg,b),b)));
  const sel='button,a[href],[onclick],[role=button],[role=tab],[role=switch],label.tgl,select,input[type=submit],input[type=button]';
  const backdrop=e=>/event\.target===this/.test(e.getAttribute('onclick')||'')||/(^|[\s-])(ov|overlay|backdrop)($|\s)/.test(typeof e.className==='string'?e.className:'');
  const els=[...root.querySelectorAll(sel)].filter(e=>shown(e)&&!backdrop(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true');
  const bad=[],seen=new Set();
  for(const e of els){
    if(e.closest('[data-contrast-skip]'))continue;
    const parent=e.parentElement?bgOf(e.parentElement):null;
    const own=bgOf(e);if(!own||!parent)continue;            // posé sur une photo : contrôlé à l'œil
    const op=opac(e);
    // 1) Texte : chaque morceau de texte du bouton, sur son propre fond
    const texts=[];const tw=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let n;
    while((n=tw.nextNode())){if(!n.nodeValue.trim())continue;const pe=n.parentElement;if(!shown(pe)||pe.closest('[data-on-photo]'))continue;texts.push(pe);}   // texte sur photo + voile sombre : vérifié sur capture
    let worst=null;
    for(const t of [...new Set(texts)]){
      const cs=getComputedStyle(t),bg=bgOf(t);if(!bg)continue;
      const fs=parseFloat(cs.fontSize),fw=+cs.fontWeight||400,large=fs>=24||(fs>=18.66&&fw>=700);
      const fg=parse(cs.color);if(!fg)continue;fg[3]*=op*opac(t)/op;
      const r=minR([fg[0],fg[1],fg[2],fg[3]*op],bg),need=large?3:4.5;
      if(r<need&&(!worst||r<worst.r))worst={r,need,txt:t.textContent.trim().slice(0,24),fg:cs.color};
    }
    // Icône seule (aucun texte) : le trait de l'icône doit ressortir à 3:1
    if(!texts.length){const svg=e.querySelector('svg');if(svg){const cs=getComputedStyle(svg);const col=parse(cs.stroke&&cs.stroke!=='none'?cs.stroke:cs.fill&&cs.fill!=='none'?cs.fill:cs.color)||parse(cs.color);if(col){const r=minR([col[0],col[1],col[2],col[3]*op],own);if(r<3)worst={r,need:3,txt:'(icône)',fg:cs.color};}}}
    // 2) Le bouton lui-même : s'il a son propre fond, il doit se détacher (3:1) — sinon c'est sa bordure, ou à défaut son texte, qui le signale.
    let edge=null;
    const differs=own.some((o,i)=>{const p=parent[Math.min(i,parent.length-1)];return Math.abs(o[0]-p[0])+Math.abs(o[1]-p[1])+Math.abs(o[2]-p[2])>6;});
    if(differs){
      const cs=getComputedStyle(e);
      const fill=Math.min(...own.map(o=>Math.min(...parent.map(p=>dE(o,p)))));
      const bw=parseFloat(cs.borderTopWidth)||0,bc=parse(cs.borderTopColor);
      const border=bw>=1&&cs.borderTopStyle!=='none'&&bc&&bc[3]>0?Math.min(...parent.map(p=>dE(over(bc,p),p))):0;
      if(Math.max(fill,border)<MIN_DE)edge={fond:+fill.toFixed(1),bordure:+border.toFixed(1)};
    }
    if(worst||edge){const k=desc(e);if(seen.has(k))continue;seen.add(k);bad.push({el:k,...(worst?{texte:worst.txt+' '+worst.r.toFixed(2)+'/'+worst.need}:{}),...(edge?{bord:edge}:{})});}
  }
  return{n:els.length,bad};
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
  await db.doc('users/f1').set({role:'user',name:"Inès N'Diaye",city:'le-mans',cityLabel:'Le Mans',friendUids:['me','f4'],xp:2400,points:200,streak:9,onboardingStep:'done'});
  await db.doc('users/f2').set({role:'user',name:'Hugo',city:'le-mans',cityLabel:'Le Mans',friendUids:['me'],xp:800,points:90,streak:2,onboardingStep:'done'});
  await db.doc('users/f4').set({role:'user',name:'Jules',city:'le-mans',cityLabel:'Le Mans',friendUids:['f1'],xp:300,onboardingStep:'done'});
  await db.doc('users/f3').set({role:'user',name:"Chloé D'Amico",city:'le-mans',cityLabel:'Le Mans',friendUids:[],xp:100,onboardingStep:'done'});
  await db.doc('users/me/notifications/friendreq_f3').set({type:'friend_request',fromUid:'f3',fromName:"Chloé D'Amico",read:false,createdAt:Timestamp.now()});
  await db.doc('users/me/notifications/n2').set({type:'noova_message',message:'Le Fournil a publié une nouveauté suite à vos avis.',read:false,createdAt:Timestamp.now()});
  await db.doc('weeklyQuestions/w1').set({active:true,city:'le-mans',text:'Pizza ananas : crime ou génie ?',options:['Crime','Génie','Ça dépend'],createdAt:Timestamp.now()});
  await db.doc('redemptions/r1').set({userId:'me',merchantId:'m1',merchantName:'Le Fournil',label:'Café offert',cost:150,status:'used',code:'B2C4',createdAt:Timestamp.fromMillis(Date.now()-5*86400000),usedAt:Timestamp.fromMillis(Date.now()-5*86400000+3600000),expiresAt:Timestamp.fromMillis(Date.now()-4*86400000)});
  await db.doc('redemptions/r2').set({userId:'me',merchantId:'m1',merchantName:'Le Fournil',label:'Croissant offert',cost:300,status:'pending',code:'A7K2',createdAt:Timestamp.now(),expiresAt:Timestamp.fromMillis(Date.now()+86400000)});
  await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});
  await aauth.createUser({uid:'m1',email:'m1@shop.fr',password:'secret123'});
  await aauth.createUser({uid:'adm',email:'tomussproduction@gmail.com',password:'secret123',emailVerified:true});

  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  for(const [w,h] of [[390,844]]){
    const sz=w+'×'+h;
    const ctx=await browser.createBrowserContext();const p=await ctx.newPage();
    await p.setViewport({width:w,height:h,isMobile:true,hasTouch:true,deviceScaleFactor:1});
    const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.dismiss().catch(()=>{}));
    const audit=async(name,rootSel)=>{
      await sleep(900);
      const r=await p.evaluate(contrastAudit,rootSel);
      if(r.err){check(`${sz} ${name} : écran ouvert`,false,r.err);return;}
      check(`${sz} ${name} : ${r.n} éléments, tous bien visibles`,!r.bad.length,r.bad.slice(0,12));
      if((r.bad.length||process.env.CA_ALL)&&process.env.SHOTS_DIR)await p.screenshot({path:process.env.SHOTS_DIR+'/'+name.replace(/[^a-z0-9]+/gi,'_')+'.png'}).catch(()=>{});
    };
    const step=async(name,fn,rootSel)=>{try{await fn();await audit(name,rootSel);}catch(e){check(`${sz} ${name}`,false,String(e.message||e).slice(0,200));}};

    // ═════ App habitant ═════
    await p.goto(BASE+'app.html',{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'));
    await audit('app accueil non connecté','#onboard');
    await step('app inscription',()=>p.evaluate(()=>showAuthWall('signup')),'#auth-wall');
    await step('app connexion',()=>p.evaluate(()=>showAuthWall('login')),'#auth-wall');
    await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active'));await sleep(2500);
    await audit('app accueil','#home');
    await step('app accueil, plus de commerces',()=>p.evaluate(()=>{const b=document.getElementById('dnb-more');if(b)b.click();}),'#home');
    await step('app communauté',()=>p.evaluate(()=>goNav('social')),'#social');
    await step('app amis (suggestions)',async()=>{await p.evaluate(()=>socTab('friends',document.querySelector('.tab-btn[onclick*="friends"]')));await wf(p,()=>document.querySelector('#friend-sugg .sg-card'),null,15000).catch(()=>{});},'#social');
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
    await step('app messages',()=>p.evaluate(()=>openInbox()),'#inbox');
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
    const auditD=async(name,rootSel)=>{await sleep(900);const r=await d.evaluate(contrastAudit,rootSel);if(r.err){check(`${sz} ${name}`,false,r.err);return;}
      check(`${sz} ${name} : ${r.n} éléments, tous bien visibles`,!r.bad.length,r.bad.slice(0,12));
      if((r.bad.length||process.env.CA_ALL)&&process.env.SHOTS_DIR)await d.screenshot({path:process.env.SHOTS_DIR+'/'+name.replace(/[^a-z0-9]+/gi,'_')+'.png'}).catch(()=>{});};
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
        const r=await a.evaluate(contrastAudit,'#tab-'+tab);if(r.err){check(`${sz} admin ${tab}`,false,r.err);continue;}
        check(`${sz} admin ${tab} : ${r.n} éléments, tous bien visibles`,!r.bad.length,r.bad.slice(0,12));
        if((r.bad.length||process.env.CA_ALL)&&process.env.SHOTS_DIR)await a.screenshot({path:process.env.SHOTS_DIR+'/admin_'+tab+'.png'}).catch(()=>{});
      }catch(e){check(`${sz} admin ${tab}`,false,String(e.message).slice(0,200));}
    }
    check(`${sz} aucune erreur JavaScript`,!errs.length,[...new Set(errs)].slice(0,5));
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${pass} ok, ${fail} échec(s)`);
  process.exit(0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,500));process.exit(1);});
