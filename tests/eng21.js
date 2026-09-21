// Points : gains (10 pts, 3 réponses/jour, +5 découverte, +50 bienvenue), échange côté serveur (palier, quota, semaine, créneau, solde),
// expiration à 6 mois d'inactivité, compteurs commerçant. Tout passe par les vraies Cloud Functions de l'émulateur.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const CFG=require(__dirname+'/../functions/engagementConfig.js');
const TIERS=require(__dirname+'/../functions/tiers.js');
const P=require(__dirname+'/../functions/points.js')._t;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
const AUTH='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake';
const idTokenOf=async(email)=>(await (await fetch(AUTH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'secret123',returnSecureToken:true})})).json()).idToken;
const callFn=async(name,data,token)=>{const r=await fetch('http://127.0.0.1:5001/noova-366d0/europe-west1/'+name,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({data})});const j=await r.json();return j.error?{error:j.error.status,message:j.error.message}:j.result;};
const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,3).join(' | '));}};
const DAY=86400000;
const mkUser=async(uid,o={})=>{await db.doc('users/'+uid).set({role:'user',name:'User '+uid,city:'le-mans',cityLabel:'Le Mans',authorizedMerchants:['m1','m2','m3'],friendUids:[],answeredCampaigns:[],points:0,xp:0,streak:0,welcomeClaimed:true,createdAt:Timestamp.now(),...o});await aauth.createUser({uid,email:uid+'@t.fr',password:'secret123'});};
const mkCamp=(id,mid,o={})=>db.doc('campaigns/'+id).set({merchantId:mid,merchantName:'Commerce '+mid,sector:'Boulangerie',status:'active',targetCity:'le-mans',city:'le-mans',question:'Q ?',questions:[{q:'Q1 ?',format:'mcq',options:['A','B']},{q:'Q2 ?',format:'mcq',options:['A','B']},{q:'Q3 ?',format:'mcq',options:['A','B']}],targetVolume:500,answersCount:0,createdAt:Timestamp.now(),...o});
// Répond en simulant « l'écran de question affiché il y a 5 s » (le serveur mesure le temps depuis beginQuestion).
const answer=async(uid,campaignId,idx=0,{fast=false}={})=>{
  if(!fast)await db.doc('users/'+uid).update({lastQuestionStart:{key:campaignId+'_'+idx,at:Date.now()-5000}});
  return callFn('submitAnswer',{campaignId,questionIdx:idx,answerValue:'A'},await idTokenOf(uid+'@t.fr'));
};
const rewardDoc=(mid,tier,o={})=>({merchantId:mid,merchantName:'Commerce '+mid,city:'le-mans',tier,slot:tier,cost:TIERS[tier-1].pts,label:'Récompense '+tier+' de '+mid,icon:'🎁',priceConfirmed:true,monthlyQuota:5,timeSlots:[],withPurchase:false,minPurchase:null,status:'approved',active:true,approved:true,redeemedCount:0,createdAt:Timestamp.now(),updatedAt:Timestamp.now(),...o});
const setClock=ms=>db.doc('_testClock/now').set({ms});

(async()=>{
  await wipe();
  for(const m of ['m1','m2','m3','m4'])await db.doc('merchants/'+m).set({role:'merchant',ownerUid:m,brandName:'Commerce '+m,city:'le-mans',status:'verified',email:m+'@s.fr'});
  await mkCamp('c1','m1');await mkCamp('c2','m1');await mkCamp('c3','m2');await mkCamp('c4','m3');await mkCamp('c5','m3');await mkCamp('c6','m4');

  await T('config',async()=>{
    check('Config unique : 10 pts/réponse, 3 réponses/jour, +50 bienvenue, +5 découverte, expiration 6 mois',CFG.POINTS.PER_ANSWER===10&&CFG.POINTS.MAX_ANSWERS_PER_DAY===3&&CFG.POINTS.WELCOME_BONUS===50&&CFG.POINTS.DISCOVERY_BONUS===5&&CFG.POINTS.EXPIRY_MONTHS===6,CFG.POINTS);
    check('Anciennes constantes supprimées (barème par question, bonus de série, points de démo)',!('BY_QUESTION_INDEX' in CFG.POINTS)&&!('STREAK_BONUS' in CFG.POINTS)&&!('SERIE_BONUS' in CFG.POINTS)&&!('DEMO_POINTS' in CFG.POINTS));
    check('5 paliers : 150/300/500/900/1500 pts, prix carte 1-3, 3-6, 6-10, 10-18, 18-30 €',JSON.stringify(TIERS.map(t=>[t.pts,t.min,t.max]))==='[[150,1,3],[300,3,6],[500,6,10],[900,10,18],[1500,18,30]]',TIERS);
  });

  await T('bonus de bienvenue',async()=>{
    await mkUser('new1',{welcomeClaimed:false,points:0,xp:0});
    check('Sans connexion : refusé',(await callFn('claimWelcomeBonus',{})).error==='UNAUTHENTICATED');
    const tok=await idTokenOf('new1@t.fr');
    const r1=await callFn('claimWelcomeBonus',{},tok);const u1=(await db.doc('users/new1').get()).data();
    check('Inscription : +50 pts (et +50 xp), welcomeClaimed, lastActivityAt posé',r1.claimed===true&&r1.points===50&&u1.points===50&&u1.xp===50&&u1.welcomeClaimed===true&&!!u1.lastActivityAt,{r1,u1});
    const r2=await callFn('claimWelcomeBonus',{},tok);const u2=(await db.doc('users/new1').get()).data();
    check('Une seule fois : le 2e appel ne crédite rien',r2.claimed===false&&u2.points===50,{r2,u2:u2.points});
    await mkUser('old1',{welcomeClaimed:false,createdAt:Timestamp.fromMillis(Date.now()-10*DAY)});
    const r3=await callFn('claimWelcomeBonus',{},await idTokenOf('old1@t.fr'));const u3=(await db.doc('users/old1').get()).data();
    check('Ancien compte non migré (créé il y a 10 jours) : pas de bonus rétroactif, mais marqué pour ne plus être proposé',r3.claimed===false&&u3.points===0&&u3.welcomeClaimed===true,{r3,u3:u3.points});
  });

  await T('gains',async()=>{
    await mkUser('a1');
    const r1=await answer('a1','c1',0);let u=(await db.doc('users/a1').get()).data();
    check('1re réponse chez un commerçant : 10 pts + 5 de bonus découverte = 15 (et 15 xp)',r1.pointsAwarded===15&&r1.discoveryBonus===5&&u.points===15&&u.xp===15,{r1,u:u.points});
    check('Le commerçant est mémorisé (answeredMerchants) et lastActivityAt posé',(u.answeredMerchants||[]).join()==='m1'&&!!u.lastActivityAt&&u.discoveryBonusDate===new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Paris'}),u);
    let m=(await db.doc('merchants/m1').get()).data();
    check('Compteur commerçant : pointsGenerated = 15',m.pointsGenerated===15,m);
    const r2=await answer('a1','c1',1);
    check('2e question de la même campagne : 10 pts flat (plus de 15/20), pas de bonus',r2.pointsAwarded===10&&r2.discoveryBonus===0,r2);
    const r3=await answer('a1','c3',0);u=(await db.doc('users/a1').get()).data();
    check('3e réponse du jour, autre commerçant : 10 pts, PAS de nouveau bonus découverte (1 fois par jour)',r3.pointsAwarded===10&&r3.discoveryBonus===0&&u.points===35,{r3,pts:u.points});
    const r4=await answer('a1','c4',0);u=(await db.doc('users/a1').get()).data();
    check('4e réponse du jour : aucun point (plafond de 30/jour), une réponse libre rapporte 1 NOOV',r4.pointsAwarded===0&&r4.noovsAwarded===1&&u.points===35&&u.noovs===1,{r4,u:[u.points,u.noovs]});
    check('30 pts par jour au maximum pour les réponses (35 = 30 + 5 de bonus découverte)',u.dailyPoints===35,u.dailyPoints);
    // Lendemain : le bonus découverte revient pour un commerçant jamais répondu, mais pas pour un commerçant déjà répondu.
    await db.doc('users/a1').update({dailyAnswerDate:'2020-01-01',discoveryBonusDate:'2020-01-01',dailyNoovsDate:'2020-01-01'});
    const r5=await answer('a1','c6',0);
    check('Le lendemain : un commerçant jamais répondu (m4) redonne 10 + 5 (le bonus est limité à 1 par jour, pas à 1 par semaine)',r5.pointsAwarded===15&&r5.discoveryBonus===5,r5);
    await db.doc('users/a1').update({dailyAnswerDate:'2020-01-01',discoveryBonusDate:'2020-01-01'});
    const r6=await answer('a1','c2',0);
    check('Commerçant déjà répondu (m1, autre campagne) : pas de bonus découverte',r6.pointsAwarded===10&&r6.discoveryBonus===0,r6);
    await mkUser('a2');
    const r7=await answer('a2','c1',0,{fast:true});u=(await db.doc('users/a2').get()).data();
    check('Réponse lue trop vite : 0 pt, pas de bonus découverte, commerçant non mémorisé',r7.pointsAwarded===0&&r7.discoveryBonus===0&&u.points===0&&!(u.answeredMerchants||[]).length,{r7,u:u.answeredMerchants});
    m=(await db.doc('merchants/m1').get()).data();
    check('pointsGenerated cumule tout ce que les questions du commerçant ont rapporté (15 + 10 + 10 = 35)',m.pointsGenerated===35,m.pointsGenerated);
  });

  await T('échange',async()=>{
    await mkUser('r1',{points:2000,xp:2000});await mkUser('r2',{points:100});
    await db.doc('rewards/m1_p1').set(rewardDoc('m1',1));await db.doc('rewards/m1_p2').set(rewardDoc('m1',2,{withPurchase:true,minPurchase:8}));
    await db.doc('rewards/m2_p3').set(rewardDoc('m2',3,{monthlyQuota:1}));await db.doc('rewards/m3_p1').set(rewardDoc('m3',1,{status:'pending',active:false,approved:false}));
    const tok=await idTokenOf('r1@t.fr');
    check('Sans connexion : refusé',(await callFn('redeemReward',{rewardId:'m1_p1'})).error==='UNAUTHENTICATED');
    const bad=await callFn('redeemReward',{rewardId:'m3_p1'},tok);
    check('Récompense non approuvée : refusée',bad.error==='FAILED_PRECONDITION',bad);
    const poor=await callFn('redeemReward',{rewardId:'m1_p1'},await idTokenOf('r2@t.fr'));
    check('Solde insuffisant (100 pts pour 150) : refusé, message précis, solde inchangé',poor.error==='FAILED_PRECONDITION'&&/50 pts/.test(poor.message)&&(await db.doc('users/r2').get()).data().points===100,poor);
    const ok=await callFn('redeemReward',{rewardId:'m1_p1'},tok);let u=(await db.doc('users/r1').get()).data();
    check('Échange : débit de 150 pts (coût du PALIER), bon avec code à 4 caractères, palier 1',ok.cost===150&&ok.tier===1&&/^[A-HJ-NP-Z2-9]{4}$/.test(ok.code)&&u.points===1850&&u.xp===2000,{ok,pts:u.points});
    const rd=(await db.doc('redemptions/'+ok.redemptionId).get()).data();
    check('Bon enregistré côté serveur : pending, 24 h, palier, aucun montant en € côté habitant',rd.status==='pending'&&rd.userId==='r1'&&rd.tier===1&&rd.merchantId==='m1'&&Math.abs(rd.expiresAt.toMillis()-Date.now()-24*3600000)<120000&&!/€/.test(JSON.stringify(rd.purchaseCondition)),rd);
        const mon=(await db.doc('rewards/m1_p1/monthly/'+(new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Paris'}).slice(0,7))).get()).data();
    const rw=(await db.doc('rewards/m1_p1').get()).data(),mm=(await db.doc('merchants/m1').get()).data();
    check('Compteurs : quota du mois = 1, redeemedCount = 1, pointsSpent du commerçant = 150',mon&&mon.used===1&&rw.redeemedCount===1&&mm.pointsSpent===150,{mon,rc:rw.redeemedCount,ps:mm.pointsSpent});
    const wk=await callFn('redeemReward',{rewardId:'m1_p2'},tok);u=(await db.doc('users/r1').get()).data();
    check('Une récompense par commerçant et par semaine : 2e échange chez m1 refusé (même une autre récompense), message avec la date de retour, aucun débit',wk.error==='RESOURCE_EXHAUSTED'&&/cette semaine/.test(wk.message)&&u.points===1850,wk);
    const other=await callFn('redeemReward',{rewardId:'m2_p3'},tok);
    check('… mais un autre commerçant (m2) est possible le même jour (500 pts, palier 3)',other.cost===500&&other.tier===3&&(await db.doc('users/r1').get()).data().points===1350,other);
    await mkUser('r3',{points:2000});
    const quota=await callFn('redeemReward',{rewardId:'m2_p3'},await idTokenOf('r3@t.fr'));
    check('Quota mensuel atteint (1 par mois) : refusé pour un autre habitant, solde intact',quota.error==='RESOURCE_EXHAUSTED'&&/mois/.test(quota.message)&&(await db.doc('users/r3').get()).data().points===2000,quota);
    // Une semaine plus tard (horloge d'émulateur) : l'échange chez m1 redevient possible.
    await setClock(Date.now()+8*DAY);
    const again=await callFn('redeemReward',{rewardId:'m1_p2'},tok);u=(await db.doc('users/r1').get()).data();
    check('8 jours plus tard : nouvel échange chez m1 possible (300 pts, « avec achat » sans montant côté habitant)',again.cost===300&&u.points===1050&&again.purchaseCondition&&!/€/.test(again.purchaseCondition),again);
    const rd2=(await db.doc('redemptions/'+again.redemptionId).get()).data();
    check('Le minimum d\'achat reste côté commerçant (redemptions.minPurchase = 8)',rd2.minPurchase===8,rd2);
    // Le coût est TOUJOURS celui du palier, même si le document a été falsifié.
    await db.doc('rewards/m2_p3').update({cost:1,monthlyQuota:50});await mkUser('r4',{points:499});
    const cheat=await callFn('redeemReward',{rewardId:'m2_p3'},await idTokenOf('r4@t.fr'));
    check('Document falsifié (cost = 1) : le serveur applique quand même 500 pts',cheat.error==='FAILED_PRECONDITION'&&(await db.doc('users/r4').get()).data().points===499,cheat);
    // Solde jamais négatif, même en parallèle.
    await mkUser('r5',{points:300});
    for(const m of ['m1','m2','m3'])await db.doc('rewards/'+m+'_p1').set(rewardDoc(m,1,{monthlyQuota:50}));
    const t5=await idTokenOf('r5@t.fr');
    const par=await Promise.all(['m1_p1','m2_p1','m3_p1'].map(id=>callFn('redeemReward',{rewardId:id},t5)));
    const u5=(await db.doc('users/r5').get()).data();
    check('3 échanges de 150 pts lancés en même temps avec 300 pts : deux passent, le troisième est refusé, le solde tombe à 0 et jamais en dessous',par.filter(x=>x.code).length===2&&par.filter(x=>x.error).length===1&&u5.points===0,{par,pts:u5.points});
    await db.doc('_testClock/now').delete();
  });

  await T('créneaux horaires',async()=>{
    check('inTimeSlots : sans créneau = toujours',P.inTimeSlots([],Date.now())===true);
    const slot=[{days:[1,2,3,4,5],from:'14:00',to:'17:00'}];
    const at=(iso)=>Date.parse(iso);   // heures données en UTC ; Paris = UTC+2 en juin
    check('Créneau lun–ven 14h–17h (Paris) : mardi 15h → oui',P.inTimeSlots(slot,at('2026-06-09T13:00:00Z'))===true);
    check('… mardi 18h → non ; samedi 15h → non ; mardi 17h pile → non',P.inTimeSlots(slot,at('2026-06-09T16:00:00Z'))===false&&P.inTimeSlots(slot,at('2026-06-13T13:00:00Z'))===false&&P.inTimeSlots(slot,at('2026-06-09T15:00:00Z'))===false);
    await mkUser('s1',{points:500});await db.doc('rewards/m1_p1').set(rewardDoc('m1',1,{timeSlots:slot,monthlyQuota:50}));
    await setClock(at('2026-06-13T13:00:00Z'));           // samedi 15h : hors créneau
    const no=await callFn('redeemReward',{rewardId:'m1_p1'},await idTokenOf('s1@t.fr'));
    check('Échange hors créneau : refusé avec le rappel des créneaux, aucun débit',no.error==='FAILED_PRECONDITION'&&/14:00–17:00/.test(no.message)&&(await db.doc('users/s1').get()).data().points===500,no);
    await setClock(at('2026-06-09T13:00:00Z'));           // mardi 15h
    const yes=await callFn('redeemReward',{rewardId:'m1_p1'},await idTokenOf('s1@t.fr'));
    check('Échange dans le créneau : accepté',yes.cost===150,yes);
    await db.doc('_testClock/now').delete();
  });

  await T('expiration',async()=>{
    const now=Date.now();
    await mkUser('e1',{points:400,xp:900,lastActivityAt:Timestamp.fromMillis(now-200*DAY)});
    await mkUser('e2',{points:400,xp:900,lastActivityAt:Timestamp.fromMillis(now-100*DAY)});
    await mkUser('e3',{points:0,xp:10,lastActivityAt:Timestamp.fromMillis(now-300*DAY)});
    const r=await P.expireInactive(now);
    const e1=(await db.doc('users/e1').get()).data(),e2=(await db.doc('users/e2').get()).data();
    check('Après 6 mois sans activité : le solde tombe à 0, l\'xp (statut) ne bouge pas',e1.points===0&&e1.xp===900,e1);
    check('Activité il y a 100 jours : points conservés',e2.points===400,e2);
    const log=await db.collection('pointsExpirations').where('userId','==','e1').get();
    check('Expiration journalisée (points perdus = 400) ; compte à 0 point ignoré',log.size===1&&log.docs[0].data().points===400&&r.expired===1,{r,n:log.size});
    check('L\'expiration à 6 mois vient de la config (pas de constante en dur)',CFG.POINTS.EXPIRY_MONTHS===6);
  });

  console.log('\n'+pass+' ok, '+fail+' échec(s)');process.exit(fail?1:0);
})();
