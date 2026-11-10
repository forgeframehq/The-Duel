// audio.js — all sound is synthesised, so there are no audio files to download.
let ctx = null, master = null, noiseBuf = null;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
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

export const sfx = {
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

export function buzz(ms) { if (navigator.vibrate) { try { navigator.vibrate(ms); } catch { /* not supported */ } } }
