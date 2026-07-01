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
const PACK = "content/rpg/pack/sunken_barrow.yaml";
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
  it("npm run replay rejects a trace whose initial room is not in the RPG pack", () => {
    const result = run(`npm run replay -- ${PHANTOM_CURRENT} ${PACK}`);
    const output = outputOf(result);

    expect(result.status, output).not.toBe(0);
    expect(output).toContain('Save references unknown room "no_such_room"');
  });

  it("npm run inspect rejects a trace that omits the RPG mode", () => {
    const result = run(`npm run inspect -- ${MISSING_MODE} ${PACK}`);
    const output = outputOf(result);

    expect(result.status, output).not.toBe(0);
    expect(output).toContain("Trace mode must be");
  });
});
