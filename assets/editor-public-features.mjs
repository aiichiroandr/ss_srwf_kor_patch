// Editor features that exist in the local editor but are switched off on the public site.
// Every gate reads this table; nothing here is supplied by a URL, a preset file or a worker message.
// - scenarioDialogueEditing: map/scenario dialogue text, pages, speaker and follow-up lines (editor-scenario-dialogue*,
//   editor-dialogue-*). Dialogue rows stay readable for other views but are read-only, and the writer refuses them.
// - allyReinforcement: the new ally reinforcement (AQ03) and its spawn-capacity patch (editor-scenario-reinforcement*,
//   editor-spawn-capacity*). No reinforcement row is offered and the writer refuses reinforcement edits.
// - runtimePreview: weapon/unit animation previews and the battle timeline; they need the weapon-preview runtime,
//   which the public site does not carry.
// - fCampaignImport: the F scenario connection for Final, and opening images that carry it.
// - ingameRuntime: v0.4 in-game name editing images.
//   Neither module set ships in the public tree; editor-v04-unsupported.mjs answers their call sites.
export const PUBLIC_EDITOR_FEATURES = Object.freeze({
  scenarioDialogueEditing: false,
  allyReinforcement: false,
  runtimePreview: false,
  fCampaignImport: false,
  ingameRuntime: false,
});
