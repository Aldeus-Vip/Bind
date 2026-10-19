// 評価の重みを自己対戦で学習する(SPSA: 全部の重みを同時に ± に揺らした2体を戦わせ、勝った側へ少しずつ寄せる)。
//   node tools/ai/spsa.js [回数] [1回あたりの対戦数]
// 途中経過は tools/ai/weights.json に保存(次回はそこから続ける)。10回ごとに「学習前の重み」との対戦で確かめる。
const fs = require('fs'), path = require('path');
const AI = require('../../src/cpu_ai.js');
const { runParallel } = require('./tune');
const OUT = path.join(__dirname, 'weights.json');
const KEYS = ['kill', 'risk', 'alive', 'safeN', 'union', 'center', 'hand', 'hold', 'bound', 'oppZero', 'extra'];

const iters = +(process.argv[2] || 60), games = +(process.argv[3] || 200);
const C = 0.3;   // 揺らす幅(対数で ±30%)
const A = 1.2;   // 学習率
let W = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : Object.assign({}, AI.DEFAULT_W);
const W0 = Object.assign({}, AI.DEFAULT_W);
const log = W => KEYS.map(k => `${k}:${(+W[k]).toFixed(2)}`).join(' ');

(async () => {
  for(let it = 1; it <= iters; it++){
    const delta = {}, plus = Object.assign({}, W), minus = Object.assign({}, W);
    for(const k of KEYS){
      delta[k] = Math.random() < 0.5 ? -1 : 1;
      plus[k] = W[k]*Math.exp(C*delta[k]);
      minus[k] = W[k]*Math.exp(-C*delta[k]);
    }
    const r = await runParallel(plus, minus, games);
    const g = r.a/Math.max(1, r.a + r.b) - 0.5;
    const step = A/Math.pow(it + 5, 0.3);
    for(const k of KEYS) W[k] = +(W[k]*Math.exp(step*g*delta[k])).toFixed(4);
    fs.writeFileSync(OUT, JSON.stringify(W, null, 1));
    console.log(`#${it} +/-: ${r.a}-${r.b} g=${g.toFixed(3)}  ${log(W)}`);
    if(it % 10 === 0){
      const v = await runParallel(W, W0, 400);
      console.log(`  検証 学習後 vs 学習前: ${v.a}-${v.b} (${(100*v.a/Math.max(1, v.a + v.b)).toFixed(1)}%)`);
    }
  }
})();
