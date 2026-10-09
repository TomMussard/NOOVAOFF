// Choix multiple « 2 réponses possibles » : 1 ou 2 options, jamais 3 ; statistiques par répondant (le total dépasse 100 %),
// résultats dans l'app et dans le dashboard ; une question à une seule réponse refuse toujours deux réponses.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FUNCTIONS_EMULATOR='true';
const puppeteer=require('puppeteer-core');const admin=require(__dirname+'/helpers/admin');
admin.initializeApp({projectId:'noova-366d0'});const db=admin.firestore(),aauth=admin.auth();const {Timestamp}=admin.firestore;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const check=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(!ok&&x!==undefined?'  -> '+JSON.stringify(x):''));};
const T=async(n,fn)=>{try{await fn();}catch(e){fail++;console.log('FAIL '+n+' (exception) -> '+String(e.stack||e).split('\n').slice(0,3).join(' | '));}};
const wf=(p,fn,t=30000)=>p.waitForFunction(fn,{timeout:t,polling:200});
const setVal=(p,sel,v)=>p.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const AUTH='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake';
const idTokenOf=async(email)=>(await (await fetch(AUTH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'secret123',returnSecureToken:true})})).json()).idToken;
const call=async(name,data,token)=>{const r=await fetch('http://127.0.0.1:5001/noova-366d0/europe-west1/'+name,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({data})});const j=await r.json();if(j.error)throw new Error(j.error.message);return j.result;};
const err=async fn=>{try{await fn();return null;}catch(e){return e.message;}};
const OPTS=['Le matin','Le midi','Le soir'];
(async()=>{
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/noova-366d0/databases/(default)/documents',{method:'DELETE'});await fetch('http://127.0.0.1:9099/emulator/v1/projects/noova-366d0/accounts',{method:'DELETE'});
  await db.doc('merchants/m1').set({role:'merchant',ownerUid:'m1',brandName:'Le Fournil',name:'Le Fournil',sector:'Boulangerie',city:'le-mans',cityLabel:'Le Mans',status:'verified',email:'m1@s.fr'});
  const camp=(id,multi)=>db.doc('campaigns/'+id).set({merchantId:'m1',merchantName:'Le Fournil',sector:'Boulangerie',status:'active',targetCity:'le-mans',city:'le-mans',question:'Quand passes-tu ?',questions:[{q:'Quand passes-tu ?',format:'mcq',options:OPTS,...(multi?{multi:true}:{})}],questionsSchema:2,format:'mcq',options:OPTS,answersCount:0,createdAt:Timestamp.now()});
  await camp('cm',true);await camp('cs',false);
  for(const u of ['u1','u2','u3','u4']){
    await db.doc('users/'+u).set({role:'user',name:'U '+u,email:u+'@t.fr',city:'le-mans',cityLabel:'Le Mans',welcomeClaimed:true,onboardingStep:'done',seenHomeTour:true,authorizedMerchants:['m1'],answeredCampaigns:[],points:0,xp:0,streak:0,ageRange:'25-34',interests:['restauration'],friendUids:[]});
    await aauth.createUser({uid:u,email:u+'@t.fr',password:'secret123'});
  }
  const answer=async(tok,cid,v)=>{await call('beginQuestion',{campaignId:cid,questionIdx:0},tok);await sleep(3100);return call('submitAnswer',{campaignId:cid,questionIdx:0,answerValue:v},tok);};

  await T('serveur : 1 ou 2 réponses, jamais 3',async()=>{
    const t1=await idTokenOf('u1@t.fr'),t2=await idTokenOf('u2@t.fr');
    check('Trois réponses refusées',/invalide/i.test(await err(()=>answer(t2,'cm',OPTS))||''));
    check('Deux fois la même réponse refusée',/invalide/i.test(await err(()=>answer(t2,'cm',['Le midi','Le midi']))||''));
    check('Réponse hors liste refusée',/invalide/i.test(await err(()=>answer(t2,'cm',['Le midi','Minuit']))||''));
    check('Question à une seule réponse : deux réponses refusées',/invalide/i.test(await err(()=>answer(t2,'cs',['Le matin','Le soir']))||''));
    await answer(t1,'cm',['Le soir','Le matin']);
    const a=(await db.doc('answers/u1_cm_q0').get()).data();
    check('Deux réponses enregistrées, dans l\'ordre de la liste du commerçant',JSON.stringify(a.answers)===JSON.stringify(['Le matin','Le soir'])&&a.answer==='Le matin ; Le soir'&&JSON.stringify(a.optionIdxs)==='[0,2]',a);
    await answer(t2,'cm',['Le soir']);
    const st=(await db.doc('campaignStats/cm').get()).data().q0;
    check('Statistiques : 2 répondants, chaque option choisie compte',st.n===2&&st.c['0']===1&&st.c['2']===2&&!st.c['1'],st);
    const r=await call('getReveal',{campaignId:'cm',questionIdx:0},t1);
    check('Résultats dans l\'app : % des répondants (le soir 100 %, le matin 50 %), mes 2 réponses repérées',r.multi===true&&JSON.stringify(r.myIdxs)==='[0,2]'&&r.options[2].pct===100&&r.options[0].pct===50&&r.options[1].pct===0,r);
    const single=await answer(t2,'cs','Le midi');
    check('Question à une seule réponse : inchangée',!!single&&(await db.doc('answers/u2_cs_q0').get()).data().answer==='Le midi');
  });

  const b=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:'new',args:['--no-sandbox']});
  const errs=[];
  await T('app : cocher jusqu\'à 2 réponses',async()=>{
    const p=await b.newPage();p.on('pageerror',e=>errs.push(e.message));await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    await p.goto('http://localhost:8950/app.html',{waitUntil:'load'});await wf(p,()=>document.getElementById('onboard').classList.contains('active'));
    await p.evaluate(()=>showAuthWall('login'));await setVal(p,'#aw-email','u3@t.fr');await setVal(p,'#aw-pass','secret123');await p.evaluate(()=>awSubmit());
    await wf(p,()=>document.getElementById('home').classList.contains('active')&&(S.qs||[]).some(q=>q._firestoreId==='cm'));
    await p.evaluate(()=>{const i=S.qs.findIndex(q=>q._firestoreId==='cm');openQ(i);});
    await wf(p,()=>document.querySelectorAll('#ans-area .mcq-opt').length===3);
    const hint=await p.$eval('#ans-area',e=>e.textContent);
    check('Indication « Jusqu\'à 2 réponses »',/Jusqu.à 2 réponses/.test(hint),hint);
    await p.evaluate(()=>{const o=document.querySelectorAll('#ans-area .mcq-opt');o[0].click();o[1].click();o[2].click();});
    const sel=await p.$$eval('#ans-area .mcq-opt.sel span',l=>l.map(x=>x.textContent));
    check('Une 3e réponse remplace la plus ancienne : 2 cochées au plus',JSON.stringify(sel)===JSON.stringify(['Le midi','Le soir']),sel);
    await p.evaluate(()=>document.querySelectorAll('#ans-area .mcq-opt')[2].click());
    check('Décocher fonctionne',await p.$$eval('#ans-area .mcq-opt.sel',l=>l.length)===1);
    await p.evaluate(()=>document.querySelectorAll('#ans-area .mcq-opt')[0].click());
    await sleep(3300);await p.evaluate(()=>submitAns());
    let a=null;for(let i=0;i<40&&!a;i++){a=(await db.doc('answers/u3_cm_q0').get()).data();if(!a)await sleep(250);}
    check('Réponse envoyée avec ses 2 choix',a&&JSON.stringify(a.answers)===JSON.stringify(['Le matin','Le midi']),a);
    await p.evaluate(()=>buildAns({type:'mcq',opts:['Le matin','Le midi','Le soir'],multi:false}));
    await p.evaluate(()=>{const o=document.querySelectorAll('#ans-area .mcq-opt');o[0].click();o[1].click();});
    check('Question à une seule réponse : un seul choix coché, pas d\'indication',await p.$$eval('#ans-area .mcq-opt.sel',l=>l.length)===1&&!(await p.$eval('#ans-area',e=>/Jusqu/.test(e.textContent))));
    await p.close();
  });

  await T('dashboard : case « 2 réponses possibles » et résultats',async()=>{
    const d=await b.newPage();d.on('pageerror',e=>errs.push(e.message));await d.setViewport({width:1280,height:900});
    await d.goto('http://localhost:8950/dash.html',{waitUntil:'load'});await sleep(1200);
    const st=await d.evaluate(()=>{document.getElementById('q-text-inp').value='Quand passes-tu ?';document.getElementById('mcq-multi').checked=true;return collectWizFormState().questions[0];});
    check('Case cochée : la question part avec multi',st.format==='mcq'&&st.multi===true,st);
    const st2=await d.evaluate(()=>{document.getElementById('mcq-multi').checked=false;return collectWizFormState().questions[0];});
    check('Case décochée : question classique',st2.multi===undefined,st2);
    const html=await d.evaluate(()=>{const mk=(l,age)=>({questionIdx:0,answers:l,answer:l.join(' ; '),respondentAge:age});
      const valid=[mk(['A','B'],'25-34'),mk(['A'],'25-34'),mk(['A','C'],'18-24'),mk(['B'],'18-24'),mk(['A','B'],'25-34')];
      return rsQuestionHTML({q:'Q',format:'mcq',options:['A','B','C'],multi:true},0,{valid},1);});
    const txt=html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
    check('Résultats : « 2 réponses possibles », A choisi par 80 % des répondants',/2 réponses possibles/.test(txt)&&/A\s+\S*\s*80 %/.test(txt.replace(/\(\d+\)/g,'')) ,txt.slice(0,400));
    await d.close();
  });
  check('Aucune erreur JavaScript',errs.length===0,errs);
  await b.close();
  console.log(`\n${pass} ok, ${fail} échec(s)`);process.exit(fail?1:0);
})().catch(e=>{console.log('FAIL '+String(e.stack||e).slice(0,400));process.exit(1);});
