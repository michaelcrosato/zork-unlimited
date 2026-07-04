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
import { loadRpgPackFile } from "../src/rpg/pack.js";
import { validateRpg } from "../src/validate/rpg_validator.js";
import { formatReport, makeReport, type Finding } from "../src/validate/report.js";
import { loadWorldManifest, resolveWorldQuestPackPath } from "../src/world/source.js";

const ROOT = process.cwd();

type ValidationTarget = {
  label: string;
  path: string;
};

function schemaFindings(error: {
  issues: { message: string; path: (string | number)[] }[];
}): Finding[] {
  return error.issues.map((i) => ({
    severity: "error" as const,
    code: "SCHEMA",
    message: `${i.message} (${i.path.join(".") || "<root>"})`,
    where: [i.path.join(".") || "<root>"],
  }));
}

function looksLikeRawPackSelector(value: string): boolean {
  return /\.ya?ml$/i.test(value) || value.includes("/") || value.includes("\\");
}

function discoverWorldQuestTargets(): ValidationTarget[] {
  return loadWorldManifest(ROOT)
    .graph.nodes.filter((node) => node.kind === "quest" && node.pack !== undefined)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((node) => ({
      label: `world_quest_id: ${node.id}`,
      path: resolveWorldQuestPackPath(ROOT, node.id).packPath,
    }));
}

function validateOne(target: ValidationTarget): boolean {
  console.log(`== ${target.label} ==`);
  const path = target.path;
  const result = loadRpgPackFile(path);
  if (!result.ok) {
    console.log(formatReport(makeReport(path, schemaFindings(result.error))));
    return false;
  }

  const report = validateRpg(result.compiled.pack);
  console.log(formatReport(report));
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
  return args.map((worldQuestId) => {
    const source = resolveWorldQuestPackPath(ROOT, worldQuestId);
    return { label: `world_quest_id: ${source.node.id}`, path: source.packPath };
  });
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
