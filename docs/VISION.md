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

The north star is a single text world that synthesizes ~50 years of tabletop
role-playing and board-game design into one deterministic engine. When a quest
wants the tactical crunch of *Pathfinder*, the narrative momentum and clocks of
*Blades in the Dark*, the creeping dread of *Call of Cthulhu*, a *MÖRK BORG*
misery countdown, a *Dread*-style escalating tension check, or a *Quacks of
Quedlinburg* push-your-luck gamble, the engine executes that system as pure code
and data — never an LLM improvising at the table. Text is the deliberate
constraint: it is how we find out what a hyper-dense Skyrim or Cyberpunk 2077
becomes once the graphics budget is gone and only the systems remain.

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

## The mechanical adaptation paradigm

Ingesting that much game design into a text engine works because every rule
lands in one of three layers — the split the architecture contract
([`ADVENTUREFORGE_BUILD_SPEC.md`](../ADVENTUREFORGE_BUILD_SPEC.md)) makes
authoritative:

- **Content & the event DSL.** Rulebooks become structured quest packs under
  `content/rpg/quests/`, written as closed condition/effect tokens. A *Blades*
  progress clock is a stateful counter; a *Call of Cthulhu* sanity track or a
  *Pendragon* trait is a character variable moved by scene transitions.
- **The deterministic core & reducer.** Anything the DSL can't express as data
  is coded into `src/core` + `src/rpg` as a pure state transition — a *Lancer*
  tactical grid, a *Modern Art* auction, a *Search for Planet X* deduction
  ledger. However intricate the source rules, the backend stays testable,
  replayable, and save-state resilient.
- **The agent & tool surface.** State is exposed only through the compact MCP
  observations at `src/mcp/server.ts`, with a one-time positional `legend`, so a
  player or playtest agent parses the world at extreme token efficiency.

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

## The adaptation horizon

The systems below are an illustrative slice of what the engine intends to adapt
— and, in the manifesto's own words, *less than 1% of the range the final game
will be capable of describing and delivering*. Each is a candidate to be
translated into deterministic data and code across the three layers above; none
is a separate mode or mini-game — every one would be reached in-world, anchored
to a place on the New York overworld.

| Type       | Game                                    | Original | Most recent            |
| ---------- | --------------------------------------- | -------- | ---------------------- |
| TTRPG      | Pathfinder                              | 2009     | 2024 (Remaster)        |
| TTRPG      | Call of Cthulhu                         | 1981     | 2014 (7th Edition)     |
| TTRPG      | Blades in the Dark                      | 2017     | 2017                   |
| TTRPG      | Dread                                   | 2005     | 2005                   |
| TTRPG      | Fiasco                                  | 2009     | 2020 (2nd Edition)     |
| TTRPG      | Wanderhome                              | 2021     | 2021                   |
| TTRPG      | Thousand Year Old Vampire               | 2020     | 2020                   |
| TTRPG      | Alice is Missing                        | 2020     | 2025 (Digital V2 / DLC)|
| TTRPG      | Paranoia                                | 1984     | 2023 (Perfect Edition) |
| TTRPG      | Lancer                                  | 2019     | 2019                   |
| TTRPG      | MÖRK BORG                               | 2020     | 2020                   |
| TTRPG      | Delta Green                             | 1997     | 2016 (Standalone RPG)  |
| TTRPG      | Pendragon                               | 1985     | 2024 (6th Edition)     |
| TTRPG      | The Quiet Year                          | 2013     | 2013                   |
| TTRPG      | Microscope                              | 2011     | 2011                   |
| TTRPG      | Mothership                              | 2018     | 2024 (1.0 Boxed Set)   |
| TTRPG      | Fate Core                               | 2013     | 2013                   |
| TTRPG      | Night's Black Agents                    | 2012     | 2012                   |
| TTRPG      | Brindlewood Bay                         | 2020     | 2022 (Revised Retail)  |
| TTRPG      | Chuubo's Marvelous Wish-Granting Engine | 2014     | 2014                   |
| Board game | Root                                    | 2018     | 2018                   |
| Board game | Crokinole                               | 1876     | 1876 (Traditional)     |
| Board game | Blood on the Clocktower                 | 2022     | 2022                   |
| Board game | Brass: Birmingham                       | 2018     | 2018                   |
| Board game | Spirit Island                           | 2017     | 2017                   |
| Board game | Hive                                    | 2001     | 2024 (Hive Ultimate)   |
| Board game | Captain Sonar                           | 2016     | 2016                   |
| Board game | The Crew: Mission Deep Sea              | 2021     | 2021                   |
| Board game | Welcome To...                           | 2018     | 2018                   |
| Board game | Chinatown                               | 1999     | 2023 (Waterfall Park)  |
| Board game | Mind MGMT                               | 2021     | 2021                   |
| Board game | The Quacks of Quedlinburg               | 2018     | 2023 (Mega Box)        |
| Board game | Wingspan                                | 2019     | 2019                   |
| Board game | Wavelength                              | 2019     | 2019                   |
| Board game | Cascadia                                | 2021     | 2021                   |
| Board game | Modern Art                              | 1992     | 2025 (NGO Edition)     |
| Board game | Sleeping Gods                           | 2021     | 2021                   |
| Board game | Twilight Imperium                       | 1997     | 2017 (4th Edition)     |
| Board game | The Search for Planet X                 | 2020     | 2020                   |
| Board game | Heat: Pedal to the Metal                | 2022     | 2022                   |
