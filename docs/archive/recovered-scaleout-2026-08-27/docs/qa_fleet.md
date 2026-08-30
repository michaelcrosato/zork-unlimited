# QA fleet (advisory persona playtests, cheap tier)

`npm run qa:fleet` runs many inexpensive blind LLM playtests with varied,
critical-leaning personas and aggregates their findings. It is the second lane
of the two-lane testing split (design:
`docs/superpowers/specs/2026-08-27-scaleout-design.md` §4); the retention/
certification lane (`npm run blind`, `npm run fleet`) is unchanged.

## What it is — and is not

- **Advisory evidence.** QA reports are unverified prose from cheap models:
  they point humans and lane agents at problems (confusing text, suspected
  bugs, pacing complaints, S0–S4 findings). Per the blind-playtest protocol's
  own stance, reproduce every mechanical claim deterministically before
  changing code.
- **Never retention evidence.** Output is quarantined under `ai-runs/qa/`
  (gitignored) and never touches `blind-tester/reports/`, pilots,
  certification, or the feedback acceptance chain. Personas prescribe
  behavior, so they stay banned from the retention lane, whose neutral-default
  rule is what keeps continuation measurements honest.
- **Blind by construction.** Each run launches the real MCP server with
  `--play-mode pure`, so the server enforces the human-only tool surface. The
  player process has no shell tool, no web, no repo rules/docs ingestion, and
  runs from an isolated working directory.

## Cost model

- Default tier: `gpt-5.3-codex-spark` at `model_reasoning_effort="low"` —
  instant-response, roughly 1–2 minutes per run.
- Max-think sampling: a seeded PRNG upgrades ~1% of runs (`--think-rate`,
  default 0.01) to `gpt-5.6-terra` at `xhigh`, for occasional depth at
  negligible average cost.
- The plan (`--dry-run` to inspect) is deterministic from
  `(count, seed base, think rate, persona weights)`.

## Personas

Roster and weights (`DEFAULT_PERSONA_WEIGHTS` in
`blind-tester/qa/qa-fleet.mjs`) lean critical/high-standards: `critic` ×3,
`skeptic` ×2, `impatient` ×2, `breaker` ×2, plus `explorer`, `speedrunner`,
`casual`, `lore-reader` ×1 each. All persona files live in
`blind-tester/personas/` and carry the shared anti-sycophancy CALIBRATION
block. Non-default personas remain rejected by live pure runs — that gate is
untouched.

## Usage

```
npm run qa:fleet:dry                       # print the deterministic roster, spend nothing
npm run qa:fleet                           # 8 runs, concurrency 2, seed base = UTC yyyymmdd*1000
npm run qa:fleet -- --count=20 --concurrency=4 --seed-base=900500 --label=albany-sweep
```

Output, per fleet, under `ai-runs/qa/<label>/`:

- `runs/<seed>_<persona>/` — prompt, provider log, final message, parsed
  `interview.json`, server-written `evidence.jsonl`
- `summary.json` — totals, per-persona stats (including zero-negative counts,
  the sycophancy smell), findings by severity
- `qa-digest.md` — the human/agent-facing digest, most severe first

Flags: `--count`, `--seed-base`, `--think-rate`, `--concurrency`, `--out`,
`--label`, `--timeout-seconds`, `--dry-run` — use equals form (`--count=20`)
through `npm run`, since npm/PowerShell can swallow space-separated flags (the
driver recovers them when it can, same rule as `blind-launch.mjs`).
`QA_CODEX_JS` overrides Codex CLI resolution (path to
`@openai/codex/bin/codex.js`).

## Feeding the loop

Phase 1 consumption is direct: lane agents and the orchestrator read
`qa-digest.md` and turn reproducible findings into fixes, regressions, and
`traces/bugs/` artifacts through the normal workflow. Admitting persona-QA
cohorts into `feedback:compile` as actionable-but-retention-ineligible
evidence is Phase 3 (owner review + protocol revision required); the per-
persona sycophancy analytics in `src/feedback/metrics.ts` already support it.
