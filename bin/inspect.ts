#!/usr/bin/env -S npx tsx
/**
 * bin/inspect — summarize a content pack or a trace (spec §5).
 *
 * Usage:
 *   npm run inspect -- <pack.yaml>     # stats, reachability, validator findings
 *   npm run inspect -- <trace.json> --pack <pack.yaml>   # replay summary + suspected bugs
 *
 * Auto-detects: a `.json` argument (or one carrying `trace_id`) is treated as a
 * trace; otherwise it is a content pack. Read-only; never writes files (§16).
 */
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { loadPackFile } from "../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../src/cyoa/runner.js";
import { buildObservation } from "../src/cyoa/observation.js";
import { validateCyoa } from "../src/validate/cyoa_validator.js";
import { loadParserPackFile } from "../src/parser/pack.js";
import { validateParser } from "../src/validate/parser_validator.js";
import { makeStep } from "../src/core/engine.js";
import { diagnose } from "../agents/debugger.js";
import { replayTrace } from "../src/trace/replay.js";
import type { Trace } from "../src/trace/record.js";
import { formatReport } from "../src/validate/report.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function inspectTrace(tracePath: string, packPath: string): void {
  const trace = JSON.parse(readFileSync(tracePath, "utf8")) as Trace;
  const loaded = loadPackFile(packPath);
  if (!loaded.ok) {
    console.error(`Pack ${packPath} failed to compile (inspect-trace expects a CYOA pack).`);
    process.exit(1);
  }
  const rules = buildRules(indexPack(loaded.compiled.pack));
  console.log(`Trace: ${trace.trace_id}  pack: ${trace.pack_id}  seed: ${trace.seed}  steps: ${trace.actions.length}`);
  if (trace.content_hash !== loaded.compiled.contentHash) {
    console.log(`  ! content hash mismatch: trace ${trace.content_hash} ≠ pack ${loaded.compiled.contentHash}`);
  }
  const step = makeStep(rules);
  let state = trace.initial_state;
  trace.actions.forEach((action, i) => {
    state = step(state, action).state;
    console.log(`  ${String(i).padStart(3)}  ${JSON.stringify(action)} -> ${state.current}${state.ended ? ` [END ${state.endingId}]` : ""}`);
  });
  const replay = replayTrace(trace, rules);
  console.log(`\nReplay: ${replay.ok ? "OK" : "DIVERGED"}  final ${replay.finalHash}${replay.expectedFinalHash ? ` (expected ${replay.expectedFinalHash})` : ""}`);
  const d = diagnose(rules, trace.initial_state, trace.actions);
  console.log(`Suspected bug: ${d.type} (${d.severity}) — ${d.description}`);
}

function inspectCyoaPack(path: string): void {
  const result = loadPackFile(path);
  if (!result.ok) {
    console.error(`Schema error in ${path}.`);
    process.exit(1);
  }
  const { pack, contentHash } = result.compiled;
  const index = indexPack(pack);
  // Structural coverage: BFS over choice.next from start.
  const reachable = new Set<string>([pack.meta.start]);
  const queue = [pack.meta.start];
  while (queue.length) {
    const id = queue.shift()!;
    for (const c of index.scenes.get(id)?.choices ?? []) {
      if (!reachable.has(c.next)) (reachable.add(c.next), queue.push(c.next));
    }
  }
  const sceneIds = pack.scenes.map((s) => s.id);
  const unreachable = sceneIds.filter((s) => !reachable.has(s));
  const obs = buildObservation(index, initStateForPack(index, 1));
  console.log(`Pack: ${pack.meta.id} "${pack.meta.title}"  mode: cyoa  hash: ${contentHash}`);
  console.log(`  scenes: ${pack.scenes.length}  endings: ${pack.endings.length}  start: ${pack.meta.start}`);
  console.log(`  ending scenes: ${index.endingSceneIds.size}  reachable scenes: ${reachable.size - index.endingIds.size}/${sceneIds.length}`);
  if (unreachable.length) console.log(`  unreachable (by static next): ${unreachable.join(", ")}`);
  console.log(`  opening actions: ${obs.available_actions.map((a) => a.id).join(", ")}`);
  console.log("\n" + formatReport(validateCyoa(pack)));
}

function inspectParserPack(path: string): void {
  const result = loadParserPackFile(path);
  if (!result.ok) {
    console.error(`Schema error in ${path}.`);
    process.exit(1);
  }
  const { pack, contentHash } = result.compiled;
  console.log(`Pack: ${pack.meta.id} "${pack.meta.title}"  mode: parser  hash: ${contentHash}`);
  console.log(`  rooms: ${pack.rooms.length}  objects: ${pack.objects.length}  npcs: ${pack.npcs.length}  win_conditions: ${pack.win_conditions.length}`);
  console.log(`  start_room: ${pack.meta.start_room}  max_score: ${pack.meta.max_score}`);
  const containers = pack.objects.filter((o) => o.container).length;
  const lockedExits = pack.rooms.flatMap((r) => r.exits).filter((e) => e.conditions.length > 0).length;
  console.log(`  containers: ${containers}  quest_critical: ${pack.objects.filter((o) => o.quest_critical).length}  locked exits: ${lockedExits}`);
  console.log("\n" + formatReport(validateParser(pack)));
}

function main(): void {
  const path = process.argv[2];
  if (!path || path.startsWith("--")) {
    console.error("Usage: npm run inspect -- <pack.yaml> | <trace.json> --pack <pack.yaml>");
    process.exit(2);
  }
  const raw = parseYaml(readFileSync(path, "utf8")) as Record<string, unknown> | null;
  const isTrace = !!raw && typeof raw === "object" && "trace_id" in raw;
  if (isTrace) {
    const pack = arg("--pack");
    if (!pack) {
      console.error("Inspecting a trace needs --pack <pack.yaml>.");
      process.exit(2);
    }
    inspectTrace(path, pack);
    return;
  }
  if (!!raw && typeof raw === "object" && "rooms" in raw) inspectParserPack(path);
  else inspectCyoaPack(path);
}

main();
