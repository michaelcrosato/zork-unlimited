# Engineering Review — zork-unlimited / "AdventureForge"

**Reviewer:** Senior engineering review (independent, adversarial).
**Date:** 2026-06-14.
**Branch reviewed:** `chore/template-reset-20260614` (HEAD `95c9618`).
**Scope:** the product spec (`ADVENTUREFORGE_BUILD_SPEC.md`), the salvage research
(`docs/research/zork-reviews/*`), the current working tree, and all branches. The
freshly-installed ops-engine scaffolding (`.claude/`, `scripts/`, `roadmap/`,
`AI_OPERATIONS_PLAN.md`, etc.) is explicitly **out of scope** as a review target.

---

## Verdict

**Grade: C+** (the spec alone, on its own merits, is an A−; the *repository as it
stands today* is a D — a 1,063-line design document and a stale README that lies
about what exists, with zero implementation on disk. The blended grade reflects an
excellent artifact attached to a misleading shell.)

This is a genuinely strong specification wrapped around a genuinely empty repo, and
the most damning thing about it is not the emptiness — it is that the repo actively
*pretends not to be empty*. The spec (`ADVENTUREFORGE_BUILD_SPEC.md`) is the best
document in the building: 1,063 lines, 21 top-level sections, a real evidence base
(RPGBench, TALES, Jericho, TextWorld, TextQuests — all cited with arXiv IDs and a
defensible thesis), concrete Zod-shaped schemas, a non-negotiable determinism
contract, a closed condition/effect DSL, a validator spec with named error codes,
and stage-by-stage acceptance criteria. It is buildable. We know it is buildable
because **it was already built once in this very repo** and then deliberately
purged. Against that, the root `README.md` is the worst document in the building:
it describes a five-stage, 17-pack, 800-line-core system as "all stages complete
✅" while the current tree contains **no `src/`, no `content/`, no `tests/`**, and a
`package.json` with none of the scripts it documents. The spec is honest; the README
is fiction. That gap is the headline.

This is not vaporware in the usual sense (a promise with nothing behind it). It is
the *inverse*: a thing that was real, was deleted on purpose for a clean re-run, and
whose marketing copy was never taken down. The work ahead is not "can this be
built" — it provably can. It is "rebuild the first vertical slice cleanly, and stop
claiming it already exists."

---

## What this actually is (spec vs code)

| Claim source | What it says | What is actually on `chore/template-reset-20260614` |
|---|---|---|
| `README.md` | "Stages 0–5 implemented and green," 17-pack library, 800-line core, MCP server, React UI, AFK loop | **None of it exists.** `git ls-tree -r HEAD` → 0 files under `src/`, `content/`, `tests/` |
| `README.md` quickstart | `npm run play`, `validate`, `mcp`, `test`, `author`, `ui:dev`, `health` | `package.json` scripts are only `verify / shield / state / typecheck / lint` (ops-engine plumbing). None of the product scripts exist |
| `README.md` doc links | `docs/afk_loop.md`, `docs/blind_playtest_protocol.md`, `docs/stage4_rpg_gate.md`, `LICENSE`, `.mcp.json`, `.nvmrc`, `content/engine_contract.yaml` | **All missing.** Eight-plus dead links in the front-door document |
| Spec §0 override header | Governing charter is `AGENTS.md` (trust-but-verify) | `AGENTS.md` is a **5-line stub** pointing at `CLAUDE.md` (the ops engine). The charter the spec invokes does not exist in that form |
| Spec body | Full deterministic TS/Node engine, validators, MCP, etc. | A pure design document. Zero executable product code |

**What genuinely exists and is good:**

- `ADVENTUREFORGE_BUILD_SPEC.md` — the real artifact. Self-contained, language-agnostic
  in §5–§15, concrete enough to hand to a coding agent and start Stage 0.
- `docs/research/zork-reviews/*` — five high-quality salvage reviews of four prior
  experiments (this repo's own pre-purge state plus three sibling repos). This is
  rare and valuable: a project with **honest post-mortems of its own past runs**,
  naming the exact failure modes (count-as-objective treadmills, flat-fitness
  gaming, silent capability degradation, mock-LLM-masquerading-as-real). Most teams
  never write this down.

**What is recoverable but deleted:** the prior implementation lives at tag
`pre-purge-20260609` — `git ls-tree -r pre-purge-20260609 | grep ^src/` returns 46
files. So "no implementation" is a *deliberate reset*, not a failure to ever ship.
The honest framing: this repo was reset to vision-docs to start a clean, controlled
build. Fine. But the README was left describing the deleted system.

---

## Architecture assessment

I am assessing the **design in the spec**, since there is no code to assess.

**Determinism (§8.5, §8.6) — sound, and the strongest part.** A pure reducer
`step(state, action) → {state, events, ok, rejectionReason}`, no I/O, no clock, no
global RNG; all randomness through a seeded PRNG keyed on `state.seed`/`state.step`;
canonical-JSON-sorted SHA-256 state hash; "same seed + same actions ⇒ byte-identical
trace, any machine." This is exactly right for a self-improving loop, because it
makes every agent claim cheaply re-checkable. The salvage reviews confirm all four
prior experiments independently converged on this same spine — that convergence is
strong evidence the design is correct, not over-fitted. **Not overwrought.**

**Content pipeline (§3, §7, §11) — sound, with one historically load-bearing
caveat.** The Layer-2/Layer-3 boundary ("content is validated data, never code;
the LLM is never the engine") is the central invariant and it is the right one.
YAML authoring → Zod-validated JSON runtime gives one source of truth. The closed
condition/effect vocabulary (§7.1) means content cannot introduce new verbs — a
clean injection-resistance property. **The caveat, straight from the repo's own
post-mortem** (`docs/research/zork-reviews/zork-unlimited.md` §3): in the prior
build, the headline writer→adapter→validator authoring pipeline *was only ever
exercised by a mock provider* — real content was hand-written YAML by the loop
agent. So the spec's single most ambitious verb ("an AI authors the game") was
never actually demonstrated end-to-end with a real model. That is the riskiest
unproven claim in the whole design, and the spec under-flags it.

**Save integrity (§8.7) — sound and appropriately strict.** Saves bind to a content
hash; load against mismatched content is a hard error, not a silent
re-interpretation. Correct call — it prevents the classic "replay a save against
edited content and corrupt it silently" bug.

**Testability (§14, §12.8) — credible and unusually mature.** The two-mode model
(deterministic validators + exhaustive BFS solver *prove* structure; a blind LLM
playtest *judges* experience, with nothing pretending to be both) is the right
decomposition. It explicitly retired an earlier 8-persona heuristic-bot roster
because "a heuristic bot was never an honest proxy for either" — that is a
sophisticated, self-critical design decision.

**Over-engineering watch.** The spec is large but mostly *deferred* large: §3+
(Sierra-Quest, RPG, web UI, 3D renderer) are explicitly lower-resolution and
out of the MVP. The real over-engineering risk is the **MCP server (§9.4, 12
tools)** and the **agent-role apparatus (§12, six roles)** being treated as
Stage-1 scope. They are not the proof; the deterministic CYOA loop is. A
first-pass builder who tries to stand up MCP + writer + adapter + debugger + fixer
before a single room is playable will drown — exactly the "meta-work cannibalizes
object-work" pathology the salvage reviews document (#4 spent ~70 of 76 hours on
its own supervision apparatus). **Risk is in sequencing, not in the design.**

---

## Quality of the spec / research

**Spec quality: high.** Quantified: 1,063 lines, 21 `##` sections, 35 `###`
subsections, 3 TypeScript and 8 YAML worked examples. Defined-vs-hand-wavy split:

- **Concrete / buildable as written:** the GameState model (§6), condition/effect
  DSL (§7.1), CYOA + parser schemas (§7.2/7.3), the `step` contract and resolution
  order (§8.1–8.4), determinism + hashing + save/load + trace (§8.5–8.8), the CYOA
  validator checklist (§10.1) with named codes, negative-fixture requirements
  (§10.4), Stage 0/1/2 acceptance criteria (§13). A competent engineer could start
  coding from these today.
- **Hand-wavy / under-specified:** the **exhaustive BFS solver** is invoked
  repeatedly (§12.8, §14) as the structural oracle but never actually specified —
  state-space bounds, how it handles the inventory/object combinatorial blowup the
  spec itself warns about in §10.2, or what "exhaustive" means once `vars` are
  unbounded integers. The **parser validator's** "satisfiable before required"
  feasibility checks (§10.2) are stated as goals without an algorithm; in general
  these are reachability problems over a large state space and the spec hand-waves
  "documented conservative approximation" without saying which. The **adapter's**
  beat-classification (§11) is a judgment call dressed as an enum. **LLM client
  cost/latency** is unaddressed except by reference.
- **Stale-by-policy:** §2/§12.7/§19 cite specific model IDs, benchmark numbers, and
  pricing (Opus 4.8 69.2% SWE-Bench Pro, GPT-5.5 82.7% Terminal-Bench, etc.). The
  spec itself flags these as "dated and not something the build depends on," which
  is the right disclaimer, but per the repo's own freshness rule (CLAUDE.md §5)
  anything model-related >3 months old is stale and must be re-verified before
  relying on it. Treat every number in §2/§12.7/§19 as decoration, not fact.

**Research quality: high, and the repo's best-kept asset.** The five
`docs/research/zork-reviews/` files are a genuinely useful, evidence-cited
cross-experiment synthesis with file:line proof, an honest confound warning ("any
'model X behaves like Y' reading is confounded"), and a concrete controlled-rerun
design. The pathology catalog (§7 of each) is worth reading before any loop is
built. This is the kind of institutional memory most projects lack entirely.

---

## Tests (the planned property-testing approach)

**Credible.** fast-check property tests for: (a) determinism — random valid action
sequences run twice produce identical traces; (b) purity — `step` never mutates
input; (c) save/load round-trip to an identical hash; (d) legal-action/step
agreement — the legal set never contains an action `step` then rejects as *illegal*.
These four properties are precisely the right invariants for a pure reducer, and
they are the ones that actually catch the bugs example-based tests miss
(map-iteration order, JSON key order, accidental mutation).

**Caution from the repo's own history.** The salvage review of the *sibling*
TypeScript experiment (`zork-unlimited-2.md` §2, §7) records that the
spec-mandated fast-check property tests **were never added** — it shipped only
example-based determinism tests and no `fast-check` dependency. So "we'll add
property tests" is a known under-delivered promise in this lineage. The first slice
must actually wire fast-check, or this becomes a documentation-only commitment
again. Separately: test-count is explicitly named a *gameable* metric in the
research (#2's 4,987 tests, 79% testing gibberish synonyms) — the plan correctly
treats validators/coverage as **gates, never goals**.

---

## Security & data handling

The spec's §16 posture is **above average for this class of project** and should be
kept verbatim:

- **Content is data, never code** — no `eval`, no embedded scripts, closed DSL only.
  This is the single most important security property and it is correctly central.
- **Patches applied by deterministic code, not by the model** — the fixer proposes a
  structured `ContentPatchProposal`; code validates and applies it. A model never
  runs shell or writes files. Correct.
- **Save/trace integrity at load** via content-hash verification (§8.7/8.8) —
  prevents silent corruption from edited content. Correct.
- **Prompt-injection awareness** — treats all model output (content *and* patches)
  as untrusted, cites OWASP LLM Top-10 and NIST AI RMF. Appropriately paranoid.

**Gaps / unproven:** (1) The MCP server (§9.4) promises "never expose the filesystem
outside the project root" — a real but unimplemented control; path-traversal in the
`load_pack`/`replay_trace` handlers is the obvious attack surface and must be tested,
not asserted. (2) YAML parsing itself is an untrusted-input boundary — the spec says
"validated by schema" but never names a *safe* YAML loader / size+depth limits;
billion-laughs / deeply-nested-alias DoS on a malicious pack is unaddressed. (3) The
"human approval gate for sensitive operations" (§16) was, per the spec's own §0
override and the salvage review, **removed** ("trust, but verify" — the agent has
free rein). That is a deliberate, documented trade, but it means the *only* security
boundary at runtime is the validator + integrity gate; if either has a hole, nothing
behind it catches the agent. Acceptable for a research prototype on synthetic data;
would not be acceptable if this ever touched real users or untrusted third-party
packs.

No live-data risk today: there is no product code, no DB, no secrets, synthetic
content only. The threat model is entirely future-tense.

---

## Unmerged branches

There are **no meaningfully unmerged product branches.** Every branch differs only
by ops-engine scaffolding commits; none carries product code.

| Branch | Head | Relationship | Product content |
|---|---|---|---|
| `chore/template-reset-20260614` (this) | `95c9618` | 2 commits ahead of `develop` (template reset + engine install) | none |
| `develop` / `origin/develop` | `ef88340` | 1 commit ahead of `main` (ops-engine drop-in) | none |
| `main` / `origin/main` | `c0a37ea` | the purged "vision docs" state | spec + research only |

`develop` and `main` are *not* in sync (`develop` = `main` + the engine-install
commit). That is the expected ops-engine onboarding posture, not drift. The only
real "branch" carrying the product is the **tag** `pre-purge-20260609` (46 `src/`
files, the deleted implementation) — read-only history, not a live branch.

---

## Tech debt & risks

1. **The lying README (highest-severity, fix first).** The front door claims a
   complete five-stage system that does not exist on this branch, with 8+ dead doc
   links and a quickstart full of scripts that aren't in `package.json`. Anyone —
   human or agent — who trusts it is immediately misled. Fixed by deliverable B.
2. **The headline verb was never proven with a real model.** "AI authors a text
   adventure" was demonstrated only against `MockAuthorProvider`; real-provider
   end-to-end authoring never happened (`zork-unlimited.md` §3). The project's
   thesis sentence is the least-tested part of it. Prove this *early* in the rebuild,
   not last.
3. **Objective-function risk is the documented universal killer.** All four prior
   runs had identical bottlenecks: not capability, but a gameable fitness function
   (count targets, flat self-graded metrics, mock-as-real degradation). Any rebuild
   that re-enters an autonomous loop without an *external, non-gameable* signal will
   reproduce the treadmill. This is the project's defining risk and it is well
   documented — the danger is ignoring its own research.
4. **`AGENTS.md` charter mismatch.** The spec §0 override and README invoke
   `AGENTS.md` as the trust-but-verify charter; the file is a 5-line stub. Either
   the spec's override header is now obsolete or `AGENTS.md` needs restoring. Decide
   and document.
5. **Under-specified solver / validator feasibility.** The "exhaustive BFS solver"
   and parser feasibility checks are load-bearing but algorithmically vague; the
   state-space blowup the spec itself warns about (§10.2) has no concrete bound.
   Spec debt that becomes implementation debt.
6. **MCP/agent-role scope creep into Stage 1.** Standing up the 12-tool MCP server
   and six agent roles before a playable room is the documented meta-work trap.
   Sequence them after the deterministic loop is green.
7. **Stale model facts (§2/§12.7/§19).** Dated by policy; re-verify or strip before
   anyone treats the numbers as real.

---

## Top 5 to do first (turn the spec into a first playable slice)

The goal is the smallest honest thing: a deterministic CYOA loop a human can play to
an ending, proven replayable — Stage 0 + the structural half of Stage 1. **No MCP,
no agents, no UI, no LLM** in slice one.

1. **De-fiction the front door (do this before any code).** Rewrite `README.md`
   to honest status (done in this PR) and either restore `AGENTS.md` as the
   trust-but-verify charter or amend the spec §0 override to point at `CLAUDE.md`.
   Delete the dead doc links. A repo that lies about itself corrupts every
   downstream decision.

2. **Stage 0 deterministic spine (`src/core/`).** `GameState` (§6), the
   condition/effect DSL evaluators (§7.1), seeded `rng`, canonical-JSON SHA-256
   `hash`, the pure `step(state, action)` reducer (§8.1–8.4), `save/load` with
   content-hash binding (§8.7), and trace record/replay (§8.8). Acceptance:
   `bin/replay` round-trips a hand-written trace; the **fast-check** determinism +
   purity + round-trip + legality-agreement property tests pass. This is the whole
   foundation and it is fully specified — build it exactly as written.

3. **Stage 1 CYOA: schema + validator + one playable pack.** The CYOA Zod schema
   (§7.2), the loader (YAML → validated JSON + content hash), the observation
   builder (§9.1), and the CYOA validator (§10.1) with **named error codes** and
   the negative fixtures (§10.4) that must fail. Author *one* small hand-written
   pack (the spec's 20-scene / 3-ending target is fine, or smaller to start) that
   validates green. Acceptance: validator catches every broken fixture with the
   right code; the good pack reports zero errors.

4. **A playable deterministic loop a human can finish (`bin/play`).** Controlled
   CLI: render observation → present `available_actions` → take a choice → `step` →
   repeat to an ending. Add a non-interactive `--choices id1,id2,...` mode and
   `--record` so a full playthrough becomes a replayable trace. Acceptance: a human
   reaches a declared ending; the recorded trace replays to an identical final hash.
   **This is the first moment the thing is real.**

5. **The structural oracle, concretely (BFS solver) + CI gate.** Specify and build
   the exhaustive-solver-over-CYOA that *proves* every declared ending is reachable
   and no reachable state soft-locks (the §12.8 "dev tests" mode, for the
   fully-analyzable CYOA graph only — defer the parser blowup). Wire `npm run
   health` = typecheck + lint + property tests + validate-all-packs + solver, and
   make CI run it. Acceptance: green CI on a branch; a deliberately soft-locked
   fixture turns it red. *Only after this is green* should anyone touch MCP, the
   agent roles, the parser stage, or the autonomous loop.

Notable explicit non-goals for the first slice: MCP server, writer/adapter/fixer
agents, real LLM calls, the parser/RPG stages, the web UI, and the AFK loop. Every
one of those is where the prior runs burned their time before the core was solid.
