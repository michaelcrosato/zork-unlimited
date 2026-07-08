# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines - completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 - Compact Journal Hash Cleanup

## Synthesis

The Albany-to-Wolf-Winter bridge now frames the quest as a local relief chain:
Rowan's civic-records lead reaches Hayden's Station Quarter route desk, and the
RPG opening carries that Albany winter-relief packet into the steading before
the byre crisis takes over. Cade now reads the player as Albany's relief rider,
not an unexplained steading hunter, while the spear remains already in hand.

Fresh-game Codex seeds 591-615 all exited 0; clarity 25x4/5, enjoyment 25x4/5,
replay 25x true. The ledger now has 436 accepted reports. Bridge/tone complaints
dropped from 12/25 to 1/25, and all 25 reports noticed the Albany relief-chain
context positively or neutrally.

The loudest current quality issue is compact text hygiene: 25/25 fresh reports
mention compact truncation, hash-like journal suffixes, or tuple readability.
This is not a new system; it is the player-facing text surface the blind agents
actually read. Cleaning it should improve every future slice playtest and make
the existing New York opening feel less debug-like.

## Chosen Move

Remove hash-like compact journal/truncation artifacts from the fresh-game slice
without increasing compact payloads enough to reintroduce context bloat.

- Focus on compact RPG/overworld journal and prose shortening paths that emit
  `#...` suffixes or clip actionable Wolf-Winter/Albany lines.
- Preserve deterministic state hashes, snapshot hashes, and guard semantics; do
  not hide or weaken hashes used for concurrency/versioning.
- Keep the compact view bounded: prefer cleaner summaries or non-debug ellipses
  over simply raising every limit.
- Add focused regressions using Wolf-Winter/Albany observations that prove compact
  journal entries and compact descriptions do not expose hash-like fragments.
- Do not broaden into tuple-label redesign this cycle unless required to remove
  the hash artifact.

## Acceptance

1. Focused compact-output tests fail on current hash-like journal/truncation text
   and pass with cleaner player-facing compact prose.
2. Focused tests prove state/snapshot hashes still exist where tools need them.
3. `npm run health` passes.
4. Run a 25-seed fresh-game `npm run blind` batch, regenerate
   `docs/BLIND_FEEDBACK_LEDGER.md`, and confirm compact hash/truncation complaints
   drop before committing.

## Deferred Levers

- Albany Civic Center charter backlog and Civic Ledger Run resolutions still feel
  generic compared with their setup.
- Related Station Quarter winter-relief event can remain active after Wolf-Winter
  completion.
- Road encounter arrival/progress wording still repeats in fresh samples.
- Hidden counts remain useful but system-facing.
- Colonie and nearby towns still feel templated after Albany.
