// 元のゲーム(src/original/bind_prototype.html)のルール部分だけを取り出し、画面なしで動く独立したエンジンを作る。
// ・ブラウザ版(build.mjs が src/cpu_engine.gen.js を生成)と Node の対戦検証の両方で同じ取り出し方を使う。
// ・演出関数(trigger*)は含めないので、元のコードの「typeof trigger…==='function'」の分岐で演出が飛ばされる。
// ・setTimeout は即時実行に置き換える(待ち時間なしで最後まで進む)。
const fs = require('fs'), path = require('path');
const START = "const SUITS = ['H','S','D','C'];";
const END = '/* ===================== UI レンダリング';
function engineSource(html){
  const a = html.indexOf(START), b = html.indexOf(END);
  if(a < 0 || b < 0 || b < a) throw new Error('engine markers not found in bind_prototype.html');
  return html.slice(a, b);
}
// エンジン本体を関数で包む。hooks.render は ask() のたびに呼ばれる(自動応答に使う)
// 元のコードが typeof で存在を確かめている名前(演出関数など)のうち、ルール部分の中で定義されていないもの。
// ブラウザでは画面側の同名の関数(本物の演出)が見えてしまうため、写しの中では undefined で覆い隠す。
function shadowNames(body){
  const names = new Set();
  for(const m of body.matchAll(/typeof\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  const declared = n => new RegExp('(?:function\\s+|(?:let|const|var)\\s+)' + n + '\\b').test(body);
  return [...names].filter(n => !declared(n) && !['render', 'setTimeout', 'clearTimeout'].includes(n));
}
function factorySource(body){
  const hide = shadowNames(body);
  return `(function(hooks){
  'use strict';
  ${hide.length ? 'const ' + hide.map(n => n + ' = undefined').join(', ') + ';' : ''}
  const render = function(){ if(hooks && hooks.render) hooks.render(); };
  const setTimeout = function(f){ f(); return 0; };
  const clearTimeout = function(){};
  ${body}
  return {
    get state(){ return state; }, set state(v){ state = v; },
    get known(){ return knownFloorCards; }, set known(v){ knownFloorCards = v; },
    initGame, doDraw, canPlayerMoveAtAll, reachableAfterSteps, moveSelectDiscard, moveExecuteDestination,
    handEffectSkip, handEffectDiscard, resolveTask, setupChooseHandCard, setupPlaceOnCell, forbiddenBySetup,
    cpuDoSetup, cpuDoMove, cpuDoHandEffect, cpuAnswerTask, cardValue, neighbors8, rc, idx, emptySlots, cardLabel,
    CELLS, ROWS, COLS,
  };
})`;
}
function loadFactory(){
  const html = fs.readFileSync(path.join(__dirname, '../../src/original/bind_prototype.html'), 'utf8');
  return eval(factorySource(engineSource(html)));
}
module.exports = { engineSource, factorySource, loadFactory, shadowNames };
