/* CPU 同士で長時間(既定 6分)対戦させ、エラー・進行停止・アニメ中カウンタの戻りを確認する。
   進行停止: 40秒以上 state が変わらない(演出中・入力待ちに関わらず)。 */
const { chromium } = require('playwright');
const DURATION = Number(process.env.DURATION_S || 360) * 1000;
(async () => {
  const b = await chromium.launch({ args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport:{ width:1280, height:820 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack||'').split('\n').slice(1,3).join(' | ')));
  p.on('console', m => { if(m.type()==='error' && !/Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto(await require('../serve').url()); await p.waitForTimeout(8000);
  await p.evaluate(() => {
    initGame(true, 'hard', false); state.cpuIndex = 0;
    setInterval(() => { if(state && !state.gameOver){ state.cpuIndex = state.phase==='setup-personal' ? state.setupPlayer : state.current; if(!cpuTimer && !cpuActionInProgress) cpuMaybeAct(); } }, 250);
  });
  const t0 = Date.now(); let last = '', lastChange = Date.now(), games = 0, shot = 0;
  while(Date.now() - t0 < DURATION){
    await p.waitForTimeout(4000);
    const info = await p.evaluate(() => state ? JSON.stringify({ over: state.gameOver, ph: state.phase, cur: state.current, d: state.deck.length, h: state.players.map(x => x.hand.length + '/' + x.discard.length + '@' + x.personalIndex), t: state.task && state.task.tag, eff: state.activeEffect && state.activeEffect.key, anim: animationsInFlight, log: state.log.length }) : 'null');
    if(info !== last){ last = info; lastChange = Date.now(); }
    if(Date.now() - lastChange > 40000){ errs.push('STALL ' + info); await p.screenshot({ path:'soak_stall.png' }); break; }
    if(info.includes('"over":true')){ games++; await p.evaluate(() => { initGame(true, 'hard', false); }); }
    if(shot < 4 && Math.random() < 0.15) await p.screenshot({ path:`soak${shot++}.png` });
  }
  console.log(`games=${games} last=${last}`);
  console.log(errs.slice(0, 15).join('\n') || 'no errors');
  await b.close(); process.exit(errs.length ? 1 : 0);
})();
