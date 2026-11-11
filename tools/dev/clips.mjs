// Film strips of motion clips, with the moments the weapon hand (and feet) move fastest, for timing new moves.
//     node tools/dev/clips.mjs <out dir> <Clip_Name> [...]        (uses tools/viewer.html; MODEL=<id> picks the fighter)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const [out, ...names] = process.argv.slice(2);
const pw = [process.env.PLAYWRIGHT, '/opt/npm-tools/node_modules/playwright/index.mjs'].find((p) => p && fs.existsSync(p));
const { chromium } = await import(pw ? pathToFileURL(pw).href : 'playwright');
const TYPES = { html: 'text/html', js: 'text/javascript', glb: 'model/gltf-binary' };
const server = http.createServer((req, res) => { const f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f).slice(1)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 320, height: 320 } }); p.on('pageerror', (e) => console.log('PAGEERR ' + e.message));
await p.goto(`http://127.0.0.1:${server.address().port}/tools/viewer.html?model=${process.env.MODEL || 'plate_knight'}`); await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
fs.mkdirSync(out, { recursive: true });
const all = Object.fromEntries(await p.evaluate(() => window.clipNames()));
const FRAMES = 12;
for (const name of names.length ? names : Object.keys(all)) {
  const dur = all[name]; if (!dur) { console.log(name, 'not found'); continue; }
  for (let i = 0; i < FRAMES; i++) { await p.evaluate(([n, t]) => window.show(n, t, 'front'), [name, dur * i / (FRAMES - 1) * 0.999]); await p.screenshot({ path: `${out}/${name}_${String(i).padStart(2, '0')}.png` }); }
  const peaks = {};
  for (const bone of ['RightHand', 'RightFoot', 'LeftFoot']) { const tr = await p.evaluate(([n, bn]) => window.trace(n, bn), [name, bone]); const top = tr.slice().sort((a, c) => c[1] - a[1])[0]; peaks[bone] = `${top[0]}s @${top[1]}m/s`; if (bone === 'RightHand') peaks.fast = tr.filter((x) => x[1] > top[1] * 0.6).map((x) => x[0]).join(' '); }
  console.log(name, 'dur', dur, JSON.stringify(peaks));
}
await b.close(); server.close();
