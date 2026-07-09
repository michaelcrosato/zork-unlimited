import { describe, it, expect } from "vitest";
import {
  generatorRpgDriftCandidate,
  type GeneratedPackCheck,
} from "../../src/afk/generated_eval.js";
import type { ValidationReport } from "../../src/validate/report.js";

const cleanReport: ValidationReport = {
  source_id: "test",
  ok: true,
  findings: [],
};

const dirtyReport: ValidationReport = {
  source_id: "test",
  ok: false,
  findings: [
    {
      severity: "error",
      code: "TEST_ERROR",
      message: "Test error message",
      where: ["room1"],
    },
  ],
};

const warningReport: ValidationReport = {
  source_id: "test",
  ok: true,
  findings: [
    {
      severity: "warning",
      code: "TEST_WARNING",
      message: "Test warning message",
      where: [],
    },
  ],
};

describe("generatorRpgDriftCandidate", () => {
  it("returns null when all checks are clean", () => {
    const checks: GeneratedPackCheck[] = [
      { seed: 1, report: cleanReport },
      { seed: 2, report: cleanReport },
    ];

    expect(generatorRpgDriftCandidate(checks)).toBeNull();
  });

  it("returns an ImprovementCandidate when there are checks with findings", () => {
    const checks: GeneratedPackCheck[] = [{ seed: 1, report: dirtyReport }];

    const result = generatorRpgDriftCandidate(checks);

    expect(result).not.toBeNull();
    expect(result?.id).toBe("generator-rpg-drift");
    expect(result?.category).toBe("engine");
    expect(result?.target).toBe("src/gen/rpg_generator.ts");
    expect(result?.title).toContain("minted 1 pack(s) the verifier rejects");
    expect(result?.evidence).toHaveLength(1);
    expect(result?.evidence[0]).toBe("seed 1: error:TEST_ERROR");
  });

  it("correctly identifies and formats multiple unclean checks among clean ones", () => {
    const checks: GeneratedPackCheck[] = [
      { seed: 1, report: cleanReport },
      { seed: 2, report: dirtyReport },
      { seed: 3, report: cleanReport },
      { seed: 4, report: warningReport },
    ];

    const result = generatorRpgDriftCandidate(checks);

    expect(result).not.toBeNull();
    expect(result?.title).toContain("minted 2 pack(s) the verifier rejects");
    expect(result?.evidence).toHaveLength(2);
    expect(result?.evidence[0]).toBe("seed 2: error:TEST_ERROR");
    expect(result?.evidence[1]).toBe("seed 4: warning:TEST_WARNING");
  });
});
