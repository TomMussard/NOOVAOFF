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
async function ans(uid,cid,answer,o={}){await db.doc(`answers/${uid}_${cid}_q${o.q||0}`).set({userId:uid,campaignId:cid,questionIdx:o.q||0,answer,flagged:!!o.flagged,suspect:!!o.suspect,pointsAwarded:0,createdAt:Timestamp.now()});}
const reveal=(uid,cid,o={})=>E.revealCore(uid,{campaignId:cid,questionIdx:0},o);
const predict=(uid,cid,g,o={})=>E.predictCore(uid,{campaignId:cid,questionIdx:0,guessIdx:g},o);
const compat=(uid,d={})=>E.compatCore(uid,d);
const byName=(r,u)=>r.friends.find(f=>f.uid===u);
const err=async fn=>{try{await fn();return null;}catch(e){return e.code||String(e);}};


const DAY=86400000;
const P=CFG.PREDICTION;
const T0=Date.parse('2026-09-21T10:00:00Z');
// Réponses seedées à la main : 15 Café / 7 Thé / 3 Chocolat (25 au total), + celle de l'utilisateur testé.
async function seedCamp(id,dist=[15,7,3],extra={}){
  await mkCampaign(id,extra);
  let k=0;for(let o=0;o<dist.length;o++)for(let i=0;i<dist[o];i++){await ans('seed'+(k++),id,OPTS[o]);}
  await db.doc('campaignStats/'+id).delete().catch(()=>{});
}
const ps=async u=>((await db.doc('users/'+u).get()).data()||{}).predStats||{};
(async()=>{
  await T('prediction core',async()=>{
    await wipe();
    await db.doc('merchants/m1').set({brandName:'Le Fournil',sector:'Boulangerie',city:'le-mans',status:'verified'});
    for(const id of ['p1','p2','p3','p4','p5','p6','p7'])await seedCamp(id);
    await seedCamp('small',[6,3,1]);
    await seedCamp('tie',[2,10,5]);
    for(const u of ['u1','u2','u3','u4','u5','u6','u7','u8'])await mkUser(u);
    for(const u of ['u1','u2','u3','u4','u5','u6','u7','u8'])for(const id of ['p1','p2','p3','p4','p5','p6','p7','small','tie'])await ans(u,id,'Café');

    // — proposition —
    let r=await reveal('u1','small',{roll:0});
    check('Prédiction : jamais proposée sous le nombre minimum de réponses (10 < '+P.MIN_ANSWERS+')',!r.prediction&&r.options[0].pct!==undefined,r);
    r=await reveal('u1','p1',{roll:0.99,now:T0});
    check('Prédiction : tirage défavorable → répartition affichée normalement',!r.prediction&&r.options.map(o=>o.pct).join()==='70,21,9',r.options);
    r=await reveal('u1','p1',{roll:0.05,now:T0});
    check('Prédiction : proposée (tirage favorable, ≥ '+P.MIN_ANSWERS+' réponses)',r.available&&r.prediction&&r.prediction.offered===true,r);
    check('Prédiction : aucun chiffre ni ami dans l\'offre (pas de fuite avant de deviner)',r.n===undefined&&r.friends===undefined&&r.options.every(o=>o.pct===undefined&&o.count===undefined)&&!JSON.stringify(r).match(/pct|count/),r);
    const again=await reveal('u1','p1',{roll:0.99,now:T0+1000});
    check('Prédiction : recharger la page ne permet pas d\'esquiver (l\'offre reste en attente)',again.prediction&&again.prediction.offered===true);
    check('Prédiction : une seule offre comptée malgré les rechargements',(await ps('u1')).offers.length===1);
    // — résolution —
    check('Prédiction : réponse sans offre en attente refusée',await err(()=>predict('u2','p1',0,{now:T0}))==='failed-precondition');
    check('Prédiction : choix invalide refusé',await err(()=>predict('u1','p1',7,{now:T0}))==='invalid-argument'&&await err(()=>predict('u1','p1',-1,{now:T0}))==='invalid-argument');
    let x=await predict('u1','p1',0,{now:T0+5000});
    check('Prédiction : bonne réponse → série 1, record 1, répartition dévoilée',x.prediction.correct===true&&x.prediction.streak===1&&x.prediction.best===1&&x.prediction.majority.join()==='0'&&x.reveal.options[0].pct===70,x.prediction);
    let s1=await ps('u1');
    check('Prédiction : état enregistré côté serveur, plus d\'offre en attente',s1.streak===1&&s1.best===1&&s1.total===1&&s1.right===1&&s1.pendingKey===null,s1);
    check('Prédiction : une fois résolue, la question affiche la répartition (pas de nouvelle offre)',!(await reveal('u1','p1',{roll:0.01,now:T0+6000})).prediction);
    check('Prédiction : réponse en double refusée',await err(()=>predict('u1','p1',0,{now:T0+7000}))==='failed-precondition');
    // — plafonds —
    r=await reveal('u1','p2',{roll:0.01,now:T0+8000});
    check('Plafond : 1 prédiction par jour (2e question du même jour non proposée)',!r.prediction&&r.options[0].pct!==undefined,r);
    r=await reveal('u1','p2',{roll:0.01,now:T0+DAY});
    check('Plafond : le lendemain, une nouvelle prédiction peut être proposée',r.prediction&&r.prediction.offered===true);
    x=await predict('u1','p2',2,{now:T0+DAY+1000});
    s1=await ps('u1');
    check('Prédiction : mauvaise réponse → série à 0, record conservé',x.prediction.correct===false&&s1.streak===0&&s1.best===1&&s1.total===2&&s1.right===1,s1);
    // passer
    r=await reveal('u1','p3',{roll:0.01,now:T0+2*DAY});
    await predict('u1','p3',0,{now:T0+2*DAY+1000});                     // série 1
    r=await reveal('u1','p4',{roll:0.01,now:T0+3*DAY});
    x=await predict('u1','p4',null,{now:T0+3*DAY+1000});
    s1=await ps('u1');
    check('« Passer » : la série n\'est pas touchée, la répartition est dévoilée, l\'offre est consommée',x.prediction.skipped===true&&s1.streak===1&&s1.total===3&&x.reveal.options[0].pct===70&&s1.pendingKey===null,s1);
    // plafond hebdomadaire glissant : offres aux jours 0,1,2,3 déjà faites (4) → 5e refusée dans la fenêtre de 7 jours
    r=await reveal('u1','p5',{roll:0.01,now:T0+4*DAY});
    check('Plafond : au plus '+P.MAX_PER_ROLLING_WEEK+' par semaine glissante (5e refusée)',!r.prediction,r.prediction);
    r=await reveal('u1','p6',{roll:0.01,now:T0+7*DAY+5000});
    check('Plafond : la fenêtre glisse (la plus ancienne sort après 7 jours)',r.prediction&&r.prediction.offered===true,r.prediction);
    // — égalité —
    r=await reveal('u3','tie',{roll:0.01,now:T0});
    x=await predict('u3','tie',1,{now:T0+1000});
    check('Égalité : toute option en tête est une bonne réponse',x.prediction.correct===true&&x.prediction.majority.join()==='0,1',x.prediction);
    await reveal('u4','tie',{roll:0.01,now:T0});
    x=await predict('u4','tie',2,{now:T0+1000});
    check('Égalité : l\'option minoritaire reste fausse',x.prediction.correct===false);
    // — expiration —
    await reveal('u5','p1',{roll:0.01,now:T0});
    check('Expiration : offre laissée sans réponse au-delà de '+P.PENDING_MINUTES+' min → réponse refusée',await err(()=>predict('u5','p1',0,{now:T0+(P.PENDING_MINUTES+1)*60000}))==='failed-precondition');
    r=await reveal('u5','p1',{roll:0.01,now:T0+(P.PENDING_MINUTES+1)*60000});
    check('Expiration : la répartition s\'affiche alors normalement',!r.prediction&&r.options[0].pct===70);
    // — question sans réponse de l'utilisateur —
    await mkUser('nobody');
    check('Sécurité : pas de prédiction ni de répartition sans avoir répondu',await err(()=>reveal('nobody','p1',{roll:0.01,now:T0}))==='permission-denied');
    // — tirage —
    const rr=[];for(let i=0;i<3000;i++)rr.push(E.rollOf('uX','camp'+i+'#0'));
    const share=rr.filter(v=>v<P.PROBABILITY).length/rr.length;
    check('Tirage : stable pour un même couple utilisateur/question',E.rollOf('a','k#0')===E.rollOf('a','k#0')&&E.rollOf('a','k#0')!==E.rollOf('b','k#0'));
    check('Tirage : proportion ≈ PROBABILITY ('+P.PROBABILITY+') → '+share.toFixed(3),share>0.26&&share<0.34,share);
  });

  // ═════════ Interface ═════════
  await T('prediction ui',async()=>{
    await wipe();
    await db.doc('merchants/m1').set({brandName:'Le Fournil',sector:'Boulangerie',city:'le-mans',status:'verified'});
    // campagne dont le tirage est favorable pour u1, u2 et u3 ; une autre défavorable
    let A=null,B=null;
    for(let i=0;i<4000&&(!A||!B);i++){const id='pc'+i,ks=id+'#0';
      const ys=['u1','u2','u3','u4'].map(u=>E.rollOf(u,ks)<P.PROBABILITY),no=['u1'].map(u=>E.rollOf(u,ks)>=P.PROBABILITY);
      if(!A&&ys.every(Boolean))A=id;if(!B&&no.every(Boolean)&&i>50)B=id;}
    check('Test : campagnes de test trouvées',!!A&&!!B,{A,B});
    await seedCamp(A);await seedCamp(B);
    const mk=async(u)=>{await aauth.createUser({uid:u,email:u+'@t.fr',password:'secret123'});await mkUser(u,{name:'Prénom '+u,email:u+'@t.fr'});};
    for(const u of ['u1','u2','u3','u4'])await mk(u);
    await db.doc('users/u2').update({friendUids:['u1']});await db.doc('users/u1').update({friendUids:['u2']});
    const login=async(u)=>{
      const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
      const p=await browser.newPage();PG=p;await p.setViewport({width:430,height:900});
      const errs=[];p.on('pageerror',e=>errs.push(e.message));
      await p.goto(APP,{waitUntil:'load'});
      await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
      await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','#'.replace('#',u+'@t.fr'));await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
      await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user&&S.qs.length>=1,null,30000);
      await p.addStyleTag({content:'body>div[style*="emulator"]{display:none!important}'});
      return {browser,p,errs};
    };
    const answer=async(p,choice)=>{
      await p.evaluate(()=>{const t=document.getElementById('reveal-sheet');if(t)t.style.display='none';goNav('home');});
      const idx=await p.evaluate(id=>S.qs.findIndex(q=>q._firestoreId===id),A);
      await p.evaluate(i=>openQ(i),idx);
      await wf(p,()=>document.querySelectorAll('#ans-area .mcq-opt').length>0);
      await p.evaluate(c=>{[...document.querySelectorAll('#ans-area .mcq-opt')].find(o=>o.textContent.trim()===c).click();},choice);
      await sleep(3300);await p.evaluate(()=>submitAns());
      await wf(p,()=>document.getElementById('reward').classList.contains('active'),null,15000);
    };
    // u1 : se trompe
    let {browser,p,errs}=await login('u1');
    await answer(p,'Café');
    await wf(p,()=>document.querySelector('#rw-reveal .pd-opt'),null,15000);
    const off=await p.evaluate(()=>({h:document.querySelector('#rw-reveal .rv-h').textContent,opts:[...document.querySelectorAll('#rw-reveal .pd-opt')].map(b=>b.textContent),skip:!!document.querySelector('#rw-reveal .pd-skip'),pct:document.querySelectorAll('#rw-reveal .rv-p').length,sub:document.querySelector('#rw-reveal .pd-sub').textContent}));
    await p.evaluate(()=>{try{closeCelebration()}catch(e){}});await sleep(700);await p.screenshot({path:'/tmp/shots/pred_offer.png'});
    check('UI : la prédiction est proposée après la réponse (3 options + Passer), sans aucun pourcentage',/Devine/.test(off.h)&&off.opts.join()==='Café,Thé,Chocolat'&&off.skip&&off.pct===0&&/sans points/.test(off.sub),off);
    await p.evaluate(()=>[...document.querySelectorAll('#rw-reveal .pd-opt')].find(b=>b.textContent==='Thé').click());
    await wf(p,()=>document.querySelector('#rw-reveal .pd-res'),null,15000);
    const ko=await p.evaluate(()=>({res:document.querySelector('#rw-reveal .pd-res').className,txt:document.querySelector('#rw-reveal .pd-res').textContent,rows:[...document.querySelectorAll('#rw-reveal .rv-p')].map(e=>e.textContent),offer:!!document.querySelector('#rw-reveal .pd-opt')}));
    await p.evaluate(()=>{try{closeCelebration()}catch(e){}});await sleep(700);await p.screenshot({path:'/tmp/shots/pred_ko.png'});
    check('UI : mauvaise prédiction → message « Raté », répartition dévoilée (62 % / 27 % / 12 %)',/ko/.test(ko.res)&&/Raté/.test(ko.txt)&&ko.rows.join()==='62 %,27 %,12 %'&&!ko.offer,ko);
    let st=await ps('u1');
    check('UI : état serveur après une mauvaise prédiction (série 0, 1 tentative)',st.streak===0&&st.total===1&&st.right===0,st);
    await p.evaluate(()=>{goNav('profile');refreshProfile();});await sleep(500);
    const pc=await p.evaluate(()=>({show:document.getElementById('dpred').style.display,txt:document.getElementById('dpred-txt').textContent}));
    check('Profil : carte « Mode prédiction » (série 0 · record 0 · 0 bonne sur 1)',pc.show==='flex'&&/série de 0/.test(pc.txt)&&/record 0/.test(pc.txt)&&/0 bonne sur 1/.test(pc.txt),pc);
    const acc=await p.evaluate(async()=>{const t=async fn=>{try{await fn();return 'allowed';}catch(e){return e.code;}};return {w:await t(()=>db.collection('users').doc(auth.currentUser.uid).update({'predStats.streak':50})),w2:await t(()=>db.collection('users').doc(auth.currentUser.uid).update({predStats:{streak:50,best:50}}))};});
    check('Sécurité : le client ne peut pas écrire sa série de prédictions',acc.w==='permission-denied'&&acc.w2==='permission-denied',acc);
    await browser.close();
    // u2 : trouve
    ({browser,p,errs}=await login('u2'));
    await answer(p,'Thé');
    await wf(p,()=>document.querySelector('#rw-reveal .pd-opt'),null,15000);
    await p.evaluate(()=>[...document.querySelectorAll('#rw-reveal .pd-opt')].find(b=>b.textContent==='Café').click());
    await wf(p,()=>document.querySelector('#rw-reveal .pd-res'),null,15000);
    const ok=await p.evaluate(()=>({res:document.querySelector('#rw-reveal .pd-res').className,txt:document.querySelector('#rw-reveal .pd-res').textContent,friends:document.querySelectorAll('#rw-reveal .rv-av').length}));
    await p.evaluate(()=>{try{closeCelebration()}catch(e){}});await sleep(700);await p.screenshot({path:'/tmp/shots/pred_ok.png'});
    check('UI : bonne prédiction → message « Bien vu », record',/ok/.test(ok.res)&&/Bien vu/.test(ok.txt)&&/Record/.test(ok.txt),ok);
    check('UI : après la prédiction, les amis apparaissent dans la répartition (u1 a répondu Café)',ok.friends===1,ok);
    await p.evaluate(()=>{goNav('profile');refreshProfile();});await sleep(500);
    const pc2=await p.$eval('#dpred-txt',e=>e.textContent);
    check('Profil : série 1 · record 1 · 1 bonne sur 1',/série de 1/.test(pc2)&&/record 1/.test(pc2)&&/1 bonne sur 1/.test(pc2),pc2);
    await browser.close();
    // u3 : passe
    ({browser,p,errs}=await login('u3'));
    await answer(p,'Café');
    await wf(p,()=>document.querySelector('#rw-reveal .pd-opt'),null,15000);
    await p.evaluate(()=>document.querySelector('#rw-reveal .pd-skip').click());
    await wf(p,()=>document.querySelector('#rw-reveal .rv-row .rv-p'),null,15000);
    const sk=await p.evaluate(()=>({res:!!document.querySelector('#rw-reveal .pd-res'),rows:[...document.querySelectorAll('#rw-reveal .rv-p')].map(e=>e.textContent)}));
    check('UI : « Passer » → répartition directe, aucun message de résultat',!sk.res&&sk.rows.length===3,sk);
    st=await ps('u3');
    check('UI : « Passer » ne compte pas comme une tentative',(st.total||0)===0&&(st.streak||0)===0,st);
    await p.evaluate(()=>{goNav('profile');refreshProfile();});await sleep(400);
    check('Profil : pas de carte prédiction tant qu\'aucune tentative',await p.$eval('#dpred',e=>e.style.display)==='none');
    await browser.close();
    // u4 : feuille (question intermédiaire d'une campagne à plusieurs questions)
    await ans('u4',A,'Café');
    ({browser,p,errs}=await login('u4'));
    await p.evaluate(id=>{S._sheetQ={_firestoreId:id,type:'mcq',opts:['Café','Thé','Chocolat']};goNav('home');showReveal(S._sheetQ,0);},A);
    await wf(p,()=>document.querySelector('#rs-body .pd-opt'),null,15000);
    const sh=await p.evaluate(()=>({vis:getComputedStyle(document.getElementById('reveal-sheet')).display,n:document.querySelectorAll('#rs-body .pd-opt').length}));
    await p.screenshot({path:'/tmp/shots/pred_sheet.png'});
    check('UI feuille (question intermédiaire) : la prédiction s\'affiche dans la feuille',sh.vis==='flex'&&sh.n===3,sh);
    await p.evaluate(()=>document.querySelector('#rs-body .pd-opt').click());
    await wf(p,()=>document.querySelector('#rs-body .pd-res'),null,15000);
    check('UI feuille : le résultat et la répartition s\'y affichent',await p.evaluate(()=>!!document.querySelector('#rs-body .pd-res')&&document.querySelectorAll('#rs-body .rv-p').length===3));
    // question sans tirage favorable
    await browser.close();
    console.log('JS errors:',[...new Set(errs)].join(' | ')||'aucune');
  });
  console.log(`\n===== ${pass}/${pass+fail} OK =====`);process.exit(fail?1:0);
})();
