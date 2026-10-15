// Parcours d'entrée : 3 questions d'essai sans compte (honnêtes : « exemple », 50 points crédités à l'inscription),
// compteur des étapes (une fois par visite, rien stocké sur l'appareil, comptes créés comptés par le serveur), carte
// de l'admin, bandeau « Phase de test » sobre.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,3).join(' | '));}};
const wf=(p,fn,t=30000)=>p.waitForFunction(fn,{timeout:t,polling:200});
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const until=async(fn,t=15000)=>{const s=Date.now();while(Date.now()-s<t){if(await fn())return true;await sleep(300);}return false;};
const total=async()=>(await db.doc('funnelDaily/total').get()).data()||{};
const call=async(name,data)=>{const r=await fetch('http://127.0.0.1:5001/noova-366d0/europe-west1/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data})});const j=await r.json();if(j.error)throw new Error(j.error.message);return j.result;};
(async()=>{
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});
  await aauth.createUser({uid:'adm',email:'tomussproduction@gmail.com',password:'secret123',emailVerified:true});
  const b=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:'new',args:['--no-sandbox']});
  const errs=[];
  const p=await b.newPage();p.on('pageerror',e=>errs.push(e.message));await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await T('bandeau',async()=>{
    await p.goto('http://localhost:8950/app.html',{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'));
    const bn=await p.$eval('.test-banner',e=>({t:e.textContent,bg:getComputedStyle(e).backgroundColor,h:e.getBoundingClientRect().height}));
    check('Bandeau sobre (plus de rouge) et honnête : « Phase de test · commerces et récompenses fictifs », sur une ligne',/Phase de test/.test(bn.t)&&/fictifs/.test(bn.t)&&!/rgb\(180, 35, 24\)/.test(bn.bg)&&bn.h<=26,bn);
  });
  await T('3 questions d\'essai',async()=>{
    check('Ouverture de l\'app comptée',await until(async()=>(await total()).open===1),await total());
    await p.evaluate(()=>obNext());
    check('Bouton « Essayer 3 questions »',await p.$eval('#ob-btn',e=>e.textContent)==='Essayer 3 questions');
    await p.evaluate(()=>obNext());await wf(p,()=>document.getElementById('demo-q').classList.contains('active'));
    const answer=async()=>{await p.evaluate(()=>{document.querySelectorAll('#demo-opts .mcq-opt')[1].click();submitDemo();});await wf(p,()=>document.getElementById('demo-result').classList.contains('active'));};
    check('Question 1 / 3, sans promesse de points sur la question',await p.$eval('#demo-count',e=>e.textContent)==='1 / 3');
    await answer();
    const r1=await p.evaluate(()=>({sub:document.getElementById('demo-res-sub').textContent,next:document.getElementById('demo-next-btn').textContent,reg:getComputedStyle(document.getElementById('demo-reg-btn')).display,pts:getComputedStyle(document.getElementById('demo-pts')).display,note:document.querySelector('#demo-result').textContent}));
    check('Résultats présentés comme un exemple ; « Question suivante (2 / 3) » ou « Créer mon compte »',/Exemple/.test(r1.sub)&&r1.next==='Question suivante (2 / 3)'&&r1.reg!=='none'&&r1.pts==='none'&&/fictifs pendant la phase de test/.test(r1.note),r1);
    await p.evaluate(()=>demoNext());await wf(p,()=>document.getElementById('demo-q').classList.contains('active')&&document.getElementById('demo-count').textContent==='2 / 3');
    await answer();await p.evaluate(()=>demoNext());await wf(p,()=>document.getElementById('demo-count').textContent==='3 / 3'&&document.getElementById('demo-q').classList.contains('active'));
    check('3e question : le coiffeur',/coiffeur/.test(await p.$eval('#demo-q-text',e=>e.textContent)));
    await answer();
    const r3=await p.evaluate(()=>({next:document.getElementById('demo-next-btn').textContent,reg:getComputedStyle(document.getElementById('demo-reg-btn')).display,pts:getComputedStyle(document.getElementById('demo-pts')).display}));
    check('Après la 3e : « Créer mon compte et récupérer mes 50 points » (bonus de bienvenue réel)',r3.next==='Créer mon compte et récupérer mes 50 points'&&r3.reg==='none'&&r3.pts==='flex',r3);
    await p.evaluate(()=>demoNext());await wf(p,()=>document.getElementById('auth-wall').style.display==='flex'&&document.getElementById('aw-name').style.display==='block');
    check('Le bouton ouvre l\'inscription',true);
    const ok6=x=>x.onboard_2===1&&x.demo_start===1&&x.demo_1===1&&x.demo_2===1&&x.demo_3===1&&x.signup_open===1;
    await until(async()=>ok6(await total()));const t=await total();
    check('Étapes comptées : présentation, essai, questions 1-2-3, inscription ouverte',ok6(t),t);
    await setVal(p,'#aw-name','Inès');await setVal(p,'#aw-city','Angers');await setVal(p,'#aw-email','ines@t.fr');await setVal(p,'#aw-pass','Secret12!');
    await p.evaluate(()=>awSubmit());
    check('Compte créé : compté par le serveur',await until(async()=>(await total()).signup_done===1,20000),await total());
    const uid=await p.evaluate(()=>auth.currentUser&&auth.currentUser.uid);
    check('Les 50 points promis sont bien crédités',await until(async()=>((await db.doc('users/'+uid).get()).data()||{}).points===50,20000));
  });
  await T('compteur : par visite, rien sur l\'appareil',async()=>{
    await p.evaluate(()=>{trackFunnel('open');trackFunnel('demo_1');});await sleep(1500);
    const t=await total();
    check('Même visite : pas compté deux fois',t.open===1&&t.demo_1===1,t);
    check('Rien enregistré sur l\'appareil pour le compteur',await p.evaluate(()=>!Object.keys(localStorage).some(k=>/fn/.test(k))&&!Object.keys(sessionStorage).some(k=>/fn/.test(k))));
    const day=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Paris'});
    check('Totaux du jour tenus à part',((await db.doc('funnelDaily/'+day).get()).data()||{}).open===1);
    check('Étape inconnue refusée ; « compte créé » ne peut pas être envoyé par l\'app',/inconnue/.test(await call('trackFunnel',{step:'hack'}).then(()=>'',e=>e.message))&&/inconnue/.test(await call('trackFunnel',{step:'signup_done'}).then(()=>'',e=>e.message)));
    const r=await fetch('http://127.0.0.1:8080/v1/projects/noova-366d0/databases/(default)/documents/funnelDaily/total');
    check('Les chiffres ne sont pas lisibles sans être admin',r.status===403,r.status);
  });
  await T('erreurs d\'inscription relevées (sans e-mail)',async()=>{
    const qctx=await b.createBrowserContext();const q=await qctx.newPage();q.on('pageerror',e=>errs.push(e.message));await q.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    await q.goto('http://localhost:8950/app.html',{waitUntil:'load'});await wf(q,()=>document.getElementById('onboard').classList.contains('active'));
    await q.evaluate(()=>showAuthWall('register'));
    await setVal(q,'#aw-name','Léo');await setVal(q,'#aw-city','');await setVal(q,'#aw-email','leo@t.fr');await setVal(q,'#aw-pass','Secret12!');await q.evaluate(()=>awSubmit());
    await setVal(q,'#aw-city','Angers');await setVal(q,'#aw-email','ines@t.fr');await q.evaluate(()=>awSubmit());
    await wf(q,()=>/déjà utilisé/.test(document.getElementById('aw-err').textContent),15000);
    let docs=[];await until(async()=>{docs=(await db.collection('clientErrors').get()).docs.map(d=>d.data());return docs.length>=2;});
    check('Erreurs relevées : « ville manquante », « e-mail déjà utilisé », avec l\'étape et le téléphone, jamais l\'e-mail',docs.some(d=>d.where==='register'&&d.code==='ville_vide')&&docs.some(d=>d.code==='auth/email-already-in-use'&&d.device==='android'||d.code==='auth/email-already-in-use')&&!JSON.stringify(docs).includes('@'),docs);
    await qctx.close();
  });
  await T('admin',async()=>{
    const a=await b.newPage();a.on('pageerror',e=>errs.push(e.message));await a.setViewport({width:1280,height:900});
    await a.goto('http://localhost:8950/admin.html',{waitUntil:'load'});await sleep(1200);
    await a.evaluate(async()=>{await auth.signInWithEmailAndPassword('tomussproduction@gmail.com','secret123');});
    await wf(a,()=>document.getElementById('main').style.display==='block');
    await a.evaluate(()=>{const b=[...document.querySelectorAll('.tab-btn-main')].find(x=>/Statistiques/.test(x.textContent));b.click();});
    await wf(a,()=>document.querySelectorAll('#fn-root .fn-row').length===8,20000);
    const rows=await a.$$eval('#fn-root .fn-row',l=>l.map(r=>[...r.cells].map(c=>c.textContent.trim()).join(' ')));
    await wf(a,()=>document.querySelectorAll('#err-root .err-row').length>=2,15000);
    const er=await a.$eval('#err-root',e=>e.textContent);
    check('Carte « Erreurs à l\'inscription » : messages en clair (« E-mail déjà utilisé », « Ville manquante »)',/E-mail déjà utilisé/.test(er)&&/Ville manquante/.test(er),er.slice(0,300));
    check('Carte « Parcours d\'entrée » : 8 étapes, de l\'ouverture (100 %) au compte créé',/Ouvre l'app.*2 2 2 100 %/.test(rows[0])&&/Crée son compte.*1 1 1 50 %/.test(rows[7]),rows);
    await a.close();
  });
  check('Aucune erreur JavaScript',errs.length===0,errs);
  await b.close();
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(fail?1:0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
