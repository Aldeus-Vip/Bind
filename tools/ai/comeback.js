// 形勢の動き方を調べる: 決着ターン数・有利側がそのまま勝つ割合・逆転と A の関係
//   node tools/ai/comeback.js [対戦数]
// 形勢は「全部を知っている目」(最強AIと同じ知識)の評価関数で、各ターンの始めに測る。
const A = require('./arena');
const { aiPolicy } = require('./policies');
const AI = require('../../src/cpu_ai.js');

const N = +(process.argv[2] || 200);
(async () => {
  const rec = [];
  for(let g = 0; g < N; g++){
    const pols = [aiPolicy('strong', { ply2:true, worlds:4, topMoves:10, handTop:3, oppHand:2, exactTasks:true }), aiPolicy('strong', { ply2:true, worlds:4, topMoves:10, handTop:3, oppHand:2, exactTasks:true })];
    const trace = [], aces = [];
    let lastLogLen = 0, turn = 0;
    // ターンの始め(ドロー前)に形勢を記録。ログから A の発動(条件を満たしたもの)を拾う
    const wrap = p => { const d = p.move; return p; };
    const r = await A.playGame(pols.map(wrap), {
      onTurn(st){
        turn++;
        const kn = AI.makeKnowledge(st, 0, null, true);
        const v = AI.evaluate(st, 0, kn);
        trace.push({ turn, cur: st.current, v: Math.max(-200, Math.min(200, v)) });
      },
      onLog(st, line){
        const m = line.match(/^A効果: (周囲の安全な裏向きフロアが2枚以下|手札が1枚以下)/);
        if(m) aces.push({ turn, p: st.current, kind: m[1].startsWith('周囲') ? 'floor' : 'hand' });
      },
    });
    if(r.winner < 0) continue;
    rec.push({ winner: r.winner, turns: r.turns, trace, aces });
  }
  // 集計
  const turns = rec.map(r => r.turns).sort((a, b) => a - b);
  const q = f => turns[Math.floor(f*(turns.length - 1))];
  console.log(`対戦 ${rec.length} / 決着ターン(両者合計) 中央値 ${q(0.5)} ・ 25% ${q(0.25)} ・ 75% ${q(0.75)} ・ 最長 ${turns[turns.length - 1]}`);
  // 有利側: 試合の半分の時点で評価が ±margin を超えている側
  for(const [frac, margin] of [[1/3, 5], [1/2, 5], [2/3, 5], [1/2, 15]]){
    let decided = 0, held = 0, comeback = 0, comebackAce = 0, trailAce = 0, trailAceWin = 0, trailNoAce = 0, trailNoAceWin = 0;
    for(const r of rec){
      const mid = r.trace[Math.floor(r.trace.length*frac)];
      if(!mid || Math.abs(mid.v) < margin) continue;
      decided++;
      const leader = mid.v > 0 ? 0 : 1, trailer = 1 - leader;
      const won = r.winner === leader;
      if(won) held++; else comeback++;
      const aceAfter = r.aces.some(a => a.p === trailer && a.turn >= mid.turn);
      if(aceAfter){ trailAce++; if(!won) trailAceWin++; } else { trailNoAce++; if(!won) trailNoAceWin++; }
      if(!won && aceAfter) comebackAce++;
    }
    console.log(`[試合の ${Math.round(frac*100)}% 時点・差 ≥ ${margin}] 差がついた試合 ${decided} / 有利側がそのまま勝ち ${held}(${(100*held/decided).toFixed(1)}%) / 逆転 ${comeback}(うち不利側が中盤以降に A を発動 ${comebackAce})`);
    console.log(`   不利側が A を発動した試合の逆転率 ${(100*trailAceWin/Math.max(1, trailAce)).toFixed(1)}%(${trailAceWin}/${trailAce}) ・ 発動しなかった試合 ${(100*trailNoAceWin/Math.max(1, trailNoAce)).toFixed(1)}%(${trailNoAceWin}/${trailNoAce})`);
  }
  const allAces = rec.reduce((s, r) => s + r.aces.length, 0);
  console.log(`A の発動(条件を満たしたもの): 1試合あたり ${(allAces/rec.length).toFixed(2)} 回`);
})();
