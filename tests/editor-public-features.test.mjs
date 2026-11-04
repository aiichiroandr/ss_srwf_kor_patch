import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PUBLIC_EDITOR_FEATURES} from '../assets/editor-public-features.mjs';
import {createScenarioModel} from '../assets/editor-scenario-model.mjs';

const root = new URL('../', import.meta.url);

test('the public site switches off dialogue editing, the new ally reinforcement, runtime previews, the F campaign and in-game runtime', () => {
  assert.ok(Object.isFrozen(PUBLIC_EDITOR_FEATURES));
  assert.deepEqual(Object.entries(PUBLIC_EDITOR_FEATURES).filter(([, on]) => on !== false), []);
});

test('scenario dialogue rows stay readable but read-only, and no reinforcement row is offered', () => {
  const model = createScenarioModel({
    dialogues: [{recordIndex: 1, physicalIndex: 0, text: 'a', speakerId: 3, editable: true, pagesEditable: true, speakerEditable: true, afterDialogueEditable: true}],
    reinforcements: [{recordIndex: '0:150', physicalIndex: 0, enabled: 0}],
  });
  const [row] = model.rows('dialogue');
  assert.equal(row.text, 'a');
  assert.deepEqual([row.editable, row.pagesEditable, row.speakerEditable, row.afterDialogueEditable], [false, false, false, false]);
  assert.deepEqual(model.rows('reinforcement'), []);
  assert.deepEqual(model.exportDialogues(), []);
  assert.deepEqual(model.exportReinforcements(), []);
});

test('the page ships no WEB PORT entry, AI handoff or version migration, and the dialogue tool starts hidden', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  for (const id of ['workflowWebPort', 'editorAiOpen', 'editorAiDialog', 'editorMigrationButton', 'editorMigrationDialog']) {
    assert.equal(html.includes(`id="${id}"`), false, id);
  }
  assert.match(html, /<button type="button" id="scenarioDialogueTool" aria-pressed="false" hidden>/);
  const app = await readFile(new URL('assets/app.mjs', root), 'utf8');
  for (const module of ['web-port-launch', 'editor-ai-ui', 'editor-migration-ui', 'editor-isolation']) {
    assert.equal(app.includes(`./${module}.mjs`), false, module);
  }
});
