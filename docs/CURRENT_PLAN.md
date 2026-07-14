# Current Plan

Token-small AFK-loop handoff. The durable milestone and evidence rules now live
in [`STARTING_SLICE.md`](STARTING_SLICE.md); do not replace that contract during
an ultraplan.

## Cycle: 2026-07-13 — Generic Quest Consequence Boundary

## Synthesis

Campaign-character v1 now persists a strict default in overworld snapshot v9,
migrates v8 explicitly, projects through full/compact/UI surfaces, bounds its
recurring compact payload, and rejects non-default save injection without
replayable provenance. No counted fork changed: the embedded quest still exports
only ending identity, and the return remains mostly quest-specific prose.

The highest-leverage blocker is now a trusted, data-driven consequence boundary.
Wolf-Winter outcomes must resolve against authored world-manifest exports, apply
generic monotonic character/world effects once, and replay those effects during
restore. The RPG bridge must never be trusted to supply arbitrary effects.

## Chosen Move

Introduce a minimal generic consequence catalog and applier, then migrate the
three successful Wolf-Winter outcomes onto it. Start with monotonic relationship
memory/floors and historical world facts; defer order-sensitive money, health,
equipment, and resource deltas until a durable receipt chronology exists.

- Keep all work inside Albany, Wolf-Winter, nearby travel, and the return.
- Preserve old saves/content and deterministic/UI/MCP behaviour.
- Resolve ending ids only against trusted quest manifest content; the bridge
  never exports executable effects.
- Apply consequences atomically on first completion and reject a conflicting
  second ending instead of silently returning the old journal entry.
- Derive world facts and character memory by replaying canonical quest outcomes
  during restore; do not add independently forgeable save fields.
- Keep pack-local RPG objects separate; never export the rail guard or brace
  stake as campaign equipment.
- Do not count planned matrix rows as depth until paired counterfactual tests
  prove their delayed mechanical consumers.

## Acceptance for the next implementation increment

1. A strict generic schema validates quest outcome exports and rejects unknown
   effects, duplicate outcomes/effects, invalid ids, and malformed floors.
2. A pure applier proves transactional rollback, caller isolation, idempotency,
   and reuse through a synthetic non-Wolf quest.
3. Wolf-Winter's three non-death endings export distinct Cade memories and
   historical world facts; its death ending exports nothing.
4. Completion applies the trusted export once, same-ending repeats are no-ops,
   and conflicting repeats reject before mutation.
5. Save restore replays character consequences and derives facts from canonical
   quest outcomes while rejecting a forged outcome/journal combination; the
   exact pre-catalog world hash receives an explicit one-time migration and all
   other manifest mismatches still reject.
6. Existing Wolf return presentation, UI/MCP parity, deterministic replay, and
   all legacy behaviour remain green; no fork counts until an Albany consumer
   changes a later legal action, service, risk, resource, or NPC behaviour.
7. Pre/post crawl, focused schema/foldback/restore tests, a fresh pure exit, and
   health pass.
