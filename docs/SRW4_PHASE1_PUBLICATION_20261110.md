# Final v0.3 SRW4 intermission integration

The user authorized publication after confirming the reflector incom animation in Mednafen on 2026-11-10. This publishes editor behavior; it does not create a new accepted patch release. All 12 retained release artifacts, manifests, receipts and default release selections remain unchanged.

For Final v0.3 no-transfer new games, the verified Rev1 import registers five base hulls and ALICE in the initial player roster on both routes. Two transformation definitions are not separate gifts. Persistent roster checks and form-aware existence queries prevent duplicate grants. Retention and pilot-departure handling preserve these units and the existing ALICE subpilot/SP implementation. Existing saves are not automatically granted this roster. F automatic grants and generic save pilot addition remain outside this publication.

Reflector incom now clones the existing reflector weapon #397 (animation 1050), instead of ordinary incom #474 (1049). Its weapon ID #1333 and attack, accuracy, critical, range, ammo, energy, morale, skill, terrain and voice fields match the previous test disc. Required skill is explicitly zero rather than inheriting donor skill 33. Existing old BIN clones are not silently migrated by a no-op export.

Evidence: both Final new-game routes and actual save/fresh reload were exercised locally. The user additionally confirmed initial intermission ownership, battle-map operation without a crash, mission clear and the next intermission in Mednafen, then confirmed reflector incom playback in the updated disc. The user's route was not specified. Long campaign, every branch/departure combination, CD-R and every font's individual gameplay are not claimed. Static/unit tests are distinct from these runtime observations.

Test disc SHA-256: `7739ccd141b4296805224b5be573e09ce3207d8f3db09108198aaf4a1f5ba3c2`. The disc and saves are private local test material and are not committed or packaged.

The withdrawn runtime packaging requirement was replaced with a fail-closed withdrawn-state policy: no executable game runtime is reintroduced. Save rescue remains available. Cache references use 20261110-part2. Publication uses the manually dispatched workflow with the exact source commit and payload lock.
