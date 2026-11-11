import { createWorld, stepWorld } from '/home/claude/the-duel/src/sim.js';
import { createAI, thinkAI } from '/home/claude/the-duel/src/ai.js';
const OBS = (await import('fs')).readFileSync('/home/claude/the-duel/src/arena.js','utf8');
const m = OBS.match(/const OBSTACLES = (\[[\s\S]*?\n\]);/)[1];
const obstacles = eval(m);
const arena = { R:26, obstacles, spawns:[{x:0,z:-17,yaw:0},{x:0,z:17,yaw:Math.PI}] };
for (const [la, lb] of [['normal','normal'],['hard','easy'],['normal','easy'],['hard','normal'],['hard','hard']]) {
  let wins=[0,0], ticks=0, ev={};
  for (let g=0; g<20; g++) {
    const w = createWorld(arena, {maxHp:100,maxStam:100,power:1,armor:0.1,speed:4.4,reach:0,weapon:'sword',skill:'sunburst'}, {maxHp:100,maxStam:100,power:1,armor:0.1,speed:4.4,reach:0,weapon:'sword',skill:'rush'}); const a=createAI(la, g*7+1), b=createAI(lb, g*13+5);
    let n=0;
    while (w.phase!=='over' && n<60*60*8) { stepWorld(w,[thinkAI(a,w,0),thinkAI(b,w,1)]); for(const e of w.events) ev[e.type]=(ev[e.type]||0)+1; w.events.length=0; n++;
      for (const f of w.fighters) if (!isFinite(f.x)||!isFinite(f.z)) throw new Error('NaN'); }
    if (w.matchWinner>=0) wins[w.matchWinner]++; ticks+=n;
  }
  console.log(la,'vs',lb,'wins',wins,'avg match s',(ticks/20/60).toFixed(0), JSON.stringify(ev));
}
