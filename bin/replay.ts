#!/usr/bin/env -S npx tsx
/**
 * bin/replay — replay an RPG trace and assert its final-state hash (§8.8).
 *
 * Usage:
 *   npm run replay                              # replay the committed RPG smoke trace
 *   npm run replay -- <trace.json> <pack.yaml>  # replay a trace against an RPG pack
 */
import { readFileSync } from "node:fs";
import { type Trace } from "../src/trace/record.js";
import { replayTrace } from "../src/trace/replay.js";
import { loadRpgPackFile } from "../src/rpg/pack.js";
import { buildRpgRules, indexRpgPack } from "../src/rpg/runner.js";
import type { RpgAction } from "../src/api/types.js";

const DEFAULT_TRACE = "traces/rpg/barrow_victory.json";
const DEFAULT_PACK = "content/rpg/pack/sunken_barrow.yaml";

function main(): void {
  const tracePath = process.argv[2] ?? DEFAULT_TRACE;
  const packPath = process.argv[3] ?? DEFAULT_PACK;
  const trace = JSON.parse(readFileSync(tracePath, "utf8")) as Trace<RpgAction>;
  const loaded = loadRpgPackFile(packPath);
  if (!loaded.ok) {
    console.error(`Pack ${packPath} failed to compile as an RPG pack.`);
    process.exit(1);
  }

  const rules = buildRpgRules(indexRpgPack(loaded.compiled.pack));
  const result = replayTrace(trace, rules);
  console.log(`trace_id:     ${trace.trace_id}`);
  console.log(`pack_id:      ${trace.pack_id}`);
  console.log(`pack file:    ${packPath}`);
  console.log(`actions:      ${trace.actions.length}`);
  console.log(`final hash:   ${result.finalHash}`);
  console.log(`expected:     ${result.expectedFinalHash ?? "(none)"}`);
  console.log(
    result.ok ? "REPLAY OK — round-trip reproduced." : `REPLAY DIVERGED — ${result.message}`,
  );
  process.exit(result.ok ? 0 : 1);
}

main();
