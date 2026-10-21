/* =====================================================================
   ビジュアル確認ツール(演出・モーションの動作確認用)
   - 公開サイトには含めない。npm run build:debug → dist/debug/(npm run debug で起動)
   - 好きな盤面を作り、本物の効果・移動をそのまま発動して見る。対象の選択は通常の画面で答える。
   - 3D の演出はスロー再生・一時停止できる(2D の演出と待ち時間は通常の速さのまま)。
   ===================================================================== */
(function(){
'use strict';
if(!window.B3 || !window.B3.K || typeof initGame !== 'function') return;
const B = window.B3, K = B.K;
const IDLE = 'personal-effect'; // 待機中のフェーズ(画面に操作ボタンを出さない)
const RANKS = [[1,'A'],[2,'2'],[3,'3'],[4,'4'],[5,'5'],[6,'6'],[7,'7'],[8,'8'],[9,'9'],[10,'10'],[11,'J'],[12,'Q'],[13,'K']];
const SUITS = [['H','♥'],['S','♠'],['D','♦'],['C','♣']];
let sel = 0;          // 操作するプレイヤー
let suit = 'H';       // パーソナルのスート
let mode = 'move';    // マスをクリックしたときの動作
let busy = false;
let saved = null;     // 保存した盤面
let pose = null;      // 姿勢を止めて見る

/* ---- 盤面 ---- */
const cardOf = (r, s) => r === 'JB' ? { suit:'JOKER', rank:null, id:'JOKER1' } : r === 'JW' ? { suit:'JOKER', rank:null, id:'JOKER2' } : { suit:s, rank:r, id:s + r + '-dbg' + Math.random().toString(36).slice(2, 6) };
function fresh(){
  initGame(false);
  const P = state.players;
  [[0, 7, cardOf(13, 'H')], [1, 12, cardOf(1, 'S')]].forEach(([p, cell, card]) => {
    P[p].personalCard = card; P[p].personalIndex = cell; state.floor[cell].owner = p; P[p].name = p ? 'P2' : 'P1';
  });
  fillHands();
  idle();
  log('盤面を初期化しました');
}
function idle(){ if(!state.gameOver){ state.phase = IDLE; state.activeEffect = null; } state.current = sel; render(); }
function fillHands(){
  state.players.forEach(pl => { while(pl.hand.length < 5){ const c = state.deck.pop() || cardOf(1 + Math.floor(Math.random()*13), 'HSDC'[Math.floor(Math.random()*4)]); pl.hand.push(c); } });
}
const clone = st => { const t = st.task; st.task = null; try{ return structuredClone(st); } finally { st.task = t; } };
function setPersonal(r){
  const pl = state.players[sel], card = cardOf(r, suit);
  if(pl.personalIndex == null){ const i = state.floor.findIndex(s => s && s.owner == null); pl.personalIndex = i; state.floor[i].owner = sel; }
  const old = pl.personalCard;
  if(q('#dbg-change').checked && old && typeof triggerChangeFlip === 'function'){
    run('チェンジ演出', async () => { await triggerChangeFlip(pl.personalIndex, old, card, sel); pl.personalCard = card; });
  } else { pl.personalCard = card; render(); }
}

/* ---- 実行(1つずつ。終わったら待機状態へ戻す) ---- */
async function run(name, fn){
  if(busy){ log('まだ前の演出が動いています'); return; }
  busy = true; refresh(); log('▶ ' + name);
  try{ state.current = sel; await fn(); log('✓ ' + name); }
  catch(e){ console.error(e); log('✗ ' + name + ': ' + e.message); }
  finally{ busy = false; if(state.task) state.task = null; idle(); refresh(); }
}
// 本物の移動: 移動先を1つだけ許したムーブとして実行する(チェンジ・パーソナル効果・表フロアでの敗北まで通しで動く)
async function realMove(dest){
  const pl = state.players[sel];
  if(!pl.hand.length) fillHands();
  state.current = sel; state.moveCtx = { cardIdx:0 };
  state.task = { type:'move-destination', reachable:new Set([dest]), diff:0 };
  await moveExecuteDestination(dest);
}
async function lookMove(dest, teleport){
  const pl = state.players[sel], from = pl.personalIndex;
  if(from == null || from === dest) return;
  if(teleport) await triggerTeleport(from, dest, sel);
  else {
    await triggerMoveTravel(from, dest, sel);
  }
  if(state.floor[from]) state.floor[from].owner = null;
  if(!state.floor[dest]) state.floor[dest] = { card:cardOf(1 + Math.floor(Math.random()*13), 'S'), faceUp:false, owner:null };
  state.floor[dest].owner = sel; pl.personalIndex = dest;
}

/* ---- マスのクリック(効果の対象選択中は通常どおりゲームへ渡す) ---- */
const holes = new Map();
addEventListener('click', e => {
  if(state && state.task) return;
  const el = e.target.closest && e.target.closest('[id^="floor-cell-"]');
  if(!el || !document.getElementById('floor-grid-el') || !document.getElementById('floor-grid-el').contains(el)) return;
  const i = +el.id.slice('floor-cell-'.length);
  if(!(i >= 0)) return;
  e.stopPropagation(); e.preventDefault();
  const pl = state.players[sel], slot = state.floor[i], other = state.players[1 - sel];
  if(mode === 'flip'){ if(slot && slot.owner == null){ slot.faceUp = !slot.faceUp; render(); } return; }
  if(mode === 'hole'){
    if(slot && slot.owner == null){ holes.set(i, slot); state.floor[i] = null; }
    else if(!slot){ state.floor[i] = holes.get(i) || { card:cardOf(5, 'H'), faceUp:false, owner:null }; }
    render(); return;
  }
  if(other.personalIndex === i) { log('相手のパーソナルがいるマスです'); return; }
  if(mode === 'place'){
    if(!slot) state.floor[i] = { card:cardOf(5, 'H'), faceUp:false, owner:null };
    if(pl.personalIndex != null && state.floor[pl.personalIndex]) state.floor[pl.personalIndex].owner = null;
    state.floor[i].owner = sel; pl.personalIndex = i; render(); return;
  }
  if(pl.personalIndex == null){ log('先に「置く」でパーソナルを置いてください'); return; }
  if(mode === 'move') run(`本物の移動 → ${i}`, () => realMove(i));
  else if(mode === 'look') run(`見た目だけの移動 → ${i}`, () => lookMove(i, false));
  else if(mode === 'tele') run(`テレポート → ${i}`, () => lookMove(i, true));
}, true);

/* ---- 姿勢を止めて見る(移動モーションの調整用) ---- */
function poseTick(){
  if(!pose) return;
  requestAnimationFrame(poseTick);
  const ch = B.chars[sel]; if(!ch || !ch.av || !ch.av.move) return;
  const kind = B.moveStyleOf(ch.avKey), v = +q('#dbg-pose').value/100;
  ch.busy = true;
  ch.root.rotation.y = +q('#dbg-yaw').value*Math.PI/180;
  const hop = /hop/.test(kind);
  ch.av.move(hop ? { kind, u:-1 + 3*v, lead:q('#dbg-lead').checked ? -1 : 1, t:K.now() }
                 : { kind, k:Math.min(1, v*2.5), d:K.now()*0.9, t:K.now() });
  q('#dbg-pose-label').textContent = hop ? `${kind}: ${v < 1/3 ? 'かがむ' : v < 2/3 ? '空中' : '着地'}` : `${kind}: 姿勢 ${Math.round(Math.min(1, v*2.5)*100)}%`;
}
function setPose(on){
  const ch = B.chars[sel];
  if(on){ pose = true; poseTick(); }
  else { pose = null; B.chars.forEach(c => { if(c.av && c.av.move) c.av.move(null); c.busy = false; }); }
}

/* ---- パネル ---- */
const css = `
#dbg{position:fixed;right:0;top:58px;bottom:0;width:300px;z-index:9000;overflow:auto;background:rgba(14,11,9,.94);color:#e8dcc0;
  font:12px/1.4 system-ui,sans-serif;border-left:1px solid #6b5530;padding:8px 10px 40px;box-sizing:border-box}
#dbg.min{width:34px;padding:6px 4px;overflow:hidden}
#dbg.min > :not(#dbg-min){display:none}
#dbg h3{margin:10px 0 4px;font-size:12px;color:#d9b45e;border-bottom:1px solid #4a3a22;padding-bottom:2px}
#dbg .row{display:flex;flex-wrap:wrap;gap:3px;margin:3px 0}
#dbg button{background:#2a221a;color:#efe2c4;border:1px solid #6b5530;border-radius:4px;padding:3px 6px;font:inherit;cursor:pointer;min-width:26px}
#dbg button:hover{background:#3a2e20}
#dbg button.on{background:#7a5a22;border-color:#e0b860;color:#fff}
#dbg button:disabled{opacity:.4;cursor:default}
#dbg label{display:flex;align-items:center;gap:4px;margin:2px 0}
#dbg input[type=range]{flex:1}
#dbg-log{margin-top:6px;max-height:140px;overflow:auto;background:#0a0807;border:1px solid #3a2e20;padding:4px;font:11px/1.35 monospace;white-space:pre-wrap}
#dbg-min{position:absolute;right:6px;top:6px}
#dbg .note{color:#a89878;font-size:11px}
body.dbg-on #app{margin-right:300px}
body.dbg-on.dbg-min-on #app{margin-right:34px}
`;
const q = s => document.querySelector(s);
function btn(label, fn, cls){ const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = fn; if(cls) b.className = cls; return b; }
function row(parent, items){ const r = document.createElement('div'); r.className = 'row'; items.forEach(i => r.appendChild(i)); parent.appendChild(r); return r; }
function h(parent, t){ const e = document.createElement('h3'); e.textContent = t; parent.appendChild(e); }
function note(parent, t){ const e = document.createElement('div'); e.className = 'note'; e.textContent = t; parent.appendChild(e); }
function log(t){ const l = q('#dbg-log'); if(!l) return; l.textContent = (t + '\n' + l.textContent).slice(0, 4000); }
const groups = {};
function radio(name, list, get, set, parent){
  const r = row(parent, list.map(([v, label]) => { const b = btn(label, () => { set(v); refresh(); }); b.dataset.v = v; return b; }));
  groups[name] = { r, get };
}
const effectBtns = [];
function refresh(){
  Object.values(groups).forEach(g => g.r.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(g.get()) === b.dataset.v)));
  effectBtns.forEach(b => b.disabled = busy);
}

function build(){
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const P = document.createElement('div'); P.id = 'dbg'; document.body.appendChild(P); document.body.classList.add('dbg-on');
  const m = btn('≡', () => { P.classList.toggle('min'); document.body.classList.toggle('dbg-min-on', P.classList.contains('min')); }); m.id = 'dbg-min'; P.appendChild(m);
  const title = document.createElement('div'); title.innerHTML = '<b style="color:#e8c070">ビジュアル確認ツール</b>'; P.appendChild(title);

  h(P, '操作するプレイヤー');
  radio('who', [[0, 'P1'], [1, 'P2']], () => sel, v => { sel = +v; idle(); }, P);

  h(P, 'パーソナル(生物)');
  radio('suit', SUITS, () => suit, v => suit = v, P);
  row(P, [...RANKS.map(([r, l]) => btn(l, () => setPersonal(r))), btn('黒JOKER', () => setPersonal('JB')), btn('白JOKER', () => setPersonal('JW'))]);
  const lc = document.createElement('label'); lc.innerHTML = '<input type="checkbox" id="dbg-change"> チェンジ演出で替える'; P.appendChild(lc);

  h(P, 'マスをクリックしたとき');
  radio('mode', [['move', '本物の移動'], ['look', '見た目だけ移動'], ['tele', 'テレポート'], ['place', '置く'], ['flip', '表/裏'], ['hole', '穴/戻す']], () => mode, v => mode = v, P);
  note(P, '本物の移動 = チェンジ・パーソナル効果・表フロアで燃える まで通しで動きます(手札を1枚捨てます)');

  h(P, '数字効果(本物)');
  row(P, [...RANKS.map(([r, l]) => { const b = btn(l, () => run(`数字効果 ${l}`, () => triggerNumberEffect(r, sel, 0))); effectBtns.push(b); return b; }),
    (() => { const b = btn('JOKER', () => run('JOKER の効果', () => triggerCardNumberEffect({ suit:'JOKER', rank:null, id:'JOKER1' }, sel, 0))); effectBtns.push(b); return b; })(),
    (() => { const b = btn('今のパーソナル', () => run('パーソナル効果', () => triggerCardNumberEffect(state.players[sel].personalCard, sel, 0))); effectBtns.push(b); return b; })()]);
  h(P, 'スート効果(本物)');
  row(P, SUITS.map(([s, l]) => { const b = btn(l, () => run(`スート効果 ${l}`, () => triggerSuitEffect(s, sel))); effectBtns.push(b); return b; }));
  note(P, '対象の選択は、ふだんの画面(マスや手札)で答えてください');

  h(P, '演出だけ');
  row(P, [
    (() => { const b = btn('敗北(燃える)', () => run('敗北の演出', () => triggerDefeatBurn(state.players[sel].personalIndex, sel))); effectBtns.push(b); return b; })(),
    btn('バインド 入/切', () => { const pl = state.players[sel]; pl.bound = !pl.bound; render(); }),
  ]);

  h(P, '盤面');
  row(P, [
    btn('初期化', () => { if(busy){ log('演出中です。止めるときは「中断して初期化」'); return; } fresh(); }),
    btn('全部裏', () => { state.floor.forEach(s => { if(s && s.owner == null) s.faceUp = false; }); render(); }),
    btn('手札を補充', () => { fillHands(); render(); }),
  ]);
  // 対象選択の待ちなどで止まったとき用(待っていた効果は捨てる)
  row(P, [btn('中断して初期化', () => { busy = false; if(state) state.task = null; fresh(); refresh(); })]);
  row(P, [
    btn('盤面を保存', () => { saved = clone(state); log('今の盤面を保存しました'); }),
    btn('保存した盤面に戻す', () => { if(busy) return; if(!saved){ log('まだ保存していません'); return; } state = clone(saved); idle(); log('保存した盤面に戻しました'); }),
  ]);

  h(P, '再生速度(3D の演出)');
  radio('speed', [[1, '1×'], [0.5, '½'], [0.25, '¼'], [0.1, '1/10'], [0, '停止']], () => K.timeScale, v => K.timeScale = +v, P);
  note(P, '2D の演出や効果の待ち時間は通常の速さのままです');

  h(P, '移動の姿勢を止めて見る');
  const lp = document.createElement('label'); lp.innerHTML = '<input type="checkbox" id="dbg-pose-on"> 止める'; P.appendChild(lp);
  lp.querySelector('input').onchange = e => setPose(e.target.checked);
  const ls = document.createElement('label'); ls.innerHTML = '進み <input type="range" id="dbg-pose" min="0" max="100" value="50">'; P.appendChild(ls);
  const ly = document.createElement('label'); ly.innerHTML = '向き <input type="range" id="dbg-yaw" min="0" max="360" value="90">'; P.appendChild(ly);
  const ll = document.createElement('label'); ll.innerHTML = '<input type="checkbox" id="dbg-lead"> 踏み切る脚を左右反対に(2足)'; P.appendChild(ll);
  const pl = document.createElement('div'); pl.id = 'dbg-pose-label'; pl.className = 'note'; P.appendChild(pl);

  const lg = document.createElement('div'); lg.id = 'dbg-log'; P.appendChild(lg);
  refresh();
}

function start(){
  if(typeof settings !== 'undefined'){ settings.moveAnim = true; settings.defeatAnim = true; settings.effectAnim = true; }
  build();
  fresh();
  // ゲームオーバー画面からは初期化で戻る
  window.BindDebug = { fresh, run, realMove, lookMove, get state(){ return state; } };
}
document.title = '[確認ツール] ' + document.title;
if(document.readyState === 'complete') setTimeout(start, 300); else addEventListener('load', () => setTimeout(start, 300));
})();
