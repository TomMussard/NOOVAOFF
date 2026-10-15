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

  await T7('accueil : commerces à découvrir, choix avant de répondre',async()=>{
    await p.evaluate(()=>{goNav('home');refreshHome();});await sleep(600);
    const f=await p.evaluate(()=>({order:S.qs.map(q=>q._merchantId+':'+(q._discovery?'D':'F')),disc:[...document.querySelectorAll('#hm-feed-q .hq-card.disc')].map(c=>({tag:(c.querySelector('.hq-disc-tag')||{}).textContent,txt:c.textContent.replace(/\s+/g,' '),btns:[...c.querySelectorAll('button:not(.hq-who-btn)')].map(b=>b.textContent),border:getComputedStyle(c.querySelector('.hq-bd')).borderLeftStyle})),fol:[...document.querySelectorAll('#hm-feed-q .hq-card:not(.disc)')].map(c=>c.tagName)}));
    check('Le commerce suivi d\'abord (Le Bar), puis chaque commerce de la ville pas encore suivi, une seule carte par commerce (Studio Fit, Le Fournil) ; jamais le commerce écarté, ni un commerce non vérifié ou d\'une autre ville',f.order.join()==='m3:F,m2:D,m1:D',f.order);
    check('Carte « Découverte » distincte : pastille, « tu ne le suis pas encore », bordure en pointillés',f.disc.length===2&&f.disc.every(d=>d.tag==='Découverte'&&/tu ne le suis pas encore/.test(d.txt)&&d.border==='dashed'),f.disc);
    check('Avant de répondre : « Tu veux suivre … et répondre à ses questions ? » avec « Oui, suivre et répondre » / « Pas intéressé », sans bouton pour répondre directement',f.disc.every(d=>/Tu veux suivre .+ et répondre à ses questions/.test(d.txt)&&d.btns.join('|')==='Oui, suivre et répondre|Pas intéressé'&&!/Répondre en 30 secondes/.test(d.txt)),f.disc.map(d=>d.btns));
    check('La question du commerce suivi s\'ouvre directement (carte-bouton)',f.fol.length===1&&f.fol[0]==='BUTTON',f.fol);
    await p.evaluate(()=>document.querySelector('#hm-feed-q .hq-card.disc').scrollIntoView());await sleep(300);await p.screenshot({path:(process.env.SHOTS_DIR||'/tmp/shots')+'/disc_home.png'});await axeCheck(p,'accueil avec commerces à découvrir');
  });

  await T7('« Oui, suivre et répondre »',async()=>{
    await p.evaluate(()=>{const c=[...document.querySelectorAll('#hm-feed-q .hq-card.disc')].find(x=>/Studio Fit/.test(x.textContent));c.querySelector('.hq-cta').click();});
    await until(async()=>((await db.doc('users/me').get()).data().authorizedMerchants||[]).includes('m2'));
    await wf(p,()=>document.getElementById('question').classList.contains('active')&&S.curQ&&S.curQ._firestoreId==='cS',null,10000);
    const ev=(await db.collection('consentEvents').where('userId','==','me').get()).docs.map(d=>d.data().merchantId+':'+d.data().action);
    check('Le commerce est suivi (consentement journalisé) et sa question s\'ouvre aussitôt',ev.includes('m2:granted'),ev);
    await p.evaluate(()=>document.querySelector('#ans-area .mcq-opt').click());await sleep(3600);await p.evaluate(()=>submitAns());
    await until(async()=>(await db.doc('answers/me_cS_q0').get()).exists);
    const ans=(await db.doc('answers/me_cS_q0').get()).data();
    check('Réponse complète (commerce suivi) : tranche d\'âge et centres d\'intérêt, non marquée « découverte »',ans.discovery===false&&ans.respondentAge==='18-24',ans);
    await p.evaluate(()=>goNav('home'));await sleep(800);
    check('Studio Fit n\'est plus une découverte',await p.evaluate(()=>!S.qs.some(q=>q._merchantId==='m2'&&q._discovery)));
  });

  await T7('« Pas intéressé »',async()=>{
    await p.evaluate(()=>{const c=[...document.querySelectorAll('#hm-feed-q .hq-card.disc')].find(x=>/Le Fournil/.test(x.textContent));c.querySelector('.hq-no').click();});
    await until(async()=>((await db.doc('users/me').get()).data().declinedMerchants||[]).includes('m1'));
    await sleep(500);
    const u=(await db.doc('users/me').get()).data();
    check('Le Fournil est écarté (jamais suivi) et toutes ses questions disparaissent',u.declinedMerchants.includes('m1')&&!u.authorizedMerchants.includes('m1')&&await p.evaluate(()=>!S.qs.some(q=>q._merchantId==='m1')&&![...document.querySelectorAll('#hm-feed-q .hq-card')].some(c=>/Le Fournil/.test(c.textContent))),u);
    // Question d'un autre commerce non suivi, ouverte depuis ailleurs que l'accueil : le choix est demandé d'abord.
    await db.doc('campaigns/cN').set({merchantId:'m7',merchantName:'Zen Sport',sector:'Sport',status:'active',targetCity:'le-mans',city:'le-mans',question:'Q Zen ?',questions:[{q:'Q Zen ?',format:'mcq',options:['Oui','Non']}],answersCount:0,createdAt:Timestamp.now()});
    await wf(p,()=>S.qs.some(q=>q._firestoreId==='cN'),null,10000);
    await p.evaluate(()=>openQ(S.qs.findIndex(q=>q._firestoreId==='cN')));await sleep(400);
    const pop=await p.evaluate(()=>({show:document.getElementById('nv-pop').style.display,t:document.getElementById('nv-pop-t').textContent,q:document.getElementById('question').classList.contains('active')}));
    check('Ouvrir la question d\'un commerce non suivi : « Tu veux suivre Zen Sport ? » d\'abord, la question ne s\'ouvre pas',pop.show==='flex'&&/Tu veux suivre Zen Sport/.test(pop.t)&&!pop.q,pop);
    await p.evaluate(()=>document.getElementById('nv-pop-later').click());
    await until(async()=>((await db.doc('users/me').get()).data().declinedMerchants||[]).includes('m7'));
    await sleep(400);
    check('« Pas intéressé » dans la fenêtre : Zen Sport écarté',await p.evaluate(()=>!S.qs.some(q=>q._merchantId==='m7')));
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
