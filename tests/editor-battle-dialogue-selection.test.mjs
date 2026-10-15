import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBattleDialogueOwner,readBattleDialogueWeaponKey,withBattleDialogueWeaponKey,listBattleDialogueWeaponChoices,selectBattleDialogueChannelRoot,createBattleDialogueUnitConditionContext} from '../assets/editor-battle-dialogue-selection.mjs';
import {createBattleDialogueOutcome} from '../assets/editor-battle-dialogue-outcome.mjs';
import {readBattleDialoguePath} from '../assets/editor-battle-dialogue-source.mjs';

function fixture(gameId='srwf-f'){
  const count=gameId==='srwf-f'?384:400,start=count*4,bytes=new Uint8Array(start+160),view=new DataView(bytes.buffer);
  for(let index=0;index<count;index++)view.setInt32(index*4,start-index*4);
  for(let index=0;index<10;index++){view.setUint16(start+index*2,80+index*2-index*2);view.setUint16(start+80+index*2,65535);}
  for(const [offset,key,root]of [[20,1,100],[26,8,120],[32,65535,140],[38,8,100],[44,1,120],[50,65535,140]]){
    view.setUint16(start+offset,key);view.setUint32(start+offset+2,root);
  }
  for(const root of [100,120,140]){
    view.setUint16(start+root,13);view.setUint16(start+root+2,1);view.setUint32(start+root+4,148);
  }
  view.setUint16(start+148,16);view.setUint16(start+150,10<<6);view.setUint16(start+152,1);view.setUint32(start+154,159);
  // Keep the action/end path separate from the encoded body.
  const larger=new Uint8Array(bytes.length+4);larger.set(bytes);const lv=new DataView(larger.buffer);
  lv.setUint32(start+154,162);lv.setUint16(start+158,65535);larger[start+162]=255;
  return {bytes:larger,start};
}
const weapon=key=>{const bytes=new Uint8Array(17);bytes[2]=key;return bytes;};

test('dialogue changes preserve animation bits, caller storage and response ownership',()=>{
 for(const gameId of ['srwf-f','srwf-final']){
  const {bytes}=fixture(gameId),storage=new Uint8Array(25).fill(173),record=storage.subarray(4,21);
  record[2]=193;const before=storage.slice(),changed=withBattleDialogueWeaponKey(record,8);
  assert.deepEqual(storage,before);assert.equal(changed[2],200);
  for(let i=0;i<17;i++)if(i!==2)assert.equal(changed[i],record[i]);
  assert.equal(selectBattleDialogueChannelRoot(bytes,gameId,{pilotIndex:22,channel:0,weaponRecord:changed}).root,120);
  assert.equal(selectBattleDialogueChannelRoot(bytes,gameId,{pilotIndex:22,channel:2,statusWord:0,weaponRecord:changed}).root,100);
  for(const key of [-1,64,1.5,'8',undefined])assert.throws(()=>withBattleDialogueWeaponKey(record,key),/invalid weapon key/);
 }
});

test('dialogue choices distinguish pilot-specific lines from generic fallbacks in both channels',()=>{
 for(const gameId of ['srwf-f','srwf-final']){
  const {bytes}=fixture(gameId),result=listBattleDialogueWeaponChoices(bytes,gameId,{pilotIndex:22});
  assert.equal(result.status,'ready');assert.equal(result.choices.length,64);
  assert.equal(result.choices[8].attack.explicit,true);assert.equal(result.choices[8].attack.root,120);
  assert.equal(result.choices[8].counter.explicit,true);assert.equal(result.choices[8].counter.root,100);
  assert.equal(result.choices[63].attack.explicit,false);assert.equal(result.choices[63].attack.root,140);
  assert.equal(result.choices[63].counter.explicit,false);
  assert.equal(listBattleDialogueWeaponChoices(bytes,gameId,{pilotIndex:302}).reason,'hero-dialogue-profile-required');
  assert.deepEqual(listBattleDialogueWeaponChoices(bytes,gameId,{pilotIndex:302}).choices,[]);
 }
});

test('ordinary ownership is the pilot ID and hero ownership requires its explicit profile',()=>{
  for(const gameId of ['srwf-f','srwf-final']){
    assert.equal(resolveBattleDialogueOwner(gameId,22).recordIndex,22);
    for(let variant=0;variant<8;variant++){
      assert.equal(resolveBattleDialogueOwner(gameId,303,{heroVariant:variant}).recordIndex,304+variant*2);
      assert.equal(resolveBattleDialogueOwner(gameId,302,{heroVariant:variant}).recordIndex,305+variant*2);
    }
    assert.equal(resolveBattleDialogueOwner(gameId,302).reason,'hero-dialogue-profile-required');
    assert.throws(()=>resolveBattleDialogueOwner(gameId,303,{heroVariant:8}),/hero profile/);
  }
  assert.equal(resolveBattleDialogueOwner('srwf-f',384).status,'partial');
  assert.equal(resolveBattleDialogueOwner('srwf-final',399).recordIndex,399);
  assert.throws(()=>resolveBattleDialogueOwner('other',10),/ownership/);
});

test('source weapon key uses only raw byte2 low6 and respects a bounded typed subview',()=>{
  const storage=new Uint8Array(25).fill(255),record=storage.subarray(4,21);record[2]=0xc8;
  assert.equal(readBattleDialogueWeaponKey(record),8);
  assert.equal(record[2],0xc8);assert.equal(storage[0],255);
  assert.throws(()=>readBattleDialogueWeaponKey(storage),/bounded/);
  assert.throws(()=>readBattleDialogueWeaponKey(new Uint16Array(17)),/bounded/);
});

test('response channels preserve the incoming unit orientation rather than the speaker orientation',()=>{
  for(let channel=0;channel<4;channel++){
    const result=createBattleDialogueUnitConditionContext({channel,attackerUnitId:218,defenderUnitId:21});
    assert.deepEqual(result,channel<2?{currentUnitId:218,opponentUnitId:21}:{currentUnitId:21,opponentUnitId:218});
  }
  assert.throws(()=>createBattleDialogueUnitConditionContext({channel:1,attackerUnitId:218}),/orientation required/);
  assert.throws(()=>createBattleDialogueUnitConditionContext({channel:4,attackerUnitId:218,defenderUnitId:21}),/orientation required/);
});

test('explicit pilot conditions share incoming-side orientation and retain independently owned linked IDs',()=>{
 for(let channel=0;channel<4;channel++){
  const links=[143],result=createBattleDialogueUnitConditionContext({channel,attackerUnitId:47,defenderUnitId:21,
   attackerPilotId:126,defenderPilotId:323,attackerLinkedPilotIds:links,defenderLinkedPilotIds:[]});
  const current=channel<2;
  assert.equal(result.currentPilotId,current?126:323);assert.equal(result.opponentPilotId,current?323:126);
  assert.deepEqual(result.currentLinkedPilotIds,current?[143]:[]);
  assert.deepEqual(result.opponentLinkedPilotIds,current?[]:[143]);
  links[0]=0;assert.deepEqual(result[current?'currentLinkedPilotIds':'opponentLinkedPilotIds'],[143]);
 }
 const base={channel:0,attackerUnitId:47,defenderUnitId:21};
 const absent=createBattleDialogueUnitConditionContext({...base,attackerPilotId:126});
 assert.equal(absent.currentPilotId,126);assert.equal(Object.hasOwn(absent,'currentLinkedPilotIds'),false);
 for(const bad of [{attackerPilotId:-1},{attackerLinkedPilotIds:[]},
  {attackerPilotId:126,attackerLinkedPilotIds:new Uint16Array([143])},
  {attackerPilotId:126,attackerLinkedPilotIds:[65536]},
  {attackerPilotId:126,attackerLinkedPilotIds:new Array(1)}])
  assert.throws(()=>createBattleDialogueUnitConditionContext({...base,...bad}),/pilot condition context/);
});

test('attack and counter tables retain independent ownership and inclusive fallback order',()=>{
  for(const gameId of ['srwf-f','srwf-final']){
    const {bytes}=fixture(gameId);
    assert.equal(selectBattleDialogueChannelRoot(bytes,gameId,{pilotIndex:10,channel:0,weaponRecord:weapon(1)}).root,100);
    assert.equal(selectBattleDialogueChannelRoot(bytes,gameId,{pilotIndex:22,channel:0,weaponRecord:weapon(8)}).root,120);
    const counter=selectBattleDialogueChannelRoot(bytes,gameId,{pilotIndex:22,channel:2,statusWord:0,weaponRecord:weapon(8)});
    assert.equal(counter.root,100);assert.equal(counter.selector.tableIndex,1);
    const fallback=selectBattleDialogueChannelRoot(bytes,gameId,{pilotIndex:10,channel:0,weaponRecord:weapon(63)});
    assert.equal(fallback.root,140);assert.equal(fallback.selector.matchedKey,65535);
  }
});

test('the selected source path reaches its actual random action and terminator without a default seed',()=>{
  for(const gameId of ['srwf-f','srwf-final']){
    const {bytes}=fixture(gameId),selected=selectBattleDialogueChannelRoot(bytes,gameId,{pilotIndex:10,channel:0,weaponRecord:weapon(1)});
    assert.equal(readBattleDialoguePath(bytes,gameId,selected.recordIndex,selected.root).blocked.reason,'random-result-required');
    const path=readBattleDialoguePath(bytes,gameId,selected.recordIndex,selected.root,{randomResults:[0]});
    assert.equal(path.ended,true);assert.deepEqual(path.offsets,[100,148,158]);assert.equal(path.actions[0].subjectIndex,10);
  }
});

test('response selectors distinguish death, trait response and strict remaining-HP thresholds',()=>{
  const {bytes}=fixture(),base={pilotIndex:10,channel:1,statusWord:0x4000,responseTraitByte:0};
  const header=options=>selectBattleDialogueChannelRoot(bytes,'srwf-f',{...base,...options}).selector.headerIndex;
  assert.equal(header({statusWord:0x5000}),0);
  assert.equal(header({responseTraitByte:1}),6);
  for(const [remainingHpPercent,expected]of [[0,1],[29,1],[30,2],[89,2],[90,3],[100,3]])assert.equal(header({remainingHpPercent}),expected);
  assert.equal(header({statusWord:0x4200,responseTraitByte:1,remainingHpPercent:90}),3);
  assert.equal(header({statusWord:0x0400}),7);
  assert.equal(header({statusWord:0}),4);
  assert.equal(header({statusWord:0x0080}),5);
  assert.equal(header({channel:3,statusWord:0x0400}),7);
});

test('resolved combat profiles select source response headers without inventing a critical-only quote',()=>{
 for(const gameId of ['srwf-f','srwf-final']){
 const {bytes}=fixture(gameId);
 for(const [fields,headerIndex]of [
  [{finalDamage:0},3],[{finalDamage:400},3],[{finalDamage:401},2],[{finalDamage:2801},1],
  [{finalDamage:4000},0],[{critical:true,finalDamage:401},2],
  [{hit:false,finalDamage:0},4],[{defense:'afterimage',finalDamage:0},7],
  [{defense:'parry',finalDamage:0},5],[{defense:'shield',finalDamage:401},2],
  [{defense:'guard',finalDamage:401},2],
  [{defense:'atfield',barrierBreached:false,finalDamage:0},6],
  [{defense:'atfield',barrierBreached:true,finalDamage:401},2],
 ]){
  const outcome=createBattleDialogueOutcome({gameId,hit:true,critical:false,defense:'none',
   currentHp:4000,maxHp:4000,finalDamage:0,...fields});
  const selected=selectBattleDialogueChannelRoot(bytes,gameId,{pilotIndex:10,channel:1,...outcome});
  assert.equal(selected.status,'ready');assert.equal(selected.selector.headerIndex,headerIndex);
 }
 }
});

test('special counter headers and unresolved contexts fail closed instead of choosing ordinary defaults',()=>{
  const {bytes}=fixture(),select=options=>selectBattleDialogueChannelRoot(bytes,'srwf-f',{pilotIndex:10,channel:2,weaponRecord:weapon(1),...options});
  assert.equal(select({}).reason,'dialogue-outcome-required');
  assert.equal(select({statusWord:0x0800}).reason,'counter-dialogue-status-required');
  for(const [counterStatusWord,index]of [[0x80,8],[0x100,8],[0x180,9]])assert.equal(select({statusWord:0x0800,counterStatusWord}).selector.headerIndex,index);
  assert.equal(select({statusWord:0x0800,counterStatusWord:0}).selector.tableIndex,1);
  assert.equal(select({channel:1,statusWord:0x4000}).reason,'dialogue-response-trait-required');
  assert.equal(select({channel:1,statusWord:0x4000,responseTraitByte:0}).reason,'dialogue-remaining-hp-required');
  assert.throws(()=>select({statusWord:-1}),/outcome word/);
  assert.throws(()=>select({statusWord:0x0800,counterStatusWord:65536}),/counter status/);
  assert.throws(()=>select({channel:1,statusWord:0x4000,responseTraitByte:256}),/response trait/);
});

test('truncated physical selector data never becomes an empty dialogue',()=>{
  const {bytes,start}=fixture(),copy=bytes.slice();new DataView(copy.buffer).setUint32(start+22,copy.length);
  assert.throws(()=>selectBattleDialogueChannelRoot(copy,'srwf-f',{pilotIndex:10,channel:0,weaponRecord:weapon(1)}),/root escapes/);
  assert.throws(()=>selectBattleDialogueChannelRoot(bytes,'srwf-f',{pilotIndex:10,channel:0,weaponRecord:weapon(1).subarray(0,16)}),/bounded/);
});

test('source unit comparisons preserve current/opponent ownership and both branch polarities',()=>{
  for(const gameId of ['srwf-f','srwf-final'])for(let token=0;token<4;token++){
    const {bytes,start}=fixture(gameId),view=new DataView(bytes.buffer);
    view.setUint16(start+60,token);view.setUint16(start+62,218);view.setUint32(start+64,100);view.setUint16(start+68,65535);
    const key=token<2?'currentUnitId':'opponentUnitId';
    for(const value of [218,21]){
      const conditions={currentUnitId:700,opponentUnitId:701,[key]:value},taken=Boolean(token&1)?value!==218:value===218;
      const path=readBattleDialoguePath(bytes,gameId,98,60,{conditions,randomResults:[0]});
      assert.equal(path.ended,true);assert.deepEqual(path.offsets,taken?[60,100,148,158]:[60,68]);
      assert.equal(path.randomConsumed,Number(taken));
    }
    const missing=readBattleDialoguePath(bytes,gameId,98,60);
    assert.equal(missing.blocked.reason,'unit-condition-context-required');assert.equal(missing.blocked.key,key);
    assert.throws(()=>readBattleDialoguePath(bytes,gameId,98,60,{conditions:{[key]:-1}}),/invalid unit condition/);
  }
});

test('unit-condition targets and operands remain bounded while unsupported controls remain partial',()=>{
  const {bytes,start}=fixture(),view=new DataView(bytes.buffer);
  view.setUint16(start+60,0);view.setUint16(start+62,218);view.setUint32(start+64,bytes.length);
  assert.throws(()=>readBattleDialoguePath(bytes,'srwf-f',98,60,{conditions:{currentUnitId:218}}),/execution escapes/);
  view.setUint16(start+160,0);
  assert.throws(()=>readBattleDialoguePath(bytes,'srwf-f',98,160,{conditions:{currentUnitId:218}}),/truncated unit condition/);
  view.setUint16(start+60,14);
  assert.equal(readBattleDialoguePath(bytes,'srwf-f',98,60).blocked.reason,'unresolved-producer-command');
});

test('F and Final pilot comparisons retain equality-chain and direct-only inequality semantics',()=>{
 for(const gameId of ['srwf-f','srwf-final'])for(let token=4;token<=7;token++){
  const {bytes,start}=fixture(gameId),view=new DataView(bytes.buffer),role=token<6?'current':'opponent';
  view.setUint16(start+60,token);view.setUint16(start+62,143);view.setUint32(start+64,100);view.setUint16(start+68,65535);
  for(const [id,links]of [[143,[]],[126,[]],[126,[134,143,140]]]){
   const taken=token&1?id!==143:id===143||links.includes(143);
   const path=readBattleDialoguePath(bytes,gameId,126,60,{randomResults:[0],
    conditions:{[role+'PilotId']:id,[role+'LinkedPilotIds']:links}});
   assert.equal(path.ended,true);assert.deepEqual(path.offsets,taken?[60,100,148,158]:[60,68]);
   assert.equal(path.randomConsumed,Number(taken));
  }
  assert.equal(readBattleDialoguePath(bytes,gameId,126,60).blocked.reason,'pilot-condition-context-required');
  const direct=readBattleDialoguePath(bytes,gameId,126,60,{randomResults:[0],conditions:{[role+'PilotId']:126}});
  assert.equal(direct.blocked?.reason,token&1?undefined:'pilot-link-context-required');
  assert.throws(()=>readBattleDialoguePath(bytes,gameId,126,60,{conditions:{[role+'PilotId']:-1}}),/invalid pilot/);
 }
});

test('pilot comparisons never substitute absent context or an unbounded branch and reject truncated operands',()=>{
 const {bytes,start}=fixture(),view=new DataView(bytes.buffer);
 view.setUint16(start+60,4);view.setUint16(start+62,143);view.setUint32(start+64,bytes.length);
 assert.throws(()=>readBattleDialoguePath(bytes,'srwf-f',126,60,{conditions:{currentPilotId:143}}),/execution escapes/);
 view.setUint32(start+64,100);
 for(const links of [[-1],new Array(1),new Array(256).fill(143),new Uint16Array([143])])
  assert.throws(()=>readBattleDialoguePath(bytes,'srwf-f',126,60,{conditions:{currentPilotId:126,currentLinkedPilotIds:links}}),/invalid linked pilot/);
 view.setUint16(start+160,6);
 assert.throws(()=>readBattleDialoguePath(bytes,'srwf-f',126,160,{conditions:{opponentPilotId:323}}),/truncated pilot/);
});
