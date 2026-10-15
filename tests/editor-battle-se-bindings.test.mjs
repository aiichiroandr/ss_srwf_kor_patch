import test from'node:test';import assert from'node:assert/strict';import{resolveBattleSeBindings,resolveBattleSeFileBank,readBattleSeSubjectBanks,readBattleAnimationSeFileBank}from'../assets/editor-battle-se-bindings.mjs';
const areaMap={maps:[{entries:[{type:0,id:0,size:100},{type:0,id:1,size:100},{type:0,id:2,size:100},{type:1,id:0,size:100},{type:1,id:1,size:100},{type:1,id:2,size:100}]}]};
const source=bankIndex=>({fileName:'SE.BIN',bankIndex,toneBytes:new Uint8Array(80),sequenceBytes:new Uint8Array(70),sequence:{songs:[]}});
test('source file bank0 uses common tone2 and sequence0 instead of equating file and runtime bank numbers',()=>{const p=source(0),r=resolveBattleSeBindings(p,areaMap);assert.equal(r.toneBank,2);assert.equal(r.sequenceBank,0);assert.equal(r.toneBanks.get(2),p);});
test('nonzero source banks use tone1 and sequence2; actor mode already resolves to the source sequence identity',()=>{for(const index of [1,64,255]){const r=resolveBattleSeBindings(source(index),areaMap);assert.equal(r.toneBank,1);assert.equal(r.sequenceBank,2);assert.equal(r.fileBankIndex,index);}});
test('absent maps fail while native area overruns remain explicit metadata',()=>{assert.throws(()=>resolveBattleSeBindings(source(1),{maps:[]}));assert.deepEqual(resolveBattleSeBindings({...source(1),toneBytes:new Uint8Array(101)},areaMap).transferWarnings,[{kind:'tone',reason:'source-transfer-exceeds-map-area',areaSize:100,transferSize:101,overrunBytes:1}]);assert.throws(()=>resolveBattleSeBindings({...source(1),fileName:'BGM.BIN'},areaMap));});
test('weapon sequences retain the explicitly supplied common tone bank alongside their own bank',()=>{const common=source(0),weapon=source(1),r=resolveBattleSeBindings(weapon,areaMap,{commonPackage:common});assert.equal(r.toneBanks.size,2);assert.equal(r.toneBanks.get(1),weapon);assert.equal(r.toneBanks.get(2),common);assert.throws(()=>resolveBattleSeBindings(weapon,areaMap,{commonPackage:source(2)}));});

test('file-bank command distinguishes literal selectors and explicit battle subject selectors',()=>{
 for(let value=0;value<240;value++)assert.equal(resolveBattleSeFileBank(value).bankIndex,value);
 assert.equal(resolveBattleSeFileBank(240).reason,'effect-sound-subject-bank-unresolved');
 const table=new Map([[0,26],[15,92]]);assert.equal(resolveBattleSeFileBank(240,{subjectBanks:table}).bankIndex,26);assert.equal(resolveBattleSeFileBank(255,{subjectBanks:table}).bankIndex,92);
 assert.throws(()=>resolveBattleSeFileBank(256));assert.throws(()=>resolveBattleSeFileBank(240,{subjectBanks:new Map([[0,-1]])}));
});

test('dynamic loader takes low bytes from the current work table without treating it as fixed weapon metadata',()=>{
 const words=new Uint16Array(16);words[0]=0x1234;words[15]=0xabcd;const first=readBattleSeSubjectBanks(words);assert.equal(resolveBattleSeFileBank(240,{subjectBanks:first}).bankIndex,0x34);assert.equal(resolveBattleSeFileBank(255,{subjectBanks:first}).bankIndex,0xcd);
 words[0]=0x78;assert.equal(first.get(0),0x34);assert.equal(readBattleSeSubjectBanks(words).get(0),0x78);assert.throws(()=>readBattleSeSubjectBanks(new Uint16Array(15)));
});

test('selected animation header resolves the native slot15 low byte without inventing inherited context',()=>{
 const bytes=new Uint8Array(46);bytes[0]=46;bytes[44]=0;bytes[45]=3;
 const original=bytes.slice();const r=readBattleAnimationSeFileBank(bytes);assert.equal(r.bankIndex,3);assert.equal(r.headerWord,3);assert.equal(r.subjectIndex,15);assert.deepEqual(bytes,original);
 bytes[44]=1;bytes[45]=20;assert.equal(readBattleAnimationSeFileBank(bytes).bankIndex,20);
 bytes[44]=bytes[45]=255;const inherited=readBattleAnimationSeFileBank(bytes);assert.equal(inherited.status,'partial');assert.equal(Object.hasOwn(inherited,'bankIndex'),false);
 bytes[0]=0;assert.throws(()=>readBattleAnimationSeFileBank(bytes),/source header/);assert.throws(()=>readBattleAnimationSeFileBank(new Uint8Array(45)),/source header/);
});
