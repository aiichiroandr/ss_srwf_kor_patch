import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeBattleUnrotatedQueueCommand,decodeBattleRotatedQueueCommand} from '../assets/editor-battle-queue-command.mjs';
import {decodeBattleDrawCommand} from '../assets/editor-battle-draw-command.mjs';
const queue=()=>Uint8Array.from(Buffer.from('0000001c0a020050000000000080428000c70000fff000000000ffff','hex'));
const geometry=Uint8Array.from(Buffer.from('0090007020001270','hex'));
const context={maximumDepth:1024,clipOffsetX:480,clipOffsetY:624,clipMaxX:960,clipMaxY:1248};
test('native unrotated queue produces inclusive size and centered VDP geometry',()=>{
  const result=decodeBattleUnrotatedQueueCommand(queue(),geometry,context);
  assert.equal(result.status,'ready');assert.equal(result.depth,80);assert.equal(result.textureIndex,0);
  const draw=decodeBattleDrawCommand(result.bytes,{localX:160,localY:112});
  assert.equal(draw.ctrl,0x0a01);assert.equal(draw.color,0x4280);
  assert.deepEqual(draw.vertices,[{x:288,y:41},{x:431,y:41},{x:431,y:152},{x:288,y:152}]);
});
test('native unsigned position and depth tests reject only the supplied bounds',()=>{
  assert.equal(decodeBattleUnrotatedQueueCommand(queue(),geometry,{...context,maximumDepth:79}).reason,'depth');
  assert.equal(decodeBattleUnrotatedQueueCommand(queue(),geometry,{...context,clipOffsetX:0,clipMaxX:100}).reason,'position');
  const q=queue();new DataView(q.buffer).setInt16(16,-481);
  assert.equal(decodeBattleUnrotatedQueueCommand(q,geometry,context).reason,'position');
  assert.throws(()=>decodeBattleUnrotatedQueueCommand(queue(),geometry));
});
test('missing zoom components become the native centered anchor and flips survive',()=>{
  const q=queue();new DataView(q.buffer).setUint16(4,0x0032);
  const draw=decodeBattleDrawCommand(decodeBattleUnrotatedQueueCommand(q,geometry,context).bytes,{localX:160,localY:112});
  assert.equal(draw.ctrl,0x0a31);assert.equal(draw.flipX,true);assert.equal(draw.flipY,true);
});
function rotated(zoom=10){
  const q=new Uint8Array(36),v=new DataView(q.buffer);
  v.setUint32(0,24);v.setUint16(4,(zoom<<8)|2);v.setUint16(6,80);
  v.setUint32(12,0x00804280);v.setInt32(24,65535);v.setInt32(28,2);v.setInt32(32,65537);
  return q;
}
const rotatedContext={...context,screenOffsetX:160,screenOffsetY:112,windowWidth:320,windowHeight:224};
test('original centered rotation retains native epsilon and signed fixed-point endpoints',()=>{
  const result=decodeBattleRotatedQueueCommand(rotated(),geometry,rotatedContext);
  assert.equal(result.status,'ready');const v=new DataView(result.bytes.buffer);
  assert.equal(v.getUint16(0),0x0a02);
  assert.deepEqual(Array.from({length:4},(_,i)=>[v.getInt16(12+i*4),v.getInt16(14+i*4)]),[[-72,-57],[72,-56],[71,56],[-73,55]]);
});
test('bottom-right rotated anchor reverses both edges and texture controls',()=>{
  const result=decodeBattleRotatedQueueCommand(rotated(15),geometry,rotatedContext),v=new DataView(result.bytes.buffer);
  assert.equal(v.getUint16(0),0x0f32);
  assert.deepEqual(Array.from({length:4},(_,i)=>[v.getInt16(12+i*4),v.getInt16(14+i*4)]),[[0,0],[-144,-1],[-144,-113],[0,-112]]);
});
test('rotated loose clipping tests every vertex and requires the native screen window',()=>{
  const q=rotated();new DataView(q.buffer).setInt32(16,480<<16);
  assert.equal(decodeBattleRotatedQueueCommand(q,geometry,rotatedContext).reason,'position');
  assert.throws(()=>decodeBattleRotatedQueueCommand(rotated(),geometry,context));
});
