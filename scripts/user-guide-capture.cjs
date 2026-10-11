#!/usr/bin/env node
// Capture the real site UI using invented records only. No user disc or extracted game art is loaded.
// Usage: node scripts/user-guide-capture.cjs --url=http://127.0.0.1:8811/ --out=/absolute/output
const fs = require('node:fs');
const path = require('node:path');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const i = arg.indexOf('='); return [arg.slice(0, i), arg.slice(i + 1)]; }));
const { chromium } = require(args['--playwright'] || 'playwright');
if (!args['--out']) throw Error('--out is required');
const out = path.resolve(args['--out']);
const editorScreens = ['edit', 'unit', 'unit-terrain', 'unit-abilities', 'pilot', 'spirits', 'skills', 'weapon', 'weapon-terrain', 'changes'];
const allScreens = ['folder', 'stock', 'native', 'patched', 'personal', ...editorScreens, 'preset', 'save', 'downloads'];
const screens = args['--only'] ? allScreens.filter(screen => args['--only'].split(',').includes(screen)) : allScreens;
const report = { purpose: 'Manual screenshots: current HTML/CSS, invented example records, no disc/game art.', errors: [], screens: [] };

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(args['--browser'] ? { executablePath: args['--browser'] } : {}) });
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  page.on('pageerror', error => report.errors.push(error.message));
  try {
    for (const [device, width, height] of [['desktop', 1440, 900], ['portrait', 390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.goto(args['--url'] || 'http://127.0.0.1:8811/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !document.getElementById('gameSelect').disabled);
      await page.evaluate(async () => {
        const source = [...document.scripts].find(script => /\/app\.mjs/.test(script.src)).src;
        const h = (await import(source)).__testHooks;
        window.guideCapture = h;
        const common = { nameStatus: 'decoded', recordKind: 'regular', kindReason: null, editable: true, readOnlyReason: null, defaultVisible: true };
        const units = [
          { ...common, recordIndex: 1, name: '예시 기체 1', hp: 3000, en: 100, armor: 800, speed: 70, limit: 150, move: 6, ground: 4, sea: 2, air: 4, space: 3, shield: 0, parry: 0,
            ability1: 0, abilityValue1: 0, ability2: 0, abilityValue2: 0, ability3: 0, abilityValue3: 0, ability4: 0, abilityValue4: 0,
            weaponList: { status: 'known', placeholder: false, problems: [], notes: [], declaredCount: 1, terminatedCount: 1, entries: [{ entryIndex: 0, slot: 1, weaponIndex: 1, ammoSlot: 0, requiresFlag: false, flagNumber: null, requiresInvestment: false, valid: true }], rawEntries: [] } },
        ];
        for (const index of [2, 3]) units.push({ ...units[0], recordIndex: index, name: `예시 기체 ${index}`, weaponList: null });
        const spirits = [3, 26, 4].map((id, i) => ({ id, level: [1, 10, 20][i], name: `예시 정신 ${i + 1}`, unresolved: false, eventFlag: null, offset: 0, placeholder: false }));
        const skills = [{ id: 33, level: 1, name: '예시 능력 1', unresolved: false }, { id: 34, level: 10, name: '예시 능력 2', unresolved: false }];
        const pilots = [{ ...common, recordIndex: 1, name: '예시 파일럿', statsValid: true, exp: 0, atk: 100, shot: 100, hit: 100, agi: 100, tech: 100, cnt: 100, mp: 50, ground: 4, sea: 3, air: 4, space: 4,
          attackGrowth: 1, shotGrowth: 1, hitGrowth: 1, techGrowth: 1, agiGrowth: 1, cntGrowth: 1, mindGrowth: 1, syncGrowth: 1,
          spiritCommands: spirits, spirits, specialAbilities: skills, extraSpirits: [], noSpiritInDisc: false,
          spiritEditable: true, spiritEditReason: null, spiritSlots: 6, spiritMinimum: 1, spiritMinimumReason: 'keeps-spirit-block',
          addableSpirits: Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `예시 정신 ${i + 1}`, unresolved: false })).filter(e => !spirits.some(s => s.id === e.id)),
          pairCapacity: 7, pairFree: 2, skillEditable: true, skillEditReason: null, skillCapacity: 4, skillFree: 2, skillConsumers: 1, skillConsumerLimit: 4,
          addableSkills: Array.from({ length: 51 }, (_, i) => ({ id: i + 33, name: `예시 능력 ${i + 33}`, unresolved: false })).filter(e => !skills.some(s => s.id === e.id)) }];
        const weapons = [{ ...common, recordIndex: 1, name: '예시 무기', attack: 1200, hit: 10, critical: 4, minRange: 1, maxRange: 4, terrain: 0xef, energy: 10, ammo: 6, requiredMorale: 110, requiredSkill: 0,
          owners: [{ unit: 1, unitName: '예시 기체 1', slot: 1, entryIndex: 0, ammoSlot: 0, requiresFlag: false, flagNumber: null, requiresInvestment: false }], ownerUnits: [1], ownerCount: 1, ownerNames: ['예시 기체 1'], ownership: 'owned', unverifiedOwnerUnits: [] }];
        h.installEditorRows({ units, pilots, weapons, pilotAliases: [], unitAbilityNames: ['', '예시 능력'], pilotAbilityNames: [] });
        // No worker or PREVIEW request: screenshots cannot include proprietary art.
        h.state.editorWorker = null;
        window.guideBaseline = { source: { status: 'ready', name: 'SRWF-example.bin', meta: 'F · 설명용 파일', typeLabel: 'BIN', check: '✓', failure: null } };
      });
      for (const screen of screens) {
        await page.evaluate(screen => {
          const h = window.guideCapture, s = h.state, $ = id => document.getElementById(id);
          for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
          s.editorSessionToken = screen === 'folder' ? null : 'guide-example';
          s.editorGameId = 'srwf-f';
          s.editorBaseReleaseId = s.release.id;
          s.editorRelease = s.release;
          s.editorBusy = false;
          s.editorActive = false;
          s.workflowSaving = false;
          s.workflowDirectOutput = false;
          s.editorDownloadUrls = [];
          s.workflowOutput = null;
          const editing = ['edit', 'unit', 'unit-terrain', 'unit-abilities', 'pilot', 'spirits', 'skills', 'weapon', 'weapon-terrain', 'changes', 'preset'].includes(screen);
          s.workflowStage = editing ? 'editor' : ['save', 'downloads'].includes(screen) ? 'save' : 'setup';
          s.editorSetupOpen = s.workflowStage !== 'editor';
          s.workflowStockSelection = ['stock', 'native'].includes(screen) ? {} : null;
          s.workflowBaseKind = screen === 'native' ? 'stock' : 'korean';
          s.editorProvenance = screen === 'personal' ? 'personal' : ['stock', 'native'].includes(screen) ? 'stock' : 'accepted';
          s.editorOrigin = ['stock', 'native'].includes(screen) ? 'stock' : 'patched';
          s.editorDisc = { kind: screen === 'personal' ? 'personal' : screen === 'native' ? 'native' : ['folder', 'stock'].includes(screen) ? 'stock' : 'accepted', baseReleaseId: s.release.id };
          s.editorSource = screen === 'folder' ? { status: 'idle', name: '', meta: '', failure: null }
            : { ...window.guideBaseline.source, chip: screen === 'personal' ? '개인 편집본' : screen === 'patched' ? '한글 패치본' : '정품 원본 확인', chipClass: screen === 'personal' ? 'zone-state is-personal' : 'zone-state is-complete' };
          $('languageKorean').checked = screen !== 'native';
          $('languageOriginal').checked = screen === 'native';
          $('editorError').hidden = true;
          $('editorDownloadActions').hidden = true;
          h.syncModeUi();
          $('editorWorkspace').hidden = !editing;
          $('editorEntryState').textContent = screen === 'folder' ? '파일 대기' : '준비됨';
          $('workflowSaveButton').disabled = false;
          $('workflowOpenEditor').disabled = screen === 'folder';
          for (const id of ['unitPreviewImage', 'pilotPreviewImage']) $(id).hidden = true;
          $('unitPreviewCaption').textContent = '설명용 예시 기체';
          $('pilotPreviewCaption').textContent = '설명용 예시 파일럿';
          if (editing || ['save', 'downloads'].includes(screen)) {
            const row = s.editorUnits[0]; row.hp = 3500;
            row.ability1 = screen === 'unit-abilities' ? 1 : 0;
            s.unitFlagsOpen = screen === 'unit-abilities';
            h.selectEditorTab('unit');
            h.selectEditorRecord('unit', 1);
            h.setEditorPage('unit', 'main');
            s.editorChangeCount = 1;
            $('editorState').textContent = '이번 변경 1건';
            $('editorPresetSaveButton').disabled = false;
            $('editorPresetLoadButton').disabled = false;
            $('editorExportButton').disabled = false;
            $('workflowSaveSummary').textContent = '슈퍼로봇대전 F · v0.5 한글 패치 · 이번 변경 1건';
            $('unitPreviewCaption').textContent = '설명용 예시 기체';
          }
          if (['pilot', 'spirits', 'skills'].includes(screen)) {
            h.selectEditorTab('pilot'); h.selectEditorRecord('pilot', 1);
            h.setEditorPage('pilot', 'main');
            $('pilotPreviewCaption').textContent = '설명용 예시 파일럿';
          }
          if (screen === 'edit') h.setEditorPage('unit', 'list');
          if (screen === 'skills') h.openPilotSkillDialog();
          if (['weapon', 'weapon-terrain'].includes(screen)) {
            h.selectEditorTab('weapon'); h.selectEditorRecord('weapon', 1); h.setEditorPage('weapon', 'main');
          }
          if (screen === 'changes') h.editorChanges.open();
          if (screen === 'downloads') {
            $('workflowSaveButton').hidden = true;
            $('editorDownloadActions').hidden = false;
            $('editorDownloadBinLink').removeAttribute('href');
            $('editorDownloadCueLink').removeAttribute('href');
            $('editorDownloadSummary').textContent = 'BIN/CUE 준비 완료 · 두 파일을 같은 폴더에 보관하세요.';
            $('workflowSaveRegion').append($('editorDownloadActions'));
          }
        }, screen);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(180);
        const field = screen === 'unit-terrain' ? 'space' : screen === 'unit-abilities' ? 'ability1' : screen === 'spirits' ? 'spirits' : screen === 'weapon-terrain' ? 'terrain' : null;
        if (field) {
          await page.evaluate(({ screen, field }) => window.guideCapture.focusEditorChange(screen === 'spirits' ? 'pilot' : screen === 'weapon-terrain' ? 'weapon' : 'unit', 1, [field]), { screen, field });
          await page.waitForTimeout(180);
        }
        const selectors = { edit: '#unitEditorPanel .record-pane', unit: '.unit-vitals-grid', 'unit-terrain': '.unit-terrain-panel', 'unit-abilities': '.unit-info-panel', pilot: '.pilot-combat-panel', spirits: '.pilot-mental-panel', skills: '#pilotSkillDialog', weapon: '.weapon-detail-panel', 'weapon-terrain': '.weapon-terrain-panel', changes: '#editorChangesList', preset: '.editor-footer' };
        const selector = selectors[screen] || (['save', 'downloads'].includes(screen) ? '#workflowSaveRegion' : '#patchWorkspace');
        const target = page.locator(selector);
        if (['edit', 'changes'].includes(screen)) {
          const clip = await target.evaluate((el, screen) => { const r = el.getBoundingClientRect(); const last = [...el.querySelectorAll(screen === 'edit' ? '[data-record-index]' : 'button')].at(-1)?.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: last ? Math.min(r.height, Math.ceil(last.bottom - r.y + 8)) : r.height }; }, screen);
          await page.screenshot({ path: path.join(out, `${screen}-${device}.png`), clip });
        } else if (screen === 'pilot') {
          const clip = await page.evaluate(() => {
            const boxes = [...document.querySelectorAll('.pilot-combat-panel, .pilot-points-panel')].map(el => el.getBoundingClientRect());
            const x = Math.min(...boxes.map(r => r.x)), y = Math.min(...boxes.map(r => r.y));
            return { x, y, width: Math.max(...boxes.map(r => r.right)) - x, height: Math.max(...boxes.map(r => r.bottom)) - y };
          });
          await page.screenshot({ path: path.join(out, `${screen}-${device}.png`), clip });
        } else await target.screenshot({ path: path.join(out, `${screen}-${device}.png`) });
        report.screens.push({ screen, device, width, height, box: await target.boundingBox() });
        console.log(`${screen}-${device}`);
      }
    }
    if (report.errors.length) throw Error(report.errors.join('\n'));
  } finally {
    fs.writeFileSync(path.join(out, 'capture-report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
