# Blind playtest protocol (the "fresh player" step)

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

Once per improvement cycle, with the target quest validating green
(`validate_quest` over MCP, or `npm run validate`; for a content_new cycle,
validate the new quest first). In the AFK loop it is step 1 of the WORK phase —
before "make ONE improvement" — and its findings are a primary input to the fix.

## Procedure (5 steps)

1. **Pick the target.** The default target is the **core game itself**: the
   open-world overworld from a fresh start (`npm run blind` with no quest id) —
   that is how a real new player meets the game. A cycle that changed ONE quest
   instead targets that quest id + a fixed seed (`--quest <id> --seed <n>`);
   discover quest ids from default `list_world().quests[][0]` (detailed catalog
   calls expose object rows with `world_quest_id`). For variety across targeted
   cycles, rotate the seed and, when more than one quest is playable, rotate the
   quest id. The single-quest drop-in is a targeted/legacy instrument — never
   treat it as the default experience test.

2. **Spawn a blind subagent with a FRESH context.** Use whatever isolation your
   harness provides — the `Agent` tool (`subagent_type: general-purpose`), a new
   `claude -p`, or `codex exec` in a clean working context. Hand it _only_ the
   prompt template below. Never paste in design notes, the YAML, scene ids, or the
   solution. The subagent reaches the game **only** through the
   `mcp__adventureforge__*` MCP tools (discoverable via ToolSearch).
   The packaged implementation of this isolation is `npm run blind`
   (blind-tester/run.sh: isolated temp cwd, hard-disallowed file/shell/web tools,
   automatic report save + verification). Its default run plays the core-game
   overworld with the locked prompt blind-tester/prompt-overworld.md; targeted
   `--quest` runs use blind-tester/prompt.md, this template's operational twin —
   keep the two in sync. Use it when running outside an Agent-tool context, and
   `npm run blind:smoke` to prove the MCP path with no tokens.

3. **Collect the structured report** (sections 1–7 in the template): the route(s)
   taken, whether it worked mechanically, clarity/enjoyment ratings, confusion
   points, concrete bugs/flaws (each with a scene), a verdict, and — mandatory —
   the **exit interview**: a fenced ```json exit-interview``` block restating the
   findings as data (integer clarity/enjoyment, S0–S4 bug list, confusions,
   would_replay, verdict). The report verifier (`src/blind/report_verifier.ts`)
   REJECTS a report without a schema-valid block, so a playtest only counts when
   its feedback is machine-rankable; that pass/fail is what lets the assessor
   count the playtest and rotate targets, and the structured fields keep the
   feedback rankable as the assessor grows into consuming them.

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

5. **Lock the fix.** Write/refresh a bug artifact in `traces/bugs/` and add a
   regression test in `tests/regression/` that fails if the flaw returns. Run
   `npm run health`. Commit in one small green increment with durable notes in
   `AI_LOOP_STATE.md`.

## The locked-down subagent prompt (copy verbatim; fill in QUEST_ID and SEED)

```
You are a playtester for an interactive text adventure. You did NOT design this
game and must play it BLIND — like a first-time player who only sees what the game
shows you.

STRICT RULES:
- Play ONLY through the MCP tools named `mcp__adventureforge__*`. Find their schemas
  with ToolSearch: "select:mcp__adventureforge__start_world_quest,mcp__adventureforge__step_action,mcp__adventureforge__get_observation,mcp__adventureforge__list_legal_actions,mcp__adventureforge__get_state,mcp__adventureforge__get_transcript".
- DO NOT read, open, grep, or cat ANY repo files — especially nothing under
  content/, src/, ui/, or tests/. No peeking at the YAML or the solution. Your only
  window into the game is the MCP tool responses.

PLAY:
- Start shipped quests with mcp__adventureforge__start_world_quest,
  world_quest_id = "<QUEST_ID>", seed = <SEED>, hide_graph = true,
  compact_observation = true.
- Each live compact context gives scene text, state/vitals, context.exits, and
  visible objects/NPCs. Fetch stable action ids with list_legal_actions using
  compact_actions = true, then choose one with step_action(session_id,
  action_id, expected_state_hash = latest state_hash token, hide_graph = true,
  compact_observation = true). Step events are compact tuples by default; request
  compact_events = false only for event-history debugging. Repeat until
  context.ended is true. If an action id is unclear, call list_legal_actions with
  compact_actions = false once for command text. Use include_actions = true on
  compact observations only when a one-call bundled action menu is worth the
  extra payload.
- For an end-of-run transcript audit, call get_transcript(session_id,
  summary_only = true, compact_summary = true, if_transcript_hash = latest
  transcript_hash token when rechecking unchanged history). Use include_source = true
  only when the audit did not retain the start response. Use compact_turns = true
  only when route rows are needed; compact rows are [step, scene_id, action_id,
  result_scene_id].
  Compact summaries include ending_id only after an ending exists and may omit
  empty inventory/flag/journal lists. Avoid full transcripts unless diagnosing a
  specific event-history bug.
- For a mechanical state audit, call get_state(session_id, compact_state = true,
  if_state_hash = latest state_hash token when rechecking unchanged state). Do not request
  include_state = true unless diagnosing a raw engine-state bug.
- Make decisions a curious, sensible human would: follow clues, pursue the apparent
  goal, investigate what seems important. Don't pick randomly. Narrate your reasoning
  each turn. Do ONE thorough playthrough to an ending; add a SECOND only if a
  different early choice clearly opens a distinct route (this runs under a time budget).
- WATCH FOR: loops with no progress, options that don't make sense, dead ends, clues
  that point nowhere, stale/contradictory scene text, an ending you can't find.

REPORT (return these sections):
1. Playthrough log: route(s) taken (scene titles) and ending(s) reached.
2. Did it work mechanically? rejected actions, broken state, loops?
3. Understandable & fun? could you tell the goal? clues legible? clarity 1-5 + enjoyment 1-5.
4. Confusion / friction points.
5. Bugs or design flaws — concrete, each with the scene where you hit it and a
   severity S0(cosmetic)-S4(blocking).
6. Verdict: would a real player finish satisfied? one paragraph.
7. EXIT INTERVIEW (mandatory): one fenced json exit-interview block restating the
   findings as data — integer clarity/enjoyment 1-5, goal_understood, got_stuck,
   confusions[], bugs[{where, severity S0-S4, note}], best_moment, worst_moment,
   would_replay, verdict. (Exact shape: blind-tester/prompt.md section 7.)
Be honest and specific; a critical, well-observed report is more useful than a flattering one.
```

## Worked example (historical — this quest was retired in the 2026-07-06 consolidation)

The first run of this protocol on _The Watchtower Road_ (seed 7) reached both
`ending_truth` and `ending_escape`, confirmed mechanics/save-load, and surfaced
four content-polish findings (stale cart/cellar-door text, a journal entry that
stacked on cellar re-entry, and a ledger referenced by an ending but never carried).
All four were fixed as `content`/`hint_text`, locked by
`traces/bugs/bug_0002_watchtower_blind_polish.yaml` (the quest and its regression
test were later retired with the pack; the artifact survives as history). That is
the loop closing: write → play (blind) → find → fix → lock.
