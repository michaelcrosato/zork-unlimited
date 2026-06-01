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
    // BOT is a heuristic with NO planning, so in parser/RPG *puzzle* games its
    // failure to reach an ending (or a gated room) is EXPECTED, not a content flaw
    // — those packs ship passing walkthrough/acceptance tests proving they're
    // winnable. Letting bot-coverage drive content_fix there sends the loop chasing
    // phantom fixes. So bot-coverage is a content_fix signal for CYOA ONLY (where a
    // no-planning bot can legitimately reach every node); for parser/RPG the real
    // quality signal is the mandatory blind LLM playtest each cycle + validator
    // warnings. (See docs/afk_loop.md.)
    const botCoverageIsMeaningful = s.mode === "cyoa";
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
  const hasEslint = [
    "eslint.config.js",
    "eslint.config.mjs",
    ".eslintrc",
    ".eslintrc.json",
    ".eslintrc.cjs",
  ].some((f) => existsSync(join(root, f)));
  if (!hasEslint) {
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
  }

  // Deterministic ordering: score desc, then id asc.
  candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
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
