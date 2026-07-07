# Vision — the flywheel is the product

*(Standing document. The [DECISION_LOG](./DECISION_LOG.md) records how we got
here; [ROADMAP.md](./ROADMAP.md) records what's next. This records **why**.)*

AdventureForge is an experiment with one non-negotiable core: **the game is
AI-coded and AI-playtested, and it improves through the loop between them.**
Everything else — the engine, the world, the UI, the content — is an output of
that loop, not an input to it.

## The flywheel

```
   ┌────────────────────────────────────────────────────────┐
   │                                                        │
   ▼                                                        │
 AI dev cycle ──► verification bar ──► blind AI playtest ──► exit interview
 (explore →        (npm run health —      (fresh agent, NO      (structured,
  plan → code →     the full bar: types,   repo access, plays    machine-validated
  commit)           lint, format, tests,   only through the      feedback)
                    integrity, UI, packs)  MCP server)
```

- **The dev is an AI** (any capable coding agent — the loop harness is
  `loop.sh` + `npm run ai:loop`). It reads ranked feedback, picks one
  improvement, and lands it behind the verification bar. It may change
  anything — engine, schema, content, even the validators — but it may never
  route around the verifier (`AGENTS.md`, the integrity guard).
- **The playtester is an AI** with *no repo access*: it experiences exactly
  what a player experiences — the MCP observations and legal actions, nothing
  else. Player-facing quality (signposting, pacing, fairness, fun) is judged
  only here, never by static checks.
- **The exit interview is the coupling.** Every playtest ends with a
  validated `json exit-interview` block (clarity/enjoyment scores, bug list
  with severities, confusions, verdict). The report verifier rejects a
  playtest without one; a schema-valid interview is what lets the assessor
  count the playtest and rotate targets, and its structured scores are the
  rankable substrate the assessor grows into consuming. Feedback that can't
  be ranked is feedback that gets lost.

If the flywheel turns correctly, quality compounds: stories accumulate
playtested fixes, the engine accumulates mechanics the stories demanded, and
the eval distribution evolves so the verifier never becomes a memorized
target. This is **not** procedural generation — every story is authored,
played, criticized, and revised, like a living campaign.

## One world, one engine, many rule systems

The original staged bootstrap (CYOA → parser → scoring → RPG) proved the
deterministic core; the consolidation (DECISION_LOG, 2026-07-06) retired the
training stages and normalized on their union: **one RPG foundation engine**
— rooms, objects, containers, dialogue, puzzles, scoring, stats, seeded
combat, d20 skill checks — inside **one persistent world**: the New York
overworld, a single seamless open world (like Skyrim or Cyberpunk 2077) that
hosts travel, discovery, jobs, encounters, and renown AND is the sole registry
for every shipped quest, each discovered in-world from a town's local notice
board.

The engine's ambition is TTRPG-grade breadth: the closed condition/effect DSL
plus the interaction-verb system should let writers express *nearly any
tabletop or board-game mechanic* — traps on opening a chest, warnings on
trying a door, one-shot clues on inspection, checks that spend resources,
quests that thread the overworld — without engine forks. When a story needs a
mechanic the DSL can't express, that is flywheel work: extend the engine
additively (byte-identical compiles for content that doesn't use it, every
old trace still replays), prove it with the validators and the negative
corpus, then let the content use it. Over time the palette grows toward
"anything the writers want" — and every addition stays deterministic (same
seed ⇒ same story) so playtests are replayable evidence, not anecdotes.

## What "best in the world" means here

- **For players**: the deepest explorable text world — a real geography where
  travel costs something, towns remember you, and every quest is a story that
  dozens of blind playtests have already made fair, legible, and worth
  finishing.
- **For the AI playtester**: observations terse enough to play a long session
  in one context window (compact projections + a one-time legend), and an
  action surface honest enough that the listed and executable sets coincide —
  everything offered executes, and everything executed was offered.
- **For the AI dev**: a verification bar strong enough to trust its own
  changes — validators with rejection-direction witnesses, an integrity
  guard against test-weakening, determinism property checks — so autonomy
  never has to trade against correctness.

## Invariants (change these and it is a different project)

1. AI-coded, AI-playtested, feedback-coupled — humans set direction, not
   gates.
2. Deterministic core: no wall clock, no ambient randomness; same seed ⇒
   byte-identical run.
3. The verifier is the bar; nobody routes around it — not the dev agent, not
   the operator, not a refactor.
4. Blind playtests only through the MCP surface, always ending in a
   validated exit interview.
5. Stories are authored and revised, never procedurally churned; retired
   content is preserved (tags/archive) because playtested prose is the
   project's capital.
