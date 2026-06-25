# AdventureForge — Ultraplan (2026-06-02)

Produced by a local multi-agent ultraplan: 6 parallel repo reviewers + 5 web-research
agents (frontier-LLM capability, IF/agentic benchmarks, current AI-narrative products,
autonomous-improvement/reward-hacking research, distribution paths) → one synthesis,
then verified against the live repo. This supersedes `ROADMAP.md` as the strategic
layer; the roadmap's milestone mechanics remain valid where not contradicted here.

> **Implementation status (2026-06-02).** The hour/day/week infrastructure has
> landed on `main`, all green (`npm run health`: 721 tests + integrity static &
> drift):
> - ✅ **Keystone** — `adapt_story` now calls `resolveProvider({ mock })`: a real
>   ANTHROPIC/OPENAI/GOOGLE model authors when its key is set, mock otherwise. The
>   §1 author is now reachable without a key in CI. *(A keyed end-to-end run remains
>   the one step that needs an API key.)*
> - ✅ **Trace v2** — `per_step_hashes` persisted; replay reports `divergedAtStep`.
> - ✅ **Correctness guards** — finite-number guard on vars (no NaN/Infinity
>   poisoning); differential SHA-256 conformance vs `node:crypto`.
> - ✅ **Loop salvage** — assessor rotates the blind pass onto the least-recently
>   attended pack (no clockwork lock-in) and raises a self-extinguishing frontier
>   benchmark lever.
> - ✅ **Benchmark scorecard** — a deterministic coverage-bot scorecard over every
>   pack was built here, then REMOVED when testing collapsed to two modes (dev tests +
>   blind LLM playtest); the future real-model benchmark rebuilds fresh on the blindtest.
> - ✅ **Governance** — `ROADMAP.md` reconciled to the trust-but-verify charter.
>
> Still ahead (need a key or are larger/external): the keyed real-model
> author→play→fix→lock run, the fresh-pack generator, the GitHub-Pages demo, and the
> preprint. The loop is intentionally left stopped until the keyed run.

---

## 1. The honest status: the proof is done — against a mock

The Build-Spec §1 thesis — *an AI can author → compile → validate → play (structured
API) → find → fix → regression-lock a text adventure on a deterministic engine it
cannot corrupt* — is **proven as an engineering harness and green under `npm run
health`.** The strongest evidence: 103 paired bug-artifact + regression files
(`traces/bugs/bug_0001..0103`), property-tested determinism / purity / save-load /
legality (`tests/property/determinism.test.ts`, `parser_determinism.test.ts`), a
grep-confirmed zero-LLM / zero-clock / zero-random engine core, and the
anti-reward-hacking guard (`scripts/verify-integrity.ts`).

**But the single most load-bearing verb in §1 — that *an AI* authors — has never run
through the instrumented pipeline.** `src/mcp/tools.ts:663` hardcodes
`new MockAuthorProvider()` (while `bin/author.ts:34` already resolves a real provider).
No `ai-runs/` artifact carries a real-provider authorship record. Content is either
hand-written by the loop's orchestrator (`claude -p`, which *bypasses* the
writer→adapter→validator pipeline) or emitted by the deterministic mock. **The §1
machine itself has only ever been exercised by a mock.** That is the weakest link, and
it is decisive for the endgame.

Secondary weak link: trace replay asserts only the **final** state hash;
`record.ts` already computes per-step hashes and throws them away, so `divergedAtStep`
is reserved-but-unpopulated — a regression reports *that* it diverged, not *where*.

## 2. Why the autonomous loop stalled (diagnosed, not guessed)

The AFK loop is **currently stopped** (process scan: no `loop.sh`/`claude -p`/`ai-loop`
running). Its recent output (bug_0100, 0102, 0103) is real but **marginal** — single
choice-label signposting reframes on packs already rated clarity 5/5. The assessor
(`src/afk/assessor.ts`) collapses all seven playtest candidates to
`score(1,'M','content_fix') = 0.5`, and the final tie-break locks the
alphabetically-first pack (clockwork_heist) as the standing nomination; the loop only
escapes via a manual rotation override.

This is a **known, published failure mode**, not a bug to patch away: a *frozen
verifier + frozen content distribution* provably drives an optimizer toward cosmetic
edits (arXiv 2510.14253). The cure is not a better tie-break alone — it is to **evolve
the evaluation distribution**: fresh AI-authored packs with post-cutoff timestamps, and
a multi-model scorecard. That same move is also the citable artifact (below). **Do not
relaunch the loop unchanged** — it would resume diminishing-returns polish.

## 3. The true goal (now that the proof is complete)

> **Become the first published, contamination-free benchmark substrate for the full
> author → compile → run-on-an-independent-deterministic-engine → play-via-structured-API
> → regression-lock loop, evaluated with real frontier models.**

The research makes the whitespace precise. The field has:
- **Play on memorized classic IF** — TALES (arXiv 2504.14128) and TextQuests
  (2507.23701); TALES *documents* Zork1 leakage in Claude's thinking traces.
- **Play on shallow synthetic/procedural games** — TextWorld, BALROG (2411.13543),
  gg-bench.
- **One-shot authoring with static validation** — RPGBench (2502.00595; best Game-
  Creation validity ~49%), STORY2GAME (2505.03547), SINE.

**No published system unites all four pillars** — author *and* compile *and* run on an
engine the LLM is never the runtime of *and* play via a structured API *and*
regression-lock — **on guaranteed-uncontaminated content.** RPGBench is the closest
prior art and is the *inverse* on the key axis: in its simulation task the LLM **is**
the engine; here the LLM is **never** the engine. That intersection is AdventureForge's
defensible reason to exist. The stated goal was a *demo of a capability*; the latent
goal is an *eval the field adopts because no contaminated corpus can be it.*

## 4. Strategic choice: ladder D → A → B, kill C

Four forks: **(A)** research artifact/preprint, **(B)** public benchmark + leaderboard,
**(C)** indie product, **(D)** flagship autonomous-engineering demo.

- **Kill C.** Indie product is the worst effort:payoff — front-end polish, marketing,
  AI-disclosure tagging for thin content — and pulls away from the actual novelty.
- **Destination = B** (benchmark): the durable, genuinely-whitespace asset.
- **Reached through D** (demo): the verified self-improvement loop + 156-commit log +
  MCP server + verify-integrity guard *is* the flagship demo — lowest incremental
  effort, and it doubles as the paper's central figure.
- **A is the byproduct** of doing D and B honestly.

The one move that unlocks D, A, and B at once: **run the authoring loop once against a
real frontier model and commit the artifact.** Do *not* front-load heavy benchmark
curation; let the held-out set accrete from real runs.

---

## 5. The plan, by horizon (each nests in the next)

### ⏱ Hour — stop the churn, harden the claims
1. **Confirm the loop stays down** until it has a new goal (it is already stopped; the
   point is *don't relaunch unchanged*).
2. **Fix the assessor starvation** (`src/afk/assessor.ts`): add a recency/LRU tie-break
   (small `ai-runs/rotation.json`) so blind passes rotate across all 7 packs instead of
   re-locking clockwork_heist. One-line-class change, salvages the loop for the new goal.
3. **Cheap engine hardening the benchmark will depend on:** NaN/Infinity guard in
   `src/core/effects.ts` (`inc_var`/`dec_var`/`set_var` → emit a diagnostic event rather
   than silently poison var comparisons); a cross-impl SHA-256 conformance test pinning
   `src/core/sha256.ts` against Node `crypto` on a fixed corpus.

### 📅 Day — the keystone: run the thesis for real, once
1. **KEYSTONE — replace the hardcoded mock.** At `src/mcp/tools.ts:663`, swap
   `new MockAuthorProvider()` for `resolveProvider({ mock: new MockAuthorProvider() })`
   (mirroring `bin/author.ts`). With a real key set, run **one**
   author → validate → play → find → fix → lock cycle on a *fresh* premise and commit it
   to `ai-runs/` as the **first real-LLM proof artifact, post-cutoff timestamped.** This
   converts the headline claim from *mock-demonstrated* to *demonstrated* — the single
   highest-leverage act in the repo. Budget for the model **not** converging green on
   the first premise; record attempts-to-green honestly (it is the most interesting
   datum either way).
2. **Populate `divergedAtStep`**: persist the per-step hashes `record.ts` already
   computes into the `Trace`, localize the first divergent step in `src/trace/replay.ts`,
   and surface it through MCP `replay_trace`. Turns "a trace diverged" into "diverged at
   step N" — prerequisite for a credible benchmark harness.
3. **Reconcile governance docs**: `ROADMAP.md` still presents the §14 gate / Milestone-1
   as live while README/AGENTS declare full-trust. Collapse to one coherent
   "trust-but-verify, verification-is-the-bar" narrative for external readers.
4. **Add a frontier candidate category to the assessor** (content-depth / real-author),
   scored above the 0.5 saturation floor, so the salvaged loop can *nominate*
   real-author + scorecard work instead of re-polishing clarity-5 prose.

### 📆 Week — make it measurable and end-to-end real
1. **Build the objective scorecard** (the future real-model benchmark): a stable
   JSON+markdown metric across packs from real frontier-model **blind** playtests —
   Game Progress + Harm (TextQuests vocabulary), route coverage, deaths,
   illegal-action rate, softlock count, turns-to-win, normalized per (pack, agent). The
   day's first real-model run is row 1. (The earlier heuristic coverage-bot scorecard
   was removed when testing collapsed to two modes; this rebuilds fresh on the
   blindtest.) **Without a comparable number, there is no benchmark.**
2. **Wire a real LLM provider into the loop's `content_new` path** so every *new* pack
   is genuine writer→adapter→validator authoring with a post-cutoff timestamp — building
   the contamination-free held-out set directly.
3. **Add a second tamper detector**: an LLM-judge pass over each cycle's *diff* asking
   the narrow binary "does this change weaken verification or launder a result?"
   (EvilGenie 2511.21654 found detector #3 — the one verify-integrity already implements
   — insufficient *alone*; DGM faking test logs, 2505.22954, is the cautionary tale).
   Strictly a cheat-check, **never** the quality oracle.
4. **Add an `observation_difficulty` mode to the MCP API** that hides `exit.to` and CYOA
   `choice.next` from the agent-facing observation (kept for the internal coverage bot).
   Today the API leaks the room graph, trivializing the spatial reasoning TALES/Jericho
   measure — a hidden-graph mode makes it a real reasoning test.
5. **Extend authoring beyond CYOA to parser + RPG** (`agents/authoring` has zero
   parser/rpg refs today). Puts the richest validators — combat winnability, skill
   checks, dialogue termination — behind a real authoring loop, the surface where
   RPGBench/TALES show models actually fail.

### 🗓 Month — distribution + the fresh-pack generator
1. **Ship the flagship demo** as the distribution vehicle: a sharp landing page +
   GitHub Pages deploy of `ui/dist` (first add the UI to CI — today CI never installs /
   typechecks / builds it, so it can rot green), with a public AFK-loop dashboard and the
   hook: *"an AI wrote a text-adventure engine, then authored fresh games, found its own
   bugs via blind playtests, fixed them, and locked each with a regression test — here is
   the commit log and the real-model scorecard."*
2. **Turn the loop into a fresh-pack generator** (TextWorld-style parameters: map size,
   puzzle depth, mechanic mix) emitting a new validated, post-cutoff-timestamped pack per
   run, then scoring it. This cures the frozen-verifier stall *and* is the contamination
   control no other IF eval has.
3. **Write the arXiv preprint / tech report**: *a determinism-anchored, AI-authored,
   contamination-free text-adventure benchmark.* Lead with `verify-integrity.ts` (the
   "don't route around the verifier" artifact the self-correcting-codegen literature
   lacks) and the inversion vs DGM/SICA/HGM (which self-modify the scaffold). Cite
   RPGBench + STORY2GAME as nearest prior art; state the four-pillar delta in one
   sentence. Claim *mechanically hard to game*, **not** *un-gameable*.
4. **Author a deliberately larger, branchier flagship pack** (20+ scenes, 6+ endings,
   deadline + variants) via the live pipeline as a capstone that AI authoring scales past
   the small graphs all 7 current packs occupy — plus a multi-quest Charter Marches arc
   exercising cross-quest save/load within the single world.

### 🗓 Year — the adopted public benchmark
1. **Establish AdventureForge as a public benchmark**: a held-out, rolling set of sealed
   packs generated *after* model cutoffs (the contamination control TALES proves classic
   IF cannot offer), a containerized reproducible harness, a Jericho/TALES-comparable
   free-text mode alongside the structured-API mode, and a public leaderboard *with
   headroom* (the SWE-Bench-Pro property that keeps a benchmark interesting).
2. **Recruit external validation**: run 2–3 frontier models on freshly-sealed packs and
   publish the scorecard + traces (a benchmark is credible only once independent results
   exist). Pair with a permissive data license (CC-BY for packs/traces; MIT stays on
   code).
3. **Position as the canonical answer to the recognized gap** (play-on-memorized /
   play-on-synthetic / one-shot-authoring all exist separately; AdventureForge unites all
   four pillars on uncontaminated content with an engine the LLM never runs). Land a
   workshop paper (NeurIPS/ICLR agents-or-creativity track); grow the demo's commit-log
   narrative into the durable evidence base.

---

## 6. Risks & guardrails
- **Don't relaunch the loop unchanged** — it resumes cosmetic polish and makes the commit
  log read as churn to the very outsiders the demo path needs to impress. (`AI_LOOP_STATE.md`
  is already 548 KB / 1643 lines of self-narration.)
- **The real-provider path is untested** — it has literally never executed. The validator
  is the safety gate; budget for non-convergence and record it honestly.
- **Benchmark adoption is winner-take-most and hard** — 7 self-generated packs are not a
  benchmark. Reach B *through* D+A; let the held-out set accrete; don't front-load curation.
- **LLM-judge bias** (self-preference / position, arXiv 2410.21819) — keep it a binary
  cheat-check only; the deterministic engine + tests stay the bar.
- **Don't overclaim.** Avoid "un-gameable" (`verify-integrity.ts` is editable by an agent
  with write access — best practice is to move the guard to CI / a trust boundary outside
  the agent's writable tree). Avoid "unprecedented neuro-symbolic split" (STORY2GAME / NeSy
  are prior art). Claim novelty on the **engineering system**, not the bare concept. Mark
  SWE-Bench-Pro 69.2% as system-card-sourced.

## 7. The one thing to do next
**Make the keystone move: replace the hardcoded `MockAuthorProvider` at
`src/mcp/tools.ts:663` with `resolveProvider`, run the author → play → fix → lock loop
once against a real frontier model, and commit that run as the first real-LLM proof
artifact with a post-cutoff timestamp.** It converts the headline thesis from
mock-demonstrated to demonstrated, produces the first scorecard row, becomes the demo's
hook and the paper's central figure, and seeds the contamination-free held-out set the
benchmark requires. Every other horizon ladders off it.
