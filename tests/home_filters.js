// Accueil : filtres par type de commerce (bars, courses…) et temps restant d'une question (« Encore 3 jours pour répondre »).
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();const {Timestamp}=admin.firestore;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const SH=process.env.SHOTS_DIR;const shot=async(p,n)=>{if(SH)await p.screenshot({path:SH+'/'+n+'.png'}).catch(()=>{});};
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,3).join(' | '));}};
const wf=(p,fn,t=30000)=>p.waitForFunction(fn,{timeout:t,polling:200});
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const H=3600000,D=24*H;
(async()=>{
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});
  const M=(id,o)=>db.doc('merchants/'+id).set({role:'merchant',ownerUid:id,city:'le-mans',cityLabel:'Le Mans',status:'verified',email:id+'@s.fr',...o});
  const ms=[['m1','Le Zinc','Bar'],['m2','Café Plumes','Café'],['m3','Super U Centre','Supérette'],['m4','Le Fournil','Boulangerie'],['m5','Salon Mèche','Coiffeur']];
  for(const [id,n,sec] of ms)await M(id,{brandName:n,name:n,sector:sec});
  const C=(id,o)=>db.doc('campaigns/'+id).set({status:'active',targetCity:'le-mans',city:'le-mans',questions:[{q:o.question,format:'mcq',options:['Oui','Non']}],createdAt:Timestamp.now(),...o});
  await C('c1',{merchantId:'m1',merchantName:'Le Zinc',sector:'Bar',question:'Un concert le jeudi ?',endsAt:Timestamp.fromMillis(Date.now()+3*D+2*H)});
  await C('c2',{merchantId:'m2',merchantName:'Café Plumes',sector:'Café',question:'Un brunch le dimanche ?',endsAt:Timestamp.fromMillis(Date.now()+5*H+60000)});
  await C('c3',{merchantId:'m3',merchantName:'Super U Centre',sector:'Supérette',question:'Ouvert le dimanche matin ?'});
  await C('c4',{merchantId:'m4',merchantName:'Le Fournil',sector:'Boulangerie',question:'Baguette tradition ou classique ?'});
  await C('c5',{merchantId:'m5',merchantName:'Salon Mèche',sector:'Coiffeur',question:'Le samedi sans rendez-vous ?'});
  await db.doc('users/me').set({role:'user',name:'Moi',email:'me@t.fr',city:'le-mans',cityLabel:'Le Mans',welcomeClaimed:true,onboardingStep:'done',seenHomeTour:true,authorizedMerchants:ms.map(x=>x[0]),answeredCampaigns:[],points:0,xp:0,streak:0,ageRange:'25-34',interests:['restauration'],friendUids:[]});
  await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});
  const b=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:'new',args:['--no-sandbox']});
  const p=await b.newPage();await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8950/app.html',{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'));
  await p.evaluate(()=>{try{localStorage.removeItem('nv_feed_type');}catch(e){}showAuthWall('login');});await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
  await wf(p,()=>document.getElementById('home').classList.contains('active')&&document.querySelectorAll('#hm-feed-q .hq-card').length===5);await sleep(1200);
  await p.evaluate(()=>{document.querySelectorAll('.nv-modal').forEach(m=>{m.style.display='none';});});
  await shot(p,'filters_all');
  const chips=()=>p.$$eval('#hm-filters .rw-cat',l=>l.map(c=>({t:c.textContent.replace(/\s+/g,' ').trim(),on:c.getAttribute('aria-pressed')})));
  await T('filtres',async()=>{
    const c=await chips();
    check('Filtres proposés : seulement les types qui ont des questions, avec le nombre',JSON.stringify(c.map(x=>x.t))===JSON.stringify(['Tout 5','Bars et cafés 2','Boulangeries et douceurs 1','Courses et épicerie 1','Beauté et coiffure 1'])&&c[0].on==='true',c);
    await p.evaluate(()=>[...document.querySelectorAll('#hm-filters .rw-cat')].find(x=>/Bars/.test(x.textContent)).click());await sleep(300);
    let cards=await p.$$eval('#hm-feed-q .hq-card',l=>l.map(c=>c.textContent));
    check('« Bars et cafés » : seulement le bar et le café',cards.length===2&&cards.some(t=>/Zinc/.test(t))&&cards.some(t=>/Plumes/.test(t)),cards.length);
    await shot(p,'filters_bars');
    await p.evaluate(()=>[...document.querySelectorAll('#hm-filters .rw-cat')].find(x=>/Courses/.test(x.textContent)).click());await sleep(300);
    cards=await p.$$eval('#hm-feed-q .hq-card',l=>l.map(c=>c.textContent));
    check('« Courses et épicerie » : la supérette',cards.length===1&&/Super U/.test(cards[0]));
    check('Choix retenu sur l\'appareil',await p.evaluate(()=>localStorage.getItem('nv_feed_type')==='courses'));
    // Plus de question de ce type : message et retour à « Tout »
    // (type retenu d'une visite précédente, sans question aujourd'hui)
    await p.evaluate(()=>setFeedType('sport'));await sleep(300);
    const e=await p.evaluate(()=>({t:document.getElementById('hm-feed-q').textContent,cards:document.querySelectorAll('#hm-feed-q .hq-card').length}));
    check('Plus de question de ce type : message clair et bouton « Voir toutes les questions »',e.cards===0&&/Plus de question « Sport »/.test(e.t)&&/Voir toutes les questions/.test(e.t),e);
    await p.evaluate(()=>[...document.querySelectorAll('#hm-feed-q button')].find(x=>/Voir toutes/.test(x.textContent)).click());await sleep(300);
    check('« Voir toutes les questions » : retour à Tout',await p.evaluate(()=>document.querySelectorAll('#hm-feed-q .hq-card').length===5&&_feedType==='all'));
    check('Le filtre « Sport » reste proposé tant qu\'il est choisi, puis disparaît',!(await chips()).some(x=>/Sport/.test(x.t)));
  });
  await T('temps restant',async()=>{
    const t=await p.$$eval('#hm-feed-q .hq-card',l=>l.map(c=>[(c.querySelector('.hq-who')||{}).textContent,(c.querySelector('.hq-left')||{}).textContent||'']));
    const of=n=>(t.find(x=>new RegExp(n).test(x[0]))||[])[1];
    check('Carte : « Encore 3 jours pour répondre » / « Encore 6 h pour répondre » ; rien sans date de fin',of('Zinc')==='Encore 3 jours pour répondre'&&of('Plumes')==='Encore 6 h pour répondre'&&of('Fournil')==='',t);
    await p.evaluate(()=>openQ(S.qs.findIndex(q=>q._firestoreId==='c1')));await sleep(500);
    const q=await p.evaluate(()=>({t:document.getElementById('bh-left').textContent,h:document.getElementById('bh-left').hidden}));
    check('Écran de la question : le temps restant sous le commerce',q.t==='Encore 3 jours pour répondre'&&!q.h,q);
    await shot(p,'question_left');
    await p.evaluate(()=>goNav('home'));await sleep(300);
    await p.evaluate(()=>openQ(S.qs.findIndex(q=>q._firestoreId==='c4')));await sleep(400);
    check('Sans date de fin : rien d\'affiché',await p.evaluate(()=>document.getElementById('bh-left').hidden));
  });
  check('Aucune erreur JavaScript',errs.length===0,errs);
  await b.close();
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(fail?1:0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
