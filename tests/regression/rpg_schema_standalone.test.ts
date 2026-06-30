import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("RPG schema owns the RPG contract", () => {
  it("does not extend the legacy parser schema", () => {
    const source = readFileSync("src/rpg/schema.ts", "utf8");
    expect(source).not.toContain("../parser/schema");
    expect(source).not.toContain("ParserPackSchema");
    expect(source).not.toContain("ParserMetaSchema");
  });

  it("does not import the legacy parser model for RPG indexing or initial state", () => {
    const model = readFileSync("src/rpg/model.ts", "utf8");
    const runner = readFileSync("src/rpg/runner.ts", "utf8");
    expect(model).not.toContain("../parser/");
    expect(runner).not.toContain("../parser/model");
    expect(runner).not.toContain("ParserIndex");
    expect(runner).not.toContain("indexParserPack");
    expect(runner).not.toContain("initStateForParserPack");
  });

  it("does not import the legacy parser legal-action resolver for RPG commands", () => {
    const legalActions = readFileSync("src/rpg/legal_actions.ts", "utf8");
    const runner = readFileSync("src/rpg/runner.ts", "utf8");
    expect(legalActions).not.toContain("../parser/");
    expect(runner).not.toContain("../parser/legal_actions");
    expect(runner).not.toContain("resolveParserAction");
    expect(runner).not.toContain("ParserActionOption");
  });

  it("does not import the legacy parser runner for RPG win or score events", () => {
    const runner = readFileSync("src/rpg/runner.ts", "utf8");
    expect(runner).not.toContain("../parser/runner");
    expect(runner).not.toContain("scoreChangeNarrations");
    expect(runner).not.toContain("winningEnding");
  });
});
