#!/usr/bin/env -S npx tsx
/**
 * bin/inspect — summarize an RPG world quest or RPG trace (spec §5).
 *
 * Usage:
 *   npm run inspect -- <world_quest_id>    # stats, validator findings
 *   npm run inspect -- <trace.json>        # infer a shipped trace's worldQuestId
 *   npm run inspect -- <trace.json> <world_quest_id>
 *   npm run inspect -- --pack <rpg-pack.yaml>
 *
 * Auto-detects: a `.json` argument is treated as a trace; otherwise positional
 * targets are Charter Marches world quest ids. Raw pack paths are explicit
 * offline compatibility via --pack. Read-only; never writes files (§16).
 */
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { loadRpgPackFile } from "../src/rpg/pack.js";
import { indexRpgPack, buildRpgRules } from "../src/rpg/runner.js";
import { validateRpg } from "../src/validate/rpg_validator.js";
import { makeStep } from "../src/core/engine.js";
import { diagnose } from "../agents/debugger.js";
import { assertTraceMode, replayTrace } from "../src/trace/replay.js";
import type { Trace } from "../src/trace/record.js";
import { formatReport } from "../src/validate/report.js";
import type { RpgAction } from "../src/api/types.js";
import { assertWellFormedState } from "../src/persist/save_load.js";
import { assertRpgStateReferences } from "../src/rpg/state_integrity.js";
import {
  resolveTracePackSource,
  resolveWorldQuestPackPath,
  type TraceSourceArgs,
} from "../src/world/source.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
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

function looksLikeRawPackSelector(value: string): boolean {
  return /\.ya?ml$/i.test(value) || value.includes("/") || value.includes("\\");
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
      "inspect accepts exactly one trace source: --world-quest-id or a positional world quest id.",
    );
  }
  if (pack !== undefined) return { pack_path: pack };
  if (worldQuestId !== undefined) return { world_quest_id: worldQuestId };
  if (positional === undefined) return {};
  if (looksLikeRawPackSelector(positional)) {
    throw new Error(
      "inspect trace sources are world quest ids; raw pack paths are hidden offline compatibility via --pack.",
    );
  }
  return { world_quest_id: positional };
}

function inspectTrace(tracePath: string, sourceArgs: TraceSourceArgs): void {
  const trace = JSON.parse(readFileSync(tracePath, "utf8")) as Trace<RpgAction>;
  assertTraceMode(trace);
  const source = resolveTracePackSource(process.cwd(), sourceArgs, trace, "inspect");
  const packPath = source.packPath;
  assertRpgPackShape(packPath);
  const loaded = loadRpgPackFile(packPath);
  if (!loaded.ok) {
    console.error(`Pack ${packPath} failed to compile as an RPG pack.`);
    process.exit(1);
  }
  console.log(
    `Trace: ${trace.trace_id}  pack: ${trace.pack_id}  world_quest: ${source.worldQuestId ?? "(none)"}  seed: ${trace.seed}  steps: ${trace.actions.length}`,
  );
  if (trace.content_hash !== loaded.compiled.contentHash) {
    console.log(
      `  ! content hash mismatch: trace ${trace.content_hash} ≠ pack ${loaded.compiled.contentHash}`,
    );
    process.exit(1);
  }
  assertWellFormedState(trace.initial_state);
  const index = indexRpgPack(loaded.compiled.pack);
  assertRpgStateReferences(index, trace.initial_state);
  const rules = buildRpgRules(index);
  const step = makeStep(rules);
  let state = trace.initial_state;
  trace.actions.forEach((action, i) => {
    state = step(state, action).state;
    console.log(
      `  ${String(i).padStart(3)}  ${JSON.stringify(action)} -> ${state.current}${state.ended ? ` [END ${state.endingId}]` : ""}`,
    );
  });
  const replay = replayTrace(trace, rules);
  console.log(
    `\nReplay: ${replay.ok ? "OK" : "DIVERGED"}  final ${replay.finalHash}${replay.expectedFinalHash ? ` (expected ${replay.expectedFinalHash})` : ""}`,
  );
  const d = diagnose(rules, trace.initial_state, trace.actions);
  console.log(`Suspected bug: ${d.type} (${d.severity}) — ${d.description}`);
}

function main(): void {
  const target = process.argv[2];
  if (!target) {
    console.error(
      "Usage: npm run inspect -- <world_quest_id> | <trace.json> [world_quest_id] | --pack <rpg-pack.yaml>",
    );
    process.exit(2);
  }
  if (target === "--pack") {
    const path = process.argv[3];
    if (!path || path.startsWith("--")) {
      console.error("Usage: npm run inspect -- --pack <rpg-pack.yaml>");
      process.exit(2);
    }
    assertRpgPackShape(path);
    inspectRpgPack(path);
    return;
  }
  if (target.startsWith("--")) {
    console.error(
      "Usage: npm run inspect -- <world_quest_id> | <trace.json> [world_quest_id] | --pack <rpg-pack.yaml>",
    );
    process.exit(2);
  }
  if (/\.json$/i.test(target)) {
    const raw = parseYaml(readFileSync(target, "utf8")) as Record<string, unknown> | null;
    const isTrace = !!raw && typeof raw === "object" && "trace_id" in raw;
    if (!isTrace) {
      console.error("Inspect JSON inputs must be RPG trace files.");
      process.exit(1);
    }
    inspectTrace(target, traceSourceArgs());
    return;
  }
  if (looksLikeRawPackSelector(target)) {
    console.error(
      `inspect targets are world quest ids; raw pack paths are offline compatibility via --pack: ${target}`,
    );
    process.exit(2);
  }
  const source = resolveWorldQuestPackPath(process.cwd(), target);
  inspectRpgPack(source.packPath, source.node.id);
}

function inspectRpgPack(path: string, worldQuestId?: string): void {
  const result = loadRpgPackFile(path);
  if (!result.ok) {
    console.error(`Schema error in ${path}.`);
    process.exit(1);
  }
  const { pack, contentHash } = result.compiled;
  if (worldQuestId !== undefined) console.log(`World quest: ${worldQuestId}`);
  console.log(`Pack: ${pack.meta.id} "${pack.meta.title}"  mode: rpg  hash: ${contentHash}`);
  console.log(
    `  rooms: ${pack.rooms.length}  objects: ${pack.objects.length}  enemies: ${pack.enemies.length}  win_conditions: ${pack.win_conditions.length}`,
  );
  console.log(
    `  start_room: ${pack.meta.start_room}  stats: ${JSON.stringify(pack.meta.vars_init)}`,
  );
  const skillChecks = pack.objects
    .flatMap((o) => o.interactions)
    .filter((it) => it.skill_check).length;
  console.log(
    `  enemies: ${pack.enemies.map((e) => `${e.id}(hp${e.hp})`).join(", ") || "none"}  skill checks: ${skillChecks}`,
  );
  console.log("\n" + formatReport(validateRpg(pack)));
}

function assertRpgPackShape(path: string, rawPack?: Record<string, unknown> | null): void {
  const raw = rawPack ?? (parseYaml(readFileSync(path, "utf8")) as Record<string, unknown> | null);
  const isObj = !!raw && typeof raw === "object";
  if (isObj && "enemies" in raw) return;
  console.error(
    "Inspect is RPG-only; unsupported legacy/non-RPG packs are migration data, not playable agent targets.",
  );
  process.exit(1);
}

main();
