import test from 'node:test';
import assert from 'node:assert/strict';
import { compileObjectiveConditions, compileEntityObjectiveBranches, snapshotEntityObjectiveConditions, inspectDefaultObjective } from '../assets/editor-scenario-objectives.mjs';
import { isFieldValueInBounds, isObjectiveRuleValueInBounds } from '../assets/editor-fields.mjs';

const condition = (query, comparison, value) => ({ query, comparison, value });
const rule = (join, ...conditions) => ({ join, conditions });
const objectives = (priority = 'victory') => ({ priority,
  victory: rule('all', condition('enemyCount', 'eq', 0), condition('turn', 'le', 5)),
  defeat: rule('any', condition('allyCount', 'eq', 0), condition('turn', 'ge', 6)),
});

// Independent execution model of the primary handlers: query -> context +20,
// unsigned comparisons, first-operand-relative branch, EC callback result,
// E9 yield retaining the following PC. A later call resumes at that PC.
function run(bytes, state, pc = 0) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  let value = null, result = 0;
  for (let steps = 0; steps < 100; steps++) {
    assert.ok(pc >= 0 && pc < bytes.length);
    const op = bytes[pc];
    if (op === 0xd3) { value = state[bytes[pc + 1] === 0xfc ? 'enemyCount' : 'allyCount']; pc += 2; }
    else if(op===0xc0){
      assert.equal(bytes[pc+1],0x0e);const selector=view.getUint16(pc+2);
      assert.equal(selector&0xfe00,0x8000);assert.notEqual(selector&511,0);
      value=(state.actors??[]).filter(a=>a.x!==255&&a.faction<3&&!(a.word&0x60000008)&&a.unit===(selector&511)&&a.link===255).length;pc+=4;
    }
    else if (op === 0xd4) { assert.equal(bytes[pc + 1], 0); value = state.turn; pc += 2; }
    else if (op >= 0xf2 && op <= 0xf5) {
      const n = view.getUint16(pc + 3), truth = [value === n, value !== n, value <= n, value >= n][op - 0xf2];
      pc = truth ? pc + 1 + view.getInt16(pc + 1) : pc + 5;
    } else if (op === 1) pc += 1 + view.getInt16(pc + 1);
    else if (op === 0xec) { result = bytes[pc + 1]; pc += 2; }
    else if (op === 0xe9) return { result, pc: pc + 1, active: true };
    else if (op === 0xea) return { result, pc: pc + 1, active: false };
    else assert.fail(`Unexpected opcode ${op}`);
  }
  assert.fail('Callback did not return');
}

test('turn deadline, simultaneous outcomes and callback resumption follow the chosen priority', () => {
  for (const priority of ['victory', 'defeat']) {
    const { bytes } = compileObjectiveConditions(objectives(priority));
    for (const turn of [1, 4, 5, 6, 99]) for (const enemyCount of [0, 1, 74]) for (const allyCount of [0, 1, 74]) {
      const win = enemyCount === 0 && turn <= 5, lose = allyCount === 0 || turn >= 6;
      const expected = priority === 'victory' ? (win ? 1 : lose ? 2 : 0) : (lose ? 2 : win ? 1 : 0);
      const actual = run(bytes, { turn, enemyCount, allyCount }); assert.equal(actual.result, expected);
      assert.equal(actual.active, expected === 0);
      if (!expected) assert.equal(run(bytes, { turn: 6, enemyCount: 1, allyCount: 1 }, actual.pc).result, 2);
    }
  }
});

test('every comparison and both group joins compile to bounded, valid branches', () => {
  for (const comparison of ['eq', 'ne', 'le', 'ge']) for (const join of ['all', 'any']) {
    const tree = { priority: 'victory', victory: rule(join, condition('turn', comparison, 5), condition('enemyCount', 'eq', 0), condition('allyCount', 'ge', 2)),
      defeat: rule('all', condition('allyCount', 'eq', 0)) };
    const compiled = compileObjectiveConditions(tree); assert.ok(compiled.bytes.length <= 70);
    for (const turn of [1, 5, 6, 99]) for (const enemyCount of [0, 1]) for (const allyCount of [0, 1, 2, 74]) {
      const checks = [{ eq: turn === 5, ne: turn !== 5, le: turn <= 5, ge: turn >= 5 }[comparison], enemyCount === 0, allyCount >= 2];
      const win = join === 'all' ? checks.every(Boolean) : checks.some(Boolean);
      assert.equal(run(compiled.bytes, { turn, enemyCount, allyCount }).result, win ? 1 : allyCount === 0 ? 2 : 0);
    }
  }
});

test('arbitrary commands, sparse lists, accessors, invalid bounds and empty groups are rejected without evaluating getters', () => {
  let called = 0; const getter = objectives(); Object.defineProperty(getter, 'priority', { get() { called++; return 'victory'; } });
  for (const tree of [getter, { ...objectives(), opcode: 0 }, { ...objectives(), priority: 'random' }, { ...objectives(), victory: rule('all') },
    { ...objectives(), victory: rule('all', condition('phase', 'eq', 1)) },
    { ...objectives(), victory: rule('all', condition('turn', 'ge', 100)) },
    { ...objectives(), victory: rule('all', condition('turn', 'eq', 0)) },
    { ...objectives(), victory: rule('all', condition('enemyCount', 'eq', 75)) },
    { ...objectives(), victory: { join: 'all', conditions: [condition('turn', 'eq', 1), , condition('turn', 'eq', 2)] } },
    { ...objectives(), victory: rule('all', ...Array(4).fill(condition('turn', 'eq', 1))) }]) {
    assert.throws(() => compileObjectiveConditions(tree), { code: 'EDITOR_OBJECTIVE_INVALID' });
  }
  assert.equal(called, 0);
});

test('default objective recognition stays at the declared root and refuses an embedded lookalike', () => {
  const raw = new Uint8Array(120), roots = Array(14).fill(56); roots[8] = 64; roots[9] = 88;
  raw.set([0xd3,0xfc,0xf2,0,15,0,0,0xd3,0xfb,0xf2,0,11,0,0,0xe9,1,255,240,0xec,1,0xea,0xec,2,0xea],64);
  const body = { decoded: raw, roots, slots: [0], physicalIndex: 0 };
  assert.equal(inspectDefaultObjective(body).conditions.priority, 'victory');
  assert.equal(run(raw.subarray(64,88), { enemyCount: 0, allyCount: 0, turn: 1 }).result, 1);
  assert.equal(inspectDefaultObjective({ ...body, roots: roots.map((value,index) => index === 8 ? 56 : value) }), null);
  raw[65] = 0xfb; assert.equal(inspectDefaultObjective(body), null);
});

test('the separate entity compiler consumes each native count immediately and preserves joins, priority and E9 re-entry',()=>{
  const context={gameId:'srwf-f',unitCount:368},actor=(unit,extra={})=>({unit,x:1,faction:1,word:0,link:255,...extra});
  for(const priority of ['victory','defeat'])for(const join of ['all','any']){
    const tree={priority,victory:rule(join,condition('unitKind','present',65),condition('turn','le',5)),
      defeat:rule('any',condition('unitKind','absent',107),condition('allyCount','eq',0))};
    const {bytes}=compileEntityObjectiveBranches(tree,{baseOffset:128,victory:360,defeat:370,pending:380},context);
    const image=new Uint8Array(512);image.set(bytes,128);image.set([0xec,1,0xea],360);image.set([0xec,2,0xea],370);
    image.set([0xe9,1,0,0],380);new DataView(image.buffer).setInt16(382,128-382);
    for(const turn of [1,5,6,99])for(const allyCount of [0,1,74])for(const actors of [[],[actor(65),actor(107)],
      [actor(65),actor(65),actor(107)],[actor(65,{link:0}),actor(107)],
      [actor(65,{word:0x40000000}),actor(107)], [actor(65,{word:8}),actor(107)],
      [actor(65,{x:255}),actor(107)],[actor(65,{faction:3}),actor(107)]]){
      const present65=actors.some(a=>a.unit===65&&a.x!==255&&a.faction<3&&a.word===0&&a.link===255);
      const absent107=!actors.some(a=>a.unit===107&&a.x!==255&&a.faction<3&&a.word===0&&a.link===255);
      const win=join==='all'?present65&&turn<=5:present65||turn<=5,lose=absent107||allyCount===0;
      const expected=priority==='victory'?(win?1:lose?2:0):(lose?2:win?1:0);
      const actual=run(image,{turn,allyCount,actors},128);assert.equal(actual.result,expected);
      if(!expected)assert.equal(run(image,{turn:6,allyCount:0,actors:[]},actual.pc).result,2);
    }
    // A general legacy compiler cannot gain the new query through this tree.
    assert.throws(()=>compileObjectiveConditions(tree),{code:'EDITOR_OBJECTIVE_INVALID'});
  }
  const tree={priority:'victory',victory:rule('all',...Array(3).fill(condition('unitKind','present',367))),
    defeat:rule('any',...Array(3).fill(condition('unitKind','absent',1)))};
  const compiled=compileEntityObjectiveBranches(tree,{baseOffset:128,victory:360,defeat:370,pending:380},context);
  assert.equal(compiled.bytes.length,81);
});

test('unit-kind field domains exclude every reserved wire gap and require actual game/table bounds in identity-aware calls',()=>{
  const f={gameId:'srwf-f',unitCount:368},final={gameId:'srwf-final',unitCount:448};
  for(let value=0;value<=0xffff;value++){
    const q=value&3,n=value>>>4,id=value>>>1&511;
    const legacy=value===0||value<=1599&&q!==0&&n>=(q===3?1:0)&&n<=(q===3?99:74);
    const shape=(value&0xfc00)===0x8000&&id>=1&&id<=447;
    assert.equal(isFieldValueInBounds('objective','victoryRule1',value),legacy||shape||((value&0xfc00)===0x4000&&id>=1&&id<=399),`wire ${value}`);
    assert.equal(isObjectiveRuleValueInBounds(value,f),legacy||shape&&id<=367,`F ${value}`);
    assert.equal(isObjectiveRuleValueInBounds(value,final),legacy||shape,`Final ${value}`);
  }
  for(const ctx of [null,{}, {gameId:'unknown',unitCount:448},{gameId:'srwf-f',unitCount:0}])assert.throws(()=>snapshotEntityObjectiveConditions({priority:'victory',victory:rule('all',condition('unitKind','present',1)),defeat:rule('all',condition('allyCount','eq',0))},ctx));
  assert.equal(isObjectiveRuleValueInBounds(0x8005,{gameId:'srwf-f',unitCount:2}),false);
  let read=false;const ctx={unitCount:368};Object.defineProperty(ctx,'gameId',{get(){read=true;return 'srwf-f';}});
  assert.equal(isObjectiveRuleValueInBounds(0x8003,ctx),false);assert.equal(read,false);
});
