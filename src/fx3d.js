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

/* 6: 渦潮がフロアを呑み込み、山札の下へ送る(Riku さんの案。渦のモデル fx-whirl は動かし方だけで「飲み込む渦」に)
   ① 予兆: 青い光がマスへ飛ぶ(共通の演出) ② 開く: 平たい渦が現れ、回りながらマスの 85% まで広がる
   ③ 飲み込む: 渦が深くなり(厚み 0.3 → 1.6 倍)、すき間越しにフロアが回りながら沈んで暗くなる
   ④ しぶき: 沈みきった瞬間に水の冠が立ち上がる ⑤ 余韻: 渦が閉じ、裏向きのカードが中心から抜け出して山札のゲージの下側へ飛ぶ(山札 +1)
   渦は不透明度 0.7 ほど+わずかに青く光らせ、外周に床の縁が残るようにする */
fx('triggerWhirlpoolDrain', async (i) => {
  const T = K.tiles[i]; if(!T) return;
  hold(i); T.anim = true;
  const c = ctrOf(i, 0.02);
  const W = 0.85; // マスの 85%
  const disc = fxDisc('fx-whirl', { wave:0.04, waveK:26, swirl:0.6, spin:2.6, glow:0.35, glowColor:0x6fb8ff });
  let tt = 0;
  if(disc){ disc.position.copy(c).add(V(0, 0.05, 0)); addMesh(disc); }
  const rings = []; if(!disc) for(let k=0;k<7;k++){ const r = addMesh(ring(0.1 + k*0.055, 0.02, k%2 ? 0x8fd0ff : 0x4aa8ff, Math.PI*1.6)); r.position.copy(c).add(V(0, k*0.03, 0)); rings.push(r); }
  // 水を通して暗く見せる影(フロアが沈むほど濃く)
  const shade = addMesh(new THREE.Mesh(new THREE.CircleGeometry(0.5*W*K.STEP, 32), new THREE.MeshBasicMaterial({ color:0x020a14, transparent:true, opacity:0, depthWrite:false })));
  shade.rotation.x = -Math.PI/2; shade.position.copy(c).add(V(0, 0.03, 0)); shade.renderOrder = 5;
  const size = (s, d) => { if(disc) disc.scale.set(s, d, s); };
  // ② 開く: 平たい渦が回りながら広がる
  await tween(0.55, t => {
    tt = t*0.55;
    if(disc){ disc.userData.tick(tt, 0.55*Math.min(1, t*1.6)); size(0.25 + (W - 0.25)*ease.out(t), 0.3); }
    rings.forEach((r, j) => { r.material.opacity = 0.7*t; r.rotation.z = -t*10*(1 + j*0.2); });
  });
  // ③ 飲み込む: 渦が深くなり、フロアが回りながら沈んで暗くなる
  await tween(1.1, t => {
    const k = ease.inOut(t);
    tt = 0.55 + t*1.3;
    if(disc){ disc.userData.tick(tt, 0.55); size(W, 0.3 + 1.3*k); disc.position.y = c.y + 0.05 - 0.05*k; }
    rings.forEach((r, j) => { r.rotation.z -= 0.25*(1 + j*0.15); r.position.y = c.y - j*0.04*k; });
    shade.material.opacity = 0.55*k;
    T.g.position.y = -k*1.4; T.g.rotation.y = k*Math.PI*2.5; T.g.scale.setScalar(1 - 0.5*k);
    if(Math.random() < 0.5) spark(c.clone().add(V((Math.random()-.5)*0.7, 0.05, (Math.random()-.5)*0.7)), Math.random()<0.6 ? 0x8fd0ff : 0xffffff, 1, { up:1.2, speed:0.3, life:0.5 });
  });
  // ④ しぶき: 沈みきった瞬間に水の冠(assets/textures/splash.png)。カメラを向く板を渦の中心に立て、下から縦に伸ばしてすぐ薄れる(0.4 秒)
  vanish(T);
  // 王冠を真上から見たように: 冠の絵を円錐(上ほど広い筒)に 3 回巻き、外へ広がりながら下から伸びて薄れる
  const SPL = texOf('splash_ring');
  if(SPL){
    SPL.wrapS = THREE.RepeatWrapping; SPL.repeat.set(3, 1);
    const R = 0.5*K.STEP*0.9*1.2, H = 0.55*1.2; // 1.2 倍: 冠の先が渦の外へ少しはみ出す
    // 加算合成で少し明るく(1.3 倍)、渦より手前に描く(根元が渦に隠れない)
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(R, R*0.45, H, 48, 1, true), new THREE.MeshBasicMaterial({ map:SPL, color:new THREE.Color(1.3, 1.3, 1.3), transparent:true, depthWrite:false, depthTest:false, blending:K.ADD, side:THREE.DoubleSide, opacity:1 }));
    cone.renderOrder = 30; addMesh(cone);
    tween(0.4, t => {
      const k = ease.out(Math.min(1, t/0.5));
      cone.scale.set(0.6 + 0.6*t, Math.max(0.001, k), 0.6 + 0.6*t); // 外へ広がりながら、下から縦に伸びる
      cone.position.set(c.x, c.y + 0.02 + H*k/2, c.z);
      cone.material.opacity = t < 0.5 ? 1 : 1 - (t - 0.5)/0.5;
    }).then(() => K.disposeObj(cone));
  } else {
    for(let k = 0; k < 18; k++){
      const a = k/18*Math.PI*2, r = 0.32*W*K.STEP;
      spark(c.clone().add(V(Math.cos(a)*r, 0.05, Math.sin(a)*r)), k%3 ? 0x8fd0ff : 0xffffff, 2, { up:3.2, speed:0.12, life:0.7, g:6 });
    }
  }
  spark(c.clone().add(V(0, 0.1, 0)), 0xbfe8ff, 8, { up:1.6, speed:0.4 });
  // ⑤ 余韻: 渦が閉じる
  await tween(0.45, t => {
    if(disc){ disc.userData.tick(1.85 + t*0.5, 0.55*(1 - t)); size(W*(1 - 0.7*t), 1.6*(1 - 0.8*t)); }
    rings.forEach(r => { r.material.opacity = 0.7*(1 - t); r.scale.setScalar(1 - 0.6*t); });
    shade.material.opacity = 0.55*(1 - t);
  });
  rings.forEach(K.disposeObj); disposeDisc(disc); K.disposeObj(shade);
  // 裏向きのカードが中心から抜け出し、山札のゲージの下側へ(このあと元のゲームが山札の下に入れる)
  await K.uiFx(async () => {
    const a = K.boardPx(c.clone().add(V(0, 0.1, 0))), d = deckPx(), e = document.querySelector('.deck-gauge-track');
    const to = { x:d.x, y:d.y + (e ? e.getBoundingClientRect().height/2 + 14 : 14) };
    const card = K.card3D(null, false, 0.9); card.position.copy(P(a.x, a.y, 60)); card.scale.setScalar(0.3);
    await K.uiTween(0.2, t => card.scale.setScalar(0.3 + 0.7*ease.out(t)));
    await K.flyCard(card, a, to, 0.55, 60, 1);
    roundSpark(to.x, to.y, 0x8fd0ff, 10, 80);
    K.uiDispose(card);
  });
  release(i); // カードが飛んでいる間にマスが戻らないよう、最後に盤面の追従を再開する
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
/* ♣ / ♦: 「3 枚ごとに 1 つ」を、紋章の中の 3 つの灯りで見せる(Riku さんの案)
   ♣ クラブの3枚の葉で星座を組む(assets/textures/club_emblem.png)
     ① 頭上(プレートの上)にクラブの星座が薄く浮かぶ ② 捨て札から山札へカードが飛ぶたびに葉(星)が 1 つ灯り、3 つで完成して光る
     ③ ドローのたびに、完成した星座が 1 枚のカードに変わってプレートの手札へ降りる(手札 +1)
   ♦ ダイヤの紋章の 3 つの宝石(assets/textures/diamond_emblem.png)
     ① 頭上にダイヤの紋章が浮かぶ(宝石はまだ暗い) ② カードが飛ぶたびに宝石が 1 つ灯る
     ③ 3 つそろうと紋章が光の結晶になって空きマスへ降り、新しい裏向きフロアになる
   2 つ目以降は速く灯す。端数(1〜2 枚)は灯りかけの灯りがふっと消える。完成したものは q に入れ、ドロー / フロアの錬成が 1 つずつ使う */
const texOf = k => (window.BIND_TEX || {})[k] ? new THREE.TextureLoader().load(window.BIND_TEX[k]) : null;
const pts = list => list.map(([x, y]) => [x/1024 - 0.5, 0.5 - y/1024]); // 絵(1024px)の中の位置 → 中心からの割合
const SETS = {
  C: { tex:texOf('club_emblem'), stars:pts([[497, 199], [333, 474], [667, 474]]), size:135, glow:0x9fe8ff, star:22, deck:0x4aa8ff, q:[] },    // 上・左・右の星
  D: { tex:texOf('diamond_emblem'), stars:pts([[524, 418], [487, 459], [562, 459]]), size:150, glow:0xfff1b8, star:12, deck:0xffc040, q:[] }, // 上・左・右の宝石
};
let plateHideT = 0;
const hudOf = () => (window.B3 && window.B3.hudFx) ? window.B3.hudFx : () => {};
function plateBox(p){
  const g = gaugeEl(p), r = g && g.getBoundingClientRect();
  if(r && r.width) return { x:r.left + r.width/2, y:r.top + r.height/2, w:r.width, h:r.height };
  const c = K.casterPx(p); return { x:c.x, y:c.y - 60, w:90, h:40 };
}
function suitPlate(p, on){
  clearTimeout(plateHideT);
  if(on) hudOf()(p, { show:true });
  else plateHideT = setTimeout(() => hudOf()(p, { show:false }), 900);
}
function makeConstellation(S, x, y){
  const g = new THREE.Group(); g.position.copy(K.P(x, y, 70)); K.ui.sc.add(g);
  // 後ろの生物と重なっても読めるように、うっすら暗い円を敷く。線は加算にせず、そのまま重ねる(白く飛ばない)
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(S.size*1.15, S.size*1.15), new THREE.MeshBasicMaterial({ map:emberTexture(), color:0x000000, transparent:true, depthWrite:false, depthTest:false, opacity:0 }));
  shade.position.z = -1; g.add(shade);
  const img = new THREE.Mesh(new THREE.PlaneGeometry(S.size, S.size), new THREE.MeshBasicMaterial({ map:S.tex, transparent:true, depthWrite:false, depthTest:false, opacity:0 }));
  img.onBeforeRender = () => { shade.material.opacity = img.material.opacity*0.75; };
  g.add(img);
  const stars = S.stars.map(([sx, sy]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map:emberTexture(), color:S.glow, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:false, opacity:0 }));
    m.position.set(sx*S.size, sy*S.size, 1); g.add(m); return m;
  });
  return { S, g, img, shade, stars, lit:0, x, y };
}
function disposeCon(c){ if(!c || c.gone) return; c.gone = true; K.uiDispose(c.g); }
// スート効果が終わったら、使われなかったもの(山札が尽きた・空きマスが無かった)を片付ける。
// 時間で消すと、空きマスを選んでいる間に次の分まで消えてしまうので、効果の終わりで消す
function clearSets(){ Object.values(SETS).forEach(S => S.q.splice(0).forEach(c => { disposeCon(c); K.uiEnd(); })); }
{
  const prev = window.triggerSuitEffect;
  if(typeof prev === 'function') window.triggerSuitEffect = async function(){ try{ return await prev.apply(this, arguments); } finally{ clearSets(); } };
}
// 灯り(星 / 宝石)を 1 つ灯す
function lightLeaf(c, k, dur){
  const S = c.S, s = c.stars[k], sx = c.x + S.stars[k][0]*S.size, sy = c.y - S.stars[k][1]*S.size;
  roundSpark(sx, sy, S.glow, 8, 70);
  c.lit = k + 1;
  return K.uiTween(dur, t => { s.material.opacity = Math.min(1, t*2); s.scale.setScalar(S.star*(0.35 + ease.back(t))); c.img.material.opacity = 0.3 + 0.12*(k + t); });
}
// ② 捨て札 → 山札(1 枚ごとに灯す)。完成したものを S.q に積む
function returnFx(S, p, selected){
  return K.uiFx(async () => {
    const n = (selected && selected.length) || 0;
    if(!n || !S.tex) return;
    S.q.splice(0).forEach(c => { disposeCon(c); K.uiEnd(); }); // 念のため: 前の効果の残り
    suitPlate(p, true);
    await wait(0.3);
    const pb = plateBox(p), cx = pb.x, cy = pb.y - pb.h/2 - S.size/2 - 14;
    const deck = deckPx();
    let con = null, done = 0;
    for(let i = 0; i < n; i++){
      const leaf = i % 3, fast = i >= 3;
      if(leaf === 0){
        con = makeConstellation(S, cx + done*24, cy - done*10);
        await K.uiTween(fast ? 0.15 : 0.35, t => { con.img.material.opacity = 0.3*t; });
      }
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
      roundSpark(deck.x, deck.y, S.deck, 5, 70);
      if(leaf === 2){
        // 3 つそろった: 完成して光る
        roundSpark(con.x, con.y, S.glow, 18, 130);
        await K.uiTween(fast ? 0.2 : 0.35, t => { con.img.material.opacity = 0.66 + 0.34*t; con.g.scale.setScalar(1 + 0.15*Math.sin(Math.PI*t)); });
        const c = con;
        S.q.push(c); K.uiBegin(); // 使われるまで画面に残す
        con = null; done++;
      }
    }
    // 端数: 灯りかけの灯りがふっと消える(足りなかった)
    if(con){ const c = con; await K.uiTween(0.4, t => { c.img.material.opacity *= 0.9; c.stars.forEach(s => s.material.opacity *= 0.85); c.g.scale.setScalar(1 - 0.1*t); }); disposeCon(c); }
    hudOf()(p, { discard:0 }); // この直後に元のゲームが捨て札を山札へ移す
    if(!S.q.length) suitPlate(p, false);
  });
}
K.override('triggerClubGrowthVanish', () => function(p, selected){ return returnFx(SETS.C, p, selected); });
K.override('triggerDiscardSpinVanish', () => function(p, selected){ return returnFx(SETS.D, p, selected); });
// ③ ♣: 完成した星座が 1 枚のカードに変わり、手札へ降りる
K.override('triggerClubDrawAppear', () => function(p){
  return K.uiFx(async () => {
    suitPlate(p, true);
    const con = SETS.C.q.shift();
    const b = K.panelPx(p, 'hand');
    const card = K.card3D(null, false, 0.9);
    if(con){
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
    suitPlate(p, false);
  });
});
// ③ ♦: 完成した紋章が光の結晶になって空きマスへ降り、新しい裏向きフロアになる
K.override('triggerDiamondCircleSpawn', () => function(slot){
  const con = SETS.D.q.shift();
  const ctr = V(K.tileX(slot), K.TOP_Y, K.tileZ(slot));
  const land = trackAnimation(resolve => {
    resolve = once(resolve);
    if(!settings.effectAnim){ if(con){ disposeCon(con); K.uiEnd(); } resolve(); return; }
    (async () => {
      if(con){
          // 紋章が縮みながら光の結晶になって、マスの上へ降りる(画面の層)
        const to = K.screenOf(slot, 0.15), from = { x:con.x, y:con.y };
        await K.uiTween(0.55, t => {
          const k = ease.inOut(t), q = K.bez(from, to, 40, k);
          con.g.position.copy(K.P(q.x, q.y, 70)); con.g.scale.setScalar(1 - 0.75*k); con.g.rotation.z = k*Math.PI;
          con.img.material.opacity = 1 - 0.3*k; con.stars.forEach(s => { s.material.opacity = 1; s.scale.setScalar(SETS.D.star*(1 + 2*k)); });
        });
        disposeCon(con); K.uiEnd();
      }
      // 盤面: 金色の光が弾け、そこから新しいフロアがせり上がる(フロアは元のゲームが置いたあとに sync が出す)
      const glow = K.flatPlane(1.3, SETS.D.tex || K.circleTex('D'), 0xffffff, ctr.y + 0.02);
      glow.position.x = ctr.x; glow.position.z = ctr.z; glow.rotation.z = Math.PI; K.scene.add(glow);
      burst(ctr.clone().add(V(0, 0.2, 0)), 0xffd36a, 26, { up:2.4, speed:0.6 });
      await tween(0.45, t => { glow.material.opacity = Math.sin(Math.PI*t); glow.scale.setScalar(0.6 + 0.6*t); });
      K.disposeObj(glow);
      resolve();
    })().catch(e => failSafe(e, null, resolve));
  });
  return land.then(() => { if(!SETS.D.q.length) suitPlate(state.current, false); });
});

/* ♥: 封印を解く — 目覚めの演出(assets/textures/heart_emblem.png。Riku さんの案)
   ① 選ばれたフロアの上に、ハートの紋章が鼓動するように 2 回脈打つ
   ② 3 回目の鼓動で、床(封印の紋章)の 4 つの錠前がはじけ飛ぶ(錠前の絵は seal.png から切り出す)
   ③ 封印の金の輪が赤く光り、カードが表向きになる。赤い火の粉が上へ昇る */
const heartTex = texOf('heart_emblem');
const sealTex = texOf('seal');
// seal.png(1024px)の中の 4 つの錠前: 中心と大きさ
const LOCKS = [[422, 430], [602, 430], [422, 605], [602, 605]];
const LOCK_PX = 150;
let lockTexs = null;
function lockTextures(){
  if(lockTexs) return lockTexs;
  const src = (window.BIND_TEX || {}).seal; if(!src) return (lockTexs = []);
  const im = new Image(); im.src = src;
  lockTexs = LOCKS.map(([x, y]) => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const t = new THREE.CanvasTexture(c);
    const draw = () => { c.getContext('2d').drawImage(im, x - LOCK_PX/2, y - LOCK_PX/2, LOCK_PX, LOCK_PX, 0, 0, 128, 128); t.needsUpdate = true; };
    if(im.complete && im.naturalWidth) draw(); else im.addEventListener('load', draw);
    return t;
  });
  return lockTexs;
}
lockTextures(); // 先に読んでおく
K.override('triggerMagmaRiseAndCrack', () => function(cellIndex){
  return trackAnimation(resolve => {
    resolve = once(resolve);
    if(!settings.effectAnim){ resolve(); return; }
    const T = K.tiles[cellIndex], slot = state.floor[cellIndex];
    if(!T || !slot || !slot.card){ resolve(); return; }
    K.holdBack.add(cellIndex);
    const y = K.topY(cellIndex), ctr = V(K.tileX(cellIndex), y, K.tileZ(cellIndex));
    const heart = new THREE.Sprite(new THREE.SpriteMaterial({ map:heartTex, transparent:true, depthWrite:false, opacity:0 }));
    heart.position.copy(ctr).add(V(0, 0.75, 0)); heart.renderOrder = 12; K.scene.add(heart);
    (async () => {
      // ① 2 回脈打つ(ドクン、ドクン)
      for(let b = 0; b < 2; b++){
        if(window.BindAudio) try{ BindAudio.play('hit'); }catch(e){}
        await tween(0.42, t => {
          const k = t < 0.3 ? ease.out(t/0.3) : 1 - ease.in((t - 0.3)/0.7);
          heart.scale.setScalar(0.62 + 0.18*k + b*0.04); heart.material.opacity = Math.min(1, 0.55 + 0.45*k + b*0.1);
          T.flash = 0.35*k;
        });
        await wait(0.12);
      }
      // ② 3 回目の鼓動で、4 つの錠前がはじけ飛ぶ
      const S = (K.STEP || 1)*0.92*0.62; // マスの上の封印の紋章の大きさ(テクスチャの 62%)
      const locks = lockTextures().map((tx, k) => {
        // カメラの方を向く板(スプライト)にして、回っても錠前の形が見えるように
        const m = new THREE.Sprite(new THREE.SpriteMaterial({ map:tx, transparent:true, depthWrite:false }));
        const ox = (LOCKS[k][0]/1024 - 0.5)*S, oz = (LOCKS[k][1]/1024 - 0.5)*S;
        m.scale.setScalar(0.3); m.position.set(ctr.x + ox, y + 0.08, ctr.z + oz); m.renderOrder = 13;
        const dir = V(ox, 0, oz).normalize();
        m.userData.v = V(dir.x*1.6 + (Math.random() - .5)*0.3, 2.4 + Math.random()*0.6, dir.z*1.6 + (Math.random() - .5)*0.3);
        m.userData.spin = (k % 2 ? 1 : -1)*(3 + Math.random()*3);
        K.scene.add(m); return m;
      });
      if(window.BindAudio) try{ BindAudio.play('hit'); }catch(e){}
      burst(ctr.clone().add(V(0, 0.2, 0)), 0xff4a5a, 20, { up:2.6, speed:0.7 });
      const ring = K.flatPlane(1.12*(K.STEP || 1), sealTex || K.circleTex('H'), 0xff3a3a, y + 0.025);
      ring.position.x = ctr.x; ring.position.z = ctr.z; K.scene.add(ring);
      await tween(0.75, t => {
        const k = ease.out(Math.min(1, t/0.25));
        heart.scale.setScalar(0.85 + 0.3*k); heart.material.opacity = 1 - t;
        T.flash = 0.8*(1 - t);
        ring.material.opacity = Math.min(1, t*3)*0.9;
        const dt = 1/60;
        locks.forEach(m => { const u = m.userData; u.v.y -= 6*dt; m.position.addScaledVector(u.v, dt); m.material.rotation += u.spin*dt; m.material.opacity = 1 - Math.max(0, t - 0.65)/0.35; });
      });
      locks.forEach(K.disposeObj); K.disposeObj(heart);
      // ③ 封印の金の輪が赤く光り、カードが表向きになる。赤い火の粉が上へ昇る
      K.holdBack.delete(cellIndex);
      const fl = K.flipTop(T, 'face:' + slot.card.id, slot.card);
      await tween(0.9, t => {
        ring.material.opacity = 0.9*(1 - t); ring.scale.setScalar(1 + 0.15*t); ring.rotation.z = t*0.6;
        if(Math.random() < 0.6) burst(ctr.clone().add(V((Math.random() - .5)*0.8, 0.05, (Math.random() - .5)*0.8)), Math.random() < 0.7 ? 0xff4a3a : 0xffb08a, 1, { up:1.8, speed:0.12, life:0.9, g:-0.5 });
      });
      K.disposeObj(ring);
      await fl;
      resolve();
    })().catch(e => { K.holdBack.delete(cellIndex); try{ K.disposeObj(heart); }catch(_){} failSafe(e, null, resolve); });
  });
});
/* =====================================================================
   A: 太陽の紋章と、残り回数の光(Riku さんの案)
   術者の頭上に太陽の紋章が昇り、満たした条件の分だけ光が並ぶ。1 回使うごとに、その光が飛んでいって効果になる
   (並んでいる光の数 = あと何回)。
     金の珠(紋章の左)×3 … フロア追加: 空きマスへ飛び、光の柱になってフロアが降りる
     白の珠(紋章の右)×3 … 封印: 表向きのフロアへ飛び、光の十字になって裏に戻す(床に太陽の紋章が残る)
     羽根(紋章の上)×5   … 5 枚ドロー: 1 枚ずつ頭上のプレートへ飛び、手札 +1
     追加ターン … 紋章が縮んで頭上の小さな太陽になり、追加ターンの間ずっと残る(adapter.js の sunSp)
   途中で終わる(山札が尽きた・表向きのフロアが足りない)と、残りの光が散って消える。不発なら紋章にひびが入って崩れる
   ===================================================================== */
const ACE = { emblem:texOf('sun_emblem'), beam:texOf('sun_beam'), feather:texOf('feather'), sparkle:texOf('particle_sparkle') };
const ACE_S = 0.7; // 紋章の大きさ
let ace = null;
const _r = V(0, 0, 0), _u = V(0, 0, 0);
function aceCenter(p){
  const ch = chars[p]; if(!ch || !ch.shown) return null;
  return ch.root.position.clone().add(V(0, (ch.av ? ch.av.badgeY + (ch.av.lift || 0) : 1.1) + 0.85, 0));
}
function aceSprite(map, color, sx, sy, add){
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent:true, depthWrite:false, depthTest:false, blending: add ? K.ADD : THREE.NormalBlending, opacity:0 }));
  s.scale.set(sx, sy || sx, 1); s.renderOrder = 22; K.scene.add(s); return s;
}
// 紋章のまわりの決まった位置(画面の左右・上)
function aceSlot(kind, k){
  const R = ACE_S*0.78;
  const a = kind === 'gold' ? Math.PI*(0.8 + 0.2*k) : kind === 'white' ? Math.PI*(0.2 - 0.2*k) : Math.PI*(0.25 + 0.125*k);
  return { ox: Math.cos(a)*R*(kind === 'feather' ? 1.05 : 1), oy: Math.sin(a)*R*(kind === 'feather' ? 1.05 : 1), a };
}
function makeItem(kind, k){
  const it = { kind, k, idle:true, slot:aceSlot(kind, k) };
  if(kind === 'feather'){
    it.s = aceSprite(ACE.feather, 0xffffff, 0.12, 0.26, false); it.s.material.rotation = it.slot.a - Math.PI/2;
  } else {
    it.s = aceSprite(K.softTex || K.starTex, kind === 'gold' ? 0xffc24a : 0xeef6ff, 0.2, 0.2, true);
    it.core = aceSprite(ACE.sparkle || K.starTex, 0xffffff, 0.14, 0.14, true);
  }
  return it;
}
const itemPos = it => it.s.position;
function itemsOf(a){ return [...a.gold, ...a.white, ...a.feathers]; }
(function aceTick(){
  requestAnimationFrame(aceTick);
  try{ aceStep(); }catch(e){ console.error('[Bind3D] A の演出', e); }
})();
// いま選んでいる組だけを主役にする: 主役の組は大きく脈打ち、紋章の後ろの光もその色に。まだの組は暗く小さく紋章の後ろへ
const ACE_COL = { gold:0xffc24a, white:0xeef6ff, feather:0xfff1d0 };
const ACE_TASK = { 'ace-add-slot':'gold', 'ace-hide-buff':'white' };
function acePhase(a, ph){
  if(!a || a.phase === ph) return;
  const from = a.phase; a.phase = ph; a.turnT = 0;
  // 次の段階へ: 前の組の残りは散る
  if(ph === 'white' && from === 'gold') scatter(a.gold);
  if(ph === 'feather'){ scatter(a.gold); scatter(a.white); }
}
// 主役の組の先頭の光から、選べるマスへ伸ばす光の糸と、マスの縁取り
function clearThreads(a){ (a.threads || []).forEach(o => K.disposeObj(o)); a.threads = []; a.threadKey = null; }
// マスの縁取り(光る四角い枠)
let frameTex = null;
function cellFrameTex(){
  if(frameTex) return frameTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 10; g.lineWidth = 6; g.strokeRect(10, 10, 108, 108);
  g.shadowBlur = 0; g.lineWidth = 3; g.strokeRect(10, 10, 108, 108);
  return (frameTex = new THREE.CanvasTexture(c));
}
const BEADS = 12; // 光の糸 = 小さな光の粒の列(線より見やすい)
function buildThreads(a, cells, color){
  clearThreads(a);
  cells.forEach(i => {
    const g = new THREE.Group(); g.userData.cell = i;
    for(let k = 0; k < BEADS; k++){ const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:K.softTex || K.starTex, color, transparent:true, depthWrite:false, depthTest:false, blending:K.ADD, opacity:0.7 })); s.scale.setScalar(0.11); s.renderOrder = 23; g.add(s); }
    K.scene.add(g); a.threads.push(g);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(K.STEP*0.94, K.STEP*0.94), new THREE.MeshBasicMaterial({ map:cellFrameTex(), color, transparent:true, depthWrite:false, blending:K.ADD, opacity:0.9 }));
    f.rotation.x = -Math.PI/2; f.position.set(K.tileX(i), (state.floor[i] ? K.topY(i) : K.TOP_Y - 0.25) + 0.03, K.tileZ(i)); f.renderOrder = 20; f.userData.box = true;
    K.scene.add(f); a.threads.push(f);
  });
}
function aceStep(){
  const a = ace; if(!a) return;
  const t = K.now ? K.now() : performance.now()/1000;
  const dt = 1/60;
  const c = aceCenter(a.p); if(c) a.c.copy(c);
  _r.setFromMatrixColumn(K.camera.matrixWorld, 0); _u.setFromMatrixColumn(K.camera.matrixWorld, 1);
  const base = a.c.clone().add(V(0, a.rise, 0));
  // いま選んでいるもの(元のゲームの選択)から段階を決める
  const st = state, task = st && st.task;
  const tph = task && ACE_TASK[task.tag];
  if(tph) acePhase(a, tph);
  a.turnT = Math.min(1, (a.turnT == null ? 1 : a.turnT) + dt*1.6);
  // 段階が変わった瞬間、紋章が少し回る
  const turn = Math.sin(Math.PI*a.turnT)*0.6;
  if(a.emblem && !a.emblemFree){ a.emblem.position.copy(base); a.emblem.material.rotation = t*0.15 + turn; }
  const col = ACE_COL[a.phase] || 0xffe7a0;
  if(a.halo){ a.halo.position.copy(base); a.halo.material.color.lerp(new THREE.Color(col), 0.08); a.halo.material.opacity = (a.emblemFree ? 0 : 0.32 + Math.sin(t*2.4)*0.1)*Math.min(1, a.emblem ? a.emblem.material.opacity : 0); }
  itemsOf(a).forEach((it, n) => {
    if(!it.idle) return;
    const on = it.kind === a.phase;
    it.emph = (it.emph == null ? 0 : it.emph) + ((on ? 1 : 0) - (it.emph || 0))*0.1;
    const e = it.emph, pulse = on ? Math.sin(t*2.6)*0.5 + 0.5 : 0;
    const bob = Math.sin(t*3 + n)*0.02, pull = 0.72 + 0.28*e; // まだの組は紋章に寄せる(後ろに下がる)
    it.s.position.copy(base).addScaledVector(_r, it.slot.ox*pull).addScaledVector(_u, it.slot.oy*pull + bob);
    it.s.renderOrder = e > 0.5 ? 24 : 21; // 主役は紋章の手前、まだの組は紋章の後ろ
    const dim = 0.3 + 0.7*e;
    if(it.kind === 'feather'){
      it.s.scale.set(0.12*(0.7 + 0.45*e + 0.06*pulse), 0.26*(0.7 + 0.45*e + 0.06*pulse), 1);
      it.s.material.color.setScalar(dim);
    } else {
      it.s.scale.setScalar(0.2*(0.6 + 1.0*e + 0.3*pulse));
      it.s.material.color.set(ACE_COL[it.kind]).multiplyScalar(dim);
    }
    if(it.core){ it.core.position.copy(it.s.position); it.core.renderOrder = it.s.renderOrder + 1; it.core.material.rotation = t*1.5 + n; it.core.scale.setScalar((0.12 + Math.sin(t*5 + n)*0.03)*(0.5 + 0.7*e)); it.core.material.opacity = Math.min(it.s.material.opacity, 0.25 + 0.75*e); }
  });
  // 光の糸: 主役の組の先頭の光 → 選べるマス(マスは珠の色で縁取り)
  const lead = (a.phase === 'gold' ? a.gold : a.phase === 'white' ? a.white : [])[0];
  const cells = [];
  if(tph && lead && lead.idle && task.kind === 'floor' && typeof task.filter === 'function') for(let i = 0; i < 20; i++){ try{ if(task.filter(i)) cells.push(i); }catch(e){} }
  const key = cells.length ? tph + ':' + cells.join(',') : null;
  if(key !== a.threadKey){ if(key) buildThreads(a, cells, ACE_COL[tph]); else clearThreads(a); a.threadKey = key; }
  if(a.threads && a.threads.length && lead){
    const from = lead.s.position;
    a.threads.forEach(o => {
      if(o.userData.box){ o.material.opacity = 0.55 + 0.35*Math.sin(t*3); return; }
      const i = o.userData.cell, to = V(K.tileX(i), (state.floor[i] ? K.topY(i) : K.TOP_Y - 0.25) + 0.08, K.tileZ(i));
      o.children.forEach((s, k) => {
        const u = ((k + t*1.2) % BEADS)/BEADS; // 珠からマスへ流れる
        s.position.copy(from).lerp(to, u); s.position.y += Math.sin(Math.PI*u)*0.35;
        s.material.opacity = 0.95*Math.sin(Math.PI*u) + 0.2;
      });
    });
  }
}
function disposeItem(it){ it.idle = false; [it.s, it.core].forEach(o => { if(o) K.disposeObj(o); }); }
// 残りの光が散って消える(足りなかった)
function scatter(list){
  const xs = list.splice(0);
  if(!xs.length) return Promise.resolve();
  const c = ace ? ace.c.clone().add(V(0, ace.rise, 0)) : null;
  return Promise.all(xs.map(it => {
    it.idle = false;
    const p0 = itemPos(it).clone(), d = c ? p0.clone().sub(c).normalize() : V(0, 1, 0);
    spark(p0, it.kind === 'gold' ? 0xffc24a : 0xffffff, 5, { up:0.6, speed:0.25, life:0.5 });
    return tween(0.45, t => {
      it.s.position.copy(p0).addScaledVector(d, t*0.5).add(V(0, -t*0.25, 0));
      it.s.material.opacity = 1 - t; if(it.core){ it.core.position.copy(it.s.position); it.core.material.opacity = 1 - t; }
    }).then(() => disposeItem(it));
  }));
}
// 光を目標へ飛ばす(放物線)
function flyItem(it, to, dur){
  it.idle = false;
  const p0 = itemPos(it).clone();
  return tween(dur || 0.45, t => {
    const k = ease.inOut(t), q = p0.clone().lerp(to, k); q.y += Math.sin(Math.PI*t)*0.5;
    it.s.position.copy(q); if(it.core){ it.core.position.copy(q); }
    if(Math.random() < 0.5) spark(q, it.kind === 'gold' ? 0xffd76a : 0xffffff, 1, { up:0.2, speed:0.05, life:0.35, g:0 });
  });
}
// ① 発動: 紋章が昇り、満たした条件の分だけ光が現れる
function aceBegin(p, df, dh){
  const c = aceCenter(p);
  if(!c || !ACE.emblem) return Promise.resolve();
  const a = ace = { p, c, rise:-0.5, gold:[], white:[], feathers:[], df, dh };
  a.emblem = aceSprite(ACE.emblem, 0xffffff, ACE_S, ACE_S, false);
  a.glow = aceSprite(K.softTex || K.starTex, 0xffe7a0, ACE_S*1.6, ACE_S*1.6, true);
  a.halo = aceSprite(K.softTex || K.starTex, 0xffe7a0, ACE_S*1.9, ACE_S*1.9, true); a.halo.renderOrder = 20; // 紋章の後ろの光(主役の組の色に染まる)
  a.phase = df ? 'gold' : dh ? 'feather' : null; a.threads = [];
  hudOf()(p, { show:true });
  return trackAnimation(res => {
    res = once(res);
    (async () => {
      await tween(0.6, t => { a.rise = -0.5 + 0.5*ease.out(t); a.emblem.material.opacity = Math.min(1, t*1.6); a.glow.position.copy(a.emblem.position); a.glow.material.opacity = 0.35*Math.sin(Math.PI*t); });
      const add = (kind, n) => { const list = kind === 'gold' ? a.gold : kind === 'white' ? a.white : a.feathers; for(let k = 0; k < n; k++) list.push(makeItem(kind, k)); return list; };
      const born = [...(df ? add('gold', 3) : []), ...(df ? add('white', 3) : []), ...(dh ? add('feather', 5) : [])];
      await tween(0.45, t => born.forEach((it, n) => { const k = Math.max(0, Math.min(1, t*2 - n*0.08)); it.s.material.opacity = k; if(it.core) it.core.material.opacity = k; }));
      born.forEach(it => { it.s.material.opacity = 1; if(it.core) it.core.material.opacity = 1; });
      K.disposeObj(a.glow); a.glow = null;
      res();
    })().catch(e => failSafe(e, null, res));
  });
}
// 終わり: 残りの光を散らし、紋章を消す(不発ならひびが入って崩れる)
function aceFinish(){
  const a = ace; if(!a) return Promise.resolve();
  return trackAnimation(res => {
    res = once(res);
    (async () => {
      await Promise.all([scatter(a.gold), scatter(a.white), scatter(a.feathers)]);
      if(a.emblem && !a.shrunk){
        if(!a.df && !a.dh){
          // 不発: 紋章にひびが入って崩れる
          const p0 = a.emblem.position.clone(); a.emblemFree = true;
          await tween(0.5, t => { a.emblem.position.copy(p0).add(V((Math.random() - .5)*0.04*t, 0, (Math.random() - .5)*0.04*t)); a.emblem.material.color.setScalar(1 - 0.45*t); });
          burst(p0, 0xd9b870, 26, { shards:true, up:0.6, speed:0.5, g:5, life:0.8 });
          burst(p0, 0xffe7a0, 10, { up:0.4, speed:0.3, life:0.5 });
          await tween(0.35, t => { a.emblem.material.opacity = 1 - t; a.emblem.position.y = p0.y - t*0.3; a.emblem.scale.setScalar(ACE_S*(1 + 0.1*t)); });
        } else {
          await tween(0.45, t => { a.rise = 0.3*t; a.emblem.material.opacity = 1 - t; });
        }
      }
      if(a.emblem) K.disposeObj(a.emblem);
      if(a.glow) K.disposeObj(a.glow);
      if(a.halo) K.disposeObj(a.halo); clearThreads(a);
      if(ace === a) ace = null;
      setTimeout(() => hudOf()(a.p, { show:false }), 600);
      res();
    })().catch(e => { if(ace === a) ace = null; failSafe(e, null, res); });
  });
}
K.override('effectAce', orig => async function(playerIdx){
  if(!settings.effectAnim) return orig.apply(this, arguments);
  const pl = state.players[playerIdx];
  const safe = typeof neighbors8 === 'function' ? neighbors8(pl.personalIndex).filter(i => { const f = state.floor[i]; return f !== null && !f.faceUp && f.owner === null; }).length : 3;
  try{ await aceBegin(playerIdx, safe <= 2, pl.hand.length <= 1); }catch(e){ console.error(e); }
  try{ return await orig.apply(this, arguments); }
  finally{ await aceFinish(); }
});
// ② フロア追加: 金の珠が飛び、光の柱(光の帯)になってフロアが降りる。紋章は残さない(普通のフロアなので)
function beamAt(c){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 2.8), new THREE.MeshBasicMaterial({ map:ACE.beam, color:0xffe7a0, transparent:true, depthWrite:false, blending:K.ADD, opacity:0, side:THREE.DoubleSide }));
  m.position.copy(c).add(V(0, 1.35, 0)); m.renderOrder = 21; K.scene.add(m);
  m.onBeforeRender = () => { m.rotation.y = Math.atan2(K.camera.position.x - m.position.x, K.camera.position.z - m.position.z); }; // いつもこちらを向く光の帯
  return m;
}
K.override('triggerSunFloorSpawn', orig => function(i){
  if(!ace || !ACE.beam) return orig.apply(this, arguments);
  return trackAnimation(res => {
    res = once(res);
    (async () => {
      const c = ctrOf(i, 0);
      const it = ace.gold.shift();
      if(it){ await flyItem(it, c.clone().add(V(0, 1.6, 0)), 0.45); disposeItem(it); }
      const b = beamAt(c);
      spark(c.clone().add(V(0, 1.6, 0)), 0xffe7a0, 10, { up:0.4, speed:0.25, life:0.5 });
      await tween(0.85, t => { b.material.opacity = Math.sin(Math.PI*Math.min(1, t*1.15))*0.95; b.scale.set(0.8 + 0.4*Math.sin(Math.PI*t), 1, 1); });
      spark(c.clone().add(V(0, 0.15, 0)), 0xffe7a0, 18, { up:1.8, speed:0.45 });
      K.disposeObj(b);
      res();
    })().catch(e => failSafe(e, null, res));
  });
});
// ③ 封印: 白の珠が飛び、光の十字になって裏に戻す(戻したマスは強化フロアになり、床に太陽の紋章が残る)
K.override('triggerCardFlip', orig => function(i, revealing){
  if(!ace || revealing) return orig.apply(this, arguments);
  return trackAnimation(res => {
    res = once(res);
    (async () => {
      acePhase(ace, 'white'); // フロア追加はここまで(残りの金の珠は散る)
      const c = ctrOf(i, 0.3);
      const it = ace.white.shift();
      if(it){ await flyItem(it, c, 0.45); disposeItem(it); }
      const cross = aceSprite(ACE.sparkle || K.starTex, 0xfff4d0, 0.2, 0.2, true); cross.position.copy(c);
      const fl = flipSlab(i, false, 0xffd76a);
      await tween(0.6, t => { cross.scale.setScalar(0.2 + 1.5*ease.out(t)); cross.material.opacity = t < 0.3 ? t/0.3 : 1 - (t - 0.3)/0.7; cross.material.rotation = t*0.4; });
      K.disposeObj(cross);
      await fl;
      res();
    })().catch(e => failSafe(e, null, res));
  });
});
// ④ ドロー: 羽根が 1 枚ずつ頭上のプレートへ飛び、手札 +1
K.override('triggerSunDrawCardAppear', orig => function(p){
  if(!ace || !ACE.feather) return orig.apply(this, arguments);
  acePhase(ace, 'feather'); // 盤面の分はここまで
  const it = ace.feathers.shift();
  return K.uiFx(async () => {
    hudOf()(p, { show:true });
    const b = K.panelPx(p, 'hand');
    let a = it ? K.boardPx(itemPos(it)) : { x:b.x, y:b.y - 120 };
    if(it) disposeItem(it);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(26, 58), new THREE.MeshBasicMaterial({ map:ACE.feather, transparent:true, depthWrite:false, depthTest:false }));
    K.ui.sc.add(f); f.position.copy(K.P(a.x, a.y, 70));
    await K.uiTween(0.45, t => {
      const k = ease.inOut(t), q = K.bez(a, b, 50, k);
      f.position.copy(K.P(q.x, q.y, 70)); f.rotation.z = Math.sin(t*9)*0.4 - k*0.6; f.scale.setScalar(1 - 0.35*k);
    });
    roundSpark(b.x, b.y, 0xffe7a0, 10, 90);
    K.uiDispose(f);
    hudOf()(p, { hand:1 });
    const hr = gaugeEl(p) && gaugeEl(p).querySelector('.g-hand'); if(hr){ hr.classList.remove('fx-gain'); void hr.offsetWidth; hr.classList.add('fx-gain'); }
    await wait(0.12);
    hudOf()(p, { hand:0 }); // この直後に元のゲームが手札に加える
  });
});
// ⑤ 追加ターン: 紋章が縮んで頭上の小さな太陽になる(白い光は控えめに。小さな太陽が追加ターンの間ずっと残る)
K.override('triggerExtraTurnWhiteout', orig => function(){
  const a = ace;
  if(!a || !a.emblem) return orig.apply(this, arguments);
  const ch = chars[a.p];
  return trackAnimation(res => {
    res = once(res);
    (async () => {
      await Promise.all([scatter(a.gold), scatter(a.white), scatter(a.feathers)]);
      clearThreads(a); if(a.halo){ K.disposeObj(a.halo); a.halo = null; }
      if(ch) ch.sunHold = true;
      a.emblemFree = true; a.shrunk = true;
      const p0 = a.emblem.position.clone();
      const glow = aceSprite(K.softTex || K.starTex, 0xffe7a0, 0.4, 0.4, true);
      await tween(0.8, t => {
        const k = ease.inOut(t);
        const to = ch && ch.shown ? ch.root.position.clone().add(V(0, (ch.av ? ch.av.badgeY + (ch.av.lift || 0) : 1.1) + 0.42, 0)) : p0;
        a.emblem.position.copy(p0).lerp(to, k); a.emblem.scale.setScalar(ACE_S - (ACE_S - 0.38)*k); a.emblem.material.rotation += 0.02;
        glow.position.copy(a.emblem.position); glow.scale.setScalar(0.5 + 0.9*Math.sin(Math.PI*t)); glow.material.opacity = 0.45*Math.sin(Math.PI*t);
      });
      spark(a.emblem.position.clone(), 0xffe7a0, 12, { up:0.8, speed:0.3, life:0.6 });
      K.disposeObj(glow); K.disposeObj(a.emblem); a.emblem = null;
      if(ch) ch.sunHold = false; // ここから adapter.js の小さな太陽(sunSp)が引き継ぐ
      res();
    })().catch(e => { if(ch) ch.sunHold = false; failSafe(e, null, res); });
  });
});

/* =====================================================================
   8: 雷雲・落雷・バインド(Riku さんの案。雷雲のモデル fx-cloud / 雷の絵 bolt8.jpg)
   ① 予兆: ♦ などの光が対象へ飛ぶ(共通の演出)
   ② 雷雲: 対象の真上(高さ 2.2)に雷雲が現れる(0.5 秒、少し行き過ぎて戻る)。ゆっくり回り、中の紫の光が不規則に明滅
   ③ 落雷: 雷の絵(カメラを向く板、下端が足元)が 3 回落ちる。1 回目の着地で画面が一瞬白く
   ④ 縛る: 雲が消え、足元の模様が広がり、雷の輪が巻きつく(下のバインドの見た目が出る)
   ⑤ バインド中: 足元の模様(雷撃フロアの絵)と、腰の高さに上下 2 段の雷の輪が残り、明滅する
   ⑥ 解除: 輪がはじけて散り、模様が外へ広がりながら消える(0.4 秒)
   ===================================================================== */
const BOLT8 = texOf('bolt8');
const CLOUD_Y = 2.2;
function cloudModel(){
  const m = B.cloneModel && B.cloneModel('fx-cloud');
  if(!m) return null;
  const mats = [];
  m.traverse(o => { if(o.isMesh){ o.material = o.material.clone(); o.material.transparent = true; o.material.depthWrite = false; mats.push(o.material); } });
  const box = new THREE.Box3().setFromObject(m), sz = box.getSize(V(0, 0, 0)), ctr = box.getCenter(V(0, 0, 0));
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner); inner.add(m);
  m.position.sub(ctr);
  inner.scale.setScalar(K.STEP*0.9/Math.max(sz.x, sz.z, 1e-6)); // 0.9 マス分
  g.userData.mats = mats; g.userData.inner = inner;
  return g;
}
function screenFlash(op, sec){
  const d = document.createElement('div');
  Object.assign(d.style, { position:'fixed', inset:'0', background:'#fff', opacity:String(op), pointerEvents:'none', zIndex:'170', transition:`opacity ${sec}s linear` });
  document.body.appendChild(d); requestAnimationFrame(() => { d.style.opacity = '0'; }); setTimeout(() => d.remove(), sec*1000 + 80);
}
fx('triggerLightningBoltStrike', async (i) => {
  const base = ctrOf(i, 0), top = base.y + CLOUD_Y;
  // ② 雷雲
  const cloud = cloudModel();
  const light = new THREE.PointLight(0xb070ff, 0, 3.5, 1.6); light.position.set(base.x, top - 0.05, base.z); K.scene.add(light);
  let spin = 0, alive = true;
  const flick = t => 0.6 + 0.4*Math.max(0, Math.sin(t*7.3)*Math.sin(t*2.9 + 1.3)); // 周期の違う 2 つの波で不規則に
  if(cloud){ cloud.position.set(base.x, top, base.z); cloud.renderOrder = 18; K.scene.add(cloud); cloud.scale.setScalar(0.001); }
  let lt = 0, boost = 0;
  (function idle(){ if(!alive) return; requestAnimationFrame(idle); lt += 1/60; spin += Math.PI/12/60; if(cloud) cloud.rotation.y = spin; light.intensity = 1.6*flick(lt) + boost; boost *= 0.85; })();
  await tween(0.5, t => { if(cloud) cloud.scale.setScalar(Math.max(0.001, ease.back(t))); });
  // ③ 落雷: 1 回 0.08 秒で出て 0.15 秒で消える。少しずらして 3 回
  // 板はカメラを向くので、見下ろしている分だけ縦が伸びて見える。カメラの上方向に映る長さ(足元 → 雲の底)に合わせる
  const camUp = V(0, 0, 0).setFromMatrixColumn(K.camera.matrixWorld, 1);
  const H = Math.max(0.6, (CLOUD_Y - 0.15)*Math.abs(camUp.y)), Wd = (CLOUD_Y - 0.15)*0.31;
  const bolt = (dx, bright, flip) => {
    if(!BOLT8) return Promise.resolve();
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:BOLT8, transparent:true, blending:K.ADD, depthWrite:false, depthTest:false, opacity:bright })); // 生物に隠れない
    s.center.set(0.5, 0); s.position.set(base.x + dx, base.y, base.z); s.renderOrder = 25; s.scale.set(Wd*(flip ? -1 : 1), 0.001, 1); K.scene.add(s);
    boost = 4;
    return tween(0.23, t => {
      const sec = t*0.23;
      s.scale.y = Math.max(0.001, H*Math.min(1, sec/0.05)); // 0.05 秒で 0 → 1(下端基準: 雲から地面へ走る)
      s.material.opacity = sec < 0.08 ? bright : bright*Math.max(0, 1 - (sec - 0.08)/0.15); // 0.08 秒出て、0.15 秒で消える
    }).then(() => K.disposeObj(s));
  };
  const T = K.tiles[i];
  const hits = [
    bolt(0, 1.0, false).then(() => {}),
    wait(0.12).then(() => bolt(0.08, 0.6, true)),
    wait(0.20).then(() => bolt(-0.05, 1.0, false)),
  ];
  await wait(0.05);
  screenFlash(0.25, 0.12);
  spark(base.clone().add(V(0, 0.05, 0)), 0xd9b8ff, 18, { up:2.2, speed:0.7 });
  if(T) T.flash = 1.2;
  await Promise.all(hits);
  if(T) T.flash = 0;
  // ④ 雲が消える(バインドの見た目は、ゲームがバインドを付けた直後に下の仕組みが出す)
  (async () => {
    await tween(0.4, t => { if(cloud) cloud.userData.mats.forEach(m => m.opacity = 1 - t); light.intensity *= 0.9; });
    alive = false; if(cloud) K.disposeObj(cloud); K.scene.remove(light);
  })();
});

// バインド中の見た目: 足元の模様と雷の輪(どの理由でバインドされても同じ)
const FLOOR_BOLT = texOf('lightning_bolt');
let ringTex = null;
function boltRingTex(){
  if(ringTex) return ringTex;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  const arc = (w, col, blur) => {
    g.strokeStyle = col; g.lineWidth = w; g.shadowColor = '#b070ff'; g.shadowBlur = blur;
    for(let s = 0; s < 3; s++){
      g.beginPath();
      const a0 = s*Math.PI*2/3 + 0.2, a1 = a0 + Math.PI*0.55;
      for(let a = a0; a <= a1; a += 0.08){ const r = 100 + (Math.random() - .5)*14; const x = 128 + Math.cos(a)*r, y = 128 + Math.sin(a)*r; a === a0 ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke();
    }
  };
  arc(7, 'rgba(170,110,255,0.9)', 14); arc(2.5, '#ffffff', 6);
  return (ringTex = new THREE.CanvasTexture(c));
}
const binds = [null, null];
function makeBindFx(ch){
  const g = new THREE.Group(); K.scene.add(g);
  const foot = new THREE.Mesh(new THREE.PlaneGeometry(K.STEP*0.7, K.STEP*0.7), new THREE.MeshBasicMaterial({ map:FLOOR_BOLT || K.starTex, transparent:true, blending:K.ADD, depthWrite:false, opacity:0 }));
  foot.rotation.x = -Math.PI/2; foot.renderOrder = 7; g.add(foot);
  const rings = [0, 1].map(k => { const r = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map:boltRingTex(), transparent:true, blending:K.ADD, depthWrite:false, side:THREE.DoubleSide, opacity:0 })); r.rotation.x = -Math.PI/2; r.renderOrder = 19; g.add(r); return r; });
  return { g, foot, rings, t:0, out:-1 };
}
(function bindLoop(){
  requestAnimationFrame(bindLoop);
  const st = typeof state !== 'undefined' ? state : null;
  const dt = 1/60, t = K.now ? K.now() : performance.now()/1000;
  [0, 1].forEach(p => {
    const ch = chars[p], pl = st && st.players && st.players[p];
    const on = !!(pl && pl.bound && !st.gameOver && ch && ch.shown && isOn());
    let b = binds[p];
    if(!on && b && b.out < 0){
      if(!isOn() || !ch || !ch.shown){ K.disposeObj(b.g); binds[p] = null; if(ch) ch.ringBind = false; return; }
      b.out = 0; // ⑥ 解除
      b.rings.forEach(r => spark(r.getWorldPosition(V(0, 0, 0)), 0xd9b8ff, 10, { up:1.2, speed:0.8, life:0.5 }));
    }
    if(on && !b){ b = binds[p] = makeBindFx(ch); ch.ringBind = true; } // ④ 縛る
    if(!b) return;
    b.t += dt;
    const base = ch.root.position, h = ch.av ? ch.av.badgeY : 1.1;
    b.g.position.set(base.x, 0, base.z);
    const fy = (ch.idx != null ? K.topY(ch.idx) : base.y) + 0.025;
    b.foot.position.y = fy;
    const flick = 0.75 + 0.25*Math.sin(t*6.1)*Math.sin(t*2.3 + 0.7); // 明るさ 0.5〜1.0
    if(b.out < 0){
      const k = ease.out(Math.min(1, b.t/0.45));
      b.foot.scale.setScalar(0.2 + 0.8*k); b.foot.material.opacity = flick*Math.min(1, b.t/0.3);
      b.rings.forEach((r, j) => { r.position.y = fy + h*(j ? 0.55 : 0.35); r.scale.setScalar(1.8 - 0.8*k); r.material.opacity = Math.min(1, b.t/0.3)*(0.75 + 0.25*Math.sin(t*9 + j*2)); r.rotation.z = (j ? -1 : 1)*t*1.2; });
    } else {
      b.out += dt; const k = Math.min(1, b.out/0.4);
      b.foot.scale.setScalar(1 + 0.8*k); b.foot.material.opacity = flick*(1 - k);
      b.rings.forEach((r, j) => { r.scale.setScalar(1 + 1.2*k); r.material.opacity = 1 - k; r.rotation.z += (j ? -1 : 1)*0.2; });
      if(k >= 1){ K.disposeObj(b.g); binds[p] = null; ch.ringBind = false; }
    }
  });
})();

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
/* 5: 術者の蛇(5のモデル)が相手のプレートまで伸び、カードを咥えて持ち帰る
   ・蛇の縁に紫の光(術者のパーソナルの蛇と同じ紫) ・行きと帰りの道筋に紫の煙の軌跡を残す
   ・咥えたカード(裏向き、×の錠前)は大きめで、かすかに光らせる
   ♠(斬撃で切り落とし、相手の捨て札へ)と違い、「相手から自分へ戻ってくる線」が見えるようにする */
const C5 = 0xa35cff;
function smokeAt(x, y, n){
  for(let k = 0; k < (n || 1); k++){
    const r = 16 + Math.random()*14;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r, r), new THREE.MeshBasicMaterial({ map:K.softTex || K.starTex, color: Math.random() < 0.75 ? C5 : 0xd9b8ff, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:false, opacity:0.7 }));
    m.position.copy(P(x + (Math.random() - .5)*10, y + (Math.random() - .5)*10, 40));
    m.userData = { v:V((Math.random() - .5)*8, 6 + Math.random()*8, 0), life:0, max:1.0 + Math.random()*0.5, g:0, spin:0 };
    ui.sc.add(m); ui.parts.push(m);
  }
}
uiFx('triggerGreenVortexSteal', async (targetIdx, handIdx, receiverIdx) => {
  const a = K.casterPx(receiverIdx), b = K.panelPx(targetIdx, 'hand'), home = K.panelPx(receiverIdx, 'hand');
  const snake = uiModel('c5', 170);
  if(snake){
    // 縁を紫に光らせる(夜空に溶けないように)
    snake.traverse(o => { if(o.isMesh && o.material){ o.material.emissive = new THREE.Color(0x3a1466); o.material.color.multiplyScalar(1.15); } });
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(230, 150), new THREE.MeshBasicMaterial({ map:K.softTex || K.starTex, color:C5, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:false, opacity:0.45 }));
    halo.position.z = -40; snake.add(halo); halo.scale.setScalar(1/snake.scale.x);
  }
  const path = (t, f, to) => { const q = K.bez(f, to, 70, t); return { x: q.x, y: q.y + Math.sin(t*14)*8*(1 - t) }; };
  let lastT = -1;
  const trail = q => { smokeAt(q.x, q.y, 2); };
  if(snake){
    faceDir(snake, a, b, true);
    await K.uiTween(0.55, t => { const q = path(ease.out(t), a, b); snake.position.copy(P(q.x, q.y, 50)); snake.rotation.z = Math.sin(t*16)*0.2; if(t - lastT > 0.04){ lastT = t; trail(q); } });
  }
  roundSpark(b.x, b.y, C5, 16, 120);
  // 咥えたカード: 大きめ・裏向き(×の錠前が見える)・かすかに光る
  const card = K.card3D(null, false, 1.35);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(130, 150), new THREE.MeshBasicMaterial({ map:K.softTex || K.starTex, color:0xd9b8ff, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:false, opacity:0.5 }));
  ui.sc.add(glow);
  if(snake) faceDir(snake, b, home, true);
  lastT = -1;
  await K.uiTween(0.7, t => {
    const q = path(ease.inOut(t), b, home);
    if(snake){ snake.position.copy(P(q.x, q.y, 50)); snake.rotation.z = Math.sin(t*16)*0.2; }
    card.position.copy(P(q.x, q.y + 30, 70)); card.rotation.set(0, 0, Math.sin(t*20)*0.12);
    glow.position.copy(P(q.x, q.y + 30, 65)); glow.material.opacity = 0.35 + 0.2*Math.sin(t*18);
    if(t - lastT > 0.04){ lastT = t; trail(q); }
  });
  roundSpark(home.x, home.y, C5, 14, 110);
  K.uiDispose(glow);
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
  // 数字の効果は、その札(パーソナル)のスートの色に染める(5♠なら紫)。形は数字ごとのまま
  const pc = state.players[p] && state.players[p].personalCard;
  if(typeof key === 'number' && pc && pc.suit !== 'JOKER' && K.SUIT_THEME[pc.suit]) spec.c = new THREE.Color(K.SUIT_THEME[pc.suit].glow).getHex();
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
