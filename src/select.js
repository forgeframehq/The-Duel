// select.js — the character select screen: pick your fighter, your rival, the difficulty and the arena.
import { ROSTER, STAT_BARS, byId } from './roster.js';
import { weaponOf } from './weapons.js';
import { skillOf } from './skills.js';

const $ = (id) => document.getElementById(id);
const PORTRAITS = new URL('../assets/portraits/', import.meta.url).href;

export function initSelect({ onGo, onBack, onShow }) {
  const picks = { you: ROSTER[0].id, rival: 'random', level: 'normal', arena: 'meadow' };
  try { const saved = localStorage.getItem('duel.arena2'); if (['meadow', 'courtyard', 'field'].includes(saved)) picks.arena = saved; } catch { /* storage unavailable */ }
  let side = 'you', shown = picks.you;
  const roster = $('roster'), TILES = 15;

  // The right-hand side says who the fighter is; the fighter stands in the arena in the middle (main.js, via onShow).
  function detail(id) {
    shown = id;
    onShow?.(id, side);
    $('stage-mark').textContent = id === 'random' ? '?' : '';
    if (id === 'random') {
      $('d-origin').textContent = 'Rival'; $('d-name').textContent = 'Random';
      $('d-blurb').textContent = 'Face whoever steps into the ring. A different rival every match.';
      $('d-kit').innerHTML = ''; $('d-stats').innerHTML = '';
      return;
    }
    const f = byId(id);
    $('d-origin').textContent = f.origin;
    $('d-name').textContent = f.name; $('d-blurb').textContent = f.blurb;
    $('d-kit').innerHTML = `<span><b>Weapon</b>${weaponOf(f.weapon).label}</span><span><b>Special</b>${skillOf(f.skill).name}</span>`;
    $('d-stats').innerHTML = STAT_BARS.map(([label, key, lo, hi]) => {
      const pct = Math.round(Math.max(0.04, Math.min(1, (f.stats[key] - lo) / (hi - lo))) * 100);
      return `<span>${label}</span><div><i style="width:${pct}%"></i></div>`;
    }).join('');
  }

  function render() {
    const list = side === 'rival' ? [{ id: 'random', name: 'Random' }, ...ROSTER] : ROSTER;
    roster.innerHTML = '';
    for (const f of list) {
      const b = document.createElement('button');
      b.className = 'card' + (f.id === 'random' ? ' random' : '') + (picks[side] === f.id ? ' on' : '');
      b.innerHTML = (f.id === 'random' ? '<i>?</i>' : `<img src="${PORTRAITS}${f.id}.webp" alt="">`) + `<b>${f.short || f.name}</b>`
        + (picks.you === f.id ? '<span class="tag you">YOU</span>' : '') + (picks.rival === f.id ? '<span class="tag rival">RIVAL</span>' : '');
      b.addEventListener('click', () => { picks[side] = f.id; render(); detail(f.id); });
      roster.appendChild(b);
    }
    // Empty places for the fighters still to come.
    for (let i = list.length; i < TILES; i++) { const d = document.createElement('div'); d.className = 'card locked'; d.innerHTML = '<i>?</i>'; roster.appendChild(d); }
    $('sel-title').textContent = side === 'you' ? 'Choose your fighter' : 'Choose your rival';
    document.querySelectorAll('.tabs button').forEach((t) => t.classList.toggle('on', t.dataset.side === side));
  }

  document.querySelectorAll('.tabs button').forEach((t) => t.addEventListener('click', () => { side = t.dataset.side; render(); detail(picks[side]); }));
  document.querySelectorAll('.levels button').forEach((b) => b.addEventListener('click', () => {
    picks.level = b.dataset.level;
    document.querySelectorAll('.levels button').forEach((x) => x.classList.toggle('on', x === b));
  }));
  const showArena = () => document.querySelectorAll('.arenas button').forEach((x) => x.classList.toggle('on', x.dataset.arena === picks.arena));
  document.querySelectorAll('.arenas button').forEach((b) => b.addEventListener('click', () => {
    picks.arena = b.dataset.arena; showArena(); onShow?.(shown, side);
    try { localStorage.setItem('duel.arena2', picks.arena); } catch { /* storage unavailable */ }
  }));
  showArena();
  $('sel-back').addEventListener('click', () => { $('select').classList.add('hidden'); onBack(); });
  $('go').addEventListener('click', () => onGo(picks));

  return {
    open() { side = 'you'; render(); detail(picks.you); $('go').disabled = false; $('go').textContent = 'TO BATTLE'; $('select').classList.remove('hidden'); },
    close() { $('select').classList.add('hidden'); },
    busy(text) { $('go').disabled = true; $('go').textContent = text; },
    picks,
  };
}

// Resolves "random" to a real fighter, avoiding a mirror match when it can.
export function resolveRival(picks) {
  if (picks.rival !== 'random') return picks.rival;
  const pool = ROSTER.filter((f) => f.id !== picks.you);
  return pool[Math.floor(Math.random() * pool.length)].id;
}
