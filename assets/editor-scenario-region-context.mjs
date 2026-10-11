// RG01 is a separate wire domain. A syntactic tag never authenticates a map.
import {ownData,readDenseList} from './editor-own.mjs?v=20261011-public1';
import {Sha256} from './sha256.mjs?v=20261011-public1';
import {immutableBytesHash} from './editor-provenance.mjs?v=20261011-public1';
export const REGION_RULE_TAG=0x10000000;
const KEYS=['gameId','physicalIndex','scenarioSlots','mapIndex','mapPhysicalIndex','mapSlots','width','height','identity'];
const fail=m=>{const e=new Error(m);e.code='EDITOR_OBJECTIVE_INVALID';throw e;};
const hashJson=x=>new Sha256().update(new TextEncoder().encode(JSON.stringify(x))).hex();
export function isRegionRuleWireValue(n){return Number.isInteger(n)&&n>=REGION_RULE_TAG&&n<=0xffffffff&&(n&0xf8000000)===REGION_RULE_TAG&&(n>>>25&3)<3&&(n>>>18&63)<=(n>>>6&63)&&(n>>>12&63)<=(n&63);}
export function snapshotRegionContext(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Reflect.ownKeys(input).some(k=>!KEYS.includes(k))||KEYS.some(k=>ownData(input,k)===undefined))fail('Missing own region context.');
 const c=Object.fromEntries(KEYS.map(k=>[k,ownData(input,k)])),ss=readDenseList(c.scenarioSlots,74),ms=readDenseList(c.mapSlots,111);
 const slots=(r,max)=>!r.problem&&r.list.length&&r.list.every((n,i)=>Number.isInteger(n)&&n>=0&&n<max&&(!i||n>r.list[i-1]));
 if(c.gameId!=='srwf-f'||!Number.isInteger(c.physicalIndex)||c.physicalIndex<0||c.physicalIndex>=52||!Number.isInteger(c.mapIndex)||c.mapIndex<0||c.mapIndex>=111||!Number.isInteger(c.mapPhysicalIndex)||c.mapPhysicalIndex<0||c.mapPhysicalIndex>=111||![c.width,c.height].every(n=>Number.isInteger(n)&&n>=1&&n<=64)||!slots(ss,74)||!slots(ms,111)||!ms.list.includes(c.mapIndex)||typeof c.identity!=='string'||!/^[a-f0-9]{64}$/.test(c.identity))fail('Invalid selected-map region context.');
 return Object.freeze({...c,scenarioSlots:Object.freeze(ss.list),mapSlots:Object.freeze(ms.list)});
}
export function snapshotRegionContexts(input){const r=readDenseList(input,52);if(r.problem)fail('Invalid region context list.');const seen=new Set();return Object.freeze(r.list.map(x=>{const c=snapshotRegionContext(x);if(seen.has(c.physicalIndex))fail('Duplicate region physical context.');seen.add(c.physicalIndex);return c;}));}
export function regionContextFor(context,row){
 const direct=ownData(context,'regionContext');if(direct){const c=snapshotRegionContext(direct),p=typeof row==='number'?row:typeof row==='string'&&/^\d+:\d+$/.test(row)?Number(row.split(':')[0]):ownData(row,'physicalIndex');if(p!==undefined&&c.physicalIndex!==p)fail('Wrong selected region physical body.');return c;}
 const list=ownData(context,'regionContexts');if(list===undefined)return null;
 const p=typeof row==='number'?row:typeof row==='string'&&/^\d+:\d+$/.test(row)?Number(row.split(':')[0]):ownData(row,'physicalIndex');
 return snapshotRegionContexts(list).find(c=>c.physicalIndex===p)??null;
}
export function objectiveContextFor(context,row){return Object.freeze({gameId:ownData(context,'gameId'),unitCount:ownData(context,'unitCount'),pilotContext:ownData(context,'pilotContext')??null,regionContexts:ownData(context,'regionContexts'),regionContext:regionContextFor(context,row)});}
export function regionContextOf(context){const c=regionContextFor(context);if(!c||ownData(context,'gameId')!=='srwf-f'||ownData(context,'unitCount')!==368)fail('Region query requires the inspected F table and selected map.');return c;}
export function encodeRegionRule(input,context){
 const c=regionContextOf(context),keys=['sideCode','presence','x0','y0','x1','y1'];
 if(!input||typeof input!=='object'||Array.isArray(input)||Reflect.ownKeys(input).some(k=>!keys.includes(k))||keys.some(k=>ownData(input,k)===undefined))fail('Invalid region rule record.');
 const o=Object.fromEntries(keys.map(k=>[k,ownData(input,k)]));
 if(![0,1,2].includes(o.sideCode)||typeof o.presence!=='boolean'||![o.x0,o.y0,o.x1,o.y1].every(n=>Number.isInteger(n)&&n>=0&&n<=63)||o.x0>o.x1||o.y0>o.y1||o.x1>=c.width||o.y1>=c.height)fail('Region coordinate leaves its selected map.');
 return REGION_RULE_TAG|o.sideCode<<25|Number(o.presence)<<24|o.x0<<18|o.y0<<12|o.x1<<6|o.y1;
}
export function decodeRegionRule(n,context){if(!isRegionRuleWireValue(n))fail('Invalid RG01 wire shape.');const o={sideCode:n>>>25&3,presence:!!(n&0x1000000),x0:n>>>18&63,y0:n>>>12&63,x1:n>>>6&63,y1:n&63};if(encodeRegionRule(o,context)!==n)fail('Noncanonical RG01 region.');return Object.freeze({query:'factionRegion',comparison:o.presence?'present':'absent',...o});}
export function regionContextDigest(input){const c=snapshotRegionContext(input);return new Sha256().update(new TextEncoder().encode(JSON.stringify(KEYS.map(k=>c[k])))).digest();}
export function buildRegionContexts(archive,maps,scenarios,tables){
 if(archive.gameId!=='srwf-f'||archive.scenarioLayout!=='latest'||ownData(tables,'unitCount')!==368)return Object.freeze([]);
 const result=[];
 for(const b of archive.bodies){const scene=scenarios.find(s=>s.physicalIndex===b.physicalIndex),mi=scene?.mapIndex,m=Number.isInteger(mi)?maps.members[maps.slots[mi]]:null;if(!m||m.planes.some(p=>p.width!==m.planes[0].width||p.height!==m.planes[0].height))continue;
  const planes=m.planes.map(p=>{const ranges=[];for(let i=0;i<p.width*p.height;i++){ranges.push([p.cellStart+i*2,1,3],[p.cellStart+i*2+1,1,255]);}return[p.width,p.height,immutableBytesHash(p.decoded,ranges)];});
  const identity=hashJson(['srwf.region-map-context.v1',archive.gameId,b.physicalIndex,b.slots,mi,m.physicalIndex,m.slots,planes]);
  result.push(snapshotRegionContext({gameId:archive.gameId,physicalIndex:b.physicalIndex,scenarioSlots:b.slots,mapIndex:mi,mapPhysicalIndex:m.physicalIndex,mapSlots:m.slots,width:m.planes[0].width,height:m.planes[0].height,identity}));
 }
 return snapshotRegionContexts(result);
}
