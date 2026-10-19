/* =====================================================================
   観客の生物(3D表示のときだけ)
   - 盤面の左に 8 体(A・2〜7・黒JOKER)、右に 7 体(8〜K・白JOKER)。色を変える前の元の色のまま、岩の台の上で盤面を見守る。
   - ふだんは待機の動き。その数字の効果が発動したとき、またはクリックしたときに反応する(身構えて跳ねる)。
   - 生物のモデルが読み込まれる前は手作りの体で置き、モデルが届いたら差し替える。
   ===================================================================== */
(function(){
'use strict';
if(!window.B3 || !window.B3.K) return;
if(window.B3.K.LITE) return; // 軽量モード(スマホ)では観客を出さない
const B = window.B3, K = B.K;
const LEFT = ['beast-A', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'jb'];
const RIGHT = ['c8', 'c9', 'c10', 'c11', 'c12', 'c13', 'jw'];
const SCALE = 0.8;
const group = new THREE.Group(); group.visible = false;
K.scene.add(group);
// 台の岩: 1つずつ形を崩し(角ばった不規則な面)、色も岩ごと・面ごとに濃淡を付ける。ところどころに淡く光る結晶
const rockMat = new THREE.MeshStandardMaterial({ vertexColors:true, flatShading:true, roughness:0.95, metalness:0 });
const shardMats = [0x6fd6ff, 0xb48cff, 0x7dffc8].map(c => new THREE.MeshStandardMaterial({ color:0x1a1a22, emissive:c, emissiveIntensity:0.6, roughness:0.3, flatShading:true, transparent:true, opacity:0.8 }));
// 盤面の側面と同じ大地の絵を貼り(読み込み後に共有)、頂点色で岩ごとの色味と濃淡を掛ける
const ROCK_TONES = [0xb0a898, 0x9c9ca6, 0xbaa282, 0x8f989e, 0xac9488, 0xa2a290];
function rnd(seed){ let a = seed*2654435761 >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0)/4294967296; }; }
// 同じ位置の頂点は同じだけ動かす(継ぎ目が割れないよう、位置から決まる値を使う)
function hash3(x, y, z, s){ const v = Math.sin(x*127.1 + y*311.7 + z*74.7 + s*19.3)*43758.5453; return v - Math.floor(v); }
function makeRock(seed){
  const R = rnd(seed + 1);
  const h = 1.4*(0.92 + R()*0.3), rt = 0.4 + R()*0.08, rb = 0.22 + R()*0.1;
  const geo = new THREE.CylinderGeometry(rt, rb, h, 7 + Math.floor(R()*3), 4);
  geo.translate(0, -h/2, 0); // 上面を y=0 に(生物はここに立つ)
  const pos = geo.attributes.position, n = pos.count, col = new Float32Array(n*3);
  const base = new THREE.Color(ROCK_TONES[Math.floor(R()*ROCK_TONES.length)]);
  const hsl = {}; base.getHSL(hsl); base.setHSL(hsl.h + (R() - 0.5)*0.04, hsl.s*(0.8 + R()*0.5), hsl.l*(0.9 + R()*0.25));
  const tmp = new THREE.Color();
  for(let i = 0; i < n; i++){
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, z), top = y > -0.001;
    const k1 = hash3(x, y, z, seed), k2 = hash3(z, x, y, seed + 7);
    if(r > 1e-4){
      // 横へ不規則にふくらませ・削る(上の縁は控えめに)
      const f = 1 + (k1 - 0.5)*(top ? 0.18 : 0.42);
      pos.setX(i, x*f + (k2 - 0.5)*0.06); pos.setZ(i, z*f + (k1 - 0.5)*0.06);
      if(!top) pos.setY(i, y + (k2 - 0.5)*0.12);
      else pos.setY(i, (k2 - 0.5)*0.035);
    }
    // 下ほど暗く沈む。面ごとの濃淡と、ときどき苔や鉄錆の色
    const depth = Math.min(1, -y/h);
    tmp.copy(base).multiplyScalar((1.0 + k1*1.1)*(1 - depth*0.65));
    if(k2 > 0.86) tmp.lerp(new THREE.Color(0x2f3a26), 0.45);
    else if(k2 < 0.08) tmp.lerp(new THREE.Color(0x4a3020), 0.4);
    if(top) tmp.multiplyScalar(1.2);
    col[i*3] = tmp.r; col[i*3 + 1] = tmp.g; col[i*3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // 絵の切り出し位置を岩ごとにずらす
  const uv = geo.attributes.uv, ou = R(), ov = R(), su = 0.6 + R()*0.6;
  for(let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i)*su + ou, uv.getY(i)*su*0.8 + ov);
  geo.computeVertexNormals();
  const g = new THREE.Group();
  const rock = new THREE.Mesh(geo, rockMat); rock.receiveShadow = true; rock.castShadow = true;
  rock.rotation.y = R()*Math.PI*2;
  g.add(rock);
  // 結晶(3つに1つくらい)
  if(R() < 0.4){
    const m = shardMats[Math.floor(R()*shardMats.length)], cnt = 1 + Math.floor(R()*2);
    for(let k = 0; k < cnt; k++){
      const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), m);
      sh.scale.set(0.8, 2.2 + R()*1.2, 0.8);
      const a = R()*Math.PI*2, yy = -0.15 - R()*0.45;
      sh.position.set(Math.cos(a)*(rt*0.8), yy, Math.sin(a)*(rt*0.8));
      sh.rotation.set((R() - 0.5)*0.6, a, (Math.cos(a) > 0 ? -1 : 1)*(0.5 + R()*0.5));
      g.add(sh);
    }
  }
  return g;
}
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
  if(old){ group.remove(old.root); old.root.children[0].traverse(o => { if(o.geometry) o.geometry.dispose(); }); K.disposeObj && old.av && old.av.root && K.disposeObj(old.av.root); specs.splice(specs.indexOf(old), 1); }
  let av = null;
  try{ av = K.AVATARS[slot.key] ? K.AVATARS[slot.key]() : null; }catch(e){ av = null; }
  if(!av || !av.root) return;
  const root = new THREE.Group();
  const seed = [...slot.key].reduce((a, c) => a*31 + c.charCodeAt(0), 7) % 100000;
  root.add(makeRock(seed));
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
  if(!ae || ae.kind !== 'number') return;
  if(ae.key === 'JOKER'){ ['jb', 'jw'].forEach(k => { const s = byKey(k); if(s) react(s); }); return; } // どちらの JOKER かは分からないので両方
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
  if(!loop.r || now - loop.r > 2000){
    loop.r = now; refresh();
    if(!rockMat.map && K.sideMat && K.sideMat.map){ rockMat.map = K.sideMat.map; rockMat.needsUpdate = true; }
  }
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
