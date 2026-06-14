# Roadmap

> **Operator: this is your file.** Plain-English bullets; reorder to change priorities. Agents only ever mark items "✅ shipped (PR #n)" — they never rewrite your words. Sections mean: **Now** = working on it, **Next** = queued, **Later** = someday, **Ideas** = unscoped thoughts.

## Now

*The first vertical slice: a deterministic CYOA loop a person can actually play to an
ending, proven replayable. No AI, no MCP, no web UI yet — just the trustworthy core
and one playable story. (See `docs/ENGINEERING_REVIEW.md` "Top 5 to do first".)*

- **Tell the truth on the front door.** The README and review now say plainly that no
  engine exists yet. Keep them honest as code lands — no claiming a stage is "done"
  before a person can run it. (Largely done in the review PR.)
- **Decide the charter.** `AGENTS.md` is currently a 5-line stub, but the spec's top
  override calls it the governing "trust, but verify" document. Either restore that
  charter or update the spec to point at `CLAUDE.md`. Pick one, write it down.
- **Build the deterministic core.** The game's spine: a single state shape, the
  small fixed vocabulary of conditions and effects, seeded randomness (never the
  clock), a stable "fingerprint" of any game state, the one pure step-the-game
  function, save/load that refuses to load a save against changed content, and
  record/replay of a playthrough. Done when a hand-written playthrough replays to the
  exact same result twice, on any machine.
- **Build the CYOA story format + checker.** A schema for scenes, choices, items, and
  flags; a loader that turns YAML into a validated game; and a checker that proves a
  story has no dead ends, no unreachable scenes, and no unwinnable traps — with a set
  of deliberately-broken sample stories the checker must reject.
- **Ship one playable story.** A small hand-written adventure (a handful of scenes, a
  couple of endings, one locked choice) that passes the checker clean. Done when a
  person can play it start-to-an-ending in a terminal, and a recorded playthrough
  replays identically.
- **Prove it can't get stuck.** An automatic solver that walks the whole story and
  proves every ending is reachable and no choice-path leaves the player trapped. Wire
  it into one "health check" command that the build must keep green.

## Next

- **Let an AI play it (read-only).** Expose the game so an AI agent can play through
  the structured choices (not a raw text parser). Prove a blind tester can reach an
  ending and report back on clarity and pacing.
- **Let an AI author a story — for real.** The "AI writes the adventure" promise was
  only ever demonstrated against a fake stand-in model in the prior run. Wire a real
  model end-to-end (premise in → validated playable story out) and prove it once.
- **Find-and-fix loop.** When a playthrough exposes a confusing or broken branch,
  turn it into a saved, replayable bug report, fix it in the content, and lock the
  fix with a test so it can never come back.

## Later

- **Zork-style parser adventure.** Rooms, objects, containers, locked doors, an NPC
  conversation, and "use item on thing" puzzles — the next rung up, reusing the exact
  same core.
- **Scoring + death/restore (Sierra-Quest style).** A score, losing endings you can
  recover from by loading, and longer puzzle chains.
- **Stats + light combat (Hero's-Quest style).** Character stats, seeded dice rolls,
  and simple turn-based fights — every roll replayable.
- **Web UI.** A browser view over the same headless engine, added only after the core
  is rock-solid. The engine stays the source of truth; the UI just shows it.

## Ideas

- **An autonomous improvement loop** — but only with an honest, hard-to-game success
  signal (blind-playtest feedback from a *different* model family), because every
  prior run's downfall was a gameable objective, not a lack of capability. Read the
  prior-run post-mortems in `docs/research/zork-reviews/` before attempting this.
- **A controlled multi-model bake-off** — same brief, same harness, same machine,
  swap only the model — to actually compare models cleanly (the prior four runs were
  uncontrolled and the comparison was muddy).
- **Procedurally-generated stories as a moving eval target**, so a self-improving
  loop's checker stops being something it can memorize.
- **Restore-vs-rebuild call:** salvage specific battle-tested pieces from the purged
  engine (`pre-purge-20260609`) instead of re-writing them from scratch where they're
  already proven.
