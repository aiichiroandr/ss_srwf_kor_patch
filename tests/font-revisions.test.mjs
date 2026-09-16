import assert from "node:assert/strict";
import test from "node:test";
import {
  FONT_PREVIEW_SAMPLES,
  FONT_REVISIONS,
  fontPreviewSrc,
  fontReleaseIdentity,
  groupFontReleases,
  pickFontPreviewSample,
  selectFontRelease,
} from "../assets/font-revisions.mjs";

const row = (gameId, version, revision) => ({
  gameId, state: "ACCEPTED", id: `${gameId}-20260909-v${version}${revision ? `-${revision}` : ""}`,
});

test("font selection routes both games to their own revision-specific patch identity", () => {
  const rows = ["srwf-f", "srwf-final"].flatMap((game) =>
    ["a", "b", "c"].map((revision) => row(game, game === "srwf-f" ? "0-4" : "0-1", revision)));
  const groups = groupFontReleases(rows);
  assert.equal(groups.length, 2);
  for (const group of groups) {
    for (const revision of ["a", "b", "c"]) {
      const selected = selectFontRelease(group, revision);
      assert.equal(selected.id, `${group.id}-${revision}`);
      assert.ok(rows.includes(selected));
    }
  }
  assert.deepEqual(FONT_REVISIONS.map((font) => font.label), [
    "a · DOS thin 커스텀 (기존 폰트)", "b · 갈무리11", "c · Mona12",
  ]);
  assert.deepEqual(FONT_PREVIEW_SAMPLES.map((sample) => [sample.id, sample.text, sample.width, sample.height]), [
    ["beamrifle", "빔라이플", 204, 60],
    ["pinpanel", "핀판넬", 152, 60],
    ["vesba", "베스바", 156, 60],
    ["orabegi", "오라베기", 200, 60],
    ["photonbeam", "광자력빔", 200, 60],
    ["getterbeam", "겟타빔", 152, 60],
    ["melee", "격투", 108, 60],
    ["gundammk2", "건담mk2", 208, 60],
    ["mazingerz", "마징가Z", 200, 60],
  ]);
  assert.deepEqual(FONT_REVISIONS.map((font) => font.preview.stem), [
    "a-dos-thin", "b-galmuri11", "c-mona12",
  ]);
  const sample = pickFontPreviewSample(() => 0);
  assert.equal(sample.id, "beamrifle");
  assert.deepEqual(FONT_REVISIONS.map((font) => fontPreviewSrc(font, sample.id)), [
    "assets/font-previews/a-dos-thin-beamrifle.png",
    "assets/font-previews/b-galmuri11-beamrifle.png",
    "assets/font-previews/c-mona12-beamrifle.png",
  ]);
});

test("missing revisions never fall back to another font or legacy patch", () => {
  const [group] = groupFontReleases([row("srwf-f", "0-4", "a")]);
  assert.equal(selectFontRelease(group, "b"), null);
  assert.equal(selectFontRelease(group, "c"), null);
  const legacy = row("srwf-final", "0-1");
  assert.equal(fontReleaseIdentity(legacy).revision, null);
  assert.equal(selectFontRelease(groupFontReleases([legacy])[0], "a"), null);
});

test("versions, dates and games stay separate and ambiguous or unaccepted groups fail closed", () => {
  const a = row("srwf-f", "0-4", "a");
  assert.equal(groupFontReleases([a, row("srwf-f", "0-5", "b")]).length, 2);
  assert.throws(() => groupFontReleases([a, a]), /Ambiguous/);
  assert.throws(() => groupFontReleases([a, row("srwf-f", "0-4")]), /Ambiguous/);
  assert.throws(() => groupFontReleases([{ ...a, state: "CANDIDATE" }]), /Unaccepted/);
  assert.equal(fontReleaseIdentity({ ...a, gameId: "srwf-final" }).revision, null);
  assert.throws(() => groupFontReleases([
    { ...a, label: "2026.09.09 · v0.4" },
    { ...row("srwf-f", "0-4", "b"), label: "2026.09.09 · v0.4 (설치 비권장)" },
  ]), /Ambiguous/);
});
