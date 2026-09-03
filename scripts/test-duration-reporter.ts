import { appendFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import type { Reporter, TestModule } from "vitest/node";

/**
 * Records what every test file actually costs, so scheduling decisions rest on
 * measurement instead of a frozen guess.
 *
 * `scripts/ci-test-groups.ts` carries a hand-maintained cost table whose own comment
 * names the hazard it cannot fix: "a file that grows expensive carries no entry at all
 * and is packed as if trivial". Two entries in it already outlived their files by four
 * weeks and 543s. The fix is not a better table — it is a way to re-measure, which is
 * this reporter plus `scripts/test-duration-census.ts`.
 *
 * Vitest's built-in `json` reporter is NOT a substitute. It reports test-BODY time
 * only, and for an ordinary file in this repo the body is a small minority of the
 * price: `tests/unit/test_lanes.test.ts` spends 35ms in its six `it()` bodies and
 * 413ms importing the module graph those bodies exercise. Scheduling on body time
 * alone systematically under-prices exactly the many-small-files case that dominates
 * this suite, so this reporter sums the module's full diagnostic instead:
 * prepare + environment setup + collect (import/transform) + setup + body.
 *
 * Output is JSON Lines, appended as each module finishes, because the runs worth
 * measuring are the long ones: a census run killed by a timeout or an OOM still
 * leaves a usable record of every file that completed before it died.
 */
export default class TestDurationReporter implements Reporter {
  private out = "";

  onInit(): void {
    this.out = process.env["TEST_DURATION_OUT"] ?? "ai-runs/test-durations.jsonl";
    mkdirSync(dirname(this.out), { recursive: true });
    // One run, one file. Appending across runs would silently mix a cold-cache run
    // with a warm one and average two different machines' answers into a third that
    // describes neither. Callers combine lanes by passing several files to the census.
    rmSync(this.out, { force: true });
  }

  onTestModuleEnd(testModule: TestModule): void {
    const diagnostic = testModule.diagnostic();
    const cases: { name: string; ms: number; state: string }[] = [];
    for (const test of testModule.children.allTests()) {
      const result = test.result();
      cases.push({
        name: test.fullName,
        ms: result.state === "pending" ? 0 : (test.diagnostic()?.duration ?? 0),
        state: result.state,
      });
    }
    const record = {
      file: relativeToCwd(testModule.moduleId),
      project: testModule.project.name,
      state: testModule.state(),
      tests: cases.length,
      // The schedulable price of the file: everything a worker spends on it.
      totalMs:
        diagnostic.prepareDuration +
        diagnostic.environmentSetupDuration +
        diagnostic.collectDuration +
        diagnostic.setupDuration +
        diagnostic.duration,
      durationMs: diagnostic.duration,
      collectMs: diagnostic.collectDuration,
      setupMs: diagnostic.setupDuration,
      environmentMs: diagnostic.environmentSetupDuration,
      prepareMs: diagnostic.prepareDuration,
      cases,
    };
    appendFileSync(this.out, `${JSON.stringify(record)}\n`);
  }
}

function relativeToCwd(moduleId: string): string {
  const root = `${process.cwd()}/`;
  const normalized = moduleId.split("\\").join("/");
  return normalized.startsWith(root) ? normalized.slice(root.length) : normalized;
}
