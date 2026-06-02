/**
 * The objective benchmark scorecard (ULTRAPLAN 2026-06-02, week horizon).
 *
 * The repo's named successor goal is a contamination-free benchmark of an AI
 * playing freshly-authored, validated games on a deterministic engine. Step one is
 * a single, comparable NUMBER per (pack, agent): without it there is no benchmark.
 *
 * This produces that scorecard DETERMINISTICALLY through the same tool API external
 * agents use (list_stories / run_playtest) — no clock, no RNG, no network — so the
 * same repo always yields the same scorecard (a property a test pins). The baseline
 * "agent" is the engine's deterministic coverage/random bot; the row shape is built
 * so real frontier-model rows slot in later beside it (the contamination-free
 * held-out scores the benchmark ultimately reports). Metrics borrow the TextQuests
 * vocabulary (progress/coverage) adapted to a structured-action game.
 */
import { createToolApi } from "../mcp/tools.js";

/** One scored cell: a pack played by an agent under a strategy. */
export type BenchmarkRow = {
  pack_id: string;
  mode: string;
  agent: string;
  strategy: string;
  runs: number;
  completed: number;
  unfinished: number;
  /** Fraction of runs that reached a declared ending (Game Progress proxy). */
  completion_rate: number;
  endings_declared: number;
  endings_reached: number;
  /** Distinct declared endings reached / declared (route breadth). */
  ending_coverage: number;
  scenes_total: number;
  scenes_visited: number;
  /** Locations visited / total (exploration breadth). */
  scene_coverage: number;
};

export type Scorecard = {
  generated_by: string;
  agent: string;
  runs_per_cell: number;
  strategies: string[];
  rows: BenchmarkRow[];
  /** Packs that could not be scored (e.g. failed to run), with the reason. */
  skipped: { pack: string; reason: string }[];
};

export type BenchmarkOptions = {
  root: string;
  runs?: number;
  strategies?: ("coverage" | "random")[];
  agent?: string;
};

const r3 = (n: number): number => Math.round(n * 1000) / 1000;
const ratio = (num: number, den: number): number => (den > 0 ? r3(num / den) : 1);

/** Build the scorecard by playing every playable pack with the deterministic bot. */
export function buildScorecard(opts: BenchmarkOptions): Scorecard {
  const runs = opts.runs ?? 50;
  const strategies = opts.strategies ?? ["coverage", "random"];
  const agent = opts.agent ?? "deterministic-bot";
  const api = createToolApi({ root: opts.root });
  const { stories } = api.list_stories();

  const rows: BenchmarkRow[] = [];
  const skipped: { pack: string; reason: string }[] = [];

  for (const s of stories) {
    if (!s.playable) {
      skipped.push({ pack: s.path, reason: "unplayable (failed validation)" });
      continue;
    }
    for (const strategy of strategies) {
      try {
        const pt = api.run_playtest({ story_path: s.path, strategy, runs });
        const declared = pt.endings_declared ?? [];
        const reached = Object.keys(pt.ending_distribution ?? {});
        const scenesVisited = pt.visited_scenes?.length ?? 0;
        const scenesTotal = scenesVisited + (pt.unvisited_scenes?.length ?? 0);
        rows.push({
          pack_id: pt.pack_id,
          mode: pt.mode,
          agent,
          strategy,
          runs: pt.runs,
          completed: pt.ended,
          unfinished: pt.unfinished,
          completion_rate: ratio(pt.ended, pt.runs),
          endings_declared: declared.length,
          endings_reached: reached.length,
          ending_coverage: ratio(reached.length, declared.length),
          scenes_total: scenesTotal,
          scenes_visited: scenesVisited,
          scene_coverage: ratio(scenesVisited, scenesTotal),
        });
      } catch (e) {
        skipped.push({ pack: s.path, reason: `${strategy}: ${(e as Error).message}` });
      }
    }
  }

  // Stable, deterministic ordering independent of directory traversal order.
  rows.sort(
    (a, b) =>
      a.mode.localeCompare(b.mode) ||
      a.pack_id.localeCompare(b.pack_id) ||
      a.strategy.localeCompare(b.strategy),
  );
  skipped.sort((a, b) => a.pack.localeCompare(b.pack));

  return {
    generated_by: "bin/benchmark.ts",
    agent,
    runs_per_cell: runs,
    strategies,
    rows,
    skipped,
  };
}

export function renderJson(card: Scorecard): string {
  return JSON.stringify(card, null, 2);
}

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

export function renderMarkdown(card: Scorecard): string {
  const lines: string[] = [];
  lines.push("# Benchmark Scorecard");
  lines.push("");
  lines.push(
    `Agent: \`${card.agent}\` · ${card.runs_per_cell} runs/cell · strategies: ${card.strategies.join(", ")}`,
  );
  lines.push("");
  lines.push(
    "Objective metrics from the deterministic structured-action playtest (TextQuests-style progress/coverage). A baseline row; real frontier-model rows slot in beside it.",
  );
  lines.push("");
  lines.push("| Pack | Mode | Strategy | Completion | Endings | Ending cov | Scene cov |");
  lines.push("| --- | --- | --- | --: | --: | --: | --: |");
  for (const row of card.rows) {
    lines.push(
      `| ${row.pack_id} | ${row.mode} | ${row.strategy} | ${pct(row.completion_rate)} | ${row.endings_reached}/${row.endings_declared} | ${pct(row.ending_coverage)} | ${pct(row.scene_coverage)} |`,
    );
  }
  if (card.skipped.length > 0) {
    lines.push("");
    lines.push("## Skipped");
    for (const s of card.skipped) lines.push(`- \`${s.pack}\` — ${s.reason}`);
  }
  lines.push("");
  lines.push(
    "_Regenerate: `npm run benchmark` (markdown) · `npm run benchmark -- --json` · `--out <path>` writes .md + .json._",
  );
  return lines.join("\n");
}
