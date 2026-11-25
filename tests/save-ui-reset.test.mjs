import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { FakeElement, installFakeDom, loadHtml } from "./helpers/fake-dom.mjs";
import { syntheticSave } from "./helpers/synthetic-save.mjs";
import { createSaveEditor } from "../assets/save-ui.mjs";

const document = installFakeDom();
if (!("parentElement" in FakeElement.prototype)) {
  Object.defineProperty(FakeElement.prototype, "parentElement", {
    configurable: true,
    get() {
      return this.parentNode;
    },
  });
}
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
loadHtml(document, html);
const byId = (id) => document.getElementById(id);

const editor = createSaveEditor(() => ({
  verified: true,
  gameId: "srwf-final",
  sessionToken: "save-reset-test",
  pilots: [{ recordIndex: 74, name: "파일럿74" }],
  units: [{ recordIndex: 23, name: "기체23", hp: 1000, en: 100, recordKind: "regular" }],
}));

function makeFile(bytes, name = "cart.bcr") {
  return {
    name,
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

test("saveReset button is clearly labeled and confirms before reverting unsaved changes and drafts", async () => {
  assert.equal(byId("saveReset").textContent, "모든 슬롯 되돌리기");
  assert.doesNotMatch(byId("saveReset").textContent, /전체 취소/);

  const { raw } = syntheticSave({ name: "SROBOTFC_01" });
  const originalBytes = raw.slice();
  await editor.load(makeFile(raw));

  assert.equal(byId("saveLevel").value, "30");
  assert.equal(byId("saveExperience").value, "321");
  assert.equal(byId("saveMoney").value, "123456");
  assert.equal(byId("saveReset").disabled, true);

  // Commit valid edits and introduce an invalid draft.
  byId("saveLevel").value = "45";
  byId("saveLevel").dispatchEvent({ type: "input" });
  byId("saveMoney").value = "200000";
  byId("saveMoney").dispatchEvent({ type: "input" });
  byId("saveExperience").value = "99999";
  byId("saveExperience").dispatchEvent({ type: "input" });

  assert.equal(byId("saveExperience").getAttribute("aria-invalid"), "true");
  assert.equal(byId("saveReset").disabled, false);
  assert.match(byId("saveChangeCount").textContent, /입력 오류 1건/);

  const prompts = [];
  const prevConfirm = globalThis.confirm;
  try {
    // Cancel: keep inputs, draft, unsaved edits, and original bytes intact.
    globalThis.confirm = (text) => {
      prompts.push(text);
      return false;
    };
    byId("saveReset").click();
    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /모든 슬롯/);
    assert.match(prompts[0], /처음 불러온 값/);
    assert.match(prompts[0], /원본과 이미 내려받은 파일은 바뀌지 않습니다/);
    assert.equal(byId("saveLevel").value, "45");
    assert.equal(byId("saveMoney").value, "200000");
    assert.equal(byId("saveExperience").value, "99999");
    assert.equal(byId("saveExperience").getAttribute("aria-invalid"), "true");
    assert.equal(byId("saveReset").disabled, false);
    assert.equal(editor.hasUnsavedEdits(), true);
    assert.match(byId("saveChangeCount").textContent, /입력 오류 1건/);
    assert.deepEqual(raw, originalBytes);

    // Non-true return value also defaults to cancel.
    globalThis.confirm = (text) => {
      prompts.push(text);
      return undefined;
    };
    byId("saveReset").click();
    assert.equal(prompts.length, 2);
    assert.equal(byId("saveLevel").value, "45");
    assert.equal(byId("saveExperience").value, "99999");
    assert.equal(editor.hasUnsavedEdits(), true);

    // Confirm: revert all unsaved edits and drafts back to loaded values.
    globalThis.confirm = (text) => {
      prompts.push(text);
      return true;
    };
    byId("saveReset").click();
    assert.equal(prompts.length, 3);
    assert.equal(byId("saveLevel").value, "30");
    assert.equal(byId("saveMoney").value, "123456");
    assert.equal(byId("saveExperience").value, "321");
    assert.equal(byId("saveExperience").getAttribute("aria-invalid"), null);
    assert.equal(byId("saveReset").disabled, true);
    assert.equal(byId("saveDownload").disabled, true);
    assert.equal(editor.hasUnsavedEdits(), false);
    assert.equal(byId("saveChangeCount").textContent, "변경 없음");
    assert.deepEqual(raw, originalBytes);

    // Draft-only state also prompts and preserves draft on cancel, clears on confirm.
    byId("saveExperience").value = "99999";
    byId("saveExperience").dispatchEvent({ type: "input" });
    assert.equal(byId("saveReset").disabled, false);
    globalThis.confirm = (text) => {
      prompts.push(text);
      return false;
    };
    byId("saveReset").click();
    assert.equal(prompts.length, 4);
    assert.equal(byId("saveExperience").value, "99999");
    assert.equal(byId("saveExperience").getAttribute("aria-invalid"), "true");

    globalThis.confirm = (text) => {
      prompts.push(text);
      return true;
    };
    byId("saveReset").click();
    assert.equal(prompts.length, 5);
    assert.equal(byId("saveExperience").value, "321");
    assert.equal(byId("saveExperience").getAttribute("aria-invalid"), null);
    assert.equal(byId("saveReset").disabled, true);
    assert.deepEqual(raw, originalBytes);
  } finally {
    if (prevConfirm === undefined) delete globalThis.confirm;
    else globalThis.confirm = prevConfirm;
  }
});
