import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLAYTEST_PROVIDERS,
  parsePlaytestCatalog,
  type PlaytestProvider,
} from "../../src/blind/providers.js";

/**
 * The registry's `isolation` label is the strongest claim in the QA pipeline: a
 * `runner_enforced` session counts toward experience metrics, an
 * `operator_attested` one does not. The label is hand-written data, and the code
 * that consumes it never asks whether the runner can actually launch the vendor,
 * so nothing but this file stops a new registry entry from asserting proof that
 * no code in the repo produces. These tests bind the data to the runner's real
 * capability instead of restating the vendor name in a second place.
 */

/** Pull the runner's own single-vendor constant rather than re-hard-coding "codex". */
function pureLaunchableProvider(): string {
  const runner = readFileSync(join(process.cwd(), "blind-tester", "run.sh"), "utf8");
  const match = /^PURE_LAUNCHABLE_PROVIDER="([a-z_]+)"$/mu.exec(runner);
  expect(match?.[1], "blind-tester/run.sh must declare PURE_LAUNCHABLE_PROVIDER").toBeDefined();
  return match![1]!;
}

function firstCatalogModel(provider: PlaytestProvider): string {
  const raw = JSON.parse(readFileSync(join(process.cwd(), provider.catalogPath), "utf8"));
  return parsePlaytestCatalog(provider, raw).models[0]!.id;
}

describe("playtest provider isolation matches what the runner can prove", () => {
  it("stamps runner_enforced only on the vendor the pure runner actually launches", () => {
    // `runner_enforced` blindness is read back out of the client's own session
    // logs, and exactly one vendor has such a reader. Every other registered
    // vendor can only ever be hand-played, so claiming the runner witnessed it is
    // false on its face — and it is the label bin/record-playtest-session.ts
    // copies verbatim into a sealed, content-addressed corpus record.
    const enforced = PLAYTEST_PROVIDERS.filter(
      (provider) => provider.isolation === "runner_enforced",
    ).map((provider) => provider.id);
    expect(enforced).toEqual([pureLaunchableProvider()]);
  });

  it("never delivers the player prompt as a launch argument", () => {
    // PlaytestLaunchSchema documents one prompt contract: STDIN, always. A flag
    // that takes the prompt as its VALUE silently consumes the next token, so
    // `--prompt-interactive -` made the literal string "-" the whole prompt and
    // left the real one unread on a pipe nobody drains. It also puts the player
    // prompt in the process table, which is the other half of why the contract
    // exists.
    const PROMPT_VALUE_FLAGS = new Set(["--prompt", "--prompt-interactive", "-i", "--interactive"]);
    for (const provider of PLAYTEST_PROVIDERS) {
      for (const arg of provider.launch?.argv ?? []) {
        expect(PROMPT_VALUE_FLAGS.has(arg), `${provider.id} argv contains ${arg}`).toBe(false);
      }
    }
  });

  it("refuses a pure run for every headless vendor the runner cannot launch", () => {
    // Before this check the only provider gate in the pure path asked whether the
    // vendor was a headless CLI at all, which claude_code and gemini_cli both
    // are. The run then fell through into the hard-coded Codex preflight and, on
    // a machine that has Codex installed, launched `codex exec --model <that
    // vendor's model>`: a burned launch reported under the wrong vendor.
    const launchable = pureLaunchableProvider();
    const candidates = PLAYTEST_PROVIDERS.filter(
      (provider) => provider.kind === "headless_cli" && provider.id !== launchable,
    );
    expect(candidates.length).toBeGreaterThan(0);

    for (const provider of candidates) {
      const result = spawnSync(
        process.execPath,
        [
          "blind-tester/blind-launch.mjs",
          "--provider",
          provider.id,
          "--model",
          firstCatalogModel(provider),
        ],
        { cwd: process.cwd(), encoding: "utf8", env: { ...process.env }, timeout: 30_000 },
      );
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
      expect(result.status, output).toBe(2);
      expect(output).toContain(`Provider "${provider.id}" cannot produce pure evidence`);
      expect(output).toContain("playtest:ingest");
      // The refusal must land before anything is launched or written, so the
      // operator never has to tell a launch refusal apart from a mid-play crash.
      expect(output).not.toContain("Blind playtest →");
    }
  }, 60_000);
});
