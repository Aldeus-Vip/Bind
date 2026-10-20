/* =====================================================================
   Bind AI(CPU「つよい」「最強AI」の頭脳)
   - 元のゲームのルール部分を画面なしで動かす「エンジンの写し」を使い、候補の手を実際に試してから選ぶ(先読み)。
     エンジンの写しは build.mjs が元ファイルから自動で取り出す(src/cpu_engine.gen.js / Node は tools/ai/engine.js)。
   - 局面の良し悪し(評価)は、Riku さんの戦略をそのまま点数にしている:
       ・相手が次のドローで「どのカードでも安全に動けない」確率(= 詰み) … 最重要
       ・移動できる数字の幅(どの数字のカードなら動けるか)、周囲の安全な裏向きフロア、中央6マス
       ・手札の枚数(多いほど有利。相手の手札は少ないほど読める)
   - 知っている情報:
       つよい  … 人間と同じ公開情報 + 完全な記憶(一度見たカードの行方はすべて覚えている)。
                 見えていないカードは、ありうる並びを何通りか作って平均する(確定化モンテカルロ)。
       最強AI  … 裏向きのフロア・山札の並び・相手の手札をすべて知っている(ズル)。
   - Node(tools/ai/arena.js)とブラウザ(src/cpu.js)の両方から使う。
   ===================================================================== */
(function(root){
'use strict';

const ROWS = 4, COLS = 5, CELLS = 20;
const NBM = new Int32Array(CELLS);
for(let i = 0; i < CELLS; i++){
  const r = Math.floor(i/COLS), c = i%COLS;
  let m = 0;
  for(let dr = -1; dr <= 1; dr++) for(let dc = -1; dc <= 1; dc++){
    if(!dr && !dc) continue;
    const nr = r + dr, nc = c + dc;
    if(nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) m |= 1 << (nr*COLS + nc);
  }
  NBM[i] = m;
}
const CENTER_MASK = [6, 7, 8, 11, 12, 13].reduce((m, i) => m | (1 << i), 0);
const DECK_W = [2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]; // 値ごとの枚数(JOKER=0 は2枚)
const val = c => (c.suit === 'JOKER' ? 0 : c.rank);
function pc(x){ x = x - ((x >>> 1) & 0x55555555); x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; }
function bitsOf(m){ const out = []; while(m){ const b = m & -m; out.push(31 - Math.clz32(b)); m ^= b; } return out; }
const dist = (a, b) => Math.max(Math.abs(Math.floor(a/COLS) - Math.floor(b/COLS)), Math.abs(a%COLS - b%COLS));
function shuffle(a){ for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random()*(i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

/* ---------------- 盤面の分析(移動の計算は元の reachableAfterSteps と同じ規則) ---------------- */
function analyze(S, p){
  const pl = S.players[p], o = pl.personalIndex;
  let pass = 0, safe = 0;
  for(let i = 0; i < CELLS; i++){
    const s = S.floor[i], wind = S.windCells.has(i), isWind = i === o ? false : wind;
    if(s === null && !isWind) continue;
    if(s !== null && s.owner !== null && s.owner !== p) continue;
    pass |= 1 << i;
    if(i === o){ if(s === null || !s.faceUp) safe |= 1 << i; }
    else if(wind || s === null || !s.faceUp) safe |= 1 << i;
  }
  const R = new Int32Array(14);
  let f = o === null || o === undefined ? 0 : 1 << o;
  for(let k = 1; k <= 13 && f; k++){
    let n = 0, m = f;
    while(m){ const b = m & -m; n |= NBM[31 - Math.clz32(b)]; m ^= b; }
    n &= pass; R[k] = n; f = n;
  }
  const A = { p, o, pass, safe, R, pv: pl.personalCard ? val(pl.personalCard) : 7, bound: !!pl.bound, al: new Uint8Array(14) };
  let aw = 0, union = 0;
  for(let v = 0; v <= 13; v++){
    const d = diffOf(A, v);
    const ok = d === 0 || (R[d] & safe) !== 0;
    A.al[v] = ok ? 1 : 0;
    if(ok) aw += DECK_W[v];
    if(d) union |= R[d] & safe;
  }
  A.aliveFrac = aw/54;
  A.union = pc(union);
  A.safeN = o === null ? 0 : pc(NBM[o] & safe & ~(1 << o));
  A.center = o !== null && (CENTER_MASK >> o) & 1;
  return A;
}
function diffOf(A, v){ let d = Math.abs(v - A.pv); if(A.bound && d >= 2) d = 1; return d; }

// 各マスが、そのプレイヤーの「着地先」としてどれだけ頼られているか(逃げ道が少ないほど1マスの重みが大きい)
function importance(A){
  const imp = new Float32Array(CELLS);
  for(let v = 0; v <= 13; v++){
    const d = diffOf(A, v);
    if(!d) continue;
    const m = A.R[d] & A.safe, n = pc(m);
    if(!n) continue;
    const share = DECK_W[v]/n;
    for(const i of bitsOf(m)) imp[i] += share;
  }
  return imp;
}

/* ---------------- 知識(何を知っているか) ---------------- */
// kn = { oracle, seen:Set<card>, U:Int16Array(14) 見えていないカードの値ごとの枚数 }
function makeKnowledge(state, me, seen, oracle){
  const kn = { oracle: !!oracle, seen: seen || new Set(), me, U: new Int16Array(14), Utotal: 0 };
  kn.knows = c => kn.oracle || kn.seen.has(c);
  if(!kn.oracle){
    for(const c of allCards(state)) if(!kn.seen.has(c)){ kn.U[val(c)]++; kn.Utotal++; }
  }
  return kn;
}
function allCards(S){
  const out = [];
  S.floor.forEach(f => { if(f && f.card) out.push(f.card); });
  S.players.forEach(p => { out.push(...p.hand, ...p.discard); if(p.personalCard) out.push(p.personalCard); });
  out.push(...S.deck);
  return out;
}
// 公開情報を記録する(画面が描き直されるたびに呼ぶ)。完全な記憶 = 一度見たカードは忘れない
function observe(state, me, seen, known){
  if(!state || !state.players) return;
  state.players.forEach((p, i) => {
    p.discard.forEach(c => seen.add(c));
    if(p.personalCard) seen.add(p.personalCard);
    if(i === me) p.hand.forEach(c => seen.add(c));
  });
  state.floor.forEach(f => { if(f && f.card && f.faceUp) seen.add(f.card); });
  if(known) for(const k in known){ const c = known[k]; if(c) seen.add(c); }
}

// 次のドローの時点で「どのカードでも安全に動けない」確率
function deathProb(S, p, A, kn){
  const pl = S.players[p];
  let unknown = 0;
  for(const c of pl.hand){
    if(kn.knows(c)){ if(A.al[val(c)]) return 0; }
    else unknown++;
  }
  if(S.deck.length){
    const top = S.deck[S.deck.length - 1];
    if(kn.knows(top)){ if(A.al[val(top)]) return 0; }
    else unknown++;
  }
  if(!unknown) return 1;
  let dead = 0, total = kn.Utotal;
  for(let v = 0; v <= 13; v++) if(!A.al[v]) dead += kn.U[v];
  let P = 1;
  for(let j = 0; j < unknown; j++){
    if(total - j <= 0) break;
    P *= Math.max(0, dead - j)/(total - j);
    if(P === 0) break;
  }
  return P;
}

/* ---------------- 評価関数 ---------------- */
const DEFAULT_W = {
  kill: 80, risk: 60, alive: 22, safeN: 1.6, union: 3, center: 3.5, hand: 1.4, handCap: 6, hold: 1, bound: 2.5, extra: 10,
  oppZero: 2,
  // Riku さんの解説から足した項目(0 なら使わない)
  starve: 6,   // 息切れ: 相手の手札が 0〜2 枚であること自体の価値(ハンド効果の手数を奪う)
  known: 0,    // 自分が踏みに行ける「中身の分かっている裏向きフロア」(4 で置いた強いカードなど)の価値
  v4: 1,       // 4 で置くカードを「次のパーソナルとしての強さ」で選ぶ
  v7: 0,       // 7 の(動かすフロア, 置き先)をすべて評価で確かめる
  aceKeep: 4,  // 手札3枚以下で A を持っている(次のムーブ → A で手札1枚以下 → 5枚ドローの筋)
  handOwn: 0,  // 自分の手札 = ハンド効果の選択肢。相手の手札より重く数える分
};
// パーソナルにしたときの強さ(4 で置く・取りに行く価値)
const PERS = [2.0, 1.6, 1.0, 0.8, 0.6, 0.6, 0.7, 0.7, 1.3, 1.0, 0.8, 1.2, 1.4, 1.6];
// 手札として持っておく価値(とどめの8、JOKER、連鎖の9など)
const HOLD = [1.6, 0.4, 0.7, 0.5, 0.4, 0.5, 0.5, 0.4, 1.6, 0.9, 0.6, 0.8, 0.8, 0.9];
function handVal(h, cap){ return h <= cap ? h : cap + 0.3*(h - cap); }

function loserOf(S){
  const msg = S.winnerMsg || '';
  for(let i = 0; i < S.players.length; i++) if(msg.startsWith(S.players[i].name + 'は')) return i;
  return S.current;
}
function evaluate(S, me, kn, W){
  W = W || DEFAULT_W;
  if(S.gameOver) return loserOf(S) === me ? -1e6 : 1e6;
  const o = 1 - me;
  const M = analyze(S, me), O = analyze(S, o);
  const myTurnNext = S.current === me; // A の追加ターン
  const pdO = myTurnNext ? 0 : deathProb(S, o, O, kn);
  const pdM = deathProb(S, me, M, kn);
  if(myTurnNext && pdM >= 1) return -1e6 + 1;
  let s = W.kill*pdO - W.risk*pdM*(myTurnNext ? 1.5 : 1);
  s += W.alive*(M.aliveFrac - O.aliveFrac);
  s += W.safeN*(M.safeN - O.safeN);
  s += W.union*(Math.log1p(M.union) - Math.log1p(O.union));
  s += W.center*(M.center - O.center);
  const hm = S.players[me].hand, ho = S.players[o].hand;
  s += W.hand*(handVal(hm.length, W.handCap) - handVal(ho.length, W.handCap));
  if(ho.length === 0) s += W.oppZero;
  if(W.handOwn) s += W.handOwn*handVal(hm.length, W.handCap);
  if(W.aceKeep && hm.length <= (W.aceKeepMax || 3) && hm.some(c => val(c) === 1)) s += W.aceKeep;
  if(W.starve) s += W.starve*(ho.length === 0 ? 1 : ho.length === 1 ? 0.6 : ho.length === 2 ? 0.25 : 0);
  if(W.known && kn) s += W.known*(knownReach(S, M, kn) - knownReach(S, O, kn));
  let hold = 0;
  for(const c of hm) hold += HOLD[val(c)];
  s += W.hold*hold;
  s += W.bound*((O.bound ? 1 : 0) - (M.bound ? 1 : 0));
  if(myTurnNext) s += W.extra;
  return s;
}

// 踏みに行ける(どれかの数字で安全に着地できる)裏向きフロアのうち、中身が分かっていて一番強いもの
function knownReach(S, A, kn){
  let reach = 0;
  for(let v = 0; v <= 13; v++){ const d = diffOf(A, v); if(d) reach |= A.R[d] & A.safe; }
  let bestV = 0;
  for(const i of bitsOf(reach)){
    const f = S.floor[i];
    if(!f || !f.card || f.faceUp || f.owner !== null || S.windCells.has(i) || f.debuff) continue;
    if(!kn.knows(f.card)) continue;
    const v = PERS[val(f.card)] + (f.buff === 'sun' ? 0.8 : 0);
    if(v > bestV) bestV = v;
  }
  return bestV;
}

/* ---------------- 状態の複製と、見えないカードの並べ替え ---------------- */
function clone(S){
  return {
    numPlayers: S.numPlayers, vsCPU: S.vsCPU, cpuIndex: S.cpuIndex, cpuLevel: S.cpuLevel,
    players: S.players.map(p => ({ name: p.name, hand: p.hand.slice(), discard: p.discard.slice(), personalIndex: p.personalIndex,
      personalCard: p.personalCard, bound: p.bound, extraTurn: p.extraTurn })),
    floor: S.floor.map(f => (f ? Object.assign({}, f) : null)),
    deck: S.deck.slice(), current: S.current, phase: S.phase, setupPlayer: S.setupPlayer, log: [], task: null,
    activeEffect: null, lockedCells: new Set(S.lockedCells), windCells: new Set(S.windCells), gameOver: S.gameOver, winnerMsg: S.winnerMsg,
  };
}
function sampleWorld(state, me, kn){
  const S = clone(state);
  if(kn.oracle) return S;
  const slots = [], cards = [];
  S.floor.forEach((f, i) => { if(f && f.card && !f.faceUp && !kn.knows(f.card)){ slots.push(['f', i]); cards.push(f.card); } });
  const opp = S.players[1 - me];
  opp.hand.forEach((c, j) => { if(!kn.knows(c)){ slots.push(['h', j]); cards.push(c); } });
  S.deck.forEach((c, j) => { if(!kn.knows(c)){ slots.push(['d', j]); cards.push(c); } });
  shuffle(cards);
  slots.forEach(([t, i], k) => {
    if(t === 'f') S.floor[i].card = cards[k];
    else if(t === 'h') opp.hand[i] = cards[k];
    else S.deck[i] = cards[k];
  });
  return S;
}

/* ---------------- 効果の中の選択(先読みの中では速い近似、本番では評価関数で確かめる) ---------------- */
function floorList(S, pred){ const out = []; for(let i = 0; i < CELLS; i++) if(pred(i)) out.push(i); return out; }
function candidatesOf(S, t){
  if(Array.isArray(t.cands)) return t.cands;
  if(typeof t.filter === 'function') return floorList(S, i => { try{ return !!t.filter(i); }catch(e){ return false; } });
  return [];
}
function best(list, score){
  let bs = -Infinity, out = [];
  for(const x of list){ const s = score(x); if(s > bs + 1e-9){ bs = s; out = [x]; } else if(Math.abs(s - bs) <= 1e-9) out.push(x); }
  return out.length ? out[Math.floor(Math.random()*out.length)] : null;
}

// 1つの選択を盤面に当てはめた結果(本番の「評価関数で確かめる」用)。分からないものは null
function applyFloorChoice(S, tag, i, me){
  const T = clone(S), f = T.floor[i];
  switch(tag){
    case 'heart-reveal': case '2-reveal': case 'k-select':
      if(!f) return null; f.faceUp = true; f.buff = null; return T;
    case '6-remove': case 'joker-floor':
      T.floor[i] = null; T.windCells.delete(i); return T;
    case 'j-select':
      if(!f) return null; T.players[me].hand.push(f.card); T.floor[i] = null; return T;
    case 'ace-add-slot': case 'diamond-add-slot': case '7-dst':
      T.floor[i] = { card: { suit:'H', rank:7 }, faceUp:false, owner:null }; return T;
    case 'ace-hide-buff': case '3-hide':
      if(!f) return null; f.faceUp = false; f.buff = 'sun'; return T;
    case '4-slot': {
      const pl = T.players[me], o = pl.personalIndex;
      T.floor[i] = { card: { suit:'H', rank:7 }, faceUp:false, owner: me };
      if(T.floor[o]){ T.floor[o].owner = null; T.floor[o].debuff = 'lightning'; }
      pl.personalIndex = i; return T;
    }
  }
  return null;
}

// 7: (竜巻を起こすマス, そのまま風のマスにする / 空きマスへ動かす先) をすべて試し、評価が一番良い組を選ぶ
function plan7(S, list, me, kn){
  const W = plan7.W || DEFAULT_W;
  const empties = floorList(S, i => S.floor[i] === null && !S.lockedCells.has(i));
  let bestV = -Infinity, bestP = null;
  const tryP = (T, p) => { const v = evaluate(T, me, kn, W); if(v > bestV){ bestV = v; bestP = p; } };
  for(const src of list){
    if(S.floor[src] === null){ const T = clone(S); T.windCells.add(src); tryP(T, { src, dst:null }); continue; }
    { const T = clone(S); T.windCells.add(src); tryP(T, { src, dst:null }); }
    for(const dst of empties){
      if(dst === src) continue;
      const T = clone(S); T.floor[dst] = T.floor[src]; T.floor[src] = null; T.windCells.delete(dst);
      tryP(T, { src, dst });
    }
  }
  plan7.last = bestP;
  return bestP ? bestP.src : null;
}

function makeAnswerer(W){
  W = W || DEFAULT_W;
  // fast = 先読みの中(速さ優先)。false = 本番(候補を評価関数で確かめる)
  return function answer(S, t, me, kn, fast){
    const o = 1 - me, tag = t.tag;
    const cands = () => candidatesOf(S, t);
    const M = analyze(S, me), O = analyze(S, o);
    const opp = S.players[o], pl = S.players[me];
    const near = (a, i) => (NBM[a] >> i) & 1;
    const byEval = (list, tg) => {
      if(fast || list.length <= 1) return null;
      return best(list, i => { const T = applyFloorChoice(S, tg, i, me); return T ? evaluate(T, me, kn, W) : -1e9; });
    };
    switch(tag){
      case 'heart-reveal': case '2-reveal': case '6-remove': case 'joker-floor': case 'k-select': {
        const list = cands();
        const ev = byEval(list, tag);
        if(ev !== null) return ev;
        const iM = importance(M), iO = importance(O);
        return best(list, i => iO[i] - 1.1*iM[i] + 0.3*near(O.o, i) - 0.4*near(M.o, i) + ((CENTER_MASK >> i) & 1)*0.2);
      }
      case 'j-select': {
        const list = cands();
        const ev = byEval(list, tag);
        if(ev !== null) return ev;
        return best(list, i => HOLD[val(S.floor[i].card)] + 0.5*(near(O.o, i) - near(M.o, i)));
      }
      case 'ace-add-slot': case 'diamond-add-slot': case '7-dst': case '4-slot': {
        if(tag === '7-dst' && W.v7 && plan7.last && plan7.last.dst !== null && candidatesOf(S, t).includes(plan7.last.dst)) return plan7.last.dst;
        const list = cands();
        const ev = byEval(list, tag);
        if(ev !== null) return ev;
        return best(list, i => -dist(i, M.o) + 0.7*dist(i, O.o) + ((CENTER_MASK >> i) & 1)*0.8 + (tag === '4-slot' ? pc(NBM[i] & M.safe)*0.5 : 0));
      }
      case 'ace-hide-buff': case '3-hide': {
        const list = cands();
        const ev = byEval(list, tag);
        if(ev !== null) return ev;
        return best(list, i => near(M.o, i)*2 - near(O.o, i)*2.2 - dist(i, M.o)*0.2);
      }
      case '7-src-or-empty': {
        const list = cands();
        if(W.v7){ plan7.W = W; const pick = plan7(S, list, me, kn); if(pick !== null) return pick; }
        const floors = list.filter(i => S.floor[i] !== null), empties = list.filter(i => S.floor[i] === null);
        const iM = importance(M), iO = importance(O);
        const fb = best(floors, i => iO[i] - 1.2*iM[i]);
        const fs = fb === null ? -Infinity : iO[fb] - 1.2*iM[fb];
        const eb = best(empties, i => near(M.o, i)*2 - near(O.o, i)*2.5 + ((CENTER_MASK >> i) & 1)*0.5);
        const es = eb === null ? -Infinity : near(M.o, eb)*2 - near(O.o, eb)*2.5;
        if(fb !== null && (fs > 0.5 || eb === null || fs*1.0 >= es)) return fb;
        return eb !== null ? eb : list[0];
      }
      case '7-move-or-skip': return W.v7 && plan7.last && plan7.last.src !== undefined ? (plan7.last.dst === null ? 'skip' : 'move') : 'move';
      case '8-target-floor': {
        const list = cands();
        return list.includes(O.o) ? O.o : list[0];
      }
      case '3-choice': {
        const ups = floorList(S, i => S.floor[i] && S.floor[i].faceUp && S.floor[i].owner === null && !S.lockedCells.has(i));
        const good = ups.filter(i => near(M.o, i) && !near(O.o, i));
        if(good.length && (M.safeN <= 2 || M.aliveFrac < 0.6)) return 'hide';
        return 'draw';
      }
      case 'joker-action': {
        if(opp.hand.length === 0) return 'floor';
        if(opp.hand.length <= 2) return 'hand';
        const iM = importance(M), iO = importance(O);
        let bestF = 0;
        for(let i = 0; i < CELLS; i++) if(S.floor[i] && S.floor[i].owner === null) bestF = Math.max(bestF, iO[i] - iM[i]);
        return bestF > 6 ? 'floor' : 'hand';
      }
      case 'q-target': {
        if(pl.hand.length <= 1 && opp.hand.length <= 2) return me;
        return o;
      }
      case '5-target': case '10-target': case 'joker-target': case 'joker-final-target': {
        const opt = (t.options || []).find(x => x.value !== me) || (t.options || [])[0];
        return opt ? opt.value : o;
      }
      case '9-discard': {
        // 山札の一番上 = 相手が次に引くカード。相手が動けない数字なら「とどめ」になる
        const d = pl.discard;
        if(!d.length) return null;
        const pref = [1.2, 0.2, 0.9, 0.5, 0.3, 0.6, 0.8, 0.4, 1.5, 0.3, 0.7, 0.9, 0.9, 1.0];
        const lockBonus = opp.hand.length === 0 ? 12 : 3;
        let bi = 0, bs = -Infinity;
        d.forEach((c, k) => { const v = val(c); const s = pref[v] + (O.al[v] ? 0 : lockBonus) - (O.al[v] ? HOLD[v]*0.3 : 0); if(s > bs){ bs = s; bi = k; } });
        return bi;
      }
      case 'joker-final-discard': {
        const tp = S.players[t.playerIndex !== undefined ? t.playerIndex : o];
        if(!tp.discard.length) return null;
        let bi = 0, bs = -Infinity;
        tp.discard.forEach((c, k) => { const v = val(c); const s = (O.al[v] ? -HOLD[v] : 10); if(s > bs){ bs = s; bi = k; } });
        return bi;
      }
      case '4-discard': {
        const d = pl.discard;
        if(!d.length) return null;
        let bi = 0, bs = -Infinity;
        // v4: 足元に置いたカードは、離れたあと戻ってきてチェンジすれば次のパーソナルになる。強いものを置く
        d.forEach((c, k) => { const s = W.v4 ? PERS[val(c)] : -HOLD[val(c)]; if(s > bs){ bs = s; bi = k; } });
        return bi;
      }
      case 'return-discard': {
        const d = pl.discard.slice();
        const isDiamond = S.activeEffect && S.activeEffect.key === 'D';
        if(isDiamond){
          const slots = floorList(S, i => S.floor[i] === null && !S.lockedCells.has(i));
          if(!slots.some(i => dist(i, M.o) <= dist(i, O.o))) return [];
        }
        const has9 = pl.hand.some(c => val(c) === 9);
        d.sort((a, b) => (HOLD[val(a)] + (has9 ? HOLD[val(a)] : 0)) - (HOLD[val(b)] + (has9 ? HOLD[val(b)] : 0)));
        return d.slice(0, Math.floor(d.length/3)*3);
      }
      case '5-select': case '10-select': case 'spade-select': case 'joker-hand-select': {
        const tp = S.players[t.playerIndex !== undefined ? t.playerIndex : o];
        const n = tp.hand.length;
        if(!n) return null;
        const knownIdx = [];
        tp.hand.forEach((c, k) => { if(kn && kn.knows(c)) knownIdx.push(k); });
        if(knownIdx.length){
          if(tag === '5-select' || tag === '10-select'){
            const k = best(knownIdx, k => HOLD[val(tp.hand[k])]);
            if(kn.oracle || HOLD[val(tp.hand[k])] >= 0.8) return k;
          } else {
            // 相手の「逃げ道になるカード」を捨てさせる
            const k = best(knownIdx, k => (O.al[val(tp.hand[k])] ? 5 : 0) + HOLD[val(tp.hand[k])]);
            if(kn.oracle || O.al[val(tp.hand[k])]) return k;
          }
        }
        return Math.floor(Math.random()*n);
      }
    }
    // 既定(元のCPUと同じ考え方)
    if(t.kind === 'floor'){ const l = cands(); return l.length ? l[Math.floor(Math.random()*l.length)] : null; }
    if(t.kind === 'floor-multi' || t.kind === 'discard-multi') return [];
    if(t.kind === 'discard') return pl.discard.length ? 0 : null;
    if(t.kind === 'discard-of') return 0;
    if(t.kind === 'hand-slot'){ const tp = S.players[t.playerIndex]; return tp && tp.hand.length ? Math.floor(Math.random()*tp.hand.length) : null; }
    if(t.kind === 'hand-area') return o;
    if(t.kind === 'choice') return t.options[0].value;
    return null;
  };
}

/* ---------------- 先読み ---------------- */
function createAI(F, opt){
  opt = Object.assign({ level:'strong', worlds: 6, W: DEFAULT_W, timeBudget: 900 }, opt || {});
  if(opt.Wx) opt.W = Object.assign({}, opt.W, opt.Wx); // 一部の重みだけ変える(比較実験用)
  const W = opt.W;
  const answer = makeAnswerer(W);
  let simKn = null, simMe = 0;
  let eng = null, pending = false;
  const hooks = { render(){
    const st = eng && eng.state;
    if(!st || pending || !st.task || !st.task.resolve) return;
    pending = true;
    Promise.resolve().then(() => {
      pending = false;
      const S = eng.state, t = S.task;
      if(!t || !t.resolve) return;
      let a;
      try{ a = answer(S, t, S.current, simKn, !opt.exactTasks); }catch(e){ a = defaultAnswer(S, t); }
      if(a === undefined) a = defaultAnswer(S, t);
      eng.resolveTask(a);
    });
  } };
  eng = F(hooks);

  function defaultAnswer(S, t){
    if(t.kind === 'floor'){ const l = candidatesOf(S, t); return l.length ? l[0] : null; }
    if(t.kind === 'floor-multi' || t.kind === 'discard-multi') return [];
    if(t.kind === 'choice') return t.options[0].value;
    if(t.kind === 'hand-area') return 1 - S.current;
    return null;
  }

  // 1つのシミュレーションを最後まで走らせる(固まったら諦める)
  function guard(p){
    if(!p || typeof p.then !== 'function') return Promise.resolve();
    let to;
    return Promise.race([p, new Promise(r => { to = setTimeout(() => r('timeout'), 300); })]).then(x => { clearTimeout(to); return x; });
  }
  async function simMove(S, me, cardIdx, dest){
    eng.state = S; eng.known = {};
    S.phase = 'move'; S.current = me; S.task = null;
    eng.moveSelectDiscard(cardIdx);
    if(S.phase === 'move' && S.task && S.task.type === 'move-destination'){
      let d = dest;
      if(!S.task.reachable.has(d)) d = S.task.reachable.values().next().value;
      const r = await guard(eng.moveExecuteDestination(d));
      if(r === 'timeout') return null;
    }
    return S;
  }
  async function simHand(S, me, cardIdx){
    eng.state = S; eng.known = {};
    if(S.phase !== 'hand-effect') return S;
    const r = await guard(cardIdx === null ? eng.handEffectSkip() : eng.handEffectDiscard(cardIdx));
    if(r === 'timeout') return null;
    return S;
  }

  function legalMoves(S, me){
    const pl = S.players[me], A = analyze(S, me);
    const out = [], seenV = new Map();
    pl.hand.forEach((c, k) => {
      const v = val(c);
      // 同じ数字は、手元に残す価値の低い方だけ試す
      if(seenV.has(v)) return;
      seenV.set(v, k);
    });
    for(const [v, k] of seenV){
      const d = diffOf(A, v);
      if(d === 0){ out.push({ cardIdx: k, dest: null, v }); continue; }
      const reach = A.R[d];
      if(!reach) continue;
      const safe = reach & A.safe;
      if(safe) for(const i of bitsOf(safe)) out.push({ cardIdx: k, dest: i, v });
      else out.push({ cardIdx: k, dest: bitsOf(reach)[0], v, lethal: true });
    }
    const safeOnes = out.filter(m => !m.lethal);
    return safeOnes.length ? safeOnes : out;
  }
  function handOptions(S, me){
    const out = [null], seenV = new Set();
    S.players[me].hand.forEach((c, k) => { const v = val(c); if(!seenV.has(v)){ seenV.add(v); out.push(k); } });
    return out;
  }

  // 相手の手番を1回だけ試し、こちらにとって最悪の結果を返す(2手読み)。相手は最善を尽くすものとして考える
  async function reply(S2, me, kn){
    if(!S2) return -1e5;
    if(S2.gameOver || S2.current === me || !opt.ply2) return evaluate(S2, me, kn, W);
    const o = 1 - me;
    const S3 = clone(S2);
    eng.state = S3; eng.known = {};
    const r = await guard(eng.doDraw());
    if(r === 'timeout') return evaluate(S2, me, kn, W);
    if(S3.gameOver || S3.phase !== 'move') return evaluate(S3, me, kn, W);
    let worst = Infinity;
    const leaves = [], mids = [];
    for(const m of legalMoves(S3, o)){
      const S4 = await simMove(clone(S3), o, m.cardIdx, m.dest);
      if(!S4) continue;
      if(S4.gameOver || S4.phase !== 'hand-effect'){ const v = evaluate(S4, me, kn, W); if(v < worst) worst = v; continue; }
      const S5 = await simHand(clone(S4), o, null);
      if(!S5) continue;
      const v = evaluate(S5, me, kn, W);
      leaves.push({ S: S5, v }); mids.push({ S4, v });
      if(v < worst) worst = v;
    }
    // 特に危ない数手は、相手のハンド効果まで試す
    if(opt.oppHand){
      mids.sort((a, b) => a.v - b.v);
      for(const m of mids.slice(0, opt.oppHand)){
        for(const h of handOptions(m.S4, o)){
          if(h === null) continue;
          const S5 = await simHand(clone(m.S4), o, h);
          if(!S5) continue;
          const v = evaluate(S5, me, kn, W);
          leaves.push({ S: S5, v });
          if(v < worst) worst = v;
        }
      }
    }
    if(worst === Infinity) return evaluate(S3, me, kn, W);
    // 3手目: 相手の応手のうち特に危ないものは、こちらの次の一手(移動だけ)まで読んで確かめる
    if(opt.ply3 && leaves.length){
      leaves.sort((a, b) => a.v - b.v);
      let worst3 = Infinity;
      for(const l of leaves.slice(0, opt.ply3)){
        const v = l.S.gameOver ? l.v : await myNext(l.S, me, kn);
        if(v < worst3) worst3 = v;
      }
      if(worst3 !== Infinity) return worst3;
    }
    return worst;
  }
  // こちらの次の手番(ドローと移動だけ)の最善
  async function myNext(S, me, kn){
    if(S.gameOver || S.current !== me) return evaluate(S, me, kn, W);
    const T = clone(S);
    eng.state = T; eng.known = {};
    const r = await guard(eng.doDraw());
    if(r === 'timeout' || T.gameOver || T.phase !== 'move') return evaluate(T, me, kn, W);
    let bs = -Infinity;
    for(const m of legalMoves(T, me)){
      const S1 = await simMove(clone(T), me, m.cardIdx, m.dest);
      if(!S1) continue;
      let v;
      if(S1.gameOver || S1.phase !== 'hand-effect') v = evaluate(S1, me, kn, W);
      else { const S2 = await simHand(clone(S1), me, null); v = S2 ? evaluate(S2, me, kn, W) : -1e5; }
      if(v > bs) bs = v;
    }
    return bs === -Infinity ? evaluate(T, me, kn, W) : bs;
  }

  async function bestAfterHand(S1, me, kn){
    if(!S1) return -1e5;
    if(S1.gameOver || S1.phase !== 'hand-effect') return reply(S1, me, kn);
    let bs = -Infinity;
    const cands = [];
    for(const h of handOptions(S1, me)){
      const S2 = await simHand(clone(S1), me, h);
      cands.push({ S2, v: S2 ? evaluate(S2, me, kn, W) : -1e5 });
    }
    cands.sort((a, b) => b.v - a.v);
    for(const c of cands.slice(0, opt.ply2 ? (opt.handTop || 3) : cands.length)){
      const v = opt.ply2 ? await reply(c.S2, me, kn) : c.v;
      if(v > bs) bs = v;
    }
    return bs;
  }

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // ムーブフェーズ: (捨てるカード, 移動先) を選ぶ。そのあとのハンド効果まで含めて試す
  async function decideMove(state, me, kn){
    simKn = kn; simMe = me;
    const moves = legalMoves(state, me);
    if(moves.length <= 1) return moves[0] || null;
    const nW = kn.oracle ? 1 : opt.worlds;
    const worlds = [];
    for(let w = 0; w < nW; w++) worlds.push(sampleWorld(state, me, kn));
    const t0 = now();
    // 1) 移動だけの結果で全候補を並べ、2) 上位をハンド効果・相手の応手まで含めて試す
    const quick = [];
    for(const m of moves){
      let sum = 0;
      for(const Wd of worlds){
        const S1 = await simMove(clone(Wd), me, m.cardIdx, m.dest);
        sum += S1 ? evaluate(S1, me, kn, W) : -1e5;
      }
      quick.push({ m, v: sum/nW });
      if(opt.yield) await opt.yield();
    }
    quick.sort((a, b) => b.v - a.v);
    const top = quick.slice(0, opt.topMoves || 8);
    let bestM = top[0].m, bestV = -Infinity;
    for(const q of top){
      if(now() - t0 > opt.timeBudget) break;
      let sum = 0;
      for(const Wd of worlds){
        const S1 = await simMove(clone(Wd), me, q.m.cardIdx, q.m.dest);
        sum += await bestAfterHand(S1, me, kn);
      }
      const v = sum/nW;
      if(v > bestV){ bestV = v; bestM = q.m; }
      if(opt.yield) await opt.yield();
    }
    return bestM;
  }

  // ハンドエフェクトフェーズ: どのカードを使うか(null = スキップ)
  async function decideHand(state, me, kn){
    simKn = kn; simMe = me;
    const opts = handOptions(state, me);
    if(opts.length <= 1 && !opt.ply2) return null;
    const nW = kn.oracle ? 1 : opt.worlds*2;
    const worlds = [];
    for(let w = 0; w < nW; w++) worlds.push(sampleWorld(state, me, kn));
    let bestH = null, bestV = -Infinity;
    for(const h of opts){
      let sum = 0;
      for(const Wd of worlds){
        const S2 = await simHand(clone(Wd), me, h);
        sum += await reply(S2, me, kn);
      }
      const v = sum/nW + (h === null ? (opt.skipBias || 0) : 0);
      if(v > bestV){ bestV = v; bestH = h; }
      if(opt.yield) await opt.yield();
    }
    return bestH;
  }

  // パーソナルの配置: 中央の列ほど良い。手札に残したい札(8・JOKER・9 など)はパーソナルにしない
  function decideSetup(state, me){
    const pl = state.players[me];
    let ci = 0, cs = Infinity;
    pl.hand.forEach((c, k) => { const s = HOLD[val(c)] + Math.abs(val(c) - 7)*0.05; if(s < cs){ cs = s; ci = k; } });
    const row = me === 0 ? ROWS - 1 : 0;
    const cols = [2, 1, 3];
    const col = Math.random() < 0.6 ? 2 : cols[1 + Math.floor(Math.random()*2)];
    return { cardIdx: ci, cell: row*COLS + col };
  }

  return { decideMove, decideHand, decideSetup, answer: (S, t, me, kn) => answer(S, t, me, kn, false), evaluate: (S, me, kn) => evaluate(S, me, kn, W) };
}

const API = { createAI, makeKnowledge, observe, analyze, evaluate, clone, DEFAULT_W, HOLD };
if(typeof module !== 'undefined' && module.exports) module.exports = API;
else root.BindAI = API;
})(typeof window !== 'undefined' ? window : this);
