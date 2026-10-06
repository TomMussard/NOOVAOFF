// Ouverture automatique d'une zone : un habitant dans une commune à plus de 25 km de toute zone ouvre une nouvelle zone
// (5 commerces test et leurs questions) ; une commune à moins de 25 km d'une zone y est rattachée ; une commune
// inconnue ne crée rien. Le géocodage est simulé (documents _testGeocode), sans accès réseau.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const until=async(fn,t=30000)=>{const s=Date.now();while(Date.now()-s<t){if(await fn())return true;await sleep(400);}return false;};
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await sleep(300);}
const HUBS={'le mans':[48.0061,0.1996],'angers':[47.4784,-0.5632],'paris':[48.8566,2.3522],'nantes':[47.2184,-1.5536],'bordeaux':[44.8378,-0.5792],'marseille':[43.2965,5.3698],'toulouse':[43.6047,1.4442],'lille':[50.6292,3.0573],'dijon':[47.322,5.0415],'rennes':[48.1173,-1.6778]};
(async()=>{
  await wipe();
  for(const [k,[lat,lng]] of Object.entries(HUBS))await db.doc('_testGeocode/'+k).set({lat,lng});
  await db.doc('_testGeocode/brest').set({lat:48.3904,lng:-4.4861});
  await db.doc('_testGeocode/plouzané').set({lat:48.3833,lng:-4.6167});     // à ~10 km de Brest
  const user=(uid,city,label)=>db.doc('users/'+uid).set({role:'user',name:uid,city,cityLabel:label,points:0,xp:0,streak:0});
  await user('b1','brest','Brest');
  const ok=await until(async()=>(await db.collection('merchants').where('city','==','brest').get()).size===5);
  const ms=(await db.collection('merchants').where('city','==','brest').get()).docs.map(d=>d.data());
  check('Brest (à plus de 25 km de toute zone) : nouvelle zone avec 5 commerces test vérifiés',ok&&ms.every(m=>m.isTest&&m.status==='verified'&&m.cityLabel==='Brest'),ms.map(m=>m.brandName));
  check('… un de chaque métier (café, coiffeur, fleuriste, supérette, bar)',['Café','Coiffeur','Fleuriste','Supérette','Bar'].every(s=>ms.some(m=>m.sector===s)));
  const qs=await until(async()=>(await db.collection('campaigns').where('targetCity','==','brest').where('status','==','active').get()).size===5);
  check('… et une question active par commerce, tout de suite',qs);
  check('… avec leurs 5 paliers de récompenses',(await db.collection('rewards').where('city','==','brest').get()).size===25);
  check('Zone enregistrée et ville ouverte',(await db.doc('zones/brest').get()).exists&&(await db.doc('cities/brest').get()).data().active===true);
  await user('b2','brest','Brest');await sleep(3000);
  check('Deuxième habitant de Brest : aucun commerce en double',(await db.collection('merchants').where('city','==','brest').get()).size===5);
  await user('p1','plouzane','Plouzané');
  const att=await until(async()=>(await db.doc('users/p1').get()).data().city==='brest');
  check('Plouzané (à 10 km de Brest) : rattaché à la zone de Brest, nom de commune gardé',att&&(await db.doc('users/p1').get()).data().cityLabel==='Plouzané');
  check('… sans créer de nouvelle zone',!(await db.doc('zones/plouzane').get()).exists&&(await db.collection('merchants').where('city','==','plouzane').get()).size===0);
  await user('x1','nullepart','Nullepart');await sleep(4000);
  check('Commune inconnue : aucune zone ni commerce créés',!(await db.doc('zones/nullepart').get()).exists&&(await db.collection('merchants').where('city','==','nullepart').get()).size===0);
  await user('l1','le-mans','Le Mans');await sleep(2000);
  check('Ville déjà NOOVA (Le Mans) : rien de créé',(await db.collection('merchants').where('city','==','le-mans').get()).size===0&&!(await db.doc('zones/le-mans').get()).exists);
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
