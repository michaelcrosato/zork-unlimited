# Blind playtest protocol (the §12.4 "fresh player" step)

This is the canonical, repeatable procedure for the playtest step of an
improvement cycle — manual or autonomous (AFK). It is one of the project's two
testing modes: the dev tests (validators + exhaustive solver) prove _structure_
(every ending reachable, no soft-locks, sound scoring), while this step measures the
_experience_ a real first-time player has, which only a reasoning agent that **did
not design the game** can report.

The whole point is **isolation**: the playtester must judge the game from the
inside, using only what the game shows it. If it reads the YAML, the source, or
the solution, the test is worthless.

## When to run it

Once per improvement cycle, after the pack validates green. In the AFK loop it is
the step that follows `validate_pack` and precedes "pick one fix" — its findings
are a primary input to the fix.

## Procedure (5 steps)

1. **Pick the target.** A playable pack + a fixed seed. Default: the main story
   from `list_stories` (currently `content/rpg/pack/breaking_weir.yaml`), seed
   `7`. For variety across cycles, rotate the seed and, when more than one pack is
   playable, rotate the pack.

2. **Spawn a blind subagent with a FRESH context.** Use whatever isolation your
   harness provides — the `Agent` tool (`subagent_type: general-purpose`), a new
   `claude -p`, or `codex exec` in a clean working context. Hand it _only_ the
   prompt template below. Never paste in design notes, the YAML, scene ids, or the
   solution. The subagent reaches the game **only** through the
   `mcp__adventureforge__*` MCP tools (discoverable via ToolSearch).

3. **Collect the structured report** (sections 1–6 in the template): the route(s)
   taken, whether it worked mechanically, clarity/enjoyment ratings, confusion
   points, concrete bugs/flaws (each with a scene), and a verdict.

4. **Triage findings into one focused fix.** Classify each finding by fix layer
   (`content | hint_text | quest_structure | engine_rule | validator | test`).
   - `content` / `hint_text` / `quest_structure` → apply via the **fixer**: either
     `mcp__adventureforge__apply_content_patch` with a `ContentPatchProposal`
     (deterministic, whitelisted, re-validated) or a direct YAML edit. Never let
     the model edit files free-hand without re-validation.
   - `engine_rule` / `validator` / schema → change them **freely under trust, but
     verify** (`AGENTS.md`): full authority, no human-approval gate, no §14 ceremony.
     The automated verification is the bar — keep `npm run health` green and add a
     regression test for the new behaviour. Don't route around the verifier.
   - Re-run `validate_*` until green and replay the affected route.

5. **Lock the fix (§15).** Write/refresh a bug artifact in `traces/bugs/` and add a
   regression test in `tests/regression/` that fails if the flaw returns. Run
   `npm run health`. Commit in one small green increment with durable notes in
   `AI_LOOP_STATE.md`.

## The locked-down subagent prompt (copy verbatim; fill in PACK and SEED)

```
You are a playtester for an interactive text adventure. You did NOT design this
game and must play it BLIND — like a first-time player who only sees what the game
shows you.

STRICT RULES:
- Play ONLY through the MCP tools named `mcp__adventureforge__*`. Find their schemas
  with ToolSearch: "select:mcp__adventureforge__start_world_quest,mcp__adventureforge__step_action,mcp__adventureforge__get_observation,mcp__adventureforge__list_legal_actions,mcp__adventureforge__get_transcript".
- DO NOT read, open, grep, or cat ANY repo files — especially nothing under
  content/, src/, ui/, or tests/. No peeking at the YAML or the solution. Your only
  window into the game is the MCP tool responses.

PLAY:
- Start shipped quests with mcp__adventureforge__start_world_quest,
  quest_id = "<QUEST_ID>", seed = <SEED>, hide_graph = true,
  compact_observation = true.
- Each compact context gives scene text, state/vitals, and context.actions (stable
  ids). Choose one with step_action(session_id, action_id, hide_graph = true,
  compact_observation = true). Repeat until context.ended is true. If an action id
  is unclear, call list_legal_actions without compact_actions once for command text.
- For an end-of-run transcript audit, call get_transcript(session_id,
  summary_only = true). Use compact_turns = true only when route rows are needed;
  avoid full transcripts unless diagnosing a specific event-history bug.
- Make decisions a curious, sensible human would: follow clues, pursue the apparent
  goal, investigate what seems important. Don't pick randomly. Narrate your reasoning
  each turn. Do at most 2-3 playthroughs (try a different strategy on later runs).
- WATCH FOR: loops with no progress, options that don't make sense, dead ends, clues
  that point nowhere, stale/contradictory scene text, an ending you can't find.

REPORT (return these sections):
1. Playthrough log: route(s) taken (scene titles) and ending(s) reached.
2. Did it work mechanically? rejected actions, broken state, loops?
3. Understandable & fun? could you tell the goal? clues legible? clarity 1-5 + enjoyment 1-5.
4. Confusion / friction points.
5. Bugs or design flaws — concrete, each with the scene where you hit it.
6. Verdict: would a real player finish satisfied? one paragraph.
Be honest and specific; a critical, well-observed report is more useful than a flattering one.
```

## Worked example

The first run of this protocol on _The Watchtower Road_ (seed 7) reached both
`ending_truth` and `ending_escape`, confirmed mechanics/save-load, and surfaced
four content-polish findings (stale cart/cellar-door text, a journal entry that
stacked on cellar re-entry, and a ledger referenced by an ending but never carried).
All four were fixed as `content`/`hint_text`, locked by
`traces/bugs/bug_0002_watchtower_blind_polish.yaml` and a regression test. That is the loop closing:
write → play (blind) → find → fix → lock.
