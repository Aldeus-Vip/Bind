// つよい / 最強AI を対戦場(arena.js)に登録する
const { addPolicy, F } = require('./arena');
const AI = require('../../src/cpu_ai.js');

function aiPolicy(level, opt = {}){
  const ai = AI.createAI(F, Object.assign({ level }, opt));
  const seen = new Set();
  const oracle = level === 'oracle' || opt.oracle;
  let me = null;
  const kn = st => AI.makeKnowledge(st, me, seen, oracle);
  return {
    name: level,
    observe(st, known){ if(me !== null) AI.observe(st, me, seen, known); },
    setup(eng, p){
      me = p; AI.observe(eng.state, me, seen, eng.known);
      const d = ai.decideSetup(eng.state, p);
      eng.setupChooseHandCard(d.cardIdx); eng.setupPlaceOnCell(d.cell);
    },
    async move(eng, p){
      me = p; AI.observe(eng.state, me, seen, eng.known);
      const m = await ai.decideMove(eng.state, p, kn(eng.state));
      if(!m) return;
      eng.moveSelectDiscard(m.cardIdx);
      const t = eng.state.task;
      if(eng.state.phase === 'move' && t && t.type === 'move-destination'){
        let d = m.dest;
        if(!t.reachable.has(d)) d = t.reachable.values().next().value;
        return eng.moveExecuteDestination(d);
      }
    },
    async hand(eng, p){
      me = p; AI.observe(eng.state, me, seen, eng.known);
      const h = await ai.decideHand(eng.state, p, kn(eng.state));
      return h === null ? eng.handEffectSkip() : eng.handEffectDiscard(h);
    },
    answer(eng, p, t){
      me = p;
      let a;
      try{ a = ai.answer(eng.state, t, p, kn(eng.state)); }catch(e){ console.error('answer error', t.tag, e.message); a = null; }
      eng.resolveTask(a);
    },
  };
}
addPolicy('strong1', () => aiPolicy('strong'));
addPolicy('oracle1', () => aiPolicy('oracle'));
addPolicy('strong', () => aiPolicy('strong', { ply2:true, worlds:4, topMoves:6, handTop:2 }));
addPolicy('oracle', () => aiPolicy('oracle', { ply2:true, topMoves:10, handTop:3, oppHand:3 }));
module.exports = { aiPolicy };
