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
  return m;
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
    const s = (spec.height || 1) / Math.max(size.y, 1e-6);
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
    const proc = !mixer && spec.rig ? proceduralRig(model, spec.rig) : null;
    let raiseK = 0, jumpK = 0;
    return {
      pose(raise, jump){
        raiseK = raise; jumpK = jump;
        if(mixer){ if(jump > 0) play('jump'); else if(raise > 0.3) play('raise'); else play('idle'); }
        else if(!proc){ holder.position.y = 0.05*raise; holder.rotation.x = -0.15*raise; }
      },
      idle(t, ph){ if(!mixer && !proc) holder.position.y = Math.sin(t*1.6 + ph)*0.02; },
      tick(t, dt, ph){ if(mixer) mixer.update(dt); if(proc) proc(t + (ph || 0), dt, raiseK, jumpK); },
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
  const get = n => n ? model.getObjectByName(n) : null;
  const prep = b => {
    if(!b) return null;
    const P = rootInv.clone().multiply(b.parent.getWorldQuaternion(new THREE.Quaternion())); // 親の向き(モデル空間)
    return { b, rest: b.quaternion.clone(), P, Pinv: P.clone().invert() };
  };
  const list = a => (Array.isArray(a) ? a : a ? [a] : []).map(get).filter(Boolean).map(prep);
  const J = { spine:list(rig.spine), neck:list(rig.neck), head:list(rig.head), jaw:list(rig.jaw), tail:list(rig.tail), ears:list(rig.ears) };
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
    J.tail.forEach((j, i) => turn(j, -raise*0.12 + jump*0.15, Math.sin(t*1.8 - i*0.6)*(0.10 + i*0.04)*(1 + raise*1.5), 0));
    const flick = Math.max(0, Math.sin(t*0.37)*8 - 7); // ときどき耳を動かす
    J.ears.forEach((j, i) => turn(j, -flick*0.25, 0, (i ? 1 : -1)*flick*0.15));
  };
}

function register(key, factory){
  B.AVATARS[key] = factory;
  // 既に図形モデルで作られているものを作り直す
  B.chars.forEach(ch => {
    delete ch.avCache[key];
    if(ch.avKey === key){ ch.avKey = null; B.setAvatar(ch, key, true); }
  });
}

const loader = new THREE.GLTFLoader();
fetch(BASE + 'manifest.json', { cache:'no-cache' })
  .then(r => r.ok ? r.json() : null)
  .then(manifest => {
    if(!manifest) return;
    Object.entries(manifest).forEach(([key, spec]) => {
      if(key.startsWith('_') || !spec || !spec.file) return;
      loader.load(BASE + spec.file,
        gltf => { register(key, makeGltfAvatar(key, spec, gltf)); console.info(`[Bind3D] モデルを読み込みました: ${key} (${spec.file})`); },
        undefined,
        e => console.warn(`[Bind3D] モデルを読み込めませんでした: ${key} (${spec.file})`, e));
    });
  })
  .catch(() => { /* manifest が無い = 図形モデルのまま */ });
})();
