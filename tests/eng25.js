// Refonte de l'accueil, des cadeaux, des questions et du fil : en-tête NOOVS / série / points, deux prochaines récompenses côte à côte,
// écran Cadeaux réordonné (points, en cours, NOOVS, XP), questions « bulle » et « plein écran » en alternance, fil tourné vers les commerces
// autorisés (nouveautés, à la une), paliers d'xp et compatibilité des amis ; côté commerçant, nature de la publication.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const TIERS=require(__dirname+'/../functions/tiers.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,3).join(' | '));}};
const wf=(p,fn,arg,t=25000)=>p.waitForFunction(fn,{timeout:t,polling:200},arg);
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const CHROME=(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const APP='http://localhost:8950/app.html',DASH='http://localhost:8950/dash.html';
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
const AXE=require('fs').readFileSync(require('path').join(__dirname,'node_modules/axe-core/axe.min.js'),'utf8');
const axeCheck=async(p,name)=>{await p.evaluate(AXE);const r=await p.evaluate(async()=>{const res=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}});return res.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id+' ×'+v.nodes.length+' '+v.nodes.slice(0,3).map(n=>n.target.join(' ')+' '+((n.any[0]&&n.any[0].data&&n.any[0].data.fgColor)?n.any[0].data.fgColor+'/'+n.any[0].data.bgColor+' '+n.any[0].data.contrastRatio:'')).join(' ; '));});check('Accessibilité (axe, contraste compris) : '+name,r.length===0,r);};
const day=ms=>new Date(ms).toLocaleDateString('sv-SE',{timeZone:'Europe/Paris'});
const rw=(mid,tier,o={})=>({merchantId:mid,merchantName:'Le Fournil',city:'le-mans',label:['Café offert','Viennoiserie','Menu midi','Panier surprise','Gros lot'][tier-1],icon:'',tier,slot:tier,cost:TIERS[tier-1].pts,priceConfirmed:true,monthlyQuota:50,timeSlots:[],withPurchase:false,minPurchase:null,status:'approved',active:true,approved:true,redeemedCount:0,createdAt:Timestamp.now(),...o});
const mkCamp=(id,o={})=>db.doc('campaigns/'+id).set({merchantId:'m1',merchantName:'Le Fournil',sector:'Boulangerie',status:'active',targetCity:'le-mans',city:'le-mans',question:'Quelle boisson préfères-tu ?',questions:[{q:'Quelle boisson préfères-tu ?',format:'mcq',options:['Café','Thé','Chocolat']}],targetVolume:500,answersCount:0,createdAt:Timestamp.now(),...o});
const ansX=(u,cid,opt)=>db.doc(`answers/${u}_${cid}_q0`).set({userId:u,campaignId:cid,merchantId:'m1',brand:'Le Fournil',questionIdx:0,answer:['Café','Thé','Chocolat'][opt],optionIdx:opt,respondentCity:'le-mans',category:'boulangerie',flagged:false,pointsAwarded:0,createdAt:Timestamp.now()});
const login=async(p,email)=>{await p.goto(APP,{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email',email);await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());};

(async()=>{
  await wipe();
  await db.doc('merchants/m1').set({role:'merchant',ownerUid:'m1',brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:'m1@shop.fr',seenDashTour:true,verifiedPopupShown:true,cashierAck:true});
  await db.doc('merchants/m2').set({role:'merchant',ownerUid:'m2',brandName:'Le Bar',name:'Le Bar',sector:'Restauration',city:'le-mans',cityLabel:'Le Mans',status:'verified'});
  for(let t=1;t<=5;t++)await db.doc('rewards/m1_p'+t).set(rw('m1',t));
  for(let i=1;i<=8;i++)await mkCamp('c'+i,{question:'Question '+i+' ?',questions:[{q:'Question '+i+' ?',format:i<=5?'mcq':i===6?'text':'scale',options:['Café','Thé','Chocolat']}]});
  const base={role:'user',welcomeClaimed:true,city:'le-mans',cityLabel:'Le Mans',friendUids:[],answeredCampaigns:[],interests:['restauration'],onboardingStep:'done',seenHomeTour:true};
  await db.doc('users/me').set({...base,name:'Alex',email:'me@t.fr',authorizedMerchants:['m1'],friendUids:['f1'],points:120,xp:410,noovs:7,streak:4,streakDate:day(Date.now()),lastAnswerDate:day(Date.now())});
  await db.doc('users/f1').set({...base,name:'Léa',friendUids:['me'],xp:1010,streak:5,points:10,authorizedMerchants:['m1']});
  await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});await aauth.createUser({uid:'m1',email:'m1@shop.fr',password:'secret123'});
  // 5 questions en commun avec Léa : d'accord sur 4 → 80 % de compatibilité
  for(let i=1;i<=5;i++){await ansX('me','c'+i,i%3);await ansX('f1','c'+i,i===5?(i+1)%3:i%3);}
  const now=Date.now(),ev=(id,o)=>db.doc('communityEvents/'+id).set({likeCount:0,commentCount:0,city:'le-mans',createdAt:Timestamp.fromMillis(now-1000),...o});
  await ev('lv',{type:'levelup',level:'Actif',userId:'f1',displayName:'Léa',text:'a atteint le palier Actif',brand:''});
  await ev('n_new',{type:'merchant_post',kind:'new',merchantId:'m1',userId:null,displayName:'Le Fournil',brand:'Le Fournil',text:'Nouveau : le pain au levain du dimanche.',createdAt:Timestamp.fromMillis(now-2000)});
  await ev('n_top',{type:'merchant_post',kind:'top',merchantId:'m1',userId:null,displayName:'Le Fournil',brand:'Le Fournil',text:'Cette semaine : deux viennoiseries pour un café.',createdAt:Timestamp.fromMillis(now-3000)});
  await ev('n_news',{type:'merchant_post',kind:'news',merchantId:'m1',userId:null,displayName:'Le Fournil',brand:'Le Fournil',text:'Fermé lundi pour travaux.',createdAt:Timestamp.fromMillis(now-4000)});
  await ev('n_bar',{type:'merchant_post',kind:'news',merchantId:'m2',userId:null,displayName:'Le Bar',brand:'Le Bar',text:'Soirée jeux ce soir.',createdAt:Timestamp.fromMillis(now-500)});   // commerce NON autorisé
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const p=await browser.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(/Feed/.test(m.text()))console.log('CONSOLE',m.text().slice(0,300));});await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:2});
  await login(p,'me@t.fr');
  await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user&&S.qs.length>=1&&(S._rewardsCache||[]).length===5,null,30000);
  await p.addStyleTag({content:'body>div[style*="emulator"]{display:none!important}'});await sleep(900);
  await p.evaluate(()=>{document.querySelectorAll('[id*=tour],.tour-ov').forEach(e=>e.remove());});

  await T('en-tête',async()=>{
    const h=await p.evaluate(()=>{const b=[...document.querySelectorAll('#home .dh-hdr > *')];const r=b.map(e=>e.getBoundingClientRect());return {cls:b.map(e=>e.className),txt:b.map(e=>e.textContent.replace(/\s+/g,' ').trim()),left:r[0].left,mid:(r[1].left+r[1].right)/2,right:r[2].right,vw:innerWidth,streakOn:document.getElementById('hdr-streak').classList.contains('on'),label:document.getElementById('hdr-streak').getAttribute('aria-label'),greet:/Bonjour|Bon après-midi|Bonsoir/.test(document.getElementById('home').innerText),coin:document.getElementById('hdr-coin').textContent,flag:!!document.querySelector('#hdr-flame svg')};});
    check('En-tête : NOOVS à gauche (« N » en pièce + 7), série au centre (flamme + 4), points à droite (120 PTS)',h.cls.map(c=>c.split(' ')[0]).join('|')==='dh-noov|dh-streak|dh-pts'&&h.txt[0]==='N7'&&h.txt[1]==='4'&&/^120\s*PTS$/.test(h.txt[2])&&h.flag&&h.left<40&&Math.abs(h.mid-h.vw/2)<40&&h.right>h.vw-40,h);
    check('Plus de « Bonjour » ni de prénom sur l\'accueil ; plus de carte de série dans la page',!h.greet&&!(await p.evaluate(()=>!!document.querySelector('.dstreak-card,#home-name,#home-av'))));
    check('Flamme allumée quand la journée est validée (3 réponses), avec un libellé lisible pour les lecteurs d\'écran',h.streakOn&&/Série de 4 jours/.test(h.label)&&/validée/.test(h.label),h.label);
    await p.evaluate(()=>{S._streakDate='2020-01-01';renderHeaderStats();});
    const off=await p.evaluate(()=>({on:document.getElementById('hdr-streak').classList.contains('on'),label:document.getElementById('hdr-streak').getAttribute('aria-label')}));
    check('Journée pas encore validée : flamme éteinte, libellé « Réponds à 3 questions aujourd\'hui »',!off.on&&/3 questions/.test(off.label),off);
    await p.evaluate(()=>{S._streakDate=parisToday();S.noovs=12;renderHeaderStats();});
    check('Les NOOVS de l\'en-tête suivent le solde',await p.$eval('#home-noovs',e=>e.textContent)==='12');
    await p.evaluate(()=>{NV_ASSETS.coin='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><circle cx="4" cy="4" r="4" fill="orange"/></svg>';renderHeaderStats();});
    check('Images personnalisées : renseigner NV_ASSETS.coin remplace la pièce par ton image (rien d\'autre à changer)',await p.evaluate(()=>!!document.querySelector('#hdr-coin img')));
    await p.evaluate(()=>{NV_ASSETS.coin='';renderHeaderStats();});
    await p.screenshot({path:'/tmp/shots/home_header.png'});await axeCheck(p,'accueil (en-tête NOOVS / série / points)');
  });

  await T('prochaines récompenses',async()=>{
    const d=await p.evaluate(()=>{const cards=[...document.querySelectorAll('#dpat-wrap .dpat-mini')].map(c=>{const r=c.getBoundingClientRect();return {t:Math.round(r.top),h:Math.round(r.height),l:Math.round(r.left),w:Math.round(r.width),txt:c.innerText.replace(/\s+/g,' ')};});return {cards,hdr:document.querySelector('#dpat-wrap .dsec-h').textContent,old:!!document.querySelector('#dpat-wrap .dpat-card')};});
    check('« Ta prochaine récompense » : deux petites cartes côte à côte (même hauteur, 2 colonnes), les plus proches d\'abord (150 pts puis 300 pts)',d.cards.length===2&&d.cards[0].t===d.cards[1].t&&d.cards[0].l<d.cards[1].l&&d.cards[0].w<200&&/Café offert/.test(d.cards[0].txt)&&/encore 30 pts/.test(d.cards[0].txt)&&/Viennoiserie/.test(d.cards[1].txt)&&/encore 180 pts/.test(d.cards[1].txt),d);
    check('… nettement plus petites qu\'avant (moins de 110 px de haut, plus de grande carte photo)',d.cards.every(c=>c.h<110)&&!d.old,d.cards.map(c=>c.h));
    await p.evaluate(()=>document.querySelector('#dpat-wrap .dpat-mini').click());await sleep(700);
    check('Toucher une carte ouvre l\'écran Cadeaux',await p.evaluate(()=>document.getElementById('rewards-tab').classList.contains('active')));
  });

  await T('écran Cadeaux',async()=>{
    await sleep(600);
    const w=await p.evaluate(()=>{const top=id=>{const e=document.getElementById(id)||document.querySelector(id);return e?Math.round(e.getBoundingClientRect().top+document.getElementById('rewards-tab').scrollTop):-1;};
      return {pts:top('.wpts-card'),cur:top('#dprog-count'),feat:top('#reward-featured-wrap'),noov:top('.noov-card'),xp:top('#tier-track-wrap'),len:document.getElementById('rewards-tab').innerText.length,txt:document.getElementById('rewards-tab').innerText.replace(/\s+/g,' '),ptsN:document.getElementById('wc-pts-num-hdr').textContent,tiles:document.querySelectorAll('#noov-rewards .noov-tile').length,longp:[...document.querySelectorAll('#rewards-tab p, #rewards-tab .noov-d, #rewards-tab .ns-d')].length};});
    check('Ordre : 1) points, 2) récompenses en cours, 3) NOOVS, 4) XP',w.pts>=0&&w.pts<w.cur&&w.cur<w.noov&&w.noov<w.xp,w);
    check('Le solde de points est en grand (120), les NOOVS (12) ont leur pièce',w.ptsN==='120'&&/12 NOOVS/.test(w.txt),w.ptsN);
    check('Beaucoup moins de texte : plus de paragraphe explicatif, 4 pastilles « Bientôt » d\'un mot, moins de 450 caractères en tout',w.longp===0&&w.tiles===4&&w.len<450,{len:w.len,txt:w.txt});
    await p.evaluate(()=>{NV_ASSETS.points='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>';refreshWallet();});
    check('Icône des points personnalisable (NV_ASSETS.points → image)',await p.evaluate(()=>!!document.querySelector('#wpts-ico img')));
    await p.evaluate(()=>{NV_ASSETS.points='';refreshWallet();});await sleep(300);
    await p.screenshot({path:'/tmp/shots/wallet_new.png'});await axeCheck(p,'écran Cadeaux');
  });

  await T('questions bulle / plein écran',async()=>{
    await p.evaluate(()=>goNav('home'));await sleep(400);
    const modes=await p.evaluate(()=>{const m={};for(let i=0;i<40;i++){const k=qMode({_firestoreId:'camp'+i,_questionIdx:i%3});m[k]=(m[k]||0)+1;}return {m,same:qMode({_firestoreId:'abc',_questionIdx:1})===qMode({_firestoreId:'abc',_questionIdx:1})};});
    check('Les deux mises en page sont utilisées (répartition proche de moitié-moitié) et le choix est stable pour une question donnée',modes.m.full>=10&&modes.m.bubble>=10&&modes.same,modes);
    const pickQ=async(mode,type)=>p.evaluate((mode,type)=>{for(let i=0;i<60;i++){const q={_firestoreId:'z'+i,_merchantId:'m1',brand:'Le Fournil',ico:'x',pts:10,type,q:'Quelle est ta boisson préférée du matin ?',hint:'',opts:['Café','Thé','Chocolat'],items:['Café','Thé','Chocolat'],theme:'Boulangerie',usage:'Ta réponse aide Le Fournil'};if(qMode(q)===mode){S.qs=[q];S.mode='hook';S.qIdx=0;S.curQ=q;fillQuestion(q,{skipLabel:'Passer',skipFn:"goNav('home')"});goTo('question');return true;}}return false;},mode,type);
    check('Question « plein écran » ouverte',await pickQ('full','mcq'));await sleep(700);
    const f=await p.evaluate(()=>{const q=document.getElementById('question');const o=document.querySelector('#ans-area .mcq-opt');const t=document.getElementById('q-text');return {cls:q.classList.contains('qfull'),bg:getComputedStyle(q).backgroundColor,opt:getComputedStyle(o).backgroundColor,optColor:getComputedStyle(o).color,fs:parseFloat(getComputedStyle(t).fontSize),n:document.querySelectorAll('#ans-area .mcq-opt').length,letter:getComputedStyle(o,'::before').content};});
    check('Plein écran : fond jaune, gros texte de question (34 px), gros blocs noirs numérotés A/B/C',f.cls&&/rgb\(255, 195, 0\)/.test(f.bg)&&f.fs>=32&&f.n===3&&/rgb\(28, 25, 23\)/.test(f.opt)&&/upper-alpha|"A"/.test(f.letter),f);
    await p.evaluate(()=>document.querySelector('#ans-area .mcq-opt').click());await sleep(300);
    await p.screenshot({path:'/tmp/shots/q_full.png'});await axeCheck(p,'question plein écran (choix sélectionné)');
    check('Question « bulle » ouverte',await pickQ('bubble','mcq'));await sleep(700);
    const b=await p.evaluate(()=>{const q=document.getElementById('question');const o=document.querySelector('#ans-area .mcq-opt');return {cls:q.classList.contains('qfull'),bg:getComputedStyle(q).backgroundColor,fs:parseFloat(getComputedStyle(document.getElementById('q-text')).fontSize),optBg:getComputedStyle(o).backgroundColor};});
    check('Bulle : fond clair habituel (pas de jaune plein), texte de 23 px, cartes claires',!b.cls&&!/rgb\(255, 195, 0\)/.test(b.bg)&&b.fs<26&&!/^rgb\(28, 25, 23\)$/.test(b.optBg),b);
    await p.screenshot({path:'/tmp/shots/q_bubble.png'});await axeCheck(p,'question bulle');
    for(const t of ['scale','text','rank']){await pickQ('full',t);await sleep(500);}
    await p.screenshot({path:'/tmp/shots/q_full_rank.png'});await axeCheck(p,'question plein écran (classement)');
    await pickQ('full','scale');await sleep(400);await axeCheck(p,'question plein écran (échelle)');
    await pickQ('full','text');await sleep(400);await axeCheck(p,'question plein écran (texte libre)');
    await p.evaluate(()=>{S.qs=[];goNav('home');});
  });

  await T('fil',async()=>{
    await p.evaluate(()=>{S.friends=S.friends||[];goNav('social');});
    try{await wf(p,()=>document.querySelectorAll('#feed-content .feed-post').length>=5,null,25000);}catch(e){console.log('FAIL DBG',JSON.stringify(await p.evaluate(()=>({n:document.querySelectorAll('#feed-content .feed-post').length,txt:document.getElementById('feed-content').innerText.slice(0,300),fr:(S.friends||[]).map(f=>f.uid),am:S._authorizedMerchants}))));throw e;}
    await sleep(800);
    const f=await p.evaluate(()=>({cards:[...document.querySelectorAll('#feed-content .feed-post')].map(e=>({cls:e.className,txt:e.textContent.replace(/\s+/g,' ').trim()})),all:document.getElementById('panel-feed').innerText.replace(/\s+/g,' '),title:document.querySelector('#panel-feed .cm-sec').textContent}));
    check('Fil : « Tes avis ont aidé 1 commerce » (calculée localement) en toute première carte',f.cards[0]&&/cm-mine/.test(f.cards[0].cls)&&/Tes avis ont aidé 1 commerce/.test(f.cards[0].txt),f.cards[0]);
    check('Fil : « À la une » (jaune plein), « Nouveauté » (encadré jaune), « Actualité » — uniquement des commerces autorisés (Le Bar exclu)',f.cards.some(c=>/cm-k-top/.test(c.cls)&&/À la une/.test(c.txt)&&/deux viennoiseries/.test(c.txt))&&f.cards.some(c=>/cm-k-new/.test(c.cls)&&/Nouveauté/.test(c.txt)&&/levain/.test(c.txt))&&f.cards.some(c=>/cm-news/.test(c.cls)&&/Actualité/.test(c.txt)&&/travaux/.test(c.txt))&&!/Le Bar|jeux/.test(f.all),f.cards.map(c=>c.cls));
    check('Fil : palier d\'xp d\'une amie (« Léa a atteint le palier Actif »)',f.cards.some(c=>/cm-level/.test(c.cls)&&/Léa/.test(c.txt)&&/palier Actif/.test(c.txt)),f.cards.map(c=>c.txt));
    check('Fil : carte de compatibilité « 80 % de compatibilité avec Léa » intercalée, qui ouvre le profil de l\'amie',f.cards.some(c=>/cm-compat/.test(c.cls)&&/80 %/.test(c.txt)&&/Léa/.test(c.txt)),f.cards.map(c=>c.cls+':'+c.txt.slice(0,30)));
    check('Fil : aucune réponse d\'autrui, aucun « chiffre de la ville »',!/a répondu|Comment la ville|réponses de voisins/.test(f.all),f.all.slice(0,160));
    const order=f.cards.map(c=>/cm-mine/.test(c.cls)?'M':/cm-compat/.test(c.cls)?'C':/cm-k-top/.test(c.cls)?'T':/cm-k-new/.test(c.cls)?'N':/cm-level/.test(c.cls)?'L':/cm-news/.test(c.cls)?'A':'?').join('');
    check('Le fil est varié : plusieurs natures de cartes, « tes avis » en tête, la compatibilité juste après la première actualité',new Set(order.split('')).size>=5&&order[0]==='M'&&order[2]==='C',order);
    await p.evaluate(()=>document.querySelector('#feed-content .cm-compat').click());await sleep(900);
    check('Toucher la compatibilité ouvre le profil de l\'amie',await p.evaluate(()=>document.getElementById('fprofile').classList.contains('active')&&/Léa/.test(document.getElementById('fp-body').textContent)));
    await p.evaluate(()=>goNav('social'));await sleep(500);
    await p.screenshot({path:'/tmp/shots/feed_new.png'});await axeCheck(p,'fil : nouvelles cartes');
    // sans autoriser Le Fournil : plus aucune actualité
    await db.doc('users/me').update({authorizedMerchants:[]});
    await p.evaluate(()=>{S._authorizedMerchants=[];loadCommunityFeed();});await sleep(1800);
    const f2=await p.evaluate(()=>document.getElementById('feed-content').innerText.replace(/\s+/g,' '));
    check('Sans commerce autorisé : plus aucune actualité de commerce dans le fil (Léa reste : c\'est une amie)',!/levain|viennoiseries|travaux/.test(f2)&&/Léa/.test(f2),f2.slice(0,200));
    check('Aucune erreur JavaScript dans l\'app',errs.length===0,errs);
  });

  await T('dashboard : nature de la publication',async()=>{
    const m=await browser.newPage();const merrs=[];m.on('pageerror',e=>merrs.push(e.message));await m.setViewport({width:1280,height:1000});
    await m.evaluateOnNewDocument(()=>{try{localStorage.setItem('nv_pro_intro','1');}catch(e){}});
    await m.goto(DASH,{waitUntil:'load'});await wf(m,()=>document.getElementById('auth-wall').style.display==='flex',null,30000);
    await m.evaluate(()=>awTab('login'));await setVal(m,'#aw-email','m1@shop.fr');await setVal(m,'#aw-pass','secret123');await m.evaluate(()=>awSubmit());
    await wf(m,()=>typeof _mData!=='undefined'&&_mData&&_mData.brandName==='Le Fournil',null,25000);
    await m.evaluate(()=>{try{endDashTour();}catch(e){}navTo('news',document.getElementById('nav-news'));});await sleep(800);
    const f=await m.evaluate(()=>({opts:[...document.querySelectorAll('#news-kind option')].map(o=>o.value),def:document.getElementById('news-kind').value,camps:getComputedStyle(document.getElementById('news-camps-wrap')).display}));
    check('Nature de la publication : actualité (par défaut), nouveauté, à la une, suite à vos avis ; le rattachement aux questions n\'apparaît que pour « suite à vos avis »',f.opts.join()==='news,new,top,impact'&&f.def==='news'&&f.camps==='none',f);
    await setVal(m,'#news-text','Nouveau : notre pain au levain le dimanche matin.');await m.select('#news-kind','new');await m.evaluate(()=>submitNews());await sleep(1500);
    const ps=(await db.collection('merchantPosts').where('merchantId','==','m1').get()).docs.map(d=>d.data());
    check('Publication « Nouveauté » enregistrée avec sa nature, en attente de validation, sans questions rattachées',ps.length===1&&ps[0].kind==='new'&&ps[0].status==='pending'&&ps[0].campaignIds.length===0,ps);
    const id=(await db.collection('merchantPosts').get()).docs[0].id;
    await db.doc('merchantPosts/'+id).update({status:'published',publishedAt:Timestamp.now(),reviewedAt:Timestamp.now()});
    let e=null;for(let i=0;i<30&&!e;i++){await sleep(400);e=(await db.doc('communityEvents/post_'+id).get()).data();}
    check('Une fois validée : événement du fil avec la nature « new », lié au commerce (visible des seuls habitants qui l\'ont autorisé) ; aucune notification « Ton avis a compté »',e&&e.kind==='new'&&e.merchantId==='m1'&&(await db.doc('merchantPosts/'+id).get()).data().notifyNote==='feed_only',e);
    await m.select('#news-kind','impact');
    check('« Suite à vos avis » : le choix des questions à rattacher réapparaît',await m.evaluate(()=>getComputedStyle(document.getElementById('news-camps-wrap')).display!=='none'));
    check('Aucune erreur JavaScript dans le dashboard',merrs.length===0,merrs);
  });

  await browser.close();
  console.log('\n'+pass+' ok, '+fail+' échec(s)');process.exit(fail?1:0);
})();
