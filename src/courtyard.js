// courtyard.js — the ruined castle courtyard. The floor, banners, fire, leaves and puddles are made in
// code; the walls, towers, braziers and pillars are a small kit of Meshy pieces (assets/scenery/kit,
// made with tools/new_prop.py) that this file arranges. The same kit can be rearranged into other arenas.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/libs/meshopt_decoder.module.js';
import { buildSky, loadCutout, cutout, hash } from './arena.js';

const KIT = new URL('../assets/scenery/kit/', import.meta.url).href;
const ART = new URL('../assets/scenery/', import.meta.url).href;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

const WALLS = 12, WALL_H = 6.2;          // twelve wall sections in a ring
const APOTHEM = 21.4;                    // distance from the centre to the middle of each wall
export const COURT_R = 18.9;             // how far a fighter can walk from the centre
const PILLARS = [0.7, 2.3, 3.85, 5.4].map((a, i) => ({ kind: 'circle', x: Math.sin(a) * 9.5, z: Math.cos(a) * 9.5, r: 0.85, tall: true, type: 'pillar', turn: i * 1.7 }));
const BRAZIERS = [0, 1, 2, 3, 4, 5].map((i) => { const a = (i + 0.5) * Math.PI / 3; return { kind: 'circle', x: Math.sin(a) * 15.6, z: Math.cos(a) * 15.6, r: 0.8, tall: false, type: 'brazier' }; });
const SPAWNS = [{ x: 0, z: -12, yaw: 0 }, { x: 0, z: 12, yaw: Math.PI }];

// A tiling cobblestone texture drawn on a canvas, so the floor stays sharp right under the camera.
// If assets/scenery/cobble.jpg exists it is used instead.
function cobbleCanvas(bump) {
  const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.fillStyle = bump ? '#202020' : '#2b2620'; g.fillRect(0, 0, N, N);
  const rows = 8, rh = N / rows;
  for (let r = 0; r < rows; r++) {
    const cols = 5 + (r % 2), cw = N / cols, shift = (r % 2) * cw * 0.5 + hash(r * 3.1) * cw * 0.3;
    for (let c = 0; c < cols; c++) {
      const k = r * 17 + c * 5, pad = 3 + hash(k) * 3, w = cw - pad * 2, h = rh - pad * 2;
      const tone = 0.42 + hash(k + 1) * 0.3, warm = hash(k + 2) * 0.12;
      for (const wrap of [0, -N, N]) {           // draw again one tile to each side so the edges meet
        const x = c * cw + shift + pad + wrap, y = r * rh + pad;
        g.beginPath(); g.roundRect(x, y, w, h, 7 + hash(k + 3) * 8);
        if (bump) { g.fillStyle = `rgb(${200 + hash(k + 4) * 55 | 0},${200 + hash(k + 4) * 55 | 0},${200 + hash(k + 4) * 55 | 0})`; g.fill(); continue; }
        g.fillStyle = `rgb(${(tone + warm) * 255 | 0},${(tone + warm * 0.5) * 240 | 0},${tone * 225 | 0})`; g.fill();
        // worn highlights and dark specks
        for (let i = 0; i < 9; i++) {
          g.fillStyle = hash(k * 7 + i) < 0.5 ? 'rgba(255,245,225,0.07)' : 'rgba(0,0,0,0.12)';
          g.beginPath(); g.ellipse(x + hash(k + i * 1.3) * w, y + hash(k + i * 2.7) * h, 3 + hash(k + i) * 9, 2 + hash(k + i * 5) * 5, hash(k + i) * 3, 0, 7); g.fill();
        }
      }
    }
  }
  if (!bump) for (let i = 0; i < 70; i++) {         // moss in the gaps
    g.fillStyle = `rgba(70,${95 + hash(i) * 40 | 0},40,0.35)`;
    g.beginPath(); g.arc(hash(i * 1.7) * N, Math.round(hash(i * 2.9) * rows) * rh, 3 + hash(i * 4.1) * 7, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(9, 9); t.anisotropy = 8;
  if (!bump) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildFloor(group) {
  // Grass out to the hills, as in the open field, with the paved yard on top.
  const plane = new THREE.PlaneGeometry(220, 220, 50, 50);
  plane.rotateX(-Math.PI / 2);
  const pos = plane.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i), pos.getZ(i));
    if (d > 30) pos.setY(i, Math.min(11, (d - 30) * 0.17) * (0.6 + hash(i * 5.3) * 0.8));
  }
  plane.computeVertexNormals();
  const grass = new THREE.TextureLoader().load(ART + 'grass_a.jpg');
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping; grass.repeat.set(70, 70); grass.colorSpace = THREE.SRGBColorSpace; grass.anisotropy = 4;
  const ground = new THREE.Mesh(plane, new THREE.MeshStandardMaterial({ map: grass, color: 0xc8cf9a, roughness: 1 }));
  ground.receiveShadow = true;
  group.add(ground);

  const mat = new THREE.MeshStandardMaterial({ map: cobbleCanvas(false), bumpMap: cobbleCanvas(true), bumpScale: 1.6, roughness: 0.62, color: 0xd9cdbb });
  new THREE.TextureLoader().load(ART + 'cobble.jpg', (t) => {   // an artist-made texture replaces the drawn one when present
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(9, 9); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    mat.map = t; mat.bumpMap = null; mat.needsUpdate = true;
  }, undefined, () => {});
  const yard = new THREE.Mesh(new THREE.CircleGeometry(17.2, 72), mat);
  yard.rotation.x = -Math.PI / 2; yard.position.y = 0.015; yard.receiveShadow = true;
  group.add(yard);

  // Loose flagstones breaking up the edge where paving meets grass
  const slab = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.08, 1), new THREE.MeshStandardMaterial({ color: 0x8d8375, roughness: 0.8 }), 70);
  const d = new THREE.Object3D(), col = new THREE.Color();
  for (let i = 0; i < 70; i++) {
    const a = hash(i * 2.3) * Math.PI * 2, r = 16.6 + hash(i * 4.9) * 2.4;
    d.position.set(Math.sin(a) * r, 0.03, Math.cos(a) * r); d.rotation.set(0, hash(i * 7.7) * 3, 0);
    d.scale.set(0.5 + hash(i * 1.1) * 0.7, 1, 0.4 + hash(i * 3.3) * 0.6); d.updateMatrix();
    slab.setMatrixAt(i, d.matrix);
    const s = 0.75 + hash(i * 9.1) * 0.4; slab.setColorAt(i, col.setRGB(s, s * 0.97, s * 0.92));
  }
  slab.receiveShadow = true;
  group.add(slab);

  // Rain puddles that catch the low sun
  const water = new THREE.MeshStandardMaterial({ color: 0x241c16, roughness: 0.06, metalness: 0.75, transparent: true, opacity: 0.82 });
  [[3.5, -4, 1.5, 0.9], [-6, 2.5, 1.2, 1.4], [1.5, 7.5, 1.0, 0.7], [-3, -9, 1.4, 0.8], [8.5, 3, 0.9, 1.1], [-10, -3.5, 1.1, 0.6]].forEach(([x, z, r, squash], i) => {
    const p = new THREE.Mesh(new THREE.CircleGeometry(r, 20), water);
    p.rotation.x = -Math.PI / 2; p.rotation.z = i * 1.3; p.scale.set(1, squash, 1); p.position.set(x, 0.03, z);
    group.add(p);
  });
}

// Places a kit piece with its base on the ground, scaled to a height in metres.
function place(group, proto, x, z, yaw, height, tint, flip = false, castShadow = false) {
  const o = proto.clone();
  const box = new THREE.Box3().setFromObject(proto), s = height / (box.max.y - box.min.y);
  o.scale.set(flip ? -s : s, s, s); o.rotation.y = yaw; o.position.set(x, -box.min.y * s, z);
  o.traverse((m) => {
    if (!m.isMesh) return;
    // Only small pieces cast shadows; walls and towers would double the drawing work for little gain.
    m.castShadow = castShadow; m.receiveShadow = true;
    if (tint) { m.material = m.material.clone(); m.material.color.set(tint); if (flip) m.material.side = THREE.DoubleSide; }
  });
  group.add(o);
  return o;
}

async function buildKit(group) {
  const [wall, tower, brazier, pillar] = (await Promise.all(['wall_arch', 'tower', 'brazier', 'pillar'].map((n) => loader.loadAsync(KIT + n + '.glb').catch(() => null)))).map((g) => g && g.scene);
  if (wall) for (let i = 0; i < WALLS; i++) {
    const a = (i / WALLS) * Math.PI * 2;
    place(group, wall, Math.sin(a) * APOTHEM, Math.cos(a) * APOTHEM, a, WALL_H, 0xe4d6bd, i % 2 === 1);
  }
  if (tower) for (const i of [1, 4, 7, 10]) {
    const a = ((i + 0.5) / WALLS) * Math.PI * 2;
    place(group, tower, Math.sin(a) * 23.6, Math.cos(a) * 23.6, a, 12.5, 0xcdbfa6);
  }
  if (pillar) for (const p of PILLARS) place(group, pillar, p.x, p.z, p.turn, 4.4, 0xd8cdb8, false, true);
  if (brazier) for (const b of BRAZIERS) place(group, brazier, b.x, b.z, 0, 1.05, 0x8a8078, false, true);
}

// A hanging banner: crimson with a gold sun, torn along the bottom.
function bannerTexture() {
  const W = 256, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, H - 70);
  for (let i = 0; i <= 8; i++) g.lineTo(W - (i / 8) * W, H - (i % 2 ? 10 : 70) - hash(i * 3.7) * 28);
  g.closePath(); g.clip();
  const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, '#a01a14'); grad.addColorStop(1, '#6a0e0c');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#e3b84f'; g.lineWidth = 9; g.strokeRect(14, 14, W - 28, H);
  g.fillStyle = '#edc55c'; g.translate(W / 2, 190);
  for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.beginPath(); g.moveTo(-9, -38); g.lineTo(0, i % 2 ? -78 : -100); g.lineTo(9, -38); g.fill(); }
  g.beginPath(); g.arc(0, 0, 40, 0, 7); g.fill();
  g.fillStyle = '#8a1410'; g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function buildBanners(group) {
  const mat = new THREE.MeshStandardMaterial({ map: bannerTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
  const banners = [];
  for (let i = 0; i < WALLS; i++) {
    const a = (i / WALLS) * Math.PI * 2, side = i % 2 ? 3.6 : -3.6, inward = APOTHEM - 1.75;
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3.6), mat);
    b.position.set(Math.sin(a) * inward + Math.cos(a) * side, 3.5, Math.cos(a) * inward - Math.sin(a) * side);
    b.rotation.y = a + Math.PI;
    b.castShadow = true;
    group.add(b); banners.push(b);
  }
  return banners;
}

function glowTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,220,150,1)'); r.addColorStop(0.35, 'rgba(255,140,40,0.55)'); r.addColorStop(1, 'rgba(255,90,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

// A soft teardrop of flame, used as a camera-facing sprite.
function flameTexture() {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
  const g = cv.getContext('2d'), r = g.createRadialGradient(32, 92, 2, 32, 80, 46);
  r.addColorStop(0, 'rgba(255,240,190,1)'); r.addColorStop(0.3, 'rgba(255,170,50,0.9)'); r.addColorStop(0.7, 'rgba(230,70,10,0.45)'); r.addColorStop(1, 'rgba(160,30,0,0)');
  g.fillStyle = r;
  g.beginPath(); g.moveTo(32, 4); g.bezierCurveTo(60, 60, 62, 96, 32, 124); g.bezierCurveTo(2, 96, 4, 60, 32, 4); g.fill();
  return new THREE.CanvasTexture(cv);
}

function buildFires(group) {
  const glow = glowTexture(), flame = flameTexture(), fires = [];
  for (const b of BRAZIERS) {
    const f = new THREE.Group(); f.position.set(b.x, 1.0, b.z);
    const mk = (w, h, y) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flame, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 })); s.scale.set(w, h, 1); s.center.set(0.5, 0.08); s.position.y = y; return s; };
    const a = mk(1.0, 1.7, -0.05), c = mk(0.6, 1.1, 0);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.45 }));
    halo.scale.set(3, 3, 1); halo.position.y = 0.55;
    // Firelight spilling on the stones around the brazier
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.2, 16), new THREE.MeshBasicMaterial({ map: glow, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = -0.95;
    f.add(a, c, halo, pool);
    group.add(f); fires.push({ a, c, halo, pool, seed: hash(b.x) * 10 });
  }
  return fires;
}

// Red leaves drifting down across the yard.
function buildLeaves(group) {
  const N = 70, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), seed = new Float32Array(N), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const a = hash(i * 1.3) * Math.PI * 2, r = Math.sqrt(hash(i * 2.7)) * 21;
    pos.set([Math.sin(a) * r, hash(i * 4.1) * 9, Math.cos(a) * r], i * 3); seed[i] = hash(i * 6.3) * 10;
    c.setHSL(0.0 + hash(i * 8.9) * 0.07, 0.85, 0.42 + hash(i * 3.1) * 0.15); col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
  pts.frustumCulled = false;
  group.add(pts);
  return { pos, seed, geo, N };
}

function buildFar(group) {
  // Mountains on the horizon with snow on the peaks
  const rock = new THREE.MeshBasicMaterial({ color: 0x6a5f78, fog: false }), snow = new THREE.MeshBasicMaterial({ color: 0xf2d6c6, fog: false });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + hash(i) * 0.25, r = 235 + hash(i * 3.3) * 25, h = 55 + hash(i * 5.1) * 70, w = 55 + hash(i * 7.7) * 45;
    const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 5), rock);
    m.position.set(Math.sin(a) * r, h / 2 - 6, Math.cos(a) * r); m.rotation.y = hash(i * 2.1) * 3;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.34, h * 0.34, 5), snow);
    cap.position.set(m.position.x, h - h * 0.17 - 5.6, m.position.z); cap.rotation.y = m.rotation.y;
    group.add(m, cap);
  }
  // Trees beyond the walls, from Dawn of Dynasties
  Promise.all(['res_tree_0.png', 'res_tree_1.png', 'res_tree_2.png', 'res_tree_3.png'].map((f) => loadCutout(f, false))).then((trees) => {
    for (let i = 0; i < 46; i++) {
      const a = hash(i * 3.3) * Math.PI * 2, r = 31 + hash(i * 7.1) * 45, g = 0.72 + hash(i * 9.9) * 0.22;
      cutout(group, trees[i % 4], a, r, 8 + hash(i * 1.9) * 5, new THREE.Color(g, g * 0.84, g * 0.66));
    }
  });
}

export function buildCourtyard() {
  const group = new THREE.Group();
  buildFloor(group); buildFar(group); buildSky(group);
  buildKit(group);
  const banners = buildBanners(group), fires = buildFires(group), leaves = buildLeaves(group);

  // Called every frame: flickering fire, swaying banners, falling leaves.
  function update(dt, t) {
    for (const f of fires) {
      const k = 0.85 + Math.sin(t * 11 + f.seed) * 0.12 + Math.sin(t * 23 + f.seed * 2) * 0.08;
      f.a.scale.set(0.9 + (k - 0.85) * 0.8, 1.7 * k, 1); f.c.scale.set(0.6, 1.1 * (1.7 - k), 1);
      f.a.position.x = Math.sin(t * 7 + f.seed) * 0.05;
      f.halo.material.opacity = 0.3 + k * 0.18; f.pool.material.opacity = 0.2 + k * 0.12;
    }
    banners.forEach((b, i) => { b.rotation.x = Math.sin(t * 0.9 + i * 1.7) * 0.05; });
    const p = leaves.pos;
    for (let i = 0; i < leaves.N; i++) {
      const s = leaves.seed[i];
      p[i * 3] += Math.sin(t * 0.7 + s) * 0.5 * dt + 0.25 * dt;
      p[i * 3 + 1] -= (0.45 + (s % 1) * 0.5) * dt;
      p[i * 3 + 2] += Math.cos(t * 0.9 + s * 1.3) * 0.5 * dt;
      if (p[i * 3 + 1] < 0.03) { p[i * 3 + 1] = 7 + (s % 3); p[i * 3] = Math.sin(s * 9.1 + t) * 19; p[i * 3 + 2] = Math.cos(s * 5.3 + t * 1.3) * 19; }
    }
    leaves.geo.attributes.position.needsUpdate = true;
  }

  return { group, obstacles: [...PILLARS, ...BRAZIERS], spawns: SPAWNS, R: COURT_R, update };
}
