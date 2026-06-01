# Agent conventions

Rules for any AI (or human) contributing to AdventureForge. These exist because the
project's correctness guarantees come from the harness, not from any one model.

## Hard rules

1. **Do not bypass tests.** No stage is "done" until `npm run lint` and `npm test`
   are green. Do not weaken or skip a test to make a change pass.
2. **Content is data, never code** (spec §16). Content packs are YAML/JSON validated
   by schema. No `eval`, no embedded scripts, no shell-outs from content. The engine
   interprets only the closed condition/effect vocabulary in `src/core/`.
3. **Mechanics live in deterministic code; content lives in validated data** (§3).
   Never blur the Layer-2 (data) / Layer-3 (engine) boundary. The engine asks a
   `Rules` resolver what an action means — it never embeds story content.
4. **The engine is pure** (§8.1, §8.5). `step` must not mutate input, perform I/O,
   read a clock, or use a global RNG / `Math.random`. All randomness flows through
   `src/core/rng.ts`, seeded from `GameState`.
5. **No secrets in the repo**, in content, or in logs. Tests and CI must run with
   deterministic mock agents and never require live LLM calls.
6. **Patches are applied by deterministic code, not by a model.** A proposed fix is
   structured data that our code validates and applies.

## Human approval gate (spec §0, §14)

Engine-rule edits, schema migrations, and anything that could weaken determinism or
corrupt saves require human review. "A strong model wrote it" is not a safety argument.

## Workflow

- Commit in small, reviewable increments; each commit leaves the repo green.
- Every bug becomes a replayable trace in `traces/bugs/` plus a regression test
  in `tests/regression/` (§15).
- If a requirement is ambiguous, prefer the interpretation that makes the engine
  **stricter** and the content **more validated** (§0).
- For AFK improvement loops, treat MCP play as mandatory evidence. A meaningful
  cycle must discover stories, validate the selected pack, run random and
  coverage playtests, complete a known good ending route, attempt an exploratory
  route, and record compact durable notes in `AI_LOOP_STATE.md`.
- **Run the blind playtest each cycle** per [`docs/blind_playtest_protocol.md`](docs/blind_playtest_protocol.md):
  spawn a fresh subagent with NO design context that plays the pack only through
  the `mcp__adventureforge__*` tools (it must not read `content/`, `src/`, `ui/`,
  or `tests/`), collect its structured report, and turn its findings into one
  focused fix. The heuristic `run_playtest` checks structure; the blind subagent
  checks the player experience — run both. Apply content/hint fixes via the fixer
  (`apply_content_patch`) or a re-validated YAML edit; engine-rule/validator/schema
  changes stay gated (§14). Lock every fix with a `traces/bugs/` artifact + a
  `tests/regression/` test (§15).
- Keep raw autonomous evidence in ignored `ai-runs/`; do not commit generated
  saves, transcripts, coverage, build output, or dependency directories.
