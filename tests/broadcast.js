// Compte de diffusion NOOVA (questions envoyées à toutes les villes) et suppression des anciennes « questions NOOVA ».
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
const until=async(fn,t=20000)=>{const s=Date.now();while(Date.now()-s<t){if(await fn())return true;await sleep(300);}return false;};
const sink=async(uid)=>(await db.collection('_pushSink').where('uid','==',uid).get()).docs.map(d=>d.data());
// Écritures et lectures « comme l'app » (API REST de l'émulateur, règles Firestore appliquées)
const FS='http://127.0.0.1:8080/v1/projects/noova-366d0/databases/(default)/documents';
const val=v=>v===null?{nullValue:null}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?{integerValue:String(v)}:Array.isArray(v)?{arrayValue:{values:v.map(val)}}:typeof v==='object'?{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,val(x)]))}}:{stringValue:String(v)};
const fields=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,val(v)]));
const create=async(tok,col,id,o)=>(await fetch(`${FS}/${col}?documentId=${id}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify({fields:fields(o)})})).status;
const patch=async(tok,path,o)=>(await fetch(`${FS}/${path}?${Object.keys(o).map(k=>'updateMask.fieldPaths='+k).join('&')}`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify({fields:fields(o)})})).status;
const query=async(tok,cities)=>{const r=await fetch(`${FS}:runQuery`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify({structuredQuery:{from:[{collectionId:'campaigns'}],where:{compositeFilter:{op:'AND',filters:[{fieldFilter:{field:{fieldPath:'status'},op:'EQUAL',value:val('active')}},{fieldFilter:{field:{fieldPath:'targetCity'},op:'IN',value:val(cities)}}]}}}})});return {status:r.status,ids:r.status===200?(await r.json()).filter(x=>x.document).map(x=>x.document.name.split('/').pop()):[]};};
const Q={question:'Q ?',questions:[{q:'Q ?',format:'mcq',options:['Oui','Non']}],questionsSchema:2,format:'mcq',options:['Oui','Non'],answersCount:0,responsesCount:0,status:'active',archived:false};
const mkUser=async(uid,city,o={})=>{await db.doc('users/'+uid).set({role:'user',name:uid,email:uid+'@t.fr',city,authorizedMerchants:[],declinedMerchants:[],answeredCampaigns:[],interests:[],points:0,xp:0,noovs:0,streak:0,pushEnabled:true,fcmTokens:['tok_'+uid],onboardingStep:'done',welcomeClaimed:true,...o});await aauth.createUser({uid,email:uid+'@t.fr',password:'secret123'});};
(async()=>{
  await wipe();
  // ── Anciennes questions NOOVA : comptées puis supprimées (avec leurs réponses) depuis l'admin
  await aauth.createUser({uid:'adm',email:'tomussproduction@gmail.com',password:'secret123',emailVerified:true});
  const atok=await idTokenOf('tomussproduction@gmail.com');
  await db.doc('campaigns/old1').set({...Q,merchantId:null,merchantName:'NOOVA',postedByNoova:true,targetCity:'paris',city:'paris',createdAt:Timestamp.now()});
  await db.doc('campaigns/old2').set({...Q,merchantId:null,merchantName:'NOOVA',postedByNoova:true,targetCity:'le-mans',city:'le-mans',createdAt:Timestamp.now()});
  await db.doc('campaigns/keep').set({...Q,merchantId:'m1',merchantName:'Le Fournil',targetCity:'le-mans',city:'le-mans',createdAt:Timestamp.now()});
  await db.doc('answers/x_old1_q0').set({userId:'x',campaignId:'old1',questionIdx:0,answer:'Oui'});
  await db.doc('answers/x_keep_q0').set({userId:'x',campaignId:'keep',questionIdx:0,answer:'Oui'});
  let r=await call('adminNoovaQuestions',{},atok);
  check('Admin : compte les anciennes questions NOOVA',r.campaigns===2,r);
  r=await call('adminNoovaQuestions',{purge:true},atok);
  const left=(await db.collection('campaigns').get()).docs.map(d=>d.id),ans=(await db.collection('answers').get()).docs.map(d=>d.id);
  check('Admin : supprime toutes les questions NOOVA et leurs réponses, jamais celles des commerces',r.campaigns===2&&r.answers===1&&left.join()==='keep'&&ans.join()==='x_keep_q0',{r,left,ans});
  let denied=false;try{await call('adminNoovaQuestions',{purge:true},await (async()=>{await mkUser('lambda','le-mans');return idTokenOf('lambda@t.fr');})());}catch(e){denied=/administrateurs/.test(e.message);}
  check('Suppression réservée aux admins',denied);
  let gone=false;try{await call('adminCreateNoovaCampaign',{question:'Une question ?',cities:['le-mans']},atok);}catch(e){gone=true;}
  check('Plus de « poser une question NOOVA » depuis l\'admin',gone);

  // ── Compte de diffusion
  await wipe();
  for(const [id,city,bc] of [['nv','le-mans',true],['m2','angers',false]]){
    await db.doc('merchants/'+id).set({brandName:id==='nv'?'NOOVA':'Salon Belle',name:id,sector:'Commerce',city,status:'verified',ownerUid:id,cashierAck:true,...(bc?{broadcast:true}:{})});
    await aauth.createUser({uid:id,email:id+'@shop.fr',password:'secret123'});
  }
  const ntok=await idTokenOf('nv@shop.fr'),mtok=await idTokenOf('m2@shop.fr');
  await mkUser('pa','paris');await mkUser('lm','le-mans');await mkUser('an','angers');
  check('Règles : un commerçant ne peut pas s\'activer la diffusion lui-même',await patch(mtok,'merchants/m2',{broadcast:true})===403);
  check('Règles : un commerçant normal ne peut pas viser toutes les villes',await create(mtok,'campaigns','bad',{...Q,merchantId:'m2',merchantName:'Salon Belle',targetCity:'toutes',city:'toutes',broadcast:true})===403);
  check('Règles : le compte de diffusion pose une question pour toutes les villes (sans vitrine récompenses)',await create(ntok,'campaigns','bc1',{...Q,merchantId:'nv',merchantName:'NOOVA',targetCity:'toutes',city:'toutes',cityLabel:'Toutes les villes',broadcast:true})===200);
  const ok=await until(async()=>(await sink('pa')).length&&(await sink('an')).length&&(await sink('lm')).length);
  const sp=await sink('pa');
  check('Notification immédiate à tous les habitants, toutes villes confondues, sans suivre le compte',ok&&sp[0].ntype==='question_suivi'&&sp[0].title==='NOOVA vient de poser une question',sp.map(x=>[x.ntype,x.title]));
  const ptok=await idTokenOf('pa@t.fr');
  const qr=await query(ptok,['paris','toutes']);
  check('Règles : un habitant de Paris voit la question (requête de l\'app : sa ville + « toutes »)',qr.status===200&&qr.ids.includes('bc1'),qr);
  await call('beginQuestion',{campaignId:'bc1',questionIdx:0},ptok);await sleep(2700);
  const res=await call('submitAnswer',{campaignId:'bc1',questionIdx:0,answerValue:'Oui'},ptok);
  check('Un habitant de Paris peut répondre : uniquement des NOOVS, sans points, hors des 3 réponses du jour',res.pointsAwarded===0&&res.noovsAwarded===CFG.NOOVS.PER_NOOVA_QUESTION&&res.answersToday===0,res);
  const a=(await db.doc('answers/pa_bc1_q0').get()).data()||{};
  check('La réponse arrive dans le compte (merchantId) : réponses et résultats visibles dans son dashboard',a.merchantId==='nv'&&(await db.doc('campaigns/bc1').get()).data().answersCount===1,a);
  // Fausse diffusion (écrite hors règles) : refusée par le serveur, aucune notification
  await db.doc('campaigns/fake').set({...Q,merchantId:'m2',merchantName:'Salon Belle',targetCity:'toutes',city:'toutes',broadcast:true,createdAt:Timestamp.now()});
  await sleep(3000);
  check('Question « toutes les villes » d\'un commerce sans diffusion : aucune notification',!(await sink('pa')).some(x=>/Salon/.test(x.title)));
  let refused=false;try{await call('beginQuestion',{campaignId:'fake',questionIdx:0},ptok);await sleep(2700);await call('submitAnswer',{campaignId:'fake',questionIdx:0,answerValue:'Oui'},ptok);}catch(e){refused=/ville/.test(e.message);}
  check('… et réponse refusée par le serveur',refused);
  const est=await call('estimateCampaign',{questions:1},ntok);
  check('Dashboard NOOVA : estimation sur tous les habitants, sans ville',est.cityLabel==='Toutes les villes'&&est.totalUsers===3,est);
  const NT=require(__dirname+'/../functions/notifications.js')._t;
  const bcCamp={id:'bcx',merchantId:'nv',broadcast:true,targetCity:'toutes',createdAt:Timestamp.now()};
  check('Compte NOOVA suivi d\'office : même « écarté » par un habitant, sa question lui reste proposée',NT.availableFor({declinedMerchants:['nv'],authorizedMerchants:[]},[bcCamp]).length===1);
  // Diagnostic admin : question lancée avant d'activer la diffusion (elle ne vise que la ville du compte)
  await db.doc('campaigns/pre').set({...Q,merchantId:'nv',merchantName:'NOOVA',name:'Avant activation',targetCity:'le-mans',city:'le-mans',cityLabel:'Le Mans',createdAt:Timestamp.now()});
  const N=require(__dirname+'/../functions/notifications.js')._t;
  const dg=await N.notifDiagCore({email:'pa@t.fr'});
  check('Diagnostic : compte NOOVA en diffusion et question lancée avant l\'activation signalée',dg.noova.accounts.join()==='NOOVA'&&dg.problems.some(p=>/avant d'activer la diffusion/.test(p)&&/Le Mans/.test(p)),{noova:dg.noova,problems:dg.problems});
  check('Le compte de diffusion peut supprimer sa question',(await fetch(`${FS}/campaigns/bc1`,{method:'DELETE',headers:{Authorization:'Bearer '+ntok}})).status===200);
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
