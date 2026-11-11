// Visual check of every screen, at several phone sizes, straight from the game.
//
//     node tools/visual_check.mjs              every screen, including a real fight (slow: a few minutes)
//     node tools/visual_check.mjs --no-fight   menus and fighter select only (about a minute)
//     node tools/visual_check.mjs 915x412      only the sizes named
//
// It opens the game in a test browser, walks through the title screen, the fighter select screen
// (once for every fighter, so every name and description is checked), the fight screen, the pause
// screen and the result screen, and takes a picture of each one at each phone size. On every picture
// it measures what is on screen and marks anything that looks wrong with a red outline:
//
//   - spills out   words or a button sticking out of the box they belong to
//   - cut off      words chopped by the edge of their box
//   - off screen   anything hanging off the edge of the phone
//   - overlap      two pieces of text, or two buttons, sitting on top of each other
//   - tiny text    words smaller than 9 px on that phone (hard to read)
//   - small button a button smaller than 40 px (hard to hit with a thumb)
//
// Pictures go to build/visual/<size>/<screen>.png and the list to build/visual/report.md.
// Look at the pictures, not only the list: a screen can measure fine and still look wrong.
//
// Needs playwright and Chrome. Set PLAYWRIGHT (path to playwright's index.mjs) and CHROME if they
// are not in the usual places.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'build', 'visual');
const FONTS = path.join(ROOT, 'tools', 'dev', 'fonts');
const args = process.argv.slice(2);
const FIGHT = !args.includes('--no-fight');
// Phone screens in landscape, in CSS pixels. "in-app browser" is a phone whose browser bar eats the height,
// which is how the game looks when opened from a chat link.
const ALL_SIZES = [
  ['800x360', 'small Android phone'], ['844x390', 'iPhone'], ['915x412', 'large Android phone'],
  ['915x340', 'large phone, in-app browser bar showing'], ['1280x800', 'tablet'],
];
const named = args.filter((a) => /^\d+x\d+$/.test(a));
const SIZES = named.length ? named.map((s) => [s, ALL_SIZES.find((x) => x[0] === s)?.[1] || 'custom']) : ALL_SIZES;

const pwPath = [process.env.PLAYWRIGHT, '/opt/npm-tools/node_modules/playwright/index.mjs', path.join(ROOT, 'node_modules/playwright/index.mjs')].find((p) => p && fs.existsSync(p));
const { chromium } = await import(pwPath ? pathToFileURL(pwPath).href : 'playwright');
const chrome = [process.env.CHROME, '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && fs.existsSync(p));

// ---------- a tiny web server for the game folder ----------
const TYPES = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', webmanifest: 'application/json',
  png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', glb: 'model/gltf-binary', mp3: 'audio/mpeg', ogg: 'audio/ogg', woff2: 'font/woff2', svg: 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file).slice(1)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---------- the measuring, run inside the page ----------
const AUDIT = () => {
  const W = innerWidth, H = innerHeight, issues = [];
  const shown = (el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const label = (el) => el.id ? '#' + el.id : (el.className && typeof el.className === 'string' ? el.tagName.toLowerCase() + '.' + el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase());
  const words = (el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const R = (r) => ({ x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom });
  // the rectangle the words themselves cover (not the element's padding)
  const textRect = (el) => {
    let box = null;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) {
        if (!r.width || !r.height) continue;
        box = box ? { left: Math.min(box.left, r.left), top: Math.min(box.top, r.top), right: Math.max(box.right, r.right), bottom: Math.max(box.bottom, r.bottom) } : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }
    }
    return box && R({ ...box, width: box.right - box.left, height: box.bottom - box.top });
  };
  const alpha = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return 0; const p = m[1].split(/[,/ ]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; };
  const isBox = (el) => {
    if (el === document.body || el === document.documentElement) return false;
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    if (r.width >= W - 2 && r.height >= H - 2) return false;            // a full-screen layer is not a box
    return parseFloat(s.borderTopWidth) > 0 || s.backgroundImage !== 'none' || alpha(s.backgroundColor) > 0.05;
  };
  const clips = (el) => { const s = getComputedStyle(el); return /hidden|clip|auto|scroll/.test(s.overflowX + s.overflowY); };
  const push = (kind, el, rect, note) => issues.push({ kind, what: label(el), words: words(el), note, rect: [Math.round(rect.x), Math.round(rect.y), Math.round(rect.w), Math.round(rect.h)] });

  const items = [];   // things a player reads or presses
  for (const el of document.querySelectorAll('body *')) {
    if (!shown(el) || el.closest('#labels, #studio, #rotate, canvas, svg, script, style') || el.id === 'touch') continue;
    const isButton = el.tagName === 'BUTTON', tr = textRect(el);
    if (!isButton && !tr) continue;
    const er = R(el.getBoundingClientRect());
    if (!er.w || !er.h) continue;
    const cs = getComputedStyle(el);
    items.push({ el, isButton, tr, er, round: isButton && parseFloat(cs.borderTopLeftRadius) >= Math.min(er.w, er.h) / 2 - 1 });
    const rect = tr || er;

    // off screen
    if (rect.x < -1 || rect.y < -1 || rect.r > W + 1 || rect.b > H + 1) push('off screen', el, rect, 'hangs off the edge of the screen');

    // spills out of / cut off by the box it sits in
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const box = isBox(a), clip = clips(a);
      if (!box && !clip) continue;
      const ar = R(a.getBoundingClientRect());
      const over = Math.max(ar.x - rect.x, ar.y - rect.y, rect.r - ar.r, rect.b - ar.b);
      if (over > 1.5) {
        const side = [ar.y - rect.y > 1.5 && 'top', rect.b - ar.b > 1.5 && 'bottom', ar.x - rect.x > 1.5 && 'left', rect.r - ar.r > 1.5 && 'right'].filter(Boolean).join(' and ');
        push(clip ? 'cut off' : 'spills out', el, rect, `${Math.round(over)} px past the ${side} of ${label(a)}`);
        break;
      }
      if (box) break;   // inside its own box: fine
    }
    // words that do not fit their own element
    if (tr && clips(el) && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) push('cut off', el, er, 'the words do not fit and are chopped');

    if (tr && parseFloat(cs.fontSize) < 9) push('tiny text', el, tr, `${parseFloat(cs.fontSize).toFixed(1)} px`);
    if (isButton && Math.min(er.w, er.h) < 40) push('small button', el, er, `${Math.round(er.w)} x ${Math.round(er.h)} px`);
  }

  // overlaps: text on text, button on button, text on someone else's button
  const hit = (a, b) => {
    const A = a.isButton ? a.er : a.tr, B = b.isButton ? b.er : b.tr;
    if (a.round && b.round) { const d = Math.hypot(A.x + A.w / 2 - B.x - B.w / 2, A.y + A.h / 2 - B.y - B.h / 2); return A.w / 2 + B.w / 2 - d > 3 ? A.w / 2 + B.w / 2 - d : 0; }
    const ox = Math.min(A.r, B.r) - Math.max(A.x, B.x), oy = Math.min(A.b, B.b) - Math.max(A.y, B.y);
    return ox > 3 && oy > 3 ? Math.min(ox, oy) : 0;
  };
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    if (a.el.closest('#paused') || b.el.closest('#paused')) continue;     // the pause sheet is meant to cover the fight
    const o = hit(a, b);
    if (o) push('overlap', a.el, a.isButton ? a.er : a.tr, `${Math.round(o)} px over ${label(b.el)}${words(b.el) ? ' "' + words(b.el) + '"' : ''}`);
  }
  return issues;
};
const MARK = (issues) => {
  document.getElementById('vc-marks')?.remove();
  const layer = document.createElement('div'); layer.id = 'vc-marks'; layer.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none';
  for (const it of issues) {
    const [x, y, w, h] = it.rect, d = document.createElement('div'), soft = it.kind === 'tiny text' || it.kind === 'small button';
    d.style.cssText = `position:absolute;left:${x - 2}px;top:${y - 2}px;width:${w + 4}px;height:${h + 4}px;border:${soft ? '1px dashed #ffd23f' : '2px solid #ff2b2b'};box-sizing:border-box`;
    layer.appendChild(d);
  }
  document.body.appendChild(layer);
};

// ---------- drive the game ----------
const browser = await chromium.launch({ executablePath: chrome, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 915, height: 412 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => { if (!/setPointerCapture/.test(e.message)) errors.push(e.message); });   // that one comes from this tool's fake taps
// The game's lettering comes from Google Fonts. Serve the same fonts from tools/dev/fonts so the check
// works offline and the letters are the same width as on a phone.
const face = (family, weight, file) => `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;src:url(${BASE}/tools/dev/fonts/${file}) format("woff2")}`;
const fontCss = [600, 700, 800].map((w) => face('Cinzel', w, `cinzel-latin-${w}-normal.woff2`)).join('') + face('Cinzel Decorative', 700, 'cinzel-decorative-latin-700-normal.woff2');
await page.route('**/fonts.googleapis.com/**', (r) => fs.existsSync(FONTS) ? r.fulfill({ contentType: 'text/css', body: fontCss }) : r.abort());
await page.route('**/fonts.gstatic.com/**', (r) => r.abort());

const results = [];   // { size, screen, issues }
const click = (sel) => page.evaluate((s) => document.querySelector(s).click(), sel);
async function shot(size, screen) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  const issues = await page.evaluate(AUDIT);
  await page.evaluate(MARK, issues);
  const dir = path.join(OUT, size); fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, screen + '.png') });
  await page.evaluate(() => document.getElementById('vc-marks')?.remove());
  results.push({ size, screen, issues });
  process.stdout.write(issues.some((i) => !/tiny|small/.test(i.kind)) ? 'x' : '.');
}

// Fight on the open field: the courtyard is too slow to draw in the test browser.
await page.addInitScript(() => { try { localStorage.setItem('duel.arena', 'field'); localStorage.setItem('duel.music', 'off'); } catch { /* no storage */ } });
fs.rmSync(OUT, { recursive: true, force: true });
await page.goto(`${BASE}/index.html?arena=field`);
await page.waitForFunction(() => !document.getElementById('studio') && document.getElementById('build').textContent, null, { timeout: 60000 });
const build = (await page.evaluate(() => document.getElementById('build').textContent)).replace(/\D/g, '');
const setSize = async (size) => { const [w, h] = size.split('x').map(Number); await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(300); };

// 1. title and fighter select, at every size
for (const [size] of SIZES) {
  await setSize(size);
  await shot(size, '01-title');
  await click('#start'); await page.waitForTimeout(200);
  const n = await page.evaluate(() => document.querySelectorAll('#roster .card').length);
  for (let i = 0; i < n; i++) {
    const id = await page.evaluate((i) => { const c = document.querySelectorAll('#roster .card')[i]; c.click(); return document.getElementById('d-name').textContent.toLowerCase().replace(/[^a-z]+/g, '-'); }, i);
    await shot(size, `02-select-${String(i + 1).padStart(2, '0')}-${id}`);
  }
  await click('.tabs button[data-side=rival]'); await page.waitForTimeout(100);
  await page.evaluate(() => document.querySelector('#roster .card').click());
  await shot(size, '03-select-rival-random');
  await click('.tabs button[data-side=you]'); await click('#sel-back'); await page.waitForTimeout(150);
}

// 2. a real fight: the two fighters with the longest names, then pause, then the result screen
let fightNote = 'skipped (--no-fight)';
if (FIGHT) {
  try {
    await setSize(SIZES[0][0]);
    await click('#start');
    await page.evaluate(() => { const c = document.querySelectorAll('#roster .card'); c[0].click(); document.querySelector('.tabs button[data-side=rival]').click(); document.querySelectorAll('#roster .card')[2].click(); document.getElementById('go').click(); });
    await page.waitForFunction(() => window.__duel?.world?.phase === 'fight' && window.__duel.views.length === 2, null, { timeout: 240000 });
    for (const [size] of SIZES) { await setSize(size); await page.waitForTimeout(1500); await shot(size, '04-fight'); }
    await page.keyboard.press('Escape').catch(() => {});
    await page.evaluate(() => document.getElementById('btn-pause').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })));
    await page.waitForTimeout(500);
    if (await page.evaluate(() => !document.getElementById('paused').classList.contains('hidden'))) {
      for (const [size] of SIZES) { await setSize(size); await shot(size, '05-paused'); }
      await page.evaluate(() => document.getElementById('paused').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    }
    // run the clock out with the rival hurt until the match ends (one round is enough: the player is given the first)
    await page.evaluate(() => { window.__duel.world.score[0] = 1; });
    const t0 = Date.now();
    while (Date.now() - t0 < 240000 && await page.evaluate(() => document.getElementById('menu').classList.contains('hidden'))) {
      await page.evaluate(() => { const w = window.__duel.world; if (w.phase === 'fight') { w.fighters[1].hp = 1; w.timeLeft = Math.min(w.timeLeft, 0.2); } });
      await page.waitForTimeout(1500);
    }
    if (await page.evaluate(() => !document.getElementById('menu').classList.contains('hidden'))) {
      for (const [size] of SIZES) { await setSize(size); await shot(size, '06-result'); }
      fightNote = 'fight, pause and result screens checked';
    } else fightNote = 'fight and pause checked; the match did not finish in time, so the result screen was not checked';
  } catch (e) { fightNote = 'the fight could not be checked: ' + e.message.split('\n')[0]; }
}
await browser.close(); server.close();

// ---------- the report ----------
const hard = (i) => !/tiny text|small button/.test(i.kind);
const lines = [`# Visual check, build ${build}`, '', `Sizes: ${SIZES.map(([s, n]) => `${s} (${n})`).join(', ')}.`, `Fight: ${fightNote}.`, '',
  'Red outline = something is wrong. Dashed yellow = small text or a small button, worth a look.', ''];
// the same problem usually shows on many screens and sizes: group it
const groups = new Map();
for (const r of results) for (const i of r.issues) {
  const screen = r.screen.replace(/^02-select-\d+-/, 'select: ').replace(/^\d+-/, '');
  const key = [i.kind, i.what, i.kind === 'overlap' ? i.note.replace(/^\d+ px /, '') : '', /^select: /.test(screen) && /^#d-|^#roster|card/.test(i.what) ? screen : screen.replace(/^select: .*/, 'select')].join('|');
  const g = groups.get(key) || { ...i, screen: key.split('|')[3], sizes: new Map() };
  const px = parseFloat(i.note) || 0; g.sizes.set(r.size, Math.max(g.sizes.get(r.size) || 0, px)); if (!groups.has(key)) groups.set(key, g);
}
const list = [...groups.values()];
const section = (title, f) => {
  const rows = list.filter(f); lines.push(`## ${title} (${rows.length})`, '');
  if (!rows.length) lines.push('- nothing found', '');
  const byScreen = new Map(); for (const g of rows) byScreen.set(g.screen, [...(byScreen.get(g.screen) || []), g]);
  for (const [screen, gs] of byScreen) { lines.push(`### ${screen}`, ''); for (const g of gs) lines.push(`- **${g.kind}**: ${g.what}${g.words ? ` "${g.words}"` : ''}: ${g.note}. Sizes: ${[...g.sizes.keys()].join(', ')}${g.sizes.size === SIZES.length ? ' (all)' : ''}`); lines.push(''); }
};
section('Wrong', hard);
section('Worth a look', (g) => !hard(g));
if (errors.length) lines.push('## Game errors', '', ...[...new Set(errors)].map((e) => '- ' + e), '');
fs.writeFileSync(path.join(OUT, 'report.md'), lines.join('\n'));
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 1));
console.log(`\n${results.length} pictures, ${list.filter(hard).length} problems, ${list.filter((g) => !hard(g)).length} worth a look. Report: build/visual/report.md`);
