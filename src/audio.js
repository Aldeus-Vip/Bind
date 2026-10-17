/* =====================================================================
   サウンド(効果音・BGM)— すべて Web Audio でその場で合成する(音源ファイル不要)
   - 演出の関数(trigger*)が始まる瞬間に、その内容に合った効果音を鳴らす(2D/3D どちらでも)
   - BGM: 暗めの幻想的な和音(ゆっくり移り変わる)に、ときどき鈴の音
   - 設定: 設定画面で BGM / 効果音の音量。上部の「音」ボタンでミュート
   - ブラウザの制限で、最初にどこかをクリックするまでは鳴らない
   - 後で音源ファイルに差し替えられるよう、音は名前(SFX のキー)で呼ぶ
   ===================================================================== */
(function(){
'use strict';
const AC = window.AudioContext || window.webkitAudioContext;
if(!AC) return;
const LS = 'bind-audio';
const opt = (() => { try{ return Object.assign({ bgm:0.35, sfx:0.7, mute:false }, JSON.parse(localStorage.getItem(LS) || '{}')); }catch(e){ return { bgm:0.35, sfx:0.7, mute:false }; } })();
const save = () => { try{ localStorage.setItem(LS, JSON.stringify(opt)); }catch(e){} };

let ctx = null, master, sfxBus, bgmBus, verb, noiseBuf;
function init(){
  if(ctx) return true;
  try{ ctx = new AC(); }catch(e){ return false; }
  master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ctx.destination);
  sfxBus = ctx.createGain(); bgmBus = ctx.createGain();
  sfxBus.connect(master); bgmBus.connect(master);
  // 残響(合成したインパルス応答)
  verb = ctx.createConvolver();
  const len = ctx.sampleRate*2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for(let c=0;c<2;c++){ const d = ir.getChannelData(c); for(let i=0;i<len;i++) d[i] = (Math.random()*2 - 1)*Math.pow(1 - i/len, 2.6); }
  verb.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.32; verb.connect(wet); wet.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate*2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0); for(let i=0;i<nd.length;i++) nd[i] = Math.random()*2 - 1;
  applyVolume();
  return true;
}
function applyVolume(){
  if(!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(opt.mute ? 0 : 1, t, 0.05);
  sfxBus.gain.setTargetAtTime(opt.sfx, t, 0.05);
  bgmBus.gain.setTargetAtTime(opt.bgm*0.55, t, 0.2);
}
// 最初の操作で音を有効にする(ブラウザの自動再生の制限)
function unlock(){ if(!init()) return; if(ctx.state === 'suspended') ctx.resume(); startBgm(); }
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture:true }));

/* ---------------- 合成の部品 ---------------- */
const now = () => ctx.currentTime;
function env(g, t, a, peak, d, end){
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, end || 0.0001), t + a + d);
}
function out(node, wet){ node.connect(sfxBus); if(wet) { const w = ctx.createGain(); w.gain.value = wet; node.connect(w); w.connect(verb); } }
// 音程のある音: f0 → f1 へ滑らせる
function tone(o){
  const t = now() + (o.delay || 0);
  const osc = ctx.createOscillator(); osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if(o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.slide || o.d || 0.3));
  if(o.detune) osc.detune.value = o.detune;
  const g = ctx.createGain(); env(g, t, o.a || 0.005, o.v || 0.3, o.d || 0.3);
  let node = osc;
  if(o.lp){ const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); node = f; }
  node.connect(g); out(g, o.wet);
  osc.start(t); osc.stop(t + (o.a || 0.005) + (o.d || 0.3) + 0.05);
}
// ノイズ: フィルタの周波数を f0 → f1 へ動かす(風・水・爆発・斬撃)
function noise(o){
  const t = now() + (o.delay || 0);
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = o.filter || 'bandpass'; f.Q.value = o.q || 1;
  f.frequency.setValueAtTime(o.f || 800, t);
  if(o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + (o.slide || o.d || 0.4));
  const g = ctx.createGain(); env(g, t, o.a || 0.01, o.v || 0.3, o.d || 0.4);
  src.connect(f); f.connect(g); out(g, o.wet);
  src.start(t, Math.random()*1.5); src.stop(t + (o.a || 0.01) + (o.d || 0.4) + 0.05);
}
const chord = (fs, o) => fs.forEach((f, k) => tone(Object.assign({}, o, { f, delay: (o.delay || 0) + k*(o.arp || 0) })));
const N = n => 440*Math.pow(2, (n - 69)/12); // MIDI 番号 → 周波数

/* ---------------- 効果音 ---------------- */
const SFX = {
  click(){ tone({ f:900, f1:600, d:0.05, v:0.08, type:'triangle' }); },
  card(){ noise({ f:3000, f1:1200, d:0.18, v:0.12, q:0.8, filter:'highpass' }); },
  draw(){ noise({ f:2500, f1:5000, d:0.22, v:0.12, filter:'bandpass', q:0.6 }); tone({ f:N(84), d:0.25, v:0.05, wet:0.5 }); },
  hop(){ noise({ f:400, f1:120, d:0.12, v:0.18, filter:'lowpass' }); tone({ f:140, f1:70, d:0.12, v:0.18 }); },
  turn(){ chord([N(69), N(76)], { d:0.9, v:0.08, type:'sine', arp:0.12, wet:0.6 }); },
  flip(){ noise({ f:1800, f1:600, d:0.3, v:0.14, q:1.5 }); tone({ f:N(81), d:0.5, v:0.07, delay:0.25, wet:0.6 }); },
  reveal(){ noise({ f:300, f1:3000, d:0.5, v:0.12 }); chord([N(69), N(73), N(76)], { d:0.9, v:0.06, delay:0.3, arp:0.05, wet:0.7 }); },
  change(){ // 魂が抜け → 沈む → せり上がり → 宿る
    tone({ f:N(72), f1:N(84), d:1.0, v:0.08, type:'sine', wet:0.8 });
    noise({ f:200, f1:60, d:0.8, v:0.25, filter:'lowpass', delay:0.6 });
    tone({ f:60, f1:40, d:0.9, v:0.25, delay:0.6 });
    noise({ f:80, f1:400, d:0.8, v:0.2, filter:'lowpass', delay:1.3 });
    chord([N(72), N(76), N(79), N(84)], { d:1.4, v:0.07, delay:2.0, arp:0.07, wet:0.8 });
  },
  burn(){ noise({ f:900, d:1.6, v:0.25, q:0.5, a:0.2 }); for(let k=0;k<10;k++) noise({ f:3000 + Math.random()*2000, d:0.03, v:0.15, delay:Math.random()*1.4, filter:'highpass' }); tone({ f:80, f1:30, d:1.6, v:0.2, delay:1.4 }); },
  summon(){ noise({ f:200, f1:2400, d:0.6, v:0.12, q:0.7 }); chord([N(62), N(69), N(74)], { d:1.2, v:0.06, delay:0.35, arp:0.06, type:'triangle', wet:0.7 }); },
  thunder(){ noise({ f:6000, f1:800, d:0.15, v:0.5, filter:'highpass' }); noise({ f:400, f1:60, d:1.6, v:0.6, filter:'lowpass', delay:0.05 }); tone({ f:55, f1:30, d:1.2, v:0.35, delay:0.05 }); },
  zap(){ noise({ f:5000, f1:1500, d:0.18, v:0.25, filter:'highpass' }); tone({ f:1200, f1:300, d:0.18, v:0.08, type:'square' }); },
  hammer(){ tone({ f:110, f1:40, d:0.5, v:0.5 }); noise({ f:600, f1:80, d:0.4, v:0.5, filter:'lowpass' }); noise({ f:3000, d:0.08, v:0.2, filter:'highpass', delay:0.02 }); },
  explode(){ noise({ f:200, f1:900, d:0.6, v:0.25, filter:'lowpass', a:0.4 }); tone({ f:70, f1:25, d:1.4, v:0.55, delay:0.6 }); noise({ f:1500, f1:120, d:1.6, v:0.6, filter:'lowpass', delay:0.6 }); for(let k=0;k<8;k++) noise({ f:4000, d:0.04, v:0.12, delay:0.7 + Math.random()*0.8, filter:'highpass' }); },
  crack(){ noise({ f:2500, d:0.08, v:0.2, filter:'highpass' }); noise({ f:1800, d:0.06, v:0.14, filter:'highpass', delay:0.09 }); },
  water(){ noise({ f:400, f1:1400, d:1.4, v:0.25, q:0.6, a:0.3 }); for(let k=0;k<12;k++) tone({ f:600 + Math.random()*900, f1:1500 + Math.random()*800, d:0.06, v:0.05, delay:0.2 + Math.random()*1.3 }); noise({ f:600, f1:150, d:0.6, v:0.25, filter:'lowpass', delay:1.3 }); },
  wind(){ noise({ f:300, f1:1600, d:1.1, v:0.22, q:2.5, a:0.25 }); noise({ f:900, f1:400, d:0.9, v:0.12, q:4, delay:0.4 }); },
  gust(){ noise({ f:500, f1:1200, d:0.5, v:0.12, q:2 }); },
  absorb(){ noise({ f:4000, f1:300, d:1.2, v:0.18, q:1.2, a:0.6 }); tone({ f:N(84), f1:N(60), d:1.2, v:0.06, wet:0.6 }); },
  void(){ tone({ f:45, f1:90, d:0.8, v:0.35, a:0.4 }); noise({ f:200, f1:2000, d:0.8, v:0.12, a:0.5 }); noise({ f:2000, f1:100, d:0.5, v:0.3, delay:1.0, filter:'lowpass' }); tone({ f:120, f1:30, d:0.5, v:0.3, delay:1.0 }); },
  sun(){ chord([N(64), N(71), N(76), N(83)], { d:1.6, v:0.06, arp:0.08, type:'triangle', wet:0.9 }); noise({ f:4000, f1:8000, d:1.0, v:0.05, filter:'highpass' }); },
  rise(){ noise({ f:80, f1:300, d:0.6, v:0.25, filter:'lowpass' }); tone({ f:N(76), d:0.6, v:0.06, delay:0.5, wet:0.6 }); },
  rift(){ tone({ f:N(50), f1:N(62), d:0.6, v:0.15, type:'sawtooth', lp:900 }); noise({ f:1500, f1:300, d:0.5, v:0.12 }); },
  chains(){ for(let k=0;k<6;k++) tone({ f:2200 + Math.random()*1500, d:0.12, v:0.07, type:'triangle', delay:k*0.09 }); noise({ f:3000, f1:5000, d:0.3, v:0.15, filter:'highpass', delay:0.85 }); for(let k=0;k<8;k++) tone({ f:1800 + Math.random()*2500, d:0.15, v:0.06, type:'triangle', delay:0.88 + Math.random()*0.25 }); },
  slash(){ noise({ f:6000, f1:900, d:0.18, v:0.35, q:1.2 }); },
  hiss(){ noise({ f:5000, d:0.7, v:0.12, filter:'highpass', a:0.1 }); },
  swarm(){ for(let k=0;k<3;k++) tone({ f:180 + k*37, d:1.2, v:0.05, type:'sawtooth', lp:900, a:0.2 }); },
  chomp(){ for(let k=0;k<4;k++){ noise({ f:900, d:0.06, v:0.25, filter:'lowpass', delay:k*0.18 }); tone({ f:160, f1:90, d:0.06, v:0.15, delay:k*0.18 }); } },
  flame(){ noise({ f:700, f1:1400, d:0.9, v:0.18, q:0.6, a:0.15 }); tone({ f:N(55), f1:N(58), d:0.9, v:0.05, type:'sawtooth', lp:700 }); },
  shoot(key){ // 飛翔エフェクト(効果ごとに少し音色を変える)
    const k = String(key || '');
    if(k === '8') return SFX.zap();
    if(k === '6') return noise({ f:800, f1:2400, d:0.4, v:0.18, q:2 });
    if(k === '7') return SFX.gust();
    if(k === 'S' || k === '4' || k === 'JOKER') return SFX.slash();
    tone({ f:N(76), f1:N(88), d:0.35, v:0.06, type:'triangle', wet:0.5 }); noise({ f:2000, f1:6000, d:0.3, v:0.08, filter:'highpass' });
  },
  hit(){ noise({ f:1200, f1:200, d:0.3, v:0.25, filter:'lowpass' }); tone({ f:N(81), d:0.4, v:0.05, wet:0.6 }); },
  cast(suit){ // スートの術式
    if(suit === 'H') chord([N(62), N(65), N(69), N(74)], { d:1.2, v:0.06, arp:0.06, type:'sawtooth', lp:1800, wet:0.6 });
    else if(suit === 'S') chord([N(50), N(56), N(62)], { d:1.4, v:0.08, type:'sawtooth', lp:900, wet:0.6 });
    else if(suit === 'D') chord([N(76), N(79), N(83), N(88), N(91)], { d:0.6, v:0.05, arp:0.06, type:'triangle', wet:0.7 });
    else if(suit === 'C') chord([N(79), N(86), N(91), N(98)], { d:1.2, v:0.035, arp:0.12, type:'sine', wet:0.9 });
    noise({ f:200, f1:1500, d:0.8, v:0.06, a:0.3 });
  },
  win(){ chord([N(60), N(64), N(67), N(72), N(76), N(79)], { d:2.2, v:0.06, arp:0.12, type:'triangle', wet:0.9 }); },
  lose(){ chord([N(57), N(53), N(50), N(45)], { d:1.6, v:0.07, arp:0.3, type:'sawtooth', lp:1000, wet:0.8 }); },
};
function play(name, arg){
  if(!ctx || opt.mute || ctx.state !== 'running') return;
  const f = SFX[name]; if(!f) return;
  try{ f(arg); }catch(e){ /* 音のエラーでゲームを止めない */ }
}

/* ---------------- 演出と効果音の対応 ---------------- */
const MAP = {
  triggerMoveTravel: (o, d, p) => { // 経路の歩数だけ跳ねる音
    let n = 1; try{ const path = shortestFloorPath(o, d, p); if(path && path.length) n = Math.max(1, path.length - 1); }catch(e){}
    for(let k=0;k<Math.min(n, 8);k++) setTimeout(() => play('hop'), 160 + k*480);
  },
  triggerChangeFlip: () => play('change'),
  triggerDefeatBurn: () => play('burn'),
  triggerCardFlip: () => play('flip'),
  triggerVortexHide: () => play('flip'),
  triggerMagmaRiseAndCrack: () => play('chains'),
  triggerLightningBoltStrike: () => play('thunder'),
  triggerLightningZap: () => play('zap'),
  triggerLightningFloorTransform: () => play('zap'),
  triggerKCrackReveal: () => play('hammer'),
  triggerKDestroy: () => play('explode'),
  triggerHammerSmash: () => play('explode'),
  triggerKShatterSurvive: () => play('crack'),
  triggerWhirlpoolDrain: () => play('water'),
  triggerTornadoAppear: () => play('wind'),
  triggerTornadoMove: () => play('wind'),
  triggerWindCellLanding: () => play('gust'),
  triggerWindCellDissipate: () => play('gust'),
  triggerBlackEvaporate: () => play('absorb'),
  triggerJokerBarrierBreak: () => play('void'),
  triggerSummon2RiseAndReveal: () => play('summon'),
  triggerSummon2Return: () => play('rise'),
  triggerSunFloorSpawn: () => play('sun'),
  triggerExtraTurnWhiteout: () => play('sun'),
  triggerSunDrawCardAppear: () => play('draw'),
  triggerFloorSpawn: () => play('rise'),
  triggerDiamondCircleSpawn: () => play('rise'),
  triggerDualRiftTeleport: () => play('rift'),
  triggerTeleport: () => play('rift'),
  triggerDrawCardAppear: () => play('draw'),
  triggerVortexDrawCardAppear: () => play('draw'),
  triggerClubDrawAppear: () => play('draw'),
  triggerGreenVortexSteal: () => play('hiss'),
  triggerRedPurpleHandRise: () => play('swarm'),
  triggerHandWipeNebula: () => play('chomp'),
  triggerSpadeSlashHand: () => setTimeout(() => play('slash'), 900),
  triggerScytheSlashHand: () => play('slash'),
  triggerDiscardPillarRise: () => play('flame'),
  triggerBlackMistHandAppear: () => play('draw'),
  triggerDiscardSpinVanish: () => play('card'),
  triggerClubGrowthVanish: () => play('card'),
  triggerDiscardFlipRise: () => play('card'),
  triggerJokerTopdeckRise: () => play('card'),
  triggerRemainingDiscardNebula: () => play('card'),
  triggerSuitEffect: (suit) => play('cast', suit),
  triggerNumberEffect: () => play('summon'),
};
Object.entries(MAP).forEach(([name, fn]) => {
  const orig = window[name];
  if(typeof orig !== 'function') return;
  window[name] = function(){ try{ fn.apply(null, arguments); }catch(e){} return orig.apply(this, arguments); };
});
// 飛翔エフェクト(fx3d.js から呼ぶ)
let analyser = null;
window.BindAudio = { play, opt, names: () => Object.keys(SFX),
  // テスト用: 現在の出力の大きさ(RMS)
  level(){ if(!ctx) return -1; if(!analyser){ analyser = ctx.createAnalyser(); analyser.fftSize = 2048; master.connect(analyser); } const a = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(a); let s2 = 0; for(const v of a) s2 += v*v; return Math.sqrt(s2/a.length); },
  get state(){ return ctx ? ctx.state : 'none'; },
  // 確認用: 出力を MediaStream として取り出す(録音して聞く用)
  stream(){ if(!ctx) return null; const d = ctx.createMediaStreamDestination(); master.connect(d); return d.stream; } };

// 手番の交代・勝敗・ボタン
let lastTurn = null, lastOver = false;
const origRender = window.render;
window.render = function(){
  const r = origRender.apply(this, arguments);
  try{
    const st = (typeof state !== 'undefined') ? state : null;
    const turn = st && st.phase !== 'setup-personal' ? st.current : null;
    if(st && !st.gameOver && turn != null && turn !== lastTurn && st.phase === 'draw') play('turn');
    lastTurn = turn;
    if(st && st.gameOver && !lastOver){
      // 自分が負けたか(オンラインは自分、CPU 対戦は人間側、それ以外は勝敗の区別なし)
      const me = window.BindNet && BindNet.active ? BindNet.me : (st.vsCPU ? 1 - st.cpuIndex : null);
      const loser = st.players.findIndex(p => st.winnerMsg && st.winnerMsg.startsWith(p.name));
      play(me != null && loser === me ? 'lose' : 'win');
    }
    lastOver = !!(st && st.gameOver);
  }catch(e){}
  return r;
};
document.addEventListener('click', e => { if(e.target.closest && e.target.closest('button, .card.reachable, .floor-cell.clickable')) play('click'); }, true);

/* ---------------- BGM: ゆっくり移り変わる暗い和音と、ときどき鈴の音 ---------------- */
let bgmOn = false;
const PROG = [ [50, 57, 62, 65], [46, 53, 58, 62], [41, 48, 53, 57], [48, 55, 60, 64] ]; // Dm - B♭ - F - C
const SCALE = [62, 64, 65, 67, 69, 70, 72, 74, 76, 77, 79, 81];
function padChord(notes, t, dur){
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.7;
  const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 0.08; lfoG.gain.value = 250; lfo.connect(lfoG); lfoG.connect(lp.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 2.5); g.gain.setValueAtTime(0.09, t + dur - 2.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
  lp.connect(g); g.connect(bgmBus); const w = ctx.createGain(); w.gain.value = 0.6; g.connect(w); w.connect(verb);
  notes.forEach(n => [-6, 6].forEach(dt => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = N(n); o.detune.value = dt; o.connect(lp); o.start(t); o.stop(t + dur + 0.6); }));
  lfo.start(t); lfo.stop(t + dur + 0.6);
}
function bell(n, t){
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = N(n);
  const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = N(n)*2.76;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
  const g2 = ctx.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(g);
  o.connect(g); g.connect(bgmBus); const w = ctx.createGain(); w.gain.value = 0.9; g.connect(w); w.connect(verb);
  o.start(t); o2.start(t); o.stop(t + 3.1); o2.stop(t + 3.1);
}
let nextAt = 0, step = 0;
function schedule(){
  if(!bgmOn || !ctx) return;
  const DUR = 9;
  while(nextAt < ctx.currentTime + 4){
    padChord(PROG[step % PROG.length], nextAt, DUR);
    const nb = 2 + Math.floor(Math.random()*3);
    for(let k=0;k<nb;k++) bell(SCALE[Math.floor(Math.random()*SCALE.length)], nextAt + 1 + Math.random()*(DUR - 2));
    nextAt += DUR - 3; step++; // 前の和音と3秒重ねて、途切れずに移り変わる
  }
  setTimeout(schedule, 1000);
}
function startBgm(){ if(bgmOn || !ctx) return; bgmOn = true; nextAt = ctx.currentTime + 0.2; schedule(); }

/* ---------------- 設定・ミュート ---------------- */
const origSettings = window.renderSettingsContent;
if(typeof origSettings === 'function'){
  window.renderSettingsContent = function(){
    origSettings.apply(this, arguments);
    const c = document.getElementById('settings-content'); if(!c) return;
    c.appendChild(el('h2', {}, 'サウンド'));
    const slider = (label, key) => {
      const s = el('input', { type:'range', min:'0', max:'1', step:'0.05' }); s.value = opt[key];
      const v = el('span', { class:'settings-desc' }, Math.round(opt[key]*100) + '%');
      s.addEventListener('input', () => { opt[key] = Number(s.value); v.textContent = Math.round(opt[key]*100) + '%'; applyVolume(); save(); if(key === 'sfx') play('click'); });
      return el('label', { class:'settings-row' }, el('div', {}, el('div', { class:'settings-label' }, label), s, v));
    };
    c.appendChild(slider('BGM の音量', 'bgm'));
    c.appendChild(slider('効果音の音量', 'sfx'));
  };
}
function addMuteButton(){
  const bar = document.getElementById('top-buttons-bar');
  if(!bar || document.getElementById('sound-btn')) return;
  const b = document.createElement('button'); b.id = 'sound-btn';
  const label = () => { b.textContent = opt.mute ? '音 OFF' : '音 ON'; };
  label();
  b.onclick = () => { opt.mute = !opt.mute; label(); save(); unlock(); applyVolume(); };
  bar.insertBefore(b, bar.firstChild);
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addMuteButton); else addMuteButton();
})();
