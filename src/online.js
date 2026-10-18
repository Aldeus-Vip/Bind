/* =====================================================================
   Bind オンライン対戦
   - 方式: 入力同期(ロックステップ)。両者が同じ乱数シードで initGame し、
     「手番のプレイヤーの操作」だけを相手へ送って、同じ関数を同じ順で実行する。
     ゲームロジック(src/original)には手を入れない。
   - 通信: PeerJS(WebRTC の P2P)。ゲームサーバーは不要。
     ?transport=bc を付けると BroadcastChannel(同じブラウザ内のタブ間)で動く(テスト用)。
   - 同期ずれ検出: 入力待ちになるたびに state のハッシュを送り合って比較する。
   ===================================================================== */
(function(){
'use strict';

const PROTO = 1;
const PEER_PREFIX = 'bind3d-r-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const params = new URLSearchParams(location.search);

const NET = {
  active: false,     // オンライン対戦中
  me: null,          // 自分のプレイヤー番号(0=先攻 / 1=後攻)
  isHost: false,
  code: null,
  transport: null,
  connected: false,
  remote: false,     // 相手の操作を実行中
  queue: [],         // 届いた相手の操作(実行待ち)
  applied: 0,        // 実行した操作の数(自分+相手)
  hashes: {},        // applied → 入力待ち時点の state ハッシュ
  remoteHashes: {},
  desync: null,
  status: '',
  bot: params.get('bot')==='1', // テスト用: 自分の手番を CPU ロジックに打たせる
};
window.BindNet = NET;

/* ---------------- 乱数(シード付き) ---------------- */
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---------------- 通信路 ---------------- */
function peerTransport(code, isHost, h){
  if(typeof Peer==='undefined') throw new Error('PeerJS が読み込めませんでした');
  let conn = null;
  const peer = isHost ? new Peer(PEER_PREFIX + code) : new Peer();
  const bind = c => {
    if(conn && conn.open){ c.close(); return; } // 3人目は断る
    conn = c;
    c.on('open', () => h.open());
    c.on('data', d => h.data(d));
    c.on('close', () => h.close());
    c.on('error', e => h.error(e));
  };
  peer.on('open', () => {
    if(isHost) h.waiting();
    else bind(peer.connect(PEER_PREFIX + code, { reliable:true, serialization:'json' }));
  });
  if(isHost) peer.on('connection', bind);
  peer.on('error', e => h.error(e));
  peer.on('disconnected', () => { if(!peer.destroyed) peer.reconnect(); });
  return {
    send(m){ if(conn && conn.open) conn.send(m); },
    close(){ try{ peer.destroy(); }catch(e){} },
  };
}

function bcTransport(code, isHost, h){
  const bc = new BroadcastChannel('bind3d-' + code);
  const id = Math.random().toString(36).slice(2);
  let other = null, timer = null;
  bc.onmessage = ev => {
    const m = ev.data;
    if(!m || m.from===id) return;
    if(m.kind==='hello' && isHost && !other){ other = m.from; bc.postMessage({ from:id, to:other, kind:'welcome' }); h.open(); return; }
    if(m.kind==='welcome' && !isHost && !other && m.to===id){ other = m.from; clearInterval(timer); h.open(); return; }
    if(m.kind==='msg' && m.from===other) h.data(m.body);
    if(m.kind==='bye' && m.from===other) h.close();
  };
  if(isHost) setTimeout(() => h.waiting(), 0);
  else { const hello = () => bc.postMessage({ from:id, kind:'hello' }); hello(); timer = setInterval(hello, 300); }
  return {
    send(body){ bc.postMessage({ from:id, kind:'msg', body }); },
    close(){ clearInterval(timer); try{ bc.postMessage({ from:id, kind:'bye' }); bc.close(); }catch(e){} },
  };
}

function newCode(){ let c = ''; for(let i=0;i<6;i++) c += CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]; return c; }

function connect(code, isHost){
  leave(true);
  NET.code = code; NET.isHost = isHost; NET.connected = false;
  setStatus(isHost ? 'ルームを準備しています…' : `ルーム ${code} に接続しています…`);
  const handlers = {
    waiting(){ setStatus(`ルーム ${code} を作りました。相手の参加を待っています…`, true); },
    open(){
      NET.connected = true;
      if(isHost) setStatus('相手が参加しました。対戦を始めます…');
      else { setStatus('接続しました。開始を待っています…'); send({ t:'hello', v:PROTO }); }
    },
    data: onMessage,
    close(){
      NET.connected = false;
      if(NET.active) showBanner('相手との接続が切れました。', true);
      else setStatus('接続が切れました。');
    },
    error(e){
      const type = e && e.type;
      if(type==='unavailable-id' && isHost){ connect(newCode(), true); return; }
      if(type==='peer-unavailable') setStatus(`ルーム ${code} が見つかりません。コードを確認してください。`);
      else setStatus('通信エラー: ' + (type || (e && e.message) || e));
      if(NET.active) showBanner('通信エラーが発生しました。', true);
    },
  };
  try{
    NET.transport = (params.get('transport')==='bc' ? bcTransport : peerTransport)(code, isHost, handlers);
  }catch(e){ setStatus(e.message); }
}

function leave(silent){
  if(NET.transport){ try{ send({ t:'bye' }); }catch(e){} NET.transport.close(); }
  NET.transport = null; NET.connected = false; NET.active = false;
  NET.queue = []; NET.code = null;
  document.body.classList.remove('online');
  hideBanner(); updateBar();
  if(!silent){ setStatus(''); state = null; render(); }
}

function send(m){ if(NET.transport) NET.transport.send(m); }
function sendColor(){ const u = window.B3UI; if(NET.active && u && u.opt) send({ t:'color', c:u.opt.color }); }

/* ---------------- 対戦の開始 ---------------- */
function hostStart(){
  const seed = (Math.random()*0x100000000) >>> 0;
  const hostIndex = Math.random() < 0.5 ? 0 : 1; // 先攻・後攻はランダム
  send({ t:'start', v:PROTO, seed, hostIndex });
  startGame(seed, hostIndex);
}

function startGame(seed, myIndex){
  NET.me = myIndex; NET.active = true;
  NET.queue = []; NET.applied = 0; NET.hashes = {}; NET.remoteHashes = {}; NET.desync = null;
  document.body.classList.add('online');
  hideBanner();
  const rnd = Math.random;
  Math.random = mulberry32(seed); // initGame 内のシャッフルだけをシード付きにする
  try{ initGame(false); } finally { Math.random = rnd; }
  // 表示: 相手を「CPU 扱い」にすると、元の UI が相手の手札と操作を隠してくれる
  state.vsCPU = true;
  state.cpuIndex = NET.bot ? NET.me : 1 - NET.me;
  state.cpuLevel = 'easy';
  state.players[NET.me].name = 'あなた';
  state.players[1 - NET.me].name = '相手';
  log(`オンライン対戦: あなたは${NET.me===0 ? '先攻' : '後攻'}です。`);
  sendColor(); // 自分の色を相手へ(見た目だけ。盤面の同期には関係しない)
  setStatus('');
  updateBar();
  render();
}

function onMessage(m){
  if(!m || typeof m!=='object') return;
  switch(m.t){
    case 'hello':
      if(!NET.isHost) return;
      if(m.v!==PROTO){ send({ t:'error', msg:'バージョンが違います。ページを再読み込みしてください。' }); return; }
      hostStart();
      break;
    case 'start':
      if(NET.isHost) return;
      if(m.v!==PROTO){ setStatus('バージョンが違います。ページを再読み込みしてください。'); return; }
      startGame(m.seed, 1 - m.hostIndex);
      break;
    case 'act':
      NET.queue.push(m);
      pump();
      break;
    case 'hash':
      NET.remoteHashes[m.n] = m.h;
      checkHash(m.n);
      break;
    case 'rematch':
      if(NET.isHost) hostStart();
      else showBanner('相手が再戦を希望しています。', false);
      break;
    case 'bye':
      NET.connected = false;
      if(NET.active) showBanner('相手が退出しました。', true);
      break;
    case 'color':
      NET.peerColor = m.c;
      if(NET.active) render();
      break;
    case 'error':
      setStatus(m.msg); showBanner(m.msg, true);
      break;
  }
}

/* ---------------- 操作の同期 ---------------- */
// 手番(操作できる人)。setup 中は配置中のプレイヤー、それ以外は state.current。
// 元のロジックでは ask() はすべて手番のプレイヤーが答える(CPU ロジックも同じ前提)。
function actor(){
  if(!state || state.gameOver) return null;
  return state.phase==='setup-personal' ? state.setupPlayer : state.current;
}

// 各操作が「今受け付けられる状態か」。演出中(animationsInFlight>0)は受け付けない(CPU と同じ規則)。
const READY = {
  setupChooseHandCard: () => state.phase==='setup-personal' && (!state.task || state.task.type==='setup-place'),
  setupPlaceOnCell:    () => !!state.task && state.task.type==='setup-place',
  doDraw:              () => state.phase==='draw' && !state.task,
  moveSelectDiscard:   () => state.phase==='move' && (!state.task || state.task.type==='move-destination'),
  moveExecuteDestination: () => !!state.task && state.task.type==='move-destination',
  handEffectSkip:      () => state.phase==='hand-effect' && !state.task,
  handEffectDiscard:   () => state.phase==='hand-effect' && !state.task,
  resolveTask:         () => !!state.task && !!state.task.resolve,
};
function ready(fn){
  return !!state && !state.gameOver && animationsInFlight===0 && READY[fn]();
}
function waitingForInput(){
  return Object.keys(READY).some(fn => fn!=='setupChooseHandCard' && fn!=='moveSelectDiscard' && ready(fn))
    || (state && state.phase==='setup-personal' && !state.task && animationsInFlight===0);
}

// カードのオブジェクトは id で送り、受け取った側で同じ id のオブジェクトに戻す。
function encode(v){
  if(Array.isArray(v)) return v.map(encode);
  if(v && typeof v==='object' && v.id && ('suit' in v)) return { __card: v.id };
  return v;
}
function findCard(id){
  const all = [state.deck, ...state.players.flatMap(p => [p.hand, p.discard, [p.personalCard]]), state.floor.map(f => f && f.card)];
  for(const arr of all) for(const c of arr) if(c && c.id===id) return c;
  return null;
}
function decode(v){
  if(Array.isArray(v)) return v.map(decode);
  if(v && typeof v==='object' && v.__card) return findCard(v.__card);
  return v;
}

function wrap(name){
  const orig = window[name];
  if(typeof orig!=='function') return;
  window[name] = function(...args){
    if(!NET.active || NET.remote) return orig.apply(this, args);
    if(actor()!==NET.me) return;            // 相手の手番
    if(NET.queue.length) return;            // 相手の操作をまだ再生中
    if(!ready(name)) return;                // 演出中・受付外
    snapHash(NET.applied);
    NET.applied++;
    send({ t:'act', n:NET.applied, fn:name, args:encode(args) });
    return orig.apply(this, args);
  };
}
Object.keys(READY).forEach(wrap);

function pump(){
  if(!NET.active) return;
  while(NET.queue.length){
    const a = NET.queue[0];
    if(a.n !== NET.applied + 1){ desync(`操作の順番が合いません(期待 ${NET.applied+1} / 受信 ${a.n})`); NET.queue = []; return; }
    if(actor()===NET.me || !ready(a.fn)) return; // 受け付けられるまで待つ
    NET.queue.shift();
    snapHash(NET.applied);
    NET.applied++;
    NET.remote = true;
    try{ window[a.fn](...decode(a.args)); }
    catch(e){ console.error('[BindNet] 相手の操作の実行に失敗', a, e); }
    finally{ NET.remote = false; }
  }
}

/* ---------------- 同期ずれの検出 ---------------- */
function stateHash(){
  const cid = c => c ? c.id : '-';
  const snap = {
    f: state.floor.map(f => f ? [cid(f.card), f.faceUp?1:0, f.owner, f.debuff||0, f.buff||0, f.windCell?1:0] : 0),
    p: state.players.map(p => [p.hand.map(cid), p.discard.map(cid), p.personalIndex, cid(p.personalCard), p.bound?1:0, p.extraTurn?1:0]),
    d: state.deck.map(cid),
    c: state.current, ph: state.phase, sp: state.setupPlayer, go: state.gameOver?1:0,
    t: state.task ? [state.task.type||'', state.task.kind||'', state.task.tag||''] : 0,
    w: [...(state.windCells||[])].sort(), l: [...(state.lockedCells||[])].sort(),
  };
  const s = JSON.stringify(snap);
  let h = 0x811c9dc5;
  for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}
// 操作を実行する直前(= 両者とも同じ「入力待ち」の状態)の盤面ハッシュを記録して送る。
// 以前は一定間隔で「入力待ちに見えたら」記録していたが、演出の切れ目で一瞬だけ入力待ちに見えると
// 両者で記録する瞬間がずれ、実際には一致しているのに同期ずれと判定されることがあった。
function snapHash(n){
  if(n in NET.hashes) return;
  NET.hashes[n] = stateHash();
  send({ t:'hash', n, h:NET.hashes[n] });
  checkHash(n);
}
// 終局時(これ以上操作が来ない)だけは間隔で記録する
function recordHash(){
  if(!NET.active || !state || NET.queue.length || !state.gameOver) return;
  snapHash(NET.applied);
}
function checkHash(n){
  if(n in NET.hashes && n in NET.remoteHashes && NET.hashes[n]!==NET.remoteHashes[n]) desync(`盤面が一致しません(操作 ${n} 回目の後)`);
}
function desync(msg){
  if(NET.desync) return;
  NET.desync = msg;
  console.error('[BindNet] 同期ずれ:', msg);
  showBanner('同期ずれ: ' + msg, true);
}

setInterval(() => { pump(); recordHash(); }, 60);

/* ---------------- 表示の調整 ---------------- */
// CPU を止める(テスト用の bot モードでは自分の手番だけ CPU に打たせる)
const origCpuMaybeAct = window.cpuMaybeAct;
window.cpuMaybeAct = function(){
  if(NET.active && (!NET.bot || NET.queue.length)) return;
  return origCpuMaybeAct.apply(this, arguments);
};

// 自分の手札は相手の手番中も見えるようにし、相手の手札タブは出さない
const origHand = window.renderHandSection;
window.renderHandSection = function(){
  if(!NET.active || NET.bot) return origHand.apply(this, arguments);
  selectedHandTab = NET.me;
  if(state.current===NET.me) return origHand.apply(this, arguments);
  const pl = state.players[NET.me];
  return el('div', { class:'hand-section' },
    el('h3', {}, `あなたの手札(${pl.hand.length}枚)`),
    el('div', { class:'hand-row' }, ...pl.hand.map(c => cardStatic(c))));
};

// 元の UI の「CPU」表記を「相手」に
function relabel(node){
  const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for(let n; (n = w.nextNode());) if(n.nodeValue.includes('CPU')) n.nodeValue = n.nodeValue.replace(/CPU/g, '相手');
}

// スタート画面にオンライン対戦の欄を追加
const origStart = window.renderStartScreen;
window.renderStartScreen = function(){
  const scr = origStart.apply(this, arguments);
  if(pendingCpuLevel) return scr;
  const input = el('input', { class:'online-code', maxlength:'6', placeholder:'ルームコード', autocomplete:'off', spellcheck:'false' });
  if(NET.pendingCode) input.value = NET.pendingCode;
  input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); NET.pendingCode = input.value; });
  const panel = el('div', { class:'online-panel' },
    el('h3', {}, 'オンライン対戦'),
    el('div', { class:'online-row' },
      el('button', { class:'btn primary', onclick: () => connect(newCode(), true) }, 'ルームを作る'),
    ),
    el('div', { class:'online-row' },
      input,
      el('button', { class:'btn', onclick: () => { const c = input.value.trim(); if(c.length===6) connect(c, false); else setStatus('6文字のルームコードを入力してください。'); } }, '参加する'),
    ),
    el('div', { class:'online-status', id:'online-status' }, NET.status || ''),
    NET.shareUrl ? el('div', { class:'online-share' },
      el('input', { class:'online-link', readonly:'readonly', value:NET.shareUrl }),
      el('button', { class:'btn', onclick: () => { navigator.clipboard && navigator.clipboard.writeText(NET.shareUrl); setStatus('招待リンクをコピーしました。相手に送ってください。', true); } }, 'リンクをコピー'),
    ) : null,
  );
  scr.appendChild(panel);
  return scr;
};

// ゲーム終了画面: 再戦とロビーへ戻る
const origOver = window.renderGameOver;
window.renderGameOver = function(){
  const scr = origOver.apply(this, arguments);
  if(!NET.active) return scr;
  scr.querySelectorAll('button').forEach(b => { if(b.textContent.includes('新しいゲーム')) b.remove(); });
  const row = el('div', { class:'online-row' },
    el('button', { class:'btn primary', onclick: rematch }, '再戦する'),
    el('button', { class:'btn', onclick: () => leave(false) }, 'タイトルへ戻る'),
  );
  scr.insertBefore(row, scr.querySelector('.floor-grid') || null);
  return scr;
};

const origRender = window.render;
window.render = function(){
  const r = origRender.apply(this, arguments);
  if(NET.active && !NET.bot){
    const app = document.getElementById('app');
    if(app) relabel(app);
    document.body.classList.toggle('online-my-turn', actor()===NET.me);
  }
  updateBar();
  return r;
};

function setStatus(msg, withShare){
  NET.status = msg;
  NET.shareUrl = withShare && NET.isHost && NET.code
    ? location.origin + location.pathname + '?room=' + NET.code + (params.get('transport') ? '&transport=' + params.get('transport') : '')
    : (withShare ? NET.shareUrl : null);
  const s = document.getElementById('online-status');
  if(!state && typeof render==='function') render();
  else if(s) s.textContent = msg;
}

/* ---------------- 上部のオンライン表示 ---------------- */
let bar = null, banner = null;
function updateBar(){
  if(!bar){
    bar = document.createElement('div'); bar.id = 'online-bar';
    document.body.appendChild(bar);
  }
  if(!NET.active){ bar.style.display = 'none'; return; }
  bar.style.display = '';
  const turn = state && !state.gameOver ? (actor()===NET.me ? 'あなたの手番' : '相手の手番') : '';
  bar.innerHTML = '';
  bar.appendChild(el('span', { class:'online-dot ' + (NET.connected ? 'ok' : 'ng') }));
  bar.appendChild(el('span', {}, `ルーム ${NET.code||''} ・ ${NET.me===0 ? '先攻' : '後攻'}${turn ? ' ・ ' + turn : ''}`));
  bar.appendChild(el('button', { class:'online-leave', onclick: () => { if(confirm('対戦から退出しますか?')) leave(false); } }, '退出'));
}
function showBanner(msg, withLeave){
  hideBanner();
  banner = el('div', { id:'online-banner' }, el('span', {}, msg),
    withLeave ? el('button', { class:'btn', onclick: () => leave(false) }, 'タイトルへ戻る') : null,
    el('button', { class:'btn', onclick: hideBanner }, '閉じる'));
  document.body.appendChild(banner);
}
function hideBanner(){ if(banner){ banner.remove(); banner = null; } }

// 招待リンク(?room=XXXXXX)から開いたら自動で参加
const autoRoom = (params.get('room') || '').toUpperCase();
if(/^[A-Z0-9]{6}$/.test(autoRoom)) setTimeout(() => connect(autoRoom, false), 300);
window.addEventListener('beforeunload', () => { if(NET.transport) NET.transport.close(); });

function rematch(){
  if(!NET.connected) return;
  if(NET.isHost) hostStart();
  else { send({ t:'rematch' }); showBanner('再戦を申し込みました。', false); }
}

NET.sendColor = sendColor;
NET.connect = connect; NET.leave = leave; NET.rematch = rematch; NET.hash = stateHash; NET.newCode = newCode;
})();
