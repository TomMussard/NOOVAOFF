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
const compat=(uid,d={})=>E.compatCore(uid,d);
const byName=(r,u)=>r.friends.find(f=>f.uid===u);
const err=async fn=>{try{await fn();return null;}catch(e){return e.code||String(e);}};


const ev=(id,o)=>db.doc('communityEvents/'+id).set({type:'answer',userId:null,displayName:'X',city:'le-mans',text:'a répondu à une question de',brand:'Le Fournil',createdAt:Timestamp.fromMillis(Date.now()-Math.random()*1000),...o});
(async()=>{
  await T('feed amis',async()=>{
    await wipe();
    await db.doc('merchants/m1').set({brandName:'Le Fournil',sector:'Boulangerie',city:'le-mans',status:'verified'});
    await mkUser('me',{name:'Moi',email:'me@t.fr'});
    const friends=[];for(let i=1;i<=13;i++)friends.push('f'+i);
    for(const f of friends){await mkUser(f,{name:'Ami'+f,friendUids:['me']});}
    await mkUser('nf',{name:'Inconnu',friendUids:[]});             // même ville, pas ami
    await mkUser('one',{name:'Unilatéral',friendUids:[]});          // moi je l'ajoute, lui non
    await db.doc('users/me').update({friendUids:[...friends,'one']});
    await ev('e_me',{userId:'me',displayName:'Moi'});
    for(const f of friends)await ev('e_'+f,{userId:f,displayName:'Ami'+f});
    await ev('e_nf',{userId:'nf',displayName:'Inconnu'});
    await ev('e_one',{userId:'one',displayName:'Unilatéral'});
    await ev('e_far',{userId:'nf',displayName:'Inconnu2',city:'angers'});
    await ev('news1',{type:'merchant_post',userId:null,displayName:'Le Fournil',text:'Nouvelle carte de saison.',city:'le-mans',brand:'Le Fournil'});
    await ev('news_angers',{type:'merchant_post',userId:null,displayName:'Le Bar',text:'Autre ville.',city:'angers'});
    await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});
    const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
    const p=await browser.newPage();PG=p;await p.setViewport({width:430,height:900});
    const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(/Feed/.test(m.text()))console.log('CONSOLE',m.text().slice(0,300))});
    await p.goto(APP,{waitUntil:'load'});
    await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user&&S.friends&&S.friends.length>=13,null,30000);
    await p.addStyleTag({content:'body>div[style*="emulator"]{display:none!important}'});
    await p.evaluate(()=>goNav('social'));
    try{await wf(p,()=>document.querySelectorAll('#feed-content .feed-post').length>=15,null,20000);}catch(e){console.log('POSTS',await p.evaluate(()=>[document.querySelectorAll('#feed-content .feed-post').length,document.getElementById('feed-content').textContent.slice(0,200)]));throw e;}
    await sleep(800);
    const names=await p.evaluate(()=>[...document.querySelectorAll('#feed-content .fp-name')].map(e=>e.textContent.replace('Actualité','').trim()));
    await p.screenshot({path:'/tmp/shots/feed_friends.png'});
    check('Fil : mes 13 amis (plusieurs tranches d\'écoute), moi et l\'actualité de mon commerce',friends.every(f=>names.includes('Ami'+f))&&names.includes('Moi')&&names.includes('Le Fournil'),names);
    check('Fil : aucun inconnu (même ville), aucun ami non réciproque, aucune actualité d\'une autre ville',!names.includes('Inconnu')&&!names.includes('Unilatéral')&&!names.includes('Inconnu2')&&!names.includes('Le Bar'),names);
    check('Fil : 15 éléments exactement (13 amis + moi + 1 actualité)',names.length===15,names.length);
    const acc=await p.evaluate(async()=>{const t=async fn=>{try{await fn();return 'allowed';}catch(e){return e.code;}};const c=db.collection('communityEvents');
      return {city:await t(()=>c.where('city','==','le-mans').orderBy('createdAt','desc').limit(25).get()),
        stranger:await t(()=>c.doc('e_nf').get()),friend:await t(()=>c.doc('e_f1').get()),mine:await t(()=>c.doc('e_me').get()),
        one:await t(()=>c.doc('e_one').get()),news:await t(()=>c.doc('news1').get()),newsFar:await t(()=>c.doc('news_angers').get()),
        strangersIn:await t(()=>c.where('userId','in',['nf','f1']).orderBy('createdAt','desc').get())};});
    check('Règles : la lecture « toute la ville » est refusée',acc.city==='permission-denied',acc);
    check('Règles : événement d\'un inconnu refusé, d\'un ami / le mien / actualité de ma ville autorisés',acc.stranger==='permission-denied'&&acc.friend==='allowed'&&acc.mine==='allowed'&&acc.news==='allowed',acc);
    check('Règles : ami non réciproque et actualité d\'une autre ville refusés',acc.one==='permission-denied'&&acc.newsFar==='permission-denied'&&acc.strangersIn==='permission-denied',acc);
    // un ami retiré disparaît du fil
    await db.doc('users/me').update({friendUids:['f1']});
    await p.evaluate(()=>{loadFriendsFromFirestore(S._friendUids);});
    await wf(p,()=>document.querySelectorAll('#feed-content .feed-post').length===3,null,20000);
    check('Fil : retirer des amis les retire du fil',await p.evaluate(()=>document.querySelectorAll('#feed-content .feed-post').length)===3);
    // sans ami
    await db.doc('users/me').update({friendUids:[]});
    await p.evaluate(()=>{S.friends=[];loadCommunityFeed();});
    await wf(p,()=>document.querySelectorAll('#feed-content .feed-post').length===2,null,20000);
    check('Fil sans ami : mes événements et l\'actualité seulement',await p.evaluate(()=>document.querySelectorAll('#feed-content .feed-post').length)===2);
    await browser.close();
    console.log('JS errors:',[...new Set(errs)].join(' | ')||'aucune');
  });
  console.log(`\n===== ${pass}/${pass+fail} OK =====`);process.exit(fail?1:0);
})();
