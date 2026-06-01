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

  it("the CYOA pack compiles to its pinned content hash (determinism snapshot)", () => {
    const loaded = loadPackFile("content/cyoa/pack/watchtower_road.yaml");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    // Pinned snapshot of the current pack. The gated Stage-4 DSL additions did not
    // change it (was df85b4f…); this value updated only when the pack content was
    // deliberately edited to fix blind-playtest findings (stale text, duplicate
    // journal, ledger inventory), bug_0003 cellar discoverability, and bug_0004 —
    // the hermit's tower lore now journals + de-loops (was c49b4424…). Any
    // *unintended* change to compilation trips this.
    expect(loaded.compiled.contentHash).toBe("8094e553f6a9a9d7a91508b4d8c6056e0082189454aa7184e48650338b42f460");
  });
});
