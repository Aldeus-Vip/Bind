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

function dress(){
  const grid = document.getElementById('floor-grid-el');
  if(!grid) return;
  grid.classList.toggle('b3-table', is2D());
  if(!is2D()) return;
  if(TEX.ground) grid.style.setProperty('--b3-mat', `url("${TEX.ground}")`);
  grid.querySelectorAll(':scope > .floor-cell').forEach(cell => {
    // パーソナル: プレイヤーの色を枠に使う(元は背景をその色で塗っていた)
    const pc = cell.querySelector('.card.personal');
    if(pc){
      const col = pc.style.backgroundColor;
      if(col){ pc.style.setProperty('--pc', col); pc.style.backgroundColor = ''; }
    }
    // 雷撃フロア: 裏向きのカードはそのままに、⚡のトークンを置く
    if(cell.classList.contains('debuff-floor') && !cell.querySelector('.b3-token-bolt')){
      const back = cell.querySelector('.card-back');
      if(back && typeof ASSETS !== 'undefined' && ASSETS.cardBack) back.style.backgroundImage = `url(${ASSETS.cardBack})`;
      cell.appendChild(token('bolt', TEX.lightning_bolt || (typeof ASSETS !== 'undefined' && ASSETS.lightning), '雷撃フロア(止まるとバインド)'));
    }
  });
}
const origRender = window.render;
window.render = function(){ const r = origRender.apply(this, arguments); try{ dress(); }catch(e){ console.error('[Bind2D]', e); } return r; };

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
