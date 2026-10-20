// 画面なしの対戦場。2つの方針(policy)を何戦も戦わせて勝率を出す。
//   node tools/ai/arena.js <A> <B> [games]   例: node tools/ai/arena.js strong hard 200
// 方針: easy / hard(元の「かんたん」「つよい」= 新しい「ふつう」) / strong / oracle
const { loadFactory } = require('./engine');
const F = loadFactory();

// 元のCPU(かんたん/つよい)をそのまま方針として使う
function basePolicy(level){
  const use = (eng, p) => { eng.state.cpuLevel = level; eng.state.cpuIndex = p; };
  return {
    name: level,
    setup(eng, p){ use(eng, p); eng.cpuDoSetup(); },
    move(eng, p){ use(eng, p); return eng.cpuDoMove(); },
    hand(eng, p){ use(eng, p); return eng.cpuDoHandEffect(); },
    answer(eng, p){ use(eng, p); eng.cpuAnswerTask(); },
  };
}

async function playGame(pols, opt = {}){
  let eng = null, pending = false, logLen = 0;
  const hooks = { render(){
    const st = eng && eng.state;
    if(st && st.players) for(const p of pols) if(p.observe) p.observe(st, eng.known);
    if(st && opt.onLog && st.log.length > logLen){ const n = st.log.length - logLen; logLen = st.log.length; st.log.slice(0, n).reverse().forEach(l => opt.onLog(st, l)); }
    if(!st || pending || !st.task || !st.task.resolve) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      const t = eng.state.task;
      if(t && t.resolve) pols[eng.state.current].answer(eng, eng.state.current, t);
    });
  } };
  eng = F(hooks);
  eng.initGame(true, 'easy', false);
  const st = () => eng.state;
  let turns = 0, guard = 0, lastSig = '';
  while(!st().gameOver){
    const s = st();
    const sig = s.phase + ':' + s.current + ':' + s.players.map(p => p.hand.length + '/' + p.personalIndex).join(',') + ':' + s.deck.length + ':' + turns;
    if(sig === lastSig){ if(++guard > 5) return { winner:-1, turns, stall:s.phase + (s.task ? ':' + s.task.tag : '') }; } else { guard = 0; lastSig = sig; }
    if(s.phase === 'setup-personal'){ pols[s.setupPlayer].setup(eng, s.setupPlayer); continue; }
    if(s.phase === 'draw'){ if(++turns > (opt.maxTurns || 300)) return { winner:-1, turns, draw:true }; if(opt.onTurn) opt.onTurn(s); await eng.doDraw(); continue; }
    if(s.phase === 'move'){ await pols[s.current].move(eng, s.current); continue; }
    if(s.phase === 'hand-effect'){ await pols[s.current].hand(eng, s.current); continue; }
    await new Promise(r => setImmediate(r));
  }
  // 負けた人 = 手番の人(ドロー時の詰み・表フロア着地はどちらも手番の人)
  const loser = st().winnerMsg && st().players.findIndex(p => st().winnerMsg.startsWith(p.name)) ;
  return { winner: loser === 0 ? 1 : 0, turns, msg: st().winnerMsg, log: st().log.slice(0, 8) };
}

const POLICIES = { easy: () => basePolicy('easy'), hard: () => basePolicy('hard') };
function addPolicy(name, make){ POLICIES[name] = make; }

async function match(aName, bName, games, opt = {}){
  const res = { a:0, b:0, draw:0, stall:0, turns:0, first:[0,0] };
  for(let g = 0; g < games; g++){
    // 先攻・後攻を交互に入れ替える
    const swap = g % 2 === 1;
    const A = POLICIES[aName](), B = POLICIES[bName]();
    const pols = swap ? [B, A] : [A, B];
    const r = await playGame(pols, opt);
    res.turns += r.turns;
    if(r.stall){ res.stall++; if(opt.verbose) console.log('stall', r.stall); continue; }
    if(r.winner < 0){ res.draw++; continue; }
    const aWon = (r.winner === 0) !== swap;
    if(aWon) res.a++; else res.b++;
    res.first[r.winner]++;
  }
  return res;
}
module.exports = { playGame, match, addPolicy, POLICIES, F };

if(require.main === module){
  const [a = 'hard', b = 'easy', n = '100'] = process.argv.slice(2);
  try{ require('./policies'); }catch(e){ if(e.code !== 'MODULE_NOT_FOUND') throw e; }
  const t0 = Date.now();
  match(a, b, +n).then(r => {
    const dec = r.a + r.b;
    console.log(`${a} vs ${b}: ${r.a}-${r.b} (勝率 ${(100*r.a/Math.max(1,dec)).toFixed(1)}%) 引分${r.draw} 停止${r.stall} 平均${(r.turns/n).toFixed(1)}ターン 先攻勝${r.first[0]}/後攻勝${r.first[1]}  ${((Date.now()-t0)/1000).toFixed(1)}s`);
  });
}
