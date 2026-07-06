#!/usr/bin/env -S npx tsx
/**
 * bin/validate — RPG-only validation gate.
 *
 * Usage:
 *   npm run validate
 *   npm run validate -- sunken_barrow [...more world_quest_ids]
 *
 * With no arguments this validates every shipped RPG quest through the canonical
 * world graph. Raw pack paths and legacy CYOA/parser packs are intentionally not
 * accepted here.
 */
import { formatReport } from "../src/validate/report.js";
import { RpgSourceRuntime, type RpgLoadResult } from "../src/mcp/rpg_source_runtime.js";

const ROOT = process.cwd();
const rpgSources = new RpgSourceRuntime(ROOT);

type ValidationTarget = {
  label: string;
  result: RpgLoadResult;
};

function looksLikeRawPackSelector(value: string): boolean {
  return /\.ya?ml$/i.test(value) || value.includes("/") || value.includes("\\");
}

function worldQuestTarget(worldQuestId: string): ValidationTarget {
  const source = rpgSources.loadWorldQuestReport(worldQuestId);
  return {
    label: `world_quest_id: ${source.node.id}`,
    result: source.result,
  };
}

function discoverWorldQuestTargets(): ValidationTarget[] {
  return rpgSources
    .loadWorldManifest()
    .graph.nodes.filter((node) => node.kind === "quest" && node.pack !== undefined)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((node) => worldQuestTarget(node.id));
}

function validateOne(target: ValidationTarget): boolean {
  console.log(`== ${target.label} ==`);
  const result = target.result;
  if (!result.ok) {
    console.log(formatReport(result.report, { includeSourceId: false }));
    return false;
  }

  const report = result.report;
  console.log(formatReport(report, { includeSourceId: false }));
  console.log(`content_hash: ${result.compiled.contentHash}`);
  return report.ok;
}

function parseTargets(args: string[]): ValidationTarget[] {
  if (args.length === 0) return discoverWorldQuestTargets();
  if (args.includes("--pack")) {
    throw new Error("validate accepts world quest ids, not --pack.");
  }
  const raw = args.find(looksLikeRawPackSelector);
  if (raw !== undefined) {
    throw new Error(
      `validate targets are world quest ids; raw pack paths are not accepted: ${raw}`,
    );
  }
  return args.map((worldQuestId) => worldQuestTarget(worldQuestId));
}

function main(): void {
  let targets: ValidationTarget[];
  try {
    targets = parseTargets(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }

  if (targets.length === 0) {
    console.error(`No RPG quests found in the canonical world graph.`);
    process.exit(2);
  }

  const ok = targets.map((target) => validateOne(target)).every(Boolean);
  process.exit(ok ? 0 : 1);
}

main();
