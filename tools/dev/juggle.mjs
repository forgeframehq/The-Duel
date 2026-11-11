import { createWorld, stepWorld, EMPTY_CMD } from '/home/claude/the-duel/src/sim.js';
const st = (weapon, skill) => ({maxHp:100,maxStam:100,power:1,armor:0,speed:4.4,reach:0,weapon,skill});
const w = createWorld({R:19,obstacles:[],spawns:[{x:0,z:-1.2,yaw:0},{x:0,z:1.0,yaw:Math.PI}]}, st('sword','sunburst'), st('sword','rush'));
while (w.phase!=='fight') stepWorld(w,[EMPTY_CMD,EMPTY_CMD]);
w.events.length=0; const log=[];
const run=(n,cmdf)=>{ for(let i=0;i<n;i++){ stepWorld(w,[cmdf(i),EMPTY_CMD]); for(const e of w.events) if(e.type==='hit'||e.type==='land') log.push((w.tick/60).toFixed(2)+' '+e.type+(e.launch?' LAUNCH':'')+(e.air?' air':'')+(e.slam?' SLAM':'')+(e.dmg?' '+e.dmg.toFixed(0):'')); w.events.length=0; } };
// two normals, launch, then mash attack
run(1,()=>({...EMPTY_CMD,atk:true,faceYaw:0})); run(20,()=>({...EMPTY_CMD,atk:true,faceYaw:0})); run(40,()=>({...EMPTY_CMD,faceYaw:0}));
run(60,(i)=>({...EMPTY_CMD,up:i<30,faceYaw:0}));
run(200,(i)=>({...EMPTY_CMD,atk:i%8===0,faceYaw:0}));
console.log(log.join('\n')); console.log('enemy', w.fighters[1].state, Math.round(w.fighters[1].hp));
