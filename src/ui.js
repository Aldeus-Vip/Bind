/* =====================================================================
   画面構成(2D / 3D 共通)
   - ターンの流れ(①〜⑥)を画面の左端に縦に並べる。上のボタンと重ならないよう上に余白を取る。
   - 右の欄(手番・効果・操作)をフィールドの上に重ねた「効果フレーム」にする(▲▼で開閉)。
   - 手札を画面の下に扇状に並べる(カーソルを当てたカードが上に突き出る。つまみで格納)。
   - CPU 対戦・オンライン対戦では相手の手札タブを出さず、自分の手札を常に表で見せる。
   - スタート画面のタイトルをロゴ画像に。
   元の render() のあとで DOM を組み替えるだけで、ゲームの処理には触れない。
   ===================================================================== */
(function(){
'use strict';
const LS = 'bind3d-ui';
const opt = (() => { try{ return Object.assign({ frameOpen:true, handOpen:true, color:'#c9a24b' }, JSON.parse(localStorage.getItem(LS) || '{}')); }catch(e){ return { frameOpen:true, handOpen:true, color:'#c9a24b' }; } })();
const save = () => { try{ localStorage.setItem(LS, JSON.stringify(opt)); }catch(e){} };

/* ---- タイトルロゴ ---- */
const TEX = window.BIND_TEX || {};
if(TEX.logo){
  document.documentElement.style.setProperty('--b3-logo', `url("${TEX.logo}")`);
  document.documentElement.classList.add('b3-has-logo');
}

/* ---- サイトの背景: 封じられた生き物たちの力で、森・水・炎・秘術がまだらに交じる大地 ----
   フロアと同じ大地の絵を暗く敷き、その上に自然の色の霞と、ゆっくり漂う光の粒(花粉・水の粒・火の粉・術の光)を重ねる */
if(TEX.ground) document.documentElement.style.setProperty('--b3-ground', `url("${TEX.ground}")`);
(function motes(){
  const lite = !!(window.B3 && window.B3.K && window.B3.K.LITE);
  const reduce = lite || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); // 軽量モードでは光の粒を止める
  const cv = document.createElement('canvas');
  cv.id = 'b3-motes';
  document.body.insertBefore(cv, document.body.firstChild);
  const g = cv.getContext('2d');
  const COLORS = ['158,214,120', '120,190,255', '255,150,70', '190,130,255', '255,226,150'];
  let W = 0, H = 0, list = [];
  const make = () => ({ x:Math.random()*W, y:Math.random()*H, r:0.8 + Math.random()*2.2, c:COLORS[Math.floor(Math.random()*COLORS.length)],
    vx:(Math.random()-.5)*0.12, vy:-0.05 - Math.random()*0.18, ph:Math.random()*6.3, a:0.25 + Math.random()*0.45 });
  const fit = () => { W = cv.width = innerWidth; H = cv.height = innerHeight; list = Array.from({ length: Math.round(W*H/26000) }, make); };
  fit(); addEventListener('resize', fit);
  let last = 0;
  (function draw(now){
    requestAnimationFrame(draw);
    if(reduce || now - last < 33) return; // 30fps で十分
    last = now;
    g.clearRect(0, 0, W, H);
    for(const m of list){
      m.x += m.vx + Math.sin(now/1700 + m.ph)*0.12; m.y += m.vy;
      if(m.y < -10){ m.y = H + 10; m.x = Math.random()*W; }
      if(m.x < -10) m.x = W + 10; else if(m.x > W + 10) m.x = -10;
      const a = m.a*(0.6 + 0.4*Math.sin(now/900 + m.ph));
      const gr = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r*4);
      gr.addColorStop(0, `rgba(${m.c},${a})`); gr.addColorStop(1, `rgba(${m.c},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(m.x, m.y, m.r*4, 0, Math.PI*2); g.fill();
    }
  })(0);
})();

/* ---- 自分の手札だけを見せる(CPU 対戦・オンライン対戦) ---- */
function myIndex(){
  if(typeof state === 'undefined' || !state) return null;
  const net = window.BindNet;
  if(net && net.active) return net.bot ? null : net.me;
  if(state.vsCPU) return 1 - state.cpuIndex;
  return null; // 2人で1台: 元のタブ表示のまま
}
const origHand = window.renderHandSection;
window.renderHandSection = function(){
  const me = myIndex();
  if(me == null) return origHand.apply(this, arguments);
  selectedHandTab = me;
  const pl = state.players[me];
  if(pl.hand.some(c => !c)) pl.hand = pl.hand.filter(Boolean);
  const mine = state.current === me;
  const canMove = mine && state.phase === 'move' && !state.task;
  const canEffect = mine && state.phase === 'hand-effect' && !state.task;
  const rowProps = { class:'hand-row' };
  if(mine) rowProps.id = 'main-hand-row'; // ドロー演出のアンカー先
  return el('div', { class:'hand-section' },
    el('h3', {}, `あなたの手札(${pl.hand.length}枚)`),
    el('div', rowProps, ...pl.hand.map((c, i) => canMove ? cardButton(c, () => moveSelectDiscard(i))
                                           : canEffect ? cardButton(c, () => handEffectDiscard(i))
                                           : cardStatic(c))));
};

/* ---- プレイヤーの色: 対戦前に自分の色を選ぶ。CPU はグレー ----
   PLAYER_COLORS(元の配列)の中身を書き換える。駒の足元の輪・パネルの枠・頭上ゲージはこの配列を見る。
   オンライン対戦では互いの色を送り合う(online.js)。同じ色なら相手側を別の色にする */
const PALETTE = [
  ['#c9a24b', '金'], ['#c0464c', '紅'], ['#3fa39b', '翠'], ['#8b5cd6', '紫'], ['#3f86d8', '蒼'], ['#d4689a', '桜'], ['#e07a2e', '橙'],
];
const CPU_GRAY = '#8d8d8d';
const DEFAULT_COLORS = (typeof PLAYER_COLORS !== 'undefined') ? PLAYER_COLORS.slice() : ['#c9a24b', '#b2454a'];
const otherColor = mine => (PALETTE.find(([c]) => c !== mine && c !== '#c9a24b') || PALETTE[1])[0];
function applyColors(){
  if(typeof PLAYER_COLORS === 'undefined' || typeof state === 'undefined' || !state || !state.players) return;
  const net = window.BindNet, mine = opt.color;
  let cols;
  if(net && net.active && !net.bot){
    const peer = net.peerColor && net.peerColor !== mine ? net.peerColor : otherColor(mine);
    cols = [0, 1].map(p => p === net.me ? mine : peer);
  } else if(net && net.active){
    cols = DEFAULT_COLORS.slice();
  } else if(state.vsCPU){
    cols = [0, 1].map(p => p === state.cpuIndex ? CPU_GRAY : mine);
  } else {
    cols = [mine, DEFAULT_COLORS[1] !== mine ? DEFAULT_COLORS[1] : otherColor(mine)];
  }
  cols.forEach((c, i) => { PLAYER_COLORS[i] = c; });
}
// スタート画面に色の選択欄
const origStart = window.renderStartScreen;
window.renderStartScreen = function(){
  const scr = origStart.apply(this, arguments);
  if(typeof pendingCpuLevel !== 'undefined' && pendingCpuLevel) return scr;
  const row = el('div', { class:'b3-colors' }, el('span', { class:'b3-colors-label' }, 'あなたの色'));
  PALETTE.forEach(([c, name]) => {
    const b = el('button', { type:'button', class:'b3-swatch' + (c === opt.color ? ' on' : ''), title:name, style:`--sw:${c}`,
      onclick: () => { opt.color = c; save(); row.querySelectorAll('.b3-swatch').forEach(x => x.classList.toggle('on', x === b)); if(window.BindNet && BindNet.sendColor) BindNet.sendColor(); } });
    row.appendChild(b);
  });
  const sel = scr.querySelector('.player-select');
  if(sel) sel.parentNode.insertBefore(row, sel); else scr.appendChild(row);
  return scr;
};

/* ---- 組み替え ---- */
let lastTask = null;
function arrange(){
  const gs = document.querySelector('#app > .game-screen');
  document.body.classList.toggle('b3-ui', !!gs);
  if(!gs) return;
  const right = gs.querySelector(':scope > .right-column');
  const center = gs.querySelector(':scope > .center-column');
  if(!right || !center) return;
  const hand = right.querySelector(':scope > .hand-section') || right.querySelector(':scope > .hand-row');
  if(hand) hand.remove();

  // 効果フレーム(簡略版): [手番] [パーソナル] | [効果のカード印] [何を選ぶかの短い文] [ボタン] [▲▼]
  // 効果の詳しい説明は、カードの印・パーソナルの札にカーソルを当てると出る
  const task = typeof state !== 'undefined' && state ? state.task : null;
  if(task && task !== lastTask && !opt.frameOpen){ opt.frameOpen = true; save(); }
  lastTask = task;
  const head = right.querySelector('.mid-info-row');
  const phaseTag = head && head.querySelector('.phase-tag');
  const personal = head && head.querySelector('.personal-indicator .card');
  const danger = !!right.querySelector('.task-banner.danger');
  const msgEl = right.querySelector('.task-message') || right.querySelector('.hint');
  const msg = msgEl ? shorten(msgEl.textContent) : '';
  const buttons = [...right.querySelectorAll('button')];
  buttons.forEach(b => { b.textContent = shortLabel(b.textContent); b.classList.add('b3-act'); });

  const frame = el('div', { class:'b3-frame' + (opt.frameOpen ? '' : ' closed') + (danger ? ' danger' : '') });
  const toggle = el('button', { class:'b3-frame-toggle', type:'button', title: opt.frameOpen ? '格納' : '展開',
    onclick: () => { opt.frameOpen = !opt.frameOpen; save(); frame.classList.toggle('closed', !opt.frameOpen); toggle.textContent = opt.frameOpen ? '▲' : '▼'; } },
    opt.frameOpen ? '▲' : '▼');
  const bar = el('div', { class:'b3-frame-bar' });
  if(phaseTag) bar.appendChild(phaseTag);
  if(personal){
    const pc = cardOfPersonal();
    personal.classList.add('b3-pers');
    if(pc) hoverTip(personal, () => cardTipHTML(pc));
    bar.appendChild(personal);
  }
  const body = el('div', { class:'b3-frame-body' });
  const icon = effectIcon();
  if(icon) body.appendChild(icon);
  if(msg) body.appendChild(el('span', { class:'b3-msg' }, msg));
  if(buttons.length) body.appendChild(el('span', { class:'b3-btns' }, ...buttons));
  bar.appendChild(body);
  bar.appendChild(toggle);
  frame.appendChild(bar);
  right.remove();

  // 画面の下: 効果欄(1行)+ その下に扇状の手札。格納ボタンは手札の左右の端。格納しても効果欄は残る
  const fan = el('div', { class:'b3-fan' + (opt.handOpen ? '' : ' closed') + (hand ? '' : ' no-hand') });
  fan.appendChild(frame);
  if(hand){
    const tray = el('div', { class:'b3-tray' });
    const row = hand.classList.contains('hand-row') ? hand : hand.querySelector('.hand-row');
    const flip = () => { opt.handOpen = !opt.handOpen; save(); fan.classList.toggle('closed', !opt.handOpen); };
    ['l', 'r'].forEach(side => tray.appendChild(el('button', { class:'b3-fan-toggle ' + side, type:'button', title:'手札の表示 / 格納', onclick: flip })));
    tray.appendChild(hand);
    fan.appendChild(tray);
    if(row) fanLayout(row);
  }
  gs.appendChild(fan);
}

/* ---- 扇の並べ方: 枚数が増えても端のカードが画面の下へ沈まないよう、角度・間隔・沈み込みを枚数で縮める ----
   端のカードの傾きは ±18° まで、沈み込みは 10px まで、扇の幅は画面からはみ出さない範囲(最大 900px)まで */
function fanLayout(row){
  const cards = [...row.children], n = cards.length, half = Math.max(1, (n - 1)/2);
  // 扇の中心(フィールドの列の中央)から左右どちらにも画面からはみ出さない幅
  const col = document.querySelector('#app > .game-screen > .center-column');
  const cx = col ? col.getBoundingClientRect().left + col.getBoundingClientRect().width/2 : innerWidth/2;
  const ang = Math.min(7, 18/half), sag = Math.min(4, 10/(half*half));
  const swing = 2*275*Math.sin(ang*half*Math.PI/180); // 傾けた端のカードが横へ張り出す分(回転の支点はカードの下 約 275px)
  const maxW = Math.min(2*Math.min(cx, innerWidth - cx) - 40, innerWidth*0.7, 900) - 76 - swing;
  const dx = n > 1 ? Math.max(14, Math.min(58, maxW/(n - 1))) : 0;
  cards.forEach((c, i) => { c.style.setProperty('--i', i - (n - 1)/2); c.style.zIndex = i + 1; });
  row.style.setProperty('--dx', dx.toFixed(1) + 'px');
  row.style.setProperty('--ang', ang.toFixed(2) + 'deg');
  row.style.setProperty('--sag', sag.toFixed(2) + 'px');
  row.style.width = Math.max(3*62 + 40, dx*(n - 1) + 76 + 60).toFixed(0) + 'px';
}

/* ---- 効果フレームの部品 ---- */
const LABEL = { '山札から1枚引く':'ドロー', 'スキップする':'スキップ', '決定':'OK', 'キャンセル':'キャンセル' };
function shortLabel(t){
  t = t.trim();
  const m = t.match(/^決定\s*\((\d+)枚選択中\)$/);
  if(m) return `OK(${m[1]})`;
  return LABEL[t] || t;
}
function shorten(t){
  return String(t).replace(/^[←\s]+/, '').replace(/^[^::。]{0,14}効果[::]\s*/, '')
    .replace(/([^)]*)/g, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}
const listOf = kind => { try{ return kind === 'suit' ? SUIT_EFFECT_LIST : NUMBER_EFFECT_LIST; }catch(e){ return []; } };
const findEff = (kind, key) => listOf(kind).find(e => String(e.key) === String(key));
const esc = t => String(t).replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
function effRow(e){ return e ? `<div class="t-row"><b>${esc(e.label)}</b><span>${esc(e.text)}</span></div>` + (e.target ? `<div class="t-sel">選ぶもの: ${esc(e.target)}</div>` : '') : ''; }
function cardTipHTML(card){
  const num = findEff('number', card.suit === 'JOKER' ? 'JOKER' : card.rank);
  const suit = card.suit === 'JOKER' ? null : findEff('suit', card.suit);
  return effRow(num) + (suit ? `<div class="t-row t-suit"><b>${esc(suit.label)}</b><span>${esc(suit.text)}</span></div>` : '');
}
function cardOfPersonal(){ try{ return state.players[state.current].personalCard; }catch(e){ return null; } }
// 発動中の効果: カードの印(枠つき)+「〜の効果」。カーソルで説明
function effectIcon(){
  const ae = typeof state !== 'undefined' && state ? state.activeEffect : null;
  if(!ae) return null;
  const isNum = ae.kind === 'number';
  const e = findEff(isNum ? 'number' : 'suit', ae.key);
  const mark = isNum ? (ae.key === 'JOKER' ? '★' : rankLabel(ae.key)) : SUIT_SYMBOL[ae.key];
  const red = !isNum && (ae.key === 'H' || ae.key === 'D');
  const name = isNum ? (ae.key === 'JOKER' ? 'JOKER' : rankLabel(ae.key)) : SUIT_SYMBOL[ae.key];
  const node = el('span', { class:'b3-eff' },
    el('span', { class:'b3-eff-card' + (red ? ' red' : '') + (isNum ? '' : ' suit') }, mark),
    el('span', { class:'b3-eff-name' }, `${name}の効果`));
  if(e) hoverTip(node, () => effRow(e));
  return node;
}
function hoverTip(node, html){
  node.addEventListener('mouseenter', () => {
    const tip = document.getElementById('b3-tip'); if(!tip) return;
    tip.innerHTML = html(); tip.style.display = '';
    const r = node.getBoundingClientRect(), w = tip.offsetWidth;
    tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width/2 - w/2)) + 'px';
    const h = tip.offsetHeight;
    tip.style.top = (r.top - h - 10 > 8 ? r.top - h - 10 : r.bottom + 10) + 'px'; // 画面の下にあるので、ふつうは上に出す
  });
  node.addEventListener('mouseleave', () => { const tip = document.getElementById('b3-tip'); if(tip) tip.style.display = 'none'; });
}
const origRender = window.render;
window.render = function(){
  try{ applyColors(); }catch(e){}
  const r = origRender.apply(this, arguments);
  try{ arrange(); }catch(e){ console.error('[ui] arrange', e); }
  return r;
};

/* ---- 今操作できる場所を明るく、それ以外を少し暗く ----
   field : フロアを選ぶ(選べるマスが光り、ほかのマスと手元は少し暗く)
   gauge : 手札・捨て札を選ぶ(頭上ゲージ・プレイヤー欄がゆっくり明滅、盤面は少し暗く)
   panel : 効果欄のボタンで操作(ドロー・2択など。効果欄が光り、盤面と手札は少し暗く)
   hand  : 手札から1枚選ぶ(手札が光り、盤面は少し暗く)
   暗くするのは「見ながら判断できる」程度まで。明滅はゆっくり(約 1.6 秒)で、動きを減らす設定では止める */
const FOCUS = ['field', 'gauge', 'panel', 'hand'];
function focusMode(){
  const st = typeof state !== 'undefined' ? state : null;
  if(!st || !st.players || st.gameOver) return '';
  if(typeof animationsInFlight !== 'undefined' && animationsInFlight > 0) return '';
  const actor = st.phase === 'setup-personal' ? st.setupPlayer : st.current;
  const me = myIndex();
  if(me != null ? actor !== me : (st.vsCPU && actor === st.cpuIndex)) return '';
  const t = st.task;
  if(t){
    if(t.type === 'move-destination' || t.type === 'setup-place' || t.kind === 'floor' || t.kind === 'floor-multi') return 'field';
    if(['hand-slot', 'hand-area', 'discard', 'discard-of', 'discard-multi'].includes(t.kind)) return 'gauge';
    if(st.phase === 'setup-personal') return 'field';
    return 'panel';
  }
  if(st.phase === 'draw') return 'panel';
  if(st.phase === 'move' || st.phase === 'hand-effect' || st.phase === 'setup-personal') return 'hand';
  return '';
}
let focusNow = null;
function applyFocus(){
  const m = focusMode();
  if(m === focusNow) return;
  focusNow = m;
  FOCUS.forEach(k => document.body.classList.toggle('b3-focus-' + k, k === m));
  const K = window.B3 && window.B3.K;
  if(K && K.focus) K.focus.field = m === 'field';
}

// 扇はフィールドの列の真ん中に合わせる(画面の下端に固定)。効果フレームと扇はフィールドに重ねるだけで、盤面の大きさは変えない
(function place(){
  requestAnimationFrame(place);
  const fan = document.querySelector('.b3-fan');
  const col = document.querySelector('#app > .game-screen > .center-column');
  if(fan && col){ const r = col.getBoundingClientRect(); fan.style.left = (r.left + r.width/2).toFixed(0) + 'px'; }
  applyFocus();
  // 3D の盤面を、効果欄の1行分だけ上へずらす(盤面の大きさは変えない)
  const B = window.B3, K = B && B.K, frame = fan && fan.querySelector('.b3-frame');
  if(K && K.viewInset && K.active()){
    const lift = frame ? Math.round(frame.offsetHeight) : 0;
    if(Math.abs(lift - (K.viewInset.lift || 0)) > 2){ K.viewInset.lift = lift; B.layout(true); }
  }
})();
window.B3UI = { opt, arrange, myIndex };
if(typeof render === 'function' && document.getElementById('app')) try{ arrange(); }catch(e){}
})();
