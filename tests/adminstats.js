// Onglet « Statistiques » de l'admin : chiffres calculés par adminStats (agrégations) et rendu des graphiques.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const wf=(p,fn,arg,t=30000)=>p.waitForFunction(fn,{timeout:t,polling:200},arg);
const CHROME=(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const S=require(__dirname+'/../functions/adminStats.js')._t;
const {parisDay}=require(__dirname+'/../functions/lib.js');
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
(async()=>{
  await wipe();
  const now=Date.now(),DAY=86400000,today=parisDay(now),yest=parisDay(now-DAY);
  const ages=['18-24','25-34','25-34','35-49'],cities=['le-mans','le-mans','angers','paris','ailleurs'];
  for(let i=0;i<20;i++)await db.doc('users/u'+i).set({role:'user',name:'U'+i,city:cities[i%5],ageRange:ages[i%4],interests:i%2?['restauration','sport']:['commerce'],points:10*i,streak:i%8,pushEnabled:i<12,
    dailyAnswerDate:i<5?today:yest,lastAnswerDate:i<5?today:i<9?yest:'2020-01-01',createdAt:Timestamp.fromMillis(now-(i%10)*DAY)});
  await db.doc('merchants/m1').set({brandName:'Le Fournil',status:'verified'});await db.doc('merchants/m2').set({brandName:'Attente',status:'pending'});
  await db.doc('campaigns/c1').set({merchantId:'m1',merchantName:'Le Fournil',question:'Ta boisson ?',status:'active',answersCount:30,targetVolume:100,city:'le-mans'});
  await db.doc('campaigns/c2').set({merchantId:'m1',merchantName:'Le Fournil',question:'Tes horaires ?',status:'active',answersCount:12,targetVolume:50,city:'le-mans'});
  for(let i=0;i<15;i++)await db.doc('answers/a'+i).set({userId:'u'+i,campaignId:'c1',flagged:i===0,createdAt:Timestamp.fromMillis(now-(i%3)*DAY)});
  await db.doc('redemptions/r1').set({status:'used',createdAt:Timestamp.fromMillis(now)});await db.doc('redemptions/r2').set({status:'pending',createdAt:Timestamp.fromMillis(now-DAY)});
  await db.doc('notifMetrics/question_du_jour').set({sent:300,opened:30,deactivated:2});
  await db.doc('cities/le-mans').set({label:'Le Mans',active:true,count:20});await db.doc('cities/ailleurs').set({label:'Ailleurs',active:true,count:57});
  const s=await S.computeStats(now);
  check('Compteur d\'habitants des villes remis à la valeur réelle (il ne redescendait pas après une remise à zéro)',(await db.doc('cities/le-mans').get()).data().count===8&&(await db.doc('cities/ailleurs').get()).data().count===4&&s.cities.find(c=>c.slug==='ailleurs').users===4&&s.cities.find(c=>c.slug==='rennes').hub===true,{lm:(await db.doc('cities/le-mans').get()).data().count});
  check('Totaux : habitants, commerces, questions, réponses, bons',s.totals.users===20&&s.totals.merchantsVerified===1&&s.totals.merchantsPending===1&&s.totals.campaignsActive===2&&s.totals.answers===15&&s.totals.answersFlagged===1&&s.totals.redemptionsUsed===1&&s.totals.redemptionsPending===1,s.totals);
  check('Notifications activées, séries, points en circulation',s.totals.pushEnabled===12&&s.totals.streak3===11&&s.totals.streak7===2&&s.totals.pointsHeld===1900,s.totals);
  check('Actifs : aujourd\'hui, 7 jours, 30 jours',s.active.today===5&&s.active.week===9&&s.active.month===9,s.active);
  check('Séries sur 30 jours : la somme des inscriptions et des réponses est juste',s.series.days.length===30&&s.series.days[29]===today&&s.series.signups.reduce((a,b)=>a+b,0)===20&&s.series.answers.reduce((a,b)=>a+b,0)===15&&s.series.answers[29]===5,{su:s.series.signups.slice(-10),an:s.series.answers.slice(-3)});
  check('Villes, âges et centres d\'intérêt comptés',s.cities.find(c=>c.slug==='le-mans').users===8&&s.cities.find(c=>c.slug==='angers').users===4&&s.ages.find(a=>a.key==='25-34').users===10&&s.interests.find(i=>i.key==='restauration').users===10,{c:s.cities.slice(0,3),a:s.ages});
  check('Questions et commerces les plus répondus',s.topCampaigns[0].question==='Ta boisson ?'&&s.topMerchants[0].answers===42&&s.topMerchants[0].questions===2,{c:s.topCampaigns[0],m:s.topMerchants[0]});
  check('Notifications par type (envois, ouvertures, coupées)',s.notifications[0].type==='question_du_jour'&&s.notifications[0].opened===30&&s.notifications[0].disabled===2,s.notifications);
  // Admin : l'onglet s'affiche avec ses graphiques
  await aauth.createUser({uid:'adm',email:'tomussproduction@gmail.com',password:'secret123'});
  await aauth.createUser({uid:'nope',email:'u@t.fr',password:'secret123'});
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  for(const [w,h] of [[1280,900],[390,844]]){
    const p=await browser.newPage();await p.setViewport({width:w,height:h});const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.goto('http://localhost:8950/admin.html',{waitUntil:'load'});await sleep(1500);
    await p.evaluate(async()=>{await auth.signInWithEmailAndPassword('tomussproduction@gmail.com','secret123');});
    await wf(p,()=>document.getElementById('main').style.display!=='none');
    await p.evaluate(()=>{const b=[...document.querySelectorAll('.tab-btn-main')].find(x=>/Statistiques/.test(x.textContent));b.click();});
    await wf(p,()=>document.querySelectorAll('#st-root .st-kpi').length>=8,null,40000);
    const r=await p.evaluate(()=>({kpi:document.querySelector('#st-root .st-kpi-v').textContent,svg:document.querySelectorAll('#st-root svg').length,txt:document.getElementById('st-root').textContent,sw:document.documentElement.scrollWidth}));
    check(`${w}px : chiffres clés, graphiques et tableaux affichés`,r.kpi==='20'&&r.svg>=4&&/Ta boisson/.test(r.txt)&&/Le Fournil/.test(r.txt)&&!/undefined|NaN/.test(r.txt),{kpi:r.kpi,svg:r.svg,bad:(r.txt.match(/.{20}(undefined|NaN).{20}/)||[])[0]});
    check(`${w}px : pas de débordement horizontal`,r.sw<=w+1,r.sw);
    await p.setViewport({width:w,height:3200});await sleep(400);await p.screenshot({path:`/tmp/shots/adminstats_${w}.png`});
    check(`${w}px : aucune erreur JavaScript`,!errs.length,errs);
    await p.close();
  }
  // Un non-admin est refusé
  const p=await browser.newPage();await p.goto('http://localhost:8950/admin.html',{waitUntil:'load'});await sleep(1200);
  const denied=await p.evaluate(async()=>{await auth.signInWithEmailAndPassword('u@t.fr','secret123');try{await fx.httpsCallable('adminStats')({});return 'ok';}catch(e){return e.code;}});
  check('Un compte non admin ne peut pas lire les statistiques',/permission-denied/.test(denied),denied);
  await browser.close();
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
