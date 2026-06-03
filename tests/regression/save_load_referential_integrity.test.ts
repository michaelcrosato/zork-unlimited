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
 * room/scene (the engine would render the whole game from a location that does
 * not exist) or `endingId` to a fabricated ending, and bug_0181's gate waves it
 * through. `src/mcp/tools.ts` `assertLoadedStateRefs` (run at `startSession`, the
 * one chokepoint that has BOTH the loaded state and the pack index) closes that:
 * a load_game with such a save is a hard `SaveIntegrityError`.
 *
 * This is the SoundnessBench (arXiv:2412.03154) REJECTION-DIRECTION oracle carried
 * from finiteness to reference: the checker is credibly sound only if it rejects
 * saves that are known-bad BY CONSTRUCTION, not merely accepts the ones it is fed.
 *
 * Each forged save is built by serializing a VALID save (new_game -> save_game),
 * poisoning ONE referential field, then asserting load_game throws. The GREEN
 * false-rejection guards prove that legitimate saves — including an ENDED CYOA
 * save whose `current`/`endingId` is a TERMINAL id (not a scene), the case the
 * gate's `terminalIds` fold exists for — still load byte-identically.
 */
import { describe, it, expect } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import { SaveIntegrityError } from "../../src/persist/save_load.js";

const ROOT = process.cwd();
const CYOA = "content/cyoa/pack/watchtower_road.yaml";
const PARSER = "content/parser/pack/alchemists_tower.yaml";
const api = () => createToolApi({ root: ROOT });

/** Serialize a fresh valid save for `packPath`, then mutate ONE state field. */
function forgeSave(packPath: string, poison: (state: Record<string, unknown>) => void): string {
  const a = api();
  const game = a.new_game({ pack_path: packPath, seed: 1 });
  const saved = a.save_game({ session_id: game.session_id });
  const bundle = JSON.parse(saved.save) as { state: Record<string, unknown> };
  poison(bundle.state);
  return JSON.stringify(bundle);
}

describe("save/load referential integrity — forged-reference REJECTION (§16)", () => {
  it("CYOA: a phantom `current` scene is a hard SaveIntegrityError", () => {
    // current is a valid STRING (bug_0181's GameStateSchema passes it), so only a
    // pack-aware gate can know `no_such_scene` is not a real location.
    const forged = forgeSave(CYOA, (s) => {
      s.current = "no_such_scene";
    });
    expect(() => api().load_game({ pack_path: CYOA, save: forged })).toThrow(SaveIntegrityError);
    expect(() => api().load_game({ pack_path: CYOA, save: forged })).toThrow(/unknown scene/);
  });

  it("parser: a phantom `current` room is a hard SaveIntegrityError", () => {
    const forged = forgeSave(PARSER, (s) => {
      s.current = "no_such_room";
    });
    expect(() => api().load_game({ pack_path: PARSER, save: forged })).toThrow(SaveIntegrityError);
    expect(() => api().load_game({ pack_path: PARSER, save: forged })).toThrow(/unknown room/);
  });

  it("parser: a fabricated `endingId` is a hard SaveIntegrityError", () => {
    // The benchmark-credibility witness: a forged save that CLAIMS an ending the
    // pack never declares. endingId is a valid nullable string to bug_0181's gate.
    const forged = forgeSave(PARSER, (s) => {
      s.endingId = "fabricated_win";
    });
    expect(() => api().load_game({ pack_path: PARSER, save: forged })).toThrow(SaveIntegrityError);
    expect(() => api().load_game({ pack_path: PARSER, save: forged })).toThrow(/unknown ending/);
  });
});

describe("save/load referential integrity — GREEN false-rejection guards", () => {
  it("a clean mid-game CYOA save still round-trips byte-identically", () => {
    const a = api();
    const game = a.new_game({ pack_path: CYOA, seed: 1 });
    a.step_action({ session_id: game.session_id, action_id: "go_west" });
    const before = a.get_observation({ session_id: game.session_id }).state_hash;
    const saved = a.save_game({ session_id: game.session_id });
    const reloaded = a.load_game({ pack_path: CYOA, save: saved.save });
    expect(reloaded.state_hash).toBe(before);
  });

  it("an ENDED CYOA save (current = a TERMINAL id, not a scene) still loads", () => {
    // The reason the gate folds `terminalIds` into the valid-location set: when a
    // CYOA game ends via goto+end_game (cyoa/runner.ts), `current` and `endingId`
    // become the terminal id (here `ending_escape`), which is NOT a scene. A naive
    // "current must be a scene" check would falsely reject every ended CYOA save.
    const a = api();
    const game = a.new_game({ pack_path: CYOA, seed: 1 });
    for (const id of ["go_west", "ford_brook", "cross_north", "slip_into_woods", "slip_away"]) {
      a.step_action({ session_id: game.session_id, action_id: id });
    }
    const ended = a.get_observation({ session_id: game.session_id });
    const saved = a.save_game({ session_id: game.session_id });
    // Sanity: the save really carries a terminal id as current (not a scene).
    const bundle = JSON.parse(saved.save) as { state: { current: string; endingId: string } };
    expect(bundle.state.current).toBe("ending_escape");
    expect(bundle.state.endingId).toBe("ending_escape");
    const reloaded = a.load_game({ pack_path: CYOA, save: saved.save });
    expect(reloaded.state_hash).toBe(ended.state_hash);
  });
});
