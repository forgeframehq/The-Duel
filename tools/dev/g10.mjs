import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const out = process.argv[2];
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'] });
const p = await b.newPage({ viewport:{width:844,height:390}, deviceScaleFactor:1, hasTouch:true, isMobile:true });
const errs=[]; p.on('console',m=>{ if(m.type()==='error' && !m.text().includes('ERR_FAILED') && !m.text().includes('404')) errs.push(m.text()); }); p.on('pageerror',e=>errs.push('PAGEERR '+e.message));
await p.route('**/fonts.g*/**', r => r.abort());
await p.goto('http://localhost:8765/index.html?arena=field'); await p.waitForTimeout(6000);
await p.evaluate(()=>document.getElementById('start').click()); await p.waitForTimeout(800);
await p.evaluate(()=>{document.querySelector('.tabs button[data-side=rival]').click(); document.querySelector('#roster .card:nth-child(3)').click(); document.getElementById('go').click();});
await p.waitForFunction(()=>window.__duel.world.phase==='fight' && window.__duel.views.length===2,null,{timeout:180000});
await p.evaluate(()=>{ const w=window.__duel.world; window.__seen={}; const orig=w.events.push.bind(w.events); w.events.push=(e)=>{ const k=e.type+(e.launch?'+launch':'')+(e.air?'+air':'')+(e.slam?'+slam':'')+(e.riposte?'+riposte':''); window.__seen[k]=(window.__seen[k]||0)+1; return orig(e);}; });
const setup = (enemy) => p.evaluate((enemy)=>{ const w=window.__duel.world; Object.assign(w.fighters[0],{x:0,z:-1.4,yaw:0,hp:112,stam:85,state:'idle',t:0,winded:0,combo:0}); Object.assign(w.fighters[1],{x:0,z:0.9,yaw:Math.PI,hp:100,stam:110,winded:0,skillCd:99,...enemy}); }, enemy);
const key = async (k, ms=60) => { await p.keyboard.down(k); await p.waitForTimeout(ms); await p.keyboard.up(k); };
// launch then air hits (the test browser is slow, so game time runs behind real time; waits are generous)
await setup({state:'stagger',t:0,staggerDur:9}); await key('KeyK'); await p.waitForTimeout(2500); await p.screenshot({path:out+'/r_air.png'});
for (let i=0;i<3;i++){ await key('KeyJ'); await p.waitForTimeout(1500); }
await p.waitForTimeout(3000); await p.screenshot({path:out+'/r_down.png'});
// special
await setup({state:'stagger',t:0,staggerDur:9}); await key('KeyI'); await p.waitForTimeout(3500); await p.screenshot({path:out+'/r_skill.png'}); await p.waitForTimeout(4000);
// parry an enemy charged strike
await setup({state:'charge',charge:'h',t:0}); await p.waitForTimeout(600); await key('KeyL'); await p.waitForTimeout(3000); await p.screenshot({path:out+'/r_parry.png'}); await p.waitForTimeout(3000);
console.log(JSON.stringify(await p.evaluate(()=>({seen:window.__seen, f:window.__duel.world.fighters.map(f=>({hp:Math.round(f.hp),st:f.state}))}))));
console.log('errors:',errs.slice(0,6).join('\n')||'none');
await b.close();
