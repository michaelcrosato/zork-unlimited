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

  it("does not import the legacy parser observation builder for RPG observations", () => {
    const observation = readFileSync("src/rpg/observation.ts", "utf8");
    expect(observation).not.toContain("../parser/");
    expect(observation).not.toContain("buildParserObservation");
    expect(observation).not.toContain("ParserObservation");
  });

  it("does not import the legacy parser command mapper for RPG play", () => {
    const commandMap = readFileSync("src/rpg/command_map.ts", "utf8");
    const playBin = readFileSync("bin/rpg_play.ts", "utf8");
    expect(commandMap).not.toContain("../parser/");
    expect(commandMap).not.toContain("ParserIndex");
    expect(playBin).not.toContain("../src/parser/command_map");
  });

  it("uses an RPG-only action type at RPG runtime boundaries", () => {
    const apiTypes = readFileSync("src/api/types.ts", "utf8");
    const legalActions = readFileSync("src/rpg/legal_actions.ts", "utf8");
    const commandMap = readFileSync("src/rpg/command_map.ts", "utf8");
    const observation = readFileSync("src/rpg/observation.ts", "utf8");
    const runner = readFileSync("src/rpg/runner.ts", "utf8");
    const sessions = readFileSync("src/mcp/sessions.ts", "utf8");
    expect(apiTypes).toContain("export type RpgAction");
    expect(apiTypes).toContain("isRpgAction");
    expect(legalActions).toContain("RpgAction");
    expect(commandMap).toContain("RpgAction");
    expect(observation).toContain("RpgAction");
    expect(runner).toContain("Rules<RpgAction>");
    expect(runner).toContain("isRpgAction(action)");
    expect(sessions).toContain("Rules<RpgAction>");
  });

  it("does not import the legacy parser validator for RPG validation", () => {
    const foundation = readFileSync("src/validate/rpg_foundation_validator.ts", "utf8");
    const validator = readFileSync("src/validate/rpg_validator.ts", "utf8");
    expect(foundation).not.toContain("../parser/");
    expect(foundation).not.toContain("ParserPack");
    expect(validator).not.toContain("./parser_validator");
    expect(validator).not.toContain("validateParser");
  });
});
