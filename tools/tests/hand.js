const { chromium } = require('playwright');
(async()=>{
const b = await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage({viewport:{width:1400,height:900}, deviceScaleFactor:2}); const errs=[]; p.on('pageerror',e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1]));
await p.goto(await require('../serve').url()); await p.waitForTimeout(1000);
await p.evaluate(()=>{ initGame(true,'easy',false);
  const P=state.players[0]; P.hand=[{suit:'H',rank:1,id:'H1'},{suit:'S',rank:4,id:'S4'},{suit:'D',rank:8,id:'D8'},{suit:'C',rank:13,id:'C13'},{suit:'H',rank:6,id:'H6'},{suit:'S',rank:11,id:'S11'},{suit:'JOKER',rank:null,id:'JOKER1'}];
  render(); });
await p.waitForTimeout(6000);
await p.screenshot({path:'h1.png'});
const r = await p.evaluate(()=>{ const c=[...document.querySelectorAll('.card.b3card')].filter(e=>!e.classList.contains('mini') && e.offsetWidth>40); if(!c.length) return null; const xs=c.map(e=>e.getBoundingClientRect()); return {x:Math.min(...xs.map(q=>q.left))-10,y:Math.min(...xs.map(q=>q.top))-10,width:Math.max(...xs.map(q=>q.right))-Math.min(...xs.map(q=>q.left))+20,height:Math.max(...xs.map(q=>q.bottom))-Math.min(...xs.map(q=>q.top))+20}; });
console.log(JSON.stringify(r)); if(r) await p.screenshot({path:'h2.png', clip:r});
console.log(errs.join('\n')||'no errors'); await b.close();})();
