/**
 * Persona preflight for live playtest waves (audit/fix-2026-08-30).
 *
 * The cohort preflight validated provider drivability but not personas, so a
 * live wave configured with rotated personas (the shape the runbook itself
 * once suggested) dispatched players that blind-tester/run.sh refused one by
 * one AFTER dispatch — and the unconditional recorder then filed each refusal
 * as a `failed` session under a real vendor's name. The wave must refuse
 * up front, exactly like the drivability gate beside it.
 */
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runPlaytestLoop(env: Record<string, string>): {
  status: number | null;
  output: string;
} {
  const result = spawnSync("bash", ["playtest-loop.sh"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 60_000,
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`,
  };
}

describe("playtest-loop persona preflight", () => {
  it("refuses a live wave whose personas run.sh would reject player by player", () => {
    const { status, output } = runPlaytestLoop({
      PLAYTEST_COHORT: "codex:1",
      PLAYTEST_PERSONAS: "default,cynical_veteran,breaker",
      PLAYTEST_MOCK: "0",
      // A dev loop holding this checkout would refuse earlier for its own
      // reason; this test is about the persona gate, not checkout sharing.
      PLAYTEST_ALLOW_SHARED_CHECKOUT: "1",
    });
    expect(status, output).toBe(1);
    expect(output).toContain("Refusing the wave");
    expect(output).toContain("cynical_veteran");
    expect(output).toContain("breaker");
    // The refusal points at the structural lanes where personas are legal.
    expect(output).toContain("fleet:mock");
    // Nothing was dispatched: no player line, no recorder invocation.
    expect(output).not.toContain("▸ codex seed=");
  }, 90_000);

  it("does not blame personas when the list is all-default", () => {
    // An undrivable cohort keeps this hermetic (nothing can launch), while an
    // all-default persona list proves the persona gate stays silent: the one
    // refusal must be the drivability one. This is also the runbook's old
    // gemini example, which must refuse fast rather than dispatch a wave.
    const { status, output } = runPlaytestLoop({
      PLAYTEST_COHORT: "gemini_cli:1",
      PLAYTEST_PERSONAS: "default",
      PLAYTEST_MOCK: "0",
      PLAYTEST_ALLOW_SHARED_CHECKOUT: "1",
    });
    expect(status, output).toBe(1);
    expect(output).toContain("Refusing the cohort");
    expect(output).not.toContain("Refusing the wave: PLAYTEST_PERSONAS");
  }, 90_000);
});
