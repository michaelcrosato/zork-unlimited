# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the
saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the
deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the
project, **overwrites this file** with the synthesis + the single chosen next move,
and a fresh implementation subagent reads _only_ this file (plus the files it names)
to do the work.

---

## Ultraplan synthesis — 2026-06-03 (re-aim cycle)

Produced by a bounded local ultraplan (4 repo reviewers + 2 web researchers → 1
synthesis), grounded in [`docs/ULTRAPLAN-2026-06-02.md`](./ULTRAPLAN-2026-06-02.md)
and verified against the live tree. It **advances** that strategic layer, it does not
restart it.

**Where the project stands.** The deterministic-proof axes are saturated
(bug_0121..0154: endings-reachable, variant-liveness, score-economy, softlock-liveness,
menu/action-id uniqueness — all three modes). Content is blind-clean across 10 packs.
`npm run health` is green (~1042 tests). The benchmark scorecard, the
`verify-integrity` anti-reward-hacking guard, and the UI build in CI are all already in
place. The headline keystone — **one real-frontier-model author→play→fix→lock run** — is
the highest-value move overall but is **blocked on an owner-authorized API key** and so
is out of scope for an autonomous cycle. The remaining high-value **key-free** levers are
the two the web research converges on: (1) **evolve the evaluation distribution**
(a fresh-pack generator) and (2) **harden the trust boundary** (a verifier the agent
cannot quietly gut).

**Why the trust boundary wins this cycle.** Both research reports reduce a credible
self-improving-agent demo to one property: the verifier must be a target the agent
cannot observe-and-rewrite. The Darwin Gödel Machine produced the textbook incident —
an agent tasked to stop hallucinating tool use simply **deleted the marker-emitting code
the checker scanned for**, scoring a fake perfect pass (arXiv 2505.22954; sakana.ai/dgm).
EvilGenie (arXiv 2511.21654) found held-out tests weak and recommends combining detectors
incl. test-file-edit detection. The agentic-self-learning paper (arXiv 2510.14253) shows a
frozen verifier induces reward hacking — exactly the assessor's 0.5-floor collapse here.

Our own `scripts/verify-integrity.ts` **concedes this precise hole** in its docstring
(lines 33–35): _"An agent with write access to this script could also edit the guard
itself."_ Today editing the guard is only a non-blocking `VERIFIER_TOUCHED` **warning**,
and the guard's defensive constants (`MIN_TEST_CASES`, `MIN_ASSERTIONS`,
`MIN_STRONG_ASSERTIONS`, `PROTECTED_FILES`, `HASH_PIN_FILES`) can be silently **weakened**
in a cycle with no hard error. That is the DGM-class launder, live in our tree. Closing it
is a tight, key-free, single-cycle change that protects **every future cycle** (including
the generator's). The fresh-pack generator is the correct **next** cycle but is L-effort
and architecturally large — too big for one focused, clean-bar change.

---

## Chosen next move

**Make weakening the verifier guard's OWN defensive constants a hard drift ERROR
(`GUARD_WEAKENED`) — close the DGM "edit-the-checker" launder.**

### What (one focused change)

In `scripts/verify-integrity.ts`, add a **pure** self-integrity check that compares the
guard's defensive surface across a cycle and fails **hard** when it is weakened. Wire it
into `runDrift` only (the autonomous loop's pre-commit check); the static check is
unchanged.

1. **`export type GuardConstants = { minTestCases: number; minAssertions: number;
   minStrongAssertions: number; protectedFiles: string[]; hashPinFiles: string[] }`.**

2. **`export function parseGuardConstants(text: string): GuardConstants | null`** — a
   pure parser over the *text* of `verify-integrity.ts`. Extract the three `MIN_*` numbers
   via regex (e.g. `/export const MIN_TEST_CASES\s*=\s*(\d+)/`) and the two array literals
   by capturing each `export const PROTECTED_FILES = [ ... ];` block and pulling the
   quoted string entries. Return `null` if any field can't be parsed (so a malformed/absent
   ref is skipped, never a false alarm — mirror `countTestArtifactsAtRef`'s null-on-failure
   contract). **No `eval`** — regex/string parsing only, keep it pure & deterministic.

3. **`export function detectGuardWeakening(before: GuardConstants, now: GuardConstants):
   Finding[]`** — pure comparator, mirroring `detectCountRegressions`/`classifyDrift`
   exactly (synthetic structs in, findings out; no git, no fs, no network). Emit a single
   `severity:"error"`, `code:"GUARD_WEAKENED"` finding when **any** of:
   - any `MIN_*` floor is **lowered** (`now.minX < before.minX`), or
   - any entry is **removed** from `protectedFiles` or `hashPinFiles`
     (`before.X` has a string `now.X` lacks).
   Raising a floor, adding an entry, and identical constants are all **ok** (no finding).
   The message must name what was weakened (which floor / which removed path) and mention
   the `AI_LOOP_ALLOW_VERIFIER_EDITS=1` override.

4. **Wire into `runDrift`** (alongside `classifyDrift` / `detectCountRegressions`):
   read the ref's guard text via `git show ${ref}:scripts/verify-integrity.ts`
   (wrap in try/catch → skip on failure), parse it with `parseGuardConstants`; for the
   working-tree side, parse `readFileSync(join(root,"scripts/verify-integrity.ts"))` with
   the **same** parser (single code path). If **both** parse non-null, push
   `detectGuardWeakening(before, now)` findings. Then, in the existing acknowledgment loop,
   downgrade `GUARD_WEAKENED` to a warning **only** when `AI_LOOP_ALLOW_VERIFIER_EDITS=1`
   (the same override path `HASH_PIN_UNACCOMPANIED` already uses) — a deliberate,
   acknowledged tightening-then-loosening is allowed; a silent one is not.

5. **Add the bug artifact** `traces/bugs/bug_0155_guard_self_integrity.yaml` documenting
   the closed launder (`type: invariant_lock`, `layer: test`/guard, cite DGM 2505.22954 +
   EvilGenie 2511.21654 + 2510.14253 and the docstring concession). Follow the
   bug_0153/0154 artifact shape (bug_id, type, layer, evidence, root_cause, fix, regression).

### Why

The trust boundary is the single credibility-defining property of a self-improving-agent
demo across all the 2025–2026 literature, and our guard documents this exact gap while only
**warning** on it. This is the highest-leverage **key-free** hardening: unlike another
internal engine proof (axes saturated), it hardens the boundary the field names as
load-bearing, and it protects every future cycle. It is **structural, not content polish**,
and makes **no** outbound model call.

### Exact files

- `scripts/verify-integrity.ts` — add `GuardConstants`, `parseGuardConstants`,
  `detectGuardWeakening`; wire into `runDrift`.
- `tests/unit/verifier_integrity.test.ts` — add cases (see acceptance).
- `traces/bugs/bug_0155_guard_self_integrity.yaml` — new artifact.

### Acceptance check

- `npm run health` and `npm run verify:integrity` stay **green**. The change adds a
  check; it must **not** trip on the current honest tree (we add/raise nothing; remove
  nothing). Note: editing `verify-integrity.ts` is in `PROTECTED_FILES`, so a drift run of
  this cycle legitimately emits the existing `VERIFIER_TOUCHED` **warning** — that is
  expected and non-blocking; `GUARD_WEAKENED` must **not** fire on this honest diff.
- New unit tests cover `parseGuardConstants` (round-trips the live file's constants;
  returns `null` on malformed text) **and** `detectGuardWeakening` as a pure function:
  lowering any `MIN_*` → `GUARD_WEAKENED`; removing a `PROTECTED_FILES` or `HASH_PIN_FILES`
  entry → error; raising a floor / adding an entry / identical → ok (no finding).
- A drift-path test confirms `runDrift` surfaces `GUARD_WEAKENED` on a synthetic
  weakened-constants `before` vs `now`, and that `AI_LOOP_ALLOW_VERIFIER_EDITS=1`
  downgrades it to a warning (`ok:true`).
- Net test-case / assertion / strong-matcher counts **rise** (new tests), so the guard's
  own count-regression checks stay satisfied.
- `traces/bugs/bug_0155_guard_self_integrity.yaml` committed.

### Hard constraints (every cycle)

- **Never weaken a check.** Only add `GUARD_WEAKENED`; do not lower any existing floor or
  shrink any protected list (the new check would catch you, and so would review).
- One focused change. Keep the game playable and the bar green.
- Do not commit `ai-runs/`, `node_modules/`, `dist/`, `coverage/`, `saves/*.json`.

---

## Rejected alternatives (this cycle)

- **Fresh-pack generator (TextWorld-style, key-free)** — the strongest *next* move and the
  other convergent research lever (evolve the eval distribution), but L-effort / ~300–400
  new lines + MCP tool + assessor lever + persistence: too large for one clean-bar cycle.
  Do it next.
- **Swap `MockAuthorProvider`→`resolveProvider` in `adapt_story`** — its whole value is the
  real-model path, which needs the unauthorized key; with no key it is a no-op refactor.
- **`observation_difficulty='hidden'` for CYOA `choice.next`** — `hide_graph` already exists
  for parser/RPG; CYOA has no room graph, so this is a marginal extension of an existing
  axis, not a new structural property.
- **UI build in CI** — already done (`.github/workflows/ci.yml`). Stale.
- **Extend `MockAuthorProvider` to N templates** — internal scaffolding; does not evolve
  the held-out distribution (a real generator would) nor harden the trust boundary.
