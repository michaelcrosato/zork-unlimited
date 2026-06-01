/**
 * Regression (§15) for bug_0012 — stale room text contradicted changed state in
 * the parser pack The Alchemist's Tower.
 *
 * A blind MCP playtester (ai-runs/2026-06-01T06-40-31-269Z, seed 29) solved the
 * tower to ending_cured and, as its top finding (report §5; the same class fixed
 * for sealed_crypt in bug_0010 and sunken_barrow in bug_0011), flagged FOUR rooms
 * whose body prose kept describing the world as it was BEFORE the player changed it
 * — visible_objects and available_actions updated correctly, only the prose lied:
 *   - Overgrown Garden: "a pale medicinal herb still grows by the wall, and
 *     something brass glints in the soil" AFTER the herb and brass key were taken.
 *   - Cluttered Study: "A locked iron strongbox sits on the desk" AFTER it was
 *     unlocked and emptied.
 *   - Great Hall: "A bolted cellar hatch is set in the floor" AFTER the iron key
 *     threw the bolt and the down exit opened.
 *   - Cold Cellar: "A vial of clear spring water rests in a rack" AFTER the vial
 *     was taken.
 *
 * No engine change is needed: the generic reactive-room `variants` feature already
 * exists (bug_0010 — RoomSchema.variants + the pure roomDescription helper, read
 * identically by the observation builder and the LOOK action). This pack simply had
 * not opted in. The fix is pure CONTENT — variants on the four rooms — so it changes
 * only narrated text, never flags/items/exits/gating/reachable endings.
 *
 * Locked here:
 *   (1) Garden flips through bare-bed text as the herb then the brass key are taken,
 *       and never again claims the herb "still grows" once it is gone; LOOK matches;
 *   (2) Study flips from the "locked" text to "open and empty" once the iron key is
 *       held, and never again calls the strongbox locked;
 *   (3) Great Hall flips from "bolted" to "thrown open" once the cellar is unlocked;
 *   (4) Cold Cellar flips from "rests in a rack" to "rack stands empty" once the
 *       vial is taken;
 *   (5) a room with no variants (Tower Courtyard) returns its base description
 *       byte-identically (backward-compat: rooms that don't opt in are unaffected).
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import { indexParserPack, buildParserRules, initStateForParserPack } from "../../src/parser/runner.js";
import { enumerateActions, resolveParserAction } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { roomDescription } from "../../src/parser/model.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const alch = loadParserPackFile("content/parser/pack/alchemists_tower.yaml");
if (!alch.ok) throw new Error("alchemists_tower must compile");
const index = indexParserPack(alch.compiled.pack);
const step = makeStep(buildParserRules(index));

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt) throw new Error(`"${id}" not legal in ${s.current}: [${enumerateActions(index, s).map((o) => o.id).join(", ")}]`);
    const r = step(s, opt.action);
    expect(r.ok).toBe(true);
    s = r.state;
  }
  return s;
}

const desc = (s: GameState): string => buildParserObservation(index, s).description;

/** The narrate text the explicit `look` action would emit in this state. */
function lookNarration(s: GameState): string {
  const res = resolveParserAction(index, s, { type: "LOOK" });
  const eff = res?.effects[0];
  if (!eff || !("narrate" in eff)) throw new Error("LOOK produced no narration");
  return eff.narrate;
}

describe("bug_0012 — reactive room text replaces stale descriptions in the Alchemist's Tower", () => {
  it("Garden reports the bare bed as the herb then the brass key are taken", () => {
    let s = play(initStateForParserPack(index, 29), ["go_east"]);
    expect(s.current).toBe("garden");
    expect(desc(s)).toContain("still grows by the wall");
    expect(desc(s)).toContain("something brass glints");

    s = play(s, ["take_herb"]);
    // Herb gone, brass still present.
    expect(desc(s)).toContain("bare where you cut the pale herb");
    expect(desc(s)).toContain("something brass still glints");
    expect(desc(s)).not.toContain("still grows by the wall");
    expect(lookNarration(s)).toBe(desc(s));

    s = play(s, ["take_brass_key"]);
    // Both gone.
    expect(desc(s)).toContain("no longer hides anything brass");
    expect(desc(s)).not.toContain("still grows by the wall");
    expect(desc(s)).not.toContain("something brass still glints");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("Study flips from a locked strongbox to an open, empty one once the iron key is held", () => {
    let s = play(initStateForParserPack(index, 29), [
      "go_east", "take_brass_key", "go_west", "go_north", "go_up",
    ]);
    expect(s.current).toBe("study");
    expect(desc(s)).toContain("locked iron strongbox");

    s = play(s, ["unlock_strongbox", "open_strongbox", "take_iron_key"]);
    expect(s.inventory).toContain("iron_key");
    expect(desc(s)).toContain("open and empty");
    expect(desc(s)).not.toContain("locked iron strongbox");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("Great Hall flips from a bolted hatch to a thrown-open one once the cellar is unlocked", () => {
    let s = play(initStateForParserPack(index, 29), [
      "go_east", "take_brass_key", "go_west", "go_north", "go_up",
      "unlock_strongbox", "open_strongbox", "take_iron_key", "go_down",
    ]);
    expect(s.current).toBe("great_hall");
    expect(desc(s)).toContain("bolted cellar hatch");

    s = play(s, ["use_iron_key_on_cellar_door"]);
    expect(s.flags["cellar_unlocked"]).toBe(true);
    expect(s.current).toBe("great_hall");
    expect(s.ended).toBe(false);
    expect(desc(s)).toContain("thrown open");
    expect(desc(s)).not.toContain("bolted cellar hatch");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("Cold Cellar flips from a full rack to an empty one once the vial is taken", () => {
    let s = play(initStateForParserPack(index, 29), [
      "go_east", "take_brass_key", "go_west", "go_north", "go_up",
      "unlock_strongbox", "open_strongbox", "take_iron_key", "go_down",
      "use_iron_key_on_cellar_door", "go_down",
    ]);
    expect(s.current).toBe("cellar");
    expect(desc(s)).toContain("rests in a rack");

    s = play(s, ["take_water_vial"]);
    expect(s.inventory).toContain("water_vial");
    expect(desc(s)).toContain("rack stands empty");
    expect(desc(s)).not.toContain("rests in a rack");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("a room with no variants returns its base description unchanged (backward-compat)", () => {
    const s0 = initStateForParserPack(index, 29);
    const courtyard = index.rooms.get("courtyard")!;
    expect(courtyard.variants).toBeUndefined();
    expect(roomDescription(courtyard, s0)).toBe(courtyard.description);
    expect(desc(s0)).toBe(courtyard.description);
  });
});
