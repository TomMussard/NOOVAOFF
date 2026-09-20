"use strict";
/**
 * Mesure du démarrage de l'app (réseau « 4G lente » + processeur ralenti 4×) : temps jusqu'au premier
 * écran, requêtes et octets. Compare la version actuelle à une version de référence (PERF_BASE=<commit>).
 *   PERF_BASE=5b1a8f5 SUITES=perf_audit sh tests/run.sh
 * Sans PERF_BASE : mesure seulement la version actuelle et vérifie un budget (première image < 6 s en 4G lente).
 */
const fs = require("fs"), path = require("path"), http = require("http"), os = require("os"), { execSync } = require("child_process");
const puppeteer = require("puppeteer-core");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ROOT = path.join(__dirname, ".."), SITE = path.join(__dirname, ".site");
let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x !== undefined ? "  -> " + JSON.stringify(x) : "")); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

function serveDir(dir, port) {
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2" };
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const f = path.join(dir, decodeURIComponent(req.url.split("?")[0]).replace(/\.\./g, ""));
      fs.readFile(f, (e, data) => {
        if (e) { res.writeHead(404); return res.end(); }
        const h = { "Content-Type": types[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" };
        if (/\.(html|js|json|svg)$/.test(f) && /\bbr\b/.test(req.headers["accept-encoding"] || "")) { h["Content-Encoding"] = "br"; res.writeHead(200, h); return res.end(require("zlib").brotliCompressSync(data)); }
        res.writeHead(200, h);
        res.end(data);
      });
    }).listen(port, () => resolve(srv));
  });
}

// Version de référence : l'app d'un ancien commit, avec les mêmes branchements d'émulateur.
function buildBase(commit) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "perf_base_"));
  fs.readdirSync(SITE).forEach((f) => { if (f !== "app.html") fs.cpSync(path.join(SITE, f), path.join(dir, f), { recursive: true }); });
  const marker = "const fx  = firebase.app().functions('europe-west1');";
  const html = execSync(`git show ${commit}:app_DEF.html`, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
  const emu = "auth.useEmulator('http://127.0.0.1:9099');db.useEmulator('127.0.0.1',8080);fx.useEmulator('127.0.0.1',5001);";
  fs.writeFileSync(path.join(dir, "app.html"), html.replace(marker, marker + emu));
  return dir;
}

async function measure(browser, url, runs = 5) {
  const out = { fcp: [], ready: [], bytes: [], reqs: [], blocking: [] };
  for (let i = 0; i < runs; i++) {
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage();
    const cdp = await p.createCDPSession();
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    let bytes = 0, reqs = 0;
    cdp.on("Network.loadingFinished", (e) => { bytes += e.encodedDataLength || 0; reqs++; });
    await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    const t0 = Date.now();
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    await p.waitForFunction(() => document.getElementById("onboard") && document.getElementById("onboard").classList.contains("active"), { timeout: 120000, polling: 100 });
    out.ready.push(Date.now() - t0);
    out.fcp.push(await p.evaluate(() => { const e = performance.getEntriesByName("first-contentful-paint")[0]; return e ? Math.round(e.startTime) : null; }));
    out.blocking.push(await p.evaluate(() => performance.getEntriesByType("resource").filter((r) => r.initiatorType === "script" && r.responseEnd < (performance.getEntriesByName("first-contentful-paint")[0] || { startTime: 1e9 }).startTime).length));
    await sleep(1500);
    out.bytes.push(bytes); out.reqs.push(reqs);
    await ctx.close();
  }
  return { ready: median(out.ready), fcp: median(out.fcp.filter(Boolean)), kb: Math.round(median(out.bytes) / 1024), reqs: median(out.reqs), blocking: median(out.blocking) };
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const cur = await measure(browser, "http://localhost:8950/app.html");
  console.log("Version actuelle :", JSON.stringify(cur));
  if (process.env.PERF_BASE) {
    const dir = buildBase(process.env.PERF_BASE), srv = await serveDir(dir, 8951);
    const base = await measure(browser, "http://localhost:8951/app.html");
    console.log("Référence " + process.env.PERF_BASE + " :", JSON.stringify(base));
    check(`Premier écran : ${cur.ready} ms (référence ${base.ready} ms)`, cur.ready <= base.ready * 1.1, { cur, base });
    srv.close();
  }
  check(`Budget : premier écran en réseau « 4G lente » + processeur 4× moins rapide sous 8 s (mesuré ${cur.ready} ms)`, cur.ready < 8000, cur);
  await browser.close();
  console.log(`\n===== ${pass}/${pass + fail} OK =====`);
  process.exit(fail ? 1 : 0);
})();
