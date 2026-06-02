/**
 * Regression (§15) for bug_0093 — the cauldron's pre-herb examine gives no hint of the
 * two-step brew ORDER in the parser pack The Alchemist's Tower.
 *
 * A fresh blind MCP playtester (ai-runs/2026-06-02T00-13-20-449Z/playtest.md,
 * alchemists_tower seeds 11/7/3 — rotated off the ~27×-blind-clean clockwork_heist onto
 * the least-attended parser pack) won ending_cured 35/35, rated clarity 5/5, and flagged
 * ONE friction (report §4): standing in the lab with the pale herb but no water yet, the
 * recipe reads "the pale herb steeped in clear water" as a single combined state, while
 * the mechanic is two ORDERED steps — steep the herb first, THEN pour in the cellar's
 * clear spring water. The cauldron's pre-herb examine was the static "A simmering
 * cauldron, waiting for ingredients", so a careful reader could not tell whether the
 * cauldron's OWN simmering liquid already counted as the recipe's clear water, or whether
 * the cellar vial was still needed.
 *
 * No engine change is needed: the reactive-object-`variants` feature (bug_0023, applied to
 * this very cauldron in bug_0039) already exists. The fix is pure CONTENT — one extra
 * cauldron `variant`, gated on `read_recipe` (the flag the spellbook READ sets), listed
 * AFTER the brew-state variants so it only fires in the pre-herb decision moment. It names
 * the cauldron's own simmer as NOT the recipe's clear water, and spells out the two-step
 * order. Gating on read_recipe keeps the bug_0052 leak lesson: a library-skipper who never
 * read the recipe sees the intrinsic static base, never a quoted recipe.
 *
 * Locked here:
 *   (1) a recipe-reader's pre-herb cauldron examine names the two-step order ("two steps",
 *       herb first, the clear spring water) and disambiguates the simmer ("not the clear
 *       water the recipe means") — and does NOT read any post-herb brew state;
 *   (2) a NON-reader's pre-herb cauldron examine stays the static base and never references
 *       a recipe (the bug_0052 leak lesson);
 *   (3) first-match-wins: once the herb is in, the herb_added variant wins over the
 *       read_recipe hint (the hint fires ONLY pre-herb);
 *   (4) reachability/scoring unchanged: the canonical brew route still reaches ending_cured
 *       at full score (35/35) — the variant is examine text only.
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
import { objectDescription } from "../../src/parser/model.js";
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

/** The narrate text an `examine <target>` (LOOK target) emits in this state — the live
 *  resolveParserAction render path the MCP server uses. */
function examineNarration(s: GameState, target: string): string {
  const res = resolveParserAction(index, s, { type: "LOOK", target });
  const eff = res?.effects.find((e) => "narrate" in e) as { narrate: string } | undefined;
  if (!eff) throw new Error(`no examine narration for ${target} in ${s.current}`);
  return eff.narrate;
}

// Reach the laboratory (cauldron) WITHOUT picking up the herb, via the two-room hop
// courtyard → great_hall → laboratory. A reader detours west to read the spellbook first.
const TO_LAB_NO_READ = ["go_north", "go_north"];
const TO_LAB_READER = ["go_west", "read_spellbook", "go_east", "go_north", "go_north"];

describe("bug_0093 — the cauldron's pre-herb examine teaches the two-step brew order", () => {
  it("a recipe-reader sees the two-step order and the simmer-isn't-clear-water cue (live path)", () => {
    const s = play(initStateForParserPack(index, 11), TO_LAB_READER);
    expect(s.current).toBe("laboratory");
    expect(s.flags["read_recipe"]).toBe(true);
    expect(s.flags["herb_added"]).toBeFalsy();

    const hint = examineNarration(s, "cauldron");
    expect(hint).toContain("two steps");
    expect(hint).toContain("clear spring water"); // names the cellar ingredient to pour in
    expect(hint).toContain("not the clear water"); // the cauldron's own simmer ≠ the recipe's clear water
    // It must not yet read any post-herb brew state.
    expect(hint).not.toContain("deep green steep");
    expect(hint).not.toContain("drained and still");
  });

  it("a non-reader keeps the intrinsic static base — no recipe reference (bug_0052 leak lesson)", () => {
    const s = play(initStateForParserPack(index, 11), TO_LAB_NO_READ);
    expect(s.current).toBe("laboratory");
    expect(s.flags["read_recipe"]).toBeFalsy();

    const base = examineNarration(s, "cauldron");
    expect(base).toBe("A simmering cauldron, waiting for ingredients.");
    expect(base.toLowerCase()).not.toContain("recipe");
  });

  it("first-match-wins: once the herb is in, the herb_added variant beats the read_recipe hint", () => {
    const cauldron = index.objects.get("cauldron")!;
    const s0 = initStateForParserPack(index, 11);
    // read_recipe AND herb_added both true — the herb_added variant is listed first.
    const sHerb: GameState = { ...s0, flags: { read_recipe: true, herb_added: true } };
    const txt = objectDescription(cauldron, sHerb);
    expect(txt).toContain("deep green steep");
    expect(txt).not.toContain("two steps");
  });

  it("reachability unchanged: the canonical brew route still reaches ending_cured at full score", () => {
    const won = play(initStateForParserPack(index, 11), [
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
    expect(won.ended).toBe(true);
    expect(won.endingId).toBe("ending_cured");
    expect(buildParserObservation(index, won).score).toBe(alch.compiled.pack.meta.max_score);
  });
});
