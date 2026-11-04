import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRegionContexts,snapshotRegionContext,snapshotRegionContexts,regionContextOf,encodeRegionRule,regionContextDigest} from '../assets/editor-scenario-region-context.mjs';

const finalContext=()=>({gameId:'srwf-final',physicalIndex:9,scenarioSlots:[106],mapIndex:30,mapPhysicalIndex:30,mapSlots:[30],width:30,height:52,identity:'a'.repeat(64)});
test('Final map geometry keeps its own bounds without granting F native query access',()=>{
 const c=snapshotRegionContext(finalContext());
 assert.deepEqual(c,finalContext());assert.ok(Object.isFrozen(c.scenarioSlots));
 assert.equal(regionContextDigest(c).length,32);
 for(const patch of [{physicalIndex:103},{scenarioSlots:[200]},{mapIndex:127,mapSlots:[127]},{mapPhysicalIndex:127},{width:65},{gameId:'__proto__'}])assert.throws(()=>snapshotRegionContext({...c,...patch}));
 const last=snapshotRegionContext({...c,physicalIndex:102,scenarioSlots:[199],mapIndex:126,mapPhysicalIndex:126,mapSlots:[126]});
 assert.equal(snapshotRegionContexts([c,last]).length,2);
 const f={...c,gameId:'srwf-f',scenarioSlots:[54]};
 assert.throws(()=>snapshotRegionContexts([f,c]));
 for(const gameId of ['srwf-f','srwf-final'])assert.throws(()=>regionContextOf({gameId,unitCount:gameId==='srwf-f'?368:448,regionContext:c}));
 assert.throws(()=>encodeRegionRule({sideCode:0,presence:true,x0:0,y0:0,x1:0,y1:0},{gameId:'srwf-final',unitCount:448,regionContext:c}));
});

test('Final map binding hashes immutable geometry, permits tile values and rejects cross-game maps',()=>{
 const decoded=new Uint8Array(20),plane={width:1,height:2,cellStart:16,decoded};
 const archive={gameId:'srwf-final',scenarioLayout:'latest',bodies:[{physicalIndex:9,slots:[106]}]};
 const maps={gameId:'srwf-final',slots:[0],members:[{physicalIndex:0,slots:[0],planes:[plane,{...plane,decoded:decoded.slice()}]}]};
 const scenarios=[{physicalIndex:9,mapIndex:0}],tables={unitCount:448};
 const base=buildRegionContexts(archive,maps,scenarios,tables);
 assert.equal(base.length,1);assert.equal(base[0].gameId,'srwf-final');
 decoded[16]=3;decoded[17]=255;
 assert.deepEqual(buildRegionContexts(archive,maps,scenarios,tables),base);
 decoded[16]^=4;
 assert.notEqual(buildRegionContexts(archive,maps,scenarios,tables)[0].identity,base[0].identity);
 assert.deepEqual(buildRegionContexts(archive,{...maps,gameId:'srwf-f'},scenarios,tables),[]);
 assert.deepEqual(buildRegionContexts(archive,maps,scenarios,{unitCount:368}),[]);
 assert.deepEqual(buildRegionContexts({...archive,scenarioLayout:'stock'},maps,scenarios,tables),[]);
 maps.members[0].planes[1].height=1;
 assert.deepEqual(buildRegionContexts(archive,maps,scenarios,tables),[]);
});
