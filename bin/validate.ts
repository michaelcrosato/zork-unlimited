#!/usr/bin/env -S npx tsx
/**
 * bin/validate — RPG-only validation gate.
 *
 * Usage:
 *   npm run validate
 *   npm run validate -- content/rpg/pack/sunken_barrow.yaml [...more packs]
 *
 * With no arguments this validates every shipped RPG pack. Legacy CYOA/parser
 * packs are intentionally not accepted here; they must be migrated into the RPG
 * content surface instead of remaining public validation targets.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { loadRpgPackFile } from "../src/rpg/pack.js";
import { validateRpg } from "../src/validate/rpg_validator.js";
import { formatReport, makeReport, type Finding } from "../src/validate/report.js";

const RPG_PACK_DIR = "content/rpg/pack";

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

function discoverRpgPacks(): string[] {
  return readdirSync(join(process.cwd(), RPG_PACK_DIR))
    .filter((file) => file.endsWith(".yaml"))
    .sort()
    .map((file) => `${RPG_PACK_DIR}/${file}`);
}

function looksLikeRpgPack(path: string): boolean {
  const raw = parseYaml(readFileSync(path, "utf8")) as Record<string, unknown> | null;
  return !!raw && typeof raw === "object" && "enemies" in raw;
}

function validateOne(path: string): boolean {
  console.log(`== ${path} ==`);
  if (!looksLikeRpgPack(path)) {
    console.error(
      `${path}: unsupported legacy pack; public validation is RPG-only. Convert it into ${RPG_PACK_DIR}.`,
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

function main(): void {
  const targets = process.argv.slice(2);
  const paths = targets.length > 0 ? targets : discoverRpgPacks();

  if (paths.length === 0) {
    console.error(`No RPG packs found under ${RPG_PACK_DIR}.`);
    process.exit(2);
  }

  const ok = paths.map((path) => validateOne(path)).every(Boolean);
  process.exit(ok ? 0 : 1);
}

main();
