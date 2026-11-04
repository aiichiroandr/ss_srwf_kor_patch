// Derive metadata only from an already authenticated latest SCEDATA profile.
// Never writes a BIN or extracted game resource. No hashes/masks outside the
// existing C7 level fields are relaxed by this generator.
import {openAsBlob} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import {locateIsoFiles,readCdUserExtent} from '../../assets/editor-core.mjs';
import {readScenarioArchive} from '../../assets/editor-scenario-archive.mjs';
import {readMapArchive} from '../../assets/editor-map-archive.mjs';
import {readScenarioDeployments} from '../../assets/editor-deployments.mjs';
import {readScenarioRosterLevels,rosterLevelDecodedMasks} from '../../assets/editor-scenario-roster-levels.mjs';
import {SCENARIO_LEVEL_SOURCE_PROFILES} from '../../assets/editor-scenario-profiles.mjs';
import {immutableBytesHash} from '../../assets/editor-provenance.mjs';
import {Sha256} from '../../assets/sha256.mjs';
import {ANIMATION_ROSTER_PROFILES} from '../../assets/editor-animation-roster-profiles.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(value=>{const m=/^--(game|bin|base|out)=(.+)$/u.exec(value);if(!m)throw Error('Use --game= --bin= --base=<accepted SHA256> --out=<JSON path>.');return[m[1],m[2]];}));
if(!['srwf-f','srwf-final'].includes(args.game)||!args.bin||!args.out||!/^[a-f0-9]{64}$/.test(args.base??''))throw Error('Missing explicit source identity or output.');
const profile=SCENARIO_LEVEL_SOURCE_PROFILES.find(p=>p.gameId===args.game&&p.baseTargetSha256===args.base&&p.scenarioScopes.scenario.scenarioLayout==='latest');
if(!profile)throw Error('No existing latest scenario source profile.');
const blob=await openAsBlob(args.bin);if(blob.size!==profile.size)throw Error('Image size differs from the authenticated profile.');
const files=await locateIsoFiles(blob,undefined,['SCEDATA.BIN','MAP_MAP.BIN']),sf=files.scedata,mf=files.map_map;
for(const [name,file]of [['scedata',sf],['map_map',mf]]){const pin=profile.scenarioFiles[name];if(file.extentLba!==pin.extentLba||file.byteLength!==pin.byteLength)throw Error('Scenario extent identity mismatch.');}
const mode=new Uint8Array(await blob.slice(sf.extentLba*2352+15,sf.extentLba*2352+16).arrayBuffer())[0],scenarioBytes=await readCdUserExtent(blob,sf.extentLba,sf.byteLength,{mode}),mapBytes=await readCdUserExtent(blob,mf.extentLba,mf.byteLength);
const archive=readScenarioArchive(scenarioBytes,args.game),maps=readMapArchive(mapBytes,args.game),tables={unitCount:args.game==='srwf-f'?368:448,pilotCount:400},model=readScenarioDeployments(archive,maps,tables),rows=readScenarioRosterLevels(archive,tables);
const hashRanges=ranges=>new Sha256().update(new TextEncoder().encode(JSON.stringify(ranges))).hex();
const bodies=archive.bodies.map(body=>{
 const scenario=model.scenarios.find(s=>s.physicalIndex===body.physicalIndex),ranges=[...scenario.placements.filter(r=>r.editable).flatMap(r=>[[r.byteOffset,2,255],[r.byteOffset+6,1,255]]),...scenario.conditions.filter(r=>r.editable).map(r=>[r.byteOffset+1,1,255])].sort((a,b)=>a[0]-b[0]);
 const old=profile.scenarioScopes.scenario.bodies[body.physicalIndex];if(old.decodedLength!==body.decoded.length||old.maskSha256!==hashRanges(ranges)||old.immutableDecodedSha256!==immutableBytesHash(body.decoded,ranges))throw Error(`Original decoded profile mismatch at body ${body.physicalIndex}.`);
 const additions=rosterLevelDecodedMasks(rows.filter(r=>r.physicalIndex===body.physicalIndex)),updated=[...ranges,...additions].sort((a,b)=>a[0]-b[0]);
 if(additions.some(([at,,mask])=>ranges.some(([start,length,oldMask])=>at>=start&&at<start+length&&(mask&oldMask))))throw Error('A roster level overlaps an older mutable field.');
 return{physicalIndex:body.physicalIndex,old,new:{decodedLength:body.decoded.length,maskSha256:hashRanges(updated),immutableDecodedSha256:immutableBytesHash(body.decoded,updated)},addedRanges:additions};
});
const anchorLevelHashes=ANIMATION_ROSTER_PROFILES.find(p=>p.gameId===args.game).blocks.filter(block=>block.kind==='c7').map(block=>{
 const bytes=archive.bodies[block.physicalIndex].decoded.slice(block.start,block.start+block.count*5);
 if(new Sha256().update(bytes).hex()!==block.sha256)throw Error('Original native C7 anchor differs from its accepted full hash.');
 for(let i=0;i<block.count;i++){if(bytes[i*5]!==0xc7)throw Error('Invalid C7 anchor stride.');bytes[i*5+3]&=1;}
 const levelMaskSha256=new Sha256().update(bytes).hex();if(levelMaskSha256!==block.levelMaskSha256)throw Error('C7 level anchor mask differs from its generated metadata.');
 return{physicalIndex:block.physicalIndex,start:block.start,count:block.count,sha256:block.sha256,levelMaskSha256};
});
const result={schema:'srwf.editor-roster-level-pins.v1',gameId:args.game,baseTargetSha256:args.base,bodyCount:bodies.length,rows:rows.length,changedBodies:bodies.filter(b=>b.addedRanges.length).length,bodies,anchorLevelHashes};
await writeFile(args.out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({gameId:result.gameId,rows:result.rows,changedBodies:result.changedBodies,out:args.out}));
