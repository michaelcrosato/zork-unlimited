/**
 * Regression (§15) for bug_0103 — the Great Hall cellar hatch gives no hint that the
 * brass key won't fit, in the parser pack The Alchemist's Tower.
 *
 * A fresh blind MCP playtester (ai-runs/2026-06-02T02-40-31-708Z/playtest.md,
 * alchemists_tower seed 53 — rotated off the over-fitted clockwork_heist onto the
 * least-attended parser pack) won ending_cured 35/35, rated clarity 5/5, and flagged
 * ONE friction (report §4): standing in the Great Hall already carrying the brass key
 * (taken in the garden, the room just before this on the canonical route) with no iron
 * key yet, the cellar hatch reads only as a "great iron lock" with no unlock action and
 * no hint the brass key won't fit — so a player "wonders why they can't even try the key
 * they have."
 *
 * No engine change is needed: the reactive-object-`variants` feature (bug_0023/0033/0073,
 * already applied to this very hatch) covers it. The fix is pure CONTENT — one extra
 * cellar_door `variant`, gated on has_item brass_key AND not_item iron_key, listed AFTER
 * the is_unlocked variant. It names the iron lock as far too big for the little brass key
 * (cut for a strongbox) and foreshadows the iron key ("a key of iron to match it"),
 * without naming where it is. Gating on has_item brass_key keeps the bug_0052 leak lesson:
 * a player who never went to the garden sees the intrinsic base "great iron lock".
 *
 * Locked here:
 *   (1) holding the brass key but not the iron key, the hatch examine names the wrong-key
 *       mismatch (the brass key is too small) AND foreshadows a key of iron;
 *   (2) a player without the brass key sees the intrinsic base "great iron lock" — no
 *       reference to a brass key they haven't found (the bug_0052 leak lesson);
 *   (3) the moment the player holds the matching iron key, the hint stops firing and the
 *       accurate base "great iron lock" (still locked) returns (not_item iron_key guard);
 *   (4) first-match-wins: once the hatch is unlocked, the is_unlocked "sprung" variant wins
 *       over the wrong-key hint;
 *   (5) reachability/scoring unchanged: the canonical solve still reaches ending_cured at
 *       full score (35/35) — the variant is examine text only, no new gate.
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

// Canonical approach: garden for the brass key, then back to the Great Hall (the friction
// spot) — holding the brass key, no iron key yet.
const TO_HALL_WITH_BRASS = ["go_east", "take_brass_key", "go_west", "go_north"];
// Straight to the Great Hall with nothing (a player who skipped the garden).
const TO_HALL_EMPTY = ["go_north"];

describe("bug_0103 — the cellar hatch teaches that the brass key won't fit (foreshadows the iron key)", () => {
  it("holding the brass key (no iron key), the hatch examine names the wrong-key mismatch and a key of iron (live path)", () => {
    const s = play(initStateForParserPack(index, 53), TO_HALL_WITH_BRASS);
    expect(s.current).toBe("great_hall");
    expect(s.inventory).toContain("brass_key");
    expect(s.inventory).not.toContain("iron_key");

    const hint = examineNarration(s, "cellar_door");
    expect(hint).toContain("brass key"); // names the key the player is holding
    expect(hint.toLowerCase()).toContain("too big"); // the iron lock dwarfs the little brass key
    expect(hint).toContain("key of iron"); // foreshadows the iron key without saying where it is
    // It must not yet read the unlocked/sprung state.
    expect(hint.toLowerCase()).not.toContain("sprung");
    expect(hint.toLowerCase()).not.toContain("unbolted");
  });

  it("without the brass key, the hatch keeps the intrinsic base — no brass-key reference (bug_0052 leak lesson)", () => {
    const s = play(initStateForParserPack(index, 53), TO_HALL_EMPTY);
    expect(s.current).toBe("great_hall");
    expect(s.inventory).not.toContain("brass_key");

    const base = examineNarration(s, "cellar_door");
    expect(base).toBe("A bolted floor hatch with a great iron lock.");
    expect(base.toLowerCase()).not.toContain("brass");
  });

  it("once the player holds the matching iron key, the hint stops firing — accurate base returns (not_item guard)", () => {
    const cellar = index.objects.get("cellar_door")!;
    const s0 = initStateForParserPack(index, 53);
    // Brass AND iron key in hand, hatch still locked: the wrong-key hint must not fire.
    const sBoth: GameState = { ...s0, inventory: ["brass_key", "iron_key"] };
    const txt = objectDescription(cellar, sBoth);
    expect(txt).toBe("A bolted floor hatch with a great iron lock.");
    expect(txt.toLowerCase()).not.toContain("too big");
  });

  it("first-match-wins: once the hatch is unlocked, the sprung variant beats the wrong-key hint", () => {
    const cellar = index.objects.get("cellar_door")!;
    const s0 = initStateForParserPack(index, 53);
    // Unlocked AND still carrying the brass key: the is_unlocked variant (listed first) wins.
    // is_unlocked reads objectState[id].locked === false (src/core/conditions.ts).
    const sOpen: GameState = {
      ...s0,
      inventory: ["brass_key"],
      objectState: { ...s0.objectState, cellar_door: { locked: false } },
    };
    const txt = objectDescription(cellar, sOpen);
    expect(txt.toLowerCase()).toContain("sprung");
    expect(txt.toLowerCase()).not.toContain("too big");
  });

  it("reachability unchanged: the canonical brew route still reaches ending_cured at full score", () => {
    const won = play(initStateForParserPack(index, 53), [
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
