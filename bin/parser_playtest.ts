#!/usr/bin/env -S npx tsx
/**
 * bin/parser_playtest — run the §12.8 persona roster against a parser pack.
 *
 * Usage:
 *   npm run playtest:parser -- <pack.yaml> [--seeds 1,2,3] [--max 200] [--out dir]
 *
 * Deterministic heuristic personas (no API keys, §12.7). Prints a coverage report
 * and, with --out, writes one playtest record per run.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadParserPackFile } from "../src/parser/pack.js";
import { validateParser } from "../src/validate/parser_validator.js";
import { formatReport } from "../src/validate/report.js";
import { runParserRoster } from "../agents/parser_playtester.js";

function main(): void {
  const path = process.argv[2];
  if (!path || path.startsWith("--")) {
    console.error("Usage: npm run playtest:parser -- <pack.yaml> [--seeds 1,2,3] [--max 200] [--out dir]");
    process.exit(2);
  }
  let seeds: number[] | undefined;
  let maxSteps: number | undefined;
  let out: string | null = null;
  for (let i = 3; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--seeds") seeds = (process.argv[++i] ?? "").split(",").map(Number).filter((n) => !Number.isNaN(n));
    else if (a === "--max") maxSteps = Number(process.argv[++i]);
    else if (a === "--out") out = process.argv[++i] ?? null;
  }

  const loaded = loadParserPackFile(path);
  if (!loaded.ok) {
    console.error("Pack failed schema validation. Run `npm run validate` first.");
    process.exit(1);
  }
  const report = validateParser(loaded.compiled.pack);
  if (!report.ok) {
    console.error("Pack is not playable:\n" + formatReport(report));
    process.exit(1);
  }

  const { records, coverage } = runParserRoster(loaded.compiled.pack, {
    ...(seeds ? { seeds } : {}),
    ...(maxSteps ? { maxSteps } : {}),
  });

  console.log(`Parser playtest coverage for ${coverage.pack_id} (${coverage.runs} runs)`);
  console.log(`  rooms visited:   ${coverage.rooms_visited.length}/${coverage.rooms_total}`);
  if (coverage.rooms_unvisited.length) console.log(`  rooms unvisited: ${coverage.rooms_unvisited.join(", ")}`);
  console.log(`  any win:         ${coverage.any_win} (${coverage.personas_won.join(", ") || "none"})`);
  console.log(`  completed runs:  ${records.filter((r) => r.status === "completed").length}/${records.length}`);
  console.log("\nFindings:");
  for (const f of coverage.findings) console.log(`  - ${f}`);

  if (out) {
    mkdirSync(out, { recursive: true });
    for (const r of records) writeFileSync(join(out, `${r.persona}_seed${r.seed}.json`), JSON.stringify(r, null, 2));
    console.log(`\nWrote ${records.length} playtest records to ${out}/`);
  }
}

main();
