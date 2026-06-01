/**
 * Controlled command parser (§9.3): text commands map to the same structured
 * Actions the AI uses; object/alias resolution; modal dialogue; friendly errors.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { makeStep } from "../../src/core/engine.js";
import { parseCommand } from "../../src/parser/command_map.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
if (!loaded.ok) throw new Error("compile");
const index = indexParserPack(loaded.compiled.pack);
const step = makeStep(buildParserRules(index));

function doId(s: GameState, id: string): GameState {
  const opt = enumerateActions(index, s).find((o) => o.id === id)!;
  return step(s, opt.action).state;
}

describe("command_map", () => {
  const start = initStateForParserPack(index, 1);

  it("maps directions, bare and explicit", () => {
    expect(parseCommand(index, start, "go north")).toEqual({
      ok: true,
      action: { type: "MOVE", direction: "north" },
    });
    expect(parseCommand(index, start, "north")).toEqual({
      ok: true,
      action: { type: "MOVE", direction: "north" },
    });
    expect(parseCommand(index, start, "n")).toEqual({
      ok: true,
      action: { type: "MOVE", direction: "north" },
    });
  });

  it("resolves objects by name and alias, stripping articles", () => {
    const bell = doId(doId(start, "go_north"), "go_up"); // bell_tower, rope present
    expect(parseCommand(index, bell, "take the rope")).toEqual({
      ok: true,
      action: { type: "TAKE", item: "rope" },
    });
    expect(parseCommand(index, bell, "take coil")).toEqual({
      ok: true,
      action: { type: "TAKE", item: "rope" },
    });
  });

  it("parses multi-word USE and UNLOCK forms", () => {
    expect(parseCommand(index, start, "use rope on old well")).toEqual({
      ok: true,
      action: { type: "USE", item: "rope", target: "old_well" },
    });
    expect(parseCommand(index, start, "unlock chest with brass key")).toEqual({
      ok: true,
      action: { type: "UNLOCK", target: "oak_chest", with: "brass_key" },
    });
  });

  it("maps inventory and look", () => {
    expect(parseCommand(index, start, "inventory")).toEqual({
      ok: true,
      action: { type: "INVENTORY" },
    });
    expect(parseCommand(index, start, "look")).toEqual({ ok: true, action: { type: "LOOK" } });
    expect(parseCommand(index, start, "examine old well")).toEqual({
      ok: true,
      action: { type: "LOOK", target: "old_well" },
    });
  });

  it("resolves dialogue topics by id and prompt while in conversation", () => {
    const nave = doId(doId(start, "go_north"), "go_north"); // chapel_nave
    const talking = doId(nave, "talk_sexton");
    expect(parseCommand(index, talking, "ask about crypt")).toEqual({
      ok: true,
      action: { type: "ASK", npc: "sexton", topic: "crypt" },
    });
    const bye = parseCommand(index, talking, "bye");
    expect(bye).toEqual({ ok: true, action: { type: "ASK", npc: "sexton", topic: "bye" } });
  });

  it("returns a friendly reason for unknown commands and unknown objects", () => {
    expect(parseCommand(index, start, "xyzzy").ok).toBe(false);
    expect(parseCommand(index, start, "take unicorn").ok).toBe(false);
  });
});
