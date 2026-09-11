export const FONT_REVISIONS = Object.freeze([
  Object.freeze({ id: "a", label: "a · DOS thin 커스텀 (기존 폰트)" }),
  Object.freeze({ id: "b", label: "b · 갈무리11" }),
  Object.freeze({ id: "c", label: "c · Mona12" }),
]);

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
