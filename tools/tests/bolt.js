const { chromium } = require('playwright');
(async()=>{
const b = await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage({viewport:{width:1400,height:900}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1]));
await p.goto(await require('../serve').url()); await p.waitForTimeout(1000);
await p.evaluate(()=>{ initGame(false);
  state.players[0].personalCard={suit:'D',rank:5,id:'D5'}; state.players[0].personalIndex=16; state.floor[16].owner=0;
  state.players[1].personalCard={suit:'S',rank:9,id:'S9'}; state.players[1].personalIndex=7; state.floor[7].owner=1;
  state.phase='hand-effect'; state.current=0; render(); });
await p.waitForTimeout(1200);
const clip = await p.evaluate(()=>{ const x=document.getElementById('floor-grid-el').getBoundingClientRect(); return {x:x.left+60,y:x.top-40,width:x.width-120,height:x.height*0.75}; });
await p.evaluate(()=>{ window.__e = triggerNumberEffect(8, 0, 0); });
await p.waitForFunction(()=>state.task && state.task.tag==='8-target-floor', null, {timeout:5000});
await p.evaluate(()=>{ resolveTask(7); });
for(const [n,ms] of [['l1.png',380],['l2.png',140],['l3.png',300]]){ await p.waitForTimeout(ms); await p.screenshot({path:n, clip}); }
await p.waitForTimeout(2500);
console.log(await p.evaluate(()=>'anim'+animationsInFlight+' bound1='+state.players[1].bound));
console.log(errs.join('\n')||'no errors'); await b.close();})();
