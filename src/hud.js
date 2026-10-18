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

// 駒の真上ではなく横(頭上カードの反対側)に置き、奥のマスにも駒の体にも重なりにくくする
function headPx(ch){
  const v = ch.root.position.clone(); v.y += (ch.av ? ch.av.badgeY : 1.1)*0.78;
  // 画面上の左・手前へずらす(カメラを回しても駒の左横に出る)
  const yaw = K.cam ? K.cam.yaw : 0, c = Math.cos(yaw), s = Math.sin(yaw);
  v.x += -0.5*c + 0.12*s; v.z += 0.5*s + 0.12*c;
  return K.boardPx(v);
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
  const t = performance.now()/1000;
  huds.forEach(h => {
    const ch = K.chars[h.p], pl = st.players[h.p];
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
/* ---- 先読み: 手札のカードにカーソルを合わせると、盤面に結果を先に見せる ----
   青緑 = そのカードを捨てたときに移動できるマス(安全なマスが無ければ赤 = 落ちるマス)
   赤   = 相手の駒の隣(差分1で届くマス)。相手の手札は見えないので、すぐ届く範囲だけを示す
   重なるマスは橙。自分の手番で、手札の中身が見えるときだけ。 */
const C_MINE = 0x5fe0d0, C_LETHAL = 0xff3b3b, C_OPP = 0xd8463a, C_BOTH = 0xffa040;
let previewIdx = null;
function computePreview(handIdx){
  const st = state, p = st.current, pl = st.players[p], card = pl.hand[handIdx];
  if(!card || pl.personalIndex == null) return null;
  let diff = Math.abs(cardValue(card) - cardValue(pl.personalCard));
  if(pl.bound && diff >= 2) diff = 1;
  const out = new Map();
  if(diff > 0){
    const reach = reachableAfterSteps(pl.personalIndex, diff, p);
    const origin = pl.personalIndex;
    const safe = [...reach].filter(i => i === origin ? (st.floor[i] === null || !st.floor[i].faceUp) : (st.windCells.has(i) || st.floor[i] === null || !st.floor[i].faceUp));
    (safe.length ? safe : [...reach]).forEach(i => out.set(i, safe.length ? C_MINE : C_LETHAL));
  }
  // 相手がすぐ届く範囲(差分1 = 隣のマス)
  st.players.forEach((op, q) => {
    if(q === p || op.personalIndex == null) return;
    const near = reachableAfterSteps(op.personalIndex, 1, q);
    near.forEach(i => out.set(i, out.has(i) && out.get(i) === C_MINE ? C_BOTH : (out.get(i) || C_OPP)));
  });
  return out;
}
function setPreview(m){
  K.preview.clear();
  if(m) m.forEach((c, i) => K.preview.set(i, c));
}
document.addEventListener('mouseover', e => {
  const cardEl = e.target.closest && e.target.closest('.right-column .hand-row .card');
  let idx = null;
  if(cardEl && typeof state !== 'undefined' && state && !state.gameOver && K.active()
     && (state.phase === 'move' || state.phase === 'hand-effect') && viewerCanSee(state.current)
     && !(state.task && state.task.type !== 'move-destination')){
    idx = [...cardEl.parentNode.children].indexOf(cardEl);
  }
  if(idx === previewIdx) return;
  previewIdx = idx;
  try{ setPreview(idx != null && state.phase === 'move' ? computePreview(idx) : null); }catch(err){ setPreview(null); }
});
// 描き直し・手番の変化で消す
const origRender2 = window.render;
window.render = function(){ const r = origRender2.apply(this, arguments); if(!state || state.phase !== 'move'){ previewIdx = null; setPreview(null); } return r; };

B.hud = { opt, huds, computePreview };
})();
