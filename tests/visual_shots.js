// Captures de chaque écran de l'app (390×844 et 360×640) pour la revue visuelle. Pas de vérification :
// sert à comparer avant / après une retouche de design. Lancer : SUITES=visual_shots sh tests/run.sh
// Les images vont dans /tmp/shots/visual/ (ou $SHOTS_DIR).
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const fs=require('fs');
const puppeteer=require('puppeteer-core');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const wf=(p,fn,arg,t=30000)=>p.waitForFunction(fn,{timeout:t,polling:200},arg);
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const CHROME=(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const APP='http://localhost:8950/app.html';
const OUT=process.env.SHOTS_DIR||'/tmp/shots/visual';
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  await wipe();
  await db.doc('merchants/m1').set({role:'merchant',ownerUid:'m1',brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:'m1@shop.fr',verifiedPopupShown:true,address:'12 rue de la République, 72000 Le Mans'});
  await db.doc('merchants/m2').set({role:'merchant',ownerUid:'m2',brandName:'Café Plumes',name:'Café Plumes',sector:'Café',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:'m2@shop.fr',verifiedPopupShown:true});
  const qs=[['Quelle est ta boisson préférée le matin ?',['Café','Thé','Chocolat chaud']],['Tu viendrais pour un brunch le dimanche ?',['Oui, sûrement','Peut-être','Non']]];
  for(let i=0;i<qs.length;i++)await db.doc('campaigns/c'+i).set({merchantId:i?'m2':'m1',merchantName:i?'Café Plumes':'Le Fournil',sector:i?'Café':'Boulangerie',status:'active',targetCity:'le-mans',city:'le-mans',question:qs[i][0],questions:[{q:qs[i][0],format:'mcq',options:qs[i][1]}],targetVolume:500,answersCount:40+i*7,createdAt:Timestamp.now()});
  const labels=['Café offert','Croissant offert','Baguette offerte','Menu midi -20 %','Panier surprise'];
  for(let i=0;i<5;i++)await db.doc('rewards/m1_p'+(i+1)).set({merchantId:'m1',merchantName:'Le Fournil',city:'le-mans',label:labels[i],tier:i+1,slot:i+1,cost:[150,300,500,900,1500][i],priceConfirmed:true,monthlyQuota:20,timeSlots:[],withPurchase:false,minPurchase:null,status:'approved',active:true,approved:true,redeemedCount:0,icon:'',createdAt:Timestamp.now()});
  await db.doc('merchantPosts/p1').set({merchantId:'m1',merchantName:'Le Fournil',text:'Suite à vos avis, nous ouvrons dès 6h30 le samedi. Merci à tous pour vos retours !',campaignIds:['c0'],status:'published',city:'le-mans',createdAt:Timestamp.now(),publishedAt:Timestamp.now()});
  await db.doc('users/me').set({role:'user',welcomeClaimed:true,name:'Camille',email:'me@t.fr',city:'le-mans',cityLabel:'Le Mans',authorizedMerchants:['m1','m2'],friendUids:[],answeredCampaigns:[],points:420,xp:1300,streak:4,interests:['restauration'],onboardingStep:'done',seenHomeTour:true});
  await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});
  // Amis (classement), notifications (demande d'ami avec apostrophe, message NOOVA)
  await db.doc('users/me').update({friendUids:['f1','f2'],streak:4});
  await db.doc('users/f1').set({role:'user',name:"Inès N'Diaye",city:'le-mans',cityLabel:'Le Mans',friendUids:['me'],xp:2400,points:200,streak:9,onboardingStep:'done'});
  await db.doc('users/f2').set({role:'user',name:'Hugo',city:'le-mans',cityLabel:'Le Mans',friendUids:['me'],xp:800,points:90,streak:2,onboardingStep:'done'});
  await db.doc('users/f3').set({role:'user',name:"Chloé D'Amico",city:'le-mans',cityLabel:'Le Mans',friendUids:[],xp:100,onboardingStep:'done'});
  await db.doc('users/me/notifications/friendreq_f3').set({type:'friend_request',fromUid:'f3',fromName:"Chloé D'Amico",read:false,createdAt:Timestamp.now()});
  await db.doc('users/me/notifications/n2').set({type:'noova_message',message:'Le Fournil a publié une nouveauté suite à vos avis.',read:false,createdAt:Timestamp.now()});
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox'].concat(process.env.CHROME_PROXY?['--proxy-server='+process.env.CHROME_PROXY,'--proxy-bypass-list=localhost;127.0.0.1']:[])});
  for(const [w,h,label] of [[390,844,'390'],[360,640,'360']]){
    const ctx=await browser.createBrowserContext();const p=await ctx.newPage();
    await p.setViewport({width:w,height:h,isMobile:true,hasTouch:true,deviceScaleFactor:2});
    // Réseau restreint (CI, bac à sable) : FIREBASE_SDK_DIR sert le SDK depuis une copie locale (npm pack firebase@10.12.2).
    if(process.env.FIREBASE_SDK_DIR){await p.setRequestInterception(true);p.on('request',r=>{const u=r.url();const m=u.match(/gstatic\.com\/firebasejs\/[^/]+\/(.+\.js)/);if(m){try{return r.respond({status:200,contentType:'text/javascript',body:fs.readFileSync(process.env.FIREBASE_SDK_DIR+'/'+m[1])});}catch(e){return r.abort();}}if(/^https?:\/\/(localhost|127\.0\.0\.1)/.test(u)||u.startsWith('data:'))return r.continue();return r.abort();});}
    const shot=async(name,full)=>{await sleep(900);await p.screenshot({path:`${OUT}/${label}_${name}.png`,fullPage:false});if(full){const el=await p.$('.screen.active');if(el){const H=await p.evaluate(e=>e.scrollHeight,el);let y=h;let k=1;while(y<H&&k<5){await p.evaluate((e,y)=>e.scrollTop=y,el,y);await sleep(400);await p.screenshot({path:`${OUT}/${label}_${name}_${k}.png`});y+=h-80;k++;}await p.evaluate(e=>e.scrollTop=0,el);}}};
    await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'));
    await shot('onboard');
    await p.evaluate(()=>showAuthWall('login'));await shot('auth');
    await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active'));await sleep(2500);
    await shot('home',true);
    for(const id of ['social','rewards-tab','profile']){await p.evaluate(id=>goNav(id),id);await sleep(1500);await shot(id,true);}
    const extra=['how-it-works','brands','manage-merchants','privacy-data'];
    for(const id of extra){await p.evaluate(id=>{try{goTo(id)}catch(e){}},id);await sleep(1200);await shot(id);}
    await p.evaluate(()=>goNav('home'));await sleep(1200);
    await p.evaluate(()=>{try{openRewardsSheet()}catch(e){}});await sleep(1200);await shot('rewards-sheet');
    await p.evaluate(()=>{try{closeRewardsSheet()}catch(e){}goNav('home')});await sleep(800);
    await p.evaluate(()=>{try{openBrandById('m1','Le Fournil')}catch(e){}});await sleep(1500);await shot('brand-page',true);
    await p.evaluate(()=>goNav('home'));await sleep(800);
    await p.evaluate(()=>goNav('social'));await sleep(1200);
    await p.evaluate(()=>{const b=[...document.querySelectorAll('#social .tab-btn')].find(x=>/Classement/.test(x.textContent));if(b)b.click();});await sleep(1500);await shot('ranking',true);
    await p.evaluate(()=>toggleNotifPanel());await sleep(900);await shot('notif-panel');
    await p.evaluate(()=>closeNotifPanel());
    await p.evaluate(()=>goNav('profile'));await sleep(800);
    await p.evaluate(()=>{const h=document.querySelector('#notif-section .sc-hdr');if(h){h.click();h.scrollIntoView();}});await sleep(900);await shot('notif-settings');
    await p.evaluate(()=>askPerm({key:'shots',force:true,title:'Être prévenu des nouvelles questions',text:'Une notification quand un commerce que tu suis pose une question.',cta:'Activer',onAccept:()=>{}}));await sleep(600);await shot('perm-sheet');
    await p.evaluate(()=>permLater());
    await p.evaluate(()=>showCelebration({icon:'fire',title:'7 jours d’affilée !',subtitle:'Ta régularité paie — continue comme ça.'}));await sleep(900);await shot('celebrate-streak');
    await p.evaluate(()=>{try{closeCelebration()}catch(e){}goNav('home')});await sleep(800);
    await p.evaluate(()=>openQ(0));await sleep(2000);await shot('question');
    await p.evaluate(()=>{const b=document.querySelector('#question .qopt, #question [class*="opt"]:not([class*="opts"])');if(b)b.click();});await sleep(800);await shot('question-selected');
    await ctx.close();
  }
  await browser.close();
  console.log('PASS captures dans '+OUT);
  process.exit(0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,500));process.exit(1);});
