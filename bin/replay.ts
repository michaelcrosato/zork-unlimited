#!/usr/bin/env -S npx tsx
/**
 * bin/replay — replay a recorded trace and assert its final-state hash (§8.8).
 *
 * Usage:
 *   npm run replay                 # build + round-trip a hand-written demo trace
 *   npm run replay -- <trace.json> # replay a trace file against the demo rules
 *
 * Stage 0 only knows the demo rule set (src/demo/micro.ts). Later stages select
 * a rule set by the trace's pack_id.
 */
import { readFileSync } from "node:fs";
import type { Action } from "../src/api/types.js";
import { recordTrace, type Trace } from "../src/trace/record.js";
import { replayTrace } from "../src/trace/replay.js";
import {
  microRules,
  microInitState,
  MICRO_PACK_ID,
  MICRO_CONTENT_HASH,
  MICRO_SEED,
} from "../src/demo/micro.js";

/** The canonical hand-written trace: take torch → enter cave → grab gold → win. */
function demoTrace(): Trace {
  const actions: Action[] = [
    { type: "CHOOSE", choiceId: "take_torch" },
    { type: "CHOOSE", choiceId: "enter_cave" },
    { type: "CHOOSE", choiceId: "grab_gold" },
    { type: "CHOOSE", choiceId: "win" },
  ];
  return recordTrace(microRules, microInitState(MICRO_SEED), actions, {
    trace_id: "tr_demo_0001",
    pack_id: MICRO_PACK_ID,
    content_hash: MICRO_CONTENT_HASH,
  });
}

function main(): void {
  const arg = process.argv[2];
  const trace: Trace = arg ? (JSON.parse(readFileSync(arg, "utf8")) as Trace) : demoTrace();

  if (trace.pack_id !== MICRO_PACK_ID) {
    console.error(`Unknown pack_id "${trace.pack_id}". Stage 0 only knows "${MICRO_PACK_ID}".`);
    process.exit(2);
  }

  const result = replayTrace(trace, microRules);
  console.log(`trace_id:     ${trace.trace_id}`);
  console.log(`pack_id:      ${trace.pack_id}`);
  console.log(`actions:      ${trace.actions.length}`);
  console.log(`final hash:   ${result.finalHash}`);
  console.log(`expected:     ${result.expectedFinalHash ?? "(none)"}`);
  console.log(result.ok ? "REPLAY OK — round-trip reproduced." : `REPLAY DIVERGED — ${result.message}`);
  process.exit(result.ok ? 0 : 1);
}

main();
