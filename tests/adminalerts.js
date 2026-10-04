// Alertes e-mail de l'équipe : nouveau commerce, retour testeur, résumé du soir, réglages et e-mail test.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const A=require(__dirname+'/../functions/adminAlerts.js')._t;
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
const AUTH='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake';
const idTokenOf=async(email)=>(await (await fetch(AUTH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'secret123',returnSecureToken:true})})).json()).idToken;
const call=async(name,data,token)=>{const r=await fetch('http://127.0.0.1:5001/noova-366d0/europe-west1/'+name,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({data})});const j=await r.json();return j.error?{error:j.error.status}:j.result;};
const mails=async()=>(await db.collection('mail').get()).docs.map(d=>({id:d.id,...d.data()}));
const until=async(fn,t=15000)=>{const s=Date.now();while(Date.now()-s<t){if(await fn())return true;await sleep(300);}return false;};
(async()=>{
  await wipe();
  // Déclencheurs réels (émulateur Functions)
  await db.doc('merchants/real1').set({brandName:'Boulangerie Dupont',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',email:'dupont@shop.fr',firstName:'Jean',lastName:'Dupont',siret:'73282932000074',status:'pending'});
  await db.doc('merchants/test_le-mans_cafe').set({brandName:'Café test',isTest:true,status:'verified'});
  const okM=await until(async()=>(await mails()).some(m=>m.id==='alert_merchant_real1'));
  const ms=await mails();const m=ms.find(x=>x.id==='alert_merchant_real1')||{};
  check('Nouveau commerce : e-mail aux admins avec nom, ville, contact, SIRET et lien de validation',okM&&m.to.includes('tomussproduction@gmail.com')&&/Boulangerie Dupont/.test(m.message.subject)&&/Le Mans/.test(m.message.text)&&/73282932000074/.test(m.message.text)&&/Valider dans l'admin/.test(m.message.text),m.message&&m.message.subject);
  await sleep(1500);
  check('Commerce fictif du mois de test : aucune alerte',!(await mails()).some(x=>x.id.includes('test_le-mans_cafe')));
  await db.doc('feedback/f1').set({uid:'u',name:'Camille',city:'le-mans',rating:2,likes:['design'],dislikes:['notifications'],kind:'bug',text:'Le bouton <b>ne marche pas</b>',platform:'iphone',standalone:true,status:'nouveau',createdAt:Timestamp.now()});
  const okF=await until(async()=>(await mails()).some(x=>x.id==='alert_feedback_f1'));
  const f=(await mails()).find(x=>x.id==='alert_feedback_f1')||{message:{}};
  check('Retour testeur : « Bug signalé », note, texte (échappé), appareil',okF&&/Bug signalé : Camille \(2\/5\)/.test(f.message.subject)&&/&lt;b&gt;ne marche pas/.test(f.message.html)&&/iphone/.test(f.message.text),f.message.subject);
  // Résumé du soir
  for(let i=0;i<3;i++)await db.doc('users/u'+i).set({role:'user',city:'le-mans',createdAt:Timestamp.now(),dailyAnswerDate:require(__dirname+'/../functions/lib.js').parisDay(Date.now()),lastAnswerDate:require(__dirname+'/../functions/lib.js').parisDay(Date.now())});
  const d=await A.digestCore(Date.now());
  const dg=(await mails()).find(x=>x.id.startsWith('alert_digest_'))||{message:{}};
  check('Résumé du soir : inscriptions, actifs, réponses, commerces en attente, retours à traiter',d.sent&&/3 inscriptions/.test(dg.message.subject)&&/1 en attente de validation/.test(dg.message.text)&&/Retours à traiter : 1/.test(dg.message.text),dg.message.subject);
  await A.digestCore(Date.now());
  check('Résumé : un seul par jour (id déterministe)',(await mails()).filter(x=>x.id.startsWith('alert_digest_')).length===1);
  // Réglages (callable admin)
  await aauth.createUser({uid:'adm',email:'tomussproduction@gmail.com',password:'secret123'});await aauth.createUser({uid:'u9',email:'u9@t.fr',password:'secret123'});
  const tok=await idTokenOf('tomussproduction@gmail.com'),utok=await idTokenOf('u9@t.fr');
  check('Réglages : refusés à un non-admin',(await call('adminAlerts',{},utok)).error==='PERMISSION_DENIED');
  const bad=await call('adminAlerts',{action:'save',to:['pas-une-adresse']},tok);
  check('Réglages : adresse invalide refusée',bad.error==='INVALID_ARGUMENT',bad);
  const sv=await call('adminAlerts',{action:'save',to:['tom@noova.fr','autre@noova.fr'],merchant:true,feedback:false,digest:true},tok);
  check('Réglages : adresses et types enregistrés',sv.to.join()==='tom@noova.fr,autre@noova.fr'&&sv.feedback===false,sv);
  await db.doc('feedback/f2').set({uid:'u',name:'Léa',kind:'idee',text:'x',rating:4,likes:[],dislikes:[],status:'nouveau',createdAt:Timestamp.now()});
  await sleep(3000);
  check('Alerte « retour » coupée : plus d\'e-mail pour un nouveau retour',!(await mails()).some(x=>x.id==='alert_feedback_f2'));
  const t=await call('adminAlerts',{action:'test'},tok);
  const tm=(await db.doc('mail/'+t.id).get()).data();
  check('E-mail test : déposé pour les nouvelles adresses',tm&&tm.to.join()==='tom@noova.fr,autre@noova.fr'&&/Test des alertes/.test(tm.message.subject),t);
  const st=await call('adminAlerts',{action:'status',id:t.id},tok);
  check('Statut : sans extension, l\'e-mail existe mais n\'a pas d\'état de livraison',st.exists===true&&st.state===null,st);
  await db.doc('mail/'+t.id).update({delivery:{state:'SUCCESS'}});
  check('Statut : lit l\'état écrit par l\'extension',(await call('adminAlerts',{action:'status',id:t.id},tok)).state==='SUCCESS');
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
