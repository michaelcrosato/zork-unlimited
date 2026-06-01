#!/usr/bin/env -S npx tsx
/**
 * bin/validate — run the validator on a content pack (§10).
 *
 * Usage: npm run validate -- <pack.yaml>
 * Auto-detects mode: a pack with top-level `rooms` is a parser pack (Stage 2),
 * otherwise it is a CYOA pack (Stage 1).
 * Exit code 0 = green (no errors); 1 = errors found; 2 = usage/IO error.
 */
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { loadPackFile } from "../src/cyoa/pack.js";
import { validateCyoa } from "../src/validate/cyoa_validator.js";
import { loadParserPackFile } from "../src/parser/pack.js";
import { validateParser } from "../src/validate/parser_validator.js";
import { loadRpgPackFile } from "../src/rpg/pack.js";
import { validateRpg } from "../src/validate/rpg_validator.js";
import { formatReport, makeReport, type Finding } from "../src/validate/report.js";

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

function main(): void {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npm run validate -- <pack.yaml>");
    process.exit(2);
  }

  const raw = parseYaml(readFileSync(path, "utf8")) as Record<string, unknown> | null;
  const isObj = !!raw && typeof raw === "object";
  const isRpg = isObj && "enemies" in raw;
  const isParser = isObj && !isRpg && "rooms" in raw;

  if (isRpg) {
    const result = loadRpgPackFile(path);
    if (!result.ok) {
      console.log(formatReport(makeReport(path, schemaFindings(result.error))));
      process.exit(1);
    }
    const report = validateRpg(result.compiled.pack);
    console.log(formatReport(report));
    console.log(`mode: rpg  content_hash: ${result.compiled.contentHash}`);
    process.exit(report.ok ? 0 : 1);
  }

  if (isParser) {
    const result = loadParserPackFile(path);
    if (!result.ok) {
      console.log(formatReport(makeReport(path, schemaFindings(result.error))));
      process.exit(1);
    }
    const report = validateParser(result.compiled.pack);
    console.log(formatReport(report));
    console.log(`mode: parser  content_hash: ${result.compiled.contentHash}`);
    process.exit(report.ok ? 0 : 1);
  }

  const result = loadPackFile(path);
  if (!result.ok) {
    console.log(formatReport(makeReport(path, schemaFindings(result.error))));
    process.exit(1);
  }
  const report = validateCyoa(result.compiled.pack);
  console.log(formatReport(report));
  console.log(`mode: cyoa  content_hash: ${result.compiled.contentHash}`);
  process.exit(report.ok ? 0 : 1);
}

main();
