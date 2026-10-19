// 構造の比較実験: node tools/ai/exp.js '<JSON 設定A>' '<JSON 設定B>' [対戦数]
//   設定: { "level":"strong"|"oracle", "base":"hard"|"easy"(元のCPU), ...createAI のオプション }
const { runParallel } = require('./tune');
const [a, b, n = '200'] = process.argv.slice(2);
const A = JSON.parse(a), B = JSON.parse(b);
const t0 = Date.now();
runParallel(null, null, +n, A, B, { levelA: A.level, levelB: B.level, baseA: A.base, baseB: B.base }).then(r => {
  console.log(`${a}  vs  ${b}: ${r.a}-${r.b} (${(100*r.a/Math.max(1, r.a + r.b)).toFixed(1)}%) stall${r.stall} draw${r.draw} ${((Date.now()-t0)/1000).toFixed(0)}s`);
});
