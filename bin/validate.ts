#!/usr/bin/env -S npx tsx
/**
 * bin/validate — RPG-only validation gate.
 *
 * Usage:
 *   npm run validate
 *   npm run validate -- sunken_barrow [...more world_quest_ids]
 *   npm run validate -- --pack content/rpg/pack/sunken_barrow.yaml [...more packs]
 *
 * With no arguments this validates every shipped RPG quest through the canonical
 * world graph. Positional raw pack paths are hidden behind explicit --pack
 * offline mode; legacy CYOA/parser packs are intentionally not accepted here.
 */
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { loadRpgPackFile } from "../src/rpg/pack.js";
import { validateRpg } from "../src/validate/rpg_validator.js";
import { formatReport, makeReport, type Finding } from "../src/validate/report.js";
import { loadWorldManifest, resolveWorldQuestPackPath } from "../src/world/source.js";

const RPG_PACK_DIR = "content/rpg/pack";
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

function looksLikeRpgPack(path: string): boolean {
  const raw = parseYaml(readFileSync(path, "utf8")) as Record<string, unknown> | null;
  return !!raw && typeof raw === "object" && "enemies" in raw;
}

function validateOne(target: ValidationTarget): boolean {
  console.log(`== ${target.label} ==`);
  const path = target.path;
  if (!looksLikeRpgPack(path)) {
    console.error(
      `${target.label}: unsupported legacy pack; validation is RPG-only. Convert it into ${RPG_PACK_DIR}.`,
    );
    return false;
  }

  const result = loadRpgPackFile(path);
  if (!result.ok) {
    console.log(formatReport(makeReport(path, schemaFindings(result.error))));
    return false;
  }

  const report = validateRpg(result.compiled.pack);
  console.log(formatReport(report));
  console.log(`mode: rpg  content_hash: ${result.compiled.contentHash}`);
  return report.ok;
}

function parseTargets(args: string[]): ValidationTarget[] {
  if (args.length === 0) return discoverWorldQuestTargets();
  if (args[0] === "--pack") {
    const paths = args.slice(1);
    if (paths.length === 0) {
      throw new Error("validate --pack requires at least one raw pack path.");
    }
    return paths.map((path) => ({ label: `offline_pack: ${path}`, path }));
  }
  const raw = args.find(looksLikeRawPackSelector);
  if (raw !== undefined) {
    throw new Error(
      `validate targets are world quest ids; raw pack paths are offline compatibility via --pack: ${raw}`,
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
