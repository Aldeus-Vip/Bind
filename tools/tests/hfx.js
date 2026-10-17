const { chromium } = require('playwright');
(async()=>{
const b = await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage({viewport:{width:1400,height:900}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1])); p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errs.push(m.text()); });
await p.goto(await require('../serve').url()); await p.waitForTimeout(1000);
await p.evaluate(()=>{ initGame(false);
  state.players[0].personalCard={suit:'D',rank:5,id:'D5'}; state.players[0].personalIndex=16; state.floor[16].owner=0;
  state.players[1].personalCard={suit:'S',rank:9,id:'S9'}; state.players[1].personalIndex=3; state.floor[3].owner=1;
  state.players[0].discard=[{suit:'H',rank:9,id:'H9'}]; state.phase='hand-effect'; state.current=0; render(); });
await p.waitForTimeout(1200);
const shots = [
  ['h_3.png', ()=>triggerVortexDrawCardAppear(0,''), 500],
  ['h_5.png', ()=>triggerGreenVortexSteal(1,0,0), 330],
  ['h_9.png', ()=>triggerDiscardPillarRise(0,0,[{suit:'H',rank:9,id:'H9'}]), 750],
  ['h_10.png', ()=>triggerRedPurpleHandRise(1,0,{suit:'C',rank:7,id:'C7'}), 450],
  ['h_J.png', ()=>triggerBlackMistHandAppear(0,{suit:'S',rank:11,id:'S11'}), 450],
  ['h_Q.png', ()=>triggerHandWipeNebula(1), 520],
];
for(const [n,f,ms] of shots){ await p.evaluate(`(${f.toString()})()`); await p.waitForTimeout(ms); await p.screenshot({path:n}); await p.waitForTimeout(2600); }
console.log(await p.evaluate(()=>'anim'+animationsInFlight));
console.log(errs.join('\n')||'no errors'); await b.close();})();
