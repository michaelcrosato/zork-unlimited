import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("RPG schema owns the RPG contract", () => {
  it("does not extend the legacy parser schema", () => {
    const source = readFileSync("src/rpg/schema.ts", "utf8");
    expect(source).not.toContain("../parser/schema");
    expect(source).not.toContain("ParserPackSchema");
    expect(source).not.toContain("ParserMetaSchema");
  });
});
