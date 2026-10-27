/* =====================================================================
   3D 独自の演出(3D表示中のみ。2D表示では元の演出)
   adapter.js の内部部品(B3.K)を使う。
   ===================================================================== */
(function(){
'use strict';
if(!window.B3 || !window.B3.K) return;
const K = window.B3.K;
const { tween, ease, burst, dust, chars, once, failSafe } = K;
const wait = K.wait;
const PCOL = (typeof PLAYER_COLORS !== 'undefined') ? PLAYER_COLORS : ['#c9a24b', '#b2454a'];
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function glowSprite(color, size, opacity){
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:K.starTex, color, transparent:true, depthWrite:false, blending:K.ADD, opacity: opacity == null ? 1 : opacity }));
  s.scale.setScalar(size); s.renderOrder = 20;
  return s;
}
function shell(color, r){
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0, blending:K.ADD, depthWrite:false, side:THREE.DoubleSide }));
  m.renderOrder = 19;
  return m;
}

/* ---------------------------------------------------------------------
   #7 チェンジ: 魂は同じまま、体だけを大地に封じられた生物と入れ替える
   1) 魂(プレイヤーカラーの光)が体から抜け出る
   2) 抜け殻の体が大地へ沈み、再び封印される(封印陣が閉じる)
   3) 大地に封じられていた生物がせり上がってくる
   4) 魂が降りて宿り、プレイヤーカラーの光に包まれて輝く
   --------------------------------------------------------------------- */
K.override('triggerChangeFlip', () => function(cellIndex, oldCard, newCard, playerIdx){
  return trackAnimation(resolve => {
    resolve = once(resolve);
    if(!settings.moveAnim){ resolve(); return; }
    const ch = chars[playerIdx];
    K.driving[playerIdx] = true;
    K.ensureAt(ch, cellIndex);
    ch.busy = true;
    ch.override = oldCard;
    const col = new THREE.Color(PCOL[playerIdx] || '#ffd27a');
    const layer = K.fxLayer();
    const sp = K.screenOf(cellIndex, 1.9);
    const label = layer ? el('div', { class:'b3-change-label', style:`left:${sp.x.toFixed(1)}px; top:${sp.y.toFixed(1)}px;` }, 'CHANGE!!') : null;
    if(label) layer.appendChild(label);
    const base = ch.root.position.clone();
    const seal = K.flatPlane(1.6, K.circleTex(oldCard && oldCard.suit !== 'JOKER' ? oldCard.suit : 'JB'), col, base.y + 0.02);
    seal.position.x = base.x; seal.position.z = base.z;
    K.scene.add(seal);
    const soul = glowSprite(col, 0.55);
    const core = glowSprite(0xffffff, 0.25);
    const aura = shell(col, 0.62);
    (async () => {
      // 1) 魂が抜け出る
      const h0 = (ch.av ? ch.av.badgeY : 1.1) * 0.55;
      soul.position.copy(base).add(V(0, h0, 0)); core.position.copy(soul.position);
      K.scene.add(soul, core);
      await tween(0.55, t => {
        const k = ease.out(t);
        soul.position.y = base.y + h0 + k*0.9; core.position.y = soul.position.y;
        soul.material.opacity = Math.min(1, t*2); core.material.opacity = soul.material.opacity;
        soul.scale.setScalar(0.35 + 0.25*k + Math.sin(t*20)*0.03);
        if(ch.av) ch.av.pose('raise', 1 - k);
        if(Math.random() < 0.5) burst(base.clone().add(V(0, h0*(1 - k), 0)), col.getHex(), 1, { up:1.6, speed:0.15, life:0.5, g:-0.5 });
      });
      // 2) 抜け殻が大地へ沈み、封印される
      const old = ch.av, oldRoot = old && old.root;
      await tween(0.65, t => {
        const k = ease.inOut(t);
        if(oldRoot){ oldRoot.position.y = -1.3*k; oldRoot.rotation.y = k*0.6; }
        seal.material.opacity = Math.sin(Math.PI*Math.min(1, t*1.2))*0.9;
        seal.rotation.z = t*2;
        soul.position.y += Math.sin(t*12)*0.003;
      });
      burst(base.clone().add(V(0, 0.05, 0)), 0x8c8170, 10, { shards:true, up:1.5, speed:0.4 });
      dust(base.clone());
      if(oldRoot){ oldRoot.position.y = 0; oldRoot.rotation.y = 0; }
      // 3) 封じられていた生物がせり上がる
      ch.override = newCard;
      K.setAvatar(ch, K.avatarKeyFor(playerIdx, newCard), true);
      ch.suitKey = null; // sync でスートの見た目を付け直す
      const nr = ch.av.root;
      nr.position.y = -1.3;
      await tween(0.7, t => {
        const k = ease.out(t);
        nr.position.y = -1.3*(1 - k);
        seal.material.opacity = 0.8*(1 - t);
        if(Math.random() < 0.6) burst(base.clone().add(V((Math.random()-.5)*0.6, 0.05, (Math.random()-.5)*0.6)), 0xe9dfc8, 1, { puff:true, up:0.8, speed:0.2, life:0.5, g:0 });
      });
      nr.position.y = 0;
      // 4) 魂が宿り、プレイヤーカラーに包まれて輝く
      const h1 = (ch.av ? ch.av.badgeY : 1.1) * 0.55;
      const sy = soul.position.y;
      await tween(0.4, t => { const k = ease.inOut(t); soul.position.y = sy + (base.y + h1 - sy)*k; core.position.y = soul.position.y; soul.scale.setScalar(0.6 - 0.3*k); });
      aura.position.copy(base).add(V(0, h1, 0)); aura.scale.set(1, (ch.av ? ch.av.badgeY : 1.1)*0.9, 1);
      K.scene.add(aura);
      burst(base.clone().add(V(0, h1, 0)), col.getHex(), 26, { up:1.8, speed:0.5 });
      await tween(0.75, t => {
        aura.material.opacity = Math.sin(Math.PI*t)*0.22;
        aura.scale.x = aura.scale.z = 1 + 0.15*Math.sin(Math.PI*t);
        soul.material.opacity = core.material.opacity = 1 - t;
        if(ch.av) ch.av.pose('raise', Math.sin(Math.PI*t));
        if(ch.mats) ch.mats.forEach(m => { if(m.emissive){ if(!m.userData.e0) m.userData.e0 = m.emissive.clone(); m.emissive.copy(m.userData.e0).lerp(col, Math.sin(Math.PI*t)*0.6); } });
      });
      if(ch.mats) ch.mats.forEach(m => { if(m.userData.e0) m.emissive.copy(m.userData.e0); });
      if(ch.av) ch.av.pose('rest', 0);
      K.disposeObj(soul); K.disposeObj(core); K.disposeObj(aura); K.disposeObj(seal);
      if(label) label.remove();
      ch.busy = false;
      K.parks[playerIdx] = cellIndex;
      K.driving[playerIdx] = false;
      resolve();
    })().catch(e => {
      [soul, core, aura, seal].forEach(o => { try{ K.disposeObj(o); }catch(_){} });
      if(ch.av && ch.av.root) ch.av.root.position.y = 0;
      if(label) label.remove();
      K.parks[playerIdx] = cellIndex;
      failSafe(e, playerIdx, resolve);
    });
  });
});

/*__REST__*/
/* =====================================================================
   共通の部品
   ===================================================================== */
const B = window.B3;
const frozen = K.frozen;
const ctrOf = (i, dy) => V(K.tileX(i), K.topY(i) + (dy || 0), K.tileZ(i));
const isOn = () => K.active();
function hold(i){ frozen.add(i); }
// 盤面のデータが追いつくまで(2フレーム)待ってから sync に戻す
function release(i){ requestAnimationFrame(() => requestAnimationFrame(() => frozen.delete(i))); }
function resetTile(T){
  T.g.position.set(K.tileX(T.i), 0, K.tileZ(T.i)); T.g.rotation.set(0, 0, 0); T.g.scale.setScalar(1);
  T.lift.position.set(0, 0, 0); T.lift.rotation.set(0, 0, 0);
  T.top.rotation.set(0, 0, 0); T.top.position.x = 0; T.top.position.z = 0;
  T.flash = 0; T.anim = false;
}
function vanish(T){ resetTile(T); T.g.visible = false; T.shown = false; T.destroyed = true; T.gone = false; }
// 3D表示中だけ差し替える。settings.effectAnim が切れていれば即終了(pre は必ず実行する後始末など)
function fx(name, run, opt){
  opt = opt || {};
  K.override(name, () => function(){
    const a = arguments;
    if(opt.pre) try{ opt.pre.apply(this, a); }catch(e){ console.error(e); }
    return trackAnimation(res => {
      res = once(res);
      const flag = opt.flag || 'effectAnim';
      if(flag !== 'none' && !settings[flag]){ if(opt.off) try{ opt.off.apply(null, a); }catch(e){} res(); return; }
      Promise.resolve().then(() => run.apply(null, a)).catch(e => { console.error('[Bind3D] 演出エラー(続行します)', name, e); if(opt.off) try{ opt.off.apply(null, a); }catch(_){} }).finally(res);
    });
  });
}
const col = h => new THREE.Color(h).getHex();
function addMesh(m){ K.scene.add(m); return m; }
function ring(r, thick, color, arc){
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, thick, 6, 40, arc || Math.PI*2), new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0, blending:K.ADD, depthWrite:false, side:THREE.DoubleSide }));
  m.rotation.x = Math.PI/2; return m;
}
function pillar(color, r, h){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r*1.15, h, 28, 1, true), new THREE.MeshBasicMaterial({ map:K.pillarTex, color, transparent:true, depthWrite:false, blending:K.ADD, side:THREE.DoubleSide, opacity:0 }));
  return m;
}
function spark(pos, color, n, o){ K.burst(pos, color, n, Object.assign({ up:1.6, speed:0.4 }, o || {})); }
// 現在の JOKER が黒(JOKER1)か白(JOKER2)か
function jokerKind(){
  const st = state, pl = st && st.players[st.current];
  if(!pl) return 'JB';
  const c = (pl.personalCard && pl.personalCard.suit === 'JOKER') ? pl.personalCard : [...pl.discard].reverse().find(x => x && x.suit === 'JOKER');
  return c && String(c.id).endsWith('2') ? 'JW' : 'JB';
}
function casterWorld(p){
  const s = [...K.summons].reverse().find(x => x.p === p);
  const ch = chars[p];
  const base = s ? s.av.root.position : (ch && ch.shown ? ch.root.position : null);
  return base ? base.clone().add(V(0, 0.6, 0)) : null;
}
function headWorld(p){ const ch = chars[p]; if(!ch || !ch.shown) return null; return ch.root.position.clone().add(V(0, (ch.av ? ch.av.badgeY : 1.1)*0.6, 0)); }

/* ---- 表裏の反転: 天板が浮き上がって一回転し、裏/表が入れ替わる ---- */
async function flipSlab(i, toFace, color, dur){
  const T = K.tiles[i]; if(!T) return;
  const slot = state.floor[i];
  hold(i);
  T.anim = true;
  const y0 = T.top.position.y, iv = T.inlay.visible;
  const moss = T.lift.children[1]; // 天板が浮くと下の苔(緑)が見えるので隠す
  T.inlay.visible = false; if(moss) moss.visible = false;
  let swapped = false;
  const c = ctrOf(i, 0.1);
  await tween(dur || 0.75, t => {
    const k = ease.inOut(t);
    T.top.position.y = y0 + Math.sin(Math.PI*t)*0.38;
    T.top.rotation.x = k*Math.PI*2;
    T.flash = Math.sin(Math.PI*t)*0.9;
    if(!swapped && k > 0.5){
      swapped = true;
      if(toFace && slot && slot.card) K.setTop(T, 'face:' + slot.card.id, slot.card); else K.setTop(T, 'back');
      spark(c, color, 14, { up:1.4, speed:0.35 });
    }
  });
  T.top.position.y = y0; T.top.rotation.x = 0; T.flash = 0; T.inlay.visible = iv && !toFace; if(moss) moss.visible = true;
  dust(c);
  T.anim = false;
  release(i);
}

/* =====================================================================
   盤面: 生成・破壊・表裏・移動(属性ごと)
   ===================================================================== */
// A: 太陽が強化フロアとして裏返す(表→裏)
fx('triggerCardFlip', async (i, revealing) => {
  const sun = addMesh(glowSprite(0xffd76a, 0.2)); sun.position.copy(ctrOf(i, 1.4));
  await tween(0.35, t => { sun.scale.setScalar(0.2 + t*0.9); sun.material.opacity = t; });
  const fl = flipSlab(i, !!revealing, 0xffd76a);
  await tween(0.75, t => { sun.position.y = K.topY(i) + 1.4 - t*0.9; sun.material.opacity = 1 - t; });
  K.disposeObj(sun);
  await fl;
});
// 3: 夢の泡に包まれて裏返る(表→裏)
fx('triggerVortexHide', async (i) => {
  const c = ctrOf(i, 0.15);
  K.burst(c, 0xb89cff, 26, { puff:true, up:0.9, speed:0.35, g:-0.3, life:1.0, grow:1.6 });
  await wait(0.35);
  await flipSlab(i, false, 0xb89cff, 0.8);
});
// A: 太陽が降りてフロアを生む(この後 sync がせり上げる)
fx('triggerSunFloorSpawn', async (i) => {
  const c = ctrOf(i, 0);
  // 聖獣の太陽の紋章が空から降り、光の柱とともにフロアへ宿る(後ろに柔らかな光)
  const halo = addMesh(glowSprite(0xffd76a, 0.3, 0.7)); halo.position.copy(c).add(V(0, 2.2, 0));
  const sun = addMesh(new THREE.Sprite(new THREE.SpriteMaterial({ map:K.sunTex, transparent:true, depthWrite:false, opacity:0 })));
  sun.renderOrder = 21; sun.position.copy(halo.position);
  const pl = addMesh(pillar(0xffd76a, 0.42, 2.4)); pl.position.copy(c).add(V(0, 1.2, 0));
  await tween(0.9, t => {
    const k = ease.out(t);
    [halo, sun].forEach(o => { o.position.y = c.y + 2.2 - k*1.8; });
    halo.scale.setScalar(0.4 + k*0.9); sun.scale.setScalar(0.3 + k*0.55); sun.material.opacity = Math.min(1, t*3);
    sun.material.rotation = t*0.8;
    pl.material.opacity = Math.sin(Math.PI*t)*0.8;
  });
  spark(c.clone().add(V(0, 0.2, 0)), 0xffe7a0, 26, { up:2.4, speed:0.6 });
  await tween(0.35, t => { sun.material.opacity = 1 - t; halo.material.opacity = 0.7*(1 - t); sun.position.y = c.y + 0.4 - 0.3*t; });
  K.disposeObj(sun); K.disposeObj(halo); K.disposeObj(pl);
});
// 4: 次元の裂け目からフロアが生まれる
fx('triggerFloorSpawn', async (i) => {
  const c = ctrOf(i, 0.02);
  // 次元の裂け目のモデルが床に開いて波打ち、閉じる(無ければ紫の輪)
  const disc = fxDisc('fx-rift', { wave:0.05, waveK:30, swirl:0.6, spin:1.6, glow:1.1, glowColor:0xc89aff });
  if(disc){
    disc.position.copy(c).add(V(0, 0.08, 0)); addMesh(disc);
    await tween(0.75, t => { const k = Math.sin(Math.PI*t); disc.userData.tick(t*1.2, k); disc.scale.setScalar(0.2 + 1.1*k); });
    spark(c.clone().add(V(0, 0.1, 0)), 0xd0a0ff, 18, { up:2, speed:0.5 });
    disposeDisc(disc);
    return;
  }
  const r = addMesh(ring(0.4, 0.03, 0xa35cff)); r.position.copy(c);
  await tween(0.6, t => { r.material.opacity = Math.sin(Math.PI*t); r.scale.setScalar(0.3 + t*1.2); r.rotation.z = t*6; });
  spark(c.clone().add(V(0, 0.1, 0)), 0xd0a0ff, 18, { up:2, speed:0.5 });
  K.disposeObj(r);
});
// 2: 召喚陣からフロアが浮かび上がり、表になって宙に留まる(効果の連鎖中ずっと)
const summon2 = new Map();
fx('triggerSummon2RiseAndReveal', async (i) => {
  const T = K.tiles[i], slot = state.floor[i]; if(!T || !slot) return;
  hold(i); T.anim = true;
  const c = ctrOf(i, 0.03);
  const circle = addMesh(K.flatPlane(1.4, K.circleTex('C'), 0xbfe8ff, c.y)); circle.position.x = c.x; circle.position.z = c.z;
  const pil = addMesh(pillar(0xbfe8ff, 0.42, 2.2)); pil.position.copy(c).add(V(0, 1.1, 0));
  const y0 = T.g.position.y;
  let swapped = false;
  await tween(0.9, t => {
    const k = ease.out(t);
    circle.material.opacity = Math.min(1, t*2); circle.rotation.z = t*3;
    pil.material.opacity = 0.8*Math.sin(Math.PI*Math.min(1, t*1.4));
    T.g.position.y = y0 + k*0.55; T.top.rotation.x = k*Math.PI*2;
    if(!swapped && k > 0.5){ swapped = true; if(slot.card) K.setTop(T, 'face:' + slot.card.id, slot.card); }
  });
  T.top.rotation.x = 0;
  const tok = { circle, pil, T, y0, alive:true };
  summon2.set(i, tok);
  (function bob(){ if(!tok.alive) return; const t = performance.now()/1000; T.g.position.y = y0 + 0.55 + Math.sin(t*2)*0.05; circle.rotation.z = t*0.8; T.flash = 0.3 + Math.sin(t*3)*0.15; requestAnimationFrame(bob); })();
}, { off: i => {} });
fx('triggerSummon2Return', async (i) => {
  const tok = summon2.get(i); summon2.delete(i);
  if(!tok){ release(i); return; }
  tok.alive = false;
  const T = tok.T, ys = T.g.position.y;
  await tween(0.55, t => { const k = ease.inOut(t); T.g.position.y = ys + (tok.y0 - ys)*k; tok.circle.material.opacity = 1 - t; T.flash = 0.3*(1 - t); });
  K.disposeObj(tok.circle); K.disposeObj(tok.pil);
  resetTile(T); dust(ctrOf(i));
  release(i);
}, {
  pre: i => { if(typeof animatingCellIndices !== 'undefined') animatingCellIndices.delete(i); },
  off: i => { const tok = summon2.get(i); if(tok){ tok.alive = false; summon2.delete(i); K.disposeObj(tok.circle); K.disposeObj(tok.pil); resetTile(tok.T); } release(i); },
});

/* ---- K のハンマー: ミノタウロス(c13)のモデルから、右手のハンマーの部分だけを切り出す ----
   モデルは1つのメッシュだが、ハンマーは体とつながっていない独立した部品になっている。
   位置で溶接した三角形のつながりで部品に分け、右手側(+X)の小さな部品をハンマーとして使う。 */
let hammerCache;
function hammerModel(){
  if(hammerCache !== undefined) return hammerCache ? hammerCache.clone() : null;
  hammerCache = null;
  const gltf = window.B3.gltfOf && window.B3.gltfOf.c13;
  if(!gltf) return null;
  let src = null; gltf.scene.traverse(o => { if(!src && o.isMesh) src = o; });
  if(!src) return null;
  const g = src.geometry, P = g.attributes.position, n = P.count;
  const idx = g.index ? g.index.array : Array.from({ length:n }, (_, i) => i);
  const weld = new Map(), id = new Int32Array(n);
  for(let i = 0; i < n; i++){ const k = P.getX(i).toFixed(4) + ',' + P.getY(i).toFixed(4) + ',' + P.getZ(i).toFixed(4); if(!weld.has(k)) weld.set(k, i); id[i] = weld.get(k); }
  const par = Int32Array.from({ length:n }, (_, i) => i);
  const f = x => { while(par[x] !== x){ par[x] = par[par[x]]; x = par[x]; } return x; };
  for(let t = 0; t < idx.length; t += 3){ const a = f(id[idx[t]]); par[f(id[idx[t+1]])] = a; par[f(id[idx[t+2]])] = a; }
  const size = new Map(), cx = new Map();
  gltf.scene.updateMatrixWorld(true);
  const wv = new THREE.Vector3();
  for(let i = 0; i < n; i++){ const r = f(id[i]); size.set(r, (size.get(r) || 0) + 1); wv.fromBufferAttribute(P, i).applyMatrix4(src.matrixWorld); cx.set(r, (cx.get(r) || 0) + wv.x); }
  const pick = new Set([...size.keys()].filter(r => size.get(r) < n*0.1 && cx.get(r)/size.get(r) > 0.25));
  if(!pick.size) return null;
  const tri = [];
  for(let t = 0; t < idx.length; t += 3) if(pick.has(f(id[idx[t]]))) tri.push(idx[t], idx[t+1], idx[t+2]);
  const geo = new THREE.BufferGeometry();
  // 圧縮(量子化・インターリーブ)された属性もあるので getX/getY/getZ で読む
  const GET = ['getX', 'getY', 'getZ'];
  ['position', 'uv'].forEach(name => {
    const a = g.attributes[name]; if(!a) return;
    const m = Math.min(3, a.itemSize), out = new Float32Array(tri.length*m);
    tri.forEach((v, k) => { for(let c = 0; c < m; c++) out[k*m + c] = a[GET[c]](v); });
    geo.setAttribute(name, new THREE.BufferAttribute(out, m));
  });
  // 量子化を戻すノードの変換(位置・縮尺)をかける
  gltf.scene.updateMatrixWorld(true);
  geo.applyMatrix4(src.matrixWorld);
  geo.computeVertexNormals();
  // 柄の先を原点に、頭が -Y 方向へ来る向きにそろえる(柄の先 = 中心からいちばん遠い点)
  const pos = geo.attributes.position, cnt = pos.count, v = new THREE.Vector3(), ctr = new THREE.Vector3();
  for(let i = 0; i < cnt; i++) ctr.add(v.fromBufferAttribute(pos, i));
  ctr.divideScalar(cnt);
  const tip = new THREE.Vector3(); let far = -1;
  for(let i = 0; i < cnt; i++){ v.fromBufferAttribute(pos, i); const d = v.distanceToSquared(ctr); if(d > far){ far = d; tip.copy(v); } }
  let maxD = 0; for(let i = 0; i < cnt; i++) maxD = Math.max(maxD, v.fromBufferAttribute(pos, i).distanceTo(tip));
  const head = new THREE.Vector3(); let hn = 0;
  for(let i = 0; i < cnt; i++){ v.fromBufferAttribute(pos, i); if(v.distanceTo(tip) > maxD*0.7){ head.add(v); hn++; } }
  head.divideScalar(Math.max(1, hn));
  geo.translate(-tip.x, -tip.y, -tip.z);
  const q = new THREE.Quaternion().setFromUnitVectors(head.clone().sub(tip).normalize(), new THREE.Vector3(0, -1, 0));
  geo.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
  geo.scale(0.95/maxD, 0.95/maxD, 0.95/maxD); // 盤面で振るう大きさ(長さ約 0.95)
  // 遠い点は頭の角になることがあるので、最後に「柄の端(いちばん下)が原点・頭が +Y」へそろえ直す
  geo.computeBoundingBox();
  let lowY = Infinity; const low = new THREE.Vector3();
  for(let i = 0; i < pos.count; i++){ v.fromBufferAttribute(geo.attributes.position, i); if(v.y < lowY){ lowY = v.y; low.copy(v); } }
  let cy = 0; for(let i = 0; i < pos.count; i++) cy += geo.attributes.position.getY(i);
  cy /= pos.count; // このモデルは柄(グリップの装飾)の方が頂点が多く、重心は柄の側に寄る
  if(cy > (geo.boundingBox.min.y + geo.boundingBox.max.y)/2) geo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI)); // 頭が下なら上下を返す
  geo.computeBoundingBox();
  lowY = Infinity;
  for(let i = 0; i < pos.count; i++){ v.fromBufferAttribute(geo.attributes.position, i); if(v.y < lowY){ lowY = v.y; low.copy(v); } }
  geo.translate(-low.x, -low.y, -low.z);
  geo.computeVertexNormals();
  const sm = src.material;
  // 黒曜石の頭に走る溶岩のひびだけが光る(テクスチャの明るいところを発光に)
  const mat = new THREE.MeshStandardMaterial({ map: sm.map || null, emissiveMap: sm.map || null, color:0xffffff, roughness:0.5, metalness:0.3, emissive:0xff6a2a, emissiveIntensity:0.9 });
  const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true;
  const holder = new THREE.Group(); holder.add(mesh);
  hammerCache = holder;
  return holder.clone();
}

/* ---- エフェクト用のモデル(4 の裂け目 fx-rift / 6 の渦潮 fx-whirl) ----
   どちらも正面(+Z)を向いた薄い円盤。圧縮された頂点を実寸に直した形を作っておき(1 回だけ)、
   使うたびに専用の材質で包む。材質は頂点シェーダーで波打たせ、ゆっくり渦を巻かせる。 */
const fxGeoCache = {};
function fxBaked(key){
  if(key in fxGeoCache) return fxGeoCache[key];
  const gltf = window.B3.gltfOf && window.B3.gltfOf[key];
  if(!gltf) return null; // まだ読み込み中(そのときは従来の演出)
  let src = null; gltf.scene.traverse(o => { if(!src && o.isMesh) src = o; });
  if(!src) return (fxGeoCache[key] = null);
  gltf.scene.updateMatrixWorld(true);
  const g = src.geometry, P = g.attributes.position, UV = g.attributes.uv, n = P.count;
  const pos = new Float32Array(n*3), uv = UV ? new Float32Array(n*2) : null, v = new THREE.Vector3();
  for(let i = 0; i < n; i++){
    v.fromBufferAttribute(P, i).applyMatrix4(src.matrixWorld); pos[i*3] = v.x; pos[i*3+1] = v.y; pos[i*3+2] = v.z;
    if(uv){ uv[i*2] = UV.getX(i); uv[i*2+1] = UV.getY(i); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if(uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if(g.index) geo.setIndex(Array.from(g.index.array));
  geo.computeBoundingBox();
  // 中心を原点に、直径を 1 に
  const bb = geo.boundingBox, c = bb.getCenter(new THREE.Vector3()), d = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y);
  geo.translate(-c.x, -c.y, -c.z); geo.scale(1/d, 1/d, 1/d);
  geo.computeVertexNormals();
  const m = src.material || {};
  return (fxGeoCache[key] = { geo, map: m.map || null, normalMap: m.normalMap || null });
}
// 円盤のエフェクト: 床に寝かせて置く。opt.wave(波の高さ)・opt.swirl(渦のねじれ)・opt.glow(発光)
function fxDisc(key, opt){
  const b = fxBaked(key); if(!b) return null;
  opt = opt || {};
  const u = { uT:{ value:0 }, uA:{ value: opt.wave || 0.035 }, uK:{ value: opt.waveK || 22 }, uS:{ value: opt.swirl || 0.25 } };
  const mat = new THREE.MeshStandardMaterial({ map: b.map, normalMap: b.normalMap, emissiveMap: b.map, emissive: new THREE.Color(opt.glowColor || 0xffffff),
    emissiveIntensity: opt.glow == null ? 0.6 : opt.glow, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'uniform float uT; uniform float uA; uniform float uK; uniform float uS;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        float r = length(position.xy);
        // 中心から外へ広がる波(中心は静か)と、外側ほど遅れて回る渦のねじれ
        transformed.z += sin(r*uK - uT*5.0)*uA*smoothstep(0.02, 0.2, r);
        float a = uS*sin(uT*1.6 - r*7.0)*r;
        transformed.xy = mat2(cos(a), -sin(a), sin(a), cos(a))*transformed.xy;
      }`);
  };
  mat.customProgramCacheKey = () => 'bind-fxdisc';
  const mesh = new THREE.Mesh(b.geo, mat);
  mesh.rotation.x = -Math.PI/2; // 正面(+Z)を上へ
  mesh.renderOrder = 6;
  const g = new THREE.Group(); g.add(mesh);
  g.userData = { mat, u, mesh, tick(t, k){ u.uT.value = t; mat.opacity = k; mesh.rotation.z = -t*(opt.spin || 1.2); } };
  return g;
}
function disposeDisc(g){ if(!g) return; K.scene.remove(g); g.userData.mat.dispose(); } // 形はキャッシュを使い回す

/* ---- マグマ: 地割れが赤く光り、溶岩の柱が噴き上がり、溶岩の塊が飛び散って冷える ---- */
const crackTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d'), c = 128;
  g.strokeStyle = '#ffb040'; g.shadowColor = '#ff5a10'; g.shadowBlur = 10; g.lineCap = 'round';
  for(let k = 0; k < 9; k++){
    let a = k/9*Math.PI*2 + Math.random()*0.3, x = c, y = c, w = 7;
    g.beginPath(); g.moveTo(x, y);
    for(let s = 0; s < 7; s++){ a += (Math.random()-.5)*0.8; const r = 10 + Math.random()*14; x += Math.cos(a)*r; y += Math.sin(a)*r; g.lineWidth = w; g.lineTo(x, y); w = Math.max(1.5, w*0.75); }
    g.stroke();
  }
  const rg = g.createRadialGradient(c, c, 0, c, c, 46); rg.addColorStop(0, 'rgba(255,220,120,1)'); rg.addColorStop(0.5, 'rgba(255,110,20,.8)'); rg.addColorStop(1, 'rgba(255,60,0,0)');
  g.shadowBlur = 0; g.fillStyle = rg; g.beginPath(); g.arc(c, c, 46, 0, Math.PI*2); g.fill();
  return new THREE.CanvasTexture(cv);
})();
const blobGeo = new THREE.SphereGeometry(1, 8, 6);
const LAVA_HOT = new THREE.Color(0xffd060), LAVA_MID = new THREE.Color(0xff5a10), LAVA_COLD = new THREE.Color(0x3a1408);
async function magmaFx(i, power){
  const c = ctrOf(i, 0.02);
  const crack = addMesh(new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.05), new THREE.MeshBasicMaterial({ map:crackTex, transparent:true, opacity:0, blending:K.ADD, depthWrite:false })));
  crack.rotation.x = -Math.PI/2; crack.rotation.z = Math.random()*Math.PI; crack.position.copy(c);
  const H = 1.9*power;
  const geyser = addMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.1*power, 0.2*power, 1, 20, 1, true), new THREE.MeshBasicMaterial({ map:K.pillarTex, color:0xff6a1a, transparent:true, opacity:0, blending:K.ADD, depthWrite:false, side:THREE.DoubleSide })));
  const core = addMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.05*power, 0.1*power, 1, 14, 1, true), new THREE.MeshBasicMaterial({ map:K.pillarTex, color:0xffe08a, transparent:true, opacity:0, blending:K.ADD, depthWrite:false, side:THREE.DoubleSide })));
  const light = addMesh(new THREE.PointLight(0xff7a2a, 0, 3.5, 2)); light.position.copy(c).add(V(0, 0.5, 0));
  // 溶岩の塊(重力で放物線を描き、着地すると冷えて消える)
  const blobs = Array.from({ length: Math.round(10 + 16*power) }, () => {
    const m = addMesh(new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ color:LAVA_HOT.clone() })));
    const a = Math.random()*Math.PI*2, sp = (0.3 + Math.random()*0.9)*power;
    m.scale.setScalar((0.025 + Math.random()*0.045)*Math.sqrt(power));
    m.position.copy(c).add(V(Math.cos(a)*0.06, 0.05, Math.sin(a)*0.06));
    m.userData = { v:V(Math.cos(a)*sp, (2.4 + Math.random()*2.4)*Math.sqrt(power), Math.sin(a)*sp), t:0, delay:Math.random()*0.35, done:false };
    m.visible = false;
    return m;
  });
  K.burst(c.clone().add(V(0, 0.1, 0)), 0x8c8170, Math.round(8*power), { shards:true, up:2.4, speed:0.7 });
  let last = performance.now();
  await tween(1.5, t => {
    const now = performance.now(), dt = Math.min(0.05, (now - last)/1000); last = now;
    crack.material.opacity = Math.min(1, t*6) * (t < 0.7 ? 1 : 1 - (t - 0.7)/0.3);
    const rise = Math.min(1, t/0.18), fall = t < 0.45 ? 1 : Math.max(0, 1 - (t - 0.45)/0.35);
    const h = Math.max(0.01, H*rise*fall);
    [geyser, core].forEach((m, k) => { m.scale.set(1 + Math.sin(t*40 + k)*0.06, h*(k ? 0.85 : 1), 1 + Math.cos(t*37 + k)*0.06); m.position.copy(c).add(V(0, h*(k ? 0.85 : 1)/2, 0)); m.material.opacity = (k ? 1 : 0.9)*Math.min(1, rise*1.5)*fall; });
    light.intensity = 3.2*power*Math.min(1, t*8)*(1 - t);
    blobs.forEach(b => {
      const u = b.userData; if(u.done) return;
      if(t*1.5 < u.delay) return;
      b.visible = true; u.t += dt;
      u.v.y -= 9.8*dt; b.position.addScaledVector(u.v, dt);
      const k = Math.min(1, u.t/0.9);
      b.material.color.copy(LAVA_HOT).lerp(LAVA_MID, Math.min(1, k*2)).lerp(LAVA_COLD, Math.max(0, k*2 - 1));
      if(b.position.y < c.y - 0.02 && u.v.y < 0){ u.done = true; b.visible = false; if(Math.random() < 0.5) K.burst(b.position.clone().setY(c.y + 0.02), 0x2a1a14, 2, { puff:true, up:0.4, speed:0.08, life:0.5, grow:2, g:-0.3 }); }
    });
    if(Math.random() < 0.35*power) K.burst(c.clone().add(V((Math.random()-.5)*0.3, 0.2 + Math.random()*0.4*power, (Math.random()-.5)*0.3)), 0x3a2a24, 1, { puff:true, up:0.9, speed:0.06, life:1.0, grow:3, g:-0.6 });
  });
  [crack, geyser, core, ...blobs].forEach(m => K.disposeObj(m)); K.scene.remove(light);
}
// ミノタウロスのハンマーを振り下ろす(カメラの側から奥のマスへ)
async function hammerStrike(i, power){
  const c = ctrOf(i, 0);
  const h = hammerModel();
  if(!h){ await K.hammerFx(i, false); return; } // モデルが無いときは以前の簡易ハンマー
  h.traverse(o => { if(o.isMesh){ o.material = o.material.clone(); o.material.transparent = true; } });
  const yaw = K.cam ? K.cam.yaw : 0;
  const pivot = addMesh(new THREE.Group());
  pivot.position.copy(c).add(V(Math.sin(yaw)*0.65, 0.95, Math.cos(yaw)*0.65));
  pivot.rotation.y = yaw; pivot.add(h);
  const setOp = o => h.traverse(m => { if(m.isMesh) m.material.opacity = o; });
  // 構える → 振り下ろす
  await tween(0.28, t => { const e = ease.out(t); h.scale.setScalar((0.4 + 0.6*e)*1.3); h.rotation.x = 0.2 + 0.5*e; setOp(e); });
  await wait(0.06);
  await tween(0.16, t => { h.rotation.x = 0.7 - 3.24*t*t; }); // 頭がマスの中央に当たる角度(-2.54)まで
  const gridEl = K.canvas.parentNode;
  const shake = tween(0.35, t => { if(gridEl) gridEl.style.transform = `translate(${((Math.random()-.5)*9*(1-t)).toFixed(1)}px, ${((Math.random()-.5)*9*(1-t)).toFixed(1)}px)`; });
  const T = K.tiles[i]; if(T) T.flash = 1.3;
  const erupt = magmaFx(i, power);
  await wait(0.25);
  await tween(0.3, t => { h.rotation.x = -2.54 + 0.5*t; setOp(1 - t); });
  K.disposeObj(pivot);
  await shake; if(gridEl) gridEl.style.transform = '';
  await erupt;
  if(T) T.flash = 0;
}
// K: ハンマーで割って表にする(小さな噴出)→ 敗れた方は大きく噴き上がって砕け散る / 残った方は余熱が残る
fx('triggerKCrackReveal', (i) => hammerStrike(i, 0.7));
async function kDestroy(i){
  const T = K.tiles[i]; if(!T) return;
  hold(i); T.anim = true;
  const c = ctrOf(i, 0);
  const erupt = magmaFx(i, 1.4);
  await tween(0.55, t => { T.flash = 1.4*t; T.lift.position.x = (Math.random()-.5)*0.06*t; T.lift.position.z = (Math.random()-.5)*0.06*t; });
  // 砕け散る
  spark(c.clone().add(V(0, 0.3, 0)), 0x8c8170, 26, { shards:true, up:3.2, speed:1.1 });
  spark(c.clone().add(V(0, 0.3, 0)), 0xff7a2a, 30, { up:3.8, speed:1.0 });
  vanish(T);
  await erupt;
  release(i);
}
fx('triggerKDestroy', kDestroy);
fx('triggerHammerSmash', kDestroy);
async function kSurvive(i){
  const T = K.tiles[i]; if(!T) return;
  const c = ctrOf(i, 0.05);
  await tween(0.6, t => { T.flash = 1.1*(1 - t); if(Math.random() < 0.5) spark(c.clone().add(V((Math.random()-.5)*0.6, 0, (Math.random()-.5)*0.6)), Math.random() < 0.5 ? 0xff7a2a : 0x3a2a24, 1, { up:1.2, speed:0.15, life:0.7 }); });
  T.flash = 0;
}
fx('triggerKShatterSurvive', kSurvive);
fx('triggerCrackShatter', kSurvive);

// 6: 渦潮が生まれ、水しぶきとともにフロアを呑み込む
fx('triggerWhirlpoolDrain', async (i) => {
  const T = K.tiles[i]; if(!T) return;
  hold(i); T.anim = true;
  const c = ctrOf(i, 0.02);
  // 渦潮のモデル(fx-whirl)があれば、それを床の上で波打たせながら回す。無ければ水の輪
  const disc = fxDisc('fx-whirl', { wave:0.045, waveK:26, swirl:0.5, spin:2.4, glow:0.35, glowColor:0x9fd8ff });
  let tt = 0;
  if(disc){ disc.position.copy(c).add(V(0, 0.06, 0)); addMesh(disc); }
  const rings = []; if(!disc) for(let k=0;k<7;k++){ const r = addMesh(ring(0.14 + k*0.08, 0.02, k%2 ? 0x8fd0ff : 0x4aa8ff, Math.PI*1.6)); r.position.copy(c).add(V(0, k*0.03, 0)); rings.push(r); }
  await tween(0.5, t => {
    tt = t*0.5;
    if(disc){ disc.userData.tick(tt, 0.95*t); disc.scale.setScalar(0.3 + 0.75*ease.back(t)); }
    rings.forEach((r, j) => { r.material.opacity = 0.7*t; r.rotation.z = -t*10*(1 + j*0.2); });
  });
  await tween(1.0, t => {
    const k = ease.inOut(t);
    tt = 0.5 + t;
    if(disc){ disc.userData.tick(tt, 0.95); disc.position.y = c.y + 0.06 - k*0.25; disc.scale.setScalar(1.05 - 0.15*k); }
    rings.forEach((r, j) => { r.rotation.z -= 0.25*(1 + j*0.15); r.scale.setScalar(1 + 0.2*Math.sin(t*8 + j)); });
    T.g.position.y = -k*1.4; T.g.rotation.y = k*Math.PI*2.5; T.g.scale.setScalar(1 - 0.5*k);
    if(Math.random() < 0.8) spark(c.clone().add(V((Math.random()-.5)*0.9, 0.05, (Math.random()-.5)*0.9)), Math.random()<0.6 ? 0x8fd0ff : 0xffffff, 2, { up:2.6, speed:0.5, life:0.6 });
  });
  spark(c.clone().add(V(0, 0.1, 0)), 0xbfe8ff, 30, { up:3, speed:0.8 });
  vanish(T);
  await tween(0.4, t => {
    if(disc){ disc.userData.tick(1.5 + t*0.4, 0.95*(1 - t)); disc.scale.setScalar(0.9*(1 - 0.7*t)); }
    rings.forEach(r => { r.material.opacity = 0.7*(1 - t); r.scale.setScalar(1 - 0.6*t); });
  });
  rings.forEach(K.disposeObj); disposeDisc(disc);
  release(i);
});

// 7: 竜巻が起こり(残り続ける)、フロアをあおりながら運ぶ / その場で消える
const tornadoes = new Map();
function makeTornado(i){
  const g = K.tornado(); g.position.copy(ctrOf(i, 0)); g.scale.setScalar(0.01);
  const tok = { g, alive:true, t0: performance.now()/1000, s:0 };
  (function spin(){ if(!tok.alive) return; const t = performance.now()/1000 - tok.t0; K.spinTornado(g, t); g.scale.setScalar(Math.min(1, tok.s)); requestAnimationFrame(spin); })();
  return tok;
}
fx('triggerTornadoAppear', async (i) => {
  const tok = makeTornado(i); tornadoes.set(i, tok);
  await tween(0.6, t => { tok.s = ease.back(t); if(Math.random() < 0.5) spark(ctrOf(i, 0.1), 0x9fffd0, 1, { up:1.2, speed:0.6, life:0.5 }); });
  tok.s = 1;
}, { off: i => {} });
async function endTornado(i){
  const tok = tornadoes.get(i); tornadoes.delete(i);
  if(!tok) return;
  await tween(0.45, t => { tok.s = 1 - t; });
  tok.alive = false; K.disposeObj(tok.g);
}
fx('triggerTornadoSettleInPlace', endTornado, { off: i => { const tok = tornadoes.get(i); if(tok){ tok.alive = false; K.disposeObj(tok.g); tornadoes.delete(i); } } });
fx('triggerTornadoVanish', endTornado, { flag:'none' });
fx('triggerTornadoMove', async (src, dst) => {
  const Ts = K.tiles[src], Td = K.tiles[dst], slot = state.floor[src];
  let tok = tornadoes.get(src); tornadoes.delete(src);
  if(!tok){ tok = makeTornado(src); tok.s = 1; }
  hold(src); hold(dst);
  Ts.anim = true;
  const a = ctrOf(src, 0), b = V(K.tileX(dst), K.TOP_Y, K.tileZ(dst));
  const lift = 0.9;
  await tween(1.2, t => {
    const k = ease.inOut(t);
    const p = a.clone().lerp(b, k);
    tok.g.position.copy(p);
    // フロアは竜巻にあおられ、揺れながら宙を運ばれる
    Ts.g.position.set(p.x - K.tileX(src) + K.tileX(src), Math.sin(Math.PI*t)*lift + Math.sin(t*18)*0.05, p.z);
    Ts.g.position.x = p.x;
    Ts.g.rotation.set(Math.sin(t*9)*0.35, t*Math.PI*3, Math.cos(t*7)*0.3);
    if(Math.random() < 0.6) spark(p.clone().add(V(0, 0.4, 0)), 0x9fffd0, 1, { up:1, speed:0.8, life:0.4 });
  });
  // 着地: 運ばれたフロアを移動先のマスとして置き直す
  const key = Ts.key, card = slot && slot.card;
  vanish(Ts);
  resetTile(Td);
  if(key){ if(key.startsWith('face:') && card) K.setTop(Td, key, card); else K.setTop(Td, 'back'); }
  Td.g.visible = true; Td.shown = true; Td.destroyed = false;
  dust(ctrOf(dst));
  await tween(0.4, t => { tok.s = 1 - t; });
  tok.alive = false; K.disposeObj(tok.g);
  release(src); release(dst);
}, { off: (s) => { const tok = tornadoes.get(s); if(tok){ tok.alive = false; K.disposeObj(tok.g); tornadoes.delete(s); } } });
// 風のマス: 着地・消散のつむじ風
function gust(i, out){
  const c = ctrOf(i, 0.1);
  const r = addMesh(ring(0.3, 0.02, 0x9fffd0, Math.PI*1.5)); r.position.copy(c);
  return tween(0.6, t => { r.material.opacity = 0.8*Math.sin(Math.PI*t); r.rotation.z = t*10; r.scale.setScalar(out ? 1 + t*1.2 : 1.6 - t*0.8); if(Math.random() < 0.5) spark(c, 0x9fffd0, 1, { up:0.8, speed:0.8, life:0.4 }); }).then(() => K.disposeObj(r));
}
fx('triggerWindCellLanding', i => gust(i, false));
fx('triggerWindCellDissipate', i => gust(i, true));
fx('triggerWindCellForm', i => gust(i, false));

// J: ゴーレムにエネルギーを吸い取られ、フロアが粒子になって消える
fx('triggerBlackEvaporate', async (i) => {
  const T = K.tiles[i]; if(!T) return;
  hold(i); T.anim = true;
  const c = ctrOf(i, 0.1);
  const target = casterWorld(state.current) || c.clone().add(V(0, 1, 0));
  if(chars[state.current]) K.faceTo(state.current, c, 2);
  await tween(1.2, t => {
    const k = ease.in ? ease.in(t) : t*t;
    T.g.scale.setScalar(Math.max(0.01, 1 - t)); T.g.position.y = t*0.2;
    T.flash = 0.8*t;
    for(let n=0;n<3;n++){
      const m = new THREE.Mesh(K.partGeo, new THREE.MeshBasicMaterial({ color: Math.random()<0.6 ? 0x6ac8ff : 0x2a2440, transparent:true, depthWrite:false, blending:K.ADD }));
      m.position.copy(c).add(V((Math.random()-.5)*0.9*(1-t), Math.random()*0.2, (Math.random()-.5)*0.9*(1-t)));
      m.userData = { v: target.clone().sub(m.position).multiplyScalar(1.5), life:0, max:0.65, spin:V(4, 4, 0), g:0, grow:0 };
      K.scene.add(m); K.parts.push(m);
    }
  });
  vanish(T);
  spark(target, 0x6ac8ff, 20, { up:1.2, speed:0.5 });
  release(i);
});
fx('triggerJackAbsorb', async () => {});

// JOKER: 黒(崩壊)/白(再生)の球がフロアを包み込み、縮んで消えると、フロアも消えている
async function jokerSphere(i){
  const T = K.tiles[i]; if(!T) return;
  const white = jokerKind() === 'JW';
  hold(i); T.anim = true;
  const c = ctrOf(i, 0.15);
  const ball = addMesh(new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 24), new THREE.MeshBasicMaterial({ color: white ? 0xf4fbff : 0x050205, transparent:true, opacity:0, depthWrite:true })));
  const rim = addMesh(shell(white ? 0x9fe8d0 : 0xff2a14, 0.74));
  ball.position.copy(c); rim.position.copy(c);
  await tween(0.7, t => { const k = ease.out(t); ball.scale.setScalar(0.05 + k); rim.scale.setScalar(0.05 + k*1.05); ball.material.opacity = Math.min(1, t*1.6); rim.material.opacity = 0.25*t; });
  vanish(T); // 球の中でフロアが消える
  await tween(0.35, t => { rim.material.opacity = 0.25 + Math.sin(t*20)*0.1; ball.scale.setScalar(1 + Math.sin(t*14)*0.03); });
  await tween(0.55, t => { const k = ease.inOut(t); ball.scale.setScalar(1 - k*0.98); rim.scale.setScalar(1.05*(1 - k*0.98)); rim.material.opacity = 0.25*(1 - t); });
  spark(c, white ? 0xffffff : 0xff2a14, 22, { up:2, speed:0.6 });
  K.disposeObj(ball); K.disposeObj(rim);
  release(i);
}
fx('triggerJokerBarrierBreak', jokerSphere);
fx('triggerScytheSlash', jokerSphere);

// 4: 元の位置に雷のデバフが刻まれる / デバフマスを踏んだときの電撃(元のゲームでは未定義だった)
fx('triggerLightningFloorTransform', i => K.strike(i, false));
if(typeof window.triggerLightningZap !== 'function'){
  window.triggerLightningZap = function(i){ return isOn() ? K.strike(i, false) : Promise.resolve(); };
}
// A: 追加ターン — 太陽が昇り、光が満ちる
fx('triggerExtraTurnWhiteout', async () => {
  const p = state.current, h = headWorld(p) || V(0, 1.5, 0);
  const sun = addMesh(glowSprite(0xffe7a0, 0.3)); sun.position.copy(h).add(V(0, 0.5, 0));
  const light = addMesh(new THREE.PointLight(0xfff0c0, 0, 8, 1.5)); light.position.copy(sun.position);
  await tween(0.9, t => { sun.scale.setScalar(0.3 + ease.out(t)*2.6); sun.material.opacity = t < 0.7 ? 1 : (1 - t)/0.3; light.intensity = 4*Math.sin(Math.PI*t); });
  K.disposeObj(sun); K.scene.remove(light);
});

/* =====================================================================
   手札・捨て札(画面全体の3Dレイヤー)。行き先は頭上ゲージ(=パーソナル)
   ===================================================================== */
const ui = K.ui, P = K.P;
const uiFx = (name, run) => K.override(name, () => function(){ const a = arguments; return K.uiFx(() => run.apply(null, a)); });
const deckPx = () => { const e = document.querySelector('.deck-gauge-track'); return e ? K.rectCenter(e) : { x: innerWidth*0.5, y: 40 }; };
// glTF を画面レイヤー用に複製(トゥーンはこのレイヤーで描けないので Lambert に)
function uiModel(key, px, mini){
  const m = B.cloneModel && B.cloneModel(key, mini);
  if(!m) return null;
  m.traverse(o => {
    if(!o.isMesh) return;
    const src = o.material;
    o.material = new THREE.MeshLambertMaterial({ map: src.map || null, color: src.color ? src.color.clone() : 0xffffff, emissive: 0x181818, skinning: !!o.isSkinnedMesh, side: src.side });
  });
  const box = new THREE.Box3().setFromObject(m), sz = box.getSize(V(0, 0, 0));
  const g = new THREE.Group(); g.add(m);
  m.position.set(-(box.min.x + box.max.x)/2, -(box.min.y + box.max.y)/2, -(box.min.z + box.max.z)/2);
  g.scale.setScalar(px / Math.max(sz.y, sz.x, 1e-6));
  ui.sc.add(g);
  return g;
}
// 左右どちらへ向かうかで、横向き(進行方向を向く)にする
// side: 横長(蛇のように XY 面に広がる)モデルは裏返して向きを変える。頭は −X 側
const faceDir = (g, a, b, side) => { g.rotation.y = side ? (b.x >= a.x ? Math.PI : 0) : (b.x >= a.x ? 1 : -1)*Math.PI/2; };

// 山札から引く(通常・2・Q): 裏向きのカードが山札からゲージへ
uiFx('triggerDrawCardAppear', async (p) => {
  const a = deckPx(), b = K.panelPx(p, 'hand');
  const c = K.card3D(null, false, 0.9); c.position.copy(P(a.x, a.y, 60));
  await K.flyCard(c, a, b, 0.5, 90, 1);
  K.uiSpark(b.x, b.y, 0x7dff9a, 10);
  K.uiDispose(c);
});
// A: 太陽からカードが生まれる
uiFx('triggerSunDrawCardAppear', async (p) => {
  const b = K.panelPx(p, 'hand'), a = { x: b.x, y: b.y - 120 };
  K.uiSpark(a.x, a.y, 0xffd76a, 18, 160);
  const c = K.card3D(null, false, 0.9);
  await K.flyCard(c, a, b, 0.45, 20, 1);
  K.uiSpark(b.x, b.y, 0xffe7a0, 12);
  K.uiDispose(c);
});
/* ♠: スートの紋章と斬撃(assets/textures/spade_emblem.png / spade_slash.png)
   ① 予兆: 術者の足元に、スペードの紋章が床に寝た向きで灯り、ゆっくり回る
   ② 本体: 斬撃が術者から飛び、相手の頭上のプレートを横に切り裂く。プレートが揺れ、手札が 1 欠ける
   ③ 余韻: 紋章が相手の頭上に刻印のように押される。紫の火の粉が下へ落ち、捨て札が +1 で光る
   頭上のプレートを隠している設定でも、この間だけ相手のプレートを出す(数字の変化でカードの行き先を見せる) */
const gaugeEl = p => document.querySelectorAll('#b3-hud .b3-gauge')[p] || null;
function uiImage(tex, w, h){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map:tex, transparent:true, depthWrite:false, depthTest:false, blending:THREE.AdditiveBlending, opacity:0 }));
  m.scale.set(w, h || w, 1); K.ui.sc.add(m); return m;
}
// 火の粉: 下へ落ちる紫の丸い粒(中心が明るく、ふちがぼやける)
let emberTex = null;
function emberTexture(){
  if(emberTex) return emberTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (emberTex = new THREE.CanvasTexture(c));
}
function embers(x, y, n){
  for(let k=0;k<n;k++){
    const r = 7 + Math.random()*9;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r, r), new THREE.MeshBasicMaterial({ map:emberTexture(), color: Math.random() < 0.7 ? 0xb06cff : 0xf1e2ff, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:false }));
    m.position.copy(K.P(x + (Math.random() - .5)*120, y + (Math.random() - .5)*40, 55));
    m.userData = { v:V((Math.random() - .5)*30, -10 - Math.random()*30, 0), life:0, max:0.9 + Math.random()*0.7, g:90, spin:0 };
    K.ui.sc.add(m); K.ui.parts.push(m);
  }
}
// 弾ける光の粒(丸)。K.uiSpark の丸い版
function roundSpark(x, y, color, n, speed){
  for(let k=0;k<n;k++){
    const r = 6 + Math.random()*8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r, r), new THREE.MeshBasicMaterial({ map:emberTexture(), color, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:false }));
    m.position.copy(K.P(x, y, 50)); const a = Math.random()*Math.PI*2, sp = (speed || 120)*(0.4 + Math.random());
    m.userData = { v:V(Math.cos(a)*sp, Math.sin(a)*sp + 40, 0), life:0, max:0.5 + Math.random()*0.4, g:120, spin:0 };
    K.ui.sc.add(m); K.ui.parts.push(m);
  }
}
K.override('triggerSpadeSlashHand', () => function(p){
  const caster = chars[1 - p], target = chars[p], ST = K.spadeTex || {};
  const hud = window.B3 && window.B3.hudFx ? window.B3.hudFx : () => {};
  // ① 予兆(盤面): 足元の紋章
  const omen = trackAnimation(resolve => {
    resolve = once(resolve);
    if(!settings.effectAnim || !caster || !caster.shown || !ST.emblem){ resolve(); return; }
    const base = caster.root.position.clone();
    const mark = K.flatPlane(1.25, ST.emblem, 0xffffff, base.y + 0.03);
    mark.position.x = base.x; mark.position.z = base.z; K.scene.add(mark);
    if(target && target.shown) K.faceTo(1 - p, target.root.position, 3);
    (async () => {
      await tween(2.4, t => {
        mark.rotation.z = t*1.6;
        mark.material.opacity = t < 0.15 ? t/0.15 : t > 0.8 ? (1 - t)/0.2 : 0.9 + Math.sin(t*20)*0.1;
        mark.scale.setScalar(0.85 + 0.15*ease.out(Math.min(1, t*4)));
        if(t < 0.3 && Math.random() < 0.3) burst(base.clone().add(V((Math.random() - .5)*0.8, 0.05, (Math.random() - .5)*0.8)), 0xa35cff, 1, { up:1.2, speed:0.1, life:0.5, g:-0.3 });
      });
      K.disposeObj(mark); resolve();
    })().catch(e => failSafe(e, null, resolve));
  });
  // ②③ 本体と余韻(画面): 斬撃 → プレート → 刻印 → 火の粉と捨て札 +1
  const strike = K.uiFx(async () => {
    hud(p, { show:true });
    await wait(0.55);
    const g = gaugeEl(p);
    const a = K.casterPx(1 - p);
    let b = K.panelPx(p, 'hand');
    const box = g && g.getBoundingClientRect().width ? (r => ({ x:r.left + r.width/2, y:r.top + r.height/2, w:r.width, h:r.height }))(g.getBoundingClientRect()) : { x:b.x, y:b.y, w:90, h:40 };
    // 斬撃が飛ぶ(回りながら)
    if(ST.slash){
      const sl = uiImage(ST.slash, 90);
      // 丸い(外側の)方を前にして飛ばす: 絵は左が丸い側なので、進む向きへ絵の左を向ける
      await K.uiTween(0.38, t => {
        const k = ease.in(t), q = K.bez(a, box, 60, k), q2 = K.bez(a, box, 60, Math.min(1, k + 0.02));
        sl.position.copy(K.P(q.x, q.y, 80)); sl.rotation.z = Math.atan2(-(q2.y - q.y), q2.x - q.x) - Math.PI;
        sl.material.opacity = Math.min(1, t*4); sl.scale.setScalar(70 + 50*t);
      });
      // プレートを横に切り裂く: 三日月を横に潰して横一文字にし、左から右へ走らせる
      await K.uiTween(0.22, t => { sl.position.copy(K.P(box.x - box.w*0.6 + box.w*1.2*t, box.y, 85)); sl.rotation.z = -0.1; sl.scale.set(box.w*1.7, 46 - 26*t, 1); sl.material.opacity = 1 - t*0.6; });
      K.uiDispose(sl);
    }
    const cut = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color:0xe9d4ff, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:false }));
    cut.position.copy(K.P(box.x, box.y, 86)); cut.scale.set(box.w*1.3, 4, 1); cut.rotation.z = 0.08; K.ui.sc.add(cut);
    hud(p, { hand:-1 });
    if(g){ g.classList.remove('fx-shake'); void g.offsetWidth; g.classList.add('fx-shake'); const hr = g.querySelector('.g-hand'); if(hr){ hr.classList.remove('fx-cut'); void hr.offsetWidth; hr.classList.add('fx-cut'); } }
    roundSpark(box.x, box.y, 0xb06cff, 18, 140);
    K.uiTween(0.35, t => { cut.material.opacity = 1 - t; cut.scale.y = 4 + t*6; }).then(() => K.uiDispose(cut));
    await wait(0.3);
    // 紋章が頭上に刻印のように押される
    if(ST.emblem){
      // 少し透けた紋章にして、紫の火の粉と中央の唐草が目立つように(大きさは以前の 1.5 倍)
      const st = uiImage(ST.emblem, 165), sy = box.y - box.h/2 - 72;
      await K.uiTween(0.2, t => { st.position.copy(K.P(box.x, sy, 90)); st.scale.setScalar(300 - 165*ease.in(t)); st.material.opacity = 0.7*t; });
      roundSpark(box.x, sy + 20, 0xd9a6ff, 12, 90);
      embers(box.x, sy + 40, 28);
      await wait(0.25);
      hud(p, { discard:1 });
      const dr = g && g.querySelector('.g-disc'); if(dr){ dr.classList.remove('fx-gain'); void dr.offsetWidth; dr.classList.add('fx-gain'); }
      await K.uiTween(0.5, t => { st.material.opacity = 0.7*(1 - t); st.scale.setScalar(135 + 38*t); });
      K.uiDispose(st);
    } else {
      hud(p, { discard:1 });
      await wait(0.4);
    }
    await wait(0.25);
    if(g) g.classList.remove('fx-shake');
    hud(p, null); // この直後に元のゲームが手札 → 捨て札へ移して描き直す(数字はそのまま)
  });
  return Promise.all([omen, strike]).then(() => { hud(p, null); });
});
/* ♣: クラブの3枚の葉で星座を組む(assets/textures/club_emblem.png。Riku さんの案)
   ① 予兆: 頭上(プレートの上)に、クラブの形の星座が薄く浮かぶ(星はまだ暗い)
   ② 本体: 捨て札から山札へカードが飛ぶたびに、通り道で星座の葉が 1 つ灯る。3 枚で 3 つの葉がそろうと、星座が完成して光る
   ③ 余韻: 完成した星座が 1 枚のカードに変わり、プレートの手札へ降りる(手札 +1)
   「3 枚ごとに 1 枚」がそのまま見た目になる。2 つ目以降の星座は速く灯す。端数(1〜2 枚)は灯りかけの葉がふっと消える */
const clubTex = (window.BIND_TEX || {}).club_emblem ? new THREE.TextureLoader().load(window.BIND_TEX.club_emblem) : null;
const CLUB_STARS = [[497, 199], [333, 474], [667, 474]].map(([x, y]) => [x/1024 - 0.5, 0.5 - y/1024]); // 上・左・右の星(絵の中心からの割合)
const CLUB_SIZE = 135;
const clubQ = []; // 完成して手札へ降りるのを待つ星座(クラブのドローが 1 つずつ使う)
let clubHideT = 0;
const hudOf = () => (window.B3 && window.B3.hudFx) ? window.B3.hudFx : () => {};
function plateBox(p){
  const g = gaugeEl(p), r = g && g.getBoundingClientRect();
  if(r && r.width) return { x:r.left + r.width/2, y:r.top + r.height/2, w:r.width, h:r.height };
  const c = K.casterPx(p); return { x:c.x, y:c.y - 60, w:90, h:40 };
}
function clubPlate(p, on){
  clearTimeout(clubHideT);
  if(on) hudOf()(p, { show:true });
  else clubHideT = setTimeout(() => hudOf()(p, { show:false }), 900);
}
function makeConstellation(x, y){
  const g = new THREE.Group(); g.position.copy(K.P(x, y, 70)); K.ui.sc.add(g);
  // 後ろの生物と重なっても星座が読めるように、うっすら暗い円を敷く。線は加算にせず、そのまま重ねる(白く飛ばない)
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(CLUB_SIZE*1.15, CLUB_SIZE*1.15), new THREE.MeshBasicMaterial({ map:emberTexture(), color:0x000000, transparent:true, depthWrite:false, depthTest:false, opacity:0 }));
  shade.position.z = -1; g.add(shade);
  const img = new THREE.Mesh(new THREE.PlaneGeometry(CLUB_SIZE, CLUB_SIZE), new THREE.MeshBasicMaterial({ map:clubTex, transparent:true, depthWrite:false, depthTest:false, opacity:0 }));
  img.onBeforeRender = () => { shade.material.opacity = img.material.opacity*0.75; };
  g.add(img);
  const stars = CLUB_STARS.map(([sx, sy]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map:emberTexture(), color:0x9fe8ff, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:false, opacity:0 }));
    m.position.set(sx*CLUB_SIZE, sy*CLUB_SIZE, 1); m.scale.setScalar(1); g.add(m); return m;
  });
  return { g, img, shade, stars, lit:0, x, y };
}
function disposeCon(c){ if(!c || c.gone) return; c.gone = true; clearTimeout(c.timer); K.uiDispose(c.g); }
// 葉(星)を 1 つ灯す
function lightLeaf(c, k, dur){
  const s = c.stars[k], sx = c.x + CLUB_STARS[k][0]*CLUB_SIZE, sy = c.y - CLUB_STARS[k][1]*CLUB_SIZE;
  roundSpark(sx, sy, 0x9fe8ff, 8, 70);
  c.lit = k + 1;
  return K.uiTween(dur, t => { s.material.opacity = Math.min(1, t*2); s.scale.setScalar(8 + 22*ease.back(t)); c.img.material.opacity = 0.3 + 0.12*(k + t); });
}
K.override('triggerClubGrowthVanish', () => function(p, selected){
  return K.uiFx(async () => {
    const n = (selected && selected.length) || 0;
    if(!n || !clubTex) return;
    clubQ.splice(0).forEach(c => { disposeCon(c); K.uiEnd(); }); // 前の効果の残り(山札が尽きて降りなかった星座)
    clubPlate(p, true);
    await wait(0.3);
    const pb = plateBox(p), cx = pb.x, cy = pb.y - pb.h/2 - CLUB_SIZE/2 - 14;
    const deck = deckPx();
    let con = null, done = 0;
    for(let i = 0; i < n; i++){
      const leaf = i % 3, fast = i >= 3;
      if(leaf === 0){
        con = makeConstellation(cx + done*24, cy - done*10);
        await K.uiTween(fast ? 0.15 : 0.35, t => { con.img.material.opacity = 0.3*t; });
      }
      // 捨て札から山札へ。途中で星座の葉が灯る
      const a = K.panelPx(p, 'discard');
      hudOf()(p, { discard: -(i + 1) });
      const card = K.card3D(selected[i], true, 0.8); card.position.copy(K.P(a.x, a.y, 60));
      const dur = fast ? 0.32 : 0.5;
      let lit = false;
      await K.uiTween(dur, t => {
        const k = ease.inOut(t), q = K.bez(a, deck, 120, k);
        card.position.copy(K.P(q.x, q.y, 60)); card.rotation.set(Math.sin(Math.PI*t)*0.5, Math.PI*2*k, 0);
        if(!lit && t > 0.45){ lit = true; lightLeaf(con, leaf, fast ? 0.2 : 0.3); }
      });
      K.uiDispose(card);
      roundSpark(deck.x, deck.y, 0x4aa8ff, 5, 70);
      if(leaf === 2){
        // 3 つの葉がそろった: 星座が完成して光る
        roundSpark(con.x, con.y, 0xcff4ff, 18, 130);
        await K.uiTween(fast ? 0.2 : 0.35, t => { con.img.material.opacity = 0.66 + 0.34*t; con.g.scale.setScalar(1 + 0.15*Math.sin(Math.PI*t)); });
        con.timer = setTimeout(() => { const k = clubQ.indexOf(con); if(k >= 0){ clubQ.splice(k, 1); disposeCon(con); K.uiEnd(); } }, 8000);
        clubQ.push(con); K.uiBegin(); // 手札へ降りるまで画面に残す
        con = null; done++;
      }
    }
    // 端数: 灯りかけの葉がふっと消える(足りなかった)
    if(con){ const c = con; await K.uiTween(0.4, t => { c.img.material.opacity *= 0.9; c.stars.forEach(s => s.material.opacity *= 0.85); c.g.scale.setScalar(1 - 0.1*t); }); disposeCon(c); }
    hudOf()(p, { discard:0 }); // この直後に元のゲームが捨て札を山札へ移す
    if(!clubQ.length) clubPlate(p, false);
  });
});
K.override('triggerClubDrawAppear', () => function(p){
  return K.uiFx(async () => {
    clubPlate(p, true);
    const con = clubQ.shift();
    const b = K.panelPx(p, 'hand');
    const card = K.card3D(null, false, 0.9);
    if(con){
      clearTimeout(con.timer);
      // 星座が 1 枚のカードに変わる
      card.position.copy(K.P(con.x, con.y, 75)); card.scale.setScalar(0.01);
      await K.uiTween(0.3, t => { con.img.material.opacity = 1 - t; con.stars.forEach(s => s.material.opacity = 1 - t); con.g.scale.setScalar(1 - 0.5*t); card.scale.setScalar(Math.max(0.01, ease.back(t))); });
      roundSpark(con.x, con.y, 0x9fe8ff, 12, 100);
      disposeCon(con); K.uiEnd();
      await K.flyCard(card, { x:con.x, y:con.y }, b, 0.4, 20, 0);
    } else {
      const a = deckPx(); card.position.copy(K.P(a.x, a.y, 60));
      await K.flyCard(card, a, b, 0.45, 60, 1);
    }
    roundSpark(b.x, b.y, 0x4aa8ff, 12, 110);
    K.uiDispose(card);
    hudOf()(p, { hand:1 });
    const hr = gaugeEl(p) && gaugeEl(p).querySelector('.g-hand'); if(hr){ hr.classList.remove('fx-gain'); void hr.offsetWidth; hr.classList.add('fx-gain'); }
    await wait(0.15);
    hudOf()(p, { hand:0 }); // この直後に元のゲームが手札に加える
    clubPlate(p, false);
  });
});
// JOKER(手札): 大鎌が相手のゲージを切り裂く
uiFx('triggerScytheSlashHand', async (p) => {
  const b = K.panelPx(p, 'hand'), white = jokerKind() === 'JW';
  const blade = new THREE.Mesh(new THREE.TorusGeometry(46, 4, 6, 40, Math.PI*0.9), new THREE.MeshBasicMaterial({ color: white ? 0xeaffff : 0xff3020, transparent:true, opacity:0.9, blending:THREE.AdditiveBlending, depthWrite:false }));
  ui.sc.add(blade); blade.position.copy(P(b.x, b.y, 80));
  await K.uiTween(0.35, t => { blade.rotation.z = 2.4 - t*3.2; blade.material.opacity = Math.sin(Math.PI*t); });
  K.uiDispose(blade);
  K.uiSpark(b.x, b.y, white ? 0xffffff : 0xff2a14, 22, 160);
  const halves = [K.card3D(null, false, 0.9), K.card3D(null, false, 0.9)];
  await K.uiTween(0.45, t => halves.forEach((c, k) => { c.position.copy(P(b.x + (k ? 1 : -1)*t*40, b.y + t*t*60, 70)); c.rotation.z = (k ? -1 : 1)*t*1.2; c.scale.set(0.5, 1, 1); }));
  halves.forEach(K.uiDispose);
});

// 5: 大蛇(5のモデル)が相手のゲージまで伸び、カードを咥えて持ち帰る
uiFx('triggerGreenVortexSteal', async (targetIdx, handIdx, receiverIdx) => {
  const a = K.casterPx(receiverIdx), b = K.panelPx(targetIdx, 'hand'), home = K.panelPx(receiverIdx, 'hand');
  const snake = uiModel('c5', 170);
  const path = (t, f, to) => { const q = K.bez(f, to, 70, t); return { x: q.x, y: q.y + Math.sin(t*14)*8*(1 - t) }; };
  if(snake){
    faceDir(snake, a, b, true);
    await K.uiTween(0.55, t => { const q = path(ease.out(t), a, b); snake.position.copy(P(q.x, q.y, 50)); snake.rotation.z = Math.sin(t*16)*0.2; });
  }
  K.uiSpark(b.x, b.y, 0x8fffb0, 16);
  const card = K.card3D(null, false, 0.9);
  if(snake) faceDir(snake, b, home, true);
  await K.uiTween(0.6, t => { const q = path(ease.inOut(t), b, home); if(snake){ snake.position.copy(P(q.x, q.y, 50)); snake.rotation.z = Math.sin(t*16)*0.2; } card.position.copy(P(q.x, q.y + 26, 70)); card.rotation.z = Math.sin(t*20)*0.15; });
  K.uiSpark(home.x, home.y, 0x8fffb0, 14);
  if(snake) await K.uiTween(0.25, t => snake.scale.multiplyScalar(0.9));
  if(snake) K.uiDispose(snake); K.uiDispose(card);
});
K.override('triggerHandStealAnim', () => function(){ return Promise.resolve(); });

// 10: 虫(10の軽量モデル)の群れが相手のゲージへ飛び、カードを運ぶ
async function swarm(a, b, n, carry){
  const bugs = [];
  for(let k=0;k<n;k++){ const m = uiModel('c10', 26 + Math.random()*12, true); if(!m) break; faceDir(m, a, b); bugs.push({ m, d: Math.random()*0.25, ox:(Math.random()-.5)*70, oy:(Math.random()-.5)*50, ph: Math.random()*6 }); }
  if(!bugs.length){ for(let k=0;k<n;k++) bugs.push({ m: K.bugMesh(), d: Math.random()*0.25, ox:(Math.random()-.5)*70, oy:(Math.random()-.5)*50, ph: Math.random()*6 }); }
  await K.uiTween(0.85, t => bugs.forEach(o => {
    const k = Math.max(0, Math.min(1, (t - o.d)/0.7)), q = K.bez(a, b, 40, ease.inOut(k));
    o.m.position.copy(P(q.x + o.ox*Math.sin(Math.PI*k) + Math.sin(t*30 + o.ph)*3, q.y + o.oy*Math.sin(Math.PI*k), 45));
    o.m.rotation.x = Math.sin(t*25 + o.ph)*0.3;
    if(carry){ const c = K.bez(a, b, 40, ease.inOut(t)); carry.position.copy(P(c.x, c.y - 10, 70)); }
  }));
  bugs.forEach(o => K.uiDispose(o.m));
}
uiFx('triggerRedPurpleHandRise', async (target, r, card) => {
  const a = K.casterPx(1 - target), b = K.panelPx(target, 'hand');
  await swarm(a, b, 18);
  K.uiSpark(b.x, b.y, 0xc8ff3a, 16);
  const c = K.card3D(card, true, 1);
  await swarm(b, a, 14, c);
  K.uiDispose(c);
});
uiFx('triggerRedPurpleDiscardArrival', async (p, card) => {
  const a = K.casterPx(p), b = K.panelPx(p, 'discard');
  const c = K.card3D(card, true, 1);
  await swarm(a, b, 12, c);
  K.uiSpark(b.x, b.y, 0xc8ff3a, 12); K.uiDispose(c);
});
uiFx('triggerRedPurpleDiscardReturn', async () => {});
// 9: 捨て札が紫の炎とともに悪魔のもとへ / 終わると炎が消える(カードは山札の上にある)
uiFx('triggerDiscardPillarReturn', async (p) => { const a = K.casterPx(p); K.uiSpark(a.x, a.y, 0xa35cff, 14); });
// J: 吸収したエネルギーがゲージへ / 終わったら何もしない
uiFx('triggerBlackMistReturn', async () => {});

// Q: 山羊(Qのモデル)が相手のゲージへ跳び、手札を食らい尽くす
uiFx('triggerHandWipeNebula', async (target) => {
  const caster = state.current, a = K.casterPx(caster), b = K.panelPx(target, 'hand');
  const goat = uiModel('c12', 90);
  if(goat){ faceDir(goat, a, b); await K.uiTween(0.5, t => { const q = K.bez(a, { x: b.x, y: b.y + 20 }, 80, ease.inOut(t)); goat.position.copy(P(q.x, q.y, 50)); }); }
  const n = Math.max(1, Math.min(6, (state.players[target] && state.players[target].hand.length) || 3));
  const cards = []; for(let k=0;k<n;k++){ const c = K.card3D(null, false, 0.75); c.position.copy(P(b.x + (k - (n-1)/2)*26, b.y - 20, 60)); cards.push(c); }
  for(const c of cards){ // 1枚ずつ食べる
    const s = c.position.clone(), g = goat ? goat.position.clone() : P(b.x, b.y, 50);
    await K.uiTween(0.16, t => { c.position.lerpVectors(s, g, t); c.scale.setScalar(1 - t); });
    K.uiSpark(b.x, b.y + 10, 0xffd76a, 6); K.uiDispose(c);
    if(goat) goat.rotation.z = (Math.random() - .5)*0.2;
  }
  if(goat){ await K.uiTween(0.35, t => { const q = K.bez({ x: b.x, y: b.y + 20 }, a, 60, ease.inOut(t)); goat.position.copy(P(q.x, q.y, 50)); goat.scale.multiplyScalar(0.97); }); K.uiDispose(goat); }
});
// Q: 捨てられたカードが捨て札ゲージに現れる
uiFx('triggerDiscardAppearNebula', async (p, count) => {
  const b = K.panelPx(p, 'discard');
  K.uiSpark(b.x, b.y, 0xff9be0, 10 + Math.min(10, (count || 1)*3), 140);
});
// ♦/♣: 選んだ捨て札が山札へ戻っていく
function discardToDeck(color){
  return async (p, selected) => {
    const a = K.panelPx(p, 'discard'), b = deckPx();
    const n = Math.max(1, Math.min(6, (selected && selected.length) || 1));
    await Promise.all([...Array(n)].map((_, k) => wait(k*0.08).then(async () => {
      const c = K.card3D(selected && selected[k], true, 0.8); c.position.copy(P(a.x, a.y, 60));
      K.uiSpark(a.x, a.y, color, 4);
      await K.flyCard(c, a, b, 0.5, 80, 1); K.uiDispose(c);
    })));
    K.uiSpark(b.x, b.y, color, 12);
  };
}
uiFx('triggerDiscardSpinVanish', discardToDeck(0xffb030));
// 4: 捨て札が裏返って浮かび、新しいフロアへ
uiFx('triggerDiscardFlipRise', async (p, cardIdx, before) => {
  const a = K.panelPx(p, 'discard'), b = K.casterPx(p);
  const c = K.card3D(before && before[cardIdx], true, 0.9); c.position.copy(P(a.x, a.y, 60));
  await K.uiTween(0.3, t => { c.rotation.y = t*Math.PI; });
  await K.flyCard(c, a, b, 0.45, 60, 0);
  K.uiSpark(b.x, b.y, 0xa35cff, 12); K.uiDispose(c);
});
// JOKER(最後): 相手の捨て札から1枚を山札の一番上へ / 残りの捨て札を山札の下へ
uiFx('triggerJokerTopdeckRise', async (p, cardIdx, before) => {
  const a = K.panelPx(p, 'discard'), b = deckPx();
  const c = K.card3D(before && before[cardIdx], true, 0.9); c.position.copy(P(a.x, a.y, 60));
  await K.flyCard(c, a, b, 0.55, 100, 2);
  K.uiSpark(b.x, b.y, jokerKind() === 'JW' ? 0xffffff : 0xff2a14, 14); K.uiDispose(c);
});
uiFx('triggerRemainingDiscardNebula', async (p) => {
  const n = Math.min(6, (state.players[p] && state.players[p].discard.length) || 0);
  if(!n) return;
  await discardToDeck(jokerKind() === 'JW' ? 0xffffff : 0x8a2020)(p, new Array(n).fill(null));
});

/* ---- 精神波の枠(5/10/Q/♠/JOKER): 3D表示中は頭上ゲージを光らせる ---- */
const minds = new Map();
['attachMindFrame', 'detachMindFrame'].forEach(n => {
  const orig = window[n]; if(typeof orig !== 'function') return;
  window[n] = function(p, cls){
    if(!isOn()) return orig.apply(this, arguments);
    const st = minds.get(p) || []; minds.set(p, st);
    if(n === 'attachMindFrame'){ if(settings.effectAnim) st.push(cls || 'green'); }
    else st.pop();
    const h = B.hud && B.hud.huds[p];
    if(h){ h.box.dataset.mind = st.length ? st[st.length - 1] : ''; }
  };
});

/* =====================================================================
   #5 #6 対象を選んだとき: パーソナルが対象を向き、パーソナルの効果なら
   効果ごとの飛翔エフェクトが対象へ向かう
   ===================================================================== */
const PROJ = {
  H:{ c:0xff3344, shape:'chain' }, S:{ c:0xa35cff, shape:'blade' }, D:{ c:0xffb02e, shape:'crystal' }, C:{ c:0x4aa8ff, shape:'star' },
  1:{ c:0xffd76a, shape:'orb' }, 2:{ c:0x8fd0ff, shape:'orb' }, 3:{ c:0xb89cff, shape:'bubble' }, 4:{ c:0xa35cff, shape:'blade' },
  5:{ c:0x6aff9a, shape:'orb' }, 6:{ c:0x4aa8ff, shape:'drop' }, 7:{ c:0x9fffd0, shape:'wind' }, 8:{ c:0xffe14f, shape:'bolt' },
  9:{ c:0xc040ff, shape:'flame' }, 10:{ c:0xa8ff3a, shape:'bug' }, 11:{ c:0x6ac8ff, shape:'rock' }, 12:{ c:0xffd76a, shape:'orb' },
  13:{ c:0xff6a1a, shape:'lava' }, JOKER:{ c:0xff2a14, shape:'scythe' },
};
function projMesh(spec){
  const g = new THREE.Group();
  const m = c => new THREE.MeshBasicMaterial({ color: c, transparent:true, blending:K.ADD, depthWrite:false });
  switch(spec.shape){
    case 'blade': { const b = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), K.toon(0x1c1028, { emissive: spec.c, emissiveIntensity:0.6 })); b.scale.set(0.35, 2.4, 0.35); b.rotation.x = Math.PI/2; g.add(b); break; }
    case 'crystal': { const b = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), K.toon(0xffc94a, { emissive: spec.c, emissiveIntensity:0.8 })); b.scale.set(1, 1.7, 1); g.add(b); break; }
    case 'chain': { for(let k=0;k<3;k++){ const l = new THREE.Mesh(K.linkGeo, K.toon(0x9a948a, { emissive: spec.c, emissiveIntensity:0.6 })); l.position.z = -k*0.1; l.rotation.set(k%2 ? Math.PI/2 : 0, 0, 0); g.add(l); } break; }
    case 'bubble': g.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshBasicMaterial({ color: spec.c, transparent:true, opacity:0.45, depthWrite:false }))); break;
    case 'drop': { const d = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), m(spec.c)); d.scale.set(1, 1, 1.8); g.add(d); break; }
    case 'rock': g.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.1), K.toon(0x4a4038, { emissive: spec.c, emissiveIntensity:0.5 }))); break;
    case 'lava': g.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.1), K.toon(0x3a1a10, { emissive: spec.c, emissiveIntensity:1.2 }))); break;
    case 'scythe': { const s = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 24, Math.PI*0.9), m(spec.c)); g.add(s); g.userData.spinZ = true; break; }
    case 'bug': { const b = B.cloneModel && B.cloneModel('c10', true); if(b){ b.traverse(o => { if(o.isMesh) o.material = B.toToon(o.material); }); const bb = new THREE.Box3().setFromObject(b); b.scale.setScalar(0.22/Math.max(bb.getSize(V(0,0,0)).y, 1e-6)); g.add(b); } break; }
  }
  g.add(glowSprite(spec.c, spec.shape === 'bolt' ? 0.7 : 0.5));
  if(spec.shape === 'orb' || spec.shape === 'star' || spec.shape === 'flame' || spec.shape === 'wind') g.add(glowSprite(0xffffff, 0.2));
  return g;
}
function projectile(p, target, eff){
  const from = headWorld(p); if(!from) return Promise.resolve();
  let key = eff ? eff.key : 'H';
  if(key === 'JOKER') key = 'JOKER';
  const spec = Object.assign({}, PROJ[key] || PROJ[1]);
  if(key === 'JOKER' && jokerKind() === 'JW') spec.c = 0xeaffff;
  const g = projMesh(spec); K.scene.add(g); g.position.copy(from);
  if(window.BindAudio) BindAudio.play('shoot', key);
  const fast = spec.shape === 'bolt';
  const dur = fast ? 0.22 : 0.5;
  return tween(dur, t => {
    const k = fast ? t : ease.inOut(t);
    const q = from.clone().lerp(target, k); q.y += fast ? 0 : Math.sin(Math.PI*t)*0.6;
    if(spec.shape === 'wind' || spec.shape === 'bug'){ q.x += Math.sin(t*20)*0.08; q.z += Math.cos(t*20)*0.08; }
    g.lookAt(q); g.position.copy(q);
    if(g.userData.spinZ) g.rotation.z += 0.5;
    g.children.forEach(c => { if(c.isMesh && !fast) c.rotation.z += 0.2; });
    K.burst(q, spec.c, fast ? 3 : 1, { up:0.3, speed:0.1, life:0.35, g:0 });
  }).then(() => {
    if(window.BindAudio) BindAudio.play('hit');
    K.burst(target, spec.c, 22, { up:1.8, speed:0.6 });
    K.burst(target, 0xffffff, 6, { up:1.2, speed:0.9, life:0.3 });
    K.disposeObj(g);
  });
}
function targetOf(t, payload){
  if(!t) return null;
  const pc = i => (i != null && chars[i] && chars[i].shown) ? chars[i].root.position.clone().add(V(0, 0.6, 0)) : null;
  if(t.kind === 'floor' && typeof payload === 'number') return ctrOf(payload, 0.15);
  if(t.kind === 'floor-multi' && Array.isArray(payload) && payload.length) return ctrOf(payload[0], 0.15);
  if(t.kind === 'hand-slot' || t.kind === 'discard-of') return pc(t.playerIndex);
  if(t.kind === 'hand-area') return pc(payload);
  if(t.kind === 'choice' && /target/.test(t.tag || '') && typeof payload === 'number') return pc(payload);
  return null;
}
let shooting = false;
const origResolve = window.resolveTask;
window.resolveTask = function(payload){
  const st = (typeof state !== 'undefined') ? state : null;
  if(!isOn() || shooting || !st || !st.task || !st.task.resolve) return origResolve.apply(this, arguments);
  const p = st.current, target = targetOf(st.task, payload);
  if(!target) return origResolve.apply(this, arguments);
  K.faceTo(p, target, 3); // #5 対象の方を向く
  const personal = st.phase === 'personal-effect';
  if(!personal || !settings.effectAnim || !chars[p] || !chars[p].shown) return origResolve.apply(this, arguments);
  // ♠ は効果の中で斬撃が飛ぶので、ここでは飛ばさない(2回飛んで見えるため)
  if(st.task.tag === 'spade-select') return origResolve.apply(this, arguments);
  // #6 パーソナルの効果: 飛翔エフェクトが届いてから効果を続ける
  shooting = true;
  const self = this, args = arguments, eff = st.activeEffect;
  trackAnimation(res => {
    res = once(res);
    (async () => { await wait(0.15); await projectile(p, target, eff); })()
      .catch(e => console.error('[Bind3D] 飛翔エフェクト', e))
      .finally(() => { shooting = false; try{ origResolve.apply(self, args); } finally { res(); } });
  });
};
// 数字・スート効果が始まったら、対象がまだ決まっていなくても前を向いて構える(対象が決まると faceTo で向き直る)

/* =====================================================================
   その他の2D演出: 3D表示中は何もしない(上で3D版を用意したもの以外)
   ※ 元のゲームロジック用の関数(triggerNumberEffect など)は対象外
   ===================================================================== */
const LOGIC = new Set(['triggerNumberEffect', 'triggerCardNumberEffect', 'triggerSuitEffect']);
Object.keys(window).filter(n => /^trigger[A-Z]/.test(n) && typeof window[n] === 'function' && !window[n].__b3 && !LOGIC.has(n)).forEach(n => {
  K.override(n, () => function(){ return Promise.resolve(); });
});

window.B3.fx = { glowSprite, shell, flipSlab, projectile, hammerModel, magmaFx, hammerStrike, fxDisc, fxBaked };
})();
