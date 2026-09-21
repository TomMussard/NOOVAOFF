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

const AXE=require('fs').readFileSync(require('path').join(__dirname,'node_modules/axe-core/axe.min.js'),'utf8');
const axeCheck=async(p,name)=>{await p.evaluate(AXE);const r=await p.evaluate(async()=>{const res=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}});return res.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id+' ×'+v.nodes.length+' '+v.nodes.slice(0,2).map(n=>n.target.join(' ')+' '+((n.any[0]&&n.any[0].data&&n.any[0].data.fgColor)?n.any[0].data.fgColor+'/'+n.any[0].data.bgColor+' '+n.any[0].data.contrastRatio:'')).join(' ; '));});check('Accessibilité (axe, contraste compris) : '+name,r.length===0,r);};
const T4=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e).slice(0,400));}};
(async()=>{
  await wipe();
  const mk=(id,name,sector)=>db.doc('merchants/'+id).set({role:'merchant',brandName:name,name,sector,city:'le-mans',cityLabel:'Le Mans',status:'verified'});
  await mk('m1','Le Fournil','Boulangerie');await mk('m2','Studio Fit','Sport');await mk('m3','Café de la Place','Café');
  await mkCampaign('c1');
  await mkUser('me',{name:'Alex',email:'me@t.fr',authorizedMerchants:['m1','m2'],friendUids:['f1'],seenHomeTour:true});
  await mkUser('f1',{name:'Léa',friendUids:['me']});
  await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const p=await browser.newPage();PG=p;await p.setViewport({width:390,height:900,isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  let dialogs=[];let dialogAnswer=true;p.on('dialog',async d=>{dialogs.push(d.message());await (dialogAnswer?d.accept():d.dismiss());});
  await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
  await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
  await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user&&S.friends&&S.friends.length>=1&&(S._authorizedMerchants||[]).length===2,null,30000);
  await p.addStyleTag({content:'body>div[style*="emulator"]{display:none!important}'});
  await sleep(1200);await p.evaluate(()=>{document.querySelectorAll('[id*=tour],.tour-ov').forEach(e=>e.remove());});

  await T4('profil',async()=>{
    await p.evaluate(()=>goNav('profile'));await sleep(800);
    const L=await p.evaluate(()=>{const w=document.querySelector('#profile .profile-wrap');const kids=[...w.children];const idx=f=>kids.findIndex(f);
      return {danger:!!document.querySelector('#profile .danger-c')||/Zone danger/.test(document.getElementById('profile').textContent),
        logout:idx(k=>/Se déconnecter/.test(k.textContent)&&k.querySelector('button')),legal:idx(k=>k.matches('nav.legal-links')),n:kids.length,
        titles:[...document.querySelectorAll('#profile .sc-title')].map(x=>x.textContent),
        cguLast:!!w.lastElementChild.matches('nav.legal-links')&&/CGU/.test(w.lastElementChild.textContent),
        regl:(()=>{const c=document.getElementById('share-answers-card');return {rev:!!c.querySelector('button[onclick*=revokeAllConsents]'),del:!!c.querySelector('button[onclick*=deleteMyAccount]'),data:/Données et confidentialité/.test(c.textContent),friends:!!c.querySelector('#share-answers-inp'),how:/Comment ça marche/.test(c.textContent)};})()};});
    check('Profil : la « Zone danger » a disparu',!L.danger,L);
    check('Profil : « Se déconnecter » puis, tout en bas, les liens légaux (CGU, confidentialité, cookies…)',L.logout>=0&&L.legal===L.logout+1&&L.cguLast,L);
    check('Profil : les accordéons restent Mes informations, Commerces autorisés, Réglages, Notifications, Badges, Historique',L.titles.join('|')==='Mes informations|Commerces autorisés|Réglages|Notifications|Badges|Historique des réponses',L.titles);
    check('Réglages : contient Données et confidentialité, l\'interrupteur amis, Comment ça marche, ET les deux actions sensibles',L.regl.rev&&L.regl.del&&L.regl.data&&L.regl.friends&&L.regl.how,L.regl);
    await p.evaluate(()=>{document.getElementById('share-answers-card').classList.add('open');});
    await p.evaluate(()=>document.querySelector('#share-answers-card button[onclick*=deleteMyAccount]').click());await sleep(400);
    check('Réglages : « Supprimer mon compte » ouvre bien la confirmation (saisie de SUPPRIMER)',await p.evaluate(()=>getComputedStyle(document.getElementById('delete-account-modal')).display!=='none'));
    await p.evaluate(()=>closeDeleteAccountModal());
    await p.evaluate(()=>{document.getElementById('profile').scrollTop=99999;});await sleep(500);await p.screenshot({path:'/tmp/shots/pf_settings.png'});await axeCheck(p,'profil, Réglages ouverts');
    await p.evaluate(()=>{document.getElementById('share-answers-card').classList.remove('open');document.getElementById('profile').scrollTop=99999;});await sleep(500);await p.screenshot({path:'/tmp/shots/pf_bottom.png'});
  });
  await T4('données et confidentialité',async()=>{
    await p.evaluate(()=>document.querySelector('#share-answers-card .consent-it[onclick*=openPrivacyData]').click());await sleep(800);
    const d=await p.evaluate(()=>({active:document.getElementById('privacy-data').classList.contains('active'),txt:document.getElementById('pd-body').textContent.replace(/\s+/g,' '),bnav:document.getElementById('bnav').classList.contains('show'),tg:document.getElementById('share-answers-inp2').checked}));
    check('« Données et confidentialité » ouvre son propre écran (et non plus « Gérer mes commerces »)',d.active&&!d.bnav,d);
    check('Écran : qui voit quoi (commerces autorisés 2, amis, autres habitants, équipe), ce qui est conservé, cookies, droits',/Les commerces que tu autorises \(2\)/.test(d.txt)&&/Tes amis \(1\)/.test(d.txt)&&/Les autres habitants/.test(d.txt)&&/L'équipe Noova/.test(d.txt)&&/Ce que Noova conserve/.test(d.txt)&&/Mesure d'audience : (refusée|acceptée|pas encore choisie)/.test(d.txt)&&/Demander une copie/.test(d.txt),d.txt.slice(0,300));
    await sleep(600);await p.screenshot({path:'/tmp/shots/pd_screen.png'});await axeCheck(p,'écran Données et confidentialité');
    await p.evaluate(()=>document.getElementById('share-answers-inp2').click());await sleep(900);
    const sh=(await db.doc('users/me').get()).data().shareAnswers;
    check('Interrupteur « Montrer mes réponses à mes amis » depuis cet écran : enregistré et l\'interrupteur des Réglages suit',sh===false&&await p.evaluate(()=>document.getElementById('share-answers-inp').checked===false),sh);
    await p.evaluate(()=>document.getElementById('share-answers-inp2').click());await sleep(700);
    check('… et remis à « oui »',(await db.doc('users/me').get()).data().shareAnswers===true);
    check('« Gérer mes cookies » depuis cet écran rouvre le choix de cookies',await (async()=>{await p.evaluate(()=>document.querySelector('#pd-body [data-nv-cookies]').click());await sleep(300);const v=await p.evaluate(()=>{const b=document.getElementById('nv-consent');return !!b&&!b.hidden;});await p.evaluate(()=>{if(document.getElementById('nv-consent'))document.getElementById('nv-consent').hidden=true;});return v;})());
  });
  await T4('gérer mes commerces',async()=>{
    await p.evaluate(()=>document.querySelector('#pd-body .pd-act[onclick*=openManageMerchants]').click());
    await wf(p,()=>document.querySelectorAll('#manage-merchants .brand-item').length===3,null,15000);
    let m=await p.evaluate(()=>({sum:document.getElementById('mm-summary').textContent,btn:document.getElementById('mm-save-btn').textContent,dis:document.getElementById('mm-save-btn').disabled,auth:[...document.querySelectorAll('#mm-authorized-list .bi-name')].map(x=>x.textContent),avail:[...document.querySelectorAll('#mm-available-list .bi-name')].map(x=>x.textContent)}));
    check('Depuis « Données et confidentialité » : la liste des commerces est bien chargée (2 autorisés, 1 disponible, résumé « 2 autorisés sur 3 dans Le Mans »)',m.auth.length===2&&m.avail.join()==='Café de la Place'&&/2 autorisés sur 3 dans Le Mans/.test(m.sum),m);
    check('Bouton d\'enregistrement inactif tant qu\'il n\'y a aucune modification',m.dis&&/Aucune modification/.test(m.btn),m);
    await p.evaluate(()=>document.querySelector('#mm-available-list input').click());
    m=await p.evaluate(()=>({btn:document.getElementById('mm-save-btn').textContent,dis:document.getElementById('mm-save-btn').disabled,sum:document.getElementById('mm-summary').textContent}));
    check('Une modification : « Enregistrer 1 modification » actif, résumé mis à jour (3 autorisés)',!m.dis&&/Enregistrer 1 modification$/.test(m.btn)&&/3 autorisés/.test(m.sum),m);
    await setVal(p,'#mm-search','four');
    m=await p.evaluate(()=>({n:document.querySelectorAll('#manage-merchants .brand-item').length,name:(document.querySelector('#manage-merchants .bi-name')||{}).textContent,dirty:document.getElementById('mm-save-btn').textContent}));
    check('Recherche « four » : ne reste que Le Fournil, et la modification en cours est conservée',m.n===1&&m.name==='Le Fournil'&&/1 modification/.test(m.dirty),m);
    await setVal(p,'#mm-search','zzz');
    check('Recherche sans résultat : message « Aucun commerce ne correspond »',await p.evaluate(()=>getComputedStyle(document.getElementById('mm-nomatch')).display!=='none'));
    await setVal(p,'#mm-search','');
    await sleep(800);await p.screenshot({path:'/tmp/shots/mm_screen.png'});await axeCheck(p,'écran Gérer mes commerces');
    dialogs=[];dialogAnswer=false;
    await p.evaluate(()=>mmBack());await sleep(400);
    check('Retour avec une modification non enregistrée : confirmation, et « Annuler » reste sur l\'écran',dialogs.length===1&&/Abandonner/.test(dialogs[0])&&await p.evaluate(()=>document.getElementById('manage-merchants').classList.contains('active')),dialogs);
    dialogAnswer=true;
    await p.evaluate(()=>mmDisableAll());
    m=await p.evaluate(()=>({sum:document.getElementById('mm-summary').textContent,btn:document.getElementById('mm-save-btn').textContent,off:document.getElementById('mm-all-off').hidden}));
    check('« Tout désactiver » : 0 autorisé, 3 modifications (m1 et m2 retirés + m3 ajouté plus haut = ramené à 2 différences avec l\'état enregistré), bouton masqué',/0 autorisé/.test(m.sum)&&/Enregistrer 2 modifications/.test(m.btn)&&m.off===true,m);
    await p.evaluate(()=>document.querySelector('#manage-merchants input[data-mid="m2"]').click());
    m=await p.evaluate(()=>({btn:document.getElementById('mm-save-btn').textContent,off:document.getElementById('mm-all-off').hidden}));
    check('Réactiver Studio Fit : une seule différence (Le Fournil retiré), le bouton « Tout désactiver » réapparaît',/Enregistrer 1 modification$/.test(m.btn)&&m.off===false,m);
    const before=(await db.doc('users/me').get()).data().authorizedMerchants;
    await p.evaluate(()=>saveMerchantConsents());await sleep(1500);
    const after=(await db.doc('users/me').get()).data().authorizedMerchants;
    check('Enregistrer : seul Studio Fit reste autorisé côté serveur ; retour au profil (barre de navigation visible)',JSON.stringify(before)==='["m1","m2"]'&&JSON.stringify(after)==='["m2"]'&&await p.evaluate(()=>document.getElementById('profile').classList.contains('active')&&document.getElementById('bnav').classList.contains('show')),{before,after});
    const ev=(await db.collection('consentEvents').where('userId','==','me').get()).docs.map(d=>d.data().merchantId+':'+d.data().action);
    check('Journal des consentements (preuve RGPD) : le retrait de Le Fournil est enregistré',ev.includes('m1:revoked'),ev);
  });
  await T4('révocation depuis les réglages',async()=>{
    await p.evaluate(()=>{goNav('profile');document.getElementById('share-answers-card').classList.add('open');});
    await p.evaluate(()=>document.querySelector('#share-answers-card button[onclick*=revokeAllConsents]').click());await sleep(1500);
    check('Réglages : « Révoquer tous les consentements » fonctionne (aucun commerce autorisé ensuite)',(await db.doc('users/me').get()).data().authorizedMerchants.length===0&&dialogs.some(x=>/Révoquer/.test(x)));
    check('Aucune erreur JavaScript',errs.length===0,errs);
  });
  await browser.close();
  console.log('\n'+pass+' ok, '+fail+' échec(s)');process.exit(fail?1:0);
})();
