"use strict";
/**
 * Lance toutes les suites de bout en bout contre les émulateurs Firebase.
 *   Depuis la racine du dépôt :   sh tests/run.sh          (démarre les émulateurs puis appelle ce fichier)
 *   Une seule suite :             SUITES=eng4,notif_ui sh tests/run.sh
 * Les pages du dépôt sont copiées dans tests/.site avec les émulateurs branchés (le vrai code n'est pas modifié).
 */
const fs = require("fs"), path = require("path"), http = require("http"), { spawn } = require("child_process");
const ROOT = path.join(__dirname, ".."), SITE = path.join(__dirname, ".site");

function buildSite() {
  fs.rmSync(SITE, { recursive: true, force: true });
  fs.mkdirSync(SITE, { recursive: true });
  fs.readdirSync(ROOT).filter((f) => /\.(png|svg)$/.test(f)).concat(["icons.js", "firebase-messaging-sw.js", "manifest.json", "consent.js", "tiers.js", "legal.css", "robots.txt", "sitemap.xml", "llms.txt", "index.html"])
    .concat(fs.readdirSync(ROOT).filter((f) => /\.html$/.test(f) && !/^(app_DEF|noova_dashboard|noova_admin|index)\.html$/.test(f)))
    .forEach((f) => fs.copyFileSync(path.join(ROOT, f), path.join(SITE, f)));
  fs.cpSync(path.join(ROOT, "fonts"), path.join(SITE, "fonts"), { recursive: true });
  fs.cpSync(path.join(ROOT, "vendor"), path.join(SITE, "vendor"), { recursive: true });
  const emu = "auth.useEmulator('http://127.0.0.1:9099');db.useEmulator('127.0.0.1',8080);fx.useEmulator('127.0.0.1',5001);";
  const emuAdmin = "\nauth.useEmulator('http://127.0.0.1:9099');db.useEmulator('127.0.0.1',8080);";
  [["app_DEF.html", "app.html", "const fx  = firebase.app().functions('europe-west1');", emu],
   ["noova_dashboard.html", "dash.html", "const fx   = firebase.app().functions('europe-west1');", emu],
   ["noova_admin.html", "admin.html", "const db = firebase.firestore();", emuAdmin]].forEach(([src, dst, marker, add]) => {
    const html = fs.readFileSync(path.join(ROOT, src), "utf8");
    if (html.split(marker).length !== 2) throw new Error(`${src} : repère d'injection introuvable (${marker})`);
    let out = html.replace(marker, marker + add);
    // Les tests ne doivent pas être gênés par le bandeau de cookies : le choix « refusé » est pré-enregistré (sauf avec ?noconsent, utilisé par eng14).
    if (dst === "app.html") out = out.replace("<head>", "<head>\n<script>try{if(!/[?&]noconsent/.test(location.search))localStorage.setItem('nv_consent',JSON.stringify({v:1,analytics:false,ts:Date.now()}))}catch(e){}</script>");
    // Le back-office déclare ses fonctions plus bas : on les branche aussi sur l'émulateur.
    if (dst === "admin.html") out = out.replace("const fx  = firebase.app().functions('europe-west1');", "const fx  = firebase.app().functions('europe-west1');fx.useEmulator('127.0.0.1',5001);");
    fs.writeFileSync(path.join(SITE, dst), out);
  });
}

function serve(port) {
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2", ".css": "text/css; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml" };
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const f = path.join(SITE, decodeURIComponent(req.url.split("?")[0]).replace(/\.\./g, ""));
      fs.readFile(f, (e, data) => {
        if (e) { res.writeHead(404); return res.end("not found"); }
        const h = { "Content-Type": types[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" };
        // Comme l'hébergement réel : compression Brotli des pages et scripts.
        if (/\.(html|js|json|svg)$/.test(f) && /\bbr\b/.test(req.headers["accept-encoding"] || "")) { h["Content-Encoding"] = "br"; res.writeHead(200, h); return res.end(require("zlib").brotliCompressSync(data)); }
        res.writeHead(200, h);
        res.end(data);
      });
    }).listen(port, () => resolve(srv));
  });
}

const SUITES = ["legacy_test", "legacy_test4", "legacy_test5", "eng1", "eng2", "eng3", "eng4", "eng5", "eng6", "eng7", "eng8", "eng9", "eng10", "eng11", "eng12", "eng13", "eng14", "eng15", "eng16", "eng17", "eng18", "eng19", "eng20", "eng21", "eng22", "eng23", "eng24", "eng25", "eng26", "eng27", "eng28", "eng29", "eng30", "notif_server", "notif_ui", "mobile_audit", "a11y_audit", "tour_audit", "perf_audit"];

function runSuite(name) {
  return new Promise((resolve) => {
    let pass = 0, fail = 0, out = "";
    const p = spawn(process.execPath, [path.join(__dirname, name + ".js")], { cwd: __dirname, env: process.env });
    const onData = (d) => { out += d; };
    p.stdout.on("data", onData); p.stderr.on("data", onData);
    p.on("close", (code) => {
      out.split("\n").forEach((l) => { if (l.startsWith("PASS")) pass++; else if (l.startsWith("FAIL")) fail++; });
      resolve({ name, pass, fail, code, out });
    });
  });
}

(async () => {
  if (!process.env.CHROME_PATH) {
    process.env.CHROME_PATH = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((c) => fs.existsSync(c));
  }
  fs.mkdirSync("/tmp/shots", { recursive: true });
  buildSite();
  const srv = await serve(8950);
  const wanted = process.env.SUITES ? process.env.SUITES.split(",") : SUITES;
  const results = [];
  for (const s of wanted) {
    const t0 = Date.now();
    const r = await runSuite(s);
    results.push(r);
    console.log(`${r.fail || r.code ? "✗" : "✓"} ${s.padEnd(14)} ${r.pass} ok, ${r.fail} échec(s)  (${Math.round((Date.now() - t0) / 1000)} s)`);
    if (process.env.VERBOSE) console.log(r.out);
    else if (r.fail || r.code) console.log(r.out.split("\n").filter((l) => l.startsWith("FAIL") || /Error|exception/i.test(l)).slice(0, 12).map((l) => "    " + l.slice(0, 300)).join("\n") || r.out.slice(-800));
  }
  srv.close();
  const bad = results.filter((r) => r.fail || r.code || !r.pass);
  console.log(`\n${results.reduce((a, r) => a + r.pass, 0)} vérifications, ${results.reduce((a, r) => a + r.fail, 0)} échec(s), ${bad.length} suite(s) en défaut`);
  process.exit(bad.length ? 1 : 0);
})();
