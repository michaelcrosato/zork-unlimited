import { describe, expect, it } from "vitest";
import {
  rpgGeneratorChecksForRoot,
  GEN_EVAL_CHECK_COUNT,
  allGeneratedChecksClean,
  generatorRpgDriftCandidate
} from "../../src/afk/generated_eval.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("generated_eval", () => {
  describe("rpgGeneratorChecksForRoot", () => {
    it("generates the expected number of checks with correct seeds based on cycle count", () => {
      const root = join(tmpdir(), "generated_eval_test");
      rmSync(root, { recursive: true, force: true });
      mkdirSync(root, { recursive: true });

      // Create an AI_LOOP_STATE.md with a known cycle count
      writeFileSync(
        join(root, "AI_LOOP_STATE.md"),
        "<!-- historical_cycle_count: 3 -->\n### Cycle result\n### Cycle result"
      );

      const checks = rpgGeneratorChecksForRoot(root);

      // total cycle count should be 3 (historical) + 2 (entries) = 5
      // genBase should be 5 * GEN_EVAL_CHECK_COUNT (5 * 4 = 20)

      expect(checks).toHaveLength(GEN_EVAL_CHECK_COUNT);
      expect(checks[0].seed).toBe(20);
      expect(checks[1].seed).toBe(21);
      expect(checks[2].seed).toBe(22);
      expect(checks[3].seed).toBe(23);

      // Verify structure
      for (const check of checks) {
        expect(check.report).toBeDefined();
        expect(typeof check.report.ok).toBe("boolean");
        expect(Array.isArray(check.report.findings)).toBe(true);
      }

      rmSync(root, { recursive: true, force: true });
    });

    it("handles an empty root directory gracefully", () => {
      const root = join(tmpdir(), "generated_eval_test_empty");
      rmSync(root, { recursive: true, force: true });
      mkdirSync(root, { recursive: true });

      // With no loop state file, cycle count is 0
      const checks = rpgGeneratorChecksForRoot(root);

      expect(checks).toHaveLength(GEN_EVAL_CHECK_COUNT);
      // genBase = 0 * GEN_EVAL_CHECK_COUNT = 0
      expect(checks[0].seed).toBe(0);
      expect(checks[3].seed).toBe(3);

      rmSync(root, { recursive: true, force: true });
    });
  });

  describe("allGeneratedChecksClean", () => {
    it("returns true if all checks have zero findings", () => {
      const checks = [
        { seed: 0, report: { ok: true, findings: [] } as any },
        { seed: 1, report: { ok: true, findings: [] } as any }
      ];
      expect(allGeneratedChecksClean(checks)).toBe(true);
    });

    it("returns false if any check has findings", () => {
      const checks = [
        { seed: 0, report: { ok: true, findings: [] } as any },
        {
          seed: 1,
          report: {
            ok: false,
            findings: [{ severity: "error", code: "ERR", message: "boom", where: [] }]
          } as any
        }
      ];
      expect(allGeneratedChecksClean(checks)).toBe(false);
    });
  });

  describe("generatorRpgDriftCandidate", () => {
    it("returns null when all checks are clean", () => {
      const checks = [
        { seed: 0, report: { ok: true, findings: [] } as any },
        { seed: 1, report: { ok: true, findings: [] } as any }
      ];
      expect(generatorRpgDriftCandidate(checks)).toBeNull();
    });

    it("returns a candidate when checks have findings", () => {
      const checks = [
        { seed: 0, report: { ok: true, findings: [] } as any },
        {
          seed: 1,
          report: {
            ok: false,
            findings: [{ severity: "error", code: "TEST_ERR", message: "boom", where: [] }]
          } as any
        }
      ];
      const candidate = generatorRpgDriftCandidate(checks);
      expect(candidate).not.toBeNull();
      expect(candidate!.id).toBe("generator-rpg-drift");
      expect(candidate!.evidence[0]).toContain("seed 1:");
      expect(candidate!.evidence[0]).toContain("error:TEST_ERR");
    });
  });
});
