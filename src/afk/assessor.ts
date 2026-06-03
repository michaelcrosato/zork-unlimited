/**
 * The AFK loop's brain — "what is the next best improvement?" (trust-but-verify).
 *
 * Each cycle the loop must decide where to spend its effort across FOUR categories:
 *   - content_new  : the game is thin somewhere (a mode with too few packs)
 *   - content_fix  : an existing pack has coverage gaps, unreached endings, or
 *                    validator warnings (the quality signal a real playtest probes)
 *   - engine       : code-level debt (TODO/FIXME markers, pending mechanics)
 *   - repo         : project hygiene (missing tooling, docs, etc.)
 *
 * The assessor gathers evidence DETERMINISTICALLY through the same tool API the MCP
 * server exposes (list_stories / validate / run_playtest) — no clock, no RNG, no
 * network — scores candidates, and recommends the single highest-value next action.
 * It is the deterministic *evaluator*; the actual quality judgement each cycle comes
 * from a mandatory LLM playtest (see docs/afk_loop.md). Pure enough to unit-test:
 * same repo ⇒ same ranking.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createToolApi } from "../mcp/tools.js";
import { loadPackFile } from "../cyoa/pack.js";
import type { CyoaPack } from "../cyoa/schema.js";
import type { PackMode } from "../mcp/types.js";

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
  endingsDeclared: number;
  endingsReached: number;
  unvisited: string[];
  warnings: number;
};

export type Assessment = {
  packsByMode: Record<string, number>;
  packs: PackHealth[];
  candidates: ImprovementCandidate[];
  top: ImprovementCandidate | null;
};

const EFFORT_COST: Record<ImprovementCandidate["effort"], number> = { S: 1, M: 2, L: 3 };
// Quality-first weighting: improving what players actually touch beats net-new bulk.
const CATEGORY_WEIGHT: Record<Category, number> = {
  content_fix: 1.0,
  content_new: 0.85,
  engine: 0.8,
  repo: 0.6,
};
// How many packs per mode is "healthy" before net-new content is deprioritized.
const TARGET_PER_MODE: Record<string, number> = { cyoa: 2, parser: 2, rpg: 2 };

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
// (content/cyoa/pack/*.yaml, traces/bugs/bug_0001_*.yaml, ai-runs/<id>/playtest.md)…
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
 * may name planned files that don't exist yet).
 */
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
      if (e.isFile() && e.name.endsWith(".md") && e.name !== "ROADMAP.md")
        out.push(`docs/${e.name}`);
    }
  }
  return out;
}

/**
 * Is this CYOA pack PLANNING-GATED? — i.e. does any choice carry a state
 * precondition (a `conditions` entry: item/flag/var/visited/quest gate)?
 *
 * This is the deterministic test for "the coverage bot's reach is trustworthy
 * here". The planning-free bot picks choices greedily with no lookahead, so it
 * cannot deliberately gather a prerequisite item/flag and come back to satisfy a
 * gate — exactly the limit already documented for parser/RPG puzzle packs. So in a
 * GATED CYOA pack its failure to reach an ending/scene is a PLANNING limit, not a
 * content flaw (e.g. clockwork_heist: ending_rich/ending_truth sit behind the
 * lockpick chain, ending_patrol behind a deliberate ledger-skip — all reached by
 * the blind LLM playtest every cycle, none by the bot). A PURE-BRANCHING CYOA pack
 * (no choice conditions anywhere) keeps the reliable-bot assumption: the bot can
 * reach every node, so there a coverage gap IS a real structural signal.
 */
export function cyoaPackIsGated(pack: CyoaPack): boolean {
  return pack.scenes.some((scene) => scene.choices.some((choice) => choice.conditions.length > 0));
}

/**
 * Disk wrapper for {@link cyoaPackIsGated}. Falls back to `false` (reliable-bot /
 * pre-bug_0032 behavior) if the pack can't be loaded — the caller only invokes
 * this for packs already known playable.
 */
function isPlanningGatedCyoa(root: string, packPath: string): boolean {
  const loaded = loadPackFile(join(root, packPath));
  return loaded.ok && cyoaPackIsGated(loaded.compiled.pack);
}

/**
 * Normalize a pack reference — a full path OR a bare id — to its stem, so an
 * attendance line that names a pack either way maps to the same key. E.g.
 * "content/cyoa/pack/clockwork_heist.yaml" → "clockwork_heist", and a bare
 * "clockwork_heist" is returned unchanged.
 */
export function packStem(ref: string): string {
  const base = ref.split("/").pop() ?? ref;
  return base.replace(/\.ya?ml$/i, "");
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
 * bare id. This is the bug_0128 fix: the parser previously matched ONLY the old
 * header — abandoned ~15 cycles ago for the prose format — so the recency signal had
 * frozen and the rotation silently fell back to alphabetical, re-nominating
 * clockwork_heist (the very lock-in the rotation was meant to cure). The caller
 * resolves only real pack stems, so incidental captures (e.g. "…ran on the assessor")
 * land under a stem no candidate queries and are harmless.
 */
export function parseAttendanceOffsets(loopStateText: string): Map<string, number> {
  const map = new Map<string, number>();
  const re =
    /(?:Mandatory LLM playtest target this cycle:|Mandated blind pass ran on)\s+([A-Za-z0-9_./-]+)/g;
  for (const m of loopStateText.matchAll(re)) {
    const captured = m[1];
    if (captured === undefined) continue;
    const stem = packStem(captured.replace(/[.,;]+$/, "")); // strip sentence-ending punctuation
    if (!stem) continue;
    if (!map.has(stem)) map.set(stem, m.index ?? 0); // newest-first ⇒ first match is most recent
  }
  return map;
}

/** Disk wrapper for {@link parseAttendanceOffsets}; empty map when the log is absent. */
function lastAttendanceOffsets(root: string): Map<string, number> {
  const p = join(root, "AI_LOOP_STATE.md");
  if (!existsSync(p)) return new Map();
  return parseAttendanceOffsets(readFileSync(p, "utf8"));
}

/**
 * The score at/below which only ROUTINE work remains. The blind-playtest review
 * stubs (the rotation candidates raised for gated/puzzle packs) all land on this
 * 0.5 floor — `score(1, "M", "content_fix")` — and a tiny ungated-CYOA coverage
 * gap also bottoms out here. So a top candidate at this floor means every
 * higher-value lever (real content gaps, net-new content, engine/repo, the
 * frontier benchmark lever) has disarmed.
 */
export const SATURATION_FLOOR = 0.5;

/**
 * Has the deterministic assessor run dry of STRATEGIC direction? True when the
 * top candidate is at/below {@link SATURATION_FLOOR} (only routine rotation work
 * left) or there is no candidate at all. This is the exact diminishing-returns
 * signal — the state that once pinned the loop to clockwork-polish — and the
 * moment a multi-agent ultraplan re-aim earns its cost (see docs/afk_loop.md,
 * the saturation-triggered ultraplan mode).
 */
export function isSaturated(a: Assessment): boolean {
  return a.top === null || a.top.score <= SATURATION_FLOOR;
}

/** Deterministically assess the repo and rank the next-best improvements. */
export function assess(root: string): Assessment {
  const api = createToolApi({ root });
  const { stories } = api.list_stories();

  const packsByMode: Record<string, number> = { cyoa: 0, parser: 0, rpg: 0 };
  const packs: PackHealth[] = [];
  const candidates: ImprovementCandidate[] = [];

  // ── Per-pack health via deterministic coverage playtest (fixed runs) ──────────
  for (const s of stories) {
    if (s.mode) packsByMode[s.mode] = (packsByMode[s.mode] ?? 0) + 1;
    if (!s.playable) {
      packs.push({
        path: s.path,
        mode: s.mode,
        playable: false,
        endingsDeclared: 0,
        endingsReached: 0,
        unvisited: [],
        warnings: 0,
      });
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
    const report = api.validate_pack({ pack_path: s.path });
    const warnings = report.report.findings.filter((f) => f.severity === "warning").length;
    let pt: ReturnType<typeof api.run_playtest> | null;
    try {
      pt = api.run_playtest({ story_path: s.path, strategy: "coverage", runs: 30 });
    } catch {
      pt = null;
    }
    const declared = pt?.endings_declared ?? [];
    const reached = pt ? Object.keys(pt.ending_distribution) : [];
    const unreached = declared.filter((e) => !reached.includes(e));
    const unvisited = pt?.unvisited_scenes ?? [];
    packs.push({
      path: s.path,
      mode: s.mode,
      playable: true,
      endingsDeclared: declared.length,
      endingsReached: reached.length,
      unvisited,
      warnings,
    });

    // content_fix candidate when there is room to improve. CRUCIAL: the coverage
    // BOT is a heuristic with NO planning, so in *puzzle* games its failure to reach
    // an ending (or a gated room) is EXPECTED, not a content flaw — those packs ship
    // passing walkthrough/acceptance tests proving they're winnable. Letting
    // bot-coverage drive content_fix there sends the loop chasing phantom fixes.
    //
    // The dividing line is PLANNING-GATING, not the mode label. Parser/RPG are
    // gated by nature, so bot-coverage is never a content_fix signal there. CYOA is
    // gated only if its choices carry preconditions: a PURE-BRANCHING CYOA pack lets
    // the no-planning bot reach every node (coverage gap ⇒ real signal), but a
    // GATED CYOA pack (e.g. the lockpick-gated clockwork_heist, whose
    // ending_rich/ending_truth/ending_patrol the bot reaches 1/4 every cycle while
    // the blind LLM playtest reaches all of them) is exactly as unreachable-by-bot
    // as a parser/RPG puzzle. So bot-coverage is a content_fix signal ONLY for
    // ungated CYOA; for gated CYOA and all parser/RPG the real quality signal is the
    // mandatory blind LLM playtest each cycle + validator warnings. (See
    // docs/afk_loop.md.)
    const botCoverageIsMeaningful = s.mode === "cyoa" && !isPlanningGatedCyoa(root, s.path);
    const coverageGap = botCoverageIsMeaningful ? unvisited.length + unreached.length * 2 : 0;
    const gap = warnings + coverageGap;
    if (gap > 0) {
      const impact = Math.min(5, 1 + Math.ceil(gap / 3));
      const evidence = warnings ? [`${warnings} validator warning(s)`] : [];
      if (botCoverageIsMeaningful) {
        evidence.push(
          unreached.length
            ? `unreached endings: ${unreached.join(", ")}`
            : "all endings reached by the coverage bot",
          unvisited.length
            ? `unvisited: ${unvisited.slice(0, 8).join(", ")}${unvisited.length > 8 ? "…" : ""}`
            : "full location coverage",
        );
      }
      candidates.push({
        id: `fix-${s.path}`,
        category: "content_fix",
        target: s.path,
        title: botCoverageIsMeaningful
          ? `Improve "${s.id}" — ${unreached.length} unreached ending(s), ${unvisited.length} unvisited location(s)${warnings ? `, ${warnings} warning(s)` : ""}`
          : `Fix "${s.id}" — ${warnings} validator warning(s)`,
        rationale:
          "An LLM playtest can pinpoint why these are hard to reach (signposting, clue legibility, pacing) and the fix raises player-facing quality.",
        evidence,
        impact,
        effort: "M",
        score: score(impact, "M", "content_fix"),
      });
    } else if (!botCoverageIsMeaningful && (unvisited.length > 0 || unreached.length > 0)) {
      // Parser/RPG puzzle pack the bot can't fully traverse and no validator
      // warnings: keep it on the radar at LOW priority for a fresh blind LLM
      // playtest (the only fair judge of its quality), below real fixes/new content.
      candidates.push({
        id: `playtest-${s.path}`,
        category: "content_fix",
        target: s.path,
        title: `Blind-playtest "${s.id}" — the coverage bot can't solve its puzzles, so quality is unverified`,
        rationale:
          "A heuristic bot can't plan multi-step puzzles; only a fresh blind LLM playtest reveals real signposting/clarity issues in this pack.",
        evidence: [
          `bot left ${unvisited.length} location(s) unvisited / ${unreached.length} ending(s) unreached — expected for a puzzle game, so this is a review prompt, not a known flaw`,
        ],
        impact: 1,
        effort: "M",
        score: score(1, "M", "content_fix"),
      });
    }
  }

  // ── content_new: modes that are thin relative to TARGET_PER_MODE ──────────────
  for (const [mode, target] of Object.entries(TARGET_PER_MODE)) {
    const have = packsByMode[mode] ?? 0;
    if (have < target) {
      const impact = Math.min(5, 2 + (target - have));
      candidates.push({
        id: `new-${mode}`,
        category: "content_new",
        target: mode,
        title: `Author a new ${mode} pack (${have}/${target}) to broaden the game`,
        rationale: `Only ${have} playable ${mode} pack(s) exist; more breadth exercises the engine and gives players more to do.`,
        evidence: [`${have} ${mode} pack(s) present, target ${target}`],
        impact,
        effort: "L",
        score: score(impact, "L", "content_new"),
      });
    }
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

  // ── frontier: the strategic lever once content is clean (ULTRAPLAN 2026-06-02) ─
  // When every pack validates and all blind-pass nominations have collapsed to the
  // 0.5 saturation floor, polishing already-clean prose is the lowest-value thing
  // the loop can do (the frozen-verifier + frozen-distribution stall). The repo's
  // named successor goal is a contamination-free benchmark of REAL-model authoring,
  // whose concrete first step is an objective scorecard. This lever fires while no
  // benchmark scorecard tool exists and disarms the moment one ships — the same
  // self-extinguishing shape as the eslint-coverage and doc-staleness levers. Scored
  // ABOVE the 0.5 floor so the loop reaches for structural work over re-polish, yet
  // below a genuine unplayable-pack fix (impact 5).
  const hasBenchmarkTool = [
    join(root, "bin", "benchmark.ts"),
    join(root, "scripts", "benchmark.ts"),
  ].some((p) => existsSync(p));
  if (!hasBenchmarkTool) {
    candidates.push({
      id: "frontier-benchmark-scorecard",
      category: "engine",
      target: "bin/benchmark.ts",
      title: "Build the objective benchmark scorecard (the ULTRAPLAN differentiator)",
      rationale:
        "Content is clean and blind-pass nominations have saturated at the 0.5 floor, so re-polishing is the lowest-value move. The repo's successor goal is a contamination-free benchmark of real-model authoring; its first concrete step is a scorecard that runs personas/models across every pack via run_playtest and emits a stable, comparable JSON+markdown metric (Game Progress, coverage, deaths, illegal-action rate, turns-to-win). Without a comparable number there is no benchmark.",
      evidence: [
        "no bin/benchmark.ts or scripts/benchmark.ts present",
        "see docs/ULTRAPLAN-2026-06-02.md (week horizon: objective scorecard)",
      ],
      impact: 4,
      effort: "L",
      score: score(4, "L", "engine"),
    });
  }

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
  return { packsByMode, packs, candidates, top: candidates[0] ?? null };
}

export function formatAssessment(a: Assessment): string {
  const lines: string[] = [];
  lines.push("# AFK assessment — next best improvement");
  lines.push("");
  lines.push(
    `Packs by mode: ${Object.entries(a.packsByMode)
      .map(([m, n]) => `${m}=${n}`)
      .join("  ")}`,
  );
  lines.push("");
  lines.push("## Pack health");
  for (const p of a.packs) {
    lines.push(
      `- ${p.path} [${p.mode ?? "?"}] ${p.playable ? `endings ${p.endingsReached}/${p.endingsDeclared}, unvisited ${p.unvisited.length}, warnings ${p.warnings}` : "UNPLAYABLE"}`,
    );
  }
  lines.push("");
  lines.push("## Ranked candidates");
  a.candidates.forEach((c, i) => {
    lines.push(`${i + 1}. [${c.score}] (${c.category}/${c.effort}) ${c.title}`);
    lines.push(`     why: ${c.rationale}`);
    for (const e of c.evidence) lines.push(`     · ${e}`);
  });
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
