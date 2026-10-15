import test from 'node:test';import assert from 'node:assert/strict';
import {resolveBattleWebWeaponSpriteRole as resolve} from '../assets/editor-battle-web-sprite-role.mjs';
import {prepareBattleWebEffectEdgePicture,createBattleWebEffectEdgePreparer} from '../assets/editor-battle-web-effect-edge.mjs';
const counts=[[11,7,1946],[16,8,5355],[33,22,11688],[35,15,4347],[37,8,3282],[51,11,5765],[52,7,2213],
 [54,3,4467],[56,4,1506],[268,6,2836],[280,4,2905],[283,5,2198],[304,4,1506]];
test('verified optical packages require exact per-game picture counts and preserve picture indices',()=>{
 for(const gameId of ['srwf-f','srwf-final'])for(const[sourceSelector,n,len]of counts){
  const finalSaber=sourceSelector===11&&gameId==='srwf-final',pictureCount=finalSaber?10:n,recordLength=finalSaber?2805:len;
  for(let subIndex=0;subIndex<pictureCount;subIndex++)if(sourceSelector!==33||subIndex!==21)
   assert.deepEqual(resolve({gameId,sourceSelector,subIndex,pictureCount,recordLength}),
   {status:'ready',role:'optical-effect'});
  assert.equal(resolve({gameId,sourceSelector,subIndex:0,pictureCount:pictureCount+1,recordLength}).reason,'weapon-sprite-picture-count-mismatch');
  assert.equal(resolve({gameId,sourceSelector,subIndex:0,pictureCount,recordLength:recordLength+1}).reason,'weapon-sprite-record-length-mismatch');
  assert.equal(resolve({gameId,sourceSelector,subIndex:pictureCount,pictureCount,recordLength}).reason,'weapon-sprite-role-context-unresolved');
 }
 assert.equal(resolve({gameId:'srwf-f',sourceSelector:11,subIndex:7,pictureCount:10,recordLength:2805}).reason,'weapon-sprite-picture-count-mismatch');
 assert.equal(resolve({gameId:'srwf-final',sourceSelector:11,subIndex:0,pictureCount:7,recordLength:1946}).reason,'weapon-sprite-picture-count-mismatch');
 for(const gameId of ['srwf-f','srwf-final'])assert.equal(resolve({gameId,sourceSelector:33,subIndex:21,pictureCount:22,
  recordLength:11688}).reason,'weapon-sprite-image-unclassified');
});
test('mixed full-body rocket-punch pictures, physical blades/wires and unknown source packages stay unclassified',()=>{
 for(const gameId of ['srwf-f','srwf-final'])for(const[sourceSelector,pictureCount,subIndex]of [[264,31,0],[264,31,19],
  [264,31,30],[794,41,0],[794,41,37],[795,37,36],[0,1,0],[10,12,0]])
  assert.equal(resolve({gameId,sourceSelector,pictureCount,subIndex,recordLength:10000}).reason,'weapon-sprite-role-unclassified');
});
test('role resolution fails closed on missing game, count, index and noncanonical source selectors',()=>{
 const a={gameId:'srwf-f',sourceSelector:11,pictureCount:7,subIndex:0,recordLength:1946};
 for(const patch of [{gameId:undefined},{gameId:'future'},{sourceSelector:2059},{sourceSelector:'11'},
  {sourceSelector:-1},{pictureCount:undefined},{pictureCount:0},{pictureCount:256},{subIndex:-1},{subIndex:1.5},
  {recordLength:undefined},{recordLength:0},{recordLength:0x1000001}])
  assert.equal(resolve({...a,...patch}).reason,'weapon-sprite-role-context-unresolved');
});
test('optical sprite alpha changes only a qualified owned package and cannot erase body art by claimed role',()=>{
 const p={width:7,height:5,pixels:new Uint8Array(7*5*4)};
 for(let y=1;y<4;y++)for(let x=1;x<6;x++)p.pixels.set([24,0,0,255],(y*7+x)*4);
 p.pixels.set([248,248,0,255],(2*7+3)*4);p.pixels.set([80,24,0,255],(2*7+2)*4);
 const before=p.pixels.slice(),good={carrier:'owned-weapon-sprite',group:0,role:'optical-effect',gameId:'srwf-f',
  sourceSelector:11,pictureCount:7,subIndex:0,recordLength:1946},prepare=createBattleWebEffectEdgePreparer();
 const result=prepare({picture:p,provenance:good,enabled:true});assert.equal(result.corrected,true);
 assert.equal(result.evidence.brightness,'perceptual-luminance');assert.deepEqual(p.pixels,before);
 for(let at=0;at<before.length;at++)if(at%4!==3)assert.equal(result.picture.pixels[at],before[at]);
 for(const patch of [{carrier:'C_ROBOT.BIN'},{group:8},{group:16},{group:6},{group:'0'},
  {sourceSelector:264,pictureCount:31,subIndex:19},{sourceSelector:794,pictureCount:41,subIndex:37},
  {pictureCount:10},{role:'target'},{gameId:undefined}])
  assert.equal(prepare({picture:p,provenance:{...good,...patch},enabled:true}).picture,p);
 assert.equal(prepareBattleWebEffectEdgePicture({picture:p,provenance:good,enabled:false}).picture,p);
 assert.equal(prepare.stats().computations,1);
});

test("vulcan optical bank accepts all checked pictures in both games and rejects adjacent debris bank",()=>{for(const gameId of["srwf-f","srwf-final"]){for(let subIndex=0;subIndex<19;subIndex++)assert.equal(resolve({gameId,sourceSelector:1290,subIndex,pictureCount:19,recordLength:7361}).status,"ready");assert.equal(resolve({gameId,sourceSelector:1282,subIndex:0,pictureCount:4,recordLength:1170}).status,"partial");}});
