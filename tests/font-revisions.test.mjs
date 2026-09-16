import assert from "node:assert/strict";
import test from "node:test";
import { FONT_REVISIONS, fontReleaseIdentity, groupFontReleases, selectFontRelease } from "../assets/font-revisions.mjs";

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
  assert.deepEqual(FONT_REVISIONS.map((font) => font.preview.src), [
    "assets/font-previews/a-dos-thin.png",
    "assets/font-previews/b-galmuri11.png",
    "assets/font-previews/c-mona12.png",
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
