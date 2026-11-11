// input.js — touch (and keyboard for desktop testing) turned into one command per tick.
// Left side of the screen is a floating joystick, the right side drags the camera,
// and the action buttons sit under the right thumb. Keyboard: WASD move, J horizontal, K vertical,
// L parry, I special, Space dodge, Q lock, C camera.

const SPRINT_HOLD = 0.24;

export class Input {
  constructor() {
    this.joyX = 0; this.joyY = 0;       // -1..1, y is "forward"
    this.lookX = 0; this.lookY = 0;     // camera drag accumulated since last read, in pixels
    this.hDown = false; this.vDown = false; this.dodgeHeld = 0; this.dodgeDown = false;
    this.pressed = { h: false, v: false, parry: false, dodge: false, skill: false };
    this.onLock = () => {}; this.onPause = () => {};
    this.keys = new Set();
    this.enabled = false;

    const $ = (id) => document.getElementById(id);
    this.stick = $('stick'); this.knob = $('knob'); this.touch = $('touch');
    this.joyId = null; this.lookId = null; this.joyOrigin = { x: 0, y: 0 }; this.lookLast = { x: 0, y: 0 };

    const t = this.touch;
    t.addEventListener('pointerdown', (e) => this.down(e));
    t.addEventListener('pointermove', (e) => this.move(e));
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) t.addEventListener(ev, (e) => this.up(e));

    // Two attack buttons: tap for a normal attack, keep holding to charge it.
    this.button($('btn-h'), () => { this.pressed.h = true; this.hDown = true; }, () => { this.hDown = false; });
    this.button($('btn-v'), () => { this.pressed.v = true; this.vDown = true; }, () => { this.vDown = false; });
    this.button($('btn-parry'), () => { this.pressed.parry = true; });
    this.button($('btn-skill'), () => { this.pressed.skill = true; });
    this.button($('btn-dodge'), () => { this.pressed.dodge = true; this.dodgeDown = true; this.dodgeHeld = 0; }, () => { this.dodgeDown = false; });
    this.button($('btn-lock'), () => this.onLock());
    this.button($('btn-pause'), () => this.onPause());

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      if (k === 'KeyJ') this.pressed.h = true;
      if (k === 'KeyK') this.pressed.v = true;
      if (k === 'KeyL') this.pressed.parry = true;
      if (k === 'KeyI') this.pressed.skill = true;
      if (k === 'Space') { this.pressed.dodge = true; this.dodgeDown = true; this.dodgeHeld = 0; e.preventDefault(); }
      if (k === 'KeyQ') this.onLock();
      if (k === 'Escape' || k === 'KeyP') this.onPause();
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'Space') this.dodgeDown = false; });
    addEventListener('blur', () => { this.keys.clear(); this.reset(); });
    addEventListener('contextmenu', (e) => e.preventDefault());
  }

  button(el, onDown, onUp) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      try { el.setPointerCapture?.(e.pointerId); } catch { /* the pointer has already gone */ }
      el.classList.add('down');
      if (this.enabled || el.id === 'btn-pause') onDown();
    });
    const release = (e) => { e.stopPropagation(); el.classList.remove('down'); onUp?.(); };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }

  down(e) {
    e.preventDefault();
    try { this.touch.setPointerCapture?.(e.pointerId); } catch { /* the pointer has already gone */ }
    const leftSide = e.clientX < innerWidth * 0.45 && e.pointerType !== 'mouse';
    if (leftSide && this.joyId === null) {
      this.joyId = e.pointerId; this.joyOrigin = { x: e.clientX, y: e.clientY };
      this.stick.style.left = e.clientX + 'px'; this.stick.style.top = e.clientY + 'px';
      this.stick.classList.add('live');
    } else if (this.lookId === null) {
      this.lookId = e.pointerId; this.lookLast = { x: e.clientX, y: e.clientY };
    }
  }

  move(e) {
    if (e.pointerId === this.joyId) {
      const max = this.stick.offsetWidth * 0.42;
      let dx = e.clientX - this.joyOrigin.x, dy = e.clientY - this.joyOrigin.y;
      const d = Math.hypot(dx, dy);
      if (d > max) { dx *= max / d; dy *= max / d; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const dead = 0.12, m = Math.min(1, d / max);
      const s = m < dead ? 0 : (m - dead) / (1 - dead) / (m || 1);
      this.joyX = (dx / max) * s; this.joyY = (-dy / max) * s;
    } else if (e.pointerId === this.lookId) {
      this.lookX += e.clientX - this.lookLast.x; this.lookY += e.clientY - this.lookLast.y;
      this.lookLast = { x: e.clientX, y: e.clientY };
    }
  }

  up(e) {
    if (e.pointerId === this.joyId) {
      this.joyId = null; this.joyX = this.joyY = 0;
      this.knob.style.transform = ''; this.stick.style.left = ''; this.stick.style.top = '';
      this.stick.classList.remove('live');
    } else if (e.pointerId === this.lookId) this.lookId = null;
  }

  reset() {
    this.hDown = false; this.vDown = false; this.dodgeDown = false; this.dodgeHeld = 0;
    for (const key in this.pressed) this.pressed[key] = false;
    this.lookX = this.lookY = 0;
  }

  takeLook() { const r = [this.lookX, this.lookY]; this.lookX = this.lookY = 0; return r; }

  // Builds the command for one simulation tick. `camYaw` makes the stick camera-relative.
  sample(camYaw, faceYaw, dt) {
    let jx = this.joyX, jy = this.joyY;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) jx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) jx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) jy += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) jy -= 1;
    const m = Math.hypot(jx, jy);
    if (m > 1) { jx /= m; jy /= m; }
    if (this.dodgeDown) this.dodgeHeld += dt;

    const s = Math.sin(camYaw), c = Math.cos(camYaw);
    const cmd = {
      mx: s * jy - c * jx, mz: c * jy + s * jx, faceYaw,
      h: this.pressed.h, v: this.pressed.v, parry: this.pressed.parry, dodge: this.pressed.dodge, skill: this.pressed.skill,
      hHold: this.hDown || k.has('KeyJ'), vHold: this.vDown || k.has('KeyK'),
      sprint: this.dodgeDown && this.dodgeHeld > SPRINT_HOLD,
    };
    for (const key in this.pressed) this.pressed[key] = false;
    return cmd;
  }
}
