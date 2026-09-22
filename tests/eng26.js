// Réglages de l'app (plus aéré/soigné), « Tes avis ont aidé » déplacé du profil vers le fil, nouvelle DA (badges noirs, CTA jaune plat, coins plus ronds) sur le dashboard.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,3).join(' | '));}};
const wf=(p,fn,arg,t=25000)=>p.waitForFunction(fn,{timeout:t,polling:200},arg);
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const CHROME=(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const APP='http://localhost:8950/app.html',DASH='http://localhost:8950/dash.html';
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
const AXE=require('fs').readFileSync(require('path').join(__dirname,'node_modules/axe-core/axe.min.js'),'utf8');
const axeCheck=async(p,name)=>{await p.evaluate(AXE);const r=await p.evaluate(async()=>{const res=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}});return res.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id+' ×'+v.nodes.length+' '+v.nodes.slice(0,3).map(n=>n.target.join(' ')+' '+((n.any[0]&&n.any[0].data&&n.any[0].data.fgColor)?n.any[0].data.fgColor+'/'+n.any[0].data.bgColor+' '+n.any[0].data.contrastRatio:'')).join(' ; '));});check('Accessibilité (axe, contraste compris) : '+name,r.length===0,r);};
const mkCamp=(id,o={})=>db.doc('campaigns/'+id).set({merchantId:'m1',merchantName:'Le Fournil',sector:'Boulangerie',status:'active',targetCity:'le-mans',city:'le-mans',question:'Quelle boisson préfères-tu ?',questions:[{q:'Quelle boisson préfères-tu ?',format:'mcq',options:['Café','Thé','Chocolat']}],targetVolume:500,answersCount:0,createdAt:Timestamp.now(),...o});

(async()=>{
  await wipe();
  await db.doc('merchants/m1').set({role:'merchant',ownerUid:'m1',brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:'m1@shop.fr',seenDashTour:true,verifiedPopupShown:true,cashierAck:true});
  await mkCamp('c1');
  await db.doc('users/me').set({role:'user',welcomeClaimed:true,name:'Alex',email:'me@t.fr',city:'le-mans',cityLabel:'Le Mans',authorizedMerchants:['m1'],friendUids:[],answeredCampaigns:[],points:120,xp:120,streak:0,interests:['restauration'],onboardingStep:'done',seenHomeTour:true});
  await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});await aauth.createUser({uid:'m1',email:'m1@shop.fr',password:'secret123'});
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});

  await T('profil : réglages plus aérés, "tes avis" retiré',async()=>{
    const _ctx=await browser.createBrowserContext();const p=await _ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:2});
    await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user,null,30000);
    await p.addStyleTag({content:'body>div[style*="emulator"]{display:none!important}'});
    await p.evaluate(()=>{document.querySelectorAll('[id*=tour],.tour-ov').forEach(e=>e.remove());goNav('profile');refreshProfile();});await sleep(700);
    const closed=await p.evaluate(()=>{
      const cards=[...document.querySelectorAll('#profile .sec-card')];
      const gaps=cards.map(c=>Math.round(c.getBoundingClientRect().top)).slice(1).map((t,i)=>t-Math.round(cards[i].getBoundingClientRect().bottom));
      return {
        txt:document.getElementById('profile').innerText,
        eyebrows:[...document.querySelectorAll('#profile .set-eyebrow')].map(e=>e.textContent),
        headerBadges:document.querySelectorAll('#profile .sc-hdr .sc-ico').length,
        rowBadges:document.querySelectorAll('#profile .consent-it .set-ico').length,
        gaps,
      };
    });
    check('« Tes avis ont aidé » n\'apparaît plus dans le profil',!/Tes avis ont aidé|commencer à aider les commerces/.test(closed.txt),closed.txt.slice(0,200));
    check('Groupes d\'accordéons introduits par une étiquette (Compte, Confidentialité, Préférences, Activité)',closed.eyebrows.join('|')==='Compte|Confidentialité|Préférences|Activité',closed.eyebrows);
    check('Chaque en-tête d\'accordéon porte un badge d\'icône noir (6)',closed.headerBadges===6,closed.headerBadges);
    check('Les lignes portent un badge d\'icône clair, plus de simples traits d\'icône nus (7)',closed.rowBadges===7,closed.rowBadges);
    check('Plus d\'air entre les blocs (au moins 14 px entre deux accordéons)',closed.gaps.every(g=>g>=14),closed.gaps);
    await p.screenshot({path:'/tmp/shots/profile_settings.png'});
    await p.evaluate(()=>{document.querySelectorAll('.sec-card.acc').forEach(c=>c.classList.add('open'));});await sleep(400);
    const open=await p.evaluate(()=>{
      const row=document.querySelector('#profile .consent-it');
      const tgl=document.querySelector('#profile .tgl').getBoundingClientRect();
      return {rowH:Math.round(row.getBoundingClientRect().height),tglW:Math.round(tgl.width)};
    });
    check('Lignes plus hautes une fois ouvertes (au moins 58 px, contre ~43 px avant)',open.rowH>=58,open.rowH);
    check('Interrupteurs agrandis (46 px de large)',open.tglW===46,open.tglW);
    await p.screenshot({path:'/tmp/shots/profile_settings_open.png'});
    await axeCheck(p,'profil (accordéons ouverts, nouveau style)');
    check('Aucune erreur JavaScript',errs.length===0,errs);
    await _ctx.close();
  });

  await T('fil : "tes avis ont aidé" en tête, jamais pour un autre',async()=>{
    await db.doc('answers/x1').set({userId:'me',merchantId:'m1',brand:'Le Fournil',campaignId:'c1',questionIdx:0,pointsAwarded:10,flagged:false,createdAt:Timestamp.now()});
    const _ctx=await browser.createBrowserContext();const p=await _ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:2});
    await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user&&(S.hist||[]).length>0,null,15000);
    await p.addStyleTag({content:'body>div[style*="emulator"]{display:none!important}'});
    await p.evaluate(()=>{document.querySelectorAll('[id*=tour],.tour-ov').forEach(e=>e.remove());goNav('social');});
    await wf(p,()=>document.querySelector('#feed-content .feed-post'),null,20000);await sleep(700);
    const d=await p.evaluate(()=>({first:document.querySelector('#feed-content .feed-post').className,txt:document.querySelector('#feed-content .feed-post').textContent.replace(/\s+/g,' ').trim(),noOther:!document.getElementById('profile').querySelector('.dimpact')}));
    check('Fil : première carte = « Tes avis ont aidé 1 commerce de ton quartier à mieux te connaître »',/cm-mine/.test(d.first)&&/Tes avis ont aidé 1 commerce de ton quartier à mieux te connaître/.test(d.txt),d);
    check('Cette carte n\'est stockée nulle part (aucun communityEvent créé pour elle)',(await db.collection('communityEvents').get()).empty);
    await p.screenshot({path:'/tmp/shots/feed_mine_card.png'});
    check('Aucune erreur JavaScript',errs.length===0,errs);
    await _ctx.close();
  });

  await T('fil : sans historique, pas de carte "tes avis"',async()=>{
    await db.doc('users/nu').set({role:'user',welcomeClaimed:true,name:'Sam',email:'nu@t.fr',city:'le-mans',cityLabel:'Le Mans',authorizedMerchants:['m1'],friendUids:[],answeredCampaigns:[],points:0,xp:0,streak:0,interests:[],onboardingStep:'done',seenHomeTour:true});
    await aauth.createUser({uid:'nu',email:'nu@t.fr',password:'secret123'});
    const _ctx=await browser.createBrowserContext();const p=await _ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:2});
    await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','nu@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user,null,30000);
    await p.addStyleTag({content:'body>div[style*="emulator"]{display:none!important}'});
    await p.evaluate(()=>{document.querySelectorAll('[id*=tour],.tour-ov').forEach(e=>e.remove());goNav('social');});await sleep(1500);
    const txt=await p.evaluate(()=>document.getElementById('feed-content').innerText.replace(/\s+/g,' '));
    check('Sans aucune réponse : aucune carte « Tes avis ont aidé »',!/Tes avis ont aidé/.test(txt),txt.slice(0,160));
    check('Aucune erreur JavaScript',errs.length===0,errs);
    await _ctx.close();
  });

  await T('dashboard : nouvelle DA (badges noirs, CTA jaune plat)',async()=>{
    const _ctx=await browser.createBrowserContext();const p=await _ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.setViewport({width:1280,height:1000});
    await p.evaluateOnNewDocument(()=>{try{localStorage.setItem('nv_pro_intro','1');}catch(e){}});
    await p.goto(DASH,{waitUntil:'load'});await wf(p,()=>document.getElementById('auth-wall').style.display==='flex',null,30000);
    await p.evaluate(()=>awTab('login'));await setVal(p,'#aw-email','m1@shop.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>typeof _mData!=='undefined'&&_mData&&_mData.brandName==='Le Fournil',null,25000);
    await p.evaluate(()=>{try{endDashTour();}catch(e){}});await sleep(700);
    const d=await p.evaluate(()=>({
      nvYellow:getComputedStyle(document.documentElement).getPropertyValue('--nv-yellow').trim(),
      radius:getComputedStyle(document.documentElement).getPropertyValue('--r').trim(),
      sbIco:getComputedStyle([...document.querySelectorAll('.sb-item')].find(b=>!b.classList.contains('active')).querySelector('.sb-ico')).backgroundColor,
      sbIcoActive:getComputedStyle(document.querySelector('.sb-item.active .sb-ico')).backgroundColor,
      kpiIco:getComputedStyle(document.querySelector('.kpi-icon')).backgroundColor,
      btnBg:getComputedStyle(document.getElementById('topbar-new-camp-btn')).backgroundColor,
      btnColor:getComputedStyle(document.getElementById('topbar-new-camp-btn')).color,
      cardRadius:getComputedStyle(document.querySelector('.kpi-card')).borderRadius,
    }));
    check('Jeton --nv-yellow défini (#FFC300), rayon des cartes agrandi (20px)',d.nvYellow.replace(/\s/g,'').toLowerCase()==='#ffc300'&&d.radius.trim()==='20px',d);
    check('Icônes de la barre latérale (au repos) et des indicateurs en badge noir (comme les puces de l\'app)',/rgb\(23, 20, 26\)/.test(d.sbIco)&&/rgb\(23, 20, 26\)/.test(d.kpiIco),d);
    check('Icône active de la barre latérale : pastille jaune plate (comme la navigation active de l\'app)',/rgb\(255, 195, 0\)/.test(d.sbIcoActive),d.sbIcoActive);
    check('Bouton principal (« + Nouvelle campagne ») : jaune plat #FFC300, texte sombre — CTA de l\'app',/rgb\(255, 195, 0\)/.test(d.btnBg)&&/rgb\(23, 20, 26\)/.test(d.btnColor),d);
    check('Cartes nettement plus rondes (20px, contre 16px avant)',d.cardRadius==='20px',d.cardRadius);
    await p.screenshot({path:'/tmp/shots/dash_new_da.png'});
    await axeCheck(p,'dashboard : nouvelle DA (accueil)');
    await p.evaluate(()=>navTo('rewards',document.getElementById('nav-rewards')));await sleep(600);
    await axeCheck(p,'dashboard : nouvelle DA (vitrine récompenses)');
    check('Aucune erreur JavaScript',errs.length===0,errs);
    await _ctx.close();
  });

  await browser.close();
  console.log('\n'+pass+' ok, '+fail+' échec(s)');process.exit(fail?1:0);
})();
