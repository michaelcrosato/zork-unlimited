# AdventureForge

A deterministic, headless, strictly-typed text-adventure engine whose **mechanics
live entirely in pure code** and whose **content lives entirely in AI-generated,
schema-validated data**. See [`ADVENTUREFORGE_BUILD_SPEC.md`](./ADVENTUREFORGE_BUILD_SPEC.md)
for the full spec.

## Status — Stage 0 (deterministic core) ✅

The trustworthy spine every later stage sits on. No AI, no content yet — just a core
the AI can later author into but cannot corrupt.

| Piece | File |
|---|---|
| Unified `GameState` (§6) | `src/core/state.ts` |
| Condition DSL + evaluator (§7.1) | `src/core/conditions.ts` |
| Effect DSL + pure reducer (§7.1) | `src/core/effects.ts` |
| Event log (§8.3) | `src/core/events.ts` |
| Seeded PRNG (§4.1, §8.5) | `src/core/rng.ts` |
| Canonical state hash (§8.6) | `src/core/hash.ts` |
| Pure `step` reducer + `Rules` resolver (§8.1, §8.4) | `src/core/engine.ts` |
| Save / load with content-hash integrity (§8.7) | `src/persist/save_load.ts` |
| Trace record / replay (§8.8) | `src/trace/` |

The Layer-2/Layer-3 boundary (§3) is enforced by the `Rules` resolver: the engine asks
content what an action means, but contains no content itself. Stage 1 (CYOA) and Stage 2
(parser) each supply their own resolver over this identical core.

## Quickstart

```bash
npm install
npm run lint     # typecheck (tsc --noEmit)
npm test         # unit + property tests (Vitest + fast-check)
npm run replay   # round-trip a hand-written trace (Stage 0 acceptance)
```

## Stage 0 acceptance (§13)

- `npm run replay` round-trips a hand-written trace and reproduces its state hash.
- The determinism property test passes: random valid action sequences run twice
  produce byte-identical hashes and events (`tests/property/determinism.test.ts`).
- CI is green: typecheck + tests + replay (`.github/workflows/ci.yml`).

## Next: Stage 1 — CYOA engine

The minimum viable proof of the whole thesis: AI writes a branching story → adapts it
to a schema-valid pack → the engine validates it → an AI playtests every route →
records its experience → finds a flaw → fixes it → a regression test locks the fix.
