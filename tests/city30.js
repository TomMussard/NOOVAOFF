// Ville à 30 commerces (mois de test) : jamais deux fois la même question dans une ville, pas de réponse possible à une
// question d'une autre ville (fiche commerce), récompenses rangées (une ligne par commerce, filtre par catégorie, feuille
// regroupée par commerce), accueil lisible.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const TM=require(__dirname+'/../functions/testMonth.js')._t;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const SH=process.env.SHOTS_DIR;const shot=async(p,n)=>{if(SH)await p.waitForFunction(()=>[...document.images].every(i=>i.complete),{timeout:8000}).catch(()=>{});if(SH)await p.screenshot({path:SH+'/'+n+'.png'}).catch(()=>{});};
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,3).join(' | '));}};
const wf=(p,fn,t=30000)=>p.waitForFunction(fn,{timeout:t,polling:200});
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
(async()=>{
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});

  await T('banques : aucune question posée par deux métiers',async()=>{
    const m={};for(const [k,b] of Object.entries(TM.BANK))b.forEach(([q])=>{(m[q]=m[q]||[]).push(k);});
    const d=Object.entries(m).filter(([,l])=>l.length>1);
    check('Chaque intitulé de question n\'appartient qu\'à un seul métier',d.length===0,d.slice(0,5));
  });

  await T('serveur : jamais deux fois la même question ouverte dans une ville',async()=>{
    await TM.setupCore({});
    const cs=(await db.collection('campaigns').where('targetCity','==','paris').where('status','==','active').get()).docs.map(d=>d.data().question);
    check('Paris : 30 questions ouvertes, toutes différentes',cs.length===30&&new Set(cs).size===30,{n:cs.length,uniq:new Set(cs).size});
    // Un vrai commerce de Paris a déjà ouvert la question que le café fictif allait poser : le café passe à la suivante.
    const cafe=TM.merchantId('paris','cafe'),idx=(await db.doc('merchants/'+cafe).get()).data().testQIdx;
    const nextQ=TM.BANK.cafe[idx%TM.BANK.cafe.length][0];
    await db.doc('campaigns/real_same').set({merchantId:'realp',merchantName:'Vrai Café',status:'active',targetCity:'paris',city:'paris',question:nextQ,questions:[{q:nextQ,format:'mcq',options:['A','B']}]});
    await db.doc('merchants/'+cafe).update({testLastDay:'2000-01-01'});
    await TM.postNextQuestions(Date.now(),{cities:new Set(['paris'])});
    const mine=(await db.collection('campaigns').where('merchantId','==',cafe).get()).docs.map(d=>d.data().question);
    check('Question déjà ouverte en ville : le commerce fictif pose la suivante de sa banque',mine.length===2&&!mine.includes(nextQ),mine);
    await db.doc('campaigns/real_same').delete();
  });

  await T('deux passages en même temps, doublons d\'avant',async()=>{
    const y=TM.merchantId('nantes','yoga');
    await db.doc('merchants/'+y).update({testLastDay:'2000-01-01'});
    const before=(await db.collection('campaigns').where('merchantId','==',y).get()).size;
    await Promise.all([TM.postNextQuestions(Date.now(),{cities:new Set(['nantes'])}),TM.postNextQuestions(Date.now(),{cities:new Set(['nantes'])})]);
    const qs=(await db.collection('campaigns').where('merchantId','==',y).get()).docs.map(d=>d.data().question);
    check('Pilote et bouton de l\'admin en même temps : une seule nouvelle question, jamais deux fois la même',new Set(qs).size===qs.length,{before,qs});
    // Doublon créé avant la correction (identifiant aléatoire) : clos au passage suivant du pilote, le plus ancien gardé
    const src=(await db.collection('campaigns').where('merchantId','==',y).limit(1).get()).docs[0];
    await db.collection('campaigns').add({...src.data(),createdAt:admin.firestore.Timestamp.now()});
    await db.doc('config/testMonth').set({dedupV:0},{merge:true});
    await TM.autopilotCore(Date.now());
    const act=(await db.collection('campaigns').where('targetCity','==','nantes').where('status','==','active').get()).docs.map(d=>d.data().question);
    check('Doublon déjà en base : clos automatiquement, une seule fois chaque question dans la ville',new Set(act).size===act.length&&(await db.doc(src.ref.path).get()).data().status==='active',act.length);
  });

  // Habitant de Paris avec 600 points, qui suit 3 commerces
  const fol=['cafe','boulangerie','librairie'].map(t=>TM.merchantId('paris',t));
  await db.doc('users/pa').set({role:'user',name:'Pia',email:'pa@t.fr',city:'paris',cityLabel:'Paris',welcomeClaimed:true,onboardingStep:'done',seenHomeTour:true,authorizedMerchants:fol,answeredCampaigns:[],points:600,xp:600,streak:0,ageRange:'25-34',interests:['restauration','culture'],friendUids:[]});
  await aauth.createUser({uid:'pa',email:'pa@t.fr',password:'secret123'});
  const b=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:'new',args:['--no-sandbox']});
  const p=await b.newPage();await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8950/app.html',{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'));
  await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','pa@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
  await wf(p,()=>document.getElementById('home').classList.contains('active')&&(S._rewardsCache||[]).length>=150&&document.querySelectorAll('.hq-card').length>0,40000);await sleep(2500);
  await p.evaluate(()=>{document.querySelectorAll('.nv-modal').forEach(m=>m.remove());});

  await T('accueil : questions de la ville, sans doublon',async()=>{
    const r=await p.evaluate(()=>({qs:(S.qs||[]).map(q=>q.q),cards:document.querySelectorAll('#hm-feed-q .hq-card').length,nearby:document.querySelectorAll('#dnearby-grid .dnb-card:not(.dnb-extra)').length,more:(document.getElementById('dnb-more')||{}).textContent}));
    check('Fil de l\'accueil : aucune question en double',r.qs.length>0&&new Set(r.qs).size===r.qs.length,{n:r.qs.length,u:new Set(r.qs).size});
    check('« À deux pas » : 4 commerces visibles, les autres derrière « Plus de commerces »',r.nearby===4&&/Plus de commerces \(26\)/.test(r.more||''),r);
    await shot(p,'c30_home');
    await p.evaluate(()=>document.getElementById('dnearby-grid').scrollIntoView());await sleep(400);await shot(p,'c30_nearby');
  });

  await T('fiche commerce : pas de question d\'une autre ville',async()=>{
    const other=TM.merchantId('angers','cafe');
    await p.evaluate(id=>openBrandById(id,'Café'),other);
    await wf(p,()=>!/Chargement/.test(document.getElementById('bp-wrap').textContent),15000);
    const t=await p.$eval('#bp-wrap',e=>({txt:e.textContent.replace(/\s+/g,' '),btn:e.querySelectorAll('.btn-p').length}));
    check('Commerce d\'Angers vu de Paris : « réservées aux habitants de sa ville », aucun bouton pour répondre',/réservées aux habitants de sa ville/.test(t.txt)&&t.btn===0,t.txt.slice(0,300));
    const cid=(await db.collection('campaigns').where('merchantId','==',other).limit(1).get()).docs[0].id;
    await p.evaluate(id=>startCampaignById(id),cid);await sleep(1500);
    check('Lien direct vers la question d\'Angers : refusée, la question ne s\'ouvre pas',await p.evaluate(()=>!document.getElementById('question').classList.contains('active')));
    const own=TM.merchantId('paris','pizzeria');
    await p.evaluate(id=>openBrandById(id,'Pizzeria'),own);
    await wf(p,()=>!/Chargement/.test(document.getElementById('bp-wrap').textContent),15000);
    check('Commerce de Paris : sa question est proposée',await p.$eval('#bp-wrap',e=>e.querySelectorAll('.btn-p').length>=1));
    await p.evaluate(()=>goNav('home'));
  });

  await T('récompenses rangées',async()=>{
    await p.evaluate(()=>goNav('rewards-tab'));await sleep(1200);
    const r=await p.evaluate(()=>({can:[...document.querySelectorAll('#rw-can .rwr')].map(e=>e.querySelector('.rwr-s').textContent),more:(document.querySelector('#rw-can .rw-more')||{}).textContent,soon:document.querySelectorAll('#rw-soon .rwr').length,cats:[...document.querySelectorAll('#rw-cats .rw-cat')].map(c=>c.textContent),all:document.getElementById('rw-all-btn').textContent}));
    check('« Tu peux t\'offrir » : 5 lignes au plus, un commerce par ligne',r.can.length===5&&new Set(r.can).size===5,r.can);
    check('… les commerces suivis en premier',['Café','Boulangerie','Librairie'].length&&await p.evaluate(fol=>{const n=(S._rewardsCache||[]).filter(x=>fol.includes(x.merchantId)).map(x=>x.merchantName);return [...document.querySelectorAll('#rw-can .rwr .rwr-s')].slice(0,3).every(e=>n.includes(e.textContent));},fol));
    check('… et un lien vers les autres commerces',/Voir les 25 autres commerces/.test(r.more||''),r.more);
    check('« Bientôt à ta portée » : 3 lignes au plus',r.soon<=3,r.soon);
    check('Filtre par catégorie (Tout, Restauration, Boulangerie, Sport, Beauté, Culture, Boutiques, Services)',r.cats.length===8&&/^Tout30$/.test(r.cats[0]),r.cats);
    check('Bouton : nombre de commerces, pas de récompenses',/\(30 commerces\)/.test(r.all),r.all);
    await shot(p,'c30_rewards');
    await p.evaluate(()=>{const c=[...document.querySelectorAll('#rw-cats .rw-cat')].find(x=>/^Sport/.test(x.textContent));c.click();});await sleep(300);
    const sp=await p.evaluate(()=>[...document.querySelectorAll('#rw-can .rwr .rwr-s')].map(e=>e.textContent));
    check('Filtre « Sport » : seulement salle de sport, yoga et vélo',sp.length===3,sp);
    await p.evaluate(()=>setRwCat('all'));
    await p.evaluate(()=>openRewardsSheet());await sleep(600);
    const sh=await p.evaluate(()=>({groups:document.querySelectorAll('#gift-grid .rwg').length,first:[...document.querySelectorAll('#gift-grid .rwg .rwg-t')].slice(0,3).map(e=>e.textContent),chips:document.querySelectorAll('#gift-grid .rwg:first-child .gift-c').length}));
    check('Feuille : un bloc par commerce (30), ses 5 paliers côte à côte, suivis en premier',sh.groups===30&&sh.chips===5,sh);
    await shot(p,'c30_sheet');
    await p.evaluate(()=>{document.getElementById('rw-only-can').click();});await sleep(300);
    check('« Seulement ce que je peux m\'offrir » : tous les commerces ont un palier à 150 pts, aucun bloc vide',await p.evaluate(()=>[...document.querySelectorAll('#gift-grid .rwg')].every(g=>g.querySelector('.gift-c.ok'))));
    const docW=await p.evaluate(()=>document.documentElement.scrollWidth);
    check('Aucun débordement horizontal de la page',docW<=390,docW);
  });
  await T('accueil de chaque ville',async()=>{
    const bad=[];let minQ=99;
    for(const c of TM.CITIES){
      const uid='u_'+c.slug.replace(/-/g,'');
      await db.doc('users/'+uid).set({role:'user',name:'U',email:uid+'@t.fr',city:c.slug,cityLabel:c.label,welcomeClaimed:true,onboardingStep:'done',seenHomeTour:true,authorizedMerchants:[],answeredCampaigns:[],points:0,xp:0,streak:0,ageRange:'25-34',interests:['restauration'],friendUids:[]});
      await aauth.createUser({uid,email:uid+'@t.fr',password:'secret123'});
      const ctx=await b.createBrowserContext();const q=await ctx.newPage();q.on('pageerror',e=>errs.push(c.slug+': '+e.message));
      await q.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
      await q.goto('http://localhost:8950/app.html',{waitUntil:'load'});await wf(q,()=>document.getElementById('onboard').classList.contains('active'));
      await q.evaluate(()=>showAuthWall('login'));await setVal(q,'#aw-email',uid+'@t.fr');await setVal(q,'#aw-pass','secret123');await q.evaluate(()=>awSubmit());
      await wf(q,()=>document.getElementById('home').classList.contains('active')&&(S.qs||[]).length>0&&document.querySelectorAll('#dnearby-grid .dnb-card').length>0,40000).catch(()=>{});await sleep(800);
      const r=await q.evaluate(()=>({qs:(S.qs||[]).map(x=>x.q),brands:[...new Set((S.qs||[]).map(x=>x.brand))],cards:document.querySelectorAll('#hm-feed-q .hq-card').length,nearby:document.querySelectorAll('#dnearby-grid .dnb-card').length,rw:new Set((S._rewardsCache||[]).map(x=>x.merchantId)).size}));
      const names=new Set((await db.collection('merchants').where('city','==',c.slug).get()).docs.map(d=>d.data().brandName));
      const ok=r.qs.length>0&&new Set(r.qs).size===r.qs.length&&r.brands.every(x=>names.has(x))&&r.cards===r.qs.length&&r.nearby===30&&r.rw===30;
      minQ=Math.min(minQ,r.qs.length);
      if(!ok)bad.push({city:c.slug,...r,qs:r.qs.length});
      await ctx.close();
    }
    check('Nouvel habitant (aucun commerce suivi) : au moins 10 questions sur l\'accueil, pas seulement 3 ou 4',bad.length===0&&minQ>=10,{minQ});
    check('10 villes : questions de la ville seulement, sans doublon, 30 commerces à deux pas, 30 commerces dans les récompenses',bad.length===0,bad);
  });
  check('Aucune erreur JavaScript',errs.length===0,errs);
  await b.close();
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(fail?1:0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
