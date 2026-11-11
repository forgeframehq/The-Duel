// main.js — wires everything together: render loop, camera, HUD, and the feel layer
// (hit-stop, slow motion, shake) that sits on top of the rules in sim.js.
import * as THREE from 'three';
import { TICK, ROUNDS_TO_WIN, createWorld, stepWorld, hasLOS, wrapAngle } from './sim.js';
import { STRINGS, DIR_MOVES, attackFor } from './weapons.js';
import { PARRY_CD, GUARD_MAX } from './sim.js';
import { createAI, thinkAI } from './ai.js';
import { buildCourtyard } from './courtyard.js';
import { buildArena } from './arena.js';
import { buildMeadow } from './meadow.js';
import { FighterView } from './fighterView.js';
import { Particles, Trail, Shake } from './fx.js';
import { Input } from './input.js';
import { byId } from './roster.js';
import { initSelect, resolveRival } from './select.js';
import { sfx, music, unlockAudio, buzz } from './audio.js';
import { QUALITY, nextQuality } from './quality.js';

const $ = (id) => document.getElementById(id);
// Shown on the title screen, so it is easy to tell which version is on a phone. Raise it with every update.
const BUILD = 20;
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, QUALITY.pixels));
renderer.shadowMap.enabled = QUALITY.shadows > 0;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe9b27a, 40, 180);
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 500);

// Golden hour, to match the look of Dawn of Dynasties: low warm sun, cool sky fill.
// Each arena can bring its own light (see applyLook); these are the castle's.
const hemi = new THREE.HemisphereLight(0xffe0b8, 0x5a5236, 1.5);
scene.add(hemi);
// A cool fill from the opposite side keeps fighters readable when the sun is behind them.
const fill = new THREE.DirectionalLight(0xa8bfe6, 0.9);
fill.position.set(24, 16, -22);
scene.add(fill);
const sun = new THREE.DirectionalLight(0xffc27a, 3.0);
sun.position.set(-30, 20, 26);
sun.castShadow = QUALITY.shadows > 0;
sun.shadow.mapSize.set(QUALITY.shadows || 512, QUALITY.shadows || 512);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 90 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(sun);

// Three arenas, chosen on the fighter select screen: the meadow, the castle courtyard and the open field.
// Each is built the first time it is picked and kept after that. (?arena=field in the address starts on the field.)
const query = new URLSearchParams(location.search);
const BUILDERS = { meadow: buildMeadow, courtyard: buildCourtyard, field: buildArena };
// The light an arena is seen in: haze, sky fill, sun and the cool fill opposite it.
const CASTLE_LOOK = { fog: [0xe9b27a, 40, 180], hemi: [0xffe0b8, 0x5a5236, 1.5], sun: [0xffc27a, 3.0, -30, 20, 26], fill: [0xa8bfe6, 0.9], exposure: 1.1,
  env: [0x5a6f9c, 0xf0a45c, 0x5a5236], envIntensity: 0.3 };
function applyLook(look) {
  scene.fog.color.set(look.fog[0]); scene.fog.near = look.fog[1]; scene.fog.far = look.fog[2];
  hemi.color.set(look.hemi[0]); hemi.groundColor.set(look.hemi[1]); hemi.intensity = look.hemi[2];
  sun.color.set(look.sun[0]); sun.intensity = look.sun[1]; sun.position.set(look.sun[2], look.sun[3], look.sun[4]);
  fill.color.set(look.fill[0]); fill.intensity = look.fill[1]; fill.position.set(-look.sun[2] * 0.8, 16, -look.sun[4] * 0.85);
  renderer.toneMappingExposure = look.exposure;
  // Some arenas also light metal and polished surfaces from their sky, so armour and blades catch it.
  if (look.env && !look.envMap) {
    const s = new THREE.Scene(), g = new THREE.SphereGeometry(10, 24, 12), p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    const [top, mid, low] = look.env.map((h) => new THREE.Color(h));
    for (let i = 0; i < p.count; i++) { const h = p.getY(i) / 10; if (h > 0) c.copy(mid).lerp(top, Math.min(1, h * 1.6)); else c.copy(mid).lerp(low, Math.min(1, -h * 4)); col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const pm = new THREE.PMREMGenerator(renderer); look.envMap = pm.fromScene(s, 0.03).texture; pm.dispose(); g.dispose();
  }
  scene.environment = look.envMap || null; scene.environmentIntensity = look.envIntensity || 1;
}
const arenas = {};
let arena = null, arenaId = '';
function setArena(id) {
  if (!BUILDERS[id]) id = 'meadow';
  if (id === arenaId) return;
  if (arena) scene.remove(arena.group);
  arena = arenas[id] || (arenas[id] = BUILDERS[id]());
  arenaId = id;
  scene.add(arena.group);
  applyLook(arena.look || CASTLE_LOOK);
}
let savedArena = null;
try { savedArena = localStorage.getItem('duel.arena2'); } catch { /* storage unavailable */ }
setArena(query.get('arena') || savedArena || 'meadow');

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
  views.forEach((v) => scene.add(v.root, v.dropped));
}
// The fighter shown on the hero select screen, standing in the middle of the arena.
let preview = null, previewRequest = 0, previewT = 0;
const previewPose = { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, state: 'idle', t: 0, guardM: 100, guardRest: 0 };
async function showPreview(id, team) {
  const request = ++previewRequest;
  if (id === 'random') { preview?.dispose(); preview = null; return; }
  if (preview && preview.def.id === id && preview.team === team) return;
  let next = null;
  try { next = await FighterView.create(byId(id), team); } catch (err) { console.error(err); return; }
  if (request !== previewRequest || app !== 'select') { next.dispose(); return; }
  preview?.dispose();
  preview = next; preview.ring.visible = false;
  scene.add(preview.root, preview.dropped);
  preview.snap(previewPose);
}
function hidePreview() { previewRequest++; preview?.dispose(); preview = null; views.forEach((v) => { v.root.visible = true; }); resize(); }
const trails = [new Trail(scene), new Trail(scene)];
const particles = new Particles(scene);
const shake = new Shake();
const input = new Input();

let world = createWorld(arena, { ...fighters[0].stats, weapon: fighters[0].weapon, skill: fighters[0].skill }, { ...fighters[1].stats, weapon: fighters[1].weapon, skill: fighters[1].skill });
let ai = createAI('normal');
let level = 'normal';
let app = 'menu';            // 'menu' | 'select' | 'playing'
let paused = false;
let acc = 0, hitStop = 0, slowT = 0, slowScale = 1, lastTime = performance.now(), menuSpin = 0;
let lockWanted = true, locked = false, lostT = 0, lastSecond = -1;
// Camera views the player can switch between with the camera button (or the C key). The choice is remembered.
const CAMERAS = [
  { id: 'classic', name: 'Classic', dist: 4.3, side: 0.55, sideLocked: 1.1, height: 1.55, pitch: 0.34, fov: 58 },
  { id: 'shoulder', name: 'Shoulder', dist: 3.3, side: 0.85, sideLocked: 1.05, height: 1.5, pitch: 0.2, fov: 54 },
  { id: 'wide', name: 'Wide', dist: 8.5, side: 0, sideLocked: 0.5, height: 1.6, pitch: 0.55, fov: 58 },
  { id: 'side', name: 'Side-on', dist: 6, side: 0.55, sideLocked: 1.2, height: 1.55, pitch: 0.36, fov: 50 }, // both fighters in profile, like a fighting game
];
let camIndex = 0;
try { camIndex = Math.max(0, CAMERAS.findIndex((c) => c.id === localStorage.getItem('duel.camera'))); } catch { /* storage unavailable */ }
const cam = { yaw: 0, pitch: CAMERAS[camIndex].pitch };
const tmp = new THREE.Vector3(), look = new THREE.Vector3();

// ---------- HUD ----------
const hud = {
  hp: [$('hp0'), $('hp1')], ghost: [$('ghost0'), $('ghost1')], st: [$('st0'), $('st1')], gd: [$('gd0'), $('gd1')], pips: [$('pips0'), $('pips1')],
  timer: $('timer'), round: $('round'), banner: $('banner'), labels: $('labels'), lock: $('btn-lock'),
};
hud.pips.forEach((p) => { p.innerHTML = '<span></span>'.repeat(ROUNDS_TO_WIN); });

const hBtn = $('btn-h'), vBtn = $('btn-v'), parryBtn = $('btn-parry'), skillBtn = $('btn-skill');
const marks = [...$('string-marks').children], nextEl = $('string-next');
let shownSeq = null;
// The presses so far light up beside the buttons; after two, it names what each button would finish with.
function showString(f) {
  if (f.seq === shownSeq) return;
  shownSeq = f.seq;
  marks.forEach((el, i) => { el.className = f.seq[i] === 'H' ? 'h' : f.seq[i] === 'V' ? 'v' : ''; });
  $('string').classList.toggle('live', f.seq.length > 0);
  const next = f.seq.length === 2 ? [['H', 'h'], ['V', 'v']].map(([b, c]) => [c, attackFor(f.weapon, f.seq + b).title]).filter((x) => x[1]) : [];
  nextEl.innerHTML = next.map(([c, title]) => `<span><b class="${c}"></b>${title}</span>`).join('');
}
function updateHud() {
  world.fighters.forEach((f, i) => {
    const hp = Math.max(0, f.hp / f.stats.maxHp) * 100, st = Math.max(0, f.stam / f.stats.maxStam) * 100;
    hud.hp[i].style.width = hud.ghost[i].style.width = hp + '%';
    hud.st[i].style.width = st + '%';
    hud.st[i].classList.toggle('low', st < 22);
    hud.gd[i].style.width = Math.max(0, f.guardM / GUARD_MAX) * 100 + '%'; hud.gd[i].classList.toggle('low', f.guardM < 30);
    hud.st[i].parentElement.classList.toggle('winded', f.winded > 0);
    if (i === 0) {
      hBtn.classList.toggle('charging', f.state === 'charge' && f.charge === 'h');
      vBtn.classList.toggle('charging', f.state === 'charge' && f.charge === 'v');
      for (const b of [hBtn, vBtn, parryBtn]) b.classList.toggle('off', f.disarmed);
      // The ring round the Special fills with energy; the ring round Guard shows whether a parry is ready.
      skillBtn.style.setProperty('--cd', Math.round(f.energy)); skillBtn.classList.toggle('ready', f.energy >= 100);
      const parry = 1 - Math.max(0, f.parryCd) / PARRY_CD;
      parryBtn.style.setProperty('--cd', Math.round(parry * 100)); parryBtn.classList.toggle('ready', parry >= 1);
      parryBtn.classList.toggle('down2', f.state === 'guard');
      showString(f);
    }
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
const TIPS = ['Tap for quick cuts: three in a row make a string', 'The order of the buttons picks the finisher', 'Hold Guard to block normal hits',
  'Press Guard just as a blow lands to parry it', 'A rival glowing blue cuts through a guard: parry or dodge', 'Stick away + downward slash: a kick that breaks a guard',
  'Stick toward your rival + a slash: lunge or leap in', 'Keep a slash held down to charge a blue strike', 'Land hits and parries to fill your Special',
  'Only a downward slash reaches a rival on the ground', 'Disarmed? Walk over your weapon, or kick'];
let tipIndex = 0;

// Expanding rings on the ground, for specials, slams and the parry flash.
const rings = [];
function ring(x, z, color, max, dur) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.09, z); m.scale.setScalar(0.2);
  scene.add(m); rings.push({ m, t: 0, dur, max });
}
function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt;
    const k = Math.min(1, r.t / r.dur);
    r.m.scale.setScalar(0.2 + (r.max - 0.2) * (1 - (1 - k) * (1 - k))); r.m.material.opacity = 0.9 * (1 - k);
    if (k >= 1) { scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); rings.splice(i, 1); }
  }
}
let unarmedAt = 0;

// ---------- Turning rule events into things you see, hear and feel ----------
function handleEvents() {
  for (const e of world.events) {
    switch (e.type) {
      case 'round':
        views.forEach((v, i) => v.snap(world.fighters[i]));
        trails.forEach((t) => { t.count = 0; });
        views.forEach((v) => { v.cheer = false; });
        cam.yaw = world.fighters[0].yaw; cam.pitch = CAMERAS[camIndex].pitch; locked = false; lostT = 0;
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
      case 'land': particles.emit(e.x, 0.15, e.z, 14, 0x9a8a6a, 3, 0.5, 2, 0.5); sfx.dodge(); break;
      case 'guardup': {
        // A glint of gold when the guard goes up with a parry in it.
        if (!e.parry) break;
        const f = world.fighters[e.id];
        particles.emit(f.x + Math.sin(f.yaw) * 0.5, 1.3, f.z + Math.cos(f.yaw) * 0.5, 6, 0xfff0c0, 2.2, 0.2);
        break;
      }
      case 'deflect':
        // A normal attack parried: turned aside in a shower of sparks, the attacker left off balance.
        hitStop = Math.max(hitStop, 0.12); shake.add(0.4); slowT = 0.3; slowScale = 0.45;
        particles.emit(e.x, 1.35, e.z, 34, 0xfff6d0, 8, 0.45);
        sfx.parry(); music.duck(0.5, 0.6);
        label('DEFLECT', e.x, 2.3, e.z, 'call');
        if (e.id === 0) buzz(30);
        break;
      case 'skill': {
        const f = world.fighters[e.id];
        banner(e.name.toUpperCase(), fighters[e.id].name, 1.1);
        music.duck(0.4, 1.2); shake.add(0.35); buzz(40);
        if (e.kind === 'sunburst') {
          sfx.charge(); pulse('flash', 90);
          setTimeout(() => { ring(f.x, f.z, 0xffd45a, 5.2, 0.5); ring(f.x, f.z, 0xfff6d0, 3.4, 0.4); particles.emit(f.x, 1.2, f.z, 70, 0xffd76a, 11, 0.7, 2); sfx.parry(); shake.add(0.7); }, 430);
        } else if (e.kind === 'rush' || e.kind === 'flash') { sfx.swing(true); particles.emit(f.x, 0.4, f.z, e.kind === 'flash' ? 40 : 24, e.kind === 'flash' ? 0xff2a3c : 0xc02018, 5, 0.5, 2, 0.6); if (e.kind === 'flash') ring(f.x, f.z, 0xff4a5a, 2.6, 0.35); }
        else { sfx.horn(); ring(f.x, f.z, 0x9fd4ff, 2.4, 0.5); particles.emit(f.x, 1, f.z, 30, 0x9fd4ff, 4, 0.7, -2); }
        break;
      }
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
      case 'charge':
        sfx.charge();
        break;   // the blue glow on the fighter is the only warning: reading it is the skill
      case 'disarm': {
        // The weapon is knocked out of a parried fighter's hand.
        const f = world.fighters[e.id];
        label('DISARMED', f.x, 2.7, f.z, e.id === 0 ? 'call hurt' : 'big');
        particles.emit(f.x, 1.3, f.z, 26, 0xfff0b0, 8, 0.5);
        setTimeout(() => { ring(e.x, e.z, 0xffd76a, 1.8, 0.4); sfx.block(); }, 520);
        if (e.id === 0) { toast('Your weapon! Walk over it'); buzz(120); }
        break;
      }
      case 'pickup': {
        const f = world.fighters[e.id];
        ring(f.x, f.z, 0xffe9a8, 1.6, 0.3); sfx.ui('select');
        if (e.id === 0) label('ARMED', f.x, 2.3, f.z, 'call');
        break;
      }
      case 'unarmed':
        if (e.id === 0 && performance.now() - unarmedAt > 1500) { unarmedAt = performance.now(); toast('Pick up your weapon first'); }
        break;
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
        // A finisher shows its name where it lands.
        if (e.launch) { label((e.title || 'Launch').toUpperCase(), e.x, 2.6, e.z, 'call'); particles.emit(e.x, 0.3, e.z, 16, 0xcdb48a, 4, 0.5, 3, 1.4); }
        else if (e.slam) { label((e.title || 'Slam').toUpperCase(), e.x, 2.2, e.z, 'call'); shake.add(0.6); ring(e.x, e.z, 0xffd9a0, 3, 0.35); }
        else if (e.air) label('AIR ' + world.fighters[e.target].juggle, e.x, 2.9, e.z, 'call');
        else if (e.ground) { label('GROUND HIT', e.x, 1.6, e.z, 'call'); ring(e.x, e.z, 0xffd9a0, 1.8, 0.3); }
        else if (e.title) label(e.title.toUpperCase(), e.x, 2.6, e.z, 'call');
        if (e.backstab) label('BACKSTAB', e.x, 2.5, e.z, 'call');
        else if (e.riposte) label('RIPOSTE', e.x, 2.5, e.z, 'call');
        else if (e.punish) label('PUNISH', e.x, 2.5, e.z, 'call');
        if (!mine) { pulse('vignette', 120); buzz(e.heavy ? 90 : 45); } else buzz(20);
        if (e.kill) { music.duck(0.25, 2.5); slowT = 1.5; slowScale = 0.22; sfx.death(); pulse('flash', 60); }
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
        sfx.parry(); pulse('flash', 50); music.duck(0.4, 0.9);
        label('PARRY', e.x, 2.3, e.z, 'call');
        if (e.id === 0) buzz(40);
        break;
      case 'guardbreak':
        hitStop = Math.max(hitStop, 0.14); shake.add(0.8);
        particles.emit(e.x, 1.3, e.z, 36, 0xffc070, 8, 0.45);
        sfx.guardBreak();
        label('GUARD BREAK', e.x, 2.3, e.z, 'call'); ring(e.x, e.z, 0xffc070, 2.4, 0.3);
        if (e.target === 0) { pulse('vignette', 120); buzz(110); }
        break;
      case 'roundend': {
        if (e.winner >= 0 && views[e.winner]) setTimeout(() => { if (world.phase === 'ko' || world.phase === 'over') views[e.winner].cheer = true; }, 1400);
        const title = e.timeout ? 'TIME UP' : e.winner < 0 ? 'DRAW' : 'K.O.';
        const sub = e.winner === 0 ? 'Round to you' : e.winner === 1 ? 'Round to your rival' : 'No one takes it';
        setTimeout(() => banner(title, sub, 2.4), e.timeout ? 0 : 700);
        break;
      }
      case 'matchover': if (e.winner === 0) sfx.victory(); music.play(e.winner === 0 ? 'victory' : 'defeat'); showMenu(e.winner === 0 ? 'VICTORY' : 'DEFEAT', `${world.score[0]} – ${world.score[1]}`); break;
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
  if (app === 'select') {
    // Hero select: the camera stands in front of the chosen fighter, who sits a little above the middle of the
    // screen so the match settings along the bottom do not cover their feet.
    const sx = arena.stage?.x || 0, sz = arena.stage?.z || 0;
    previewPose.x = sx; previewPose.z = sz;
    camera.position.set(sx + 0.35, 1.3, sz + 4.9); camera.lookAt(sx + 0.1, 0.72, sz);
    return;
  }
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

  const C = CAMERAS[camIndex];
  const [lx, ly] = input.takeLook();
  cam.pitch = Math.max(0.05, Math.min(0.9, cam.pitch + ly * 0.004));
  // Side-on: stand off to one side of the line between the fighters, with the player on the left.
  const sideOn = C.id === 'side' && locked;
  if (sideOn) {
    const want = Math.atan2(dz, -dx);
    cam.yaw = wrapAngle(cam.yaw + wrapAngle(want - cam.yaw) * Math.min(1, 3 * dt));
  } else if (locked) {
    const want = Math.atan2(dx, dz);
    cam.yaw = wrapAngle(cam.yaw + wrapAngle(want - cam.yaw) * Math.min(1, 6 * dt));
  } else cam.yaw = wrapAngle(cam.yaw - lx * 0.0055);

  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw), flat = Math.cos(cam.pitch);
  if (sideOn) {
    const mx = (pv.x + ev.x) / 2, mz = (pv.z + ev.z) / 2, full = Math.max(5.5, Math.min(14, 4.2 + dist * 0.8));
    let d = full;
    for (let i = 1; i <= 10; i++) {
      const t = (i / 10) * full;
      if (blocked(mx - sy * t, mz - cy * t)) { d = Math.max(2.5, t - full / 10); break; }
    }
    cam.cur = cam.cur === undefined ? d : cam.cur + (d - cam.cur) * Math.min(1, (d < cam.cur ? 20 : 4) * dt);
    camera.position.set(mx - sy * cam.cur, 1.9 + dist * 0.06, mz - cy * cam.cur);
    look.set(mx, 1.15, mz);
    camera.position.add(shake.offset);
    camera.lookAt(look);
    return;
  }

  // Pull the camera in when a wall would come between it and the player.
  let d = C.dist;
  for (let i = 1; i <= 10; i++) {
    const t = (i / 10) * C.dist;
    if (blocked(pv.x - sy * flat * t, pv.z - cy * flat * t)) { d = Math.max(1.2, t - C.dist / 10); break; }
  }
  cam.cur = cam.cur === undefined ? d : cam.cur + (d - cam.cur) * Math.min(1, (d < cam.cur ? 20 : 4) * dt);
  // Stand further off the shoulder while locked on, so the player's own body does not hide the enemy.
  const sideWant = locked ? C.sideLocked : C.side;
  cam.side = (cam.side ?? sideWant) + (sideWant - (cam.side ?? sideWant)) * Math.min(1, 4 * dt);
  const side = cam.side;
  // Squeezed against a wall, the camera rises and tips down so the player's own fighter stays whole on screen.
  const squeeze = Math.max(0, C.dist - cam.cur);
  camera.position.set(pv.x - sy * flat * cam.cur - cy * side, C.height + Math.sin(cam.pitch) * cam.cur + squeeze * 0.45, pv.z - cy * flat * cam.cur + sy * side);
  if (locked) look.set(pv.x * 0.55 + ev.x * 0.45, 1.2 - squeeze * 0.1, pv.z * 0.55 + ev.z * 0.45);
  else look.set(pv.x + sy * 3, 1.25 - squeeze * 0.1, pv.z + cy * 3);
  camera.position.add(shake.offset);
  camera.lookAt(look);
}

function toast(text) {
  const el = document.createElement('span');
  el.textContent = text; el.className = 'call';
  el.style.left = '50%'; el.style.top = '34%';
  hud.labels.appendChild(el);
  setTimeout(() => el.remove(), 1150);
}

function cycleCamera() {
  camIndex = (camIndex + 1) % CAMERAS.length;
  const C = CAMERAS[camIndex];
  cam.pitch = C.pitch; cam.cur = undefined; cam.side = undefined;
  try { localStorage.setItem('duel.camera', C.id); } catch { /* storage unavailable */ }
  resize();
  toast('Camera: ' + C.name);
}
$('btn-cam').addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); cycleCamera(); });
addEventListener('keydown', (ev) => { if (ev.code === 'KeyC' && !ev.repeat && app === 'playing') cycleCamera(); });

// ---------- Menu / flow ----------
function showMenu(title, result = '') {
  app = 'menu'; input.enabled = false; input.reset();
  $('menu-title').textContent = result ? title : '';
  // The title screen shows the painted artwork and logo; result screens show the arena behind.
  $('menu').classList.toggle('title', !result);
  $('menu-result').textContent = result;
  $('menu-kicker').textContent = result ? `${fighters[0].short || fighters[0].name} against ${fighters[1].short || fighters[1].name}` : 'A one-on-one fight to the last blow';
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
  world = createWorld(arena, { ...fighters[0].stats, weapon: fighters[0].weapon, skill: fighters[0].skill }, { ...fighters[1].stats, weapon: fighters[1].weapon, skill: fighters[1].skill });
  ai = createAI(level, (Date.now() & 0xffff) + 1);
  acc = 0; hitStop = 0; slowT = 0; paused = false; lockWanted = true; lastSecond = -1;
  app = 'playing'; input.enabled = true; input.reset();
  music.play('battle');
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden'); $('controls').classList.remove('hidden');
  shownSeq = null;
  $('you-name').textContent = fighters[0].name.toUpperCase();
  $('foe-name').textContent = fighters[1].name.toUpperCase();
  handleEvents(); updateHud();
}

const select = initSelect({
  onBack: () => { app = 'menu'; hidePreview(); $('menu').classList.remove('hidden'); },
  onShow: (id, side) => { if (app !== 'select') return; setArena(select.picks.arena); showPreview(id, side === 'rival' ? 'red' : 'blue'); },
  onGo: async (picks) => {
    goFullscreen();
    select.busy('LOADING…');
    level = picks.level;
    setArena(picks.arena);
    try {
      await setFighters(picks.you, resolveRival(picks));
    } catch (err) {
      console.error(err);
      select.busy('COULD NOT LOAD — TAP TO RETRY');
      $('go').disabled = false;
      return;
    }
    select.close(); hidePreview();
    startMatch();
  },
});
function openSelect() {
  goFullscreen(); music.play('menu'); $('menu').classList.add('hidden');
  app = 'select'; views.forEach((v) => { v.root.visible = false; });
  camera.fov = 30; camera.updateProjectionMatrix();
  select.open();
}
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
  music.quiet(v);
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
  camera.fov = CAMERAS[camIndex].fov - (w / h > 2 ? 6 : 0);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// The move list on the pause screen.
const mark = (c) => `<i class="${c === 'H' ? 'h' : c === 'V' ? 'v' : c}"></i>`;
$('moves').innerHTML = STRINGS.map((m) => `<li><span class="seq">${[...m.seq].map(mark).join('')}</span><b>${m.name}</b><em>${m.note}</em></li>`).join('')
  + DIR_MOVES.map(([btn, dir, name, note]) => `<li><span class="seq"><u>${dir === 'F' ? '▲' : '▼'}</u>${mark(btn)}</span><b>${name}</b><em>${note}</em></li>`).join('')
  + `<li><span class="seq">${mark('p')}</span><b>Guard</b><em>Hold to block. Press as a blow lands to parry</em></li>`
  + `<li><span class="seq">${mark('H')}${mark('V')}</span><b>Keep it held</b><em>Blue charged strike: cuts through a guard</em></li>`;
$('moves-key').textContent = '▲ stick toward your rival   ▼ stick away';

// ---------- Main loop ----------
// Frame cap, as in Dawn of Dynasties: 60 frames a second, falling to 30 if the phone struggles.
// Without it a 120 Hz screen draws twice as often as needed, which only makes heat.
let capGap = 1000 / 60, slowAvg = 0, lastFrame = 0, gapAvg = 16, slowFor = 0, slowTold = false;
function frame(now) {
  requestAnimationFrame(frame);
  if (now - lastFrame < capGap * 0.9) return;
  // If the picture has been arriving slower than about 35 times a second for a while in a fight, say how to fix it (once).
  if (app === 'playing' && !paused && lastFrame) {
    gapAvg += (Math.min(200, now - lastFrame) - gapAvg) * 0.05;
    slowFor = gapAvg > 28 ? slowFor + (now - lastFrame) / 1000 : 0;
    if (slowFor > 6 && !slowTold && QUALITY.id !== 'low') { slowTold = true; toast('Running slow? Lower Graphics on the title screen'); }
  }
  lastFrame = now;
  const work0 = performance.now();
  step(now);
  slowAvg = slowAvg * 0.95 + (performance.now() - work0 > 13 ? 1 : 0) * 0.05;
  capGap = slowAvg > 0.5 ? 1000 / 30 : slowAvg < 0.2 ? 1000 / 60 : capGap;
}
function step(now) {
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

  if (preview && app === 'select') {
    // The fighter on show turns slowly from side to side, in their fighting stance.
    previewT += dt; previewPose.yaw = 0.25 + Math.sin(previewT * 0.5) * 0.45;
    preview.update(previewPose, dt);
  }
  if (views.length === 2 && app !== 'select') world.fighters.forEach((f, i) => {
    views[i].update(f, simDt);
    const swinging = f.state === 'attack' && f.t >= f.atk.windup * 0.7 && f.t <= f.atk.windup + f.atk.active + 0.05;
    if (simDt > 0) trails[i].update(views[i], swinging, swinging && f.atk.heavy);
  });
  particles.update(dt * scale);
  updateRings(dt * scale);
  arena.update?.(dt * scale, now / 1000, views.length === 2 ? views.map((v) => v.root.position) : null);
  shake.update(dt);
  updateCamera(dt);
  window.__duel.debug?.(camera);
  renderer.render(scene, camera);
}

// Music: the menu theme starts on the first tap (browsers do not allow sound before one).
music.play('menu');
addEventListener('pointerdown', () => { unlockAudio(); music.resume(); }, { once: true });
function showMusic() { for (const el of document.querySelectorAll('.music-toggle')) { el.classList.toggle('off', !music.on); el.setAttribute('aria-pressed', music.on); if (el.dataset.text) el.textContent = 'Music: ' + (music.on ? 'On' : 'Off'); } }
for (const el of document.querySelectorAll('.music-toggle')) el.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); music.toggle(); showMusic(); });
showMusic();

$('build').textContent = ' · build ' + BUILD;
// Graphics level: tap to step through Low, Medium, High, Ultra. The game restarts at the new level.
$('quality').textContent = 'Graphics: ' + QUALITY.name;
$('quality').addEventListener('click', () => { $('quality').textContent = 'Graphics: ' + nextQuality() + '…'; setTimeout(() => location.reload(), 150); });
showMenu('THE DUEL');
world.events.length = 0;
// Two fighters stand in the ring behind the menu while the player decides.
setFighters(fighters[0].id, fighters[1].id).then(() => views.forEach((v, i) => v.snap(world.fighters[i]))).catch((err) => console.error(err));
requestAnimationFrame(frame);

// Handy for testing from the browser console.
window.__duel = { renderInfo: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }), get world() { return world; }, get ai() { return ai; }, input, cam, get views() { return views; }, startMatch, setFighters, setArena, quality: QUALITY, get arena() { return arena; }, get fps() { return Math.round(1000 / capGap); }, setLevel: (l) => { level = l; } };
