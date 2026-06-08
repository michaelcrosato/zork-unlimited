# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the
saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the
deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the
project, **overwrites this file** with the synthesis + the single chosen next move,
and a fresh implementation subagent reads _only_ this file (plus the files it names)
to do the work.

---

# Ultraplan re-aim cycle #17 (HEAD = bug_0298; next free id = bug_0299)

## Synthesis

Six reviewers reported findings this cycle: engine/API, validator, content/assessor,
loop/strategy, benchmark landscape (web), and reward-hacking research (web). The
orchestrator cross-checked every source claim against the live repo at HEAD = bug_0298.

**Two claimed gaps were already handled or structurally overclaimed.** The validator
reviewer nominated `is_open` / `is_unlocked` condition-side references as a missing
`OBJECT_STATE_COND_REF_MISSING` check. Source review confirms this is already covered
by `IMPOSSIBLE_OBJECT_STATE` (parser_validator.ts lines 485-507): a phantom
`is_open: "phantom"` fires `IMPOSSIBLE_OBJECT_STATE` because `"phantom"` is absent
from `openableObjects` — the inline comment at lines 485-489 explicitly documents this
"(An undefined id is in neither set, so the same miss carries the 'object not defined'
case — no objById pre-check needed.)". The only true escape requires an `open_object:
"phantom"` effect (which now emits `OBJECT_STATE_REF_MISSING` from bug_0291) that
inadvertently adds the phantom to `openableObjects`, masking a paired `is_open:
"phantom"` condition — a compound two-typo scenario with negligible real-world
probability. The content/assessor reviewer's `recency-weight impact bump` for the
blind-playtest rotation is a genuine idea but blocked until the loop reliably
exhausts the existing rotation more than once; the assessor already uses
`Number.MIN_SAFE_INTEGER` sentinel for never-attended packs so they sort first, giving
effective recency priority without a score-bump.

**The one genuinely open structural gap is confirmed by both the engine/API reviewer
and the loop/strategy reviewer, and is verified in source.** `hide_graph` is wired at
session-creation time only: `new_game` (tools.ts:601) and `start_game` (tools.ts:638)
accept `hide_graph?: boolean`, store it on the `Session` object (sessions.ts:40), and
it is consumed via the `obsOf` closure at tools.ts:407. All three observation builders
already accept `{ hideGraph?: boolean }` — cyoa/observation.ts:59, parser/observation.ts:90,
rpg/observation.ts:39. The gap is that `get_observation`, `get_scene`,
`list_legal_actions`, `step_action`, and `choose_option` all use only `SESSION` shape
in server.ts (lines 163-198) with no `...HIDE_GRAPH` spread, and their handlers take
only `{ session_id: string }` with no per-call override. An existing regression test
(`tests/regression/observation_hide_graph.test.ts`) covers session-level `hide_graph`
on `new_game` / `start_game` and the session-persistence behavior of `step_action` —
but there is no test for a per-call override that differs from the session default.

**The benchmark landscape and reward-hacking research confirm this move's value.**
TALES (arXiv:2504.14128) documents that the structured MCP API hands the agent the
full adjacency list, trivializing spatial reasoning. A per-call `hide_graph` override
enables benchmark runners to compare hidden-graph vs. full-graph on the same trajectory
without session proliferation. The reward-hacking research identifies the existing
`verify-integrity.ts` semantic-judge gap (count-preserving vacuous matchers) as the
correct follow-on cycle; that is a defensive move whereas the per-call `hide_graph` is
a forward structural improvement to benchmark validity.

---

## The one chosen move

**`hide_graph` per-call override on `get_observation`, `get_scene`, `list_legal_actions`, `step_action`, and `choose_option` (bug_0299):** Propagate `hide_graph?: boolean` as an optional per-call parameter on all five observation-returning tools so callers can override the session default per-call without creating a new session.

### What

The change is two files, approximately 20 lines of production code, and one new test
file.

**`src/mcp/server.ts`** (5 tool registrations, lines 163-198):

Add `...HIDE_GRAPH` to the `inputSchema` for `get_observation`, `get_scene`,
`list_legal_actions`, `step_action`, and `choose_option`. The `HIDE_GRAPH` const is
already defined at server.ts:51-58. Example for `get_observation` (lines 163-168):

```
tool(
  "get_observation",
  "...",
  { ...SESSION, ...HIDE_GRAPH },
  (a) => api.get_observation(a),
);
```

Apply the same `{ ...SESSION, ...HIDE_GRAPH }` pattern to `get_scene` (lines 169-173),
`list_legal_actions` (lines 175-180), `step_action` (lines 182-187), and
`choose_option` (lines 188-198). For `step_action` the shape becomes
`{ ...SESSION, action_id: z.string()..., ...HIDE_GRAPH }`. For `choose_option` it
becomes `{ ...SESSION, option_id: z.string()..., ...HIDE_GRAPH }`.

**`src/mcp/tools.ts`** (5 handler signatures + 5 `buildObsFor` call sites):

Change each of the five handler signatures to accept `hide_graph?: boolean` alongside
`session_id` (and `action_id` / `option_id` where present). In each handler, replace
the bare `obsOf(s)` call with
`buildObsFor(s.mode, s.index, s.state, { hideGraph: args.hide_graph ?? s.hideGraph ?? false })`.

The resolution order is: **per-call arg overrides session default overrides false.**

- `get_observation` (lines 646-649): signature becomes
  `args: { session_id: string; hide_graph?: boolean }`.
- `get_scene` (lines 651-653): delegates to `get_observation` — pass `hide_graph`
  through, or inline the same `buildObsFor` call directly.
- `list_legal_actions` (lines 655-658): signature becomes
  `args: { session_id: string; hide_graph?: boolean }`. Return
  `buildObsFor(..., { hideGraph: ... }).available_actions`.
- `step_action` (lines 660-699): signature gains `hide_graph?: boolean`. The `before`
  local (line 662) and `after` local (line 680) both call `obsOf(s)` — replace both
  with the explicit `buildObsFor(s.mode, s.index, s.state, { hideGraph: args.hide_graph ?? s.hideGraph ?? false })`.
  The `before` call uses the state at entry; the `after` call reads `s.state` after
  `sessions.update(s.id, result.state)` — that line (679) must remain between the two.
- `choose_option` (lines 701-703): delegates to `step_action` — pass `hide_graph`
  through via `this.step_action({ ..., hide_graph: args.hide_graph })`.

**`tests/regression/observation_hide_graph_per_call.test.ts`** (new file, ~6 cases):

Create this file. Use `createToolApi({ root: process.cwd() })` to test the handlers
directly (same pattern as the existing `observation_hide_graph.test.ts`). Cases:

1. **Override on, session off:** Create a session with `hide_graph: false` (or omitted).
   Call `get_observation({ session_id, hide_graph: true })`. Assert every exit's `to`
   is `undefined`.
2. **Override off, session on:** Create a session with `hide_graph: true`. Call
   `get_observation({ session_id, hide_graph: false })`. Assert every exit has a string
   `to`.
3. **Override absent, session on:** Create a session with `hide_graph: true`. Call
   `get_observation({ session_id })` (no override). Assert every exit's `to` is
   `undefined` (session default preserved).
4. **`step_action` per-call:** Create a session with `hide_graph: false`. Call
   `step_action` with `hide_graph: true`. Assert the returned `observation`'s exits
   have no `to`. Then call `get_observation` without override — assert exits have `to`
   (the session default is unchanged; per-call does not mutate the session).
5. **`list_legal_actions` per-call:** Create a session with `hide_graph: false`. Call
   `list_legal_actions({ session_id, hide_graph: true })`. Assert the returned
   `actions` list has the same directions as the default view but every MOVE action's
   destination annotation (if any) is absent. (This is a no-op on the action list
   itself since `available_actions` items do not carry a `to` field — the important
   invariant is that the call succeeds and returns the same action ids as without the
   flag.)
6. **Non-vacuity guard:** In case 2 (override off, session on), the exits must carry a
   string `to`. This prevents a vacuous pass where all exits are empty.

Use `content/parser/pack/sealed_crypt.yaml` as the test pack (it has multiple
traversable exits from the start room, same as the existing test file).

### Why

The MCP API today leaks the full room graph unconditionally once a session is started.
A benchmark runner that needs to compare hidden-graph vs. full-graph trajectories on
the same session must either create two sessions (doubling session overhead and losing
the ability to share state) or accept that the comparison is between sessions with
different initial seeds. Per-call override removes this limitation. More concretely:
the TALES/Jericho benchmark literature (arXiv:2504.14128) documents that spatial
reasoning is trivialized when exits carry destinations — the agent reads the adjacency
list rather than exploring. AdventureForge is the only structured-API IF platform with
a formal `hide_graph` mode; making it per-call rather than session-only completes the
API surface that benchmark harnesses need. This is the minimum viable API change to
make the benchmark claim credible: "our structured API enables controlled ablation of
spatial-reasoning difficulty."

### Exact files to read and edit

**Read (to understand existing patterns):**

- `src/mcp/server.ts` lines 43-58 — `PACK`, `SESSION`, `HIDE_GRAPH` const definitions;
  the exact shape to spread
- `src/mcp/server.ts` lines 130-210 — all tool registrations; confirms which 5 tools
  need `...HIDE_GRAPH` added
- `src/mcp/tools.ts` lines 106-121 — `buildObsFor` signature; the function to call
  directly instead of `obsOf`
- `src/mcp/tools.ts` lines 406-408 — the `obsOf` closure; shows the exact
  `s.hideGraph ?? false` fallback pattern to replicate per-call
- `src/mcp/tools.ts` lines 646-703 — all five handler implementations; exact lines to
  edit
- `src/mcp/sessions.ts` lines 30-41 — `Session` type; confirms `hideGraph?: boolean`
  field name
- `tests/regression/observation_hide_graph.test.ts` lines 1-120 — existing session-level
  test; the pattern to extend for per-call cases
- `src/parser/observation.ts` lines 87-130 — confirms `opts.hideGraph` is already
  consumed at line 129 (`opts.hideGraph ? { direction } : { direction, to }`)

**Create / edit:**

1. `src/mcp/server.ts` — spread `...HIDE_GRAPH` into the input schemas for
   `get_observation`, `get_scene`, `list_legal_actions`, `step_action`, and
   `choose_option` (5 tool registrations, ~5 lines changed)
2. `src/mcp/tools.ts` — update the 5 handler signatures and replace `obsOf(s)` calls
   with explicit `buildObsFor(...)` calls that thread `args.hide_graph ?? s.hideGraph ?? false`
   (~15 lines changed across handlers at lines 646-703)
3. `tests/regression/observation_hide_graph_per_call.test.ts` — new file, 6 locked
   regression cases for override-on-session-off, override-off-session-on,
   absent-override-session-on, step_action per-call, list_legal_actions per-call,
   and non-vacuity guard
4. `traces/bugs/bug_0299_hide_graph_per_call_override.yaml` — bug artifact (use the
   same structure as `traces/bugs/bug_0294_dead_reckoning_adrift_death_flag.yaml` as a
   template; category `engine`, subcategory `api-surface`)

### Acceptance check

`npm run health` must exit 0. Specific criteria:

1. **All 6 new regression cases pass.** The test file
   `tests/regression/observation_hide_graph_per_call.test.ts` runs green.
2. **Existing `observation_hide_graph.test.ts` still passes.** The 6 session-level
   cases in bug_0137's file are unaffected — this change is purely additive.
3. **Non-vacuity (mandatory):** In the "override off, session on" case, at least one
   exit must carry a string `to` — the test must not pass vacuously because exits are
   empty.
4. **Per-call override does NOT mutate the session.** After calling `step_action` with
   `hide_graph: true`, a subsequent `get_observation` call with no override returns the
   session default (full graph if the session was created with `hide_graph: false`).
   This is the key semantic guarantee: per-call is a rendering hint, not a state
   mutation.
5. **All 17 packs validate 0/0.** No pack content changes, so this must be automatic.
6. **verify:integrity 0/0.** No guard constants change; no test files are weakened.
7. **Test count increases by exactly 6** (from 1944 to 1950) — the 6 new cases in the
   per-call test file.

### What NOT to change

- No schema change to any pack format (`ParserPackSchema`, `ConditionSchema`,
  `EffectSchema` — untouched)
- No engine change (`makeStep`, `applyEffects`, `evalConditions` — untouched)
- No change to the `Session` type in `sessions.ts` — `hideGraph` field already exists;
  per-call override does not add a new field
- No change to observation builder internals (`cyoa/observation.ts`,
  `parser/observation.ts`, `rpg/observation.ts`) — they already accept `hideGraph`;
  the fix is purely at the tool handler layer
- No pack content change — no YAML edits, no hash re-pin
- The existing `obsOf` closure at tools.ts:407 may be left as-is (it is still used by
  `new_game` and `load_game` which do not need a per-call override); only the five
  listed handlers switch to direct `buildObsFor` calls
- Do NOT change `get_state` or `get_transcript` — they do not return observations

---

## Deferred levers (do NOT implement this cycle)

- **`OBJECT_STATE_COND_REF_MISSING` validator check (condition-side is_open/is_unlocked refs):** The reviewer's gap is real in principle but largely covered by `IMPOSSIBLE_OBJECT_STATE` already (lines 485-507; inline comment confirms). The true escape is a compound two-typo scenario (phantom `open_object` effect + paired `is_open` condition with the same phantom id). Deferred as low-probability, and the partial coverage is documented in source.
- **Assessor recency-weight impact bump:** Content/assessor reviewer's idea to bump impact to 2 for packs not attended in K cycles, crossing the saturation floor. Genuine idea; deferred until the loop has run enough cycles for the LRU rotation to demonstrate the floor problem in practice (current rotation has 17 packs; sentinel for never-attended already works).
- **verify-integrity hardening / EvilGenie probe scaffold:** The reward-hacking research (arXiv:2511.21654) confirms the count-preserving semantic swap (expect(true).toBe(true)) is the genuine uncovered gap. An LLM semantic-diff judge would add ~15-35 pp detection coverage on this attack class. Correct follow-on cycle after this one; the loop/strategy reviewer calls it "second-place pick."
- **World-frame manifest schema:** Multi-cycle. Formally unblocked after the three reference-integrity rungs (bug_0277 room refs + bug_0278 unlock_exit refs + bug_0281 item refs + bug_0291 object-state effect refs). Too large for one focused cycle — correctly deferred.
- **Benchmark scorecard module:** No standalone value without a real-model API key to populate benchmark rows. Scaffolding alone produces a dead module.
- **Assessor above-floor category for `content_new`:** Blocked on API key; wired in adapter.ts but no detection lever in assessor.ts yet.
- **BFS AG(EF goal) forward-reachability validator:** L blast-radius, health time-budget risk, explicitly deferred across three consecutive ultraplans.
