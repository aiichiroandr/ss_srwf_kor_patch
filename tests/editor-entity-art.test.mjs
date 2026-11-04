import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { createEntityArtwork, paintEntityPortrait } from '../assets/editor-entity-art.mjs';

const document = installFakeDom(), createElement = document.createElement.bind(document);
document.createElement = tag => {
  const element = createElement(tag);
  if (tag === 'canvas') element.getContext = () => ({
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: (image, x, y) => { element.painted = { image, x, y }; },
  });
  return element;
};
const image = { width: 2, height: 2, pixels: new Uint8ClampedArray(16).fill(255) };
function model() {
  const palette = new Uint8Array(128), pixels = new Uint8Array(65536);
  palette[34] = 3; palette[35] = 224; // Enemy palette, color 1: green.
  pixels[9 * 128] = 0x10;
  return { units: [{ recordIndex: 7, mapIcon: 9, name: '기체7' }], mapIcons: { palette, pixels },
    deployments: [{ recordIndex: '0:4', unitId: 7, pilotId: 8, faction: 'enemy', factionSource: 'ca02-group-selector' }] };
}

test('reward appearance and weapon owner icons use the unit record mapping and only proven faction palettes', () => {
  const data = model(), art = createEntityArtwork({ model: () => data, session: () => null });
  const reward = document.createElement('button'); art.append(reward, { kind: 'deployment', recordIndex: '0:4' });
  const icon = reward.querySelector('canvas');
  assert.equal(icon.dataset.unitId, '7'); assert.equal(icon.dataset.faction, 'enemy');
  assert.deepEqual([...icon.painted.image.data.slice(0, 4)], [0, 248, 0, 255]);
  const owner = document.createElement('button'); art.append(owner, { unitId: 7 }, { pilot: false });
  assert.equal(owner.querySelector('canvas').dataset.faction, 'unknown');
  const roster = document.createElement('button'); art.append(roster, { placementKind: 'roster-reference', unitId: null });
  assert.equal(roster.children.length, 0);
});

test('portraits use resolved aliases, ignore stale sessions, and never guess a player-created hero face', async () => {
  let token = 'first', resolve, requested;
  const data = model(), art = createEntityArtwork({ model: () => data, session: () => token,
    pilot: () => ({ recordIndex: 8, previewIndex: 5, name: '파일럿' }),
    portrait: id => { requested = id; return new Promise(done => { resolve = done; }); } });
  const target = document.createElement('span'); art.append(target, data.deployments[0]);
  await Promise.resolve(); assert.equal(requested, 5);
  token = 'second'; resolve({ image }); await Promise.resolve(); await Promise.resolve();
  assert.equal(target.querySelector('.entity-pilot-portrait').hidden, true);
  requested = null;
  art.append(document.createElement('span'), { unitId: 7, pilotId: 302 }); await Promise.resolve();
  assert.equal(requested, null);
});

test('portrait cropping retains all pixels in bounds and rejects malformed image dimensions', () => {
  const canvas = document.createElement('canvas');
  assert.equal(paintEntityPortrait(canvas, { image, bounds: { x: 1, y: 0, width: 1, height: 2 } }), true);
  assert.deepEqual([canvas.width, canvas.height, canvas.painted.x], [1, 2, -1]);
  assert.equal(Math.abs(canvas.painted.y), 0);
  assert.equal(paintEntityPortrait(canvas, { image, bounds: { x: 1, y: 0, width: 2, height: 2 } }), false);
  assert.equal(paintEntityPortrait(canvas, { image: { ...image, width: 513 } }), false);
});

test('free sortie locations have a visible slot badge without fabricating a unit ID or portrait',()=>{
 const art=createEntityArtwork({model,session:()=>null}),target=document.createElement('span');
 art.append(target,{placementKind:'sortie-position',unitId:null,pilotId:null});
 assert.equal(target.querySelector('.entity-sortie-slot').textContent,'출격');
 assert.equal(target.querySelector('canvas'),null);
});
