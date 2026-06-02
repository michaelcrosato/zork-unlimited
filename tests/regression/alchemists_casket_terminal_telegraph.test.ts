/**
 * Regression (§15) for bug_0123 — *The Alchemist's Tower*'s silver casket BASE examine
 * must telegraph the betrayal fork as a TERMINAL greed choice, not a free bonus.
 *
 * bug_0114 made the spire a real moral fork (GIVE the antidote → ending_cured, the win;
 * UNLOCK the casket → ending_betrayal, a non-death greed ending that forecloses the cure).
 * For the fork to MEAN something the player must understand they are CHOOSING betrayal —
 * not stumbling into it. A fresh blind MCP playtester (seed 19,
 * ai-runs/2026-06-02T12-34-33-369Z/playtest.md §5) won all three endings, rated the pack
 * clarity 5/5 / enjoyment 4/5, found ZERO bugs — but hit ONE real friction in Run 1:
 * holding the finished cure, they popped the casket "for the last 5 points," expecting an
 * optional treasure, and were railroaded into ending_betrayal with no warning. The cause:
 * the has_item:antidote examine variant already carries the moral/terminal weight ("choose
 * the Work over the maker … leave her to the fever"), but a player who examines the casket
 * BEFORE brewing (as the tester did) sees only the BASE text, which read as a free bonus.
 *
 * The fix (content only): the BASE text now carries the same terminal/greed telegraph —
 * to set iron to the clasp is to turn from her pallet to her coffer, and the act "cannot be
 * undone" — so the betrayal is always a deliberate choice, never an ambush. Nothing else
 * moves: the casket still fires ending_betrayal only via end_game (bug_0114), the canonical
 * cure still wins ending_cured 40/40, and the pack stays valid.
 *
 * Locked here:
 *   (1) the BASE casket examine (no antidote held) telegraphs the act as terminal AND a
 *       betrayal of the master — not a bonus chest;
 *   (2) the bug_0114 base-text anchors survive ("masterwork" / "locked away within arm's
 *       reach"), and the base text still does NOT leak the antidote-only "choose the Work
 *       over the maker" line;
 *   (3) the antidote-bearer variant is still the sharper one;
 *   (4) behaviour is byte-identical: unlocking the casket still ends in ending_betrayal
 *       (non-death) and the canonical solve still wins ending_cured 40/40;
 *   (5) the pack validates clean.
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

function play(s: GameState, ids: string[]): { state: GameState; narration: string } {
  let narration = "";
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
    narration = r.events
      .filter((e): e is { type: "narration"; text: string } => e.type === "narration")
      .map((e) => e.text)
      .join(" ");
  }
  return { state: s, narration };
}

function examineNarration(s: GameState, target: string): string {
  const res = resolveParserAction(index, s, { type: "LOOK", target });
  const eff = res?.effects.find((e) => "narrate" in e) as { narrate: string } | undefined;
  if (!eff) throw new Error(`no examine narration for ${target} in ${s.current}`);
  return eff.narrate;
}

// The greed route: fetch the iron key (never brew) and climb to the spire holding it —
// the exact state in which a player examines the casket without the cure in hand.
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

describe("bug_0123 — the silver casket's base examine telegraphs a terminal betrayal, not a bonus", () => {
  it("the BASE examine (no antidote) frames opening as terminal AND a betrayal of the master", () => {
    const greed = play(initStateForParserPack(index, 1), KEY_TO_SPIRE).state;
    expect(greed.inventory).not.toContain("antidote");
    const base = examineNarration(greed, "silver_casket");

    // Terminality: the act is one-way, signalled diegetically (not a re-openable chest).
    expect(base).toMatch(/no closing it|chosen once|cannot be undone|not undone/i);
    // Betrayal weight: opening it turns away from the dying master / takes treasure not cure.
    expect(base).toMatch(/turn from her pallet|her coffer|treasure and not her cure/i);
  });

  it("the bug_0114 base anchors survive and the base text does NOT leak the antidote-only line", () => {
    const greed = play(initStateForParserPack(index, 1), KEY_TO_SPIRE).state;
    const base = examineNarration(greed, "silver_casket");
    expect(base).toMatch(/masterwork|locked away within arm's reach/i);
    expect(base).not.toMatch(/choose the Work over the maker/i); // that is the antidote variant
  });

  it("the antidote-bearer variant stays the sharper, distinct one", () => {
    const cure = play(initStateForParserPack(index, 1), BREW_TO_SPIRE).state;
    expect(cure.inventory).toContain("antidote");
    expect(examineNarration(cure, "silver_casket")).toMatch(/choose the Work over the maker/i);
  });

  it("behaviour is unchanged: unlocking the casket still ends in ending_betrayal (non-death)", () => {
    const { state } = play(initStateForParserPack(index, 1), [
      ...KEY_TO_SPIRE,
      "unlock_silver_casket",
    ]);
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_betrayal");
    expect(buildParserObservation(index, state).ending?.death).toBe(false);
    expect(state.flags["cure_administered"]).toBeFalsy();
  });

  it("behaviour is unchanged: the canonical solve still wins ending_cured 40/40", () => {
    const { state } = play(initStateForParserPack(index, 1), [
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
