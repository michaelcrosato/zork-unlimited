/**
 * Regression (§15) for bug_0039 — stale Laboratory/cauldron text contradicted the
 * brew state in the parser pack The Alchemist's Tower.
 *
 * A blind MCP playtester (ai-runs/2026-06-01T12-00-45-068Z, alchemists_tower seed
 * 137 — rotated off the assessor's rank-1 clockwork_heist, which is blind-verified
 * pristine ~15 straight cycles) solved the tower to ending_cured (clarity 5/5) and,
 * as its one concrete finding (report §5), flagged that after the antidote is brewed
 * the Laboratory ROOM still reads "A great cauldron simmers over a low flame" and the
 * cauldron OBJECT still examines as "waiting for ingredients" — narrated text lying
 * about a state the player just changed, the exact class fixed elsewhere in this pack
 * (rooms bug_0012; strongbox examine bug_0023/0024/0033).
 *
 * No engine change is needed: the reactive room `variants` (bug_0010/0012) and object
 * `variants` (bug_0023) features already exist and are read by the single observation/
 * LOOK render site. The Laboratory room and its cauldron were simply the one stale-
 * prone pair never opted in. The fix is pure CONTENT — `variants` on the room (cauldron
 * clause) and the object — so it changes only narrated text, never flags/items/score/
 * exits/interactions/gating/reachable endings.
 *
 * Locked here:
 *   (1) the Laboratory room flips base ("simmers... waiting") → mid-steep ("deep herbal
 *       green ... waiting for clear water") once the herb is in → drained ("gone still
 *       ... drained of the antidote") once the antidote is decanted, and never again
 *       reads the steeping clue once brewed; the explicit LOOK matches the observation;
 *   (2) the cauldron OBJECT examine tracks the same three states through the live
 *       resolveParserAction LOOK render site (the path the MCP server uses), and never
 *       again reads "waiting for ingredients" once something is in the pot;
 *   (3) a variant-less object (the pale herb — the black phial gained a danger-cue
 *       variant in bug_0052, so the herb is now this pack's variant-less control)
 *       returns its base description under arbitrary states and carries `variants`
 *       undefined (backward-compat: an absent field stays absent);
 *   (4) reachability unchanged: the canonical brew route still reaches ending_cured at
 *       full score (35/35) — the variants are text-only.
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

const desc = (s: GameState): string => buildParserObservation(index, s).description;

/** The narrate text the explicit `look` action would emit in this state. */
function lookNarration(s: GameState): string {
  const res = resolveParserAction(index, s, { type: "LOOK" });
  const eff = res?.effects.find((e) => "narrate" in e) as { narrate: string } | undefined;
  if (!eff) throw new Error("LOOK produced no narration");
  return eff.narrate;
}

/** The narrate text an `examine <target>` (LOOK target) emits in this state. */
function examineNarration(s: GameState, target: string): string {
  const res = resolveParserAction(index, s, { type: "LOOK", target });
  const eff = res?.effects.find((e) => "narrate" in e) as { narrate: string } | undefined;
  if (!eff) throw new Error(`no examine narration for ${target} in ${s.current}`);
  return eff.narrate;
}

// Canonical route that reaches the laboratory holding the herb AND the water vial,
// so both brew steps are available without leaving the room.
const TO_LAB_READY = [
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

describe("bug_0039 — the Laboratory and cauldron text react to the brew state", () => {
  it("the Laboratory room flips base → mid-steep → drained as the brew is made", () => {
    let s = play(initStateForParserPack(index, 137), TO_LAB_READY);
    expect(s.current).toBe("laboratory");

    // Base: nothing in the pot yet.
    expect(desc(s)).toContain("simmers over a low flame");
    expect(desc(s)).not.toContain("deep herbal green");
    expect(desc(s)).not.toContain("drained of the antidote");
    expect(lookNarration(s)).toBe(desc(s));

    // Herb steeped: the pot reads green and waiting for water.
    s = play(s, ["use_herb_on_cauldron"]);
    expect(s.flags["herb_added"]).toBe(true);
    expect(desc(s)).toContain("deep herbal green");
    expect(desc(s)).toContain("waiting for clear water");
    expect(desc(s)).not.toContain("drained of the antidote");
    expect(lookNarration(s)).toBe(desc(s));

    // Antidote decanted: the pot reads drained and still — never again "waiting".
    s = play(s, ["use_water_vial_on_cauldron"]);
    expect(s.flags["antidote_brewed"]).toBe(true);
    expect(s.inventory).toContain("antidote");
    expect(desc(s)).toContain("drained of the antidote");
    expect(desc(s)).toContain("gone still");
    expect(desc(s)).not.toContain("deep herbal green");
    expect(desc(s)).not.toContain("waiting for clear water");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("the cauldron examine tracks the same three states (live LOOK render path)", () => {
    let s = play(initStateForParserPack(index, 137), TO_LAB_READY);

    // Base examine: the static "waiting for ingredients".
    expect(examineNarration(s, "cauldron")).toBe("A simmering cauldron, waiting for ingredients.");

    s = play(s, ["use_herb_on_cauldron"]);
    const mid = examineNarration(s, "cauldron");
    expect(mid).toContain("deep green steep");
    expect(mid).not.toContain("waiting for ingredients");

    s = play(s, ["use_water_vial_on_cauldron"]);
    const after = examineNarration(s, "cauldron");
    expect(after).toContain("drained and still");
    expect(after).not.toContain("waiting for ingredients");
  });

  it("a variant-less object returns its base description under any state (backward-compat)", () => {
    // The pale herb carries no variants (bug_0052 gave the black phial a danger-cue
    // variant, so the herb is now this pack's variant-less control). An absent
    // `variants` field stays absent ⇒ that object contributes nothing reactive and
    // always renders its static description.
    const herb = index.objects.get("herb")!;
    expect(herb.variants).toBeUndefined();
    const s0 = initStateForParserPack(index, 137);
    const s1: GameState = {
      ...s0,
      flags: { herb_added: true, antidote_brewed: true },
      inventory: ["antidote"],
    };
    expect(objectDescription(herb, s0)).toBe(herb.description);
    expect(objectDescription(herb, s1)).toBe(herb.description);
  });

  it("reachability unchanged: the canonical brew route still reaches ending_cured at full score", () => {
    const won = play(initStateForParserPack(index, 1), [
      ...TO_LAB_READY,
      "use_herb_on_cauldron",
      "use_water_vial_on_cauldron",
      "go_up",
      "use_antidote_on_master", // bug_0057: the win is the deliberate cure, not bare spire entry
    ]);
    expect(won.ended).toBe(true);
    expect(won.endingId).toBe("ending_cured");
    expect(buildParserObservation(index, won).score).toBe(alch.compiled.pack.meta.max_score);
  });
});
