# Recovery notes — scale-out Phase 1 (session 526c7df4, 2026-08-27)

RECOVERY METADATA — this file is not a repo file. Everything else under this
directory mirrors its original repo-relative path in C:\dev\zork-unlimited.

Source of truth: `C:\Users\micha\.claude\projects\C--dev-zork-unlimited\526c7df4-11e1-498b-8939-a479fa21e515.jsonl`
(line numbers below refer to that file). All 9 `subagents\*.jsonl` transcripts were scanned:
they contain ZERO Write/Edit operations on zork-unlimited paths and only read-type shell
commands — no recovered content came from them. The only shell mutation of the repo in the
whole session is the `git add -A; git commit` at line 1329 (03:23:13Z).

## Reconstruction method

Replay per file: last successful `Write` (none failed), then every subsequent successful
`Edit` in transcript order (all old_strings matched uniquely), then — where the transcript
shows the session ran `npx prettier --write` on the file afterward — prettier 3.8.3 with the
repo config ({printWidth:100, tabWidth:2, semi, doubleQuote, trailingComma:all, arrowParens:always}).
Prettier runs in-session (all of them): line 371 (02:20:13, on qa-fleet.mjs, lane.mjs,
qa_fleet_plan.test.ts, eslint.config.js "(unchanged)", package.json "(unchanged)"), line 429
(02:22:22, qa-fleet.mjs + test again), line 440 (02:22:54, prompt-qa.md changed + 3 personas
"(unchanged)"). No other `--write`/`--fix` command exists in any transcript; eslint never ran
with `--fix` (the two lint errors it found were fixed by hand-edits at lines 383/385).
Pre-prettier replay outputs are preserved in the sibling `recovered-scaleout-preformat\`.

## Recovered files

| path | source lines (Write; Edits) | edits replayed | notes |
|---|---|---|---|
| scripts/lane.mjs | 312; 318, 320 | 2 | + prettier (cmd line 371). Same op order as on disk → byte-exact modulo prettier determinism. |
| docs/parallel_lanes.md | 337 | 0 | Never prettier-formatted on disk; replay = final. Not prettier-clean (repo gate evidently didn't cover it). |
| docs/qa_fleet.md | 339; 420, 422 | 2 | Never prettier-formatted; already prettier-clean as authored. |
| docs/superpowers/specs/2026-08-27-scaleout-design.md | 210 | 0 | Never formatted; replay = final. Not prettier-clean. |
| blind-tester/qa/qa-fleet.mjs | 272; 363, 365, 367, 383, 385, 409, 411 | 7 | + prettier (371, 429). On disk, prettier interleaved between edits; final pass canonicalizes, so replay+prettier converges to the committed form. |
| blind-tester/qa/prompt-qa.md | 285; 456 | 1 (special) | Edit 456 reverted prettier's on-disk `__SEED__`→`**SEED**` mangle (prettier run 440). Reproduced exactly: prettier(replayed Write) produced the Edit's old_string exactly once; applying the Edit yielded 0 lines differing from the raw Write. `__SEED__` preserved (1 occurrence). File was then .prettierignore'd, so this IS the final disk content. |
| blind-tester/personas/critic.md | 287 | 0 | Prettier run 440 reported "(unchanged)" — replay verified prettier-clean. Final. |
| blind-tester/personas/skeptic.md | 289 | 0 | Same. |
| blind-tester/personas/impatient.md | 291 | 0 | Same. |
| tests/unit/qa_fleet_plan.test.ts | 353; 416, 418 | 2 | + prettier (371, 429). Contains 12 `it()` blocks — matches the in-session vitest run ("Tests 12 passed") and the commit message. |

Cross-checks that passed: lane zone table in lane.mjs matches the `npm run lane -- zones`
runtime output captured at transcript line 395; qa-fleet.mjs `--dry-run` plan keys match the
runtime output at line 429; final tree is prettier-3.8.3-clean except prompt-qa.md
(prettierignored by design), parallel_lanes.md and the spec (never formatted on disk).

## package.json (Edit at line 332 — snippet only, apply to scripts block)

Added after `"fleet:mock": "node blind-tester/fleet.mjs --mock",`:

```json
    "qa:fleet": "node blind-tester/qa/qa-fleet.mjs",
    "qa:fleet:dry": "node blind-tester/qa/qa-fleet.mjs --dry-run",
    "lane": "node scripts/lane.mjs",
```

## .prettierignore (Edit at line 458 — appended after the prompt-overworld-spark.md entry)

```
# The QA fleet prompt carries the same fill-prompt placeholders (__SEED__ would
# be rewritten to **SEED** by markdown emphasis normalization, silently breaking
# seed substitution).
blind-tester/qa/prompt-qa.md
```

## AGENTS.md (Edit at line 349 — inserted immediately before `## Authority`)

```markdown
## Parallel lanes & QA fleet

- Multiple agents work concurrently via lane worktrees (`npm run lane`,
  protocol: `docs/parallel_lanes.md`): one agent per worktree, zones +
  single-writer rule for global files, landing unchanged (PR + `verify`).
  Never run two agents, `loop.sh`, or a live fleet in the same worktree.
- `npm run qa:fleet` (docs/qa_fleet.md) runs cheap persona-varied blind QA
  playtests → advisory digest under `ai-runs/qa/`. Advisory only: never
  retention evidence, never `blind-tester/reports/`; reproduce mechanical
  claims deterministically before changing code.
```

## eslint.config.js (Edit at line 322 — appended a block after the existing blind-tester block)

```js
  {
    // scripts/*.mjs is Node ESM operator tooling (lane worktree management).
    // Plain JS by design — it runs under bare `node` with no transform; mirrors
    // the blind-tester/**/*.mjs block above.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
```

## Branch commit (transcript line 1329, 2026-08-28T03:23:13Z)

The session committed everything in one commit titled
"Scale-out Phase 1: parallel agent lanes + cheap persona QA fleet" — full message preserved
in `commit-message.txt` next to this file. It confirms the component list above and states:
lint, typecheck, prettier and the 12 new unit tests were green; the full 4,104-test suite
run was aborted under machine contention (CI was to arbitrate).

## Residual uncertainties (honesty over completeness)

1. Byte-exactness of qa-fleet.mjs, lane.mjs, qa_fleet_plan.test.ts relies on prettier
   determinism and on the repo's prettier version/config being the same then as in today's
   worktree (lockfile pins 3.8.3; the session edited neither `.prettierrc.json`,
   `package-lock.json` devDeps, nor prettier config — verified no Write/Edit ops on them).
2. `npm run health` (line 475, ran in background at 02:23:30) is assumed check-only; if any
   of its gates rewrote files, that would not appear in the transcript. No evidence it does
   (the commit message calls its format gate a check, and no post-health edits exist).
3. Content authored is fully accounted for; no truncated or unparseable tool inputs were
   encountered, and no Write/Edit on zork-unlimited paths failed.
