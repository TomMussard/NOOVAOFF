// Social : notifications (message privé, J'aime, commentaire), messagerie (lu, sondage), suggestions d'amis et contacts.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const crypto=require('crypto');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,3).join(' | '));}};
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
const AUTH='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake';
const tok=async(email)=>(await (await fetch(AUTH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'secret123',returnSecureToken:true})})).json()).idToken;
const call=async(name,data,token)=>{const r=await fetch('http://127.0.0.1:5001/noova-366d0/europe-west1/'+name,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({data})});const j=await r.json();return j.error?{error:j.error.status}:j.result;};
const until=async(fn,t=20000)=>{const s=Date.now();while(Date.now()-s<t){if(await fn())return true;await sleep(300);}return false;};
const sink=async(uid)=>(await db.collection('_pushSink').where('uid','==',uid).get()).docs.map(d=>d.data());
const FS='http://127.0.0.1:8080/v1/projects/noova-366d0/databases/(default)/documents';
const val=v=>v===null?{nullValue:null}:typeof v==='boolean'?{booleanValue:v}:Number.isInteger(v)?{integerValue:String(v)}:Array.isArray(v)?{arrayValue:{values:v.map(val)}}:typeof v==='object'?{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,val(x)]))}}:{stringValue:String(v)};
const fields=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,val(v)]));
const H=t=>({'Content-Type':'application/json',Authorization:'Bearer '+t});
const P='projects/noova-366d0/databases/(default)/documents/';
// Écriture « comme l'app » : création avec createdAt = heure serveur, ou mise à jour d'un champ (avec ou sans heure serveur).
const commit=async(t,w)=>(await fetch(`${FS}:commit`,{method:'POST',headers:H(t),body:JSON.stringify({writes:[w]})})).status;
const createTs=(t,path,o)=>commit(t,{update:{name:P+path,fields:fields(o)},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}],currentDocument:{exists:false}});
const setField=(t,path,fp,v)=>commit(t,{update:{name:P+path,fields:{}},updateMask:{fieldPaths:[fp]},...(v===undefined?{updateTransforms:[{fieldPath:fp,setToServerValue:'REQUEST_TIME'}]}:{update:{name:P+path,fields:nestField(fp,v)}})});
function nestField(fp,v){const parts=fp.split('.');let o=val(v);for(let i=parts.length-1;i>0;i--)o={mapValue:{fields:{[parts[i]]:o}}};return {[parts[0]]:o};}
const mk=async(uid,o={})=>{await db.doc('users/'+uid).set({role:'user',name:o.name||uid,email:uid+'@t.fr',city:'le-mans',pushEnabled:true,fcmTokens:['tok_'+uid],friendUids:[],points:0,xp:0,streak:0,...o});await aauth.createUser({uid,email:uid+'@t.fr',password:'secret123'});};
const day=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Paris'});

(async()=>{
  await wipe();
  await db.doc('_testClock/now').set({ms:Date.parse(day+'T14:00:00+02:00')});    // en journée (hors silence 21h-9h)
  await mk('ana',{name:'Ana',friendUids:['ben','cle']});await mk('ben',{name:'Ben',friendUids:['ana','dan']});
  await mk('cle',{name:'Clé',friendUids:['ana','dan','eve']});await mk('dan',{name:'Dan',friendUids:['ben','cle']});
  await mk('eve',{name:'Eve',friendUids:['cle'],discoverable:false});await mk('fay',{name:'Fay'});
  const A=await tok('ana@t.fr'),B=await tok('ben@t.fr'),F=await tok('fay@t.fr');

  await T('messages',async()=>{
    await db.doc('chats/ana_ben').set({participants:{ana:true,ben:true}});
    check('Message texte : envoyé',await createTs(A,'chats/ana_ben/messages/m1',{fromUid:'ana',text:'Salut Ben !'})===200);
    const ok=await until(async()=>(await sink('ben')).some(x=>x.ntype==='message'));
    const n=(await sink('ben')).find(x=>x.ntype==='message')||{};
    check('Notification « Ana t\'a écrit » avec le message, qui ouvre la conversation',ok&&n.title==='Ana t\'a écrit'&&n.body==='Salut Ben !'&&/go=chat-ana/.test(n.url),n);
    check('L\'expéditeur ne reçoit rien',!(await sink('ana')).some(x=>x.ntype==='message'));
    await createTs(A,'chats/ana_ben/messages/m2',{fromUid:'ana',text:'Tu es là ?'});await sleep(2500);
    check('Deuxième message dans les 10 minutes : pas de nouvelle notification (pas de rafale)',(await sink('ben')).filter(x=>x.ntype==='message').length===1);
    check('Sondage : 2 à 4 réponses, accepté',await createTs(A,'chats/ana_ben/messages/p1',{fromUid:'ana',type:'poll',text:'Café samedi ?',options:['Oui','Non','Peut-être']})===200);
    check('Sondage avec 1 seule réponse : refusé',await createTs(A,'chats/ana_ben/messages/p2',{fromUid:'ana',type:'poll',text:'?',options:['Oui']})===403);
    check('Sondage avec 5 réponses : refusé',await createTs(A,'chats/ana_ben/messages/p3',{fromUid:'ana',type:'poll',text:'?',options:['a','b','c','d','e']})===403);
    check('Ben vote pour « Non »',await setField(B,'chats/ana_ben/messages/p1','votes.ben',1)===200);
    check('Ben ne peut pas voter à la place d\'Ana',await setField(B,'chats/ana_ben/messages/p1','votes.ana',0)===403);
    check('Vote hors des réponses : refusé',await setField(B,'chats/ana_ben/messages/p1','votes.ben',7)===403);
    check('Modifier le texte d\'un message : refusé',await setField(B,'chats/ana_ben/messages/m1','text','modifié')===403);
    check('« Vu » : Ben marque la conversation lue (heure serveur)',await setField(B,'chats/ana_ben','lastRead.ben')===200);
    check('« Vu » : Ben ne peut pas marquer à la place d\'Ana',await setField(B,'chats/ana_ben','lastRead.ana')===403);
    check('Un non-participant ne marque rien',await setField(F,'chats/ana_ben','lastRead.fay')===403);
  });

  await T('réactions',async()=>{
    await db.doc('communityEvents/ev1').set({type:'levelup',level:'Actif',userId:'ana',displayName:'Ana',city:'le-mans',text:'a atteint le palier Actif',createdAt:Timestamp.now()});
    await createTs(B,'communityEvents/ev1/likes/ben',{});
    const ok=await until(async()=>(await sink('ana')).some(x=>x.ntype==='reaction'));
    const l=(await sink('ana')).find(x=>x.ntype==='reaction')||{};
    check('J\'aime : « Ben a aimé ta publication »',ok&&l.title==='Ben a aimé ta publication'&&/palier Actif/.test(l.body),l);
    await createTs(B,'communityEvents/ev1/comments/c1',{userId:'ben',name:'Ben',text:'Bravo !'});
    await until(async()=>(await sink('ana')).filter(x=>x.ntype==='reaction').length===2);
    const c=(await sink('ana')).filter(x=>x.ntype==='reaction')[1]||{};
    check('Commentaire : « Ben a commenté ta publication » avec le texte',c.title==='Ben a commenté ta publication'&&/Bravo/.test(c.body),c);
    await createTs(A,'communityEvents/ev1/comments/c2',{userId:'ana',name:'Ana',text:'Merci'});await sleep(2500);
    check('Son propre commentaire : aucune notification',(await sink('ana')).filter(x=>x.ntype==='reaction').length===2);
  });

  await T('suggestions et contacts',async()=>{
    const r=await call('friendSuggestions',{},A);
    const names=(r.suggestions||[]).map(x=>x.name+':'+x.mutual);
    check('Suggestions pour Ana : Dan (2 amis en commun), jamais un ami actuel',names.join()==='Dan:2',names);
    check('Eve (qui ne veut pas être proposée) n\'apparaît pas',!names.some(n=>/Eve/.test(n)));
    const h=e=>crypto.createHash('sha256').update(e).digest('hex');
    await until(async()=>(await db.doc('emailIndex/'+h('fay@t.fr')).get()).exists);
    const m=await call('matchContacts',{hashes:[h('fay@t.fr'),h('eve@t.fr'),h('inconnu@t.fr'),h('ben@t.fr')]},A);
    const mn=(m.matches||[]).map(x=>x.name+(x.friend?'(ami)':''));
    check('Contacts : Fay retrouvée, Ben signalé « déjà ami », Eve (non proposable) et l\'inconnu absents',mn.sort().join()==='Ben(ami),Fay',mn);
    check('Contacts : aucune adresse e-mail renvoyée',!JSON.stringify(m).includes('@'));
    check('Index des empreintes illisible côté client',(await fetch(`${FS}/emailIndex/${h('fay@t.fr')}`,{headers:H(A)})).status===403);
    const no=await call('friendSuggestions',{},'');
    check('Suggestions refusées sans connexion',no.error==='UNAUTHENTICATED',no);
  });

  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
