// input.js — touch (and keyboard for desktop testing) turned into one command per tick.
// Left side of the screen is a floating joystick, the right side drags the camera,
// and the action buttons sit under the right thumb.

const SPRINT_HOLD = 0.24;

export class Input {
  constructor() {
    this.joyX = 0; this.joyY = 0;       // -1..1, y is "forward"
    this.lookX = 0; this.lookY = 0;     // camera drag accumulated since last read, in pixels
    this.atkDown = false; this.dodgeHeld = 0; this.dodgeDown = false;
    this.pressed = { atk: false, up: false, parry: false, dodge: false, skill: false };
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

    this.attackButton($('btn-atk'));
    this.button($('btn-up'), () => { this.pressed.up = true; });
    this.button($('btn-parry'), () => { this.pressed.parry = true; });
    this.button($('btn-skill'), () => { this.pressed.skill = true; });
    this.button($('btn-dodge'), () => { this.pressed.dodge = true; this.dodgeDown = true; this.dodgeHeld = 0; }, () => { this.dodgeDown = false; });
    this.button($('btn-lock'), () => this.onLock());
    this.button($('btn-pause'), () => this.onPause());

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      if (k === 'KeyJ') this.pressed.atk = true;
      if (k === 'KeyK') this.pressed.up = true;
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

  // The main attack button, as in Naraka Mobile: tap to attack, hold to charge,
  // and flick it up for the uppercut, left to parry or right to dodge.
  attackButton(el) {
    const FLICK = 26, HOLD_MS = 100;
    let id = null, x0 = 0, y0 = 0, timer = 0, sent = false;
    const press = () => { if (!sent && this.enabled) { sent = true; this.pressed.atk = true; this.atkDown = true; } };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      el.setPointerCapture?.(e.pointerId);
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; sent = false;
      el.classList.add('down');
      // Wait a moment before committing to an attack, in case this turns out to be a flick.
      timer = setTimeout(press, HOLD_MS);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id || sent) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.hypot(dx, dy) < FLICK) return;
      clearTimeout(timer); sent = true;                 // a flick replaces the attack
      if (!this.enabled) return;
      if (Math.abs(dy) > Math.abs(dx)) { if (dy < 0) this.pressed.up = true; }
      else if (dx < 0) this.pressed.parry = true;
      else this.pressed.dodge = true;
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      e.stopPropagation(); clearTimeout(timer);
      press();                                          // a quick tap that never reached the hold time
      id = null; this.atkDown = false; el.classList.remove('down');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  button(el, onDown, onUp) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      el.setPointerCapture?.(e.pointerId);
      el.classList.add('down');
      if (this.enabled || el.id === 'btn-pause') onDown();
    });
    const release = (e) => { e.stopPropagation(); el.classList.remove('down'); onUp?.(); };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }

  down(e) {
    e.preventDefault();
    this.touch.setPointerCapture?.(e.pointerId);
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
    this.atkDown = false; this.dodgeDown = false; this.dodgeHeld = 0;
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
      atk: this.pressed.atk, up: this.pressed.up, parry: this.pressed.parry, dodge: this.pressed.dodge, skill: this.pressed.skill,
      atkHold: this.atkDown || k.has('KeyJ'),
      sprint: this.dodgeDown && this.dodgeHeld > SPRINT_HOLD,
    };
    for (const key in this.pressed) this.pressed[key] = false;
    return cmd;
  }
}
