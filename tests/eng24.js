// Migration des données vers le nouveau système de points (scripts/migrate-points.js) : simulation sans écriture, puis application.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore();
const {Timestamp,FieldValue}=admin.firestore;
const {migrate}=require(__dirname+'/../scripts/migrate-points.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await sleep(300);}
(async()=>{
  await wipe();
  await db.doc('merchants/m1').set({role:'merchant',brandName:'Le Fournil',city:'le-mans',status:'verified'});
  await db.doc('merchants/m2').set({role:'merchant',brandName:'Le Bar',city:'le-mans',status:'verified'});
  const old=(id,o)=>db.doc('rewards/'+id).set({merchantId:'m1',merchantName:'Le Fournil',city:'le-mans',icon:'☕',valueEuros:1.5,stock:50,perUserLimit:1,purchaseCondition:'pour un plat',expiresAt:null,status:'approved',active:true,redeemedCount:3,createdAt:Timestamp.now(),...o});
  await old('oldA',{label:'Café offert',slot:1,cost:150});await old('oldB',{label:'Menu',slot:3,cost:800});await old('oldC',{label:'Dessert',cost:350});   // sans slot
  await db.doc('rewards/m2_p1').set({merchantId:'m2',merchantName:'Le Bar',city:'le-mans',tier:1,slot:1,cost:150,label:'Déjà migrée',priceConfirmed:true,monthlyQuota:5,timeSlots:[],withPurchase:false,minPurchase:null,status:'approved',active:true,approved:true,redeemedCount:0,createdAt:Timestamp.now(),updatedAt:Timestamp.now()});
  await db.doc('users/u1').set({role:'user',name:'A',city:'le-mans',points:100,xp:100});
  await db.doc('users/u2').set({role:'user',name:'B',city:'le-mans',points:10,xp:10,welcomeClaimed:false,lastActivityAt:Timestamp.fromMillis(Date.now()-400*86400000),answeredMerchants:['m9']});
  await db.doc('answers/a1').set({userId:'u1',merchantId:'m1',campaignId:'c1',pointsAwarded:10,flagged:false});
  await db.doc('answers/a2').set({userId:'u1',merchantId:'m1',campaignId:'c2',pointsAwarded:15,flagged:false});
  await db.doc('answers/a3').set({userId:'u1',merchantId:'m2',campaignId:'c3',pointsAwarded:0,flagged:true});
  await db.doc('redemptions/r1').set({userId:'u1',merchantId:'m1',cost:150,status:'used'});await db.doc('redemptions/r2').set({userId:'u1',merchantId:'m1',cost:300,status:'pending'});

  await db.doc('communityEvents/ea1').set({type:'answer',userId:'u1',displayName:'A',city:'le-mans',text:'a répondu',likeCount:0,commentCount:0,createdAt:Timestamp.now()});
  await db.doc('communityEvents/ea1/likes/u2').set({createdAt:Timestamp.now()});
  await db.doc('communityEvents/eb1').set({type:'merchant_post',userId:null,merchantId:'m1',city:'le-mans',text:'Nouveau',createdAt:Timestamp.now()});
  const logs=[];const log=(m)=>logs.push(m);
  const s0=await migrate(db,{apply:false,FieldValue,log});
  const ids0=(await db.collection('rewards').get()).docs.map(d=>d.id).sort().join();
  check('Simulation : annonce 3 récompenses à migrer mais n\'écrit RIEN (mêmes documents, habitants et commerçants inchangés, événement conservé)',s0.rewardsMoved===3&&s0.eventsDeleted===1&&(await db.doc('communityEvents/ea1').get()).exists&&ids0==='m2_p1,oldA,oldB,oldC'&&(await db.doc('users/u1').get()).data().welcomeClaimed===undefined&&(await db.doc('merchants/m1').get()).data().pointsGenerated===undefined,{s0,ids0});
  const s1=await migrate(db,{apply:true,FieldValue,log});
  const rw=Object.fromEntries((await db.collection('rewards').get()).docs.map(d=>[d.id,d.data()]));
  check('Récompenses : un document par palier {merchantId}_p{tier} (slot 1 → p1, slot 3 → p3, sans slot → 1er palier libre p2), anciens documents supprimés',Object.keys(rw).sort().join()==='m1_p1,m1_p2,m1_p3,m2_p1',Object.keys(rw));
  check('Coût = celui du palier (150 / 300 / 500), contenu conservé, anciens champs supprimés (valueEuros, stock, perUserLimit, purchaseCondition)',rw.m1_p1.cost===150&&rw.m1_p2.cost===300&&rw.m1_p3.cost===500&&rw.m1_p1.label==='Café offert'&&rw.m1_p3.label==='Menu'&&rw.m1_p2.label==='Dessert'&&!('valueEuros' in rw.m1_p1)&&!('stock' in rw.m1_p1)&&!('perUserLimit' in rw.m1_p1)&&!('purchaseCondition' in rw.m1_p1),rw.m1_p1);
  check('Elles repassent en attente (prix carte à confirmer par le commerçant, puis validation admin) ; compteur d\'échanges conservé ; quota repris du stock',rw.m1_p1.status==='pending'&&rw.m1_p1.active===false&&rw.m1_p1.approved===false&&rw.m1_p1.priceConfirmed===false&&rw.m1_p1.redeemedCount===3&&rw.m1_p1.monthlyQuota===50,rw.m1_p1);
  check('Un palier déjà migré n\'est pas touché',rw.m2_p1.status==='approved'&&rw.m2_p1.label==='Déjà migrée'&&rw.m2_p1.approved===true);
  const u1=(await db.doc('users/u1').get()).data(),u2=(await db.doc('users/u2').get()).data();
  check('Habitants : pas de bonus de bienvenue rétroactif (welcomeClaimed = true), solde inchangé, lastActivityAt = maintenant',u1.welcomeClaimed===true&&u1.points===100&&Math.abs(u1.lastActivityAt.toMillis()-Date.now())<60000,u1);
  check('answeredMerchants reconstitué depuis les réponses (m1 ; pas m2 : réponse signalée) ; valeur existante conservée',u1.answeredMerchants.join()==='m1'&&u2.answeredMerchants.join()==='m9'&&u2.welcomeClaimed===false,{u1:u1.answeredMerchants,u2});
  check('Un compte déjà suivi garde son lastActivityAt (aucun écrasement)',Math.abs(u2.lastActivityAt.toMillis()-(Date.now()-400*86400000))<60000,u2.lastActivityAt);
  const m1=(await db.doc('merchants/m1').get()).data();
  check('Commerçants : pointsGenerated = somme des points des réponses (25), pointsSpent = somme des bons émis (450)',m1.pointsGenerated===25&&m1.pointsSpent===450,m1);
  const evs=(await db.collection('communityEvents').get()).docs.map(d=>d.id);
  check('Fil : les anciens événements « a répondu » (et leurs j\'aime) sont supprimés, les actualités des commerces restent',evs.join()==='eb1'&&(await db.collection('communityEvents/ea1/likes').get()).empty,evs);
  const s2=await migrate(db,{apply:true,FieldValue,log});
  check('Relancer la migration est sans danger (idempotente : 0 récompense à migrer)',s2.rewardsMoved===0&&(await db.collection('rewards').get()).size===4,s2);
  console.log('\n'+pass+' ok, '+fail+' échec(s)');process.exit(fail?1:0);
})();
