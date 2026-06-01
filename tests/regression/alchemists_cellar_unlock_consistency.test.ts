/**
 * Regression (§15) for bug_0073 — the Alchemist's Tower presented TWO different
 * verbs for the same conceptual act of unlocking a key+lock.
 *
 * Two independent blind MCP playtesters of this pack flagged it: the study's iron
 * strongbox is opened with the engine's first-class `UNLOCK <obj> with <key>` verb
 * (driven by `key_id`), while the structurally identical cellar hatch was opened by
 * a hand-authored `USE iron key on cellar hatch` interaction. Both worked, but a
 * first-time parser player who learns "unlock X with Y" at the first lock then meets
 * a different grammar at the second — friction, and an inconsistency in the data model
 * (a bespoke interaction + a `cellar_unlocked` flag where the engine lock mechanism
 * already exists).
 *
 * The fix models the hatch with the SAME engine mechanism (`locked` + `key_id`), so
 * the player gets one uniform unlock grammar. The down exit and the Great Hall's
 * reactive prose now gate on the hatch's runtime unlocked state (`is_unlocked:
 * cellar_door`) rather than the retired flag.
 *
 * Locked here:
 *   (1) the cellar hatch is opened by the engine UNLOCK action (id `unlock_cellar_door`,
 *       type UNLOCK, command "unlock cellar hatch with iron key") — NOT a USE interaction;
 *   (2) the old bespoke `use_iron_key_on_cellar_door` action no longer exists;
 *   (3) BOTH locks (strongbox + cellar hatch) expose the same "unlock … with …" grammar
 *       and UNLOCK action type — the consistency guarantee;
 *   (4) the cellar is gated: no `go_down` until the hatch is unlocked, then it appears
 *       and leads to the cellar; objectState records locked === false;
 *   (5) the hatch's examine and the Great Hall's prose flip from "bolted" to unlocked/
 *       "thrown open" once the lock is sprung (no stale text);
 *   (6) the game still wins (ending_cured) through the new unlock path.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadParserPackFile("content/parser/pack/alchemists_tower.yaml");
if (!loaded.ok) throw new Error("alchemists_tower must compile");
const index = indexParserPack(loaded.compiled.pack);
const step = makeStep(buildParserRules(index));

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt)
      throw new Error(
        `"${id}" not legal in ${s.current}: [${enumerateActions(index, s)
          .map((o) => o.id)
          .join(", ")}]`,
      );
    const r = step(s, opt.action);
    expect(r.ok).toBe(true);
    s = r.state;
  }
  return s;
}

const desc = (s: GameState): string => buildParserObservation(index, s).description;

// Stand in the Great Hall holding the iron key, hatch still locked.
const TO_HALL_WITH_KEY = [
  "go_east",
  "take_brass_key",
  "go_west",
  "go_north",
  "go_up",
  "unlock_strongbox",
  "open_strongbox",
  "take_iron_key",
  "go_down",
];

describe("bug_0073 — the cellar hatch and the strongbox share one unlock grammar", () => {
  it("opens the hatch with the engine UNLOCK verb, not a bespoke USE interaction", () => {
    const s = play(initStateForParserPack(index, 1), TO_HALL_WITH_KEY);
    expect(s.current).toBe("great_hall");

    const actions = enumerateActions(index, s);
    const unlockHatch = actions.find((a) => a.id === "unlock_cellar_door");
    expect(unlockHatch, "the hatch must expose the engine unlock action").toBeDefined();
    expect(unlockHatch!.action.type).toBe("UNLOCK");
    expect(unlockHatch!.command).toBe("unlock cellar hatch with iron key");

    // The old hand-authored grammar is gone.
    expect(actions.find((a) => a.id === "use_iron_key_on_cellar_door")).toBeUndefined();
  });

  it("both the strongbox and the cellar hatch use the same UNLOCK grammar", () => {
    // In the study, holding the brass key: the strongbox offers the unlock verb.
    const atStudy = play(initStateForParserPack(index, 1), [
      "go_east",
      "take_brass_key",
      "go_west",
      "go_north",
      "go_up",
    ]);
    const unlockBox = enumerateActions(index, atStudy).find((a) => a.id === "unlock_strongbox");
    expect(unlockBox).toBeDefined();

    const atHall = play(initStateForParserPack(index, 1), TO_HALL_WITH_KEY);
    const unlockHatch = enumerateActions(index, atHall).find((a) => a.id === "unlock_cellar_door");
    expect(unlockHatch).toBeDefined();

    // Same action type and same "unlock <obj> with <key>" command shape.
    expect(unlockBox!.action.type).toBe("UNLOCK");
    expect(unlockHatch!.action.type).toBe("UNLOCK");
    const grammar = /^unlock .+ with .+$/;
    expect(unlockBox!.command).toMatch(grammar);
    expect(unlockHatch!.command).toMatch(grammar);
  });

  it("gates the cellar on the hatch's unlocked state and flips its prose (no stale text)", () => {
    let s = play(initStateForParserPack(index, 1), TO_HALL_WITH_KEY);

    // Locked: no way down yet; hall + hatch read "bolted".
    expect(enumerateActions(index, s).find((a) => a.id === "go_down")).toBeUndefined();
    expect(desc(s)).toContain("bolted cellar hatch");
    const hatchLocked = enumerateActions(index, s).find((a) => a.id === "examine_cellar_door");
    expect(hatchLocked).toBeDefined();

    s = play(s, ["unlock_cellar_door"]);
    // Unlocked state lives in objectState, not a flag.
    expect(s.objectState["cellar_door"]?.locked).toBe(false);
    expect(s.flags["cellar_unlocked"]).toBeUndefined();

    // Prose flips; the down exit appears and leads to the cellar.
    expect(desc(s)).toContain("thrown open");
    expect(desc(s)).not.toContain("bolted cellar hatch");
    expect(enumerateActions(index, s).find((a) => a.id === "go_down")).toBeDefined();

    s = play(s, ["go_down"]);
    expect(s.current).toBe("cellar");
  });

  it("still completes the game (ending_cured) through the new unlock path", () => {
    const s = play(initStateForParserPack(index, 1), [
      "go_west",
      "read_spellbook",
      "go_east",
      "go_east",
      "take_herb",
      "take_brass_key",
      "go_west",
      "go_north",
      "go_up",
      "unlock_strongbox",
      "open_strongbox",
      "take_iron_key",
      "go_down",
      "unlock_cellar_door",
      "go_down",
      "take_water_vial",
      "go_up",
      "go_north",
      "use_herb_on_cauldron",
      "use_water_vial_on_cauldron",
      "go_up",
      "use_antidote_on_master",
    ]);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_cured");
    expect(buildParserObservation(index, s).score).toBe(loaded.compiled.pack.meta.max_score);
  });
});
