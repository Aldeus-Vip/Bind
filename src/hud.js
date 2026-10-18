/* =====================================================================
   頭上ゲージ(3D表示のときだけ)
   - パーソナルの頭上に 手札枚数(緑 / 1枚以下で赤) と 捨て札枚数(ピンク) を数字とゲージで出す。
   - ゲージにカーソルを乗せると中身を確認できる(手札は見てよい人だけ。それ以外は枚数のみ)。
   - 効果の対象が 手札 / 捨て札 のとき、そのゲージが点滅し、選択欄が頭上に開く。
   - 設定「左の手札・捨て札パネルを隠す」で、従来のパネルを隠せる(対象選択は頭上で行う)。
   - 手札・捨て札に向かう演出は、すべてこのゲージ(=パーソナル)に向かう(adapter.js の panelPx)。
   ===================================================================== */
(function(){
'use strict';
if(!window.B3 || !window.B3.K) return;
const B = window.B3, K = B.K;
const LS = 'bind3d-hud';
const opt = (() => { try{ return Object.assign({ hidePanels:false }, JSON.parse(localStorage.getItem(LS) || '{}')); }catch(e){ return { hidePanels:false }; } })();
const save = () => { try{ localStorage.setItem(LS, JSON.stringify(opt)); }catch(e){} };
const MAXBAR = 10; // ゲージが満タンになる枚数
// アイコン: 手札 = 扇に広げたカード / 捨て札 = 重なったカードと下向きの矢印
const ICON_HAND = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
  <rect x="3.5" y="6" width="8" height="12" rx="1.3" transform="rotate(-18 7.5 12)"/>
  <rect x="8" y="4.5" width="8" height="12" rx="1.3"/>
  <rect x="12.5" y="6" width="8" height="12" rx="1.3" transform="rotate(18 16.5 12)" fill="rgba(0,0,0,.35)"/></svg>`;
const ICON_DISCARD = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
  <rect x="5" y="11" width="14" height="9" rx="1.3" transform="rotate(-6 12 15.5)"/>
  <rect x="5" y="13" width="14" height="8" rx="1.3" fill="rgba(0,0,0,.35)"/>
  <path d="M12 2.5v7M8.8 6.6 12 9.8l3.2-3.2"/></svg>`;

const root = document.createElement('div');
root.id = 'b3-hud';
root.style.display = 'none';
document.body.appendChild(root);

function viewerCanSee(p){
  if(!state) return false;
  if(window.BindNet && BindNet.active) return p === BindNet.me;
  if(state.vsCPU) return p !== state.cpuIndex;
  return p === state.current; // 2人で1台: 手番の人だけ
}

const huds = [0, 1].map(p => {
  const box = document.createElement('div');
  box.className = 'b3-gauge';
  // 持ち主の色(駒の足元の輪と同じプレイヤーカラー)で枠を付ける
  box.style.setProperty('--pc', (typeof PLAYER_COLORS !== 'undefined' && PLAYER_COLORS[p]) || '#c9a24b');
  box.innerHTML = `
    <div class="g-row g-hand" title="手札"><span class="g-ic">${ICON_HAND}</span><span class="g-num"></span><span class="g-bar"><i></i></span></div>
    <div class="g-row g-disc" title="捨て札"><span class="g-ic">${ICON_DISCARD}</span><span class="g-num"></span><span class="g-bar"><i></i></span></div>
    <div class="g-pop"></div>`;
  root.appendChild(box);
  const rows = { hand: box.querySelector('.g-hand'), discard: box.querySelector('.g-disc') };
  const pop = box.querySelector('.g-pop');
  let hoverPart = null;
  rows.hand.addEventListener('mouseenter', () => { hoverPart = 'hand'; });
  rows.discard.addEventListener('mouseenter', () => { hoverPart = 'discard'; });
  box.addEventListener('mouseleave', () => { hoverPart = null; });
  rows.hand.addEventListener('click', () => {
    if(typeof handAreaTaskFor === 'function' && handAreaTaskFor(p)) resolveTask(p); // Q: 手札欄そのものを選ぶ
  });
  return { p, box, rows, pop, get hoverPart(){ return hoverPart; }, popKey:null };
});

/* ---- 選択欄・中身の表示(頭上に開く) ---- */
function popContent(h){
  const p = h.p, pl = state.players[p];
  const dt = typeof discardTaskFor === 'function' ? discardTaskFor(p) : null;
  const ht = typeof handSlotTaskFor === 'function' ? handSlotTaskFor(p) : null;
  if(dt) return { key:'dt:' + pl.discard.length + ':' + (dt.selected ? dt.selected.length : 0), build: () => {
    const wrap = el('div', { class:'g-cards' }, ...pl.discard.map((c, idx) => {
      if(dt.kind === 'discard-multi'){
        if(!dt.selected) dt.selected = [];
        const on = dt.selected.includes(c);
        return cardButton(c, () => { const k = dt.selected.indexOf(c); if(k >= 0) dt.selected.splice(k, 1); else dt.selected.push(c); render(); }, `mini reachable ${on ? 'selected' : ''}`);
      }
      return cardButton(c, () => resolveTask(idx), 'mini reachable');
    }));
    return [el('div', { class:'g-title' }, '捨て札から選ぶ'), wrap];
  }};
  if(ht) return { key:'ht:' + pl.hand.length, build: () => {
    const wrap = el('div', { class:'g-cards' }, ...pl.hand.map((c, idx) => ht.filter(idx)
      ? el('div', { class:'card mini back-only reachable', onclick: () => resolveTask(idx) }, cardBackDiv('mini-back'))
      : el('div', { class:'card static mini back-only' }, cardBackDiv('mini-back'))));
    return [el('div', { class:'g-title' }, '手札から1枚選ぶ(中身は見えない)'), wrap];
  }};
  const part = h.hoverPart;
  if(part === 'discard') return { key:'hd:' + pl.discard.map(c => c.id).join(','), build: () => [
    el('div', { class:'g-title' }, `捨て札 ${pl.discard.length}枚`),
    el('div', { class:'g-cards' }, ...(pl.discard.length ? pl.discard.map(c => cardStatic(c, 'mini')) : [el('span', { class:'g-empty' }, 'なし')])),
  ]};
  if(part === 'hand'){
    const see = viewerCanSee(p);
    return { key:'hh:' + see + ':' + pl.hand.map(c => c.id).join(','), build: () => [
      el('div', { class:'g-title' }, `手札 ${pl.hand.length}枚` + (see ? '' : '(中身は見えない)')),
      el('div', { class:'g-cards' }, ...(pl.hand.length ? pl.hand.map(c => see ? cardStatic(c, 'mini') : el('div', { class:'card static mini back-only' }, cardBackDiv('mini-back'))) : [el('span', { class:'g-empty' }, 'なし')])),
    ]};
  }
  return null;
}

// パーソナルの数字カード(頭上の札)の左隣に置く。札の半分の幅 + 少しの隙間だけ左へ
const _v = new THREE.Vector3(), _r = new THREE.Vector3();
function headPx(ch){
  if(ch.badge && ch.badge.visible){
    ch.badge.getWorldPosition(_v);
    _r.setFromMatrixColumn(K.camera.matrixWorld, 0).multiplyScalar(0.14).add(_v); // カメラの右方向へ札の半分
    const a = K.boardPx(_v), b = K.boardPx(_r);
    return { x: a.x - Math.abs(b.x - a.x) - 6, y: a.y };
  }
  const v = ch.root.position.clone(); v.y += (ch.av ? ch.av.badgeY : 1.1);
  return K.boardPx(v);
}

/* ---- ゲージの半透明 ----
   マス(フロア)を選ぶ間は自動で半透明にし、カーソルにも反応しない(後ろのマスを選べる)。
   盤面右下の「◐」ボタンで切り替え: 選択中に押すとその選択の間だけ元に戻る / 通常時に押すと常に半透明。
   Shift キーを押している間も半透明。 */
let ghostManual = false, ghostRestore = null, shiftHeld = false;
const floorPick = st => !!(st.task && (st.task.type === 'move-destination' || st.task.kind === 'floor' || st.task.kind === 'floor-multi'));
function ghostNow(st){
  if(shiftHeld) return true;
  if(floorPick(st)) return ghostRestore !== st.task;
  return ghostManual;
}
addEventListener('keydown', e => { if(e.key === 'Shift') shiftHeld = true; });
addEventListener('keyup', e => { if(e.key === 'Shift') shiftHeld = false; });
addEventListener('blur', () => { shiftHeld = false; });
let ghostBtn = null;
function ensureGhostBtn(){
  if(ghostBtn) return;
  const bar = document.getElementById('b3-cam');
  if(!bar) return;
  ghostBtn = document.createElement('button');
  ghostBtn.type = 'button'; ghostBtn.textContent = '◐';
  ghostBtn.title = '頭上ゲージの半透明を切り替え(Shift を押している間も半透明)';
  ghostBtn.addEventListener('click', e => {
    e.stopPropagation();
    const st = state;
    if(st && floorPick(st)){ ghostRestore = ghostRestore === st.task ? null : st.task; }
    else ghostManual = !ghostManual;
  });
  bar.insertBefore(ghostBtn, bar.firstChild);
}

let visible = false;
function frame(){
  requestAnimationFrame(frame);
  const st = (typeof state !== 'undefined') ? state : null;
  const show = !!(st && st.players && !st.gameOver && st.phase !== 'setup-personal' && K.active());
  if(show !== visible){ visible = show; root.style.display = show ? '' : 'none'; }
  // パネルを隠す設定: 山札をフィールドの上へ、フィールドを左いっぱいまで広げる(配置フェーズも同じ配置)
  document.body.classList.toggle('b3-hide-panels', !!(st && !st.gameOver && K.active() && opt.hidePanels));
  if(!show) return;
  ensureGhostBtn();
  if(ghostBtn) ghostBtn.classList.toggle('on', ghostNow(st));
  const t = performance.now()/1000;
  huds.forEach(h => {
    const ch = K.chars[h.p], pl = st.players[h.p];
    if(typeof PLAYER_COLORS !== 'undefined' && PLAYER_COLORS[h.p]) h.box.style.setProperty('--pc', PLAYER_COLORS[h.p]);
    if(!pl || !ch.shown){ h.box.style.display = 'none'; return; }
    h.box.style.display = '';
    const q = headPx(ch);
    h.box.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px) translate(-100%, -50%)`;
    const nh = pl.hand.length, nd = pl.discard.length;
    h.rows.hand.querySelector('.g-num').textContent = nh;
    h.rows.discard.querySelector('.g-num').textContent = nd;
    h.rows.hand.querySelector('i').style.width = Math.min(100, nh / MAXBAR * 100) + '%';
    h.rows.discard.querySelector('i').style.width = Math.min(100, nd / MAXBAR * 100) + '%';
    h.rows.hand.classList.toggle('low', nh <= 1);
    // 効果の対象なら点滅
    const dt = typeof discardTaskFor === 'function' && discardTaskFor(h.p);
    const ht = typeof handSlotTaskFor === 'function' && handSlotTaskFor(h.p);
    const at = typeof handAreaTaskFor === 'function' && handAreaTaskFor(h.p);
    h.rows.hand.classList.toggle('target', !!(ht || at));
    h.rows.discard.classList.toggle('target', !!dt);
    h.box.classList.toggle('picking', !!(dt || ht));
    // 先読み(手札にカーソル): この効果で選ぶ手札・捨て札
    h.rows.hand.classList.toggle('pv', pvGauges.has(h.p + ':hand'));
    h.rows.discard.classList.toggle('pv', pvGauges.has(h.p + ':discard'));
    // 半透明: マスを選ぶ間(自動)/ ボタン / Shift を押している間。選択中のゲージは除く
    h.box.classList.toggle('ghost', ghostNow(st) && !(dt || ht || at));
    // 選択欄・中身
    const pc = popContent(h);
    if(!pc){ if(h.popKey){ h.pop.innerHTML = ''; h.popKey = null; } }
    else if(pc.key !== h.popKey){ h.popKey = pc.key; h.pop.innerHTML = ''; pc.build().forEach(n => h.pop.appendChild(n)); }
    h.pop.style.display = pc ? '' : 'none';
    h.box.classList.toggle('pop-below', q.y < 220); // 画面上端に近いときは下に開く
    // 画面の左右からはみ出さないように寄せる
    if(pc){ h.pop.style.setProperty('--dx', '0px'); const r = h.pop.getBoundingClientRect(); const dx = r.left < 8 ? 8 - r.left : (r.right > innerWidth - 8 ? innerWidth - 8 - r.right : 0); if(dx) h.pop.style.setProperty('--dx', dx.toFixed(0) + 'px'); }
  });
}
requestAnimationFrame(frame);

// 演出の行き先: 頭上ゲージの手札 / 捨て札の行
B.gaugePx = (p, part) => {
  if(!visible) return null;
  const h = huds[p]; if(!h || h.box.style.display === 'none') return null;
  const r = (part === 'discard' ? h.rows.discard : h.rows.hand).getBoundingClientRect();
  if(!r.width) return null;
  return { x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height };
};
// 選択欄が開いている間に描き直されたら作り直す
const origRender = window.render;
window.render = function(){ const r = origRender.apply(this, arguments); huds.forEach(h => { h.popKey = null; }); return r; };

/* ---- 設定 ---- */
const origSettings = window.renderSettingsContent;
if(typeof origSettings === 'function'){
  window.renderSettingsContent = function(){
    origSettings.apply(this, arguments);
    const c = document.getElementById('settings-content');
    if(!c) return;
    c.appendChild(el('h2', {}, '3D表示'));
    const cb = el('input', { type:'checkbox' });
    cb.checked = opt.hidePanels;
    cb.addEventListener('change', () => { opt.hidePanels = cb.checked; save(); });
    c.appendChild(el('label', { class:'settings-row' }, cb, el('div', {},
      el('div', { class:'settings-label' }, '手札・捨て札パネルを隠す'),
      el('div', { class:'settings-desc' }, '画面横のプレイヤーごとの手札・捨て札の表示を隠し、パーソナル頭上のゲージだけで確認します(ゲージにカーソルを乗せると中身を表示。効果の対象選択も頭上で行えます)。'))));
  };
}
/* ---- カーソルを当てたときの先読み ----
   手札のカード: 数字効果の説明と、その効果で選べるもの(マス = 効果の選択と同じ金の光、手札・捨て札 = ゲージが光る)
   パーソナル(盤面の駒): 何回でも動けるとしたときの移動範囲。奇数回と偶数回で届くマスが違えば分けて表示し、
     右クリックで切り替える。表向きのフロア(止まると負け)は赤。 */
const PICK = 0xffd27a, LETHAL = 0xff4a4a, SAFE = 0x5fe0d0;
const pvGauges = new Set();
const tip = document.createElement('div');
tip.id = 'b3-tip';
tip.style.display = 'none';
document.body.appendChild(tip);

const unowned = i => { const s = state.floor[i]; return s !== null && s.owner === null; };
const faceDown = i => unowned(i) && !state.floor[i].faceUp;
const faceUp = i => unowned(i) && state.floor[i].faceUp;
const cellsWhere = f => { const o = []; for(let i = 0; i < state.floor.length; i++) if(f(i)) o.push(i); return o; };
const empties = () => (typeof emptySlots === 'function' ? emptySlots() : []);
// その効果が発動したときに最初に選ぶもの(連鎖の先は、選んだカード次第なので出さない)
function effectTargets(card, p){
  const op = 1 - p, key = card.suit === 'JOKER' ? 'JOKER' : card.rank, r = { cells:[], gauges:[] };
  switch(key){
    case 1: { const pl = state.players[p];
      if(pl.personalIndex != null && neighbors8(pl.personalIndex).filter(faceDown).length <= 2) r.cells = empties().concat(cellsWhere(faceUp));
      break; }
    case 2: case 6: case 13: r.cells = cellsWhere(faceDown); break;
    case 3: case 11: r.cells = cellsWhere(faceUp); break;
    case 4: r.gauges.push([p, 'discard']); r.cells = empties(); break;
    case 5: case 10: r.gauges.push([op, 'hand']); break;
    case 7: r.cells = cellsWhere(unowned).concat(empties()); break;
    case 8: r.cells = state.players.map(q => q.personalIndex).filter(i => i != null); break;
    case 9: r.gauges.push([p, 'discard']); break;
    case 12: r.gauges.push([0, 'hand'], [1, 'hand']); break;
    case 'JOKER': r.cells = cellsWhere(unowned); r.gauges.push([op, 'hand']); break;
  }
  return r;
}
const effectOf = (list, key) => (Array.isArray(list) ? list.find(e => String(e.key) === String(key)) : null);
// 手札のカードの説明は扇の横(盤面の光を隠さない)、駒の説明はマスの上に出す
function showTip(html, anchor){
  tip.innerHTML = html; tip.style.display = '';
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const fan = anchor.closest && anchor.closest('.b3-fan');
  if(fan){
    const f = fan.getBoundingClientRect();
    let x = f.right + 12;
    if(x + w > innerWidth - 8) x = f.left - w - 12;
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = Math.max(8, innerHeight - h - 12) + 'px';
    return;
  }
  const r = anchor.getBoundingClientRect();
  tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width/2 - w/2)) + 'px';
  tip.style.top = Math.max(8, r.top - h - 14) + 'px';
}
const esc = t => String(t).replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));

let pvKey = null, range = null, parity = 1;
function clearPreview(){
  pvKey = null; range = null;
  K.preview.clear(); pvGauges.clear(); tip.style.display = 'none';
}
function cardPreview(card, p, anchor){
  const t = effectTargets(card, p);
  K.preview.clear(); pvGauges.clear();
  t.cells.forEach(i => K.preview.set(i, PICK));
  t.gauges.forEach(([q, part]) => pvGauges.add(q + ':' + part));
  const num = effectOf(window.NUMBER_EFFECT_LIST || (typeof NUMBER_EFFECT_LIST !== 'undefined' ? NUMBER_EFFECT_LIST : null), card.suit === 'JOKER' ? 'JOKER' : card.rank);
  const suit = card.suit === 'JOKER' ? null : effectOf(typeof SUIT_EFFECT_LIST !== 'undefined' ? SUIT_EFFECT_LIST : null, card.suit);
  let html = '';
  if(num) html += `<div class="t-row"><b>${esc(num.label)}</b><span>${esc(num.text)}</span></div>` + (num.target ? `<div class="t-sel">選ぶもの: ${esc(num.target)}</div>` : '');
  if(suit) html += `<div class="t-row t-suit"><b>${esc(suit.label)}</b><span>${esc(suit.text)}<em>(パーソナルになったとき)</em></span></div>`;
  if(html) showTip(html, anchor);
}
// 何回でも動けるとしたときの移動範囲(奇数回 / 偶数回)
function rangeOf(p){
  const pl = state.players[p], o = pl.personalIndex, odd = new Set(), even = new Set();
  for(let k = 1; k <= 2*state.floor.length; k++) reachableAfterSteps(o, k, p).forEach(i => (k % 2 ? odd : even).add(i));
  const same = odd.size === even.size && [...odd].every(i => even.has(i));
  return { p, odd, even, same };
}
function lethalCell(i){
  const s = state.floor[i];
  return !!(s && s.faceUp && !(state.windCells && state.windCells.has(i)));
}
function showRange(anchor){
  const cells = range.same || parity ? range.odd : range.even;
  K.preview.clear(); pvGauges.clear();
  cells.forEach(i => K.preview.set(i, lethalCell(i) ? LETHAL : SAFE));
  const who = state.players[range.p].name;
  const head = range.same ? `${esc(who)} の移動範囲` : `${esc(who)} の${parity ? '奇数' : '偶数'}移動範囲<em>(右クリックで${parity ? '偶数' : '奇数'}に切り替え)</em>`;
  showTip(`<div class="t-head">${head}</div><div class="t-sel">何回でも動けるとしたときに届くマス。<span class="t-red">赤</span>は表向きのフロア(止まると負け)。</div>`, anchor);
}

document.addEventListener('mouseover', e => {
  if(typeof state === 'undefined' || !state || state.gameOver || !state.players) return;
  const t = e.target;
  // 手札のカード
  const cardEl = t.closest && t.closest('.b3-fan .hand-row .card');
  if(cardEl && !cardEl.classList.contains('back-only')){
    const idx = [...cardEl.parentNode.children].indexOf(cardEl);
    const me = window.B3UI && window.B3UI.myIndex ? window.B3UI.myIndex() : null;
    const p = me != null ? me : (typeof selectedHandTab === 'number' ? selectedHandTab : state.current);
    const card = state.players[p] && state.players[p].hand[idx];
    const key = 'c' + p + ':' + idx + ':' + (card && card.id);
    if(key === pvKey) return;
    clearPreview(); pvKey = key;
    if(card) try{ cardPreview(card, p, cardEl); }catch(err){ clearPreview(); }
    return;
  }
  // パーソナルのいるマス
  const cell = t.closest && t.closest('.floor-cell');
  const ci = cell ? Number(String(cell.id).replace('floor-cell-', '')) : -1;
  const p = ci >= 0 ? state.players.findIndex(q => q.personalIndex === ci) : -1;
  if(p >= 0 && K.active()){
    const key = 'p' + p + ':' + ci;
    if(key === pvKey) return;
    clearPreview(); pvKey = key; parity = 1;
    try{ range = rangeOf(p); showRange(cell); }catch(err){ clearPreview(); }
    return;
  }
  if(pvKey) clearPreview();
});
// 右クリック(ドラッグしていないとき)で奇数 / 偶数を切り替える
let rdown = null;
document.addEventListener('pointerdown', e => { if(e.button === 2) rdown = { x:e.clientX, y:e.clientY }; }, true);
document.addEventListener('contextmenu', e => {
  if(!range || range.same) return;
  if(rdown && Math.hypot(e.clientX - rdown.x, e.clientY - rdown.y) > 6) return;
  e.preventDefault();
  parity = 1 - parity;
  const cell = document.getElementById('floor-cell-' + state.players[range.p].personalIndex);
  if(cell) showRange(cell);
});
// 描き直したら消す(カーソルを動かせば出し直す)
const origRender2 = window.render;
window.render = function(){ const r = origRender2.apply(this, arguments); clearPreview(); return r; };

B.hud = { opt, huds, effectTargets, rangeOf };
})();
