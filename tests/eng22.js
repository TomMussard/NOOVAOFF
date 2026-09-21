// Règles Firestore du système de points, testées pour de vrai (requêtes REST avec un jeton d'authentification de l'émulateur) :
// 5 paliers par commerçant au coût imposé, « approved » réservé à l'admin, pause / reprise, solde jamais écrit par le client,
// échanges créés par le serveur seul, campagne exigeant les 5 paliers. Vérifie aussi que TIERS est identique partout.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const fs=require('fs'),path=require('path'),vm=require('vm');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const TIERS=require(__dirname+'/../functions/tiers.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,3).join(' | '));}};
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
const AUTH='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake';
const idTokenOf=async(email)=>(await (await fetch(AUTH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'secret123',returnSecureToken:true})})).json()).idToken;
const ROOT='http://127.0.0.1:8080/v1/projects/noova-366d0/databases/(default)/documents';
// JS → valeurs typées de l'API REST Firestore
const tv=v=>v===null?{nullValue:null}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?(Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v}):typeof v==='string'?{stringValue:v}:Array.isArray(v)?{arrayValue:{values:v.map(tv)}}:v instanceof Date?{timestampValue:v.toISOString()}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,tv(x)]))}};
const fields=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,tv(v)]));
const H=t=>({'Content-Type':'application/json',Authorization:'Bearer '+t});
const create=async(t,col,id,o)=>(await fetch(`${ROOT}/${col}?documentId=${encodeURIComponent(id)}`,{method:'POST',headers:H(t),body:JSON.stringify({fields:fields(o)})})).status;
const patch=async(t,pathDoc,o)=>(await fetch(`${ROOT}/${pathDoc}?`+Object.keys(o).map(k=>'updateMask.fieldPaths='+encodeURIComponent(k)).join('&')+'&currentDocument.exists=true',{method:'PATCH',headers:H(t),body:JSON.stringify({fields:fields(o)})})).status;
const del=async(t,pathDoc)=>(await fetch(`${ROOT}/${pathDoc}`,{method:'DELETE',headers:H(t)})).status;
const get=async(t,pathDoc)=>(await fetch(`${ROOT}/${pathDoc}`,{headers:H(t)})).status;
const ok=s=>s===200,no=s=>s===403;
const now=()=>new Date();
const reward=(mid,tier,o={})=>({merchantId:mid,merchantName:'Commerce '+mid,city:'le-mans',tier,slot:tier,cost:(TIERS[tier-1]||{pts:2000}).pts,label:'Café offert',icon:'☕',priceConfirmed:true,monthlyQuota:20,timeSlots:[],withPurchase:false,minPurchase:null,status:'pending',active:false,approved:false,redeemedCount:0,createdAt:now(),updatedAt:now(),...o});

(async()=>{
  await T('TIERS identique partout',async()=>{
    const a=fs.readFileSync(path.join(__dirname,'../tiers.js'),'utf8'),b=fs.readFileSync(path.join(__dirname,'../functions/tiers.js'),'utf8');
    check('tiers.js (site) et functions/tiers.js (serveur) sont identiques octet pour octet',a===b);
    const w={};vm.runInNewContext(a,{window:w});
    check('Dans le navigateur, window.NOOVA_TIERS = TIERS',JSON.stringify(w.NOOVA_TIERS)===JSON.stringify(TIERS));
    const rules=fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8');
    const ev=(name)=>{const m=new RegExp('function '+name+'\\(t\\) \\{ return (.*?); \\}').exec(rules);if(!m)return null;const src=m[1];return [1,2,3,4,5].map(t=>eval(src.replace(/\bt\b/g,String(t))));};
    check('Les règles Firestore répètent exactement les points des paliers (tierPts)',JSON.stringify(ev('tierPts'))===JSON.stringify(TIERS.map(t=>t.pts)),ev('tierPts'));
    check('… et les prix carte maximum (tierMax)',JSON.stringify(ev('tierMax'))===JSON.stringify(TIERS.map(t=>t.max)),ev('tierMax'));
  });

  await wipe();
  const mkAuth=async(uid,email)=>aauth.createUser({uid,email,password:'secret123'});
  await db.doc('merchants/m1').set({role:'merchant',ownerUid:'m1',brandName:'Le Fournil',city:'le-mans',status:'verified',email:'m1@s.fr'});
  await db.doc('merchants/m2').set({role:'merchant',ownerUid:'m2',brandName:'Studio Fit',city:'le-mans',status:'verified',email:'m2@s.fr'});
  await db.doc('users/u1').set({role:'user',name:'Alex',city:'le-mans',points:500,xp:500,welcomeClaimed:true,friendUids:[]});
  await mkAuth('m1','m1@s.fr');await mkAuth('m2','m2@s.fr');await mkAuth('u1','u1@t.fr');await mkAuth('adm','tomussproduction@gmail.com');await mkAuth('nu','nu@t.fr');
  const [M1,M2,U1,ADM,NU]=await Promise.all(['m1@s.fr','m2@s.fr','u1@t.fr','tomussproduction@gmail.com','nu@t.fr'].map(idTokenOf));

  await T('création des paliers',async()=>{
    check('Palier 1 valide (coût = 150, prix confirmé, quota) : accepté',ok(await create(M1,'rewards','m1_p1',reward('m1',1))));
    check('Identifiant libre (pas {merchantId}_p{tier}) : refusé',no(await create(M1,'rewards','abc',reward('m1',2))));
    check('Palier 6 : refusé',no(await create(M1,'rewards','m1_p6',reward('m1',6,{cost:2000}))));
    check('Coût différent du palier (999 au lieu de 300) : refusé',no(await create(M1,'rewards','m1_p2',reward('m1',2,{cost:999}))));
    check('Coût du palier 1 sur le palier 2 (150 au lieu de 300) : refusé',no(await create(M1,'rewards','m1_p2',reward('m1',2,{cost:150}))));
    check('Prix carte non confirmé : refusé',no(await create(M1,'rewards','m1_p2',reward('m1',2,{priceConfirmed:false}))));
    check('Créée déjà approuvée / active / approved : refusé (trois variantes)',no(await create(M1,'rewards','m1_p2',reward('m1',2,{status:'approved'})))&&no(await create(M1,'rewards','m1_p2',reward('m1',2,{active:true})))&&no(await create(M1,'rewards','m1_p2',reward('m1',2,{approved:true}))));
    check('Quota mensuel 0, 1001 ou décimal : refusé',no(await create(M1,'rewards','m1_p2',reward('m1',2,{monthlyQuota:0})))&&no(await create(M1,'rewards','m1_p2',reward('m1',2,{monthlyQuota:1001})))&&no(await create(M1,'rewards','m1_p2',reward('m1',2,{monthlyQuota:2.5}))));
    check('4 créneaux horaires : refusé (3 au maximum)',no(await create(M1,'rewards','m1_p2',reward('m1',2,{timeSlots:[{},{},{},{}]}))));
    check('« Avec achat » : achat minimum de 13 € au palier 2 (max 2 × 6 = 12) refusé, 12 € accepté',no(await create(M1,'rewards','m1_p2',reward('m1',2,{withPurchase:true,minPurchase:13})))&&ok(await create(M1,'rewards','m1_p2',reward('m1',2,{withPurchase:true,minPurchase:12}))));
    check('« Sans achat » avec un montant minimum : refusé',no(await create(M1,'rewards','m1_p3',reward('m1',3,{withPurchase:false,minPurchase:5}))));
    check('Champ inconnu (valueEuros : ancien modèle) : refusé',no(await create(M1,'rewards','m1_p3',reward('m1',3,{valueEuros:5}))));
    check('Un autre commerçant ne peut pas écrire dans MES paliers (m2 → m1_p3)',no(await create(M2,'rewards','m1_p3',reward('m1',3))));
    check('Un habitant ne peut pas créer de récompense',no(await create(U1,'rewards','u1_p1',reward('u1',1))));
    for(const t of [3,4,5])check('Paliers '+t+' créés',ok(await create(M1,'rewards','m1_p'+t,reward('m1',t))));
  });

  await T('modification et approbation',async()=>{
    check('Le commerçant ne peut pas s\'approuver (approved: true)',no(await patch(M1,'rewards/m1_p1',{approved:true})));
    check('… ni passer en « approved » / actif',no(await patch(M1,'rewards/m1_p1',{status:'approved',active:true})));
    check('… ni changer le coût, le palier ou le compteur d\'échanges',no(await patch(M1,'rewards/m1_p1',{cost:1}))&&no(await patch(M1,'rewards/m1_p1',{tier:5}))&&no(await patch(M1,'rewards/m1_p1',{redeemedCount:99})));
    check('Réglages (quota) modifiables sans nouvelle validation',ok(await patch(M1,'rewards/m1_p1',{monthlyQuota:40,updatedAt:now()})));
    check('Changer l\'intitulé en repassant en « pending » : accepté',ok(await patch(M1,'rewards/m1_p1',{label:'Cookie offert',status:'pending',active:false})));
    check('L\'admin ne peut pas approuver un palier dont le coût n\'est pas celui du palier',ok(await patch(ADM,'rewards/m1_p5',{cost:1}))&&no(await patch(ADM,'rewards/m1_p5',{approved:true,status:'approved',active:true}))&&ok(await patch(ADM,'rewards/m1_p5',{cost:1500})));
    check('L\'admin approuve (approved + status + active + approvedAt)',ok(await patch(ADM,'rewards/m1_p1',{approved:true,status:'approved',active:true,approvedAt:now()})));
    check('Approuvée : le commerçant peut modifier ses réglages et mettre en pause',ok(await patch(M1,'rewards/m1_p1',{status:'paused',active:false,updatedAt:now()})));
    check('… et reprendre (paused → approved, active = true)',ok(await patch(M1,'rewards/m1_p1',{status:'approved',active:true})));
    check('Pause incohérente (paused mais active = true) : refusée',no(await patch(M1,'rewards/m1_p1',{status:'paused',active:true})));
    check('Nouvel intitulé sur une récompense approuvée : repasse obligatoirement en attente (sinon refusé)',no(await patch(M1,'rewards/m1_p1',{label:'Autre chose'}))&&ok(await patch(M1,'rewards/m1_p1',{label:'Autre chose',status:'pending',active:false})));
    check('Une récompense repassée en attente ne peut pas être « reprise » par le commerçant (pending → approved)',no(await patch(M1,'rewards/m1_p1',{status:'approved',active:true})));
    // paused sans approbation préalable : ne peut pas être repris
    await db.doc('rewards/m1_p4').update({status:'paused',active:false,approved:false});
    check('Une pause posée sans approbation préalable ne peut pas être reprise par le commerçant',no(await patch(M1,'rewards/m1_p4',{status:'approved',active:true})));
    check('Le commerçant ne peut pas supprimer un palier (les 5 doivent exister) ; l\'admin le peut',no(await del(M1,'rewards/m1_p3'))&&ok(await del(ADM,'rewards/m1_p3')));
    await db.doc('rewards/m1_p3').set(reward('m1',3));
    check('Lecture : un habitant ne voit pas une récompense en attente',no(await get(U1,'rewards/m1_p3')));
    await db.doc('rewards/m1_p3').update({status:'approved',active:true,approved:true});
    check('… mais voit une récompense active de sa ville',ok(await get(U1,'rewards/m1_p3')));
  });

  await T('solde et compteurs',async()=>{
    check('Un habitant ne peut ni créditer, ni débiter ses points directement (les échanges passent par le serveur)',no(await patch(U1,'users/u1',{points:5000}))&&no(await patch(U1,'users/u1',{points:100}))&&no(await patch(U1,'users/u1',{points:-10})));
    check('… ni toucher xp, welcomeClaimed, lastActivityAt, answeredMerchants, discoveryBonusDate',no(await patch(U1,'users/u1',{xp:9999}))&&no(await patch(U1,'users/u1',{welcomeClaimed:false}))&&no(await patch(U1,'users/u1',{lastActivityAt:now()}))&&no(await patch(U1,'users/u1',{answeredMerchants:[]}))&&no(await patch(U1,'users/u1',{discoveryBonusDate:'2020-01-01'})));
    check('Il peut toujours modifier son profil (nom)',ok(await patch(U1,'users/u1',{name:'Alexandre'})));
    check('Inscription : avec 50 points de départ ou welcomeClaimed = true : refusé',no(await create(NU,'users','nu',{role:'user',name:'N',points:50,xp:0,noovs:0}))&&no(await create(NU,'users','nu',{role:'user',name:'N',points:0,xp:0,noovs:0,welcomeClaimed:true})));
    check('Inscription à zéro : acceptée',ok(await create(NU,'users','nu',{role:'user',name:'N',points:0,xp:0,noovs:0,welcomeClaimed:false})));
    check('Un commerçant ne peut pas écrire pointsGenerated / pointsSpent sur son compte',no(await patch(M1,'merchants/m1',{pointsGenerated:99999}))&&no(await patch(M1,'merchants/m1',{pointsSpent:1}))&&ok(await patch(M1,'merchants/m1',{brandName:'Le Fournil 2'})));
  });

  await T('bons (redemptions)',async()=>{
    const rd={userId:'u1',rewardId:'m1_p3',merchantId:'m1',cost:500,label:'x',code:'ABCD',status:'pending',createdAt:now(),expiresAt:new Date(Date.now()+86400000),usedAt:null};
    check('Un habitant ne peut plus créer un bon lui-même (ni gratuit ni débité)',no(await create(U1,'redemptions','r1',rd)));
    await db.doc('redemptions/r1').set({...rd,createdAt:Timestamp.now(),expiresAt:Timestamp.fromMillis(Date.now()+86400000)});
    await db.doc('redemptions/r2').set({...rd,code:'WXYZ',createdAt:Timestamp.now(),expiresAt:Timestamp.fromMillis(Date.now()+86400000)});
    check('Un autre commerçant ne peut pas valider mon bon',no(await patch(M2,'redemptions/r1',{status:'used',usedAt:now()})));
    check('Le commerçant valide avec le panier et « nouveau client »',ok(await patch(M1,'redemptions/r1',{status:'used',usedAt:now(),basketEuros:14.5,newCustomer:true})));
    check('Panier négatif, nul ou absurde : refusé',no(await patch(M1,'redemptions/r2',{status:'used',usedAt:now(),basketEuros:-3}))&&no(await patch(M1,'redemptions/r2',{status:'used',usedAt:now(),basketEuros:0}))&&no(await patch(M1,'redemptions/r2',{status:'used',usedAt:now(),basketEuros:999999})));
    check('Le commerçant ne peut pas changer le coût ni le palier d\'un bon',no(await patch(M1,'redemptions/r2',{cost:1}))&&no(await patch(M1,'redemptions/r2',{status:'used',cost:1})));
    check('L\'habitant peut marquer son propre bon « utilisé » (bouton C\'est validé) mais pas ajouter un panier',ok(await patch(U1,'redemptions/r2',{status:'used',usedAt:now()})));
  });

  await T('campagne : les 5 paliers d\'abord',async()=>{
    const camp={merchantId:'m2',merchantName:'Studio Fit',status:'active',targetCity:'le-mans',city:'le-mans',questions:[{q:'Q ?',format:'mcq',options:['A','B']}],archived:false,answersCount:0,createdAt:now()};
    check('Campagne ACTIVE sans les 5 paliers : refusée',no(await create(M2,'campaigns','k1',camp)));
    check('Brouillon sans les paliers : accepté (ce n\'est pas un lancement)',ok(await create(M2,'campaigns','k2',{...camp,status:'draft'})));
    for(const t of [1,2,3,4])await create(M2,'rewards','m2_p'+t,reward('m2',t));
    check('Campagne active avec 4 paliers sur 5 : refusée',no(await create(M2,'campaigns','k3',camp)));
    await create(M2,'rewards','m2_p5',reward('m2',5));
    check('Campagne active avec les 5 paliers : acceptée',ok(await create(M2,'campaigns','k4',camp)));
  });

  console.log('\n'+pass+' ok, '+fail+' échec(s)');process.exit(fail?1:0);
})();
