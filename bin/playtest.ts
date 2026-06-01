#!/usr/bin/env -S npx tsx
/**
 * bin/playtest — run the AI playtester roster against a CYOA pack (§12.4).
 *
 * Usage:
 *   npm run playtest -- <pack.yaml> [--seeds 1,2,3] [--max 80] [--out dir]
 *
 * Uses deterministic mock agents by default (no API keys, §12.7). Prints a
 * coverage report and, with --out, writes one playtest record per run.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadPackFile } from "../src/cyoa/pack.js";
import { validateCyoa } from "../src/validate/cyoa_validator.js";
import { formatReport } from "../src/validate/report.js";
import { runRoster } from "../agents/playtester.js";

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path || path.startsWith("--")) {
    console.error("Usage: npm run playtest -- <pack.yaml> [--seeds 1,2,3] [--max 80] [--out dir]");
    process.exit(2);
  }
  let seeds: number[] | undefined;
  let maxSteps: number | undefined;
  let out: string | null = null;
  for (let i = 3; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--seeds")
      seeds = (process.argv[++i] ?? "")
        .split(",")
        .map(Number)
        .filter((n) => !Number.isNaN(n));
    else if (a === "--max") maxSteps = Number(process.argv[++i]);
    else if (a === "--out") out = process.argv[++i] ?? null;
  }

  const loaded = loadPackFile(path);
  if (!loaded.ok) {
    console.error("Pack failed schema validation. Run `npm run validate` first.");
    process.exit(1);
  }
  const report = validateCyoa(loaded.compiled.pack);
  if (!report.ok) {
    console.error("Pack is not playable:\n" + formatReport(report));
    process.exit(1);
  }

  const { records, coverage } = await runRoster(loaded.compiled.pack, {
    ...(seeds ? { seeds } : {}),
    ...(maxSteps ? { maxSteps } : {}),
  });

  console.log(`Playtest coverage for ${coverage.pack_id} (${coverage.runs} runs)`);
  console.log(`  endings reached:  ${coverage.endings_reached.join(", ") || "(none)"}`);
  console.log(`  endings missing:  ${coverage.endings_missing.join(", ") || "(none)"}`);
  console.log(`  scenes visited:   ${coverage.scenes_visited.length}/${coverage.scenes_total}`);
  if (coverage.scenes_unvisited.length)
    console.log(`  scenes unvisited: ${coverage.scenes_unvisited.join(", ")}`);
  console.log(
    `  completed runs:   ${records.filter((r) => r.status === "completed").length}/${records.length}`,
  );
  if (coverage.findings.length) {
    console.log("\nFindings:");
    for (const f of coverage.findings) console.log(`  - ${f}`);
  }

  if (out) {
    mkdirSync(out, { recursive: true });
    for (const r of records) {
      writeFileSync(join(out, `${r.persona}_seed${r.seed}.json`), JSON.stringify(r, null, 2));
    }
    console.log(`\nWrote ${records.length} playtest records to ${out}/`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
