const { chromium } = require('playwright');
(async()=>{
const b = await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage({viewport:{width:1400,height:900}}); 
await p.goto(await require('../serve').url()); await p.waitForTimeout(1200);
await p.screenshot({path:'u_start.png'});
await p.evaluate(()=>{ initGame(true,'easy',false); }); await p.waitForTimeout(800); await p.screenshot({path:'u_setup.png'});
await p.evaluate(()=>{ setupChooseHandCard(0); setupPlaceOnCell(17); }); await p.waitForTimeout(4000); await p.screenshot({path:'u_game.png', fullPage:true});
await p.evaluate(()=>{ openRuleBook(); }); await p.waitForTimeout(500); await p.screenshot({path:'u_modal.png'});
await p.evaluate(()=>{ closeRuleBook(); openSettings(); }); await p.waitForTimeout(500); await p.screenshot({path:'u_settings.png'});
await b.close();})();
