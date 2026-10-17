const { chromium } = require('playwright');
(async()=>{
const b = await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage({viewport:{width:1400,height:900}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1])); p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errs.push(m.text()); });
await p.goto(await require('../serve').url()); await p.waitForTimeout(1000);
await p.evaluate(()=>{ initGame(false);
  state.players[0].personalCard={suit:'D',rank:5,id:'D5'}; state.players[0].personalIndex=16; state.floor[16].owner=0;
  state.players[1].personalCard={suit:'S',rank:9,id:'S9'}; state.players[1].personalIndex=7; state.floor[7].owner=1;
  state.phase='hand-effect'; state.current=0; render(); });
await p.waitForTimeout(1200);
const clip = await p.evaluate(()=>{ const x=document.getElementById('floor-grid-el').getBoundingClientRect(); return {x:x.left,y:x.top-40,width:x.width,height:x.height+40}; });
const snap = async (n, ms) => { await p.waitForTimeout(ms); await p.screenshot({path:n, clip}); };
// 8: summon dragon + strike P2
await p.evaluate(()=>{ window.__e = triggerNumberEffect(8, 0, 0); });
await snap('n1.png', 900);
await p.evaluate(()=>{ resolveTask(7); });
await snap('n2.png', 700); await snap('n3.png', 250);
await p.waitForTimeout(2500);
// K hammer
await p.evaluate(()=>{ triggerKDestroy(12); });
await snap('n4.png', 330); await snap('n5.png', 250);
await p.waitForTimeout(2000);
// 6 whirlpool, 7 tornado, 2 summon circle
await p.evaluate(()=>{ triggerWhirlpoolDrain(3); triggerTornadoAppear(10); triggerSummon2RiseAndReveal(18); });
await snap('n6.png', 600);
await p.waitForTimeout(3000);
console.log(await p.evaluate(()=>'anim'+animationsInFlight+' bound1='+state.players[1].bound));
console.log(errs.join('\n')||'no errors'); await b.close();})();
