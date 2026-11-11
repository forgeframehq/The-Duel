// main.js — wires everything together: render loop, camera, HUD, and the feel layer
// (hit-stop, slow motion, shake) that sits on top of the rules in sim.js.
import * as THREE from 'three';
import { TICK, ROUNDS_TO_WIN, createWorld, stepWorld, hasLOS, wrapAngle } from './sim.js';
import { createAI, thinkAI } from './ai.js';
import { buildArena } from './arena.js';
import { FighterView } from './fighterView.js';
import { Particles, Trail, Shake } from './fx.js';
import { Input } from './input.js';
import { byId } from './roster.js';
import { initSelect, resolveRival } from './select.js';
import { sfx, unlockAudio, buzz } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe9b27a, 40, 180);
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 500);

// Golden hour, to match the look of Dawn of Dynasties: low warm sun, cool sky fill.
scene.add(new THREE.HemisphereLight(0xffe0b8, 0x5a5236, 1.5));
// A cool fill from the opposite side keeps fighters readable when the sun is behind them.
const fill = new THREE.DirectionalLight(0xa8bfe6, 0.9);
fill.position.set(24, 16, -22);
scene.add(fill);
const sun = new THREE.DirectionalLight(0xffc27a, 3.0);
sun.position.set(-30, 20, 26);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 90 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(sun);

const arena = buildArena();
scene.add(arena.group);

// The two fighters on screen. Filled in once their models have loaded.
let views = [];
let fighters = [byId('sun_warlord'), byId('varek')];
let fighterRequest = 0;
async function setFighters(youId, rivalId) {
  const request = ++fighterRequest;
  const next = await Promise.all([FighterView.create(byId(youId), 'blue'), FighterView.create(byId(rivalId), 'red')]);
  if (request !== fighterRequest) { next.forEach((v) => v.dispose()); return; } // a newer choice has been made since
  views.forEach((v) => v.dispose());
  views = next; fighters = [byId(youId), byId(rivalId)];
  views.forEach((v) => scene.add(v.root));
}
const trails = [new Trail(scene), new Trail(scene)];
const particles = new Particles(scene);
const shake = new Shake();
const input = new Input();

let world = createWorld(arena, { ...fighters[0].stats, weapon: fighters[0].weapon }, { ...fighters[1].stats, weapon: fighters[1].weapon });
let ai = createAI('normal');
let level = 'normal';
let app = 'menu';            // 'menu' | 'playing'
let paused = false;
let acc = 0, hitStop = 0, slowT = 0, slowScale = 1, lastTime = performance.now(), menuSpin = 0;
let lockWanted = true, locked = false, lostT = 0, lastSecond = -1;
const cam = { yaw: 0, pitch: 0.36, dist: 5.2 };
const tmp = new THREE.Vector3(), look = new THREE.Vector3();

// ---------- HUD ----------
const hud = {
  hp: [$('hp0'), $('hp1')], ghost: [$('ghost0'), $('ghost1')], st: [$('st0'), $('st1')], pips: [$('pips0'), $('pips1')],
  timer: $('timer'), round: $('round'), banner: $('banner'), labels: $('labels'), lock: $('btn-lock'),
};
hud.pips.forEach((p) => { p.innerHTML = '<span></span>'.repeat(ROUNDS_TO_WIN); });

const hBtn = $('btn-h'), vBtn = $('btn-v');
function updateHud() {
  world.fighters.forEach((f, i) => {
    const hp = Math.max(0, f.hp / f.stats.maxHp) * 100, st = Math.max(0, f.stam / f.stats.maxStam) * 100;
    hud.hp[i].style.width = hud.ghost[i].style.width = hp + '%';
    hud.st[i].style.width = st + '%';
    hud.st[i].classList.toggle('low', st < 22);
    hud.st[i].parentElement.classList.toggle('winded', f.winded > 0);
    if (i === 0) { hBtn.classList.toggle('charging', f.state === 'charge' && f.charge === 'h'); vBtn.classList.toggle('charging', f.state === 'charge' && f.charge === 'v'); }
    [...hud.pips[i].children].forEach((el, k) => {
      // The rival's pips fill from the outside in, mirroring the player's.
      const idx = i === 0 ? k : ROUNDS_TO_WIN - 1 - k;
      el.classList.toggle('won', idx < world.score[i]);
    });
  });
  const s = Math.ceil(world.timeLeft);
  hud.timer.textContent = s;
  hud.timer.classList.toggle('low', s <= 10);
  hud.round.textContent = 'ROUND ' + world.round;
  hud.lock.classList.toggle('want', lockWanted);
  hud.lock.classList.toggle('locked', locked);
}

function banner(main, sub = '', dur = 1.6) {
  $('banner-main').textContent = main; $('banner-sub').textContent = sub;
  hud.banner.style.setProperty('--dur', dur + 's');
  hud.banner.classList.remove('show');
  void hud.banner.offsetWidth; // restart the animation
  hud.banner.classList.add('show');
}

function label(text, x, y, z, cls = '') {
  tmp.set(x, y, z).project(camera);
  if (tmp.z > 1) return;
  const el = document.createElement('span');
  el.textContent = text; el.className = cls;
  el.style.left = ((tmp.x + 1) / 2) * innerWidth + (Math.random() - 0.5) * 30 + 'px';
  el.style.top = ((1 - tmp.y) / 2) * innerHeight + 'px';
  hud.labels.appendChild(el);
  setTimeout(() => el.remove(), 1150);
}

function pulse(id, ms) { const el = $(id); el.classList.add('on'); setTimeout(() => el.classList.remove('on'), ms); }

// One of these shows under the round banner, so the rules of the exchange sink in over a few rounds.
const TIPS = ['Tap Slash or Chop to combo', 'Hold an attack to charge it', 'A charged strike cannot be stopped by normal hits', 'Parry a glowing strike to throw them open',
  'Normal attacks beat a parry', 'Dodge out of a charge to feint', 'Empty stamina leaves you exhausted', 'Strike from behind for extra damage'];
let tipIndex = 0;

// ---------- Turning rule events into things you see, hear and feel ----------
function handleEvents() {
  for (const e of world.events) {
    switch (e.type) {
      case 'round':
        views.forEach((v, i) => v.snap(world.fighters[i]));
        trails.forEach((t) => { t.count = 0; });
        cam.yaw = world.fighters[0].yaw; cam.pitch = 0.36; locked = false; lostT = 0;
        if (app === 'playing') { banner('ROUND ' + world.round, TIPS[(tipIndex++) % TIPS.length], 2.1); sfx.horn(); }
        break;
      case 'fight': banner('FIGHT!', '', 1.0); sfx.gong(); break;
      case 'swing': sfx.swing(e.heavy); break;
      case 'dodge': {
        const f = world.fighters[e.id];
        particles.emit(f.x, 0.15, f.z, 10, 0x8a7a5a, 2.2, 0.5, 2, 0.4);
        sfx.dodge();
        break;
      }
      case 'evade': label('EVADE', e.x, 2.1, e.z, 'call'); break;
      case 'armor':
        // A normal hit soaked up by a charging fighter: blue sparks, no flinch.
        hitStop = Math.max(hitStop, 0.04); shake.add(0.2);
        particles.emit(e.x, 1.3, e.z, 14, 0x6ec0ff, 5, 0.35);
        sfx.block();
        label(String(Math.round(e.dmg)), e.x, 2.0, e.z, e.id === 0 ? '' : 'hurt');
        break;
      case 'clash':
        hitStop = Math.max(hitStop, 0.09); shake.add(0.45);
        particles.emit(e.x, 1.35, e.z, 30, 0xfff0b0, 8, 0.4);
        sfx.block();
        label('CLASH', e.x, 2.2, e.z, 'call');
        buzz(30);
        break;
      case 'charge': sfx.charge(); break;
      case 'winded': {
        const f = world.fighters[e.id];
        label('EXHAUSTED', f.x, 2.3, f.z, e.id === 0 ? 'call hurt' : 'call');
        if (e.id === 0) sfx.winded();
        if (e.id === 0) buzz(60);
        break;
      }
      case 'hit': {
        const mine = e.id === 0;
        hitStop = Math.max(hitStop, e.kill ? 0.2 : e.heavy ? 0.13 : 0.07);
        shake.add(e.kill ? 1 : e.heavy ? 0.75 : 0.42);
        particles.emit(e.x, 1.25, e.z, e.heavy ? 34 : 18, 0xffb040, e.heavy ? 7 : 5, 0.45);
        particles.emit(e.x, 1.25, e.z, e.heavy ? 16 : 8, 0xd02818, 3.5, 0.6);
        sfx.hit(e.heavy);
        label(String(Math.round(e.dmg)), e.x, 2.0, e.z, mine ? (e.heavy || e.backstab ? 'big' : '') : 'hurt');
        if (e.backstab) label('BACKSTAB', e.x, 2.5, e.z, 'call');
        else if (e.riposte) label('RIPOSTE', e.x, 2.5, e.z, 'call');
        else if (e.punish) label('PUNISH', e.x, 2.5, e.z, 'call');
        if (!mine) { pulse('vignette', 120); buzz(e.heavy ? 90 : 45); } else buzz(20);
        if (e.kill) { slowT = 1.5; slowScale = 0.22; sfx.death(); pulse('flash', 60); }
        break;
      }
      case 'block':
        hitStop = Math.max(hitStop, 0.05); shake.add(e.heavy ? 0.5 : 0.28);
        particles.emit(e.x, 1.3, e.z, e.heavy ? 22 : 12, 0xfff0b0, 6, 0.3);
        sfx.block();
        label('BLOCKED', e.x, 2.1, e.z, 'call');
        if (e.target === 0) buzz(25);
        break;
      case 'parry':
        hitStop = Math.max(hitStop, 0.16); shake.add(0.5); slowT = 0.4; slowScale = 0.4;
        particles.emit(e.x, 1.35, e.z, 46, 0xfff6d0, 9, 0.5);
        sfx.parry(); pulse('flash', 50);
        label('PARRY', e.x, 2.3, e.z, 'call');
        if (e.id === 0) buzz(40);
        break;
      case 'guardbreak':
        hitStop = Math.max(hitStop, 0.14); shake.add(0.8);
        particles.emit(e.x, 1.3, e.z, 36, 0xffc070, 8, 0.45);
        sfx.guardBreak();
        label('GUARD BREAK', e.x, 2.3, e.z, 'call');
        if (e.target === 0) { pulse('vignette', 120); buzz(110); }
        break;
      case 'roundend': {
        const title = e.timeout ? 'TIME UP' : e.winner < 0 ? 'DRAW' : 'K.O.';
        const sub = e.winner === 0 ? 'Round to you' : e.winner === 1 ? 'Round to your rival' : 'No one takes it';
        setTimeout(() => banner(title, sub, 2.4), e.timeout ? 0 : 700);
        break;
      }
      case 'matchover': if (e.winner === 0) sfx.victory(); showMenu(e.winner === 0 ? 'VICTORY' : 'DEFEAT', `${world.score[0]} – ${world.score[1]}`); break;
    }
  }
  world.events.length = 0;
}

// ---------- Camera ----------
function blocked(x, z) {
  if (Math.hypot(x, z) > arena.R - 0.5) return true;
  for (const o of arena.obstacles) {
    if (!o.tall) continue;
    if (o.kind === 'circle' ? Math.hypot(x - o.x, z - o.z) < o.r + 0.3 : Math.abs(x - o.x) < o.hw + 0.3 && Math.abs(z - o.z) < o.hd + 0.3) return true;
  }
  return false;
}

function updateCamera(dt) {
  const [p, e] = world.fighters;
  if (app === 'menu' || views.length < 2) {
    menuSpin += dt * 0.12;
    camera.position.set(Math.sin(menuSpin) * 13, 4.2, Math.cos(menuSpin) * 13);
    camera.lookAt(0, 1.4, 0);
    return;
  }
  const pv = views[0].root.position, ev = views[1].root.position;
  const dx = e.x - p.x, dz = e.z - p.z, dist = Math.hypot(dx, dz), los = hasLOS(world, p.x, p.z, e.x, e.z);
  const fighting = world.phase === 'fight' && p.state !== 'dead';
  if (!lockWanted || !fighting) locked = world.phase !== 'fight' && lockWanted && los;
  else if (locked) {
    lostT = los ? 0 : lostT + dt;
    if (dist > 18 || lostT > 1.2) locked = false;
  } else if (los && dist < 13) { locked = true; lostT = 0; }

  const [lx, ly] = input.takeLook();
  cam.pitch = Math.max(0.05, Math.min(0.9, cam.pitch + ly * 0.004));
  if (locked) {
    const want = Math.atan2(dx, dz);
    cam.yaw = wrapAngle(cam.yaw + wrapAngle(want - cam.yaw) * Math.min(1, 6 * dt));
  } else cam.yaw = wrapAngle(cam.yaw - lx * 0.0055);

  // Pull the camera in when a wall would come between it and the player.
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw), flat = Math.cos(cam.pitch);
  let d = cam.dist;
  for (let i = 1; i <= 10; i++) {
    const t = (i / 10) * cam.dist;
    if (blocked(pv.x - sy * flat * t, pv.z - cy * flat * t)) { d = Math.max(1.2, t - cam.dist / 10); break; }
  }
  cam.cur = cam.cur === undefined ? d : cam.cur + (d - cam.cur) * Math.min(1, (d < cam.cur ? 20 : 4) * dt);
  // Stand further off the shoulder while locked on, so the player's own body does not hide the enemy.
  cam.side = (cam.side ?? 0.55) + ((locked ? 1.2 : 0.55) - (cam.side ?? 0.55)) * Math.min(1, 4 * dt);
  const side = cam.side;
  camera.position.set(pv.x - sy * flat * cam.cur - cy * side, 1.55 + Math.sin(cam.pitch) * cam.cur, pv.z - cy * flat * cam.cur + sy * side);
  if (locked) look.set(pv.x * 0.55 + ev.x * 0.45, 1.25, pv.z * 0.55 + ev.z * 0.45);
  else look.set(pv.x + sy * 3, 1.3, pv.z + cy * 3);
  camera.position.add(shake.offset);
  camera.lookAt(look);
}

// ---------- Menu / flow ----------
function showMenu(title, result = '') {
  app = 'menu'; input.enabled = false; input.reset();
  $('menu-title').textContent = result ? title : '';
  // The title screen shows the painted artwork and logo; result screens show the arena behind.
  $('menu').classList.toggle('title', !result);
  $('menu-result').textContent = result;
  $('menu-kicker').textContent = result ? `${fighters[0].name} against ${fighters[1].name}` : 'A one-on-one fight to the last blow';
  $('start').textContent = result ? 'REMATCH' : 'FIGHT';
  $('change').classList.toggle('hidden', !result);
  $('hint').classList.toggle('hidden', !!result);
  $('menu').classList.remove('hidden'); $('hud').classList.add('hidden'); $('controls').classList.add('hidden');
}

// Landscape only: go fullscreen and pin the orientation where the browser allows it.
// Must be called from a tap, so it runs on the button press rather than after loading.
function goFullscreen() {
  unlockAudio();
  const el = document.documentElement;
  if (matchMedia('(pointer: coarse)').matches && el.requestFullscreen && !document.fullscreenElement) {
    el.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  }
}

function startMatch() {
  world = createWorld(arena, { ...fighters[0].stats, weapon: fighters[0].weapon }, { ...fighters[1].stats, weapon: fighters[1].weapon });
  ai = createAI(level, (Date.now() & 0xffff) + 1);
  acc = 0; hitStop = 0; slowT = 0; paused = false; lockWanted = true; lastSecond = -1;
  app = 'playing'; input.enabled = true; input.reset();
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden'); $('controls').classList.remove('hidden');
  $('you-name').textContent = fighters[0].name.toUpperCase();
  $('foe-name').textContent = fighters[1].name.toUpperCase();
  handleEvents(); updateHud();
}

const select = initSelect({
  onBack: () => $('menu').classList.remove('hidden'),
  onGo: async (picks) => {
    goFullscreen();
    select.busy('LOADING…');
    level = picks.level;
    try {
      await setFighters(picks.you, resolveRival(picks));
    } catch (err) {
      console.error(err);
      select.busy('COULD NOT LOAD — TAP TO RETRY');
      $('go').disabled = false;
      return;
    }
    select.close();
    startMatch();
  },
});
function openSelect() { goFullscreen(); $('menu').classList.add('hidden'); select.open(); }
$('start').addEventListener('click', () => { if ($('menu-result').textContent && views.length === 2) { goFullscreen(); startMatch(); } else openSelect(); });
$('change').addEventListener('click', openSelect);
// Menu sounds for every button outside the fight controls.
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b || b.closest('#controls')) return;
  unlockAudio();
  sfx.ui(b.id === 'go' || (b.id === 'start') ? 'start' : b.classList.contains('back') ? 'back' : b.classList.contains('card') || b.id === 'change' ? 'select' : 'tap');
}, true);
input.onLock = () => { lockWanted = !lockWanted; if (!lockWanted) locked = false; };
function setPaused(v) {
  if (app !== 'playing') return;
  paused = v; $('paused').classList.toggle('hidden', !v);
  if (!v) lastTime = performance.now();
}
input.onPause = () => setPaused(!paused);
$('paused').addEventListener('pointerdown', () => setPaused(false));
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
const portrait = matchMedia('(orientation: portrait) and (pointer: coarse)');
portrait.addEventListener('change', () => { if (portrait.matches) setPaused(true); });

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Keep the horizontal view wide on very long phone screens without squashing it on squarer ones.
  camera.fov = w / h > 2 ? 52 : 58;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- Main loop ----------
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (paused) { renderer.render(scene, camera); return; }

  let scale = 1;
  if (slowT > 0) { slowT -= dt; scale = slowScale; }
  let simDt = dt * scale;
  if (hitStop > 0) { hitStop -= dt; simDt = 0; }

  if (app === 'playing') {
    acc += simDt;
    const p = world.fighters[0], e = world.fighters[1];
    while (acc >= TICK) {
      const faceYaw = locked ? Math.atan2(e.x - p.x, e.z - p.z) : null;
      stepWorld(world, [input.sample(cam.yaw, faceYaw, TICK), thinkAI(ai, world, 1)]);
      handleEvents();
      acc -= TICK;
      if (app !== 'playing') break;
    }
    const sec = Math.ceil(world.timeLeft);
    if (world.phase === 'fight' && sec !== lastSecond && sec <= 10 && sec > 0) sfx.tick();
    lastSecond = sec;
    updateHud();
  }

  if (views.length === 2) world.fighters.forEach((f, i) => {
    views[i].update(f, simDt);
    const swinging = f.state === 'attack' && f.t >= f.atk.windup * 0.7 && f.t <= f.atk.windup + f.atk.active + 0.05;
    if (simDt > 0) trails[i].update(views[i], swinging, swinging && f.atk.heavy);
  });
  particles.update(dt * scale);
  shake.update(dt);
  updateCamera(dt);
  window.__duel.debug?.(camera);
  renderer.render(scene, camera);
}

showMenu('THE DUEL');
world.events.length = 0;
// Two fighters stand in the ring behind the menu while the player decides.
setFighters(fighters[0].id, fighters[1].id).then(() => views.forEach((v, i) => v.snap(world.fighters[i]))).catch((err) => console.error(err));
requestAnimationFrame(frame);

// Handy for testing from the browser console.
window.__duel = { get world() { return world; }, get ai() { return ai; }, input, cam, get views() { return views; }, startMatch, setFighters, setLevel: (l) => { level = l; } };
