import {createBattleAdmittedUnrotatedQueueRecord,createBattleAdmittedAngleQueueRecord,createBattleAdmittedMatrixQueueRecord} from './editor-battle-sprite-attributes.mjs';
import {decodeBattleUnrotatedQueueCommand,decodeBattleRotatedQueueCommand} from './editor-battle-queue-command.mjs';
import {createBattleScaledAxisCommand,createBattleScaledRotatedCommand} from './editor-battle-scaled-command.mjs';

// Join selector-resolved actor pictures to the native queue/VDP command path.
// Materials must be the current library registration, not archive ordinals.
export function prepareBattleSceneCommands(prepared,{resolveMaterial,renderGate,queueContext,rotationTables,matrix}={}){
  if(prepared?.status!=='ready'||!Array.isArray(prepared.draws)||typeof resolveMaterial!=='function')
    throw new Error('Battle scene commands: missing prepared scene');
  const gate={...renderGate},queueState={...queueContext},matrixState=matrix?.slice();
  const angleTables=rotationTables?{quadrants:rotationTables.quadrants?.slice(),sine:rotationTables.sine?.slice()}:undefined;
  const materials=[];
  for(const draw of prepared.draws){
    if(![0,1,2,3].includes(draw.input?.path))
      return {status:'blocked',slot:draw.slot,reason:'rotated-queue-producer-unresolved'};
    const material=resolveMaterial(draw);
    if(material?.assetKey!==draw.assetKey||!(material.attributes instanceof Uint8Array)
      ||material.attributes.length!==10||!(material.geometry instanceof Uint8Array)
      ||material.geometry.length!==8||![0,1].includes(material.pass))
      return {status:'blocked',slot:draw.slot,reason:'native-texture-registration-unresolved'};
    materials.push({...material,attributes:material.attributes.slice(),geometry:material.geometry.slice()});
  }
  const commands=[],assets=new Map(),culled=[];
  for(let i=0;i<prepared.draws.length;i++){
    const draw=prepared.draws[i],material=materials[i];
    const axis=[1,3].includes(draw.input.path);
    const queue=axis?(draw.input.angle===0?createBattleScaledAxisCommand:createBattleScaledRotatedCommand)(material.attributes,draw.input,
      {geometry:material.geometry,renderGate:gate,clipContext:queueState,rotationTables:angleTables})
      :draw.input.path===2
      ?createBattleAdmittedMatrixQueueRecord(material.attributes,draw.input,{renderGate:gate,matrix:matrixState,rotationTables:angleTables})
      :draw.input.angle!==0
      ?createBattleAdmittedAngleQueueRecord(material.attributes,draw.input,{renderGate:gate,rotationTables:angleTables})
      :createBattleAdmittedUnrotatedQueueRecord(material.attributes,draw.input,{renderGate:gate});
    if(queue.status==='blocked')return {status:'blocked',slot:draw.slot,reason:queue.reason};
    if(queue.status!=='ready'){culled.push({slot:draw.slot,reason:queue.reason});continue;}
    const decoder=queue.bytes.length===36?decodeBattleRotatedQueueCommand:decodeBattleUnrotatedQueueCommand;
    const decoded=axis?{status:'ready',bytes:queue.bytes,depth:queue.depthWord}
      :decoder(queue.bytes,material.geometry,queueState);
    if(decoded.status!=='ready'){culled.push({slot:draw.slot,reason:decoded.reason});continue;}
    // One physical texture can be drawn with distinct live palettes.
    // Keep the authenticated source key while using a per-slot canvas key.
    const key=`frame-slot:${draw.slot}:${draw.assetKey}`;
    assets.set(key,{...draw.image,assetKey:key,sourceAssetKey:draw.assetKey});
    commands.push({bytes:decoded.bytes,depthWord:decoded.depth,pass:material.pass,
      assetKey:key,sourceAssetKey:draw.assetKey,slot:draw.slot,selector:draw.selector});
  }
  return {status:'ready',commands,assets,culled,renderGate:gate};
}
export const prepareBattleUnrotatedSceneCommands=prepareBattleSceneCommands;
