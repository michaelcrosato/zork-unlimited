# Current Plan

Token-small AFK-loop handoff. The durable milestone and evidence rules now live
in [`STARTING_SLICE.md`](STARTING_SLICE.md); do not replace that contract during
an ultraplan.

## Cycle: 2026-07-13 — Starting-Slice Foundation

## Synthesis

Goal Passage has landed and its gates are green. The next product milestone is
the fixed Albany → Wolf-Winter → Albany-return vertical slice. Current evidence
proves useful tactical tradeoffs inside Wolf-Winter, but not a persistent
character, systemic noncombat agency, or mechanically changed Albany return.

The largest reusable blocker is the quest boundary: an embedded quest receives
a fresh quest-local character and exports only ending id/title/death. Equipment,
wounds, skills, knowledge, promises, relationships, and faction state cannot
yet cross that boundary.

## Chosen Move

Establish the starting-slice contract and causal ledger, then introduce one
versioned campaign-character state owned by the overworld. This increment stops
at validated persistence and presentation; quest projection/foldback is the
next increment, not an excuse to make this one broad.

- Keep all work inside Albany, Wolf-Winter, nearby travel, and the return.
- Preserve old saves/content and deterministic/UI/MCP behaviour.
- Persist a deterministic default through current saves and an explicit legacy
  migration.
- Expose one canonical read-only projection to full MCP, compact MCP, and UI.
- Keep pack-local RPG state and inventory separate; do not leak Wolf objects.
- Prepare, but do not yet implement, explicit quest projection/foldback.
- Do not count planned matrix rows as depth until paired counterfactual tests
  prove their delayed mechanical consumers.

## Acceptance for the next implementation increment

1. One strict, versioned campaign-character schema covers every required state
   family without quest-specific fields or mutable aliasing.
2. Fresh sessions receive a deterministic default and reject malformed,
   non-finite, duplicate, or out-of-range state.
3. A new overworld snapshot version round-trips the character exactly; promised
   legacy snapshots migrate to the canonical default or reject explicitly.
4. Full MCP, compact MCP, and UI receive the same player-facing character
   projection without exposing hidden state.
5. Existing quest start/completion and content behaviour remain unchanged;
   canonical v9 hashes are stable, with a documented deterministic migration
   from v8 rather than impossible byte equality with the old format.
6. Pre/post crawl, focused schema/restore/parity tests, a fresh pure exit, and
   health pass.
