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
const compat=(uid,d={})=>E.compatCore(uid,d);
const byName=(r,u)=>r.friends.find(f=>f.uid===u);
const err=async fn=>{try{await fn();return null;}catch(e){return e.code||String(e);}};


const until=async(fn,t=15000)=>{const s=Date.now();while(Date.now()-s<t){if(await fn())return true;await sleep(300);}return false;};
const ADMIN='http://localhost:8950/admin.html';




const AUTH3='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake';
const ansX=(u,cid,o={})=>db.doc(`answers/${u}_${cid}_q0`).set({userId:u,campaignId:cid,merchantId:'m1',questionIdx:0,answer:['Café','Thé','Chocolat'][o.opt||0],optionIdx:o.opt==null?0:o.opt,respondentCity:o.city||'le-mans',flagged:!!o.flagged,pointsAwarded:0,createdAt:o.at||Timestamp.now()});
(async()=>{
  await T('communauté serveur',async()=>{
    await wipe();
    await db.doc('merchants/m1').set({brandName:'Le Fournil',sector:'Boulangerie',city:'le-mans',status:'verified'});
    await db.doc('merchants/m2').set({brandName:'Café de la Place',sector:'Restauration',city:'le-mans',status:'verified'});
    for(let i=1;i<=3;i++)await mkCampaign('c'+i,{merchantId:i===3?'m2':'m1',merchantName:i===3?'Café de la Place':'Le Fournil',question:'Question '+i+' ?',questions:[{q:'Question '+i+' ?',format:'mcq',options:['Café','Thé','Chocolat']}]});
    await mkCampaign('ct',{question:'Texte ?',format:'text',questions:[{q:'Texte ?',format:'text'}]});
    await mkCampaign('far',{targetCity:'angers',city:'angers'});
    await mkUser('me',{name:'Alex',email:'me@t.fr'});
    for(let i=1;i<=7;i++)await mkUser('s'+i,{name:'Voisin'+i});
    const old=Timestamp.fromMillis(Date.now()-15*86400000);
    // semaine en cours : 6 réponses de voisins (dont 1 signalée, 1 d'une autre ville, 1 de la semaine dernière → non comptées)
    for(let i=1;i<=6;i++)await ansX('s'+i,'c1',{opt:i%3});
    await ansX('s7','c1',{flagged:true});await ansX('s7','c2',{city:'angers'});await ansX('s7','c3',{at:old});
    // mes réponses (plus récentes en dernier) : c1, c2 (mcq), ct (texte, exclue), c3
    await ansX('me','c1',{opt:0,at:Timestamp.fromMillis(Date.now()-3000)});await ansX('me','c2',{opt:1,at:Timestamp.fromMillis(Date.now()-2000)});
    await db.doc('answers/me_ct_q0').set({userId:'me',campaignId:'ct',questionIdx:0,answer:'un texte libre',optionIdx:-1,respondentCity:'le-mans',flagged:false,createdAt:Timestamp.fromMillis(Date.now()-1500)});
    await ansX('me','c3',{opt:2,at:Timestamp.fromMillis(Date.now()-1000)});
    await db.doc('campaignStats/c1').delete().catch(()=>{});
    const r=await E.pulseCore('me');
    check('Chiffres de la ville : 10 réponses de la semaine (6 voisins + 4 des miennes ; ni signalée à part, ni autre ville, ni ancienne)',r.available&&r.enough&&r.weekAnswers===10,r);
    check('… 2 commerces et 4 questions actifs dans MA ville (pas celle d\'Angers)',r.activeMerchants===2&&r.activeQuestions===4,r);
    check('… mes réponses de la semaine : 4',r.myWeekAnswers===4,r.myWeekAnswers);
    check('Aucun nom ni identifiant dans les chiffres de la ville',!/Voisin|Alex|s[1-7]"/.test(JSON.stringify(r)),Object.keys(r));
    // seuil : ville presque vide
    await mkUser('lonely',{name:'Seul',city:'angers'});await ansX('lonely','far',{city:'angers'});
    const r2=await E.pulseCore('lonely');
    check('Ville quasi vide : chiffres masqués (seuil), message de démarrage possible',r2.available&&!r2.enough&&r2.weekAnswers===null,r2);
    // « Comment la ville a répondu »
    const m=await E.myResultsCore('me');
    check('Résultats : mes questions à choix, la plus récente d\'abord ; la question texte est exclue',m.results.map(x=>x.campaignId).join()==='c3,c2,c1',m.results.map(x=>x.campaignId));
    const c1=m.results.find(x=>x.campaignId==='c1');
    check('Résultats c1 : répartition exacte (8 réponses : 4 Café / 2 Thé / 2 Chocolat = 50 / 25 / 25 %), ma réponse repérée',c1.n===8&&c1.options.map(o=>o.pct).join()==='50,25,25'&&c1.myIdx===0,c1);
    const c2=m.results.find(x=>x.campaignId==='c2');
    check('Résultats c2 : 1 seule réponse → sous le seuil, aucun pourcentage',c2.belowThreshold===true&&c2.options.every(o=>o.pct===undefined),c2);
    check('Résultats : jamais de nom ni d\'identifiant d\'autres habitants',!/Voisin|s[1-7]/.test(JSON.stringify(m)));
    // jalon de série
    await db.doc('users/me').update({authorizedMerchants:['m1','m2'],streak:6,lastAnswerDate:new Date(Date.now()-86400000).toLocaleDateString('sv-SE',{timeZone:'Europe/Paris'}),points:0});
    await db.doc('answers/me_c1_q0').delete();await db.doc('answers/me_c2_q0').delete();
    await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});
    const tok=(await (await fetch(AUTH3,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'me@t.fr',password:'secret123',returnSecureToken:true})})).json()).idToken;
    const call=async(name,data)=>{const x=await fetch('http://127.0.0.1:5001/noova-366d0/europe-west1/'+name,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify({data})});return x.json();};
    await call('beginQuestion',{campaignId:'c1',questionIdx:0});await sleep(3300);
    const sub=await call('submitAnswer',{campaignId:'c1',questionIdx:0,answerValue:'Café'});
    const evs=(await db.collection('communityEvents').where('userId','==','me').get()).docs.map(d=>d.data());
    const st=evs.find(e=>e.type==='streak');
    check('Série de 7 jours : jalon annoncé dans le fil (« est à 7 jours d\'affilée »)',sub.result&&sub.result.streak===7&&st&&/7 jours d'affilée/.test(st.text)&&st.likeCount===0,{streak:sub.result&&sub.result.streak,st});
    check('… et l\'événement habituel « a répondu » est créé aussi',evs.some(e=>e.type==='answer'));
    await db.doc('users/me').update({streak:4,lastAnswerDate:new Date(Date.now()-86400000).toLocaleDateString('sv-SE',{timeZone:'Europe/Paris'})});
    await db.doc('answers/me_c2_q0').delete().catch(()=>{});
    await call('beginQuestion',{campaignId:'c2',questionIdx:0});await sleep(3300);
    await call('submitAnswer',{campaignId:'c2',questionIdx:0,answerValue:'Thé'});
    const evs2=(await db.collection('communityEvents').where('userId','==','me').get()).docs.map(d=>d.data());
    check('Pas de jalon pour une série de 5 ou pour une 2e réponse du jour (un seul jalon)',evs2.filter(e=>e.type==='streak').length===1);
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
    const now=Date.now(),ev=(id,o)=>db.doc('communityEvents/'+id).set({type:'answer',userId:'f1',displayName:'Léa',city:'le-mans',text:'a répondu à une question de',brand:'Le Fournil',likeCount:0,commentCount:0,createdAt:Timestamp.fromMillis(now-5000),...o});
    await ev('a1',{createdAt:Timestamp.fromMillis(now-1000)});await ev('a2',{brand:'Café de la Place',createdAt:Timestamp.fromMillis(now-2000)});await ev('a3',{brand:'Studio Fit',createdAt:Timestamp.fromMillis(now-3000)});
    await ev('t1',{userId:'f2',displayName:'Tom',brand:'Le Fournil',createdAt:Timestamp.fromMillis(now-4000)});
    await ev('st1',{type:'streak',userId:'f1',brand:'',text:"est à 7 jours d'affilée",createdAt:Timestamp.fromMillis(now-500)});
    await ev('n1',{type:'merchant_post',userId:null,displayName:'Le Fournil',brand:'Le Fournil',text:'Suite à vos avis : ouverture dès 6h30.',createdAt:Timestamp.fromMillis(now-6000)});
    await ev('x1',{userId:'s1',displayName:'Inconnu1'});                        // un inconnu : ne doit jamais apparaître
    const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
    const p=await browser.newPage();PG=p;await p.setViewport({width:390,height:900,isMobile:true,hasTouch:true,deviceScaleFactor:2});const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user&&S.friends&&S.friends.length>=2,null,30000);
    await p.addStyleTag({content:'body>div[style*="emulator"]{display:none!important}'});
    await p.evaluate(()=>goNav('social'));
    await wf(p,()=>document.querySelectorAll('#feed-content .feed-post').length>=3&&document.querySelector('#community-pulse .cm-hero')&&document.querySelector('#community-results .cm-res'),null,25000);
    await sleep(600);
    const fd=await p.evaluate(()=>({cards:[...document.querySelectorAll('#feed-content .feed-post')].map(e=>({cls:e.className,txt:e.textContent.replace(/\s+/g,' ').trim()})),pulse:document.querySelector('#community-pulse').textContent.replace(/\s+/g,' '),res:document.querySelector('#community-results').textContent.replace(/\s+/g,' ')}));
    await p.screenshot({path:'/tmp/shots/cm_feed_new.png'});
    check('Fil : les 3 réponses de Léa le même jour = UNE carte « a répondu à 3 questions » avec les 3 commerces',fd.cards.some(c=>/Léa/.test(c.txt)&&/3 questions/.test(c.txt)&&/Le Fournil/.test(c.txt)&&/Café de la Place/.test(c.txt)&&/Studio Fit/.test(c.txt)),fd.cards.map(c=>c.txt));
    check('Fil : Tom (1 réponse) garde sa carte simple',fd.cards.some(c=>/Tom/.test(c.txt)&&/a répondu à une question de/.test(c.txt)));
    check('Fil : carte « jalon de série » distincte (7 jours d\'affilée)',fd.cards.some(c=>/cm-streak/.test(c.cls)&&/Léa/.test(c.txt)&&/est à 7 jours d'affilée/.test(c.txt)),fd.cards.map(c=>c.cls));
    check('Fil : actualité du commerce mise en avant (carte sombre « Actualité »)',fd.cards.some(c=>/cm-news/.test(c.cls)&&/Actualité/.test(c.txt)&&/6h30/.test(c.txt)));
    check('Fil : un inconnu n\'apparaît jamais',!fd.cards.some(c=>/Inconnu/.test(c.txt))&&!/Inconnu/.test(fd.pulse+fd.res),fd.cards.map(c=>c.txt));
    check('Chiffres de la ville affichés (7 réponses, 1 commerce, ta contribution)',/Le Mans cette semaine/.test(fd.pulse)&&/7\s*réponses de voisins/.test(fd.pulse)&&/1\s*commerce actif/.test(fd.pulse)&&/1\s*de toi/.test(fd.pulse),fd.pulse);
    check('« Comment la ville a répondu » : question, réponse majoritaire, ma réponse',/Quelle boisson/.test(fd.res)&&/Le Fournil/.test(fd.res)&&/%/.test(fd.res)&&/(comme la majorité|Toi :)/.test(fd.res),fd.res);
    await p.evaluate(()=>document.querySelector('#community-results .cm-res').click());
    check('Toucher une carte de résultats : toutes les options avec leur pourcentage',await p.evaluate(()=>document.querySelectorAll('#community-results .cm-res.open .cm-res-row').length===3));
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
