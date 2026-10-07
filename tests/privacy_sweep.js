// Balayage « fuite de données » : un habitant malveillant (connecté, dans la même ville, AMI de la victime — le pire cas)
// essaie de lire TOUTES les collections de la base (chaque collection listée dans firestore.rules, en liste et document
// par document, plus les sous-collections). Chaque document qu'il arrive à lire est fouillé, champ par champ, à la
// recherche de données personnelles : e-mail, téléphone, adresse, nom de famille, SIRET, date de naissance, jetons.
// Aucune ne doit sortir. Seule exception voulue : l'adresse PROFESSIONNELLE d'un commerce dans sa vitrine.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const fs=require('fs'),crypto=require('crypto');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,900):''));};
const AUTH='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake';
const FS='http://127.0.0.1:8080/v1/projects/noova-366d0/databases/(default)/documents';
const tok=async(email)=>(await (await fetch(AUTH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'secret123',returnSecureToken:true})})).json()).idToken;
const H=t=>({'Content-Type':'application/json',Authorization:'Bearer '+t});
const call=async(name,data,t)=>{const r=await fetch('http://127.0.0.1:5001/noova-366d0/europe-west1/'+name,{method:'POST',headers:H(t),body:JSON.stringify({data})});const txt=await r.text();let j;try{j=JSON.parse(txt);}catch(e){return {error:'HTTP_'+r.status};}return j.error?{error:j.error.status}:j.result;};
const until=async(fn,t=20000)=>{const s=Date.now();while(Date.now()-s<t){if(await fn())return true;await sleep(300);}return false;};

// Données personnelles de la victime et du gérant : si l'une d'elles apparaît dans un document lisible, c'est une fuite.
const SECRETS=['victime.perso@gmail.com','0612345678','+33612345678','12 rue des Lilas','Dupont','1990-04-12','tok_vic_secret',
  'gerant.prive@gmail.com','0698765432','12345678901234','Martin-Gérant','8 impasse Privée','noova.fondateur@gmail.com','7 allée du Fondateur'];
const PII_KEYS=/^(email|phone|tel|telephone|mobile|address|adresse|lastName|nom|birth|birthDate|dateNaissance|siret|iban|fcmTokens|idDoc|kbis|ownerUid|password)$/i;
const flatten=(v,path='',out=[])=>{if(v&&typeof v==='object'){for(const [k,x] of Object.entries(v))flatten(x,path?path+'.'+k:k,out);}else out.push([path,v]);return out;};
const decode=f=>{if(!f)return null;const v=x=>'stringValue' in x?x.stringValue:'integerValue' in x?+x.integerValue:'doubleValue' in x?x.doubleValue:'booleanValue' in x?x.booleanValue:'timestampValue' in x?x.timestampValue:'mapValue' in x?decode(x.mapValue.fields||{}):'arrayValue' in x?(x.arrayValue.values||[]).map(v):null;return Object.fromEntries(Object.entries(f).map(([k,x])=>[k,v(x)]));};
// Vitrine d'un commerce : son adresse professionnelle est publique (c'est un commerce). Rien d'autre.
const allowed=(coll,id,key,val)=>coll==='merchantsPublic'&&id==='m1'&&key==='address'&&val==='3 place du Marché, 72000 Le Mans';
function leaks(coll,id,data){
  const bad=[];
  if(coll==='users'&&id==='att')return bad;            // sa propre fiche : il a le droit de lire SES données
  for(const [k,v] of flatten(data)){
    const last=k.split('.').pop();
    if(allowed(coll,id,last,v))continue;
    if(PII_KEYS.test(last)&&v!==null&&v!==''&&v!==undefined)bad.push(coll+'/'+id+' : champ « '+k+' »');
    if(typeof v==='string'&&SECRETS.some(s=>v.includes(s)))bad.push(coll+'/'+id+' : '+k+' = '+v.slice(0,40));
    if(typeof v==='string'&&/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(v))bad.push(coll+'/'+id+' : e-mail dans '+k);
  }
  return bad;
}

(async()=>{
  await fetch(FS.replace('/v1/','/emulator/v1/'),{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);
  const base={role:'user',city:'le-mans',cityLabel:'Le Mans',welcomeClaimed:true,onboardingStep:'done',points:120,xp:300,streak:4,authorizedMerchants:['m1','noova'],answeredCampaigns:['c1']};
  // Victime : toutes les données personnelles possibles (même celles que l'app ne demande pas), pour vérifier qu'aucune ne sort.
  await db.doc('users/vic').set({...base,name:'Léa',email:'victime.perso@gmail.com',phone:'0612345678',address:'12 rue des Lilas',lastName:'Dupont',birthDate:'1990-04-12',ageRange:'25-34',interests:['sport'],fcmTokens:['tok_vic_secret'],friendUids:['att'],friendCode:'NOOVA-LEA123'});
  await db.doc('users/att').set({...base,name:'Hacker',email:'att@t.fr',ageRange:'25-34',interests:['sport'],friendUids:['vic']});
  await db.doc('users/oth').set({...base,name:'Zoé',email:'zoe.privee@gmail.com',phone:'+33612345678',ageRange:'35-49',interests:['culture'],friendUids:[]});
  await db.doc('friendCodes/NOOVA-LEA123').set({uid:'vic',name:'Léa'});
  await db.doc('merchants/m1').set({role:'merchant',ownerUid:'m1',brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',address:'3 place du Marché, 72000 Le Mans',status:'verified',email:'gerant.prive@gmail.com',phone:'0698765432',siret:'12345678901234',firstName:'Paul',lastName:'Martin-Gérant',ownerAddress:'8 impasse Privée'});
  await db.doc('merchants/noova').set({role:'merchant',ownerUid:'noova',brandName:'NOOVA',name:'NOOVA',sector:'NOOVA',city:'le-mans',cityLabel:'Le Mans',address:'7 allée du Fondateur, 72000 Le Mans',lat:48.01,lng:0.2,status:'verified',broadcast:true,email:'noova.fondateur@gmail.com',phone:'0698765432'});
  for(const u of ['vic','att','oth','m1','noova'])await aauth.createUser({uid:u,email:u==='vic'?'victime.perso@gmail.com':u==='oth'?'zoe.privee@gmail.com':u+'@t.fr',password:'secret123'});
  await db.doc('campaigns/c1').set({merchantId:'m1',merchantName:'Le Fournil',status:'active',targetCity:'le-mans',city:'le-mans',question:'Ta boisson ?',questions:[{q:'Ta boisson ?',format:'mcq',options:['Café','Thé']}],createdAt:Timestamp.now()});
  await db.doc('answers/vic_c1_q0').set({userId:'vic',campaignId:'c1',merchantId:'m1',questionIdx:0,answer:'Café',createdAt:Timestamp.now()});
  await db.doc('answers/oth_c1_q0').set({userId:'oth',campaignId:'c1',merchantId:'m1',questionIdx:0,answer:'Thé',createdAt:Timestamp.now()});
  await db.doc('redemptions/r1').set({userId:'vic',merchantId:'m1',merchantName:'Le Fournil',label:'Café',code:'AB12',status:'pending',cost:150,createdAt:Timestamp.now()});
  await db.doc('users/vic/notifications/n1').set({type:'friend_request',fromUid:'oth',fromName:'Zoé',read:false,createdAt:Timestamp.now()});
  await db.doc('chats/oth_vic').set({participants:{oth:true,vic:true}});
  await db.doc('chats/oth_vic/messages/m').set({fromUid:'vic',text:'Mon numéro : 0612345678',createdAt:Timestamp.now()});
  await db.doc('chats/att_vic').set({participants:{att:true,vic:true}});
  await db.doc('chats/att_vic/messages/m').set({fromUid:'vic',text:'Salut',createdAt:Timestamp.now()});
  await db.doc('feedback/f1').set({uid:'vic',email:'victime.perso@gmail.com',text:'bug',createdAt:Timestamp.now()});
  await db.doc('communityEvents/e1').set({type:'levelup',level:'Actif',userId:'vic',displayName:'Léa',city:'le-mans',text:'a atteint le palier Actif',createdAt:Timestamp.now()});
  await db.doc('emailIndex/'+crypto.createHash('sha256').update('victime.perso@gmail.com').digest('hex')).set({uid:'vic'});
  // Les copies publiques sont écrites par le serveur (déclencheurs) : on attend qu'elles existent.
  await until(async()=>(await db.doc('merchantsPublic/noova').get()).exists&&(await db.doc('publicProfiles/vic').get()).exists&&(await db.doc('cityBoard/oth').get()).exists);
  await until(async()=>!!((await db.doc('chats/att_vic').get()).data()||{}).members);
  const A=await tok('att@t.fr');

  // ── 1. Toutes les collections de premier niveau déclarées dans les règles : en liste et document par document.
  const rules=fs.readFileSync(__dirname+'/../firestore.rules','utf8');
  const colls=[...new Set([...rules.matchAll(/^    match \/([A-Za-z_]+)\/\{/gm)].map(m=>m[1]))];
  const ids={users:['vic','oth','att'],merchants:['m1','noova'],merchantsPublic:['m1','noova'],publicProfiles:['vic','oth'],cityBoard:['vic','oth'],friendCodes:['NOOVA-LEA123'],answers:['vic_c1_q0','oth_c1_q0'],redemptions:['r1'],chats:['oth_vic','att_vic'],feedback:['f1'],communityEvents:['e1'],campaigns:['c1']};
  const readable=[],allLeaks=[];
  for(const c of colls){
    const q=await fetch(`${FS}:runQuery`,{method:'POST',headers:H(A),body:JSON.stringify({structuredQuery:{from:[{collectionId:c}],limit:50}})});
    if(q.status===200){for(const row of await q.json())if(row.document){const id=row.document.name.split('/').pop();readable.push(c+' (liste) /'+id);allLeaks.push(...leaks(c,id,decode(row.document.fields)));}}
    for(const id of ids[c]||['x']){
      const r=await fetch(`${FS}/${c}/${id}`,{headers:H(A)});
      if(r.status===200){const j=await r.json();readable.push(c+'/'+id);allLeaks.push(...leaks(c,id,decode(j.fields)));}
    }
  }
  // ── 2. Sous-collections sensibles
  for(const path of ['users/vic/notifications/n1','chats/oth_vic/messages/m','chats/att_vic/messages/m']){
    const r=await fetch(`${FS}/${path}`,{headers:H(A)});
    if(r.status===200){const j=await r.json();readable.push(path);allLeaks.push(...leaks(path.split('/')[0],path,decode(j.fields)));}
  }
  console.log('PASS (info) lisible par l\'attaquant : '+[...new Set(readable)].join(', ')+')');
  check('Balayage de '+colls.length+' collections + sous-collections : aucune donnée personnelle de la victime, d\'un inconnu ou d\'un gérant',allLeaks.length===0,[...new Set(allLeaks)]);
  check('Fiche complète d\'un habitant (même ami) : jamais lisible',!readable.some(x=>/^users(\/| \(liste\) \/)(vic|oth)$/.test(x)));
  check('Fiche privée d\'un commerçant (e-mail, téléphone, SIRET, gérant) : jamais lisible',!readable.some(x=>/^merchants(\/| \(liste\))/.test(x)));
  check('Liste des codes ami (prénom de tous les inscrits) : refusée',!readable.some(x=>/^friendCodes \(liste\)/.test(x)));
  check('… mais un code connu reste utilisable pour ajouter un ami',readable.includes('friendCodes/NOOVA-LEA123'));
  check('Réponses d\'un inconnu, bons d\'échange, notifications, retours testeurs, index des e-mails : illisibles',!readable.some(x=>/^(answers\/oth|redemptions|feedback|emailIndex)|users\/vic\/notifications/.test(x)));
  check('Conversation entre deux autres personnes : illisible',!readable.some(x=>/oth_vic/.test(x)));
  check('Vitrine du compte NOOVA : aucune adresse ni position',(()=>{const d=readable.includes('merchantsPublic/noova');return d;})()&&allLeaks.every(l=>!/noova/.test(l)));
  const np=(await db.doc('merchantsPublic/noova').get()).data();
  check('… vérifié dans la copie publique elle-même (pas d\'adresse, pas de lat/lng)',np&&!('address' in np)&&!('lat' in np)&&!('lng' in np),np);

  // ── 3. Fonctions serveur appelables : rien de personnel dans leurs réponses
  const sug=await call('friendSuggestions',{},A);
  const fx=[];for(const s of (sug.suggestions||[]))fx.push(...leaks('friendSuggestions',s.uid,s));
  const h=crypto.createHash('sha256').update('victime.perso@gmail.com').digest('hex');
  const m1=await call('matchContacts',{hashes:[h]},A);
  for(const s of (m1.matches||[]))fx.push(...leaks('matchContacts',s.uid,s));
  check('Suggestions et recherche de contacts : ni e-mail, ni téléphone, ni adresse dans les réponses',fx.length===0&&!JSON.stringify(m1).includes('@'),fx);
  await call('matchContacts',{hashes:[h]},A);await call('matchContacts',{hashes:[h]},A);
  const m4=await call('matchContacts',{hashes:[h]},A);
  check('Recherche de contacts limitée à 3 par jour (impossible de tester des milliers d\'e-mails)',m4.error==='RESOURCE_EXHAUSTED',m4);
  const cb=(await db.doc('cityBoard/oth').get()).data();
  await db.doc('users/oth').update({name:'Zoé Lambert'});
  await until(async()=>(await db.doc('cityBoard/oth').get()).data().name!=='Zoé');
  check('Classement de la ville : prénom + initiale seulement (« Zoé Lambert » → « Zoé L. »)',cb.name==='Zoé'&&(await db.doc('cityBoard/oth').get()).data().name==='Zoé L.',(await db.doc('cityBoard/oth').get()).data());
  const adm=await call('adminStats',{},A);
  check('Fonctions d\'administration : refusées à un habitant',!!adm.error,adm);
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
