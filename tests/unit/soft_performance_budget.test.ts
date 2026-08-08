import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateSoftBudget,
  resolveSoftBudgetInvocation,
} from "../../scripts/run-with-soft-budget.js";

const TSX_CLI = resolve("node_modules", "tsx", "dist", "cli.mjs");

describe("scheduled soft performance budgets", () => {
  it("warns above the fixed budget without changing command status", () => {
    expect(evaluateSoftBudget(421, 420, [])).toMatchObject({
      exceeded: true,
      fixedBudgetSeconds: 420,
      rollingMedianSeconds: null,
    });
    expect(evaluateSoftBudget(420, 420, []).exceeded).toBe(false);
  });

  it("waits for five clean samples before applying the 1.5x rolling median", () => {
    expect(evaluateSoftBudget(160, 1_000, [100, 100, 100, 100]).exceeded).toBe(false);
    const evaluation = evaluateSoftBudget(151, 1_000, [80, 90, 100, 110, 120]);
    expect(evaluation).toMatchObject({
      exceeded: true,
      rollingMedianSeconds: 100,
      rollingLimitSeconds: 150,
    });
    expect(evaluation.reasons).toContain("1.5x rolling median 150.0s exceeded");
  });

  it("runs npm through its JavaScript CLI on Windows without changing Unix commands", () => {
    const npmCli = { command: "node.exe", args: ["C:\\npm\\npm-cli.js"] };

    expect(resolveSoftBudgetInvocation("npm", ["run", "test"], "win32", npmCli)).toEqual({
      command: "node.exe",
      args: ["C:\\npm\\npm-cli.js", "run", "test"],
    });
    expect(resolveSoftBudgetInvocation("npm.cmd", ["--version"], "win32", npmCli)).toEqual({
      command: "node.exe",
      args: ["C:\\npm\\npm-cli.js", "--version"],
    });
    expect(resolveSoftBudgetInvocation("npm", ["run", "test"], "linux", npmCli)).toEqual({
      command: "npm",
      args: ["run", "test"],
    });
  });

  it("can launch npm through the soft-budget wrapper on the host platform", () => {
    const result = spawnSync(
      process.execPath,
      [
        TSX_CLI,
        "scripts/run-with-soft-budget.ts",
        "--label",
        "launcher-smoke",
        "--seconds",
        "30",
        "--",
        "npm",
        "--version",
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 },
    );
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;

    expect(result.status, output).toBe(0);
    expect(output).toContain("launcher-smoke took");
    expect(output).not.toContain("Could not start npm");
  });
});
