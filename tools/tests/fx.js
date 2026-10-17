const { chromium } = require('playwright');
(async()=>{
const b = await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage({viewport:{width:1400,height:900}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1])); p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errs.push(m.text()); });
await p.goto(await require('../serve').url()); await p.waitForTimeout(1000);
await p.evaluate(()=>{ initGame(false);
  state.players[0].personalCard={suit:'H',rank:5,id:'H5'}; state.players[0].personalIndex=17; state.floor[17].owner=0; state.floor[17].card={suit:'C',rank:2,id:'C2'};
  state.players[1].personalCard={suit:'S',rank:9,id:'S9'}; state.players[1].personalIndex=2; state.floor[2].owner=1;
  state.floor[6]=null; state.phase='hand-effect'; state.current=0; render(); });
await p.waitForTimeout(800);
const clip = await p.evaluate(()=>{ const x=document.getElementById('floor-grid-el').getBoundingClientRect(); return {x:x.left,y:x.top-60,width:x.width,height:x.height+60}; });
const snap = async (name, ms) => { await p.waitForTimeout(ms); await p.screenshot({path:name, clip}); };
// 共通: 術式発動 + ♥
await p.evaluate(()=>{ window.__h = triggerSuitEffect('H',0); });
await snap('fx_cast.png', 450);
await p.waitForTimeout(500);
await p.evaluate(()=>{ resolveTask(12); });
await snap('fx_h1.png', 700); await snap('fx_h2.png', 450); await snap('fx_h3.png', 700);
await p.waitForTimeout(1500);
// ♦
await p.evaluate(()=>{ triggerDiamondCircleSpawn(6).then(()=>{ state.floor[6]={card:{suit:'D',rank:3,id:'D3'},faceUp:false,owner:null}; render(); }); });
await snap('fx_d1.png', 600); await snap('fx_d2.png', 650); await snap('fx_d3.png', 500);
await p.waitForTimeout(1200);
// ♠
await p.evaluate(()=>{ triggerSpadeSlashHand(1,0); });
await snap('fx_s1.png', 500); await snap('fx_s2.png', 550); await snap('fx_s3.png', 350);
await p.waitForTimeout(1500);
// ♣
await p.evaluate(()=>{ triggerClubDrawAppear(0); });
await snap('fx_c1.png', 500); await snap('fx_c2.png', 400);
await p.waitForTimeout(1500);
await p.waitForTimeout(4000); console.log(await p.evaluate(()=>'anim'+animationsInFlight+' face12='+state.floor[12].faceUp+' key='+B3.tiles[12].key));
console.log(errs.join('\n')||'no errors'); await b.close();})();
