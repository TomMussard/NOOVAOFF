/* NOOVA — consentement aux traceurs (RGPD / directive ePrivacy / recommandations CNIL).
   Règles appliquées :
   - aucun traceur non essentiel (mesure d'audience) avant un choix explicite : sans réponse = refus ;
   - « Refuser » et « Accepter » sont présentés de façon identique, au même niveau ;
   - le site reste entièrement utilisable sans répondre (pas de « cookie wall ») ;
   - le choix est mémorisé 6 mois (localStorage, clé nv_consent) puis redemandé ;
   - le choix se modifie à tout moment via tout lien [data-nv-cookies] (« Gérer mes cookies »).
   Seul ce choix est stocké ici : c'est un stockage strictement nécessaire, dispensé de consentement. */
(function () {
  'use strict';
  var KEY = 'nv_consent', VERSION = 1, TTL = 182 * 24 * 3600 * 1000; // ≈ 6 mois
  var subs = [], granted = false, el = null;

  function read() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!o || o.v !== VERSION || typeof o.analytics !== 'boolean' || !o.ts || Date.now() - o.ts > TTL) return null;
      return o;
    } catch (e) { return null; }
  }
  function write(v) { try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, analytics: v, ts: Date.now() })); } catch (e) {} }

  // Supprime les cookies de mesure d'audience déjà posés (_ga, _ga_XXXX, _gid, _gat…) sur le domaine et ses parents.
  function clearAnalyticsCookies() {
    try {
      var host = location.hostname, parts = host.split('.'), doms = [host, '.' + host];
      for (var i = 1; i < parts.length - 1; i++) doms.push('.' + parts.slice(i).join('.'));
      document.cookie.split(';').forEach(function (c) {
        var n = c.split('=')[0].trim();
        if (!/^(_ga|_gid|_gat|_gcl|_dc_gtm)/.test(n)) return;
        doms.concat(['']).forEach(function (d) { document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : ''); });
      });
    } catch (e) {}
  }

  function apply(v, silent) {
    var changed = v !== granted;
    granted = v;
    if (!v) clearAnalyticsCookies();
    if (changed || !silent) subs.slice().forEach(function (f) { try { f(v); } catch (e) {} });
  }

  var NV = window.NVConsent = {
    /** true seulement si l'utilisateur a accepté la mesure d'audience (et que le choix est valide). */
    analytics: function () { return granted; },
    /** true si un choix valide est enregistré. */
    decided: function () { return !!read(); },
    /** Appelle f(true|false) maintenant (état courant) puis à chaque changement. */
    onChange: function (f) { subs.push(f); try { f(granted); } catch (e) {} },
    /** Appelle f() dès que (et tant que) la mesure d'audience est acceptée — jamais avant. */
    whenGranted: function (f) { var done = false; NV.onChange(function (v) { if (v && !done) { done = true; f(); } }); },
    set: function (v) { write(!!v); apply(!!v); hide(); },
    open: function () { show(true); }
  };

  var CSS = '#nv-consent[hidden]{display:none}#nv-consent{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;display:flex;justify-content:center;padding:12px 12px calc(12px + env(safe-area-inset-bottom));font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;pointer-events:none}' +
    '#nv-consent .nvc{pointer-events:auto;box-sizing:border-box;width:100%;max-width:560px;background:#17141A;color:#fff;border-radius:18px;padding:14px 16px 14px;box-shadow:0 10px 40px rgba(0,0,0,.35)}' +
    '#nv-consent h2{margin:0 0 6px;font-size:16px;line-height:1.3;font-weight:800;color:#fff}' +
    '#nv-consent p{margin:0 0 12px;color:#E6E3EA;font-size:13px}' +
    '#nv-consent a{color:#FCC86A;font-weight:600;text-decoration:underline}' +
    '#nv-consent .nvc-row{display:flex;gap:10px}' +
    '#nv-consent button{flex:1;min-height:44px;padding:10px 14px;border-radius:12px;border:2px solid #fff;background:#fff;color:#17141A;font:inherit;font-weight:700;cursor:pointer}' +
    '#nv-consent button:hover{background:#F3F1F6}' +
    '#nv-consent button:focus-visible,#nv-consent a:focus-visible{outline:3px solid #FCC86A;outline-offset:2px}' +
    '#nv-consent .nvc-cur{margin:10px 0 0;font-size:12.5px;color:#C9C4D0}';

  function build() {
    if (el) return el;
    var st = document.createElement('style'); st.id = 'nv-consent-css'; st.textContent = CSS; document.head.appendChild(st);
    el = document.createElement('div'); el.id = 'nv-consent'; el.hidden = true;
    el.innerHTML = '<div class="nvc" role="dialog" aria-modal="false" aria-labelledby="nvc-t" aria-describedby="nvc-d">' +
      '<h2 id="nvc-t">Mesure d’audience</h2>' +
      '<p id="nvc-d">Noova peut mesurer, de façon statistique, comment le site et l\u2019application sont utilisés, pour les améliorer. Seulement si tu l\u2019acceptes ; refuser ne change rien à ton usage de Noova, et tu peux changer d\u2019avis à tout moment. <a href="/cookies.html">En savoir plus</a></p>' +
      '<div class="nvc-row"><button type="button" data-nvc="no">Refuser</button><button type="button" data-nvc="yes">Accepter</button></div>' +
      '<p class="nvc-cur" id="nvc-cur" aria-live="polite"></p></div>';
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-nvc]'); if (!b) return;
      NV.set(b.getAttribute('data-nvc') === 'yes');
    });
    // En début de <body> : le bandeau est le premier élément atteint au clavier et par les lecteurs d'écran.
    document.body.insertBefore(el, document.body.firstChild);
    return el;
  }
  function show(focus) {
    var run = function () {
      var b = build(), cur = read();
      b.querySelector('#nvc-cur').textContent = cur ? 'Choix actuel : mesure d’audience ' + (cur.analytics ? 'acceptée' : 'refusée') + '.' : '';
      b.hidden = false;
      if (focus) { var f = b.querySelector('button'); if (f) f.focus(); }
    };
    if (document.body) run(); else document.addEventListener('DOMContentLoaded', run);
  }
  function hide() { if (el) el.hidden = true; }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-nv-cookies]');
    if (a) { e.preventDefault(); NV.open(); }
  });

  var cur = read();
  granted = !!(cur && cur.analytics);
  if (!cur) { try { localStorage.removeItem(KEY); } catch (e) {} show(false); }
})();
