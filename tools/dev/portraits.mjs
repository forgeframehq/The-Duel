// Renders select-screen portraits (PNG, clear background) with tools/portrait.html.
//     node tools/dev/portraits.mjs <out dir> <roster id> [...]
// Then shrink each to 360x450 WebP in assets/portraits/<id>.webp.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const [out, ...ids] = process.argv.slice(2);
const pw = [process.env.PLAYWRIGHT, '/opt/npm-tools/node_modules/playwright/index.mjs'].find((p) => p && fs.existsSync(p));
const { chromium } = await import(pw ? pathToFileURL(pw).href : 'playwright');
const TYPES = { html: 'text/html', js: 'text/javascript', glb: 'model/gltf-binary', webp: 'image/webp', png: 'image/png' };
const server = http.createServer((req, res) => { const f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f).slice(1)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 480, height: 600 }, deviceScaleFactor: 2 }); p.on('pageerror', (e) => console.log('PAGEERR ' + e.message));
fs.mkdirSync(out, { recursive: true });
for (const spec of ids) {
  const [id, extra = ''] = spec.split('?');
  await p.goto(`http://127.0.0.1:${server.address().port}/tools/portrait.html?id=${id}&${extra}`); await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
  await p.screenshot({ path: `${out}/${id}${extra ? '_' + extra.replace(/\W+/g, '_') : ''}.png`, omitBackground: true });
  console.log(id, 'ok');
}
await b.close(); server.close();
