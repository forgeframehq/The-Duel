// arena.js — the duelling ground. Returns both the scenery and the collision shapes the rules use.
// A Meshy-made environment can replace the scenery later; the obstacle list is what the game logic reads.
import * as THREE from 'three';

export const ARENA_R = 26;

const OBSTACLES = [
  // Ring of pillars around the centre
  { kind: 'circle', x: 5, z: 5, r: 0.75, tall: true, type: 'pillar' },
  { kind: 'circle', x: -5, z: 5, r: 0.75, tall: true, type: 'pillar' },
  { kind: 'circle', x: 5, z: -5, r: 0.75, tall: true, type: 'pillar' },
  { kind: 'circle', x: -5, z: -5, r: 0.75, tall: true, type: 'pillar' },
  // Ruined walls to hide behind
  { kind: 'box', x: -12, z: 3, hw: 0.55, hd: 3.6, tall: true, type: 'wall' },
  { kind: 'box', x: 12, z: -3, hw: 0.55, hd: 3.6, tall: true, type: 'wall' },
  { kind: 'box', x: 7, z: 13, hw: 3.2, hd: 0.55, tall: true, type: 'wall' },
  { kind: 'box', x: -7, z: -13, hw: 3.2, hd: 0.55, tall: true, type: 'wall' },
  // Boulders
  { kind: 'circle', x: -16, z: -10, r: 1.5, tall: true, type: 'rock' },
  { kind: 'circle', x: 16, z: 10, r: 1.5, tall: true, type: 'rock' },
  { kind: 'circle', x: -9, z: 16, r: 1.2, tall: true, type: 'rock' },
  { kind: 'circle', x: 9, z: -16, r: 1.2, tall: true, type: 'rock' },
  // Low cover: blocks movement, not sight
  { kind: 'box', x: -16, z: 11, hw: 0.65, hd: 0.65, tall: false, type: 'crate' },
  { kind: 'box', x: -14.5, z: 12, hw: 0.65, hd: 0.65, tall: false, type: 'crate' },
  { kind: 'box', x: 16, z: -11, hw: 0.65, hd: 0.65, tall: false, type: 'crate' },
  { kind: 'box', x: 14.5, z: -12, hw: 0.65, hd: 0.65, tall: false, type: 'crate' },
];

const SPAWNS = [{ x: 0, z: -17, yaw: 0 }, { x: 0, z: 17, yaw: Math.PI }];

export function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

function stoneMat(color) { return new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true }); }

function mesh(geo, mat, x, y, z, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true;
  return m;
}

function buildGround(group) {
  // A grid rather than a flat disc, so vertex colours can vary across the field.
  const plane = new THREE.PlaneGeometry(180, 180, 60, 60);
  plane.rotateX(-Math.PI / 2);
  const pos = plane.attributes.position, col = new Float32Array(pos.count * 3);
  const grassA = new THREE.Color(0xc9d6a8), grassB = new THREE.Color(0xffffff), dirt = new THREE.Color(0xd2a05e), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), d = Math.hypot(x, z);
    const n = hash(i * 1.7) * 0.6 + (Math.sin(x * 0.23) * Math.cos(z * 0.19) + 1) * 0.2;
    c.copy(grassA).lerp(grassB, n);
    // Trampled earth in the middle of the ring, where the fighting happens.
    const worn = Math.max(0, 1 - d / 9) * (0.55 + hash(i * 3.1) * 0.35);
    c.lerp(dirt, worn);
    if (d > ARENA_R + 2) pos.setY(i, Math.min(9, (d - ARENA_R - 2) * 0.16) * (0.6 + hash(i * 5.3) * 0.8));
    col.set([c.r, c.g, c.b], i * 3);
  }
  plane.setAttribute('color', new THREE.BufferAttribute(col, 3));
  plane.computeVertexNormals();
  const grass = new THREE.TextureLoader().load(ART + 'grass_a.jpg');
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping; grass.repeat.set(60, 60); grass.colorSpace = THREE.SRGBColorSpace; grass.anisotropy = 4;
  const ground = new THREE.Mesh(plane, new THREE.MeshStandardMaterial({ map: grass, vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  group.add(ground);

  // Painted duelling circle
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.85, 48), new THREE.MeshBasicMaterial({ color: 0xe8dcc0, transparent: true, opacity: 0.35 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
  group.add(ring);
}

function buildWall(group) {
  const n = 72, mat = stoneMat(0xb39c78), dummy = new THREE.Object3D(), col = new THREE.Color();
  const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(2.42, 1, 1.3), mat, n * 2);
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.8, 1.3), mat, n);
  blocks.castShadow = blocks.receiveShadow = caps.castShadow = true;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, r = ARENA_R + 0.75, x = Math.sin(a) * r, z = Math.cos(a) * r;
    for (let k = 0; k < 2; k++) {
      const h = k === 0 ? 2.2 : 1.6;
      dummy.position.set(x, k === 0 ? 1.1 : 3.0, z); dummy.rotation.set(0, a + (k ? 0.5 : 0) * (Math.PI * 2 / n), 0);
      if (k) dummy.position.set(Math.sin(a + Math.PI / n) * r, 3.0, Math.cos(a + Math.PI / n) * r);
      dummy.scale.set(1, h, 1); dummy.updateMatrix();
      blocks.setMatrixAt(i * 2 + k, dummy.matrix);
      const s = 0.82 + hash(i * 2 + k + 9) * 0.3;
      blocks.setColorAt(i * 2 + k, col.setRGB(s, s, s * 0.97));
    }
    dummy.position.set(x, 4.2, z); dummy.rotation.set(0, a, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    caps.setMatrixAt(i, dummy.matrix);
    const s = 0.8 + hash(i + 77) * 0.3;
    caps.setColorAt(i, col.setRGB(s, s, s * 0.97));
  }
  group.add(blocks, caps);

  // Banners in each side's colour above their spawn
  [[0, 0x2f5fb3], [Math.PI, 0xa32b2b]].forEach(([a, color]) => {
    for (const off of [-0.16, 0.16]) {
      const x = Math.sin(a + Math.PI + off) * (ARENA_R + 0.02), z = Math.cos(a + Math.PI + off) * (ARENA_R + 0.02);
      const b = mesh(new THREE.PlaneGeometry(1.5, 2.6), new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }), x, 2.5, z, false);
      b.lookAt(0, 2.5, 0);
      group.add(b);
    }
  });
}

function buildObstacles(group) {
  const stone = stoneMat(0xbfa780), dark = stoneMat(0x97805e), rockMat = stoneMat(0x857763);
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 0.9, flatShading: true });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x4f3920, roughness: 0.9, flatShading: true });
  OBSTACLES.forEach((o, i) => {
    if (o.type === 'pillar') {
      const h = 4.2 + hash(i) * 1.2;
      group.add(mesh(new THREE.CylinderGeometry(0.62, 0.72, h, 8), stone, o.x, h / 2, o.z));
      group.add(mesh(new THREE.BoxGeometry(1.7, 0.4, 1.7), dark, o.x, 0.2, o.z));
      group.add(mesh(new THREE.BoxGeometry(1.5, 0.35, 1.5), dark, o.x, h + 0.1, o.z));
    } else if (o.type === 'wall') {
      // Stacked uneven blocks so it reads as a ruin, not a slab.
      const along = o.hw > o.hd, len = (along ? o.hw : o.hd) * 2, segs = Math.round(len / 1.2);
      for (let s = 0; s < segs; s++) {
        const h = 2.5 + hash(i * 13 + s) * 1.5, t = -len / 2 + (s + 0.5) * (len / segs);
        const w = len / segs - 0.04, d = Math.min(o.hw, o.hd) * 2;
        const g = along ? new THREE.BoxGeometry(w, h, d) : new THREE.BoxGeometry(d, h, w);
        group.add(mesh(g, s % 2 ? stone : dark, o.x + (along ? t : 0), h / 2, o.z + (along ? 0 : t)));
      }
    } else if (o.type === 'rock') {
      const g = new THREE.DodecahedronGeometry(o.r * 1.25, 0);
      const m = mesh(g, rockMat, o.x, o.r * 0.75, o.z);
      m.scale.set(1, 1.5, 1); m.rotation.set(hash(i) * 3, hash(i + 4) * 3, 0);
      group.add(m);
      const m2 = mesh(new THREE.DodecahedronGeometry(o.r * 0.6, 0), rockMat, o.x + o.r * 0.9, o.r * 0.3, o.z + o.r * 0.5);
      m2.rotation.set(hash(i + 8) * 3, 0, hash(i + 2) * 3);
      group.add(m2);
    } else {
      const s = o.hw * 2;
      group.add(mesh(new THREE.BoxGeometry(s, s * 0.85, s), wood, o.x, s * 0.425, o.z));
      group.add(mesh(new THREE.BoxGeometry(s + 0.06, 0.12, s + 0.06), woodDark, o.x, s * 0.85, o.z));
    }
  });
}

// Painted scenery from Dawn of Dynasties, stood up as camera-facing cut-outs beyond the wall.
const ART = new URL('../assets/scenery/', import.meta.url).href;
const hillY = (r) => Math.min(9, Math.max(0, r - ARENA_R - 2) * 0.16) * 0.75;

export function loadCutout(file, recolor) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
      if (recolor) {
        // Buildings are painted with magenta where the owner's colour goes; make it crimson.
        const data = ctx.getImageData(0, 0, cv.width, cv.height), d = data.data;
        for (let i = 0; i < d.length; i += 4) {
          const m = Math.min(d[i], d[i + 2]) - d[i + 1];
          if (m > 45) { const l = Math.max(d[i], d[i + 2]) / 255; d[i] = 205 * l; d[i + 1] = 30 * l; d[i + 2] = 24 * l; }
        }
        ctx.putImageData(data, 0, 0);
      }
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      resolve({ tex, aspect: img.width / img.height });
    };
    img.onerror = () => resolve(null);
    img.src = ART + file;
  });
}

export function cutout(group, art, angle, r, height, tint = 0xe6bf96) {
  if (!art) return;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: art.tex, color: tint, alphaTest: 0.35, transparent: false }));
  sp.center.set(0.5, 0.04);
  sp.scale.set(height * art.aspect, height, 1);
  sp.position.set(Math.sin(angle) * r, hillY(r), Math.cos(angle) * r);
  group.add(sp);
}

async function buildScenery(group) {
  const files = ['res_tree_0.png', 'res_tree_1.png', 'res_tree_2.png', 'res_tree_3.png', 'castle.png', 'tower.png', 'barracks.png', 'towncenter.png', 'house.png', 'mill.png'];
  const [t0, t1, t2, t3, castle, tower, barracks, town, house, mill] = await Promise.all(files.map((f, i) => loadCutout(f, i >= 4)));
  // A castle beyond the rival's end, a village round the rest.
  cutout(group, castle, Math.PI * 0.0, 74, 24);
  cutout(group, tower, Math.PI * 0.14, 52, 15); cutout(group, tower, -Math.PI * 0.15, 54, 15);
  cutout(group, barracks, Math.PI * 0.4, 50, 11); cutout(group, town, -Math.PI * 0.43, 52, 12);
  cutout(group, house, Math.PI * 0.6, 46, 8); cutout(group, house, -Math.PI * 0.66, 48, 8); cutout(group, house, Math.PI * 0.93, 50, 8);
  cutout(group, mill, -Math.PI * 0.86, 48, 10); cutout(group, town, Math.PI * 0.78, 58, 12);
  const trees = [t0, t1, t2, t3];
  for (let i = 0; i < 64; i++) {
    const a = hash(i * 3.3) * Math.PI * 2, r = ARENA_R + 6 + hash(i * 7.1) * 50, s = 7 + hash(i * 1.9) * 4;
    const g = 0.78 + hash(i * 9.9) * 0.22;
    cutout(group, trees[i % 4], a, r, s, new THREE.Color(g, g * 0.86, g * 0.68));
  }
}

function buildBackdrop(group) {
  buildScenery(group);
  buildSky(group);
}

// The sunset sky and sun, shared by every arena.
export function buildSky(group) {
  // Sky dome with a horizon-to-zenith gradient
  const sky = new THREE.SphereGeometry(300, 24, 12);
  const sp = sky.attributes.position, sc = new Float32Array(sp.count * 3);
  const top = new THREE.Color(0x5a6f9c), mid = new THREE.Color(0xf0a45c), low = new THREE.Color(0xffd08a), c = new THREE.Color();
  for (let i = 0; i < sp.count; i++) {
    const h = Math.max(0, sp.getY(i) / 300);
    if (h < 0.1) c.copy(low).lerp(mid, h / 0.1); else c.copy(mid).lerp(top, Math.min(1, (h - 0.1) / 0.45));
    sc.set([c.r, c.g, c.b], i * 3);
  }
  sky.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  group.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));

  // The setting sun, sitting where the light comes from
  const glow = new THREE.Mesh(new THREE.CircleGeometry(46, 32), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.35, fog: false, depthWrite: false }));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(13, 32), new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: false, depthWrite: false }));
  for (const m of [glow, disc]) { m.position.set(-190, 60, 165); m.lookAt(0, 0, 0); group.add(m); }
}

export function buildArena() {
  const group = new THREE.Group();
  buildGround(group); buildWall(group); buildObstacles(group); buildBackdrop(group);
  return { group, obstacles: OBSTACLES, spawns: SPAWNS, R: ARENA_R };
}
