#!/usr/bin/env -S npx tsx
/**
 * bin/inspect — summarize an RPG content pack or RPG trace (spec §5).
 *
 * Usage:
 *   npm run inspect -- <rpg-pack.yaml>     # stats, validator findings
 *   npm run inspect -- <trace.json> <rpg-pack.yaml>   # replay summary + suspected bugs
 *
 * Auto-detects: a `.json` argument (or one carrying `trace_id`) is treated as a
 * trace; otherwise it is an RPG content pack. Read-only; never writes files (§16).
 */
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { loadRpgPackFile } from "../src/rpg/pack.js";
import { indexRpgPack, buildRpgRules } from "../src/rpg/runner.js";
import { validateRpg } from "../src/validate/rpg_validator.js";
import { makeStep } from "../src/core/engine.js";
import { diagnose } from "../agents/debugger.js";
import { replayTrace } from "../src/trace/replay.js";
import type { Trace } from "../src/trace/record.js";
import { formatReport } from "../src/validate/report.js";
import type { RpgAction } from "../src/api/types.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function packArg(): string | undefined {
  return (
    arg("--pack") ??
    process.argv.slice(3).find((value) => value !== "--" && !value.startsWith("--"))
  );
}

function inspectTrace(tracePath: string, packPath: string): void {
  const trace = JSON.parse(readFileSync(tracePath, "utf8")) as Trace<RpgAction>;
  assertRpgPackShape(packPath);
  const loaded = loadRpgPackFile(packPath);
  if (!loaded.ok) {
    console.error(`Pack ${packPath} failed to compile as an RPG pack.`);
    process.exit(1);
  }
  const rules = buildRpgRules(indexRpgPack(loaded.compiled.pack));
  console.log(
    `Trace: ${trace.trace_id}  pack: ${trace.pack_id}  seed: ${trace.seed}  steps: ${trace.actions.length}`,
  );
  if (trace.content_hash !== loaded.compiled.contentHash) {
    console.log(
      `  ! content hash mismatch: trace ${trace.content_hash} ≠ pack ${loaded.compiled.contentHash}`,
    );
  }
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
  const path = process.argv[2];
  if (!path || path.startsWith("--")) {
    console.error("Usage: npm run inspect -- <rpg-pack.yaml> | <trace.json> <rpg-pack.yaml>");
    process.exit(2);
  }
  const raw = parseYaml(readFileSync(path, "utf8")) as Record<string, unknown> | null;
  const isTrace = !!raw && typeof raw === "object" && "trace_id" in raw;
  if (isTrace) {
    const pack = packArg();
    if (!pack) {
      console.error("Inspecting a trace needs an RPG pack path.");
      process.exit(2);
    }
    inspectTrace(path, pack);
    return;
  }
  assertRpgPackShape(path, raw);
  inspectRpgPack(path);
}

function inspectRpgPack(path: string): void {
  const result = loadRpgPackFile(path);
  if (!result.ok) {
    console.error(`Schema error in ${path}.`);
    process.exit(1);
  }
  const { pack, contentHash } = result.compiled;
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
