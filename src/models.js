/* =====================================================================
   glTF モデルの差し替え
   - models/manifest.json に書かれた生物だけ、Blender 等で作った .glb に置き換える。
     書かれていない生物は、これまでどおり adapter.js の図形モデルを使う。
   - 足元の陣・スートのオーラ・構え・まばたき・光の粒は makeCreature の共通部品をそのまま使う。

   manifest.json の例:
   {
     "c8": {
       "file": "c8_dragon.glb",   // models/ からの相対パス
       "height": 1.2,             // 高さ(フロア1マス ≒ 1.0)。モデルの大きさはこれに合わせて自動で縮尺
       "rotY": 0,                 // 向きの補正(ラジアン)。正面がカメラ側(+Z)になるように
       "toon": true,              // 質感をトゥーン調に変換する(既定 true)
       "badgeY": 1.45,            // 頭上カードの高さ(省略時は height + 0.25)
       "anims": { "idle": "Idle", "raise": "Attack", "jump": "Jump" }  // 省略可。アニメーション名
     }
   }
   キー: beast-A, c2〜c13(2〜K), jb(黒JOKER), jw(白JOKER), caster(術者)
   ===================================================================== */
(function(){
'use strict';
if(!window.THREE || !window.B3 || !THREE.GLTFLoader) return;
const B = window.B3;
const BASE = 'models/';

function toToon(mat){
  const m = B.toon(mat.color ? mat.color.getHex() : 0xffffff, {
    map: mat.map || null,
    emissive: mat.emissive ? mat.emissive.getHex() : 0x000000,
    emissiveMap: mat.emissiveMap || null,
    normalMap: mat.normalMap || null,
    emissiveIntensity: mat.emissiveIntensity != null ? mat.emissiveIntensity : 1,
    transparent: !!mat.transparent, opacity: mat.opacity != null ? mat.opacity : 1,
    alphaTest: mat.alphaTest || 0, side: mat.side,
  });
  if(mat.normalMap) m.normalScale = mat.normalScale.clone();
  m.skinning = !!mat.skinning; m.morphTargets = !!mat.morphTargets;
  addTint(m);
  return m;
}

/* ---- スートの色調: テクスチャの明暗を保ったまま、色味をスートの色へ寄せる ----
   m.userData.tint(色)と m.userData.tintK(0〜1、0 で元の色)をシェーダーに渡す。 */
const SUIT_TINT = { H:0xff3a48, S:0xa060ff, D:0xffb030, C:0x4aa0ff };
const TINT_K = 0.68;
function addTint(m){
  m.userData.tint = { value: new THREE.Color(1, 1, 1) };
  m.userData.tintK = { value: 0 };
  m.onBeforeCompile = sh => {
    sh.uniforms.uTint = m.userData.tint; sh.uniforms.uTintK = m.userData.tintK;
    sh.fragmentShader = 'uniform vec3 uTint;\nuniform float uTintK;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 tinted = uTint * (0.18 + 1.45*l) + vec3(0.9*l*l);
        diffuseColor.rgb = mix(diffuseColor.rgb, tinted, uTintK);
      }`);
  };
  m.customProgramCacheKey = () => 'bind-tint';
}
function suitKeyOf(th){ return th.motif==='chains' ? 'H' : th.motif==='blades' ? 'S' : th.motif==='crystals' ? 'D' : th.motif==='stars' ? 'C' : null; }
function applyTint(root, suitKey, k){
  const c = SUIT_TINT[suitKey];
  root.traverse(o => {
    if(!o.isMesh) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
      if(!m || !m.userData.tint) return;
      if(c != null){ m.userData.tint.value.setHex(c); m.userData.tintK.value = k == null ? TINT_K : k; }
      else m.userData.tintK.value = 0; // JOKER は元の色のまま
    });
  });
}

// gltf を、makeCreature が期待する見た目(av)に包む
function makeGltfAvatar(key, spec, gltf){
  return () => B.makeCreature(key, {
    auraR: spec.auraR || 0.55, auraH: spec.auraH || (spec.height || 1),
    badgeY: spec.badgeY || (spec.height || 1) + 0.25, badgeX: spec.badgeX || 0.5,
  }, ctx => {
    // SkinnedMesh を含む場合は骨ごと複製する
    const model = (THREE.SkeletonUtils && THREE.SkeletonUtils.clone) ? THREE.SkeletonUtils.clone(gltf.scene) : gltf.scene.clone(true);
    // 足元を原点、高さを spec.height に合わせる
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    // 高さを spec.height に。ただし横に長い生物(シャチ・蛇など)は足元の広さ maxFoot(既定 1.3マス)に収める
    const s = Math.min((spec.height || 1) / Math.max(size.y, 1e-6), (spec.maxFoot || 1.3) / Math.max(size.x, size.z, 1e-6));
    const holder = new THREE.Group();
    holder.add(model);
    model.position.set(-(box.min.x + box.max.x)/2, -box.min.y, -(box.min.z + box.max.z)/2);
    holder.scale.setScalar(s);
    holder.rotation.y = spec.rotY || 0;
    ctx.body.add(holder);
    model.traverse(o => {
      if(!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = false;
      if(spec.toon !== false) o.material = Array.isArray(o.material) ? o.material.map(toToon) : toToon(o.material);
      // 名前に "eye" を含むメッシュはまばたき対象
      if(/eye/i.test(o.name)){ o.userData.sy = o.scale.y; ctx.eyes.push(o); }
      // 名前に "glow" を含むメッシュはスートの色で光らせる
      if(/glow/i.test(o.name) && o.material && o.material.emissive){ o.material.userData.base = 0.6; ctx.glowMats.push(o.material); }
    });
    const head = model.getObjectByName(spec.head || 'Head') || model.getObjectByName('head');
    if(head) ctx.head = head;

    // アニメーション
    let mixer = null; const acts = {};
    if(gltf.animations && gltf.animations.length){
      mixer = new THREE.AnimationMixer(model);
      const names = Object.assign({ idle:'Idle', raise:'Attack', jump:'Jump' }, spec.anims || {});
      for(const [k, n] of Object.entries(names)){
        const clip = THREE.AnimationClip.findByName(gltf.animations, n);
        if(clip) acts[k] = mixer.clipAction(clip);
      }
      if(!acts.idle) acts.idle = mixer.clipAction(gltf.animations[0]);
      acts.idle.play();
    }
    let cur = 'idle';
    function play(name){
      if(!mixer || cur===name || !acts[name]) return;
      const from = acts[cur], to = acts[name];
      to.reset(); to.setLoop(name==='idle' ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); to.clampWhenFinished = true; to.play();
      if(from) from.crossFadeTo(to, 0.2, false);
      cur = name;
    }
    // アニメーションが無く、manifest に rig(骨の対応表)があるときは、骨をコードで動かす
    // rig を書かなければ骨の配置から自動で推定する("rig": false で無効)
    const rig = spec.rig === false ? null : (spec.rig && spec.rig !== 'auto') ? spec.rig : autoRig(model, box);
    const proc = !mixer && rig ? proceduralRig(model, rig) : null;
    if(rig && !spec.rig) model.userData.autoRig = rig; // 確認用
    let raiseK = 0, jumpK = 0;
    // 周囲を舞う小さな分身(10 の虫の群れなど)。manifest の swarm で指定し、軽量版モデルを使う
    const swarm = spec.swarm && miniOf[key] ? makeSwarm(ctx.inner || ctx.body, miniOf[key], spec.swarm, s) : null;
    // まとうエフェクト(idle.js)。manifest の "idleFx" で種類の上書き、false で無効
    const foot = Math.max(size.x, size.z)*s;
    const idleFx = spec.idleFx !== false && B.makeIdleFx ? B.makeIdleFx(key, ctx.inner || ctx.body, { h: spec.height || 1, r: Math.min(0.7, Math.max(0.4, foot*0.45)) }, model, typeof spec.idleFx === 'string' ? spec.idleFx : null) : null;
    return {
      setSuit(th){ const sk = suitKeyOf(th); applyTint(model, sk); if(swarm) applyTint(swarm.group, sk); },
      pose(raise, jump){
        raiseK = raise; jumpK = jump;
        if(mixer){ if(jump > 0) play('jump'); else if(raise > 0.3) play('raise'); else play('idle'); }
        else if(!proc){ holder.position.y = 0.05*raise; holder.rotation.x = -0.15*raise; }
      },
      idle(t, ph){ if(!mixer && !proc) holder.position.y = Math.sin(t*1.6 + ph)*0.02; },
      tick(t, dt, ph){ if(mixer) mixer.update(dt); if(proc) proc(t + (ph || 0), dt, raiseK, jumpK); if(swarm) swarm.tick(t + (ph || 0), raiseK); if(idleFx) idleFx.tick(t + (ph || 0), dt, raiseK); },
    };
  });
}

/* ---- 骨をコードで動かす(リグはあるがアニメーションが無いモデル用) ----
   rig: { hips, spine:[…], neck:[…], head, jaw, tail:[…], ears:[…] }(骨の名前)
   回転はモデル空間の軸で指定する(X=縦に首を振る / Y=左右を向く / Z=傾ける)。
   各骨の向きがバラバラでも、親の向きで変換してから掛けるので同じ意味になる。 */
function proceduralRig(model, rig){
  model.updateMatrixWorld(true);
  const rootInv = model.getWorldQuaternion(new THREE.Quaternion()).invert();
  const get = n => !n ? null : (typeof n === 'string' ? model.getObjectByName(n) : n);
  const prep = b => {
    if(!b) return null;
    const P = rootInv.clone().multiply(b.parent.getWorldQuaternion(new THREE.Quaternion())); // 親の向き(モデル空間)
    return { b, rest: b.quaternion.clone(), P, Pinv: P.clone().invert() };
  };
  const list = a => (Array.isArray(a) ? a : a ? [a] : []).map(get).filter(Boolean).map(prep);
  const J = { spine:list(rig.spine), neck:list(rig.neck), head:list(rig.head), jaw:list(rig.jaw), tail:list(rig.tail), ears:list(rig.ears),
    wingsL:list(rig.wingsL), wingsR:list(rig.wingsR) };
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  // モデル空間で (x, y, z) 回転させた向きを、骨のローカルに直して設定
  function turn(j, x, y, z){
    q.setFromEuler(e.set(x, y, z, 'YXZ'));
    j.b.quaternion.copy(j.Pinv).multiply(q).multiply(j.P).multiply(j.rest);
  }
  return (t, dt, raise, jump) => {
    const breath = Math.sin(t*1.6);
    J.spine.forEach((j, i) => turn(j, breath*0.015 - raise*0.07 + jump*0.08, 0, 0));
    const look = Math.sin(t*0.45)*0.22*(1 - raise);
    J.neck.forEach(j => turn(j, -raise*0.08 + jump*0.05, look*0.5, 0));
    J.head.forEach(j => turn(j, Math.sin(t*0.9)*0.04 - raise*0.18, look*0.5, Math.sin(t*0.6)*0.04));
    J.jaw.forEach(j => turn(j, raise*0.35 + Math.max(0, Math.sin(t*0.7))*0.03, 0, 0));
    const tk = Math.min(1, 5 / Math.max(1, J.tail.length)); // 長い尻尾は1本あたりを控えめに
    J.tail.forEach((j, i) => turn(j, (-raise*0.12 + jump*0.15)*tk, Math.sin(t*1.8 - i*0.6)*(0.10 + Math.min(i, 5)*0.04)*(1 + raise*1.5)*tk, 0));
    // 翼: 付け根から羽ばたく(構えると大きく広げる)
    // 待機中もはっきり羽ばたく。先の骨は少し遅れてしなる。ときどき大きく羽を伸ばす
    const stroke = ph => { const s = Math.sin(t*2.6 - ph); return s > 0 ? s : s*0.75; };
    const stretch = Math.max(0, Math.sin(t*0.29)*6 - 5)*0.25;
    const flap = i => (stroke(i*0.7)*0.32 + 0.06 + stretch)*(i ? 0.6 : 1) + raise*0.35 - jump*0.2;
    J.wingsL.forEach((j, i) => turn(j, 0, 0, flap(i)));
    J.wingsR.forEach((j, i) => turn(j, 0, 0, -flap(i)));
    const flick = Math.max(0, Math.sin(t*0.37)*8 - 7); // ときどき耳を動かす
    J.ears.forEach((j, i) => turn(j, -flick*0.25, 0, (i ? 1 : -1)*flick*0.15));
  };
}

/* ---- 骨の役割を配置から推定する(骨の名前が Bone_000… でも動くように) ----
   モデルは正面 +Z・足元 y=0 の前提。高さで正規化した位置で判定する。
   - 頭: 高く・前寄り・中央寄りの骨。そこまでの経路を 背骨→首→頭 とする
   - 尻尾: 経路から分かれ、後ろ(−Z)へ長く伸びる鎖
   - 翼: 経路から分かれ、高い位置で左右に大きく張り出す鎖(付け根と次の骨)
   - 脚(足先が地面近く)は動かさない */
function autoRig(model, box){
  model.updateWorldMatrix(true, true); // 親(縮尺をかけた holder)ごと更新しないと、骨の位置と逆行列がずれる
  const H = Math.max(box.max.y - box.min.y, 1e-6), cx = (box.min.x + box.max.x)/2, cz = (box.min.z + box.max.z)/2;
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const bones = []; model.traverse(o => { if(o.isBone) bones.push(o); });
  if(bones.length < 3) return null;
  const pos = new Map();
  bones.forEach(b => { const p = b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv); pos.set(b, { x:(p.x - cx)/H, y:(p.y - box.min.y)/H, z:(p.z - cz)/H }); });
  const isBone = o => o && o.isBone;
  const root = bones.find(b => !isBone(b.parent));
  const kids = b => b.children.filter(isBone);
  const leaves = bones.filter(b => kids(b).length === 0);
  const pathTo = b => { const p = []; for(let o = b; isBone(o); o = o.parent) p.unshift(o); return p; };
  const desc = b => { const out = []; b.traverse(o => { if(o.isBone && o !== b) out.push(o); }); return out; };

  // 頭の先(候補): 高さ + 前 − 横ずれ
  let tip = null, best = -1e9;
  bones.forEach(b => { const p = pos.get(b); const sc = p.y + 0.3*p.z - 1.0*Math.abs(p.x); if(sc > best){ best = sc; tip = b; } });
  const P = pathTo(tip);
  const onP = new Set(P);
  // 頭 = 経路上で、先端に近い分岐点(耳・角・あごが生える所)。なければ先端の1つ手前
  // Meshy のリグは 腰→背骨→胸(腕の分岐)→首→頭→頭頂 の並び。先端(頭頂)の1つ手前を頭、その手前を首とする
  const hi = Math.max(1, P.length - 2);
  const head = P[hi];
  const neck = P.slice(Math.max(1, hi - 1), hi);
  const spine = P.slice(1, Math.max(1, hi - 1)).filter(b => pos.get(b).y > 0.2);

  // 葉(骨の先端)から根元へたどり、経路 P に合流するまでの鎖を作る
  const chainOf = leaf => { const c = []; for(let o = leaf; isBone(o) && !onP.has(o); o = o.parent) c.unshift(o); return c; };
  const headSet = new Set([head, ...desc(head)]);
  // 尻尾: 地面から浮いた先端が、付け根より後ろへ伸びる鎖(3本以上)。いちばん後ろまで伸びるもの
  let tail = [], bestZ = 1e9;
  leaves.forEach(lf => {
    const tp = pos.get(lf); if(tp.y < 0.1 || headSet.has(lf) || (tp.y > 0.5 && Math.abs(tp.x) > 0.2)) return; // 翼のような先端は除く
    const c = chainOf(lf); if(c.length < 3) return;
    if(c.some(b => pos.get(b).y < 0.06)) return;
    if(tp.z < pos.get(c[0]).z - 0.15 && tp.z < bestZ){ bestZ = tp.z; tail = c; }
  });
  // 翼: 高い位置で左右に張り出す先端から、横にずれている間だけ根元へたどる。その根元と次の骨を羽ばたかせる
  const wingsL = [], wingsR = [], used = new Set();
  leaves.forEach(lf => {
    const tp = pos.get(lf); if(tp.y < 0.55 || Math.abs(tp.x) < 0.22 || headSet.has(lf)) return;
    const c = chainOf(lf); if(c.length < 2) return;
    let i = c.length - 1; while(i > 0 && Math.abs(pos.get(c[i-1]).x) > 0.1) i--;
    const root2 = c[i]; if(used.has(root2) || tail.includes(root2)) return; used.add(root2);
    const side = tp.x >= 0 ? wingsL : wingsR; // wingsL = +X 側(+回転で上がる)
    side.push(root2); if(c[i+1]) side.push(c[i+1]);
  });
  return { spine, neck, head:[head], tail: tail.slice(0, 8), wingsL, wingsR };
}

/* ---- 群れ: 軽量版モデルの小さな複製を、本体の周りに浮かべて飛び回らせる ----
   swarm: { count: 12, size: 0.16(本体に対する大きさ), radius: 0.55, height: 0.5 } */
const miniOf = {};
const gltfOf = {}; // 読み込んだ glTF(fx3d.js が手札演出などで使う)
B.gltfOf = gltfOf; B.miniOf = miniOf;
B.cloneModel = (key, mini) => { const g = (mini ? miniOf : gltfOf)[key]; if(!g) return null; return (THREE.SkeletonUtils && THREE.SkeletonUtils.clone) ? THREE.SkeletonUtils.clone(g.scene) : g.scene.clone(true); };
B.toToon = m => toToon(m); B.applyTint = (root, sk, k) => applyTint(root, sk, k); B.suitTint = SUIT_TINT;
function makeSwarm(parent, gltf, opt, bodyScale){
  const group = new THREE.Group(); group.userData.noFrame = true; parent.add(group);
  const n = opt.count || 12, R = opt.radius || 0.55, H = opt.height || 0.5;
  const box = new THREE.Box3().setFromObject(gltf.scene), size = box.getSize(new THREE.Vector3());
  const sc = (opt.size || 0.16) / Math.max(size.y, 1e-6);
  const items = [];
  for(let k=0;k<n;k++){
    const m = (THREE.SkeletonUtils && THREE.SkeletonUtils.clone) ? THREE.SkeletonUtils.clone(gltf.scene) : gltf.scene.clone(true);
    m.traverse(o => { if(o.isMesh){ o.material = Array.isArray(o.material) ? o.material.map(toToon) : toToon(o.material); o.castShadow = false; } });
    const h = new THREE.Group(); h.add(m); m.position.set(-(box.min.x+box.max.x)/2, -(box.min.y+box.max.y)/2, -(box.min.z+box.max.z)/2);
    h.scale.setScalar(sc * (0.75 + Math.random()*0.5));
    group.add(h);
    items.push({ h, a: k/n*Math.PI*2, r: R*(0.8 + Math.random()*0.5), y: H*(0.4 + Math.random()*1.0), sp: (0.6 + Math.random()*0.6)*(k%2 ? 1 : -1), ph: Math.random()*6 });
  }
  return {
    group,
    tick(t, raise){
      items.forEach(it => {
        const a = it.a + t*it.sp*(1 + raise*1.5), r = it.r*(1 + raise*0.35);
        it.h.position.set(Math.cos(a)*r, it.y + Math.sin(t*3 + it.ph)*0.06, Math.sin(a)*r*0.85);
        it.h.rotation.set(Math.sin(t*5 + it.ph)*0.2, -a + (it.sp > 0 ? Math.PI : 0), 0); // 進行方向を向く
      });
    },
  };
}

function register(key, factory){
  B.AVATARS[key] = factory;
  if(B.K && B.K.refreshPortraits) setTimeout(() => B.K.refreshPortraits(key), 0); // カードの絵をモデルから撮り直す
  // 既に図形モデルで作られているものを作り直す
  B.chars.forEach(ch => {
    delete ch.avCache[key];
    if(ch.avKey === key){ ch.avKey = null; B.setAvatar(ch, key, true); }
  });
}

const loader = new THREE.GLTFLoader();
// 1ファイル版はモデルが埋め込まれている(BIND_EMBEDDED_MODELS)。Web 版は models/ から読む。
const EMB = window.BIND_EMBEDDED_MODELS;
const urlOf = file => (EMB && EMB.files[file]) || BASE + file;
(EMB ? Promise.resolve(EMB.manifest) : fetch(BASE + 'manifest.json', { cache:'no-cache' }).then(r => r.ok ? r.json() : null))
  .then(manifest => {
    if(!manifest) return;
    Object.entries(manifest).forEach(([key, spec]) => {
      if(key.startsWith('_') || !spec || !spec.file) return;
      // エフェクト用のモデル(fx: true)は読み込むだけで、生物としては登録しない(fx3d.js が使う)
      if(spec.fx){ loader.load(urlOf(spec.file), gltf => { gltfOf[key] = gltf; console.info(`[Bind3D] エフェクトのモデルを読み込みました: ${key}`); }, undefined, e => console.warn(`[Bind3D] エフェクトのモデルを読み込めませんでした: ${key}`, e)); return; }
      const loadMain = () => loader.load(urlOf(spec.file),
        gltf => { gltfOf[key] = gltf; register(key, makeGltfAvatar(key, spec, gltf)); console.info(`[Bind3D] モデルを読み込みました: ${key} (${spec.file})`); },
        undefined,
        e => console.warn(`[Bind3D] モデルを読み込めませんでした: ${key} (${spec.file})`, e));
      // 群れ用の軽量版(ビルド時に <名前>.mini.glb を作る)を先に読む
      if(spec.swarm){
        const mini = spec.file.replace(/\.glb$/, '.mini.glb');
        loader.load(urlOf(mini), g => { miniOf[key] = g; loadMain(); }, undefined, () => loadMain());
      } else loadMain();
    });
  })
  .catch(() => { /* manifest が無い = 図形モデルのまま */ });
})();

/* ---- 見た目の確認用: URL の末尾に #preview=1 (A) / #preview=13 (K) / #preview=JOKER を付けて開くと、
   CPU 対戦を始めて両者のパーソナルをそのカードにする(先攻=♥ / 後攻=♠)。確認専用で、ルール上は正しい対局ではない。 ---- */
(function(){
  const m = /preview=(\w+)/.exec(location.hash);
  if(!m || typeof initGame!=='function') return;
  setTimeout(() => {
    initGame(true, 'easy', false);
    const isJ = /^JOKER$/i.test(m[1]), r = Number(m[1]);
    const cards = isJ ? [{ suit:'JOKER', rank:null, id:'JOKER1' }, { suit:'JOKER', rank:null, id:'JOKER2' }]
                      : [{ suit:'H', rank:r, id:'H' + r }, { suit:'S', rank:r, id:'S' + r }];
    [[0, 17], [1, 2]].forEach(([pi, cell]) => {
      const p = state.players[pi]; p.personalCard = cards[pi]; p.personalIndex = cell; state.floor[cell].owner = pi;
    });
    state.phase = 'draw';
    render();
  }, 500);
})();
