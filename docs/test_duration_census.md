# Test duration census

What every test file in this repository actually costs, measured rather than
estimated, and what that implies for which tests run on every commit and which
run once a day.

[`docs/testing_pyramid.md`](./testing_pyramid.md) says what each lane is FOR.
This says what each lane COSTS, and the two answer different halves of the same
scheduling question: relevance decides what a lane is allowed to skip, and price
decides what it can afford to keep.

## Why measure at all

`scripts/ci-test-groups.ts` shards CI from `MEASURED_TEST_COST_MS`, a 23-entry
table sampled once from GitHub Actions run 30295854622 on 2026-07-27. Every
other file — the other ~470 of them — is priced at a flat `DEFAULT_TEST_COST_MS`
of 3s. The table's own comment states the hazard it cannot fix:

> the dangerous direction is the reverse of this one, since a file that grows
> expensive carries no entry at all and is packed as if trivial.

That is not hypothetical. Two entries in the table sat at ~272s each for four
weeks after the files behind them were rewritten into 1.2s guards — 543s of
phantom cost in a 6,823s table. The correction was made by hand, once, and
nothing re-measures.

A frozen table cannot answer "what should run on every commit", because the
answer moves every time a test file does. So this census is a re-runnable
measurement, not a second table.

## How it is measured

```bash
npm run test:durations -- --lane fast          # → ai-runs/test-durations-fast.jsonl
npm run test:durations -- --lane exhaustive    # → ai-runs/test-durations-exhaustive.jsonl
npm run test:census -- ai-runs/test-durations-fast.jsonl ai-runs/test-durations-exhaustive.jsonl
```

`scripts/test-duration-reporter.ts` records each module's FULL price —
prepare + environment setup + collect + setup + body — because in this suite the
test bodies are usually the small half. `tests/unit/test_lanes.test.ts` spends
42ms in its six `it()` bodies and 407ms importing the module graph those bodies
exercise. Vitest's built-in `json` reporter reports the 42ms, which is why it is
not used here: scheduling on body time alone systematically under-prices exactly
the many-small-files shape this suite has.

The two lanes are measured separately because `vitest.config.ts` gives the
census proofs one or two workers and the standard project up to eight. Measuring
them together would price both under a concurrency neither actually receives.

### What these numbers are and are not

- **They are wall-clock cost under contention**, taken with the config's own
  worker counts on a 4-core/15GB Linux box. That is the quantity scheduling
  decisions need, and it is the same quantity CI experiences. It is not a
  measure of algorithmic work.
- **A GitHub Actions runner is not this box.** Treat the ratios between files as
  the portable result and the absolute numbers as machine-specific. Re-run the
  census on the machine whose budget you are actually spending.
- **`collect` is partly a shared cost attributed to whoever paid it first.**
  Vite transforms a module once per run; the file that imports it first is billed
  for the transform, and later files importing the same graph collect in
  milliseconds. Per-file collect numbers are therefore an upper bound on what
  removing that one file would save.
- **Isolation makes the rest of `collect` genuinely per-file.** With
  `isolate: true` every file executes its import graph in a fresh process, and no
  cache spans processes. That part is paid once per file, every run.

## Results — the fast lane (`test:fast`, the `standard` project)

488 files, 4,444 test cases, measured at the config's local worker count (4 on a
4-core box). **216.6 minutes of summed worker time, 54.1 minutes of wall clock.**

### Files per duration band

| band       | files | % of files | cases | summed cost | % of cost |
| ---------- | ----: | ---------: | ----: | ----------: | --------: |
| < 10s      |   309 |      63.3% | 2,541 |     3.3 min |  **1.5%** |
| 10s – 1min |   130 |      26.6% | 1,018 |    85.8 min |     39.6% |
| 1 – 5min   |    45 |       9.2% |   794 |    78.1 min |     36.0% |
| 5 – 10min  |     2 |       0.4% |    24 |    12.9 min |      6.0% |
| 10 – 20min |     1 |       0.2% |    24 |    14.1 min |      6.5% |
| > 20min    |     1 |       0.2% |    43 |    22.4 min | **10.3%** |

The distribution is extremely skewed in both directions at once. **Two thirds of
the suite runs in under ten seconds a file and accounts for 1.5% of the bill.
Four files — 0.8% of the suite — account for 23% of it.** The median file costs
0.64s; the mean costs 26.6s.

### Cumulative: a lane holding every file under a threshold

| lane = every file under | files | % suite | serial cost | wall @4 workers | what it adds       |
| ----------------------- | ----: | ------: | ----------: | --------------: | ------------------ |
| 10s                     |   309 |   63.3% |     3.3 min |       **49.4s** | —                  |
| 1 min                   |   439 |   90.0% |    89.1 min |        22.3 min | +130 files, +86min |
| 5 min                   |   484 |   99.2% |   167.2 min |        41.8 min | +45 files, +78min  |
| 10 min                  |   486 |   99.6% |   180.1 min |        45.0 min | +2 files, +13min   |
| 20 min                  |   487 |   99.8% |   194.2 min |        48.5 min | +1 file, +14min    |
| (everything)            |   488 |    100% |   216.6 min |        54.1 min | +1 file, +22min    |

### Individual test cases

| band       | cases | % of cases | summed body time |
| ---------- | ----: | ---------: | ---------------: |
| < 10s      | 4,269 |      96.1% |         21.5 min |
| 10s – 1min |   154 |       3.5% |         92.0 min |
| 1 – 5min   |    21 |       0.5% |         31.3 min |

**96% of the individual test cases finish in under ten seconds.** 21 cases —
half a percent — cost 31 minutes between them.

### The tail, named

| file                                                               |    cost |    body | imports |
| ------------------------------------------------------------------ | ------: | ------: | ------: |
| `tests/regression/overworld_cli.test.ts`                           | 22.4min | 21.8min |   36.2s |
| `tests/regression/mcp_pure_play_mode.test.ts`                      | 14.1min | 14.0min |    5.7s |
| `tests/starting_slice/campus_archive_query_counterfactual.test.ts` |  7.5min |  6.9min |   36.5s |
| `tests/regression/crawl_workers_determinism.test.ts`               |  5.4min |  5.4min |    25ms |
| `tests/acceptance/fleet_mock_pipeline.test.ts`                     |  4.6min |  4.6min |    80ms |
| `tests/regression/no_dead_pocket.test.ts`                          |  4.4min |  4.3min |   280ms |

The frozen table prices the first two at 4.8min and 2.8min. Both are now several
times that. `overworld_cli` and `mcp_pure_play_mode` between them cost 36.5
minutes of the fast lane — the lane that runs on every commit and in both PR
shards — and neither carries a current entry in the table that schedules it.

## The largest single cost is not a test

Import cost across the 488 files is **bimodal, with nothing in between**:

| import cost | files |
| ----------- | ----: |
| < 1s        |   334 |
| 1 – 10s     |    40 |
| 10 – 25s    | **0** |
| 25 – 40s    |    96 |
| > 40s       |    18 |

A file either imports the shipped world or it does not. **114 files pay more
than 25 seconds each before their first assertion runs, 69.2 minutes in total —
32% of the entire lane's worker time.**

What they share is a module-level `loadOverworldManifest(process.cwd())`. Timed
directly:

```
world json size:            2.71 MB
readFileSync:                 11 ms
JSON.parse:                   19 ms
full loadOverworldManifest: 21,633 ms
```

**Reading and parsing the world costs 30ms. The other 21.6 seconds is
validation** — the zod parse, `assertOverworldIntegrity`,
`assertOverworldQuestSourceCoverage`,
`assertOpeningPreparationCheckDisclosureSourceIntegrity`, and `deepFreeze`.

The loader already memoizes: a second call in the same process returns in 0ms.
But `vitest.config.ts` sets `isolate: true`, so every test file gets a fresh
process and the memo never survives one. **The same immutable shipped content is
re-validated from scratch 114 times per suite run, and every run must reach the
same verdict** — a verdict `npm run validate` already establishes once, earlier
in the same bar.

This is the single biggest line item in the suite, it is not a test, and no
amount of re-bucketing touches it. Three ways out, cheapest first:

1. **Validate once, reuse under a content hash.** Key the memo on a hash of the
   world file and record a validated-hash marker under `ai-runs/`; a process
   whose hash matches skips straight to `deepFreeze`. Keeps isolation, keeps the
   check honest (a changed world revalidates), and is confined to
   `src/world/source.ts`.
2. **Validate once in a vitest `globalSetup`** and let files load a pre-validated
   snapshot. Same saving, but it moves a correctness check into test
   infrastructure, where a content change could skip it more easily.
3. **`isolate: false` for the standard project.** Drops the cost to once per
   worker. It also drops the determinism guarantee the config explicitly wants —
   "tests must not depend on wall-clock ordering or shared state" — so this is
   the option to reach for last, and only with the measurement in hand.

Option 1 is the recommendation: it is the only one that removes the redundancy
without weakening either isolation or validation.

**Landed 2026-09-05 (bug_0611).** `loadOverworldManifest` records a marker under
`ai-runs/world-integrity/` keyed on the SHA-256 of the world bytes and of every
`.ts` file under `src/`, and a later process whose key matches skips
`assertOverworldIntegrity` (18.6 of the loader's 20 seconds on this box). The
cheap checks still run every time. `ADVENTUREFORGE_WORLD_INTEGRITY_CACHE` selects
`use` (default), `refresh` or `off`; `npm run validate` forces `refresh`, so the
bar re-proves and rewrites the marker before the suite reads it, and the CI test
shards run `validate` first for the same reason.

### What that one fix does to the bands

63% of the files in the 10s–1min band (82 of 130) are there only because of
import cost; that band's 85.8 minutes contains 49.7 minutes of imports. Charging
every file at most 1s of import — the shape a validated-once world would have —
moves the whole distribution:

|                       |     today | world validated once |
| --------------------- | --------: | -------------------: |
| summed worker time    | 216.6 min | **149.0 min** (−31%) |
| wall clock @4 workers |  54.1 min |  **37.2 min** (−31%) |
| files under 10s       |       309 |              **373** |
| files 10s – 1min      |       130 |                   87 |
| files 1 – 5min        |        45 |                   24 |

(A model, not a measurement: it assumes the world is the only expensive import,
which is optimistic for a handful of files. The direction and the rough size are
robust — 114 files times a measured 21.6s is 41 minutes on its own.)

**This is why the staging question should not be answered first.** Nearly a third
of the cost being staged is a redundancy, and 64 files sit in a slower band than
they belong in. Designing a schedule around that would be designing around an
artifact.

## Results — the exhaustive lane (`test:exhaustive`, the six census proofs)

6 files, 92 test cases, **60.6 minutes of summed worker time, 53.0 minutes of
wall clock** (the four projects run one after another by `groupOrder`, so most of
that is a single-threaded tail).

| proof                                | measured | frozen table | ratio |
| ------------------------------------ | -------: | -----------: | ----: |
| `rpg_metamorphic_observation_stream` | 27.4 min |     26.5 min | 1.03x |
| `rpg_variant_liveness`               |  8.4 min |     11.7 min | 0.71x |
| `rpg_action_id_unique`               |  7.6 min |     13.2 min | 0.58x |
| `rpg_score_economy_sound`            |  7.5 min |     11.4 min | 0.66x |
| `rpg_metamorphic_relabel`            |  5.9 min |     10.7 min | 0.55x |
| `rpg_all_endings_reachable`          |  3.8 min |      5.3 min | 0.72x |
| **total**                            | **60.6** |     **78.9** |       |

Five of the six are 0.55–0.72x their frozen price and one matches. The table is
wrong in both directions, which is the point: it is a snapshot, not a
measurement.

**`rpg_metamorphic_observation_stream` costs 27.4 minutes and is the only test
in the repository above the 20-minute mark.** It is 52% of the exhaustive lane's
wall clock on its own, it runs `maxWorkers: 1` by design, and no worker count can
go below it. If the nightly window ever becomes a constraint, that one file is
the entire conversation.

## All 494 files together

**4,536 test cases, 277.1 minutes of summed worker time.** Measured wall clock as
the lanes are actually configured: 54.9 min (fast) + 53.0 min (exhaustive) =
**107.9 minutes**.

| band       | files | % of files | cases | summed cost | % of cost |
| ---------- | ----: | ---------: | ----: | ----------: | --------: |
| < 10s      |   309 |      62.6% | 2,541 |     3.3 min |      1.2% |
| 10s – 1min |   130 |      26.3% | 1,018 |    85.8 min |     31.0% |
| 1 – 5min   |    46 |       9.3% |   807 |    81.8 min |     29.5% |
| 5 – 10min  |     6 |       1.2% |    89 |    42.3 min |     15.3% |
| 10 – 20min |     1 |       0.2% |    24 |    14.1 min |      5.1% |
| > 20min    |     2 |       0.4% |    57 |    49.8 min |     18.0% |

| every file under | files | % of suite | projected wall @4 workers |
| ---------------- | ----: | ---------: | ------------------------: |
| 10 seconds       |   309 |      62.6% |                 **49.4s** |
| 1 minute         |   439 |      88.9% |                  22.3 min |
| 5 minutes        |   485 |      98.2% |                  42.7 min |
| 10 minutes       |   491 |      99.4% |                  53.3 min |
| 20 minutes       |   492 |      99.6% |                  56.8 min |

(The wall column pools every file at 4 workers, which is a model — the exhaustive
lane really runs serialized. Use it to compare cohorts, not to predict CI.)

**95.7% of the 4,536 individual test cases finish in under ten seconds.** One
case — in the metamorphic observation proof — takes over twenty minutes by itself.

## Controls

Every number above was taken under 4-way contention on a 4-core box, so three
checks separate "this file is expensive" from "this box was busy".

**Contention costs 1.5–1.8x.** Re-running three files alone:

| file                           | in the suite |    alone |           frozen table |
| ------------------------------ | -----------: | -------: | ---------------------: |
| `overworld_cli`                |     22.4 min | 13.0 min |                4.8 min |
| `mcp_pure_play_mode`           |     14.1 min |  8.0 min |                2.8 min |
| `overworld_snapshot_integrity` |      2.3 min |  1.5 min |                  37.4s |
| `mcp_tools`                    |      1.5 min |      56s | _unlisted (priced 3s)_ |

Contention explains part of the gap — a consistent 1.5-1.8x — and not the rest.
`overworld_cli` is **13 minutes alone against a 4.8-minute frozen price** and
`mcp_pure_play_mode` **8 minutes against 2.8**. Both grew, and both grew in the
lane that runs on every commit. Run alone `overworld_cli` passes, and its slowest
single test case still takes 92 seconds. `mcp_tools` costs 56 seconds alone and the
allocator prices it at the 3-second default for unlisted files, which is the
"packed as if trivial" failure the table's own comment predicts.

**Isolation costs about half the cheap cohort's wall clock.** The 309 sub-10s
files, same workers, only `isolate` changed:

|                         |    wall | result                            |
| ----------------------- | ------: | --------------------------------- |
| `isolate: true` (today) |     63s | 1 failed, 2,539 passed, 1 skipped |
| `--no-isolate`          | **32s** | 1 failed, 2,539 passed, 1 skipped |

Identical pass/fail, half the time. Treat that as evidence, not proof: it is one
run each, and a shared-state dependency could be order-sensitive and not show up
in a single trial. The determinism guarantee in `vitest.config.ts` deserves more
than one sample before it is traded away.

**The world load is not a contention artifact.** Re-measured on an idle machine
(load average 0.43): **22.1 seconds**, matching the 21.6s taken under load.

### About the 12 failures in the measured run

The fast-lane measurement exited red. None of it is a regression, and the
breakdown matters because it is itself a finding:

- **2 files — shallow clone.** `bug_trace_integrity` and `qa_triage_cli` validate
  against reachable Git history; this checkout has 67 commits and is shallow.
  `ci.yml` sets `fetch-depth: 0` for exactly this reason.
- **10 files — load, at 4 workers.** Seven vitest timeouts (nine at 60s, one at
  120s) and three `spawnSync ETIMEDOUT` in subprocess-spawning tests. One of them
  is `rpg_validation_bar`, which `vitest.config.ts` names by name as the test that
  went red when CI workers were raised from 2 to 4.

The measurement reproduced the documented failure mode exactly. That is a result:
**the fast lane is already at the edge of its own timeouts**, so its cost is not
just wall clock — it is flake risk that rises with every minute added to it.

## What to do about it

### The ranking is not by duration

The instinct behind "which bucket runs when" is right, but the measurement says
the first two moves are not scheduling moves at all. Both are strictly better
than any deferral, because they cost nothing in coverage:

| #   | move                                     | fast lane @4 workers | files deferred |
| --- | ---------------------------------------- | -------------------: | -------------: |
| —   | today                                    |             54.1 min |              0 |
| 1   | validate the world once                  |         **37.2 min** |              0 |
| 2   | + move the slow four off the commit gate |         **25.2 min** |              4 |

At 8 workers the same two moves take the lane from 27.1 min to **12.6 min**.

**1. Validate the shipped world once per run, not 114 times.** Detailed above.
−31% of the lane, no test deferred, no isolation weakened. Do this first.

**2. Deal with the four files that set the floor.** `overworld_cli` (22.4 min),
`mcp_pure_play_mode` (14.1 min), `campus_archive_query_counterfactual` (7.5 min)
and `crawl_workers_determinism` (5.4 min) are 0.8% of the fast lane and 23% of
its cost. The floor matters more than the total: a lane can never finish
faster than its longest single file, and **that file is `overworld_cli` — 22.4
min under load, 13.0 min even with the machine to itself.** After move 1 the
fast lane is bounded almost entirely by it (37.2 min wall against a 21.8 min
floor). Removing the four drops the floor to 4.6 min, which is what makes
more workers worth buying at all.

Two of the four (`overworld_cli`, `crawl_workers_determinism`) are the
subprocess-spawning tests that time out under load, so moving them off the
commit gate removes flake as well as minutes. They cost 91 test cases at a slower
cadence — the one real trade in this list, and a much smaller one than any
duration bucket would make.

**Observed on a real runner.** Two consecutive CI runs on this branch, on
GitHub's own hardware at the config's CI worker count of 2:

| run                    | shard 1/2 |    shard 2/2 | gap |
| ---------------------- | --------: | -----------: | --: |
| 33708077679 (4ce10e32) |  26.5 min | **33.2 min** | 25% |
| 33710706181 (557d531e) |  27.1 min | **31.9 min** | 18% |

Shard 2 is the slower one in both, by 18-25%, and the PR gate's critical path is
whichever shard is slower. Shard 1 is stable across the two runs to within 0.6
min, so the gap is the split rather than runner noise. That is the frozen table's
imbalance showing up in the merge queue, on hardware that has nothing to do with
the box this census was taken on — the part of the census that needs no trust in
my measurements at all.

**3. Re-price `MEASURED_TEST_COST_MS` from the census.** The allocator prices
`mcp_tools` at 3s; it costs 56s alone. It prices `mcp_pure_play_mode` at 2.8 min;
it costs 8 min alone. Sharding on those numbers is why one PR shard can be much
longer than the other. `npm run test:census -- --json` emits the table's input
directly.

### Then the tiers

Only after the above do duration tiers earn their keep. Three, not five:

| tier            | contents                              |                             cost | cadence            |
| --------------- | ------------------------------------- | -------------------------------: | ------------------ |
| **inner loop**  | the 309 files under 10s (2,541 cases) | **49s** measured, 32s unisolated | on save / pre-push |
| **commit gate** | the fast lane, minus the slow four    |          25.2 min @4w (12.6 @8w) | every commit + PR  |
| **nightly**     | the 6 census proofs + the slow four   |           53 min, floor 27.4 min | once a day         |

The inner-loop tier is the one genuinely missing today, and it is nearly free:
309 files, 57% of the suite's test cases, for 0.8% of its cost. Note what it is
not — it defers 1,995 cases, so it is a filter for the edit loop, **not a gate**.
Nothing should merge on it.

Five tiers is one or two too many. Between 10s and 1 minute there is no natural
boundary once the world load is fixed; between 5, 10 and 20 minutes there are
exactly three files in the entire repository. A boundary that separates one file
from two is a boundary that will not survive its next re-measurement.

### On the cadence arithmetic

At 30 commits a day, the fast lane as it stands costs 27.5 machine-hours a day;
after both moves, 12.6. The nightly lane costs 53 minutes a day and would cost
26.5 hours a day at commit cadence — a 30x ratio that is exactly why
`docs/testing_pyramid.md` puts it where it is, and the measurement supports that
placement.

But cadence is not the whole ROI. A commit-gate minute is also a minute of a
person's attention, and the fast lane is already failing tests on timeouts at 4
workers. **Every minute added to the commit gate buys flake as well as delay**,
which is the argument for spending the first effort on removing work rather than
rescheduling it.

### What will not help

- **Trimming cheap tests.** All 309 files under 10 seconds cost 3.3 minutes
  between them — 1.2% of the suite. Deleting the entire cheap cohort would save
  less than one `overworld_cli`.
- **Selecting tests by what the diff touches.** 432 of 495 test files
  transitively import `src/core/`, 414 `src/world/`, 389 `src/rpg/`. For any
  engine change, "only the affected tests" is nearly the whole suite. The
  existing scope rule in `scripts/test-lanes.ts` works because it is about the
  census proofs' narrow imports, and that argument does not generalise.
- **Splitting the big files to parallelise them.** Under `isolate: true` each
  part re-executes the whole import graph, so splitting a world-importing file
  in four adds three more 22-second loads. Fix the load first; then splitting is
  cheap.
- **Guessing cost from something static.** Across all 488 fast-lane files, file
  size ranks cost at Spearman ρ = 0.51 and test-case count at ρ = 0.16. Neither
  is good enough to schedule on, which is the whole case for measuring.
