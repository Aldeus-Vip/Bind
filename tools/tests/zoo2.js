const { chromium } = require('playwright');
(async()=>{
const b = await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage({viewport:{width:1400,height:900}, deviceScaleFactor:2}); const errs=[]; p.on('pageerror',e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1]));
await p.goto(await require('../serve').url()); await p.waitForTimeout(1000);
const list=[[2,3],[4,5],[6,7],[8,9],[10,11],[12,13],[1,'J']];
let k=0;
for(const [a,c] of list){
  await p.evaluate(([a,c])=>{ initGame(false);
    const mk=(r,s)=> r==='J' ? {suit:'JOKER',rank:null,id:'JOKER1'} : {suit:s,rank:r,id:s+r};
    state.players[0].personalCard=mk(a,'H'); state.players[0].personalIndex=11; state.floor[11].owner=0;
    state.players[1].personalCard= c==='J' ? mk('J') : mk(c,'S'); state.players[1].personalIndex=13; state.floor[13].owner=1;
    state.phase='hand-effect'; state.current=0; render(); }, [a,c]);
  await p.waitForTimeout(1300);
  const cl = await p.evaluate(()=>{ const a=document.getElementById('floor-cell-11').getBoundingClientRect(), q=document.getElementById('floor-cell-13').getBoundingClientRect(); return {x:a.left-30, y:a.top-120, width:(q.right-a.left)+60, height:a.height+150}; });
  await p.screenshot({path:`y${k++}.png`, clip:cl});
}
// white joker separately + hand
await p.evaluate(()=>{ initGame(true,'easy',false); state.players[0].personalCard={suit:'JOKER',rank:null,id:'JOKER2'}; state.players[0].personalIndex=12; state.floor[12].owner=0;
  state.players[0].hand=[{suit:'H',rank:2,id:'H2'},{suit:'S',rank:5,id:'S5'},{suit:'D',rank:9,id:'D9'},{suit:'C',rank:12,id:'C12'},{suit:'H',rank:1,id:'H1'},{suit:'JOKER',rank:null,id:'JOKER1'},{suit:'JOKER',rank:null,id:'JOKER2'}];
  state.phase='hand-effect'; render(); });
await p.waitForTimeout(2500);
const cl = await p.evaluate(()=>{ const a=document.getElementById('floor-cell-12').getBoundingClientRect(); return {x:a.left-80, y:a.top-130, width:a.width+160, height:a.height+160}; });
await p.screenshot({path:`y${k++}.png`, clip:cl});
const r = await p.evaluate(()=>{ const c=[...document.querySelectorAll('.card.b3card')].filter(e=>!e.classList.contains('mini') && e.offsetWidth>40); const xs=c.map(e=>e.getBoundingClientRect()); return {x:Math.min(...xs.map(q=>q.left))-10,y:Math.min(...xs.map(q=>q.top))-10,width:Math.max(...xs.map(q=>q.right))-Math.min(...xs.map(q=>q.left))+20,height:Math.max(...xs.map(q=>q.bottom))-Math.min(...xs.map(q=>q.top))+20}; });
await p.screenshot({path:'hand2.png', clip:r});
console.log(errs.join('\n')||'no errors'); await b.close();})();
