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

  it("keeps legacy parser legal actions as a shim over the RPG action loop", () => {
    const parserLegalActions = readFileSync("src/parser/legal_actions.ts", "utf8");
    expect(parserLegalActions).toContain("../rpg/legal_actions");
    expect(parserLegalActions).toContain("enumerateRpgBaseActions");
    expect(parserLegalActions).toContain("resolveRpgAction");
    expect(parserLegalActions).not.toContain('case "LOOK"');
    expect(parserLegalActions).not.toContain("function option(");
  });

  it("keeps legacy parser rules as a shim over the RPG rules engine", () => {
    const parserRunner = readFileSync("src/parser/runner.ts", "utf8");
    expect(parserRunner).toContain("../rpg/runner");
    expect(parserRunner).toContain("buildRpgRules");
    expect(parserRunner).toContain("winningRpgEnding");
    expect(parserRunner).not.toContain("resolveSkillCheck");
    expect(parserRunner).not.toContain("scoreChangeNarrations");
    expect(parserRunner).not.toContain("decorateEvents");
  });

  it("does not import the legacy parser runner for RPG win or score events", () => {
    const runner = readFileSync("src/rpg/runner.ts", "utf8");
    expect(runner).not.toContain("../parser/runner");
    expect(runner).toContain("../core/score_chrome");
    expect(runner).not.toContain("rpgScoreChangeNarrations");
    expect(runner).not.toContain("winningEnding");
  });

  it("keeps skill-check schema and resolution in core gameplay code", () => {
    const skillCheck = readFileSync("src/core/skill_check.ts", "utf8");
    const combat = readFileSync("src/rpg/combat.ts", "utf8");
    const parserRunner = readFileSync("src/parser/runner.ts", "utf8");
    const rpgRunner = readFileSync("src/rpg/runner.ts", "utf8");
    const cyoaRunner = readFileSync("src/cyoa/runner.ts", "utf8");
    const parserSchema = readFileSync("src/parser/schema.ts", "utf8");
    const rpgSchema = readFileSync("src/rpg/schema.ts", "utf8");
    const cyoaSchema = readFileSync("src/cyoa/schema.ts", "utf8");

    expect(skillCheck).toContain("export const SkillCheckSchema");
    expect(skillCheck).toContain("export function resolveSkillCheck");
    expect(combat).not.toContain("resolveSkillCheck");
    expect(rpgRunner).toContain("../core/skill_check");
    expect(parserRunner).toContain("../rpg/runner");
    expect(parserRunner).not.toContain("resolveSkillCheck");
    expect(cyoaRunner).toContain("../core/skill_check");
    expect(parserRunner).not.toContain("../rpg/combat");
    expect(cyoaRunner).not.toContain("../rpg/combat");
    expect(parserSchema).toContain("../core/skill_check");
    expect(rpgSchema).toContain("../core/skill_check");
    expect(cyoaSchema).toContain("../core/skill_check");
    expect(cyoaSchema).not.toContain("../parser/schema");
  });

  it("keeps reactive text selection in core gameplay code", () => {
    const reactiveText = readFileSync("src/core/reactive_text.ts", "utf8");
    const parserModel = readFileSync("src/parser/model.ts", "utf8");
    const rpgModel = readFileSync("src/rpg/model.ts", "utf8");
    const cyoaRunner = readFileSync("src/cyoa/runner.ts", "utf8");
    const rpgVariantLiveness = readFileSync(
      "tests/regression/rpg_variant_liveness.test.ts",
      "utf8",
    );

    expect(reactiveText).toContain("export function firstMatchingVariant");
    expect(reactiveText).toContain("export function reactiveText");
    expect(reactiveText).toContain("export function reactiveName");
    expect(parserModel).toContain("../core/reactive_text");
    expect(rpgModel).toContain("../core/reactive_text");
    expect(cyoaRunner).toContain("../core/reactive_text");
    expect(rpgModel).not.toContain("evalConditions(v.when");
    expect(rpgVariantLiveness).toContain("../../src/rpg/model.js");
    expect(rpgVariantLiveness).not.toContain("../../src/parser/model.js");
  });

  it("keeps object location and visibility in core gameplay code", () => {
    const objectLocations = readFileSync("src/core/object_locations.ts", "utf8");
    const parserModel = readFileSync("src/parser/model.ts", "utf8");
    const rpgModel = readFileSync("src/rpg/model.ts", "utf8");

    expect(objectLocations).toContain("export function indexObjectHomes");
    expect(objectLocations).toContain("export function locateObject");
    expect(objectLocations).toContain("export function visibleObjectIds");
    expect(parserModel).toContain("../core/object_locations");
    expect(rpgModel).toContain("../core/object_locations");
    expect(rpgModel).not.toContain("state.objectState[id]?.room");
    expect(rpgModel).not.toContain("state.objectState[id]?.locked");
    expect(rpgModel).not.toContain("for (const id of index.objects.keys())");
  });

  it("keeps dialogue session state in core gameplay code", () => {
    const dialogueState = readFileSync("src/core/dialogue_state.ts", "utf8");
    const parserModel = readFileSync("src/parser/model.ts", "utf8");
    const rpgModel = readFileSync("src/rpg/model.ts", "utf8");

    expect(dialogueState).toContain("export function dlgVar");
    expect(dialogueState).toContain("export function nodeOrdinal");
    expect(dialogueState).toContain("export function activeDialogue");
    expect(parserModel).toContain("../core/dialogue_state");
    expect(rpgModel).toContain("../core/dialogue_state");
    expect(rpgModel).not.toContain("`__dlg_${npcId}`");
    expect(rpgModel).not.toContain("state.vars[dlgVar(npc.id)]");
    expect(parserModel).not.toContain("state.vars[dlgVar(npc.id)]");
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
    const traceRecord = readFileSync("src/trace/record.ts", "utf8");
    const traceReplay = readFileSync("src/trace/replay.ts", "utf8");
    const engine = readFileSync("src/core/engine.ts", "utf8");
    const replayBin = readFileSync("bin/replay.ts", "utf8");
    const inspectBin = readFileSync("bin/inspect.ts", "utf8");
    const mcpTools = readFileSync("src/mcp/tools.ts", "utf8");
    expect(apiTypes).toContain("export type RpgAction");
    expect(apiTypes).toContain("export type Action = RpgAction");
    expect(apiTypes).not.toContain("LegacyChooseAction");
    expect(apiTypes).not.toContain("export type RpgAction = Exclude<Action");
    expect(apiTypes).not.toContain("isRpgAction");
    expect(legalActions).toContain("RpgAction");
    expect(commandMap).toContain("RpgAction");
    expect(observation).toContain("RpgAction");
    expect(runner).toContain("Rules<RpgAction>");
    expect(runner).not.toContain("isRpgAction");
    expect(sessions).toContain("Rules<RpgAction>");
    expect(traceRecord).toContain("export type Trace<A extends EngineAction = Action>");
    expect(traceRecord).toContain("actions: A[];");
    expect(traceRecord).toContain("actions: A[],");
    expect(engine).toContain("action: A): StepResult");
    expect(engine).toContain("export type EngineAction");
    expect(engine).not.toContain("action as A");
    expect(traceReplay).toContain("trace: Trace<A>");
    expect(replayBin).toContain("Trace<RpgAction>");
    expect(inspectBin).toContain("Trace<RpgAction>");
    expect(inspectBin).not.toContain("const mode =");
    expect(mcpTools).toContain("Trace<RpgAction>");
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
