import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitForChecks } from "../../scripts/ship.js";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawnSync: vi.fn(),
}));

function checkResult(status: number, stdout = "", stderr = ""): SpawnSyncReturns<string> {
  return { pid: 1, status, signal: null, stdout, stderr, output: [null, stdout, stderr] };
}

const unregistered = checkResult(1, "", "no required checks reported on the 'lane/example' branch");

describe("ship waits for required checks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T06:08:00Z"));
    vi.mocked(spawnSync).mockReset();
    vi.spyOn(Atomics, "wait").mockImplementation((_array, _index, _value, timeout) => {
      vi.advanceTimersByTime(timeout ?? 0);
      return "timed-out";
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("waits for verify to register after ten minutes of prerequisite jobs", () => {
    const started = Date.now();
    vi.mocked(spawnSync).mockImplementation(() => {
      const elapsed = Date.now() - started;
      if (elapsed < 10 * 60_000) return unregistered;
      if (elapsed < 10 * 60_000 + 20_000) return checkResult(8, "verify pending");
      return checkResult(0, "verify pass");
    });

    expect(waitForChecks("lane/example")).toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(10 * 60_000 + 20_000);
    expect(spawnSync).toHaveBeenLastCalledWith(
      "gh",
      ["pr", "checks", "lane/example", "--required"],
      {
        encoding: "utf8",
      },
    );
    expect(console.error).not.toHaveBeenCalled();
  });

  it("rejects an explicit failing check after registration", () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce(unregistered)
      .mockReturnValueOnce(checkResult(8, "verify pending"))
      .mockReturnValue(checkResult(1, "verify fail"));

    expect(waitForChecks("lane/example")).toBe(false);
    expect(spawnSync).toHaveBeenCalledTimes(3);
    expect(console.error).toHaveBeenCalledWith("verify fail");
  });

  it("rejects a CLI error immediately", () => {
    vi.mocked(spawnSync).mockReturnValue(checkResult(1, "", "HTTP 403: forbidden"));

    expect(waitForChecks("lane/example")).toBe(false);
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(Atomics.wait).not.toHaveBeenCalled();
  });

  it.each([
    ["never registers", unregistered],
    ["stays pending", checkResult(8, "verify pending")],
  ])("stops at the existing one-hour deadline if verify %s", (_description, response) => {
    const started = Date.now();
    vi.mocked(spawnSync).mockReturnValue(response);

    expect(waitForChecks("lane/example")).toBe(false);
    expect(Date.now() - started).toBe(60 * 60_000);
    expect(console.error).toHaveBeenLastCalledWith("Timed out waiting for required checks.");
  });

  it("returns immediately once all required checks pass", () => {
    vi.mocked(spawnSync).mockReturnValue(checkResult(0, "verify pass"));

    expect(waitForChecks("lane/example")).toBe(true);
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(Atomics.wait).not.toHaveBeenCalled();
  });
});
