import { describe, expect, it } from "vitest";
import { formatReport, makeReport } from "../../src/validate/report.js";

describe("validation report formatting", () => {
  it("keeps pack ids by default for internal diagnostics", () => {
    const text = formatReport(makeReport("generated_rpg_7", []));

    expect(text).toContain("Pack: generated_rpg_7");
    expect(text).toContain("Result: OK");
  });

  it("can omit pack ids for world-quest keyed CLI gates", () => {
    const text = formatReport(makeReport("sunken_barrow_v1", []), { includePackId: false });

    expect(text).not.toContain("Pack:");
    expect(text).toContain("Result: OK");
  });
});
