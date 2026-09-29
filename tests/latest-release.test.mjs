import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getPatchNotesForRelease,isSummaryOnlyPatchNotesRelease} from '../assets/release-notes.mjs';
test('latest local F/FIN rows pin all fonts, acceptance, shortcut, and BGM tables',async()=>{
 const index=JSON.parse(await readFile(new URL('../manifest/releases.json',import.meta.url)));
 const app=await readFile(new URL('../assets/app.mjs',import.meta.url),'utf8');
 for(const [game,version] of [['srwf-f','v0-5'],['srwf-final','v0-2']]){
  assert.equal(index.games.find(x=>x.id===game).defaultReleaseId,`${game}-20260928-${version}-a`);
  for(const lane of 'abc'){
   const id=`${game}-20260928-${version}-${lane}`,row=index.releases.find(x=>x.id===id);assert.equal(row.state,'ACCEPTED');
   const bytes=await readFile(new URL('../'+row.manifest,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),row.manifestSha256);
   const m=JSON.parse(bytes),notes=getPatchNotesForRelease(id);assert.ok(isSummaryOnlyPatchNotesRelease(id));assert.match(notes.summary,/버튼 \+ START/);assert.match(notes.summary,/일괄 개조/);assert.equal(notes.bgmTables.length,2);assert.equal(notes.bgmTables[0].rows.length,6);assert.ok(app.includes(m.target.sha256));
   const receipt=JSON.parse(await readFile(new URL('../receipts/'+id+'.acceptance.json',import.meta.url)));assert.equal(receipt.targetSha256,m.target.sha256);assert.equal(receipt.patchSha256,m.patch.sha256);assert.equal(receipt.gates.longPlayProgression,'NOT_CLAIMED');
   // A row may be a variant of a shared v3 payload (one file per a/b/c group). Then the row, its receipt and its
   // index neighbours must all name the same payload, and the variant is the release id suffix.
   if(m.patch.format==='srwf.sparse-byte-delta.v3'){
    assert.equal(m.patch.variant,lane);assert.equal(m.patch.url,`patches/${game}-20260928-${version}.v3.srwfp`);
    assert.equal(receipt.patchFormat,'srwf.sparse-byte-delta.v3');assert.equal(receipt.variantId,lane);
    assert.ok(m.target.filename.endsWith(`-${lane}.bin`));assert.ok(m.title.endsWith(`(${lane})`));
    for(const other of 'abc'){const om=JSON.parse(await readFile(new URL(`../releases/${game}-20260928-${version}-${other}.json`,import.meta.url)));
     assert.equal(om.patch.url,m.patch.url);assert.equal(om.patch.sha256,m.patch.sha256);assert.equal(om.patch.size,m.patch.size);assert.equal(om.patch.commonRecordCount,m.patch.commonRecordCount);assert.equal(om.patch.bodyUncompressedSize,m.patch.bodyUncompressedSize);assert.equal(om.patch.variant,other)}
   }else{assert.equal(Object.hasOwn(receipt,'patchFormat'),false)}
  }
 }
});

// The browser harness must work for shared v3 payloads (one file per a/b/c group) and for per-release
// v1/v2 payloads alike; its planning half runs without Playwright or any stock image.
test('local download harness plans one session per shared payload and one per single-release patch', async () => {
  const { createRequire } = await import('node:module');
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const harness = createRequire(import.meta.url)('../scripts/check_local_release_downloads.cjs');

  // Real repository: whatever the indexed formats are, the plan is consistent with the manifests.
  const catalog = harness.loadCatalog();
  const selected = harness.selectEntries(catalog, {});
  const sessions = harness.buildSessions(selected);
  assert.deepEqual(selected.map((entry) => entry.id).sort(), [
    'srwf-f-20260928-v0-5-a', 'srwf-f-20260928-v0-5-b', 'srwf-f-20260928-v0-5-c',
    'srwf-final-20260928-v0-2-a', 'srwf-final-20260928-v0-2-b', 'srwf-final-20260928-v0-2-c',
  ]);
  assert.equal(sessions.length, new Set(selected.map((entry) => entry.patchUrl)).size);
  for (const session of sessions) {
    assert.equal(session.expectedPayloadRequests, 1);
    assert.equal(session.entries.length, session.shared ? 3 : 1);
    assert.ok(session.entries.every((entry) => entry.shared === session.shared));
  }
  assert.equal(harness.selectEntries(catalog, { all: true }).length, catalog.entries.length);
  assert.deepEqual(harness.selectEntries(catalog, { releases: ['srwf-f-20260928-v0-5-c'] }).map((entry) => entry.id), ['srwf-f-20260928-v0-5-c']);
  assert.throws(() => harness.selectEntries(catalog, { releases: ['nope'] }), /not indexed/);
  assert.deepEqual(harness.parseArgs(['--plan', '--release', 'x,y', '--release', 'z']), { plan: true, all: false, releases: ['x', 'y', 'z'] });
  assert.throws(() => harness.parseArgs(['--bogus']), /Unknown argument/);
  assert.throws(() => harness.parseArgs(['--release']), /needs an id/);
  assert.deepEqual(harness.groupOf('srwf-f-20260928-v0-5-b'), { group: 'srwf-f-20260928-v0-5', lane: 'b' });
  assert.deepEqual(harness.groupOf('srwf-f-20260823-v0-3'), { group: 'srwf-f-20260823-v0-3', lane: null });

  // Synthetic site: a shared v3 group next to a single-release v1 row.
  const site = await mkdtemp(join(tmpdir(), 'srwf-harness-'));
  try {
    await mkdir(join(site, 'manifest'));
    await mkdir(join(site, 'releases'));
    const rows = [];
    const write = async (id, gameId, patch) => {
      const manifest = {
        patch,
        target: { filename: `${id}.bin`, cueFilename: `${id}.cue`, size: 1, sha256: 'b'.repeat(64) },
      };
      await writeFile(join(site, 'releases', `${id}.json`), JSON.stringify(manifest));
      rows.push({ gameId, id, state: 'ACCEPTED', label: 'x', manifest: `releases/${id}.json`, manifestSha256: 'a'.repeat(64) });
    };
    const shared = { format: 'srwf.sparse-byte-delta.v3', url: 'patches/srwf-f-20260928-v0-5.v3.srwfp', size: 9, sha256: 'c'.repeat(64) };
    for (const lane of ['c', 'a', 'b']) {
      await write(`srwf-f-20260928-v0-5-${lane}`, 'srwf-f', { ...shared, variant: lane });
    }
    await write('srwf-f-20260823-v0-3', 'srwf-f', { format: 'srwf.sparse-byte-delta.v1', url: 'patches/srwf-f-20260823-v0-3.srwfp', size: 5, sha256: 'd'.repeat(64) });
    const index = { games: [{ id: 'srwf-f', defaultReleaseId: 'srwf-f-20260928-v0-5-a' }], releases: rows };
    await writeFile(join(site, 'manifest', 'releases.json'), JSON.stringify(index));
    const synthetic = harness.loadCatalog(site);
    const plan = harness.buildSessions(harness.selectEntries(synthetic, {}));
    assert.equal(plan.length, 1);
    assert.equal(plan[0].shared, true);
    assert.deepEqual(plan[0].entries.map((entry) => entry.lane), ['a', 'b', 'c'], 'lanes run a -> b -> c on one page');
    assert.equal(plan[0].expectedPayloadRequests, 1);
    const everything = harness.buildSessions(harness.selectEntries(synthetic, { all: true }));
    assert.deepEqual(everything.map((session) => [session.shared, session.entries.length]), [[false, 1], [true, 3]]);

    // A row whose variant is not its suffix, or rows that disagree about the payload, are refused.
    const lying = synthetic.entries.map((entry) => (entry.id.endsWith('-b') ? { ...entry, variant: 'c' } : entry));
    assert.throws(() => harness.buildSessions(harness.selectEntries({ index, entries: lying }, {})), /variant is its suffix/);
    const forked = synthetic.entries.map((entry) => (entry.id.endsWith('-b') ? { ...entry, patchSha256: 'e'.repeat(64) } : entry));
    assert.throws(() => harness.buildSessions(harness.selectEntries({ index, entries: forked }, {})), /disagree about the payload/);
  } finally {
    await rm(site, { recursive: true, force: true });
  }
});
