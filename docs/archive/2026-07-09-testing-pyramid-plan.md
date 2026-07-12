# Testing Pyramid (Crawler · Fleet · Feedback Compiler) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three-tier testing pipeline — a zero-LLM mechanical crawler (Tier 1), an N-agent blind playtest fleet with personas + a zero-token mock mode (Tier 2), and a deterministic feedback compiler producing ranked hot spots (Tier 3) — then wire all three into the AFK loop, docs, and CI.

**Architecture:** Tier 1 drives the pure engine in-process (`indexRpgPack → initStateForRpgPack → buildRpgRules → makeStep`, actions from `enumerateRpgActions`; overworld via `OverworldSession`) and checks nine invariant oracles after every step, emitting deduped zod-validated JSONL findings with ddmin-minimized replayable repros. Tier 2 extends `blind-tester/` (`run.sh` isolation + `BLIND_AGENT_CMD` seam) with a Node fleet orchestrator, persona files layered via a new `{{PERSONA}}` placeholder, and a deterministic MCP-speaking mock agent modeled on `smoke.mjs`. Tier 3 (`src/feedback/`) verifies + parses exit interviews and crawl findings, canonicalizes locations against engine content indexes, clusters deterministically (fingerprint + Jaccard), ranks by `count × severity_weight × source_diversity`, tracks trends across compiles, and feeds `src/afk/assessor.ts`.

**Tech Stack:** TypeScript (ESM, Node 22+), zod v3, vitest 4, fast-check (already dev dep), `node:worker_threads`, `@modelcontextprotocol/sdk` (already dep) for the mock agent. `.mjs` only inside `blind-tester/` (existing convention). No new dependencies.

## Global Constraints

- Node >= 22; `"type": "module"`; imports use `.js` suffixes resolved by tsx (e.g. `import { hashState } from "../core/hash.js"`).
- **The charter is law** (AGENTS.md "Do Not Weaken Verification"): never disable/skip/hollow out tests; never weaken `scripts/verify-integrity.ts`; real bugs found get fixed (if in scope for one focused change) or filed honestly under `traces/bugs/` + noted in `AI_LOOP_STATE.md`. Never suppress a finding to get green.
- Deterministic everywhere: NO `Date.now()`, `Math.random()`, `new Date()`, or `performance.now()` anywhere near the engine, crawler seed streams, policies, mock agent findings, or compiler. Wall-clock is allowed ONLY for: output directory stamps, run metadata (`generated_at`), and throughput measurement — never inside anything that affects findings content, ordering, clustering, or ranking.
- Reuse, don't reinvent: `src/blind/exit_interview.ts` + `src/blind/report_verifier.ts` are THE report schema/gate; `src/rpg/state_integrity.ts` is THE state invariant; `src/core/hash.ts#hashState` is THE canonical hash; `src/trace/record.ts` traces are THE repro format.
- Extend, don't replace: single-blind cycle (`npm run blind`), loadtest soak lane, exit-interview schema, report verifier all keep working byte-identically for existing invocations.
- Evidence goes under gitignored `ai-runs/`; committed repros under `traces/bugs/` (YAML bug artifacts) and `traces/` (JSON replay traces).
- `npm run health` = `verify:integrity && typecheck && lint && format:check && test && ui:typecheck && validate`. It must stay green and must NOT get slower than ~30s extra; `crawl:smoke` is a separate lane/CI job, NOT part of `health`.
- Repo style: Prettier + ESLint clean (`npm run format` after writing files; lint/format globs already cover `src bin scripts agents tests blind-tester`); tests in `tests/{unit,property,regression,acceptance}/`; vitest include glob is `tests/**/*.test.ts`, 60s timeout.
- `verify:integrity` PROTECTED_FILES include `src/core/{engine,rng,hash,sha256}.ts`, `src/gen/rpg_generator.ts`, `src/validate/rpg_validator.ts`, `src/persist/save_load.ts`, `tests/property/determinism.test.ts` — this plan must NOT modify any of them. (`src/rpg/state_integrity.ts` is not protected; extending it with tests is allowed if a real gap is found.)
- Test-count economics: verify-integrity requires `it()`/`expect()`/strong-matcher counts to never drop. This plan only adds tests.
- Git: work on `feat/testing-pyramid` (off `origin/main` @ ff303ef6). Commit per task with conventional prefixes (`feat(crawl): …`, `test(crawl): …`, `docs: …`). Land via PR, squash-merge; required check is `verify`.
- Line-number caveat: file:line references below were surveyed on a checkout ~35 commits ahead of main (`codex/benchmark-slice`); on `main` the same symbols exist but lines may shift slightly (notably `blind-tester/run.sh` differs by ~66 lines). Locate by symbol/content, not line.
- Shipped quests on main (11): `advocates_case, breaking_weir, cold_forge, dawn_beacon, factors_mark, falconers_ransom, gallowmere, printers_night, sunken_barrow, tanners_fever, wolf_winter`. NEVER hardcode this list or its count in crawler logic — enumerate via `RpgSourceRuntime`'s `shippedWorldQuestIds()` (`src/mcp/rpg_source_runtime.ts`). Docs may say "currently 11".

## Engine seams reference (read once, use everywhere)

```ts
// Fresh in-process game (all pure):
import { indexRpgPack, buildRpgRules, initStateForRpgPack, enumerateRpgActions, winningRpgEnding } from "../rpg/runner.js";
import { makeStep, actionEquals, type Rules } from "../core/engine.js";
import { hashState, shortHash } from "../core/hash.js";
import { mulberry32, rngForStep, type Rng } from "../core/rng.js";
import { assertRpgStateReferences } from "../rpg/state_integrity.js";
import { save, load, SaveIntegrityError } from "../persist/save_load.js";
import { buildRpgObservation } from "../rpg/observation.js";
import { recordTrace, runActions, type Trace } from "../trace/record.js";
import { replayTrace } from "../trace/replay.js";
import { generateRpgPack } from "../gen/rpg_generator.js";
import type { GameState } from "../core/state.js";
import type { RpgAction } from "../api/types.js";
import type { RpgActionOption } from "../rpg/legal_actions.js";
// step(state, action) → StepResult { state, events, ok, rejectionReason? }; pure; step counter +1.
// enumerateRpgActions(index, state) → RpgActionOption[] { id, command, action, skill_check? } — ground truth; NEVER hand-craft actions.
// step returns ok:false + events [{type:"rejected",reason}] for rejections; throws = engine bug (CRASH).
// hashState(state) → full sha256 of canonical JSON. save() → canonical JSON string; load() validates strictly; roundtrip is hash-identical for well-formed state.
// Default seed = 1. rng seam: buildRpgRules(index, rngFor) — rngFor drives combat/skill draws.

// Overworld (all deterministic, no rng at all):
import { loadOverworldManifest } from "../world/source.js";
import { OverworldSession } from "../world/session.js";
// new OverworldSession(world) starts at world.start ("albany_city").
// travel(edgeId) / travelTo(townId) / planRoute(destId) / moveArea(areaRouteId) / exploreArea(areaId) / exploreSite(siteId)
// resolveRoadEncounter(strategy) — MANDATORY before any other action once a road event fires (they fire deterministically per edge, suppressed on immediate repeat)
// previewQuestStart(questId) → validates (must be in quest.area, quest discovered); startQuest(questId); completeQuest(questId, {endingId,endingTitle,death}) — death throws
// snapshot() / OverworldSession.restore(world, snap) / snapshotHash() — canonical overworld hash
// view() / compactView() — localView.quests = the notice board; discovery is progressive: ~one new area + one job + one quest revealed per local action
// manifest: world.quests[] { id, home, area, source, visibility:"local_notice_board" }; world.nodes (247), world.edges (344, undirected), world.regions (9, nodes reference region by NAME not id)

// Exhaustive solver (currently tests/regression/support/exhaustive_endings.ts — Task 1 moves it to src/solve/):
// exhaustiveEndingsMulti(ruleSets, start, maxStates, onState?, opts?) → { reached:Set<endingId>, states, cappedOut }
// empty reached + cappedOut===false ⇒ NO ending reachable (dynamic softlock). cappedOut===true ⇒ UNPROVEN, never a finding.
```

## File Structure

```
src/solve/exhaustive_endings.ts        (moved from tests/regression/support/, re-export shim left behind)
src/crawl/findings.ts                  finding schema, severity table, fingerprint, dedupe collector, JSONL
src/crawl/policies.ts                  random | coverage | mixed action policies (seeded)
src/crawl/prepare.ts                   PreparedQuest: shipped-quest & in-memory-pack loading, rules wrapping seam
src/crawl/oracles.ts                   pure render-defect + illegal-action-sampling helpers
src/crawl/quest_crawler.ts             per-quest stepping loop, episodes, oracles 1–7, per-step hashes
src/crawl/minimize.ts                  ddmin over action sequences + reproduceFinding
src/crawl/quest_solver.ts              BFS shortest path to a non-death ending (for overworld round trips)
src/crawl/overworld_crawler.ts         systematic overworld pass: edges, nodes, boards, quest round trips (oracle 8)
src/crawl/coverage.ts                  quest+overworld coverage accounting, orphan lists (oracle 9), report rendering
src/crawl/run.ts                       single-process multi-quest run orchestration shared by CLI & workers
src/crawl/worker_entry.ts              node:worker_threads entry (one seed-stream per worker)
bin/crawl.ts                           CLI: flags, lanes (--smoke/--deep), output dir, exit code
tests/unit/crawl_findings.test.ts      schema/fingerprint/dedupe
tests/unit/crawl_policies.test.ts      seeded determinism, coverage bias
tests/unit/crawl_quest_crawler.test.ts oracles on generated packs, desync/persist/legality
tests/unit/crawl_minimize.test.ts      ddmin properties
tests/unit/crawl_overworld.test.ts     overworld pass invariants (short budgets)
tests/acceptance/crawler_fault_injection.test.ts   planted CRASH/SOFTLOCK/RENDER/INTEGRITY caught with repros
blind-tester/personas/default.md       empty-delta persona (preserves today's prompt exactly)
blind-tester/personas/{explorer,speedrunner,breaker,casual,lore-reader}.md
blind-tester/fill-prompt.mjs           placeholder substitution ({{START_INSTRUCTION}}, __SEED__, {{PERSONA}})
blind-tester/fleet.mjs                 N-run orchestrator: concurrency, pacing/backoff, resume, manifest
blind-tester/mock-agent.mjs            deterministic MCP-speaking scripted agent (BLIND_AGENT_CMD)
tests/unit/fleet_args.test.ts          fleet arg parsing / persona rotation (pure fns)
tests/acceptance/fleet_mock_pipeline.test.ts       mock fleet → verified reports → compiler e2e
src/feedback/schema.ts                 hotspots.json zod schema (versioned, .strict())
src/feedback/normalize.ts              location index from manifest+packs, canonicalization
src/feedback/cluster.ts                tokenize/stem, fingerprint clusters, Jaccard merge
src/feedback/rank.ts                   severity weights, diversity bonus, scoring, ONE recommended fix
src/feedback/metrics.ts                per-target experience metrics + sycophancy telemetry
src/feedback/trends.ts                 diff vs previous compiles (improved/regressed/new/flat)
src/feedback/compile.ts                orchestrator: scan inputs, verify reports, emit hotspots.{json,md}
bin/feedback.ts                        CLI: --in … --out … --top K --llm-labels
tests/unit/feedback_{normalize,cluster,rank,metrics,trends,compile}.test.ts
src/afk/assessor.ts                    (modify) new hotspot-candidates block before the sort
tests/unit/assessor_hotspots.test.ts   assess() consumes fixture hotspots.json
docs/testing_pyramid.md                (new) canonical three-tier doc
AGENTS.md, docs/afk_loop.md, docs/blind_playtest_protocol.md, blind-tester/README.md, README.md, loop.sh, package.json, .github/workflows/ci.yml   (modify)
tests/regression/docs_trust_but_verify_coherence.test.ts, tests/regression/agents_trust_but_verify_coherence.test.ts   (modify pins honestly)
AI_LOOP_STATE.md                       (one terse entry, its exact convention)
```

npm scripts added: `"crawl": "tsx bin/crawl.ts"`, `"crawl:smoke": "tsx bin/crawl.ts --smoke"`, `"crawl:deep": "tsx bin/crawl.ts --deep"`, `"fleet": "node blind-tester/fleet.mjs"`, `"fleet:mock": "node blind-tester/fleet.mjs --mock"`, `"feedback:compile": "tsx bin/feedback.ts"`.

---

### Task 1: Relocate the exhaustive solver into src/ (shim preserved)

The crawler's SOFTLOCK oracle needs `exhaustiveEndingsMulti` at runtime; `src/` must not import from `tests/`. Move the module, leave a re-export shim so the 4+ regression tests that import it are untouched.

**Files:**
- Create: `src/solve/exhaustive_endings.ts` (content moved verbatim from `tests/regression/support/exhaustive_endings.ts`)
- Modify: `tests/regression/support/exhaustive_endings.ts` → re-export shim
- Test: existing suite is the test (`npm test` must stay green; no behavior change)

**Interfaces:**
- Produces: `export { exhaustiveEndings, exhaustiveEndingsMulti, stateKey }` and their types (`ExhaustiveResult`, `SearchOpts`) from `src/solve/exhaustive_endings.js` — exact same signatures as today (`exhaustiveEndingsMulti<A>(ruleSets: Rules<A>[], start: GameState, maxStates: number, onState?: (s: GameState) => void, opts?: SearchOpts<A>): ExhaustiveResult`).

- [ ] **Step 1: Move the file**

```bash
git mv tests/regression/support/exhaustive_endings.ts src/solve/exhaustive_endings.ts
```
Then fix its relative imports (they pointed at `../../../src/...`; from `src/solve/` they become `../core/engine.js`, `../core/state.js`, etc. — open the file and adjust every import path).

- [ ] **Step 2: Write the shim**

Replace `tests/regression/support/exhaustive_endings.ts` with exactly:

```ts
// Moved to src/solve/exhaustive_endings.ts so the mechanical crawler (src/crawl/)
// can use the solver at runtime; tests keep importing from this path unchanged.
export * from "../../../src/solve/exhaustive_endings.js";
```

- [ ] **Step 3: Verify no behavior change**

Run: `npx vitest run tests/regression/rpg_all_endings_reachable.test.ts tests/regression/no_dead_pocket.test.ts tests/regression/exhaustive_endings_cap_backstop.test.ts tests/regression/rpg_variant_liveness.test.ts`
Expected: PASS (all).
Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: clean (run `npm run format` first if prettier complains).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor(solve): move exhaustive-endings solver into src for runtime use"
```

---

### Task 2: Crawl finding schema, fingerprint dedupe, JSONL (src/crawl/findings.ts)

**Files:**
- Create: `src/crawl/findings.ts`
- Test: `tests/unit/crawl_findings.test.ts`

**Interfaces:**
- Produces (later tasks rely on these exact names):

```ts
export const CRAWL_FINDING_CODES = ["CRASH","INTEGRITY","DESYNC","PERSIST","LEGALITY","SOFTLOCK","RENDER","WORLD","ORPHAN"] as const;
export type CrawlFindingCode = (typeof CRAWL_FINDING_CODES)[number];
export type CrawlSeverity = "S0" | "S1" | "S2" | "S3" | "S4";
/** Fixed severity per code; SOFTLOCK escalates to S4 when zero legal actions. */
export const CODE_SEVERITY: Record<CrawlFindingCode, CrawlSeverity> = {
  CRASH: "S4", INTEGRITY: "S4", DESYNC: "S4", PERSIST: "S4",
  LEGALITY: "S3", SOFTLOCK: "S3", RENDER: "S2", WORLD: "S3", ORPHAN: "S0",
};
export const CrawlLocationSchema = z.object({
  region: z.string().nullable(), node: z.string().nullable(),
  questId: z.string().nullable(), sceneId: z.string().nullable(),
}).strict();
export const CrawlReproSchema = z.object({
  kind: z.enum(["rpg-trace","overworld-actions","none"]),
  trace: z.unknown().nullable(),     // Trace<RpgAction> when kind==="rpg-trace"; action-descriptor array for overworld
  minimized: z.boolean(),
}).strict();
export const CrawlFindingSchema = z.object({
  code: z.enum(CRAWL_FINDING_CODES), severity: z.enum(["S0","S1","S2","S3","S4"]),
  seed: z.number().int(), policy: z.string().min(1), step: z.number().int().nonnegative(),
  location: CrawlLocationSchema, action: z.unknown().nullable(),
  message: z.string().min(1), stateHash: z.string().nullable(), commit: z.string(),
  repro: CrawlReproSchema,
}).strict();
export type CrawlFinding = z.infer<typeof CrawlFindingSchema>;
/** lowercase; hex runs >=8 chars → "<hash>"; digit runs → "#"; whitespace collapsed. */
export function normalizeFindingMessage(message: string): string;
/** `${code}|${questId ?? node ?? "?"}|${sceneId ?? "-"}|${normalizeFindingMessage(message)}` */
export function findingFingerprint(f: Pick<CrawlFinding,"code"|"location"|"message">): string;
export class FindingCollector {
  constructor(base: { seed: number; policy: string; commit: string });
  add(f: Omit<CrawlFinding, "seed"|"policy"|"commit"|"severity"> & { severity?: CrawlSeverity }): boolean; // false if deduped; validates via schema
  readonly findings: CrawlFinding[];   // insertion order, deduped
  readonly totalRaw: number;           // pre-dedupe count
  countsByCode(): Record<string, number>;
  toJsonl(): string;                   // one canonicalized JSON row per finding
}
```

- [ ] **Step 1: Write the failing test** (`tests/unit/crawl_findings.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import {
  CODE_SEVERITY, CrawlFindingSchema, FindingCollector,
  findingFingerprint, normalizeFindingMessage,
} from "../../src/crawl/findings.js";

const loc = { region: null, node: null, questId: "sunken_barrow", sceneId: "barrow_mouth" };

describe("crawl findings", () => {
  it("normalizes messages so volatile bits do not split fingerprints", () => {
    const a = normalizeFindingMessage("Step 41 hash aa5f8649e2f7d677 mismatch at hp=12");
    const b = normalizeFindingMessage("Step 7 hash bb1234deadbeef99 mismatch at hp=3");
    expect(a).toBe(b);
    expect(a).toContain("<hash>");
    expect(a).toContain("#");
  });

  it("fingerprints on code + canonical location + normalized message", () => {
    const f = { code: "RENDER" as const, location: loc, message: "empty description in room 12" };
    const g = { code: "RENDER" as const, location: loc, message: "empty description in room 99" };
    expect(findingFingerprint(f)).toBe(findingFingerprint(g));
    expect(findingFingerprint({ ...f, code: "CRASH" })).not.toBe(findingFingerprint(f));
  });

  it("collector dedupes, validates, and applies the severity table", () => {
    const c = new FindingCollector({ seed: 7, policy: "mixed", commit: "abc1234" });
    const base = { code: "RENDER" as const, step: 3, location: loc, action: null,
      message: "empty description", stateHash: null, repro: { kind: "none" as const, trace: null, minimized: false } };
    expect(c.add(base)).toBe(true);
    expect(c.add({ ...base, step: 9, message: "empty description" })).toBe(false); // dupe
    expect(c.findings).toHaveLength(1);
    expect(c.totalRaw).toBe(2);
    expect(c.findings[0].severity).toBe(CODE_SEVERITY.RENDER);
    expect(() => CrawlFindingSchema.parse(c.findings[0])).not.toThrow();
    const rows = c.toJsonl().trim().split("\n");
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]).code).toBe("RENDER");
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/unit/crawl_findings.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/crawl/findings.ts`**

Implementation notes (complete the interfaces above):
- `normalizeFindingMessage`: `message.toLowerCase().replace(/\b[0-9a-f]{8,}\b/g, "<hash>").replace(/\d+/g, "#").replace(/\s+/g, " ").trim()`.
- `FindingCollector.add` fills `seed/policy/commit` from the base, defaults `severity` from `CODE_SEVERITY[code]`, parses with `CrawlFindingSchema` (throw on invalid — a malformed finding is a crawler bug), dedupes on `findingFingerprint`, increments `totalRaw` always.
- `toJsonl`: use `canonicalize` from `../core/hash.js` per row + `"\n"` — canonical key order keeps output byte-stable across runs.

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run tests/unit/crawl_findings.test.ts` → PASS.

- [ ] **Step 5: Commit** — `npm run format && git add -A && git commit -m "feat(crawl): finding schema, fingerprint dedupe, jsonl collector"`

---

### Task 3: Seeded action policies (src/crawl/policies.ts)

**Files:**
- Create: `src/crawl/policies.ts`
- Test: `tests/unit/crawl_policies.test.ts`

**Interfaces:**

```ts
import type { Rng } from "../core/rng.js";
import type { RpgActionOption } from "../rpg/legal_actions.js";
export const POLICY_NAMES = ["random","coverage","mixed"] as const;
export type PolicyName = (typeof POLICY_NAMES)[number];
export type PolicyContext = {
  visitedRooms: ReadonlySet<string>;     // room ids seen this episode's quest so far
  triedActionIds: ReadonlySet<string>;   // RpgActionOption.id values ever executed for this quest
};
export type Policy = { readonly name: PolicyName; pick(options: RpgActionOption[], ctx: PolicyContext): RpgActionOption };
export function makePolicy(name: PolicyName, rng: Rng): Policy;
```

Behavior contract:
- `random`: uniform `options[rng.int(0, options.length - 1)]`.
- `coverage`: prefer (in order) MOVE options (`option.action.type === "MOVE"`) never tried (`!triedActionIds.has(option.id)`) — among them uniform via rng; then any untried option; else uniform over all. (Room-level "unvisited" bias comes free: untried MOVE ids correlate with unvisited rooms; `visitedRooms` is kept in the context for future refinement and coverage accounting.)
- `mixed` (default lane policy): draw `rng.next()`; `< 0.2` → random behavior, else coverage behavior. Same `rng` instance throughout so the stream is one deterministic sequence.
- Policies must call `rng` a bounded number of times per pick (determinism under replay depends on stable call counts — document this in a comment).

- [ ] **Step 1: Write the failing test** (`tests/unit/crawl_policies.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../../src/core/rng.js";
import { makePolicy } from "../../src/crawl/policies.js";
import type { RpgActionOption } from "../../src/rpg/legal_actions.js";

const opt = (id: string, type = "LOOK"): RpgActionOption =>
  ({ id, command: id, action: { type } } as unknown as RpgActionOption);
const ctx = (tried: string[] = []) => ({ visitedRooms: new Set<string>(), triedActionIds: new Set(tried) });

describe("crawl policies", () => {
  it("same seed ⇒ identical pick sequence; different seed ⇒ diverges", () => {
    const options = [opt("a"), opt("b"), opt("c"), opt("d")];
    const run = (seed: number) => {
      const p = makePolicy("random", mulberry32(seed));
      return Array.from({ length: 20 }, () => p.pick(options, ctx()).id).join("");
    };
    expect(run(42)).toBe(run(42));
    expect(run(42)).not.toBe(run(43));
  });

  it("coverage prefers untried MOVE options first, then any untried", () => {
    const options = [opt("look", "LOOK"), opt("go-n", "MOVE"), opt("take-x", "TAKE")];
    const p = makePolicy("coverage", mulberry32(1));
    expect(p.pick(options, ctx()).id).toBe("go-n");
    expect(p.pick(options, ctx(["go-n"])).id).not.toBe("go-n"); // untried non-MOVE next
    const allTried = ctx(["look", "go-n", "take-x"]);
    expect(options.map((o) => o.id)).toContain(p.pick(options, allTried).id); // falls back uniform
  });

  it("mixed is deterministic for a fixed seed", () => {
    const options = [opt("a"), opt("b", "MOVE"), opt("c")];
    const seq = (seed: number) => {
      const p = makePolicy("mixed", mulberry32(seed));
      return Array.from({ length: 30 }, () => p.pick(options, ctx()).id).join("");
    };
    expect(seq(7)).toBe(seq(7));
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npx vitest run tests/unit/crawl_policies.test.ts`.
- [ ] **Step 3: Implement** per the behavior contract (≈50 lines).
- [ ] **Step 4: Run to verify PASS.**
- [ ] **Step 5: Commit** — `npm run format && git add -A && git commit -m "feat(crawl): seeded random/coverage/mixed action policies"`

---

### Task 4: Prepared quests + quest crawler with oracles CRASH / INTEGRITY / LEGALITY / RENDER

**Files:**
- Create: `src/crawl/prepare.ts`, `src/crawl/oracles.ts`, `src/crawl/quest_crawler.ts`
- Test: `tests/unit/crawl_quest_crawler.test.ts`

**Interfaces:**
- Consumes: Task 2 `FindingCollector`, Task 3 `makePolicy`.
- Produces:

```ts
// src/crawl/prepare.ts
export type PreparedQuest = {
  questId: string;                       // world_quest_id, or pack.meta.id for in-memory packs
  index: RpgIndex;                       // from indexRpgPack
  rules: Rules<RpgAction>;               // from buildRpgRules (possibly wrapped)
  contentHash: string;                   // hashState(pack)
  sourceRef: [string, string] | null;    // ["wq", questId] for shipped; null for in-memory packs
};
export type PrepareOptions = { wrapRules?: (rules: Rules<RpgAction>) => Rules<RpgAction> };
export function prepareShippedQuest(root: string, worldQuestId: string, opts?: PrepareOptions): PreparedQuest;
export function preparePack(pack: RpgPack, opts?: PrepareOptions): PreparedQuest;   // for generated/mutated packs
export function listShippedQuestIds(root: string): string[];                        // via RpgSourceRuntime.shippedWorldQuestIds()

// src/crawl/oracles.ts (pure)
/** Returns a defect description or null. Checks: empty/whitespace-only, /\bundefined\b/, /\[object Object\]/, /\bNaN\b/, unresolved templates /\{\{|\}\}|\$\{/. */
export function textDefect(text: string): string | null;
/** Scans observation title/description/ending text + narration/dialogue event text. Returns messages. */
export function renderDefects(index: RpgIndex, state: GameState, events: GameEvent[]): string[];
/** Deterministically synthesize an action NOT in the legal set (unlisted MOVE direction, TAKE of an item not present, ASK unknown topic). Returns null if it cannot build one. */
export function sampleIllegalAction(index: RpgIndex, state: GameState, legal: RpgActionOption[], rng: Rng): RpgAction | null;

// src/crawl/quest_crawler.ts
export type QuestCrawlOptions = {
  seed: number; maxSteps: number; policy: PolicyName;
  maxStepsPerEpisode?: number;      // default 300
  persistEvery?: number;            // default 37; 0 disables PERSIST oracle       (Task 5)
  illegalEvery?: number;            // default 23; 0 disables illegal sampling
  desyncReplay?: boolean;           // default true: end-of-episode replay check   (Task 5)
  solverBudget?: number;            // default 0 (off); >0 enables SOFTLOCK solver (Task 5)
  commit: string;
  location?: Partial<CrawlLocation>; // extra location fields (region/node) when launched from overworld
};
export type EpisodeRecord = { episodeSeed: number; actions: RpgAction[]; perStepHashes: string[]; endingId: string | null };
export type QuestCrawlResult = {
  questId: string; steps: number; episodes: EpisodeRecord[];
  endingsReached: string[]; findings: CrawlFinding[]; totalRawFindings: number;
  coverage: { roomsVisited: string[]; actionIdsTried: string[] };
};
export function episodeSeed(seed: number, episode: number): number;   // ((seed * 9973 + episode) >>> 0) || 1
export function crawlQuest(prepared: PreparedQuest, opts: QuestCrawlOptions): QuestCrawlResult;
```

Stepping loop (the heart — implement exactly this shape):

```ts
export function crawlQuest(prepared: PreparedQuest, opts: QuestCrawlOptions): QuestCrawlResult {
  const { index, rules } = prepared;
  const step = makeStep(rules);
  const collector = new FindingCollector({ seed: opts.seed, policy: opts.policy, commit: opts.commit });
  const roomsVisited = new Set<string>(); const actionIdsTried = new Set<string>();
  const episodes: EpisodeRecord[] = []; const endingsReached = new Set<string>();
  let totalSteps = 0; let episodeN = 0;
  const loc = (state: GameState) => ({ region: opts.location?.region ?? null, node: opts.location?.node ?? null,
    questId: prepared.questId, sceneId: state.current });

  while (totalSteps < opts.maxSteps) {
    const eSeed = episodeSeed(opts.seed, episodeN++);
    const rng = mulberry32(eSeed);
    const policy = makePolicy(opts.policy, rng);
    let state: GameState;
    try { state = initStateForRpgPack(index, eSeed); }
    catch (err) { collector.add({ code: "CRASH", step: 0, location: { ...loc0 }, action: null,
      message: `init threw: ${describeError(err)}`, stateHash: null, repro: none() }); break; }
    const record: EpisodeRecord = { episodeSeed: eSeed, actions: [], perStepHashes: [], endingId: null };
    episodes.push(record);
    roomsVisited.add(state.current);

    for (let s = 0; s < (opts.maxStepsPerEpisode ?? 300) && totalSteps < opts.maxSteps; s++, totalSteps++) {
      // 1. enumerate (CRASH oracle around it)
      let options: RpgActionOption[];
      try { options = enumerateRpgActions(index, state); }
      catch (err) { crash(`enumerate threw: ${describeError(err)}`, state, record); break; }
      if (state.ended) break;
      // 2. SOFTLOCK (immediate form): live state with zero legal actions
      if (options.length === 0) {
        collector.add({ code: "SOFTLOCK", severity: "S4", step: totalSteps, location: loc(state), action: null,
          message: "live (non-ended) state has zero legal actions", stateHash: hashState(state), repro: reproFor(record) });
        break;
      }
      // 3. LEGALITY (negative sampling): a sampled illegal action must be rejected cleanly
      if (opts.illegalEvery && s > 0 && s % opts.illegalEvery === 0) {
        const illegal = sampleIllegalAction(index, state, options, rng);
        if (illegal) {
          const before = hashState(state);
          try {
            const r = step(state, illegal as RpgAction);
            if (r.ok) collector.add({ code: "LEGALITY", ..., message: `illegal action was accepted: ${JSON.stringify(illegal)}` });
            else if (hashState(r.state) !== before && hashState(state) !== before) { /* state must be untouched */ }
          } catch (err) {
            collector.add({ code: "LEGALITY", ..., message: `illegal action threw instead of clean rejection: ${describeError(err)}` });
          }
        }
      }
      // 4. pick + execute a legal action (CRASH / LEGALITY-positive oracles)
      const choice = policy.pick(options, { visitedRooms: roomsVisited, triedActionIds: actionIdsTried });
      let result: StepResult;
      try { result = step(state, choice.action); }
      catch (err) { crash(`step threw on legal action ${choice.id}: ${describeError(err)}`, state, record, choice.action); break; }
      record.actions.push(choice.action);
      actionIdsTried.add(choice.id);
      if (!result.ok) {
        collector.add({ code: "LEGALITY", step: totalSteps, location: loc(state), action: choice.action,
          message: `listed legal action rejected: ${result.rejectionReason ?? "?"} (${choice.id})`,
          stateHash: hashState(state), repro: reproFor(record) });
        continue; // state unchanged per engine contract
      }
      state = result.state;
      roomsVisited.add(state.current);
      record.perStepHashes.push(hashState(state));
      // 5. INTEGRITY
      try { assertRpgStateReferences(index, state); }
      catch (err) { collector.add({ code: "INTEGRITY", ..., message: describeError(err), repro: reproFor(record) }); break; }
      // 6. RENDER (observation + events; CRASH oracle around the render itself)
      try { for (const m of renderDefects(index, state, result.events))
        collector.add({ code: "RENDER", step: totalSteps, location: loc(state), action: choice.action, message: m, stateHash: hashState(state), repro: reproFor(record) }); }
      catch (err) { crash(`observation render threw: ${describeError(err)}`, state, record, choice.action); break; }
      // 7. PERSIST + DESYNC + SOFTLOCK-solver hooks — Task 5 fills these in
      if (state.ended) { record.endingId = state.endingId; if (state.endingId) endingsReached.add(state.endingId); break; }
    }
    // end-of-episode DESYNC replay + solver — Task 5
  }
  return { questId: prepared.questId, steps: totalSteps, episodes, endingsReached: [...endingsReached].sort(),
    findings: collector.findings, totalRawFindings: collector.totalRaw,
    coverage: { roomsVisited: [...roomsVisited].sort(), actionIdsTried: [...actionIdsTried].sort() } };
}
```

(`describeError` = `err instanceof Error ? \`${err.name}: ${err.message}\` : String(err)`; `reproFor(record)` = `{ kind: "rpg-trace", trace: buildRepro(prepared, record), minimized: false }` where `buildRepro` uses `recordTrace(rules, initStateForRpgPack(index, record.episodeSeed), record.actions, …)` — but ONLY lazily/on-finding, never per step. `crash(...)` = collector.add CRASH + repro.)

**`prepareShippedQuest` implementation note:** mirror how `bin/replay.ts` / `src/mcp/rpg_source_runtime.ts` resolve a world-quest source: instantiate `RpgSourceRuntime` (or its underlying resolve + `compileRpgSource`) for `["wq", id]`, get `{ pack, contentHash }`, then `indexRpgPack(pack)`, `buildRpgRules(index)`, optional `opts.wrapRules`. Read `src/mcp/rpg_source_runtime.ts` for the exact constructor before implementing.

- [ ] **Step 1: Write the failing test** (`tests/unit/crawl_quest_crawler.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { generateRpgPack } from "../../src/gen/rpg_generator.js";
import { preparePack, prepareShippedQuest, listShippedQuestIds } from "../../src/crawl/prepare.js";
import { crawlQuest } from "../../src/crawl/quest_crawler.js";

const OPTS = { seed: 11, maxSteps: 400, policy: "mixed" as const, commit: "test" };

describe("quest crawler", () => {
  it("crawls a generated pack cleanly and deterministically", () => {
    const prepared = () => preparePack(generateRpgPack(3));
    const a = crawlQuest(prepared(), OPTS);
    const b = crawlQuest(prepared(), OPTS);
    expect(a.findings).toEqual([]);                       // generated packs are valid: no findings
    expect(a.steps).toBe(400);
    expect(a.episodes.map(e => e.actions)).toEqual(b.episodes.map(e => e.actions));  // determinism
    expect(a.episodes.map(e => e.perStepHashes)).toEqual(b.episodes.map(e => e.perStepHashes));
    expect(a.coverage.roomsVisited.length).toBeGreaterThan(1);
  });

  it("different seeds explore differently", () => {
    const a = crawlQuest(preparePack(generateRpgPack(3)), OPTS);
    const b = crawlQuest(preparePack(generateRpgPack(3)), { ...OPTS, seed: 12 });
    expect(a.episodes[0].actions).not.toEqual(b.episodes[0].actions);
  });

  it("CRASH: a throwing resolver is caught with a repro, not propagated", () => {
    const prepared = preparePack(generateRpgPack(3), { wrapRules: (rules) => ({ ...rules,
      resolve: (state, action) => { if (action.type === "TAKE") throw new Error("planted resolver bomb"); return rules.resolve(state, action); } }) });
    const r = crawlQuest(prepared, OPTS);
    const crash = r.findings.find(f => f.code === "CRASH");
    expect(crash).toBeDefined();
    expect(crash!.message).toContain("planted resolver bomb");
    expect(crash!.severity).toBe("S4");
    expect(crash!.repro.kind).toBe("rpg-trace");
  });

  it("RENDER: unresolved template markers in a room description are flagged", () => {
    const pack = generateRpgPack(3);
    const roomId = Object.keys(pack.rooms).find(id => id !== pack.start)!; // any non-start room; adjust accessor to actual RpgPack shape
    // mutate the plain object AFTER schema parse (generateRpgPack already parsed it)
    (pack.rooms as any)[roomId].description = "You see {{treasure_name}} here.";
    const r = crawlQuest(preparePack(pack), { ...OPTS, maxSteps: 600 });
    const render = r.findings.find(f => f.code === "RENDER");
    expect(render).toBeDefined();
    expect(render!.location.sceneId).toBe(roomId);
  });

  it("INTEGRITY: state corruption planted via rules wrapper is caught", () => {
    const prepared = preparePack(generateRpgPack(4), { wrapRules: (rules) => ({ ...rules,
      resolve: (state, action) => {
        const res = rules.resolve(state, action);
        if (action.type === "MOVE" && res) return { ...res, effects: [...res.effects, { type: "add_item", item: "ghost_item_not_in_pack" } as never] };
        return res; } }) });
    const r = crawlQuest(prepared, OPTS);
    expect(r.findings.some(f => f.code === "INTEGRITY" || f.code === "CRASH")).toBe(true);
  });

  it("shipped quests load and a short crawl of one is finding-free", () => {
    const ids = listShippedQuestIds(process.cwd());
    expect(ids.length).toBeGreaterThanOrEqual(11);
    const r = crawlQuest(prepareShippedQuest(process.cwd(), ids[0]), { ...OPTS, maxSteps: 200 });
    expect(r.findings.filter(f => f.code !== "ORPHAN")).toEqual([]);
  });
});
```

NOTE for the implementer: the exact `RpgPack` room accessor (`pack.rooms` record vs array) and the exact add-item effect literal must be checked against `src/rpg/schema.ts` before finalizing the test — keep the test's INTENT identical (mutate a description; inject an unknown-item effect). If the engine rejects the unknown effect by throwing, CRASH is the correct catch — the test accepts either code for the planted corruption.

- [ ] **Step 2: Run to verify FAIL.** `npx vitest run tests/unit/crawl_quest_crawler.test.ts`
- [ ] **Step 3: Implement `prepare.ts`, `oracles.ts`, `quest_crawler.ts`** per the shapes above.
- [ ] **Step 4: Run to verify PASS**, then also `npx vitest run tests/unit` for collateral.
- [ ] **Step 5: Commit** — `npm run format && git add -A && git commit -m "feat(crawl): quest crawler with crash/integrity/legality/render oracles"`

---

### Task 5: DESYNC, PERSIST, SOFTLOCK(solver) oracles + repro traces

**Files:**
- Modify: `src/crawl/quest_crawler.ts` (fill the Task-4 hooks)
- Create: nothing new
- Test: extend `tests/unit/crawl_quest_crawler.test.ts`

**Interfaces:**
- Consumes: `save`/`load` from `src/persist/save_load.js`; `runActions`/`recordTrace` from `src/trace/record.js`; `exhaustiveEndingsMulti` from `src/solve/exhaustive_endings.js` (Task 1); `buildRpgRules(index, forcedRng)` for best/worst-roll rule pairs (copy the forced-rng construction from `tests/regression/rpg_all_endings_reachable.test.ts` — read it first).
- Produces: `QuestCrawlOptions.persistEvery/desyncReplay/solverBudget` become functional; `EpisodeRecord.perStepHashes` used for divergence localization.

Behavior to implement:

1. **PERSIST** (inside the step loop, after INTEGRITY): when `persistEvery > 0 && s % persistEvery === 0`:
   ```ts
   const bytes = save(state, prepared.contentHash);
   const bundle = load(bytes, prepared.contentHash);
   if (hashState(bundle.state) !== hashState(state))
     collector.add({ code: "PERSIST", message: `save→load hash mismatch at step ${s}`, ... });
   ```
   Wrap in try/catch — a throw from save/load on a state the engine produced is itself a PERSIST finding (message includes the error).
2. **DESYNC** (end of each episode, when `desyncReplay !== false`): re-run the recorded actions from a fresh `initStateForRpgPack(index, record.episodeSeed)` with a fresh `makeStep(rules)`; compare per-step hashes:
   ```ts
   const replay = runActions(rules, initStateForRpgPack(index, record.episodeSeed), record.actions);
   const firstDivergence = record.perStepHashes.findIndex((h, i) => replay.hashes[i] !== h);
   if (firstDivergence !== -1) collector.add({ code: "DESYNC", step: firstDivergence,
     message: `replay diverged at action index ${firstDivergence}`, ... });
   ```
   (Confirm `runActions`' exact return shape — explorer reported `{ finalState, steps, hashes }` — and whether its `hashes` aligns 1:1 with post-action states; adjust indexing accordingly. If a rejected action mid-replay changes alignment, replay must apply the same skip logic the recorder used: only `ok` steps got a hash. Simplest robust approach: hand-roll the replay loop with `makeStep` instead of `runActions` and hash after each applied action.)
3. **SOFTLOCK (solver form)** (end of episode, only when `solverBudget > 0` and the episode ended WITHOUT `state.ended`): build best/worst rule pair and run
   ```ts
   const res = exhaustiveEndingsMulti([bestRules, worstRules], state, opts.solverBudget);
   if (res.reached.size === 0 && !res.cappedOut)
     collector.add({ code: "SOFTLOCK", message: `no declared ending reachable from post-episode state (searched ${res.states} states)`, ... });
   ```
   `cappedOut === true` ⇒ NO finding (unproven). Severity stays S3 (the immediate zero-actions form in Task 4 is S4).

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/crawl_quest_crawler.test.ts`)

```ts
  it("DESYNC: a rules wrapper with hidden mutable state is caught by episode replay", () => {
    let calls = 0;
    const prepared = preparePack(generateRpgPack(5), { wrapRules: (rules) => ({ ...rules,
      resolve: (state, action) => {
        calls += 1;
        // 40th resolve call onward returns a slightly different resolution → live run ≠ replay
        const res = rules.resolve(state, action);
        if (calls === 40 && res) return { ...res, effects: [...res.effects, { type: "set_flag", flag: Object.keys(state.flags)[0] ?? "", value: true } as never] };
        return res; } }) });
    const r = crawlQuest(prepared, { seed: 11, maxSteps: 200, policy: "random", commit: "test", persistEvery: 0 });
    expect(r.findings.some(f => f.code === "DESYNC")).toBe(true);
  });

  it("PERSIST: save→load roundtrip is exercised and clean on a healthy pack", () => {
    const r = crawlQuest(preparePack(generateRpgPack(6)), { seed: 3, maxSteps: 300, policy: "mixed", commit: "test", persistEvery: 10 });
    expect(r.findings.filter(f => f.code === "PERSIST")).toEqual([]);
  });

  it("SOFTLOCK(solver): a pack mutated into a one-way pit is caught", () => {
    const pack = generateRpgPack(7);
    // make a mid room a pit: strip ALL its exits (adjust to actual RpgPack exit shape)
    const mid = /* pick a reachable non-start, non-terminal room id */;
    (pack.rooms as any)[mid].exits = {};
    const r = crawlQuest(preparePack(pack), { seed: 5, maxSteps: 1500, policy: "mixed", commit: "test", solverBudget: 20000 });
    expect(r.findings.some(f => f.code === "SOFTLOCK")).toBe(true);
  });
```

(The DESYNC wrapper trick relies on the wrapper being shared between live run and replay but path-dependent on TOTAL resolve calls — the replay's call count differs from the live run's cumulative count, so hashes diverge. If the effect literal (`set_flag`) doesn't match the engine's actual effect vocabulary, read `src/core/effects.ts` / `applyEffects` and use a real minimal effect (e.g. the engine's journal-append or var-set effect). The INTENT is fixed: replay must observe a different state stream than the live run.)

- [ ] **Step 2: Run to verify FAIL** (DESYNC/SOFTLOCK tests fail; PERSIST may pass trivially only if wired — it isn't yet).
- [ ] **Step 3: Implement** the three hooks.
- [ ] **Step 4: Run to verify PASS**: `npx vitest run tests/unit/crawl_quest_crawler.test.ts`.
- [ ] **Step 5: Commit** — `npm run format && git add -A && git commit -m "feat(crawl): desync replay, persist roundtrip, solver softlock oracles"`

---

### Task 6: Minimization — ddmin + reproduceFinding (src/crawl/minimize.ts)

Delta debugging over the action sequence. **Justification (spec asks):** fast-check shrinking only integrates when the walk itself is a fast-check property over an action-list arbitrary; our walks are policy-directed (coverage/mixed) and stateful, so the generator isn't an arbitrary. ddmin over the *recorded* sequence works uniformly for every policy and for fault-injection replays, at the cost of O(n²) worst-case re-runs — acceptable because repro sequences are ≤ a few hundred actions and re-running is thousands of steps/sec.

**Files:**
- Create: `src/crawl/minimize.ts`
- Test: `tests/unit/crawl_minimize.test.ts`

**Interfaces:**

```ts
/** Classic ddmin. reproduces(candidate) re-executes and returns true if the SAME finding fingerprint occurs. Result: a subsequence that still reproduces; 1-minimal w.r.t. removing any single remaining element. */
export function minimizeActions<A>(actions: readonly A[], reproduces: (candidate: readonly A[]) => boolean): A[];
/** Re-run `actions` from a fresh episode state; true iff a finding with `fingerprint` occurs. Shared by minimizeActions callers and the fault-injection suite. */
export function reproducesFingerprint(prepared: PreparedQuest, episodeSeedValue: number, actions: readonly RpgAction[], fingerprint: string, opts?: { persistEvery?: number; solverBudget?: number }): boolean;
/** Convenience: minimize a finding's episode actions and return an updated finding with repro.trace rebuilt via recordTrace and repro.minimized=true. */
export function minimizeFinding(prepared: PreparedQuest, finding: CrawlFinding, episode: EpisodeRecord): CrawlFinding;
```

`reproducesFingerprint` implementation: replay candidate actions step-by-step with `makeStep`, running the SAME oracle checks as `crawlQuest`'s inner loop (extract the per-step oracle block from Task 4 into a shared internal function `runStepOracles(...)` so crawler and reproducer cannot drift). A candidate action that gets rejected (`ok:false`) is skipped (rejection is legal during shrinking — the subsequence may break preconditions).

- [ ] **Step 1: Write the failing test** (`tests/unit/crawl_minimize.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { minimizeActions } from "../../src/crawl/minimize.js";

describe("ddmin", () => {
  it("shrinks to the single culprit", () => {
    const actions = Array.from({ length: 60 }, (_, i) => i);
    const reproduces = (c: readonly number[]) => c.includes(41);
    const min = minimizeActions(actions, reproduces);
    expect(min).toEqual([41]);
  });
  it("keeps an order-dependent pair", () => {
    const actions = Array.from({ length: 40 }, (_, i) => i);
    const reproduces = (c: readonly number[]) => c.includes(7) && c.includes(31) && c.indexOf(7) < c.indexOf(31);
    const min = minimizeActions(actions, reproduces);
    expect(min).toEqual([7, 31]);
  });
  it("returns input when nothing smaller reproduces", () => {
    const reproduces = (c: readonly number[]) => c.length === 3;
    expect(minimizeActions([1, 2, 3], reproduces)).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implement ddmin** (standard: try removing chunks at granularity n=2, double granularity on failure, restart at 2 on success; finish with single-element elimination pass). — [ ] **Step 4: PASS.**
- [ ] **Step 5: Wire into the crawler:** in `crawlQuest`, after an episode produces findings, call `minimizeFinding` for each NEW (non-deduped) finding whose code is not ORPHAN, with a per-finding re-run budget (skip minimization if `actions.length > 2000`). Re-run the Task-4/5 test file — all still PASS, and add one assertion to the CRASH test: `expect(crash!.repro.minimized).toBe(true)` and the minimized trace's `actions.length` is `<=` the episode's.
- [ ] **Step 6: Commit** — `npm run format && git add -A && git commit -m "feat(crawl): ddmin minimization with replayable minimized traces"`

---

### Task 7: CLI + crawl:smoke lane (bin/crawl.ts, src/crawl/run.ts)

**Files:**
- Create: `bin/crawl.ts`, `src/crawl/run.ts`
- Modify: `package.json` (add `crawl`, `crawl:smoke`, `crawl:deep` scripts)
- Test: `tests/unit/crawl_run.test.ts` (arg parsing + smoke-plan shape; NOT a full smoke in unit tests)

**Interfaces:**

```ts
// src/crawl/run.ts
export type CrawlPlanItem = { kind: "quest"; questId: string; seeds: number[]; stepsPerSeed: number }
                          | { kind: "overworld"; seed: number };           // overworld handled in Task 8
export type CrawlRunOptions = {
  root: string; policy: PolicyName; commit: string;
  quests: string[] | "all"; overworld: boolean;
  seeds: number[]; stepsPerSeed: number; secondsBudget?: number;
  solverBudget: number; persistEvery: number; outDir: string; workers: number;
};
export function buildPlan(opts: CrawlRunOptions): CrawlPlanItem[];          // deterministic order: quests sorted, then overworld
export function runPlanInProcess(items: CrawlPlanItem[], opts: CrawlRunOptions): CrawlRunSummary;
export type CrawlRunSummary = {
  findings: CrawlFinding[]; countsByCode: Record<string, number>;
  steps: number; wallMs: number; stepsPerSec: number;
  questCoverage: Record<string, { roomsVisited: number; roomsTotal: number; actionsTried: number; actionsTotal: number; endingsReached: string[]; endingsDeclared: string[]; orphans: { rooms: string[]; endings: string[] } }>;
  overworld?: OverworldCoverageSummary;   // Task 8
};
export function writeRunArtifacts(outDir: string, summary: CrawlRunSummary, meta: { argv: string[]; commit: string; startedAt: string }): void;
// writes findings.jsonl (deduped, deterministic order), summary.json (zod-free plain), summary.md (human)

// bin/crawl.ts flags (parse by hand like bin/replay.ts does — no dep):
//   --quest <id>            repeatable; default all shipped
//   --overworld / --no-overworld   (default: on for default lane & smoke; off when --quest given unless explicitly set)
//   --policy random|coverage|mixed   default mixed
//   --steps N               per (quest,seed) step budget, default 400
//   --seconds S             soft wall-clock budget for the whole run (deep lane), 0 = unlimited
//   --seeds A..B | --seeds N (single), default 1..3
//   --workers W             default 1 (worker fan-out lands in Task 10; W>1 before that = error "workers arrive in crawl:deep")
//   --solver-budget N       default 0
//   --out DIR               default ai-runs/crawl/<UTC yyyymmddThhmmssZ>
//   --smoke                 preset: policy=mixed, seeds=1..2, steps=250, solver-budget=0, overworld=on, quests=all, workers=1, exit 1 on any non-ORPHAN finding
//   --deep                  preset: seeds=1000..1063, steps=2000, solver-budget=20000, persistEvery=37, workers=8, seconds=default 900
```

Exit codes: 0 = ran, no non-ORPHAN findings; 1 = non-ORPHAN findings present (they are also printed, one line each: `CODE severity quest/scene message`); 2 = usage error. `--smoke` MUST be deterministic: fixed seeds, no `--seconds` cutoff, and `summary.md` must not embed wall-clock in the findings section (timing lives in a separate "timing" block).

- [ ] **Step 1: Failing test** (`tests/unit/crawl_run.test.ts`) — cover `parseCrawlArgs` (export it from `bin/crawl.ts` like `blind-launch.mjs` exports its parser, or put it in `src/crawl/run.ts` and have bin import it — choose the latter for lint simplicity):

```ts
import { describe, expect, it } from "vitest";
import { parseCrawlArgs, buildPlan } from "../../src/crawl/run.js";

describe("crawl CLI", () => {
  it("parses seed ranges and quest lists", () => {
    const o = parseCrawlArgs(["--quest", "sunken_barrow", "--seeds", "5..8", "--steps", "100", "--policy", "random"]);
    expect(o.quests).toEqual(["sunken_barrow"]);
    expect(o.seeds).toEqual([5, 6, 7, 8]);
    expect(o.policy).toBe("random");
    expect(o.overworld).toBe(false);
  });
  it("smoke preset is fixed and deterministic", () => {
    const a = parseCrawlArgs(["--smoke"]); const b = parseCrawlArgs(["--smoke"]);
    expect(a).toEqual(b);
    expect(a.seeds.length).toBeGreaterThan(0);
    expect(a.secondsBudget).toBeUndefined();
    expect(a.overworld).toBe(true);
  });
  it("plan orders quests deterministically", () => {
    const o = parseCrawlArgs(["--smoke"]);
    const plan = buildPlan({ ...o, root: process.cwd(), commit: "x", outDir: "ignored" });
    const questIds = plan.filter(p => p.kind === "quest").map(p => (p as any).questId);
    expect(questIds).toEqual([...questIds].sort());
  });
});
```

- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implement** `run.ts` + `bin/crawl.ts` (thin main: parse → resolve commit via `git rev-parse --short HEAD` through `node:child_process` execSync (wall-clock-free), build plan → run → write artifacts → print summary + exit code). Add the three npm scripts.
- [ ] **Step 4: PASS + live checkpoint (quests only until Task 8):**

Run: `npm run crawl -- --steps 300 --seeds 1..2 --no-overworld`
Expected: completes; prints per-quest coverage; `ai-runs/crawl/<ts>/findings.jsonl` + `summary.md` exist; exit code reflects findings. **Record the measured steps/sec.** If any real findings appear on shipped quests: triage per the charter (fix if one focused change, else file under `traces/bugs/` + note — do NOT proceed with unexplained findings).
- [ ] **Step 5: Commit** — `npm run format && git add -A && git commit -m "feat(crawl): crawl CLI with smoke/deep lanes and run artifacts"`

---

### Task 8: Overworld crawler + WORLD oracle + quest round trips + coverage (oracles 8–9)

**Files:**
- Create: `src/crawl/overworld_crawler.ts`, `src/crawl/quest_solver.ts`, `src/crawl/coverage.ts`
- Modify: `src/crawl/run.ts` (wire `kind:"overworld"` plan items), `bin/crawl.ts` (`--overworld` live)
- Test: `tests/unit/crawl_overworld.test.ts`

**Interfaces:**

```ts
// src/crawl/quest_solver.ts
/** BFS with parent pointers over concrete play (makeStep + enumerateRpgActions, stateKey dedupe)
 *  until first state with ended && endingId && !death(ending). Returns the action path or null (capped/unreachable). */
export function solveToEnding(prepared: PreparedQuest, seed: number, maxStates: number):
  { actions: RpgAction[]; endingId: string; endingTitle: string; death: boolean } | null;

// src/crawl/overworld_crawler.ts
export type OverworldCrawlOptions = {
  root: string; seed: number; commit: string;
  questRoundTrips: boolean;            // smoke: true
  solverBudget: number;                // for solveToEnding, default 30000
  maxLocalActionsPerTown: number;      // discovery budget per quest anchor, default 40
};
export type OverworldCrawlResult = { findings: CrawlFinding[]; coverage: OverworldCoverageSummary;
  questRoundTrips: { questId: string; endingId: string | null }[] };
export function crawlOverworld(opts: OverworldCrawlOptions): OverworldCrawlResult;

// src/crawl/coverage.ts
export type OverworldCoverageSummary = {
  nodes: { visited: number; total: number; orphans: string[] };
  edges: { traveled: number; total: number; orphans: string[] };
  boards: { read: number; total: number };          // distinct (home,area) quest anchors reached
  quests: { entered: string[]; total: number };
};
export function renderCoverageMarkdown(summary: CrawlRunSummary): string;
```

`crawlOverworld` algorithm (deterministic; rng = `mulberry32(seed)` used ONLY to pick road-encounter strategies):
1. `world = loadOverworldManifest(root)`; `session = new OverworldSession(world)`.
2. **Edge sweep:** while untraveled manifest edges remain: pick the lexicographically-smallest untraveled edge reachable from the current town (path found with `session.planRoute` toward `edge.from`/`edge.to`); travel each leg by `travel(edgeId)`; after EVERY travel, if a road encounter is pending, `resolveRoadEncounter(options[rng.int(0, options.length-1)])` (read the options from the travel result / view — check the actual return shape of `travel` and the pending-encounter surface in `session.ts` before coding). Any throw from a legal travel/resolve → **WORLD** finding (message includes edge id) — catch, record, attempt to continue with the next edge; if the same edge throws twice, mark it orphaned and move on.
3. **Snapshot roundtrip probe** every 25 travels: `OverworldSession.restore(world, session.snapshot()).snapshotHash() === session.snapshotHash()` else **PERSIST** finding (location = current node).
4. **Boards + quests:** for each `world.quests` (sorted by id): `travelTo(q.home)` (via planRoute legs), then discovery loop: up to `maxLocalActionsPerTown` local actions (`exploreArea` on discovered areas, `moveArea` toward `q.area` once its route appears, `exploreSite`/`scoutPoi` as available — cycle deterministically) until `q.area` is the current area AND `q.id` appears in `compactView()` quests. Failure → **WORLD** "quest not discoverable from its anchor within N local actions". Success → board counted read.
5. **Round trip** (when `questRoundTrips`): `hBefore = session.snapshotHash()`; `previewQuestStart(q.id)`; `startQuest(q.id)`; run the quest fully in-process: `prepared = prepareShippedQuest(root, q.id)`; `path = solveToEnding(prepared, seed, solverBudget)`; if `null` → WORLD finding "no non-death ending solvable for round trip (capped)" (S3, honest cap note); else `completeQuest(q.id, { endingId, endingTitle, death:false })`. Then check: `session.snapshotHash() !== hBefore` (it MUST change — quest completion writes state) AND restore-roundtrip still hash-identical AND `startedQuestIds/completedQuestIds` include q.id (via `view()`); any violated expectation → **WORLD** "quest handoff/return corrupted overworld state: <detail>".
6. **Coverage/ORPHAN:** after the sweep, unvisited nodes / untraveled edges land in `coverage.*.orphans` and each produces ONE aggregated **ORPHAN** finding (report-only) listing counts + first 10 ids.

- [ ] **Step 1: Failing test** (`tests/unit/crawl_overworld.test.ts`) — keep budgets tiny so unit stays fast:

```ts
import { describe, expect, it } from "vitest";
import { crawlOverworld } from "../../src/crawl/overworld_crawler.js";
import { solveToEnding } from "../../src/crawl/quest_solver.js";
import { prepareShippedQuest, listShippedQuestIds } from "../../src/crawl/prepare.js";

describe("overworld crawler", () => {
  it("solveToEnding finds a non-death ending path for every shipped quest", () => {
    for (const id of listShippedQuestIds(process.cwd())) {
      const path = solveToEnding(prepareShippedQuest(process.cwd(), id), 1, 60000);
      expect(path, id).not.toBeNull();
      expect(path!.death).toBe(false);
    }
  }, 60000);

  it("full pass is clean and covers everything (this IS the smoke overworld leg)", () => {
    const r = crawlOverworld({ root: process.cwd(), seed: 1, commit: "test",
      questRoundTrips: true, solverBudget: 60000, maxLocalActionsPerTown: 40 });
    expect(r.findings.filter(f => f.code !== "ORPHAN")).toEqual([]);
    expect(r.coverage.nodes.visited).toBe(r.coverage.nodes.total);
    expect(r.coverage.edges.traveled).toBe(r.coverage.edges.total);
    expect(r.coverage.boards.read).toBe(r.coverage.boards.total);
    expect(r.questRoundTrips.length).toBe(r.coverage.quests.total);
  }, 60000);

  it("is deterministic for a fixed seed", () => {
    const run = () => crawlOverworld({ root: process.cwd(), seed: 2, commit: "test",
      questRoundTrips: false, solverBudget: 0, maxLocalActionsPerTown: 40 });
    expect(run().coverage).toEqual(run().coverage);
  });
});
```

If the full-pass test exceeds ~45s, split quest round trips across it and the smoke lane (unit test keeps `questRoundTrips:false` + a separate 3-quest round-trip test; the FULL pass remains in `crawl:smoke`). Decide by measurement, note the decision in the commit message.
- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implement** (read `session.ts` travel/encounter return shapes first). — [ ] **Step 4: PASS.**
- [ ] **Step 5: Wire into run.ts/CLI; run the full smoke:**

Run: `npm run crawl:smoke`
Expected: all 11 quests crawled + overworld full pass; exit 0; wall time ≤ ~30s (tune `--smoke` preset budgets — steps per quest / seeds — to fit; keep ALL quests + the full overworld pass non-negotiable). **Record the wall time and steps/sec.**
- [ ] **Step 6: Commit** — `npm run format && git add -A && git commit -m "feat(crawl): overworld sweep, quest round trips, coverage + orphan reporting"`

---

### Task 9: Fault-injection acceptance suite (prove the tester tests)

**Files:**
- Create: `tests/acceptance/crawler_fault_injection.test.ts`

**Interfaces:** Consumes `generateRpgPack`, `preparePack(pack, { wrapRules })`, `crawlQuest`, `reproducesFingerprint`, `findingFingerprint`.

Four planted defects, each asserting (a) the finding code is exactly right, (b) the minimized repro re-reproduces via `reproducesFingerprint`:

- [ ] **Step 1: Write the suite**

```ts
import { describe, expect, it } from "vitest";
import { generateRpgPack } from "../../src/gen/rpg_generator.js";
import { preparePack } from "../../src/crawl/prepare.js";
import { crawlQuest } from "../../src/crawl/quest_crawler.js";
import { reproducesFingerprint } from "../../src/crawl/minimize.js";
import { findingFingerprint } from "../../src/crawl/findings.js";

const CRAWL = { seed: 13, maxSteps: 1200, policy: "mixed" as const, commit: "fault-injection" };

function assertCaughtWithRepro(r: ReturnType<typeof crawlQuest>, code: string, prepared: Parameters<typeof crawlQuest>[0]) {
  const f = r.findings.find(x => x.code === code);
  expect(f, `expected a ${code} finding`).toBeDefined();
  expect(f!.repro.kind).toBe("rpg-trace");
  expect(f!.repro.minimized).toBe(true);
  const trace = f!.repro.trace as { seed: number; actions: unknown[] };
  expect(
    reproducesFingerprint(prepared, trace.seed, trace.actions as never[], findingFingerprint(f!),
      { solverBudget: code === "SOFTLOCK" ? 20000 : 0 }),
    `minimized repro must re-trigger the ${code} fingerprint`,
  ).toBe(true);
}

describe("fault injection: the crawler catches planted defects", () => {
  it("catches a planted CRASH (throwing resolver)", () => {
    const prepared = preparePack(generateRpgPack(21), { wrapRules: (rules) => ({ ...rules,
      resolve: (s, a) => { if (a.type === "OPEN") throw new Error("fault: open explodes"); return rules.resolve(s, a); } }) });
    const r = crawlQuest(prepared, CRAWL);
    assertCaughtWithRepro(r, "CRASH", prepared);
  });

  it("catches a planted SOFTLOCK (one-way pit)", () => {
    const pack = generateRpgPack(22);
    /* strip all exits from a reachable mid room — same mutation as Task 5 */
    const prepared = preparePack(pack);
    const r = crawlQuest(prepared, { ...CRAWL, solverBudget: 20000 });
    assertCaughtWithRepro(r, "SOFTLOCK", prepared);
  });

  it("catches a planted RENDER defect (unresolved template + [object Object])", () => {
    const pack = generateRpgPack(23);
    /* set a reachable room description to "A {{macro}} of [object Object]" */
    const prepared = preparePack(pack);
    const r = crawlQuest(prepared, CRAWL);
    assertCaughtWithRepro(r, "RENDER", prepared);
  });

  it("catches planted state corruption (INTEGRITY or CRASH — engine may throw first)", () => {
    const prepared = preparePack(generateRpgPack(24), { wrapRules: /* ghost-item injection from Task 4 */ });
    const r = crawlQuest(prepared, CRAWL);
    expect(r.findings.some(f => f.code === "INTEGRITY" || f.code === "CRASH")).toBe(true);
  });
});
```

(The `/* … */` mutation bodies are written concretely in Tasks 4–5; copy them. NEVER mutate a shipped pack.)
- [ ] **Step 2: Run — all four must PASS** (they exercise code that already exists; if any planted bug is NOT caught, that is a real crawler gap: fix the crawler, not the test).
- [ ] **Step 3:** `npx vitest run tests/acceptance/` → PASS. Check suite runtime stays modest (< ~30s).
- [ ] **Step 4: Commit** — `npm run format && git add -A && git commit -m "test(crawl): fault-injection suite proves planted defects are caught"`

---

### Task 10: Workers + crawl:deep + throughput measurement (Phase 2 checkpoint)

**Files:**
- Create: `src/crawl/worker_entry.ts`
- Modify: `src/crawl/run.ts` (fan seeds across workers, merge deterministically), `bin/crawl.ts` (enable `--workers`)
- Test: `tests/unit/crawl_run.test.ts` (merge determinism, pure part)

Worker model: each worker executes `runPlanInProcess` on a SLICE of the seed list (whole seeds per worker — a (quest,seed) episode never splits), posts its `CrawlRunSummary` back; parent merges: findings concatenated then re-deduped by fingerprint and sorted by `(questId, code, step, fingerprint)`; coverage unioned; steps summed. **Concurrency must never affect per-seed determinism** — same seed slice ⇒ same findings regardless of `--workers`, proven by the merge test.

Worker launch (tsx caveat — verify live): try
```ts
new Worker(new URL("./worker_entry.ts", import.meta.url), { workerData, execArgv: ["--import", "tsx"] });
```
If TS loading in workers fails on this machine/Windows, fall back to `node:child_process` `spawn(process.execPath, ["--import","tsx", fileURLToPath(new URL("./worker_entry.ts", import.meta.url)), "--slice-json", tmpJsonPath])` with JSON over stdout — keep the same message shape, note the deviation in the commit message. Either way `worker_entry.ts` is a thin shell: read slice → `runPlanInProcess` → post/print summary JSON.

- [ ] **Step 1: Failing merge test** (extend `tests/unit/crawl_run.test.ts`):

```ts
  it("merging shard summaries is order-independent and re-dedupes", () => {
    const f = (seed: number, msg: string) => ({ code: "RENDER", severity: "S2", seed, policy: "mixed", step: 1,
      location: { region: null, node: null, questId: "q", sceneId: "r" }, action: null,
      message: msg, stateHash: null, commit: "x", repro: { kind: "none", trace: null, minimized: false } }) as const;
    const s1 = { findings: [f(1, "empty description 5")], steps: 10, /* …minimal summary… */ };
    const s2 = { findings: [f(2, "empty description 9")], steps: 20 };
    const ab = mergeSummaries([s1, s2] as never); const ba = mergeSummaries([s2, s1] as never);
    expect(ab.findings).toEqual(ba.findings);
    expect(ab.findings).toHaveLength(1);          // same fingerprint (numbers normalized)
    expect(ab.steps).toBe(30);
  });
```
(export `mergeSummaries` from `run.ts`.)
- [ ] **Step 2: FAIL → implement → PASS.**
- [ ] **Step 3: Live deep-soak checkpoint (Phase 2 gate — run it, read it):**

Run: `npm run crawl:deep -- --seconds 120 --workers 8`
Expected: completes; `summary.md` reports total steps, **measured steps/sec/worker and aggregate** (record the real numbers — the spec target is ≥5–10k steps/sec/worker in-process; report whatever is true), findings by code, coverage.
**Triage every finding:** each is either (a) fixed in this branch if one focused change, or (b) filed honestly — minimized repro JSON committed under `traces/bugs/` as `bug_XXXX_<slug>.yaml` following the existing YAML artifact convention (next free number; embed the minimized action trace + seed + content_hash) and noted for `AI_LOOP_STATE.md` (Task 18). Zero unexplained findings may remain.
- [ ] **Step 4: Determinism spot-proof:** `npm run crawl -- --quest sunken_barrow --seeds 5..5 --steps 500 --workers 1` twice → `findings.jsonl` byte-identical; then `--workers 2` with `--seeds 5..6` vs `--workers 1 --seeds 5..6` → identical findings sets. Paste the diff command output into the task notes.
- [ ] **Step 5: Commit** — `npm run format && git add -A && git commit -m "feat(crawl): worker-thread fan-out, deep soak lane, merged coverage"`

---

### Task 11: Personas + calibration anchors + prompt placeholder plumbing

**Files:**
- Create: `blind-tester/personas/default.md`, `blind-tester/personas/explorer.md`, `blind-tester/personas/speedrunner.md`, `blind-tester/personas/breaker.md`, `blind-tester/personas/casual.md`, `blind-tester/personas/lore-reader.md`, `blind-tester/fill-prompt.mjs`
- Modify: `blind-tester/prompt.md`, `blind-tester/prompt-overworld.md` (add `{{PERSONA}}` placeholder line after the intro paragraph), `blind-tester/run.sh` (add `--persona <name>` flag; replace the sed prompt-fill with `fill-prompt.mjs`)
- Test: `tests/unit/fleet_args.test.ts` covers `fill-prompt.mjs`'s exported `fillPrompt()` (pure)

Hard constraints: prompts' STRICT RULES and REPORT sections stay byte-identical (the verifier pattern-matches `Playthrough log`, `Verdict`, clarity/enjoyment ratings). Personas carry NO design/solution info — play-style disposition only. `--persona` absent or `default` ⇒ the filled prompt is byte-identical to today's output (empty persona slot collapses to nothing); prove it in Step 4.

Persona file shape — persona-specific first paragraph + this SHARED calibration block appended verbatim in every non-default persona file:

```markdown
CALIBRATION (scores must be earned):
- 3/5 = an average competent text adventure. 5/5 = you would recommend it unprompted.
- You are a critical playtester; praise must be earned by specifics.
- If you report zero bugs AND zero confusions, you MUST state what you TRIED that
  failed to surface any (at least three concrete attempts).
- worst_moment is mandatory and must name a real moment, not "nothing".
```

Persona voices (first paragraph each — write exactly these):
- `explorer.md`: "You are the EXPLORER. You poke every exit, open every container, read every notice, talk to everyone, and only then pursue the goal. You judge a game by how much of it rewards curiosity."
- `speedrunner.md`: "You are the SPEEDRUNNER. You beeline for the objective with minimum actions, skip flavor text, and take the shortest visible path. You judge a game by how legible the critical path is at speed and you report every second wasted on ambiguity."
- `breaker.md`: "You are the BREAKER. You actively try to break the game: repeat actions, do things out of order, backtrack at odd times, try obviously wrong tools, revisit finished content. You judge a game by how gracefully it resists abuse, and your report leads with what you tried to break and what cracked."
- `casual.md`: "You are the CASUAL player. You skim, you miss non-obvious hints, you never re-read, and you quit mentally the second you feel lost. You judge a game by whether a distracted commuter could finish it, and you report the exact moment your attention slipped."
- `lore-reader.md`: "You are the LORE READER. You read every word, cross-reference names and places, and expect the fiction to stay consistent. You judge a game by narrative coherence and you report every contradiction, tone break, or dangling reference."
- `default.md`: empty file body (a comment line only: `<!-- default persona: no overlay; preserves the locked prompt byte-for-byte -->`).

`fill-prompt.mjs`:
```js
// exports: export function fillPrompt(template, { startInstruction, seed, persona }) → string
// replaces {{START_INSTRUCTION}}, __SEED__, and the line containing {{PERSONA}}:
//   persona text non-empty → substitute it (trimmed + trailing newline)
//   persona empty → remove the {{PERSONA}} line entirely (no blank residue)
// CLI: node fill-prompt.mjs <promptFile> --seed N --start-instruction "…" [--persona-file path]  → stdout
// entry-guarded like blind-launch.mjs so the export is testable.
```
`run.sh` change: add `--persona NAME` (default `default`; env `BLIND_PERSONA` honored), locate `blind-tester/personas/$NAME.md` (error clearly if missing), and build `PROMPT` via `"$NODE_CMD" fill-prompt.mjs …` instead of the current `sed` pipeline. Everything else in run.sh stays untouched.

- [ ] **Step 1: Failing test** (`tests/unit/fleet_args.test.ts`, first describe):

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// vitest can import .mjs fine:
import { fillPrompt } from "../../blind-tester/fill-prompt.mjs";

describe("fill-prompt", () => {
  const template = "Intro.\n{{PERSONA}}\nRules __SEED__.\nGo: {{START_INSTRUCTION}}\n";
  it("substitutes all three placeholders", () => {
    const out = fillPrompt(template, { startInstruction: "start overworld", seed: 42, persona: "You are the BREAKER." });
    expect(out).toContain("You are the BREAKER.");
    expect(out).toContain("Rules 42.");
    expect(out).toContain("Go: start overworld");
    expect(out).not.toMatch(/\{\{|__SEED__/);
  });
  it("empty persona leaves zero residue — byte-compatible with the pre-persona prompt", () => {
    const out = fillPrompt(template, { startInstruction: "x", seed: 1, persona: "" });
    expect(out).toBe("Intro.\nRules 1.\nGo: x\n");
  });
  it("real prompts contain exactly one persona slot each", () => {
    for (const p of ["blind-tester/prompt.md", "blind-tester/prompt-overworld.md"])
      expect(readFileSync(p, "utf8").match(/\{\{PERSONA\}\}/g)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: FAIL → implement → PASS.**
- [ ] **Step 3:** eyeball each persona file against the leak rule (no quest names, no scene ids, no mechanics).
- [ ] **Step 4: Byte-compat proof:** temporarily reconstruct today's sed output for `prompt-overworld.md` seed 7 (git stash the prompt edits, run old sed fill, save; unstash; run `fill-prompt` with default persona) and `diff` them → identical. Paste the diff output (empty) into the commit body.
- [ ] **Step 5: Commit** — `npm run format && git add -A && git commit -m "feat(blind): persona overlays with calibration anchors, node prompt filler"`

---

### Task 12: Fleet orchestrator (blind-tester/fleet.mjs, npm run fleet)

**Files:**
- Create: `blind-tester/fleet.mjs`
- Modify: `package.json` (`"fleet": "node blind-tester/fleet.mjs"`, `"fleet:mock": "node blind-tester/fleet.mjs --mock"`)
- Test: `tests/unit/fleet_args.test.ts` (second describe — pure planning fns)

**Interfaces (exported pure fns for tests; entry-guarded main like blind-launch.mjs):**

```js
export function parseFleetArgs(argv) → {
  count: 100, concurrency: 4, model: "haiku", personas: "mixed",   // or a single persona name
  target: "overworld",                 // or "quest:<id>"
  seedBase: 1000, mock: false, label: null, maxRetries: 2, out: null,
  modelMix: [{ model: "haiku", weight: 9 }, { model: "sonnet", weight: 1 }],  // when --model mix
}
export function planFleetRuns(opts) → Array<{ seed, persona, model, target }>
//  seed = seedBase + i; persona rotates ["explorer","speedrunner","breaker","casual","lore-reader"][i % 5] when personas==="mixed";
//  model: fixed alias, or with "mix": deterministic by index (i % 10 === 9 → stronger slice). NO temperature/top_p flags exist on the
//  claude CLI invocation in run.sh — persona × model × seed × target IS the diversity mechanism (verified; do not invent flags).
export function reportPathFor(reportsDir, stamp, target, seed) → path   // matches ledger regex ^(\d{8}T\d{6}Z)_(.+)_seed(-?\d+)\.md$
```

Main-loop behavior:
- Reports land in `blind-tester/reports/` (the canonical dir the assessor + ledger scan) unless `--out` overrides. Fleet metadata: `ai-runs/fleet/<label-or-stamp>/manifest.jsonl`, one row per run `{ seed, persona, model, target, report, status: "verified"|"failed"|"skipped-resume", attempts, exit }` (append as runs finish; also a final `summary.json`).
- Per run: spawn Git-Bash `run.sh` exactly like `blind-launch.mjs` does (reuse its bash-resolution logic — import the helpers if exported, else copy the function with a comment pointing at the source), passing `--seed N --model M --persona P --out <reportsDir>/<stamp>_<sourceSlug>_seed<N>` plus `--overworld` or `--quest <id>`. In `--mock` mode set `BLIND_AGENT_CMD="node <abs path>/mock-agent.mjs"` in the child env (zero tokens; run.sh's BLIND_AGENT_CMD path then verifies the report exactly like a live run).
- **Verified = run.sh exit 0** (its last step is the verifier). Belt-and-braces: after exit 0, re-verify via `npm --silent exec tsx -- scripts/verify-blind-report.ts <report>` and only then mark `verified`.
- Concurrency: promise pool of size `concurrency`; **pacing/backoff**: on nonzero exit, retry up to `maxRetries` with delay `20s × 2^attempt` (live mode); in `--mock` mode delays are 0 (CI speed). A retry reuses the same seed/persona.
- **Resume:** before launching a run, if its report file already exists AND passes the verifier → status `skipped-resume`, no relaunch.
- Exit code: 0 iff `verified + skipped-resume === count`.

- [ ] **Step 1: Failing tests** (append to `tests/unit/fleet_args.test.ts`):

```ts
import { parseFleetArgs, planFleetRuns, reportPathFor } from "../../blind-tester/fleet.mjs";

describe("fleet planning", () => {
  it("rotates personas deterministically and honors seed base", () => {
    const runs = planFleetRuns(parseFleetArgs(["--count", "7", "--personas", "mixed", "--seed-base", "100"]));
    expect(runs.map(r => r.seed)).toEqual([100, 101, 102, 103, 104, 105, 106]);
    expect(runs[0].persona).toBe("explorer");
    expect(runs[5].persona).toBe("explorer");   // 5 % 5 wraps
    expect(new Set(runs.map(r => r.persona)).size).toBe(5);
  });
  it("quest targets parse and reach the plan", () => {
    const runs = planFleetRuns(parseFleetArgs(["--count", "2", "--target", "quest:sunken_barrow"]));
    expect(runs.every(r => r.target === "quest:sunken_barrow")).toBe(true);
  });
  it("report filenames match the ledger regex", () => {
    const p = reportPathFor("blind-tester/reports", "20260709T010203Z", "overworld", 12);
    expect(p.replace(/\\/g, "/").split("/").pop()).toMatch(/^\d{8}T\d{6}Z_.+_seed-?\d+\.md$/);
  });
});
```

- [ ] **Step 2: FAIL → implement → PASS.** — [ ] **Step 3:** `npm run lint && npm run format:check` (blind-tester is in both globs).
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(fleet): N-agent blind fleet runner with resume, pacing, manifest"`

---

### Task 13: Deterministic mock agent + fleet:mock e2e (zero tokens, CI-safe)

**Files:**
- Create: `blind-tester/mock-agent.mjs`
- Test: `tests/acceptance/fleet_mock_pipeline.test.ts` (fleet:mock leg; the compiler leg extends it in Task 16)

Mock agent contract (this is what makes the whole pipeline testable in CI — the repo rule "CI uses deterministic mocks"):
- Runs under run.sh's `BLIND_AGENT_CMD` seam: prompt arrives on **stdin**; env gives `BLIND_MCP_CONFIG` (path to the mcp.json run.sh wrote), `BLIND_SEED`, `BLIND_QUEST_ID` (empty for overworld). Stdout becomes the report (`$OUT.md`) and must pass `verifyBlindReportText`.
- **Plays the real MCP surface**: parse `BLIND_MCP_CONFIG`, connect with `@modelcontextprotocol/sdk` `StdioClientTransport` exactly like `blind-tester/smoke.mjs` does (read smoke.mjs first; reuse its connection pattern). Overworld: `start_overworld`, then 10 deterministic actions (travel/explore picked by seeded PRNG — inline a mulberry32 copy in the .mjs with a comment pointing at `src/core/rng.ts`). Quest target: `start_world_quest` + `step_action` on the first legal action 10 times. Record tool names called + observation gists for the Playthrough log.
- **Synthetic findings, seeded + controllable** (defaults; overridable via env `MOCK_PLAN` = path to a JSON with the same shape, for tests):
  - seed % 2 === 0 → bug `{ where: "Albany Station Quarter", severity: "S3", note: "notice board wording is confusing about where the quest actually starts" }` (the PLANTED OVERLAP — the compiler e2e asserts this becomes hot spot #1)
  - seed % 3 === 0 → bug `{ where: "road to Colonie", severity: "S2", note: "road encounter text repeats itself on back-to-back trips" }`
  - always → one unique noise bug `{ where: "seed-${seed} corner", severity: "S1", note: "minor wording nit unique to seed ${seed}" }` EXCEPT when seed % 7 === 0 → NO bugs and NO confusions (exercises sycophancy telemetry; the report then lists three tried-and-failed break attempts per the calibration rule)
  - clarity = 2 + (seed % 3), enjoyment = 2 + ((seed >> 1) % 3), got_stuck = seed % 5 === 0, would_replay = seed % 2 === 1
- Report skeleton: sections 1–7 exactly as the locked prompts demand (Playthrough log / mechanically / clarity+enjoyment / confusions / bugs / Verdict ≥20 chars / fenced ```json exit-interview``` block matching `ExitInterviewSchema` strictly — integers, `.strict()`, non-empty `best_moment`/`worst_moment`).

- [ ] **Step 1: Failing e2e test** (`tests/acceptance/fleet_mock_pipeline.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyBlindReportText } from "../../src/blind/report_verifier.js";
import { extractExitInterview } from "../../src/blind/exit_interview.js";

describe("fleet:mock end to end (zero tokens)", () => {
  it("produces N verifier-passing reports with planted overlap", () => {
    const out = mkdtempSync(join(tmpdir(), "fleet-mock-"));
    execFileSync("node", ["blind-tester/fleet.mjs", "--mock", "--count", "4", "--concurrency", "2",
      "--seed-base", "100", "--out", out, "--label", "citest"], { stdio: "pipe", timeout: 240_000 });
    const reports = readdirSync(out).filter(f => f.endsWith(".md"));
    expect(reports).toHaveLength(4);
    let overlap = 0;
    for (const f of reports) {
      const text = readFileSync(join(out, f), "utf8");
      const v = verifyBlindReportText(text);
      expect(v.ok, `${f}: ${(v as { reason?: string }).reason ?? ""}`).toBe(true);
      const i = extractExitInterview(text);
      if (i.ok && i.interview.bugs.some(b => b.where.includes("Albany Station Quarter"))) overlap += 1;
    }
    expect(overlap).toBe(2);   // seeds 100,102 of 100..103
  }, 300_000);
});
```
(Uses `--out` tmp dir so CI never pollutes `blind-tester/reports/`. 4 runs × MCP-server boot ≈ well under the 300s cap; vitest per-test timeout override is the third `it` argument.)
- [ ] **Step 2: FAIL → implement mock-agent.mjs → PASS locally.** Debug tip: run one directly — `BLIND_AGENT_CMD="node blind-tester/mock-agent.mjs" bash blind-tester/run.sh --overworld --seed 100 --persona breaker`.
- [ ] **Step 3: Checkpoint (Phase 3 gate):** `npm run fleet:mock -- --count 20 --concurrency 4 --seed-base 200 --label mock20` → 20/20 verified (manifest says so); spot-open one report. **Record the wall time.**
- [ ] **Step 4: Live smoke attempt (honesty rule):** `npm run fleet -- --count 2 --model haiku --seed-base 900 --label live-smoke`. Nested `claude -p` inside a Claude Code session historically 401s; if it fails, capture the exact error into the task notes and REPORT IT AS NOT RUN — never fabricate. (A later plain-shell run can validate live mode.)
- [ ] **Step 5: Commit** — `npm run format && git add -A && git commit -m "feat(fleet): deterministic MCP mock agent and zero-token fleet:mock lane"`

---

### Task 14: Feedback schema + location normalization (src/feedback/schema.ts, normalize.ts)

**Files:**
- Create: `src/feedback/schema.ts`, `src/feedback/normalize.ts`
- Test: `tests/unit/feedback_normalize.test.ts`

**Interfaces:**

```ts
// src/feedback/schema.ts   (ALL .strict(); version the file format)
export const HOTSPOTS_VERSION = 1;
export const FixLayerSchema = z.enum(["content","hint_text","quest_structure","engine_rule","validator","test"]);
export const FeedbackSourceSchema = z.enum(["crawler","fleet"]);
export const CanonicalLocationSchema = z.object({
  kind: z.enum(["quest","overworld","unmapped"]),
  questId: z.string().nullable(), region: z.string().nullable(),
  node: z.string().nullable(), sceneId: z.string().nullable(),
  raw: z.array(z.string()).min(1),
}).strict();
export const HotspotSchema = z.object({
  id: z.string().min(1),                     // shortHash of cluster fingerprint — STABLE across compiles
  title: z.string().min(1),                  // deterministic: `<top 4 tokens> @ <location label>`
  location: CanonicalLocationSchema,
  severity_band: z.enum(["minor","moderate","severe"]),   // S0–S1 | S2 | S3–S4
  max_severity: z.enum(["S0","S1","S2","S3","S4"]),
  count: z.number().int().positive(),
  sources: z.array(FeedbackSourceSchema).min(1),
  personas: z.array(z.string()),
  score: z.number().positive(),
  fix_layer: FixLayerSchema,
  evidence: z.array(z.object({ source: FeedbackSourceSchema, ref: z.string(), excerpt: z.string().max(300) }).strict()).min(1).max(5),
  trend: z.enum(["new","improved","regressed","flat"]),
  prev_score: z.number().nullable(),
}).strict();
export const TargetMetricsSchema = z.object({
  target: z.string(), reports: z.number().int().nonnegative(),
  clarity: z.object({ mean: z.number(), stddev: z.number(), histogram: z.array(z.number().int()).length(5) }).strict(),
  enjoyment: z.object({ mean: z.number(), stddev: z.number(), histogram: z.array(z.number().int()).length(5) }).strict(),
  got_stuck_rate: z.number(), would_replay_rate: z.number(),
  by_persona: z.record(z.object({ reports: z.number().int(), clarity_mean: z.number(), enjoyment_mean: z.number(), zero_negative_rate: z.number() }).strict()),
}).strict();
export const SycophancyTelemetrySchema = z.object({
  reports: z.number().int(), zero_negative_rate: z.number(),
  clarity_histogram: z.array(z.number().int()).length(5), enjoyment_histogram: z.array(z.number().int()).length(5),
  by_persona_zero_negative: z.record(z.number()),
}).strict();
export const HotspotsFileSchema = z.object({
  version: z.literal(HOTSPOTS_VERSION), generated_at: z.string(), commit: z.string(),
  inputs: z.object({ report_dirs: z.array(z.string()), crawl_files: z.array(z.string()),
    verified_reports: z.number().int(), rejected_reports: z.number().int(), crawl_findings: z.number().int() }).strict(),
  metrics: z.array(TargetMetricsSchema), sycophancy: SycophancyTelemetrySchema,
  hotspots: z.array(HotspotSchema),
  recommended_next_fix: z.object({ hotspot_id: z.string(), rationale: z.string().min(1) }).strict().nullable(),
}).strict();
export type HotspotsFile = z.infer<typeof HotspotsFileSchema>;  // + export the other inferred types

// src/feedback/normalize.ts
export type LocationIndex = { /* opaque: maps of ids and lowercase names for regions, nodes, areas, quests, and per-quest room ids+titles */ };
export function buildLocationIndex(root: string): LocationIndex;   // overworld manifest + every shipped pack (compile once, cache none — callers hold it)
export function canonicalizeLocation(raw: string, idx: LocationIndex): CanonicalLocation;
```

`canonicalizeLocation` resolution ladder (conservative — unmappable stays `kind:"unmapped"`, NEVER force):
1. exact id hit (questId, node id, region id, room/scene id) after lowercasing/trimming;
2. exact name hit (node names, region names, area names, quest titles, room titles) as whole-phrase substring of `raw`;
3. unique-prefix / single-candidate fuzzy: a name whose token set is fully contained in raw's token set AND is the ONLY such candidate;
4. else `unmapped` with `raw` preserved.
A quest-room hit sets `kind:"quest"`, `questId` + `sceneId`; a node/area hit sets `kind:"overworld"`, `node` (+ `region` from the node's region name).

- [ ] **Step 1: Failing test** (`tests/unit/feedback_normalize.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { buildLocationIndex, canonicalizeLocation } from "../../src/feedback/normalize.js";

const idx = buildLocationIndex(process.cwd());
const c = (raw: string) => canonicalizeLocation(raw, idx);

describe("location normalization", () => {
  it("maps exact ids", () => {
    expect(c("albany_city")).toMatchObject({ kind: "overworld", node: "albany_city" });
    expect(c("sunken_barrow")).toMatchObject({ kind: "quest", questId: "sunken_barrow" });
  });
  it("maps names conservatively", () => {
    expect(c("the notice board in Albany")).toMatchObject({ kind: "overworld" });   // "Albany" prefix-unique in node names? if not unique it must be unmapped — assert what is TRUE after inspecting the manifest
  });
  it("refuses to force a match", () => {
    expect(c("somewhere vaguely damp")).toMatchObject({ kind: "unmapped" });
    expect(c("")).toMatchObject({ kind: "unmapped" });
  });
  it("quest scene ids resolve to quest+scene", () => {
    expect(c("barrow_mouth")).toMatchObject({ kind: "quest", questId: "sunken_barrow", sceneId: "barrow_mouth" });
  });
});
```
(Before finalizing assertions, inspect the manifest: if "Albany" matches multiple node names (`albany_city`, …), the conservative ladder must return the unique-candidate rule's result or `unmapped` — write the assertion to match the RULE, not a hoped-for outcome.)
- [ ] **Step 2: FAIL → implement → PASS.**
- [ ] **Step 3: Commit** — `npm run format && git add -A && git commit -m "feat(feedback): hotspots schema and conservative location canonicalization"`

---

### Task 15: Deterministic clustering + ranking + experience metrics

**Files:**
- Create: `src/feedback/cluster.ts`, `src/feedback/rank.ts`, `src/feedback/metrics.ts`
- Test: `tests/unit/feedback_cluster.test.ts`, `tests/unit/feedback_rank.test.ts`, `tests/unit/feedback_metrics.test.ts`

**Interfaces:**

```ts
// src/feedback/cluster.ts     — NO LLM anywhere in this path
export type IssueRecord = {
  source: "crawler" | "fleet"; ref: string;               // report filename / findings.jsonl row ref
  location: CanonicalLocation; severity: "S0"|"S1"|"S2"|"S3"|"S4";
  text: string; persona: string | null; target: string;   // "overworld" | "quest:<id>"
};
export type IssueCluster = { key: string; issues: IssueRecord[]; tokens: string[]; location: CanonicalLocation;
  maxSeverity: "S0"|"S1"|"S2"|"S3"|"S4"; severityBand: "minor"|"moderate"|"severe"; sources: ("crawler"|"fleet")[]; personas: string[] };
export function tokenizeIssue(text: string): string[];    // lowercase → strip punct → drop stopwords (fixed ~40-word list) → crude stem (trailing "ing","ed","es","s") → dedupe → sort
export function jaccard(a: readonly string[], b: readonly string[]): number;
export function clusterIssues(issues: IssueRecord[]): IssueCluster[];
// algorithm (deterministic): sort issues by (locationKey, severity, normalized text, ref);
// pass 1: exact fingerprint buckets on (locationKey, severityBand, first 6 tokens);
// pass 2: merge buckets sharing locationKey when jaccard(tokens) >= 0.5 — iterate to fixpoint, always merging the
// lexicographically-smaller key into the larger cluster so order of input never changes the result.
export const JACCARD_MERGE_THRESHOLD = 0.5;

// src/feedback/rank.ts
export const SEVERITY_WEIGHT = { S0: 1, S1: 2, S2: 4, S3: 8, S4: 16 } as const;  // S4≈16×S0 per protocol polarity (S4=blocking)
export const BOTH_SOURCES_BONUS = 2;                                              // crawler+fleet agreement = strongest signal
export function scoreCluster(c: IssueCluster): number;   // c.issues.length × SEVERITY_WEIGHT[c.maxSeverity] × (both sources ? 2 : 1)
export function suggestFixLayer(c: IssueCluster): FixLayer;
// crawler-origin: CRASH/INTEGRITY/DESYNC/PERSIST/LEGALITY→engine_rule, SOFTLOCK/WORLD→quest_structure, RENDER→content
//   (crawler IssueRecord.text is prefixed "CODE: message" by the compiler — parse the code prefix)
// fleet-origin keyword ladder on tokens: stuck|lost|hint|unclear|confus→hint_text; softlock|block|cannot|impossible→quest_structure;
//   typo|wording|text|prose|repeat→content; crash|error|reject→engine_rule; default→content
export function recommendNextFix(ranked: IssueCluster[]): { hotspot_id: string; rationale: string } | null;  // = top hotspot; rationale cites count/severity/sources

// src/feedback/metrics.ts
export function targetMetrics(interviews: Array<{ target: string; persona: string | null; interview: ExitInterview }>): TargetMetrics[];
export function sycophancyTelemetry(interviews: Array<{ persona: string | null; interview: ExitInterview }>): SycophancyTelemetry;
// zero_negative = interview.bugs.length === 0 && interview.confusions.length === 0
```

- [ ] **Step 1: Failing tests** — write all three files' tests up front:

```ts
// tests/unit/feedback_cluster.test.ts
import { describe, expect, it } from "vitest";
import { clusterIssues, jaccard, tokenizeIssue } from "../../src/feedback/cluster.js";
const loc = { kind: "overworld" as const, questId: null, region: null, node: "albany_city", sceneId: null, raw: ["Albany"] };
const issue = (text: string, over: object = {}) => ({ source: "fleet" as const, ref: "r", location: loc,
  severity: "S3" as const, text, persona: null, target: "overworld", ...over });

describe("clustering", () => {
  it("tokenize stems and drops stopwords deterministically", () => {
    expect(tokenizeIssue("The notice boards were confusing!")).toEqual(tokenizeIssue("notice board confusing"));
  });
  it("jaccard basics", () => { expect(jaccard(["a","b"], ["a","b"])).toBe(1); expect(jaccard(["a"], ["b"])).toBe(0); });
  it("same-location near-duplicates merge; different locations never do", () => {
    const a = issue("notice board wording is confusing about the quest start");
    const b = issue("the notice board is confusing — where does the quest start?");
    const c = issue("notice board confusing", { location: { ...loc, node: "troy_city" } });
    const clusters = clusterIssues([a, b, c]);
    expect(clusters).toHaveLength(2);
    expect(Math.max(...clusters.map(x => x.issues.length))).toBe(2);
  });
  it("input order never changes the clustering", () => {
    const items = [issue("board confusing start"), issue("confusing board quest start"), issue("music too loud")];
    const keyset = (xs: ReturnType<typeof clusterIssues>) => xs.map(c => c.key).sort();
    expect(keyset(clusterIssues(items))).toEqual(keyset(clusterIssues([...items].reverse())));
  });
});

// tests/unit/feedback_rank.test.ts
import { describe, expect, it } from "vitest";
import { BOTH_SOURCES_BONUS, SEVERITY_WEIGHT, scoreCluster, suggestFixLayer } from "../../src/feedback/rank.js";
const cluster = (n: number, sev: "S0"|"S4", sources: ("crawler"|"fleet")[]) => ({ key: "k", issues: Array(n).fill(0),
  tokens: [], location: { kind: "unmapped", questId: null, region: null, node: null, sceneId: null, raw: ["x"] },
  maxSeverity: sev, severityBand: sev === "S4" ? "severe" : "minor", sources, personas: [] }) as never;

describe("ranking", () => {
  it("S4 outweighs S0 sixteenfold", () => { expect(SEVERITY_WEIGHT.S4 / SEVERITY_WEIGHT.S0).toBe(16); });
  it("score = count × severity × diversity", () => {
    expect(scoreCluster(cluster(3, "S4", ["fleet"]))).toBe(3 * 16);
    expect(scoreCluster(cluster(3, "S4", ["fleet", "crawler"]))).toBe(3 * 16 * BOTH_SOURCES_BONUS);
  });
  it("fix layers route by origin and keywords", () => {
    expect(suggestFixLayer({ ...cluster(1, "S4", ["crawler"]), tokens: [], issues: [{ text: "CRASH: step threw" }] } as never)).toBe("engine_rule");
    expect(suggestFixLayer({ ...cluster(1, "S0", ["fleet"]), tokens: ["hint", "unclear"], issues: [{ text: "unclear hint" }] } as never)).toBe("hint_text");
  });
});

// tests/unit/feedback_metrics.test.ts
import { describe, expect, it } from "vitest";
import { sycophancyTelemetry, targetMetrics } from "../../src/feedback/metrics.js";
const iv = (clarity: number, bugs: number, conf: number, persona = "casual") => ({ target: "overworld", persona,
  interview: { clarity, enjoyment: 3, goal_understood: true, got_stuck: false, confusions: Array(conf).fill("c"),
    bugs: Array(bugs).fill({ where: "w", severity: "S2", note: "n" }), best_moment: "b", worst_moment: "w",
    would_replay: true, verdict: "long enough verdict text" } });

describe("metrics + sycophancy", () => {
  it("histograms and rates", () => {
    const m = targetMetrics([iv(5, 0, 0), iv(3, 1, 0), iv(1, 2, 2)]);
    expect(m[0].reports).toBe(3);
    expect(m[0].clarity.histogram).toEqual([1, 0, 1, 0, 1]);
  });
  it("zero-negative rate measures sycophancy without censoring", () => {
    const s = sycophancyTelemetry([iv(5, 0, 0), iv(4, 1, 0)]);
    expect(s.zero_negative_rate).toBe(0.5);
  });
});
```

- [ ] **Step 2: FAIL → implement all three modules → PASS.**
- [ ] **Step 3: Commit** — `npm run format && git add -A && git commit -m "feat(feedback): deterministic clustering, severity-weighted ranking, sycophancy telemetry"`

---

### Task 16: Compiler orchestration + trends + hotspots.md + CLI (Phase 4 checkpoint)

**Files:**
- Create: `src/feedback/trends.ts`, `src/feedback/compile.ts`, `bin/feedback.ts`
- Modify: `package.json` (`"feedback:compile": "tsx bin/feedback.ts"`), `tests/acceptance/fleet_mock_pipeline.test.ts` (extend with the compiler leg)
- Test: `tests/unit/feedback_trends.test.ts`, `tests/unit/feedback_compile.test.ts`

**Interfaces:**

```ts
// src/feedback/trends.ts
export function loadPreviousHotspots(feedbackRoot: string, beforeDir: string | null): HotspotsFile | null;
//   scans ai-runs/feedback/*/hotspots.json, picks newest dir name lexicographically before `beforeDir` (dir names are UTC stamps)
export function applyTrends(current: Hotspot[], previous: HotspotsFile | null): Hotspot[];
//   match on Hotspot.id; score < prev × 0.8 → "improved"; > prev × 1.25 → "regressed"; missing → "new"; else "flat"; prev_score filled

// src/feedback/compile.ts
export type CompileOptions = { root: string; inputs: string[]; outDir: string; topK: number; llmLabels: boolean };
export function collectInputs(root: string, inputs: string[]): { interviews: …[]; crawlFindings: CrawlFinding[];
  verified: number; rejected: number; reportDirs: string[]; crawlFiles: string[] };
//   dir input → *.md files: verifyBlindReportText gate (rejected counted, EXCLUDED); persona/target/seed from a sibling
//   manifest.jsonl when present (fleet), else parsed from the ledger filename regex (target=source slug), persona=null.
//   .jsonl input → CrawlFindingSchema.parse per row; ORPHAN rows are coverage, not issues — excluded from clustering.
export function compileFeedback(opts: CompileOptions): { file: HotspotsFile; jsonPath: string; mdPath: string };
//   pipeline: collect → IssueRecords (fleet: one per interview bug + one per confusion at S1; crawler: one per finding,
//   text = `${code}: ${message}`) → canonicalize locations → cluster → rank → topK hotspots → metrics + sycophancy →
//   trends vs previous compile → recommended_next_fix → validate with HotspotsFileSchema.parse → write hotspots.json
//   (canonicalize()d) + hotspots.md. llmLabels=true may ONLY rewrite Hotspot.title via an external call — membership,
//   ordering, ids, scores untouched; DEFAULT OFF and NOT implemented beyond the flag guard + doc note (YAGNI until wanted).

// bin/feedback.ts — flags: --in <path> (repeatable, file or dir), --out <dir> (default ai-runs/feedback/<UTC stamp>),
//   --top K (default 10), --llm-labels (accepted, prints "labels pass skipped (not configured)" and proceeds deterministic)
//   default --in when omitted: blind-tester/reports + newest ai-runs/crawl/*/findings.jsonl if present
```

`hotspots.md` layout (human report): header (inputs, verified/rejected counts, commit) → sycophancy block (rates + histograms, per-persona zero-negative) → per-target experience table → "Top K hot spots" — for each: rank, title, score breakdown (`count × sev × diversity`), trend arrow, location, fix layer, up to 3 evidence excerpts with refs → final section "Recommended next fix" (exactly ONE, with rationale).

- [ ] **Step 1: Failing unit tests** — `feedback_trends.test.ts` (id-matched diff produces improved/regressed/new/flat on hand-built fixtures) and `feedback_compile.test.ts` (build a tmp dir with 3 tiny hand-written verifier-passing report fixtures — copy a real passing report skeleton — plus a 2-row crawl findings.jsonl fixture; assert: rejected report excluded, crawler+fleet overlap cluster gets BOTH_SOURCES_BONUS, hotspots.json parses under the schema, hotspots.md contains "Recommended next fix"). Write the fixtures as template strings inside the test file.
- [ ] **Step 2: FAIL → implement → PASS.**
- [ ] **Step 3: Extend the acceptance e2e** (`fleet_mock_pipeline.test.ts`) with the compiler leg:

```ts
  it("compiles mock reports + crawl findings into ranked hotspots with the planted overlap on top", () => {
    // reuse the tmp report dir from the previous test via a module-level variable, or regenerate --count 6
    const out2 = mkdtempSync(join(tmpdir(), "hotspots-"));
    execFileSync("npx", ["tsx", "bin/feedback.ts", "--in", reportsDir, "--out", out2, "--top", "5"], { stdio: "pipe", timeout: 120_000 });
    const hs = JSON.parse(readFileSync(join(out2, "hotspots.json"), "utf8"));
    expect(hs.hotspots[0].title).toMatch(/notice board|albany station/i);         // planted overlap ranks #1
    expect(hs.recommended_next_fix.hotspot_id).toBe(hs.hotspots[0].id);
    expect(hs.sycophancy.reports).toBeGreaterThan(0);
    // second compile with the SAME inputs → all trends flat, and prev linkage works
    const out3 = mkdtempSync(join(tmpdir(), "hotspots2-"));
    execFileSync("npx", ["tsx", "bin/feedback.ts", "--in", reportsDir, "--out", out3], { stdio: "pipe", timeout: 120_000 });
    // trends read ai-runs/feedback/ by default — pass the previous dir explicitly instead: implement --prev <dir> for testability
  });
```
(Design note surfaced by the test: `--prev <dir>` flag on bin/feedback.ts overrides the auto-scan so tests control trend inputs; auto-scan of `ai-runs/feedback/` stays the default.)
- [ ] **Step 4: Phase-4 checkpoint, run for real:** compile the 20 mock reports from Task 13 plus a real `ai-runs/crawl/<ts>/findings.jsonl`: `npm run feedback:compile -- --in blind-tester/reports --in ai-runs/crawl/<ts>/findings.jsonl` → open `hotspots.md`; the planted "Albany Station Quarter" overlap must be hot spot #1; run a second compile and confirm the trend column. **Paste the top-3 table into the task notes.**
- [ ] **Step 5: Commit** — `npm run format && git add -A && git commit -m "feat(feedback): compiler with trends, hotspots.{json,md}, feedback:compile CLI"`

---

### Task 17: Assessor consumes hotspots.json

**Files:**
- Modify: `src/afk/assessor.ts` (new candidate block), `src/ai-loop.ts` only if imports need re-export (expect none)
- Test: `tests/unit/assessor_hotspots.test.ts`

Integration point (surveyed): `assess(root)` in `src/afk/assessor.ts` pushes `ImprovementCandidate`s from ~8 signal blocks, then sorts by `score desc → blind-report recency → id`. Add a NEW block immediately before the final sort:

```ts
// hotspot-driven candidates: latest compiled feedback is a PRIMARY ranking input when present
const hotspots = readLatestHotspots(root);            // ai-runs/feedback/<newest stamp>/hotspots.json, schema-validated; null if none/invalid
for (const h of (hotspots?.hotspots ?? []).slice(0, 3)) {
  const target = h.location.questId ?? (h.location.kind === "overworld" ? "overworld" : null);
  if (!target) continue;                              // unmapped hot spots don't nominate targets
  candidates.push({
    id: `hotspot-${h.id}`,
    category: h.fix_layer === "engine_rule" || h.fix_layer === "validator" || h.fix_layer === "test" ? "engine" : "content_fix",
    // impact scaled from the hot spot score, clamped to the assessor's existing impact range; effort per fix_layer table
    …score(impactFromHotspot(h), effortFor(h.fix_layer), category)…,
    rationale: `hot spot #${rank}: ${h.title} (count ${h.count}, ${h.max_severity}, sources ${h.sources.join("+")})`,
  });
}
```
READ the actual `ImprovementCandidate` shape + `score(...)` helper in `src/afk/assessment_model.ts` first and conform exactly — the sketch above names the intent, the file dictates the fields. `readLatestHotspots` lives in `src/feedback/compile.ts` (export it) so the schema stays in one place. Malformed/missing file ⇒ `null` ⇒ assess() behaves exactly as today (prove with a test).

- [ ] **Step 1: Failing test** (`tests/unit/assessor_hotspots.test.ts`): build a tmp root with a minimal `ai-runs/feedback/20260709T000000Z/hotspots.json` fixture (schema-valid, one S4 quest-located hot spot). Call `assess(tmpRoot)` — the existing test file `tests/unit/assessor.test.ts` shows how assess() is driven against a fixture root; mirror its setup. Assert: a candidate with id prefix `hotspot-` exists and outranks the default playtest-rotation stubs; with NO feedback dir, assess() output contains no `hotspot-` candidates (baseline preserved).
- [ ] **Step 2: FAIL → implement → PASS**, then `npx vitest run tests/unit/assessor.test.ts tests/unit/ai_loop.test.ts` (no collateral).
- [ ] **Step 3: Live checkpoint (Phase 5 gate, part 1):** with the Task-16 compile present, run `npm run assess` → the printed backlog shows the hotspot candidate(s) ranked with visible rationale; then `npm run ai:loop` → emitted `ai-runs/<id>/assessment.md` cites the hot spot. **Paste the top of the backlog into task notes.**
- [ ] **Step 4: Commit** — `npm run format && git add -A && git commit -m "feat(afk): assessor consumes compiled hotspots as a primary ranking input"`

---

### Task 18: Loop, docs, CI integration (Deliverable D)

**Files:**
- Create: `docs/testing_pyramid.md`
- Modify: `AGENTS.md`, `docs/afk_loop.md`, `docs/blind_playtest_protocol.md`, `blind-tester/README.md`, `README.md`, `loop.sh`, `.github/workflows/ci.yml`, `tests/regression/docs_trust_but_verify_coherence.test.ts`, `tests/regression/agents_trust_but_verify_coherence.test.ts`
- Test: the two coherence regression tests (updated pins) + `npm run health`

**18a — `docs/testing_pyramid.md`** (new canonical doc, ≤ ~150 lines). Sections:
1. **The pyramid** — Tier 0: vitest + validators + exhaustive solver (existing "dev tests"); Tier 1: mechanical crawler (`crawl:smoke` every cycle, `crawl:deep` nightly/manual); Tier 2: blind LLM playtests (single per cycle; `fleet` for milestone/harvest cycles; `fleet:mock` in CI); Tier 3: `feedback:compile` → `hotspots.{json,md}` → assessor. One ASCII diagram of the data flow.
2. **When each runs + budgets** — table: lane / trigger / budget / cost (crawl:smoke ≤~30s free; crawl:deep ≥2min nightly free; single blind per cycle ~$; fleet N× on demand; fleet:mock CI zero tokens; compile whenever ≥3 new verified reports exist since the last compile).
3. **Exact commands** — every npm script with its main flags, copy-paste runnable.
4. **Schemas** — finding JSONL row shape, hotspots.json top-level shape, where the zod sources live (`src/crawl/findings.ts`, `src/feedback/schema.ts`), severity polarity S0 cosmetic → S4 blocking, fix-layer taxonomy.
5. **How findings become fixes** — crawler finding → minimized trace → `traces/bugs/` artifact + regression; fleet interview → compile → hot spot → assessor candidate → ONE fix per cycle; trend check on the next compile proves movement.

**18b — `AGENTS.md`**: replace the 5-step loop list with (keep it terse — it's a charter):

```
1. **Assess** — `npm run ai:loop` ranks the next-best improvement (compiled hot spots, when present, are a primary input).
2. **Crawl gate (pre)** — `npm run crawl:smoke` must be green before touching anything.
3. **One change** — make a single focused improvement (engine, content, or tooling).
4. **Crawl gate (post)** — `npm run crawl:smoke` again; a new finding is YOUR regression.
5. **Blind playtest** — one fresh blind agent per normal cycle (protocol: docs/blind_playtest_protocol.md). Milestone
   or feedback-harvest cycles (every ~10 cycles, or when the ledger's open questions outgrow single reports) run
   `npm run fleet -- --count N` instead.
6. **Compile feedback** — when ≥3 new verified reports exist since the last compile: `npm run feedback:compile`;
   triage from `hotspots.md`.
7. **Verify** — `npm run health` must pass; no playtest report ⇒ no commit.
8. **Commit** — one green increment, terse note in `AI_LOOP_STATE.md`.
```
Also add one line under Verification Bar: "`npm run crawl:smoke` is the mechanical gate (docs/testing_pyramid.md); it is deliberately NOT part of `health`."

**18c — `docs/afk_loop.md`**: update the cycle diagram (crawl gates around WORK; compile step), the "Running it" block (add crawl/fleet/feedback commands), and REWRITE the "only two testing modes" passage to "three tiers, one oracle chain — see docs/testing_pyramid.md" (the claim was load-bearing; the coherence tests pin it — 18f).

**18d — `docs/blind_playtest_protocol.md`**: add sections: "Fleet mode" (command, personas dir, calibration anchors quoted, mixed rotation, model mix, resume/pacing, manifest), "Mock mode" (BLIND_AGENT_CMD seam, CI usage, zero tokens), "Sycophancy telemetry" (measured by the compiler — score distributions + zero-negative rate; positive reports are DATA, never rejected for positivity). Update `blind-tester/README.md` with the same commands + persona list. README.md: retitle the testing section "Testing: a three-tier pyramid, coupled by an exit interview", add the tier-1/tier-3 paragraphs + link `docs/testing_pyramid.md`.

**18e — `loop.sh`**: in `run_cycle()` add the pre-gate right after the `npm run ai:loop` line and a post-gate right before `npm run health`:
```bash
npm run crawl:smoke || { echo "crawl:smoke red before work — world is already broken; halting cycle"; _revert_failed_cycle; return 1; }
# … agent step …
npm run crawl:smoke || { echo "crawl:smoke red after work — reverting"; _revert_failed_cycle; return 1; }
```

**18f — coherence regression tests**: read both files first; they pin phrases like "only two testing modes". Update the pinned strings to the new three-tier language and ADD pins: `docs/testing_pyramid.md` exists, AGENTS.md mentions `crawl:smoke`, protocol doc mentions `fleet:mock`. (Honest update of intentionally-changed behavior, per the charter. Test count must not drop — only grow.)

**18g — CI** (`.github/workflows/ci.yml`): add a second job (parallel to `verify`, NOT a required check yet):
```yaml
  crawl-smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - name: Mechanical crawl gate (all quests + overworld, deterministic seeds)
        run: npm run crawl:smoke
```
The fault-injection suite, fleet unit tests, compiler tests, and the `fleet_mock_pipeline` e2e ride the existing `npm test` step automatically (they're in `tests/`). Check the e2e's CI runtime; if the mock e2e pushes the test step > ~2 min extra, gate the heavyweight `it`s behind `process.env.CI_FULL ?` — do NOT delete them (and set `CI_FULL: 1` in the workflow so CI still runs them; only local `npm test` gets the fast path). Prefer keeping them unconditional if runtime allows.

- [ ] **Step 1:** Write `docs/testing_pyramid.md`; update AGENTS.md; update afk_loop.md; update protocol + blind-tester/README + README.
- [ ] **Step 2:** Update the two coherence tests (run them: `npx vitest run tests/regression/docs_trust_but_verify_coherence.test.ts tests/regression/agents_trust_but_verify_coherence.test.ts` → PASS).
- [ ] **Step 3:** loop.sh + ci.yml edits. `bash -n loop.sh` (syntax), `npx yaml` or a YAML-parse one-liner for ci.yml.
- [ ] **Step 4:** Fresh-eyes doc pass: follow every command in testing_pyramid.md literally in a clean shell; each must work as written (Phase-5 checkpoint, part 2).
- [ ] **Step 5: Commit** — `npm run format && git add -A && git commit -m "docs+ci: three-tier testing pyramid wired into charter, loop, protocol, CI"`

---

### Task 19: Full verification, AI_LOOP_STATE entry, final report, PR (Phase 6)

- [ ] **Step 1: Deep soak (if not already done in Task 10 at full budget):** `npm run crawl:deep -- --seconds 120 --workers 8` → record steps/sec + total steps + findings by code; every finding triaged (fixed or filed under `traces/bugs/` + regression per charter).
- [ ] **Step 2: AI_LOOP_STATE.md** — prepend ONE entry in the exact house convention (heading `### Cycle result - testing_pyramid_three_tiers`, bullets `Content/Engine surface:` / `Loop effect:` / `Blind playtest:` (cite fleet:mock 20/20 + live attempt outcome honestly) / `Self-critique:` / `Guard:`, ≤8 lines).
- [ ] **Step 3: `npm run health`** — full bar green (UI deps installed: `npm --prefix ui install` first if needed). Also re-run `npm run crawl:smoke` one final time; both outputs pasted into the final report.
- [ ] **Step 4: Final report** (posted to the user, not a repo file): what was built per tier; measured numbers (crawl steps/sec/worker + aggregate, total steps, findings by code from smoke + deep, fleet:mock counts, top hot spots table, live-fleet attempt outcome verbatim); files changed summary; exact reproduce-everything command list.
- [ ] **Step 5: PR** — push `feat/testing-pyramid`; `gh pr create` with a body summarizing the three tiers + checkpoint evidence; note that `codex/benchmark-slice` (35 commits of content work) will need a trivial rebase for `package.json`/docs overlap whichever lands second. Merging waits for the owner (repo guard requires explicit user confirmation to merge own PRs).

---

## Self-Review (performed while writing — issues found and fixed inline)

1. **Spec coverage check** against goal.md §§2–5: policies ✓ (T3), 9 oracles ✓ (T4/T5/T8: CRASH, INTEGRITY, DESYNC, PERSIST, LEGALITY, SOFTLOCK, RENDER, WORLD, ORPHAN), findings/JSONL/dedupe ✓ (T2), minimization + `traces/bugs/` ✓ (T6/T10), throughput measured ✓ (T7/T10), lanes ✓ (T7), coverage report ✓ (T8), fault injection in CI ✓ (T9+T18g), fleet flags/resume/isolation/telemetry ✓ (T12), personas + anti-sycophancy anchors ✓ (T11), no-hard-reject + sycophancy telemetry ✓ (T13/T15), sampling-flags honesty ✓ (T12 note: none exist), mock mode ✓ (T13), compiler inputs/normalize/cluster/rank/metrics/outputs/trends ✓ (T14–T16), ONE recommended fix ✓ (T16), ai-loop consumption ✓ (T17), docs/CI/AGENTS/loop.sh/AI_LOOP_STATE ✓ (T18/T19), anti-goals respected (no parser fuzzer — legal-action menus only; no LLM clustering in default path; mock mandatory; machine-readable first; health not slowed — crawl:smoke is its own lane/CI job).
2. **Known unknowns the implementer MUST resolve by reading code (flagged in-task, not placeholders):** exact `RpgPack` room/exit accessor shape (T4/T5/T9 mutations), real effect vocabulary for the DESYNC wrapper (T5), `runActions` hash alignment (T5 — hand-roll if ambiguous), `RpgSourceRuntime` constructor (T4), `travel()`/pending-encounter return surface (T8), `ImprovementCandidate`/`score()` field shape (T17), coherence-test pinned strings (T18f). Each names the file to read and fixes the INTENT.
3. **Type consistency pass:** `CrawlFinding`/`FindingCollector` (T2) consumed with identical names in T4–T10, T16; `PreparedQuest` (T4) in T5/T6/T8/T9; `episodeSeed`/`EpisodeRecord` (T4) in T5/T6/T9; `CanonicalLocation` (T14) in T15/T16; `HotspotsFileSchema` (T14) in T16/T17; `reproducesFingerprint` (T6) in T9. Severity polarity used consistently: S4 = blocking = weight 16.
4. **Determinism audit of the plan itself:** rng only from `mulberry32(seed)`; timestamps only in out-dir names + `generated_at`; smoke lane has no seconds cutoff; worker merge re-sorts; JSONL via `canonicalize`; clustering order-independence has its own test.

## Execution Handoff

Plan saved at `docs/superpowers/plans/2026-07-09-testing-pyramid.md`. Execution will be subagent-driven (fresh implementer per task, review between tasks) per superpowers:subagent-driven-development, with the checkpoints in Tasks 7, 8, 10, 13, 16, 17, 19 run and read by the orchestrator personally.
