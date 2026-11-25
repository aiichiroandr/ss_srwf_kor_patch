import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { installFakeDom, loadHtml } from "./helpers/fake-dom.mjs";

const document = installFakeDom();
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
loadHtml(document, html);
const initialConsoleError = console.error;
console.error = () => {};
const { __testHooks: hooks } = await import("../assets/app.mjs");
await new Promise((resolve) => setTimeout(resolve, 0));
console.error = initialConsoleError;

const { state } = hooks;
const byId = (id) => document.getElementById(id);

function installLoadedSession() {
  state.editorSessionToken = "save-back-nav-token";
  state.editorGameId = "srwf-f";
  state.editorBaseReleaseId = "srwf-f-20260928-v0-5-a";
  state.editorProvenance = "accepted";
  state.workflowBaseKind = "accepted";
  state.workflowDirectOutput = false;
  state.workflowStockSelection = null;
  state.editorDownloadUrls = [];
  state.workflowOutput = null;
  state.editorBusy = false;
  state.busy = false;
  byId("editorWorkspace").hidden = false;
}

test("setupToggle appears only in editor stage with existing label, while save stage keeps workflowBackSetup across download/error/cancel states", () => {
  installLoadedSession();

  // Setup (main) stage: top toggle hidden as before.
  state.workflowStage = "setup";
  hooks.syncModeUi();
  assert.equal(byId("setupToggle").hidden, true);
  assert.equal(byId("modeSummary").hidden, true);

  // Editor stage: top toggle shown with unchanged label.
  state.workflowStage = "editor";
  hooks.syncModeUi();
  assert.equal(byId("setupToggle").hidden, false);
  assert.equal(byId("setupToggleText").textContent, "메인페이지로");
  assert.equal(byId("setupToggleShort").textContent, "메인페이지로");
  assert.equal(byId("modeSummary").hidden, false);

  // Save stage (idle): top toggle hidden; bottom workflowBackSetup available.
  state.workflowStage = "save";
  hooks.syncModeUi();
  assert.equal(byId("setupToggle").hidden, true);
  assert.equal(byId("modeSummary").hidden, false);
  assert.equal(byId("workflowSaveRegion").hidden, false);
  assert.equal(byId("workflowBackSetup").hidden, false);
  assert.equal(byId("workflowBackSetup").disabled, false);

  // Save stage (download URLs ready): top toggle stays hidden; workflowBackSetup returns to setup.
  state.editorDownloadUrls = ["blob:bin", "blob:cue"];
  hooks.syncModeUi();
  assert.equal(byId("setupToggle").hidden, true);
  assert.equal(byId("workflowSaveButton").hidden, true);
  assert.equal(byId("workflowBackSetup").hidden, false);
  assert.equal(byId("workflowBackSetup").disabled, false);
  byId("workflowBackSetup").click();
  assert.equal(state.workflowStage, "setup");

  // Save stage (error state): top toggle hidden; workflowBackSetup still returns to setup.
  state.editorDownloadUrls = [];
  state.workflowStage = "save";
  byId("editorError").hidden = false;
  byId("editorError").textContent = "테스트 오류";
  hooks.syncModeUi();
  assert.equal(byId("setupToggle").hidden, true);
  assert.equal(byId("editorError").hidden, false);
  assert.equal(byId("workflowBackSetup").hidden, false);
  assert.equal(byId("workflowBackSetup").disabled, false);
  byId("workflowBackSetup").click();
  assert.equal(state.workflowStage, "setup");

  // Save stage (cancelled after busy): disabled while busy, enabled and working once cancelled.
  state.workflowStage = "save";
  state.editorBusy = true;
  hooks.syncModeUi();
  assert.equal(byId("setupToggle").hidden, true);
  assert.equal(byId("workflowBackSetup").disabled, true);
  state.editorBusy = false;
  hooks.syncModeUi();
  assert.equal(byId("setupToggle").hidden, true);
  assert.equal(byId("workflowBackSetup").hidden, false);
  assert.equal(byId("workflowBackSetup").disabled, false);
  byId("workflowBackSetup").click();
  assert.equal(state.workflowStage, "setup");
});
