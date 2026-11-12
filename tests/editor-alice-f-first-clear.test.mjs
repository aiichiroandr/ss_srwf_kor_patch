import test from'node:test';import assert from'node:assert/strict';
import {buildAliceFFirstClearProgram,makeAliceFFirstClearConfig,normalizeAliceFFirstClearBody,applyAliceFFirstClearBody,ALICE_F_FIRST_CLEAR_HOOK} from'../assets/editor-alice-f-first-clear.mjs';
import {decodeScenarioDisplayInstruction} from'../assets/editor-scenario-display.mjs';
const ids=[100,101,200,201,300,301,400];
const config={version:1,unitIds:ids,aliceEnabled:true,alicePilotId:399,aliceLevel:1};
const word=(b,p)=>b[p]*256+b[p+1];
function instruction(code,p){
 const op=code[p],sub=code[p+1];
 if(op===0xbf&&sub===2)return {length:2,native:'BF02'};
 if(op===0xc2&&sub===5)return {length:6,native:'C205'};
 if(op===0xc1&&sub===14)return {length:4,native:'C10E'};
 if(op===0xec&&sub===1&&code[p+2]===0xea)return {length:3,terminal:true,native:'EC01EA'};
 return decodeScenarioDisplayInstruction(code,p,0,code.length,'srwf-f');
}
function decodedProgram(code){
 const rows=[],starts=new Set();for(let p=0;p<code.length;){const d=instruction(code,p);assert.ok(d,`unparsed ${p}`);starts.add(p);rows.push({p,d});p+=d.length;}assert.equal(rows.at(-1).p+rows.at(-1).d.length,code.length);return {rows,starts};
}
function assertNativeBytecode(code){
 const {rows,starts}=decodedProgram(code),branches=rows.filter(({d})=>d.target!==undefined);assert.equal(code[0],0xbf);assert.equal(code[1],2);assert.equal(code[2],0xf2);assert.equal(word(code,5),rows.find(({p})=>p===2).d.value);
 // Existing public decoder, rather than this test's interpreter, defines every
 // generated F2/F0/JUMP length, relative-cell target, and comparison value.
 for(const {p,d} of branches){assert.ok(starts.has(d.target),`target ${d.target} from ${p} is not an instruction`);assert.ok(d.target>=0&&d.target<code.length);if(code[p]===0xf2){assert.equal(d.length,5);assert.equal(d.value,word(code,p+3));assert.equal(d.comparison,'eq');}if(code[p]===0xf0){assert.equal(d.length,4);assert.equal(code[p+1],0);assert.equal(d.target,p+2+new DataView(code.buffer,code.byteOffset,code.byteLength).getInt16(p+2));}if(code[p]===1){assert.equal(d.length,3);assert.equal(d.branch,false);}}
 assert.ok(rows.some(({p})=>code[p]===0xc0&&code[p+1]===13), 'C00D persistent query');for(const {p} of rows.filter(({p})=>code[p]===0xc2&&code[p+1]===5))assert.deepEqual([...code.subarray(p+4,p+6)],[0xff,0], 'C205 explicit player');const alice=rows.find(({p})=>code[p]===0xc1&&code[p+1]===6);assert.ok(alice,'C106 subpilot/SP');assert.deepEqual([...code.subarray(alice.p+4,alice.p+8)],[0xc1,0x0e,0x03,0x8f], 'C10E player side');assert.deepEqual([...code.subarray(-3)],[0xec,1,0xea]);
 return {rows,starts};
}
function run(code,selector,state={units:new Set(),pilots:new Map(),side:'enemy'}){
 const {starts}=assertNativeBytecode(code);let p=0,cond=false,created=[];while(p<code.length){const d=instruction(code,p),op=code[p],sub=code[p+1];assert.ok(starts.has(p));
  if(op===0xf2){if(selector===d.value){p=d.target;continue;}p+=d.length;continue;}
  if(op===1){p=d.target;continue;}
  if(op===0xf0){p=cond?d.target:p+d.length;continue;}
  if(op===0xc0&&sub===13){const mode=code[p+2],id=word(code,p+3);cond=mode===0x80?state.units.has(id):state.pilots.has(id);p+=d.length;continue;}
  if(op===0xc2&&sub===5){const id=word(code,p+2)&511;state.units.add(id);created.push({id,side:'player'});p+=d.length;continue;}
  if(op===0xc1&&sub===6){const packed=word(code,p+2);/* C106 supplies subpilot/SP and bit08; side context occupies bits4/5. */state.pilots.set(packed&511,{level:packed>>9,state:0x08|(state.side==='player'?0x20:0),sp:'filled',side:'original'});p+=d.length;continue;}
  if(op===0xc1&&sub===14){const packed=word(code,p+2),x=state.pilots.get(packed&511);/* C10E selects player context, retaining C106 bit08 and filled SP. */x.state=(x.state&0x08)|0x10;x.side='player';p+=d.length;continue;}
  if(d.terminal)return {created,state};p+=d.length;
 }throw Error('no terminal');
}
test('owned first-clear bytecode uses native F2/F0 cells and public decoder boundaries',()=>{
 for(const slot of[1,51]){const code=buildAliceFFirstClearProgram(1000,config,slot),{rows}=assertNativeBytecode(code),f2=rows.find(({p})=>code[p]===0xf2),jump=rows.find(({p})=>code[p]===1);assert.equal(f2.d.target,10);assert.equal(f2.d.value,slot);assert.equal(jump.p,7);assert.equal(jump.d.target,code.length-3);const r=run(code,slot);assert.deepEqual(r.created.map(x=>x.id),[100,200,300,301,400]);assert.deepEqual(r.state.pilots.get(399),{level:1,state:24,sp:'filled',side:'player'});assert.ok(r.created.every(x=>x.side==='player'));}
});
test('only target selectors grant; every physical alias and unrelated selector falls back to EC01EA',()=>{
 const code=buildAliceFFirstClearProgram(1000,config,1);for(const slot of[31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,68,69,2,51,52]){const r=run(code,slot);assert.equal(r.created.length,0);assert.equal(r.state.pilots.size,0);}
});
test('program family checks are idempotent, alternate forms suppress base, ALICE preserves ambient context',()=>{
 const code=buildAliceFFirstClearProgram(2000,config,51),state={units:new Set([101,201,300]),pilots:new Map([[399,{level:9,state:7,sp:88,side:'enemy'}]]),side:'enemy'};const first=run(code,51,state);assert.deepEqual(first.created.map(x=>x.id),[301,400]);assert.deepEqual(state.pilots.get(399),{level:9,state:7,sp:88,side:'enemy'});const again=run(code,51,state);assert.equal(again.created.length,0);assert.equal(again.state.pilots.size,1);
});
test('configuration maker requires exact paired S/Ex group metadata and clean singleton metadata',()=>{
 const groups=['s-cruiser','s-cruiser','ex-s-cruiser','ex-s-cruiser'];const rows=['s-gundam','s-g-cruiser','ex-s-gundam','g-cruiser','sirbine','zwauss','blood-temple'].map((preset,i)=>({srw4Native:true,construction:{preset},recordIndex:ids[i],saveUnitKind:i<4?1:0,saveUnitForm:i<4?i%2:0,...(i<4?{constructionGroup:groups[i],constructionGroupRoot:ids[i-i%2]}:{})}));assert.deepEqual(makeAliceFFirstClearConfig(rows,{gameId:'srwf-f',aliceEnabled:true}),config);for(const bad of [rows.map((r,i)=>i===1?{...r,constructionGroup:'ex-s-cruiser'}:r),rows.map((r,i)=>i===4?{...r,constructionGroup:'s-cruiser'}:r),rows.map((r,i)=>i===5?{...r,constructionGroupRoot:ids[5]}:r),rows.map((r,i)=>i===3?{...r,recordIndex:undefined}:r)])assert.throws(()=>makeAliceFFirstClearConfig(bad,{gameId:'srwf-f'}));assert.throws(()=>makeAliceFFirstClearConfig(rows,{gameId:'srwf-final'}));
});
test('structural hook is a three-byte jump, never a call, and marked inputs remain fail-closed',()=>{
 assert.deepEqual([...ALICE_F_FIRST_CLEAR_HOOK.terminal],[0xec,1,0xea]);assert.equal(ALICE_F_FIRST_CLEAR_HOOK.opcode,1);assert.equal(ALICE_F_FIRST_CLEAR_HOOK.length,3);assert.equal(ALICE_F_FIRST_CLEAR_HOOK.call,false);const plain={physicalIndex:1,slots:[1,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,68,69],decoded:new Uint8Array(14741)};assert.equal(normalizeAliceFFirstClearBody(plain,{gameId:'srwf-f'}).body,plain);const marked={...plain,decoded:plain.decoded.slice()};marked.decoded.set(new TextEncoder().encode('ALCFF001'),marked.decoded.length-64);const before=marked.decoded.slice();assert.throws(()=>normalizeAliceFFirstClearBody(marked,{gameId:'srwf-f'}));assert.deepEqual(marked.decoded,before);assert.throws(()=>applyAliceFFirstClearBody(plain,config,{gameId:'srwf-f',developmentOnly:true,baseSha256:'not-a-base',scenarioSha256:'override'}));
});
