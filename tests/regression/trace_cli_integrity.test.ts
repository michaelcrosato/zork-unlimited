/**
 * CLI trace integrity should match MCP trace integrity. The replay/inspect
 * commands are debugging surfaces, so they must reject forged trace files before
 * stepping untrusted state through the engine.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it, beforeAll } from "vitest";
import type { Trace } from "../../src/trace/record.js";
import type { RpgAction } from "../../src/api/types.js";

const ROOT = process.cwd();
const PACK = "content/rpg/quests/sunken_barrow.yaml";
const SOURCE_TRACE = "traces/rpg/barrow_victory.json";
const PHANTOM_CURRENT = "traces/bug_cli_phantom_current.json";
const MISSING_MODE = "traces/bug_cli_missing_mode.json";

function run(command: string) {
  return spawnSync(command, {
    cwd: ROOT,
    encoding: "utf8",
    shell: true,
    timeout: 30_000,
  });
}

function outputOf(result: ReturnType<typeof run>): string {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
}

function loadTrace(): Trace<RpgAction> {
  return JSON.parse(readFileSync(SOURCE_TRACE, "utf8")) as Trace<RpgAction>;
}

beforeAll(() => {
  mkdirSync("traces", { recursive: true });

  const phantom = loadTrace();
  phantom.initial_state = { ...phantom.initial_state, current: "no_such_room" };
  writeFileSync(PHANTOM_CURRENT, JSON.stringify(phantom));

  const { mode: _drop, ...missingMode } = loadTrace();
  writeFileSync(MISSING_MODE, JSON.stringify(missingMode));
});

describe("trace CLI integrity gate", () => {
  it("npm run replay infers a shipped trace source from embedded source_ref", () => {
    const result = run(`npm run replay -- ${SOURCE_TRACE}`);
    const output = outputOf(result);

    expect(result.status, output).toBe(0);
    expect(output).toContain("source:       world_quest_id:sunken_barrow");
    expect(output).not.toContain("world quest:");
    expect(output).not.toContain("pack file:");
    expect(output).not.toContain("pack_id:");
    expect(output).not.toContain(PACK);
    expect(output).toContain("REPLAY OK");
  });

  it("npm run inspect infers a shipped trace source from embedded source_ref", () => {
    const result = run(`npm run inspect -- ${SOURCE_TRACE}`);
    const output = outputOf(result);

    expect(result.status, output).toBe(0);
    expect(output).toContain("source: world_quest_id:sunken_barrow");
    expect(output).not.toContain("world_quest:");
    expect(output).not.toContain(PACK);
    expect(output).toContain("Replay: OK");
    expect(output).toContain("Suspected bug:");
  });

  it("npm run inspect summarizes shipped quests by world quest id", () => {
    const result = run("npm run inspect -- sunken_barrow");
    const output = outputOf(result);

    expect(result.status, output).toBe(0);
    expect(output).toContain("World quest: sunken_barrow");
    expect(output).toContain('Title: "The Sunken Barrow"');
    expect(output).toContain(
      "hash: 1400a6d4d3e3f9eb3443b9c0daf1ebb539754c293da8e531a133de815bbd2a9a",
    );
    expect(output).not.toContain("mode: rpg");
    expect(output).not.toContain("Pack:");
    expect(output).not.toContain("Source:");
    expect(output).not.toContain("sunken_barrow_v1");
    expect(output).not.toContain(PACK);
  });

  it("npm run inspect rejects positional raw pack paths for quest summaries", () => {
    const result = run(`npm run inspect -- ${PACK}`);
    const output = outputOf(result);

    expect(result.status, output).toBe(2);
    expect(output).toContain("inspect targets are world quest ids");
    expect(output).toContain("raw pack paths are not accepted");
  });

  it("npm run inspect rejects explicit raw pack summary mode", () => {
    const result = run(`npm run inspect -- --pack ${PACK}`);
    const output = outputOf(result);

    expect(result.status, output).toBe(2);
    expect(output).toContain("not --pack");
  });

  it("trace CLIs reject an explicit source that conflicts with the trace source_ref", () => {
    const replay = run(`npm run replay -- ${SOURCE_TRACE} --world-quest-id cold_forge`);
    const inspect = run(`npm run inspect -- ${SOURCE_TRACE} --world-quest-id cold_forge`);

    expect(replay.status, outputOf(replay)).not.toBe(0);
    expect(outputOf(replay)).toContain("source_ref");
    expect(inspect.status, outputOf(inspect)).not.toBe(0);
    expect(outputOf(inspect)).toContain("source_ref");
  });

  it("trace CLIs reject positional raw pack paths as source selectors", () => {
    const replay = run(`npm run replay -- ${SOURCE_TRACE} ${PACK}`);
    const inspect = run(`npm run inspect -- ${SOURCE_TRACE} ${PACK}`);

    expect(replay.status, outputOf(replay)).not.toBe(0);
    expect(outputOf(replay)).toContain("world quest ids");
    expect(inspect.status, outputOf(inspect)).not.toBe(0);
    expect(outputOf(inspect)).toContain("world quest ids");
  });

  it("trace CLIs reject explicit raw pack source flags", () => {
    const replay = run(`npm run replay -- ${SOURCE_TRACE} --pack ${PACK}`);
    const inspect = run(`npm run inspect -- ${SOURCE_TRACE} --pack ${PACK}`);

    expect(replay.status, outputOf(replay)).not.toBe(0);
    expect(outputOf(replay)).toContain("not --pack");
    expect(inspect.status, outputOf(inspect)).not.toBe(0);
    expect(outputOf(inspect)).toContain("not --pack");
  });

  it("npm run replay rejects a trace whose initial room is not in the RPG pack", () => {
    const result = run(`npm run replay -- ${PHANTOM_CURRENT}`);
    const output = outputOf(result);

    expect(result.status, output).not.toBe(0);
    expect(output).toContain('Save references unknown room "no_such_room"');
  });

  it("npm run inspect rejects a trace that omits the RPG mode", () => {
    const result = run(`npm run inspect -- ${MISSING_MODE}`);
    const output = outputOf(result);

    expect(result.status, output).not.toBe(0);
    expect(output).toContain("Trace mode must be");
  });
});
