import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { FakeDocument } from './helpers/fake-dom.mjs';
import { createBattlePreview, paintBattleAsset, battleImageBounds } from '../assets/editor-battle-preview.mjs';

const asset = (subIndex = 0, width = 2, height = 1) => ({ assetKey: `asset-${subIndex}`, fileName: 'USER.DAT', recordIndex: 7, subIndex,
  width, height, pixels: new Uint8ClampedArray(Array.from({length: width * height * 4}, (_, index) => index % 4 === 3 ? 255 : index % 256)) });
const selection = (extra = {}) => ({ sessionToken: 'session-A', gameId: 'srwf-f', weaponIndex: 8,
  weaponName: '테스트 무기', owners: [{unitIndex: 19, name: '테스트 기체'}], ...extra });
const ready = (request, assets = [asset()]) => ({status: 'ready', gameId: 'srwf-f', weaponIndex: request.weaponIndex,
  unitIndex: request.unitIndex, mode: request.mode, defenseId: request.defenseId, assets});
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
test('display trimming removes only transparent margins and retains every visible edge pixel', () => {
  const picture = { ...asset(0, 5, 4), pixels: new Uint8ClampedArray(5 * 4 * 4) };
  picture.pixels[(1 * 5 + 1) * 4 + 3] = 1;
  picture.pixels[(2 * 5 + 3) * 4 + 3] = 255;
  assert.deepEqual(battleImageBounds(picture), { x: 1, y: 1, width: 3, height: 2 });
  const calls = [], canvas = {getContext: () => ({createImageData: (w,h) => ({data: new Uint8ClampedArray(w*h*4)}),
    putImageData: (image,x,y) => calls.push({image,x,y})})};
  assert.equal(paintBattleAsset(canvas, picture, {trim:true}), true);
  assert.deepEqual([canvas.width,canvas.height,calls[0].x,calls[0].y], [3,2,-1,-1]);
  assert.deepEqual(calls[0].image.data, picture.pixels);
  picture.pixels.fill(0);
  assert.deepEqual(battleImageBounds(picture), { x: 0, y: 0, width: 5, height: 4 });
});
function fixture(reader) {
  const document = new FakeDocument(), create = document.createElement.bind(document);
  document.createElement = tag => {
    const element = create(tag);
    if (tag === 'canvas') {
      const context = {createImageData: (width, height) => ({data: new Uint8ClampedArray(width * height * 4)}),
        putImageData: image => { element.drawnPixels = image.data; }};
      element.getContext = () => context;
    }
    return element;
  };
  const container = document.createElement('section'); document.body.append(container);
  container.getClientRects = () => [{}];
  const preview = createBattlePreview({container, requestPreview: reader});
  return {document, container, preview, query: selector => container.querySelector(selector)};
}

test('canvas receives the native RGBA bytes without composing or mirroring a picture', () => {
  const source = asset(), calls = [], context = {createImageData: (width, height) => ({data: new Uint8ClampedArray(width * height * 4)}),
    putImageData: (image, x, y) => calls.push({image, x, y})}, canvas = {getContext: () => context};
  assert.equal(paintBattleAsset(canvas, source), true);
  assert.equal(canvas.width, 2); assert.equal(canvas.height, 1); assert.equal(context.imageSmoothingEnabled, false);
  assert.deepEqual(calls[0].image.data, source.pixels); assert.deepEqual([calls[0].x, calls[0].y], [0, 0]);
  assert.equal(paintBattleAsset(canvas, {...source, pixels: new Uint8Array(3)}), false);
});

test('an unknown owner never substitutes unit zero; unknown, unsupported and empty remain distinct', async () => {
  const requests = [], f = fixture(async request => {requests.push(request); return {...ready(request), status: request.mode === 'attack' ? 'unmapped' : request.mode === 'hit' ? 'unsupported' : 'empty'};});
  await f.preview.select(selection({owners: []})); assert.equal(requests.length, 0); assert.equal(f.preview.snapshot().unitIndex, null);
  assert.match(f.query('.battle-preview-status').textContent, /아직 확인/);
  await f.preview.select(selection()); assert.equal(f.preview.snapshot().status, 'unmapped'); assert.equal(f.query('canvas'), null);
  const hit = f.query('[data-battle-mode="hit"]'); hit.focus(); hit.click(); await flush();
  assert.equal(f.document.activeElement, hit); assert.equal(f.preview.snapshot().status, 'unsupported');
  assert.match(f.query('.battle-preview-status').textContent, /지원하지/);
  f.query('[data-battle-mode="evade"]').click(); await flush();
  assert.equal(f.preview.snapshot().status, 'empty'); assert.match(f.query('.battle-preview-status').textContent, /비어/);
  assert.equal(f.query('canvas'), null); f.preview.destroy();
});

test('late results from a prior weapon/session cannot paint over a new selection or steal focus', async () => {
  const pending = [], f = fixture(request => new Promise(resolve => pending.push({request, resolve})));
  const old = f.preview.select(selection()); await flush();
  const recent = f.preview.select(selection({weaponIndex: 9})); await flush();
  assert.equal(pending[0].request.signal.aborted, true);
  const mode = f.query('[data-battle-mode="attack"]'); mode.focus();
  pending[1].resolve(ready(pending[1].request, [asset(2)])); await recent;
  pending[0].resolve(ready(pending[0].request, [asset(0)])); await old;
  assert.equal(f.preview.snapshot().weaponIndex, 9); assert.equal(f.preview.snapshot().assetFilter, 'asset-2');
  assert.equal(f.document.activeElement, mode); assert.deepEqual(f.query('canvas').drawnPixels, asset(2).pixels);
  const changing = f.preview.select(selection({sessionToken: 'session-B'})); await flush();
  f.preview.destroy(); assert.equal(pending[2].request.signal.aborted, true); assert.equal(f.container.children.length, 0);
  pending[2].resolve(ready(pending[2].request)); await changing; assert.equal(f.container.children.length, 0);
});

test('many unordered subpictures default to one; explicit gallery pages contain at most four', async () => {
  const assets = Array.from({length: 17}, (_, i) => asset(i));
  const f = fixture(async request => ready(request, assets)); await f.preview.select(selection());
  assert.equal(f.container.querySelectorAll('canvas').length, 1); assert.equal(f.query('.battle-preview-count').textContent, '1 / 17');
  f.query('.battle-preview-next').click(); assert.equal(f.preview.snapshot().assetFilter, 'asset-1');
  const picker = f.query('.battle-preview-assets'); picker.focus(); picker.value = 'all'; picker.dispatchEvent({type: 'change'});
  assert.equal(f.container.querySelectorAll('canvas').length, 4); assert.equal(f.document.activeElement, picker);
  for (let i = 0; i < 4; i++) f.query('.battle-preview-next').click();
  assert.equal(f.container.querySelectorAll('canvas').length, 1); assert.equal(f.query('.battle-preview-count').textContent, '17–17 / 17');
  assert.equal(f.query('.battle-preview-next').disabled, true);
  await f.preview.select(selection()); assert.equal(f.preview.snapshot().assetFilter, 'all'); assert.equal(f.query('.battle-preview-count').textContent, '17–17 / 17');
  f.preview.destroy();
});

test('verified owner, mode and defense choices survive refresh while reads can be cancelled for busy work', async () => {
  const requests = [], input = selection({owners: [{unitIndex: 19, name: '기체19'}, {unitIndex: 23, name: '기체23'}], defenseOptions: [{id: 'shield', label: '실드'}]});
  const f = fixture(async request => {requests.push(request); return ready(request);}); await f.preview.select(input);
  const owners = f.query('.battle-preview-owner'); owners.value = '23'; owners.dispatchEvent({type: 'change'}); await flush();
  assert.equal(f.query('.battle-preview-defense').hidden, true);
  f.query('[data-battle-mode="defense"]').click(); await flush();
  assert.equal(f.query('.battle-preview-defense').hidden, false);
  const defense = f.query('.battle-preview-defense'); defense.value = 'shield'; defense.dispatchEvent({type: 'change'}); await flush();
  assert.equal(requests.at(-1).unitIndex, 23); assert.equal(requests.at(-1).defenseId, 'shield'); assert.equal(requests.at(-1).mode, 'defense');
  const before = requests.length; await f.preview.select(input); assert.equal(requests.length, before);
  f.preview.setBusy(true); assert.equal(f.query('[data-battle-mode="attack"]').disabled, true);
  f.preview.setBusy(false); await flush(); assert.equal(requests.at(-1).unitIndex, 23); assert.equal(requests.at(-1).defenseId, 'shield');
  f.preview.clear(); await f.preview.select(selection({sessionToken: 'session-B'})); assert.equal(f.preview.snapshot().mode, 'attack');
  f.preview.destroy();
});

test('changing state starts at its first source picture even when an attack picture is shared', async () => {
  const f = fixture(async request => ready(request, request.mode === 'attack'
    ? [asset(0), asset(1)] : [asset(9), asset(1)]));
  await f.preview.select(selection());
  f.query('.battle-preview-next').click();
  assert.equal(f.preview.snapshot().assetFilter, 'asset-1');
  f.query('[data-battle-mode="destroyed"]').click(); await flush();
  assert.equal(f.preview.snapshot().assetFilter, 'asset-9');
  assert.equal(f.query('.battle-preview-count').textContent, '1 / 2');
  await f.preview.select(selection());
  assert.equal(f.preview.snapshot().assetFilter, 'asset-9');
  f.preview.destroy();
});

test('a destruction path labels incoming weapon assets separately from destruction effects', async () => {
  const f = fixture(async request => ready(request, [
    { ...asset(0), role: 'common-destruction-sprite' },
    { ...asset(1), role: 'weapon-state-sprite' },
    { ...asset(2), role: 'selected-unit-reaction-sprite' },
  ]));
  await f.preview.select(selection());
  f.query('[data-battle-mode="destroyed"]').click(); await flush();
  assert.deepEqual([...f.query('.battle-preview-assets').children].slice(0, 3).map(node => node.textContent),
    ['격추 효과 1', '무기 효과 2', '기체 그림 3']);
  f.preview.destroy();
});

test('a ready picture from a mismatched result identity fails closed', async () => {
  const f = fixture(async request => ({...ready(request), unitIndex: 0})); await f.preview.select(selection());
  assert.equal(f.preview.snapshot().status, 'unsupported'); assert.equal(f.query('canvas'), null); f.preview.destroy();
});

const defenseChoices = [{id: 'swordcut', label: '베어내기'}, {id: 'beam-field', label: '빔 필드'}];
const evadeChoices = [{id: 'afterimage', label: '분신'}];
const effectOptions = f => [...f.query('.battle-preview-defense').children].map(node => [node.value, node.textContent]);
const pickEffect = (f, id) => {
  const picker = f.query('.battle-preview-defense'); picker.value = id; picker.dispatchEvent({type: 'change'});
};

test('ready and unmapped responses supply mode-specific choices without adding a sixth mode button', async t => {
  for (const responseStatus of ['ready', 'unmapped']) for (const mode of ['defense', 'evade']) {
    await t.test(`${responseStatus} ${mode}`, async () => {
      const requests = [], field = mode === 'evade' ? 'evadeOptions' : 'defenseOptions';
      const choices = mode === 'evade' ? evadeChoices : defenseChoices;
      const f = fixture(async request => {
        requests.push(request);
        return {...ready(request), status: request.mode === mode ? responseStatus : 'ready',
          [field]: [...choices, choices[0], {id: '../unknown', label: '미확인'}, {id: 'blank', label: ''}]};
      });
      await f.preview.select(selection());
      assert.equal(f.query('.battle-preview-defense').hidden, true);
      assert.equal(f.query('.battle-preview-modes').children.length, 5);
      assert.ok(f.query('.battle-preview-modes').children.every(node => node.tagName === 'BUTTON'));
      f.query(`[data-battle-mode="${mode}"]`).click(); await flush();
      assert.equal(f.preview.snapshot().status, responseStatus);
      assert.equal(f.query('.battle-preview-defense').hidden, false);
      assert.equal(f.query('.battle-preview-defense').getAttribute('aria-label'), mode === 'evade' ? '회피 효과 선택' : '방어 효과 선택');
      assert.deepEqual(effectOptions(f), [['', mode === 'evade' ? '일반 회피' : '일반 방어'], ...choices.map(({id, label}) => [id, label])]);
      assert.equal(Boolean(f.query('canvas')), responseStatus === 'ready');
      pickEffect(f, choices.at(-1).id); await flush();
      assert.equal(requests.at(-1).mode, mode);
      assert.equal(requests.at(-1).defenseId, choices.at(-1).id);
      f.query('[data-battle-mode="attack"]').click(); await flush();
      assert.equal(f.query('.battle-preview-defense').hidden, true);
      assert.equal(Object.hasOwn(requests.at(-1), 'defenseId'), false);
      f.preview.destroy();
    });
  }
});

test('afterimage evade and defense effects keep separate remembered selections without rereading on refresh', async () => {
  const requests = [], f = fixture(async request => {
    requests.push(request); return {...ready(request), defenseOptions: defenseChoices, evadeOptions: evadeChoices};
  });
  const input = selection(); await f.preview.select(input);
  f.query('[data-battle-mode="evade"]').click(); await flush(); pickEffect(f, 'afterimage'); await flush();
  assert.equal(requests.at(-1).defenseId, 'afterimage');
  f.query('[data-battle-mode="defense"]').click(); await flush();
  assert.equal(requests.at(-1).defenseId, undefined);
  assert.equal(f.query('.battle-preview-defense').value, '');
  pickEffect(f, 'beam-field'); await flush();
  assert.deepEqual([f.preview.snapshot().defenseId, f.preview.snapshot().evadeId], ['beam-field', 'afterimage']);
  const before = requests.length;
  await f.preview.select(input); await f.preview.select({...input});
  assert.equal(requests.length, before);
  assert.equal(f.query('.battle-preview-defense').value, 'beam-field');
  assert.deepEqual(effectOptions(f).slice(1), defenseChoices.map(({id, label}) => [id, label]));
  f.query('[data-battle-mode="evade"]').click(); await flush();
  assert.equal(requests.at(-1).defenseId, 'afterimage');
  assert.equal(f.query('.battle-preview-defense').value, 'afterimage');
  f.query('[data-battle-mode="defense"]').click(); await flush();
  assert.equal(requests.at(-1).defenseId, 'beam-field');
  const weapon9 = selection({weaponIndex: 9}); await f.preview.select(weapon9); await f.preview.select(input);
  assert.equal(f.preview.snapshot().mode, 'defense');
  assert.equal(requests.at(-1).defenseId, 'beam-field');
  f.query('[data-battle-mode="evade"]').click(); await flush();
  assert.equal(requests.at(-1).defenseId, 'afterimage');
  f.preview.destroy();
});

test('a repeated selection shares the pending effect read and retains options from an unmapped response', async () => {
  let finish, effectReads = 0;
  const f = fixture(request => request.mode === 'attack' ? Promise.resolve(ready(request)) : new Promise(resolve => {
    effectReads++; finish = () => resolve({...ready(request), status: 'unmapped', evadeOptions: evadeChoices});
  }));
  const input = selection(); await f.preview.select(input);
  f.query('[data-battle-mode="evade"]').click(); await flush();
  const refresh = f.preview.select(input), second = f.preview.select({...input});
  assert.equal(effectReads, 1); finish(); await Promise.all([refresh, second]);
  await f.preview.select(input); assert.equal(effectReads, 1);
  assert.equal(f.preview.snapshot().status, 'unmapped');
  assert.deepEqual(effectOptions(f), [['', '일반 회피'], ['afterimage', '분신']]);
  f.preview.destroy();
});

test('a late effect result cannot replace the latest effect pixels or its dynamic options', async () => {
  const pending = [], f = fixture(request => request.mode === 'attack' ? Promise.resolve(ready(request))
    : new Promise(resolve => pending.push({request, resolve})));
  await f.preview.select(selection({defenseOptions: defenseChoices}));
  f.query('[data-battle-mode="defense"]').click(); await flush();
  pending[0].resolve({...ready(pending[0].request), status: 'unmapped', defenseOptions: defenseChoices}); await flush();
  pickEffect(f, 'swordcut'); await flush(); pickEffect(f, 'beam-field'); await flush();
  assert.equal(pending[1].request.signal.aborted, true); assert.equal(f.query('canvas'), null);
  pending[2].resolve({...ready(pending[2].request, [asset(2)]), defenseOptions: defenseChoices}); await flush();
  pending[1].resolve({...ready(pending[1].request, [asset(3)]), defenseOptions: [{id: 'swordcut', label: '오래된 선택지'}]}); await flush();
  assert.equal(f.preview.snapshot().defenseId, 'beam-field');
  assert.equal(f.preview.snapshot().assetFilter, 'asset-2');
  assert.deepEqual(f.query('canvas').drawnPixels, asset(2).pixels);
  assert.deepEqual(effectOptions(f).slice(1), defenseChoices.map(({id, label}) => [id, label]));
  f.preview.destroy();
});

test('mismatched effect identities reject both pixels and dynamic choices in either mode', async t => {
  for (const mode of ['defense', 'evade']) for (const status of ['ready', 'unmapped']) {
    await t.test(`${mode} ${status}`, async () => {
      const field = mode === 'evade' ? 'evadeOptions' : 'defenseOptions';
      const choices = mode === 'evade' ? evadeChoices : defenseChoices;
      const f = fixture(async request => request.mode === 'attack' ? ready(request) : {
        ...ready(request), status, defenseId: 'another-effect', [field]: [{id: 'another-effect', label: '잘못된 응답 선택지'}],
      });
      await f.preview.select(selection({[field]: choices}));
      f.query(`[data-battle-mode="${mode}"]`).click(); await flush();
      assert.equal(f.preview.snapshot().status, 'unsupported');
      assert.equal(f.query('canvas'), null); assert.equal(f.preview.snapshot().assetCount, 0);
      assert.deepEqual(effectOptions(f).slice(1), choices.map(({id, label}) => [id, label]));
      f.preview.destroy();
    });
  }
});

test('clear drops dynamic choices, remembered effects and late session-owned options', async () => {
  let late, defer = false;
  const f = fixture(request => defer ? new Promise(resolve => {late = {request, resolve};})
    : Promise.resolve({...ready(request), defenseOptions: defenseChoices, evadeOptions: evadeChoices}));
  const input = selection(); await f.preview.select(input);
  f.query('[data-battle-mode="evade"]').click(); await flush(); pickEffect(f, 'afterimage'); await flush();
  f.query('[data-battle-mode="defense"]').click(); await flush(); pickEffect(f, 'beam-field'); await flush();
  defer = true; f.query('[data-battle-mode="evade"]').click(); await flush();
  f.preview.clear();
  assert.equal(late.request.signal.aborted, true); assert.deepEqual(effectOptions(f), []);
  assert.equal(f.query('.battle-preview-defense').hidden, true); assert.equal(f.query('canvas'), null);
  assert.deepEqual([f.preview.snapshot().defenseId, f.preview.snapshot().evadeId, f.preview.snapshot().mode], [undefined, undefined, 'attack']);
  late.resolve({...ready(late.request), evadeOptions: [{id: 'late-choice', label: '이전 세션'}]}); await flush();
  assert.deepEqual(effectOptions(f), []); assert.equal(f.preview.snapshot().status, 'idle');
  defer = false; await f.preview.select(selection({sessionToken: 'session-B'}));
  assert.equal(f.preview.snapshot().mode, 'attack'); assert.equal(f.query('.battle-preview-defense').hidden, true);
  f.query('[data-battle-mode="defense"]').click(); await flush();
  assert.equal(f.query('.battle-preview-defense').value, '');
  assert.deepEqual([f.preview.snapshot().defenseId, f.preview.snapshot().evadeId], [undefined, undefined]);
  f.preview.destroy();
});

test('320/390px preview fits five modes, dynamic full-width effects and native pictures', {skip: !process.env.SRWF_EDITOR_PLAYWRIGHT}, async () => {
  const {chromium} = createRequire(import.meta.url)(process.env.SRWF_EDITOR_PLAYWRIGHT);
  const browser = await chromium.launch({headless: true, ...(process.env.SRWF_EDITOR_BROWSER ? {executablePath: process.env.SRWF_EDITOR_BROWSER} : {})});
  const [css, script] = await Promise.all([readFile(new URL('../assets/editor-runtime.css', import.meta.url), 'utf8'), readFile(new URL('../assets/editor-battle-preview.mjs', import.meta.url), 'utf8')]);
  try {
    for (const width of [320, 390]) {
      const page = await browser.newPage({viewport: {width, height: 568}});
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.setContent(`<style>${css}</style><body style="margin:0;background:#061218"><section id="preview" style="box-sizing:border-box;width:100%;padding:8px"></section></body>`);
      await page.evaluate(async source => {
        const url = URL.createObjectURL(new Blob([source], {type: 'text/javascript'})); const {createBattlePreview} = await import(url); URL.revokeObjectURL(url);
        const assets = Array.from({length: 17}, (_, subIndex) => ({assetKey: 'asset-'+subIndex, subIndex, width: 512, height: 256,
          pixels: new Uint8ClampedArray(512 * 256 * 4).fill(255)}));
        window.requests = [];
        window.preview = createBattlePreview({container: document.getElementById('preview'), requestPreview: async request => {
          window.requests.push({mode: request.mode, defenseId: request.defenseId});
          return {...request, gameId: 'srwf-f', status: request.mode === 'evade' && !request.defenseId ? 'unmapped' : 'ready', assets,
            defenseOptions: [{id:'beam-field', label:'빔 필드 · 현재 기체에서 확인된 방어 효과'}], evadeOptions: [{id:'afterimage', label:'분신'}]};
        }});
        await window.preview.select({sessionToken:'browser', gameId:'srwf-f', weaponIndex:8, owners:[{unitIndex:19,name:'테스트 기체19'},{unitIndex:23,name:'테스트 기체23'}]});
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, script);
      const inspect = () => page.evaluate(() => ({overflow:document.documentElement.scrollWidth > innerWidth,
        canvases:[...document.querySelectorAll('canvas')].map(canvas => ({native:canvas.width,rect:canvas.getBoundingClientRect().toJSON(),frame:canvas.parentNode.getBoundingClientRect().toJSON()})),
        buttons:[...document.querySelectorAll('.battle-preview-modes > *')].map(node => node.getBoundingClientRect().toJSON()),
        modes:document.querySelector('.battle-preview-modes').getBoundingClientRect().toJSON(),
        effect:{hidden:document.querySelector('.battle-preview-defense').hidden,rect:document.querySelector('.battle-preview-defense').getBoundingClientRect().toJSON()},
        pane:document.querySelector('#preview').getBoundingClientRect().toJSON()}));
      let measured = await inspect(); assert.equal(measured.overflow, false); assert.equal(measured.canvases.length, 1);
      assert.equal(measured.buttons.length, 5); assert.equal(measured.effect.hidden, true);
      for (const canvas of measured.canvases) {assert.equal(canvas.native, 512); assert.ok(canvas.rect.width <= canvas.frame.width); assert.ok(canvas.rect.right <= width);}
      for (const button of measured.buttons) {assert.ok(button.width >= 35); assert.ok(button.height >= 34); assert.ok(button.right <= width);}
      await page.locator('.battle-preview-assets').selectOption('all'); measured = await inspect();
      assert.equal(measured.overflow, false); assert.equal(measured.canvases.length, 4); assert.ok(measured.pane.height < 400);
      for (const canvas of measured.canvases) assert.ok(canvas.rect.right <= width);
      await page.locator('[data-battle-mode="defense"]').click();
      await page.waitForFunction(() => window.preview.snapshot().mode === 'defense' && window.preview.snapshot().status === 'ready');
      measured = await inspect();
      assert.equal(measured.overflow, false); assert.equal(measured.buttons.length, 5); assert.equal(measured.effect.hidden, false);
      assert.ok(Math.abs(measured.effect.rect.width - measured.modes.width) < 1);
      assert.ok(measured.effect.rect.top >= measured.modes.bottom); assert.ok(measured.effect.rect.right <= width);
      await page.locator('.battle-preview-defense').selectOption('beam-field');
      await page.waitForFunction(() => window.preview.snapshot().defenseId === 'beam-field' && window.preview.snapshot().status === 'ready');
      await page.locator('[data-battle-mode="evade"]').click();
      await page.waitForFunction(() => window.preview.snapshot().mode === 'evade' && window.preview.snapshot().status === 'unmapped');
      assert.equal(await page.locator('canvas').count(), 0);
      assert.equal(await page.locator('.battle-preview-defense').getAttribute('aria-label'), '회피 효과 선택');
      await page.locator('.battle-preview-defense').selectOption('afterimage');
      await page.waitForFunction(() => window.preview.snapshot().evadeId === 'afterimage' && window.preview.snapshot().status === 'ready');
      measured = await inspect(); assert.equal(measured.overflow, false); assert.equal(measured.canvases.length, 1);
      assert.equal(await page.locator('.battle-preview-assets').inputValue(), 'asset-0');
      await page.locator('.battle-preview-assets').selectOption('all');
      measured = await inspect(); assert.equal(measured.overflow, false); assert.equal(measured.canvases.length, 4);
      for (const canvas of measured.canvases) assert.ok(canvas.rect.right <= width);
      await page.locator('[data-battle-mode="defense"]').click();
      await page.waitForFunction(() => window.preview.snapshot().mode === 'defense' && window.preview.snapshot().status === 'ready');
      assert.equal(await page.locator('.battle-preview-defense').inputValue(), 'beam-field');
      await page.locator('[data-battle-mode="attack"]').click();
      await page.waitForFunction(() => window.preview.snapshot().mode === 'attack' && window.preview.snapshot().status === 'ready');
      assert.equal((await inspect()).effect.hidden, true);
      assert.equal(await page.evaluate(() => window.requests.at(-1).defenseId), undefined);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {await browser.close();}
});
