# Blind playtest protocol (the "fresh player" step)

This is the canonical, repeatable procedure for the playtest step of an
improvement cycle — manual or autonomous (AFK). It is Tier 2 of the project's
three-tier testing pyramid (docs/testing*pyramid.md): dev tests (Tier 0) and the
mechanical crawler (Tier 1) prove \_structure* (every ending reachable, no
soft-locks, sound scoring, no mechanical defects), while this step measures the
_experience_ a real first-time player has, which only a reasoning agent that **did
not design the game** can report. A fresh single blind agent covers a normal
cycle; a **100-agent fleet** (`npm run fleet`, below) covers milestone and
feedback-harvest cycles, and `fleet:mock` gives CI the same pipeline at zero
token cost.

The whole point is **isolation**: the playtester must judge the game from the
inside, using only what the game shows it. If it reads the YAML, the source, or
the solution, the test is worthless.

## When to run it

Once per improvement cycle, after the affected content validates green
(`validate_quest` over MCP, or `npm run validate`; for a content_new cycle,
validate the new quest first). In the AFK loop it is step 1 of the WORK phase —
before "make ONE improvement" — and its findings are a primary input to the fix.
Regardless of which content changed, every live reasoning-agent playtest begins
with a new overworld game and reaches quests only by discovering them in-world.

## Procedure (5 steps)

1. **Start the real player path.** The live target is always the **core game
   itself**: a brand-new open-world overworld session (`npm run blind`, with no
   quest id). This holds even when a cycle changed one quest: the blind player
   must discover and enter it through the overworld bridge, just as a real new
   player would. Rotate seeds and personas for variety. A direct single-quest
   start is a structural dev/QA instrument restricted to non-LLM smoke/mock/
   crawler checks; it never counts as the cycle's live experience report.

2. **Spawn a blind subagent with a FRESH context.** Use whatever isolation your
   harness provides — the `Agent` tool (`subagent_type: general-purpose`), a new
   `claude -p`, or `codex exec` in a clean working context. Hand it _only_ the
   prompt template below. Never paste in design notes, the YAML, scene ids, or the
   solution. The subagent reaches the game **only** through the
   `mcp__adventureforge__*` MCP tools (directly callable when the runner exposes
   them; one startup ToolSearch fallback is allowed for clients that expose MCP
   tools through discovery instead of the active tool list).
   The packaged implementation of this isolation is `npm run blind`
   (blind-tester/run.sh: isolated temp cwd, hard-disallowed file/shell/web tools,
   automatic report save + verification). Every live run plays a fresh core-game
   overworld with the locked prompt `blind-tester/prompt-overworld.md`. The
   direct-quest `blind-tester/prompt.md` exists only for non-LLM structural
   smoke/mock fixtures. Use the harness when running outside an Agent-tool
   context, and `npm run blind:smoke` to prove both MCP start surfaces with no
   reasoning agent or tokens.

3. **Collect the structured report** (sections 1–7 in the template): the route(s)
   taken, whether it worked mechanically, clarity/enjoyment ratings, confusion
   points, concrete bugs/flaws (each with a scene), a verdict, and — mandatory —
   the **exit interview**: a fenced `json exit-interview` block restating the
   findings as data (integer clarity/enjoyment, S0–S4 bug list, confusions,
   would_replay, verdict). The report verifier (`src/blind/report_verifier.ts`)
   REJECTS a report without a schema-valid block, so a playtest only counts when
   its feedback is machine-rankable; that pass/fail is what lets the assessor
   count fresh playtests and rotate seeds/personas, and the structured fields
   keep the feedback rankable as the assessor grows into consuming them.

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

## The locked-down subagent prompt (copy verbatim for a fresh overworld start)

```
You are a playtester for an open-world text RPG. You did NOT design this game
and must play it BLIND — like a first-time player who only sees what the game
shows you. Begin the CORE GAME from a FRESH START; quests are things you discover
in the world, never direct-start targets.

STRICT RULES:
- Play ONLY through the MCP tools named `mcp__adventureforge__*` (or
  `adventureforge/*` in Codex logs). Your first game action must call
  `mcp__adventureforge__start_overworld` with `compact_context = true`. Never
  restore/import a session or call a direct quest-start tool. If the overworld
  start tool is not visible, call ToolSearch exactly once for AdventureForge
  start tools, then immediately use the returned start tool.
  Do not claim the tool is unavailable unless both the direct tool is unavailable
  and the one ToolSearch fallback exposes no AdventureForge start tool.
- DO NOT read, open, grep, or cat ANY repo files — especially nothing under
  content/, src/, ui/, or tests/. No peeking at the YAML or the solution. Your only
  window into the game is the MCP tool responses.

PLAY:
- Read the one-time `tutorial` in the fresh-start response and judge whether it
  is enough to begin without outside knowledge.
- Keep the compact `legend` sent with the start response. Orient from `here`,
  `vitals`, `hidden`, and `roads`; later compact contexts omit the legend.
- Discover local work naturally. Scout points of interest, talk to contacts,
  explore or move between local areas, and investigate what looks important.
  Use only ids exposed by the current context and guard overworld writes with the
  latest `snapshot_hash`.
- Live in the world: work a job or resolve an event, and take at least one road.
  If travel raises `pending_road`, resolve that encounter before any other
  overworld action. Notice whether time, supplies, and fatigue feel legible.
- If a quest lead appears and budget allows, walk to its shown anchor area and
  enter it with `start_overworld_session_quest`. Play the returned RPG session
  through `list_legal_actions` (`compact_actions = true`) and `step_action`
  (`expected_state_hash = latest state_hash`, `hide_graph = true`,
  `compact_observation = true`) until it ends; then fold it back with
  `complete_overworld_session_quest`. Use `compact_actions = false` once only
  when an action id is unclear, and `include_actions = true` only when one-call
  action bundling is worth the larger observation. A quest counts only when
  reached through this fresh overworld journey.
- For a mechanical quest-state audit, use `get_state` with
  `compact_state = true`; request `include_state = true` only to diagnose a raw
  engine-state defect. For a transcript audit, request `summary_only = true`
  with `compact_summary = true`; add `compact_turns = true` only when route rows
  are needed.
- The overworld has no ending. Stop deliberately after roughly 30–45 tool calls,
  once you have oriented, discovered local work, taken a road, and completed a
  meaningful job/event or a discovered quest.
- Make decisions a curious, sensible human would. Don't pick randomly. Narrate
  your reasoning each turn in one short line.
- WATCH FOR: an unclear first move, hidden work with no signposting, loops with no
  progress, options that do not make sense, stale text, unreachable leads,
  unresolvable road encounters, and costs that feel confusing or unfair.

REPORT (return these sections):
1. Playthrough log: where you started, what you discovered, where you travelled,
   and what meaningful work/event/quest you completed.
2. Did it work mechanically? rejected actions, broken state, loops, soft-locks?
3. Understandable & fun? was the opening and route into content legible?
   clarity 1-5 + enjoyment 1-5.
4. Confusion / friction points.
5. Bugs or design flaws — concrete, each with the town/area/scene where you hit it and a
   severity S0(cosmetic)-S4(blocking).
6. Verdict: would a real new player keep playing after this opening? one paragraph.
7. EXIT INTERVIEW (mandatory): one fenced json exit-interview block restating the
   findings as data — integer clarity/enjoyment 1-5, goal_understood, got_stuck,
   confusions[], bugs[{where, severity S0-S4, note}], best_moment, worst_moment,
   would_replay, verdict. (Exact shape: blind-tester/prompt-overworld.md section 7.)
Be honest and specific; a critical, well-observed report is more useful than a flattering one.
```

## Fleet mode

`npm run fleet -- --count 100 --concurrency C --model <alias|mix> --personas mixed
--target overworld --seed-base S` runs the 100 independent fresh-overworld blind
playtests required for a milestone/feedback-harvest cycle (each an ordinary
`blind-tester/run.sh` spawn), with bounded concurrency, resume
(a prior verified report for the same seed/target is reused, never re-run),
pacing/backoff on failed attempts, and a manifest at
`ai-runs/fleet/<label>/manifest.jsonl`. Reports land in
`blind-tester/reports/` (or `--out <dir>`), named by the same
`<stamp>_<source>_seed<n>.md` convention the ledger regex parses. A run only
counts as `verified` when `run.sh` exits 0 **and** a second, independent
`scripts/verify-blind-report.ts` pass agrees.

- **Personas** — `blind-tester/personas/{default,explorer,speedrunner,breaker,
casual,lore-reader}.md`. `--personas mixed` rotates through
  explorer/speedrunner/breaker/casual/lore-reader in index order (reproducible,
  not sampled). Each carries a calibration anchor so scores stay comparable
  across personas, e.g. explorer's: "3/5 = an average competent text
  adventure. 5/5 = you would recommend it unprompted... If you report zero bugs
  AND zero confusions, you MUST state what you TRIED that failed to surface any
  (at least three concrete attempts)."
- **Model mix** — `--model mix` weights 9 haiku : 1 sonnet by run index
  (deterministic, not random). There is **no temperature/top_p flag** — persona
  × model × seed is the live diversity mechanism; do not look for a
  sampling-temperature knob on the `claude` CLI invocation, it doesn't exist
  here. The live target remains the fresh overworld.
- **Resume/pacing** — a failed attempt retries with exponential backoff (up to
  `--max-retries`, default 2); re-invoking the same fleet command later resumes
  cleanly instead of re-running verified seeds.

## Mock mode

`--mock` (or `npm run fleet:mock`) sets `BLIND_AGENT_CMD` to
`blind-tester/mock-agent.mjs` — a deterministic, MCP-speaking scripted agent
that plays for real over the MCP tools but needs no LLM and spends zero
tokens. This is what CI runs: `tests/acceptance/fleet_mock_pipeline.test.ts`
drives a small mock fleet through fleet → verified reports → compiler
end-to-end so the whole Tier 2 → Tier 3 pipeline is exercised on every push with
no API key and no external agent CLI required. As historical capacity evidence,
the standalone `npm run fleet:mock -- --count 20` lane verified 20/20 in ~18s.
Mock/smoke checks may use `quest:<id>` targets to exercise direct quest-start
plumbing; that exception never authorizes a live reasoning-agent drop-in.

## Sycophancy telemetry

Positive reports are **data**, never rejected for positivity — the risk this
guards against is the opposite failure, an agent that rates everything highly
regardless of what it actually saw. The feedback compiler (`src/feedback/
metrics.ts`) measures this directly rather than filtering it: a "zero-negative"
report (no bugs AND no confusions) rate, overall and per-persona, plus 1–5
clarity/enjoyment score distributions (histograms), surfaced in
`hotspots.json`'s `sycophancy` block and in `hotspots.md`. A persona or model
with a suspiciously high zero-negative rate is a signal to read its reports
more skeptically, not a report to discard.

## Worked example — the first default-mode core-game run (2026-07-07)

The first `npm run blind` after the overworld became the default played the
core game end to end on one subscription run (49 tool turns, ~7.6 min): a
fresh start in Albany, the discovery loop (explore/scout/talk revealing areas,
jobs, and the Wolf-Winter lead), the full quest through the overworld→quest
bridge to the "Byre Held" ending, a road travel with its encounter resolved,
and a verified report (clarity 4/5, enjoyment 4/5) with a schema-valid exit
interview. Its findings drove immediate fixes, each locked with a regression
test: the opaque mid-dialogue rejection
(`traces/bugs/bug_0494_dialogue_rejection_opaque.yaml`) and the zero-renown
quest completion (`traces/bugs/bug_0495_quest_completion_no_renown.yaml`); its
suspected PRNG repeat was disproved by a deterministic repro (retries roll
fresh d20s per step). That is the loop closing: play (blind) → find → verify →
fix → lock. (The protocol's very first run, on the since-retired _The
Watchtower Road_, survives as history in
`traces/bugs/bug_0002_watchtower_blind_polish.yaml`.)
