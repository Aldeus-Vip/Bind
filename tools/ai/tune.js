// 評価の重みを自己対戦で調整する(山登り法)。4プロセス並列。
//   node tools/ai/tune.js [回数] [1回あたりの対戦数]
// 候補(1つの重みだけ変えたもの)が現在の最良に 54% 以上勝てば採用。結果は tools/ai/weights.json に保存。
const { fork } = require('child_process');
const fs = require('fs'), path = require('path');
const AI = require('../../src/cpu_ai.js');
const OUT = path.join(__dirname, 'weights.json');
const WORKERS = 4;

if(process.env.TUNE_WORKER){
  const { match, addPolicy } = require('./arena');
  const { aiPolicy } = require('./policies');
  process.on('message', async job => {
    addPolicy('A', () => aiPolicy('strong', Object.assign({}, job.optA, { W: job.A })));
    addPolicy('B', () => aiPolicy('strong', Object.assign({}, job.optB, { W: job.B })));
    const r = await match('A', 'B', job.games, { offset: job.offset });
    process.send(r);
  });
  return;
}

function runParallel(A, B, games, optA = {}, optB = {}){
  const per = Math.ceil(games/WORKERS);
  return Promise.all([...Array(WORKERS)].map((_, k) => new Promise(res => {
    const w = fork(__filename, [], { env: Object.assign({}, process.env, { TUNE_WORKER: '1' }) });
    w.on('message', r => { w.kill(); res(r); });
    w.send({ A, B, games: per, optA, optB, offset: k });
  }))).then(rs => rs.reduce((s, r) => ({ a: s.a + r.a, b: s.b + r.b, draw: s.draw + r.draw, stall: s.stall + r.stall }), { a:0, b:0, draw:0, stall:0 }));
}
module.exports = { runParallel };

if(require.main === module){
  const iters = +(process.argv[2] || 20), games = +(process.argv[3] || 400);
  let bestW = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : Object.assign({}, AI.DEFAULT_W);
  const keys = ['kill', 'risk', 'alive', 'safeN', 'union', 'center', 'hand', 'handCap', 'hold', 'bound', 'oppZero'];
  (async () => {
    for(let it = 0; it < iters; it++){
      const k = keys[Math.floor(Math.random()*keys.length)];
      const f = Math.random() < 0.5 ? 1.6 : 1/1.6;
      const cand = Object.assign({}, bestW, { [k]: +(bestW[k]*f).toFixed(3) });
      const r = await runParallel(cand, bestW, games);
      const rate = r.a/Math.max(1, r.a + r.b);
      const ok = rate >= 0.54;
      console.log(`#${it} ${k} ${bestW[k]} -> ${cand[k]}: ${r.a}-${r.b} (${(rate*100).toFixed(1)}%) stall${r.stall} ${ok ? '採用' : ''}`);
      if(ok){ bestW = cand; fs.writeFileSync(OUT, JSON.stringify(bestW, null, 1)); }
    }
    console.log('best', JSON.stringify(bestW));
  })();
}
