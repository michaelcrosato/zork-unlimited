# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines - completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 - Albany-to-Wolf-Winter Bridge

## Synthesis

The off-area job memory surface now keeps discovered unfinished jobs visible when
the player leaves their local area. Full views expose `rememberedJobs`; compact
views expose `remembered_jobs` as `[job_id, title, area_id]`; active `jobs`
remains current-area only; remote work still requires walking to the job area;
completed jobs leave both active and memory lists while remaining in completed
ids and journal history.

Fresh-game Codex seeds 566-590 all exited 0; clarity 25x4/5, enjoyment 25x4/5,
replay 25x true. The ledger now has 411 accepted reports. Direct vanished-job
complaints did not recur, though 5/25 still mention area-route/memory friction.

The broader goal is now the New York opening slice, not a single quest in
isolation. The strongest player-facing issue is that Albany's civic/rail
opening still hard-cuts into Wolf-Winter's mythic steading. 12/25 fresh reports
call the tone bridge abrupt, often as S2. Opening civic stakes also feel thin in
nearly every report. Compact hash/truncation remains loud, but the bridge is the
better next content lever because it shapes first-session motivation.

## Chosen Move

Strengthen the Albany Station Quarter to Wolf-Winter handoff so the quest feels
like a discovered New York relief crisis instead of an unrelated genre jump.

- Rework only the first-starting-area bridge: Albany Civic Center / Station
  Quarter lead prose, quest-start framing, and any tight Wolf-Winter opening
  lines needed to carry the same handoff.
- Preserve `wolf_winter` mechanics, score economy, seeded combat, endings, and
  existing spec citations.
- Resolve the Rowan/board discovery-source contradiction called out in seed 570.
- Add focused regressions that pin the local bridge language and prevent a return
  to generic "station board opens mythic steading" framing.
- Keep prose compact-view safe; do not take on broad compact hash/truncation this
  cycle unless the bridge text itself exposes it.

## Acceptance

1. Focused content/UI tests prove the revealed quest lead names the local Albany
   relief/rail handoff and matches the actual discovery source.
2. Focused quest-start tests prove Wolf-Winter's opening gives a concise bridge
   from Albany to the winter steading without changing quest mechanics.
3. `npm run health` passes.
4. Run a 25-seed fresh-game `npm run blind` batch, regenerate
   `docs/BLIND_FEEDBACK_LEDGER.md`, and confirm bridge/tone complaints drop
   before committing.

## Deferred Levers

- Compact-view polish: stale/hash-like journal artifacts and tuple labels.
- Colonie and nearby towns still feel templated after Albany.
- Road encounter arrival/progress wording still repeats in fresh samples.
- Hidden counts remain useful but system-facing.
- Tide-Mill levers still open: tactical saboteur branch, coin-bag consequence,
  compact stale-ref cleanup.
