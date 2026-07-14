# Current Plan

Token-small AFK-loop handoff. The durable milestone and evidence rules now live
in [`STARTING_SLICE.md`](STARTING_SLICE.md); do not replace that contract during
an ultraplan.

## Cycle: 2026-07-13 — Campaign Character Quest-Input Boundary

## Synthesis

Campaign-character v1 now persists across the overworld, and a trusted generic
quest-export catalog folds Wolf-Winter's three successful endings back into
distinct Old Cade memories and derived byre/gate/timber facts. Cataloged ending
sets are validated both ways against compiled non-death endings; completion is
atomic and idempotent; restore replays exact character state and canonical
journal bindings; the pre-catalog hash migrates only to its exact successor.

No causal-matrix fork changed. The embedded RPG still initializes its own fixed
protagonist and receives none of the campaign character's background, skills,
health, equipment, knowledge, promises, or relationships. Albany therefore
cannot yet prepare a character whose state changes a Wolf-Winter action or risk.

The current feedback compile includes 771 verified reports and 22 journey-v3
pure exits; every pure player continued at least once. Its top issue is a
historical structural-fleet complaint about Albany board wording. The exact
candidate's fresh player completed Wolf-Winter at decision 21 without that
confusion, so the complaint remains a reproduction target rather than grounds to
displace the missing quest-input foundation.

## Chosen Move

Build the trusted inbound half of the quest boundary: a versioned, data-driven,
read-only projection from campaign character state into embedded RPG
initialization. This is the last foundation-only boundary before authored Albany
registration and preparation begin creating counted forks.

- Keep all work inside Albany, Wolf-Winter, nearby travel, and the return.
- Preserve fresh/direct quest behaviour, old saves, deterministic replay, and
  UI/MCP parity when no import mapping applies.
- Quest content, not an MCP caller, declares the allowlisted mapping from stable
  campaign ids to valid RPG start-state effects.
- Validate every declared target against the compiled pack before play; reject
  unknown flags, variables, stats, objects, abilities, and malformed rules.
- Apply imports atomically before the first observation and bind their canonical
  receipt to session replay/state hashing.
- Pass detached state across the bridge. The quest must not mutate the campaign
  record, and pack-local object identities must never become campaign equipment.
- Keep order-sensitive foldback deltas deferred until a durable receipt
  chronology exists.
- Do not count planned matrix rows as depth until paired counterfactual tests
  prove their delayed mechanical consumers.

## Acceptance for the next implementation increment

1. A strict generic import schema rejects unknown primitives, duplicate rules,
   invalid campaign ids, and nonexistent or type-incompatible RPG targets.
2. A pure projector/applier proves rollback, caller isolation, deterministic
   ordering, and reuse with a synthetic non-Wolf quest.
3. Only the internal overworld bridge can supply campaign character state;
   player-facing MCP inputs cannot invent or override imports, while structural
   direct starts use an explicit initial character.
4. Imported state is applied before the first quest observation and participates
   in state hashing/replay without mutating the campaign record.
5. Explicit equipment mappings preserve authored kind/condition semantics but
   neither copy arbitrary inventory nor leak quest-local instances back out.
6. Wolf-Winter declares the minimal real import surface needed by the upcoming
   Albany profiles, while an empty/default character remains byte-for-behaviour
   compatible across UI, full MCP, compact MCP, and direct quest QA.
7. Negative pack fixtures, bridge authorization tests, save/determinism proofs,
   pre/post crawl, a fresh pure exit, and health pass are green. No matrix row is
   counted until an authored Albany choice reaches a delayed mechanical consumer.
