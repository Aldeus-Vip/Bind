/* =====================================================================
   生物ごとの「まとう」エフェクト(待機中ずっと。術を構えると強まる)
   models.js の makeGltfAvatar から B3.makeIdleFx(key, parent, size, model) で作られ、
   毎フレーム tick(t, dt, raise) が呼ばれる。追加のモデルは使わず、すべてコードで作る。

   A・Q  光をまとう          2・6  水しぶきに覆われる     3  紫の波紋(エスパー)
   4     次元の裂け目が体に浮かぶ   5  金銀財宝が周りに浮かぶ   7  風をまとう
   8     雷をまとう          9   黒いさいころが周りを回る   J  体の紋様が青白く光る
   K     炎をまとう          JOKER黒 暗黒をまとう       JOKER白 陽光をまとう
   ===================================================================== */
(function(){
'use strict';
if(!window.THREE || !window.B3) return;
const B = window.B3;
const ADD = THREE.AdditiveBlending;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random()*(b - a);

// 柔らかい光の粒
const dotTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
// 煙(暗黒)
const smokeTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  for(let k=0;k<6;k++){ const x = 20 + Math.random()*24, y = 20 + Math.random()*24, r = 14 + Math.random()*12; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  return new THREE.CanvasTexture(c);
})();
// 次元の裂け目(ギザギザの光る線)
const riftTex = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  const draw = (w, col, blur) => { g.strokeStyle = col; g.lineWidth = w; g.shadowColor = col; g.shadowBlur = blur; g.beginPath(); let x = 32; g.moveTo(x, 6); for(let y = 6; y < 122; y += 10){ x = 32 + (Math.random() - .5)*22; g.lineTo(x, y); } g.stroke(); };
  draw(6, 'rgba(160,80,255,0.8)', 14); draw(2, 'rgba(230,220,255,1)', 4);
  return new THREE.CanvasTexture(c);
})();
// 黒いさいころの目
const diceTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#0c0a10'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#3a1020'; g.lineWidth = 4; g.strokeRect(2, 2, 60, 60);
  g.fillStyle = '#ff2a3a'; g.shadowColor = '#ff2a3a'; g.shadowBlur = 8;
  [[20, 20], [44, 44], [32, 32], [44, 20], [20, 44]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 5, 0, Math.PI*2); g.fill(); });
  return new THREE.CanvasTexture(c);
})();

/* ---- 粒子: THREE.Points を毎フレーム更新する小さな仕組み ---- */
function particles(parent, n, o){
  const pos = new Float32Array(n*3), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: o.tex || dotTex, color: o.color, size: o.size || 0.08, transparent:true, opacity: o.opacity == null ? 0.9 : o.opacity,
    depthWrite:false, blending: o.normal ? THREE.NormalBlending : ADD, sizeAttenuation:true });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; parent.add(pts);
  const P = []; for(let k=0;k<n;k++){ const p = { life: Math.random() }; o.spawn(p, true); P.push(p); }
  return {
    obj: pts, mat,
    tick(dt, raise){
      for(let k=0;k<n;k++){
        const p = P[k];
        p.life += dt*(p.speed || 1)*(1 + raise*0.8);
        if(p.life >= 1){ p.life = 0; o.spawn(p, false); }
        const q = o.at(p, p.life);
        pos[k*3] = q.x; pos[k*3+1] = q.y; pos[k*3+2] = q.z;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
function glow(parent, color, size, y){
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color, transparent:true, opacity:0.35, depthWrite:false, blending:ADD }));
  s.scale.setScalar(size); s.position.y = y; parent.add(s); return s;
}
function ring(parent, r, color, thick){
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, thick || 0.012, 6, 48), new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.5, depthWrite:false, blending:ADD }));
  m.rotation.x = Math.PI/2; parent.add(m); return m;
}

/* ---- 生物ごとの作り方: (g, H, R) → { tick(t, dt, raise) } ---- */
const KIND = {
  // 光をまとう(A・Q): 背後の光、立ち昇る光の粒、ゆっくり回る光輪
  light(g, H, R, col){
    const halo = glow(g, col || 0xffe7a0, H*1.5, H*0.55);
    const ring1 = ring(g, R*0.9, col || 0xffe7a0, 0.01); ring1.position.y = 0.05;
    const motes = particles(g, 40, { color: col || 0xfff0c0, size:0.1,
      spawn(p){ const a = rnd(0, 6.28), r = rnd(0.2, 1)*R; p.x = Math.cos(a)*r; p.z = Math.sin(a)*r; p.speed = rnd(0.25, 0.5); },
      at(p, k){ return V(p.x*(1 - k*0.3), k*H*1.25, p.z*(1 - k*0.3)); } });
    return { tick(t, dt, raise){ motes.tick(dt, raise); halo.material.opacity = 0.25 + Math.sin(t*1.5)*0.08 + raise*0.3; ring1.rotation.z = t*0.4; ring1.material.opacity = 0.35 + raise*0.4; } };
  },
  // 水しぶき(2・6): 体の周りに弧を描いて飛ぶ水滴と、足元の水の輪
  water(g, H, R){
    const drops = particles(g, 90, { color:0xcfefff, size:0.1,
      spawn(p){ p.a = rnd(0, 6.28); p.r = rnd(0.5, 1.1)*R; p.h = rnd(0.3, 1)*H; p.speed = rnd(0.6, 1.2); p.dir = Math.random() < 0.5 ? 1 : -1; },
      at(p, k){ const a = p.a + p.dir*k*1.6; return V(Math.cos(a)*p.r, p.h*0.4 + Math.sin(Math.PI*k)*p.h*0.7, Math.sin(a)*p.r); } });
    const mist = particles(g, 30, { color:0xdff4ff, size:0.3, opacity:0.4, tex: smokeTex,
      spawn(p){ p.a = rnd(0, 6.28); p.r = rnd(0.6, 1)*R; p.speed = rnd(0.2, 0.4); },
      at(p, k){ const a = p.a + k*0.8; return V(Math.cos(a)*p.r, 0.08 + k*0.3, Math.sin(a)*p.r); } });
    const r1 = ring(g, R*0.95, 0x6ac8ff, 0.015); r1.position.y = 0.04;
    return { tick(t, dt, raise){ drops.tick(dt, raise); mist.tick(dt, raise); r1.scale.setScalar(1 + Math.sin(t*2)*0.06); r1.material.opacity = 0.35 + raise*0.4; } };
  },
  // 紫の波紋(3): 体の中心から広がる輪が、高さを変えて次々に
  psychic(g, H, R){
    const rings = [0, 1, 2, 3].map(k => { const m = ring(g, 0.3, 0xc890ff, 0.022); m.userData.ph = k/4; return m; });
    const aura = glow(g, 0x9b5cff, H*1.3, H*0.5);
    return { tick(t, dt, raise){
      rings.forEach((m, k) => { const p = (t*0.45*(1 + raise) + m.userData.ph) % 1; m.scale.setScalar(0.4 + p*2.2*R/0.3*0.3); m.position.y = H*(0.25 + 0.5*((k%2) ? 1 - p : p)); m.material.opacity = (1 - p)*0.95; m.rotation.y = t*0.3; });
      aura.material.opacity = 0.18 + Math.sin(t*2.3)*0.07 + raise*0.3;
    } };
  },
  // 次元の裂け目(4): 体の表面に裂け目が浮かび上がって光る(現れては消える)
  rift(g, H, R, col, model){
    const box = new THREE.Box3().setFromObject(model);
    const slits = [];
    for(let k=0;k<7;k++){
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: riftTex, transparent:true, opacity:0, depthWrite:false, blending:ADD }));
      s.renderOrder = 6; g.add(s); slits.push({ s, ph: Math.random(), sp: rnd(0.25, 0.5) });
    }
    const place = o => { const p = V(rnd(-0.35, 0.35)*R*2, rnd(0.15, 0.8)*H, rnd(-0.3, 0.3)*R*2); o.s.position.copy(p); o.s.material.rotation = rnd(-0.6, 0.6); o.s.scale.set(rnd(0.08, 0.14), rnd(0.25, 0.45), 1); };
    slits.forEach(place);
    return { tick(t, dt, raise){ slits.forEach(o => { o.ph += dt*o.sp*(1 + raise); if(o.ph > 1){ o.ph = 0; place(o); } o.s.material.opacity = Math.sin(Math.PI*o.ph)*(0.8 + raise*0.2)*(0.7 + 0.3*Math.sin(t*30 + o.sp*50)); }); } };
  },
  // 金銀財宝(5): 金貨と銀の宝石がゆっくり周りを巡り、きらめく
  treasure(g, H, R){
    // 金属は環境光の映り込みが無いと暗くなるので、光沢のある Phong と自己発光で輝かせる
    const gold = new THREE.MeshPhongMaterial({ color:0xffcc4a, specular:0xffffff, shininess:90, emissive:0x8a5a00 });
    const silver = new THREE.MeshPhongMaterial({ color:0xe8eef6, specular:0xffffff, shininess:120, emissive:0x50585f });
    const gem = new THREE.MeshPhongMaterial({ color:0x6ae0ff, specular:0xffffff, shininess:150, emissive:0x1a6080, transparent:true, opacity:0.9 });
    const items = [];
    for(let k=0;k<12;k++){
      const kind = k%3, m = kind === 0 ? new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 16), gold)
        : kind === 1 ? new THREE.Mesh(new THREE.OctahedronGeometry(0.04), Math.random() < 0.5 ? silver : gem) : new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 16), silver);
      g.add(m); items.push({ m, a: k/12*6.28, r: rnd(0.8, 1.15)*R, h: rnd(0.15, 0.85)*H, sp: rnd(0.2, 0.4)*(k%2 ? 1 : -1), spin: rnd(1, 3) });
    }
    const glints = particles(g, 8, { color:0xfff0a0, size:0.035,
      spawn(p){ const it = items[Math.floor(Math.random()*items.length)]; p.it = it; p.speed = rnd(1.2, 2); },
      at(p, k){ return p.it.m.position.clone().add(V(0, 0.02, 0)); } });
    return { tick(t, dt, raise){
      items.forEach(o => { const a = o.a + t*o.sp*(1 + raise); o.m.position.set(Math.cos(a)*o.r, o.h + Math.sin(t*1.3 + o.a)*0.05, Math.sin(a)*o.r); o.m.rotation.set(t*o.spin, t*o.spin*0.7, 0); });
      glints.tick(dt, raise); glints.mat.opacity = 0.5 + 0.5*Math.sin(t*9);
    } };
  },
  // 風(7): 体の周りを巡る風の弧と、舞い上がる羽
  wind(g, H, R){
    const arcs = [];
    for(let k=0;k<5;k++){
      const m = new THREE.Mesh(new THREE.TorusGeometry(R*rnd(0.8, 1.15), 0.008, 4, 40, Math.PI*rnd(0.4, 0.8)), new THREE.MeshBasicMaterial({ color:0xc8ffe8, transparent:true, opacity:0.5, depthWrite:false, blending:ADD, side:THREE.DoubleSide }));
      m.rotation.x = Math.PI/2 + rnd(-0.3, 0.3); m.position.y = H*rnd(0.15, 0.85); g.add(m); arcs.push({ m, sp: rnd(1.5, 3)*(k%2 ? 1 : -1) });
    }
    const leaves = particles(g, 24, { color:0xffb070, size:0.06,
      spawn(p){ p.a = rnd(0, 6.28); p.r = rnd(0.6, 1.1)*R; p.speed = rnd(0.35, 0.6); },
      at(p, k){ const a = p.a + k*5; return V(Math.cos(a)*p.r, k*H*1.1, Math.sin(a)*p.r); } });
    return { tick(t, dt, raise){ arcs.forEach(o => { o.m.rotation.z += dt*o.sp*(1 + raise*1.5); o.m.material.opacity = 0.3 + 0.2*Math.sin(t*3 + o.sp) + raise*0.3; }); leaves.tick(dt, raise); } };
  },
  // 雷(8): 体の周りに走る稲妻(数フレームごとに形が変わる)
  lightning(g, H, R){
    const lines = [0, 1, 2, 3].map(k => {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9*3), 3));
      const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: k%2 ? 0xffffff : 0xffe14f, transparent:true, opacity:0.9, blending:ADD, depthWrite:false }));
      g.add(l); return l;
    });
    const aura = glow(g, 0xfff0a0, H*1.2, H*0.5);
    let next = 0;
    const regen = () => lines.forEach(l => {
      const arr = l.geometry.attributes.position.array, a0 = rnd(0, 6.28), y0 = rnd(0.15, 0.85)*H, r = R*rnd(0.5, 0.85);
      for(let j=0;j<9;j++){ const a = a0 + j*0.16; arr[j*3] = Math.cos(a)*r + rnd(-.05, .05); arr[j*3+1] = y0 + rnd(-0.12, 0.12) + j*0.02; arr[j*3+2] = Math.sin(a)*r + rnd(-.05, .05); }
      l.geometry.attributes.position.needsUpdate = true; l.visible = Math.random() < 0.75;
    });
    return { tick(t, dt, raise){ next -= dt; if(next <= 0){ regen(); next = rnd(0.05, 0.14)/(1 + raise); } aura.material.opacity = (Math.random() < 0.1 ? 0.45 : 0.15) + raise*0.25; } };
  },
  // 黒いさいころ(9): 赤い目の黒い立方体が、ゆっくり転がりながら周りを回る
  dice(g, H, R){
    const mat = new THREE.MeshBasicMaterial({ map: diceTex });
    const cubes = [];
    for(let k=0;k<5;k++){ const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), mat); g.add(m); cubes.push({ m, a: k/5*6.28, h: H*rnd(0.3, 0.95), r: R*rnd(0.95, 1.2), sp: rnd(0.35, 0.6) }); }
    const aura = glow(g, 0xff2a3a, H*0.9, H*0.5); aura.material.opacity = 0.12;
    return { tick(t, dt, raise){ cubes.forEach(o => { const a = o.a + t*o.sp*(1 + raise); o.m.position.set(Math.cos(a)*o.r, o.h + Math.sin(t*1.7 + o.a)*0.06, Math.sin(a)*o.r); o.m.rotation.set(t*1.3 + o.a, t*0.9, t*0.5); }); aura.material.opacity = 0.1 + raise*0.3; } };
  },
  // 体の紋様が青白く光る(J): 元の絵柄の明るい部分(紋様)を発光させ、脈打たせる
  glyph(g, H, R, col, model){
    const mats = [];
    model.traverse(o => { if(o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if(m && m.map && m.emissive){ m.emissiveMap = m.map; m.emissive.setRGB(0.55, 0.9, 1.0); m.needsUpdate = true; mats.push(m); } }); });
    const sparks = particles(g, 18, { color:0x9fe8ff, size:0.05,
      spawn(p){ p.x = rnd(-0.35, 0.35)*R*2; p.y = rnd(0.2, 0.9)*H; p.z = rnd(-0.25, 0.25)*R*2; p.speed = rnd(0.4, 0.8); },
      at(p, k){ return V(p.x, p.y + k*0.3, p.z); } });
    return { tick(t, dt, raise){ const k = 0.55 + 0.35*Math.sin(t*1.8) + raise*0.8; mats.forEach(m => { m.emissiveIntensity = k; }); sparks.tick(dt, raise); } };
  },
  // 炎(K): 体から立ち昇る炎と火の粉
  fire(g, H, R){
    const flames = particles(g, 60, { color:0xff7a2a, size:0.16, opacity:0.75,
      spawn(p){ const a = rnd(0, 6.28), r = rnd(0.2, 0.75)*R; p.x = Math.cos(a)*r; p.z = Math.sin(a)*r; p.y = rnd(0, 0.6)*H; p.speed = rnd(0.9, 1.6); },
      at(p, k){ return V(p.x*(1 - k*0.5), p.y + k*0.6, p.z*(1 - k*0.5)); } });
    const embers = particles(g, 24, { color:0xffd04a, size:0.05,
      spawn(p){ const a = rnd(0, 6.28), r = rnd(0.3, 1)*R; p.x = Math.cos(a)*r; p.z = Math.sin(a)*r; p.speed = rnd(0.35, 0.7); },
      at(p, k){ return V(p.x + Math.sin(k*9)*0.05, k*H*1.4, p.z); } });
    const heat = glow(g, 0xff5a10, H*1.3, H*0.4);
    return { tick(t, dt, raise){ flames.tick(dt, raise); embers.tick(dt, raise); flames.mat.size = 0.16 + raise*0.08; heat.material.opacity = 0.2 + Math.sin(t*7)*0.05 + raise*0.3; } };
  },
  // 暗黒(JOKER黒): 足元から湧き上がる黒い靄と、赤い光
  dark(g, H, R){
    const smoke = particles(g, 50, { color:0x000000, size:0.45, opacity:0.8, tex: smokeTex, normal:true,
      spawn(p){ const a = rnd(0, 6.28), r = rnd(0.3, 1)*R; p.x = Math.cos(a)*r; p.z = Math.sin(a)*r; p.speed = rnd(0.3, 0.55); },
      at(p, k){ const a = Math.atan2(p.z, p.x) + k*1.2, r = Math.hypot(p.x, p.z)*(1 + k*0.2); return V(Math.cos(a)*r, k*H*0.9, Math.sin(a)*r); } });
    const glints = particles(g, 14, { color:0xff2a14, size:0.05,
      spawn(p){ const a = rnd(0, 6.28), r = rnd(0.4, 1)*R; p.x = Math.cos(a)*r; p.z = Math.sin(a)*r; p.speed = rnd(0.3, 0.6); },
      at(p, k){ return V(p.x, k*H, p.z); } });
    return { tick(t, dt, raise){ smoke.tick(dt, raise); glints.tick(dt, raise); smoke.mat.opacity = 0.75 + raise*0.2; } };
  },
  // 陽光(JOKER白): 暖かい光と、ゆっくり回る光の筋、舞い降りる光
  sun(g, H, R){
    const halo = glow(g, 0xfff3d0, H*1.7, H*0.6);
    const rays = [];
    for(let k=0;k<6;k++){
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.06, H*1.4), new THREE.MeshBasicMaterial({ map: dotTex, color:0xfff0c0, transparent:true, opacity:0.25, depthWrite:false, blending:ADD, side:THREE.DoubleSide }));
      m.position.y = H*0.6; g.add(m); rays.push(m);
    }
    const motes = particles(g, 30, { color:0xfffbe8, size:0.06,
      spawn(p){ const a = rnd(0, 6.28), r = rnd(0.3, 1.1)*R; p.x = Math.cos(a)*r; p.z = Math.sin(a)*r; p.speed = rnd(0.2, 0.4); },
      at(p, k){ return V(p.x, H*1.3*(1 - k), p.z); } });
    return { tick(t, dt, raise){ rays.forEach((m, k) => { m.rotation.y = t*0.3 + k/6*Math.PI; m.rotation.z = Math.sin(t*0.5 + k)*0.15; m.material.opacity = 0.15 + 0.1*Math.sin(t*1.5 + k) + raise*0.2; }); halo.material.opacity = 0.3 + raise*0.3; motes.tick(dt, raise); } };
  },
};
// 生物 → エフェクト(10 は虫の群れがあるので無し)
const BY_KEY = { 'beast-A':'light', c12:'light', c2:'water', c6:'water', c3:'psychic', c4:'rift', c5:'treasure', c7:'wind', c8:'lightning', c9:'dice', c11:'glyph', c13:'fire', jb:'dark', jw:'sun' };

B.makeIdleFx = function(key, parent, size, model, kindOverride){
  const kind = kindOverride || BY_KEY[key];
  if(!kind || !KIND[kind]) return null;
  const g = new THREE.Group(); g.userData.noFrame = true; parent.add(g);
  const H = size.h || 1, R = size.r || 0.5;
  const fx = KIND[kind](g, H, R, null, model);
  return { group: g, tick(t, dt, raise){ try{ fx.tick(t, Math.min(dt || 0.016, 0.05), raise || 0); }catch(e){} } };
};
})();
