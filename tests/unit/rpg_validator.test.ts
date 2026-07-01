import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { loadParserPackFile } from "../../src/parser/pack.js";
import { validateParser } from "../../src/validate/parser_validator.js";

describe("RPG validator — shipped pack", () => {
  it("content/rpg/pack/sunken_barrow.yaml validates with no errors or warnings", () => {
    const loaded = loadRpgPackFile("content/rpg/pack/sunken_barrow.yaml");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const report = validateRpg(loaded.compiled.pack);
    expect(report.findings).toHaveLength(0);
    expect(report.ok).toBe(true);
  });
});

describe("RPG validator — negative fixture must fail", () => {
  it("rpg_unwinnable fails with COMBAT_UNWINNABLE", () => {
    const loaded = loadRpgPackFile("content/broken-fixtures/rpg_unwinnable.yaml");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const report = validateRpg(loaded.compiled.pack);
    expect(report.ok).toBe(false);
    expect(report.findings.map((f) => f.code)).toContain("COMBAT_UNWINNABLE");
  });
});

describe("legacy parser compatibility shim", () => {
  it("parser packs still validate green while parser support remains as migration data", () => {
    for (const path of ["content/parser/pack/sealed_crypt.yaml"]) {
      const loaded = loadParserPackFile(path);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      expect(validateParser(loaded.compiled.pack).ok).toBe(true);
    }
  });
});
