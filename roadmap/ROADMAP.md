# Roadmap

> **Operator: this is your file.** Plain-English bullets; reorder to change priorities. Agents only ever mark items "✅ shipped (PR #n)" — they never rewrite your words. Sections mean: **Now** = working on it, **Next** = queued, **Later** = someday, **Ideas** = unscoped thoughts.

## Now

- Stand up the operations engine skeleton: install init.sh / verify.sh / features.json / hooks; confirm `npm run health` is green in CI
- Run /groom against ADVENTUREFORGE_BUILD_SPEC.md to decompose the full charter into a prioritized backlog of features in features.json
- Autonomous loop loop safety: replace loop.sh's broad git-add with a file-level content/test whitelist so the loop cannot accidentally commit engine code (SAFE-0 from the existing roadmap v2)

## Next

- Multi-mode foundation: fix RpgObservation mode discriminator and generalize the MCP dispatch layer to operate on CYOA, parser, and RPG packs (Milestone 1, item 1a-0 through 1a-3)
- Blind-playtest handoff: have the autonomous loop emit the locked-down no-repo-access prompt and parse the structured playtest report (Milestone 2, item 2b)
- Auto-fix loop for CYOA and parser packs: route findings through ContentPatchProposal, re-validate, generate bug artifact and regression test (Milestone 2, items 2c and 2d)
- Consumables mechanic: add consume_item effect and has_consumed condition through the engine-extension gate with full backward-compatible replay over all committed traces (Milestone 3, item 3b)

## Later

- Hash-pin drift detection: any content patch that changes a pinned hash must surface for human re-pin rather than auto-rewrite a regression test (Milestone 2, item 2d hash-drift rule)
- Contamination-free benchmark: run real frontier models (no repo access) against the sealed procedurally-generated corpus and score with the blind LLM playtest; optional Jericho/TALES adapter (Milestone 4)
- Browser UI enhancements: save/load in-browser, trace replay viewer, validation panel, adapt-story playground, scene/map renderer over the same headless engine (Milestone 5)
- ESLint + Prettier: add consistent code formatting without breaking the typecheck/health gate; required before any networked/public deployment (cross-cutting)
- Section 16 MCP hardening: sandbox and path-confinement fuzzing of src/mcp/paths.ts before any external deployment

## Ideas

- The pre-purge zork-unlimited codebase (tag pre-purge-20260609 in git history, before the department reorganization) may contain useful research notes, early design artifacts, or prototype content packs worth mining for story seeds. Look there before authoring new content from scratch — quarry only, never bulk-restore.
- Adapter for parser and RPG modes: thread a target_mode through the writer/adapter pipeline so a one-line premise can generate a Zork-style or RPG pack, not just a CYOA (Milestone 2, item 1b)
- Multi-enemy rooms, XP/leveling, and multi-room quest stages to deepen the RPG mode (Milestone 3, item 3b extended)
- Optional Jericho/TALES benchmarking adapter to compare the engine against the wider IF research ecosystem
