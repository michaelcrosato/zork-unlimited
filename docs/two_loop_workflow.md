# The two-loop workflow

Two loops run independently and in parallel. Neither waits for the other. **Any model
can run either one.**

```mermaid
flowchart LR
    subgraph DEV["Dev loop — ./loop.sh"]
        A["assess<br/>QA bucket first, then candidates"] --> B["crawl:smoke gate"]
        B --> C["one focused change"]
        C --> D["provisional commit"]
        D --> E["crawl · health · verifier integrity"]
        E --> F["seal + push"]
    end

    F ==>|"a new build"| BUILD[("published build")]

    subgraph QA["Playtest loop — ./playtest-loop.sh"]
        G["cohort: many cheap players<br/>+ a few reference players"]
        G --> H["session records<br/>nothing thrown away"]
        H --> I["triage → clusters → promotion"]
    end

    BUILD ==> G
    I ==>|"corroborated + verified only"| BUCKET[("qa/tickets/")]
    BUCKET ==> A

    classDef gate fill:#dcefe2,stroke:#3f8a5c,color:#14402a
    classDef pool fill:#dde7f2,stroke:#3d6b96,color:#16212b
    class B,E gate
    class BUILD,BUCKET,H pool
```

## Why they are split

The old single loop spent most of its wall clock blocked. Each cycle made one change,
then stopped and waited for one blind playthrough of that exact commit before it could
land anything. Throughput was capped at roughly one change per playtest.

That coupling existed because a single playtest was doing two jobs at once:

| Job                                                       | Wants                      | Needs to be commit-bound? |
| --------------------------------------------------------- | -------------------------- | ------------------------- |
| **Regression gate** — did my change break the experience? | to be fast and blocking    | yes                       |
| **Quality survey** — where does the game actually hurt?   | volume and model diversity | **no**                    |

The survey was paying the gate's tax. Splitting them lets the survey run at whatever
scale you can afford while the dev loop runs at full speed against a purely mechanical
bar.

**The dev loop no longer plays the game.** Its gate is `crawl:smoke`, `npm run health`,
and the verifier-integrity drift check — the same bar as before, minus the playtest.

## Any model, either loop

The dev loop is genuinely vendor-neutral. The playtest loop is neutral in everything
except how it PROVES blindness — see the constraint below before planning a cohort.

**Dev loop.** `loop.sh` auto-detects the first installed agent in `DEV_AGENT_IDS`
(`codex`, `claude`, `gemini`). Pick one with `AI_AGENT=<id>`, or point
`AI_AGENT_CMD` at anything at all. The full contract an agent must meet:

1. reads its instructions from **STDIN**
2. can create and edit files in `$PWD` and run the repo's commands
3. runs non-interactively, with no approval prompt
4. exits 0 on success, nonzero on failure

Anything meeting that works, listed or not.

**Playtest loop.** Providers live in `src/blind/providers.ts`; the models each one may
play as live in operator-owned catalogs under `blind-tester/catalogs/`. Adding a vendor
is one registry entry plus one catalog file — no runner, store, triage, or ranking code
learns a vendor's name.

```bash
npm run qa:bucket -- --summary              # what the dev loop can pick up
AI_AGENT=claude ./loop.sh                   # dev loop on Claude Code
PLAYTEST_COHORT="codex:8" ./playtest-loop.sh
```

### The one place a vendor IS privileged: runner-enforced blindness

**Only Codex can currently produce a `runner_enforced` session.** Every other vendor —
`claude_code`, `gemini_cli`, Grok — must go through `npm run playtest:ingest` and lands
`operator_attested`. Running them through `playtest-loop.sh` fails at launch with
`Could not resolve the existing Codex home; pure run refused.`

This is structural, not an oversight. `runner_enforced` means the runner can PROVE the
agent saw only the AdventureForge MCP tools, and that proof is read back out of Codex's
own rollout logs by `blind-tester/codex-rollout.mjs` (1,566 lines) plus
`codex-process-anchor.mjs`, `codex-pure-envelope.mjs` and `codex-strict-stream.mjs`.
No equivalent reader exists for any other vendor, so there is nothing to verify against.

What this does and does not cost you:

- Multi-vendor **bug corroboration still works**. `operator_attested` sessions count
  toward it, and corroboration across families is the promotion rung that matters.
- Multi-vendor **experience metrics do not**. Retention and clarity numbers take
  `runner_enforced` sessions only, so today those are a Codex-only measurement.

So a mixed fleet is worth running — just drive the non-Codex vendors through their own
client and ingest them, exactly as the Grok path already describes, and read headline
experience numbers as Codex's alone until per-vendor capture exists.

### Cheap by default, expensive on purpose

The game does not need frontier reasoning to be _played_. It needs **volume**, because
experiential findings only become trustworthy through repetition across independent
instruments.

So the fleet is deliberately lopsided. A large **`volume`** cohort supplies throughput.
A small **`reference`** cohort — three or so expensive, high-reasoning players — runs
alongside as a _calibration instrument_. Its job is not to find more bugs; it is to tell
you whether the cheap cohort's silence means anything.

Three readings, treated asymmetrically by both `derivePromotion` and `scoreCluster`:

| Who reported it     | Reading                          | Effect   |
| ------------------- | -------------------------------- | -------- |
| both tiers          | real, high confidence            | ×2       |
| **reference only**  | the cheap cohort is blind to it  | **×1.5** |
| volume, ≥2 lineages | independent agreement            | ×1       |
| volume, 1 lineage   | suspect a model capability floor | ×0.5     |

The reference-only weighting is the important one. Such a finding arrives with a tiny
mention count — three runs against forty — so under plain count×severity it sorts near
the bottom and the calibration instrument gets outvoted by the very cohort it exists to
check.

Equally, forty runs of one cheap model agreeing is **one instrument sampled forty
times**, not forty witnesses. Ranking counts **distinct lineages**; repetition within a
lineage still counts, but saturates (`1 + log₂(1 + n)`), so a 200-run cohort cannot bury
a 3-run finding that four vendors confirmed.

## Blindness: two honest evidence classes

| Class               | How it is established                                               | Counts toward bug corroboration | Counts toward experience metrics |
| ------------------- | ------------------------------------------------------------------- | ------------------------------- | -------------------------------- |
| `runner_enforced`   | the runner owns argv, cwd and the tool allowlist, and records proof | yes                             | yes                              |
| `operator_attested` | a human asserts the client had only the AdventureForge MCP tools    | yes                             | **no**                           |

Vendors the runner cannot prove — Grok, which has no headless CLI, and today every
non-Codex vendor, since the capture that establishes `runner_enforced` is Codex-specific
(see above) — are played through their own client and recorded with
`npm run playtest:ingest`. The attestation naming who vouched is
**required**. This keeps the corpus maximally inclusive without letting unverifiable
runs quietly move a headline quality number, which is the contamination the
`BLIND_AGENT_CMD` ban has always existed to prevent.

## Nothing is thrown away

Every playthrough becomes a session record: date and time, provider, model, model
settings, persona/role, the full playthrough log, and the exit interview. Crashed,
abandoned, timed-out and malformed runs are recorded too — a player who gave up is
telling you something a finished playthrough cannot.

Records are **content-addressed** (`record_id` = SHA-256 of the record's own content),
so mass-parallel cohorts on different machines under different vendors can all write to
one corpus with no lock, no queue, and no coordinator: identical content is the same
file, different content is a different file, and there is never a merge.

The corpus stages under `ai-runs/playtest/` (gitignored, because a dev loop whose
worktree is never clean cannot take a provisional commit) and is published to its own
`playtest-sessions` branch by `npm run qa:publish`, using git plumbing with a temporary
index so it never touches the working tree.

## Intake: every way work reaches the dev loop

**Playtest feedback is not the only way the game changes.** An audit agent finds a
structural problem; a research agent proposes a mechanic; the crawler files a softlock; a
person wants a feature. All of them file the same thing — a **submission** — into one
queue, `intake/queue/`, and the dev loop reads only that.

```mermaid
flowchart LR
    P["playtest triage<br/>corroborated + verified only"] --> Q
    A["audit agent"] --> Q
    R["research / design agent"] --> Q
    C["crawler oracles"] --> Q
    H["a person"] --> Q[("intake/queue/<br/>one JSON per submission")]
    Q <-->|"npm run intake:sync"| GH[("GitHub Issues<br/>mirror")]
    H -.->|"files an issue<br/>from anywhere"| GH
    Q ==>|"npm run work"| DEV["dev loop"]
```

| Source     | Files when                                  | Default priority                    |
| ---------- | ------------------------------------------- | ----------------------------------- |
| `crawler`  | an invariant oracle trips                   | P0                                  |
| `playtest` | triage corroborates or reproduces           | from severity, lifted if reproduced |
| `human`    | a person asks                               | P1                                  |
| `audit`    | an agent reviews the repo or game           | P2                                  |
| `research` | an agent proposes a change nobody asked for | P3                                  |

**Priority is not severity.** Severity says how bad it is; priority says when we do it. A
cosmetic defect on the opening screen can outrank a severe one in content nobody reaches.

### Filing

```bash
npm run submit -- --source audit --kind refactor \
  --title "OverworldSession is a 4,000-line stateful class" \
  --body-file finding.md --area src/world/session.ts --ref docs/REPO_AUDIT_2026-08.md

cat plan.md | npm run submit -- --source research --kind feature --title "..." --body -
```

Re-filing is safe and expected. A submission's id is content-addressed on
`source + kind + key`, so an agent that re-runs nightly **updates its own submissions
instead of filing a hundred duplicates** — and lifecycle state the queue owns (`status`,
and the issue it is mirrored to) survives a re-file, so re-filing never resets something a
dev agent is already working.

### GitHub Issues is a mirror, not the source of truth

People should file requests in the tool they already have — labels, search, notifications,
a phone app. But the loop must keep working when the network is down or a token expires,
so the canonical copy is the files and `npm run intake:sync` reconciles both ways:

- **push** — every local submission gets or updates its issue
- **pull** — every issue _without_ a marker becomes a `human` submission; issue state
  comes back, so closing an issue in the GitHub UI closes the work here

Idempotency comes from a marker in the issue body — `<!-- af-submission-id: … -->` — so
re-syncing updates the issue it already has. Matching on titles instead would fork one
item into two the first time somebody reworded it.

If `gh` is missing or logged out, sync says exactly which and **exits 0**. An outage in a
mirror is not an outage in the work.

### Reading

```bash
npm run work                      # the one thing to build next
npm run work -- --list            # the whole open queue, in order
npm run work -- --claim <id>      # in_progress
npm run work -- --done <id>       # done
```

## How feedback becomes work

Modelled on how a QA organization actually runs, not on a benchmark:

- A tester does not file a P1. They file a **report**.
- **Triage** decides what is a bug, what is one player's taste, and what duplicates
  something already open.
- A report becomes actionable through **corroboration** (several independent lineages) or
  **reproduction** (the deterministic crawler, or a maintainer).
- Everything filed is kept, whether or not it is ever actioned.

Promotion ladder — only the top two rungs cross into the dev loop's queue:

| Rung           | Meaning                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `verified`     | reproduced by something with no opinion. Outranks any amount of agreement.                                    |
| `corroborated` | ≥2 distinct lineages, or reference-tier confirmation.                                                         |
| `accumulating` | seen and recorded, not yet independently supported. **Not a rejection** — the resting state of most feedback. |

An `accumulating` ticket stays visible in `qa/tickets/` but never reaches the queue.
Handing the dev loop a pile of single-report opinions is exactly what the corroboration
rule exists to prevent.

### Staleness

Floating the survey free of the commit introduced one genuinely new failure mode:
findings acquire an age. A ticket last seen more than `STALE_AFTER_BUILDS` (8) builds ago
drops out of view rather than sending the loop chasing something already fixed. It is
marked `stale`, never deleted, and any fresh report revives it. Verified tickets never
decay — a reproduction does not stop being true because nobody happened to hit it again.

## Runbook: four terminals on one machine

### Preflight, once

`loop.sh` needs `/proc/<pid>/stat` for pid identity and **fails closed** without it. On
Windows, run these under WSL:

```bash
cat /proc/$$/stat | head -c 40      # prints something? you're fine
```

Four loops in one directory will fight — the dev loop hard-resets the tree on a failed
cycle, and a player mid-run would be playing a build that no longer exists.
`playtest-loop.sh` refuses to start beside a live dev loop for exactly that reason. Give
each its own worktree; they share the object store, so it is nearly free:

```bash
cd /d/zork-unlimited
git worktree add ../af-qa-a main
git worktree add ../af-qa-b main
git worktree add ../af-qa-c main
mkdir -p /d/af-corpus            # ONE shared session corpus, outside every worktree
```

### Preflight, part one and a half: ask what this machine can actually do

```bash
npm run doctor -- --store /d/af-corpus
```

It reports which agent the dev loop will pick, which vendors can run live here versus
which must be hand-played and ingested, what shape the corpus is in, and — the part that
matters — **why nothing is queued, when nothing is queued**. "Nothing promoted" is the
correct outcome for a single-vendor corpus and also the symptom of a broken pipeline;
those look identical from outside, and this names which one you have. Read-only.

### Preflight, part two: prove the wiring before you spend a cohort

Every other way to find out whether a cohort string, a model pin or a store path is
right costs a vendor a real cohort of tokens. `PLAYTEST_MOCK=1` runs the loop end to end
against `run.sh`'s bundled scripted agent instead — no model, no tokens:

```bash
PLAYTEST_MOCK=1 \
PLAYTEST_COHORT="gemini_cli:2,codex:1" \
PLAYTEST_STORE=/d/af-corpus \
./playtest-loop.sh --once
```

A healthy run dispatches every player, writes each one's artifacts, and records
**nothing**:

```
  ▸ codex seed=600 persona=default
    (wiring check — not recorded; log at ai-runs/playtest/logs/codex_seed600_default.runner.log)
  corpus: 0 session(s); none; lineages none
```

Recording nothing is the point, not a failure. A scripted agent has no opinion, and
filing its canned exit interview would let three mock runs read as three vendors
agreeing. If a player reports a nonzero exit instead, read the named log — the wiring is
wrong and a real cohort would have failed the same way.

### Terminal 1 — dev loop

```bash
cd /d/zork-unlimited
AI_AGENT=claude \
AI_LOOP_TRIAGE_STORE=/d/af-corpus \
AI_LOOP_COMMIT=1 AI_LOOP_PUSH=1 \
./loop.sh
```

`AI_LOOP_TRIAGE_STORE` is what makes several QA worktrees work without syncing anything:
triage is pure over the corpus, so the dev loop re-derives the queue itself at cycle
start. Add `AI_LOOP_IDLE_WHEN_EMPTY=1` if you would rather it wait for real work than fall
back to assessor candidates.

### Terminals 2–4 — QA loops

```bash
cd ../af-qa-a
PLAYTEST_STORE=/d/af-corpus \
PLAYTEST_COHORT="gemini_cli:12" \
PLAYTEST_PERSONAS="default,cynical_veteran,breaker" \
PLAYTEST_CONCURRENCY=8 \
./playtest-loop.sh
```

Vary the cohort per terminal — `codex:10`, `claude_code:10` — and pin the reference tier
on **exactly one**:

```bash
PLAYTEST_MODELS="codex=gpt-5.6-terra" PLAYTEST_COHORT="codex:8,codex:2"
```

Three expensive players total, not thirty. The reference cohort is a calibration
instrument, not a second opinion.

### What each agent is actually for

The orchestrator model in each terminal is a **supervisor, not the fan-out mechanism**.
`playtest-loop.sh` forks OS processes directly, so a frontier model sits there burning
almost no tokens while a dozen cheap players run. Its job is to notice when players fail
for harness reasons rather than game reasons, and fix the harness.

### Grok

No headless CLI ships today, so Grok cannot be a QA loop's provider or an orchestrator
terminal. Play it through the desktop client and ingest the session:

```bash
npm run playtest:ingest -- --provider grok_desktop --model grok-4-fast \
  --persona cynical_veteran --seed 1234 --game-session-id o-… \
  --transcript run.jsonl --report report.md \
  --attested-by "you" --method "desktop client, AdventureForge MCP only"
```

That session is `operator_attested`: kept in full, counted toward corroboration, excluded
from experience metrics.

## Acceptance test: is the two-loop system actually working?

Everything below the corpus can be verified locally; the one thing that cannot is whether
two DIFFERENT vendors' prose describing one defect clusters together. Corroboration is
the rung this whole split exists to reach, so it is worth proving once deliberately
rather than inferring it from a quiet queue.

```bash
npm run doctor -- --store /d/af-corpus     # 1. what this machine can launch
PLAYTEST_MOCK=1 PLAYTEST_COHORT="codex:2" PLAYTEST_STORE=/d/af-corpus \
  ./playtest-loop.sh --once                # 2. wiring, zero tokens, records nothing
PLAYTEST_COHORT="codex:2" PLAYTEST_STORE=/d/af-corpus ./playtest-loop.sh --once
                                           # 3. two real Codex players
# 4. play once in Gemini's own client, then:
npx tsx bin/ingest-playtest-session.ts --provider gemini_cli --model <id> \
  --attested-by "<you>" --method "desktop client, AdventureForge MCP only" \
  --transcript run.jsonl --report report.md --store /d/af-corpus
npm run doctor -- --store /d/af-corpus     # 5. the verdict
```

**Pass** is step 5 reporting `families: codex, gemini` and `The dev loop has work`, with
the item visible in `npm run work -- --list`. That means a finding two independent
vendors hit travelled the whole way to the dev loop on its own.

**A stall is not automatically a failure.** If the doctor says `Add a SECOND model family`
you only have one lineage in the corpus — step 4 did not land. If it says tickets exist
but none is actionable while both families ARE present, the two vendors described
different things, which is ordinary. If it reports many tickets across three or more
sessions with nothing merged at all, that is the shape of a clustering fault and worth
investigating rather than accepting.

Two things that will bite if you skip the doctor:

- **Only `codex` runs live.** Every other vendor fails at launch with `Could not resolve
the existing Codex home`, because runner-enforced blindness is proved from Codex's own
  rollout logs. The others are hand-played and ingested, and still count toward bug
  corroboration.
- **A report that does not verify is kept but contributes nothing.** The ingest command
  now says so explicitly and names the reason; if you see that line, fix the report and
  re-run rather than assuming the session landed as evidence.

## Commands

| Command                                | What it does                                         |
| -------------------------------------- | ---------------------------------------------------- |
| `npm run doctor`                       | what works here, and why nothing is queued           |
| `./loop.sh`                            | dev loop; any installed agent                        |
| `./playtest-loop.sh`                   | playtest loop; cohorts across providers and personas |
| `npm run work`                         | the next thing to build                              |
| `npm run submit -- …`                  | file work from any source                            |
| `npm run intake:sync`                  | reconcile the queue with GitHub Issues               |
| `npm run qa:bucket -- --summary`       | the playtest ticket bucket                           |
| `npm run qa:bucket -- --store-summary` | the session corpus                                   |
| `npm run qa:triage`                    | re-triage the corpus (pure; safe to re-run)          |
| `npm run qa:publish`                   | push the session corpus to its branch                |
| `npm run playtest:record -- …`         | seal one finished run into the corpus                |
| `npm run playtest:ingest -- …`         | record a session played through a client with no CLI |
