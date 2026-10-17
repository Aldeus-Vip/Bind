/* オンライン対戦の自動テスト。
   同じブラウザの2つのタブを BroadcastChannel でつなぎ(?transport=bc)、
   両方の手番を CPU ロジックに打たせて(?bot=1)対戦させる。
   合格条件: エラーなし・同期ずれなし・盤面ハッシュの一致を複数回確認・1局以上終局。 */
const { chromium } = require('playwright');
const DURATION = Number(process.env.DURATION_S || 150) * 1000;
(async () => {
  const base = await require('../serve').url();
  const b = await chromium.launch({ args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport:{ width:1280, height:820 } });
  const errs = [];
  const watch = (p, tag) => {
    p.on('pageerror', e => errs.push(`${tag} PAGEERR ${e.message} ${(e.stack||'').split('\n').slice(1,3).join(' | ')}`));
    p.on('console', m => { if(m.type()==='error' && !/Failed to load resource|ERR_/.test(m.text())) errs.push(`${tag} CONSOLE ${m.text()}`); });
  };
  const host = await ctx.newPage(); watch(host, 'H');
  await host.goto(base + '?transport=bc&bot=1'); await host.waitForTimeout(800);
  const code = await host.evaluate(() => { const c = BindNet.newCode(); BindNet.connect(c, true); return c; });
  const guest = await ctx.newPage(); watch(guest, 'G');
  await guest.goto(base + `?transport=bc&bot=1&room=${code}`);
  for(const p of [host, guest]) await p.evaluate(() => setInterval(() => { if(state && !state.gameOver && typeof cpuMaybeAct==='function' && !cpuTimer) cpuMaybeAct(); }, 250));

  const info = p => p.evaluate(() => ({
    active: BindNet.active, me: BindNet.me, applied: BindNet.applied, q: BindNet.queue.length,
    desync: BindNet.desync, compared: Object.keys(BindNet.hashes).filter(n => n in BindNet.remoteHashes).length,
    over: !!(state && state.gameOver), phase: state && state.phase, cur: state && state.current,
  }));
  const t0 = Date.now(); let games = 0, compared = 0, shot = 0, lastOver = false;
  while(Date.now() - t0 < DURATION){
    await host.waitForTimeout(3000);
    const [h, g] = await Promise.all([info(host), info(guest)]);
    console.log(`${Math.round((Date.now()-t0)/1000)}s  host me=${h.me} n=${h.applied} ${h.phase} | guest me=${g.me} n=${g.applied} q=${g.q} ${g.phase} | compared ${h.compared}`);
    if(h.desync || g.desync){ errs.push('DESYNC ' + (h.desync || g.desync)); break; }
    if(!h.active || !g.active){ errs.push('NOT CONNECTED'); if(Date.now()-t0 > 10000) break; else continue; }
    if(shot < 2 && h.applied > 6){ await host.screenshot({ path:`online_host${shot}.png` }); await guest.screenshot({ path:`online_guest${shot}.png` }); shot++; }
    if(h.over && g.over){
      if(!lastOver){
        games++;
        const [hh, gh] = await Promise.all([host.evaluate(() => BindNet.hash()), guest.evaluate(() => BindNet.hash())]);
        console.log(`game ${games} over  hash host=${hh} guest=${gh}`);
        if(hh !== gh) errs.push('FINAL HASH MISMATCH');
        compared += h.compared;
        await guest.evaluate(() => BindNet.rematch());
      }
      lastOver = true;
    } else lastOver = false;
  }
  const h = await info(host);
  compared += h.compared;
  console.log(`games finished: ${games}, hash checks: ${compared}`);
  if(compared < 3) errs.push('TOO FEW HASH CHECKS');
  console.log(errs.slice(0, 20).join('\n') || 'no errors');
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
