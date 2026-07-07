# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-06 — post-consolidation re-aim

## Synthesis

The RPG-only consolidation is complete and audited (see the 2026-07-06 entries
in `docs/DECISION_LOG.md`): one engine, one world, 16 shipped quests, single
protected `main` branch, compact MCP surfaces, and a green bar. The overworld
quest bridge (the previous chosen move) is implemented and regression-tested.
The open frontier per `docs/ROADMAP.md` is content restoration (story ports)
and gameplay depth — not more consolidation.

## Chosen Move

Port ONE retired story back as an RPG world quest.

- The 36 retired packs live at tag `stories-52-pre-rpg-consolidation`; pick one
  whose prose and puzzle chain port cleanly (prefer a parser-era single-location
  story over a long CYOA branch tree for the first port).
- Adapt it to an RPG quest pack under `content/rpg/quests/`, register it in
  `content/world/charter_marches.yaml`, and route all play/validation through
  its `world_quest_id`.
- Reuse the original's playtested prose and endings; convert puzzle gates to the
  condition/effect DSL and USE verbs; keep scoring sound (the validators prove
  ending reachability and score economy).

## Acceptance

1. The new quest validates 0 errors / 0 warnings (`npm run validate`).
2. A blind playtest per `docs/blind_playtest_protocol.md` reaches an ending and
   files a schema-valid exit interview.
3. `npm run health` MUST pass before commit — it is the loop's blocking gate
   (loop.sh reverts the cycle on failure), not a best-effort step.

## Deferred Levers

- Extend token/cost telemetry to agent work turns (the blind-run half landed
  2026-07-06: ai-runs/blind-telemetry.jsonl + `npm run blind:telemetry`).
- Shrink low-level debug helpers that still leak raw pack paths in diagnostics.
- Tighten the remaining restore-time local action sequencing beyond discovery
  prefixes (most sequencing properties are already enforced; state the specific
  remaining gap when picking this up).
