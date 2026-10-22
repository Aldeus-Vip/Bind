/* =====================================================================
   2D 表示 = 「実際のトランプで遊ぶとこうなる」卓の見立て
   - 3D 版と同じカードのデザイン(表・裏)で、カードを卓に並べた姿にする
   - 表向きのフロア: マグマの絵ではなく、カードの表そのもの(踏むと負けなので赤くふち取る)
   - パーソナル: プレイヤーの色の枠で光るカード(駒の代わりに置いたカード)
   - 3D では盤面の変化で表すもの(雷撃フロア・太陽の強化フロア)は、カードの上に置くトークンで表す
   - 表向きのフロアに止まったとき: 2D でも「カードの生物に飲み込まれる」演出
   見た目は adapter.css の「2D 表示(卓)」。3D 表示のときは何もしない。
   ===================================================================== */
(function(){
'use strict';
if(!window.B3 || typeof render !== 'function') return;
const B = window.B3;
const TEX = window.BIND_TEX || {};
const is2D = () => !B.enabled;

// マグマの絵は使わない(2D の盤面の背景・表向きのフロア・♥ の演出に使われていた)
if(typeof ASSETS !== 'undefined') ASSETS.magmaTexture = null;

function token(kind, src, title){
  const d = document.createElement('div');
  d.className = 'b3-token b3-token-' + kind; d.title = title;
  if(src){ const im = document.createElement('img'); im.src = src; im.alt = ''; d.appendChild(im); }
  return d;
}

// 横向きに倒す動きは、ゲームの状態でバインドが「無し → 有り」になったときだけ(描き直しのたびには倒れ直さない)
const tipAt = [0, 0], wasBoundSt = [false, false];
function dress(){
  const grid = document.getElementById('floor-grid-el');
  if(!grid) return;
  grid.classList.toggle('b3-table', is2D());
  if(!is2D()) return;
  if(TEX.ground) grid.style.setProperty('--b3-mat', `url("${TEX.ground}")`);
  if(state && state.players) state.players.forEach((pl, i) => { if(pl.bound && !wasBoundSt[i]) tipAt[i] = performance.now(); wasBoundSt[i] = !!pl.bound; });
  // 脈打ち・震えなどの繰り返しの動きは、描き直しても時間の続きから(最初からやり直してちらつかない)
  grid.style.setProperty('--b3-t', -(performance.now() % 26400) + 'ms');
  grid.querySelectorAll(':scope > .floor-cell').forEach(cell => {
    // パーソナル: プレイヤーの色を枠に使う(元は背景をその色で塗っていた)
    const pc = cell.querySelector('.card.personal');
    if(pc){
      const col = pc.style.backgroundColor;
      if(col){ pc.style.setProperty('--pc', col); pc.style.backgroundColor = ''; }
    }
    // バインド中: 元の雷の枠の絵を外し、カードの縁を電気が走り続ける表現にする(しびれて動けない)
    const bound = pc && cell.querySelector('.bind-frame-new, .bind-bolt');
    cell.querySelectorAll('.bind-frame-new, .bind-bolt').forEach(e => e.remove());
    if(bound && !cell.querySelector('.b3-bind2d')){
      cell.classList.add('b3-bound'); cell.appendChild(bindMark());
      // 横向きに倒すと、パーソナルの下のフロア(多くは裏向きのカード)が上下にのぞく
      const under = state.floor[+cell.id.slice(11)];
      if(under && under.card){
        const u = under.faceUp ? cardStatic(under.card, 'b3-under') : cardBackDiv('b3-under');
        u.classList.add('b3-under'); cell.insertBefore(u, cell.firstChild);
      }
      // 実物のトランプでは、バインドはパーソナルを横向きに倒して表す。倒れた瞬間だけ回る動きを見せる
      const owner = state.floor[+cell.id.slice(11)] && state.floor[+cell.id.slice(11)].owner;
      if(owner != null && performance.now() - tipAt[owner] < 500){ cell.classList.add('b3-bind-new'); cell.style.setProperty('--b3-tip', -(performance.now() - tipAt[owner]) + 'ms'); }
    }
    // 雷撃フロア: 裏向きのカードはそのままに、⚡のトークンを置く
    if(cell.classList.contains('debuff-floor') && !cell.querySelector('.b3-token-bolt')){
      const back = cell.querySelector('.card-back');
      if(back) back.style.backgroundImage = `url(${B.K.cardBackURL ? B.K.cardBackURL() : ASSETS.cardBack})`;
      cell.appendChild(token('bolt', TEX.lightning_bolt || (typeof ASSETS !== 'undefined' && ASSETS.lightning), '雷撃フロア(止まるとバインド)'));
    }
  });
}
/* ---- 稲妻の線(折れ線)。from → to を細かく折り、ときどき枝を出す ---- */
function boltPath(x0, y0, x1, y1, jag, segs){
  const pts = [[x0, y0]], dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy/len, ny = dx/len;
  for(let i = 1; i < segs; i++){ const f = i/segs, o = (Math.random() - 0.5)*2*jag*Math.sin(Math.PI*f); pts.push([x0 + dx*f + nx*o, y0 + dy*f + ny*o]); }
  pts.push([x1, y1]);
  return pts;
}
const toD = pts => 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs){ const e = document.createElementNS(SVGNS, tag); for(const k in attrs) e.setAttribute(k, attrs[k]); return e; }

/* ---- バインド中の印: カードの縁を走る電気(数本の折れ線が入れ替わりに明滅)+ ⚡ のトークン ---- */
function bindMark(){
  const wrap = document.createElement('div'); wrap.className = 'b3-bind2d';
  const svg = svgEl('svg', { viewBox:'0 0 100 140', preserveAspectRatio:'none', class:'b3-bind-arcs' });
  // 縁に沿った4辺の上を、短い稲妻が3本ずつ走る(それぞれ遅れて明滅)
  const edges = [[4,4,96,4],[96,4,96,136],[96,136,4,136],[4,136,4,4]];
  let n = 0;
  edges.forEach(([a,b,c,d]) => { for(let k = 0; k < 2; k++){
    const f0 = Math.random()*0.5, f1 = f0 + 0.3 + Math.random()*0.2;
    const pts = boltPath(a + (c - a)*f0, b + (d - b)*f0, a + (c - a)*f1, b + (d - b)*f1, 6, 7);
    const g = svgEl('g', { class:'b3-arc', style:`animation-delay:${(n++*0.23 + Math.random()*0.3).toFixed(2)}s` });
    g.appendChild(svgEl('path', { d:toD(pts), class:'b3-arc-glow' })); g.appendChild(svgEl('path', { d:toD(pts), class:'b3-arc-core' }));
    svg.appendChild(g);
  } });
  wrap.appendChild(svg);
  // トークンは稲妻のマーク(描いた形)
  const tk = token('bind', null, 'バインド中(次のムーブができない)');
  tk.innerHTML = '<svg viewBox="0 0 24 24"><path d="M14 2 L5 13.5 H11 L9.5 22 L19 9.5 H13 Z" fill="#ffd84a" stroke="#fff6c8" stroke-width="1" stroke-linejoin="round"/></svg>';
  wrap.appendChild(tk);
  return wrap;
}

/* ---- 雷の演出(2D): 8 の効果の落雷 / 雷撃フロアに止まったときの電撃 ----
   どちらも最後はカードが痺れて、バインド中の印(bindMark)へつながる */
function lightning2D(cellIndex, fromSky){
  return trackAnimation(resolve => {
    let done = false; const layer = document.createElement('div'); layer.className = 'b3-zap2d';
    const fin = () => { if(done) return; done = true; try{ layer.remove(); }catch(e){} if(cell) cell.classList.remove('b3-shock'); resolve(); };
    const cell = document.getElementById('floor-cell-' + cellIndex);
    try{
      if(typeof settings !== 'undefined' && settings.effectAnim === false){ fin(); return; }
      if(!cell){ fin(); return; }
      const r = cell.getBoundingClientRect(), cx = r.left + r.width/2, cy = r.top + r.height/2;
      const W = innerWidth, H = innerHeight;
      document.body.appendChild(layer);
      const svg = svgEl('svg', { viewBox:`0 0 ${W} ${H}`, width:W, height:H, class:'b3-zap-svg' });
      layer.appendChild(svg);
      const A = (el, kf, o) => el.animate(kf, Object.assign({ fill:'forwards' }, o));
      const addBolt = (pts, delay, width, dur) => {
        const g = svgEl('g', {}); const d = toD(pts);
        g.appendChild(svgEl('path', { d, class:'b3-bolt-glow', 'stroke-width':width*3.2 }));
        g.appendChild(svgEl('path', { d, class:'b3-bolt-core', 'stroke-width':width }));
        svg.appendChild(g);
        // 一瞬で走り、2〜3回明滅して消える
        A(g, [{ opacity:0 }, { opacity:1, offset:0.05 }, { opacity:0.25, offset:0.25 }, { opacity:1, offset:0.35 }, { opacity:0.3, offset:0.55 }, { opacity:0.9, offset:0.65 }, { opacity:0 }], { duration:dur, delay, easing:'linear' });
      };
      let hitAt;
      if(fromSky){
        // 落雷: 画面の上から、枝分かれしながらカードへ
        const x0 = cx + (Math.random() - 0.5)*r.width*3, main = boltPath(x0, -20, cx, cy, Math.max(30, r.width*0.5), 22);
        addBolt(main, 0, 4, 700);
        for(let k = 0; k < 4; k++){
          const i = 3 + Math.floor(Math.random()*(main.length - 8)), p = main[i];
          const ex = p[0] + (Math.random() - 0.5)*r.width*2.2, ey = p[1] + 40 + Math.random()*r.height;
          addBolt(boltPath(p[0], p[1], ex, ey, 16, 8), 30, 1.6, 520);
        }
        const flash = document.createElement('div'); flash.className = 'b3-zap-flash'; layer.appendChild(flash);
        A(flash, [{ opacity:0 }, { opacity:0.75, offset:0.08 }, { opacity:0.15, offset:0.3 }, { opacity:0.45, offset:0.4 }, { opacity:0 }], { duration:600 });
        hitAt = 60;
      } else {
        // 雷撃フロア: カードの足元から短い稲妻が何本も跳ね上がる
        for(let k = 0; k < 7; k++){
          const x = r.left + r.width*(0.1 + 0.8*Math.random()), y = r.bottom - 4;
          addBolt(boltPath(x, y, x + (Math.random() - 0.5)*r.width*0.8, r.top + r.height*(0.05 + Math.random()*0.5), 12, 9), k*70, 1.8, 520);
        }
        hitAt = 120;
      }
      setTimeout(() => {
        if(done) return;
        // 着弾: 光の輪と火花、カードが震えて痺れる
        const ring = document.createElement('div'); ring.className = 'b3-zap-ring';
        Object.assign(ring.style, { left:cx + 'px', top:cy + 'px', width:r.width*1.6 + 'px', height:r.width*1.6 + 'px' });
        layer.appendChild(ring);
        A(ring, [{ transform:'translate(-50%,-50%) scale(.2)', opacity:1 }, { transform:'translate(-50%,-50%) scale(1.5)', opacity:0 }], { duration:520, easing:'ease-out' });
        for(let k = 0; k < 18; k++){
          const sp = document.createElement('div'); sp.className = 'b3-zap-spark'; layer.appendChild(sp);
          const a = Math.random()*Math.PI*2, d = r.width*(0.5 + Math.random()*0.9);
          Object.assign(sp.style, { left:cx + 'px', top:cy + 'px', transform:`rotate(${a}rad)` });
          A(sp, [{ transform:`translate(0,0) rotate(${a}rad) scaleX(1)`, opacity:1 }, { transform:`translate(${Math.cos(a)*d}px, ${Math.sin(a)*d}px) rotate(${a}rad) scaleX(.3)`, opacity:0 }],
            { duration:380 + Math.random()*300, easing:'cubic-bezier(.2,.7,.3,1)' });
        }
        cell.classList.add('b3-shock');
        // 痺れ: カードの上で小さな稲妻がしばらく弾け続ける
        for(let k = 0; k < 10; k++){
          const x = r.left + r.width*Math.random(), y = r.top + r.height*Math.random();
          addBolt(boltPath(x, y, x + (Math.random() - 0.5)*r.width*0.6, y + (Math.random() - 0.5)*r.height*0.5, 7, 6), 120 + k*85, 1.3, 260);
        }
      }, hitAt);
      setTimeout(fin, fromSky ? 1500 : 1350);
    }catch(e){ console.error('[Bind2D] 演出エラー(ゲームは続行します)', e); fin(); }
  });
}
[['triggerLightningBoltStrike', true], ['triggerLightningZap', false]].forEach(([name, sky]) => {
  const prev = window[name];
  if(typeof prev !== 'function') return;
  window[name] = function(cellIndex){ return is2D() ? lightning2D(cellIndex, sky) : prev.apply(this, arguments); };
});

const origRender = window.render;
window.render = function(){
  const r = origRender.apply(this, arguments);
  try{ dress(); }catch(e){ console.error('[Bind2D]', e); }
  return r;
};

/* ---- 表向きのフロアに止まった: カードの生物に飲み込まれる(2D) ----
   1) フロアのカードが目覚めて光り、絵の生物が大きくせり上がる
   2) パーソナルのカードが落ちてきて、生物の影に包まれ、色を失って沈む */
function defeat2D(cellIndex, playerIdx){
  return trackAnimation(resolve => {
    let done = false; const fin = () => { if(done) return; done = true; try{ layer.remove(); }catch(e){} resolve(); };
    const layer = document.createElement('div'); layer.className = 'b3-defeat2d';
    try{
      if(typeof settings !== 'undefined' && !settings.defeatAnim){ resolve(); done = true; return; }
      const cell = document.getElementById('floor-cell-' + cellIndex);
      const st = state, slot = st && st.floor ? st.floor[cellIndex] : null;
      const pl = st && st.players ? st.players[playerIdx] : null;
      if(!cell || !slot || !slot.card || !pl || !pl.personalCard){ fin(); return; }
      const r = cell.getBoundingClientRect();
      const mk = (card, cls) => { const c = cardStatic(card, cls); c.style.position = 'absolute'; c.style.left = r.left + 'px'; c.style.top = r.top + 'px'; c.style.width = r.width + 'px'; c.style.height = r.height + 'px'; c.style.margin = '0'; return c; };
      const glow = getComputedStyle(cell.querySelector('.card') || cell).getPropertyValue('--b3s').trim() || '#ff7a3a';
      layer.style.setProperty('--glow', glow);
      document.body.appendChild(layer);
      const veil = document.createElement('div'); veil.className = 'b3-d2-veil'; layer.appendChild(veil);
      const trap = mk(slot.card, 'b3-d2-trap'); layer.appendChild(trap);
      // 生物の影: カードの絵(3D と同じ肖像)を大きくせり上がらせる
      const art = trap.querySelector('.b3-art');
      const spirit = document.createElement('div'); spirit.className = 'b3-d2-spirit';
      if(art) spirit.style.backgroundImage = art.style.backgroundImage;
      const S = Math.max(r.width, r.height)*2.4;
      Object.assign(spirit.style, { left:(r.left + r.width/2 - S/2) + 'px', top:(r.top + r.height*0.75 - S) + 'px', width:S + 'px', height:S + 'px' });
      layer.appendChild(spirit);
      const me = mk(pl.personalCard, 'personal b3-d2-me');
      me.style.setProperty('--pc', (typeof PLAYER_COLORS !== 'undefined' && PLAYER_COLORS[playerIdx]) || '#d4ab52');
      layer.appendChild(me);
      const A = (el, kf, o) => el.animate(kf, Object.assign({ fill:'forwards', easing:'ease-in-out' }, o));
      A(veil, [{ opacity:0 }, { opacity:1, offset:0.35 }, { opacity:1 }], { duration:2600 });
      A(trap, [{ filter:'brightness(1)', transform:'scale(1)' }, { filter:'brightness(1.8) drop-shadow(0 0 18px var(--glow))', transform:'scale(1.06)', offset:0.3 }, { filter:'brightness(1.4) drop-shadow(0 0 26px var(--glow))', transform:'scale(1.04)' }], { duration:2600 });
      A(spirit, [{ opacity:0, transform:'translateY(30%) scale(.55)' }, { opacity:.85, transform:'translateY(0) scale(1)', offset:0.38 }, { opacity:.95, transform:'translateY(6%) scale(1.08)', offset:0.7 }, { opacity:0, transform:'translateY(10%) scale(1.15)' }], { duration:2600 });
      A(me, [{ opacity:0, transform:'translateY(-60%) rotate(-6deg)' }, { opacity:1, transform:'translateY(0) rotate(0)', offset:0.25 },
             { opacity:1, transform:'scale(1)', filter:'none', offset:0.45 },
             { opacity:.9, transform:'scale(.9) rotate(4deg)', filter:'grayscale(1) brightness(.5) drop-shadow(0 0 22px var(--glow))', offset:0.75 },
             { opacity:0, transform:'scale(.35) rotate(18deg)', filter:'grayscale(1) brightness(.2)' }], { duration:2600 });
      // 飲み込まれる瞬間、生物の色の光の粒が渦を巻く
      for(let k = 0; k < 22; k++){
        const p = document.createElement('div'); p.className = 'b3-d2-mote'; layer.appendChild(p);
        const a = Math.random()*Math.PI*2, d = r.width*(0.6 + Math.random()*0.9);
        p.style.left = (r.left + r.width/2) + 'px'; p.style.top = (r.top + r.height/2) + 'px';
        A(p, [{ opacity:0, transform:`translate(${Math.cos(a)*d}px, ${Math.sin(a)*d}px) scale(1)` }, { opacity:1, offset:0.3 }, { opacity:0, transform:`translate(0,0) scale(.2) rotate(${200 + Math.random()*200}deg)` }],
          { duration:900 + Math.random()*500, delay:900 + Math.random()*700, easing:'ease-in' });
      }
      setTimeout(fin, 2700);
    }catch(e){ console.error('[Bind2D] 演出エラー(ゲームは続行します)', e); fin(); }
  });
}
const prevDefeat = window.triggerDefeatBurn;
if(typeof prevDefeat === 'function'){
  window.triggerDefeatBurn = function(cellIndex, playerIdx){ return is2D() ? defeat2D(cellIndex, playerIdx) : prevDefeat.apply(this, arguments); };
}
})();
