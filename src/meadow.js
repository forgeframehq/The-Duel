// meadow.js — the Whispering Meadow: open grassland in soft daylight. Rolling ground, a worn dirt
// path, tall grass that sways in the wind and parts around the fighters, wildflowers, trees, mossy
// boulders, a pavilion and a few farmhouses, and layers of misty hills behind.
//
// The ground, grass, flowers, sky and hills are made in code. The trees, boulders and buildings are
// Meshy models (assets/scenery/meadow, made with tools/new_prop.py) that this file arranges.
// The fighting ground itself is flat, because the rules (sim.js) are flat; the hills start beyond it.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/libs/meshopt_decoder.module.js';
import { hash, loadCutout } from './arena.js';
import { QUALITY } from './quality.js';

const KIT = new URL('../assets/scenery/meadow/', import.meta.url).href;
const ART = new URL('../assets/scenery/', import.meta.url).href;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

export const MEADOW_R = 22;              // how far a fighter can walk from the centre
const SPAWNS = [{ x: 0, z: -8.5, yaw: 0 }, { x: 0, z: 8.5, yaw: Math.PI }];
// Things to fight around. Boulders and tree trunks block sight as well as movement.
const ROCKS = [{ x: -9.5, z: 2.5, r: 1.7, h: 2.6, turn: 0.4 }, { x: 10.5, z: -4.5, r: 1.5, h: 2.3, turn: 2.1 }, { x: 5, z: 13.5, r: 1.3, h: 2.0, turn: 4.0 }, { x: -6, z: -14, r: 1.4, h: 2.2, turn: 5.2 }];
const TREES_IN = [{ x: -15, z: -6.5, r: 0.8, h: 13, turn: 1.0 }, { x: 15.5, z: 8, r: 0.8, h: 12, turn: 3.3 }];
const OBSTACLES = [
  ...ROCKS.map((o) => ({ kind: 'circle', x: o.x, z: o.z, r: o.r, tall: true, type: 'rock' })),
  ...TREES_IN.map((o) => ({ kind: 'circle', x: o.x, z: o.z, r: o.r, tall: true, type: 'tree' })),
];

// The light for this arena: a high, soft sun, a blue sky filling the shadows, and pale haze in the distance.
export const MEADOW_LOOK = {
  fog: [0xc3dcec, 38, 230], hemi: [0xe2f1ff, 0x6c8a48, 1.0], sun: [0xfff0d2, 2.7, -24, 36, 16], fill: [0xa9c4ea, 0.45], exposure: 1.02,
  env: [0x4f8fd8, 0xdcecf6, 0x6c8a48], envIntensity: 0.55,
};

// ---------- the shape of the land ----------
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function noise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const h = (a, b) => hash(a * 12.9898 + b * 78.233);
  return (h(xi, zi) * (1 - u) + h(xi + 1, zi) * u) * (1 - v) + (h(xi, zi + 1) * (1 - u) + h(xi + 1, zi + 1) * u) * v;
}
const fbm = (x, z) => noise(x, z) * 0.55 + noise(x * 2.1 + 5, z * 2.1 + 9) * 0.3 + noise(x * 4.3 + 17, z * 4.3 + 3) * 0.15;
// Flat where the fight happens, rising into soft hills beyond it.
export function groundY(x, z) {
  const r = Math.hypot(x, z), rise = smooth(MEADOW_R + 1.5, MEADOW_R + 34, r);
  return rise * (2.2 + fbm(x * 0.022 + 3, z * 0.022 + 7) * 9) + smooth(MEADOW_R + 2, MEADOW_R + 10, r) * (fbm(x * 0.09, z * 0.09) - 0.5) * 1.4;
}
// The worn path: it winds through the middle of the meadow, with a trodden patch where the fighters meet
// and a branch leading off to the pavilion. Returns 0 (grass) to 1 (bare earth).
const pathX = (z) => 4.5 * Math.sin(z * 0.055 + 0.6) + 1.8 * Math.sin(z * 0.16 + 2);
function dirtAt(x, z) {
  const main = 1 - smooth(0.9, 2.5, Math.abs(x - pathX(z)) + (fbm(x * 0.4, z * 0.4) - 0.5) * 1.2);
  const ring = (1 - smooth(2.5, 6, Math.hypot(x - pathX(0), z) + (fbm(x * 0.3 + 8, z * 0.3) - 0.5) * 2)) * 0.85;
  const bz = 16 + (x + 4) * -0.25, branch = x < -1 && x > -26 ? (1 - smooth(0.9, 2.4, Math.abs(z - bz))) * smooth(-1, -5, x) : 0;
  return Math.max(main, ring, branch);
}

function buildGround(group) {
  const SIZE = 420, SEG = 200, geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, dirt = new Float32Array(pos.count), col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    // More detail near the middle, where the camera is: squeeze the grid toward the centre.
    let x = pos.getX(i), z = pos.getZ(i);
    const k = (v) => Math.sign(v) * Math.pow(Math.abs(v) / (SIZE / 2), 1.7) * (SIZE / 2);
    x = k(x); z = k(z);
    pos.setXYZ(i, x, groundY(x, z), z);
    dirt[i] = dirtAt(x, z);
    // Patches of lighter and darker green, drier on the hilltops.
    const p = fbm(x * 0.06 + 40, z * 0.06 + 11), dry = smooth(3, 10, groundY(x, z)) * 0.25;
    c.setRGB(0.78 + p * 0.3 + dry, 0.9 + p * 0.2, 0.7 + p * 0.25 - dry * 0.6);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('dirt', new THREE.BufferAttribute(dirt, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 7, pos.getZ(i) / 7);
  geo.computeVertexNormals();

  const tl = new THREE.TextureLoader(), tex = (file) => { const t = tl.load(ART + file); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const mat = new THREE.MeshStandardMaterial({ map: tex('grass_a.jpg'), vertexColors: true, roughness: 0.95, metalness: 0 });
  const dirtMap = tex('dirt.jpg');
  // Grass and earth are two textures, mixed by how worn the ground is, with a ragged edge between them.
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.dirtMap = { value: dirtMap };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float dirt; varying float vDirt;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDirt = dirt;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D dirtMap; varying float vDirt;')
      .replace('#include <map_fragment>', `
        vec4 gA = texture2D(map, vMapUv) * vec4(0.3, 0.42, 0.2, 1.0);
        vec4 gFar = texture2D(map, vMapUv * 0.13) * vec4(0.3, 0.42, 0.2, 1.0);
        gA = mix(gA, gFar, 0.45);                       // a second, larger copy hides the repeat
        vec4 gB = texture2D(dirtMap, vMapUv * 1.7) * vec4(0.98, 0.86, 0.72, 1.0);
        gB *= 0.78 + 0.44 * texture2D(dirtMap, vMapUv * 0.21).g;        // large light and dark patches in the earth
        float edge = smoothstep(0.38, 0.62, vDirt + (gB.g - 0.5) * 0.5 + (gA.g - 0.4) * 0.3);
        diffuseColor *= mix(gA, gB, edge);`);
  };
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  group.add(ground);
}

// ---------- grass ----------
// One tuft is a handful of tapering blades leaning outward. Thousands of copies are scattered by the
// graphics card; a few lines of shader sway them in the wind and press them flat around the fighters.
function tuftGeometry(blades = 6) {
  const pos = [], col = [], idx = [], base = new THREE.Color(0x16300f), tip = new THREE.Color(0x6f9c3a), c = new THREE.Color();
  for (let b = 0; b < blades; b++) {
    // thin blades spread over a hand's width of ground, each arching outward toward its tip
    const a = (b / blades) * Math.PI * 2 + hash(b * 3.1) * 1.2, lean = 0.12 + hash(b * 7.7) * 0.3, w = 0.011 + hash(b * 5.3) * 0.008, h = 0.6 + hash(b * 9.1) * 0.4;
    const off = 0.05 + 0.2 * hash(b * 2.3), ox = Math.cos(a * 1.7) * off, oz = Math.sin(a * 1.7) * off, dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx, v0 = pos.length / 3;
    const put = (t, wk, s) => { const out = lean * t * t, y = h * t; pos.push(ox + dx * out + sx * w * wk * s, y, oz + dz * out + sz * w * wk * s); c.copy(base).lerp(tip, Math.pow(t, 0.8)); col.push(c.r, c.g, c.b); };
    put(0, 1, -1); put(0, 1, 1); put(0.55, 0.8, -1); put(0.55, 0.8, 1); put(1, 0, 0);
    idx.push(v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2, v0 + 2, v0 + 3, v0 + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // Every blade is lit as if it faced straight up, so the meadow shades like the ground under it.
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

function buildGrass(group, amount) {
  const uniforms = { uTime: { value: 0 }, uA: { value: new THREE.Vector3(0, 0, 999) }, uB: { value: new THREE.Vector3(0, 0, 999) } };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uA; uniform vec3 uB;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp = instanceMatrix * vec4(transformed, 1.0);
        float up = position.y * position.y;                               // the tip moves, the root does not
        // wind: a slow wave crossing the meadow plus a quick shiver
        float wave = sin(uTime * 1.3 + wp.x * 0.22 + wp.z * 0.17) * 0.5 + sin(uTime * 3.1 + wp.x * 0.9 - wp.z * 0.6) * 0.14;
        vec2 push = vec2(0.34, 0.2) * wave * up;
        // fighters press the grass down and away from themselves
        vec2 da = wp.xz - uA.xz, db = wp.xz - uB.xz;
        float ka = smoothstep(1.25, 0.25, length(da)), kb = smoothstep(1.25, 0.25, length(db));
        push += (normalize(da + 0.001) * ka + normalize(db + 0.001) * kb) * 0.55 * up;
        float flat_ = max(ka, kb);
        // the push is in world space; the tuft is only turned about the upright axis, so undo that turn
        vec2 ax = normalize(vec2(instanceMatrix[0].x, instanceMatrix[0].z));
        transformed.x += push.x * ax.x + push.y * ax.y;
        transformed.z += -push.x * ax.y + push.y * ax.x;
        transformed.y *= 1.0 - 0.55 * flat_;`);
  };

  // Scatter: thick in the open meadow, none on the path, thinner and shorter toward the hills.
  const CELL = 22, cells = new Map(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
  let n = 0;
  const add = (x, z, hgt, wide, i) => {
    const key = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
    if (!cells.has(key)) cells.set(key, { mats: [], cols: [] });
    const cell = cells.get(key);
    q.setFromAxisAngle(up, hash(i * 1.7) * Math.PI * 2); s.set(wide, hgt, wide); p.set(x, groundY(x, z) - 0.02, z);
    m.compose(p, q, s); cell.mats.push(...m.elements);
    // drier, yellower patches and deeper green ones
    const g = 0.72 + fbm(x * 0.08 + 9, z * 0.08 + 2) * 0.5, y = fbm(x * 0.045 + 60, z * 0.045 + 13) * 0.45 + hash(i * 8.3) * 0.1;
    tint.setRGB(g * (0.8 + y * 0.7), g, g * (0.75 - y * 0.35)); cell.cols.push(tint.r, tint.g, tint.b);
    n++;
  };
  const RMAX = 58, tries = Math.round(70000 * amount);
  for (let i = 0; i < tries; i++) {
    // more of them near the middle
    const r = Math.pow(hash(i * 0.731 + 1), 0.72) * RMAX, a = hash(i * 1.913 + 2) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const d = dirtAt(x, z);
    if (d > 0.55) continue;
    if (OBSTACLES.some((o) => Math.hypot(x - o.x, z - o.z) < o.r * 0.8)) continue;
    const patch = fbm(x * 0.11 + 31, z * 0.11 + 5);
    if (patch < 0.3 && hash(i * 4.4) > 0.35) continue;                    // bare-ish patches keep it from looking like a lawn
    const far = smooth(28, RMAX, r), hgt = (0.34 + patch * 0.5 + hash(i * 6.1) * 0.22) * (1 - d * 1.3) * (1 + far * 0.5);
    if (hash(i * 2.9) < far * 0.75) continue;
    add(x, z, Math.max(0.16, hgt), 1.15 + hash(i * 3.7) * 0.7 + far * 2.6, i);
  }
  const geo = tuftGeometry();
  for (const cell of cells.values()) {
    const count = cell.mats.length / 16, mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.array.set(cell.mats); mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cell.cols), 3);
    mesh.receiveShadow = true; mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return { uniforms, count: n };
}

// Wildflowers: small bright heads on thin stalks, in drifts.
function buildFlowers(group) {
  const head = new THREE.OctahedronGeometry(0.055, 0), mat = new THREE.MeshLambertMaterial();
  const N = 2600, mesh = new THREE.InstancedMesh(head, mat, N), m = new THREE.Matrix4(), c = new THREE.Color();
  const colours = [0xfff4d0, 0xf7b7d2, 0xffe066, 0xc9a8ff, 0xffffff, 0xff8f8f];
  let n = 0;
  for (let i = 0; i < N * 6 && n < N; i++) {
    const r = Math.sqrt(hash(i * 0.917 + 5)) * 62, a = hash(i * 2.371) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (dirtAt(x, z) > 0.3 || fbm(x * 0.13 + 70, z * 0.13 + 44) < 0.56) continue;   // only in drifts
    m.makeScale(1, 0.7, 1).setPosition(x, groundY(x, z) + 0.42 + hash(i * 5.1) * 0.3, z);
    mesh.setMatrixAt(n, m); c.set(colours[Math.floor(fbm(x * 0.05, z * 0.05 + 90) * 5.99)]).multiplyScalar(0.9 + hash(i) * 0.2); mesh.setColorAt(n, c);
    n++;
  }
  mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}

// Pebbles and small stones along the path and in the trodden patch.
function buildPebbles(group) {
  const N = 900, mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.95 }), N), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  let n = 0;
  for (let i = 0; i < N * 5 && n < N; i++) {
    const r = Math.sqrt(hash(i * 1.37 + 3)) * 48, a = hash(i * 2.91) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r, d = dirtAt(x, z);
    if (d < 0.3 || (d > 0.9 && hash(i * 7.1) > 0.35)) continue;                 // mostly along the ragged edges
    const s = 0.025 + Math.pow(hash(i * 3.3), 3) * 0.13;
    q.setFromEuler(e.set(hash(i) * 6, hash(i * 2) * 6, hash(i * 3) * 6));
    m.compose(new THREE.Vector3(x, groundY(x, z) + s * 0.25, z), q, new THREE.Vector3(s, s * 0.6, s * 1.2));
    mesh.setMatrixAt(n, m); const g = 0.5 + hash(i * 5.5) * 0.3; mesh.setColorAt(n, c.setRGB(g, g * 0.96, g * 0.88)); n++;
  }
  mesh.count = n; mesh.instanceMatrix.needsUpdate = true; mesh.receiveShadow = true;
  group.add(mesh);
}

// ---------- models ----------
// Places a model with its base on the ground, scaled to a height in metres.
function place(group, proto, x, z, yaw, height, opts = {}) {
  const o = proto.clone(), box = new THREE.Box3().setFromObject(proto), s = height / (box.max.y - box.min.y);
  o.scale.setScalar(s); o.rotation.y = yaw;
  o.position.set(x, (opts.y ?? groundY(x, z)) - box.min.y * s - (opts.sink || 0), z);
  o.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.castShadow = opts.shadow !== false; mesh.receiveShadow = true;
    if (opts.tint) { mesh.material = mesh.material.clone(); mesh.material.color.set(opts.tint); }
  });
  group.add(o);
  return o;
}

async function buildModels(group, sway) {
  // Trees and boulders come at full detail for the ones a fighter can walk up to, and a lighter copy for the many further off.
  const names = ['tree_broadleaf', 'tree_broadleaf_mid', 'boulders', 'boulders_mid', 'pavilion', 'hut'];
  const [treeFull, treeMid, rockFull, rockMid, pavilion, hut] = (await Promise.all(names.map((n) => loader.loadAsync(KIT + n + '.glb').catch(() => null)))).map((g) => g && g.scene);
  const tree = QUALITY.trees === 'full' ? treeFull || treeMid : treeMid || treeFull, nearTree = QUALITY.trees === 'low' ? treeMid || treeFull : treeFull || treeMid;
  const rock = rockMid || rockFull;
  if (rock) {
    for (const r of ROCKS) place(group, rockFull || rock, r.x, r.z, r.turn, r.h, { sink: 0.15 });
    // more of them out in the grass and on the hills, where they are only scenery
    for (let i = 0; i < 16; i++) {
      const a = hash(i * 5.7 + 1) * Math.PI * 2, d = MEADOW_R + 5 + hash(i * 3.1) * 55;
      place(group, rock, Math.sin(a) * d, Math.cos(a) * d, hash(i * 9.9) * 6.3, 1.2 + hash(i * 2.7) * 3.2, { sink: 0.2, shadow: d < 45 });
    }
  }
  if (tree) {
    for (const t of TREES_IN) sway.push(place(group, nearTree, t.x, t.z, t.turn, t.h, { sink: 0.2 }));
    // a loose ring of trees round the meadow, and copses on the hills
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + hash(i * 4.1) * 0.25, d = MEADOW_R + 7 + hash(i * 6.3) * (i % 3 ? 16 : 60), x = Math.sin(a) * d, z = Math.cos(a) * d;
      if (Math.abs(x - pathX(z)) < 4) continue;                           // keep the path clear
      const o = place(group, d < MEADOW_R + 12 ? tree : treeMid || tree, x, z, hash(i * 2.3) * 6.3, 10 + hash(i * 8.7) * 7, { sink: 0.25, shadow: d < 50, tint: new THREE.Color().setHSL(0, 0, 0.85 + hash(i * 1.3) * 0.25) });
      if (d < 45) sway.push(o);
    }
  }
  if (pavilion) place(group, pavilion, -27, 22, 2.2, 7.5, { y: groundY(-27, 22) - 0.1 });
  if (hut) {
    const straw = { tint: 0xd9cfae };   // the thatch comes out of Meshy too yellow for this light
    place(group, hut, 30, 27, -2.3, 6, straw); place(group, hut, 38, 16, -1.2, 5.4, straw); place(group, hut, -34, -24, 0.9, 6, straw); place(group, hut, 21, -38, 2.6, 5.6, straw);
  }
}

// ---------- sky, hills and far trees ----------
function buildSky(group) {
  const sky = new THREE.SphereGeometry(520, 32, 16), sp = sky.attributes.position, sc = new Float32Array(sp.count * 3);
  const top = new THREE.Color(0x3f82d8), mid = new THREE.Color(0x9cc8ee), low = new THREE.Color(0xdcecf6), c = new THREE.Color();
  for (let i = 0; i < sp.count; i++) {
    const h = Math.max(0, sp.getY(i) / 520);
    if (h < 0.12) c.copy(low).lerp(mid, h / 0.12); else c.copy(mid).lerp(top, Math.min(1, (h - 0.12) / 0.6));
    sc.set([c.r, c.g, c.b], i * 3);
  }
  sky.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  group.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));

  // The sun, high and soft, where the light comes from.
  const [, , sx, sy, sz] = MEADOW_LOOK.sun, dir = new THREE.Vector3(sx, sy, sz).normalize().multiplyScalar(480);
  const soft = (r, colour, opacity) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, fog: false, depthWrite: false, blending: THREE.AdditiveBlending })); m.position.copy(dir); m.lookAt(0, 0, 0); group.add(m); };
  soft(150, 0xfff2cc, 0.12); soft(70, 0xfff2cc, 0.2); soft(20, 0xffffff, 1);

  // Clouds: soft white puffs, drawn once on a canvas and scattered round the sky.
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 40 + hash(i * 3.3) * 176, y = 50 + hash(i * 7.7) * 40 - Math.abs(x - 128) * 0.1, r = 18 + hash(i * 5.1) * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const clouds = [];
  for (let i = 0; i < 16; i++) {
    const a = hash(i * 9.1) * Math.PI * 2, elev = 0.12 + hash(i * 4.7) * 0.4, w = 150 + hash(i * 2.9) * 170;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.75 + hash(i * 6.1) * 0.25, fog: false, depthWrite: false }));
    sprite.scale.set(w, w * 0.42, 1);
    sprite.position.set(Math.sin(a) * 430 * Math.cos(elev), 430 * Math.sin(elev), Math.cos(a) * 430 * Math.cos(elev));
    group.add(sprite); clouds.push({ sprite, a, elev });
  }
  return clouds;
}

// Three rows of hills, each paler and bluer than the one in front: that fading is what gives the view its depth.
function buildHills(group) {
  const rows = [[150, 16, 34, 0x6f9a62, 0.7], [215, 30, 60, 0x7fa39a, 2.3], [300, 55, 95, 0x9bb8cf, 4.9]];
  for (const [radius, lo, hi, colour, seed] of rows) {
    const N = 180, pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2, wrap = Math.sin(a) * 3 + seed, wrap2 = Math.cos(a) * 3 + seed * 2;
      const h = lo + (hi - lo) * Math.pow(fbm(wrap * 1.3, wrap2 * 1.3), 1.4) * 1.6, x = Math.sin(a) * radius, z = Math.cos(a) * radius;
      pos.push(x, -6, z, x * 0.93, h, z * 0.93);
      if (i < N) { const v = i * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide, fog: true })));
  }
}

// Painted trees from Dawn of Dynasties, far off on the hills, tinted toward the haze.
async function buildFarTrees(group) {
  const arts = await Promise.all(['res_tree_0.png', 'res_tree_1.png', 'res_tree_2.png', 'res_tree_3.png'].map((f) => loadCutout(f, false)));
  for (let i = 0; i < 90; i++) {
    const art = arts[i % 4]; if (!art) continue;
    const a = hash(i * 3.7 + 2) * Math.PI * 2, d = 70 + hash(i * 6.9) * 70, x = Math.sin(a) * d, z = Math.cos(a) * d, h = 11 + hash(i * 1.9) * 8, g = 0.62 + hash(i * 9.3) * 0.2;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: art.tex, color: new THREE.Color(g * 0.8, g, g * 0.72), alphaTest: 0.35 }));
    sp.center.set(0.5, 0.04); sp.scale.set(h * art.aspect, h, 1); sp.position.set(x, groundY(x, z) - 0.3, z);
    group.add(sp);
  }
}

// Specks drifting in the sunlight: seeds and insects.
function buildMotes(group) {
  const N = 220, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { seed[i] = hash(i * 7.3) * 100; pos.set([(hash(i * 1.1) - 0.5) * 60, 0.4 + hash(i * 2.2) * 5, (hash(i * 3.3) - 0.5) * 60], i * 3); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  group.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfffbe0, size: 0.07, transparent: true, opacity: 0.8, depthWrite: false })));
  return { pos, seed, geo, N };
}

export function buildMeadow() {
  const group = new THREE.Group();
  let amount = QUALITY.grass;
  try { const g = parseFloat(new URLSearchParams(location.search).get('grass')); if (g >= 0) amount = g; } catch { /* not in a browser */ }
  buildGround(group);
  const grass = buildGrass(group, amount);
  buildFlowers(group); buildPebbles(group);
  const clouds = buildSky(group);
  buildHills(group);
  buildFarTrees(group);
  const sway = [];
  buildModels(group, sway);
  const motes = buildMotes(group);

  // Called every frame with the two fighters' positions: wind in the grass and trees, drifting clouds and motes.
  function update(dt, t, fighters) {
    grass.uniforms.uTime.value = t;
    if (fighters) { grass.uniforms.uA.value.set(fighters[0].x, 0, fighters[0].z); grass.uniforms.uB.value.set(fighters[1].x, 0, fighters[1].z); }
    sway.forEach((o, i) => { o.rotation.z = Math.sin(t * 0.7 + i * 1.9) * 0.012; o.rotation.x = Math.sin(t * 0.9 + i * 2.7) * 0.01; });
    for (const c of clouds) { c.a += dt * 0.004; c.sprite.position.set(Math.sin(c.a) * 430 * Math.cos(c.elev), 430 * Math.sin(c.elev), Math.cos(c.a) * 430 * Math.cos(c.elev)); }
    const p = motes.pos;
    for (let i = 0; i < motes.N; i++) {
      const s = motes.seed[i];
      p[i * 3] += (0.5 + Math.sin(t * 0.6 + s) * 0.4) * dt; p[i * 3 + 1] += Math.sin(t * 1.1 + s * 2) * 0.25 * dt; p[i * 3 + 2] += Math.cos(t * 0.5 + s) * 0.35 * dt;
      if (p[i * 3] > 30) p[i * 3] = -30;
    }
    motes.geo.attributes.position.needsUpdate = true;
  }

  return { group, obstacles: OBSTACLES, spawns: SPAWNS, R: MEADOW_R, update, look: MEADOW_LOOK, grassCount: grass.count };
}
