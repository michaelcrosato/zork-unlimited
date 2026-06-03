/**
 * Regression (§15) for bug_0161 — *The Alchemist's Tower*'s SPIRE ROOM description must
 * telegraph the silver-casket betrayal fork as a terminal greed choice, so a player who
 * acts on the room view (without examining the casket object) is still warned.
 *
 * bug_0114 made the spire a real moral fork (GIVE the antidote → ending_cured, the win;
 * UNLOCK the casket → ending_betrayal, a non-death greed ending that forecloses the cure),
 * and bug_0123 put the "this is a one-way betrayal, not a free bonus" telegraph on the
 * casket OBJECT's own examine. But a fresh blind MCP playtester (seed 23,
 * ai-runs/2026-06-03T09-26-03-752Z/playtest.md §4-5) showed that telegraph is bypassable:
 * reaching the spire holding the iron key but no cure, they unlocked the casket STRAIGHT
 * FROM THE ROOM VIEW — "the same verb that was safe on the strongbox" — without ever
 * examining the object, and were railroaded into ending_betrayal. The spire room text
 * mentioned the casket neutrally ("its clasp cut for an iron key"), which actively invites
 * trying the key already held, so the only warning lived in an examine they never ran.
 *
 * THE FIX (pure CONTENT): the spire room description (both the base and the has_item:antidote
 * variant) now carries the casket's terminal/greed telegraph, reaching the player at the
 * actual decision point. The bug_0065 anchors are preserved verbatim — base still says "you
 * are not carrying it yet" and never claims an "antidote in your hand"; the variant still
 * says "pale antidote in your hand is no use until you give it to her" — and behaviour is
 * byte-identical (the casket still fires ending_betrayal only via end_game; the canonical
 * cure still wins ending_cured 40/40).
 *
 * Locked here:
 *   (1) at the spire WITHOUT the cure (the exact greed state), the ROOM description
 *       telegraphs the casket as a terminal betrayal, not a neutral container;
 *   (2) the bug_0065 base anchor survives ("you are not carrying it yet"; no "antidote in
 *       your hand" leak);
 *   (3) at the spire WITH the cure, the ROOM description telegraphs the moral fork AND keeps
 *       the bug_0065 antidote-in-hand anchor;
 *   (4) behaviour unchanged: unlocking the casket still ends in ending_betrayal (non-death)
 *       and the canonical solve still wins ending_cured 40/40;
 *   (5) the pack validates clean.
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
import { validateParser } from "../../src/validate/parser_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const alch = loadParserPackFile("content/parser/pack/alchemists_tower.yaml");
if (!alch.ok) throw new Error("alchemists_tower must compile");
const pack = alch.compiled.pack;
const index = indexParserPack(pack);
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

// The greed route: fetch the iron key (never brew) and climb to the spire holding it —
// the exact state in which the seed-23 tester unlocked the casket from the room view.
const KEY_TO_SPIRE = [
  "go_east",
  "take_brass_key",
  "go_west",
  "go_north",
  "go_up",
  "unlock_strongbox",
  "open_strongbox",
  "take_iron_key",
  "go_down",
  "go_north",
  "go_up",
];

// The canonical brew route, stopping in the spire one step short of the cure.
const BREW_TO_SPIRE = [
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
];

describe("bug_0161 — the spire ROOM description telegraphs the casket betrayal at the decision point", () => {
  it("WITHOUT the cure, the room view frames opening the casket as terminal AND a betrayal", () => {
    const greed = play(initStateForParserPack(index, 1), KEY_TO_SPIRE);
    expect(greed.current).toBe("spire");
    expect(greed.inventory).toContain("iron_key");
    expect(greed.inventory).not.toContain("antidote");
    const room = desc(greed);
    // Terminality: a one-way act, signalled in the room view (not just the object examine).
    expect(room).toMatch(/chosen once|not undone|cannot be undone/i);
    // Betrayal weight: opening it turns away from the dying master / takes treasure over cure.
    expect(room).toMatch(/turn from her pallet|her coffer|treasure (bought )?against her cure/i);
    // bug_0065 anchor preserved: never claims an antidote the greed player isn't holding.
    expect(room).toContain("you are not carrying it yet");
    expect(room).not.toContain("antidote in your hand");
  });

  it("WITH the cure, the room view telegraphs the moral fork AND keeps the bug_0065 anchor", () => {
    const cure = play(initStateForParserPack(index, 1), BREW_TO_SPIRE);
    expect(cure.current).toBe("spire");
    expect(cure.inventory).toContain("antidote");
    const room = desc(cure);
    expect(room).toMatch(/choose the Work over the maker|chosen once|not undone/i);
    expect(room).toContain("pale antidote in your hand is no use until you give it to her");
  });

  it("behaviour unchanged: unlocking the casket still ends in ending_betrayal (non-death)", () => {
    const state = play(initStateForParserPack(index, 1), [...KEY_TO_SPIRE, "unlock_silver_casket"]);
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_betrayal");
    expect(buildParserObservation(index, state).ending?.death).toBe(false);
    expect(state.flags["cure_administered"]).toBeFalsy();
  });

  it("behaviour unchanged: the canonical solve still wins ending_cured 40/40", () => {
    const state = play(initStateForParserPack(index, 1), [
      ...BREW_TO_SPIRE,
      "use_antidote_on_master",
    ]);
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_cured");
    expect(buildParserObservation(index, state).score).toBe(pack.meta.max_score);
    expect(pack.meta.max_score).toBe(40);
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
