// Rendez-vous quotidien : la question du jour n'est jamais ralentie ni coupée automatiquement, et un habitant qui n'a
// rien reçu ni répondu de la journée reçoit un « rendez-vous » à 18h (une fois par jour).
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FUNCTIONS_EMULATOR='true';
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore();const {Timestamp}=admin.firestore;
const N=require(__dirname+'/../functions/notifications.js')._t;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const D='2026-01-14',at=hm=>Date.parse(`${D}T${hm}:00+01:00`);
const sink=async uid=>(await db.collection('_pushSink').where('uid','==',uid).get()).docs.map(d=>d.data());
const mk=(uid,o={})=>db.doc('users/'+uid).set({role:'user',name:uid,city:'angers',cityLabel:'Angers',pushEnabled:true,fcmTokens:['tok_'+uid],authorizedMerchants:[],answeredCampaigns:[],interests:[],points:0,xp:0,streak:0,...o});
(async()=>{
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await sleep(300);
  await db.doc('_testClock/now').set({ms:at('18:05')});
  await mk('pts',{points:120});
  await mk('zero',{cityLabel:'Angers'});
  await mk('busy',{notifDaily:{date:D,count:1,suivi:0}});
  await mk('done',{dailyAnswerDate:D,dailyAnswerCount:1});
  await db.doc('rewards/r1').set({merchantId:'m9',merchantName:'Café Plume',city:'angers',label:'café offert',cost:200,status:'approved',active:true});
  await N.runTick(at('18:05'));
  const a=await sink('pts'),b=await sink('zero');
  check('Rien reçu ni répondu aujourd\'hui : rendez-vous à 18h avec ses points et la récompense la plus proche',a.length===1&&a[0].ntype==='rendez_vous'&&/café offert chez Café Plume se rapproche/.test(a[0].title)&&/120 points/.test(a[0].body),a);
  check('Même chose sans points : « Quoi de neuf à Angers ? » (récompense de la ville en vue)',b.length===1&&b[0].ntype==='rendez_vous',b);
  check('Déjà une notification aujourd\'hui : pas de rendez-vous en plus',(await sink('busy')).length===0);
  check('Déjà répondu aujourd\'hui : rien',(await sink('done')).length===0);
  await N.runTick(at('18:20'));
  check('Une seule fois par jour',(await sink('pts')).length===1);
  await db.doc('rewards/r1').delete();await mk('city0',{cityLabel:'Angers'});await N.runTick(at('18:25'));
  const c=await sink('city0');
  check('Ni points ni récompense : « Quoi de neuf à Angers ? »',c.length===1&&c[0].title==='Quoi de neuf à Angers ?',c);
  // Question du jour coupée automatiquement autrefois (6 notifications non ouvertes) : elle repart quand même.
  await db.doc('_testClock/now').set({ms:at('13:00')});
  await db.doc('campaigns/c1').set({merchantId:'m1',merchantName:'Le Fournil',status:'active',targetCity:'le-mans',city:'le-mans',question:'Ta boisson ?',questions:[{q:'Ta boisson ?',format:'mcq',options:['Café','Thé']}],createdAt:Timestamp.fromMillis(at('08:00'))});
  await sleep(2500);
  await mk('off',{city:'le-mans',authorizedMerchants:['m1'],notifStats:{question_du_jour:{autoOff:true,weekly:true,missStreak:9,lastSentAt:at('12:30')-86400000,lastSentDay:'2026-01-13'}},notifDaily:{date:D,count:0,suivi:0}});
  await db.doc('users/off').update({'notifStats.question_suivi.lastSentDay':''});
  await N.runTick(at('13:00'));
  const o=(await sink('off')).filter(x=>x.ntype==='question_du_jour');
  check('Question du jour jamais coupée ni ralentie par les notifications non ouvertes',o.length===1,await sink('off'));
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
