/**
 * Regression (§15) for bug_0081 — The Alchemist's Tower's item-on-target USE
 * puzzles now speak the verb their prose primes (steep / pour / give).
 *
 * bug_0074 gave the tower's self-USE (the black phial) its natural verb ("drink"),
 * and bug_0078 generalized command_verb to item-on-target USEs — but only the
 * sealed_crypt rope, cold_forge grate, and sunken_barrow slab were converted.
 * The Alchemist's Tower was the lone remaining pack whose item-on-target USEs still
 * read the generic "use X on Y" while their prose insistently primed a specific verb:
 *   - herb → cauldron: "You STEEP the pale herb in the cauldron" (and the cauldron's
 *     reactive examine reads "a deep green STEEP of the pale herb");
 *   - water vial → cauldron: "You POUR the clear water in";
 *   - antidote → master: the climax — raising her head and tipping the cure between
 *     her lips — sets the win named `administer_cure`; the natural command is "GIVE".
 *
 * The fix is content-only (per-interaction command_verb + command_template, the
 * bug_0078 shape). The action ids stay verb-agnostic (`use_<item>_on_<target>`) and
 * the bare "use X on Y" still parses, so it is purely additive legibility.
 *
 * Locked here:
 *   (1) each interaction is LISTED with its natural command ("steep pale herb in great
 *       cauldron", "pour vial of water into great cauldron", "give antidote to fevered
 *       master") — never the generic "use ... on ..." wording;
 *   (2) the parser ACCEPTS both the natural command and the bare "use ... on ..." form;
 *   (3) the full canonical win route is unaffected — still ending_cured at 35/35.
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
import type { GameState } from "../../src/core/state.js";

const alch = loadParserPackFile("content/parser/pack/alchemists_tower.yaml");
if (!alch.ok) throw new Error("alchemists_tower must compile");
const index = indexParserPack(alch.compiled.pack);
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

// Stand at the cauldron holding both ingredients (herb + water vial), herb not yet
// steeped — mirrors the WIN_ROUTE up to (and including) the final go_north.
const TO_CAULDRON = [
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
];

// The full canonical win route (brew, then administer the cure) — identical to the
// stage3_alchemist acceptance BREW sequence and the parser_command_verb WIN_ROUTE.
const WIN_ROUTE = [
  ...TO_CAULDRON,
  "use_herb_on_cauldron",
  "use_water_vial_on_cauldron",
  "go_up",
  "use_antidote_on_master",
];

describe("bug_0081 — the alchemist's item-on-target USEs carry their natural verbs", () => {
  it("lists herb→cauldron as 'steep pale herb in great cauldron' (not 'use ... on ...')", () => {
    const s = play(initStateForParserPack(index, 1), TO_CAULDRON);
    const actions = enumerateActions(index, s);
    const steep = actions.find(
      (a) => a.action.type === "USE" && a.action.item === "herb" && a.action.target === "cauldron",
    );
    expect(steep).toBeDefined();
    expect(steep!.id).toBe("use_herb_on_cauldron"); // id stays verb-agnostic
    expect(steep!.command).toBe("steep pale herb in great cauldron");
    expect(actions.some((a) => a.command.includes("use pale herb on"))).toBe(false);
  });

  it("lists water→cauldron as 'pour vial of water into great cauldron' once the herb is steeped", () => {
    const s = play(initStateForParserPack(index, 1), [...TO_CAULDRON, "use_herb_on_cauldron"]);
    const actions = enumerateActions(index, s);
    const pour = actions.find(
      (a) =>
        a.action.type === "USE" && a.action.item === "water_vial" && a.action.target === "cauldron",
    );
    expect(pour).toBeDefined();
    expect(pour!.id).toBe("use_water_vial_on_cauldron");
    expect(pour!.command).toBe("pour vial of water into great cauldron");
    expect(actions.some((a) => a.command.includes("use vial of water on"))).toBe(false);
  });

  it("lists antidote→master as 'give antidote to fevered master' in the spire", () => {
    const s = play(initStateForParserPack(index, 1), [
      ...TO_CAULDRON,
      "use_herb_on_cauldron",
      "use_water_vial_on_cauldron",
      "go_up",
    ]);
    const actions = enumerateActions(index, s);
    const give = actions.find(
      (a) =>
        a.action.type === "USE" && a.action.item === "antidote" && a.action.target === "master",
    );
    expect(give).toBeDefined();
    expect(give!.id).toBe("use_antidote_on_master");
    expect(give!.command).toBe("give antidote to fevered master");
    expect(actions.some((a) => a.command.includes("use antidote on"))).toBe(false);
  });

  it("the parser accepts the natural verbs AND the bare 'use ... on ...' forms", () => {
    // herb / steep
    {
      const s = play(initStateForParserPack(index, 1), TO_CAULDRON);
      for (const cmd of [
        "steep pale herb in great cauldron",
        "steep herb in cauldron",
        "use herb on cauldron",
      ]) {
        expect(parseCommand(index, s, cmd)).toEqual({
          ok: true,
          action: { type: "USE", item: "herb", target: "cauldron" },
        });
      }
    }
    // water / pour (after the herb is steeped)
    {
      const s = play(initStateForParserPack(index, 1), [...TO_CAULDRON, "use_herb_on_cauldron"]);
      for (const cmd of ["pour water into cauldron", "use water vial on cauldron"]) {
        expect(parseCommand(index, s, cmd)).toEqual({
          ok: true,
          action: { type: "USE", item: "water_vial", target: "cauldron" },
        });
      }
    }
    // antidote / give (in the spire holding the brewed antidote)
    {
      const s = play(initStateForParserPack(index, 1), [
        ...TO_CAULDRON,
        "use_herb_on_cauldron",
        "use_water_vial_on_cauldron",
        "go_up",
      ]);
      for (const cmd of ["give antidote to master", "use antidote on master"]) {
        expect(parseCommand(index, s, cmd)).toEqual({
          ok: true,
          action: { type: "USE", item: "antidote", target: "master" },
        });
      }
    }
  });

  it("the full win route is unaffected — still reaches ending_cured at 35/35", () => {
    const s = play(initStateForParserPack(index, 1), WIN_ROUTE);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_cured");
    expect(s.vars["score"]).toBe(35);
  });
});
