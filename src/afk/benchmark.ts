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
 *
 * The hide_graph axis (ULTRAPLAN §Week.4, bug_0137/0138) makes the spatial-reasoning
 * difficulty measurable: the coverage bot is scored both with the room graph shown
 * (exits reveal their destination) and hidden (it must navigate blind). The
 * shown→hidden scene-coverage drop on parser/RPG packs is the deterministic baseline
 * a spatial-reasoning model is measured against; CYOA has no room graph so its hidden
 * row equals its shown row.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createToolApi } from "../mcp/tools.js";

/** One scored cell: a pack played by an agent under a strategy. */
export type BenchmarkRow = {
  pack_id: string;
  mode: string;
  agent: string;
  strategy: string;
  /**
   * Whether the room graph was HIDDEN from the agent's observation (exits show a
   * direction but not their destination, ULTRAPLAN §Week.4). The spatial-difficulty
   * axis: with the graph the bot reads adjacency off the observation; with it
   * hidden the bot must navigate blind. A no-op for CYOA (it has no room graph), so
   * a CYOA pack's hidden row equals its shown row — the honest "no spatial dimension".
   */
  hide_graph: boolean;
  /**
   * Whether this row scores a pack from the contamination-free HELD-OUT split — a
   * procedurally-generated pack sealed under `corpus/` (never under a curated
   * `content/<mode>/pack` dir, so no external agent or training corpus could have
   * seen it; the git commit
   * timestamp is its chain-of-custody). The curated rows (`held_out: false`) score the
   * ten authored disk packs; the held-out rows are the uncontaminated signal the
   * benchmark thesis ultimately reports (ULTRAPLAN 2026-06-02; sealed by
   * `bin/seal-corpus.ts`, re-mint-verified by the held-out-corpus regression gate).
   * The split is per-row so the same table reports both side by side.
   */
  held_out: boolean;
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
  /**
   * Mean actions taken to reach an ending, over the COMPLETED runs only (0 when none
   * completed; rendered `—`). An efficiency axis (ULTRAPLAN §Week.4): fewer turns = a
   * more direct route. Designed to pair with `hide_graph` as a second spatial signal —
   * an agent that completes a parser/RPG pack both ways wanders more when blind, so the
   * shown→hidden RISE in turns-to-end complements the scene-coverage drop. (The baseline
   * coverage bot completes 0% of the spatial puzzle packs, so that pairing only populates
   * for more capable agent rows.) CYOA has no room graph, so its hidden value equals shown.
   */
  mean_turns_to_end: number;
};

/** A scored configuration: one play strategy, with the room graph shown or hidden. */
export type BenchmarkCell = { strategy: "coverage" | "random"; hide_graph: boolean };

export type Scorecard = {
  generated_by: string;
  agent: string;
  runs_per_cell: number;
  cells: BenchmarkCell[];
  rows: BenchmarkRow[];
  /** Packs that could not be scored (e.g. failed to run), with the reason. */
  skipped: { pack: string; reason: string }[];
};

export type BenchmarkOptions = {
  root: string;
  runs?: number;
  cells?: BenchmarkCell[];
  agent?: string;
};

/**
 * The default scored cells. `random` is graph-agnostic (it never consults exit
 * destinations), so it is scored only with the graph shown — a hidden-graph random
 * row would be byte-identical noise. `coverage` is scored BOTH ways: the delta
 * between its shown and hidden scene-coverage is the measurable cost of hiding the
 * graph — the deterministic baseline a spatial-reasoning model is measured against.
 */
const DEFAULT_CELLS: BenchmarkCell[] = [
  { strategy: "coverage", hide_graph: false },
  { strategy: "random", hide_graph: false },
  { strategy: "coverage", hide_graph: true },
];

const r3 = (n: number): number => Math.round(n * 1000) / 1000;
const ratio = (num: number, den: number): number => (den > 0 ? r3(num / den) : 1);

/** Build the scorecard by playing every playable pack with the deterministic bot. */
export function buildScorecard(opts: BenchmarkOptions): Scorecard {
  const runs = opts.runs ?? 50;
  const cells = opts.cells ?? DEFAULT_CELLS;
  const agent = opts.agent ?? "deterministic-bot";
  const api = createToolApi({ root: opts.root });
  const { stories } = api.list_stories();

  const rows: BenchmarkRow[] = [];
  const skipped: { pack: string; reason: string }[] = [];

  // Score one pack across every configured cell, tagging its rows with the split it
  // belongs to (curated authored packs vs the held-out corpus). Shared so both splits
  // are measured through the identical run_playtest path — the only difference is the
  // `held_out` flag, which keeps the two comparable in one table.
  const scorePack = (storyPath: string, heldOut: boolean): void => {
    for (const cell of cells) {
      try {
        const pt = api.run_playtest({
          story_path: storyPath,
          strategy: cell.strategy,
          runs,
          hide_graph: cell.hide_graph,
        });
        const declared = pt.endings_declared ?? [];
        const reached = Object.keys(pt.ending_distribution ?? {});
        const scenesVisited = pt.visited_scenes?.length ?? 0;
        const scenesTotal = scenesVisited + (pt.unvisited_scenes?.length ?? 0);
        rows.push({
          pack_id: pt.pack_id,
          mode: pt.mode,
          agent,
          strategy: cell.strategy,
          hide_graph: cell.hide_graph,
          held_out: heldOut,
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
          mean_turns_to_end: pt.mean_turns_to_end ?? 0,
        });
      } catch (e) {
        const tag = `${cell.strategy}${cell.hide_graph ? " (hidden graph)" : ""}`;
        skipped.push({ pack: storyPath, reason: `${tag}: ${(e as Error).message}` });
      }
    }
  };

  // The curated split: the authored disk packs discovered under content/*/pack.
  for (const s of stories) {
    if (!s.playable) {
      skipped.push({ pack: s.path, reason: "unplayable (failed validation)" });
      continue;
    }
    scorePack(s.path, false);
  }

  // The held-out split: the sealed procedural corpus (corpus/manifest.json is its
  // authoritative membership). Scored through the SAME bot/cells so its rows slot into
  // the same table as the uncontaminated counterpart to the curated rows. Absent
  // (un-sealed) corpus simply yields no held-out rows — the scorecard stays valid.
  const manifestPath = join(opts.root, "corpus", "manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      entries?: { mode: string; pack_id: string }[];
    };
    for (const entry of manifest.entries ?? []) {
      scorePack(join(opts.root, "corpus", entry.mode, `${entry.pack_id}.yaml`), true);
    }
  }

  // Stable, deterministic ordering independent of directory traversal order. The
  // curated split sorts before the held-out split so the table reads as two blocks.
  rows.sort(
    (a, b) =>
      Number(a.held_out) - Number(b.held_out) ||
      a.mode.localeCompare(b.mode) ||
      a.pack_id.localeCompare(b.pack_id) ||
      a.strategy.localeCompare(b.strategy) ||
      Number(a.hide_graph) - Number(b.hide_graph),
  );
  skipped.sort((a, b) => a.pack.localeCompare(b.pack));

  return {
    generated_by: "bin/benchmark.ts",
    agent,
    runs_per_cell: runs,
    cells,
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
  const cellList = card.cells
    .map((c) => `${c.strategy}${c.hide_graph ? "/hidden-graph" : ""}`)
    .join(", ");
  lines.push(`Agent: \`${card.agent}\` · ${card.runs_per_cell} runs/cell · cells: ${cellList}`);
  lines.push("");
  lines.push(
    "Objective metrics from the deterministic structured-action playtest (TextQuests-style progress/coverage). A baseline row; real frontier-model rows slot in beside it.",
  );
  lines.push("");
  lines.push(
    "The `Graph` column marks whether the room graph was hidden (ULTRAPLAN §Week.4): with it hidden the bot must navigate blind, so the coverage drop from `shown`→`hidden` on parser/RPG packs is the spatial-reasoning difficulty a model is scored against. CYOA has no room graph, so its hidden row matches its shown row.",
  );
  lines.push("");
  lines.push(
    "`Turns→end` is the mean number of actions to reach an ending over completed runs (efficiency: fewer = a more direct route; `—` when no run completed). It is designed to pair with the `Graph` axis: an agent that completes a parser/RPG pack BOTH ways takes more turns navigating blind, so a shown→hidden rise in turns-to-end is a second spatial-difficulty signal beside the scene-coverage drop. The baseline coverage bot completes 0% of the spatial puzzle packs (it can't plan multi-step solutions), so its turns-to-end there reads `—`; the pairing populates as capable agent rows are added.",
  );
  lines.push("");
  lines.push(
    "The `Split` column marks whether the pack is `curated` (an authored disk pack under content/*/pack) or `held-out` (a procedurally-generated pack sealed under corpus/ that no external agent or training set could have seen). The held-out rows are the contamination-free signal the benchmark ultimately reports — measured through the identical bot and cells, so they are directly comparable to the curated baseline.",
  );
  lines.push("");
  lines.push(
    "| Pack | Mode | Strategy | Graph | Split | Completion | Endings | Ending cov | Scene cov | Turns→end |",
  );
  lines.push("| --- | --- | --- | --- | --- | --: | --: | --: | --: | --: |");
  for (const row of card.rows) {
    // Turns-to-end is meaningful only when the bot actually completed a run; show a
    // dash rather than a misleading "0.0" when nothing ended.
    const turns = row.completed > 0 ? row.mean_turns_to_end.toFixed(1) : "—";
    lines.push(
      `| ${row.pack_id} | ${row.mode} | ${row.strategy} | ${row.hide_graph ? "hidden" : "shown"} | ${row.held_out ? "held-out" : "curated"} | ${pct(row.completion_rate)} | ${row.endings_reached}/${row.endings_declared} | ${pct(row.ending_coverage)} | ${pct(row.scene_coverage)} | ${turns} |`,
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
