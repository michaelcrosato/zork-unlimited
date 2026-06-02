/**
 * Regression (§15) for bug_0111 — *The Alchemist's Tower* was fully linear with a
 * single non-trivial branch (the self-drink black-phial trap). Every blind playtest of
 * this otherwise-pristine pack rated clarity 5/5 but enjoyment only 4/5, the lost point
 * attributed to the pack being "short and fully linear" (this cycle's mandated pass,
 * ai-runs/2026-06-02T09-08-43-513Z/playtest.md, seed 101; the same note recurs across
 * prior seeds). That tester — and an earlier one (seed 67) — also flagged a concrete
 * gap: a player who carried the black phial up to the spire had NO "give black phial to
 * master" action at all, so the lethal trap only ever punished self-experimentation
 * (drink it yourself), never the more natural mistake of dosing the patient with the
 * wrong vial.
 *
 * The fix (the standing #1 evidence-backed enjoyment lever — BRANCH a linear parser
 * pack, cf. bug_0099) makes the spire climax a real DECISION: give the master the
 * antidote (the WIN) or the black phial (a distinct death, ending_master_poisoned — the
 * wrong-fork twin of drinking it yourself). It is heavily telegraphed (the recipe names
 * the phial death; the phial's own examine reeks of it; a new reactive master variant
 * shows her recoil from it), so an informed player avoids it and an experimenting one
 * gets a meaningful, Sierra-style consequence recoverable via load (§8.7). Content-only:
 * a new USE-black_phial-on-master interaction (no score, no flag), a new declared death
 * ending, and one reactive examine variant. The canonical win and the existing trap are
 * untouched.
 *
 * Locked here:
 *   (1) carrying the black phial to the spire surfaces the "give black phial to master"
 *       action, and firing it ends the game at ending_master_poisoned (death, score 0);
 *   (2) the branch is GATED on carrying the phial: a player who reaches the spire WITHOUT
 *       it (the canonical antidote route) is never offered it;
 *   (3) the reactive master examine reflects what you hold — recoil text for a phial
 *       bearer, the "pale vial in your hand" text for an antidote bearer, the base
 *       "cure you have not yet brought" otherwise (first-match-wins, antidote wins);
 *   (4) the new ending is a death ending and ending_cured is still a non-death win
 *       (NO_WINNABLE_ENDING intact); the pack still validates 0/0;
 *   (5) reachability unchanged: the canonical brew route still reaches ending_cured at
 *       full score.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions, resolveParserAction } from "../../src/parser/legal_actions.js";
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

function examineNarration(s: GameState, target: string): string {
  const res = resolveParserAction(index, s, { type: "LOOK", target });
  const eff = res?.effects.find((e) => "narrate" in e) as { narrate: string } | undefined;
  if (!eff) throw new Error(`no examine narration for ${target} in ${s.current}`);
  return eff.narrate;
}

function legalIds(s: GameState): string[] {
  return enumerateActions(index, s).map((o) => o.id);
}

// courtyard -N-> great_hall -N-> laboratory, take the phial, climb to the spire.
const PHIAL_TO_SPIRE = ["go_north", "go_north", "take_black_phial", "go_up"];

// The canonical brew route, stopping one step short of the cure (in the spire, holding
// the antidote, before giving it).
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

describe("bug_0111 — the spire climax branches: give the master the antidote or the wrong vial", () => {
  it("carrying the black phial to the spire surfaces the branch, and it ends in death", () => {
    const atSpire = play(initStateForParserPack(index, 101), PHIAL_TO_SPIRE);
    expect(atSpire.current).toBe("spire");
    expect(atSpire.inventory).toContain("black_phial");
    expect(legalIds(atSpire)).toContain("use_black_phial_on_master");

    const dead = play(atSpire, ["use_black_phial_on_master"]);
    expect(dead.ended).toBe(true);
    expect(dead.endingId).toBe("ending_master_poisoned");
    expect(buildParserObservation(index, dead).ending?.death).toBe(true);
    expect(buildParserObservation(index, dead).score).toBe(0); // a failure: no points
  });

  it("the branch is gated on carrying the phial: the canonical antidote route is never offered it", () => {
    const atSpire = play(initStateForParserPack(index, 1), BREW_TO_SPIRE);
    expect(atSpire.current).toBe("spire");
    expect(atSpire.inventory).toContain("antidote");
    expect(atSpire.inventory).not.toContain("black_phial");
    const ids = legalIds(atSpire);
    expect(ids).toContain("use_antidote_on_master"); // the win act
    expect(ids).not.toContain("use_black_phial_on_master"); // no wrong-vial fork without the phial
  });

  it("the reactive master examine reflects what you hold (first-match-wins, antidote wins)", () => {
    // base — neither vial: she searches you for the cure you have not brought.
    const bare = play(initStateForParserPack(index, 5), ["go_north", "go_north", "go_up"]);
    expect(bare.current).toBe("spire");
    expect(examineNarration(bare, "master")).toMatch(/cure you have not yet brought/i);

    // phial bearer — the recoil foreshadow.
    const phial = play(initStateForParserPack(index, 101), PHIAL_TO_SPIRE);
    const phialText = examineNarration(phial, "master");
    expect(phialText).toMatch(/black phial in your hand|shrinks from the oily dark/i);

    // antidote bearer — the "pale vial in your hand" text still wins.
    const cure = play(initStateForParserPack(index, 1), BREW_TO_SPIRE);
    expect(examineNarration(cure, "master")).toMatch(/pale vial in your hand/i);
  });

  it("the new ending is a death and ending_cured is still a non-death win; pack validates 0/0", () => {
    const declared = new Map(pack.endings.map((e) => [e.id, e]));
    expect(declared.get("ending_master_poisoned")?.death).toBe(true);
    expect(declared.get("ending_cured")?.death).toBeFalsy();
    expect(pack.endings.some((e) => !e.death)).toBe(true); // NO_WINNABLE_ENDING intact

    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
  });

  it("reachability unchanged: the canonical brew route still reaches ending_cured at full score", () => {
    const won = play(initStateForParserPack(index, 1), [
      ...BREW_TO_SPIRE,
      "use_antidote_on_master",
    ]);
    expect(won.ended).toBe(true);
    expect(won.endingId).toBe("ending_cured");
    expect(buildParserObservation(index, won).score).toBe(pack.meta.max_score);
  });
});
