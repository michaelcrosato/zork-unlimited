/**
 * Regression (§15) for bug_0010 — stale room text contradicted changed state.
 *
 * A blind MCP playtester of The Sealed Crypt (ai-runs/2026-06-01T06-21-08-533Z,
 * seed 7) solved the pack and flagged that two rooms kept narrating the world as
 * it was BEFORE the player changed it (report §5):
 *   - Old Well still read "too far to climb down without a rope" after the rope
 *     was tied and the down exit had opened.
 *   - Crypt still read "an iron catacombs gate bars the way" after the gate had
 *     been unlocked and swung inward.
 * The fix is a generic engine feature: rooms may declare reactive `variants`
 * ({ when, text }); the first whose conditions hold replaces the base description,
 * read identically by the observation builder and the LOOK action.
 *
 * Locked here:
 *   (1) Old Well flips from the rope-less text to the rope-tied text once the rope
 *       is tied, and never again claims you have no rope;
 *   (2) Crypt flips from the gate-barred text to the gate-open text once the gate
 *       is unlocked, and never again claims the gate bars the way;
 *   (3) the explicit `look` action narrates the SAME reactive text as the
 *       observation (no divergence between the two read paths);
 *   (4) a room with no variants returns its base description byte-identically
 *       (backward-compat: pre-existing packs are unaffected).
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
import { roomDescription } from "../../src/parser/model.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const crypt = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
if (!crypt.ok) throw new Error("sealed_crypt must compile");
const index = indexParserPack(crypt.compiled.pack);
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
  const eff = res?.effects[0];
  if (!eff || !("narrate" in eff)) throw new Error("LOOK produced no narration");
  return eff.narrate;
}

describe("bug_0010 — reactive room text replaces stale descriptions after state changes", () => {
  it("Old Well flips from rope-less to rope-tied text once the rope is tied", () => {
    let s = play(initStateForParserPack(index, 7), [
      "go_north",
      "go_up",
      "take_rope",
      "go_down",
      "go_east",
    ]);
    // Before tying: the base description still warns there's no rope.
    expect(desc(s)).toContain("too far to climb down without a rope");
    s = play(s, ["use_rope_on_old_well"]);
    // After tying: the variant takes over.
    expect(s.flags["rope_attached_to_well"]).toBe(true);
    expect(desc(s)).toContain("knotted fast");
    expect(desc(s)).toContain("the way down is open");
    expect(desc(s)).not.toContain("too far to climb down without a rope");
    // The explicit `look` reads the same reactive text.
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("Crypt flips from gate-barred to gate-open text once the gate is unlocked", () => {
    // Full solve up to (but not through) the open gate: brass key → iron key →
    // tie rope → unlock the catacombs gate. The win now fires only when the relic
    // is taken, so in the crypt with the gate open the game is not yet ended.
    const SOLVE = [
      "go_north", // forest → chapel_yard
      "go_up",
      "take_rope",
      "go_down", // rope from the bell tower
      "go_west",
      "go_north", // → graveyard → mausoleum
      "open_stone_coffer",
      "take_brass_key", // brass key
      "go_south",
      "go_east",
      "go_east", // → graveyard → yard → old well
      "use_rope_on_old_well", // tie the rope (opens the well)
      "go_down",
      "unlock_oak_chest",
      "open_oak_chest",
      "take_iron_key",
      "go_up", // iron key
      "go_west",
      "go_north",
      "go_down", // yard → nave → crypt
    ];
    let s = play(initStateForParserPack(index, 7), SOLVE);
    expect(s.current).toBe("crypt");
    expect(desc(s)).toContain("bars the way");
    s = play(s, ["unlock_crypt_gate"]);
    expect(s.flags["catacombs_open"]).toBe(true);
    expect(s.current).toBe("crypt");
    expect(s.ended).toBe(false);
    expect(desc(s)).toContain("stands unlocked and swung inward");
    expect(desc(s)).not.toContain("bars the way");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("a room with no variants returns its base description unchanged (backward-compat)", () => {
    const s0 = initStateForParserPack(index, 7);
    const forest = index.rooms.get("forest_path")!;
    expect(forest.variants).toBeUndefined();
    expect(roomDescription(forest, s0)).toBe(forest.description);
    expect(desc(s0)).toBe(forest.description);
  });
});
