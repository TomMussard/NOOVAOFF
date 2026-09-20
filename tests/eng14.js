process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');
const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const {Timestamp}=admin.firestore;
const E=require(__dirname+'/../functions/engagement.js')._t;
const CFG=require(__dirname+'/../functions/engagementConfig.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
let PG=null;const T=async(n,fn)=>{try{await fn();}catch(e){if(PG){console.log('DBG',JSON.stringify(await PG.evaluate(()=>({cur,fr:(S.friends||[]).map(f=>f.uid),wrap:(document.getElementById('compat-wrap')||{}).style&&document.getElementById('compat-wrap').style.display,list:(document.getElementById('compat-list')||{}).innerHTML,cache:S._compat&&S._compat.data})).catch(x=>String(x))).slice(0,1500));await PG.screenshot({path:'/tmp/shots/dbg2.png'});}fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,3).join(' | '));}};
const wf=(p,fn,arg,t=25000)=>p.waitForFunction(fn,{timeout:t,polling:200},arg);
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const CHROME=(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const APP='http://localhost:8950/app.html';
const Q='Quelle est ta boisson préférée ?';
const OPTS=['Café','Thé','Chocolat'];
async function wipe(){await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});await sleep(300);}
async function mkUser(uid,o={}){await db.doc('users/'+uid).set({role:'user',name:'User '+uid,city:'le-mans',cityLabel:'Le Mans',authorizedMerchants:['m1'],friendUids:[],answeredCampaigns:[],points:0,xp:0,streak:0,interests:['restauration'],onboardingStep:'done',seenHomeTour:true,...o});}
async function mkCampaign(id,o={}){await db.doc('campaigns/'+id).set({merchantId:'m1',merchantName:'Le Fournil',sector:'Boulangerie',status:'active',targetCity:'le-mans',city:'le-mans',question:Q,questions:[{q:Q,format:'mcq',options:OPTS}],targetVolume:500,answersCount:0,createdAt:Timestamp.now(),...o});}
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const SITE='http://localhost:8950/';
const rd=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const PIXEL='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const ANALYTICS_RE=/googletagmanager\.com|google-analytics\.com|firebase-analytics|analytics\.google\.com/;
// Ouvre une page en enregistrant (et bloquant) toute requête d'analyse : les tests ne polluent jamais les statistiques réelles.
async function openWatched(browser,url,{viewport={width:390,height:844}}={}){
  const ctx=await browser.createBrowserContext();const p=await ctx.newPage();await p.setViewport(viewport);
  p.__analytics=[];p.__external=[];
  await p.setRequestInterception(true);
  p.on('request',r=>{const u=r.url();if(ANALYTICS_RE.test(u)){p.__analytics.push(u);return r.abort();}
    if(!/^(http:\/\/(localhost|127\.0\.0\.1)|data:|blob:|about:)/.test(u))p.__external.push(u);r.continue();});
  await p.goto(url,{waitUntil:'load'});return p;
}
const banner=p=>p.evaluate(()=>{const b=document.getElementById('nv-consent');if(!b||b.hidden)return null;const r=b.getBoundingClientRect();const btns=[...b.querySelectorAll('button')].map(x=>{const c=getComputedStyle(x),q=x.getBoundingClientRect();return {t:x.textContent.trim(),bg:c.backgroundColor,fg:c.color,bd:c.borderColor,fs:c.fontSize,fw:c.fontWeight,w:Math.round(q.width),h:Math.round(q.height)};});return {visible:r.height>0,role:b.querySelector('[role=dialog]')&&b.querySelector('[role=dialog]').getAttribute('aria-labelledby'),btns,first:document.body.firstElementChild===b};});
const stored=p=>p.evaluate(()=>{try{return JSON.parse(localStorage.getItem('nv_consent'));}catch(e){return 'ERR';}});
const T2=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e).slice(0,300));}};

(async()=>{
  // ══════════ A. Vérifications statiques du dépôt ══════════
  await T2('statique',async()=>{
    const pages=fs.readdirSync(ROOT).filter(f=>/\.html$/.test(f));
    const forbidden=/fonts\.googleapis|fonts\.gstatic|unpkg\.com|cdn\.jsdelivr|dns\.google|cdnjs/;
    check('Aucune ressource tierce de police/CDN/DNS dans les pages ('+pages.length+' fichiers)',pages.every(f=>!forbidden.test(rd(f))),pages.filter(f=>forbidden.test(rd(f))));
    check('Google Analytics : aucune balise dans app_DEF.html (Firebase Analytics est soumis au consentement)',!/googletagmanager/.test(rd('app_DEF.html')));
    const idx=rd('index.html');const gi=idx.indexOf('googletagmanager');
    check('Landing : la balise Google n\'existe que dans un bloc « whenGranted » (jamais chargée d\'office)',gi>0&&idx.lastIndexOf('whenGranted',gi)>idx.lastIndexOf('</script>',gi)&&(idx.match(/googletagmanager\.com\/gtag/g)||[]).length===1);
    check('consent.js chargé dans l\'app, la landing et chaque page légale',['app_DEF.html','index.html','cookies.html','confidentialite.html','cgu.html','mentions-legales.html','accessibilite.html'].every(f=>/src="\/consent\.js"/.test(rd(f))));
    // images : toutes avec alt (balises statiques ET gabarits JS)
    const bad=[];pages.forEach(f=>{const t=rd(f).replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+\/=]+/g,'data:IMG');(t.match(/<img\b[^>]*>/g)||[]).forEach(tag=>{if(!/\balt=/.test(tag))bad.push(f+' : '+tag.slice(0,90));});});
    check('Chaque balise <img> (statique ou dans un gabarit JS) porte un attribut alt',bad.length===0,bad);
    check('Images à sujet : alt descriptif (logo, photo de commerce, photo de profil, récompense)',(rd('app_DEF.html').match(/alt="(Logo de|Photo de|Ma photo de profil|Photo de la récompense|Logo Noova)/g)||[]).length>=6);
    // domaine, SEO, agents IA
    const all=pages.map(rd).join('\n')+rd('robots.txt')+rd('sitemap.xml')+rd('llms.txt');
    check('Plus aucun ancien domaine (noova.fr, noovaoff.vercel.app) dans les pages',!/https?:\/\/(www\.)?noova\.fr|noovaoff\.vercel\.app/.test(all),all.match(/https?:\/\/[^"' )]*(noova\.fr|vercel\.app)[^"' )]*/g));
    check('Canonical de la landing et de l\'app sur https://www.noovaoff.fr',/rel="canonical" href="https:\/\/www\.noovaoff\.fr\/"/.test(idx)&&/rel="canonical" href="https:\/\/www\.noovaoff\.fr\/app"/.test(rd('app_DEF.html')));
    const ld=[...idx.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)].map(m=>JSON.parse(m[1]));
    const g=ld[0]['@graph'];const faq=g.find(x=>x['@type']==='FAQPage');
    check('JSON-LD valide : WebSite, Organization, WebApplication et FAQPage (5 questions, textes identiques à la page)',['WebSite','Organization','WebApplication','FAQPage'].every(t=>g.some(x=>x['@type']===t))&&faq.mainEntity.length===5&&faq.mainEntity.every(q=>idx.replace(/<[^>]+>/g,'').includes(q.name)),g.map(x=>x['@type']));
    const robots=rd('robots.txt'),sm=rd('sitemap.xml');
    check('robots.txt : indexation autorisée, dashboard/admin exclus, sitemap déclaré, assistants IA nommés',/User-agent: \*\s+Allow: \//.test(robots)&&/Disallow: \/dashboard/.test(robots)&&/Disallow: \/noova_admin\.html/.test(robots)&&/Sitemap: https:\/\/www\.noovaoff\.fr\/sitemap\.xml/.test(robots)&&['GPTBot','ClaudeBot','PerplexityBot','Google-Extended'].every(b=>robots.includes(b)));
    const locs=[...sm.matchAll(/<loc>https:\/\/www\.noovaoff\.fr\/?([^<]*)<\/loc>/g)].map(m=>m[1]);
    check('sitemap.xml : chaque URL correspond à une page existante',locs.length>=6&&locs.every(l=>l===''||l==='app'||fs.existsSync(path.join(ROOT,l))),locs);
    check('llms.txt : titre, résumé et liens vers les pages légales',/^# Noova/.test(rd('llms.txt'))&&/^> /m.test(rd('llms.txt'))&&['confidentialite','cookies','cgu','mentions-legales','accessibilite'].every(k=>rd('llms.txt').includes(k+'.html')));
    check('Dashboard et admin : noindex (meta) — et en-tête X-Robots-Tag dans vercel.json',/name="robots" content="noindex/.test(rd('noova_dashboard.html'))&&/name="robots" content="noindex/.test(rd('noova_admin.html'))&&/X-Robots-Tag/.test(rd('vercel.json')));
    const vj=JSON.parse(rd('vercel.json'));const hs=JSON.stringify(vj.headers);
    check('vercel.json : nosniff, Referrer-Policy, X-Frame-Options, Permissions-Policy',['X-Content-Type-Options','Referrer-Policy','X-Frame-Options','Permissions-Policy'].every(k=>hs.includes(k)));
    check('Le zoom n\'est pas bloqué (pas de user-scalable=no / maximum-scale) sur aucune page',pages.every(f=>!/user-scalable=no|maximum-scale/.test(rd(f).split('<script type="text/html"')[0])));
    // pages légales
    const leg=['cookies.html','confidentialite.html','cgu.html','mentions-legales.html','accessibilite.html'];
    check('Pages légales : aucune « note interne / brouillon » visible',leg.every(f=>!/draft-note|Note interne|brouillon/i.test(rd(f))));
    check('Pages légales : lien d\'évitement, <main>, un seul <h1>, lang="fr", pied de page avec « Gérer mes cookies »',leg.every(f=>{const t=rd(f);return /class="skip-link"/.test(t)&&/<main\b/.test(t)&&(t.match(/<h1\b/g)||[]).length===1&&/<html lang="fr"/.test(t)&&/data-nv-cookies/.test(t);}));
    check('Politique de cookies : traceurs nécessaires listés (nv_consent, session Firebase), mesure d\'audience, durée 13 mois / 6 mois',/nv_consent/.test(rd('cookies.html'))&&/firebaseLocalStorageDb/.test(rd('cookies.html'))&&/Google Analytics 4/.test(rd('cookies.html'))&&/13 mois/.test(rd('cookies.html'))&&/6 mois/.test(rd('cookies.html')));
    check('Chaque clé de stockage nv_* utilisée dans l\'app est documentée dans la politique de cookies',(()=>{const keys=new Set([...rd('app_DEF.html').matchAll(/(?:local|session)Storage\.(?:get|set|remove)Item\(\s*['"`](nv_[a-z_]+|noova_[a-z_0-9]+)/g)].map(m=>m[1].replace(/_$/,'')));const c=rd('cookies.html');const miss=[...keys].filter(k=>!c.includes(k));if(miss.length)console.log('   non documentées :',miss);return miss.length===0;})());
    check('Confidentialité : bases légales, liste d\'attente, sous-traitants (Supabase, OpenStreetMap), 16 ans, pas de « présence en ligne »',/Base légale|bases légales/i.test(rd('confidentialite.html'))&&/id="liste-attente"/.test(rd('confidentialite.html'))&&/Supabase/.test(rd('confidentialite.html'))&&/OpenStreetMap/.test(rd('confidentialite.html'))&&/16 ans/.test(rd('confidentialite.html'))&&!/présence en ligne/.test(rd('confidentialite.html')));
    check('Landing : formulaire liste d\'attente informé (finalité + lien confidentialité), plus d\'appel à dns.google',/wl-legal/.test(idx)&&/confidentialite\.html#liste-attente/.test(idx)&&!/dns\.google/.test(idx));
    check('Landing et app : liens vers mentions légales, confidentialité, CGU, cookies et accessibilité',['/mentions-legales.html','/confidentialite.html','/cgu.html','/cookies.html','/accessibilite.html'].every(h=>idx.includes(h)&&rd('app_DEF.html').includes(h)));
    check('Plus aucune présence en ligne côté app (pas de battement de cœur, pas de « En ligne »)',!/startPresenceHeartbeat|lastSeen: firebase\.firestore\.FieldValue\.serverTimestamp|En ligne/.test(rd('app_DEF.html')));
  });

  // ══════════ B. Bandeau de consentement (landing, page légale, app) ══════════
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  await T2('consentement landing',async()=>{
    let p=await openWatched(browser,SITE+'index.html');await sleep(600);
    let b=await banner(p);
    check('Landing, 1re visite : le bandeau s\'affiche, en premier dans l\'ordre de tabulation, avec un titre accessible',b&&b.visible&&b.first&&!!b.role,b);
    check('« Refuser » et « Accepter » : même taille, même police, mêmes couleurs (aucune option mise en avant)',b&&b.btns.length===2&&b.btns.map(x=>x.t).join()==='Refuser,Accepter'&&['bg','fg','bd','fs','fw','w','h'].every(k=>b.btns[0][k]===b.btns[1][k]),b&&b.btns);
    check('Avant tout choix : aucune requête Google Analytics, pas de dataLayer, pas de cookie _ga',p.__analytics.length===0&&await p.evaluate(()=>typeof window.dataLayer==='undefined'&&!/_ga/.test(document.cookie)),p.__analytics);
    check('Avant tout choix : aucune requête vers un domaine tiers (polices, CDN, DNS…)',p.__external.length===0,p.__external);
    check('Sans réponse, le site reste utilisable (aucun blocage : pas de « cookie wall »)',await p.evaluate(()=>{const b=document.getElementById('nv-consent');return getComputedStyle(b).pointerEvents==='none'&&!document.querySelector('.nvc-overlay');}));
    // refus
    await p.evaluate(()=>{document.cookie='_ga=GA1.1.1.1;path=/';document.cookie='_ga_ABC=GS1.1.1;path=/';});
    await p.evaluate(()=>document.querySelector('[data-nvc=no]').click());await sleep(300);
    let st=await stored(p);
    check('Refuser : choix enregistré {analytics:false}, bandeau fermé, cookies _ga éventuels supprimés',st&&st.analytics===false&&st.v===1&&!(await banner(p))&&await p.evaluate(()=>!/_ga/.test(document.cookie)),st);
    check('Refuser : toujours aucune requête d\'analyse',p.__analytics.length===0);
    await p.reload({waitUntil:'load'});await sleep(500);
    check('Rechargement : le refus est mémorisé (pas de nouveau bandeau) et rien n\'est chargé',!(await banner(p))&&p.__analytics.length===0);
    // « Gérer mes cookies » puis accepter
    await p.evaluate(()=>document.querySelector('[data-nv-cookies]').click());await sleep(300);
    b=await banner(p);
    check('« Gérer mes cookies » (pied de page) rouvre le choix, affiche le choix actuel, focus sur le 1er bouton',b&&b.visible&&await p.evaluate(()=>/refusée/.test(document.getElementById('nvc-cur').textContent)&&document.activeElement&&document.activeElement.getAttribute('data-nvc')==='no'));
    await p.evaluate(()=>document.querySelector('[data-nvc=yes]').click());await sleep(800);
    st=await stored(p);
    check('Accepter : choix {analytics:true} enregistré et Google Analytics demandé seulement maintenant',st&&st.analytics===true&&p.__analytics.some(u=>/googletagmanager\.com\/gtag\/js\?id=G-6M20ZMJBX8/.test(u)),{st,req:p.__analytics});
    check('Accepter : signaux publicitaires désactivés et durée des cookies ≤ 13 mois dans la configuration envoyée',await p.evaluate(()=>{const cfg=(window.dataLayer||[]).map(a=>[...a]).find(a=>a[0]==='config');return !!cfg&&cfg[2].allow_google_signals===false&&cfg[2].allow_ad_personalization_signals===false&&cfg[2].cookie_expires<=34128000&&window['ga-disable-G-6M20ZMJBX8']===false;}));
    // retrait
    await p.evaluate(()=>{document.cookie='_ga=GA1.1.9.9;path=/';});
    await p.evaluate(()=>document.querySelector('[data-nv-cookies]').click());await sleep(200);
    await p.evaluate(()=>document.querySelector('[data-nvc=no]').click());await sleep(300);
    check('Retrait du consentement : GA désactivé (ga-disable), cookie _ga supprimé, choix {analytics:false}',await p.evaluate(()=>window['ga-disable-G-6M20ZMJBX8']===true&&!/_ga/.test(document.cookie)&&JSON.parse(localStorage.getItem('nv_consent')).analytics===false));
    await p.browserContext().close();
    // expiration à 6 mois, valeur falsifiée
    p=await openWatched(browser,SITE+'cookies.html');
    await p.evaluate(()=>localStorage.setItem('nv_consent',JSON.stringify({v:1,analytics:true,ts:Date.now()-183*24*3600*1000})));await p.reload({waitUntil:'load'});await sleep(500);
    check('Choix vieux de plus de 6 mois : redemandé, et traité comme un refus (aucune requête d\'analyse)',!!(await banner(p))&&p.__analytics.length===0&&await p.evaluate(()=>NVConsent.analytics()===false));
    await p.evaluate(()=>localStorage.setItem('nv_consent',JSON.stringify({v:1,analytics:'yes',ts:Date.now()})));await p.reload({waitUntil:'load'});await sleep(400);
    check('Valeur de consentement falsifiée/invalide : ignorée (refus par défaut)',await p.evaluate(()=>NVConsent.analytics()===false)&&!!(await banner(p)));
    await p.evaluate(()=>localStorage.setItem('nv_consent',JSON.stringify({v:1,analytics:true,ts:Date.now()-5*24*3600*1000})));await p.reload({waitUntil:'load'});await sleep(400);
    check('Choix valide (5 jours) « accepté » : pas de bandeau ; le module l\'expose',!(await banner(p))&&await p.evaluate(()=>NVConsent.analytics()===true&&NVConsent.decided()===true));
    await p.browserContext().close();
  });

  await T2('consentement app',async()=>{
    await wipe();
    await db.doc('merchants/m1').set({role:'merchant',brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',logoUrl:PIXEL,coverUrl:PIXEL});
    await mkCampaign('c1',{photoUrl:PIXEL});
    await mkUser('me',{name:'Alex',email:'me@t.fr',friendUids:['f1'],seenHomeTour:true,online:true,lastSeen:Timestamp.now()});
    await mkUser('f1',{name:'Léa',friendUids:['me'],xp:410,streak:5,photoUrl:PIXEL,online:true,lastSeen:Timestamp.now()});
    await db.doc('rewards/r1').set({merchantId:'m1',merchantName:'Le Fournil',city:'le-mans',label:'Café offert',slot:1,cost:10,valueEuros:1,status:'approved',active:true,photoUrl:PIXEL,createdAt:Timestamp.now()});
    await aauth.createUser({uid:'me',email:'me@t.fr',password:'secret123'});
    // 1) première visite sans aucun choix
    let p=await openWatched(browser,APP+'?noconsent=1',{viewport:{width:390,height:844}});
    await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);await sleep(2500);
    let b=await banner(p);
    check('App, 1re visite : bandeau affiché, boutons identiques, atteignable en premier au clavier',b&&b.visible&&b.first&&b.btns.length===2&&['bg','fg','bd','fs','fw','w','h'].every(k=>b.btns[0][k]===b.btns[1][k]),b);
    check('App, sans choix : aucune requête d\'analyse ; trackEvent ne met rien en file ; SDK Analytics non chargé',p.__analytics.length===0&&await p.evaluate(()=>{trackEvent('screen_view',{screen_name:'x'});return _trackQueue.length===0&&analytics===null&&!(window._sdk&&window._sdk.analytics);}),p.__analytics);
    check('App, sans choix : aucun appel à un domaine tiers hors Firebase/Google indispensables',p.__external.every(u=>/gstatic\.com\/firebasejs|googleapis\.com|firebaseapp\.com|cloudfunctions\.net/.test(u)),p.__external.filter(u=>!/gstatic\.com\/firebasejs|googleapis\.com|firebaseapp\.com|cloudfunctions\.net/.test(u)));
    // 2) refus, puis acceptation : le SDK n'est demandé qu'après « Accepter »
    await p.evaluate(()=>document.querySelector('[data-nvc=no]').click());await sleep(2200);
    check('App, refus : toujours aucun chargement d\'Analytics',p.__analytics.length===0&&await p.evaluate(()=>analytics===null));
    await p.evaluate(()=>document.querySelector('[data-nv-cookies]')?document.querySelector('[data-nv-cookies]').click():NVConsent.open());await sleep(200);
    await p.evaluate(()=>document.querySelector('[data-nvc=yes]').click());await sleep(2600);
    check('App, acceptation : le SDK Firebase Analytics est demandé (et seulement alors)',p.__analytics.some(u=>/firebase-analytics-compat/.test(u)),p.__analytics);
    // retrait après acceptation : la file est vidée, plus d'événement
    await p.evaluate(()=>NVConsent.set(false));await sleep(200);
    check('App, retrait : plus aucun événement en file, collecte coupée',await p.evaluate(()=>{trackEvent('x_after_refusal');return _trackQueue.length===0;}));
    await p.browserContext().close();
    // 3) contexte de test « refus pré-enregistré » : parcours connecté complet, sans aucune requête d'analyse
    p=await openWatched(browser,APP);
    await wf(p,()=>document.getElementById('onboard').classList.contains('active'),null,30000);
    check('Choix « refusé » pré-enregistré : pas de bandeau à l\'ouverture',!(await banner(p)));
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','me@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active')&&S.user&&S.friends&&S.friends.length>=1,null,30000);
    await sleep(1500);
    // présence supprimée
    const me=(await db.doc('users/me').get()).data();
    check('Présence en ligne supprimée : anciens champs online/lastSeen retirés du profil à la connexion, plus jamais réécrits',me.online===undefined&&me.lastSeen===undefined,{online:me.online,lastSeen:me.lastSeen});
    await sleep(1500);
    const f=await p.evaluate(()=>{goNav('social');return null;});await sleep(800);
    await p.evaluate(()=>socTab('friends',document.querySelector('.tab-btn[onclick*="friends"]')));await sleep(1500);
    check('Liste d\'amis : plus de pastille « en ligne »',await p.evaluate(()=>!document.querySelector('.fi-online')&&S.friends.every(x=>x.online===undefined)));
    // images : chaque <img> du DOM porte un alt ; logos/photos avec un alt descriptif
    const scan=async()=>p.evaluate(()=>[...document.querySelectorAll('img')].map(i=>({alt:i.getAttribute('alt'),src:(i.getAttribute('src')||'').slice(0,20),vis:!!(i.offsetParent)})));
    let imgs=[];
    for(const step of [()=>goNav('home'),()=>goNav('social'),()=>goNav('rewards-tab'),()=>openBrandById('m1','Le Fournil'),()=>goNav('profile')]){await p.evaluate(step).catch(()=>{});await sleep(1400);imgs=imgs.concat(await scan());}
    const noAlt=imgs.filter(i=>i.alt===null);
    check('Écrans parcourus (accueil, communauté, récompenses, commerce, profil) : '+imgs.length+' images, toutes avec un attribut alt',imgs.length>=3&&noAlt.length===0,noAlt);
    const desc=imgs.filter(i=>/^Logo de |^Photo de |^Ma photo de profil|^Logo Noova/.test(i.alt||''));
    check('… dont des alt descriptifs (logo de commerce, photo de commerce/récompense, photo d\'ami)',desc.length>=3,imgs.map(i=>i.alt));
    check('Aucune requête d\'analyse sur tout le parcours connecté (refus)',p.__analytics.length===0,p.__analytics);
    check('Icônes SVG décoratives masquées aux lecteurs d\'écran (aria-hidden) dans l\'app',await p.evaluate(()=>{const s=[...document.querySelectorAll('svg')].filter(x=>!x.hasAttribute('aria-hidden')&&!x.getAttribute('role')&&!x.getAttribute('aria-label')&&!x.closest('[aria-hidden=true]'));return s.length<=3;}));
    check('Lien « Gérer mes cookies » et pages légales présents dans le Profil',await p.evaluate(()=>{goNav('profile');const n=document.querySelector('nav.legal-links');return !!n&&/Gérer mes cookies/.test(n.textContent)&&/Mentions légales/.test(n.textContent)&&/Accessibilité/.test(n.textContent)&&!!n.querySelector('[data-nv-cookies]');}));
    await p.browserContext().close();
  });
  await browser.close();
  console.log('\n'+pass+' ok, '+fail+' échec(s)');process.exit(fail?1:0);
})();
