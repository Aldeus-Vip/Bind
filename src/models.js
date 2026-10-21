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
       "anims": { "idle": "Idle", "raise": "Attack", "jump": "Jump" },  // 省略可。アニメーション名
       "headYaw": 0.7,            // 移動するときの頭の向き(rotY で補正した後の正面からの角度)。省略時 0
       "wing": { "speed": 40, "fly": 16, "amp": 0.5 }  // 羽ばたきの速さ(待機 / 飛行)と振れ幅の倍率。虫は速く小さく
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
    const proc = !mixer && rig ? proceduralRig(model, rig, spec.wing) : null;
    if(rig && !spec.rig) model.userData.autoRig = rig; // 確認用
    // 移動の動き(骨がある場合)。rig の名前を骨に直してから渡す
    const rigB = rig ? { wingsL: rig.wingsL, wingsR: rig.wingsR } : null;
    const gait = !mixer && spec.gait !== false ? gaitRig(model, box, (spec.rotY || 0) - (spec.headYaw || 0), rigB, Object.assign({ crawl: B.moveStyleOf && B.moveStyleOf(key) === 'crawl', wing: spec.wing }, spec.gait || {})) : null;
    let mv = null;
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
      headYaw: spec.headYaw || 0, // 頭の向き(正面からの角度)。移動はこの向きで進む
      move(m){ mv = m; },
      tick(t, dt, ph){ if(mixer) mixer.update(dt); if(gait) gait.reset(); if(proc) proc(t + (ph || 0), dt, raiseK, jumpK); if(gait) gait.apply(mv, t); if(swarm) swarm.tick(t + (ph || 0), raiseK); if(idleFx) idleFx.tick(t + (ph || 0), dt, raiseK); },
    };
  });
}

/* ---- 骨をコードで動かす(リグはあるがアニメーションが無いモデル用) ----
   rig: { hips, spine:[…], neck:[…], head, jaw, tail:[…], ears:[…] }(骨の名前)
   回転はモデル空間の軸で指定する(X=縦に首を振る / Y=左右を向く / Z=傾ける)。
   各骨の向きがバラバラでも、親の向きで変換してから掛けるので同じ意味になる。 */
function proceduralRig(model, rig, wing){
  wing = Object.assign({ speed:1, amp:1 }, wing || {}); // 羽ばたきの速さ・振れ幅(虫は速く小さく)
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
    const stroke = ph => { const s = Math.sin(t*2.6*wing.speed - ph); return s > 0 ? s : s*0.75; };
    const stretch = Math.max(0, Math.sin(t*0.29)*6 - 5)*0.25;
    const flap = i => (stroke(i*0.7)*0.32*wing.amp + 0.06 + stretch)*(i ? 0.6 : 1) + raise*0.35 - jump*0.2;
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

/* ---- 移動の動き(跳ぶ・這う・くねる・泳ぐ・飛ぶ) ----
   adapter.js の移動が av.move({ kind, k, u, d, t }) で状態を渡し、毎フレームここで骨を動かす。
   kind: hop2(2足で跳ぶ) / hop4(4足で跳ぶ) / crawl(多脚で這う) / serpent(長い体でくねる) / swim(尾びれで泳ぐ) / fly(羽ばたく) / glide(滑る)
   k: 移動の姿勢への切り替え(0〜1) / u: 跳躍の進み(-1〜0 かがむ・0〜1 空中・1〜2 着地) / d: 進んだ距離(マス) / t: 時刻(秒)
   回転は「正面 = +Z」の向き(rotY で補正した後)の軸で指定する。X = 前後に振る / Y = 左右に振る / Z = 横に上げる。
   manifest の "gait": { "legs": [骨の名前…], "tail": [...], "body": [...] } で自動の判定を上書きできる。 */
function gaitRig(model, box, rotY, rig, over){
  model.updateWorldMatrix(true, true);
  over = over || {};
  const H = Math.max(box.max.y - box.min.y, 1e-6), cx = (box.min.x + box.max.x)/2, cz = (box.min.z + box.max.z)/2;
  const F = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY || 0), Fi = F.clone().invert();
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const rootInv = model.getWorldQuaternion(new THREE.Quaternion()).invert();
  const bones = []; model.traverse(o => { if(o.isBone) bones.push(o); });
  if(bones.length < 3) return null;
  // 正面向きの空間で、高さを 1 とした位置
  const fpos = new Map();
  bones.forEach(b => { const p = b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv); p.x -= cx; p.y -= box.min.y; p.z -= cz; fpos.set(b, p.applyQuaternion(F).divideScalar(H)); });
  const isBone = o => o && o.isBone;
  const kids = b => b.children.filter(isBone);
  const byName = n => typeof n === 'string' ? model.getObjectByName(n) : n;
  // 骨の先端から根元へ。3本たまるまでは枝分かれ(指など)も越えて上る
  const limbOf = leaf => {
    const c = [leaf];
    for(let o = leaf.parent; isBone(o); o = o.parent){
      if(kids(o).length > 1 && c.length >= 3) break;
      c.unshift(o);
    }
    return c;
  };
  const leaves = bones.filter(b => kids(b).length === 0);
  const limbs = []; const tops = new Set();
  leaves.forEach(lf => { const c = limbOf(lf); if(isBone(c[0].parent) && !tops.has(c[0])){ tops.add(c[0]); limbs.push(c); } });
  const tip = c => fpos.get(c[c.length - 1]), top = c => fpos.get(c[0]);
  const prep = b => {
    const P = rootInv.clone().multiply(b.parent.getWorldQuaternion(new THREE.Quaternion()));
    return { b, rest: b.quaternion.clone(), pos: b.position.clone(), P, Pinv: P.clone().invert() };
  };
  const all = new Map(); const J = b => { if(!all.has(b)) all.set(b, prep(b)); return all.get(b); };

  // 脚: 先端が地面(高さの 12% 以内)に届く鎖。這う生物は少し浮いた脚も含める
  const legChains = over.legs ? over.legs.map(n => { const b = byName(n); return b ? limbs.find(c => c[0] === b) || [b, ...b.children.filter(isBone)] : null; }).filter(Boolean)
    : limbs.filter(c => c.length >= 3 && (tip(c).y < 0.12 || (over.crawl && tip(c).y < 0.3 && top(c).y < 0.45 && c.length >= 4 && tip(c).z - top(c).z < 0.25 && Math.hypot(tip(c).x - top(c).x, tip(c).z - top(c).z) > 0.2)));
  const midZ = legChains.length ? legChains.reduce((s, c) => s + top(c).z, 0)/legChains.length : 0;
  const legs = legChains.map(c => ({ hip: J(c[0]), knee: c.length >= 3 ? J(c[Math.floor(c.length/2)]) : null, side: top(c).x + tip(c).x >= 0 ? 1 : -1, front: top(c).z > midZ + 0.02, z: top(c).z }));
  // 這うときの足並み: 左右それぞれ前から順に、隣どうしが逆の足を出す
  [1, -1].forEach(s => legs.filter(l => l.side === s).sort((a, b) => b.z - a.z).forEach((l, i) => { l.ph = ((i + (s > 0 ? 0 : 1)) % 2)*Math.PI; }));
  // 尾(泳ぐ生物の尾びれ): 後ろへいちばん長く伸びる鎖
  let tailC = over.tail ? over.tail.map(byName).filter(Boolean) : null;
  if(!tailC){ let best = 1e9; limbs.forEach(c => { if(c.length >= 3 && tip(c).z < top(c).z - 0.2 && tip(c).z < best && !legChains.includes(c)){ best = tip(c).z; tailC = c; } }); }
  const tail = (tailC || []).map(J);
  // なびく鎖(飛ぶときの尾羽など): manifest の gait.trail に骨の名前の並びを複数
  const trail = (over.trail || []).map(c => c.map(byName).filter(Boolean).map(J));
  const wingO = Object.assign({ speed:1, amp:1 }, over.wing || {});
  // ひれ(泳ぐ生物): 横へ張り出す短い鎖
  const fins = over.fins ? over.fins.map(byName).filter(Boolean).map(b => ({ j: J(b), side: fpos.get(b).x >= 0 ? 1 : -1 })) : limbs.filter(c => c !== tailC && !legChains.includes(c) && c.length >= 2 && Math.abs(tip(c).x - top(c).x) > 0.15 && tip(c).y < top(c).y).map(c => ({ j: J(c[0]), side: tip(c).x >= 0 ? 1 : -1 }));
  // 翼: autoRig / manifest の rig から(+X 側が L)
  const wingL = (rig && rig.wingsL || []).map(byName).filter(Boolean).map(J), wingR = (rig && rig.wingsR || []).map(byName).filter(Boolean).map(J);
  // 長い体(蛇・竜): 根元からいちばん深い先端までの骨の並び
  let body = over.body ? over.body.map(byName).filter(Boolean) : null;
  if(!body){ let deep = []; leaves.forEach(lf => { const p = []; for(let o = lf; isBone(o); o = o.parent) p.unshift(o); if(p.length > deep.length) deep = p; }); body = deep; }
  const bodyJ = body.map(J);
  const segLen = body.slice(1).map((b, i) => fpos.get(b).distanceTo(fpos.get(body[i])));
  model.userData.gait = { legs: legs.map(l => l.hip.b.name), tail: tail.map(j => j.b.name), fins: fins.map(f => f.j.b.name), body: body.length, bodyLen: +segLen.reduce((a, b) => a + b, 0).toFixed(2) }; // 確認用

  const q = new THREE.Quaternion(), qm = new THREE.Quaternion(), e = new THREE.Euler();
  // 正面向きの空間で (x, y, z) 回す(今の向きに足し込む)
  function add(j, x, y, z){
    if(!j || (!x && !y && !z)) return;
    q.setFromEuler(e.set(x, y, z, 'YXZ'));
    qm.copy(Fi).multiply(q).multiply(F);
    j.b.quaternion.premultiply(j.P.clone().premultiply(qm).premultiply(j.Pinv));
  }
  const S = Math.sin, C = Math.cos, PI = Math.PI;
  const crouchOf = u => u < 0 ? u + 1 : u < 1 ? Math.max(0, 1 - u*4) : 0.8*S(PI*(u - 1));
  const airOf = u => u > 0 && u < 1 ? S(PI*u) : 0;

  // 長い体を、地面を這う S 字の線に沿わせる(根元 = 頭側から順に、次の骨が線の上に来るよう向ける)
  const Vw = new THREE.Vector3(), Va = new THREE.Vector3(), Vb = new THREE.Vector3(), Qw = new THREE.Quaternion(), Qp = new THREE.Quaternion(), Qd = new THREE.Quaternion(), Qt = new THREE.Quaternion();
  const toWorld = p => p.clone().multiplyScalar(H).applyQuaternion(Fi).add(new THREE.Vector3(cx, box.min.y, cz)).applyMatrix4(model.matrixWorld);
  const SP = Object.assign({ A:0.13, lam:0.62, helix:false, y0:0 }, over.serpent || {});
  function slither(k, d, t){
    if(bodyJ.length < 4) return;
    model.updateWorldMatrix(true, true);
    // 進む距離 d に合わせて波を後ろへ送る(体の各点が同じ跡をたどる)
    // helix: 横だけでなく上下にも振って螺旋を描く(長い体でも前後に伸びすぎない。浮いて進む)
    const A = SP.A, lam = SP.lam, wave = (d || 0)*1.1 + t*0.25;
    const pts = []; let len = 0, prev = null;
    const total = segLen.reduce((a, b) => a + b, 0) + 0.5;
    for(let i = 0; i <= 600; i++){
      const s = i/600*total;
      const env = Math.min(1, 0.25 + s*1.5), ph = 2*PI*(s/lam - wave);
      const p = SP.helix ? new THREE.Vector3(A*env*S(ph), SP.y0 + A*env*C(ph), 0.3 - s)
        : new THREE.Vector3(A*env*S(ph), 0.035 + 0.24*Math.max(0, 1 - s/0.32)**2, 0.3 - s);
      if(prev) len += p.distanceTo(prev);
      pts.push({ p, len }); prev = p;
    }
    // 骨の長さぶんずつ線をたどって目標点を作る
    const tg = [pts[0].p]; let at = 0, acc = 0;
    for(let i = 0; i < segLen.length; i++){
      const want = acc + segLen[i]; let j = at;
      while(j < pts.length - 1 && pts[j].len < want) j++;
      at = j; tg.push(pts[j].p); acc = pts[j].len;
    }
    const W = tg.map(toWorld);
    // 頭(根元)の位置
    const r = bodyJ[0];
    Vw.copy(W[0]); r.b.parent.worldToLocal(Vw);
    r.b.position.copy(r.pos).lerp(Vw, k);
    r.b.updateMatrixWorld(true);
    for(let i = 0; i < bodyJ.length - 1; i++){
      const j = bodyJ[i], nx = bodyJ[i + 1].b;
      j.b.getWorldPosition(Va); nx.getWorldPosition(Vb);
      const cur = Vb.sub(Va).normalize(), want = W[i + 1].clone().sub(Va).normalize();
      Qd.setFromUnitVectors(cur, want);
      j.b.getWorldQuaternion(Qw); j.b.parent.getWorldQuaternion(Qp);
      Qt.copy(Qp).invert().multiply(Qd.multiply(Qw));
      j.b.quaternion.slerp(Qt, k);
      j.b.updateMatrixWorld(true);
    }
  }

  let was = false;
  return {
    // 毎フレーム、動かす骨を元の姿勢に戻してから(proceduralRig がその後で待機の動きを足す)
    reset(){
      if(!was) return;
      all.forEach(j => { j.b.quaternion.copy(j.rest); j.b.position.copy(j.pos); });
      was = false;
    },
    apply(mv, t){
      if(!mv) return;
      was = true;
      const k = mv.k == null ? 1 : mv.k, u = mv.u == null ? -2 : mv.u, d = mv.d || 0;
      if(mv.kind === 'walk2' || mv.kind === 'walk4'){
        // 歩く: 脚を交互に前へ振り出し、振り出している間だけ膝を曲げる(2足は左右交互、4足は 左後→左前→右後→右前)
        const cyc = mv.cyc || 0, q4 = mv.kind === 'walk4';
        legs.forEach(l => {
          const ph = cyc + (l.side > 0 ? 0 : PI) + (q4 && l.front ? PI/2 : 0);
          const sw = S(ph), up = Math.max(0, C(ph));
          add(l.hip, -(q4 ? 0.32 : 0.42)*sw*k, 0, 0);
          add(l.knee, (q4 ? 0.45 : 0.6)*up*k, 0, 0);
        });
        tail.forEach((j, i) => add(j, 0, 0.08*S(cyc*2 - i*0.6)*k, 0));
      } else if(mv.kind === 'hop2'){
        // 片足で踏み切り、もう片足で着地する(跳ぶたびに左右が入れ替わる。lead = 着地する脚の側)
        const c = crouchOf(u), a = airOf(u), s = u > 0 && u < 1 ? u : u >= 1 ? 1 : 0, land = u >= 1 ? S(PI*Math.min(1, u - 1)) : 0;
        const lead = mv.lead || 1;
        legs.forEach(l => {
          if(l.side === lead){ // 着地する脚: 膝を上げて前へ振り出し、伸ばして着く → 着地で受け止めて曲げる
            add(l.hip, -(0.2*c + 0.95*a + 0.25*land), 0, 0); add(l.knee, 0.35*c + 1.1*a*(1 - 0.7*s) + 0.45*land, 0, 0);
          } else {             // 踏み切る脚: 曲げて蹴り、後ろへ伸ばしたまま流れて、着地後に前へ戻る
            add(l.hip, 0.7*a*(1 - 0.4*s) + 0.35*land, 0, 0); add(l.knee, 0.6*c + 0.25*a + 0.6*a*s + 0.3*land, 0, 0);
          }
        });
        wingL.forEach((j, i) => add(j, 0, 0, a*(i ? 0.3 : 0.6))); wingR.forEach((j, i) => add(j, 0, 0, -a*(i ? 0.3 : 0.6)));
      } else if(mv.kind === 'hop4'){
        const c = crouchOf(u), a = airOf(u), s = u > 0 && u < 1 ? u : 0, env = Math.sqrt(a);
        legs.forEach(l => {
          if(l.front){ add(l.hip, 0.2*c - 1.1*s*env, 0, 0); add(l.knee, 0.6*c + 0.9*env*(1 - s), 0, 0); }
          else { add(l.hip, -0.3*c + 1.15*(1 - s)*env, 0, 0); add(l.knee, 0.7*c + 0.8*env*s, 0, 0); }
        });
        tail.forEach((j, i) => add(j, -0.25*a, 0, 0));
      } else if(mv.kind === 'crawl'){
        const cyc = d*2*PI*1.8;
        legs.forEach(l => {
          const ph = cyc + (l.ph || 0), up = Math.max(0, C(ph));
          add(l.hip, 0, 0.45*S(ph)*k, l.side*0.45*up*k);
          add(l.knee, 0, 0, -l.side*0.25*up*k);
        });
      } else if(mv.kind === 'serpent'){
        slither(k, d, t);
      } else if(mv.kind === 'swim'){
        tail.forEach((j, i) => add(j, (0.05 + 0.03*i)*S(t*6.5 - i*0.8)*k, 0, 0));
        fins.forEach(f => add(f.j, 0, 0, f.side*0.3*S(t*6.5 + 1)*k));
      } else if(mv.kind === 'fly' || mv.kind === 'glide'){
        if(mv.kind === 'fly'){
          const w = 7.5*(wingO.fly || wingO.speed), f = ph => { const s = S(t*w - ph); return s > 0 ? s : s*0.8; };
          const a = i => (0.2 + 0.85*wingO.amp*f(i*0.8))*(i ? 0.6 : 1)*k;
          if(over.flat){
            // 体を水平に倒して飛ぶ鳥: 翼は体の軸(頭〜尾)のまわりに回す = 倒した後は上下に打つ
            wingL.forEach((j, i) => add(j, 0, a(i) - 0.15*k, 0));
            wingR.forEach((j, i) => add(j, 0, -a(i) + 0.15*k, 0));
          } else {
            wingL.forEach((j, i) => add(j, -0.15*k*(i ? 0 : 1), 0, a(i)));
            wingR.forEach((j, i) => add(j, -0.15*k*(i ? 0 : 1), 0, -a(i)));
          }
        }
        if(!over.flat) legs.forEach(l => { add(l.hip, 0.45*k, 0, 0); add(l.knee, 0.35*k, 0, 0); }); // 脚は後ろへ流す
        tail.forEach((j, i) => add(j, 0, 0.12*S(t*3 - i*0.6)*k, 0));
        // 尾羽をなびかせる(付け根から先へ波が伝わる)
        trail.forEach((c, n) => c.forEach((j, i) => add(j, (0.1 + 0.07*i)*S(t*5 - i*0.9 - n*0.7)*k, 0, 0.05*S(t*3.1 - i*0.7 + n)*k)));
      }
    },
  };
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
