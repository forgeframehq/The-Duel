// main.js — wires everything together: render loop, camera, HUD, and the feel layer
// (hit-stop, slow motion, shake) that sits on top of the rules in sim.js.
import * as THREE from 'three';
import { TICK, ROUNDS_TO_WIN, createWorld, stepWorld, hasLOS, defaultStats, wrapAngle } from './sim.js';
import { createAI, thinkAI } from './ai.js';
import { buildArena } from './arena.js';
import { FighterView } from './fighterView.js';
import { Particles, Trail, Shake } from './fx.js';
import { Input } from './input.js';
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
scene.add(new THREE.HemisphereLight(0xffd9a8, 0x4a4a2c, 1.05));
const sun = new THREE.DirectionalLight(0xffc27a, 3.0);
sun.position.set(-30, 20, 26);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 90 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(sun);

const arena = buildArena();
scene.add(arena.group);

const views = [new FighterView('blue'), new FighterView('red')];
views.forEach((v) => scene.add(v.root));
const trails = [new Trail(scene), new Trail(scene)];
const particles = new Particles(scene);
const shake = new Shake();
const input = new Input();

let world = createWorld(arena, defaultStats(), defaultStats());
let ai = createAI('normal');
let level = 'normal';
let app = 'menu';            // 'menu' | 'playing'
let paused = false;
let acc = 0, hitStop = 0, slowT = 0, slowScale = 1, lastTime = performance.now(), menuSpin = 0;
let lockWanted = true, locked = false, lostT = 0, lastSecond = -1;
const cam = { yaw: 0, pitch: 0.3, dist: 5.4 };
const tmp = new THREE.Vector3(), look = new THREE.Vector3();

// ---------- HUD ----------
const hud = {
  hp: [$('hp0'), $('hp1')], ghost: [$('ghost0'), $('ghost1')], st: [$('st0'), $('st1')], pips: [$('pips0'), $('pips1')],
  timer: $('timer'), round: $('round'), banner: $('banner'), labels: $('labels'), lock: $('btn-lock'),
};
hud.pips.forEach((p) => { p.innerHTML = '<span></span>'.repeat(ROUNDS_TO_WIN); });

function updateHud() {
  world.fighters.forEach((f, i) => {
    const hp = Math.max(0, f.hp / f.stats.maxHp) * 100, st = Math.max(0, f.stam / f.stats.maxStam) * 100;
    hud.hp[i].style.width = hud.ghost[i].style.width = hp + '%';
    hud.st[i].style.width = st + '%';
    hud.st[i].classList.toggle('low', st < 22);
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

// ---------- Turning rule events into things you see, hear and feel ----------
function handleEvents() {
  for (const e of world.events) {
    switch (e.type) {
      case 'round':
        views.forEach((v, i) => v.snap(world.fighters[i]));
        cam.yaw = world.fighters[0].yaw; cam.pitch = 0.3; locked = false; lostT = 0;
        if (app === 'playing') { banner('ROUND ' + world.round, 'Ready', 1.9); sfx.horn(); }
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
      case 'hit': {
        const mine = e.id === 0;
        hitStop = Math.max(hitStop, e.kill ? 0.2 : e.heavy ? 0.13 : 0.07);
        shake.add(e.kill ? 1 : e.heavy ? 0.75 : 0.42);
        particles.emit(e.x, 1.25, e.z, e.heavy ? 34 : 18, 0xffb040, e.heavy ? 7 : 5, 0.45);
        particles.emit(e.x, 1.25, e.z, e.heavy ? 16 : 8, 0xd02818, 3.5, 0.6);
        sfx.hit(e.heavy);
        label(String(Math.round(e.dmg)), e.x, 2.0, e.z, mine ? (e.heavy || e.backstab ? 'big' : '') : 'hurt');
        if (e.backstab) label('BACKSTAB', e.x, 2.5, e.z, 'call');
        if (!mine) { pulse('vignette', 120); buzz(e.heavy ? 90 : 45); } else buzz(20);
        if (e.kill) { slowT = 1.5; slowScale = 0.22; sfx.death(); pulse('flash', 60); }
        break;
      }
      case 'block':
        hitStop = Math.max(hitStop, 0.05); shake.add(e.heavy ? 0.5 : 0.28);
        particles.emit(e.x, 1.3, e.z, e.heavy ? 22 : 12, 0xfff0b0, 6, 0.3);
        sfx.block();
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
      case 'matchover': showMenu(e.winner === 0 ? 'VICTORY' : 'DEFEAT', `${world.score[0]} – ${world.score[1]}`); break;
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
  const [p, e] = world.fighters, pv = views[0].root.position, ev = views[1].root.position;
  if (app === 'menu') {
    menuSpin += dt * 0.12;
    camera.position.set(Math.sin(menuSpin) * 13, 4.2, Math.cos(menuSpin) * 13);
    camera.lookAt(0, 1.4, 0);
    return;
  }
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
  $('menu-title').textContent = title;
  $('menu-result').textContent = result;
  $('menu-kicker').textContent = result ? 'Best of three' : 'A one-on-one fight to the last blow';
  $('start').textContent = result ? 'REMATCH' : 'FIGHT';
  $('menu').classList.remove('hidden'); $('hud').classList.add('hidden'); $('controls').classList.add('hidden');
}

function startMatch() {
  unlockAudio();
  // Landscape only: go fullscreen and pin the orientation where the browser allows it.
  const el = document.documentElement;
  if (matchMedia('(pointer: coarse)').matches && el.requestFullscreen && !document.fullscreenElement) {
    el.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  }
  world = createWorld(arena, defaultStats(), defaultStats());
  ai = createAI(level, (Date.now() & 0xffff) + 1);
  acc = 0; hitStop = 0; slowT = 0; paused = false; lockWanted = true; lastSecond = -1;
  app = 'playing'; input.enabled = true; input.reset();
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden'); $('controls').classList.remove('hidden');
  $('foe-name').textContent = { easy: 'SQUIRE', normal: 'KNIGHT', hard: 'CHAMPION' }[level];
  handleEvents(); updateHud();
}

document.querySelectorAll('.levels button').forEach((b) => b.addEventListener('click', () => {
  level = b.dataset.level;
  document.querySelectorAll('.levels button').forEach((x) => x.classList.toggle('on', x === b));
}));
$('start').addEventListener('click', startMatch);
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

  world.fighters.forEach((f, i) => {
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
views.forEach((v, i) => v.snap(world.fighters[i]));
world.events.length = 0;
requestAnimationFrame(frame);

// Handy for testing from the browser console.
window.__duel = { get world() { return world; }, get ai() { return ai; }, input, cam, views, startMatch, setLevel: (l) => { level = l; } };
