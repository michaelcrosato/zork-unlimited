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

/**
 * The rolled-up headline figure for one split (curated vs held-out), aggregated over
 * the PRIMARY baseline cell only (coverage / graph shown — see `PRIMARY_CELL`). The
 * benchmark thesis (ULTRAPLAN 2026-06-02) names "a single, comparable NUMBER per
 * (pack, agent)" as the precondition for a benchmark at all; the per-row table is the
 * evidence, but a reader still has to mean ~30 rows by hand to get the figure the
 * thesis says the benchmark "ultimately reports". This is that figure, computed
 * deterministically so the held-out (contamination-free) signal is reported as one
 * number beside the curated baseline rather than left implicit in the table.
 */
export type BenchmarkSummary = {
  split: "curated" | "held_out";
  /** The cell this summary aggregates (the documented baseline). */
  strategy: "coverage" | "random";
  hide_graph: boolean;
  /** Packs in this split scored under the primary cell. */
  packs: number;
  mean_completion_rate: number;
  mean_ending_coverage: number;
  mean_scene_coverage: number;
  /**
   * The composite 0–1 benchmark score: the mean over this split's packs of each
   * pack's own mean of (completion_rate, ending_coverage, scene_coverage). One
   * comparable number per (agent, split) — the headline the thesis calls step one.
   * The three TextQuests-style progress/coverage fractions are equally weighted;
   * `mean_turns_to_end` is deliberately excluded (an efficiency axis on a different,
   * un-normalised scale, not a 0–1 progress fraction).
   */
  score: number;
};

/**
 * The same headline composite as `BenchmarkSummary`, but sliced per MODE within a
 * split (bug_0198). The cross-mode `BenchmarkSummary` score is a flat mean over a
 * split's packs, so it is sensitive to the split's MODE COMPOSITION: the coverage
 * bot completes CYOA packs (~0.7 composite) but cannot plan the multi-step parser/RPG
 * puzzle packs (~0.15), so a split that is CYOA-heavy scores higher than one that is
 * puzzle-heavy regardless of any contamination signal. The curated split keeps
 * gaining hand-authored puzzle packs while the held-out corpus stays mode-balanced
 * (4 CYOA / 4 parser / 4 RPG), so the cross-mode curated→held-out gap was eroding
 * toward `MIN_SPLIT_GAP` purely as a composition artifact — the `benchmark_headline`
 * WATCH (bug_0196). This per-mode slice measures the contamination signal
 * apples-to-apples: held-out vs curated WITHIN the same mode, where pack difficulty is
 * held roughly constant, so the gap reflects the held-out-vs-curated difference rather
 * than the mode mix. The signal is real only in the mode the bot can actually complete
 * (CYOA); in the puzzle modes both splits floor out near the bot's planning ceiling.
 */
export type BenchmarkModeSummary = {
  split: "curated" | "held_out";
  mode: string;
  strategy: "coverage" | "random";
  hide_graph: boolean;
  packs: number;
  score: number;
};

export type Scorecard = {
  generated_by: string;
  agent: string;
  runs_per_cell: number;
  cells: BenchmarkCell[];
  rows: BenchmarkRow[];
  /**
   * Per-split headline aggregates over the primary baseline cell, curated split
   * before held-out. Empty when the primary cell was not among the scored cells
   * (e.g. a custom `--cells` run) — the per-row table is always authoritative.
   */
  summary: BenchmarkSummary[];
  /**
   * The headline composite sliced per (split, mode) over the primary baseline cell
   * (bug_0198), ordered mode-alphabetical with curated before held-out within each
   * mode so each mode's curated/held-out pair sits adjacent. The composition-robust
   * companion to `summary`: the contamination signal read apples-to-apples within a
   * mode, immune to the curated split's drifting mode mix. Empty under the same
   * condition as `summary` (no primary-cell rows scored).
   */
  mode_summary: BenchmarkModeSummary[];
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

/**
 * The cell the headline summary aggregates: the coverage bot with the room graph
 * SHOWN. This is the canonical baseline — `random` is graph-agnostic noise and the
 * `hidden` row is an auxiliary spatial-difficulty axis, so neither is the figure a
 * model is primarily compared against. Aggregating one well-defined cell keeps the
 * single number meaning the same thing for every agent.
 */
const PRIMARY_CELL: BenchmarkCell = { strategy: "coverage", hide_graph: false };

const r3 = (n: number): number => Math.round(n * 1000) / 1000;
const ratio = (num: number, den: number): number => (den > 0 ? r3(num / den) : 1);

/** A row's composite progress score: the equal-weight mean of its three 0–1 fractions. */
const rowScore = (r: BenchmarkRow): number =>
  (r.completion_rate + r.ending_coverage + r.scene_coverage) / 3;

const mean = (xs: number[]): number =>
  xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

/**
 * Roll the primary-cell rows up into one headline figure per split. Curated before
 * held-out (matching the row ordering); a split with no primary-cell rows is omitted.
 */
function summarize(rows: BenchmarkRow[]): BenchmarkSummary[] {
  const out: BenchmarkSummary[] = [];
  for (const [split, heldOut] of [
    ["curated", false],
    ["held_out", true],
  ] as const) {
    const cellRows = rows.filter(
      (r) =>
        r.held_out === heldOut &&
        r.strategy === PRIMARY_CELL.strategy &&
        r.hide_graph === PRIMARY_CELL.hide_graph,
    );
    if (cellRows.length === 0) continue;
    out.push({
      split,
      strategy: PRIMARY_CELL.strategy,
      hide_graph: PRIMARY_CELL.hide_graph,
      packs: cellRows.length,
      mean_completion_rate: r3(mean(cellRows.map((r) => r.completion_rate))),
      mean_ending_coverage: r3(mean(cellRows.map((r) => r.ending_coverage))),
      mean_scene_coverage: r3(mean(cellRows.map((r) => r.scene_coverage))),
      score: r3(mean(cellRows.map(rowScore))),
    });
  }
  return out;
}

/**
 * Slice the primary-cell rows into one composite per (split, mode) — the
 * composition-robust companion to `summarize` (bug_0198). Ordered mode-alphabetical,
 * curated before held-out within each mode, so each mode's curated/held-out pair is
 * adjacent in the rendered table; a (split, mode) with no primary-cell rows is omitted.
 */
function summarizeByMode(rows: BenchmarkRow[]): BenchmarkModeSummary[] {
  const primary = rows.filter(
    (r) => r.strategy === PRIMARY_CELL.strategy && r.hide_graph === PRIMARY_CELL.hide_graph,
  );
  const modes = [...new Set(primary.map((r) => r.mode))].sort((a, b) => a.localeCompare(b));
  const out: BenchmarkModeSummary[] = [];
  for (const mode of modes) {
    for (const [split, heldOut] of [
      ["curated", false],
      ["held_out", true],
    ] as const) {
      const cellRows = primary.filter((r) => r.mode === mode && r.held_out === heldOut);
      if (cellRows.length === 0) continue;
      out.push({
        split,
        mode,
        strategy: PRIMARY_CELL.strategy,
        hide_graph: PRIMARY_CELL.hide_graph,
        packs: cellRows.length,
        score: r3(mean(cellRows.map(rowScore))),
      });
    }
  }
  return out;
}

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
    summary: summarize(rows),
    mode_summary: summarizeByMode(rows),
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

  // The headline: roll the per-split rows up into the single comparable number the
  // benchmark thesis names as step one, so the contamination-free held-out score is
  // reported as a figure rather than left to be averaged out of the table by hand.
  const [primary] = card.summary;
  if (primary) {
    lines.push("## Headline");
    lines.push("");
    lines.push(
      `One comparable number per split: \`Score\` is the mean over the split's packs of each pack's mean of (completion, ending coverage, scene coverage), scored on the baseline \`${primary.strategy}\` strategy with the graph shown. The \`held-out\` score is the contamination-free figure the benchmark ultimately reports.`,
    );
    lines.push("");
    lines.push("| Split | Packs | Completion | Ending cov | Scene cov | **Score** |");
    lines.push("| --- | --: | --: | --: | --: | --: |");
    for (const s of card.summary) {
      lines.push(
        `| ${s.split === "held_out" ? "held-out" : "curated"} | ${s.packs} | ${pct(s.mean_completion_rate)} | ${pct(s.mean_ending_coverage)} | ${pct(s.mean_scene_coverage)} | **${pct(s.score)}** |`,
      );
    }
    lines.push("");

    // The composition-robust slice (bug_0198): the same composite per (split, mode).
    // The cross-mode Score above is a flat pack-mean, so it tracks the split's mode MIX
    // (the bot completes CYOA but cannot plan parser/RPG puzzles); read the
    // contamination gap mode-by-mode here, where pack difficulty is roughly held
    // constant, rather than off the composition-sensitive headline.
    if (card.mode_summary.length > 0) {
      lines.push("### Per-mode (composition-robust)");
      lines.push("");
      lines.push(
        "The headline `Score` is a flat mean over a split's packs, so it moves with the split's mode MIX: the baseline bot completes CYOA packs but cannot plan the multi-step parser/RPG puzzles, so a puzzle-heavy split scores lower regardless of contamination. The curated split keeps gaining authored puzzle packs while the held-out corpus stays mode-balanced, so the cross-mode curated→held-out gap erodes as a composition artifact. This slice reads the held-out-vs-curated signal WITHIN each mode, where difficulty is roughly constant — the contamination gap is real only in the mode the bot can complete (CYOA); the puzzle modes floor out near the bot's planning ceiling in both splits.",
      );
      lines.push("");
      lines.push("| Mode | Split | Packs | **Score** |");
      lines.push("| --- | --- | --: | --: |");
      for (const s of card.mode_summary) {
        lines.push(
          `| ${s.mode} | ${s.split === "held_out" ? "held-out" : "curated"} | ${s.packs} | **${pct(s.score)}** |`,
        );
      }
      lines.push("");
    }
  }

  lines.push("## Per-pack rows");
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
