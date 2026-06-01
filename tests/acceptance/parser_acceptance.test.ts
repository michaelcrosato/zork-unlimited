/**
 * Stage 2 acceptance (§13) — the end-to-end proof, in CI:
 *   #1 the pack passes the full parser validator (covered in parser_validator.test).
 *   #2 a human completes the game through the controlled CLI parser (command_map).
 *   #3 the AI completes the game using ONLY the structured legal-action API.
 *   #5 determinism holds: the recorded walkthrough trace replays to an identical hash.
 *
 * The canonical solution (the rope → well → two keys → catacombs-gate chain).
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { parseCommand } from "../../src/parser/command_map.js";
import { makeStep } from "../../src/core/engine.js";
import { recordTrace } from "../../src/trace/record.js";
import { replayTrace } from "../../src/trace/replay.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
if (!loaded.ok) throw new Error("compile");
const index = indexParserPack(loaded.compiled.pack);
const rules = buildParserRules(index);
const step = makeStep(rules);

// The walkthrough by action id (what the AI sees in available_actions) ...
const WALKTHROUGH_IDS = [
  "go_north",
  "go_up",
  "take_rope",
  "go_down",
  "go_west",
  "go_north",
  "open_stone_coffer",
  "take_brass_key",
  "go_south",
  "go_east",
  "go_east",
  "use_rope_on_old_well",
  "go_down",
  "unlock_oak_chest",
  "open_oak_chest",
  "take_iron_key",
  "go_up",
  "go_west",
  "go_north",
  "go_down",
  "unlock_crypt_gate",
  "go_north",
];
// ... and the same route as controlled human commands.
const WALKTHROUGH_COMMANDS = [
  "go north",
  "up",
  "take rope",
  "down",
  "west",
  "north",
  "open coffer",
  "take brass key",
  "south",
  "east",
  "east",
  "use rope on old well",
  "down",
  "unlock chest with brass key",
  "open chest",
  "take iron key",
  "up",
  "west",
  "north",
  "down",
  "unlock gate with iron key",
  "north",
];

describe("Stage 2 acceptance — The Sealed Crypt", () => {
  it("#3 the AI completes the game using only the structured legal-action API", () => {
    let state = initStateForParserPack(index, 1);
    const actions: Action[] = [];
    for (const id of WALKTHROUGH_IDS) {
      const opt = enumerateActions(index, state).find((o) => o.id === id);
      expect(opt, `action "${id}" must be in the legal set in room ${state.current}`).toBeTruthy();
      const r = step(state, opt!.action);
      expect(r.ok).toBe(true);
      actions.push(opt!.action);
      state = r.state;
    }
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_victory");
    return actions; // used conceptually below
  });

  it("#5 the recorded walkthrough trace replays to an identical final hash", () => {
    let state = initStateForParserPack(index, 1);
    const actions: Action[] = [];
    for (const id of WALKTHROUGH_IDS) {
      const opt = enumerateActions(index, state).find((o) => o.id === id)!;
      actions.push(opt.action);
      state = step(state, opt.action).state;
    }
    const trace = recordTrace(rules, initStateForParserPack(index, 1), actions, {
      trace_id: "tr_sealed_crypt_walkthrough",
      pack_id: loaded.compiled.pack.meta.id,
      content_hash: loaded.compiled.contentHash,
    });
    const replay = replayTrace(trace, rules);
    expect(replay.ok).toBe(true);
    expect(replay.finalHash).toBe(trace.expected_final_hash);
  });

  it("#2 a human completes the game through the controlled command parser", () => {
    let state = initStateForParserPack(index, 1);
    for (const cmd of WALKTHROUGH_COMMANDS) {
      const parsed = parseCommand(index, state, cmd);
      expect(parsed.ok, `"${cmd}" should parse in room ${state.current}`).toBe(true);
      if (!parsed.ok) return;
      const legal = rules
        .legalActions(state)
        .some((a) => JSON.stringify(a) === JSON.stringify(parsed.action));
      expect(legal, `"${cmd}" should be legal in room ${state.current}`).toBe(true);
      state = step(state, parsed.action).state;
    }
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_victory");
  });
});
