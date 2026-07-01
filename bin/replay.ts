#!/usr/bin/env -S npx tsx
/**
 * bin/replay — replay an RPG trace and assert its final-state hash (§8.8).
 *
 * Usage:
 *   npm run replay                              # replay the committed RPG smoke trace
 *   npm run replay -- <trace.json>              # infer a shipped trace's worldQuestId
 *   npm run replay -- <trace.json> <pack.yaml|world_quest_id>
 */
import { readFileSync } from "node:fs";
import { type Trace } from "../src/trace/record.js";
import { assertTraceMode, replayTrace } from "../src/trace/replay.js";
import { loadRpgPackFile } from "../src/rpg/pack.js";
import { buildRpgRules, indexRpgPack } from "../src/rpg/runner.js";
import type { RpgAction } from "../src/api/types.js";
import { assertWellFormedState } from "../src/persist/save_load.js";
import { assertRpgStateReferences } from "../src/rpg/state_integrity.js";
import { resolveTracePackSource, type TraceSourceArgs } from "../src/world/source.js";

const DEFAULT_TRACE = "traces/rpg/barrow_victory.json";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function looksLikePackPath(value: string): boolean {
  return /\.ya?ml$/i.test(value) || value.includes("/") || value.includes("\\");
}

function positionalSourceArg(): string | undefined {
  for (let i = 3; i < process.argv.length; i += 1) {
    const value = process.argv[i]!;
    if (value === "--pack" || value === "--world-quest-id" || value === "--world_quest_id") {
      i += 1;
      continue;
    }
    if (value === "--" || value.startsWith("--")) continue;
    return value;
  }
  return undefined;
}

function traceSourceArgs(): TraceSourceArgs {
  const pack = arg("--pack");
  const worldQuestId = arg("--world-quest-id") ?? arg("--world_quest_id");
  const positional = positionalSourceArg();
  const count = [pack !== undefined, worldQuestId !== undefined, positional !== undefined].filter(
    Boolean,
  ).length;
  if (count > 1) {
    throw new Error(
      "replay accepts exactly one trace source: --pack, --world-quest-id, or positional source.",
    );
  }
  if (pack !== undefined) return { pack_path: pack };
  if (worldQuestId !== undefined) return { world_quest_id: worldQuestId };
  if (positional === undefined) return {};
  return looksLikePackPath(positional) ? { pack_path: positional } : { world_quest_id: positional };
}

function main(): void {
  const tracePath = process.argv[2] ?? DEFAULT_TRACE;
  const trace = JSON.parse(readFileSync(tracePath, "utf8")) as Trace<RpgAction>;
  assertTraceMode(trace);
  const source = resolveTracePackSource(process.cwd(), traceSourceArgs(), trace, "replay");
  const packPath = source.packPath;
  const loaded = loadRpgPackFile(packPath);
  if (!loaded.ok) {
    console.error(`Pack ${packPath} failed to compile as an RPG pack.`);
    process.exit(1);
  }

  if (trace.content_hash !== loaded.compiled.contentHash) {
    console.error(
      `Trace content ${trace.content_hash} does not match pack ${loaded.compiled.contentHash}.`,
    );
    process.exit(1);
  }
  assertWellFormedState(trace.initial_state);
  const index = indexRpgPack(loaded.compiled.pack);
  assertRpgStateReferences(index, trace.initial_state);
  const rules = buildRpgRules(index);
  const result = replayTrace(trace, rules);
  console.log(`trace_id:     ${trace.trace_id}`);
  console.log(`pack_id:      ${trace.pack_id}`);
  console.log(`pack file:    ${packPath}`);
  console.log(`world quest:  ${source.worldQuestId ?? "(none)"}`);
  console.log(`actions:      ${trace.actions.length}`);
  console.log(`final hash:   ${result.finalHash}`);
  console.log(`expected:     ${result.expectedFinalHash ?? "(none)"}`);
  console.log(
    result.ok ? "REPLAY OK — round-trip reproduced." : `REPLAY DIVERGED — ${result.message}`,
  );
  process.exit(result.ok ? 0 : 1);
}

main();
