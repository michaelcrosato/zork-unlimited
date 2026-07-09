import { describe, expect, it, vi } from "vitest";
import {
  rpgGeneratorChecksForRoot,
  GEN_EVAL_CHECK_COUNT,
  allGeneratedChecksClean,
  generatorRpgDriftCandidate,
  type GeneratedPackCheck,
} from "../../src/afk/generated_eval.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as rpgGenerator from "../../src/gen/rpg_generator.js";
import * as rpgValidator from "../../src/validate/rpg_validator.js";

// Mock the heavy functions
vi.mock("../../src/gen/rpg_generator.js", () => ({
  generateRpgPack: vi.fn().mockReturnValue({}),
}));

vi.mock("../../src/validate/rpg_validator.js", () => ({
  validateRpg: vi.fn().mockReturnValue({ ok: true, findings: [] }),
}));

describe("generated_eval", () => {
  describe("rpgGeneratorChecksForRoot", () => {
    it("generates the expected number of checks with correct seeds based on cycle count", () => {
      const root = join(tmpdir(), "generated_eval_test");
      rmSync(root, { recursive: true, force: true });
      mkdirSync(root, { recursive: true });

      // Create an AI_LOOP_STATE.md with a known cycle count
      writeFileSync(
        join(root, "AI_LOOP_STATE.md"),
        "<!-- historical_cycle_count: 3 -->\n### Cycle result\n### Cycle result",
      );

      const checks = rpgGeneratorChecksForRoot(root);

      // total cycle count should be 3 (historical) + 2 (entries) = 5
      const expectedGenBase = 5 * GEN_EVAL_CHECK_COUNT;

      expect(checks).toHaveLength(GEN_EVAL_CHECK_COUNT);
      for (let i = 0; i < GEN_EVAL_CHECK_COUNT; i++) {
        expect(checks[i]?.seed).toBe(expectedGenBase + i);
      }

      // Verify structure
      for (const check of checks) {
        expect(check.report).toBeDefined();
        expect(typeof check.report.ok).toBe("boolean");
        expect(Array.isArray(check.report.findings)).toBe(true);
      }

      // Verify that our mocks were called
      expect(rpgGenerator.generateRpgPack).toHaveBeenCalledTimes(GEN_EVAL_CHECK_COUNT);
      expect(rpgValidator.validateRpg).toHaveBeenCalledTimes(GEN_EVAL_CHECK_COUNT);

      rmSync(root, { recursive: true, force: true });
    });

    it("handles an empty root directory gracefully", () => {
      vi.clearAllMocks(); // Clear call counts from previous test

      const root = join(tmpdir(), "generated_eval_test_empty");
      rmSync(root, { recursive: true, force: true });
      mkdirSync(root, { recursive: true });

      // With no loop state file, cycle count is 0
      const checks = rpgGeneratorChecksForRoot(root);

      expect(checks).toHaveLength(GEN_EVAL_CHECK_COUNT);
      // genBase = 0 * GEN_EVAL_CHECK_COUNT = 0
      for (let i = 0; i < GEN_EVAL_CHECK_COUNT; i++) {
        expect(checks[i]?.seed).toBe(i);
      }

      // Verify that our mocks were called
      expect(rpgGenerator.generateRpgPack).toHaveBeenCalledTimes(GEN_EVAL_CHECK_COUNT);
      expect(rpgValidator.validateRpg).toHaveBeenCalledTimes(GEN_EVAL_CHECK_COUNT);

      rmSync(root, { recursive: true, force: true });
    });
  });

  describe("allGeneratedChecksClean", () => {
    it("returns true if all checks have zero findings", () => {
      const checks: GeneratedPackCheck[] = [
        { seed: 0, report: { ok: true, findings: [] } as unknown as GeneratedPackCheck["report"] },
        { seed: 1, report: { ok: true, findings: [] } as unknown as GeneratedPackCheck["report"] },
      ];
      expect(allGeneratedChecksClean(checks)).toBe(true);
    });

    it("returns false if any check has findings", () => {
      const checks: GeneratedPackCheck[] = [
        { seed: 0, report: { ok: true, findings: [] } as unknown as GeneratedPackCheck["report"] },
        {
          seed: 1,
          report: {
            ok: false,
            findings: [{ severity: "error", code: "ERR", message: "boom", where: [] }],
          } as unknown as GeneratedPackCheck["report"],
        },
      ];
      expect(allGeneratedChecksClean(checks)).toBe(false);
    });
  });

  describe("generatorRpgDriftCandidate", () => {
    it("returns null when all checks are clean", () => {
      const checks: GeneratedPackCheck[] = [
        { seed: 0, report: { ok: true, findings: [] } as unknown as GeneratedPackCheck["report"] },
        { seed: 1, report: { ok: true, findings: [] } as unknown as GeneratedPackCheck["report"] },
      ];
      expect(generatorRpgDriftCandidate(checks)).toBeNull();
    });

    it("returns a candidate when checks have findings", () => {
      const checks: GeneratedPackCheck[] = [
        { seed: 0, report: { ok: true, findings: [] } as unknown as GeneratedPackCheck["report"] },
        {
          seed: 1,
          report: {
            ok: false,
            findings: [{ severity: "error", code: "TEST_ERR", message: "boom", where: [] }],
          } as unknown as GeneratedPackCheck["report"],
        },
      ];
      const candidate = generatorRpgDriftCandidate(checks);
      expect(candidate).not.toBeNull();
      expect(candidate!.id).toBe("generator-rpg-drift");
      expect(candidate!.evidence[0]).toContain("seed 1:");
      expect(candidate!.evidence[0]).toContain("error:TEST_ERR");
    });
  });
});
