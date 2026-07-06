import { describe, expect, it } from "vitest";
import { formatReport, type Finding, makeReport } from "../../src/validate/report.js";

describe("validation report formatting", () => {
  it("snapshots and freezes findings at creation", () => {
    const findings: Finding[] = [
      {
        severity: "warning",
        code: "WARN",
        message: "original",
        where: ["rooms.start"],
      },
    ];

    const report = makeReport("pack", findings);

    expect(report.ok).toBe(true);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.findings)).toBe(true);
    expect(Object.isFrozen(report.findings[0])).toBe(true);
    expect(Object.isFrozen(report.findings[0]?.where)).toBe(true);

    findings[0]!.severity = "error";
    findings[0]!.message = "mutated";
    findings[0]!.where.push("rooms.changed");
    findings.push({
      severity: "error",
      code: "ERR",
      message: "late mutation",
      where: [],
    });

    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([
      {
        severity: "warning",
        code: "WARN",
        message: "original",
        where: ["rooms.start"],
      },
    ]);

    expect(() => report.findings.push(findings[1]!)).toThrow(TypeError);
    expect(() => {
      report.findings[0]!.message = "direct mutation";
    }).toThrow(TypeError);
    expect(() => report.findings[0]!.where.push("rooms.direct")).toThrow(TypeError);
    expect(formatReport(report)).toContain("Result: OK  (0 error(s), 1 warning(s))");
  });

  it("keeps source ids by default for internal diagnostics", () => {
    const text = formatReport(makeReport("generated_rpg_7", []));

    expect(text).toContain("Source: generated_rpg_7");
    expect(text).toContain("Result: OK");
  });

  it("can omit source ids for world-quest keyed CLI gates", () => {
    const text = formatReport(makeReport("sunken_barrow_v1", []), { includeSourceId: false });

    expect(text).not.toContain("Source:");
    expect(text).toContain("Result: OK");
  });
});
