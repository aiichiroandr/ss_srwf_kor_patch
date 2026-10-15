import test from 'node:test';import assert from 'node:assert/strict';
import {readBattleDialogueRecord,readBattleDialogueAction,readBattleEncodedText,composeBattleDialoguePayload,buildBattleDialoguePacket} from '../assets/editor-battle-dialogue-source.mjs';
function fixture(game='srwf-f'){
  const count=game==='srwf-f'?384:400,start=count*4,body=Uint8Array.from([62,238,255,63,255]),bytes=new Uint8Array(start+30+body.length),v=new DataView(bytes.buffer);
  for(let i=0;i<count;i++)v.setInt32(i*4,start-i*4);
  v.setUint16(start+20,16);v.setUint16(start+22,(86<<6)|1);v.setUint16(start+24,(30<<7)|2);v.setUint32(start+26,30);bytes.set(body,start+30);
  return {bytes,start,body};
}
test('F and Final dialogue records retain game-specific directory bounds and physical aliases',()=>{
  for(const game of ['srwf-f','srwf-final']){
    const {bytes,start}=fixture(game),record=readBattleDialogueRecord(bytes,game,86);
    assert.equal(record.start,start);assert.equal(record.end,bytes.length);assert.equal(record.aliases.length,game==='srwf-f'?384:400);
    assert.throws(()=>readBattleDialogueRecord(bytes,game,record.aliases.length),/selection/);
  }
  assert.throws(()=>readBattleDialogueRecord(fixture().bytes,'srwf-final',86));
});
test('a selected native10-byte action resolves encoded body bytes without inferring branch eligibility',()=>{
  const {bytes,body}=fixture(),action=readBattleDialogueAction(bytes,'srwf-f',86,20);
  assert.equal(action.subjectIndex,86);assert.equal(action.subjectFlags,1);assert.equal(action.group,30);assert.equal(action.selection,2);
  assert.deepEqual(action.bodyBytes,body);action.bodyBytes[0]=0;assert.equal(bytes[action.record.start+30],62);
});
test('ordinary name/body composition preserves tokens and adds only the native newline',()=>{
  const name=Uint8Array.from([21,255]),body=Uint8Array.from([62,238,255,63,255]);
  assert.deepEqual(composeBattleDialoguePayload(name,body),Uint8Array.from([21,246,62,238,255,63,255]));
  assert.deepEqual(composeBattleDialoguePayload(Uint8Array.from([255]),body),Uint8Array.from([246,...body]));
  assert.deepEqual(readBattleEncodedText(body,0,body.length),body);
});
test('malformed directory, action, body and overlong queue payloads fail without substitutions',()=>{
  const {bytes,start}=fixture(),v=new DataView(bytes.buffer);v.setInt32(4,bytes.length);
  assert.throws(()=>readBattleDialogueAction(bytes,'srwf-f',86,20),/directory/);
  v.setInt32(4,start-4);assert.throws(()=>readBattleDialogueAction(bytes,'srwf-f',86,19),/action outside/);
  v.setUint32(start+26,bytes.length);assert.throws(()=>readBattleDialogueAction(bytes,'srwf-f',86,20),/body escapes/);
  assert.throws(()=>readBattleEncodedText(Uint8Array.from([238]),0,1),/truncated/);
  const long=new Uint8Array(256).fill(21);long[255]=255;
  assert.throws(()=>composeBattleDialoguePayload(Uint8Array.from([21,255]),long),/wrapped/);
});
test('native packet retains selected action words while replacing the body offset with the composed-text address',()=>{
  const {bytes}=fixture(),action=readBattleDialogueAction(bytes,'srwf-f',86,20);
  const packet=buildBattleDialoguePacket(action,0x202c4a40),v=new DataView(packet.buffer);
  assert.equal(v.getUint16(0),16);assert.equal(v.getUint16(2),(86<<6)|1);
  assert.equal(v.getUint16(4),(30<<7)|2);assert.equal(v.getUint32(6),0x202c4a40);
  assert.throws(()=>buildBattleDialoguePacket(action,-1),/packet inputs/);
});

test('physical selectors preserve ten self-relative headers and two independent inclusive fallbacks',async()=>{
  const {readBattleDialogueSelectors}=await import('../assets/editor-battle-dialogue-source.mjs');
  const count=384,start=count*4,bytes=new Uint8Array(start+80),v=new DataView(bytes.buffer);
  for(let i=0;i<count;i++)v.setInt32(i*4,start-i*4);
  for(let i=0;i<10;i++)v.setUint16(start+i*2,60-i*2);
  for(const [offset,key,root] of [[20,7,60],[26,65535,62],[32,7,64],[38,65535,66]]){
    v.setUint16(start+offset,key);v.setUint32(start+offset+2,root);
  }
  const result=readBattleDialogueSelectors(bytes,'srwf-f',0);
  assert.deepEqual(result.header,new Array(10).fill(60));
  assert.deepEqual(result.tables,[[{key:7,root:60},{key:65535,root:62}],[{key:7,root:64},{key:65535,root:66}]]);
  v.setUint32(start+40,80);assert.throws(()=>readBattleDialogueSelectors(bytes,'srwf-f',0),/root escapes/);
});

test('native random branch uses MUL.L low product and record-relative destinations without choosing a seed',async()=>{
 const {selectBattleDialogueRandomBranch}=await import('../assets/editor-battle-dialogue-source.mjs');
 const {bytes,start}=fixture(),v=new DataView(bytes.buffer);
 v.setUint16(start+20,13);v.setUint16(start+22,2);v.setUint32(start+24,28);v.setUint32(start+28,30);
 assert.equal(selectBattleDialogueRandomBranch(bytes,'srwf-f',86,20,0).root,28);
 assert.equal(selectBattleDialogueRandomBranch(bytes,'srwf-f',86,20,32767).selection,0);
 assert.equal(selectBattleDialogueRandomBranch(bytes,'srwf-f',86,20,32768).root,30);
 assert.equal(selectBattleDialogueRandomBranch(bytes,'srwf-f',86,20,65535).selection,1);
 assert.throws(()=>selectBattleDialogueRandomBranch(bytes,'srwf-f',86,20,65536),/escapes branch/);
 v.setUint32(start+28,bytes.length);assert.throws(()=>selectBattleDialogueRandomBranch(bytes,'srwf-f',86,20,65535),/destination escapes/);
});

test('producer path follows native destinations and retains action order through FFFF',async()=>{
 const {readBattleDialoguePath}=await import('../assets/editor-battle-dialogue-source.mjs');
 const count=384,start=count*4,bytes=new Uint8Array(start+64),v=new DataView(bytes.buffer);
 for(let i=0;i<count;i++)v.setInt32(i*4,start-i*4);
 v.setUint16(start+20,13);v.setUint16(start+22,1);v.setUint32(start+24,28);
 v.setUint16(start+28,16);v.setUint32(start+34,50);v.setUint16(start+38,65535);bytes[start+50]=255;
 const path=readBattleDialoguePath(bytes,'srwf-f',0,20,{randomResults:[0]});
 assert.deepEqual(path.offsets,[20,28,38]);assert.equal(path.ended,true);assert.equal(path.actions.length,1);
 assert.equal(path.randomConsumed,1);assert.equal(path.blocked,null);
 assert.equal(readBattleDialoguePath(bytes,'srwf-f',0,20).blocked.reason,'random-result-required');
 v.setUint16(start+20,0);assert.equal(readBattleDialoguePath(bytes,'srwf-f',0,20).blocked.reason,'unit-condition-context-required');
 v.setUint16(start+20,13);v.setUint32(start+24,20);
 assert.equal(readBattleDialoguePath(bytes,'srwf-f',0,20,{randomResults:new Array(1024).fill(0)}).blocked.reason,'producer-step-limit');
});

test('producer traversal consumes scene-owned random state and rejects mixed random sources',async()=>{
 const {readBattleDialoguePath}=await import('../assets/editor-battle-dialogue-source.mjs');
 const count=384,start=count*4,bytes=new Uint8Array(start+64),v=new DataView(bytes.buffer);
 for(let i=0;i<count;i++)v.setInt32(i*4,start-i*4);
 v.setUint16(start+20,13);v.setUint16(start+22,2);v.setUint32(start+24,28);v.setUint32(start+28,32);
 v.setUint16(start+32,65535);
 const path=readBattleDialoguePath(bytes,'srwf-f',0,20,{randomState:141161605});
 assert.deepEqual(path.offsets,[20,32]);assert.equal(path.randomState,3246117594);assert.equal(path.randomConsumed,1);
 assert.throws(()=>readBattleDialoguePath(bytes,'srwf-f',0,20,{randomState:1,randomResults:[0]}),/ambiguous/);
 assert.throws(()=>readBattleDialoguePath(bytes,'srwf-f',0,20,{randomState:-1}),/uint32/);
});

test('source-derived complete paths produce native command/text slices and require speaker resolution',async()=>{
 const {buildBattleDialogueStream}=await import('../assets/editor-battle-dialogue-source.mjs');
 const {bytes,body}=fixture(),action=readBattleDialogueAction(bytes,'srwf-f',86,20);
 const path={ended:true,blocked:null,actions:[action,action],randomState:42},name=Uint8Array.from([21,255]);
 const payload=composeBattleDialoguePayload(name,body);
 const stream=buildBattleDialogueStream(path,{payloadAddress:0x202c4a40,resolveSpeaker:()=>name}),v=new DataView(stream.packets.buffer);
 assert.equal(stream.packetLength,22);assert.equal(stream.payloadLength,payload.length*2);
 assert.equal(v.getUint32(6),0x202c4a40);assert.equal(v.getUint32(16),0x202c4a40+payload.length);
 assert.deepEqual(stream.packets.slice(20,22),Uint8Array.from([255,255]));
 assert.deepEqual(stream.payloads.slice(0,payload.length*2),Uint8Array.from([...payload,...payload]));assert.equal(stream.randomState,42);
 assert.throws(()=>buildBattleDialogueStream({...path,ended:false},{payloadAddress:1,resolveSpeaker:()=>name}),/complete path/);
 assert.throws(()=>buildBattleDialogueStream(path,{payloadAddress:1,resolveSpeaker:()=>null}),/unresolved runtime speaker/);
 assert.throws(()=>buildBattleDialogueStream({...path,actions:new Array(13).fill(action)},{payloadAddress:1,resolveSpeaker:()=>name}),/capacity/);
 const longName=new Uint8Array(150).fill(21);longName[149]=255;
 assert.throws(()=>buildBattleDialogueStream(path,{payloadAddress:1,resolveSpeaker:()=>longName}),/capacity/);
});
