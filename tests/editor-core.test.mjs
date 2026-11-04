import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectPatchedImage } from '../assets/editor-core.mjs';
import { skillTable } from './helpers/synthetic-pilots.mjs';
import { GLYPHS, pilotWorld } from './helpers/synthetic-tsr.mjs';

const targetSha256 = 'a'.repeat(64);

function makeTrackedImageBlob() {
  const blob = new Blob([new Uint8Array(2352 * 4)], { type: 'application/octet-stream' });
  let streamCalls = 0;
  const stream = blob.stream.bind(blob);
  Object.defineProperty(blob, 'stream', {
    value: () => {
      streamCalls += 1;
      return stream();
    },
  });
  return { blob, get streamCalls() { return streamCalls; } };
}

function descriptor(blob, extra = {}) {
  return {
    gameId: 'srwf-final',
    targetSize: blob.size,
    targetSha256,
    ...extra,
  };
}

test('only a same-session patch result attestation skips the editor target rehash', async () => {
  const untrusted = makeTrackedImageBlob();
  await assert.rejects(
    inspectPatchedImage(untrusted.blob, descriptor(untrusted.blob)),
    (error) => error.code === 'EDITOR_TARGET_HASH_MISMATCH',
  );
  assert.equal(untrusted.streamCalls, 1, 'user-selected BINs must be streamed through SHA-256');

  const mismatchedAttestation = makeTrackedImageBlob();
  await assert.rejects(
    inspectPatchedImage(mismatchedAttestation.blob, descriptor(mismatchedAttestation.blob, {
      verifiedPatchTargetSha256: 'b'.repeat(64),
    })),
  );
  assert.equal(mismatchedAttestation.streamCalls, 1, 'a different target hash must not bypass authentication');

  const verifiedOutput = makeTrackedImageBlob();
  await assert.rejects(
    inspectPatchedImage(verifiedOutput.blob, descriptor(verifiedOutput.blob, {
      verifiedPatchTargetSha256: targetSha256,
    })),
  );
  assert.equal(verifiedOutput.streamCalls, 0, 'the immutable patch result reuses its completed target hash');
});

// Two relative pointers: metadata and one fixed record. Sprite IDs deliberately
// differ from the record row, matching the original viewer's field layout.
function imageRecordRoot(kind, firstBytes) {
  const size = kind === 'unit' ? 48 : 24;
  const bytes = new Uint8Array(12 + size);
  const view = new DataView(bytes.buffer);
  view.setInt32(0, 8); view.setInt32(4, 8);
  bytes.set(firstBytes, 12);
  const root = [];
  root[kind === 'unit' ? 27 : 28] = { bytes };
  return root;
}

test('preview follows original stored references and rejects zero/out-of-range identities', async () => {
  const { resolveEditorImageIndex } = await import('../assets/editor-core.mjs');
  for (const game of ['srwf-f', 'srwf-final']) {
    for (const id of [1,2,3,4,5,7,61,63,65,74,242,254,326]) {
      assert.equal(resolveEditorImageIndex(imageRecordRoot('unit', [48,67,id >> 8,id & 255]), 'unit', 1, game), id);
    }
    for (const id of [10,95,96,180,181,182,233,327]) {
      assert.equal(resolveEditorImageIndex(imageRecordRoot('pilot', [48 | (id >> 8),id & 255]), 'pilot', 1, game), id);
    }
    // units 315-317 (graphic 0, field 299-301) have no picture; field 299-301 is NOT a name id
    assert.equal(resolveEditorImageIndex(imageRecordRoot('unit', [49,44,0,0]), 'unit', 1, game), null);
    assert.equal(resolveEditorImageIndex(imageRecordRoot('pilot', [48,0]), 'pilot', 1, game), null);
  }
  assert.equal(resolveEditorImageIndex(imageRecordRoot('unit', [48,67,1,100]), 'unit', 1, 'srwf-f'), null);
  assert.equal(resolveEditorImageIndex(imageRecordRoot('unit', [48,67,1,100]), 'unit', 1, 'srwf-final'), 356);
  assert.equal(resolveEditorImageIndex(imageRecordRoot('pilot', [49,82]), 'pilot', 1, 'srwf-f'), null);
  assert.equal(resolveEditorImageIndex(imageRecordRoot('pilot', [49,85]), 'pilot', 1, 'srwf-final'), 341);
  assert.throws(() => resolveEditorImageIndex(imageRecordRoot('unit', [48,67,0,63]), 'unit', 2), e => e.code === 'EDITOR_PREVIEW_INVALID');
});

for (const gameId of ['srwf-f', 'srwf-final']) {
  test(`${gameId}: runtime hero slots suppress stored faces without reading media or changing pilot bytes`, async () => {
    const { applyImageReferences, pilotRows, previewEditorRecord, resolveEditorImageIndex } = await import('../assets/editor-core.mjs');
    const { segments, decoded } = pilotWorld(skillTable());
    const before = decoded.slice();
    const rows = pilotRows(segments, decoded, [], GLYPHS, GLYPHS, gameId);
    const heroes = [302, 303].map(id => rows.find(row => row.recordIndex === id));
    assert.ok(heroes.every(row => row.recordKind === 'hero-slot' && !row.editable && row.faceId > 0),
      'the fixture has real heads and nonzero stored face numbers in both runtime slots');
    const storedFaces = heroes.map(row => row.faceId);
    applyImageReferences(heroes, segments, 'pilot', gameId);
    assert.deepEqual(heroes.map(row => [row.imageIndex, row.referenceImageIndex, row.imageStatus]),
      [[null, null, 'runtime-assembled'], [null, null, 'runtime-assembled']]);
    const blob = new Blob([new Uint8Array(2352)], { type: 'application/octet-stream' });
    let mediaReads = 0;
    Object.defineProperty(blob, 'slice', { value: () => { mediaReads += 1; throw new Error('hero portrait media must not be read'); } });
    const session = {
      sessionToken: 'synthetic-hero-preview', root: segments, descriptor: { gameId }, sourceBlob: blob,
      mediaFiles: { face: { extentLba: 0, byteLength: 8 } },
    };
    for (const row of heroes) {
      assert.equal(resolveEditorImageIndex(segments, 'pilot', row.recordIndex, gameId), null);
      assert.deepEqual(await previewEditorRecord(session, 'pilot', row.recordIndex),
        { kind: 'pilot', recordIndex: row.recordIndex, image: null });
      assert.deepEqual(await previewEditorRecord(session,'pilot',row.recordIndex,{heroFaceId:0}),
        {kind:'pilot',recordIndex:row.recordIndex,image:null,imageSource:'save'});
    }
    for(const heroFaceId of [-1,512,NaN,1.5,'317'])await assert.rejects(
      previewEditorRecord(session,'pilot',303,{heroFaceId}),e=>e.code==='EDITOR_PREVIEW_INVALID');
    await assert.rejects(previewEditorRecord(session,'pilot',2,{heroFaceId:317}),e=>e.code==='EDITOR_PREVIEW_INVALID');
    assert.equal(mediaReads, 0);
    assert.deepEqual(heroes.map(row => row.faceId), storedFaces, 'stored FACE diagnostics are preserved');
    assert.deepEqual(decoded, before, 'preview policy never rewrites the authenticated pilot table');
    assert.equal(resolveEditorImageIndex(segments, 'pilot', 2, gameId), 2, 'ordinary pilots keep their own face');
    assert.equal(resolveEditorImageIndex(segments, 'pilot', 308, gameId), null, 'a headless template remains faceless');
    assert.throws(() => resolveEditorImageIndex(imageRecordRoot('pilot', [0x30, 95]), 'pilot', 302, gameId),
      error => error.code === 'EDITOR_PREVIEW_INVALID', 'a missing runtime slot is still an invalid record identity');
  });
}

test('unit abilities use viewer ID/value pairs and preserve all surrounding bytes', async () => {
  const { readUnitAbilities, writeUnitAbilities } = await import('../assets/editor-core.mjs');
  const record = new Uint8Array(48).fill(0xa5);
  record.set([1, 7, 2, 8, 14, 9, 5, 10], 38);
  const fields = readUnitAbilities(record, 0);
  assert.deepEqual([fields.ability1, fields.ability2, fields.ability3, fields.ability4], [1, 2, 14, 5]);
  assert.deepEqual([fields.abilityValue1, fields.abilityValue2, fields.abilityValue3, fields.abilityValue4], [7, 8, 9, 10]);
  writeUnitAbilities(record, 0, { ...fields, ability1: 13, ability2: 5, ability3: 10, ability4: 14 });
  assert.deepEqual([...record.slice(38, 46)], [13, 7, 5, 8, 10, 9, 14, 10]);
  assert.ok(record.slice(0, 38).every(byte => byte === 0xa5));
  assert.deepEqual([...record.slice(46)], [0xa5, 0xa5]);
  assert.deepEqual(readUnitAbilities(record, 0), { ...fields, ability1: 13, ability2: 5, ability3: 10, ability4: 14 });
  assert.throws(() => readUnitAbilities(new Uint8Array(45), 0));
});

test('editor revision policy follows both current default families and all three fonts', async () => {
  const { readFile } = await import('node:fs/promises');
  const { LATEST_EDITOR_RELEASE_GROUPS, isLatestEditorBase } = await import('../assets/editor-core.mjs');
  const { ACCEPTED_EDITOR_TARGETS } = await import('../assets/editor-provenance-profiles.mjs');
  const index = JSON.parse(await readFile(new URL('../manifest/releases.json', import.meta.url), 'utf8'));
  for (const game of index.games) {
    assert.equal(LATEST_EDITOR_RELEASE_GROUPS[game.id], game.defaultReleaseId.replace(/-[abc]$/, ''));
    let latestFonts = 0, older = 0;
    for (const [sha, target] of Object.entries(ACCEPTED_EDITOR_TARGETS)) {
      if (target.gameId !== game.id) continue;
      const latest = target.releaseId.replace(/-[abc]$/, '') === LATEST_EDITOR_RELEASE_GROUPS[game.id];
      assert.equal(isLatestEditorBase(game.id, sha), latest, target.releaseId);
      assert.equal(isLatestEditorBase(game.id === 'srwf-f' ? 'srwf-final' : 'srwf-f', sha), false);
      if (latest) latestFonts++; else older++;
    }
    assert.equal(latestFonts, 3);
    assert.ok(older > 0);
    assert.equal(isLatestEditorBase(game.id, '0'.repeat(64)), false);
  }
});

test('an older accepted patch cannot open the editor even with same-session verification', async () => {
  const { ACCEPTED_EDITOR_TARGETS } = await import('../assets/editor-provenance-profiles.mjs');
  const { isLatestEditorBase } = await import('../assets/editor-core.mjs');
  for (const [sha, target] of Object.entries(ACCEPTED_EDITOR_TARGETS)) {
    if (isLatestEditorBase(target.gameId, sha)) continue;
    const image = makeTrackedImageBlob();
    await assert.rejects(inspectPatchedImage(image.blob, {
      gameId: target.gameId, targetSize: image.blob.size,
      targetSha256: sha, verifiedPatchTargetSha256: sha,
    }), error => error.code === 'EDITOR_REVISION_OUTDATED');
    assert.equal(image.streamCalls, 0);
  }
});


test('names consume two-byte FF glyphs and signed relocated pointers without partial labels', async () => {
  const { decodeEditorName } = await import('../assets/editor-core.mjs');
  const { FINAL_PILOT_NAME_MAP } = await import('../assets/editor-pilot-name-map.mjs');
  const bytes = new Uint8Array(16);
  bytes.set([0xee, 0xff, 0xff], 0);
  new DataView(bytes.buffer).setInt32(8, -8);
  const segment = {start:8,end:12};
  assert.deepEqual(decodeEditorName(bytes,segment,0,FINAL_PILOT_NAME_MAP),{text:'이',status:'decoded'});
  bytes.set([0xee,0xff,0x01,0xff],0);
  assert.equal(decodeEditorName(bytes,segment,0,new Map([['EEFF','이']])).status,'unknown-glyph');
  assert.equal(decodeEditorName(bytes,segment,0,new Map([['EEFF','이']])).text,'');
  const truncated = new Uint8Array(5);new DataView(truncated.buffer).setInt32(0,4);truncated[4]=0xee;
  assert.equal(decodeEditorName(truncated,{start:0,end:4},0,FINAL_PILOT_NAME_MAP).status,'truncated-glyph');
  assert.equal(decodeEditorName(bytes,segment,1,FINAL_PILOT_NAME_MAP).status,'invalid-cell');
});

test('an explicit saved hero face reads that FACE cell without rewriting the ROM slot',async()=>{
 const {previewEditorRecord}=await import('../assets/editor-core.mjs');
 const {packGreedy,referenceMode1Sector}=await import('./helpers/synthetic-iso.mjs');
 const decoded=new Uint8Array(55),d=new DataView(decoded.buffer);decoded[1]=1;decoded[5]=56;
 d.setUint16(10,2);d.setUint16(12,1);d.setUint16(24,31);decoded[54]=0x11;
 const packed=packGreedy(decoded),face=new Uint8Array(18+packed.length),f=new DataView(face.buffer);
 f.setUint32(0,16);f.setUint32(4,face.length-4);f.setUint32(8,8);f.setUint32(12,face.length-12);
 face.set([0x70,0],16);face.set(packed,18);const user=new Uint8Array(2048);user.set(face);
 const {segments,decoded:tsr}=pilotWorld(skillTable()),before=tsr.slice();
 const blob=new Blob([referenceMode1Sector(0,user)]),slice=blob.slice.bind(blob);let mediaReads=0;
 Object.defineProperty(blob,'slice',{value:(...args)=>{mediaReads++;return slice(...args);}});
 const session={sessionToken:'saved-face-test',root:segments,descriptor:{gameId:'srwf-final'},sourceBlob:blob,mediaFiles:{face:{extentLba:0,byteLength:face.length}}};
 const result=await previewEditorRecord(session,'pilot',303,{heroFaceId:1});
 assert.equal(result.imageSource,'save');assert.deepEqual([...result.image.pixels],[248,0,0,255,248,0,0,255]);
 structuredClone(result.image.pixels,{transfer:[result.image.pixels.buffer]});
 const again=await previewEditorRecord(session,'pilot',303,{heroFaceId:1});
 assert.deepEqual([...again.image.pixels],[248,0,0,255,248,0,0,255]);assert.equal(mediaReads,1,'a transferred pixel result must not detach cached source media');
 assert.deepEqual(tsr,before);
 assert.deepEqual(await previewEditorRecord(session,'pilot',303),{kind:'pilot',recordIndex:303,image:null});
});

test('hero name aliases preview the paired reference face instead of the shared owner',async()=>{
 const {previewEditorRecord}=await import('../assets/editor-core.mjs');
 const {pilotRecord}=await import('./helpers/synthetic-tsr.mjs');
 const {packGreedy,referenceMode1Sector}=await import('./helpers/synthetic-iso.mjs');
 const pixels=new Uint8Array(55),d=new DataView(pixels.buffer);pixels[1]=1;pixels[5]=56;
 d.setUint16(10,2);d.setUint16(12,1);d.setUint16(24,31);pixels[54]=0x11;
 const packed=packGreedy(pixels),tableBytes=320*8,face=new Uint8Array(tableBytes+2+packed.length),f=new DataView(face.buffer);
 for(const id of [0,317]){f.setUint32(id*8,tableBytes-id*8);f.setUint32(id*8+4,face.length-id*8-4);}
 face.set([0x70,0],tableBytes);face.set(packed,tableBytes+2);
 const sectors=[];for(let i=0;i<face.length;i+=2048){const user=new Uint8Array(2048);user.set(face.subarray(i,i+2048));sectors.push(referenceMode1Sector(i/2048,user));}
 const {segments,decoded}=pilotWorld({records:[pilotRecord()],cellToRecord:Array(321).fill(0)}),before=decoded.slice();
 for(const gameId of ['srwf-f','srwf-final']){
  const session={sessionToken:'hero-alias',root:segments,descriptor:{gameId},sourceBlob:new Blob(sectors),mediaFiles:{face:{extentLba:0,byteLength:face.length}}};
  const result=await previewEditorRecord(session,'pilot',316);
  assert.equal(result.recordIndex,316);assert.equal(result.imageSource,'reference');
  assert.deepEqual([...result.image.pixels],[248,0,0,255,248,0,0,255]);
  assert.equal((await previewEditorRecord(session,'pilot',317)).imageSource,'reference');
  await assert.rejects(previewEditorRecord(session,'pilot',320),e=>e.code==='EDITOR_PREVIEW_INVALID');
 }
 assert.deepEqual(decoded,before);
});

test('building identities from Node Buffers never changes ROM bytes', async () => {
  const {buildEditorRows}=await import('../assets/editor-core.mjs');
  const {unitRecord}=await import('./helpers/synthetic-tsr.mjs');
  const unit=unitRecord({field:1,graphic:2});
  unit[9]=0x30;unit[19]=5;unit[20]=6;unit[21]=7;
  const fixture=pilotWorld({units:[unitRecord(),unit]});
  const buffer=Buffer.from(fixture.decoded),before=Buffer.from(buffer);
  const roots=fixture.segments.map(s=>({...s,bytes:buffer.subarray(s.start,s.end)}));
  const fromBuffer=buildEditorRows(roots,buffer,'srwf-final');
  assert.deepEqual(buffer,before,'identity masking must operate on a copied header');
  const plain=Uint8Array.from(before);
  const plainRoots=fixture.segments.map(s=>({...s,bytes:plain.subarray(s.start,s.end)}));
  assert.deepEqual(fromBuffer,buildEditorRows(plainRoots,plain,'srwf-final'));
});
