/**
 * Crawl run orchestration — turns CLI flags into a deterministic plan of
 * per-quest (and, from Task 8, overworld) crawl jobs, runs the plan
 * single-process, and writes the run's artifacts (findings.jsonl,
 * summary.json, summary.md).
 *
 * `parseCrawlArgs` and `buildPlan` are pure (no I/O beyond `listShippedQuestIds`'s
 * directory read, no wall clock) so they are unit-testable without running a
 * crawl. `runPlanInProcess` and `writeRunArtifacts` do the actual work and are
 * exercised by the live checkpoints instead (see bin/crawl.ts and the task brief).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalize } from "../core/hash.js";
import { CrawlFindingSchema, findingFingerprint, type CrawlFinding } from "./findings.js";
import { POLICY_NAMES, type PolicyName } from "./policies.js";
import { listShippedQuestIds, prepareShippedQuest, type PreparedQuest } from "./prepare.js";
import { crawlQuest } from "./quest_crawler.js";

export type CrawlPlanItem =
  | { kind: "quest"; questId: string; seeds: number[]; stepsPerSeed: number }
  | { kind: "overworld"; seed: number }; // overworld handled in Task 8

export type CrawlRunOptions = {
  root: string;
  policy: PolicyName;
  commit: string;
  quests: string[] | "all";
  overworld: boolean;
  seeds: number[];
  stepsPerSeed: number;
  secondsBudget?: number;
  solverBudget: number;
  persistEvery: number;
  outDir: string;
  workers: number;
};

/**
 * Task 8 (`src/crawl/coverage.ts`) owns the canonical definition; mirrored here
 * so `CrawlRunSummary` compiles before that file exists. Task 8 modifies this
 * file anyway (to wire the `overworld` plan item) and is expected to import the
 * real type and drop this local copy at that point.
 */
export type OverworldCoverageSummary = {
  nodes: { visited: number; total: number; orphans: string[] };
  edges: { traveled: number; total: number; orphans: string[] };
  boards: { read: number; total: number };
  quests: { entered: string[]; total: number };
};

export type QuestCoverageSummary = {
  roomsVisited: number;
  roomsTotal: number;
  actionsTried: number;
  actionsTotal: number;
  endingsReached: string[];
  endingsDeclared: string[];
  orphans: { rooms: string[]; endings: string[] };
};

export type CrawlRunSummary = {
  findings: CrawlFinding[];
  countsByCode: Record<string, number>;
  steps: number;
  wallMs: number;
  stepsPerSec: number;
  questCoverage: Record<string, QuestCoverageSummary>;
  overworld?: OverworldCoverageSummary; // Task 8
  /** Set true only when the soft `secondsBudget` cutoff caused one or more plan
   *  items to be skipped (checked between items, never mid-quest). */
  truncated?: boolean;
  /** Human-readable descriptions of any plan items that did not run — either the
   *  seconds budget was exceeded, or (until Task 8 wires `crawlOverworld`) the
   *  overworld item isn't implemented yet. Always populated when non-empty —
   *  a skip is never silent. */
  skippedItems?: string[];
};

export class CrawlUsageError extends Error {}

/** Parsed CLI options, minus the fields the caller supplies at the call site
 *  (`root`/`commit` are resolved outside argument parsing; `outDir` is only
 *  present when `--out` was given explicitly — the wall-clock default lives in
 *  `defaultOutDir`, never inside this pure parser). */
export type ParsedCrawlArgs = Omit<CrawlRunOptions, "root" | "commit" | "outDir"> & {
  outDir?: string;
};

function requireValue(flag: string, raw: string | undefined): string {
  if (raw === undefined) throw new CrawlUsageError(`${flag} requires a value`);
  return raw;
}

function parseNonNegativeInt(flag: string, raw: string | undefined): number {
  const value = requireValue(flag, raw);
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new CrawlUsageError(`${flag} must be a non-negative integer, got "${value}"`);
  }
  return n;
}

function parseSeeds(flag: string, raw: string | undefined): number[] {
  const value = requireValue(flag, raw);
  const range = /^(-?\d+)\.\.(-?\d+)$/.exec(value);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a > b) throw new CrawlUsageError(`${flag} range must be ascending, got "${value}"`);
    const seeds: number[] = [];
    for (let s = a; s <= b; s++) seeds.push(s);
    return seeds;
  }
  if (/^-?\d+$/.test(value)) return [Number(value)];
  throw new CrawlUsageError(`${flag} must be "A..B" or a single integer, got "${value}"`);
}

/**
 * Hand-rolled flag parser (no dependency), in the spirit of bin/replay.ts's
 * `arg()` helper. Pure and wall-clock-free: two calls with the same argv are
 * deep-equal (required by `--smoke`'s determinism contract).
 */
export function parseCrawlArgs(argv: string[]): ParsedCrawlArgs {
  const quests: string[] = [];
  let overworld = true;
  let overworldExplicit = false;
  let policy: PolicyName = "mixed";
  let stepsPerSeed = 400;
  let secondsBudget: number | undefined;
  let seeds = [1, 2, 3];
  let workers = 1;
  let solverBudget = 0;
  let persistEvery = 37;
  let outDir: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case "--quest":
        quests.push(requireValue("--quest", argv[++i]));
        break;
      case "--overworld":
        overworld = true;
        overworldExplicit = true;
        break;
      case "--no-overworld":
        overworld = false;
        overworldExplicit = true;
        break;
      case "--policy": {
        const v = requireValue("--policy", argv[++i]);
        if (!(POLICY_NAMES as readonly string[]).includes(v)) {
          throw new CrawlUsageError(
            `--policy must be one of ${POLICY_NAMES.join("|")}, got "${v}"`,
          );
        }
        policy = v as PolicyName;
        break;
      }
      case "--steps":
        stepsPerSeed = parseNonNegativeInt("--steps", argv[++i]);
        break;
      case "--seconds": {
        const n = parseNonNegativeInt("--seconds", argv[++i]);
        secondsBudget = n > 0 ? n : undefined;
        break;
      }
      case "--seeds":
        seeds = parseSeeds("--seeds", argv[++i]);
        break;
      case "--workers": {
        const n = parseNonNegativeInt("--workers", argv[++i]);
        if (n < 1) throw new CrawlUsageError("--workers must be >= 1");
        workers = n;
        break;
      }
      case "--solver-budget":
        solverBudget = parseNonNegativeInt("--solver-budget", argv[++i]);
        break;
      case "--out":
        outDir = requireValue("--out", argv[++i]);
        break;
      case "--smoke":
        policy = "mixed";
        seeds = [1, 2];
        stepsPerSeed = 250;
        solverBudget = 0;
        overworld = true;
        overworldExplicit = true;
        quests.length = 0;
        workers = 1;
        secondsBudget = undefined;
        break;
      case "--deep":
        seeds = parseSeeds("--deep", "1000..1063");
        stepsPerSeed = 2000;
        solverBudget = 20000;
        persistEvery = 37;
        workers = 8;
        secondsBudget = 900;
        break;
      default:
        throw new CrawlUsageError(`unknown flag: ${a}`);
    }
  }

  if (!overworldExplicit) overworld = quests.length === 0;

  return {
    quests: quests.length > 0 ? quests : "all",
    overworld,
    policy,
    stepsPerSeed,
    seeds,
    workers,
    solverBudget,
    persistEvery,
    ...(secondsBudget !== undefined ? { secondsBudget } : {}),
    ...(outDir !== undefined ? { outDir } : {}),
  };
}

/** Default `--out` directory: `ai-runs/crawl/<UTC yyyymmddThhmmssZ>`. Wall-clock
 *  is confined to this one naming helper (never called from the pure parser/plan
 *  builder above) — output naming/metadata only, never findings content. */
export function defaultOutDir(now: Date = new Date()): string {
  const pad = (n: number, w = 2): string => String(n).padStart(w, "0");
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  return join("ai-runs", "crawl", stamp);
}

/** Deterministic order: quests sorted by id, then the overworld item (if any). */
export function buildPlan(opts: CrawlRunOptions): CrawlPlanItem[] {
  const questIds = opts.quests === "all" ? listShippedQuestIds(opts.root) : [...opts.quests];
  const sorted = [...questIds].sort();
  const items: CrawlPlanItem[] = sorted.map((questId) => ({
    kind: "quest",
    questId,
    seeds: [...opts.seeds],
    stepsPerSeed: opts.stepsPerSeed,
  }));
  if (opts.overworld) {
    items.push({ kind: "overworld", seed: opts.seeds[0] ?? 1 });
  }
  return items;
}

function describePlanItem(item: CrawlPlanItem): string {
  return item.kind === "quest" ? `quest:${item.questId}` : `overworld:seed${item.seed}`;
}

/**
 * Static, declared-content totals for a prepared quest — the denominators for
 * `questCoverage`. Deliberately a content-surface count (declared rooms/exits/
 * interactions/topics/enemies from the pack), not a state-space reachability
 * proof: the latter would need to explore every state combination a run's
 * seeds may never visit, which is out of scope here and would make `--smoke`
 * far too slow. `roomsTotal`/`endingsDeclared` are exact; `actionsTotal` is a
 * coarse upper-bound-ish estimate for a coverage ratio, not an exact action-id
 * census (a real one would double as `enumerateRpgActions`'s ground truth run
 * over the full reachable state space).
 */
function computeQuestTotals(prepared: PreparedQuest): {
  roomsTotal: number;
  allRoomIds: string[];
  endingsDeclared: string[];
  actionsTotal: number;
} {
  const pack = prepared.index.pack;
  const allRoomIds = pack.rooms.map((r) => r.id).sort();
  const endingsDeclared = [...new Set(pack.endings.map((e) => e.id))].sort();

  let actionsTotal = 0;
  for (const room of pack.rooms) actionsTotal += room.exits.length; // MOVE
  for (const obj of pack.objects) {
    if (obj.takeable) actionsTotal += 1; // TAKE
    actionsTotal += obj.interactions.length; // USE/READ/INSPECT/OPEN/CLOSE
  }
  for (const npc of pack.npcs) {
    for (const node of npc.dialogue.nodes) actionsTotal += node.topics.length; // ASK
  }
  actionsTotal += pack.enemies.length; // ATTACK

  return { roomsTotal: allRoomIds.length, allRoomIds, endingsDeclared, actionsTotal };
}

/** Fingerprint-based dedupe over already-built findings from possibly-different
 *  seeds/quests — NOT `FindingCollector.add` (that stamps its own base seed onto
 *  every finding, which would misattribute which seed a kept duplicate came
 *  from). Keeps the first occurrence in input order. */
export function dedupeFindings(findings: readonly CrawlFinding[]): CrawlFinding[] {
  const seen = new Set<string>();
  const out: CrawlFinding[] = [];
  for (const f of findings) {
    const fp = findingFingerprint(f);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(f);
  }
  return out;
}

function findingSortKey(f: CrawlFinding): string {
  const questId = f.location.questId ?? f.location.node ?? "";
  const step = String(f.step).padStart(12, "0");
  return `${questId} ${f.code} ${step} ${findingFingerprint(f)}`;
}

/** Deterministic order for artifacts/printing: `(questId, code, step, fingerprint)`. */
export function sortFindings(findings: readonly CrawlFinding[]): CrawlFinding[] {
  return [...findings].sort((a, b) => {
    const ka = findingSortKey(a);
    const kb = findingSortKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/**
 * Overworld crawl seam — Task 8 fills this in with `crawlOverworld`
 * (src/crawl/overworld_crawler.ts). Returns `null` for now so `runPlanInProcess`
 * can cleanly SKIP the item (logged to stderr, recorded in `skippedItems`) —
 * never throws, since a thrown "not yet implemented" would fail `crawl:smoke`.
 */
function runOverworldItem(
  _item: Extract<CrawlPlanItem, { kind: "overworld" }>,
  _opts: CrawlRunOptions,
): { findings: CrawlFinding[]; overworld: OverworldCoverageSummary } | null {
  return null;
}

/** Run a plan single-process (worker fan-out lands in Task 10). */
export function runPlanInProcess(items: CrawlPlanItem[], opts: CrawlRunOptions): CrawlRunSummary {
  const wallStart = Date.now();
  const deadline =
    opts.secondsBudget !== undefined && opts.secondsBudget > 0
      ? wallStart + opts.secondsBudget * 1000
      : null;

  const allFindings: CrawlFinding[] = [];
  const questCoverage: Record<string, QuestCoverageSummary> = {};
  let overworld: OverworldCoverageSummary | undefined;
  let totalSteps = 0;
  let truncated = false;
  const skippedItems: string[] = [];

  for (const item of items) {
    // Soft wall-clock cutoff: checked BETWEEN plan items only, never mid-quest —
    // a (quest,seed) episode always finishes once started.
    if (deadline !== null && Date.now() >= deadline) {
      truncated = true;
      skippedItems.push(describePlanItem(item));
      continue;
    }

    if (item.kind === "quest") {
      const prepared = prepareShippedQuest(opts.root, item.questId);
      const totals = computeQuestTotals(prepared);
      const roomsVisited = new Set<string>();
      const actionsTried = new Set<string>();
      const endingsReached = new Set<string>();

      for (const seed of item.seeds) {
        const result = crawlQuest(prepared, {
          seed,
          maxSteps: item.stepsPerSeed,
          policy: opts.policy,
          persistEvery: opts.persistEvery,
          solverBudget: opts.solverBudget,
          commit: opts.commit,
        });
        totalSteps += result.steps;
        allFindings.push(...result.findings);
        for (const r of result.coverage.roomsVisited) roomsVisited.add(r);
        for (const a of result.coverage.actionIdsTried) actionsTried.add(a);
        for (const e of result.endingsReached) endingsReached.add(e);
      }

      questCoverage[item.questId] = {
        roomsVisited: roomsVisited.size,
        roomsTotal: totals.roomsTotal,
        actionsTried: actionsTried.size,
        actionsTotal: totals.actionsTotal,
        endingsReached: [...endingsReached].sort(),
        endingsDeclared: totals.endingsDeclared,
        orphans: {
          rooms: totals.allRoomIds.filter((id) => !roomsVisited.has(id)),
          endings: totals.endingsDeclared.filter((id) => !endingsReached.has(id)),
        },
      };
    } else {
      const result = runOverworldItem(item, opts);
      if (result === null) {
        console.error("overworld crawler lands in the next task");
        skippedItems.push(describePlanItem(item));
      } else {
        allFindings.push(...result.findings);
        overworld = result.overworld;
      }
    }
  }

  const findings = dedupeFindings(allFindings);
  const countsByCode: Record<string, number> = {};
  for (const f of findings) countsByCode[f.code] = (countsByCode[f.code] ?? 0) + 1;

  const wallMs = Date.now() - wallStart;
  const stepsPerSec = wallMs > 0 ? (totalSteps / wallMs) * 1000 : totalSteps;

  return {
    findings,
    countsByCode,
    steps: totalSteps,
    wallMs,
    stepsPerSec,
    questCoverage,
    ...(overworld !== undefined ? { overworld } : {}),
    ...(truncated ? { truncated: true } : {}),
    ...(skippedItems.length > 0 ? { skippedItems } : {}),
  };
}

function renderSummaryMarkdown(
  summary: CrawlRunSummary,
  meta: { argv: string[]; commit: string; startedAt: string },
): string {
  const lines: string[] = [];
  lines.push("# crawl run summary", "");
  lines.push(`commit: ${meta.commit}`);
  lines.push(`argv: ${meta.argv.join(" ")}`, "");

  const nonOrphan = summary.findings.filter((f) => f.code !== "ORPHAN");
  lines.push(`## Findings (${summary.findings.length} total, ${nonOrphan.length} non-ORPHAN)`, "");
  if (summary.findings.length === 0) {
    lines.push("No findings.", "");
  } else {
    for (const f of sortFindings(summary.findings)) {
      const loc = f.location.questId ?? f.location.node ?? "?";
      const scene = f.location.sceneId ?? "-";
      lines.push(`- ${f.code} ${f.severity} ${loc}/${scene} ${f.message}`);
    }
    lines.push("");
  }

  lines.push("## Quest coverage", "");
  for (const questId of Object.keys(summary.questCoverage).sort()) {
    const c = summary.questCoverage[questId]!;
    lines.push(
      `- ${questId}: rooms ${c.roomsVisited}/${c.roomsTotal}, actions ${c.actionsTried}/${c.actionsTotal}, ` +
        `endings ${c.endingsReached.length}/${c.endingsDeclared.length} reached=[${c.endingsReached.join(", ")}], ` +
        `orphan rooms=[${c.orphans.rooms.join(", ")}], orphan endings=[${c.orphans.endings.join(", ")}]`,
    );
  }
  lines.push("");

  if (summary.overworld) {
    const ow = summary.overworld;
    lines.push("## Overworld coverage", "");
    lines.push(`- nodes: ${ow.nodes.visited}/${ow.nodes.total}`);
    lines.push(`- edges: ${ow.edges.traveled}/${ow.edges.total}`);
    lines.push(`- boards: ${ow.boards.read}/${ow.boards.total}`);
    lines.push(`- quests entered: ${ow.quests.entered.length}/${ow.quests.total}`);
    lines.push("");
  }

  if (summary.skippedItems && summary.skippedItems.length > 0) {
    lines.push("## Skipped", "");
    lines.push(`truncated: ${summary.truncated === true}`);
    for (const s of summary.skippedItems) lines.push(`- ${s}`);
    lines.push("");
  }

  // Timing lives in its OWN block, separate from the findings section above, so
  // two `--smoke` runs with identical findings/coverage are byte-identical up to
  // this point — everything wall-clock-derived (startedAt, wallMs, steps/sec) is
  // confined here.
  lines.push("## Timing", "");
  lines.push(`- started: ${meta.startedAt}`);
  lines.push(`- steps: ${summary.steps}`);
  lines.push(`- wallMs: ${summary.wallMs}`);
  lines.push(`- steps/sec: ${summary.stepsPerSec.toFixed(1)}`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Write findings.jsonl (deduped, deterministic order), summary.json (plain
 * JSON — no zod — with wallMs/stepsPerSec moved under a `timing` key), and
 * summary.md (human-readable; findings section excludes wall-clock so
 * `--smoke` output is byte-comparable across runs).
 */
export function writeRunArtifacts(
  outDir: string,
  summary: CrawlRunSummary,
  meta: { argv: string[]; commit: string; startedAt: string },
): void {
  mkdirSync(outDir, { recursive: true });

  const sorted = sortFindings(summary.findings);
  for (const f of sorted) CrawlFindingSchema.parse(f);
  const jsonl = sorted.map((f) => canonicalize(f)).join("\n");
  writeFileSync(join(outDir, "findings.jsonl"), jsonl.length > 0 ? jsonl + "\n" : "", "utf8");

  const { wallMs, stepsPerSec, ...rest } = summary;
  const summaryJson = { ...rest, meta, timing: { wallMs, stepsPerSec } };
  writeFileSync(join(outDir, "summary.json"), `${JSON.stringify(summaryJson, null, 2)}\n`, "utf8");

  writeFileSync(join(outDir, "summary.md"), renderSummaryMarkdown(summary, meta), "utf8");
}
