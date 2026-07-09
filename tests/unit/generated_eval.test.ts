import { describe, expect, it } from "vitest";
import { allGeneratedChecksClean, type GeneratedPackCheck } from "../../src/afk/generated_eval.js";

describe("generated_eval", () => {
  describe("allGeneratedChecksClean", () => {
    it("returns true when checks array is empty", () => {
      const checks: GeneratedPackCheck[] = [];
      expect(allGeneratedChecksClean(checks)).toBe(true);
    });

    it("returns true when all checks have zero findings", () => {
      const checks: GeneratedPackCheck[] = [
        { seed: 1, report: { source_id: "1", ok: true, findings: [] } },
        { seed: 2, report: { source_id: "2", ok: true, findings: [] } },
      ];
      expect(allGeneratedChecksClean(checks)).toBe(true);
    });

    it("returns false when any check has findings", () => {
      const checks: GeneratedPackCheck[] = [
        { seed: 1, report: { source_id: "1", ok: true, findings: [] } },
        {
          seed: 2,
          report: {
            source_id: "2",
            ok: false,
            findings: [{ severity: "error", code: "ERR1", message: "Test error", where: [] }],
          },
        },
      ];
      expect(allGeneratedChecksClean(checks)).toBe(false);
    });
  });
});
