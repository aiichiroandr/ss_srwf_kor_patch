export const FONT_PREVIEW_SAMPLES = Object.freeze([
  Object.freeze({ id: "beamrifle", text: "빔라이플", width: 204, height: 60 }),
  Object.freeze({ id: "pinpanel", text: "핀판넬", width: 152, height: 60 }),
  Object.freeze({ id: "vesba", text: "베스바", width: 156, height: 60 }),
  Object.freeze({ id: "orabegi", text: "오라베기", width: 200, height: 60 }),
  Object.freeze({ id: "photonbeam", text: "광자력빔", width: 200, height: 60 }),
  Object.freeze({ id: "getterbeam", text: "겟타빔", width: 152, height: 60 }),
  Object.freeze({ id: "melee", text: "격투", width: 108, height: 60 }),
  Object.freeze({ id: "gundammk2", text: "건담mk2", width: 208, height: 60 }),
  Object.freeze({ id: "mazingerz", text: "마징가Z", width: 200, height: 60 }),
]);

export const FONT_REVISIONS = Object.freeze([
  Object.freeze({
    id: "a",
    label: "a · DOS thin 커스텀 (기존 폰트)",
    shortLabel: "a · DOS thin",
    preview: Object.freeze({
      stem: "a-dos-thin",
    }),
  }),
  Object.freeze({
    id: "b",
    label: "b · 갈무리11",
    shortLabel: "b · 갈무리11",
    preview: Object.freeze({
      stem: "b-galmuri11",
    }),
  }),
  Object.freeze({
    id: "c",
    label: "c · Mona12",
    shortLabel: "c · Mona12",
    preview: Object.freeze({
      stem: "c-mona12",
    }),
  }),
]);

export function fontPreviewSrc(font, sampleId) {
  return `assets/font-previews/${font.preview.stem}-${sampleId}.png`;
}

export function pickFontPreviewSample(random = Math.random) {
  return FONT_PREVIEW_SAMPLES[Math.floor(random() * FONT_PREVIEW_SAMPLES.length)];
}

// Only explicitly revisioned release identities participate; legacy releases
// must not be relabelled as a font variant without their own acceptance chain.
export function fontReleaseIdentity(row) {
  const match = /^(srwf-(?:f|final)-\d{8}-v\d+(?:-\d+)+)-([abc])$/.exec(row.id);
  if (!match || !match[1].startsWith(`${row.gameId}-`)) {
    return { groupId: row.id, revision: null };
  }
  return { groupId: match[1], revision: match[2] };
}

export function groupFontReleases(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (row.state !== "ACCEPTED") throw new Error("Unaccepted font release");
    const { groupId, revision } = fontReleaseIdentity(row);
    if (!groups.has(groupId)) {
      groups.set(groupId, { id: groupId, rows: [], revisioned: revision !== null });
    }
    const group = groups.get(groupId);
    // One version label per group: the font has its own selector, so a warning
    // written into only one font's row label would never reach the screen.
    if (group.revisioned !== (revision !== null)
      || group.rows.some((other) => fontReleaseIdentity(other).revision === revision
        || other.label !== row.label)) {
      throw new Error("Ambiguous font release group");
    }
    group.rows.push(row);
  }
  return [...groups.values()];
}

export function selectFontRelease(group, revision) {
  return group?.rows.find((row) => fontReleaseIdentity(row).revision === revision) ?? null;
}
