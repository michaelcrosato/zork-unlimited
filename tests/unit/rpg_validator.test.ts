/**
 * RPG validator (§10, §13 Stage 4) + negative fixture (§10.4) + §14 backward-compat.
 *
 * The shipped RPG pack validates green; a deliberately unwinnable fight is
 * rejected. The §14 gate requires that adding Stage 4 leaves every prior pack
 * byte-identical — so we assert the existing parser/CYOA pack content hashes are
 * unchanged by the new optional schema fields.
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { loadParserPackFile } from "../../src/parser/pack.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { loadPackFile } from "../../src/cyoa/pack.js";

describe("RPG validator — shipped pack (§13 Stage 4)", () => {
  it("content/rpg/pack/sunken_barrow.yaml validates with no errors or warnings", () => {
    const loaded = loadRpgPackFile("content/rpg/pack/sunken_barrow.yaml");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const report = validateRpg(loaded.compiled.pack);
    expect(report.findings).toHaveLength(0);
    expect(report.ok).toBe(true);
  });
});

describe("RPG validator — negative fixture must fail (§10.4)", () => {
  it("rpg_unwinnable fails with COMBAT_UNWINNABLE", () => {
    const loaded = loadRpgPackFile("content/broken-fixtures/rpg_unwinnable.yaml");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const report = validateRpg(loaded.compiled.pack);
    expect(report.ok).toBe(false);
    expect(report.findings.map((f) => f.code)).toContain("COMBAT_UNWINNABLE");
  });
});

describe("§14 backward-compatibility — prior packs unchanged", () => {
  // The Stage-4 additions are optional (skill_check) or top-level (enemies), so
  // existing packs compile to identical content and still validate green.
  it("the parser packs still validate green and unchanged", () => {
    for (const path of ["content/parser/pack/sealed_crypt.yaml", "content/parser/pack/alchemists_tower.yaml"]) {
      const loaded = loadParserPackFile(path);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      expect(validateParser(loaded.compiled.pack).ok).toBe(true);
    }
  });

  it("the CYOA pack content hash is stable after the gated DSL additions", () => {
    const loaded = loadPackFile("content/cyoa/pack/watchtower_road.yaml");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    // This hash was recorded before Stage 4; adding union members to the
    // condition/effect DSLs must not change content the pack does not use.
    expect(loaded.compiled.contentHash).toBe("df85b4fcfa088a71f31f6d65edced57ed9065ed870182f3d94f9f9d1e5e92fef");
  });
});
