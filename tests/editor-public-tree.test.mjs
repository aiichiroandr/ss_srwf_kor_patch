import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';

// The public web editor ships only the F v0.5 a/b/c and Final v0.3 a/b/c
// features. v0.4 modules (F scenario connection, in-game runtime, review
// overlay seams, the v0.4 ALICE portrait carrier) are not part of the tree;
// their former call sites use assets/editor-v04-unsupported.mjs.
const root=new URL('../',import.meta.url);
const removed=[
 /^editor-campaign-/,/^editor-ingame-/,/^editor-review-runtime-codec\.mjs$/,/^editor-name-entry-layout\.mjs$/,
 /^editor-v04qa-/,/^editor-alice-face-v04\.mjs$/,/^editor-alice-v04-masks\.mjs$/,
];
const isRemoved=name=>removed.some(re=>re.test(name));
const assets=readdirSync(new URL('assets/',root));

test('the public tree carries no v0.4-only editor module',()=>{
 assert.deepEqual(assets.filter(isRemoved),[]);
 assert.ok(assets.includes('editor-v04-unsupported.mjs'));
 assert.deepEqual(readdirSync(new URL('tests/',root)).filter(n=>/^editor-(campaign|ingame)-/.test(n)),[]);
});

test('the site policy lists none of the removed modules',()=>{
 const policy=JSON.parse(readFileSync(new URL('scripts/site-policy.json',root),'utf8'));
 const listed=[...policy.files,...Object.keys(policy.pins)].filter(p=>p.startsWith('assets/')&&isRemoved(p.slice(7)));
 assert.deepEqual(listed,[]);
 assert.ok(policy.files.includes('assets/editor-v04-unsupported.mjs'));
});

test('no shipped source imports a removed module or names the v0.4 base',()=>{
 const sources=['index.html',...assets.filter(n=>/\.(mjs|js|css|html)$/.test(n)).map(n=>`assets/${n}`)];
 for(const path of sources){
  const text=readFileSync(new URL(path,root),'utf8');
  for(const name of assets.concat(['editor-campaign-','editor-ingame-','editor-review-runtime-codec','editor-name-entry-layout','editor-v04qa-','editor-alice-face-v04','editor-alice-v04-masks'])){
   if(!isRemoved(name))continue;
   assert.equal(text.includes(name),false,`${path} references ${name}`);
  }
  assert.equal(text.includes('28aa876f52135fd6f2af2724b4847b4e992dd501dba56164712c94d2a540a36e'),false,`${path} names the v0.4 base`);
 }
});

test('the stub answers like the switched-off features and refuses everything else',async()=>{
 const s=await import('../assets/editor-v04-unsupported.mjs');
 const refused={code:'EDITOR_REQUEST_INVALID'};
 assert.equal(s.campaignCanonicalTracks({}),null);assert.equal(s.ingameCanonicalTracks({}),null);
 assert.throws(()=>s.campaignCanonicalTracks({fCampaign:{}}),refused);assert.throws(()=>s.ingameCanonicalTracks({ingame:{}}),refused);
 assert.throws(()=>s.campaignDownloadCue(),refused);assert.throws(()=>s.ingameDownloadCue(),refused);
 const root={hidden:false},panel=s.createFCampaignSourcePanel(root);assert.equal(root.hidden,true);
 root.hidden=false;panel.refresh();assert.equal(root.hidden,true);
 const blob=new Blob([new Uint8Array(4)]);
 assert.deepEqual(await s.changeCampaignSaveImage(blob,{gameId:'srwf-final'}),{outputBlob:blob,changedSectors:[]});
 await assert.rejects(s.changeCampaignSaveImage(blob,{gameId:'srwf-final',enabled:true}),refused);
 const owner=s.createFCampaignOwner(),ingame=s.createIngameOwner(),store=s.createFCampaignSourceStore(),session={};
 owner.register(session,{font:'c'});assert.equal(owner.font(session),null);assert.equal(owner.catalog(session),null);
 assert.equal(await owner.write(session,blob),null);assert.throws(()=>owner.connect(),refused);assert.throws(()=>store.prepare(),refused);
 const opened={session,view:{}};assert.equal(await ingame.attachDefault(opened,blob),opened);
 assert.equal(await ingame.write(session,blob),null);assert.equal(ingame.source(session),null);assert.equal(await ingame.has(blob),false);
 const exec=new Uint8Array(8);
 assert.deepEqual(s.campaignSaveExecState(exec,'srwf-final'),{available:false,enabled:false});
 assert.equal(s.setCampaignSaveExec(exec,'srwf-final',false),exec);assert.throws(()=>s.setCampaignSaveExec(exec,'srwf-final',true),refused);
 assert.equal(s.isFCampaignImageSize(521680656+2352,'srwf-final'),true);assert.equal(s.isFCampaignImageSize(521680656,'srwf-final'),false);
 assert.equal(s.isFCampaignImageSize(521680656+2352,'srwf-f'),false);
});
