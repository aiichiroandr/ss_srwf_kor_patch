// Bounded decoded changes accompany the compressed carrier masks. A carrier
// mask alone never authorizes scenario code, map headers or graphic-bank edits.
import { readScenarioArchive } from './editor-scenario-archive.mjs?v=20261011-public4';
import { readMapArchive, readMapBankArchive } from './editor-map-archive.mjs?v=20261011-public4';
import { readScenarioDeployments, deploymentDecodedMasks, validateScenarioReinforcements } from './editor-deployments.mjs?v=20261011-public4';
import { immutableBytesHash } from './editor-provenance.mjs?v=20261011-public4';
import { Sha256 } from './sha256.mjs?v=20261011-public4';
import { normalizeScenarioDeadlines } from './editor-scenario-deadlines.mjs?v=20261011-public4';

import {buildRegionContexts} from './editor-scenario-region-context.mjs?v=20261011-public4';
const digestJson = value => new Sha256().update(new TextEncoder().encode(JSON.stringify(value))).hex();
export function mergeFullByteMasks(ranges) {
  const output = [];
  for (const range of ranges.map(r => [...r]).sort((a,b) => a[0] - b[0])) {
    if (range.length !== 3 || range[2] !== 255 || !Number.isSafeInteger(range[0]) || range[0] < 0
      || !Number.isSafeInteger(range[1]) || range[1] < 1) throw new Error('Invalid full-byte carrier mask.');
    const previous = output.at(-1);
    if (previous && previous[0] + previous[1] >= range[0]) previous[1] = Math.max(previous[0] + previous[1], range[0] + range[1]) - previous[0];
    else output.push(range);
  }
  return output;
}

export function cdCarrierRawMasks(file, mode, logicalRanges) {
  if (![1,2].includes(mode) || !Number.isSafeInteger(file?.extentLba) || file.extentLba < 0
    || !Number.isSafeInteger(file.byteLength) || file.byteLength < 1) throw new Error('Invalid CD carrier extent.');
  const output = [], sectors = new Set(), payloadOffset = mode === 1 ? 16 : 24, checksumOffset = mode === 1 ? 2064 : 2072;
  for (const [start, length, mask] of mergeFullByteMasks(logicalRanges)) {
    if (mask !== 255 || start + length > file.byteLength) throw new Error('Carrier mask leaves its ISO file.');
    for (let cursor = start; cursor < start + length;) {
      const index = Math.floor(cursor / 2048), local = cursor % 2048;
      const count = Math.min(2048 - local, start + length - cursor), lba = file.extentLba + index;
      output.push([lba * 2352 + payloadOffset + local, count, 255]); sectors.add(lba); cursor += count;
    }
  }
  for (const lba of sectors) output.push([lba * 2352 + checksumOffset, 2352 - checksumOffset, 255]);
  return mergeFullByteMasks(output);
}

export function mapPlaneDecodedMasks(plane) {
  const ranges = [];
  for (let i = 0; i < plane.width * plane.height; i++) {
    ranges.push([plane.cellStart + i * 2, 1, 3], [plane.cellStart + i * 2 + 1, 1, 255]);
  }
  return ranges;
}

export function inspectScenarioScopes({ gameId, scenarioBytes, mapBytes, bankBytes, sectorMode, tables, scenarioLayout = 'latest' }) {
  if (![1, 2].includes(sectorMode)) throw new Error('Scenario sector mode must come from the inspected disc extent.');
  const rawArchive = readScenarioArchive(scenarioBytes, gameId, { scenarioLayout }), maps = readMapArchive(mapBytes, gameId);
  const rawDeployments=readScenarioDeployments(rawArchive,maps,tables);
  const regionContexts=buildRegionContexts(rawArchive,maps,rawDeployments.scenarios,tables);
  const {archive,deadlines,reinforcements:rawReinforcements,eventCriteria,eventPhases}=normalizeScenarioDeadlines(rawArchive,{unitCount:tables?.unitCount,pilotContext:tables?.pilotContext,regionContexts});
  const banks = readMapBankArchive(bankBytes, gameId), deployments = readScenarioDeployments(archive, maps, tables,{eventCriteria,eventPhases});
  const canonicalRegionContexts=buildRegionContexts(archive,maps,deployments.scenarios,tables);
  if(JSON.stringify(regionContexts)!==JSON.stringify(canonicalRegionContexts))throw new Error('RG01 raw/canonical map binding differs.');
  // Validate every tile's mapping, including the inactive map plane, before
  // accepting mutable tile ids as a bounded personal image.
  for (const member of maps.members) {
    const bank = banks.members[banks.slots[member.bankIndex]];
    if (!bank || member.planes.some(plane => plane.tiles.some(tile => !Number.isInteger(bank.terrainIds[tile])))) {
      const error = new Error('A map tile has no verified terrain mapping.'); error.code = 'EDITOR_MAP_INVALID'; throw error;
    }
  }
  const deploymentMasks = deploymentDecodedMasks(deployments);
  const scenarioCarrierMasks = archive.bodies.map(body => [body.start, body.end - body.start, 255]);
  const mapCarrierMasks = maps.members.flatMap(member => member.planes.map(plane => [plane.start, plane.end - plane.start, 255]));
  const scope = {
    schema: 'srwf.editor-scenario-scopes.v2',
    scenario: {
      byteLength: scenarioBytes.length, sectorMode, scenarioLayout,
      immutableCarrierSha256: immutableBytesHash(scenarioBytes, scenarioCarrierMasks),
      bodies: archive.bodies.map(body => {
        const ranges = deploymentMasks[body.physicalIndex].ranges;
        return { decodedLength: body.decoded.length, maskSha256: digestJson(ranges), immutableDecodedSha256: immutableBytesHash(body.decoded, ranges) };
      }),
    },
    maps: {
      byteLength: mapBytes.length, immutableCarrierSha256: immutableBytesHash(mapBytes, mapCarrierMasks),
      bankSha256: new Sha256().update(bankBytes).hex(),
      members: maps.members.map(member => member.planes.map(plane => ({
        decodedLength: plane.decoded.length, maskSha256: digestJson(mapPlaneDecodedMasks(plane)),
        immutableDecodedSha256: immutableBytesHash(plane.decoded, mapPlaneDecodedMasks(plane)),
      }))),
    },
  };
  const reinforcements=validateScenarioReinforcements(rawReinforcements,deployments);
  return { archive, rawArchive, regionContexts:canonicalRegionContexts, deadlines, reinforcements, eventCriteria, eventPhases, maps, banks, deployments, scope, scenarioCarrierMasks, mapCarrierMasks };
}

export function scenarioRawMasks(files, inspected) {
  if (files.scedata.byteLength !== inspected.scope.scenario.byteLength || files.map_map.byteLength !== inspected.scope.maps.byteLength) {
    throw new Error('Scenario extent length mismatch.');
  }
  return mergeFullByteMasks([
    ...cdCarrierRawMasks(files.scedata, inspected.scope.scenario.sectorMode, inspected.scenarioCarrierMasks),
    ...cdCarrierRawMasks(files.map_map, 1, inspected.mapCarrierMasks),
  ]);
}
