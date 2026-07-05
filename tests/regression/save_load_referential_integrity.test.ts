/**
 * Referential-integrity rejection suite for the §16 load boundary — the
 * PACK-AWARE complement to tests/regression/save_integrity_adversarial.test.ts
 * (bug_0181, which guards finiteness/structure inside `load()`).
 *
 * bug_0181's `GameStateSchema` runs in `src/persist/save_load.ts`, which holds
 * only the content hash, not the pack — so it can verify a loaded state is
 * well-formed and finite, but NOT whether its `current` location / `endingId`
 * name symbols that actually exist in the pack. A forged-but-finite save (valid
 * structure, correct hash + mode) can therefore set `current` to a phantom
 * room (the engine would render the whole game from a location that does
 * not exist) or `endingId` to a fabricated ending, and bug_0181's gate waves it
 * through. `src/mcp/tools.ts` `assertLoadedStateRefs` (run at `startSession`, the
 * one chokepoint that has BOTH the loaded state and the pack index) closes that:
 * a load_game with such a save is a hard `SaveIntegrityError`.
 *
 * This is the SoundnessBench (arXiv:2412.03154) REJECTION-DIRECTION oracle carried
 * from finiteness to reference: the checker is credibly sound only if it rejects
 * saves that are known-bad BY CONSTRUCTION, not merely accepts the ones it is fed.
 *
 * Each forged save is built by serializing a VALID save (start_world_quest -> save_game),
 * poisoning ONE referential field, then asserting load_game throws. The GREEN
 * false-rejection guards prove that legitimate RPG saves — including an ended
 * save whose `endingId` names a declared ending — still load byte-identically.
 */
import { describe, it, expect } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import { SaveIntegrityError } from "../../src/persist/save_load.js";

const ROOT = process.cwd();
const WORLD_QUEST_ID = "sunken_barrow";
const api = () => createToolApi({ root: ROOT });

/** Serialize a fresh valid save, then mutate ONE state field. */
function forgeSave(poison: (state: Record<string, unknown>) => void): string {
  const a = api();
  const game = a.start_world_quest({ world_quest_id: WORLD_QUEST_ID, seed: 1 });
  const saved = a.save_game({ session_id: game.session_id });
  const bundle = JSON.parse(saved.save) as { state: Record<string, unknown> };
  poison(bundle.state);
  return JSON.stringify(bundle);
}

function actionIdByCommand(a: ReturnType<typeof api>, sessionId: string, needle: string): string {
  const actions = a.list_legal_actions({ session_id: sessionId }).actions as {
    id: string;
    command?: string;
  }[];
  const found = actions.find((action) => action.command?.includes(needle));
  if (!found) throw new Error(`No legal action containing "${needle}".`);
  return found.id;
}

function stepByCommand(a: ReturnType<typeof api>, sessionId: string, needle: string) {
  return a.step_action({
    session_id: sessionId,
    action_id: actionIdByCommand(a, sessionId, needle),
  });
}

function playSunkenBarrowToVictory(a: ReturnType<typeof api>, sessionId: string) {
  let last = stepByCommand(a, sessionId, "go down");
  expect(last.ok).toBe(true);
  last = stepByCommand(a, sessionId, "take iron bar");
  expect(last.ok).toBe(true);
  last = stepByCommand(a, sessionId, "go north");

  for (let i = 0; i < 40 && !last.observation.ended; i += 1) {
    if (last.observation.mode !== "rpg") throw new Error("expected RPG observation");
    if (!last.observation.enemies_present.some((enemy) => enemy.id === "barrow_wight")) break;
    last = stepByCommand(a, sessionId, "attack");
  }

  last = stepByCommand(a, sessionId, "go east");
  for (let i = 0; i < 40 && !last.observation.ended; i += 1) {
    const stage = a.get_state({ session_id: sessionId, include_state: true }).state.questStage[
      "barrow"
    ];
    if (stage === "slab_moved") break;
    last = stepByCommand(a, sessionId, "lever stone slab");
  }
  stepByCommand(a, sessionId, "go down");
  return stepByCommand(a, sessionId, "take Barrow");
}

describe("save/load referential integrity — forged-reference REJECTION (§16)", () => {
  it("RPG: a phantom `current` room is a hard SaveIntegrityError", () => {
    // current is a valid STRING (bug_0181's GameStateSchema passes it), so only a
    // pack-aware gate can know `no_such_room` is not a real location.
    const forged = forgeSave((s) => {
      s.current = "no_such_room";
    });
    expect(() => api().load_game({ save: forged })).toThrow(SaveIntegrityError);
    expect(() => api().load_game({ save: forged })).toThrow(/unknown room/);
  });

  it("RPG: a phantom visited room is a hard SaveIntegrityError", () => {
    const forged = forgeSave((s) => {
      s.visited = { ...(s.visited as Record<string, boolean>), no_such_room: true };
    });
    expect(() => api().load_game({ save: forged })).toThrow(SaveIntegrityError);
    expect(() => api().load_game({ save: forged })).toThrow(/unknown visited room/);
  });

  it("RPG: a fabricated `endingId` is a hard SaveIntegrityError", () => {
    // The benchmark-credibility witness: a forged save that CLAIMS an ending the
    // pack never declares. endingId is a valid nullable string to bug_0181's gate.
    const forged = forgeSave((s) => {
      s.endingId = "fabricated_win";
    });
    expect(() => api().load_game({ save: forged })).toThrow(SaveIntegrityError);
    expect(() => api().load_game({ save: forged })).toThrow(/unknown ending/);
  });

  it("RPG: a phantom runtime flag is a hard SaveIntegrityError", () => {
    const forged = forgeSave((s) => {
      s.flags = { ...(s.flags as Record<string, boolean>), no_such_flag: true };
    });
    expect(() => api().load_game({ save: forged })).toThrow(SaveIntegrityError);
    expect(() => api().load_game({ save: forged })).toThrow(/unknown flag/);
  });

  it("RPG: a phantom runtime var is a hard SaveIntegrityError", () => {
    const forged = forgeSave((s) => {
      s.vars = { ...(s.vars as Record<string, number>), no_such_var: 1 };
    });
    expect(() => api().load_game({ save: forged })).toThrow(SaveIntegrityError);
    expect(() => api().load_game({ save: forged })).toThrow(/unknown var/);
  });

  it("RPG: an invalid enemy HP var is a hard SaveIntegrityError", () => {
    const forged = forgeSave((s) => {
      s.vars = { ...(s.vars as Record<string, number>), __enemy_hp_barrow_wight: -1 };
    });
    expect(() => api().load_game({ save: forged })).toThrow(SaveIntegrityError);
    expect(() => api().load_game({ save: forged })).toThrow(/invalid enemy hp var/);
  });

  it("RPG: active dialogue cannot be forged from outside the NPC room", () => {
    const forged = forgeSave((s) => {
      s.vars = { ...(s.vars as Record<string, number>), __dlg_reaver_shade: 1 };
    });
    expect(() => api().load_game({ save: forged })).toThrow(SaveIntegrityError);
    expect(() => api().load_game({ save: forged })).toThrow(/active dialogue/);
  });

  it("RPG: a phantom inventory item is a hard SaveIntegrityError (bug_0184)", () => {
    // A phantom item renders verbatim in the observation and in the INVENTORY
    // narration, so it is the third "render a nonexistent symbol" hole. The valid
    // item set (declared objects ∪ add_item targets) is provably complete, so this
    // id — neither — can never be held legitimately.
    const forged = forgeSave((s) => {
      s.inventory = ["no_such_item"];
    });
    expect(() => api().load_game({ save: forged })).toThrow(SaveIntegrityError);
    expect(() => api().load_game({ save: forged })).toThrow(/unknown item/);
  });

  it("RPG: a phantom objectState key is a hard SaveIntegrityError", () => {
    const forged = forgeSave((s) => {
      s.objectState = { no_such_object: { open: true } };
    });
    expect(() => api().load_game({ save: forged })).toThrow(SaveIntegrityError);
    expect(() => api().load_game({ save: forged })).toThrow(/unknown object/);
  });

  it("RPG: a moved object in a phantom room is a hard SaveIntegrityError", () => {
    const forged = forgeSave((s) => {
      s.objectState = { iron_bar: { room: "no_such_room" } };
    });
    expect(() => api().load_game({ save: forged })).toThrow(SaveIntegrityError);
    expect(() => api().load_game({ save: forged })).toThrow(/unknown object room/);
  });

  it("RPG: a runtime container with a phantom child object is a hard SaveIntegrityError", () => {
    const forged = forgeSave((s) => {
      s.objectState = { sarcophagus: { contents: ["no_such_object"] } };
    });
    expect(() => api().load_game({ save: forged })).toThrow(SaveIntegrityError);
    expect(() => api().load_game({ save: forged })).toThrow(/unknown contained object/);
  });

  it("RPG: a phantom questStage quest is a hard SaveIntegrityError", () => {
    const forged = forgeSave((s) => {
      s.questStage = { no_such_quest: "slab_moved" };
    });
    expect(() => api().load_game({ save: forged })).toThrow(SaveIntegrityError);
    expect(() => api().load_game({ save: forged })).toThrow(/unknown quest stage/);
  });

  it("RPG: a phantom questStage value is a hard SaveIntegrityError", () => {
    const forged = forgeSave((s) => {
      s.questStage = { barrow: "no_such_stage" };
    });
    expect(() => api().load_game({ save: forged })).toThrow(SaveIntegrityError);
    expect(() => api().load_game({ save: forged })).toThrow(/unknown quest stage/);
  });
});

describe("save/load referential integrity — GREEN false-rejection guards", () => {
  it("a clean mid-game RPG save still round-trips byte-identically", () => {
    const a = api();
    const game = a.start_world_quest({ world_quest_id: WORLD_QUEST_ID, seed: 1 });
    stepByCommand(a, game.session_id, "go down");
    const before = a.get_observation({ session_id: game.session_id }).state_hash;
    const saved = a.save_game({ session_id: game.session_id });
    const reloaded = a.load_game({ save: saved.save });
    expect(saved.state_hash).toBe(before);
    expect(reloaded.state_hash).toBe(before);
  });

  it("an RPG save holding a legitimately TAKEN item still loads (bug_0184 guard)", () => {
    // The inventory gate must never reject a real declared object the player
    // picked up.
    const a = api();
    const game = a.start_world_quest({ world_quest_id: WORLD_QUEST_ID, seed: 1 });
    const sid = game.session_id;
    stepByCommand(a, sid, "go down");
    stepByCommand(a, sid, "take iron bar");
    const before = a.get_observation({ session_id: sid }).state_hash;
    const saved = a.save_game({ session_id: sid });
    // Sanity: the save really carries a held item (so the gate is exercised).
    const bundle = JSON.parse(saved.save) as { state: { inventory: string[] } };
    expect(bundle.state.inventory.length).toBeGreaterThan(0);
    const reloaded = a.load_game({ save: saved.save });
    expect(saved.state_hash).toBe(before);
    expect(reloaded.state_hash).toBe(before);
  });

  it("an RPG save with a legitimate active dialogue still loads", () => {
    const a = api();
    const game = a.start_world_quest({ world_quest_id: WORLD_QUEST_ID, seed: 1 });
    const sid = game.session_id;
    stepByCommand(a, sid, "go down");
    stepByCommand(a, sid, "take iron bar");
    stepByCommand(a, sid, "go west");
    stepByCommand(a, sid, "talk to");
    const before = a.get_observation({ session_id: sid }).state_hash;
    const saved = a.save_game({ session_id: sid });
    const bundle = JSON.parse(saved.save) as {
      state: { current: string; vars: Record<string, number> };
    };
    expect(bundle.state.current).toBe("reaver_rest");
    expect(bundle.state.vars.__dlg_reaver_shade).toBeGreaterThan(0);
    const reloaded = a.load_game({ save: saved.save });
    expect(saved.state_hash).toBe(before);
    expect(reloaded.state_hash).toBe(before);
  });

  it("an RPG save with a legitimately written combat flag still loads", () => {
    const a = api();
    const game = a.start_world_quest({ world_quest_id: WORLD_QUEST_ID, seed: 1 });
    const sid = game.session_id;
    stepByCommand(a, sid, "go down");
    stepByCommand(a, sid, "take iron bar");
    let last = stepByCommand(a, sid, "go north");

    for (let i = 0; i < 40 && !last.observation.ended; i += 1) {
      const flags = a.get_state({ session_id: sid, include_state: true }).state.flags;
      if (flags.wight_slain === true) break;
      last = stepByCommand(a, sid, "attack");
    }

    const before = a.get_observation({ session_id: sid }).state_hash;
    const saved = a.save_game({ session_id: sid });
    const bundle = JSON.parse(saved.save) as {
      state: { flags: Record<string, boolean> };
    };
    expect(bundle.state.flags.wight_slain).toBe(true);
    const reloaded = a.load_game({ save: saved.save });
    expect(saved.state_hash).toBe(before);
    expect(reloaded.state_hash).toBe(before);
  });

  it("an RPG save with a legitimately moved object still loads", () => {
    const a = api();
    const game = a.start_world_quest({ world_quest_id: WORLD_QUEST_ID, seed: 1 });
    const sid = game.session_id;
    stepByCommand(a, sid, "go down");
    stepByCommand(a, sid, "take iron bar");
    stepByCommand(a, sid, "drop iron bar");
    const before = a.get_observation({ session_id: sid }).state_hash;
    const saved = a.save_game({ session_id: sid });
    const bundle = JSON.parse(saved.save) as {
      state: {
        objectState: Record<string, { room?: string; takenBy?: string }>;
      };
    };
    expect(bundle.state.objectState["iron_bar"]).toMatchObject({
      room: "entry_hall",
      takenBy: "player",
    });
    const reloaded = a.load_game({ save: saved.save });
    expect(saved.state_hash).toBe(before);
    expect(reloaded.state_hash).toBe(before);
  });

  it("an RPG save with a legitimately advanced quest stage still loads", () => {
    const a = api();
    const game = a.start_world_quest({ world_quest_id: WORLD_QUEST_ID, seed: 1 });
    playSunkenBarrowToVictory(a, game.session_id);
    const ended = a.get_observation({ session_id: game.session_id });
    const saved = a.save_game({ session_id: game.session_id });
    const bundle = JSON.parse(saved.save) as {
      state: { questStage: Record<string, string> };
    };
    expect(bundle.state.questStage.barrow).toBe("slab_moved");
    const reloaded = a.load_game({ save: saved.save });
    expect(saved.state_hash).toBe(ended.state_hash);
    expect(reloaded.state_hash).toBe(ended.state_hash);
  });

  it("an ended RPG save still loads", () => {
    // At an RPG ending, current remains a declared room while endingId names a
    // declared ending. Both references must pass the pack-aware gate.
    const a = api();
    const game = a.start_world_quest({ world_quest_id: WORLD_QUEST_ID, seed: 1 });
    playSunkenBarrowToVictory(a, game.session_id);
    const ended = a.get_observation({ session_id: game.session_id });
    const saved = a.save_game({ session_id: game.session_id });
    // Sanity: the save really carries a declared ending id.
    const bundle = JSON.parse(saved.save) as { state: { current: string; endingId: string } };
    expect(bundle.state.current).toBe("relic_chamber");
    expect(bundle.state.endingId).toBe("ending_victory");
    const reloaded = a.load_game({ save: saved.save });
    expect(saved.state_hash).toBe(ended.state_hash);
    expect(reloaded.state_hash).toBe(ended.state_hash);
  });
});
