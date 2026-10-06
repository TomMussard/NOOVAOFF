// Sécurité : chaque test joue le rôle d'un attaquant (compte habitant ou commerçant malveillant, faux admin) et vérifie
// que la base refuse. Les lectures et écritures passent par l'API REST de l'émulateur avec un vrai jeton : les règles
// Firestore s'appliquent exactement comme dans l'app.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,3).join(' | '));}};
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
const AUTH='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake';
const tok=async(email)=>(await (await fetch(AUTH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'secret123',returnSecureToken:true})})).json()).idToken;
const call=async(name,data,token)=>{const r=await fetch('http://127.0.0.1:5001/noova-366d0/europe-west1/'+name,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({data})});const j=await r.json();return j.error?{error:j.error.status||j.error.message}:j.result;};
const until=async(fn,t=20000)=>{const s=Date.now();while(Date.now()-s<t){if(await fn())return true;await sleep(300);}return false;};
const FS='http://127.0.0.1:8080/v1/projects/noova-366d0/databases/(default)/documents';
const val=v=>v===null?{nullValue:null}:typeof v==='boolean'?{booleanValue:v}:Number.isInteger(v)?{integerValue:String(v)}:typeof v==='number'?{doubleValue:v}:Array.isArray(v)?{arrayValue:{values:v.map(val)}}:typeof v==='object'?{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,val(x)]))}}:{stringValue:String(v)};
const fields=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,val(v)]));
const H=t=>({'Content-Type':'application/json',Authorization:'Bearer '+t});
const get=async(t,path)=>(await fetch(`${FS}/${path}`,{headers:H(t)})).status;
const getDoc=async(t,path)=>{const r=await fetch(`${FS}/${path}`,{headers:H(t)});return r.status===200?(await r.json()).fields||{}:null;};
const create=async(t,col,id,o)=>(await fetch(`${FS}/${col}?documentId=${encodeURIComponent(id)}`,{method:'POST',headers:H(t),body:JSON.stringify({fields:fields(o)})})).status;
const patch=async(t,path,o)=>(await fetch(`${FS}/${path}?${Object.keys(o).map(k=>'updateMask.fieldPaths='+k).join('&')}`,{method:'PATCH',headers:H(t),body:JSON.stringify({fields:fields(o)})})).status;
const query=async(t,col,filters)=>{const r=await fetch(`${FS}:runQuery`,{method:'POST',headers:H(t),body:JSON.stringify({structuredQuery:{from:[{collectionId:col}],where:filters.length===1?{fieldFilter:filters[0]}:{compositeFilter:{op:'AND',filters:filters.map(f=>({fieldFilter:f}))}}}})});return r.status;};
const eq=(f,v)=>({field:{fieldPath:f},op:'EQUAL',value:val(v)});
const SERVER_TS={createdAt:'__server__'};
// Écriture REST avec horodatage serveur (champ createdAt = request.time)
const createTs=async(t,col,id,o)=>(await fetch(`${FS}:commit`,{method:'POST',headers:H(t),body:JSON.stringify({writes:[{update:{name:`projects/noova-366d0/databases/(default)/documents/${col}/${id}`,fields:fields(o)},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}],currentDocument:{exists:false}}]})})).status;
const mkUser=async(uid,o={})=>{await db.doc('users/'+uid).set({role:'user',name:'User '+uid,email:uid+'@t.fr',city:'le-mans',authorizedMerchants:[],answeredCampaigns:[],friendUids:[],interests:['restauration'],ageRange:'25-34',points:120,xp:300,streak:4,fcmTokens:['tok_'+uid],...o});await aauth.createUser({uid,email:uid+'@t.fr',password:'secret123'});};

(async()=>{
  await wipe();
  await mkUser('alice',{name:'Alice'});await mkUser('bob',{name:'Bob'});await mkUser('carl',{name:'Carl',city:'angers'});
  await mkUser('fa',{name:'Fanny',friendUids:['fb']});await mkUser('fb',{name:'Fred',friendUids:['fa']});
  await db.doc('merchants/m1').set({role:'merchant',ownerUid:'m1',brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:'m1@shop.fr',phone:'0601020304',firstName:'Jean',lastName:'Dupont',siret:'12345678901234',idDocumentPath:'merchants/m1/id-document.pdf',address:'1 rue Nationale'});
  await aauth.createUser({uid:'m1',email:'m1@shop.fr',password:'secret123'});
  for(let t=1;t<=5;t++)await db.doc('rewards/m1_p'+t).set({merchantId:'m1',tier:t});
  await db.doc('feedback/f1').set({uid:'alice',text:'ok',status:'nouveau'});
  const A=await tok('alice@t.fr'),B=await tok('bob@t.fr'),FA=await tok('fa@t.fr'),M=await tok('m1@shop.fr');

  await T('faux admin',async()=>{
    // Compte e-mail + mot de passe créé avec une adresse admin, sans l'avoir vérifiée (n'importe qui pouvait le faire).
    await aauth.createUser({uid:'fake',email:'noovaoffr@gmail.com',password:'secret123',emailVerified:false});
    const F=await tok('noovaoffr@gmail.com');
    check('Faux admin (adresse admin non vérifiée) : ne lit pas la fiche d\'un habitant',await get(F,'users/alice')===403);
    check('Faux admin : ne lit pas les retours des testeurs',await get(F,'feedback/f1')===403);
    check('Faux admin : ne lit pas la fiche privée d\'un commerçant',await get(F,'merchants/m1')===403);
    check('Faux admin : ne valide pas un commerçant',await patch(F,'merchants/m1',{status:'verified',isTest:true})===403);
    const st=await call('adminStats',{},F);
    check('Faux admin : fonctions admin refusées (statistiques)',st.error==='PERMISSION_DENIED',st);
    const rs=await call('adminResetAllData',{},F);
    check('Faux admin : impossible d\'effacer la base',rs.error==='PERMISSION_DENIED',rs);
  });

  await T('données des habitants',async()=>{
    check('Un habitant ne lit JAMAIS la fiche complète d\'un autre habitant de sa ville (e-mail, âge, appareils)',await get(A,'users/bob')===403);
    check('… ni par une requête sur sa ville',await query(A,'users',[eq('city','le-mans')])===403);
    check('Il lit sa propre fiche',await get(A,'users/alice')===200);
    await until(async()=>!!(await db.doc('cityBoard/bob').get()).exists&&!!(await db.doc('publicProfiles/fb').get()).exists);
    const board=await getDoc(A,'cityBoard/bob');
    check('Classement : copie réduite lisible dans sa ville (prénom, XP, série)',board&&board.name.stringValue==='Bob'&&board.xp,board);
    check('Classement : sans e-mail, âge, centres d\'intérêt, points ni appareils',board&&!board.email&&!board.ageRange&&!board.interests&&!board.points&&!board.fcmTokens,Object.keys(board||{}));
    check('Classement : rien pour une autre ville',await get(A,'cityBoard/carl')===403);
    check('Profil d\'ami : lisible entre amis réciproques',await get(FA,'publicProfiles/fb')===200);
    check('Profil d\'ami : illisible pour un non-ami',await get(A,'publicProfiles/fb')===403);
    check('Copies publiques : jamais écrites par un client',await patch(A,'cityBoard/alice',{xp:999999})===403);
  });

  await T('données des commerçants',async()=>{
    check('Un habitant ne lit pas la fiche privée d\'un commerce (e-mail, téléphone, gérant, SIRET, pièce d\'identité)',await get(A,'merchants/m1')===403);
    await until(async()=>(await db.doc('merchantsPublic/m1').get()).exists);
    const pub=await getDoc(A,'merchantsPublic/m1');
    check('Vitrine publique lisible dans sa ville (nom, adresse, secteur)',pub&&pub.brandName.stringValue==='Le Fournil'&&pub.address,pub);
    check('Vitrine publique : sans e-mail, téléphone, gérant, SIRET ni pièce d\'identité',pub&&!pub.email&&!pub.phone&&!pub.firstName&&!pub.lastName&&!pub.siret&&!pub.idDocumentPath,Object.keys(pub||{}));
    check('Le commerçant lit sa propre fiche',await get(M,'merchants/m1')===200);
  });

  await T('triche habitant',async()=>{
    await aauth.createUser({uid:'eve',email:'eve@t.fr',password:'secret123'});const E=await tok('eve@t.fr');
    check('Inscription avec une série déjà gonflée : refusée',await create(E,'users','eve',{role:'user',name:'Eve',points:0,xp:0,streak:999})===403);
    check('Inscription avec des réponses déjà comptées : refusée',await create(E,'users','eve',{role:'user',name:'Eve',ans:500})===403);
    check('Inscription avec un rôle admin : refusée',await create(E,'users','eve',{role:'admin',name:'Eve'})===403);
    check('Inscription avec l\'e-mail de quelqu\'un d\'autre : refusée',await create(E,'users','eve',{role:'user',name:'Eve',email:'alice@t.fr'})===403);
    check('Inscription normale : acceptée',await create(E,'users','eve',{role:'user',name:'Eve',email:'eve@t.fr',points:0,xp:0,streak:0,answeredCampaigns:[]})===200);
    check('Se créditer des points : refusé',await patch(A,'users/alice',{points:99999})===403);
    check('Changer son rôle : refusé',await patch(A,'users/alice',{role:'merchant'})===403);
    check('Nom de 5 000 caractères : refusé',await patch(A,'users/alice',{name:'x'.repeat(5000)})===403);
  });

  await T('triche commerçant',async()=>{
    await aauth.createUser({uid:'m2',email:'m2@shop.fr',password:'secret123'});const M2=await tok('m2@shop.fr');
    check('Commerçant qui s\'inscrit avec un quota de 1 000 questions : refusé',await create(M2,'merchants','m2',{role:'merchant',ownerUid:'m2',brandName:'X',status:'pending',monthlyQuestionQuota:1000})===403);
    check('… ou marqué « commerce test » (sans quota, sans contrôle) : refusé',await create(M2,'merchants','m2',{role:'merchant',ownerUid:'m2',brandName:'X',status:'pending',isTest:true})===403);
    check('… ou déjà vérifié : refusé',await create(M2,'merchants','m2',{role:'merchant',ownerUid:'m2',brandName:'X',status:'verified'})===403);
    check('Inscription commerçant normale : acceptée',await create(M2,'merchants','m2',{role:'merchant',ownerUid:'m2',brandName:'Salon',email:'m2@shop.fr',status:'pending'})===200);
    check('Commerce vérifié qui se renomme (usurpation) : refusé',await patch(M,'merchants/m1',{brandName:'NOOVA'})===403);
    check('Commerce vérifié qui change de SIRET : refusé',await patch(M,'merchants/m1',{siret:'99999999999999'})===403);
    check('Se donner la diffusion dans toutes les villes : refusé',await patch(M,'merchants/m1',{broadcast:true})===403);
    check('Se marquer « commerce test » : refusé',await patch(M,'merchants/m1',{isTest:true})===403);
    check('Modifier sa description : accepté',await patch(M,'merchants/m1',{description:'Pain au levain'})===200);
    const Q={question:'Q ?',questions:[{q:'Q ?',format:'mcq',options:['Oui','Non']}],status:'active',targetCity:'le-mans',city:'le-mans',archived:false};
    check('Question publiée sous le nom d\'un autre commerce : refusée',await create(M,'campaigns','c_spoof',{...Q,merchantId:'m1',merchantName:'Boulangerie Concurrente'})===403);
    check('Question marquée « test » pour contourner le quota : refusée',await create(M,'campaigns','c_test',{...Q,merchantId:'m1',merchantName:'Le Fournil',isTest:true})===403);
    check('Question avec des réponses déjà comptées : refusée',await create(M,'campaigns','c_fake',{...Q,merchantId:'m1',merchantName:'Le Fournil',answersCount:500})===403);
    check('Identifiant de document avec guillemets (injection dans les pages) : refusé',await create(M,'campaigns',"x'\"><img src=x>",{...Q,merchantId:'m1',merchantName:'Le Fournil'})===403);
    check('Question normale : acceptée',await create(M,'campaigns','c_ok',{...Q,merchantId:'m1',merchantName:'Le Fournil'})===200);
  });

  await T('usurpation et vie privée',async()=>{
    await db.doc('communityEvents/e1').set({type:'levelup',userId:'alice',city:'le-mans',createdAt:Timestamp.now()});
    check('Commentaire signé du nom de quelqu\'un d\'autre : refusé',await createTs(B,'communityEvents/e1/comments','cm1',{userId:'bob',name:'Alice',text:'coucou'})===403);
    check('Commentaire signé de son propre nom : accepté',await createTs(B,'communityEvents/e1/comments','cm2',{userId:'bob',name:'Bob',text:'coucou'})===200);
    check('Demande d\'ami envoyée au nom de « NOOVA » : refusée',await create(B,'users/alice/notifications','friendreq_bob',{type:'friend_request',fromUid:'bob',fromName:'NOOVA'})===403);
    await db.doc('weeklyQuestions/w1').set({active:true,city:'le-mans',text:'?',options:['a','b']});
    await db.doc('weeklyQuestions/w1/votes/bob').set({optionIndex:1});
    check('Voir le vote d\'un autre habitant : refusé',await get(A,'weeklyQuestions/w1/votes/bob')===403);
    check('Retour testeur avec identifiant piégé : refusé',await createTs(A,'feedback',"a\"><script>",{uid:'alice',rating:3,kind:'idee',text:'x',likes:[],dislikes:[],status:'nouveau'})===403);
    check('Ville créée avec des champs en plus : refusée',await create(A,'cities','nouvelle-ville',{label:'Nouvelle',count:1,active:true})===403);
  });

  await T('compteur de consentements',async()=>{
    for(let i=0;i<5;i++)await createTs(A,'consentEvents','ce'+i,{userId:'alice',merchantId:'m1',action:'granted',segment:{}});
    await sleep(4000);
    const c=(await db.doc('merchants/m1').get()).data().consentCount;
    check('5 « consentements » envoyés par le même habitant : comptés une seule fois',c===1,c);
  });

  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
