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
    return {
      pose(raise, jump){
        if(jump > 0) play('jump'); else if(raise > 0.3) play('raise'); else play('idle');
        if(!mixer){ holder.position.y = 0.05*raise; holder.rotation.x = -0.15*raise; }
      },
      idle(t, ph){ if(!mixer) holder.position.y = Math.sin(t*1.6 + ph)*0.02; },
      tick(t, dt){ if(mixer) mixer.update(dt); },
    };
  });
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
