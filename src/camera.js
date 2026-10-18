/* =====================================================================
   カメラ操作(3D表示のときだけ)
   - 盤面をドラッグ(右ボタン・中ボタン、または左ボタンで少し動かす)= 回転 / 見下ろし角
   - ホイール・2本指のピンチ = ズーム
   - 盤面右下のボタン: 回転・角度・ズーム・初期位置に戻す
   - 位置は localStorage に保存。オンライン対戦でも自分の画面だけが変わる(同期しない)。
   ===================================================================== */
(function(){
'use strict';
if(!window.B3 || !window.B3.K || !window.B3.K.setCam) return;
const K = window.B3.K, cam = K.cam;
const ROT = 0.008, TILT = 0.006, DRAG_PX = 6;

const grid = () => document.getElementById('floor-grid-el');
const inGrid = e => { const g = grid(); return !!(g && K.active() && e.target && g.contains(e.target)); };

/* ---- ボタン ---- */
const bar = document.createElement('div');
bar.id = 'b3-cam';
const BTN = [
  ['⟲', '左へ回す', () => K.setCam({ yaw: cam.yaw - 0.3 })],
  ['⟳', '右へ回す', () => K.setCam({ yaw: cam.yaw + 0.3 })],
  ['▲', '上から見下ろす', () => K.setCam({ pitch: cam.pitch + 0.1 })],
  ['▼', '横から見る', () => K.setCam({ pitch: cam.pitch - 0.1 })],
  ['＋', 'ズームイン', () => K.setCam({ zoom: cam.zoom * 1.15 })],
  ['－', 'ズームアウト', () => K.setCam({ zoom: cam.zoom / 1.15 })],
  ['⌂', '初期位置に戻す', () => K.setCam(K.CAM0)],
];
BTN.forEach(([label, title, fn]) => {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = label; b.title = title;
  b.addEventListener('click', e => { e.stopPropagation(); fn(); });
  bar.appendChild(b);
});
document.body.appendChild(bar);

(function place(){
  requestAnimationFrame(place);
  const g = grid();
  const st = (typeof state !== 'undefined') ? state : null;
  const show = !!(g && K.active() && st && !st.gameOver);
  bar.style.display = show ? '' : 'none';
  if(!show) return;
  const r = g.getBoundingClientRect();
  bar.style.left = (r.right - 8).toFixed(0) + 'px';
  bar.style.top = (Math.min(r.bottom, innerHeight) - 8).toFixed(0) + 'px';
})();

/* ---- ホイールでズーム ---- */
document.addEventListener('wheel', e => {
  if(!inGrid(e)) return;
  e.preventDefault();
  K.setCam({ zoom: cam.zoom * Math.exp(-e.deltaY * 0.0012) });
}, { passive:false });

/* ---- ドラッグで回転・ピンチでズーム ---- */
const ptrs = new Map();
let drag = null, pinch = null, swallowClick = false;
document.addEventListener('contextmenu', e => { if(inGrid(e)) e.preventDefault(); });
document.addEventListener('pointerdown', e => {
  if(!inGrid(e) || bar.contains(e.target)) return;
  if(!ptrs.size) swallowClick = false;
  ptrs.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if(ptrs.size === 2){
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x-b.x, a.y-b.y) || 1, zoom: cam.zoom }; drag = null;
    return;
  }
  if(ptrs.size === 1){
    // 左ボタンはマスのクリックと区別するため、少し動いてから回転を始める
    drag = { id:e.pointerId, x:e.clientX, y:e.clientY, yaw:cam.yaw, pitch:cam.pitch, on: e.button === 1 || e.button === 2 };
  }
}, true);
document.addEventListener('pointermove', e => {
  if(!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if(pinch && ptrs.size >= 2){
    const [a, b] = [...ptrs.values()];
    K.setCam({ zoom: pinch.zoom * Math.hypot(a.x-b.x, a.y-b.y) / pinch.d });
    swallowClick = true;
    return;
  }
  if(!drag || drag.id !== e.pointerId) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if(!drag.on && Math.hypot(dx, dy) > DRAG_PX) drag.on = true;
  if(!drag.on) return;
  swallowClick = true;
  K.setCam({ yaw: drag.yaw - dx*ROT, pitch: drag.pitch + dy*TILT });
}, true);
const end = e => {
  ptrs.delete(e.pointerId);
  if(ptrs.size < 2) pinch = null;
  if(drag && drag.id === e.pointerId) drag = null;
};
document.addEventListener('pointerup', end, true);
document.addEventListener('pointercancel', end, true);
// ドラッグ後のクリックでマスを選んでしまわないように
document.addEventListener('click', e => { if(swallowClick){ e.stopPropagation(); e.preventDefault(); swallowClick = false; } }, true);
})();
