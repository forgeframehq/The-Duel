// Takes pictures of a real fight in the test browser.
//     node tools/dev/shots.mjs <out dir> [arena=courtyard|field] [size=915x412] [bare]
// "bare" hides the HUD and buttons (used to make the arena pictures for the select screen).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const [out, arena = 'courtyard', size = '915x412', bare] = process.argv.slice(2);
const pw = [process.env.PLAYWRIGHT, '/opt/npm-tools/node_modules/playwright/index.mjs'].find((p) => p && fs.existsSync(p));
const { chromium } = await import(pw ? pathToFileURL(pw).href : 'playwright');
const TYPES = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', webmanifest: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', glb: 'model/gltf-binary', mp3: 'audio/mpeg', woff2: 'font/woff2' };
const server = http.createServer((req, res) => { const f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f).slice(1)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const [W, H] = size.split('x').map(Number);
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|404|net::/.test(m.text())) errs.push(m.text()); });
const face = (fam, w, f) => `@font-face{font-family:"${fam}";font-weight:${w};src:url(${BASE}/tools/dev/fonts/${f}) format("woff2")}`;
await p.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: [600, 700, 800].map((w) => face('Cinzel', w, `cinzel-latin-${w}-normal.woff2`)).join('') + face('Cinzel Decorative', 700, 'cinzel-decorative-latin-700-normal.woff2') }));
await p.route('**/fonts.gstatic.com/**', (r) => r.abort());
await p.addInitScript((a) => { try { localStorage.setItem('duel.arena', a); localStorage.setItem('duel.music', 'off'); } catch {} }, arena);
fs.mkdirSync(out, { recursive: true });
await p.goto(`${BASE}/index.html`); await p.waitForFunction(() => !document.getElementById('studio'), null, { timeout: 60000 });
await p.evaluate(() => document.getElementById('start').click()); await p.waitForTimeout(500);
await p.screenshot({ path: `${out}/select.png` });
await p.evaluate(() => document.getElementById('go').click());
await p.waitForFunction(() => window.__duel?.world?.phase === 'fight' && window.__duel.views.length === 2, null, { timeout: 300000 });
const key = async (k, ms = 60) => { await p.keyboard.down(k); await p.waitForTimeout(ms); await p.keyboard.up(k); };
const place = (foe = {}, me = {}) => p.evaluate(([foe, me]) => { const w = window.__duel.world; Object.assign(w.fighters[0], { x: 0, z: -1.3, yaw: 0, hp: 100, stam: 100, state: 'idle', t: 0, winded: 0, seq: '', queue: '', disarmed: false, ...me }); Object.assign(w.fighters[1], { x: 0, z: 0.9, yaw: Math.PI, hp: 100, stam: 100, winded: 0, skillCd: 99, disarmed: false, ...foe }); w.timeLeft = 90; }, [foe, me]);
if (bare) {
  await p.addStyleTag({ content: '#hud,#controls,#labels,#banner,#vignette{display:none!important}' });
  await p.evaluate(() => { const w = window.__duel.world, s = w.spawns; Object.assign(w.fighters[0], { x: s[0].x * 0.35, z: s[0].z * 0.35 }); Object.assign(w.fighters[1], { x: s[1].x * 0.35, z: s[1].z * 0.35, skillCd: 99 }); window.__duel.setLevel('easy'); });
  await p.waitForTimeout(4000); await p.screenshot({ path: `${out}/bare.png` });
} else {
  await place({ state: 'stagger', t: 0, staggerDur: 30 }); await p.waitForTimeout(2500); await p.screenshot({ path: `${out}/1-fight.png` });
  await key('KeyJ'); await p.waitForTimeout(700); await key('KeyJ'); await p.waitForTimeout(900); await p.screenshot({ path: `${out}/2-two-presses.png` });
  await key('KeyK'); await p.waitForTimeout(2500); await p.screenshot({ path: `${out}/3-rising-fang.png` });
  await p.waitForTimeout(5000);
  // the rival charges, the player parries: disarm
  await place({ state: 'charge', charge: 'h', t: 0 }); await p.waitForTimeout(700); await p.screenshot({ path: `${out}/4-rival-charging.png` });
  await key('KeyL'); await p.waitForTimeout(3500); await p.screenshot({ path: `${out}/5-disarmed.png` });
  await p.waitForTimeout(3000); await p.screenshot({ path: `${out}/6-after.png` });
  await p.evaluate(() => { const f = window.__duel.world.fighters[0]; f.seq = 'HH'; f.seqT = 99; f.state = 'idle'; }); await p.waitForTimeout(900); await p.screenshot({ path: `${out}/6b-string.png` });
  await p.evaluate(() => document.getElementById('btn-pause').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))); await p.waitForTimeout(900);
  await p.screenshot({ path: `${out}/7-paused.png` });
  console.log(JSON.stringify(await p.evaluate(() => ({ fps: window.__duel.fps, tris: window.__duel.renderInfo().triangles, foe: { st: window.__duel.world.fighters[1].state, disarmed: window.__duel.world.fighters[1].disarmed } }))));
}
console.log('errors:', [...new Set(errs)].filter((e) => !/setPointerCapture/.test(e)).slice(0, 6).join('\n') || 'none');
await b.close(); server.close();
