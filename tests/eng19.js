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

  await T7('accueil : questions suivies d\'abord, puis découvertes',async()=>{
    await p.evaluate(()=>{goNav('home');refreshHome();});await sleep(600);
    const f=await p.evaluate(()=>({order:S.qs.map(q=>q._merchantId+':'+(q._discovery?'D':'F')),disc:[...document.querySelectorAll('#hm-feed-q .hq-card.disc')].map(c=>({tag:c.tagName,lbl:(c.querySelector('.hq-disc-tag')||{}).textContent,txt:c.textContent.replace(/\s+/g,' '),border:getComputedStyle(c.querySelector('.hq-bd')).borderStyle}))}));
    check('Ordre : toutes les questions des commerces suivis (Le Bar), puis les commerces ni suivis ni écartés (Studio Fit, Le Fournil) ; jamais l\'écarté, le non vérifié ou une autre ville',f.order.join()==='m3:F,m2:D,m1:D',f.order);
    check('Carte « Découverte » : une carte qui ouvre la question (plus de pop-up ni de boutons sur la carte), pastille, pointillés',f.disc.length===2&&f.disc.every(d=>d.tag==='BUTTON'&&d.lbl==='Découverte'&&/tu ne le suis pas encore/.test(d.txt)&&/dashed/.test(d.border)),f.disc);
    await p.screenshot({path:(process.env.SHOTS_DIR||'/tmp/shots')+'/disc_home.png'}).catch(()=>{});await axeCheck(p,'accueil avec commerces à découvrir');
  });

  await T7('écran de la question découverte : Valider / Passer / Suivre',async()=>{
    await p.evaluate(()=>[...document.querySelectorAll('#hm-feed-q .hq-card.disc')].find(x=>/Studio Fit/.test(x.textContent)).click());
    await wf(p,()=>document.getElementById('question').classList.contains('active')&&S.curQ&&S.curQ._firestoreId==='cS',null,10000);
    const q=await p.evaluate(()=>({pop:document.getElementById('nv-pop').style.display,txt:document.getElementById('q-text').textContent,opts:document.querySelectorAll('#ans-area .mcq-opt').length,note:document.getElementById('q-disc-note').textContent,noteShown:document.getElementById('q-disc-note').style.display!=='none',badge:!!document.querySelector('#bh-name .bh-disc'),follow:document.getElementById('q-follow').hidden?'':document.getElementById('q-follow').textContent,skip:document.getElementById('skip-btn').textContent,sub:document.getElementById('sub-btn').textContent}));
    check('La question et ses réponses sont visibles tout de suite, sans pop-up qui les cache',q.pop!=='flex'&&/Studio Fit/.test(q.txt)&&q.opts===2,q);
    check('Bulle « Découverte » et explication : répondre = suivre, « Passer » = ne plus voir ses questions',q.badge&&q.noteShown&&/En répondant, tu le suis/.test(q.note)&&/« Passer » : tu ne verras plus ses questions/.test(q.note),q.note);
    check('3 boutons : « Valider » (grand, verrouillé 3 s le temps de lire), « Passer », « Suivre Studio Fit sans répondre »',/Valider|Prends le temps de lire/.test(q.sub)&&q.skip==='Passer'&&q.follow==='Suivre Studio Fit sans répondre',q);
    await p.screenshot({path:(process.env.SHOTS_DIR||'/tmp/shots')+'/disc_question.png'}).catch(()=>{});
    await p.evaluate(()=>document.getElementById('q-follow').click());
    await until(async()=>((await db.doc('users/me').get()).data().authorizedMerchants||[]).includes('m2'));await sleep(400);
    const ev=(await db.collection('consentEvents').where('userId','==','me').get()).docs.map(d=>d.data().merchantId+':'+d.data().action);
    const st=await p.evaluate(()=>({f:document.getElementById('q-follow').textContent,dis:document.getElementById('q-follow').disabled,q:cur==='question'&&S.curQ._firestoreId==='cS',badge:!!document.querySelector('#bh-name .bh-disc')}));
    check('« Suivre » : commerce autorisé (consentement journalisé), on reste sur la question, « Tu suis Studio Fit ✓ »',ev.includes('m2:granted')&&st.q&&st.dis&&st.f==='Tu suis Studio Fit ✓'&&!st.badge,{ev,st});
    await p.evaluate(()=>document.querySelector('#ans-area .mcq-opt').click());await sleep(3400);await p.evaluate(()=>submitAns());
    await until(async()=>(await db.doc('answers/me_cS_q0').get()).exists);
    const ans=(await db.doc('answers/me_cS_q0').get()).data();
    check('Réponse complète (commerce suivi) : tranche d\'âge, non marquée « découverte »',ans.discovery===false&&ans.respondentAge==='18-24',ans);
  });

  await T7('« Passer » sur une découverte = ne plus voir ce commerce',async()=>{
    await p.evaluate(()=>goNav('home'));await sleep(800);
    await p.evaluate(()=>openQ(S.qs.findIndex(q=>q._merchantId==='m1')));await sleep(400);
    check('Question du Fournil ouverte en découverte',await p.evaluate(()=>cur==='question'&&S.curQ._merchantId==='m1'&&!document.getElementById('q-follow').hidden));
    await p.evaluate(()=>document.getElementById('skip-btn').click());
    await until(async()=>((await db.doc('users/me').get()).data().declinedMerchants||[]).includes('m1'));await sleep(600);
    const u=(await db.doc('users/me').get()).data();
    check('« Passer » : Le Fournil écarté (jamais suivi), toutes ses questions disparaissent et ne reviennent plus',u.declinedMerchants.includes('m1')&&!u.authorizedMerchants.includes('m1')&&await p.evaluate(()=>!S.qs.some(q=>q._merchantId==='m1')),u);
    await p.evaluate(()=>{refreshHome();});await sleep(300);
    check('Après un rechargement de l\'accueil : toujours absent',await p.evaluate(()=>![...document.querySelectorAll('#hm-feed-q .hq-card')].some(c=>/Le Fournil/.test(c.textContent))));
  });

  await T7('répondre directement à une découverte = suivre',async()=>{
    await db.doc('campaigns/cN').set({merchantId:'m7',merchantName:'Zen Sport',sector:'Sport',status:'active',targetCity:'le-mans',city:'le-mans',question:'Q Zen ?',questions:[{q:'Q Zen ?',format:'mcq',options:['Oui','Non']}],answersCount:0,createdAt:Timestamp.now()});
    await wf(p,()=>S.qs.some(q=>q._firestoreId==='cN'),null,10000);
    await p.evaluate(()=>openQ(S.qs.findIndex(q=>q._firestoreId==='cN')));await sleep(400);
    await p.evaluate(()=>document.querySelector('#ans-area .mcq-opt').click());await sleep(3400);await p.evaluate(()=>submitAns());
    await until(async()=>(await db.doc('answers/me_cN_q0').get()).exists,15000);
    const u=(await db.doc('users/me').get()).data(),a=(await db.doc('answers/me_cN_q0').get()).data();
    check('Zen Sport : suivi en répondant, réponse complète',u.authorizedMerchants.includes('m7')&&a.discovery===false,{auth:u.authorizedMerchants,disc:a.discovery});
  });

  await T7('« Passer » sur une question suivie = question suivante',async()=>{
    await db.doc('campaigns/cF2').set({merchantId:'m3',merchantName:'Le Bar',sector:'Restauration',status:'active',targetCity:'le-mans',city:'le-mans',question:'Autre question du Bar ?',questions:[{q:'Autre question du Bar ?',format:'mcq',options:['Oui','Non']}],answersCount:0,createdAt:Timestamp.now()});
    await p.evaluate(()=>goNav('home'));
    await wf(p,()=>S.qs.some(q=>q._firestoreId==='cF2'),null,10000);
    await p.evaluate(()=>openQ(S.qs.findIndex(q=>q._firestoreId==='cF')));await sleep(400);
    check('Question suivie : pas de bouton « Suivre », pas de bulle « Découverte »',await p.evaluate(()=>document.getElementById('q-follow').hidden&&!document.querySelector('#bh-name .bh-disc')));
    await p.evaluate(()=>document.getElementById('skip-btn').click());await sleep(500);
    const st=await p.evaluate(()=>({cur,id:S.curQ&&S.curQ._firestoreId}));
    const u=(await db.doc('users/me').get()).data();
    check('« Passer » : la question suivante s\'ouvre (pas l\'accueil), et le commerce suivi n\'est pas écarté',st.cur==='question'&&st.id==='cF2'&&!(u.declinedMerchants||[]).includes('m3'),st);
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
