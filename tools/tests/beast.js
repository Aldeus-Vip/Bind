const { chromium } = require('playwright');
(async()=>{
const b = await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage({viewport:{width:1400,height:900}, deviceScaleFactor:2}); const errs=[]; p.on('pageerror',e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1]));
await p.goto(await require('../serve').url()); await p.waitForTimeout(1000);
const setup = (a,b2)=>p.evaluate(([a,b2])=>{ initGame(false);
  state.players[0].personalCard=a; state.players[0].personalIndex=11; state.floor[11].owner=0;
  state.players[1].personalCard=b2; state.players[1].personalIndex=8; state.floor[8].owner=1;
  state.phase='hand-effect'; state.current=0; render(); }, [a,b2]);
const clip = async()=> p.evaluate(()=>{ const r=document.getElementById('floor-cell-6').getBoundingClientRect(), q=document.getElementById('floor-cell-13').getBoundingClientRect(); return {x:r.left-40, y:r.top-140, width:(q.right-r.left)+80, height:(q.bottom-r.top)+160}; });
await setup({suit:'H',rank:1,id:'H1'},{suit:'S',rank:1,id:'S1'}); await p.waitForTimeout(1500); let c=await clip(); await p.screenshot({path:'b1.png', clip:c});
await setup({suit:'D',rank:1,id:'D1'},{suit:'C',rank:1,id:'C1'}); await p.waitForTimeout(1500); c=await clip(); await p.screenshot({path:'b2.png', clip:c});
// CHANGE: caster -> beast
await setup({suit:'H',rank:5,id:'H5'},{suit:'S',rank:9,id:'S9'}); await p.waitForTimeout(1200); c=await clip();
await p.evaluate(()=>{ triggerChangeFlip(11, state.players[0].personalCard, {suit:'D',rank:1,id:'D1'}, 0); });
await p.waitForTimeout(450); await p.screenshot({path:'b3.png', clip:c});
await p.waitForTimeout(500); await p.screenshot({path:'b4.png', clip:c});
// raise pose
await p.evaluate(()=>{ state.players[0].personalCard={suit:'D',rank:1,id:'D1'}; render(); window.__s = triggerSuitEffect('D',0); });
await p.waitForTimeout(800); await p.screenshot({path:'b5.png', clip:c});
console.log(errs.join('\n')||'no errors'); await b.close();})();
