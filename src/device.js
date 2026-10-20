/* =====================================================================
   端末に合わせる
   - スマホ(画面幅 860px 以下、または指で操作する端末)では、右上のボタンを「☰ メニュー」1つにまとめ、
     タップでドロップダウンを開く(ボタンが折り返して並ぶのを防ぐ)
   - 全画面表示(メニュー・スタート画面・設定)。iPhone の Safari は全画面にできないので、ホーム画面に追加する方法を案内する
   - 設定に「画質」(自動 / 高 / 中 / 低)。変えたら再読み込みで反映(adapter.js の QUALITY)
   ===================================================================== */
(function(){
'use strict';
const bar = document.getElementById('top-buttons-bar');
const root = document.documentElement;
const isPhone = () => matchMedia('(max-width: 860px)').matches || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820);
const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;

// b3-phone: スマホ / b3-portrait: スマホの縦向き(盤面を上に詰め、山札をそのすぐ下に置く)
const markPhone = () => {
  const ph = isPhone(), por = ph && innerHeight > innerWidth;
  document.body.classList.toggle('b3-phone', ph);
  const was = document.body.classList.contains('b3-portrait');
  document.body.classList.toggle('b3-portrait', por);
  const K = window.B3 && window.B3.K;
  if(K && K.viewInset && K.viewInset.alignTop !== por){ K.viewInset.alignTop = por; if(window.B3.layout) window.B3.layout(true); }
  if(was && !por) placeDeck(true);
};
addEventListener('resize', () => markPhone());

/* ---- スマホ縦: 山札のゲージを盤面のすぐ下に置く(上から 盤面 → 山札 → 効果欄 → 手札) ---- */
function placeDeck(reset){
  const d = document.querySelector('#app .deck-gauge-wrap');
  if(!d) return;
  const K = window.B3 && window.B3.K, cv = document.querySelector('.b3-canvas');
  const on = !reset && document.body.classList.contains('b3-portrait') && K && K.active && K.active() && cv && K.boardBox && K.boardBox.bottom > 0;
  if(!on){ if(d.dataset.b3placed){ d.style.cssText = ''; delete d.dataset.b3placed; } return; }
  const r = cv.getBoundingClientRect();
  const fan = document.querySelector('.b3-fan'), fr = fan && fan.getBoundingClientRect();
  let y = r.top + K.boardBox.bottom + 2;
  if(fr && y > fr.top - 30) y = fr.top - 30; // 効果欄に重ならないように
  d.dataset.b3placed = '1';
  Object.assign(d.style, { position:'fixed', left:'10px', right:'10px', top: Math.round(y) + 'px', margin:'0', maxWidth:'none', zIndex:'5' });
}
let placeN = 0;
(function loop(){ requestAnimationFrame(loop); if(++placeN % 4) return; placeDeck(); })();

/* ---- 手札・捨て札のプレート(頭上のゲージ)の表示 / 非表示 ---- */
let plates = true;
try{ plates = localStorage.getItem('bind3d.plates') !== '0'; }catch(e){}
const applyPlates = () => {
  document.body.classList.toggle('b3-no-plates', !plates);
  document.querySelectorAll('[data-b3plates]').forEach(b => { b.textContent = plates ? '▣ プレート' : '▢ プレート'; b.title = plates ? '手札・捨て札のプレートを隠す' : '手札・捨て札のプレートを出す'; b.classList.toggle('off', !plates); });
};
function togglePlates(){ plates = !plates; try{ localStorage.setItem('bind3d.plates', plates ? '1' : '0'); }catch(e){} applyPlates(); }
if(bar){
  const pb = document.createElement('button');
  pb.id = 'b3-plates-btn'; pb.type = 'button'; pb.dataset.b3plates = '1';
  pb.addEventListener('click', e => { e.stopPropagation(); togglePlates(); });
  bar.insertBefore(pb, bar.firstChild);
}
applyPlates();

/* ---- スマホ横: 縦向きを勧める ---- */
let landHintShown = false;
function landscapeHint(){
  const st = typeof state !== 'undefined' ? state : null;
  if(landHintShown || !document.body.classList.contains('b3-phone') || innerHeight > innerWidth || !st || !st.players || st.gameOver) return;
  landHintShown = true;
  hint('スマホは縦向きにすると、盤面・効果欄・手札が重ならず遊びやすくなります。');
}
addEventListener('resize', landscapeHint);
setInterval(landscapeHint, 3000);
markPhone();

/* ---- 全画面 ---- */
const fsSupported = !!(root.requestFullscreen || root.webkitRequestFullscreen);
const inFS = () => !!(document.fullscreenElement || document.webkitFullscreenElement) || standalone();
function hint(text){
  let n = document.getElementById('b3-hint');
  if(!n){ n = document.createElement('div'); n.id = 'b3-hint'; document.body.appendChild(n); n.addEventListener('click', () => n.remove()); }
  n.textContent = text;
  clearTimeout(hint.t); hint.t = setTimeout(() => n.remove(), 7000);
}
function toggleFullscreen(){
  if(document.fullscreenElement || document.webkitFullscreenElement){
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    return;
  }
  if(fsSupported){
    const req = root.requestFullscreen || root.webkitRequestFullscreen;
    try{
      const r = req.call(root, { navigationUI: 'hide' });
      // スマホは縦向きで遊ぶ前提(横向きは盤面・効果欄・手札が重なる)。縦に固定できる端末だけ固定する
      if(r && r.then) r.then(() => { try{ if(isPhone() && screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(() => {}); }catch(e){} }).catch(() => hint('全画面にできませんでした。ブラウザのメニューからお試しください。'));
    }catch(e){}
    return;
  }
  if(isIOS) hint('iPhone では、Safari の共有ボタン(□↑)→「ホーム画面に追加」から開くと、全画面のアプリとして遊べます。');
  else hint('このブラウザは全画面表示に対応していません。');
}
const fsLabel = () => (inFS() ? '⛶ 全画面を終了' : '⛶ 全画面');
['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => {
  document.querySelectorAll('[data-b3fs]').forEach(b => { b.textContent = fsLabel(); });
  setTimeout(() => { dispatchEvent(new Event('resize')); }, 200); // 盤面の大きさを合わせ直す
}));

/* ---- メニュー(スマホ) ---- */
let menuBtn = null, panel = null;
if(bar){
  menuBtn = document.createElement('button');
  menuBtn.id = 'b3-menu-btn'; menuBtn.type = 'button'; menuBtn.textContent = '☰ メニュー';
  panel = document.createElement('div'); panel.id = 'b3-menu'; panel.hidden = true;
  bar.appendChild(menuBtn); document.body.appendChild(panel);
  const close = () => { panel.hidden = true; menuBtn.classList.remove('on'); };
  const open = () => {
    panel.innerHTML = '';
    // 右上のボタン(音・設定・ログ・効果一覧・ルールブック・3D表示 など)をそのまま並べる。押すと元のボタンを押したことになる
    [...bar.querySelectorAll('button')].forEach(b => {
      if(b === menuBtn) return;
      const it = document.createElement('button'); it.type = 'button'; it.className = 'b3-menu-item';
      it.textContent = b.textContent.trim();
      it.addEventListener('click', () => { close(); b.click(); });
      panel.appendChild(it);
    });
    const fs = document.createElement('button'); fs.type = 'button'; fs.className = 'b3-menu-item'; fs.dataset.b3fs = '1';
    fs.textContent = fsLabel(); fs.addEventListener('click', () => { close(); toggleFullscreen(); });
    panel.appendChild(fs);
    const r = menuBtn.getBoundingClientRect();
    panel.style.top = Math.round(r.bottom + 6) + 'px';
    panel.style.right = Math.max(8, Math.round(innerWidth - r.right)) + 'px';
    panel.hidden = false; menuBtn.classList.add('on');
  };
  menuBtn.addEventListener('click', e => { e.stopPropagation(); panel.hidden ? open() : close(); });
  document.addEventListener('click', e => { if(!panel.hidden && !panel.contains(e.target) && e.target !== menuBtn) close(); });
  addEventListener('resize', close);
}

/* ---- スタート画面: スマホは全画面のボタンを出す ---- */
const origStart = window.renderStartScreen;
if(typeof origStart === 'function'){
  window.renderStartScreen = function(){
    const scr = origStart.apply(this, arguments);
    if(isPhone() && !inFS()){
      const b = el('button', { class:'btn b3-fs-start', type:'button', 'data-b3fs':'1', onclick: () => toggleFullscreen() }, fsLabel());
      const t = scr.querySelector('.subtitle') || scr.querySelector('h1');
      if(t && t.parentNode) t.parentNode.insertBefore(b, t.nextSibling); else scr.insertBefore(b, scr.firstChild);
    }
    return scr;
  };
}

/* ---- 設定: 画面と画質 ---- */
const QLABEL = { auto:'自動', high:'高', medium:'中', low:'低(軽い)' };
const QDESC = {
  high: '解像度2倍・影・観客の生物・光の粒すべて。性能の高いPC向け',
  medium: '解像度1.5倍・影は控えめ。ふつうのPC・タブレット向け',
  low: '解像度を抑え、影・観客・光の粒を止める。スマホや古いPC向け。画面が黒くなるときはこれ',
};
const origSettings = window.renderSettingsContent;
if(typeof origSettings === 'function'){
  window.renderSettingsContent = function(){
    origSettings.apply(this, arguments);
    const c = document.getElementById('settings-content');
    if(!c) return;
    c.appendChild(el('h2', {}, '画面と画質'));
    let saved = 'auto';
    try{ saved = localStorage.getItem('bind3d.quality') || 'auto'; }catch(e){}
    const now = window.BIND_QUALITY || 'high';
    const sel = el('select', { class:'b3-select' });
    ['auto', 'high', 'medium', 'low'].forEach(q => {
      const o = el('option', { value:q }, q === 'auto' ? `自動(この端末では「${QLABEL[now === 'low' ? 'low' : now]}」)` : QLABEL[q]);
      if(q === saved) o.selected = true;
      sel.appendChild(o);
    });
    const note = el('div', { class:'settings-desc' });
    const apply = el('button', { class:'btn', type:'button', onclick: () => location.reload() }, '今すぐ再読み込みして反映');
    apply.style.display = 'none';
    const describe = () => {
      const q = sel.value === 'auto' ? now : sel.value;
      note.textContent = `${QDESC[q] || ''}。変更は再読み込みで反映されます(対戦中なら最初からになります)。`;
      apply.style.display = sel.value !== saved ? '' : 'none';
    };
    sel.addEventListener('change', () => { try{ localStorage.setItem('bind3d.quality', sel.value); }catch(e){} describe(); });
    describe();
    c.appendChild(el('div', { class:'settings-row b3-qrow' }, el('div', {},
      el('div', { class:'settings-label' }, '画質'), sel, note, apply)));
    const fsBtn = el('button', { class:'btn', type:'button', 'data-b3fs':'1', onclick: () => toggleFullscreen() }, fsLabel());
    c.appendChild(el('div', { class:'settings-row b3-qrow' }, el('div', {},
      el('div', { class:'settings-label' }, '全画面表示'),
      el('div', { class:'settings-desc' }, isIOS && !fsSupported ? 'iPhone では「ホーム画面に追加」から開くと全画面になります。' : 'ブラウザのボタンやアドレスバーを隠して、画面いっぱいに表示します。'),
      fsBtn)));
  };
}
window.BindDevice = { toggleFullscreen, isPhone };
})();
