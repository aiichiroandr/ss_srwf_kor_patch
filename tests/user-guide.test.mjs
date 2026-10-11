import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { guideContext, guidePages, createUserGuide } from "../assets/user-guide.mjs";
import { installFakeDom, loadHtml } from "./helpers/fake-dom.mjs";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
function fixture() {
  const doc = installFakeDom();
  loadHtml(doc, html);
  // The small DOM's HTML loader retains value attributes without reflecting option.value.
  for (const id of ["userGuideRoute", "userGuideTopic"]) for (const option of doc.getElementById(id).options) option.value = option.getAttribute("value");
  doc.body.dataset.view = "setup";
  doc.body.dataset.patchSettings = "choose";
  doc.getElementById("workflowOpenEditor").disabled = true;
  return doc;
}

test("guide follows original, original-language, patched and personal workflows", () => {
  const doc = fixture(), byId = id => doc.getElementById(id);
  assert.deepEqual(guideContext(doc), { route: "stock", step: 0 });
  byId("workflowOpenEditor").disabled = false;
  assert.deepEqual(guideContext(doc), { route: "stock", step: 1 });
  byId("languageOriginal").checked = true;
  assert.deepEqual(guideContext(doc), { route: "native", step: 1 });
  doc.body.dataset.view = "editor";
  byId("releaseRegion").hidden = true;
  assert.equal(guideContext(doc).route, "native", "hiding setup cards in the editor is not proof of a patched input");
  byId("languageOriginal").checked = false;
  assert.deepEqual(guideContext(doc), { route: "stock", step: 2 });
  doc.body.dataset.patchSettings = "skip";
  assert.deepEqual(guideContext(doc), { route: "patched", step: 2 });
  byId("originLine").textContent = "F · 원본 언어 · 편집본";
  assert.deepEqual(guideContext(doc), { route: "personal", step: 2 });
  doc.body.dataset.view = "save";
  assert.equal(guideContext(doc).step, 4);
});

test("manual paging and case selection preserve the loaded editor values and workflow", () => {
  const doc = fixture(), byId = id => doc.getElementById(id);
  const hp = doc.querySelector('[data-editor-field="hp"]');
  hp.value = "4321";
  const guide = createUserGuide(doc);
  assert.equal(byId("userGuideImage").src, undefined, "manual images wait until opening");
  guide.open();
  assert.equal(byId("userGuideDialog").open, true);
  assert.equal(byId("userGuidePrevious").disabled, true);
  const length = guidePages("stock").length;
  for (let i = 0; i < length + 1; i++) byId("userGuideNext").click();
  assert.equal(byId("userGuidePosition").textContent, `${length} / ${length}`);
  assert.equal(byId("userGuideNext").disabled, true);
  byId("userGuideRoute").value = "native";
  byId("userGuideRoute").dispatchEvent({ type: "change" });
  doc.querySelector('[data-guide-step="1"]').click();
  assert.match(byId("userGuideHeading").textContent, /원본 언어/);
  assert.equal(hp.value, "4321");
  assert.equal(doc.body.dataset.view, "setup");
  assert.equal(Boolean(byId("languageOriginal").checked), false, "guide route is independent from the real language choice");
  guide.close();
  // The real browser emits close automatically; this minimal DOM dispatches it explicitly.
  byId("userGuideDialog").dispatchEvent({ type: "close" });
  assert.equal(doc.activeElement, byId("userGuideOpen"));
  assert.equal(byId("userGuideOpen").getAttribute("aria-expanded"), "false");
});

test("editing topics jump directly, while other categories skip the detailed editing pages", () => {
  const doc = fixture(), byId = id => doc.getElementById(id);
  const guide = createUserGuide(doc);
  guide.open();
  doc.querySelector('[data-guide-step="2"]').click();
  assert.equal(byId("userGuideTopicRow").hidden, false);
  byId("userGuideTopic").value = "spirits";
  byId("userGuideTopic").dispatchEvent({ type: "change" });
  assert.match(byId("userGuideHeading").textContent, /정신커맨드/);
  assert.match(byId("userGuideImage").src, /spirits-desktop\.png$/);
  byId("userGuideNext").click();
  assert.match(byId("userGuideHeading").textContent, /파일럿 특수능력/);
  doc.querySelector('[data-guide-step="3"]').click();
  assert.match(byId("userGuideHeading").textContent, /편집값/);
  assert.equal(byId("userGuideTopicRow").hidden, true);
  doc.querySelector('[data-guide-step="4"]').click();
  assert.match(byId("userGuideHeading").textContent, /BIN\/CUE/);
  guide.close();
  doc.body.dataset.view = "editor";
  byId("pilotTabButton").setAttribute("aria-selected", "true");
  guide.open();
  assert.equal(byId("userGuideTopic").value, "pilot", "the loaded pilot tab opens its own manual topic");
  guide.close();
  byId("pilotTabButton").setAttribute("aria-selected", "false");
  byId("weaponTabButton").setAttribute("aria-selected", "true");
  guide.open();
  assert.equal(byId("userGuideTopic").value, "weapon");
});
