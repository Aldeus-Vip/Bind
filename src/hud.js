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
  box.innerHTML = `
    <div class="g-row g-hand"><span class="g-ic">手</span><span class="g-num"></span><span class="g-bar"><i></i></span></div>
    <div class="g-row g-disc"><span class="g-ic">捨</span><span class="g-num"></span><span class="g-bar"><i></i></span></div>
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

function headPx(ch){
  const v = ch.root.position.clone(); v.y += (ch.av ? ch.av.badgeY : 1.1) + 0.42;
  return K.boardPx(v);
}

let visible = false;
function frame(){
  requestAnimationFrame(frame);
  const st = (typeof state !== 'undefined') ? state : null;
  const show = !!(st && st.players && !st.gameOver && st.phase !== 'setup-personal' && K.active());
  if(show !== visible){ visible = show; root.style.display = show ? '' : 'none'; }
  document.body.classList.toggle('b3-hide-panels', show && opt.hidePanels);
  if(!show) return;
  const t = performance.now()/1000;
  huds.forEach(h => {
    const ch = K.chars[h.p], pl = st.players[h.p];
    if(!pl || !ch.shown){ h.box.style.display = 'none'; return; }
    h.box.style.display = '';
    const q = headPx(ch);
    h.box.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px) translate(-50%, -100%)`;
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
B.hud = { opt, huds };
})();
