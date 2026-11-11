import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import sharp from 'sharp';
const ids = process.argv.slice(2);
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
const p = await b.newPage({ viewport:{width:480,height:600} });
p.on('pageerror',e=>console.log('PAGEERR '+e.message)); p.on('console',m=>{ if(m.type()==='error') console.log('ERR',m.text()); });
for (const id of ids) {
  await p.goto('http://localhost:8765/tools/portrait.html?id='+id); await p.waitForFunction(()=>window.ready,null,{timeout:90000});
  const png = await p.screenshot({ omitBackground:true });
  await sharp(png).resize(360,450).webp({quality:86}).toFile(`/home/claude/the-duel/assets/portraits/${id}.webp`);
  console.log(id,'ok');
}
await b.close();
