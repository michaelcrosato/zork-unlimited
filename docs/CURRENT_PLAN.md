# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the
saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the
deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the
project, **overwrites this file** with the synthesis + the single chosen next move,
and a fresh implementation subagent reads _only_ this file (plus the files it names)
to do the work.

Until the first ultraplan cycle runs, the strategic direction is the one in
[`docs/ULTRAPLAN-2026-06-02.md`](./ULTRAPLAN-2026-06-02.md):

## Chosen next move (seed)

**Advance the contamination-free benchmark of real-model authoring.** Concrete
key-free levers still open (from the ULTRAPLAN, week horizon), highest-value first:

1. **More scorecard axes** — extend `bin/benchmark.ts` / `src/afk/benchmark.ts`
   beyond completion/coverage/turns to deaths and illegal-action rate, so the
   benchmark measures more of what frontier-model play reveals.
2. **Fresh-pack generator** — parameterize authoring (map size, puzzle depth,
   mechanic mix) to emit a _new_ validated, post-cutoff-timestamped pack per run —
   the contamination control no other IF eval has.
3. **The keyed real-model run** — the one keystone step that needs an API key
   (`adapt_story` already resolves a real provider); gated on the owner.

Acceptance for any move: `npm run health` green, `verify:integrity` untouched, a
regression test + `traces/bugs/` artifact if it fixes a bug.
