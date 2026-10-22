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

/* =====================================================================
   卓の山と扇(2D): 山札・捨て札の山(枚数で厚くなる)と、相手の手札の扇
   - 盤面の左に、真ん中 = 山札、上 = 相手の捨て札、下 = 自分の捨て札。右に枚数
   - 捨て札の一番上は最後に捨てたカードの表。マウスを重ねると中身を全部見られる(捨て札を選ぶ効果もここで選ぶ)
   - 相手の手札は、自分の手札の反対(上)に、逆向きの扇で裏向きに広げる。根本に枚数
   ===================================================================== */
const tbl = document.createElement('div'); tbl.id = 'b3-tbl';
document.body.appendChild(tbl);
// 動いているカードの入れ物(描き直しで山・扇を作り直しても消えないよう別にする)
const flyLayer = document.createElement('div'); flyLayer.id = 'b3-flylayer';
document.body.appendChild(flyLayer);
const bottomP = () => { const u = window.B3UI; const me = u && u.myIndex ? u.myIndex() : null; if(me != null) return me; return (typeof selectedHandTab !== 'undefined' && selectedHandTab != null) ? selectedHandTab : 0; };
const inGame = () => is2D() && typeof state !== 'undefined' && state && state.players && !state.gameOver && document.getElementById('floor-grid-el');
let pinned = null; // マウスを重ねて開いている捨て札(プレイヤー番号)
const thick = n => Math.round(Math.min(n, 54)*0.8); // 枚数 → 厚さ(px)

function pileEl(kind, p){
  const d = document.createElement('div'); d.className = 'b3-pile b3-pile-' + kind; d.dataset.kind = kind; if(p != null) d.dataset.p = p;
  // 飛んでいる途中のカードは、まだ山に届いていないものとして数えない
  const list = (kind === 'deck' ? state.deck : state.players[p].discard).filter(c => c && !flying.has(c.id));
  const n = list.length, t = thick(n);
  d.style.setProperty('--t', t + 'px');
  const stack = document.createElement('div'); stack.className = 'b3-pile-stack'; if(n > 1) d.appendChild(stack);
  let top;
  if(!n){ top = document.createElement('div'); top.className = 'b3-pile-empty'; }
  else if(kind === 'deck') top = cardBackDiv('b3-pile-top');
  else top = cardStatic(list[n - 1], 'b3-pile-top');
  top.classList.add('b3-pile-top'); d.appendChild(top);
  const cnt = document.createElement('div'); cnt.className = 'b3-pile-count'; cnt.textContent = n;
  const lab = document.createElement('div'); lab.className = 'b3-pile-label';
  lab.textContent = kind === 'deck' ? '山札' : (p === bottomP() ? 'あなたの捨て札' : (state.players[p].name || '相手') + 'の捨て札');
  d.appendChild(cnt); d.appendChild(lab);
  if(kind === 'discard'){
    const dt = typeof discardTaskFor === 'function' ? discardTaskFor(p) : null;
    if(dt) d.classList.add('picking');
    d.addEventListener('mouseenter', () => { pinned = p; drawPop(); });
    d.addEventListener('mouseleave', e => { if(!(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.b3-pile-pop'))){ pinned = null; drawPop(); } });
    d.addEventListener('click', () => { pinned = p; drawPop(); });
  }
  return d;
}
// 捨て札の中身: 山の右に広げて見せる。捨て札を選ぶ効果の最中は、ここでクリックして選ぶ
function drawPop(){
  tbl.querySelectorAll('.b3-pile-pop').forEach(e => e.remove());
  if(!inGame()) return;
  let p = pinned;
  const forced = state.players.findIndex((pl, i) => typeof discardTaskFor === 'function' && discardTaskFor(i) && state.players[i].discard.length);
  if(p == null && forced >= 0) p = forced;
  if(p == null) return;
  const pl = state.players[p], pile = tbl.querySelector(`.b3-pile-discard[data-p="${p}"]`);
  if(!pl || !pile || !pl.discard.length) return;
  const dt = typeof discardTaskFor === 'function' ? discardTaskFor(p) : null;
  const pop = document.createElement('div'); pop.className = 'b3-pile-pop' + (dt ? ' picking' : '');
  const h = document.createElement('div'); h.className = 'b3-pop-title'; h.textContent = `${p === bottomP() ? 'あなた' : pl.name}の捨て札 ${pl.discard.length}枚` + (dt ? '(選んでください)' : ''); pop.appendChild(h);
  const row = document.createElement('div'); row.className = 'b3-pop-row';
  pl.discard.forEach((c, idx) => {
    let e;
    if(!dt) e = cardStatic(c, 'b3-pop-card');
    else if(dt.kind === 'discard-multi'){
      if(!dt.selected) dt.selected = [];
      e = cardButton(c, () => { const k = dt.selected.indexOf(c); if(k >= 0) dt.selected.splice(k, 1); else dt.selected.push(c); render(); }, 'b3-pop-card reachable' + (dt.selected.includes(c) ? ' selected' : ''));
    } else e = cardButton(c, () => resolveTask(idx), 'b3-pop-card reachable');
    row.appendChild(e);
  });
  pop.appendChild(row);
  pop.addEventListener('mouseleave', () => { pinned = null; drawPop(); });
  tbl.appendChild(pop);
  const r = pile.getBoundingClientRect();
  pop.style.left = (r.right + 46) + 'px';
  pop.style.top = Math.max(8, Math.min(innerHeight - pop.offsetHeight - 8, r.top + r.height/2 - pop.offsetHeight/2)) + 'px';
}
// 相手の手札: 逆向きの扇(裏向き)。手札を選ぶ効果(5・10・JOKER・Q)の最中は、ここで選ぶ
function fanEl(p){
  const pl = state.players[p], n = pl.hand.length;
  const f = document.createElement('div'); f.className = 'b3-ofan'; f.dataset.p = p;
  const ht = typeof handSlotTaskFor === 'function' ? handSlotTaskFor(p) : null;
  const at = typeof handAreaTaskFor === 'function' ? handAreaTaskFor(p) : null;
  if(ht || at) f.classList.add('picking');
  const spread = Math.min(40, 6*Math.max(1, n - 1)); // 扇の開き(度)
  pl.hand.forEach((c, idx) => {
    const k = n > 1 ? idx/(n - 1) - 0.5 : 0;
    const w = document.createElement('div'); w.className = 'b3-ofan-card'; w.id = `b3-ohand-${p}-${idx}`;
    w.style.setProperty('--a', (-k*spread) + 'deg'); // 根本(上)を中心に回す
    if(typeof isHandSlotHidden === 'function' && isHandSlotHidden(p, idx)) w.style.visibility = 'hidden';
    w.appendChild(cardBackDiv('mini-back'));
    if(ht && ht.filter(idx)){ w.classList.add('reachable'); w.addEventListener('click', e => { e.stopPropagation(); resolveTask(idx); }); }
    f.appendChild(w);
  });
  const cnt = document.createElement('div'); cnt.className = 'b3-ofan-count'; cnt.textContent = `${pl.name || '相手'}の手札 ${n}枚`;
  f.appendChild(cnt);
  if(at) f.addEventListener('click', () => resolveTask(p));
  return f;
}
function drawTable(){
  tbl.innerHTML = '';
  document.body.classList.toggle('b3-2d', !!inGame());
  if(!inGame()) return;
  const me = bottomP(), opp = 1 - me;
  const t = state.task;
  // 手札を選ぶ効果が自分(下)の手札を対象にしているとき(1台で2人)は、上の扇をそのプレイヤーにする
  const fanP = t && (t.kind === 'hand-slot' || t.kind === 'hand-area') && (t.kind === 'hand-slot' ? t.playerIndex === me : t.filter(me) && !t.filter(opp)) ? me : opp;
  const col = document.createElement('div'); col.className = 'b3-piles';
  col.appendChild(pileEl('discard', opp)); col.appendChild(pileEl('deck')); col.appendChild(pileEl('discard', me));
  tbl.appendChild(col);
  tbl.appendChild(fanEl(fanP));
  // Q: 手札欄そのものを選ぶ。自分の手札(下の扇)も選べる。手札が0枚でも押せるよう札も出す
  const atMe = typeof handAreaTaskFor === 'function' ? handAreaTaskFor(me) : null;
  if(atMe){
    const fan = document.querySelector('.b3-fan');
    if(fan){ fan.classList.add('b3-pick-hand'); const tray = fan.querySelector('.b3-tray'); if(tray) tray.addEventListener('click', e => { e.stopPropagation(); resolveTask(me); }, { capture:true }); }
    const pill = document.createElement('button'); pill.type = 'button'; pill.className = 'b3-myhand-pick';
    pill.textContent = `あなたの手札(${state.players[me].hand.length}枚)を選ぶ`;
    pill.addEventListener('click', () => resolveTask(me));
    tbl.appendChild(pill);
  }
  placeTable();
  drawPop();
}
// 盤面の位置に合わせて置く(描き直し・画面の大きさの変化・盤面の位置の変化に追従)
function placeTable(){
  const grid = document.getElementById('floor-grid-el'); if(!grid || !inGame()) return;
  const g = grid.getBoundingClientRect(), cell = grid.querySelector('.floor-cell');
  const cw = cell ? cell.getBoundingClientRect().width : 90;
  tbl.style.setProperty('--cw', Math.round(cw*0.82) + 'px');
  const col = tbl.querySelector('.b3-piles'), fan = tbl.querySelector('.b3-ofan');
  if(col){ col.style.left = Math.max(6, g.left - col.offsetWidth - 70) + 'px'; col.style.top = Math.max(60, g.top + g.height/2 - col.offsetHeight/2) + 'px'; }
  if(fan){
    // 扇の根本は盤面の上の中央よりさらに上。カードの下端が盤面の少し上に来る
    const fw = Math.round(cw*0.62), fh = Math.round(fw*1.4), R = 260;
    fan.style.setProperty('--fw', fw + 'px'); fan.style.setProperty('--fh', fh + 'px'); fan.style.setProperty('--R', R + 'px');
    fan.style.left = (g.left + g.width/2) + 'px'; fan.style.top = (g.top - 8 - fh/2 - R) + 'px';
  }
}
let lastG = '';
(function follow(){
  requestAnimationFrame(follow);
  const grid = inGame() && document.getElementById('floor-grid-el'); if(!grid) return;
  const r = grid.getBoundingClientRect(), k = `${r.left|0},${r.top|0},${r.width|0},${r.height|0}`;
  if(k !== lastG){ lastG = k; placeTable(); }
  if(flying.size) hideFlying(); // 手札の扇などが後から作り直されても、着地前のカードは隠したまま
})();
// 演出(table2d の「実物のカードの動き」)から使う位置
const T2 = window.B3.table2d = {
  deck: () => tbl.querySelector('.b3-pile-deck .b3-pile-top'),
  discard: p => tbl.querySelector(`.b3-pile-discard[data-p="${p}"] .b3-pile-top`),
  oppHand: (p, idx) => document.getElementById(`b3-ohand-${p}-${idx}`) || tbl.querySelector('.b3-ofan'),
  bottomP, drawTable,
};

/* =====================================================================
   実物のカードの動き(2D): 描き直しのたびにカードの居場所(山札・手札・捨て札・マス・パーソナル)と表裏を記録し、
   居場所や表裏が変わったカードを、前の位置から新しい位置へ滑らせる(表裏が変わるなら途中でひっくり返す)。
   引く・捨てる・フロアを捨て札へ・相手の手札を捨てさせる…などを、効果ごとに書かずに同じ仕組みで表す。
   ===================================================================== */
const flying = new Map(); // カードの id → 着地先(着くまで着地先のカードは隠す)
const skipMove = new Set(); // 専用の動き(移動など)で動かしたカード: 次の記録では動かさない
let prevSnap = null, prevState = null;
function zoneRect(z){
  let e = null;
  if(z.zone === 'deck') e = T2.deck();
  else if(z.zone === 'disc') e = T2.discard(z.p);
  else if(z.zone === 'hand'){
    if(z.p === bottomP()){ const row = document.querySelector('.b3-fan .hand-row'); e = row ? row.children[z.idx] || row : null; }
    else e = document.getElementById(`b3-ohand-${z.p}-${z.idx}`) || tbl.querySelector('.b3-ofan');
  } else e = document.getElementById('floor-cell-' + z.cell);
  if(!e) return null;
  const r = e.getBoundingClientRect();
  const w = e.offsetWidth || r.width, h = e.offsetHeight || r.height;
  // 山札・捨て札は横向き(カードを 90° 回して置いている)
  const rot = (z.zone === 'deck' || z.zone === 'disc') && !e.classList.contains('b3-pile-empty') ? 90 : 0;
  return { x: r.left + r.width/2, y: r.top + r.height/2, w: rot ? Math.min(w, h) : w, h: rot ? Math.max(w, h) : h, rot };
}
// 今のカードの居場所(見る人から見た表裏つき)
function snapshot(){
  const m = new Map(), me = bottomP();
  const put = (c, z) => { if(c && c.id != null) m.set(c.id, Object.assign({ card:c }, z)); };
  const nd = state.deck.length;
  state.deck.forEach((c, i) => put(c, { zone:'deck', key:'deck', up:false, bottom: nd > 1 && i < nd/2 })); // 山札の下半分 = 一番下へ戻されたカード
  state.players.forEach((pl, p) => {
    pl.discard.forEach(c => put(c, { zone:'disc', p, key:'disc' + p, up:true }));
    pl.hand.forEach((c, idx) => put(c, { zone:'hand', p, idx, key:'hand' + p, up: p === me }));
  });
  state.floor.forEach((s, i) => { if(s && s.card) put(s.card, { zone:'cell', cell:i, key:'cell' + i, up: !!s.faceUp }); });
  state.players.forEach((pl, p) => { if(pl.personalCard && pl.personalIndex != null) put(pl.personalCard, { zone:'cell', cell:pl.personalIndex, key:'pers' + p, up:true }); });
  m.forEach(z => { z.rect = zoneRect(z); });
  return m;
}
const faceEl = (card, up) => { const e = up ? cardStatic(card, 'b3-fly-face') : cardBackDiv('b3-fly-face'); e.classList.add('b3-fly-face'); return e; };
// 1枚を滑らせる(必要なら途中でひっくり返す)
function fly(id, a, b, delay){
  const card = b.card, el = document.createElement('div'); el.className = 'b3-fly';
  const A = a.rect, Bz = b.rect;
  if(!A || !Bz) return;
  el.appendChild(faceEl(card, a.up));
  Object.assign(el.style, { left:(A.x - A.w/2) + 'px', top:(A.y - A.h/2) + 'px', width:A.w + 'px', height:A.h + 'px' });
  flyLayer.appendChild(el);
  flying.set(id, b.key);
  const dur = Math.min(1100, 520 + Math.hypot(Bz.x - A.x, Bz.y - A.y)*0.5);
  const turn = a.up !== b.up;
  const sx = Bz.w/A.w, sy = Bz.h/A.h, dx = Bz.x - A.x, dy = Bz.y - A.y;
  const r0 = A.rot || 0, r1 = Bz.rot || 0, rm = (r0 + r1)/2; // 山(横向き)へ置く・山から取るときは途中で回す
  // 持ち上げて(少し大きく、影が濃く)運び、置く
  // 山札の一番下へ戻すとき: 真横まで運び、黒い直方体(厚さ)の下へ横から滑り込ませる
  const toBottom = b.zone === 'deck' && b.bottom && a.zone !== 'deck';
  const tk = thick(state.deck.length), bx = Bz.x - Bz.h*1.15, by = Bz.y + Bz.w/2 + Math.max(4, tk/2);
  const kf = toBottom
    ? [{ transform:`translate(0,0) rotate(${r0}deg) scale(1,1)`, opacity:1 },
       { transform:`translate(${bx - A.x}px, ${by - A.y}px) rotate(90deg) scale(${sx}, ${sy})`, opacity:1, offset:0.6 },
       { transform:`translate(${Bz.x - A.x}px, ${by - A.y}px) rotate(90deg) scale(${sx*0.12}, ${sy})`, opacity:0 }]
    : turn
    ? [{ transform:`translate(0,0) rotate(${r0}deg) scale(1,1)` }, { transform:`translate(${dx/2}px, ${dy/2 - 30}px) rotate(${rm}deg) scale(0, ${(1 + sy)/2*1.08})`, offset:0.5 }, { transform:`translate(${dx}px, ${dy}px) rotate(${r1}deg) scale(${sx}, ${sy})` }]
    : [{ transform:`translate(0,0) rotate(${r0}deg) scale(1,1)` }, { transform:`translate(${dx/2}px, ${dy/2 - 24}px) rotate(${rm}deg) scale(${(1 + sx)/2*1.08}, ${(1 + sy)/2*1.08})`, offset:0.5 }, { transform:`translate(${dx}px, ${dy}px) rotate(${r1}deg) scale(${sx}, ${sy})` }];
  return trackAnimation(res => {
    let fin = false; // 完了の通知は1回だけ(trackAnimation の数が狂わないように)
    const done = () => { if(fin) return; fin = true; flying.delete(id); try{ el.remove(); }catch(e){}
      document.querySelectorAll(`[data-b3hid="${id}"]`).forEach(e => { e.style.visibility = ''; delete e.dataset.b3hid; }); // 着地したら、隠していた着地先を戻す
      hideFlying(); drawTable(); res();
      // CPU は演出中は動かないので、カードが着地したら声をかけ直す(描き直しの後に始まる動きなので、元のゲームは呼び直さない)
      if(typeof cpuMaybeAct === 'function') setTimeout(() => { try{ if(!animationsInFlight) cpuMaybeAct(); }catch(e){} }, 0); };
    const an = el.animate(kf, { duration:dur, delay, easing:'cubic-bezier(.45,.05,.35,1)', fill:'both' });
    if(turn) setTimeout(() => { el.innerHTML = ''; el.appendChild(faceEl(card, b.up)); }, delay + dur*(toBottom ? 0.3 : 0.5));
    an.onfinish = done; an.oncancel = done;
    setTimeout(done, delay + dur + 400); // 念のため
  });
}
// 着地前のカードの着地先を隠す(描き直しで出てきても)
const travIdx = () => (typeof travelingOriginIndex !== 'undefined' ? travelingOriginIndex : null);
function hideFlying(){
  if(!flying.size || !inGame()) return;
  const me = bottomP();
  flying.forEach((key, id) => {
    let e = null;
    if(key.startsWith('hand')){
      const p = +key.slice(4), idx = state.players[p].hand.findIndex(c => c && c.id === id);
      if(idx < 0) return;
      if(p === me){ const row = document.querySelector('.b3-fan .hand-row'); e = row && row.children[idx]; }
      else e = document.getElementById(`b3-ohand-${p}-${idx}`);
    } else if(key.startsWith('cell')){
      // パーソナルが乗っているマスでは、下のカードは見えていない(上のパーソナルを隠してしまわないように)
      const c = +key.slice(4), slot = state.floor[c];
      if(slot && slot.owner != null && travIdx() !== c) return;
      e = document.querySelector(`#floor-cell-${c} > .card-back, #floor-cell-${c} > .card:not(.personal)`);
    }
    else if(key.startsWith('pers')){ const pl = state.players[+key.slice(4)]; e = pl && pl.personalIndex != null ? document.querySelector(`#floor-cell-${pl.personalIndex} .card.personal`) : null; }
    if(e){ e.style.visibility = 'hidden'; e.dataset.b3hid = id; }
  });
}
function physical(){
  if(!inGame()){ prevSnap = null; prevState = null; return; }
  if(state !== prevState){ prevState = state; prevSnap = snapshot(); return; } // 新しい対局: 動かさずに記録だけ
  const now = snapshot();
  let n = 0;
  now.forEach((z, id) => {
    const o = prevSnap.get(id); // 連鎖の間どこにも無かったカード(4・10・J・2)は、最後に見た居場所から
    if(!o){ return; }
    if(o.key === z.key && o.up === z.up) return;
    if(skipMove.has(id)){ skipMove.delete(id); return; } // 専用の動きで見せたカード(居場所が実際に変わったときに使う)
    if(o.key.startsWith('hand') && z.key === o.key) return; // 同じ手札の中で並びが変わっただけ
    fly(id, o, z, n++*110);
  });
  prevSnap.forEach((z, id) => { if(!now.has(id)) now.set(id, z); }); // 見えなくなったカードは最後の居場所を覚えておく
  prevSnap = now;
  hideFlying();
}
B.table2d.skipMove = id => skipMove.add(id);

/* ---- 2D では元の演出(炎・渦・柱など)を出さない。カードの動きは上の仕組みが出すので、少し間をおくだけにする ----
   移動・ワープ・敗北・雷は専用の動き(下と上)。対になる演出(浮かぶ → 収まる など)は両方とも間をおくだけ。 */
const KEEP = new Set(['triggerNumberEffect', 'triggerCardNumberEffect', 'triggerSuitEffect', 'triggerDefeatBurn', 'triggerLightningBoltStrike', 'triggerLightningZap',
  'triggerMoveTravel', 'triggerDualRiftTeleport', 'triggerTeleport', 'triggerChangeFlip']);
const BEAT = { triggerDrawCardAppear:260, triggerSunDrawCardAppear:200, triggerVortexDrawCardAppear:200, triggerClubDrawAppear:200, triggerChangeFlip:420,
  triggerExtraTurnWhiteout:500, triggerWindCellLanding:120, triggerWindCellDissipate:120, triggerTornadoAppear:200, triggerTornadoSettleInPlace:200 };
const beat = ms => trackAnimation(res => setTimeout(res, ms));

/* ---- 2D の簡単な演出(リング・光の粒・渦・斬撃・光の柱・ひび・画面の光)。8 の雷くらいの「今これが起きた」がわかる程度 ---- */
const C2 = { H:'#ff4a5a', S:'#a070ff', D:'#ffc040', C:'#4aa0ff', sun:'#ffd36a', violet:'#b67dff', green:'#5fe08a', water:'#5ab8ff', wind:'#7fe6d6', dark:'#9a5cff', blood:'#ff4a8a', white:'#f4f0ff' };
const boxOf = e => { if(!e) return null; const r = e.getBoundingClientRect(); return r.width || r.height ? { x:r.left + r.width/2, y:r.top + r.height/2, w:r.width, h:r.height } : null; };
const at = {
  cell: i => cellBox(i),
  deck: () => boxOf(T2.deck()),
  disc: p => boxOf(T2.discard(p)),
  hand: p => p === bottomP() ? boxOf(document.querySelector('.b3-fan .hand-row')) : boxOf(tbl.querySelector('.b3-ofan-card') && (() => { const cs = [...tbl.querySelectorAll('.b3-ofan-card')]; if(!cs.length) return null; const rs = cs.map(c => c.getBoundingClientRect()); const l = Math.min(...rs.map(r => r.left)), t = Math.min(...rs.map(r => r.top)), rr = Math.max(...rs.map(r => r.right)), bb = Math.max(...rs.map(r => r.bottom)); return { getBoundingClientRect: () => ({ left:l, top:t, width:rr - l, height:bb - t }) }; })()),
  slot: (p, idx) => p === bottomP() ? boxOf((document.querySelector('.b3-fan .hand-row') || { children:[] }).children[idx]) || at.hand(p) : boxOf(document.getElementById(`b3-ohand-${p}-${idx}`)) || at.hand(p),
};
function fxEl(cls, b, sz){ const e = document.createElement('div'); e.className = 'b3-fx ' + cls; const S = sz || Math.max(b.w, b.h); Object.assign(e.style, { left:b.x + 'px', top:b.y + 'px', width:S + 'px', height:S + 'px' }); flyLayer.appendChild(e); return e; }
const kill = (e, ms) => setTimeout(() => { try{ e.remove(); }catch(_){ } }, ms);
const fx = {
  ring(b, col, big){ if(!b) return; [0, 160].forEach(d => { const e = fxEl('b3-fx-ring', b, Math.max(b.w, b.h)*(big ? 1.3 : 1)); e.style.setProperty('--c', col);
    e.animate([{ transform:'translate(-50%,-50%) scale(.3)', opacity:1 }, { transform:'translate(-50%,-50%) scale(1.5)', opacity:0 }], { duration:700, delay:d, easing:'ease-out', fill:'both' }); kill(e, 900 + d); }); },
  burst(b, col, n){ if(!b) return; for(let k = 0; k < (n || 16); k++){ const e = fxEl('b3-fx-mote', b, 8); e.style.setProperty('--c', col);
    const a = Math.random()*Math.PI*2, d = Math.max(b.w, b.h)*(0.4 + Math.random()*0.6);
    e.animate([{ transform:'translate(-50%,-50%)', opacity:1 }, { transform:`translate(calc(-50% + ${Math.cos(a)*d}px), calc(-50% + ${Math.sin(a)*d - 20}px)) scale(.3)`, opacity:0 }], { duration:600 + Math.random()*300, easing:'cubic-bezier(.2,.7,.3,1)', fill:'both' }); kill(e, 1000); } },
  swirl(b, col){ if(!b) return; const e = fxEl('b3-fx-swirl', b, Math.max(b.w, b.h)*1.25); e.style.setProperty('--c', col);
    e.animate([{ transform:'translate(-50%,-50%) rotate(0) scale(1.2)', opacity:0 }, { opacity:1, offset:0.25 }, { transform:'translate(-50%,-50%) rotate(540deg) scale(.2)', opacity:0 }], { duration:900, easing:'ease-in', fill:'both' }); kill(e, 1000); },
  slash(b, col){ if(!b) return; const e = fxEl('b3-fx-slash', b, Math.max(b.w, b.h)*1.6); e.style.setProperty('--c', col);
    e.animate([{ transform:'translate(-50%,-50%) rotate(-35deg) scaleX(0)', opacity:1 }, { transform:'translate(-50%,-50%) rotate(-35deg) scaleX(1)', opacity:1, offset:0.35 }, { transform:'translate(-50%,-50%) rotate(-35deg) scaleX(1)', opacity:0 }], { duration:520, easing:'ease-out', fill:'both' }); kill(e, 600); },
  pillar(b, col){ if(!b) return; const e = fxEl('b3-fx-pillar', b, b.w*1.1); e.style.setProperty('--c', col); e.style.height = (b.h*2.6) + 'px';
    e.animate([{ transform:'translate(-50%,-85%) scaleX(0)', opacity:0 }, { transform:'translate(-50%,-85%) scaleX(1)', opacity:1, offset:0.3 }, { transform:'translate(-50%,-85%) scaleX(.2)', opacity:0 }], { duration:900, easing:'ease-out', fill:'both' }); kill(e, 1000); },
  crack(b, i){ if(!b) return; const e = fxEl('b3-fx-crack', b, Math.max(b.w, b.h));
    e.innerHTML = '<svg viewBox="0 0 100 100"><path d="M50 2 L44 22 L58 34 L38 52 L62 68 L40 86 L52 98 M44 22 L20 26 M58 34 L84 26 M38 52 L12 58 M62 68 L90 74" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>';
    e.animate([{ opacity:0, transform:'translate(-50%,-50%) scale(.9)' }, { opacity:1, transform:'translate(-50%,-50%) scale(1)', offset:0.2 }, { opacity:0, transform:'translate(-50%,-50%) scale(1.05)' }], { duration:900, fill:'both' }); kill(e, 1000);
    const c = i != null && document.getElementById('floor-cell-' + i); if(c){ c.classList.add('b3-shock'); setTimeout(() => c.classList.remove('b3-shock'), 380); } },
  flash(col){ const e = document.createElement('div'); e.className = 'b3-fx-flash'; e.style.setProperty('--c', col); flyLayer.appendChild(e);
    e.animate([{ opacity:0 }, { opacity:.45, offset:0.2 }, { opacity:0 }], { duration:700, fill:'both' }); kill(e, 800); },
  glow(b, col){ if(!b) return; const e = fxEl('b3-fx-glow', b); Object.assign(e.style, { width:b.w + 'px', height:b.h + 'px' }); e.style.setProperty('--c', col);
    e.animate([{ opacity:0 }, { opacity:1, offset:0.3 }, { opacity:0 }], { duration:800, fill:'both' }); kill(e, 900); },
};
/* ---- 連鎖する効果(2・9・10・J)の「発動中」: 効果を出しているカードを、その場所で光らせ続ける(連鎖が終わるまで) ---- */
const actives = new Map(); // 名前 → 要素
function activeCard(name, card, box, rot){
  dropActive(name);
  if(!card || !box) return null;
  const el = document.createElement('div'); el.className = 'b3-active';
  const w = rot ? box.h : box.w, h = rot ? box.w : box.h; // 横向きの山の上では縦のカードを置く
  Object.assign(el.style, { left:(box.x - Math.min(w, h*5/7)/2) + 'px', top:(box.y - Math.max(h, w*7/5)/2) + 'px', width:Math.min(w, h*5/7) + 'px', height:Math.max(h, w*7/5) + 'px' });
  const th = (window.B3 && B3.K && B3.K.themeOf) ? B3.K.themeOf(card) : null;
  el.style.setProperty('--c', th ? th.glow : '#f0d690');
  el.appendChild(faceEl(card, true));
  const tag = document.createElement('div'); tag.className = 'b3-active-tag'; tag.textContent = '発動中'; el.appendChild(tag);
  flyLayer.appendChild(el);
  el.animate([{ transform:'translateY(10px) scale(.85)', opacity:0 }, { transform:'translateY(-6px) scale(1.04)', opacity:1 }], { duration:380, easing:'ease-out', fill:'both' });
  actives.set(name, el);
  return el;
}
function dropActive(name){ const e = actives.get(name); if(e){ actives.delete(name); e.animate([{ opacity:1 }, { opacity:0, transform:'scale(.9)' }], { duration:250, fill:'both' }); setTimeout(() => { try{ e.remove(); }catch(_){ } }, 260); } }
// 手で運ぶ(居場所の記録とは別に、決まった位置から位置へ)
function carryCard(card, A, B, upA, upB){
  if(!card || !A || !B) return Promise.resolve();
  return fly(card.id + ':carry', { rect:A, up:upA, zone:'x' }, { rect:B, up:upB, zone:'x', card, key:'none' }, 0) || Promise.resolve();
}
const lastRect = card => { const z = card && prevSnap && prevSnap.get(card.id); return z ? z.rect : null; };
const handDrop = p => { // 手札の扇の右どなり(フロアと同じ大きさ)
  const c = at.cell(0) || { w:80, h:112 }, n = state.players[p].hand.length;
  const b = (n ? at.slot(p, n - 1) : null) || at.hand(p); if(!b) return null;
  return { x:b.x + b.w/2 + c.w*0.85, y:b.y + (p === bottomP() ? -c.h*0.3 : c.h*0.3), w:c.w, h:c.h };
};
const cardBox = b => b ? { x:b.x, y:b.y, w:b.w, h:b.h } : null;

// 元の演出の名前 → 2D の簡単な演出(戻り値は待つ時間 ms。省略時 700)
const nineCard = [null, null];
const FX = {
  triggerMagmaRiseAndCrack: i => { fx.ring(at.cell(i), C2.H); fx.burst(at.cell(i), C2.H); },            // ♥: 裏 → 表
  triggerSpadeSlashHand: (p, idx) => { fx.slash(at.slot(p, idx), C2.S); },                              // ♠: 手札を斬る
  triggerDiamondCircleSpawn: i => { fx.ring(at.cell(i), C2.D); fx.burst(at.cell(i), C2.D, 10); },       // ♦: 新しいフロア
  triggerDiscardSpinVanish: p => { fx.swirl(at.disc(p), C2.D); },                                       // ♦: 捨て札 → 山札の下
  triggerClubGrowthVanish: p => { fx.swirl(at.disc(p), C2.C); },                                        // ♣: 捨て札 → 山札の下
  triggerClubDrawAppear: () => { fx.burst(at.deck(), C2.C, 8); return 420; },
  triggerSunDrawCardAppear: () => { fx.burst(at.deck(), C2.sun, 8); return 380; },                       // A: 5枚引く
  triggerSunFloorSpawn: i => { fx.ring(at.cell(i), C2.sun); fx.burst(at.cell(i), C2.sun, 10); },        // A: 新しいフロア
  triggerCardFlip: i => { fx.glow(at.cell(i), C2.sun); },                                               // A: 表 → 裏(太陽の強化)
  triggerExtraTurnWhiteout: () => { fx.flash(C2.sun); return 900; },                                    // A: 追加ターン
  triggerVortexDrawCardAppear: () => { fx.swirl(at.deck(), C2.water); return 420; },                    // 3: 1枚引く
  triggerVortexHide: i => { fx.swirl(at.cell(i), C2.water); },                                          // 3: 表 → 裏
  // 2: めくったカードが表のまま、そのマスの上で発動中(連鎖が終わるとそのマスに表で戻る)
  triggerSummon2RiseAndReveal: i => { const slot = state.floor[i]; fx.ring(at.cell(i), C2.violet, true); fx.pillar(at.cell(i), C2.violet);
    if(slot && slot.card){ activeCard('2:' + i, slot.card, at.cell(i)); skipMove.add(slot.card.id); } return 900; },
  triggerSummon2Return: i => { dropActive('2:' + i); fx.ring(at.cell(i), C2.violet); return 500; },
  triggerDiscardFlipRise: p => { fx.pillar(at.disc(p), C2.violet); },                                   // 4: 捨て札から
  triggerFloorSpawn: i => { fx.ring(at.cell(i), C2.violet); },                                          // 4: 空きマスへ置く
  triggerLightningFloorTransform: i => { fx.ring(at.cell(i), '#9b7dff'); fx.burst(at.cell(i), '#ffe27a', 8); }, // 4: 雷撃フロア
  triggerGreenVortexSteal: (t, idx) => { fx.swirl(at.slot(t, idx), C2.green); },                        // 5: 手札を奪う
  triggerWhirlpoolDrain: i => { fx.swirl(at.cell(i), C2.water); fx.ring(at.cell(i), C2.water); },       // 6: 渦に沈む
  triggerTornadoAppear: i => { fx.swirl(at.cell(i), C2.wind); return 500; },                            // 7: 竜巻
  triggerTornadoMove: (a, b) => { fx.swirl(at.cell(a), C2.wind); fx.swirl(at.cell(b), C2.wind); },
  triggerTornadoSettleInPlace: i => { fx.ring(at.cell(i), C2.wind); return 400; },
  triggerWindCellLanding: i => { fx.ring(at.cell(i), C2.wind); return 300; },
  triggerWindCellDissipate: i => { fx.ring(at.cell(i), C2.wind); return 300; },
  // 9: 捨て札の上で発動中 → 連鎖が終わったら山札の上へ(データは先に山札へ移るので、記録では動かさず手で運ぶ)
  triggerDiscardPillarRise: (p, idx, before) => { const card = (before || state.players[p].discard)[idx]; fx.pillar(at.disc(p), C2.sun);
    if(card){ skipMove.add(card.id); activeCard('9:' + p, card, at.disc(p), true); nineCard[p] = card; } return 900; },
  triggerDiscardPillarReturn: p => { const card = nineCard[p]; nineCard[p] = null; dropActive('9:' + p);
    if(card && state.deck.includes(card)){ carryCard(card, at.disc(p), Object.assign({}, at.deck(), { rot:90, w:at.deck() ? at.deck().h : 60, h:at.deck() ? at.deck().w : 84 }), true, false); return 900; } return 300; },
  triggerRedPurpleHandRise: (p, idx) => { fx.ring(at.slot(p, idx), C2.blood); fx.glow(at.slot(p, idx), C2.blood); }, // 10: 手札を捨てさせる
  // 10: 相手の手札のカードが自分の捨て札の上へ来て、そこで発動中(連鎖が終わると捨て札に収まる)
  triggerRedPurpleDiscardArrival: (p, card) => { if(!card) return 300; skipMove.add(card.id);
    const from = lastRect(card), to = at.disc(p);
    carryCard(card, from, to && { x:to.x, y:to.y, w:to.h, h:to.w, rot:90 }, false, true).then(() => activeCard('10:' + p, card, at.disc(p), true)); return 1200; },
  triggerRedPurpleDiscardReturn: p => { dropActive('10:' + p); return 300; },
  triggerBlackEvaporate: i => { fx.swirl(at.cell(i), C2.dark); fx.burst(at.cell(i), C2.dark, 12); },    // J: フロアを手札へ
  // J: フロアのカードが手札のそばへ来て、そこで発動中(連鎖が終わると手札に加わる)
  triggerBlackMistHandAppear: (p, card) => { fx.swirl(at.hand(p), C2.dark); if(!card) return 500; skipMove.add(card.id);
    const to = handDrop(p); carryCard(card, lastRect(card), to, true, true).then(() => activeCard('J:' + p, card, to)); return 1200; },
  triggerBlackMistReturn: p => { dropActive('J:' + p); return 300; },
  triggerHandWipeNebula: p => { fx.swirl(at.hand(p), C2.blood); fx.flash('#3a0016'); },                 // Q: 手札を全部捨てさせる
  triggerDiscardAppearNebula: p => { fx.ring(at.disc(p), C2.blood); return 400; },
  triggerKCrackReveal: i => { fx.crack(at.cell(i), i); },                                               // K: 叩き割って表に
  triggerKDestroy: i => { fx.crack(at.cell(i), i); fx.burst(at.cell(i), '#ff8a3a', 18); },              // K: 壊して捨て札へ
  triggerKShatterSurvive: i => { fx.glow(at.cell(i), '#ff8a3a'); return 500; },
  triggerJokerBarrierBreak: i => { fx.ring(at.cell(i), C2.white, true); fx.burst(at.cell(i), C2.dark, 14); }, // JOKER: フロアを相手の捨て札へ
  triggerScytheSlashHand: (p, idx) => { fx.slash(at.slot(p, idx), C2.white); },                         // JOKER: 手札を斬る
  triggerJokerTopdeckRise: p => { fx.pillar(at.disc(p), C2.white); },                                   // JOKER: 捨て札 → 山札の上
  triggerRemainingDiscardNebula: p => { fx.swirl(at.disc(p), C2.dark); },                               // JOKER: 残りを山札の下へ
};
Object.keys(window).filter(k => /^trigger[A-Z]/.test(k) && typeof window[k] === 'function' && !KEEP.has(k)).forEach(k => {
  const prev = window[k];
  window[k] = function(){
    if(!is2D()) return prev.apply(this, arguments);
    // 効果ごとの簡単な演出(何が起きたかわかる程度)。カードの動きそのものは physical() が出す
    const f = FX[k]; let ms = BEAT[k] != null ? BEAT[k] : 700;
    if(f){ try{ const r = f.apply(null, arguments); if(typeof r === 'number') ms = r; }catch(e){ console.error('[Bind2D]', k, e); } }
    return beat(ms);
  };
});
// 対象のプレイヤーを囲む枠(元はパネルに付けていた)も 2D では出さない
['attachMindFrame', 'detachMindFrame'].forEach(k => { const prev = window[k]; if(typeof prev === 'function') window[k] = function(){ if(!is2D()) return prev.apply(this, arguments); }; });

/* ---- 移動: パーソナルのカードを持ち上げ、経路のマスを1つずつ進んで置く ---- */
function cellBox(i){ const e = document.getElementById('floor-cell-' + i); if(!e) return null; const r = e.getBoundingClientRect(); return { x:r.left + r.width/2, y:r.top + r.height/2, w:r.width, h:r.height }; }
function carry(card, cells, stepMs){
  return trackAnimation(res => {
    const boxes = cells.map(cellBox).filter(Boolean);
    if(boxes.length < 2 || !card){ res(); return; }
    const el = document.createElement('div'); el.className = 'b3-fly b3-carry';
    const A = boxes[0];
    el.appendChild(faceEl(card, true));
    Object.assign(el.style, { left:(A.x - A.w/2) + 'px', top:(A.y - A.h/2) + 'px', width:A.w + 'px', height:A.h + 'px' });
    flyLayer.appendChild(el);
    const kf = [{ transform:'translate(0,0) scale(1)' }];
    boxes.forEach((b, k) => { if(!k) return; const f = k/(boxes.length - 1); kf.push({ transform:`translate(${b.x - A.x}px, ${b.y - A.y - 10}px) scale(1.06)`, offset: Math.max(0.05, f - 0.5/(boxes.length - 1)) }, { transform:`translate(${b.x - A.x}px, ${b.y - A.y}px) scale(1.02)`, offset:f }); });
    kf[kf.length - 1].transform = kf[kf.length - 1].transform.replace('scale(1.02)', 'scale(1)');
    const an = el.animate(kf, { duration: stepMs*(boxes.length - 1), easing:'ease-in-out', fill:'forwards' });
    let done = false; const fin = () => { if(done) return; done = true; res(); setTimeout(() => { try{ el.remove(); }catch(e){} }, 150); };
    an.onfinish = fin; an.oncancel = fin; setTimeout(fin, stepMs*boxes.length + 600);
  });
}
[['triggerMoveTravel', (o, d, p) => {
  let path = typeof shortestFloorPath === 'function' ? shortestFloorPath(o, d, p) : [d];
  if(!path.length && o === d){ const h = neighbors8(o).find(n => { const s = state.floor[n]; return s && (s.owner === null || s.owner === p); }); if(h !== undefined) path = [h, o]; }
  return carry(state.players[p].personalCard, [o, ...path], 620); // 1マスごとに持ち上げて置く(3D の歩きと同じくらいの間合い)
}], ['triggerDualRiftTeleport', (o, d, p) => carry(state.players[p].personalCard, [o, d], 900)], ['triggerTeleport', (o, d, p) => carry(state.players[p].personalCard, [o, d], 900)]].forEach(([k, fn]) => {
  const prev = window[k]; if(typeof prev !== 'function') return;
  window[k] = function(o, d, p){
    if(!is2D()) return prev.apply(this, arguments);
    if(typeof settings !== 'undefined' && settings.moveAnim === false) return Promise.resolve();
    const hide = k !== 'triggerMoveTravel'; // ワープは元の位置を空けて見せる(移動は呼び出し側が隠す)
    if(hide){ travelingOriginIndex = o; render(); }
    return Promise.resolve(fn(o, d, p)).finally(() => { if(hide){ travelingOriginIndex = null; } });
  };
});

/* ---- チェンジ(2D): パーソナルと下のフロアのカードを背中合わせにして、その場でクルッと返す ----
   表 = パーソナルの絵柄、裏 = 下のフロアのカード。返るとパーソナルは裏へ隠れ、下のカードの絵柄が出てくる(入れ替えは同時) */
(() => {
  const prev = window.triggerChangeFlip; if(typeof prev !== 'function') return;
  window.triggerChangeFlip = function(cell, oldCard, newCard, p){
    if(!is2D()) return prev.apply(this, arguments);
    if(typeof settings !== 'undefined' && settings.moveAnim === false) return Promise.resolve();
    return trackAnimation(res => {
      const b = cellBox(cell);
      if(!b || !oldCard || !newCard){ res(); return; }
      skipMove.add(oldCard.id); skipMove.add(newCard.id); // 入れ替えはこの動きで見せる(居場所の記録では動かさない)
      const el = document.createElement('div'); el.className = 'b3-fly b3-swap';
      Object.assign(el.style, { left:(b.x - b.w/2) + 'px', top:(b.y - b.h/2) + 'px', width:b.w + 'px', height:b.h + 'px' });
      const inner = document.createElement('div'); inner.className = 'b3-swap-inner';
      const front = faceEl(oldCard, true), back = faceEl(newCard, true);
      front.classList.add('b3-swap-front'); back.classList.add('b3-swap-back');
      inner.appendChild(front); inner.appendChild(back); el.appendChild(inner); flyLayer.appendChild(el);
      if(typeof animatingCellIndices !== 'undefined'){ animatingCellIndices.add(cell); render(); } // 下のマスは空けておく(重なって見えないように)
      inner.animate([{ transform:'translateY(0) rotateY(0deg) scale(1)' }, { transform:'translateY(-16px) rotateY(90deg) scale(1.12)', offset:0.5 }, { transform:'translateY(0) rotateY(180deg) scale(1)' }],
        { duration:950, delay:250, easing:'cubic-bezier(.5,0,.3,1)', fill:'both' });
      fx.ring(b, '#f0d690');
      let fin = false;
      const done = () => { if(fin) return; fin = true;
        if(typeof animatingCellIndices !== 'undefined') animatingCellIndices.delete(cell);
        res(); setTimeout(() => { try{ el.remove(); }catch(e){} }, 120); }; // 呼び出し側がこの後すぐ入れ替えて描き直す
      setTimeout(done, 1350);
    });
  };
})();

/* ---- 効果の発動を告げる(2D): どのカードの何の効果かを、カードと説明で少しの間見せてから効果を始める ---- */
const banner = document.createElement('div'); banner.id = 'b3-banner'; document.body.appendChild(banner);
let bannerT = 0;
function announce(card, title, text, p){
  banner.innerHTML = '';
  if(card){ const c = cardStatic(card, 'b3-banner-card'); banner.appendChild(c); }
  const t = document.createElement('div'); t.className = 'b3-banner-text';
  const who = state && state.players && state.players[p] ? (p === bottomP() ? 'あなた' : state.players[p].name) : '';
  t.innerHTML = `<div class="b3-banner-who">${who}</div><div class="b3-banner-title"></div><div class="b3-banner-desc"></div>`;
  t.querySelector('.b3-banner-title').textContent = title; t.querySelector('.b3-banner-desc').textContent = text || '';
  banner.appendChild(t);
  // 盤面の右の空いているところに出す(盤面を隠さない)。右が狭いときは盤面の上の中央
  const g = document.getElementById('floor-grid-el'), gr = g && g.getBoundingClientRect();
  if(gr && innerWidth - gr.right > 300){ banner.style.left = (gr.right + 24) + 'px'; banner.style.top = (gr.top + gr.height*0.35) + 'px'; banner.classList.add('side'); }
  else { banner.style.left = ''; banner.style.top = ''; banner.classList.remove('side'); }
  banner.classList.remove('show'); void banner.offsetWidth; banner.classList.add('show');
  clearTimeout(bannerT); bannerT = setTimeout(() => banner.classList.remove('show'), 2600);
}
const EFX = () => window.BIND_EFFECTS || { number:[], suit:[] };
const SUITN = { H:'ハート', S:'スペード', D:'ダイヤ', C:'クラブ' };
const SUITM = { H:'♥', S:'♠', D:'♦', C:'♣' };
const PAUSE = 1100; // 効果を告げてから始めるまで(一つ一つでしっかり止まる)
[['triggerNumberEffect', (rank, p) => { const e = EFX().number.find(x => x.key === rank) || {}; const pc = state.players[p] && state.players[p].personalCard;
    announce(pc && pc.rank === rank ? pc : { suit:'S', rank, id:'b3-banner-' + rank }, `${e.label || rank} の効果`, e.text, p); }],
 ['triggerSuitEffect', (suit, p) => { const e = EFX().suit.find(x => x.key === suit) || {}; announce(null, `${SUITM[suit] || ''} ${SUITN[suit] || suit}の効果`, e.text, p); }],
 ['triggerCardNumberEffect', (card, p) => { if(!card || card.suit !== 'JOKER') return false; const e = EFX().number.find(x => x.key === 'JOKER' || x.label === 'JOKER') || {}; announce(card, 'JOKER の効果', e.text, p); }],
].forEach(([k, show]) => {
  const prev = window[k]; if(typeof prev !== 'function') return;
  window[k] = async function(){
    if(is2D() && state && !state.gameOver){
      let shown = true;
      try{ shown = show.apply(null, arguments) !== false; }catch(e){ console.error('[Bind2D]', e); }
      if(shown) await beat(PAUSE);
    }
    return prev.apply(this, arguments);
  };
});

/* ---- 何が起きたか(2D・3D): ゲームのログの文を、画面の左下に流す。新しい行ほど明るく、しばらくすると消える ---- */
const feed = document.createElement('div'); feed.id = 'b3-feed'; document.body.appendChild(feed);
(() => {
  const prev = window.log; if(typeof prev !== 'function') return;
  window.log = function(msg){
    const r = prev.apply(this, arguments);
    try{
      if(typeof msg === 'string' && msg.trim()){
        const line = document.createElement('div'); line.className = 'b3-feed-line' + (/^---/.test(msg) ? ' turn' : '');
        line.textContent = msg.replace(/^-+\s*|\s*-+$/g, '');
        feed.appendChild(line);
        while(feed.children.length > 6) feed.firstChild.remove();
        setTimeout(() => { line.classList.add('old'); }, 7000);
        setTimeout(() => { try{ line.remove(); }catch(e){} }, 9000);
      }
    }catch(e){}
    return r;
  };
})();
// 対局の外(スタート画面など)では出さない
(function feedVis(){ requestAnimationFrame(feedVis); const on = typeof state !== 'undefined' && state && state.players && !document.querySelector('.start-screen'); feed.style.display = on ? '' : 'none'; })();

const origRender = window.render;
window.render = function(){
  const r = origRender.apply(this, arguments);
  try{ dress(); drawTable(); physical(); }catch(e){ console.error('[Bind2D]', e); }
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
