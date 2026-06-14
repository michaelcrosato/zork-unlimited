# AdventureForge (zork-unlimited)

A deterministic, headless, AI-authored text-adventure **engine** — built in pure,
strictly-typed TypeScript, where the game mechanics live entirely in code the AI
cannot corrupt and the game content lives entirely in AI-generated, schema-validated
data.

> **Status: SPECIFICATION ONLY — no implementation on this branch yet.**
> The current tree contains the design brief, this repository's salvage research, and
> the operations-engine scaffolding. There is **no `src/`, no `content/`, no
> `tests/`** here. A previous full implementation existed and was deliberately purged
> to start a clean, controlled re-build; it is recoverable from the git tag
> `pre-purge-20260609`. See **[`docs/ENGINEERING_REVIEW.md`](docs/ENGINEERING_REVIEW.md)**
> for the candid assessment and **[`roadmap/ROADMAP.md`](roadmap/ROADMAP.md)** for what
> gets built first.

## What this is meant to be

The project's thesis (from [`ADVENTUREFORGE_BUILD_SPEC.md`](ADVENTUREFORGE_BUILD_SPEC.md))
is to prove, end to end, that an AI can **author** a text adventure, **compile** it
into a schema-valid game, **run** it on a deterministic headless engine, **play** it
through a structured action API, **test** it, **record** its experience, **find** a
design or logic flaw, **fix** it, and **lock** the fix with a regression test.

The build climbs one stable core through increasing mechanical complexity:

```
Choose-Your-Own-Adventure (CYOA)        ← the minimum viable proof
  → Zork-style parser adventure
    → Sierra-Quest puzzles + scoring
      → Hero's-Quest stat/RPG hybrid
        → web UI (deferred — the engine stays headless; the UI is just a view)
```

The guiding rule, backed by the research the spec cites (RPGBench, TALES, Jericho,
TextWorld, TextQuests): **LLMs are excellent content generators and poor rule
engines.** So the model never *is* the engine — it only writes validated data and
chooses from enumerated legal actions.

## Engine architecture (three layers)

```
LAYER 1 — STORY      prose: scenes, characters, locations, plot beats
                     (written by an AI "writer", drafted like fiction)
        │  adapter
        ▼
LAYER 2 — CONTENT    schema-valid YAML → validated JSON: scenes/rooms, choices,
                     items, puzzles, NPCs, flags, vars, conditions, effects
                     (the "content pack" the engine consumes; data, never code)
        │  compiler + validator (deterministic code)
        ▼
LAYER 3 — ENGINE     pure code, headless: state machine, condition/effect reducer,
                     legal-action generator, save/load, trace record/replay
                     (no LLM in the loop — same input ⇒ same output)
```

The Layer-2/Layer-3 boundary — **content is validated data, never executable code** —
is the system's central invariant. Key designed properties:

- **Determinism contract:** same seed + same action sequence ⇒ byte-identical final
  state, state-hash sequence, and event sequence, on any machine. All randomness
  flows through a seeded PRNG; no clock, no global RNG.
- **One public engine function:** a pure `step(state, action) → {state, events, ok,
  rejectionReason}` reducer that never mutates its input and performs no I/O.
- **Hash-verified saves:** a save binds to its content hash; loading against edited
  content is a hard error, never a silent re-interpretation.
- **Closed condition/effect DSL:** content selects from a small, fixed vocabulary and
  cannot introduce new verbs — a deliberate injection-resistance property.
- **Legal-action API (Jericho-style):** the AI sees a structured observation plus an
  enumerated set of legal actions, never a raw parser it must guess at.
- **Two-mode testing:** deterministic validators + an exhaustive solver *prove*
  structure (every ending reachable, no soft-locks, sound score economy); a blind LLM
  playtest *judges* experience (clarity, pacing, confusion). Nothing in between.

## Stack

| Concern | Choice |
|---|---|
| Language / runtime | TypeScript on Node.js 22+ (ESM) |
| Schema + runtime validation | Zod (the schema **is** the content contract) |
| Unit tests | Vitest |
| Property-based tests | fast-check (determinism, purity, round-trip, legality) |
| Content on disk | YAML (authoring) → validated JSON (runtime) |
| Determinism | seeded PRNG (e.g. mulberry32); never `Math.random` in the engine |
| State hash | canonical-JSON serialize → SHA-256 |
| Web UI (later) | React + Vite, talking only to the structured API |

(Python + Pydantic + Hypothesis is documented in the spec as a fully-supported
alternative; everything except the stack section is language-agnostic.)

## Honest status

- **What exists now:** the build spec, five salvage research reviews under
  `docs/research/zork-reviews/`, and the AI-operations engine scaffolding.
- **What does not exist now:** any engine code, any content packs, any tests, the MCP
  server, the agent roles, and the web UI. The earlier README claimed all of these
  were "complete" — that copy described the **purged** implementation and has been
  removed. Do not trust any prior quickstart that references `npm run play / validate
  / mcp / test / author / ui:dev`; those scripts are not in this `package.json`.
- **Why the reset:** the prior run shipped a working engine but ground into the
  failure modes catalogued in the research (gameable objective functions, a
  mock-only authoring path). The repo was reset to start a controlled re-build with
  those lessons designed in.

## Pointers

- **The design brief (the real artifact):** [`ADVENTUREFORGE_BUILD_SPEC.md`](ADVENTUREFORGE_BUILD_SPEC.md)
- **Candid engineering review (read this):** [`docs/ENGINEERING_REVIEW.md`](docs/ENGINEERING_REVIEW.md)
- **What gets built first:** [`roadmap/ROADMAP.md`](roadmap/ROADMAP.md)
- **Salvage research / prior-run post-mortems:** [`docs/research/zork-reviews/`](docs/research/zork-reviews/)
- **How the autonomous build factory operates:** `AI_OPERATIONS_PLAN.md`, `CLAUDE.md`

## Recovering the prior implementation

The deleted engine (46 `src/` files, all five stages, the pack library) is at the
git tag `pre-purge-20260609`:

```bash
git show pre-purge-20260609:README.md      # the prior, now-removed status doc
git checkout pre-purge-20260609 -- src/    # restore the old engine into the worktree (for reference)
```

It is reference history, not the path forward — the roadmap re-builds the first
vertical slice cleanly rather than restoring the old tree wholesale.
