#!/usr/bin/env -S npx tsx
/**
 * bin/replay — replay an RPG trace and assert its final-state hash (§8.8).
 *
 * Usage:
 *   npm run replay                              # replay the committed RPG smoke trace
 *   npm run replay -- <trace.json>              # infer shipped/generated trace source
 *   npm run replay -- <trace.json> <world_quest_id>
 */
import { readFileSync } from "node:fs";
import { traceSourceLabel, type Trace } from "../src/trace/record.js";
import { assertTraceMode, replayTrace } from "../src/trace/replay.js";
import { buildRpgRules, indexRpgPack } from "../src/rpg/runner.js";
import type { RpgAction } from "../src/api/types.js";
import { assertWellFormedState } from "../src/persist/save_load.js";
import { assertRpgStateReferences } from "../src/rpg/state_integrity.js";
import { RpgSourceRuntime } from "../src/mcp/rpg_source_runtime.js";
import { resolveTraceGameSource, type TraceSourceArgs } from "../src/world/source.js";

const DEFAULT_TRACE = "traces/rpg/barrow_victory.json";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function positionalSourceArg(): string | undefined {
  for (let i = 3; i < process.argv.length; i += 1) {
    const value = process.argv[i]!;
    if (value === "--world-quest-id" || value === "--world_quest_id") {
      i += 1;
      continue;
    }
    if (value === "--" || value.startsWith("--")) continue;
    return value;
  }
  return undefined;
}

function traceSourceArgs(): TraceSourceArgs {
  if (arg("--pack") !== undefined || process.argv.includes("--pack")) {
    throw new Error("replay accepts world_quest_id or embedded trace worldQuestId, not --pack.");
  }
  const worldQuestId = arg("--world-quest-id") ?? arg("--world_quest_id");
  const positional = positionalSourceArg();
  const count = [worldQuestId !== undefined, positional !== undefined].filter(Boolean).length;
  if (count > 1) {
    throw new Error(
      "replay accepts exactly one trace source: --world-quest-id or a positional world quest id.",
    );
  }
  if (worldQuestId !== undefined) return { world_quest_id: worldQuestId };
  if (positional === undefined) return {};
  if (/\.ya?ml$/i.test(positional) || positional.includes("/") || positional.includes("\\")) {
    throw new Error("replay trace sources are world quest ids; raw pack paths are not accepted.");
  }
  return { world_quest_id: positional };
}

function main(): void {
  const tracePath = process.argv[2] ?? DEFAULT_TRACE;
  const trace = JSON.parse(readFileSync(tracePath, "utf8")) as Trace<RpgAction>;
  assertTraceMode(trace);
  const root = process.cwd();
  const source = resolveTraceGameSource(root, traceSourceArgs(), trace, "replay");
  const rpgSources = new RpgSourceRuntime(root);
  const compiled =
    source.kind === "generated"
      ? rpgSources.requireGeneratedRpgPlayable(source.generateRpgSeed)
      : rpgSources.requirePlayable(source.packPath);

  if (trace.content_hash !== compiled.contentHash) {
    console.error(
      `Trace content ${trace.content_hash} does not match pack ${compiled.contentHash}.`,
    );
    process.exit(1);
  }
  assertWellFormedState(trace.initial_state);
  const index = indexRpgPack(compiled.pack);
  assertRpgStateReferences(index, trace.initial_state);
  const rules = buildRpgRules(index);
  const result = replayTrace(trace, rules);
  console.log(`trace_id:     ${trace.trace_id}`);
  console.log(`source:       ${traceSourceLabel(trace)}`);
  console.log(`actions:      ${trace.actions.length}`);
  console.log(`final hash:   ${result.finalHash}`);
  console.log(`expected:     ${result.expectedFinalHash ?? "(none)"}`);
  console.log(
    result.ok ? "REPLAY OK — round-trip reproduced." : `REPLAY DIVERGED — ${result.message}`,
  );
  process.exit(result.ok ? 0 : 1);
}

main();
