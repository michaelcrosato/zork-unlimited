import { describe, it, expect } from "vitest";
import { generatorRpgDriftCandidate } from "../../src/afk/generated_eval.js";
import { makeReport } from "../../src/validate/report.js";

describe("generatorRpgDriftCandidate", () => {
  it("returns null when all checks are clean", () => {
    const checks = [
      { seed: 1, report: makeReport("pack1", []) },
      { seed: 2, report: makeReport("pack2", []) },
    ];
    expect(generatorRpgDriftCandidate(checks)).toBeNull();
  });

  it("returns a candidate when at least one check has findings", () => {
    const checks = [
      { seed: 1, report: makeReport("pack1", []) },
      {
        seed: 2,
        report: makeReport("pack2", [
          { severity: "error", code: "TEST_ERR", message: "fail", where: [] },
          { severity: "warning", code: "TEST_WARN", message: "warn", where: [] },
        ]),
      },
    ];

    const candidate = generatorRpgDriftCandidate(checks);
    expect(candidate).not.toBeNull();
    expect(candidate?.id).toBe("generator-rpg-drift");
    expect(candidate?.category).toBe("engine");
    expect(candidate?.target).toBe("src/gen/rpg_generator.ts");
    expect(candidate?.title).toBe(
      "The RPG pack generator minted 1 pack(s) the verifier rejects — the evolving RPG eval distribution has drifted from the shipped bar",
    );
    expect(candidate?.impact).toBe(5);
    expect(candidate?.effort).toBe("M");
    // Ensure the score is computed, we can just assert it's a number
    expect(typeof candidate?.score).toBe("number");

    expect(candidate?.evidence).toHaveLength(1);
    expect(candidate?.evidence[0]).toBe("seed 2: error:TEST_ERR, warning:TEST_WARN");
  });

  it("handles multiple bad packs", () => {
    const checks = [
      {
        seed: 1,
        report: makeReport("pack1", [
          { severity: "error", code: "ERR1", message: "fail", where: [] },
        ]),
      },
      {
        seed: 2,
        report: makeReport("pack2", [
          { severity: "error", code: "ERR2", message: "fail", where: [] },
        ]),
      },
    ];

    const candidate = generatorRpgDriftCandidate(checks);
    expect(candidate).not.toBeNull();
    expect(candidate?.title).toBe(
      "The RPG pack generator minted 2 pack(s) the verifier rejects — the evolving RPG eval distribution has drifted from the shipped bar",
    );
    expect(candidate?.evidence).toEqual(["seed 1: error:ERR1", "seed 2: error:ERR2"]);
  });
});
