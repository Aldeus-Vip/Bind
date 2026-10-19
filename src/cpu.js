/* =====================================================================
   CPU の難易度(4段階)
     かんたん … 元の「かんたん」
     ふつう   … 元の「つよい」(内部の名前は 'hard' のまま)
     つよい   … 自己対戦で鍛えた AI(cpu_ai.js)。人間と同じ公開情報 + 完全な記憶で、先読みして選ぶ
     最強AI   … 同じ AI に、裏向きのフロア・山札の並び・相手の手札まで見せた「ズル」版
   - 元の CPU の入口(cpuDoSetup / cpuDoMove / cpuDoHandEffect / cpuAnswerTask)を、つよい・最強AI のときだけ差し替える。
     元のファイルは編集しない。かんたん・ふつうは元の関数がそのまま動く。
   - 先読みには、元のルール部分の写し(BindEngineFactory、ビルド時に元ファイルから自動生成)を使う。
   ===================================================================== */
(function(){
'use strict';
const AI = window.BindAI, F = window.BindEngineFactory;
if(!AI || !F || typeof cpuDoMove !== 'function') return;

const LABEL = { easy:'かんたん', hard:'ふつう', strong:'つよい', oracle:'最強AI' };
// 考えている間も画面(3D)を止めない。ただし 40ms 続けて考えたときだけ一息つく(毎回だと描画待ちで遅くなる)
let lastYield = 0;
const yieldUI = () => {
  const t = performance.now();
  if(t - lastYield < 40) return Promise.resolve();
  return new Promise(r => setTimeout(() => { lastYield = performance.now(); r(); }, 0));
};
const brains = {
  // 設定は自己対戦の比較で決めた(相手のハンド効果まで読む・候補を10手まで広げる、が効いた。世界の数を8に増やしても変わらない)
  strong: AI.createAI(F, { level:'strong', ply2:true, worlds:4, topMoves:10, handTop:3, oppHand:2, timeBudget:1500, yield: yieldUI }),
  oracle: AI.createAI(F, { level:'oracle', ply2:true, topMoves:10, handTop:3, oppHand:3, timeBudget:1500, yield: yieldUI }),
};
const level = () => (typeof state !== 'undefined' && state && state.vsCPU ? state.cpuLevel : null);
const brain = () => brains[level()] || null;

/* ---- 公開情報の記録(つよい用の「完全な記憶」) ---- */
let seen = new Set(), seenFor = null;
function observeNow(){
  if(typeof state === 'undefined' || !state || !state.vsCPU || !state.players) return;
  if(seenFor !== state){ seen = new Set(); seenFor = state; }
  try{ AI.observe(state, state.cpuIndex, seen, typeof knownFloorCards !== 'undefined' ? knownFloorCards : null); }catch(e){}
}
const origRender = window.render;
window.render = function(){
  const r = origRender.apply(this, arguments);
  observeNow();
  return r;
};
const knowledge = me => { observeNow(); return AI.makeKnowledge(state, me, seen, level() === 'oracle'); };

/* ---- CPU の入口を差し替える ---- */
const base = { setup: window.cpuDoSetup, move: window.cpuDoMove, hand: window.cpuDoHandEffect, answer: window.cpuAnswerTask };

window.cpuDoSetup = function(){
  const b = brain();
  if(!b) return base.setup.apply(this, arguments);
  try{
    const me = state.setupPlayer;
    observeNow();
    const d = b.decideSetup(state, me);
    setupChooseHandCard(d.cardIdx);
    if(forbiddenBySetup(d.cell)){ state.task = null; return base.setup(); }
    setupPlaceOnCell(d.cell);
  }catch(e){ console.warn('[cpu] setup', e); if(state.task && state.task.type === 'setup-place') state.task = null; return base.setup(); }
};

window.cpuDoMove = function(){
  const b = brain();
  if(!b) return base.move.apply(this, arguments);
  return (async () => {
    const me = state.current, st = state;
    let m = null;
    try{ m = await b.decideMove(state, me, knowledge(me)); }catch(e){ console.warn('[cpu] move', e); }
    if(state !== st || state.gameOver || state.phase !== 'move' || state.current !== me) return;
    if(!m) return base.move();
    moveSelectDiscard(m.cardIdx);
    if(state.phase === 'move' && state.task && state.task.type === 'move-destination'){
      let d = m.dest;
      if(!state.task.reachable.has(d)) d = state.task.reachable.values().next().value;
      return moveExecuteDestination(d);
    }
  })();
};

window.cpuDoHandEffect = function(){
  const b = brain();
  if(!b) return base.hand.apply(this, arguments);
  return (async () => {
    const me = state.current, st = state;
    let h = null;
    try{ h = await b.decideHand(state, me, knowledge(me)); }catch(e){ console.warn('[cpu] hand', e); h = null; }
    if(state !== st || state.gameOver || state.phase !== 'hand-effect' || state.current !== me) return;
    return h === null || h === undefined ? handEffectSkip() : handEffectDiscard(h);
  })();
};

window.cpuAnswerTask = function(){
  const b = brain(), t = state && state.task;
  if(!b || !t) return base.answer.apply(this, arguments);
  let a;
  try{ a = b.answer(state, t, state.current, knowledge(state.current)); }
  catch(e){ console.warn('[cpu] task', t.tag, e); return base.answer(); }
  if(a === undefined || (a === null && t.kind === 'floor' && typeof t.filter === 'function')) return base.answer();
  resolveTask(a);
};

/* ---- スタート画面: CPU対戦の難易度を4つに ---- */
const origStart = window.renderStartScreen;
window.renderStartScreen = function(){
  const scr = origStart.apply(this, arguments);
  if(typeof pendingCpuLevel !== 'undefined' && pendingCpuLevel) return scr;
  const sel = scr.querySelector('.player-select');
  if(!sel) return scr;
  [...sel.querySelectorAll('button.cpu')].forEach(b => { if(/CPU対戦/.test(b.textContent)) b.remove(); });
  [['easy', ''], ['hard', ''], ['strong', ' strong'], ['oracle', ' oracle']].forEach(([lv, cls]) => {
    sel.appendChild(el('button', { class:'btn primary cpu b3-lv' + cls, title: lv === 'oracle' ? '裏向きのフロア・山札・あなたの手札まで見通す、ありえない強さのAI' : '',
      onclick: () => { pendingCpuLevel = lv; render(); } }, `CPU対戦(${LABEL[lv]})`));
  });
  return scr;
};
// 対戦中の名前に難易度を付ける(例: CPU(つよい))
const origInit = window.initGame;
window.initGame = function(vsCPU, cpuLevel){
  const r = origInit.apply(this, arguments);
  try{
    if(state && state.vsCPU && LABEL[state.cpuLevel] && state.players[state.cpuIndex].name === 'CPU'){
      state.players[state.cpuIndex].name = `CPU(${LABEL[state.cpuLevel]})`;
      render();
    }
  }catch(e){}
  return r;
};
window.BindCPU = { brains, LABEL, get seen(){ return seen; } };
})();
