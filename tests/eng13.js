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


const until=async(fn,t=15000)=>{const s=Date.now();while(Date.now()-s<t){if(await fn())return true;await sleep(300);}return false;};
const ADMIN='http://localhost:8950/admin.html';




const AUTH3='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake';
const ansX=(u,cid,o={})=>db.doc(`answers/${u}_${cid}_q0`).set({userId:u,campaignId:cid,merchantId:'m1',questionIdx:0,answer:['Café','Thé','Chocolat'][o.opt||0],optionIdx:o.opt==null?0:o.opt,respondentCity:o.city||'le-mans',flagged:!!o.flagged,pointsAwarded:0,createdAt:o.at||Timestamp.now()});
(async()=>{
  await T('série et fil (serveur)',async()=>{
    await wipe();
    await db.doc('merchants/m1').set({brandName:'Le Fournil',sector:'Boulangerie',city:'le-mans',status:'verified'});
    for(let i=1;i<=4;i++)await mkCampaign('c'+i,{question:'Question '+i+' ?',questions:[{q:'Question '+i+' ?',format:'mcq',options:['Café','Thé','Chocolat']}]});
    const day=ms=>new Date(ms).toLocaleDateString('sv-SE',{timeZone:'Europe/Paris'});
    await mkUser('me',{name:'Alex',email:'me@t.fr',streak:6,streakDate:day(Date.now()-86400000),lastAnswerDate:day(Date.now()-86400000),xp:990,points:990});
    await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});
    const tok=(await (await fetch(AUTH3,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'me@t.fr',password:'secret123',returnSecureToken:true})})).json()).idToken;
    const call=async(name,data)=>{const x=await fetch('http://127.0.0.1:5001/noova-366d0/europe-west1/'+name,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify({data})});return x.json();};
    const answer=async(cid)=>{await db.doc('users/me').update({lastQuestionStart:{key:cid+'_0',at:Date.now()-5000}});return call('submitAnswer',{campaignId:cid,questionIdx:0,answerValue:'Café'});};
    const r1=await answer('c1'),u1=(await db.doc('users/me').get()).data();
    check('1re réponse du jour : la série (6) ne bouge pas — se connecter / répondre une fois ne suffit pas',r1.result.streak===6&&r1.result.streakToday===false&&u1.streakDate===day(Date.now()-86400000),{r:r1.result,sd:u1.streakDate});
    const r2=await answer('c2');
    check('2e réponse du jour : toujours 6',r2.result.streak===6&&r2.result.streakToday===false,r2.result);
    const evs0=(await db.collection('communityEvents').where('userId','==','me').get()).docs.map(d=>d.data());
    check('Pas de jalon de série tant que la journée n\'est pas validée',!evs0.some(e=>e.type==='streak'));
    const r3=await answer('c3'),u3=(await db.doc('users/me').get()).data();
    check('3e réponse du jour : la journée est validée, série = 7, streakDate = aujourd\'hui',r3.result.streak===7&&r3.result.streakToday===true&&u3.streak===7&&u3.streakDate===day(Date.now()),{r:r3.result,u:[u3.streak,u3.streakDate]});
    const evs=(await db.collection('communityEvents').where('userId','==','me').get()).docs.map(d=>d.data());
    const st=evs.find(e=>e.type==='streak');
    check('Série de 7 jours : jalon annoncé dans le fil (« est à 7 jours d\'affilée »), une seule fois',st&&st.streak===7&&evs.filter(e=>e.type==='streak').length===1,evs.map(e=>e.type));
    const r4=await answer('c4');
    check('4e réponse du jour : la série reste à 7 (un seul jour compté) et aucun 2e jalon',r4.result.streak===7&&(await db.collection('communityEvents').where('userId','==','me').where('type','==','streak').get()).size===1,r4.result);
    check('Le fil ne reçoit plus d\'événement « a répondu » (on n\'y montre plus ce que les gens répondent)',!(await db.collection('communityEvents').where('type','==','answer').get()).size&&!evs.some(e=>e.type==='answer'));
    const lv=evs.find(e=>e.type==='levelup');
    check('Palier d\'xp franchi (990 → 1000 : Curieux → Actif) : événement « a atteint le palier Actif » pour les amis',lv&&lv.level==='Actif'&&/palier Actif/.test(lv.text)&&lv.userId==='me',evs.map(e=>e.type+':'+(e.level||'')));
    // série cassée : dernier jour validé il y a 2 jours → repart à 1 à la 3e réponse
    await db.doc('users/me').update({streak:9,streakDate:day(Date.now()-2*86400000),lastAnswerDate:day(Date.now()-2*86400000),dailyAnswerDate:'2020-01-01',dailyAnswerCount:0});
    await db.doc('users/me').update({answeredCampaigns:[]});
    for(const c of ['c1','c2','c3','c4']){await db.doc('answers/me_'+c+'_q0').delete().catch(()=>{});}
    await answer('c1');await answer('c2');const r5=await answer('c3');
    check('Série cassée (dernier jour validé il y a 2 jours) : repart à 1 à la 3e réponse',r5.result&&r5.result.streak===1,r5.result||r5);
  });

  await T('communauté interface',async()=>{
    await wipe();
    await db.doc('merchants/m1').set({brandName:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified'});
    await mkCampaign('c1',{question:'Quelle boisson ?',questions:[{q:'Quelle boisson ?',format:'mcq',options:['Café','Thé','Chocolat']}]});
    await mkUser('me',{name:'Alex',email:'me@t.fr',friendUids:['f1','f2'],seenHomeTour:true});
    await mkUser('f1',{name:'Léa',friendUids:['me'],xp:410,streak:5});await mkUser('f2',{name:'Tom',friendUids:['me'],xp:120});
    for(let i=1;i<=6;i++){await mkUser('s'+i,{name:'Inconnu'+i});await ansX('s'+i,'c1',{opt:i%3});}
    await ansX('me','c1',{opt:0});
    await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});
    const now=Date.now(),ev=(id,o)=>db.doc('communityEvents/'+id).set({type:'levelup',level:'Actif',userId:'f1',displayName:'Léa',city:'le-mans',text:'a atteint le palier Actif',brand:'',likeCount:0,commentCount:0,createdAt:Timestamp.fromMillis(now-5000),...o});
    await ev('a1',{level:'Expert',text:'a atteint le palier Expert',createdAt:Timestamp.fromMillis(now-1000)});
    await ev('t1',{userId:'f2',displayName:'Tom',createdAt:Timestamp.fromMillis(now-4000)});
    await ev('old1',{type:'answer',text:'a répondu à une question de',brand:'Le Fournil',createdAt:Timestamp.fromMillis(now-2000)});   // ancien événement : plus montré
    await ev('st1',{type:'streak',userId:'f1',brand:'',text:"est à 7 jours d'affilée",createdAt:Timestamp.fromMillis(now-500)});
    await ev('n1',{type:'merchant_post',kind:'top',merchantId:'m1',userId:null,displayName:'Le Fournil',brand:'Le Fournil',text:'Nouvelle fournée de pain aux céréales dès 6h30.',createdAt:Timestamp.fromMillis(now-6000)});
    await ev('x1',{userId:'s1',displayName:'Inconnu1'});                        // un inconnu : ne doit jamais apparaître
    const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
    const p=await browser.newPage();PG=p;await p.setViewport({width:390,height:900,isMobile:true,hasTouch:true,deviceScaleFactor:2});const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user&&S.friends&&S.friends.length>=2,null,30000);
    await p.addStyleTag({content:'body>div[style*="emulator"]{display:none!important}'});
    await p.evaluate(()=>goNav('social'));
    await wf(p,()=>document.querySelectorAll('#feed-content .feed-post').length>=4,null,25000);
    await sleep(600);
    const fd=await p.evaluate(()=>({cards:[...document.querySelectorAll('#feed-content .feed-post')].map(e=>({cls:e.className,txt:e.textContent.replace(/\s+/g,' ').trim()})),pulse:!!document.getElementById('community-pulse'),results:!!document.getElementById('community-results'),all:document.getElementById('panel-feed').innerText.replace(/\s+/g,' ')}));
    await p.screenshot({path:'/tmp/shots/cm_feed_new.png'});
    check('Fil : palier d\'xp d\'un ami (« Léa a atteint le palier Expert ») en carte distincte, avec l\'icône du palier',fd.cards.some(c=>/cm-level/.test(c.cls)&&/Léa/.test(c.txt)&&/palier Expert/.test(c.txt)),fd.cards.map(c=>c.txt));
    check('Fil : palier d\'un 2e ami (Tom, Actif)',fd.cards.some(c=>/cm-level/.test(c.cls)&&/Tom/.test(c.txt)&&/palier Actif/.test(c.txt)));
    check('Fil : carte « jalon de série » distincte (7 jours d\'affilée)',fd.cards.some(c=>/cm-streak/.test(c.cls)&&/Léa/.test(c.txt)&&/7 jours d'affilée/.test(c.txt)),fd.cards.map(c=>c.cls));
    check('Fil : « À la une » d\'un commerce autorisé en jaune plein, avec son étiquette',fd.cards.some(c=>/cm-k-top/.test(c.cls)&&/À la une/.test(c.txt)&&/6h30/.test(c.txt)),fd.cards.map(c=>c.cls+' '+c.txt.slice(0,40)));
    check('Fil : jamais ce que les gens ont répondu (ancien événement « a répondu » masqué)',!fd.cards.some(c=>/a répondu/.test(c.txt))&&!/a répondu/.test(fd.all),fd.all.slice(0,200));
    check('Fil : plus de « chiffres de la ville » ni de « Comment la ville a répondu »',!fd.pulse&&!fd.results&&!/réponses de voisins|Comment la ville a répondu/.test(fd.all),fd.all.slice(0,200));
    check('Fil : un inconnu n\'apparaît jamais',!fd.cards.some(c=>/Inconnu/.test(c.txt)),fd.cards.map(c=>c.txt));
    // onglet Amis
    await p.evaluate(()=>socTab('friends',document.querySelector('.tab-btn[onclick*="friends"]')));await sleep(1200);
    const fr=await p.evaluate(()=>({invite:!!document.querySelector('.cm-invite .cm-btn'),code:document.getElementById('inv-code').textContent,boxHidden:document.getElementById('add-friend-box').style.display==='none',rows:document.querySelectorAll('#friends-list .cp-row').length,compatList:!!document.getElementById('compat-list')}));
    await p.screenshot({path:'/tmp/shots/cm_friends_new.png'});
    check('Amis : bouton « Inviter un ami » et code en évidence ; ajout par code replié ; une seule liste (plus de doublon compatibilité)',fr.invite&&/NOOVA-/.test(fr.code)&&fr.boxHidden&&fr.rows===2&&!fr.compatList,fr);
    await p.evaluate(()=>toggleAddFriend());
    check('« + Ajouter avec un code » déplie la saisie',await p.evaluate(()=>document.getElementById('add-friend-box').style.display==='block'&&!!document.getElementById('fi-inp')));
    await browser.close();
    console.log('JS errors:',[...new Set(errs)].join(' | ')||'aucune');
  });
  console.log(`\n===== ${pass}/${pass+fail} OK =====`);process.exit(fail?1:0);
})();
