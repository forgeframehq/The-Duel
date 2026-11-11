// Pictures of .glb models from four sides.   node tools/dev/look.mjs <out dir> <path from repo root> [...]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const [out, ...files] = process.argv.slice(2);
const pw = [process.env.PLAYWRIGHT, '/opt/npm-tools/node_modules/playwright/index.mjs'].find((p) => p && fs.existsSync(p));
const { chromium } = await import(pw ? pathToFileURL(pw).href : 'playwright');
const TYPES = { html: 'text/html', js: 'text/javascript', glb: 'model/gltf-binary' };
const server = http.createServer((req, res) => { const f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f).slice(1)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1200, height: 420 } }); p.on('pageerror', (e) => console.log('PAGEERR ' + e.message));
fs.mkdirSync(out, { recursive: true });
for (const f of files) {
  await p.goto(`http://127.0.0.1:${server.address().port}/tools/dev/look.html?axes=1&src=${encodeURIComponent(f)}`); await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
  await p.screenshot({ path: `${out}/${path.basename(f, '.glb')}.png` });
  console.log(path.basename(f), JSON.stringify(await p.evaluate(() => window.info)));
}
await b.close(); server.close();
