#!/usr/bin/env -S npx tsx
/**
 * bin/crawl — CLI front end for the zero-LLM mechanical quest/overworld crawler.
 *
 * Usage:
 *   npm run crawl -- [flags]
 *   npm run crawl:smoke     # deterministic fixed-seed lane, all quests + overworld
 *   npm run crawl:deep      # long soak lane (worker fan-out lands in Task 10)
 *
 * Thin main: parse -> resolve commit -> build plan -> run -> write artifacts ->
 * print summary -> exit code. All the actual logic lives in src/crawl/run.ts so
 * it can be unit-tested without spawning this process.
 */
import { execSync } from "node:child_process";
import {
  buildPlan,
  CrawlUsageError,
  defaultOutDir,
  parseCrawlArgs,
  runPlanInProcess,
  sortFindings,
  writeRunArtifacts,
  type CrawlRunOptions,
} from "../src/crawl/run.js";

/** `git rev-parse --short HEAD`, trimmed; "unknown" on any failure (never throws,
 *  never uses wall clock — this is content identity, not a timestamp). */
function resolveCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function main(): void {
  const argv = process.argv.slice(2);

  let parsed;
  try {
    parsed = parseCrawlArgs(argv);
  } catch (err) {
    if (err instanceof CrawlUsageError) {
      console.error(`usage error: ${err.message}`);
      process.exit(2);
    }
    throw err;
  }

  if (parsed.workers > 1) {
    console.error("workers arrive in crawl:deep");
    process.exit(2);
  }

  const root = process.cwd();
  const commit = resolveCommit();
  const outDir = parsed.outDir ?? defaultOutDir();
  const startedAt = new Date().toISOString();

  const opts: CrawlRunOptions = { ...parsed, root, commit, outDir };
  const plan = buildPlan(opts);
  const summary = runPlanInProcess(plan, opts);
  writeRunArtifacts(outDir, summary, { argv, commit, startedAt });

  for (const questId of Object.keys(summary.questCoverage).sort()) {
    const c = summary.questCoverage[questId]!;
    console.log(
      `${questId}: rooms ${c.roomsVisited}/${c.roomsTotal}, actions ${c.actionsTried}/${c.actionsTotal}, ` +
        `endings ${c.endingsReached.length}/${c.endingsDeclared.length}`,
    );
  }

  if (summary.overworld) {
    const ow = summary.overworld;
    console.log(
      `overworld: nodes ${ow.nodes.visited}/${ow.nodes.total}, edges ${ow.edges.traveled}/${ow.edges.total}, ` +
        `boards ${ow.boards.read}/${ow.boards.total}, quests entered ${ow.quests.entered.length}/${ow.quests.total}`,
    );
  }

  const nonOrphan = sortFindings(summary.findings.filter((f) => f.code !== "ORPHAN"));
  for (const f of nonOrphan) {
    const loc = f.location.questId ?? f.location.node ?? "?";
    const scene = f.location.sceneId ?? "-";
    console.log(`${f.code} ${f.severity} ${loc}/${scene} ${f.message}`);
  }

  console.log(
    `steps=${summary.steps} wallMs=${summary.wallMs} steps/sec=${summary.stepsPerSec.toFixed(1)}`,
  );
  if (summary.truncated) {
    console.error(`truncated: skipped [${(summary.skippedItems ?? []).join(", ")}]`);
  }
  console.log(`artifacts: ${outDir}`);

  process.exit(nonOrphan.length > 0 ? 1 : 0);
}

main();
