/* =====================================================================
   観客の生物(3D表示のときだけ)
   - 盤面の左に 7 体(A・2〜7)、右に 6 体(8〜K)。色を変える前の元の色のまま、岩の台の上で盤面を見守る。
   - ふだんは待機の動き。その数字の効果が発動したとき、またはクリックしたときに反応する(身構えて跳ねる)。
   - 生物のモデルが読み込まれる前は手作りの体で置き、モデルが届いたら差し替える。
   ===================================================================== */
(function(){
'use strict';
if(!window.B3 || !window.B3.K) return;
if(window.B3.K.LITE) return; // 軽量モード(スマホ)では観客を出さない
const B = window.B3, K = B.K;
const LEFT = ['beast-A', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
const RIGHT = ['c8', 'c9', 'c10', 'c11', 'c12', 'c13'];
const SCALE = 0.8;
const group = new THREE.Group(); group.visible = false;
K.scene.add(group);
const rockMat = new THREE.MeshStandardMaterial({ color:0x2c2620, roughness:0.95, metalness:0 });
const rockGeo = new THREE.CylinderGeometry(0.42, 0.26, 1.4, 6);
const specs = [];

// 盤面の左右に、手前から奥へずらしながら並べる(内側と外側を交互に)
function bounds(){
  const n = K.tiles.length || 20, xs = [], zs = [];
  for(let i = 0; i < n; i++){ xs.push(K.tileX(i)); zs.push(K.tileZ(i)); }
  return { x0:Math.min(...xs), x1:Math.max(...xs), z0:Math.min(...zs), z1:Math.max(...zs) };
}
function slots(keys, side){
  const b = bounds(), n = keys.length;
  const x = side < 0 ? b.x0 - 1.05 : b.x1 + 1.05;
  return keys.map((key, k) => ({ key, x: x + side*(k % 2 ? 0.55 : 0), z: (b.z0 - 0.3) + (b.z1 - b.z0 + 0.6)*k/(n - 1) }));
}
function build(slot){
  const old = specs.find(s => s.key === slot.key);
  if(old){ group.remove(old.root); K.disposeObj && old.av && old.av.root && K.disposeObj(old.av.root); specs.splice(specs.indexOf(old), 1); }
  let av = null;
  try{ av = K.AVATARS[slot.key] ? K.AVATARS[slot.key]() : null; }catch(e){ av = null; }
  if(!av || !av.root) return;
  const root = new THREE.Group();
  const rock = new THREE.Mesh(rockGeo, rockMat); rock.position.y = -0.7; rock.receiveShadow = true; root.add(rock);
  av.root.visible = true;
  // 色を変える前の元の色。足元の紋章・術のオーラ・待機エフェクト(加算の光)は出さない
  if(B.applyTint) B.applyTint(av.root, null, 0);
  av.root.traverse(o => { const m = o.material; if(m && !Array.isArray(m) && m.blending === THREE.AdditiveBlending) o.visible = false; });
  // makeCreature の構成: root > inner > [体, 足元の紋章, オーラ, …]。体以外は隠す
  const inner = av.root.children[0];
  if(inner) inner.children.forEach((c, k) => { if(k > 0) c.visible = false; });
  av.root.scale.setScalar(SCALE);
  root.add(av.root);
  root.position.set(slot.x, K.TOP_Y - 0.1, slot.z);
  // 盤面の中央を向く
  const b = bounds(), cx = (b.x0 + b.x1)/2, cz = (b.z0 + b.z1)/2;
  root.rotation.y = Math.atan2(cx - slot.x, cz - slot.z);
  group.add(root);
  specs.push({ key: slot.key, gltf: !!(B.gltfOf && B.gltfOf[slot.key]), root, av, ph: Math.random()*6, react: 0, blinkAt: 2 + Math.random()*3, box: null });
}
let placed = false;
function placeAll(){
  const all = [...slots(LEFT, -1), ...slots(RIGHT, 1)];
  all.forEach(build);
  placed = true;
  // 観客も画角に入るよう、カメラの収め方に足元と頭の位置を加える
  K.fitExtra.length = 0;
  all.forEach(sl => { K.fitExtra.push(new THREE.Vector3(sl.x, K.TOP_Y - 0.3, sl.z), new THREE.Vector3(sl.x, K.TOP_Y + 0.9, sl.z)); });
  if(B.layout) B.layout(true);
}
// モデルが後から届いたら差し替える
function refresh(){
  [...slots(LEFT, -1), ...slots(RIGHT, 1)].forEach(slot => {
    const s = specs.find(x => x.key === slot.key);
    if(s && !s.gltf && B.gltfOf && B.gltfOf[slot.key]) build(slot);
  });
}

// 反応: 身構えて跳ねる(1.2 秒)
function react(s){
  if(s.react > 0.3) return;
  s.react = 1.2;
  K.burst(s.root.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 0xffd27a, 10, { up:1.8, speed:0.25, life:0.6, g:-0.5 });
}
const byKey = key => specs.find(s => s.key === key);

// その数字の効果が発動したら、その生物が反応する
let lastEffect = null;
function watchEffect(){
  const st = typeof state !== 'undefined' ? state : null;
  const ae = st && st.activeEffect;
  const sig = ae ? ae.kind + ':' + ae.key : null;
  if(sig === lastEffect) return;
  lastEffect = sig;
  if(!ae || ae.kind !== 'number' || ae.key === 'JOKER') return;
  const s = byKey(ae.key === 1 ? 'beast-A' : 'c' + ae.key);
  if(s) react(s);
}

// クリックで反応(マス以外の場所 = 観客のいる左右)。カーソルが乗ると指の形に
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function hit(e){
  const grid = document.getElementById('floor-grid-el');
  if(!grid || !K.active() || !group.visible) return null;
  if(e.target.closest && e.target.closest('.floor-cell')) return null;
  const r = K.canvas.getBoundingClientRect();
  if(e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
  ndc.set((e.clientX - r.left)/r.width*2 - 1, -(e.clientY - r.top)/r.height*2 + 1);
  ray.setFromCamera(ndc, K.camera);
  let best = null, bd = Infinity;
  specs.forEach(s => {
    if(!s.box) s.box = new THREE.Box3().setFromObject(s.av.root);
    const p = ray.ray.intersectBox(s.box, new THREE.Vector3());
    if(p){ const d = p.distanceTo(ray.ray.origin); if(d < bd){ bd = d; best = s; } }
  });
  return best;
}
document.addEventListener('click', e => { const s = hit(e); if(s) react(s); });
document.addEventListener('mousemove', e => {
  const grid = document.getElementById('floor-grid-el');
  if(!grid) return;
  const on = !!hit(e);
  if(on !== grid.classList.contains('b3-spec-hover')) grid.classList.toggle('b3-spec-hover', on);
});

let last = performance.now();
(function loop(now){
  requestAnimationFrame(loop);
  const st = typeof state !== 'undefined' ? state : null;
  const show = !!(K.active() && st && st.players && !st.gameOver);
  group.visible = show;
  if(!show) return;
  if(!placed){
    // モデルの読み込みを少し待ってから並べる(届いていない分は手作りの体で置き、あとで差し替え)
    if(!loop.t0) loop.t0 = now;
    const ready = [...LEFT, ...RIGHT].every(k => B.gltfOf && B.gltfOf[k]);
    if(ready || now - loop.t0 > 4000) placeAll();
    return;
  }
  if(!loop.r || now - loop.r > 2000){ loop.r = now; refresh(); }
  watchEffect();
  const t = now/1000, dt = Math.min(0.05, (now - last)/1000); last = now;
  specs.forEach(s => {
    const av = s.av;
    let raise = 0;
    if(s.react > 0){
      s.react = Math.max(0, s.react - dt);
      const k = 1 - s.react/1.2;
      raise = Math.sin(Math.min(1, k*1.6)*Math.PI);
      av.root.position.y = Math.max(0, Math.sin(Math.min(1, k*2.2)*Math.PI))*0.35;
      if(av.pose) av.pose('raise', raise);
    } else if(av.root.position.y){ av.root.position.y = 0; if(av.pose) av.pose('rest', 0); }
    try{
      if(av.idle) av.idle(t, s.ph, raise);
      if(av.tick) av.tick(t, dt, s.ph, raise);
      s.blinkAt -= dt;
      if(av.blink) av.blink(s.blinkAt < 0.12 && s.blinkAt > 0);
      if(s.blinkAt < 0) s.blinkAt = 2 + Math.random()*3;
    }catch(e){}
  });
})(performance.now());

B.spectators = { specs, react, byKey };
})();
