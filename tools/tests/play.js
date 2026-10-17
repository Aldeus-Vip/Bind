const { chromium } = require('playwright');
(async()=>{
const b = await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p = await b.newPage({viewport:{width:1400,height:900}});
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERR '+e.message+' '+(e.stack||'').split('\n').slice(1,3).join(' | '))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push('CONSOLE '+m.text()); });
await p.goto(await require('../serve').url()); await p.waitForTimeout(1200);
await p.evaluate(()=>{ initGame(true,'easy',false); setupChooseHandCard(0); });
await p.waitForTimeout(500);
await p.screenshot({path:'s0.png'});
// real mouse click on bottom-middle cell (index 17)
const box = await p.evaluate(()=>{ const r=document.getElementById('floor-cell-17').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; });
await p.mouse.move(box.x, box.y); await p.waitForTimeout(300); await p.mouse.click(box.x, box.y);
await p.waitForTimeout(400);
console.log('after click P0@', await p.evaluate(()=>state.players[0].personalIndex));
await p.evaluate(()=>{ setInterval(()=>{ if(state && !state.gameOver){ state.cpuIndex = state.phase==='setup-personal' ? state.setupPlayer : state.current; if(!cpuTimer && !cpuActionInProgress) cpuMaybeAct(); } }, 250); });
let shot=0;
for(let k=0;k<36;k++){ await p.waitForTimeout(2500);
  const info = await p.evaluate(()=>state? (state.gameOver?'OVER '+state.winnerMsg : state.phase+' cur'+state.current+' P0@'+state.players[0].personalIndex+' P1@'+state.players[1].personalIndex+' anim'+animationsInFlight) : 'nostate');
  if(k%5===1 && shot<7) await p.screenshot({path:`p${shot++}.png`});
  console.log(k, info); if(info.startsWith('OVER')){ await p.screenshot({path:'over.png'}); await p.evaluate(()=>{ initGame(true,'easy',false); }); }
}
console.log(errs.slice(0,20).join('\n')||'no errors'); await b.close();})();
