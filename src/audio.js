// audio.js — recorded sound effects (generated with ElevenLabs, in assets/sfx), with a synthesised
// fallback for each so the game is never silent if a file has not loaded yet.
let ctx = null, master = null, noiseBuf = null;

const SFX_URL = new URL('../assets/sfx/', import.meta.url).href;
const NAMES = ['swing1', 'swing2', 'swing_heavy', 'hit1', 'hit2', 'hit_heavy', 'block1', 'block2', 'parry', 'guard_break', 'dodge', 'death',
  'exhausted', 'horn', 'gong', 'ui_tap', 'ui_select', 'ui_back', 'ui_start', 'victory_hit'];
// Files are fetched straight away; they can only be decoded once the player's first tap has unlocked audio.
const raw = {}, buffers = {};
for (const n of NAMES) raw[n] = fetch(SFX_URL + n + '.mp3').then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
function decodeAll() {
  for (const n of NAMES) raw[n].then((data) => data && ctx.decodeAudioData(data)).then((buf) => { if (buf) buffers[n] = buf; }).catch(() => {});
}

// Plays a recorded sound. Returns false if it is not ready, so the caller can fall back to the synth.
function play(name, gain = 1, vary = 0.06, rate = 1) {
  const buf = ctx && buffers[name];
  if (!buf) return false;
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buf; src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * vary);
  g.gain.value = gain;
  src.connect(g).connect(master); src.start();
  return true;
}
const pick = (...names) => names[Math.floor(Math.random() * names.length)];

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    decodeAll();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function env(gain, t, peak, attack, decay) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function noise(peak, decay, type, f0, f1, q = 1, attack = 0.005) {
  if (!ctx) return;
  const t = ctx.currentTime, src = ctx.createBufferSource(), filt = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf; src.loop = true;
  filt.type = type; filt.Q.value = q;
  filt.frequency.setValueAtTime(f0, t); filt.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
  env(g, t, peak, attack, decay);
  src.connect(filt).connect(g).connect(master);
  src.start(t, Math.random() * 0.5); src.stop(t + attack + decay + 0.05);
}

function tone(freq, peak, decay, type = 'sine', slide = 1, attack = 0.003) {
  if (!ctx) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, t + attack + decay);
  env(g, t, peak, attack, decay);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + attack + decay + 0.05);
}

const synth = {
  swing(heavy) { noise(heavy ? 0.5 : 0.3, heavy ? 0.28 : 0.16, 'bandpass', heavy ? 500 : 900, heavy ? 2400 : 3200, 1.2, 0.03); },
  hit(heavy) {
    noise(heavy ? 0.9 : 0.6, 0.12, 'lowpass', 1800, 300);
    tone(heavy ? 95 : 130, heavy ? 0.9 : 0.6, heavy ? 0.28 : 0.16, 'sine', 0.45);
    if (heavy) tone(60, 0.7, 0.35, 'sine', 0.5);
  },
  block() {
    for (const f of [520, 1310, 2140, 3170]) tone(f * (0.97 + Math.random() * 0.06), 0.16, 0.22, 'square', 0.98);
    noise(0.5, 0.07, 'highpass', 2500, 6000);
    tone(140, 0.4, 0.1, 'sine', 0.6);
  },
  parry() {
    for (const f of [1180, 1770, 2960, 4420]) tone(f, 0.17, 0.75, 'sine', 1.0);
    noise(0.5, 0.05, 'highpass', 4000, 8000);
  },
  guardBreak() { this.block(); tone(80, 0.9, 0.4, 'sawtooth', 0.4); },
  dodge() { noise(0.22, 0.2, 'bandpass', 400, 1400, 0.8, 0.04); },
  death() { tone(110, 0.8, 0.9, 'sawtooth', 0.3); noise(0.6, 0.5, 'lowpass', 900, 120); },
  gong() { for (const f of [98, 147, 196, 294.5, 412]) tone(f, 0.22, 2.2, 'sine', 0.995); noise(0.25, 0.3, 'lowpass', 1200, 200); },
  horn() { for (const f of [146.8, 220, 293.7]) tone(f, 0.16, 0.9, 'sawtooth', 1, 0.12); },
  tick() { tone(880, 0.12, 0.06, 'square'); },
};


export const sfx = {
  swing(heavy) { if (!play(heavy ? 'swing_heavy' : pick('swing1', 'swing2'), heavy ? 0.6 : 0.45, 0.1)) synth.swing(heavy); },
  hit(heavy) { if (!play(heavy ? 'hit_heavy' : pick('hit1', 'hit2'), heavy ? 1 : 0.85, 0.08)) synth.hit(heavy); },
  block() { if (!play(pick('block1', 'block2'), 0.8, 0.08)) synth.block(); },
  parry() { if (!play('parry', 0.9, 0.04)) synth.parry(); },
  guardBreak() { if (!play('guard_break', 0.95, 0.05)) synth.guardBreak(); },
  dodge() { if (!play('dodge', 0.5, 0.1)) synth.dodge(); },
  death() { if (!play('death', 0.9, 0.04)) synth.death(); },
  winded() { play('exhausted', 0.55, 0.05); },
  gong() { if (!play('gong', 0.7, 0)) synth.gong(); },
  horn() { if (!play('horn', 0.55, 0)) synth.horn(); },
  victory() { play('victory_hit', 0.7, 0); },
  tick() { synth.tick(); },
  charge() { tone(180, 0.18, 0.5, 'sawtooth', 2.6, 0.2); },
  // Menu sounds: 'tap', 'select', 'back' or 'start'.
  ui(kind) { play('ui_' + kind, kind === 'start' ? 0.7 : 0.5, 0.03); },
};

export function buzz(ms) { if (navigator.vibrate) { try { navigator.vibrate(ms); } catch { /* not supported */ } } }
