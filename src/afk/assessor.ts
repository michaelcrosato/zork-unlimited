/**
 * The AFK loop's brain — "what is the next best improvement?" (trust-but-verify).
 *
 * Each cycle the loop must decide where to spend its effort across FOUR categories:
 *   - content_new  : the world graph is thin (too few playable RPG quest nodes)
 *   - content_fix  : an existing pack has coverage gaps, unreached endings, or
 *                    validator warnings (the quality signal a real playtest probes)
 *   - engine       : code-level debt (TODO/FIXME markers, pending mechanics)
 *   - repo         : project hygiene (missing tooling, docs, etc.)
 *
 * The assessor gathers evidence DETERMINISTICALLY through the same tool API the MCP
 * server exposes (list_world / validate) — no clock, no RNG, no network — scores
 * candidates, and recommends the single highest-value next action.
 * It is the deterministic *evaluator*; the actual quality judgement each cycle comes
 * from a mandatory LLM playtest (see docs/afk_loop.md). Pure enough to unit-test:
 * same repo ⇒ same ranking.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createToolApi } from "../mcp/tools.js";
import type { PackMode } from "../mcp/types.js";
import { verifyBlindReportText } from "../blind/report_verifier.js";
import { completedCycleCount, totalCycleCount } from "./loop_state.js";
import { generateRpgPack } from "../gen/rpg_generator.js";
import { validateRpg } from "../validate/rpg_validator.js";
import type { ValidationReport } from "../validate/report.js";
import { auditStaleReactiveRoomItems } from "./stale_reactive_audit.js";
import { resolveWorldQuestPackPath } from "../world/source.js";

export type Category = "content_fix" | "content_new" | "engine" | "repo";

export type ImprovementCandidate = {
  id: string;
  category: Category;
  target: string; // a pack path, a mode, or a repo area
  title: string;
  rationale: string;
  evidence: string[];
  impact: number; // 1-5
  effort: "S" | "M" | "L";
  score: number; // impact-weighted, deterministic
};

export type PackHealth = {
  path: string;
  mode: PackMode | null;
  playable: boolean;
  warnings: number;
};

type AssessedStory = {
  path: string;
  id: string;
  mode: PackMode | null;
  playable: boolean;
  world_quest_id: string | null;
};

export type Assessment = {
  rpgPackCount: number;
  worldQuestCount: number;
  packs: PackHealth[];
  /** True iff this cycle's fresh generated RPG window validated clean. */
  allGeneratorsClean: boolean;
  candidates: ImprovementCandidate[];
  top: ImprovementCandidate | null;
};

export type AssessmentFormatOptions = {
  /** Print every pack/candidate with full rationale. Default output is compact for loop handoff. */
  full?: boolean;
  /** Maximum ranked candidates to show in compact mode before summarizing routine rows. */
  maxCandidates?: number;
};

const EFFORT_COST: Record<ImprovementCandidate["effort"], number> = { S: 1, M: 2, L: 3 };
// Quality-first weighting: improving what players actually touch beats net-new bulk.
const CATEGORY_WEIGHT: Record<Category, number> = {
  content_fix: 1.0,
  content_new: 0.85,
  engine: 0.8,
  repo: 0.6,
};
// How many playable quest nodes in the contiguous world graph is "healthy" before
// net-new world expansion is deprioritized. Count world_quest_id entries, not raw
// pack files, so this lever cannot reintroduce standalone package authoring.
const WORLD_QUEST_TARGET = 16;

function score(impact: number, effort: ImprovementCandidate["effort"], category: Category): number {
  // Deterministic: (impact / effort) * weight, rounded to 3 dp.
  return Math.round((impact / EFFORT_COST[effort]) * CATEGORY_WEIGHT[category] * 1000) / 1000;
}

function listSourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && /\.ts$/.test(e.name)) out.push(p);
    }
  };
  walk(join(root, "src"));
  return out;
}

// First-party code dirs we'd expect under a static-analysis/format gate. Pure
// data/build dirs (content/ YAML, traces/ snapshots, dist/, coverage/, node_modules/,
// saves/, ai-runs/) are intentionally NOT here — linting them is wrong, not missing.
const LINT_DIRS = ["src", "bin", "scripts", "agents", "tests", "ui"] as const;

/** Does `dir` (under root) hold any first-party, lintable .ts/.tsx (not .d.ts, not vendored)? */
function dirHasLintableTs(root: string, dir: string): boolean {
  let found = false;
  const walk = (d: string): void => {
    if (found || !existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (found) return;
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "dist" || e.name === "coverage") continue;
        walk(join(d, e.name));
      } else if (e.isFile() && /\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) {
        found = true;
      }
    }
  };
  walk(join(root, dir));
  return found;
}

/**
 * Is `dir` actually under the ESLint config's gate? — true iff some `files:` glob
 * names it AND no `ignores:` glob excludes it. Robust to glob shape (a bare
 * recursive glob, a typed-extension glob, brace forms): it keys off the dir prefix in the relevant
 * array bodies, so it disarms the moment a future cycle adds the dir to `files`
 * and drops it from `ignores`. Parses the flat-config text rather than executing
 * it — same lightweight, deterministic style as the TODO/marker scan below.
 */
export function eslintCovers(eslintText: string, dir: string): boolean {
  const bodies = (key: string): string =>
    [...eslintText.matchAll(new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)\\]`, "g"))]
      .map((m) => m[1])
      .join(",");
  const inFiles = new RegExp(`["'\`]${dir}/`).test(bodies("files"));
  const ignored = new RegExp(`["'\`]${dir}/\\*\\*`).test(bodies("ignores"));
  return inFiles && !ignored;
}

// ── Doc-staleness radar (bug_0045) ────────────────────────────────────────────
// The third cross-category repo lever, after eslint-coverage and the engine
// marker scan (both of which disarm once the code is tidy). It surfaces DOC
// rot: a canonical, maintained doc that points at a first-party file which no
// longer exists (a rename/delete the doc was never updated for) — exactly the
// "currently-invisible work" a radar should catch, and the standing next-best
// cross-category meta-improvement logged since bug_0032/0035.
//
// First-party path prefixes a doc reference can point at. Forward/ephemeral roots
// (node_modules/, dist/, coverage/, saves/, ai-runs/) are intentionally absent — a
// doc naming one of those is not a claim that a tracked file exists.
const DOC_REF_PREFIXES = [
  "src",
  "bin",
  "scripts",
  "agents",
  "tests",
  "traces",
  "docs",
  "content",
  "ui",
] as const;
const DOC_REF_RE = new RegExp(`(?:${DOC_REF_PREFIXES.join("|")})/[A-Za-z0-9_./-]+`, "g");
const DOC_REF_EXT = /\.(?:ts|tsx|js|mjs|cjs|json|yaml|yml|md|sh)$/;
// A path token is NOT a liveness claim when it is a glob/brace/placeholder pattern
// (content/rpg/pack/*.yaml, traces/bugs/bug_0001_*.yaml, ai-runs/<id>/playtest.md)…
const DOC_REF_PATTERN_CHARS = /[*{}?[\]<>]|\.\.\./;
// …or a command-line OUTPUT DESTINATION (`--record traces/run.json`, `--out …`,
// `-o file`, `> file`): the doc tells you to CREATE it, not that it already exists.
const DOC_REF_OUTPUT_FLAG = /(?:--record|--out|--output|-o|>)\s+$/;

/**
 * Extract the CONCRETE first-party file references a doc CLAIMS exist and return
 * those that DON'T resolve via `exists` — i.e. stale doc references to renamed or
 * deleted files. Pure (disk access injected) so it unit-tests without a fixture,
 * mirroring {@link eslintCovers}. Conservative by construction: it considers only
 * tokens under a known first-party dir that carry a concrete file extension, and
 * skips glob/placeholder patterns and command-line output destinations — the path
 * shapes a doc legitimately names WITHOUT asserting they already exist on disk. So
 * a hit is a real "doc points at a file that isn't there", not example/forward text.
 */
export function findStaleDocRefs(docText: string, exists: (relPath: string) => boolean): string[] {
  const stale: string[] = [];
  const seen = new Set<string>();
  for (const m of docText.matchAll(DOC_REF_RE)) {
    const at = m.index ?? 0;
    if (DOC_REF_OUTPUT_FLAG.test(docText.slice(Math.max(0, at - 14), at))) continue;
    const tok = m[0].replace(/[).,;:"'`]+$/, "");
    if (DOC_REF_PATTERN_CHARS.test(tok)) continue;
    if (!DOC_REF_EXT.test(tok)) continue;
    if (seen.has(tok)) continue;
    seen.add(tok);
    if (!exists(tok)) stale.push(tok);
  }
  return stale;
}

/**
 * The canonical, CURRENT-system docs whose file references should all resolve.
 * Deliberately EXCLUDED (scanning them for liveness would be wrong, not missing —
 * the same discipline as LINT_DIRS omitting data/forward dirs): AI_LOOP_STATE.md (a
 * historical per-cycle log that records paths/hashes as they were, some since
 * moved), docs/ROADMAP.md and ADVENTUREFORGE_BUILD_SPEC.md (forward-looking — they
 * may name planned files that don't exist yet), plus historical planning/gate logs
 * that intentionally preserve retired parser/CYOA paths.
 */
const DOC_STALENESS_EXCLUDED_DOCS = new Set([
  "DECISION_LOG.md",
  "ROADMAP.md",
  "RPG-STANDARDIZATION-PLAN.md",
  "ULTRAPLAN-2026-06-02.md",
  "stage4_rpg_gate.md",
]);

function docStalenessDocs(root: string): string[] {
  const out: string[] = [];
  for (const f of ["AGENTS.md", "README.md", "AI_AGENT_PROMPT.md"]) {
    if (existsSync(join(root, f))) out.push(f);
  }
  const docsDir = join(root, "docs");
  if (existsSync(docsDir)) {
    for (const e of readdirSync(docsDir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (e.isFile() && e.name.endsWith(".md") && !DOC_STALENESS_EXCLUDED_DOCS.has(e.name))
        out.push(`docs/${e.name}`);
    }
  }
  return out;
}

/**
 * Normalize a pack reference — a full path, a bare file stem, OR a pack id — to its
 * stem, so an attendance line that names a pack any of those ways maps to the same key.
 * E.g. "content/rpg/pack/cold_forge.yaml" → "cold_forge", a bare
 * "clockwork_heist" is unchanged, and the pack ID "clockwork_heist_v1" also → it.
 *
 * The trailing `_v\d+` strip matters for attendance keying (bug_0293): the candidate's
 * target is a PATH (file stem, no version), but the code-written recommendation line the
 * log records every cycle names the pack by its ID — `Blind-playtest "clockwork_heist_v1"`
 * — which carries the `_v1` suffix. Without this strip the id-form and the path-form key
 * to different stems and the recency lookup misses, re-freezing the rotation. No shipped
 * pack FILE name ends in `_v\d+`, so the strip never collides two real packs.
 */
export function packStem(ref: string): string {
  const base = ref.split("/").pop() ?? ref;
  return base.replace(/\.ya?ml$/i, "").replace(/_v\d+$/i, "");
}

/**
 * Parse, from the AI_LOOP_STATE.md log, each pack's MOST RECENT blind-playtest
 * attendance — its character offset — keyed by {@link packStem}. A SMALLER offset
 * means more recently attended, because the log is written NEWEST-FIRST (every cycle
 * PREPENDS its entry at the top): a stem's FIRST match is its most recent attendance,
 * so we keep the first and ignore older repeats. Pure (text in, map out) so it
 * unit-tests without a fixture. Used to rotate the blind pass onto the
 * LEAST-recently-attended pack instead of re-nominating the alphabetically-first one.
 *
 * Recognizes BOTH the cycle-result phrasing the log actually uses today ("Mandated
 * blind pass ran on <pack>") AND the older structured-header marker ("Mandatory LLM
 * playtest target this cycle: <path>"); a token in either form may be a path or a
 * bare id. This is the bug_0128 fix: the attendance matcher previously matched ONLY the old
 * header — abandoned ~15 cycles ago for the prose format — so the recency signal had
 * frozen and the rotation silently fell back to alphabetical, re-nominating
 * clockwork_heist (the very lock-in the rotation was meant to cure). The caller
 * resolves only real pack stems, so incidental captures (e.g. "…ran on the assessor")
 * land under a stem no candidate queries and are harmless.
 *
 * bug_0235: the same blindness recurred via MARKDOWN WRAPPING. The log writes the pack
 * bold+backticked — `- **Mandated blind pass ran on \`midnight_edition\`** …` — but the
 * capture class [A-Za-z0-9_./-] excluded the backtick, so the match failed at the opening
 * tick and EVERY recent entry was invisible: the just-played pack looked never-attended
 * (undefined offset) and the rotation re-nominated it FIRST (observed: midnight_edition
 * ranked #1 the cycle after it was played). The optional `[\`*]*` wrapper below skips a
 * leading backtick/asterisk run; the capture still stops at the CLOSING tick (a backtick
 * is not in the class), so the bare stem is recovered. Unwrapped prose and path forms are
 * unaffected ([\`*]* matches zero).
 */
export function parseAttendanceOffsets(loopStateText: string): Map<string, number> {
  const map = new Map<string, number>();
  // bug_0293: ALSO match the model-INDEPENDENT code-written recommendation line
  // `Blind-playtest "<id>"` (emitted by the assessor every cycle, see the playtest
  // candidate title below) and the looser Sonnet-era agent phrasing "blind pass on
  // `<pack>`". The wrapper class gains `"` so the quoted id is skipped; `i` tolerates
  // sentence-start caps; the `_v\d+` on a captured pack id is normalized by packStem.
  const re =
    /(?:Mandatory LLM playtest target this cycle:|Mandated blind pass ran on|blind pass on|Blind-playtest)\s+["`*]*([A-Za-z0-9_./-]+)/gi;
  for (const m of loopStateText.matchAll(re)) {
    const captured = m[1];
    if (captured === undefined) continue;
    const stem = packStem(captured.replace(/[.,;]+$/, "")); // strip sentence-ending punctuation
    if (!stem) continue;
    if (!map.has(stem)) map.set(stem, m.index ?? 0); // newest-first ⇒ first match is most recent
  }
  return map;
}

const BLIND_REPORT_FILE_RE = /^(\d{8}T\d{6}Z)_(.+)_seed\d+\.md$/;

/**
 * Parse local blind-tester report filenames into attendance offsets. The report runner
 * writes accepted markdown reports as:
 *
 *   YYYYMMDDTHHMMSSZ_<pack-stem>_seed<N>.md
 *
 * Those files are gitignored scratch evidence, but they are authoritative for the
 * current worktree's AFK loop: if a blind pass just ran successfully, the assessor
 * must not immediately nominate the same pack again merely because AI_LOOP_STATE.md
 * has not been prepended yet. Filenames carry UTC timestamps, so ordering is stable
 * without consulting file mtimes. Returned offsets are NEGATIVE, making these local
 * reports newer than any tracked log offset (which is always >= 0) while preserving
 * the same "smaller offset = more recent" convention as {@link parseAttendanceOffsets}.
 */
export function parseBlindReportAttendanceOffsets(
  reportFileNames: Iterable<string>,
): Map<string, number> {
  const reports = [...reportFileNames]
    .map((name) => {
      const m = name.match(BLIND_REPORT_FILE_RE);
      if (!m) return null;
      return { stamp: m[1]!, stem: packStem(m[2]!), name };
    })
    .filter((r): r is { stamp: string; stem: string; name: string } => r !== null && !!r.stem)
    .sort((a, b) => b.stamp.localeCompare(a.stamp) || a.name.localeCompare(b.name));

  const map = new Map<string, number>();
  reports.forEach((report, i) => {
    if (!map.has(report.stem)) {
      map.set(report.stem, -(reports.length - i));
    }
  });
  return map;
}

export function blindReportAttendanceOffsets(root: string): Map<string, number> {
  const reportsDir = join(root, "blind-tester", "reports");
  if (!existsSync(reportsDir)) return new Map();
  const acceptedReports = readdirSync(reportsDir).filter((name) => {
    if (!BLIND_REPORT_FILE_RE.test(name)) return false;
    try {
      return verifyBlindReportText(readFileSync(join(reportsDir, name), "utf8")).ok;
    } catch {
      return false;
    }
  });
  return parseBlindReportAttendanceOffsets(acceptedReports);
}

export function mergeAttendanceOffsets(
  ...sources: ReadonlyArray<ReadonlyMap<string, number>>
): Map<string, number> {
  const map = new Map<string, number>();
  for (const source of sources) {
    for (const [stem, offset] of source) {
      const previous = map.get(stem);
      if (previous === undefined || offset < previous) map.set(stem, offset);
    }
  }
  return map;
}

/** Disk wrapper for attendance evidence; empty map when both evidence sources are absent. */
function lastAttendanceOffsets(root: string): Map<string, number> {
  const p = join(root, "AI_LOOP_STATE.md");
  const loopStateOffsets = existsSync(p)
    ? parseAttendanceOffsets(readFileSync(p, "utf8"))
    : new Map();
  return mergeAttendanceOffsets(loopStateOffsets, blindReportAttendanceOffsets(root));
}

// ── RPG generator mint-and-check lever ─────────────────────────────────────────
// The consolidated public runtime is RPG-only, so the assessor's moving eval target
// must be RPG-only too. Keeping retired generator windows here would spend every
// loop on retired modes and could re-raise work that the consolidation goal explicitly
// strips. The remaining window still advances with cycle count, keeping the RPG verifier
// on fresh generated packs instead of a frozen hand-authored set.

/**
 * How many completed improvement cycles AI_LOOP_STATE.md records. Recent cycles are
 * "### Cycle result" entries; older token-heavy entries may be folded into the tiny
 * historical_cycle_count marker. This stays a PURE function of repo state while letting
 * the live loop memory remain small.
 */
export function generatedEvalSeedBase(loopStateText: string): number {
  return completedCycleCount(loopStateText);
}

/**
 * Disk wrapper: total completed cycles across the live log + the rotated archive
 * ({@link totalCycleCount}), so the generator seed window stays monotonic even after
 * AI_LOOP_STATE.md is trimmed by the rotation. {@link generatedEvalSeedBase} remains the
 * pure, single-file counter the unit tests pin.
 */
function generatedEvalSeedBaseFromDisk(root: string): number {
  return totalCycleCount(root);
}

/**
 * How many fresh generated packs the assessor mints-and-checks each cycle. A small WINDOW
 * (not one pack) so a single cycle confronts several themes/structures; combined with the
 * advancing {@link generatedEvalSeedBase}, successive cycles sweep disjoint windows of the
 * seed space, exercising the verifier across an ever-widening, never-frozen slice.
 */
export const GEN_EVAL_CHECK_COUNT = 4;

/** One minted-and-validated generated pack: the seed, its id, and the production report. */
export type GeneratedPackCheck = { seed: number; pack_id: string; report: ValidationReport };

export function allGeneratedChecksClean(checks: GeneratedPackCheck[]): boolean {
  return checks.every((c) => c.report.findings.length === 0);
}

/**
 * The RPG generator mint-and-check verdict. Given this cycle's freshly minted-and-validated
 * generated RPG packs, return an improvement candidate IFF the production `validateRpg` did NOT
 * hold on one of them — i.e. a minted pack carries ANY finding (error OR warning), the same
 * zero-findings bar the curated RPG packs and the generator's own test (rpg_generator.test.ts)
 * clear, which INCLUDES the RPG-only COMBAT_UNWINNABLE / SCORE_UNREACHABLE /
 * SKILL_CHECK_IMPOSSIBLE checks. A clean sweep returns null (the verifier held on this cycle's
 * RPG moving target — the healthy state, so the lever does NOT mask the 0.5 saturation floor).
 * When it fires it is a genuine, fixable problem — the RPG generator emitted an
 * unclean/unwinnable/score-unreachable shape, OR the fresh distribution surfaced a verifier gap
 * — scored high so the loop closes the divergence rather than re-polishing clean prose. Pure
 * (validated checks in, candidate out) so the negative path unit-tests against the REAL
 * validateRpg with no disk and no clock.
 */
export function generatorRpgDriftCandidate(
  checks: GeneratedPackCheck[],
): ImprovementCandidate | null {
  const bad = checks.filter((c) => c.report.findings.length > 0);
  if (bad.length === 0) return null;
  return {
    id: "generator-rpg-drift",
    category: "engine",
    target: "src/gen/rpg_generator.ts",
    title: `The RPG pack generator minted ${bad.length} pack(s) the verifier rejects — the evolving RPG eval distribution has drifted from the shipped bar`,
    rationale:
      "Evolving the RPG eval distribution only works if every minted pack clears the SAME zero-findings bar the curated RPG packs do — which for RPG includes COMBAT winnability and SCORE-economy soundness (docs/CURRENT_PLAN.md). A generated RPG pack the production validateRpg flags is a real defect: either the generator emits an unclean/unwinnable/score-unreachable shape, or the fresh distribution has surfaced a verifier gap. Fixing it keeps the RPG generator a trustworthy moving target instead of a source of false signal.",
    evidence: bad.map(
      (c) =>
        `seed ${c.seed} (${c.pack_id}): ${c.report.findings.map((f) => `${f.severity}:${f.code}`).join(", ")}`,
    ),
    impact: 5,
    effort: "M",
    score: score(5, "M", "engine"),
  };
}

/**
 * The score at/below which only ROUTINE work remains. The blind-playtest review
 * stubs (the rotation candidates raised for gated/puzzle packs) all land on this
 * 0.5 floor — `score(1, "M", "content_fix")` — and tiny legacy coverage
 * gap also bottoms out here. So a top candidate at this floor means every
 * higher-value lever (real content gaps, net-new content, engine/repo, the
 * frontier benchmark lever) has disarmed.
 */
export const SATURATION_FLOOR = 0.5;

/**
 * Has the deterministic assessor run dry of STRATEGIC direction? True when this
 * cycle's fresh generator windows are clean AND the top candidate is at/below
 * {@link SATURATION_FLOOR} (only routine rotation work left) or there is no
 * candidate at all. This is the exact diminishing-returns signal — the state that
 * once pinned the loop to clockwork-polish — and the moment a multi-agent ultraplan
 * re-aim earns its cost (see docs/afk_loop.md, the saturation-triggered ultraplan
 * mode). If a generator window is unclean, the loop is not saturated: there is a
 * verifier/generator divergence to handle, even if a caller's candidate scoring has
 * collapsed to the floor.
 */
export function isSaturated(a: Assessment): boolean {
  return a.allGeneratorsClean && (a.top === null || a.top.score <= SATURATION_FLOOR);
}

/** Deterministically assess the repo and rank the next-best improvements. */
export function assess(root: string): Assessment {
  const api = createToolApi({ root });
  const stories: AssessedStory[] = api.list_world().quests.map((quest) => ({
    path:
      quest.world_quest_id === null
        ? quest.id
        : resolveWorldQuestPackPath(root, quest.world_quest_id).packPath,
    id: quest.id,
    mode: quest.mode,
    playable: quest.playable,
    world_quest_id: quest.world_quest_id,
  }));

  const packs: PackHealth[] = [];
  const candidates: ImprovementCandidate[] = [];
  const rpgPackCount = stories.filter((s) => s.mode === "rpg").length;
  const worldQuestCount = stories.filter((s) => s.playable && s.world_quest_id !== null).length;

  // ── Per-pack health: validator findings (the deterministic dev-test signal) ───
  for (const s of stories) {
    if (!s.playable) {
      packs.push({ path: s.path, mode: s.mode, playable: false, warnings: 0 });
      candidates.push({
        id: `fix-unplayable-${s.path}`,
        category: "content_fix",
        target: s.path,
        title: `Fix "${s.id}" — it does not validate (unplayable)`,
        rationale:
          "An unplayable pack is the highest-impact thing to fix: nobody can experience it.",
        evidence: [`${s.path} failed validation`],
        impact: 5,
        effort: "M",
        score: score(5, "M", "content_fix"),
      });
      continue;
    }
    if (s.world_quest_id === null) {
      packs.push({ path: s.path, mode: s.mode, playable: true, warnings: 0 });
      candidates.push({
        id: `fix-unbound-${s.path}`,
        category: "content_fix",
        target: s.path,
        title: `Fix "${s.id}" — it is not bound to the world graph`,
        rationale:
          "A playable pack without a world quest id cannot be reached through the single-world runtime.",
        evidence: [`${s.path} has no world_quest_id`],
        impact: 5,
        effort: "M",
        score: score(5, "M", "content_fix"),
      });
      continue;
    }
    const report = api.validate_pack({ world_quest_id: s.world_quest_id });
    const warnings = report.report.findings.filter((f) => f.severity === "warning").length;
    packs.push({ path: s.path, mode: s.mode, playable: true, warnings });

    // content_fix is driven by VALIDATOR findings — the deterministic, code-checkable
    // signal (the "specific dev tests"). Player-facing QUALITY (signposting, clarity,
    // pacing) is judged only by the mandatory blind LLM playtest each cycle, so a
    // structurally-clean pack carries a low-priority blind-playtest rotation stub rather
    // than any heuristic-bot coverage score. (Two testing modes only: dev tests + blindtest.)
    if (warnings > 0) {
      const impact = Math.min(5, 1 + Math.ceil(warnings / 3));
      candidates.push({
        id: `fix-${s.path}`,
        category: "content_fix",
        target: s.path,
        title: `Fix "${s.id}" — ${warnings} validator warning(s)`,
        rationale:
          "Validator warnings are concrete, code-checkable content defects; clearing them keeps the pack sound and raises player-facing quality.",
        evidence: [`${warnings} validator warning(s)`],
        impact,
        effort: "M",
        score: score(impact, "M", "content_fix"),
      });
    } else {
      // Structurally clean (the validator + exhaustive solver prove it winnable and
      // sound): keep it on the radar as a LOW-priority blind-playtest review, rotated by
      // recency. The blind LLM playtest is the only judge of its signposting/clarity/pacing.
      candidates.push({
        id: `playtest-${s.path}`,
        category: "content_fix",
        target: s.path,
        title: `Blind-playtest "${s.id}" — structurally clean; only a fresh blind LLM player can judge its quality`,
        rationale:
          "The validator and exhaustive solver prove this pack is winnable and sound; only a fresh blind LLM playtest reveals signposting/clarity/pacing issues a static check can't see.",
        evidence: [
          "validator clean; due for a fresh blind LLM playtest (the rotation's quality judge)",
        ],
        impact: 1,
        effort: "M",
        score: score(1, "M", "content_fix"),
      });
    }
  }

  // ── content_new: contiguous world graph breadth ───────────────────────────────
  if (worldQuestCount < WORLD_QUEST_TARGET) {
    const impact = Math.min(5, 2 + (WORLD_QUEST_TARGET - worldQuestCount));
    candidates.push({
      id: "new-world-quest",
      category: "content_new",
      target: "world",
      title: `Add a new world-graph RPG quest (${worldQuestCount}/${WORLD_QUEST_TARGET})`,
      rationale:
        "Breadth work must expand the contiguous Charter Marches graph, not create a detached pack. A registered world quest exercises the overworld handoff, RPG runtime, save metadata, and MCP quest-id path together.",
      evidence: [`${worldQuestCount} playable world quest node(s), target ${WORLD_QUEST_TARGET}`],
      impact,
      effort: "L",
      score: score(impact, "L", "content_new"),
    });
  }

  // ── engine: TODO/FIXME debt in src/ ───────────────────────────────────────────
  const markers: string[] = [];
  for (const f of listSourceFiles(root)) {
    const text = readFileSync(f, "utf8");
    text.split("\n").forEach((line, i) => {
      // Anchor to an actual comment marker so prose/regex mentions of the words
      // (like this assessor's own descriptions) aren't counted as debt.
      if (/(?:\/\/|\/\*)\s*(?:TODO|FIXME|HACK|XXX)\b/.test(line))
        markers.push(`${relative(root, f).replaceAll("\\", "/")}:${i + 1}`);
    });
  }
  if (markers.length > 0) {
    const impact = Math.min(5, 2 + Math.ceil(markers.length / 5));
    candidates.push({
      id: "engine-todos",
      category: "engine",
      target: "src/",
      title: `Address ${markers.length} engine TODO/FIXME marker(s)`,
      rationale:
        "Code-level debt the engine carries; clearing it keeps the deterministic core honest.",
      evidence: markers.slice(0, 8),
      impact,
      effort: "M",
      score: score(impact, "M", "engine"),
    });
  }

  // ── engine/content strategy: measure the stale reactive-description class ─────
  // The repeated bug_0282–0325 class is real, but a naive validator warning would be
  // noisy across the current corpus. Keep it as a deterministic audit signal first:
  // static room prose that names a takeable object in that room, with no room variant
  // reading that object's inventory state. The suppression rule is concrete enough to
  // tune before promoting any subset into validateRpg.
  const staleReactive = auditStaleReactiveRoomItems(root);
  if (staleReactive.sites.length > 0) {
    const examples = staleReactive.sites
      .slice(0, 6)
      .map(
        (site) =>
          `${site.packPath} room:${site.roomId} names object:${site.objectId} (` +
          `"${site.matchedTerm}") with no room variant reading item/take-effect state`,
      );
    candidates.push({
      id: "stale-reactive-room-item-audit",
      category: "engine",
      target: "src/validate/rpg_validator.ts",
      title: `Tune a class-level stale reactive-description check (${staleReactive.sites.length} room/item site(s) need triage)`,
      rationale:
        "Recent cycles repeatedly fixed stale prose one instance at a time. This audit measures the narrow structural slice most responsible for that class — room base text naming takeable objects after they may be removed — without turning the noisy first pass into shipped-pack warnings. The next move is to tune suppressions or promote the proven subset into validation.",
      evidence: examples,
      impact: 3,
      effort: "M",
      score: score(3, "M", "engine"),
    });
  }

  // ── repo: tooling/hygiene gaps (cheap, deterministic checks) ──────────────────
  const eslintConfig = [
    "eslint.config.js",
    "eslint.config.mjs",
    ".eslintrc",
    ".eslintrc.json",
    ".eslintrc.cjs",
  ]
    .map((f) => join(root, f))
    .find((p) => existsSync(p));
  if (!eslintConfig) {
    candidates.push({
      id: "repo-eslint",
      category: "repo",
      target: "tooling",
      title: "Add ESLint + Prettier (lint is currently just tsc)",
      rationale:
        "A linter/formatter catches a class of issues the typechecker misses and keeps autonomous edits consistent.",
      evidence: ["no eslint/prettier config found"],
      impact: 3,
      effort: "L",
      score: score(3, "L", "repo"),
    });
  } else {
    // ESLint IS wired (bug_0031) — the next repo lever is COVERAGE. bug_0031
    // deliberately scoped the gate to src/bin/scripts/agents and excluded tests/
    // and ui/ "to keep that cycle bounded", but those dirs hold real first-party TS
    // with no static-analysis or format gate — exactly the "currently-invisible
    // work" a cross-category radar should surface (bug_0032 deferred). This fires
    // while a first-party code dir exists, holds lintable TS, yet sits outside the
    // ESLint config's `files` globs; it disarms the moment a cycle brings the dir
    // under the gate. (The engine TODO/FIXME detector is the other non-content
    // lever; it's correctly inert while the codebase carries zero markers.)
    const eslintText = readFileSync(eslintConfig, "utf8");
    const uncovered = LINT_DIRS.filter(
      (d) => dirHasLintableTs(root, d) && !eslintCovers(eslintText, d),
    );
    if (uncovered.length > 0) {
      const impact = Math.min(5, 1 + uncovered.length);
      candidates.push({
        id: "repo-lint-coverage",
        category: "repo",
        target: "tooling",
        title: `Extend ESLint/Prettier coverage to ${uncovered.length} first-party code dir(s) outside the lint gate (${uncovered.join(", ")})`,
        rationale:
          "ESLint/Prettier is wired but scoped to src/bin/scripts/agents; first-party TS in these dirs has no static-analysis or format gate, so a class of issues there is invisible to the loop.",
        evidence: [
          `${uncovered.join(", ")} hold first-party .ts/.tsx but are absent from the ESLint config's files globs`,
          "excluded when ESLint was first added (bug_0031) to keep that cycle bounded; ui/ also needs its own React/TSX lint setup",
        ],
        impact,
        effort: "L",
        score: score(impact, "L", "repo"),
      });
    }
  }

  // ── repo: doc staleness — canonical docs referencing renamed/deleted files ────
  // The third cross-category repo lever (bug_0045). Both others disarm once the
  // code is tidy (repo-eslint since the config ships; lint-coverage since bug_0038
  // gated the last dir; the engine TODO/marker scan at zero markers), leaving the
  // loop with no high-impact non-content lever — yet a canonical doc can still rot
  // when a file it names is renamed/deleted. This fires when such a reference no
  // longer resolves and disarms when every one does. It scans only CURRENT-system
  // docs (see docStalenessDocs): the historical AI_LOOP_STATE.md and the
  // forward-looking ROADMAP/BUILD_SPEC are out of scope by construction.
  const staleDocRefs: string[] = [];
  for (const docPath of docStalenessDocs(root)) {
    const text = readFileSync(join(root, docPath), "utf8");
    for (const ref of findStaleDocRefs(text, (rel) => existsSync(join(root, rel)))) {
      staleDocRefs.push(`${docPath} → ${ref}`);
    }
  }
  if (staleDocRefs.length > 0) {
    const impact = Math.min(5, 1 + Math.ceil(staleDocRefs.length / 3));
    candidates.push({
      id: "repo-doc-staleness",
      category: "repo",
      target: "docs",
      title: `Fix ${staleDocRefs.length} stale doc reference(s) to renamed/deleted files`,
      rationale:
        "A canonical doc that points at a file which no longer exists misleads the next reader — a human or a fresh AFK agent navigating by it; updating the reference keeps the docs a trustworthy map of the repo.",
      evidence: staleDocRefs.slice(0, 8),
      impact,
      effort: "S",
      score: score(impact, "S", "repo"),
    });
  }

  // ── eval-distribution: mint-and-check a fresh RPG generator window ────────────
  // The public runtime is now RPG-only. Each assessor cycle still confronts the RPG
  // verifier with a fresh, deterministic seed window, but retired legacy windows
  // no longer consume loop time or reintroduce legacy work.
  const genBase = generatedEvalSeedBaseFromDisk(root) * GEN_EVAL_CHECK_COUNT;
  const rpgGenChecks: GeneratedPackCheck[] = Array.from(
    { length: GEN_EVAL_CHECK_COUNT },
    (_, i) => {
      const seed = genBase + i;
      const pack = generateRpgPack(seed);
      return { seed, pack_id: pack.meta.id, report: validateRpg(pack) };
    },
  );
  const rpgGenDrift = generatorRpgDriftCandidate(rpgGenChecks);
  if (rpgGenDrift) candidates.push(rpgGenDrift);
  const allGeneratorsClean = allGeneratedChecksClean(rpgGenChecks);

  // Deterministic ordering: score desc, then — among equal scores — rotate the
  // blind-playtest pass onto the LEAST-recently-attended pack (never-attended first,
  // then the oldest most-recent attendance first), then id asc as the final stable
  // tiebreak. The recency term only separates equal-scored `playtest-*` stubs (all at
  // 0.5); every other candidate gets a sentinel (MAX_SAFE_INTEGER) so its relative
  // order is unchanged. attendance offsets come from the NEWEST-FIRST log, so a
  // SMALLER offset is MORE recent — we negate it so a less-recent (larger-offset) pack
  // sorts EARLIER, and a never-attended pack (MIN_SAFE_INTEGER) sorts earliest of all.
  // c.target is a path; the attendance map is stem-keyed, so resolve via packStem.
  // Reading the tracked AI_LOOP_STATE.md keeps this a pure function of repo state
  // (same repo ⇒ same ranking), curing the clockwork_heist lock-in (bug_0128).
  const attendance = lastAttendanceOffsets(root);
  const recencyOf = (c: ImprovementCandidate): number => {
    if (!c.id.startsWith("playtest-")) return Number.MAX_SAFE_INTEGER;
    const off = attendance.get(packStem(c.target));
    return off === undefined ? Number.MIN_SAFE_INTEGER : -off;
  };
  candidates.sort(
    (a, b) => b.score - a.score || recencyOf(a) - recencyOf(b) || a.id.localeCompare(b.id),
  );
  return {
    rpgPackCount,
    worldQuestCount,
    packs,
    allGeneratorsClean,
    candidates,
    top: candidates[0] ?? null,
  };
}

function isRoutinePlaytestCandidate(c: ImprovementCandidate): boolean {
  return (
    c.category === "content_fix" && c.id.startsWith("playtest-") && c.score <= SATURATION_FLOOR
  );
}

export function formatAssessment(a: Assessment, opts: AssessmentFormatOptions = {}): string {
  const full = opts.full === true;
  const maxCandidates = opts.maxCandidates ?? 8;
  const playable = a.packs.filter((p) => p.playable).length;
  const warningCount = a.packs.reduce((sum, p) => sum + p.warnings, 0);
  const unhealthy = a.packs.filter((p) => !p.playable || p.warnings > 0);
  const lines: string[] = [];
  lines.push("# AFK assessment — next best improvement");
  lines.push("");
  lines.push(`RPG catalog: ${a.rpgPackCount} pack(s), ${a.worldQuestCount} world quest node(s)`);
  lines.push(
    `RPG generator mint-and-check: ${a.allGeneratorsClean ? "clean" : "findings present"}`,
  );
  lines.push("");
  lines.push("## Pack health");
  lines.push(
    `- ${playable}/${a.packs.length} playable; ${warningCount} validator warning(s); ${unhealthy.length} pack(s) need deterministic attention.`,
  );
  if (full || unhealthy.length > 0) {
    const listedPacks = full ? a.packs : unhealthy.slice(0, 8);
    for (const p of listedPacks) {
      lines.push(
        `- ${p.path} [${p.mode ?? "?"}] ${p.playable ? `${p.warnings} warning(s)` : "UNPLAYABLE"}`,
      );
    }
    if (!full && unhealthy.length > listedPacks.length) {
      lines.push(`- ... ${unhealthy.length - listedPacks.length} more unhealthy pack(s) in JSON.`);
    }
  }
  lines.push("");
  lines.push("## Ranked candidates");
  let shown = 0;
  let omittedRoutine = 0;
  let omittedOther = 0;
  a.candidates.forEach((c, i) => {
    if (!full && shown >= maxCandidates) {
      if (isRoutinePlaytestCandidate(c)) omittedRoutine++;
      else omittedOther++;
      return;
    }
    if (!full && isRoutinePlaytestCandidate(c) && shown >= 3) {
      omittedRoutine++;
      return;
    }
    lines.push(`${i + 1}. [${c.score}] (${c.category}/${c.effort}) ${c.title}`);
    if (full || !isRoutinePlaytestCandidate(c)) {
      lines.push(`     why: ${c.rationale}`);
      for (const e of c.evidence) lines.push(`     · ${e}`);
    }
    shown++;
  });
  if (!full && omittedRoutine > 0) {
    lines.push(
      `... ${omittedRoutine} routine blind-playtest rotation candidate(s) omitted; full list is in assessment.json.`,
    );
  }
  if (!full && omittedOther > 0) {
    lines.push(
      `... ${omittedOther} additional candidate(s) omitted; full list is in assessment.json.`,
    );
  }
  lines.push("");
  lines.push(
    a.top
      ? `## ▶ Recommended next: ${a.top.title}`
      : "## No improvement candidates — the game is healthy.",
  );
  return lines.join("\n");
}

/** Convenience used by tests/CLI; the CLI lives in bin/assess.ts. */
export function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
