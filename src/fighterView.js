// fighterView.js — a rigged character from Dawn of Dynasties, animated from the fight's state.
// The rules (sim.js) own position and timing; this file only decides which motion clip to show
// and at what point in it, so a swing on screen lands exactly when the rules say it does.
import * as THREE from 'three';
import { loadCharacter, loadClips } from './models.js';
import { weaponOf } from './weapons.js';

export const TEAM = { blue: 0x2f63c4, red: 0xb3180f, neutral: 0x8a1c14 };

const LOWER = new Set(['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']);

const FOCUS_GLOW = new THREE.Color(0x58b4ff); // a charging weapon burns blue

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
function part(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; }

// The characters are painted with magenta wherever cloth should take the team colour
// (the same convention Dawn of Dynasties uses). Repaint those pixels once per fighter.
const dyeCache = new Map();
export function dye(material, team, key, cloth = 'magenta') {
  const map = material.map;
  if (!map || !map.image) return;
  const id = key + ':' + team;
  if (!dyeCache.has(id)) {
    const img = map.image, w = img.width, h = img.height;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h), d = data.data, c = new THREE.Color(TEAM[team]);
    const tr = c.r * 255, tg = c.g * 255, tb = c.b * 255;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      // magenta: red and blue both well above green. Some fighters are painted with red cloth instead.
      const m = cloth === 'red' ? r - Math.max(g, b) : Math.min(r, b) - g;
      if (m > 45 && (cloth === 'red' ? r > 70 : Math.abs(r - b) < 90)) {
        const lum = Math.max(r, b) / 255, k = Math.min(1, (m - 45) / 50);
        d[i] = r + (Math.min(255, tr * lum * 1.9) - r) * k;
        d[i + 1] = g + (Math.min(255, tg * lum * 1.9) - g) * k;
        d[i + 2] = b + (Math.min(255, tb * lum * 1.9) - b) * k;
      }
    }
    ctx.putImageData(data, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.flipY = map.flipY; tex.colorSpace = map.colorSpace; tex.wrapS = map.wrapS; tex.wrapT = map.wrapT; tex.anisotropy = 4;
    dyeCache.set(id, tex);
  }
  material.map = dyeCache.get(id);
  material.needsUpdate = true;
}

function buildWeapon(kind, bladeMat) {
  // Built pointing along +Y from the grip, in metres.
  const g = new THREE.Group(), wood = std(0x4a3320), gold = std(0xd9b45a, { metalness: 0.6, roughness: 0.35 });
  let tipY, baseY;
  if (kind === 'divine') {
    // A long tapering blade of pale gold that glows faintly, with a winged guard and a sun at its heart.
    const bright = std(0xf0c64e, { metalness: 0.85, roughness: 0.22 }), white = std(0xf4eee0, { metalness: 0.3, roughness: 0.4 });
    const b = new THREE.Shape();
    b.moveTo(-0.05, 0); b.lineTo(-0.042, 0.78); b.lineTo(0, 1.0); b.lineTo(0.042, 0.78); b.lineTo(0.05, 0); b.closePath();
    const blade = part(new THREE.ExtrudeGeometry(b, { depth: 0.016, bevelEnabled: false }), bladeMat, 0.008, 0.15, 0);
    blade.rotation.y = -Math.PI / 2; // the flat of the blade lies in the swing plane, like the plain sword
    const fuller = part(new THREE.BoxGeometry(0.02, 0.62, 0.012), bright, 0, 0.5, 0);
    g.add(blade, fuller);
    g.add(part(new THREE.CylinderGeometry(0.02, 0.024, 0.22, 8), white, 0, 0, 0), part(new THREE.CylinderGeometry(0.027, 0.027, 0.02, 8), bright, 0, -0.05, 0), part(new THREE.CylinderGeometry(0.027, 0.027, 0.02, 8), bright, 0, 0.05, 0));
    g.add(part(new THREE.OctahedronGeometry(0.045, 0), bright, 0, -0.15, 0));
    for (const side of [-1, 1]) {
      // Upswept wings for a crossguard, three feathers a side
      for (let i = 0; i < 3; i++) {
        const feather = part(new THREE.ConeGeometry(0.022 - i * 0.004, 0.2 - i * 0.04, 4), bright, 0, 0.15 + i * 0.035, side * (0.09 + i * 0.012));
        feather.rotation.x = side * (1.15 - i * 0.28); feather.scale.x = 0.45;
        g.add(feather);
      }
    }
    const sun = part(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12), bright, 0, 0.15, 0);
    sun.rotation.z = Math.PI / 2;
    const gem = part(new THREE.SphereGeometry(0.024, 8, 6), std(0xfff6c8, { emissive: 0xffd76a, emissiveIntensity: 1.6 }), 0, 0.15, 0);
    gem.scale.x = 1.5;
    g.add(sun, gem);
    tipY = 1.15; baseY = 0.25;
  } else if (kind === 'spear') {
    g.add(part(new THREE.CylinderGeometry(0.018, 0.02, 2.1, 7), wood, 0, 0.45, 0));
    g.add(part(new THREE.ConeGeometry(0.045, 0.3, 6), bladeMat, 0, 1.65, 0), part(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 7), gold, 0, 1.48, 0));
    tipY = 1.8; baseY = 0.9;
  } else if (kind === 'mace') {
    g.add(part(new THREE.CylinderGeometry(0.022, 0.026, 0.78, 8), wood, 0, 0.27, 0), part(new THREE.SphereGeometry(0.04, 7, 5), gold, 0, -0.13, 0));
    g.add(part(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 8), gold, 0, 0.64, 0));
    const head = part(new THREE.IcosahedronGeometry(0.105, 0), bladeMat, 0, 0.77, 0);
    g.add(head);
    // Flanges round the head
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, spike = part(new THREE.ConeGeometry(0.03, 0.1, 5), bladeMat, Math.cos(a) * 0.12, 0.77, Math.sin(a) * 0.12);
      spike.rotation.set(0, -a, -Math.PI / 2);
      g.add(spike);
    }
    g.add(part(new THREE.ConeGeometry(0.03, 0.1, 5), bladeMat, 0, 0.9, 0));
    tipY = 0.92; baseY = 0.45;
  } else {
    g.add(part(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 7), wood, 0, 0, 0), part(new THREE.SphereGeometry(0.035, 7, 5), gold, 0, -0.12, 0));
    g.add(part(new THREE.BoxGeometry(0.035, 0.035, 0.24), gold, 0, 0.11, 0), part(new THREE.BoxGeometry(0.014, 0.88, 0.07), bladeMat, 0, 0.56, 0));
    tipY = 1.02; baseY = 0.2;
  }
  const tip = new THREE.Object3D(), base = new THREE.Object3D();
  tip.position.y = tipY; base.position.y = baseY;
  g.add(tip, base);
  return { g, tip, base };
}

function attach(bone, object, rot, pos = [0, 0, 0]) {
  // Bones live in centimetre space; undo that so gear can be built in metres.
  const ws = new THREE.Vector3(); bone.getWorldScale(ws);
  const holder = new THREE.Group();
  holder.scale.setScalar(1 / ws.x);
  const inner = new THREE.Group();
  inner.rotation.set(...rot); inner.position.set(...pos);
  inner.add(object); holder.add(inner); bone.add(holder);
}

const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };

export class FighterView {
  // Use FighterView.create(); the constructor needs assets that load asynchronously.
  static async create(def, team) {
    const [model, clips] = await Promise.all([loadCharacter(def.id), loadClips()]);
    return new FighterView(def, team, model, clips);
  }

  constructor(def, team, model, clips) {
    this.def = def; this.team = team;
    this.root = new THREE.Group();
    this.tilt = new THREE.Group();
    this.root.add(this.tilt); this.tilt.add(model);
    model.updateMatrixWorld(true);

    const bones = {};
    model.traverse((o) => { if (o.isBone) bones[o.name] = o; if (o.isMesh) dye(o.material, team, def.id, def.cloth); });
    this.bladeMat = std(0xdfe4e8, { metalness: 0.85, roughness: 0.25, emissive: 0xff5a1a, emissiveIntensity: 0 });
    // A divine blade is pale gold and always glows a little; a heavy attack makes it blaze.
    this.baseGlow = 0;
    if (def.weapon === 'divine') { this.bladeMat.color.set(0xfff0c4); this.bladeMat.emissive.set(0xffc23a); this.baseGlow = 0.55; this.bladeMat.emissiveIntensity = 0.55; }
    this.baseEmissive = this.bladeMat.emissive.clone();
    const weapon = buildWeapon(def.weapon, this.bladeMat);
    this.tip = weapon.tip; this.base = weapon.base;
    // The clips were not made with a weapon in hand, so these angles are a best fit across all the moves:
    // a sword sits diagonally out of the fist, a spear lies along the palm, and nobody carries a shield: defence is the parry and the dodge.
    attach(bones.RightHand, weapon.g, def.weapon === 'spear' ? [Math.PI / 2, 0, 0] : [Math.PI / 4, 0, 0]);
    this.chest = bones.Spine01 || bones.Spine;

    // Coloured ring on the ground so the two sides are never confused, even with the same fighter.
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 28), new THREE.MeshBasicMaterial({ color: TEAM[team], transparent: true, opacity: 0.75, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.03;
    this.root.add(this.ring);

    this.mixer = new THREE.AnimationMixer(model);
    this.weapon = weaponOf(def.weapon);
    const w = this.weapon, clipsUsed = [...w.h, ...w.v, w.focusH, w.focusV].map((a) => a.anim[0]);
    this.actions = {}; this.weights = {};
    const add = (name, clip) => {
      const a = this.mixer.clipAction(clip);
      a.play(); a.setEffectiveWeight(0); a.timeScale = 0;
      this.actions[name] = a; this.weights[name] = 0;
    };
    const sub = (clip, tag, keep) => new THREE.AnimationClip(clip.name + tag, clip.duration, clip.tracks.filter((t) => keep(t.name.slice(0, t.name.lastIndexOf('.')))));
    const need = new Set(['Combat_Stance', 'Run_02', 'Hit_Reaction_1', 'Hit_Reaction', 'Shot_and_Fall_Backward', 'Sword_Parry', 'Walk_Fight_Forward', 'Roll_Dodge', 'Hit_Reaction_to_Waist', 'Knock_Down', ...clipsUsed]);
    for (const name of need) add(name, clips.get(name));
    this.started = false; this.fallDur = clips.get('Shot_and_Fall_Backward').duration;
  }

  // Decide which clips should be showing, and where in each, for the fighter's current state.
  pose(f, dt) {
    const want = {}, A = this.actions;
    const speed = Math.hypot(f.vx, f.vz);
    const fwd = f.vx * Math.sin(f.yaw) + f.vz * Math.cos(f.yaw);
    const run = Math.min(1, speed / 1.6);
    const runRate = Math.max(0.55, Math.min(1.6, speed / 4.6)) * (fwd < -0.4 * speed ? -1 : 1);
    let fade = 12;

    // Standing guard, a fighting walk and a run, blended by how fast the fighter is moving.
    const loco = () => {
      const stand = Math.max(0, 1 - speed / 1.1), runW = Math.max(0, Math.min(1, (speed - 2.8) / 1.6)), walk = Math.max(0, 1 - stand - runW);
      want.Combat_Stance = stand; want.Walk_Fight_Forward = walk; want.Run_02 = runW;
      A.Combat_Stance.timeScale = 1; A.Run_02.timeScale = runRate;
      A.Walk_Fight_Forward.timeScale = Math.max(0.6, Math.min(1.8, speed / 1.7)) * (fwd < -0.4 * speed ? -1 : 1);
    };

    switch (f.state) {
      case 'attack': {
        const a = f.atk, [clip, start, hit, end] = a.anim;
        const t = f.t < a.windup ? start + (hit - start) * (f.t / a.windup) : hit + (end - hit) * Math.min(1, (f.t - a.windup) / (a.active + a.recover));
        want[clip] = 1; A[clip].timeScale = 0; A[clip].time = t; fade = 22;
        break;
      }
      case 'charge': {
        // Wound back and held, trembling, until the button is let go.
        const atk = f.charge === 'h' ? this.weapon.focusH : this.weapon.focusV, clip = atk.anim[0];
        const ease = Math.min(1, f.t / 0.28), shake = Math.sin(f.t * 55) * 0.012 * Math.min(1, f.t / 0.6);
        want[clip] = 1; A[clip].timeScale = 0; A[clip].time = atk.hold - 0.3 * (1 - ease) + shake; fade = 16;
        break;
      }
      case 'parry':
        want.Sword_Parry = 1; A.Sword_Parry.timeScale = 0; A.Sword_Parry.time = 0.12 + Math.min(1, f.t / 0.72) * 1.05; fade = 30;
        break;
      case 'dodge':
        // A roll, played across the length of the dodge. The body turns to face the way it is going (see update).
        want.Roll_Dodge = 1; A.Roll_Dodge.timeScale = 0; A.Roll_Dodge.time = 0.32 + Math.min(1, f.t / 0.55) * 1.3; fade = 30;
        break;
      case 'stagger': {
        // Two different flinches, picked each time a new hit lands, so repeated hits do not look identical.
        if (this.lastState !== 'stagger' || f.t < this.lastT) this.flinch = Math.random() < 0.5 ? 'Hit_Reaction_1' : 'Hit_Reaction_to_Waist';
        const clip = f.parried ? 'Hit_Reaction' : this.flinch, len = f.parried ? 1.3 : clip === 'Hit_Reaction_1' ? 0.85 : 1.2;
        want[clip] = 1; A[clip].timeScale = 0; A[clip].time = Math.min(1, f.t / f.staggerDur) * len; fade = 25;
        break;
      }
      case 'dead': {
        // Killed by a charged strike, a fighter is flung off their feet; otherwise they fall where they stand.
        if (f.launched) { want.Knock_Down = 1; A.Knock_Down.timeScale = 0; A.Knock_Down.time = Math.min(2.4, 0.15 + f.t * 1.25); fade = 30; break; }
        const clip = 'Shot_and_Fall_Backward';
        want[clip] = 1; A[clip].timeScale = 0; A[clip].time = Math.min(this.fallDur - 0.05, 0.7 + f.t * 1.5); fade = 14;
        break;
      }
      default: loco();
    }

    this.lastState = f.state; this.lastT = f.t;
    const k = Math.min(1, fade * dt);
    for (const name in A) {
      const w = this.weights[name] += ((want[name] || 0) - this.weights[name]) * k;
      A[name].setEffectiveWeight(w < 0.002 ? 0 : w);
    }
  }

  update(f, dt) {
    const r = this.root;
    if (!this.started) { r.position.set(f.x, 0, f.z); r.rotation.y = f.yaw; this.started = true; }
    const k = Math.min(1, 28 * dt);
    r.position.x += (f.x - r.position.x) * k; r.position.z += (f.z - r.position.z) * k;
    // While rolling, the body points the way it is travelling, not at the enemy.
    const bodyYaw = f.state === 'dodge' ? Math.atan2(f.ddx, f.ddz) : f.yaw;
    let d = bodyYaw - r.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    r.rotation.y += d * Math.min(1, 22 * dt);

    this.pose(f, dt);
    this.mixer.update(dt);

    // Lean into a dodge.
    let bx = 0, bz = 0;
    if (f.state === 'dodge' && !this.actions.Roll_Dodge) {
      const lean = Math.sin(Math.min(1, f.t / 0.4) * Math.PI) * 0.5;
      const fwd = f.ddx * Math.sin(f.yaw) + f.ddz * Math.cos(f.yaw), side = f.ddx * Math.cos(f.yaw) - f.ddz * Math.sin(f.yaw);
      bx = fwd * lean; bz = -side * lean;
    }
    const tk = Math.min(1, 18 * dt);
    this.tilt.rotation.x += (bx - this.tilt.rotation.x) * tk; this.tilt.rotation.z += (bz - this.tilt.rotation.z) * tk;

    // Heavy attacks glow while charging so they can be read and answered on a small screen.
    // A charging weapon burns blue, brighter the longer it is held, and stays lit until the strike has landed.
    const striking = f.state === 'attack' && f.atk.focus && f.t < f.atk.windup + f.atk.active;
    const focus = f.state === 'charge' ? 0.35 + 0.65 * smooth(f.t / 0.9) : striking ? 1 : 0;
    this.focusMix = (this.focusMix || 0) + (focus - (this.focusMix || 0)) * Math.min(1, 14 * dt);
    this.bladeMat.emissive.copy(this.baseEmissive).lerp(FOCUS_GLOW, Math.min(1, this.focusMix * 1.5));
    const glow = this.baseGlow + this.focusMix * 3.2;
    this.bladeMat.emissiveIntensity += (glow - this.bladeMat.emissiveIntensity) * Math.min(1, 20 * dt);
    this.ring.material.opacity = f.state === 'dead' ? 0.25 : 0.75;
  }

  // Jump straight to the fighter's current state with no blending (round start).
  snap(f) {
    this.started = false;
    for (const n in this.weights) this.weights[n] = 0;
    this.tilt.rotation.set(0, 0, 0);
    this.update(f, 1);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.root.removeFromParent(); // model geometry is shared between fighters, so it is not disposed here
  }
}
