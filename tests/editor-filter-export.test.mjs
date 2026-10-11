// Generated discs only: the new batch model reaches the existing writer, verified personal-image re-open,
// preset round trip and independent EDC/ECC verification. No distributed game bytes.
import assert from "node:assert/strict";
import test from "node:test";
import { makeBase, GAME, F_GAME, descriptorFor } from "./helpers/synthetic-game.mjs";
import { echoRequest, referenceMode1Problems, differingSectors, sectorOf } from "./helpers/synthetic-iso.mjs";
import { exportEditedImage } from "../assets/editor-core.mjs";
import { planBulkEdit, applyBulkEdit, undoBulkEdit } from "../assets/editor-filter.mjs";
import { splitWeaponTerrain } from "../assets/editor-grades.mjs";
import { buildPreset, parsePreset, applyPreset } from "../assets/editor-preset.mjs";
const fields = {
  unit: ["hp","en","armor","speed","limit","move","ground","sea","air","space","ability1","ability2","ability3","ability4","abilityValue1","abilityValue2","abilityValue3","abilityValue4","shield","parry"],
  pilot: ["exp","atk","shot","agi","hit","tech","cnt","mp","ground","sea","air","space","attackGrowth","shotGrowth","hitGrowth","techGrowth","agiGrowth","cntGrowth","mindGrowth","syncGrowth"],
  weapon: ["attack","hit","critical","minRange","maxRange","terrain","energy","ammo","requiredMorale","requiredSkill"],
};
function pendingRows(view, gameId) {
  const prepare = (kind, rows) => rows.map(row => ({ ...structuredClone(row), original: Object.freeze({ ...Object.fromEntries(fields[kind].map(key=>[key,row[key]])), ...(kind === "pilot" ? { spirits: structuredClone(row.spirits ?? []) } : {}) }), ...(kind === "pilot" ? { originalSkillEntries: structuredClone(row.specialAbilities ?? []) } : {}) }));
  return { gameId, units: prepare("unit",view.units), pilots: prepare("pilot",view.pilots), weapons: prepare("weapon",view.weapons), pilotAliases: view.pilotAliases };
}
for (const gameId of [F_GAME,GAME]) test(`${gameId}: bulk scalar/terrain changes export, re-open and replay from a preset byte-exactly`, async () => {
  const base=await makeBase({gameId,units:20}), model=pendingRows(base.opened.view,gameId);
  const units=model.units.filter(row=>row.editable);
  applyBulkEdit(planBulkEdit(model,"unit",units,"space",4),model);
  const pilot=model.pilots.find(row=>row.editable), weapon=model.weapons.find(row=>row.editable);
  applyBulkEdit(planBulkEdit(model,"pilot",[pilot],"space",3),model);
  const parts=splitWeaponTerrain(weapon.terrain);
  applyBulkEdit(planBulkEdit(model,"weapon",[weapon],"space",2),model);
  assert.deepEqual(splitWeaponTerrain(weapon.terrain),{...parts,space:2});
  units[0].hp=11111;
  const transaction=applyBulkEdit(planBulkEdit(model,"unit",units.slice(0,2),"hp",12345),model);
  undoBulkEdit(transaction,model);assert.equal(units[0].hp,11111);
  const output=await exportEditedImage(base.opened.session,echoRequest(base.opened.session,model));
  const reopened=await base.full.inspectPatchedImage(output.outputBlob,descriptorFor(base.disc,{gameId,imageKind:"local"}));
  assert.equal(reopened.view.acceptedReleaseMatch,false);
  for(const row of units)assert.equal(reopened.view.units.find(item=>item.recordIndex===row.recordIndex).space,4);
  assert.equal(reopened.view.units.find(item=>item.recordIndex===units[0].recordIndex).hp,11111);
  assert.equal(reopened.view.pilots.find(item=>item.recordIndex===pilot.recordIndex).space,3);
  assert.equal(reopened.view.weapons.find(item=>item.recordIndex===weapon.recordIndex).terrain,weapon.terrain);
  const bytes=new Uint8Array(await output.outputBlob.arrayBuffer());
  for(const lba of differingSectors(base.disc.image,bytes))assert.deepEqual(referenceMode1Problems(sectorOf(bytes,lba)),[]);
  const preset=parsePreset(JSON.stringify(buildPreset({gameId},{unit:model.units,pilot:model.pilots,weapon:model.weapons})),{gameId});
  const fresh=pendingRows(base.opened.view,gameId);
  applyPreset(preset,fresh,"all");
  const replay=await exportEditedImage(base.opened.session,echoRequest(base.opened.session,fresh));
  assert.equal(replay.sha256,output.sha256);
});
