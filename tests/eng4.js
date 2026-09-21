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
async function ans(uid,cid,answer,o={}){await db.doc(`answers/${uid}_${cid}_q${o.q||0}`).set({userId:uid,campaignId:cid,questionIdx:o.q||0,answer,flagged:!!o.flagged,suspect:!!o.suspect,pointsAwarded:0,createdAt:Timestamp.now()});}
const reveal=(uid,cid,o={})=>E.revealCore(uid,{campaignId:cid,questionIdx:0},o);
const predict=(uid,cid,g,o={})=>E.predictCore(uid,{campaignId:cid,questionIdx:0,guessIdx:g},o);
const compat=(uid,d={})=>E.compatCore(uid,d);
const byName=(r,u)=>r.friends.find(f=>f.uid===u);
const err=async fn=>{try{await fn();return null;}catch(e){return e.code||String(e);}};



const N=require(__dirname+'/../functions/notifications.js')._t;
const DAY=86400000, HOUR=3600000;
const T0=Date.parse('2026-09-21T10:00:00Z');                    // 12h00 à Paris
const DASH='http://localhost:8950/dash.html',ADMIN='http://localhost:8950/admin.html';
const setClock=ms=>db.doc('_testClock/now').set({ms});
const sink=async u=>(await db.collection('_pushSink').where('uid','==',u).get()).docs.map(d=>d.data()).sort((a,b)=>a.at-b.at);
const until=async(fn,t=15000)=>{const s=Date.now();while(Date.now()-s<t){if(await fn())return true;await sleep(300);}return false;};
const mkU=(uid,o={})=>db.doc('users/'+uid).set({role:'user',welcomeClaimed:true,name:'User '+uid,city:'le-mans',cityLabel:'Le Mans',pushEnabled:true,fcmTokens:['tok_'+uid],authorizedMerchants:['m1'],declinedMerchants:[],interests:['boulangerie'],answeredCampaigns:[],friendUids:[],points:0,xp:0,streak:0,onboardingStep:'done',seenHomeTour:true,...o});
const mkM=(id,o={})=>db.doc('merchants/'+id).set({role:'merchant',ownerUid:id,brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:id+'@shop.fr',...o});
const ansM=(uid,cid,o={})=>db.doc(`answers/${uid}_${cid}_q0`).set({userId:uid,campaignId:cid,merchantId:'m1',questionIdx:0,answer:'Café',flagged:!!o.flagged,pointsAwarded:0,createdAt:Timestamp.now()});
const post=(id,o={})=>db.doc('merchantPosts/'+id).set({merchantId:'m1',merchantName:'Le Fournil',text:'Suite à vos avis, nous ouvrons dès 6h30 le samedi.',campaignIds:[],status:'pending',city:'le-mans',createdAt:Timestamp.now(),...o});
const publish=async(id)=>db.doc('merchantPosts/'+id).update({status:'published',publishedAt:Timestamp.now(),reviewedAt:Timestamp.now()});
const settle=async()=>{await sleep(4500);for(const c of ['_pushSink','notifLog','notifQueue','mail'])for(const d of (await db.collection(c).get()).docs)await d.ref.delete();for(const d of (await db.collection('users').get()).docs)await d.ref.update({notifDaily:admin.firestore.FieldValue.delete(),notifStats:admin.firestore.FieldValue.delete()});for(const d of (await db.collection('notifMetrics').get()).docs)await d.ref.delete();};
(async()=>{
  await T('impact serveur',async()=>{
    await wipe();
    await mkM('m1');
    await mkCampaign('c1');await mkCampaign('c2');
    for(const u of ['u1','u2','u3','u4','u5','u6'])await mkU(u);
    await db.doc('users/u2').update({notifPrefs:{actualites:false}});
    await db.doc('users/u6').update({fcmTokens:[]});
    await ansM('u1','c1');await ansM('u2','c1');await ansM('u3','c2');await ansM('u4','c1',{flagged:true});await ansM('u6','c1');
    await setClock(T0);await settle();
    // — publication d'une actualité rattachée à c1 —
    await post('pA',{campaignIds:['c1']});
    check('Rien n\'est envoyé tant que l\'actualité est en attente',(await db.collection('_pushSink').get()).empty);
    await publish('pA');
    await until(async()=>(await sink('u1')).length>=1);
    await sleep(1500);
    const s1=await sink('u1');
    check('Notification « Ton avis a compté chez Le Fournil » reçue par l\'habitant qui a répondu',s1.length===1&&s1[0].title==='Ton avis a compté chez Le Fournil'&&s1[0].body==='Suite à vos avis, nous ouvrons dès 6h30 le samedi.'&&/go=social/.test(s1[0].url)&&s1[0].ntype==='impact',s1);
    check('Titre < 60 caractères, sans emoji',s1[0].title.length<60&&!/\p{Extended_Pictographic}/u.test(s1[0].title));
    check('Réglage « Actualités des commerces » désactivé : pas de notification',(await sink('u2')).length===0);
    check('Autre question du commerce (non rattachée) : pas de notification',(await sink('u3')).length===0);
    check('Réponse signalée : exclue',(await sink('u4')).length===0);
    check('Sans réponse : pas de notification',(await sink('u5')).length===0);
    check('Sans jeton push : pas de notification',(await sink('u6')).length===0);
    const ev=(await db.doc('communityEvents/post_pA').get()).data();
    check('Communauté : événement « merchant_post » créé (ville, commerce, texte)',ev&&ev.type==='merchant_post'&&ev.city==='le-mans'&&ev.brand==='Le Fournil'&&ev.displayName==='Le Fournil'&&/6h30/.test(ev.text)&&ev.userId===null,ev);
    const pa=(await db.doc('merchantPosts/pA').get()).data();
    check('Actualité : audience (3), envois (1), note « sent »',pa.audience===3&&pa.notifySent===1&&pa.notifyNote==='sent'&&pa.notified===true,pa);
    const mn=await db.collection('merchants/m1/notifications').doc('post_ok_pA').get();
    check('Commerçant : notification in-app « Votre actualité est publiée » (3 habitants)',mn.exists&&/3 habitants/.test(mn.data().message)&&mn.data().title==='Votre actualité est publiée',mn.data());
    check('Commerçant : e-mail préparé (extension Trigger Email)',(await db.doc('mail/m1_post_ok_pA').get()).exists);
    check('Le commerçant ne reçoit jamais de push',(await sink('m1')).length===0);
    // idempotence
    const again=await require(__dirname+'/../functions/impact.js')._t.publishCore('pA',{...pa,merchantId:'m1'});
    await sleep(500);
    check('Republier la même actualité ne renvoie rien (id de journal déterministe)',(await sink('u1')).length===1&&again.sent===0,again);
    // — plafond : 1 actualité notifiée par commerce tous les 14 jours —
    await setClock(T0+3*DAY);
    await post('pB',{text:'Nouveau : le pain aux céréales est disponible en petit format.'});await publish('pB');
    await until(async()=>(await db.doc('merchantPosts/pB').get()).data().notifyNote);
    const pb=(await db.doc('merchantPosts/pB').get()).data();
    check('Plafond commerce : 3 jours plus tard, publiée dans la communauté mais AUCUNE notification',pb.notifyNote==='gap'&&pb.notified===false&&(await db.doc('communityEvents/post_pB').get()).exists&&(await sink('u1')).length===1&&(await sink('u3')).length===0,pb);
    check('Plafond : le commerçant en est informé',/tous les 14 jours/.test((await db.doc('merchants/m1/notifications/post_ok_pB').get()).data().message));
    await setClock(T0+15*DAY);
    await post('pC',{text:'Merci pour vos retours : la carte des boissons chaudes s\'agrandit.'});await publish('pC');
    await until(async()=>(await sink('u3')).length>=1);await sleep(1000);
    check('Après 14 jours : notifiée (sans rattachement = tous ceux qui ont répondu à une question du commerce)',(await sink('u1')).length===2&&(await sink('u3')).length===1&&(await sink('u2')).length===0&&(await sink('u4')).length===0,{u1:(await sink('u1')).length,u3:(await sink('u3')).length});
    // — refus —
    await setClock(T0+16*DAY);
    await post('pD',{text:'Achetez 2 baguettes, la 3e offerte ce week-end seulement !'});
    const before=(await db.collection('_pushSink').get()).size;
    await db.doc('merchantPosts/pD').update({status:'rejected',rejectionReason:'Trop promotionnel',reviewedAt:Timestamp.now()});
    await until(async()=>(await db.doc('merchants/m1/notifications/post_ko_pD').get()).exists);
    const ko=(await db.doc('merchants/m1/notifications/post_ko_pD').get()).data();
    check('Refus : le commerçant reçoit le motif, aucun habitant n\'est prévenu, rien dans la communauté',/Trop promotionnel/.test(ko.message)&&(await db.collection('_pushSink').get()).size===before&&!(await db.doc('communityEvents/post_pD').get()).exists,ko);
    // — texte avec emoji et formule interdite —
    await setClock(T0+30*DAY);
    await post('pE',{text:'🎉 Dernière chance : nouvelle carte de saison !'});await publish('pE');
    await until(async()=>(await sink('u1')).length>=3);
    const s3=(await sink('u1'))[2];
    check('Texte interdit/emoji : la notification reste correcte (titre sans emoji, corps de repli)',s3&&s3.title==='Ton avis a compté chez Le Fournil'&&s3.body==='Découvre ce qui change grâce aux réponses.',s3);
    check('Le fil de la communauté garde le texte validé par l\'admin',(await db.doc('communityEvents/post_pE').get()).data().text.includes('nouvelle carte'));
    // — silence 21h–9h : mis en file d'attente —
    await setClock(Date.parse('2026-11-10T21:30:00Z'));                       // 22h30 à Paris
    await post('pF',{text:'Nouveau : des viennoiseries sans gluten le dimanche.'});await publish('pF');
    await until(async()=>(await db.collection('notifQueue').get()).size>=1);
    const q=await db.collection('notifQueue').get();
    check('Heures de silence : reportée au lendemain 9h (notifQueue), pas envoyée',q.docs.some(d=>d.id==='u1_impact_post_pF')&&(await sink('u1')).length===3,q.docs.map(d=>d.id));
    check('Type « impact » rattaché au groupe « actualites » (7e réglage)',N.TYPES.impact.group==='actualites'&&N.GROUPS.actualites.includes('impact')&&Object.keys(N.GROUPS).length===7);
    // — plafond 1/jour entre types —
    await db.doc('merchants/m1').update({lastImpactNotifyAt:admin.firestore.FieldValue.delete()});   // isole le plafond quotidien du plafond commerce
    await db.doc('users/u1').update({notifDaily:{date:'2026-11-30',count:1}});
    await setClock(Date.parse('2026-11-30T10:00:00Z'));
    await post('pG',{text:'Merci : nous acceptons maintenant les paiements sans contact.'});await publish('pG');
    await until(async()=>(await db.doc('merchantPosts/pG').get()).data().notifyNote);await sleep(1000);
    check('Plafond quotidien : 1 notification/jour (déjà servie) → pas de 2e envoi',(await sink('u1')).length===3,(await sink('u1')).length);
  });

  // ═════════ RÈGLES ═════════
  await T('impact règles',async()=>{
    await wipe();
    await mkM('m1');await mkM('m2',{brandName:'Le Bar',email:'m2@shop.fr'});await mkM('m3',{brandName:'Nouveau',status:'pending',email:'m3@shop.fr'});
    await mkCampaign('c1');await mkU('u1',{email:'u1@t.fr'});
    for(const [u,e] of [['m1','m1@shop.fr'],['m2','m2@shop.fr'],['m3','m3@shop.fr'],['u1','u1@t.fr']])await aauth.createUser({uid:u,email:e,password:'secret123'});
    await aauth.createUser({uid:'adm',email:'tomussproduction@gmail.com',password:'secret123'});
    await post('pPub',{status:'published'});await post('pPend');await post('pM2',{merchantId:'m2',merchantName:'Le Bar'});
    const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
    const ctx=await browser.createBrowserContext();
    const page=async(url)=>{const p=await ctx.newPage();await p.goto(url,{waitUntil:'load'});await sleep(1500);return p;};
    const ops=async(p,email)=>p.evaluate(async(email)=>{
      await auth.signInWithEmailAndPassword(email,'secret123');const uid=auth.currentUser.uid;
      const t=async fn=>{try{await fn();return 'allowed';}catch(e){return e.code;}};
      const base={merchantId:uid,merchantName:'X',text:'Suite à vos avis, nous ouvrons plus tôt.',campaignIds:[],status:'pending',city:'le-mans',createdAt:firebase.firestore.FieldValue.serverTimestamp()};
      const col=db.collection('merchantPosts');const r={};
      r.create=await t(()=>col.doc('t_'+uid).set(base));
      r.createPublished=await t(()=>col.doc('tp_'+uid).set({...base,status:'published'}));
      r.tooLong=await t(()=>col.doc('tl_'+uid).set({...base,text:'x'.repeat(201)}));
      r.tooShort=await t(()=>col.doc('ts_'+uid).set({...base,text:'court'}));
      r.extraKey=await t(()=>col.doc('te_'+uid).set({...base,notified:true}));
      r.fourLinked=await t(()=>col.doc('tf_'+uid).set({...base,campaignIds:['a','b','c','d']}));
      r.impersonate=await t(()=>col.doc('ti_'+uid).set({...base,merchantId:'m2'}));
      r.editOwn=await t(()=>col.doc('t_'+uid).update({text:'Suite à vos avis, nous ouvrons encore plus tôt.'}));
      r.selfPublish=await t(()=>col.doc('t_'+uid).update({status:'published'}));
      r.readPub=await t(()=>col.doc('pPub').get());
      r.readPend=await t(()=>col.doc('pPend').get());
      r.readOther=await t(()=>col.doc('pM2').get());
      r.listPub=await t(()=>col.where('status','==','published').get());
      r.editPub=await t(()=>col.doc('pPub').update({text:'Nouveau texte de plus de dix caractères.'}));
      r.delPub=await t(()=>col.doc('pPub').delete());
      r.delOwn=await t(()=>col.doc('t_'+uid).delete());
      r.adminPublish=await t(()=>col.doc('pPend').update({status:'published',publishedAt:firebase.firestore.FieldValue.serverTimestamp()}));
      r.adminText=await t(()=>col.doc('pM2').update({text:'Texte modifié par un admin, non autorisé.'}));
      return r;},email);
    let p=await page(DASH);const m1=await ops(p,'m1@shop.fr');
    check('Règles commerçant vérifié : crée en « pending », modifie son texte tant qu\'il n\'est pas publié',m1.create==='allowed'&&m1.editOwn==='allowed',m1);
    check('Règles : impossible de créer une actualité déjà publiée, trop longue/courte, avec un champ serveur ou > 3 questions, ni au nom d\'un autre',m1.createPublished==='permission-denied'&&m1.tooLong==='permission-denied'&&m1.tooShort==='permission-denied'&&m1.extraKey==='permission-denied'&&m1.fourLinked==='permission-denied'&&m1.impersonate==='permission-denied',m1);
    check('Règles : un commerçant ne peut pas se publier lui-même',m1.selfPublish==='permission-denied',m1);
    check('Règles : actualité publiée non modifiable ni supprimable par le commerçant',m1.editPub==='permission-denied'&&m1.delPub==='permission-denied',m1);
    check('Règles : le commerçant lit les siennes ; pas celles d\'un autre commerce (en attente)',m1.readPend==='allowed'&&m1.readOther==='permission-denied',m1);
    check('Règles : il peut supprimer une actualité non publiée',m1.delOwn==='allowed',m1);
    await p.close();
    p=await page(DASH);const m3=await ops(p,'m3@shop.fr');
    check('Règles : un commerce non vérifié ne peut pas proposer d\'actualité',m3.create==='permission-denied',m3);
    await p.close();
    p=await page(APP);const u1=await ops(p,'u1@t.fr');
    check('Règles habitant : lit les actualités publiées, jamais celles en attente',u1.readPub==='allowed'&&u1.listPub==='allowed'&&u1.readPend==='permission-denied'&&u1.readOther==='permission-denied',u1);
    check('Règles habitant : ne peut rien créer, modifier ni supprimer',u1.create==='permission-denied'&&u1.editPub==='permission-denied'&&u1.delPub==='permission-denied',u1);
    await p.close();
    p=await page(ADMIN);const ad=await ops(p,'tomussproduction@gmail.com');
    check('Règles admin : peut publier (status/publishedAt) ; ne peut pas réécrire le texte',ad.adminPublish==='allowed'&&ad.adminText==='permission-denied',ad);
    await browser.close();
  });

  // ═════════ INTERFACES ═════════
  await T('impact ui',async()=>{
    await wipe();
    await mkM('m1');await mkCampaign('c1',{name:'Boisson préférée'});await mkCampaign('c2',{question:'Quel pain préférez-vous ?',questions:[{q:'Quel pain préférez-vous ?',format:'mcq',options:['a','b']}]});
    await mkU('u1',{email:'u1@t.fr'});await ansM('u1','c1');
    await setClock(T0);await settle();
    await aauth.createUser({uid:'m1',email:'m1@shop.fr',password:'secret123'});await aauth.createUser({uid:'u1',email:'u1@t.fr',password:'secret123'});await aauth.createUser({uid:'adm',email:'tomussproduction@gmail.com',password:'secret123'});
    const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
    const errs=[];
    // Commerçant
    const mctx=await browser.createBrowserContext();const mp=await mctx.newPage();PG=mp;await mp.setViewport({width:1280,height:900});
    mp.on('pageerror',e=>errs.push(e.message));
    await mp.evaluateOnNewDocument(()=>{try{localStorage.setItem('nv_pro_intro','1');}catch(e){}});
    await mp.goto(DASH,{waitUntil:'load'});await wf(mp,()=>document.getElementById('auth-wall').style.display==='flex',null,30000);
    await mp.evaluate(()=>awTab('login'));await setVal(mp,'#aw-email','m1@shop.fr');await setVal(mp,'#aw-pass','secret123');await mp.evaluate(()=>awSubmit());
    await wf(mp,()=>typeof _mData!=='undefined'&&_mData&&_mData.brandName==='Le Fournil'&&_mCampaigns&&_mCampaigns.length>=2,null,25000);
    await mp.evaluate(()=>{try{endDashTour();}catch(e){}});await sleep(800);
    await mp.evaluate(()=>navTo('news',document.getElementById('nav-news')));await sleep(800);
    const f0=await mp.evaluate(()=>({title:document.getElementById('topbar-title').textContent,camps:document.querySelectorAll('#news-camps input').length,locked:document.getElementById('news-locked').style.display,list:document.getElementById('news-list').textContent}));
    check('Dashboard : page « Actualités » (formulaire, 2 questions à rattacher, pas de verrou)',f0.title==='Actualités'&&f0.camps===2&&f0.locked==='none'&&/Aucune actualité/.test(f0.list),f0);
    await setVal(mp,'#news-text','court');await mp.evaluate(()=>submitNews());await sleep(600);
    check('Dashboard : texte trop court refusé (rien créé)',(await db.collection('merchantPosts').get()).empty);
    await mp.evaluate(()=>{const t=document.getElementById('news-text');t.value='Suite à vos avis, nous ouvrons dès 6h30 le samedi.';newsCount();});
    check('Dashboard : compteur de caractères',/^\d+ \/ 200$/.test(await mp.$eval('#news-count',e=>e.textContent)));
    await mp.select('#news-kind','impact');await mp.evaluate(()=>{document.querySelector('#news-camps input').click();});   // « Suite à vos avis » : les questions rattachées reçoivent la notification
    await mp.evaluate(()=>submitNews());
    await until(async()=>!(await db.collection('merchantPosts').get()).empty);
    const d1=(await db.collection('merchantPosts').get()).docs[0];const pid=d1.id;
    check('Dashboard : actualité créée « pending », rattachée à la question choisie, ville du commerce',d1.data().status==='pending'&&d1.data().campaignIds.length===1&&d1.data().city==='le-mans'&&d1.data().merchantId==='m1',d1.data());
    await sleep(800);
    const l1=await mp.$eval('#news-list',e=>e.textContent);
    check('Dashboard : la liste montre « En validation »',/En validation/.test(l1)&&/6h30/.test(l1),l1);
    await mp.screenshot({path:'/tmp/shots/news_dash.png'});
    // Admin
    const actx=await browser.createBrowserContext();const ap=await actx.newPage();await ap.setViewport({width:1200,height:900});
    ap.on('pageerror',e=>errs.push(e.message));
    await ap.goto(ADMIN,{waitUntil:'load'});await sleep(1500);
    await ap.evaluate(async()=>{await auth.signInWithEmailAndPassword('tomussproduction@gmail.com','secret123');});
    await ap.evaluate(()=>{document.getElementById('tab-moderation').style.display='block';loadPostModeration();});
    await wf(ap,()=>document.querySelector('#post-mod-list .post-ok'),null,15000);
    const card=await ap.evaluate(()=>({count:document.getElementById('post-mod-count').textContent,txt:document.getElementById('post-mod-list').textContent}));
    await ap.screenshot({path:'/tmp/shots/news_admin.png'});
    check('Admin : l\'actualité apparaît dans « Actualités à valider » avec le commerce',card.count==='1'&&/Le Fournil/.test(card.txt)&&/6h30/.test(card.txt)&&/liée à 1 question/.test(card.txt),card);
    await ap.evaluate(()=>document.querySelector('#post-mod-list .post-ok').click());
    await until(async()=>(await db.doc('merchantPosts/'+pid).get()).data().status==='published');
    check('Admin : « Publier » passe l\'actualité en « published »',(await db.doc('merchantPosts/'+pid).get()).data().status==='published');
    await until(async()=>(await sink('u1')).length>=1);
    check('Publication : l\'habitant qui a répondu à la question rattachée est prévenu',(await sink('u1')).length===1);
    await sleep(800);
    check('Dashboard : « 1 habitant prévenu » et statut « Publiée »',/Publiée/.test(await mp.$eval('#news-list',e=>e.textContent))&&/1 habitant prévenu/.test(await mp.$eval('#news-list',e=>e.textContent)),await mp.$eval('#news-list',e=>e.textContent));
    // refus puis correction
    await mp.evaluate(()=>{document.getElementById('news-text').value='Achetez 2 baguettes, la 3e offerte ce week-end !';newsCount();});
    await mp.evaluate(()=>submitNews());
    await until(async()=>(await db.collection('merchantPosts').get()).size===2);
    const pid2=(await db.collection('merchantPosts').get()).docs.find(d=>d.id!==pid).id;
    await sleep(800);
    await ap.evaluate(()=>{loadPostModeration();});await wf(ap,()=>document.querySelector('#post-mod-list .post-ko'),null,15000);
    await ap.evaluate(async()=>{const pr=rejectPost(document.querySelector('#post-mod-list .post-ko').getAttribute('onclick').match(/'([^']+)'/)[1],null);await new Promise(r=>setTimeout(r,200));closeTextPromptModal('Trop promotionnel');await pr;});
    await until(async()=>(await db.doc('merchantPosts/'+pid2).get()).data().status==='rejected');
    await sleep(1200);
    const rj=await mp.$eval('#news-list',e=>e.textContent);
    check('Admin : « Refuser » avec motif → visible côté commerçant',/Refusée/.test(rj)&&/Trop promotionnel/.test(rj)&&/Corriger et renvoyer/.test(rj),rj);
    await mp.evaluate(id=>editNews(id),pid2);
    check('Dashboard : « Corriger et renvoyer » recharge le texte',await mp.$eval('#news-text',e=>e.value)==='Achetez 2 baguettes, la 3e offerte ce week-end !');
    await mp.evaluate(()=>{document.getElementById('news-text').value='Nouveau : une formule petit-déjeuner à 4 € dès 7h.';newsCount();});
    await mp.evaluate(()=>submitNews());
    await until(async()=>(await db.doc('merchantPosts/'+pid2).get()).data().status==='pending');
    const p2=(await db.doc('merchantPosts/'+pid2).get()).data();
    check('Dashboard : renvoi → repasse « pending », motif effacé, même document',p2.status==='pending'&&/petit-déjeuner/.test(p2.text)&&p2.rejectionReason===undefined,p2);
    // Habitant : fil + réglage
    const uctx=await browser.createBrowserContext();const up=await uctx.newPage();PG=up;await up.setViewport({width:430,height:900});
    up.on('pageerror',e=>errs.push(e.message));
    await up.goto(APP,{waitUntil:'load'});
    await wf(up,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await up.evaluate(()=>showAuthWall('login'));await setVal(up,'#aw-email','u1@t.fr');await setVal(up,'#aw-pass','secret123');await up.evaluate(()=>awSubmit());
    await wf(up,()=>document.getElementById('home').classList.contains('active')&&S.user,null,30000);
    await up.addStyleTag({content:'body>div[style*="emulator"]{display:none!important}'});
    await up.evaluate(()=>{goNav('social');});
    await wf(up,()=>document.querySelector('#feed-content .feed-post'),null,20000);
    const feed=await up.evaluate(()=>({posts:[...document.querySelectorAll('#feed-content .feed-post')].map(p=>p.textContent.replace(/\s+/g,' ').trim()),tag:!!document.querySelector('#feed-content .fp-tag')}));
    await up.screenshot({path:'/tmp/shots/news_feed.png'});
    check('Habitant : l\'actualité publiée apparaît dans le fil avec son étiquette (« Ton avis a compté » pour une actualité suite aux avis)',feed.tag&&feed.posts.some(t=>/Le Fournil/.test(t)&&/Ton avis a compté/.test(t)&&/6h30/.test(t)&&!/a répondu/.test(t)),feed.posts);
    check('Habitant : l\'actualité refusée / en attente n\'apparaît pas',!feed.posts.some(t=>/petit-déjeuner|baguettes/.test(t)),feed.posts);
    await up.evaluate(()=>{goNav('profile');refreshProfile();document.getElementById('notif-section').classList.add('open');});await sleep(500);
    const sw=await up.evaluate(()=>[...document.querySelectorAll('#notif-switches .nf-t')].map(e=>e.textContent));
    check('Réglages : 7 interrupteurs, le 7e « Actualités des commerces »',sw.length===7&&sw[6]==='Actualités des commerces',sw);
    await browser.close();
    console.log('JS errors:',[...new Set(errs)].join(' | ')||'aucune');
  });
  console.log(`\n===== ${pass}/${pass+fail} OK =====`);process.exit(fail?1:0);
})();
