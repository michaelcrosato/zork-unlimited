import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

type WorkflowStep = Readonly<{ run?: string; uses?: string; with?: Record<string, unknown> }>;
type WorkflowJob = Readonly<{ steps?: readonly WorkflowStep[]; "timeout-minutes"?: number }>;
type Workflow = Readonly<{
  on?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  jobs?: Record<string, WorkflowJob>;
}>;

const ROOT = resolve(process.cwd());

function workflow(path: string): Workflow {
  return parse(readFileSync(resolve(ROOT, path), "utf8")) as Workflow;
}

function runCommands(value: Workflow): string[] {
  return Object.values(value.jobs ?? {}).flatMap((job) =>
    (job.steps ?? []).flatMap((step) => (typeof step.run === "string" ? [step.run] : [])),
  );
}

describe("non-player audit wiring", () => {
  it("keeps trace and opening integrity in both health and pull-request CI", () => {
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as Record<
      string,
      Record<string, string>
    >;
    const health = packageJson.scripts?.health ?? "";
    const ciCommands = runCommands(workflow(".github/workflows/ci.yml"));

    expect(health).toContain("npm run verify:bug-traces");
    expect(health).toContain("npm run verify:opening-density");
    expect(ciCommands).toContain("npm run verify:bug-traces");
    expect(ciCommands).toContain("npm run verify:opening-density");
  });

  it("keeps the deep crawl and coverage audit scheduled and manually dispatchable", () => {
    const deepAudit = workflow(".github/workflows/deep-audit.yml");
    const commands = runCommands(deepAudit);
    const checkoutSteps = Object.values(deepAudit.jobs ?? {}).flatMap((job) =>
      (job.steps ?? []).filter((step) => step.uses === "actions/checkout@v4"),
    );

    expect(deepAudit.on).toHaveProperty("schedule");
    expect(deepAudit.on).toHaveProperty("workflow_dispatch");
    expect(deepAudit.permissions).toEqual({ contents: "read" });
    expect(commands).toContain("npm run crawl:deep");
    expect(commands).toContain("npm run audit:non-player");
    expect(checkoutSteps).toHaveLength(2);
    expect(checkoutSteps.every((step) => step.with?.["fetch-depth"] === 0)).toBe(true);
  });

  it("keeps coverage scoped to the standard project and the audit command", () => {
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as Record<
      string,
      Record<string, string>
    >;
    const scripts = packageJson.scripts ?? {};

    expect(scripts["test:coverage"]).toContain("--project standard");
    expect(scripts["test:coverage"]).toContain("--coverage");
    expect(scripts["test:coverage"]).toContain("--testTimeout=300000");
    expect(scripts.test).not.toContain("--testTimeout");
    expect(scripts["audit:non-player"]).toContain("npm run audit:standard-coverage");
    expect(scripts["audit:standard-coverage"]).toContain("--seconds 4200");
    expect(scripts["audit:standard-coverage"]).toContain("npm run test:coverage");
  });

  it("warns on fixed and rolling scheduled proof budgets without changing hard limits", () => {
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as Record<
      string,
      Record<string, string>
    >;
    const scripts = packageJson.scripts ?? {};
    const deepAudit = workflow(".github/workflows/deep-audit.yml");
    const cacheSteps = Object.values(deepAudit.jobs ?? {}).flatMap((job) =>
      (job.steps ?? []).filter((step) => step.uses === "actions/cache@v4"),
    );

    expect(scripts["audit:non-player"]).toContain("npm run audit:ending-render-proof");
    expect(scripts["audit:ending-render-proof"]).toContain("--seconds 420");
    expect(scripts["audit:ending-render-proof"]).toContain("test:ending-render-proof");
    expect(cacheSteps).toHaveLength(1);
    expect(cacheSteps[0]?.with?.path).toBe("ai-runs/performance-budget-history.json");
    expect(deepAudit.jobs?.["non-player-audit"]?.["timeout-minutes"]).toBe(120);
  });
});
