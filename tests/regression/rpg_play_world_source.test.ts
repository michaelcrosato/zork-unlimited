/**
 * The human RPG CLI should follow the same world-source contract as MCP: shipped
 * quests are addressed by world quest id, and recorded traces carry that identity
 * so replay does not need a raw pack path.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RpgAction } from "../../src/api/types.js";
import { buildRpgRules, indexRpgPack } from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { runActions, type Trace } from "../../src/trace/record.js";

const ROOT = process.cwd();
const TSX = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const RECORDED_TRACE = "traces/cli_play_world_trace.json";
const VICTORY_COMMANDS = [
  "down",
  "west",
  "talk to reaver's shade",
  "ask about wight",
  "ask about leave_shade",
  "east",
  "take iron bar",
  "north",
  "attack barrow-wight",
  "attack barrow-wight",
  "attack barrow-wight",
  "attack barrow-wight",
  "east",
  "use iron bar on stone slab",
  "use iron bar on stone slab",
  "down",
  "take circlet",
].join("; ");

function runBin(script: string, args: string[]) {
  return spawnSync(process.execPath, [TSX, script, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
  });
}

function outputOf(result: ReturnType<typeof runBin>): string {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
}

describe("RPG play CLI world quest source", () => {
  it("defaults to the main world quest when no source is provided", () => {
    const result = runBin("bin/rpg_play.ts", ["--commands", "look"]);
    const output = outputOf(result);

    expect(result.status, output).toBe(1);
    expect(output).not.toContain("Usage:");
    expect(output).toContain("The command list did not reach an ending.");
  });

  it("plays a shipped quest by world quest id and records a replayable world-bound trace", () => {
    const result = runBin("bin/rpg_play.ts", [
      "sunken_barrow",
      "--commands",
      VICTORY_COMMANDS,
      "--record",
      RECORDED_TRACE,
    ]);
    const output = outputOf(result);

    expect(result.status, output).toBe(0);
    expect(output).toContain("*** ending_victory ***");
    expect(output).not.toContain("No such topic");
    expect(output).not.toContain("You can't do that right now.");

    const trace = JSON.parse(readFileSync(RECORDED_TRACE, "utf8")) as Trace<RpgAction> & {
      worldQuestId?: unknown;
      generatedRpgSeed?: unknown;
    };
    expect(trace.mode).toBe("rpg");
    expect(trace.trace_id).toBe("tr_rpg_play");
    expect(trace.source_ref).toEqual(["wq", "sunken_barrow"]);
    expect(trace.worldQuestId).toBeUndefined();
    expect(trace.generatedRpgSeed).toBeUndefined();
    expect("pack_id" in trace).toBe(false);
    expect(
      trace.actions.filter((action) => action.type === "ATTACK" && action.enemy === "barrow_wight"),
    ).toHaveLength(4);
    expect(
      trace.actions.some(
        (action) => action.type === "ASK" && /(?:wight|lord)_back$/.test(action.topic),
      ),
    ).toBe(false);

    const loaded = loadRpgSourceFile("content/rpg/quests/sunken_barrow.yaml");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const run = runActions(
      buildRpgRules(indexRpgPack(loaded.compiled.pack)),
      trace.initial_state,
      trace.actions,
    );
    expect(run.steps.map((step) => step.ok)).toEqual(trace.actions.map(() => true));
    expect(run.finalState.ended).toBe(true);
    expect(run.finalState.endingId).toBe("ending_victory");
    expect(run.finalState.vars["hp"]).toBeGreaterThan(0);

    const replay = runBin("bin/replay.ts", [RECORDED_TRACE]);
    const replayOutput = outputOf(replay);
    expect(replay.status, replayOutput).toBe(0);
    expect(replayOutput).toContain("source:       world_quest_id:sunken_barrow");
    expect(replayOutput).not.toContain("world quest:");
    expect(replayOutput).not.toContain("pack_id:");
    expect(replayOutput).toContain("REPLAY OK");
  });

  it("rejects raw pack-path starts on the public play surface", () => {
    const viaFlag = runBin("bin/rpg_play.ts", [
      "--pack",
      "content/rpg/quests/sunken_barrow.yaml",
      "--commands",
      "look",
    ]);
    const viaFlagOutput = outputOf(viaFlag);

    expect(viaFlag.status, viaFlagOutput).toBe(1);
    expect(viaFlagOutput).toContain("world quest id only");
    expect(viaFlagOutput).toContain("not --pack");

    const viaPositional = runBin("bin/rpg_play.ts", [
      "content/rpg/quests/sunken_barrow.yaml",
      "--commands",
      "look",
    ]);
    const viaPositionalOutput = outputOf(viaPositional);

    expect(viaPositional.status, viaPositionalOutput).toBe(1);
    expect(viaPositionalOutput).toContain("world quest id only");
    expect(viaPositionalOutput).toContain("npm run validate");
    expect(viaPositionalOutput).toContain("world_quest_id");
    expect(viaPositionalOutput).not.toContain("--pack");
  });
});
