import test from 'node:test';
import assert from 'node:assert/strict';
import {CRITICAL_FIX_PROFILES,critical} from './helpers/synthetic-overlay-windows.mjs';
const {inspectCriticalFix,criticalFixRows,setCriticalFix,normalizeCriticalFix}=critical;

const hex=s=>Uint8Array.from(Buffer.from(s,'hex'));
function fixture(p){
  // Synthetic bytes with fabricated verification windows placed
  // into them. Test-only digest substitution retains the production logic.
  const bytes=Uint8Array.from({length:p.byteLength},(_,i)=>(i*37+19)&255);
  bytes.set(hex(p.context),p.start);
  bytes.set(hex(p.calc.bytes),p.calc.offset);
  bytes.set(hex(p.display.bytes),p.display.offset);
  return bytes;
}
const unavailable=Object.freeze({available:false,enabled:false,identity:null});
function reject(bytes,gameId){
  assert.deepEqual(inspectCriticalFix(bytes,gameId),unavailable);
  assert.strictEqual(normalizeCriticalFix(bytes,gameId),bytes,'unsupported data must not be normalized');
  for(const enabled of [false,true])assert.throws(()=>setCriticalFix(bytes,gameId,enabled),{code:'EDITOR_CRITICAL_FIX_UNSUPPORTED'});
}

test('critical fix profiles pin only the audited Saturn EXEC0 windows',()=>{
  assert.deepEqual(Object.keys(CRITICAL_FIX_PROFILES),['srwf-f','srwf-final']);
  assert.ok(Object.isFrozen(critical.CRITICAL_FIX_PROFILES));
  const expected={
    'srwf-f':{byteLength:731504,start:0x62000,offset:0x620d4,calc:0xb1338,display:0xb0c50,
      original:'060b5338',enabled:'060b4c50',hash:'308fe51501cd70091fe1a9983101d6cd98b9fdc7d8857e4bac9e2bff3e9974f1'},
    'srwf-final':{byteLength:758232,start:0x68910,offset:0x689e4,calc:0xb7b54,display:0xb7290,
      original:'060bbb54',enabled:'060bb290',hash:'2b17a510e9eb4758ada3aa954577222b848d15b573c56f63610e1cdc1d3320c0'},
  };
  for(const [gameId,p]of Object.entries(CRITICAL_FIX_PROFILES)){
    const e=expected[gameId];
    assert.deepEqual({byteLength:p.byteLength,start:p.start,offset:p.offset,calc:p.calc.offset,display:p.display.offset,
      original:p.original,enabled:p.enabled,hash:p.acceptedExecSha256},e);
    assert.equal(hex(p.context).length,228);
    assert.equal(p.offset-p.start,0xd4);
    assert.equal(p.loadOffset-p.start,0x4c);
    assert.equal(p.context.slice(0xd4*2,0xd8*2),p.original);
    assert.equal(hex(p.calc.bytes).length,8);assert.equal(hex(p.display.bytes).length,8);
    for(const obj of [critical.CRITICAL_FIX_PROFILES[gameId],critical.CRITICAL_FIX_PROFILES[gameId].calc,critical.CRITICAL_FIX_PROFILES[gameId].display])assert.ok(Object.isFrozen(obj));
  }
});

for(const [gameId,p]of Object.entries(CRITICAL_FIX_PROFILES)){
  test(`${gameId}: OFF → ON → OFF preserves exact EXEC0 bytes and both tables`,()=>{
    const off=fixture(p),snapshot=off.slice(),initial=inspectCriticalFix(off,gameId);
    assert.equal(initial.available,true);assert.equal(initial.enabled,false);
    assert.ok(Object.isFrozen(initial));assert.match(initial.identity,/^critical:1:[a-f0-9]{64}$/);
    const on=setCriticalFix(off,gameId,true),changed=[];
    for(let i=0;i<off.length;i++)if(off[i]!==on[i])changed.push(i);
    assert.deepEqual(changed,[p.offset+2,p.offset+3]);
    assert.equal(on.length,off.length);assert.notStrictEqual(on,off);assert.notStrictEqual(on.buffer,off.buffer);
    assert.deepEqual(off,snapshot,'input remains immutable');
    assert.deepEqual(on.subarray(p.offset,p.offset+4),hex(p.enabled));
    for(const table of [p.calc,p.display])assert.deepEqual(on.subarray(table.offset,table.offset+8),hex(table.bytes));
    const enabled=inspectCriticalFix(on,gameId);
    assert.deepEqual(enabled,{available:true,enabled:true,identity:initial.identity});
    assert.deepEqual(setCriticalFix(on,gameId,false),off);
    assert.deepEqual(normalizeCriticalFix(on,gameId),off);
    assert.strictEqual(normalizeCriticalFix(off,gameId),off);
    assert.deepEqual(setCriticalFix(on,gameId,true),on);
    assert.deepEqual(setCriticalFix(off,gameId,false),off);
    assert.deepEqual(setCriticalFix(setCriticalFix(off,gameId,true),gameId,false),snapshot);
    const buffer=Buffer.from(off),copy=setCriticalFix(buffer,gameId,true);
    assert.deepEqual(buffer,Buffer.from(snapshot));assert.deepEqual(copy,on);assert.notStrictEqual(copy.buffer,buffer.buffer);
    const surrounding=new Uint8Array(off.length+20).fill(0xa5),view=surrounding.subarray(10,-10);
    view.set(off);assert.deepEqual(setCriticalFix(view,gameId,true),on);
    assert.deepEqual(surrounding.subarray(0,10),new Uint8Array(10).fill(0xa5));
    assert.deepEqual(surrounding.subarray(-10),new Uint8Array(10).fill(0xa5));
  });

  test(`${gameId}: UI row and identity are stable, immutable and bound to the game`,()=>{
    const off=fixture(p),state=inspectCriticalFix(off,gameId),on=inspectCriticalFix(setCriticalFix(off,gameId,true),gameId);
    for(const s of [state,on]){
      const rows=criticalFixRows(s,gameId),enabled=Number(s.enabled);
      assert.deepEqual(rows,[{recordIndex:1,name:'크리티컬 보정 오류 수정',enabled,editable:true,
        identity:s.identity,original:{enabled}}]);
      for(const obj of [rows,rows[0],rows[0].original])assert.ok(Object.isFrozen(obj));
    }
    assert.deepEqual(criticalFixRows(state,gameId==='srwf-f'?'srwf-final':'srwf-f'),[]);
    for(const s of [null,{},unavailable,{...state,enabled:1},{...state,identity:'unknown'}])assert.deepEqual(criticalFixRows(s,gameId),[]);
    for(const id of [undefined,null,'','f','final','toString',{},1])assert.deepEqual(criticalFixRows(state,id),[]);
  });

  test(`${gameId}: unknown pointer values and all bounded code/table tampering reject`,()=>{
    const off=fixture(p),on=setCriticalFix(off,gameId,true);
    for(const source of [off,on]){
      for(let relative=0;relative<228;relative++){
        if(relative>=0xd4&&relative<0xd8)continue;
        const changed=source.slice();changed[p.start+relative]^=1;reject(changed,gameId);
      }
      for(const table of [p.calc,p.display])for(let i=0;i<8;i++){
        const changed=source.slice();changed[table.offset+i]^=1;reject(changed,gameId);
      }
      for(let i=0;i<4;i++){
        const changed=source.slice();changed[p.offset+i]^=1;reject(changed,gameId);
      }
    }
    for(const value of ['00000000','060b0000','060b5339','060b4c51','060bbb55','060bb291']){
      const changed=off.slice();changed.set(hex(value),p.offset);reject(changed,gameId);
    }
    // Ordinary edits elsewhere are the outer inspector's provenance concern;
    // this helper must preserve them and still write only this literal.
    const unrelated=off.slice();unrelated[0]^=0x80;unrelated[unrelated.length-1]^=0x40;
    const enabled=setCriticalFix(unrelated,gameId,true);
    assert.equal(enabled[0],unrelated[0]);assert.equal(enabled.at(-1),unrelated.at(-1));
    assert.deepEqual(setCriticalFix(enabled,gameId,false),unrelated);
  });

  test(`${gameId}: malformed inputs, wrong game and exact file length fail closed`,()=>{
    const off=fixture(p);
    for(const value of [undefined,null,0,1,'true',new Boolean(true),{},[],()=>true]){
      assert.throws(()=>setCriticalFix(off,gameId,value),{code:'EDITOR_CRITICAL_FIX_UNSUPPORTED'});
      assert.equal(inspectCriticalFix(off,gameId).enabled,false);
    }
    for(const value of [undefined,null,false,0,'',[],{},off.buffer,new DataView(off.buffer),new Uint16Array(12)])reject(value,gameId);
    for(const id of [undefined,null,'','f','final','toString',{},1,gameId==='srwf-f'?'srwf-final':'srwf-f'])reject(off,id);
    reject(off.subarray(0,-1),gameId);
    const longer=new Uint8Array(off.length+1);longer.set(off);reject(longer,gameId);
  });
}

test('critical fix identities differ across the two audited games',()=>{
  const states=Object.entries(CRITICAL_FIX_PROFILES).map(([gameId,p])=>inspectCriticalFix(fixture(p),gameId));
  assert.notEqual(states[0].identity,states[1].identity);
});
