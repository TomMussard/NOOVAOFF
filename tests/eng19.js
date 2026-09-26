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

const AUTH='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake';
const idTokenOf=async(email)=>(await (await fetch(AUTH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'secret123',returnSecureToken:true})})).json()).idToken;
const callFn=async(name,data,token)=>{const r=await fetch('http://127.0.0.1:5001/noova-366d0/europe-west1/'+name,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({data})});const j=await r.json();return j.error?{error:j.error.status,message:j.error.message}:j.result;};
const until=async(fn,t=15000)=>{const s=Date.now();while(Date.now()-s<t){if(await fn())return true;await sleep(300);}return false;};
const AXE=require('fs').readFileSync(require('path').join(__dirname,'node_modules/axe-core/axe.min.js'),'utf8');
const axeCheck=async(p,name)=>{await p.evaluate(AXE);const r=await p.evaluate(async()=>{const res=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}});return res.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id+' ×'+v.nodes.length+' '+v.nodes.slice(0,3).map(n=>n.target.join(' ')+' '+((n.any[0]&&n.any[0].data&&n.any[0].data.fgColor)?n.any[0].data.fgColor+'/'+n.any[0].data.bgColor+' '+n.any[0].data.contrastRatio:'')).join(' ; '));});check('Accessibilité (axe, contraste compris) : '+name,r.length===0,r);};
const T7=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e).slice(0,400));if(PG)console.log('DBG',JSON.stringify(await PG.evaluate(()=>({qs:(S.qs||[]).map(q=>q._firestoreId+':'+(q._discovery?'D':'F')),disc:(S._discovery||[]).map(m=>m.id),auth:S._authorizedMerchants})).catch(x=>String(x))));}};
const hash01=(str)=>{let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return ((h>>>0)%10000)/10000;};
const pick=(uid,want)=>{for(let i=0;i<200;i++){const id='r'+i;if((hash01(uid+'|'+id)<0.15)===want)return id;}};
const H=3600000;
(async()=>{
  await wipe();
  const mk=(id,name,sector,o={})=>db.doc('merchants/'+id).set({role:'merchant',ownerUid:id,brandName:name,name,sector,city:'le-mans',cityLabel:'Le Mans',status:'verified',email:id+'@shop.fr',...o});
  await mk('m1','Le Fournil','Boulangerie');await mk('m2','Studio Fit','Sport');await mk('m3','Le Bar','Restauration');await mk('m4','Pas vérifié','Sport',{status:'pending'});
  await mk('m5','Petit Angers','Sport',{city:'angers',cityLabel:'Angers'});await mk('m6','Gym Refusé','Sport');await mk('m7','Zen Sport','Sport');
  const camp=(id,mid,name,sector,ageMs,o={})=>db.doc('campaigns/'+id).set({merchantId:mid,merchantName:name,sector,status:'active',targetCity:'le-mans',city:'le-mans',question:'Question de '+name+' ?',questions:[{q:'Question de '+name+' ?',format:'mcq',options:['Oui','Non']}],answersCount:0,createdAt:Timestamp.fromMillis(Date.now()-ageMs),...o});
  const idShow=pick('me',true),idHide=pick('me',false);
  await camp('cF','m3','Le Bar','Restauration',3*H);
  await camp('cS','m2','Studio Fit','Sport',2*H);
  await camp(idShow,'m1','Le Fournil','Boulangerie',H);
  await camp(idHide,'m1','Le Fournil','Boulangerie',H/2);
  await camp('cX','m6','Gym Refusé','Sport',H/3);
  await mkUser('me',{name:'Alex',email:'me@t.fr',interests:['sport'],authorizedMerchants:['m3'],declinedMerchants:['m6'],ageRange:'18-24'});
  await mkUser('me2',{name:'Bea',email:'me2@t.fr',interests:['restauration'],authorizedMerchants:['m3'],ageRange:'25-34'});
  for(const u of ['me','me2'])await aauth.createUser({uid:u,email:u+'@t.fr',password:'secret123'});
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const p=await browser.newPage();PG=p;await p.setViewport({width:390,height:900,isMobile:true,hasTouch:true,deviceScaleFactor:2});const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
  await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
  await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user&&S.qs&&S.qs.length>=3,null,30000);
  await p.addStyleTag({content:'body>div[style*="emulator"]{display:none!important}'});await sleep(800);
  await p.evaluate(()=>{document.querySelectorAll('[id*=tour],.tour-ov').forEach(e=>e.remove());});

  await T7('accueil : questions découverte',async()=>{
    const f=await p.evaluate(()=>({order:S.qs.map(q=>q._firestoreId+':'+(q._discovery?'D':'F')),reasons:S.qs.map(q=>q._reason),today:document.getElementById('today-card').className,pill:getComputedStyle(document.getElementById('tc-disc')).display,todayBrand:document.getElementById('tc-brand').textContent,rows:[...document.querySelectorAll('#queue-list .q-card')].map(r=>({disc:r.classList.contains('disc'),tag:(r.querySelector('.disc-tag')||{}).textContent||'',txt:r.textContent.replace(/\s+/g,' ')})),req:document.getElementById('home-requests').textContent.trim(),btns:[...document.querySelectorAll('#home button')].map(b=>b.textContent).join('|')}));
    check('Un commerce non suivi arrive DIRECTEMENT dans les questions à répondre : Studio Fit (sport, intérêt de l\'habitant) en tête, avant le commerce suivi (Le Bar), puis un commerce tiré au hasard',f.order.join()==='cS:D,cF:F,'+idShow+':D',f.order);
    check('Raisons : intérêt pour Studio Fit, hasard pour Le Fournil (il n\'aime pas la boulangerie) ; le commerce que l\'habitant a écarté (Gym Refusé) et celui du hasard non tiré ne sont pas proposés',f.reasons[0]==='interest'&&f.reasons[2]==='random'&&!f.order.some(x=>x.startsWith('cX')||x.startsWith(idHide+':')),f);
    // Mode collection : un commerce découverte est aussi, par définition, un commerce jamais répondu — le badge
    // « Nouvelle carte » (ajouté depuis) prend le pas sur « Découverte » dans la file (même logique, cadrage plus engageant).
    check('La carte du jour est « découverte » (autre couleur, pastille), la liste marque les découvertes d\'une autre couleur (« Nouvelle carte ») et pas le commerce suivi',/disc/.test(f.today)&&f.pill!=='none'&&f.todayBrand==='Studio Fit'&&f.rows.length===2&&!f.rows[0].disc&&f.rows[1].disc&&/Nouvelle carte/.test(f.rows[1].tag)&&/tu ne le suis pas encore/.test(f.rows[1].txt),f);
    check('Plus de section « Demandes » ni de boutons Autoriser / Non merci sur l\'accueil',f.req===''&&!/Autoriser|Non merci/.test(f.btns),f.btns);
    const bg=await p.evaluate(()=>[getComputedStyle(document.querySelector('#today-card .dtoday-body')).backgroundColor,getComputedStyle(document.querySelector('#queue-list .q-card.disc')).backgroundColor,getComputedStyle(document.querySelector('#queue-list .q-card:not(.disc)')).backgroundColor]);
    check('Couleurs distinctes : carte du jour verte (découverte), carte découverte verte claire, carte suivie blanche',bg[0]!==bg[1]&&bg[1]!==bg[2]&&bg[0]!=='rgb(255, 255, 255)',bg);
    await p.screenshot({path:'/tmp/shots/disc_home.png'});await axeCheck(p,'accueil avec questions découverte');
    // plafond
    for(let i=0;i<4;i++)await camp('cap'+i,'m7','Zen Sport','Sport',(10+i)*60000);
    await wf(p,()=>S.qs.filter(q=>q._discovery).length>=3,null,10000);await sleep(800);
    check('Plafond : au plus 3 questions découverte sur l\'accueil (les intérêts d\'abord)',await p.evaluate(()=>S.qs.filter(q=>q._discovery).length===3),await p.evaluate(()=>S.qs.map(q=>q._firestoreId)));
    for(let i=0;i<4;i++)await db.doc('campaigns/cap'+i).delete();
    await wf(p,()=>!S.qs.some(q=>/^cap/.test(q._firestoreId)),null,10000);
  });

  await T7('répondre à une question découverte, puis suivre',async()=>{
    await p.evaluate(()=>openQ(0));await sleep(500);
    await axeCheck(p,'écran de question découverte');
    check('Écran de la question : plus d\'encart « Découverte » qui explique le partage (retiré, cf. retour mairie sur la clarté)',await p.evaluate(()=>getComputedStyle(document.getElementById('q-disc-note')).display==='none'));
    await p.evaluate(()=>document.querySelector('#ans-area .mcq-opt').click());await sleep(3600);await p.evaluate(()=>submitAns());
    await wf(p,()=>document.getElementById('reward').classList.contains('active')&&document.querySelector('#rw-follow .follow-card'),null,15000);
    if(await p.evaluate(()=>document.getElementById('card-unlock').classList.contains('open'))){
      await p.evaluate(()=>document.getElementById('cu-continue').click());
    }
    const ans=(await db.doc('answers/me_cS_q0').get()).data();
    check('Réponse enregistrée pour un commerce non suivi : marquée « découverte », SANS âge ni centres d\'intérêt (ville seulement)',ans&&ans.discovery===true&&ans.respondentAge===''&&Array.isArray(ans.respondentInterests)&&ans.respondentInterests.length===0&&ans.respondentCity==='le-mans',ans);
    check('Après la réponse : proposition « Tu veux suivre Studio Fit ? » avec Suivre / Pas maintenant / Ne plus voir ce commerce',await p.evaluate(()=>{const c=document.querySelector('#rw-follow .follow-card');return !!c&&/Tu veux suivre Studio Fit/.test(c.textContent)&&/Suivre/.test(c.textContent)&&/Pas maintenant/.test(c.textContent)&&/Ne plus voir ce commerce/.test(c.textContent);}));
    await p.evaluate(()=>{{const c=document.getElementById('celebrate-sheet');if(c)c.classList.remove('show');if(c)c.style.display='none';}document.getElementById('reward').scrollTop=9999;});await sleep(400);await p.screenshot({path:'/tmp/shots/disc_follow.png'});await axeCheck(p,'écran récompense avec proposition de suivre');
    await p.evaluate(()=>document.querySelector('#rw-follow .btn-p').click());
    await until(async()=>((await db.doc('users/me').get()).data().authorizedMerchants||[]).includes('m2'));
    const ev=(await db.collection('consentEvents').where('userId','==','me').get()).docs.map(d=>d.data().merchantId+':'+d.data().action);
    await until(async()=>(await db.doc('merchants/m2').get()).data().consentCount===1);
    check('Suivre : le commerce est autorisé, le consentement est journalisé et compté côté commerce',ev.includes('m2:granted')&&(await db.doc('merchants/m2').get()).data().consentCount===1,ev);
    check('Le bouton est remplacé par « Tu suis Studio Fit »',await p.evaluate(()=>/Tu suis Studio Fit/.test(document.getElementById('rw-follow').textContent)));
    await p.evaluate(()=>goNav('home'));await sleep(800);
    const after=await p.evaluate(()=>S.qs.map(q=>q._firestoreId+':'+(q._discovery?'D':'F')));
    check('Après avoir suivi Studio Fit, ses autres questions ne sont plus des « découvertes »',!after.some(x=>/^cap/.test(x))&&after.join()==='cF:F,'+idShow+':D',after);
  });

  await T7('ne plus voir / pas maintenant',async()=>{
    await p.evaluate(()=>openQ(S.qs.findIndex(q=>q._discovery)));await sleep(500);
    await p.evaluate(()=>document.querySelector('#ans-area .mcq-opt').click());await sleep(3600);await p.evaluate(()=>submitAns());
    await wf(p,()=>document.querySelector('#rw-follow .fc-x'),null,15000);
    await p.evaluate(()=>document.querySelector('#rw-follow .fc-x').click());
    await until(async()=>((await db.doc('users/me').get()).data().declinedMerchants||[]).includes('m1'));
    const u=(await db.doc('users/me').get()).data();
    check('« Ne plus voir ce commerce » : Le Fournil est écarté (jamais autorisé), avec confirmation à l\'écran',u.declinedMerchants.includes('m1')&&!u.authorizedMerchants.includes('m1')&&await p.evaluate(()=>/on ne te proposera plus ce commerce/.test(document.getElementById('rw-follow').textContent)),u);
    await db.doc('campaigns/cN').set({merchantId:'m7',merchantName:'Zen Sport',sector:'Sport',status:'active',targetCity:'le-mans',city:'le-mans',question:'Q Zen ?',questions:[{q:'Q Zen ?',format:'mcq',options:['Oui','Non']}],answersCount:0,createdAt:Timestamp.now()});
    await p.evaluate(()=>goNav('home'));await wf(p,()=>S.qs.some(q=>q._firestoreId==='cN'),null,10000);
    await p.evaluate(()=>openQ(S.qs.findIndex(q=>q._firestoreId==='cN')));await sleep(500);
    await p.evaluate(()=>document.querySelector('#ans-area .mcq-opt').click());await sleep(3600);await p.evaluate(()=>submitAns());
    await wf(p,()=>document.querySelector('#rw-follow .fc-b'),null,15000);
    await p.evaluate(()=>document.querySelector('#rw-follow .btn-s').click());
    const u2=(await db.doc('users/me').get()).data();
    check('« Pas maintenant » : la proposition disparaît, rien n\'est enregistré (ni suivi, ni écarté)',await p.evaluate(()=>document.getElementById('rw-follow').innerHTML.trim()==='')&&!u2.authorizedMerchants.includes('m7')&&!(u2.declinedMerchants||[]).includes('m7'),u2);
    await p.evaluate(()=>goNav('home'));await sleep(800);
    check('Le commerce écarté n\'apparaît plus jamais (ses questions restent masquées)',await p.evaluate(()=>!S.qs.some(q=>q._merchantId==='m1')));
    check('Aucune erreur JavaScript',errs.length===0,errs);
  });

  await T7('serveur : règles d\'accès aux questions découverte',async()=>{
    const t=await idTokenOf('me2@t.fr');
    await camp('sd','m7','Zen Sport','Sport',0);
    await callFn('beginQuestion',{campaignId:'sd',questionIdx:0},t);await sleep(3300);
    const ok=await callFn('submitAnswer',{campaignId:'sd',questionIdx:0,answerValue:'Oui'},t);
    const a=(await db.doc('answers/me2_sd_q0').get()).data();
    check('Serveur : un commerce vérifié de la même ville non suivi accepte la réponse « découverte » (points crédités normalement)',!ok.error&&a.discovery===true&&a.respondentAge===''&&a.respondentInterests.length===0&&a.pointsAwarded>0,{ok,a:a&&{d:a.discovery,age:a.respondentAge,pts:a.pointsAwarded}});
    await callFn('beginQuestion',{campaignId:'cF',questionIdx:0},t);await sleep(3300);
    const ok2=await callFn('submitAnswer',{campaignId:'cF',questionIdx:0,answerValue:'Oui'},t);
    const a2=(await db.doc('answers/me2_cF_q0').get()).data();
    check('Commerce SUIVI : réponse complète avec tranche d\'âge et centres d\'intérêt, non marquée « découverte »',!ok2.error&&a2.discovery===false&&a2.respondentAge==='25-34'&&a2.respondentInterests.join()==='restauration',a2);
    await db.doc('users/me2').update({declinedMerchants:['m6']});
    const dec=await callFn('submitAnswer',{campaignId:'cX',questionIdx:0,answerValue:'Oui'},t);
    check('Commerce écarté par l\'habitant : refusé côté serveur',dec.error==='PERMISSION_DENIED'&&/ne plus voir/.test(dec.message),dec);
    await camp('cU','m4','Pas vérifié','Sport',0);
    const unv=await callFn('submitAnswer',{campaignId:'cU',questionIdx:0,answerValue:'Oui'},t);
    check('Commerce non vérifié : refusé',unv.error==='PERMISSION_DENIED'&&/pas disponible/.test(unv.message),unv);
    await camp('cA','m5','Petit Angers','Sport',0,{targetCity:'angers',city:'angers'});
    const ang=await callFn('submitAnswer',{campaignId:'cA',questionIdx:0,answerValue:'Oui'},t);
    check('Commerce d\'une autre ville : refusé',ang.error==='PERMISSION_DENIED',ang);
    await camp('cG','ghost','Fantôme','Sport',0);
    const gh=await callFn('submitAnswer',{campaignId:'cG',questionIdx:0,answerValue:'Oui'},t);
    check('Commerce inexistant : refusé',gh.error==='PERMISSION_DENIED',gh);
  });
  await browser.close();
  console.log('\n'+pass+' ok, '+fail+' échec(s)');process.exit(fail?1:0);
})();
