import assert from 'node:assert/strict';
import test from 'node:test';
import {readScenarioRosterBodyCatalog,readScenarioRosterCatalog} from '../assets/editor-scenario-roster-catalog.mjs';

const tables={pilotCount:400,unitCount:448};
function body({physicalIndex=1,entries=[64],length=512}={}){
 const decoded=new Uint8Array(length),view=new DataView(decoded.buffer),roots=Array.from({length:14},(_,i)=>entries[i]??entries.at(-1));
 roots.forEach((p,i)=>view.setInt32(i*4,p-i*4));return {physicalIndex,decoded,roots,slots:[physicalIndex+100]};
}
function putJoin(b,p,pilot=100,unit=200,level=50){const packed=level*512+unit;b.set([0xc7,pilot>>>8,pilot&255,packed>>>8,packed&255],p);}
function guarded(){
 const b=body(),v=new DataView(b.decoded.buffer);b.decoded.set([0xd0,2,0,26,0xf0,0,0,26],64);putJoin(b.decoded,72);
 b.decoded.set([0xc1,6,0x60,101,0xc1,11,0,100,0,101,0xb1,0,0,1,0x93,0xea],77);v.setInt16(88,400-88);b.decoded[96]=0xea;return b;
}

for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: a selected join exposes its local condition, auxiliary graph and following dialogue`,()=>{
 const b=guarded(),before=b.decoded.slice(),catalog=readScenarioRosterBodyCatalog(b,gameId,tables),row=catalog.joins[0];
 assert.equal(catalog.joins.length,1);assert.equal(row.recordIndex,'roster:1:72');assert.deepEqual(row.scenarioSlots,[101]);assert.equal(row.initialLevel,50);
 assert.deepEqual(row.contexts[0].guards.map(g=>({opcode:g.opcode,taken:g.taken,producer:g.producer})),[{opcode:'F0',taken:false,producer:{kind:'flag-query',byteOffset:64,flagId:26}}]);
 assert.deepEqual(row.bundle.pilotIds,[100,101]);assert.equal(row.bundle.byteLength,15);assert.deepEqual(row.bundle.links,[{pilotId:100,linkedPilotId:101,byteOffset:81}]);
 assert.deepEqual(row.bundle.commands.map(c=>c.opcode),['C7','C1.06','C1.0B']);assert.equal(row.bundle.movable,false);
 assert.deepEqual(row.dialogueCalls.map(c=>({recordIndex:c.recordIndex,targetOffset:c.targetOffset,speakerId:c.speakerId,speakerVariant:c.speakerVariant,relation:c.relation})),[{recordIndex:'1:87',targetOffset:400,speakerId:100,speakerVariant:3,relation:'can-follow'}]);
 assert.equal(row.editable,false);assert.equal(catalog.complete,false);assert.deepEqual(b.decoded,before);assert.doesNotThrow(()=>JSON.stringify(catalog));
});

test('multiple original sites form pilot/unit families without claiming chronological order',()=>{
 const b=body({entries:[64,128]});putJoin(b.decoded,64,100,200,8);b.decoded[69]=0xea;putJoin(b.decoded,128,100,201,20);b.decoded[133]=0xea;
 const catalog=readScenarioRosterCatalog({gameId:'srwf-f',bodies:[body({physicalIndex:0}),b]},tables);
 assert.equal(catalog.coverage.joinCount,2);assert.deepEqual(catalog.pilotFamilies.map(({id,recordIndices,multipleOriginalSites})=>({id,recordIndices,multipleOriginalSites})),[{id:100,recordIndices:['roster:1:64','roster:1:128'],multipleOriginalSites:true}]);
 assert.equal(catalog.unitFamilies.length,2);assert.equal(catalog.coverage.bodyCount,1);assert.equal(catalog.coverage.reachedFromRoot,2);
});

test('unreached opcode-like bytes are not catalogued and conflicting instruction boundaries discard that callback',()=>{
 const unknown=body();unknown.decoded[64]=0xff;putJoin(unknown.decoded,65);const noRows=readScenarioRosterBodyCatalog(unknown,'srwf-f',tables);
 assert.equal(noRows.joins.length,0);assert.equal(noRows.callbacks[0].frontiers[0].reason,'unknown-command');
 const conflict=guarded();new DataView(conflict.decoded.buffer).setInt16(70,74-70);
 const bad=readScenarioRosterBodyCatalog(conflict,'srwf-f',tables);assert.equal(bad.joins.length,0);assert.equal(bad.callbacks[0].invalid,true);
 assert.ok(bad.callbacks[0].frontiers.some(f=>f.reason==='instruction-boundary-conflict'));
});

test('only unavoidable local branch edges become guards, and turn predicates retain raw comparison and direction',()=>{
 const b=body();b.decoded.set([0xd4,0,0xf2,0,0,0,3],64);new DataView(b.decoded.buffer).setInt16(67,96-67);putJoin(b.decoded,71);b.decoded[76]=0xea;putJoin(b.decoded,96,101,201);b.decoded[101]=0xea;
 const result=readScenarioRosterBodyCatalog(b,'srwf-final',tables);
 assert.deepEqual(result.joins.map(r=>r.contexts[0].guards.map(g=>({comparison:g.comparison,value:g.value,taken:g.taken,producer:g.producer.kind}))),[[{comparison:'eq',value:3,taken:false,producer:'turn-query'}],[{comparison:'eq',value:3,taken:true,producer:'turn-query'}]]);
 const merged=guarded();new DataView(merged.decoded.buffer).setInt16(70,72-70);
 assert.equal(readScenarioRosterBodyCatalog(merged,'srwf-f',tables).joins[0].contexts[0].guards.length,0);
});

test('support references needing an existing pilot and interior branch entries stay explicit blockers',()=>{
 const b=guarded();b.decoded[86]=102;
 assert.ok(readScenarioRosterBodyCatalog(b,'srwf-f',tables).joins[0].bundle.blockers.includes('link-needs-existing-pilot'));
 const interior=guarded();new DataView(interior.decoded.buffer).setInt16(70,81-70);
 const result=readScenarioRosterBodyCatalog(interior,'srwf-f',tables).joins[0];assert.ok(result.bundle.blockers.includes('interior-entry'));assert.equal(result.bundle.externalEntries[0].to,81);
});

test('unclassified roster operations remain structured evidence rather than invented remove/restore labels',()=>{
 const b=body();b.decoded.set([0xc2,0x0a,0,201],64);putJoin(b.decoded,68);b.decoded[73]=0xea;
 const c=readScenarioRosterBodyCatalog(b,'srwf-f',tables);assert.equal(c.operations[0].opcode,'C2.0A');assert.equal(c.operations[0].kind,'unit-operation-unclassified');assert.equal(c.operations[0].nativeHandler,'0602B93C');assert.deepEqual(c.operations[0].rawOperands,[10,0,201]);assert.equal(c.operations[0].semanticVerified,false);
 const invalid={...b,roots:b.roots.map((p,i)=>i? p:p+1)};assert.throws(()=>readScenarioRosterBodyCatalog(invalid,'srwf-f',tables),{code:'EDITOR_ROSTER_CATALOG_INVALID'});
});

test('map creation entries link pilot/unit evidence without labelling every appearance a persistent join',()=>{
 const b=body(),v=new DataView(b.decoded.buffer);b.decoded.set([0xca,2,1,3,4,0x64,100,0,200,7,0,0,0xaa,0xbb,0xcc,0xff,0xff],64);v.setInt16(74,400-74);putJoin(b.decoded,81);b.decoded[86]=0xea;
 const catalog=readScenarioRosterCatalog({gameId:'srwf-final',bodies:[b]},tables),row=catalog.appearances[0];
 assert.equal(catalog.coverage.appearanceCount,1);assert.deepEqual([row.recordIndex,row.commandOffset,row.pilotId,row.unitId,row.initialLevel,row.callbackOffset,row.groupSelector],['1:67',64,100,200,50,400,1]);
 assert.deepEqual(row.rawAux,[0xaa,0xbb,0xcc]);assert.equal(row.persistentJoin,null);assert.equal(row.editable,false);
 assert.deepEqual(catalog.pilotFamilies.find(f=>f.id===100).appearanceRecordIndices,['1:67']);assert.deepEqual(catalog.unitFamilies.find(f=>f.id===200).recordIndices,['roster:1:81']);
});

test('native C1 removal, clear, assign, unassign and count leaves remain distinct and preserve packed words',()=>{
 const b=body();b.decoded.set([0xc1,2,0x80,100,0xc1,3,0xc1,4,0,100,0xff,0xff,0xc1,5,0,100,0xc1,8,2,0xc1,10,0,100,0xea],64);
 for(const gameId of ['srwf-f','srwf-final']){
  const c=readScenarioRosterBodyCatalog(b,gameId,tables);assert.deepEqual(c.operations.map(o=>o.kind),['pilot-remove','pilot-cache-clear','pilot-assign','pilot-unassign','pilot-count-query','pilot-morale-query']);
  assert.equal(c.operations[0].pilotWord,0x8064);assert.equal(c.operations[0].unitDisposition,'packed-bit15-dependent');assert.equal(c.operations[2].unitReference,'runtime-global');assert.equal(c.operations[2].unitId,null);assert.equal(c.operations[4].selector,2);
  assert.equal(c.operations[2].unitSearchScope,gameId==='srwf-final'?'nonzero-unit-rows':'all-unit-rows');assert.equal(c.operations[3].unitSearchScope,c.operations[2].unitSearchScope);
  assert.ok(c.operations.every(o=>o.semanticVerified&&o.nativeHandler));
 }
});

for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: packed pilot-side words remain one native instruction and expose linked-pilot differences`,()=>{
 const b=body(),before=b.decoded.slice();b.decoded.set([0xc1,0x0e,0xc7,0x64,0xc7,0,100,0,200,0xea],64);before.set(b.decoded);
 const c=readScenarioRosterBodyCatalog(b,gameId,tables),op=c.operations[0];
 assert.deepEqual(c.callbacks[0].commands.map(x=>[x.byteOffset,x.length]),[[64,4],[68,5],[73,1]]);
 assert.equal(op.kind,'pilot-side-write');assert.equal(op.pilotWord,0xc764);assert.equal(op.pilotId,356);assert.equal(op.sideIndex,3);assert.equal(op.rawSide,99);
 assert.equal(op.linkedPilotSync,gameId==='srwf-final');assert.equal(op.nativeHandler,gameId==='srwf-final'?'0602BBF0':'06028A4C');
 assert.deepEqual(c.joins.map(x=>x.pilotId),[100]);assert.equal(c.joins[0].editable,false);assert.deepEqual(b.decoded,before);
 const short=body({entries:[64,67]});short.decoded.set([0xc1,0x0e,0xc7],64);short.decoded[67]=0xea;
 const invalid=readScenarioRosterBodyCatalog(short,gameId,tables);assert.equal(invalid.callbacks[0].commands.length,0);assert.equal(invalid.callbacks[0].frontiers[0].reason,'unknown-command');
});

for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: map HP queries use pilot selectors and expose each engine's missing-result policy`,()=>{
 const b=body();b.decoded.set([0xc2,8,0,135,0xc2,8,0xff,0xff,0xc2,8,0,0,0xc7,0,100,0,200,0xea],64);const before=b.decoded.slice();
 const c=readScenarioRosterBodyCatalog(b,gameId,tables),ops=c.operations.filter(o=>o.kind==='map-hp-percent-query');
 assert.deepEqual(ops.map(o=>[o.selectorWord,o.selector,o.pilotId,o.pilotReference]),[[135,135,135,'explicit'],[65535,-1,null,'runtime-selector'],[0,0,null,'runtime-selector']]);
 assert.ok(ops.every(o=>o.unitId===undefined&&o.missingResultPolicy===(gameId==='srwf-final'?'zero':'retain-previous')&&o.semanticVerified));
 assert.equal(ops[0].nativeHandler,gameId==='srwf-final'?'0602F114':'0602B7F8');
 assert.deepEqual(c.joins.map(o=>o.pilotId),[100]);assert.equal(c.joins[0].editable,false);assert.deepEqual(b.decoded,before);
});

test('native flag set, clear and query retain their full ID and do not invert route conditions',()=>{
 const b=body();b.decoded.set([0xd0,0,0,53,0xd0,1,0,53,0xd0,2,1,53,0xea],64);
 const before=b.decoded.slice();
 for(const gameId of ['srwf-f','srwf-final']){
  const c=readScenarioRosterBodyCatalog(b,gameId,tables);
  assert.deepEqual(c.operations.map(({kind,flagId,flagValue})=>({kind,flagId,flagValue})),[
   {kind:'flag-write',flagId:53,flagValue:true},
   {kind:'flag-write',flagId:53,flagValue:false},
   {kind:'flag-query',flagId:309,flagValue:undefined},
  ]);
  assert.ok(c.operations.every(o=>o.semanticVerified&&o.nativeHandler));
 }
 assert.deepEqual(b.decoded,before);
});
