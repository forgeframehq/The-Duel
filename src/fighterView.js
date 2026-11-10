// fighterView.js — how a fighter looks and moves. Placeholder knights built from simple shapes
// and posed in code. A rigged GLB character can replace this class as long as it keeps
// the same surface: { root, update(f, dt), tip, base, chest }.
import * as THREE from 'three';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, ...o });

const LOOKS = {
  blue: { cloth: 0x2f5fb3, trim: 0xd9b45a, metal: 0xaab3bd, leather: 0x4a3526, fur: 0x6b5a48, helm: 'round', scale: 1 },
  red: { cloth: 0xa32b2b, trim: 0x1c1c1c, metal: 0x5e6268, leather: 0x2b2019, fur: 0x2e2a28, helm: 'horned', scale: 1.06 },
};

// A pose is a set of joint rotations in radians. Anything left out falls back to GUARD.
const GUARD = {
  hipsY: 0.94, body: [0, 0, 0], torso: [0.12, 0.25, 0], head: [-0.05, -0.2, 0],
  shR: [-0.55, 0, -0.18], elR: [-1.15], wrR: [0.25, 0, 0],
  shL: [-0.45, -1.0, 0.1], elL: [-1.35],
  hipR: [0.25], knR: [0.3], hipL: [-0.35], knL: [0.35],
};
const P = (o) => ({ ...GUARD, ...o });
const BLOCK = P({ hipsY: 0.88, torso: [0.2, 0.45, 0], head: [-0.1, -0.4, 0], shL: [-0.8, -1.3, 0.1], elL: [-1.45], shR: [0.3, 0, -0.3], elR: [-0.9], wrR: [0.6, 0, 0] });
const DODGE = P({ hipsY: 0.7, torso: [0.6, 0, 0], head: [-0.3, 0, 0], shR: [0.4, 0, -0.4], elR: [-1.4], shL: [0.2, -0.8, 0.3], elL: [-1.6], hipR: [-0.9], knR: [1.5], hipL: [-0.3], knL: [1.2] });
const STAGGER = P({ hipsY: 0.9, torso: [-0.45, -0.3, 0.1], head: [-0.4, 0.2, 0], shR: [0.5, 0, -0.9], elR: [-0.5], wrR: [-0.3, 0, 0], shL: [0.2, -0.3, 0.8], elL: [-0.6], hipR: [0.5], knR: [0.4], hipL: [-0.2], knL: [0.5] });
const PARRIED = P({ hipsY: 0.88, torso: [-0.55, -0.7, 0], head: [-0.3, 0.4, 0], shR: [-2.6, 0, -1.0], elR: [-0.4], wrR: [-0.8, 0, 0], shL: [0.3, -0.2, 0.9], elL: [-0.5], hipR: [0.55], knR: [0.5], hipL: [-0.1], knL: [0.6] });
const DEAD = P({ hipsY: 0.3, torso: [-0.15, 0.2, 0], head: [-0.3, 0.5, 0], shR: [-0.2, 0, -1.3], elR: [-0.2], wrR: [0, 0, 0], shL: [-0.1, 0, 1.2], elL: [-0.3], hipR: [0.1], knR: [0.15], hipL: [-0.25], knL: [0.5] });

const ATTACKS = {
  slashR: {
    wind: P({ hipsY: 0.9, torso: [0.05, -0.75, 0], head: [0, 0.6, 0], shR: [-1.7, 0, -1.25], elR: [-1.2], wrR: [-0.7, 0, 0], hipR: [0.5], hipL: [-0.5] }),
    hit: P({ hipsY: 0.86, torso: [0.3, 0.85, 0], head: [0, -0.7, 0], shR: [-1.35, 0, 0.75], elR: [-0.15], wrR: [1.25, 0, 0], shL: [0.2, -0.6, 0.4], hipR: [-0.5], knR: [0.5], hipL: [0.45] }),
  },
  slashL: {
    wind: P({ hipsY: 0.9, torso: [0.1, 0.8, 0], head: [0, -0.6, 0], shR: [-1.5, 0, 0.95], elR: [-1.5], wrR: [-0.2, 0, 0], hipR: [-0.3], hipL: [0.3] }),
    hit: P({ hipsY: 0.86, torso: [0.3, -0.8, 0], head: [0, 0.7, 0], shR: [-1.3, 0, -1.0], elR: [-0.15], wrR: [1.25, 0, 0], shL: [0.2, -0.6, 0.4], hipR: [0.55], hipL: [-0.5], knL: [0.5] }),
  },
  overhead: {
    wind: P({ hipsY: 0.97, torso: [-0.3, -0.2, 0], head: [0.1, 0.1, 0], shR: [-3.0, 0, -0.15], elR: [-0.9], wrR: [-0.9, 0, 0], hipR: [0.3], hipL: [-0.3] }),
    hit: P({ hipsY: 0.8, torso: [0.6, 0.2, 0], head: [-0.4, -0.1, 0], shR: [-0.75, 0, -0.05], elR: [-0.1], wrR: [1.05, 0, 0], shL: [0.4, -0.6, 0.4], hipR: [-0.7], knR: [0.8], hipL: [0.5] }),
  },
  heavy: {
    wind: P({ hipsY: 0.84, torso: [-0.35, -1.0, 0], head: [0.1, 0.8, 0], shR: [-2.9, 0, -0.7], elR: [-1.0], wrR: [-1.1, 0, 0], shL: [-0.9, -0.6, 0.3], elL: [-1.0], hipR: [0.7], knR: [0.5], hipL: [-0.6], knL: [0.7] }),
    hit: P({ hipsY: 0.72, torso: [0.75, 0.7, 0], head: [-0.5, -0.5, 0], shR: [-0.7, 0, 0.35], elR: [-0.05], wrR: [1.05, 0, 0], shL: [0.6, -0.5, 0.5], hipR: [-0.9], knR: [1.0], hipL: [0.6], knL: [0.2] }),
  },
};

const KEYS = Object.keys(GUARD);
function mix(a, b, k) {
  const o = {};
  for (const key of KEYS) {
    const x = a[key], y = b[key];
    o[key] = typeof x === 'number' ? x + (y - x) * k : x.map((v, i) => v + (y[i] - v) * k);
  }
  return o;
}
const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
const easeOut = (k) => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);

function part(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}
const box = (w, h, d, mat, x, y, z) => part(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
function joint(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

export class FighterView {
  constructor(look = 'blue') {
    const L = LOOKS[look];
    const cloth = std(L.cloth), mail = std(L.metal, { metalness: 0.55, roughness: 0.5 }), leather = std(L.leather);
    const fur = std(L.fur, { roughness: 1 }), skin = std(0xc9966f), trim = std(L.trim, { metalness: 0.4, roughness: 0.5 });
    this.bladeMat = std(0xd8dde2, { metalness: 0.8, roughness: 0.25, emissive: 0xff5a1a, emissiveIntensity: 0 });

    this.root = new THREE.Group();
    this.root.scale.setScalar(L.scale);
    const body = this.body = joint(this.root, 0, 0, 0);
    const hips = joint(body, 0, GUARD.hipsY, 0);
    hips.add(box(0.42, 0.22, 0.26, leather, 0, 0, 0), box(0.46, 0.34, 0.3, cloth, 0, -0.2, 0));

    const torso = joint(hips, 0, 0.1, 0);
    torso.add(box(0.5, 0.52, 0.3, mail, 0, 0.3, 0), box(0.3, 0.6, 0.03, cloth, 0, 0.26, 0.16), box(0.52, 0.07, 0.32, trim, 0, 0.06, 0),
      box(0.62, 0.13, 0.4, fur, 0, 0.58, 0));

    const head = joint(torso, 0, 0.64, 0);
    head.add(box(0.2, 0.24, 0.2, skin, 0, 0.14, 0));
    const helm = part(new THREE.SphereGeometry(0.155, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mail, 0, 0.2, 0);
    helm.scale.set(1, 1.15, 1.05);
    head.add(helm, box(0.33, 0.035, 0.34, mail, 0, 0.2, 0), box(0.04, 0.16, 0.03, mail, 0, 0.14, 0.11), box(0.26, 0.14, 0.05, mail, 0, 0.1, -0.1));
    if (L.helm === 'horned') {
      for (const s of [-1, 1]) {
        const horn = part(new THREE.ConeGeometry(0.035, 0.22, 5), trim, s * 0.17, 0.3, 0);
        horn.rotation.z = -s * 0.7;
        head.add(horn);
      }
    } else head.add(part(new THREE.ConeGeometry(0.03, 0.1, 5), trim, 0, 0.42, 0));

    const arm = (side) => {
      const sh = joint(torso, side * 0.33, 0.5, 0);
      const pauldron = part(new THREE.SphereGeometry(0.13, 8, 5), mail, side * 0.02, 0.02, 0);
      pauldron.scale.set(1.1, 0.8, 1.1);
      sh.add(pauldron, box(0.13, 0.32, 0.13, cloth, 0, -0.17, 0));
      const el = joint(sh, 0, -0.33, 0);
      el.add(box(0.115, 0.28, 0.115, leather, 0, -0.14, 0));
      const wr = joint(el, 0, -0.31, 0);
      wr.add(box(0.1, 0.1, 0.1, skin, 0, 0, 0));
      return { sh, el, wr };
    };
    // Facing +Z, the fighter's right hand is on -X.
    const R = arm(-1), Lf = arm(1);

    const sword = joint(R.wr, 0, 0, 0);
    const grip = part(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 6), leather, 0, 0, 0);
    grip.rotation.x = Math.PI / 2;
    sword.add(grip, box(0.28, 0.045, 0.05, trim, 0, 0, 0.11), box(0.065, 0.016, 0.98, this.bladeMat, 0, 0, 0.62), part(new THREE.SphereGeometry(0.035, 6, 4), trim, 0, 0, -0.12));
    this.tip = joint(sword, 0, 0, 1.12);
    this.base = joint(sword, 0, 0, 0.2);

    const shield = joint(Lf.el, 0.085, -0.17, 0);
    shield.rotation.z = Math.PI / 2;
    const face = part(new THREE.CylinderGeometry(0.43, 0.43, 0.05, 18), std(0x5b4127), 0, 0, 0);
    const paint = part(new THREE.CylinderGeometry(0.34, 0.34, 0.052, 18), cloth, 0, -0.004, 0);
    const rim = part(new THREE.TorusGeometry(0.43, 0.03, 5, 18), mail, 0, 0, 0);
    rim.rotation.x = Math.PI / 2;
    shield.add(face, paint, rim, part(new THREE.SphereGeometry(0.09, 8, 5), mail, 0, -0.03, 0));

    const leg = (side) => {
      const hip = joint(hips, side * 0.13, -0.08, 0);
      hip.add(box(0.16, 0.44, 0.17, leather, 0, -0.22, 0));
      const kn = joint(hip, 0, -0.44, 0);
      kn.add(box(0.13, 0.4, 0.14, leather, 0, -0.2, 0), box(0.145, 0.12, 0.27, std(0x2a1d14), 0, -0.4, 0.05), box(0.15, 0.1, 0.16, fur, 0, -0.12, 0));
      return { hip, kn };
    };
    const lr = leg(-1), ll = leg(1);

    this.chest = joint(torso, 0, 0.3, 0);
    this.j = { hips, torso, head, shR: R.sh, elR: R.el, wrR: R.wr, shL: Lf.sh, elL: Lf.el, hipR: lr.hip, knR: lr.kn, hipL: ll.hip, knL: ll.kn };
    this.cur = mix(GUARD, GUARD, 0);
    this.walk = 0; this.clock = Math.random() * 10; this.fall = 0; this.started = false;
  }

  targetPose(f, dt) {
    const speed = Math.hypot(f.vx, f.vz);
    this.walk += speed * dt * 2.7;
    const s = Math.sin(this.walk), c = Math.cos(this.walk);
    const legs = (pose, amp) => {
      if (amp < 0.02) return pose;
      const o = { ...pose };
      o.hipR = [pose.hipR[0] * (1 - amp) - s * 0.75 * amp]; o.hipL = [pose.hipL[0] * (1 - amp) + s * 0.75 * amp];
      o.knR = [pose.knR[0] + Math.max(0, c) * 0.9 * amp]; o.knL = [pose.knL[0] + Math.max(0, -c) * 0.9 * amp];
      o.hipsY = pose.hipsY + Math.abs(c) * 0.035 * amp;
      return o;
    };
    const amp = Math.min(1, speed / 4);

    switch (f.state) {
      case 'block': return [legs(BLOCK, amp), 22];
      case 'attack': {
        const a = f.atk, k = ATTACKS[a.name];
        let pose;
        if (f.t < a.windup) pose = mix(GUARD, k.wind, easeOut(f.t / (a.windup * 0.8)));
        else if (f.t < a.windup + a.active) pose = mix(k.wind, k.hit, easeOut((f.t - a.windup) / (a.active * 0.85)));
        else pose = mix(k.hit, GUARD, smooth((f.t - a.windup - a.active) / a.recover - 0.3));
        return [pose, 45];
      }
      case 'dodge': return [DODGE, 30];
      case 'stagger': {
        const base = f.parried ? PARRIED : STAGGER;
        return [mix(base, GUARD, smooth(f.t / f.staggerDur * 1.6 - 0.7)), 24];
      }
      case 'dead': return [DEAD, 9];
      default: {
        const breathe = Math.sin(this.clock * 2.2) * 0.012;
        const g = legs(GUARD, amp);
        g.hipsY += breathe;
        if (speed > 5.5) g.torso = [0.35, 0.1, 0];
        return [g, 16];
      }
    }
  }

  update(f, dt) {
    this.clock += dt;
    const r = this.root;
    if (!this.started) { r.position.set(f.x, 0, f.z); r.rotation.y = f.yaw; this.started = true; }
    const k = Math.min(1, 28 * dt);
    r.position.x += (f.x - r.position.x) * k; r.position.z += (f.z - r.position.z) * k;
    let d = f.yaw - r.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    r.rotation.y += d * Math.min(1, 22 * dt);

    const [target, rate] = this.targetPose(f, dt);
    const a = Math.min(1, rate * dt);
    this.cur = mix(this.cur, target, a);
    const p = this.cur, j = this.j;
    j.hips.position.y = p.hipsY;
    j.torso.rotation.set(...p.torso); j.head.rotation.set(...p.head);
    j.shR.rotation.set(...p.shR); j.elR.rotation.x = p.elR[0]; j.wrR.rotation.set(...p.wrR);
    j.shL.rotation.set(...p.shL); j.elL.rotation.x = p.elL[0];
    j.hipR.rotation.x = p.hipR[0]; j.knR.rotation.x = p.knR[0]; j.hipL.rotation.x = p.hipL[0]; j.knL.rotation.x = p.knL[0];

    // Whole-body lean: into a dodge, back from a hit, flat on the ground when dead.
    let bx = 0, bz = 0;
    if (f.state === 'dodge') {
      const fwd = f.ddx * Math.sin(f.yaw) + f.ddz * Math.cos(f.yaw), side = f.ddx * Math.cos(f.yaw) - f.ddz * Math.sin(f.yaw);
      bx = fwd * 0.45; bz = -side * 0.45;
    } else if (f.state === 'stagger') bx = -0.18;
    this.fall += ((f.state === 'dead' ? 1 : 0) - this.fall) * Math.min(1, (f.state === 'dead' ? 5 : 30) * dt);
    bx += -1.45 * this.fall;
    this.body.rotation.x += (bx - this.body.rotation.x) * Math.min(1, 20 * dt);
    this.body.rotation.z += (bz - this.body.rotation.z) * Math.min(1, 20 * dt);
    this.body.position.y = 0.16 * this.fall;

    // Heavy attacks glow while charging so they can be read and answered on a small screen.
    const charging = f.state === 'attack' && f.atk.heavy && f.t < f.atk.windup + f.atk.active;
    const glow = charging ? Math.min(1, f.t / f.atk.windup) * 2.2 : 0;
    this.bladeMat.emissiveIntensity += (glow - this.bladeMat.emissiveIntensity) * Math.min(1, 20 * dt);
  }

  snap(f) { this.started = false; this.cur = mix(GUARD, GUARD, 0); this.fall = 0; this.update(f, 0.016); }
}
