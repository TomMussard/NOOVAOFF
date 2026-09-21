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

const ADMIN='http://localhost:8950/admin.html';
const until=async(fn,t=15000)=>{const s=Date.now();while(Date.now()-s<t){if(await fn())return true;await sleep(300);}return false;};
const T5=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e).slice(0,400));}};
const lastRows=(p,id)=>p.evaluate(id=>[...document.querySelectorAll('#'+id+' .merchant-row')].map(r=>r.querySelector('.m-name').textContent+'|'+((r.querySelector('.badge')||{}).textContent||'')),id);
(async()=>{
  await wipe();
  const mk=(id,name,status,o={})=>db.doc('merchants/'+id).set({role:'merchant',ownerUid:id,brandName:name,name,sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',email:id+'@shop.fr',status,createdAt:Timestamp.now(),...o});
  await mk('p1','Boulangerie Pending 1','pending');await mk('p2','Café Pending 2','pending');await mk('v1','Studio Vérifié','verified');await mk('v2','Fleuriste Vérifié','verified');
  await aauth.createUser({uid:'adm',email:'tomussproduction@gmail.com',password:'secret123'});
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const p=await browser.newPage();PG=p;await p.setViewport({width:1200,height:1000});const errs=[];p.on('pageerror',e=>errs.push(e.message));
  p.on('dialog',async d=>{if(d.type()==='prompt')await d.accept('SIRET introuvable');else await d.accept();});
  await p.goto(ADMIN,{waitUntil:'load'});await sleep(1500);
  await p.evaluate(async()=>{await auth.signInWithEmailAndPassword('tomussproduction@gmail.com','secret123');});
  await wf(p,()=>typeof allMerchants!=='undefined'&&allMerchants.length===4,null,20000);
  const cnt=()=>p.evaluate(()=>['total','pending','verified','rejected'].map(k=>document.getElementById('cnt-'+k).textContent).join('/'));

  await T5('rejet',async()=>{
    check('Départ : 4 entreprises (2 en attente, 2 vérifiées, 0 rejetée)',await cnt()==='4/2/2/0',await cnt());
    await p.evaluate(()=>filterMerchants('rejected'));
    check('Filtre « Rejetés » vide au départ',/Aucun commerçant/.test(await p.evaluate(()=>document.getElementById('list-all').textContent)));
    // rejet d'une entreprise en attente (bouton de la liste)
    await p.evaluate(()=>document.querySelector('#list-pending .btn-reject').click());
    await wf(p,()=>document.getElementById('cnt-rejected').textContent==='1',null,10000);
    const fs1=(await db.doc('merchants/p1').get()).data();
    check('Rejet : statut « rejected » et motif enregistrés en base',fs1.status==='rejected'&&fs1.rejectionReason==='SIRET introuvable',fs1);
    check('Rejet : compteurs à jour (4 / 1 en attente / 2 vérifiées / 1 rejetée) et la liste « En attente » ne contient plus l\'entreprise',await cnt()==='4/1/2/1'&&!(await lastRows(p,'list-pending')).some(x=>/Pending 1/.test(x)),await cnt());
    let rows=await lastRows(p,'list-all');
    check('Rejet : l\'entreprise apparaît dans le filtre « Rejetés » avec le badge « Rejeté »',rows.length===1&&/Pending 1\|Rejeté/.test(rows[0]),rows);
    await p.evaluate(()=>filterMerchants('all'));rows=await lastRows(p,'list-all');
    check('Filtre « Tous » : elle y figure aussi (avec le badge Rejeté), les 2 vérifiées avec « Vérifié »',rows.length===3&&rows.includes('Boulangerie Pending 1|Rejeté')&&rows.filter(x=>/\|Vérifié/.test(x)).length===2,rows);
    await p.evaluate(()=>filterMerchants('verified'));rows=await lastRows(p,'list-all');
    check('Filtre « Vérifiés » : ne contient pas l\'entreprise rejetée',rows.length===2&&!rows.some(x=>/Pending 1/.test(x)),rows);
    // révocation d'une entreprise vérifiée depuis la fenêtre de détails, pendant que le filtre « Vérifiés » est actif
    await p.evaluate(()=>openModal('v1'));await sleep(400);
    await p.evaluate(()=>document.querySelector('#modal-foot .btn-reject, #md-foot .btn-reject, .modal-foot .btn-reject').click()).catch(async()=>{await p.evaluate(()=>rejectMerchant('v1','Studio Vérifié'));});
    await wf(p,()=>document.getElementById('cnt-rejected').textContent==='2',null,10000);
    rows=await lastRows(p,'list-all');
    check('Révoquer une entreprise vérifiée : elle quitte « Vérifiés »…',rows.length===1&&/Fleuriste/.test(rows[0]),rows);
    await p.evaluate(()=>filterMerchants('rejected'));rows=await lastRows(p,'list-all');
    check('… et apparaît dans « Rejetés » (2 rejetées)',rows.length===2&&rows.every(x=>/\|Rejeté$/.test(x)),rows);
    // le rejet est durable : après rechargement complet de la liste
    await p.evaluate(()=>loadMerchants());await sleep(1200);
    rows=await lastRows(p,'list-all');
    check('Après rechargement depuis la base : les 2 entreprises rejetées y sont toujours',rows.length===2&&await cnt()==='4/1/1/2',{rows,cnt:await cnt()});
  });

  await T5('bouton actualiser',async()=>{
    const has=await p.evaluate(()=>{const b=document.getElementById('ent-refresh');return !!b&&/Actualiser/.test(b.textContent)&&b.offsetParent!==null;});
    check('Onglet Entreprises : bouton « ↻ Actualiser » visible',has);
    await mk('p3','Nouveau Commerce','pending');
    check('Une inscription faite entre-temps n\'apparaît pas tant qu\'on n\'actualise pas',!(await lastRows(p,'list-pending')).some(x=>/Nouveau Commerce/.test(x)));
    await p.evaluate(()=>{window.__toasts=[];const o=showToast;window.showToast=(m,t)=>{window.__toasts.push(m);return o(m,t);};});
    await p.evaluate(()=>document.getElementById('ent-refresh').click());
    await wf(p,()=>[...document.querySelectorAll('#list-pending .m-name')].some(e=>/Nouveau Commerce/.test(e.textContent)),null,10000);
    const st=await p.evaluate(()=>({txt:document.getElementById('ent-refresh').textContent,dis:document.getElementById('ent-refresh').disabled,upd:document.getElementById('ent-updated').textContent,toasts:window.__toasts,total:document.getElementById('cnt-total').textContent}));
    check('Actualiser : la nouvelle entreprise apparaît, le bouton redevient actif, l\'heure de mise à jour et un message s\'affichent',st.txt==='↻ Actualiser'&&!st.dis&&/Mis à jour à \d\d:\d\d/.test(st.upd)&&st.toasts.some(x=>/5 entreprises — liste à jour/.test(x))&&st.total==='5',st);
    await mk('p4','Autre Commerce','pending');
    await p.evaluate(()=>switchTab('utilisateurs',document.querySelectorAll('.tab-btn-main')[1]));await sleep(400);
    await p.evaluate(()=>switchTab('entreprises',document.querySelectorAll('.tab-btn-main')[0]));
    await wf(p,()=>[...document.querySelectorAll('#list-pending .m-name')].some(e=>/Autre Commerce/.test(e.textContent)),null,10000);
    check('Revenir sur l\'onglet Entreprises recharge aussi la liste',true);
  });

  await T5('réglages de modération',async()=>{
    await p.evaluate(()=>switchTab('moderation',document.querySelectorAll('.tab-btn-main')[4]));
    await wf(p,()=>document.querySelectorAll('#eng-cfg-rows input').length>0,null,15000);
    const cfg=await p.evaluate(()=>({n:document.querySelectorAll('#eng-cfg-rows input').length,keys:[...document.querySelectorAll('#eng-cfg-rows input')].map(i=>i.dataset.k),txt:document.getElementById('eng-cfg-rows').textContent}));
    check('Modération : plus de réglages « Prédiction », « Communauté » ni « Quota » (7 réglages restent)',cfg.n===7&&!cfg.keys.some(k=>/^PREDICTION|^COMMUNITY|^QUOTA/.test(k))&&!/Prédiction|Communauté|Quota/.test(cfg.txt),cfg);
    await p.screenshot({path:'/tmp/shots/admin_mod.png'});
    const r=await p.evaluate(async()=>{try{await fx.httpsCallable('setEngagementConfig')({values:{'PREDICTION.MIN_ANSWERS':12}});return 'accepté';}catch(e){return e.code||e.message;}});
    check('Côté serveur, ces anciens réglages sont refusés (« Réglage inconnu »)',/invalid-argument/.test(r),r);
    await p.evaluate(()=>{document.querySelector('#eng-cfg-rows input[data-k="REVEAL.MIN_ANSWERS"]').value='7';saveEngagementConfig();});
    await until(async()=>((await db.doc('appConfig/engagement').get()).data()||{}).REVEAL&&(await db.doc('appConfig/engagement').get()).data().REVEAL.MIN_ANSWERS===7);
    check('Les réglages restants s\'enregistrent toujours',(await db.doc('appConfig/engagement').get()).data().REVEAL.MIN_ANSWERS===7);
    await p.evaluate(()=>{window.confirm=()=>true;resetEngagementConfig();});
    await until(async()=>!((await db.doc('appConfig/engagement').get()).data()||{}).REVEAL);
    check('… et « valeurs par défaut » fonctionne',!((await db.doc('appConfig/engagement').get()).data()||{}).REVEAL);
    await p.evaluate(()=>openModal('v2'));await sleep(500);
    check('Fiche entreprise : le champ « Questions par mois » reste, sans renvoi vers les réglages supprimés',await p.evaluate(()=>/Vide = quota par défaut de la plateforme/.test(document.getElementById('md-quota').textContent)&&!/Réglages de l.engagement/.test(document.getElementById('md-quota').textContent)));
    check('Aucune erreur JavaScript',errs.length===0,errs);
  });
  await browser.close();
  console.log('\n'+pass+' ok, '+fail+' échec(s)');process.exit(fail?1:0);
})();
