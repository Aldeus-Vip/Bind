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
const opt = (() => { try{ return Object.assign({ frameOpen:true, handOpen:true }, JSON.parse(localStorage.getItem(LS) || '{}')); }catch(e){ return { frameOpen:true, handOpen:true }; } })();
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
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
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

  // 効果フレーム: 見出し(手番・パーソナル)+ 開閉ボタン / 本体(効果・操作)
  // 新しい選択(タスク)が来たら、閉じていても開く
  const task = typeof state !== 'undefined' && state ? state.task : null;
  if(task && task !== lastTask && !opt.frameOpen){ opt.frameOpen = true; save(); }
  lastTask = task;
  const head = right.querySelector(':scope > .mid-info-row');
  const frame = el('div', { class:'b3-frame' + (opt.frameOpen ? '' : ' closed') });
  const toggle = el('button', { class:'b3-frame-toggle', type:'button', title: opt.frameOpen ? '効果フレームを格納' : '効果フレームを展開',
    onclick: () => { opt.frameOpen = !opt.frameOpen; save(); frame.classList.toggle('closed', !opt.frameOpen); toggle.textContent = opt.frameOpen ? '▲' : '▼'; } },
    opt.frameOpen ? '▲' : '▼');
  const top = el('div', { class:'b3-frame-head' });
  if(head) top.appendChild(head);
  top.appendChild(toggle);
  const body = el('div', { class:'b3-frame-body' });
  [...right.childNodes].forEach(n => body.appendChild(n));
  frame.appendChild(top);
  frame.appendChild(body);
  center.insertBefore(frame, center.firstChild);
  right.remove();

  // 扇状の手札
  if(hand){
    const fan = el('div', { class:'b3-fan' + (opt.handOpen ? '' : ' closed') });
    const row = hand.classList.contains('hand-row') ? hand : hand.querySelector('.hand-row');
    const title = hand.querySelector(':scope > h3');
    const label = title ? title.textContent : '手札';
    const grip = el('button', { class:'b3-fan-grip', type:'button', title:'手札の表示 / 格納',
      onclick: () => { opt.handOpen = !opt.handOpen; save(); fan.classList.toggle('closed', !opt.handOpen); } }, label);
    fan.appendChild(grip);
    fan.appendChild(hand);
    if(row){
      const cards = [...row.children], n = cards.length;
      cards.forEach((c, i) => { c.style.setProperty('--i', i - (n - 1)/2); c.style.zIndex = i + 1; });
      row.style.setProperty('--n', n);
    }
    gs.appendChild(fan);
  }
}
const origRender = window.render;
window.render = function(){
  const r = origRender.apply(this, arguments);
  try{ arrange(); }catch(e){ console.error('[ui] arrange', e); }
  return r;
};

// 扇はフィールドの列の真ん中に合わせる(画面の下端に固定)
(function place(){
  requestAnimationFrame(place);
  const fan = document.querySelector('.b3-fan');
  const col = document.querySelector('#app > .game-screen > .center-column');
  if(fan && col){ const r = col.getBoundingClientRect(); fan.style.left = (r.left + r.width/2).toFixed(0) + 'px'; }
  fitBoard(fan);
})();
// 3D の盤面は、効果フレームの下・手札の上の帯に収まるようにカメラをずらす(手札は半分まで重ねてよい)
function fitBoard(fan){
  const B = window.B3, K = B && B.K;
  if(!K || !K.viewInset || !K.active()) return;
  const grid = document.getElementById('floor-grid-el'), frame = document.querySelector('.b3-frame');
  if(!grid) return;
  const g = grid.getBoundingClientRect();
  const top = frame ? Math.max(0, frame.getBoundingClientRect().bottom - g.top) : 0;
  const bottom = fan ? Math.max(0, (g.bottom - fan.getBoundingClientRect().top)*0.5) : 0;
  if(Math.abs(top - K.viewInset.top) > 6 || Math.abs(bottom - K.viewInset.bottom) > 6){
    K.viewInset.top = top; K.viewInset.bottom = bottom;
    B.layout(true);
  }
}

window.B3UI = { opt, arrange, myIndex };
if(typeof render === 'function' && document.getElementById('app')) try{ arrange(); }catch(e){}
})();
