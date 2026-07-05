import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("RPG owns the live content/runtime contract", () => {
  it("has no legacy parser source tree or parser validator", () => {
    expect(existsSync("src/parser")).toBe(false);
    expect(existsSync("src/validate/parser_validator.ts")).toBe(false);
    expect(existsSync("content/parser")).toBe(false);
  });

  it("does not import parser modules from RPG runtime or validation code", () => {
    const files = [
      "src/rpg/schema.ts",
      "src/rpg/model.ts",
      "src/rpg/legal_actions.ts",
      "src/rpg/runner.ts",
      "src/rpg/observation.ts",
      "src/rpg/pack.ts",
      "src/validate/rpg_foundation_validator.ts",
      "src/validate/rpg_validator.ts",
      "src/mcp/tools.ts",
      "ui/src/engine.ts",
      "bin/rpg_play.ts",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("../parser/");
      expect(source, file).not.toContain("./parser_validator");
      expect(source, file).not.toContain("validateParser");
      expect(source, file).not.toContain("ParserPackSchema");
      expect(source, file).not.toContain("ParserIndex");
    }
  });

  it("keeps shared gameplay primitives in core and imports them from RPG-owned code", () => {
    const schema = readFileSync("src/rpg/schema.ts", "utf8");
    const model = readFileSync("src/rpg/model.ts", "utf8");
    const runner = readFileSync("src/rpg/runner.ts", "utf8");
    const observation = readFileSync("src/rpg/observation.ts", "utf8");
    const validator = readFileSync("src/validate/rpg_validator.ts", "utf8");

    expect(schema).toContain("../core/conditions");
    expect(schema).toContain("../core/effects");
    expect(schema).toContain("../core/skill_check");
    expect(model).toContain("../core/reactive_text");
    expect(model).toContain("../core/object_locations");
    expect(model).toContain("../core/dialogue_state");
    expect(model).toContain("./state_init");
    expect(runner).toContain("./legal_actions");
    expect(runner).toContain("./score_events");
    expect(runner).toContain("./runtime_rng");
    expect(runner).toContain("./terminal_effects");
    expect(observation).toContain("./observation_state");
    expect(validator).toContain("./rpg_foundation_validator");
  });

  it("uses an RPG-only action and observation surface at public runtime boundaries", () => {
    const apiTypes = readFileSync("src/api/types.ts", "utf8");
    const mcpTools = readFileSync("src/mcp/tools.ts", "utf8");
    const mcpTypes = readFileSync("src/mcp/types.ts", "utf8");
    const sessions = readFileSync("src/mcp/sessions.ts", "utf8");
    const saveLoad = readFileSync("src/persist/save_load.ts", "utf8");
    const traceRecord = readFileSync("src/trace/record.ts", "utf8");
    const traceReplay = readFileSync("src/trace/replay.ts", "utf8");

    expect(apiTypes).toContain("export type RpgAction");
    expect(apiTypes).toContain("export type Action = RpgAction");
    expect(apiTypes).not.toContain("LegacyChooseAction");
    expect(mcpTypes).not.toContain("PackMode");
    expect(mcpTools).not.toContain("mode: SaveMode");
    expect(mcpTools).not.toContain("mode: lr.ok ? SAVE_MODE");
    expect(sessions).toContain("Rules<RpgAction>");
    expect(saveLoad).toContain("source_ref: SaveSourceRef;");
    expect(traceRecord).toContain("export type Trace<A extends EngineAction = RpgAction>");
    expect(traceRecord).toContain("source_ref: TraceSourceRef;");
    expect(traceReplay).toContain("trace: Trace<A>");
  });
});
