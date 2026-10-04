// Toute question posée par NOOVA rapporte des NOOVS (en plus des points du jour, hors plafond) ; la question de la
// semaine aussi, une seule fois par question.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const CFG=require(__dirname+'/../functions/engagementConfig.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
const AUTH='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake';
const idTokenOf=async(email)=>(await (await fetch(AUTH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'secret123',returnSecureToken:true})})).json()).idToken;
const call=async(name,data,token)=>{const r=await fetch('http://127.0.0.1:5001/noova-366d0/europe-west1/'+name,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({data})});const j=await r.json();if(j.error)throw new Error(j.error.message);return j.result;};
const camp=(id,o)=>db.doc('campaigns/'+id).set({status:'active',targetCity:'le-mans',city:'le-mans',question:'Q ?',questions:[{q:'Q ?',format:'mcq',options:['Oui','Non']}],targetVolume:1000,answersCount:0,createdAt:Timestamp.now(),...o});
(async()=>{
  await wipe();
  const N=CFG.NOOVS.PER_NOOVA_QUESTION;
  await db.doc('merchants/m1').set({brandName:'Le Fournil',name:'Le Fournil',status:'verified',city:'le-mans'});
  for(let i=0;i<5;i++)await camp('m'+i,{merchantId:'m1',merchantName:'Le Fournil'});
  for(let i=0;i<3;i++)await camp('n'+i,{merchantId:null,merchantName:'NOOVA',postedByNoova:true});
  await db.doc('users/u').set({role:'user',name:'U',email:'u@t.fr',city:'le-mans',authorizedMerchants:['m1'],answeredCampaigns:[],points:0,xp:0,noovs:0,streak:0,interests:[],onboardingStep:'done',welcomeClaimed:true});
  await aauth.createUser({uid:'u',email:'u@t.fr',password:'secret123'});
  const tok=await idTokenOf('u@t.fr');
  const answer=async(id)=>{await call('beginQuestion',{campaignId:id,questionIdx:0},tok);await sleep(2700);return call('submitAnswer',{campaignId:id,questionIdx:0,answerValue:'Oui'},tok);};
  const r1=await answer('n0');
  check('Question NOOVA (1re du jour) : les points du jour ET des NOOVS',r1.pointsAwarded>0&&r1.noovsAwarded===N,{p:r1.pointsAwarded,n:r1.noovsAwarded});
  await answer('m0');await answer('m1');
  const r4=await answer('m2');
  check('Question d\'un commerce au-delà des 3 du jour : 1 NOOV (règle normale inchangée)',r4.pointsAwarded===0&&r4.noovsAwarded===CFG.POINTS.NOOVS_PER_ANSWER,{p:r4.pointsAwarded,n:r4.noovsAwarded});
  await db.doc('users/u').update({dailyNoovs:CFG.NOOVS.DAILY_CAP,dailyNoovsDate:(await db.doc('users/u').get()).data().dailyNoovsDate});
  const r5=await answer('m3');
  check('Commerce, plafond de NOOVS du jour atteint : rien (règle normale inchangée)',r5.noovsAwarded===0&&r5.noovsWithheld==='cap',r5.noovsWithheld);
  const r6=await answer('n1');
  check('Question NOOVA : des NOOVS quand même, hors plafond du jour',r6.noovsAwarded===N&&!r6.noovsWithheld,{n:r6.noovsAwarded,w:r6.noovsWithheld});
  const before=(await db.doc('users/u').get()).data().noovs;
  // Question de la semaine (NOOVA) : NOOVS au vote, une seule fois
  await db.doc('weeklyQuestions/w1').set({active:true,city:'le-mans',text:'Pizza ananas ?',options:['Oui','Non'],createdAt:Timestamp.now()});
  await db.doc('weeklyQuestions/w1/votes/u').set({optionIndex:0,createdAt:Timestamp.now()});
  let after=before;for(let i=0;i<40&&after===before;i++){await sleep(300);after=(await db.doc('users/u').get()).data().noovs;}
  check('Question de la semaine : des NOOVS au vote',after===before+N,{before,after});
  await sleep(1500);
  check('Question de la semaine : une seule fois par question',(await db.doc('users/u').get()).data().noovs===before+N&&(await db.doc('users/u').get()).data().weeklyNoovs.includes('w1'));
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
