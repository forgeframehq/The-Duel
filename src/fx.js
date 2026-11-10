// fx.js — everything that sells an impact: sparks, dust, sword trails, camera shake.
import * as THREE from 'three';

const MAX = 360;

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3); this.col = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3); this.life = new Float32Array(MAX); this.max = new Float32Array(MAX);
    this.base = new Float32Array(MAX * 3); this.grav = new Float32Array(MAX);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.16, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -100;
    scene.add(this.points);
  }

  emit(x, y, z, n, color, speed, life, gravity = 9, up = 1) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % MAX;
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI * 0.8, s = speed * (0.35 + Math.random() * 0.65);
      this.pos.set([x, y, z], i * 3);
      this.vel.set([Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s * up + up, Math.sin(a) * Math.cos(e) * s], i * 3);
      this.base.set([c.r, c.g, c.b], i * 3);
      this.life[i] = this.max[i] = life * (0.5 + Math.random() * 0.5); this.grav[i] = gravity;
    }
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      if (this.life[i] <= 0) { this.pos[j + 1] = -100; continue; }
      this.vel[j + 1] -= this.grav[i] * dt;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.03) { this.pos[j + 1] = 0.03; this.vel[j + 1] *= -0.3; this.vel[j] *= 0.6; this.vel[j + 2] *= 0.6; }
      const f = this.life[i] / this.max[i];
      this.col[j] = this.base[j] * f; this.col[j + 1] = this.base[j + 1] * f; this.col[j + 2] = this.base[j + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

// A ribbon that follows the blade while it is swinging.
const SEG = 12;
export class Trail {
  constructor(scene, color = 0xffffff) {
    this.pos = new Float32Array(SEG * 2 * 3); this.alpha = new Float32Array(SEG * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const idx = [];
    for (let i = 0; i < SEG - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 color; varying float vA; void main(){ gl_FragColor = vec4(color, vA); }',
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.count = 0; this.t = new THREE.Vector3(); this.b = new THREE.Vector3();
    scene.add(this.mesh);
  }

  update(view, active, heavy) {
    view.tip.getWorldPosition(this.t); view.base.getWorldPosition(this.b);
    if (active) {
      // Shift older samples back and put the newest pair at the front.
      this.pos.copyWithin(6, 0, (SEG - 1) * 6);
      this.pos.set([this.t.x, this.t.y, this.t.z, this.b.x, this.b.y, this.b.z], 0);
      this.count = Math.min(SEG, this.count + 1);
      this.mat.uniforms.color.value.set(heavy ? 0xff8a3c : 0xffffff);
    } else if (this.count > 0) {
      this.pos.copyWithin(6, 0, (SEG - 1) * 6);
      this.count -= 1;
    }
    for (let i = 0; i < SEG; i++) {
      const a = i < this.count ? (1 - i / this.count) * 0.4 : 0;
      this.alpha[i * 2] = a; this.alpha[i * 2 + 1] = a * 0.2;
      // Unused tail segments collapse onto the last valid sample so they draw nothing.
      if (i >= this.count && i > 0) this.pos.copyWithin(i * 6, (i - 1) * 6, i * 6);
    }
    this.mesh.visible = this.count > 1;
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.alpha.needsUpdate = true;
  }
}

export class Shake {
  constructor() { this.amount = 0; this.offset = new THREE.Vector3(); }
  add(v) { this.amount = Math.min(1.2, this.amount + v); }
  update(dt) {
    this.amount = Math.max(0, this.amount - dt * 2.6);
    const a = this.amount * this.amount * 0.35;
    this.offset.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
  }
}
