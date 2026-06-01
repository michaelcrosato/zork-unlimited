/**
 * Regression (§15) for bug_0024 — reactive OBJECT examine on the Alchemist's Tower
 * strongbox (applying the bug_0023 object-`variants` feature; closes bug_0023
 * deferred[0]).
 *
 * bug_0012 made the Cluttered Study ROOM react (after the iron key is held the room
 * reads "The iron strongbox sits open and empty ... its brass lock sprung"), but the
 * OBJECT examine path ("look at iron strongbox" → LOOK target) still fell back to the
 * static `description` "A squat iron strongbox with a brass lock". So a player who
 * unlocked, opened, and emptied the box and then examined it got a direct on-screen
 * contradiction of both the room's own reactive prose and their own actions. bug_0023
 * shipped the generic engine fix (ObjectSchema.variants + objectDescription, routed
 * through the single LOOK render site) and explicitly DEFERRED applying it here.
 *
 * THE FIX (pure CONTENT): strongbox gains a `variants` entry gated on the SAME signal
 * the study room uses (has_item iron_key — the durable "unlocked and emptied" proxy,
 * since the closed condition DSL has no object-open predicate), so the examine flips
 * in lockstep with the room. Examine-only: no flag/item/score/exit/gating/reachable-
 * ending change.
 *
 * Locked here:
 *   (1) the strongbox examine reads the static base ("brass lock") before the iron key
 *       is held — even after unlock+open (mirroring the room, which also waits on the
 *       take) — and flips to the "open and empty / brass lock sprung" variant once the
 *       key is held, never again reading as a plain locked box; driven through the live
 *       resolveParserAction LOOK render site, the same path the MCP server uses;
 *   (2) a variant-less object (the spellbook) returns its base description under
 *       arbitrary states and carries `variants` undefined (backward-compat: objects
 *       that don't opt in are byte-identical ⇒ the pack's content hash only moves for
 *       the strongbox edit);
 *   (3) reachability unchanged: the canonical brew route still reaches ending_cured at
 *       full score (35/35) — the variant is examine-only.
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

/** The narrate text an `examine <target>` (LOOK target) emits in this state. */
function examineNarration(s: GameState, target: string): string {
  const res = resolveParserAction(index, s, { type: "LOOK", target });
  const eff = res?.effects.find((e) => "narrate" in e) as { narrate: string } | undefined;
  if (!eff) throw new Error(`no examine narration for ${target} in ${s.current}`);
  return eff.narrate;
}

describe("bug_0024 — the Alchemist's Tower strongbox examine reacts once it is emptied", () => {
  it("examines as a locked box until the iron key is held, then flips to open-and-empty", () => {
    // Climb to the study holding the brass key.
    let s = play(initStateForParserPack(index, 29), [
      "go_east",
      "take_brass_key",
      "go_west",
      "go_north",
      "go_up",
    ]);
    expect(s.current).toBe("study");

    // Before: the static base description.
    expect(examineNarration(s, "strongbox")).toBe("A squat iron strongbox with a brass lock.");

    // Unlock + open, key not yet taken. bug_0024 ORIGINALLY left this window reading
    // the base "with a brass lock" (the has_item proxy only flips on EMPTYING); bug_0033
    // closed that gap with the new runtime object-state predicates, so the examine now
    // tracks the open-but-not-yet-emptied state and no longer calls the box locked.
    s = play(s, ["unlock_strongbox", "open_strongbox"]);
    expect(s.inventory).not.toContain("iron_key");
    const mid = examineNarration(s, "strongbox");
    expect(mid).toContain("stands open");
    expect(mid).not.toContain("with a brass lock");

    // Take the key: now the examine flips — no longer a brass-locked box.
    s = play(s, ["take_iron_key"]);
    expect(s.inventory).toContain("iron_key");
    const after = examineNarration(s, "strongbox");
    expect(after).toContain("open and empty");
    expect(after).toContain("brass lock sprung");
    expect(after).not.toContain("with a brass lock");
  });

  it("a variant-less object returns its base description under any state (backward-compat)", () => {
    const spellbook = index.objects.get("spellbook")!;
    expect(spellbook.variants).toBeUndefined(); // absent field stays absent ⇒ only the strongbox edit moves the hash
    const s0 = initStateForParserPack(index, 29);
    const s1: GameState = { ...s0, inventory: ["iron_key"], flags: { read_recipe: true } };
    expect(objectDescription(spellbook, s0)).toBe(spellbook.description);
    expect(objectDescription(spellbook, s1)).toBe(spellbook.description);
  });

  it("reachability unchanged: the canonical brew route still reaches ending_cured at full score", () => {
    const won = play(initStateForParserPack(index, 1), [
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
      "use_iron_key_on_cellar_door",
      "go_down",
      "take_water_vial",
      "go_up",
      "go_north",
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
