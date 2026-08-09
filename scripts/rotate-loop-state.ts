#!/usr/bin/env -S npx tsx
import { resolve } from "node:path";
import { rotateLoopState } from "../src/afk/loop_state.js";

function main(): void {
  if (process.argv.length > 2) {
    console.error("usage: rotate-loop-state.ts");
    process.exitCode = 2;
    return;
  }

  try {
    const moved = rotateLoopState(resolve(process.cwd()));
    console.log(
      moved === 0
        ? "Loop-state rotation: live history already within its limit."
        : `Loop-state rotation: archived ${moved} completed cycle ${moved === 1 ? "entry" : "entries"}.`,
    );
  } catch (error) {
    console.error(
      `Loop-state rotation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

main();
