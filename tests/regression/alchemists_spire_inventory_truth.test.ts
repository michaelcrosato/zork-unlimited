/**
 * Regression (§15) for bug_0065 — the Alchemist's Tower spire lied about the
 * player's inventory.
 *
 * The `spire` ROOM description and the `master` OBJECT examine were both hardcoded
 * to assert the player was holding the finished antidote:
 *   - spire: "The pale antidote in your hand is no use until you give it to her."
 *   - master: "...but her eyes find the pale vial in your hand and hold on it."
 * But the laboratory→spire stair is unconditional, so a player can climb here
 * carrying the black phial, the raw herb, or nothing at all. A fresh, MCP-only blind
 * playtester (seed 31, report ai-runs/2026-06-01T17-49-25-714Z/playtest.md §5) reached
 * the spire holding ONLY the black phial and was still told "The pale antidote in your
 * hand..." — prose naming an item they did not hold. Same stale-text class as bug_0012
 * (rooms) and bug_0024 (objects), the last spots in this pack that still ignored state.
 *
 * THE FIX (pure CONTENT): both gain a `variants` entry gated on `has_item: antidote`.
 * The base text states the goal without claiming the cure is in hand (and names no
 * recipe — a player may have skipped the optional library, the bug_0052 leak lesson);
 * the "in your hand" beat fires only when the antidote is actually held. After the cure
 * is administered the antidote is consumed and the game ends, so only these two states
 * are observable. Text-only: no flag/item/score/exit/gating/reachable-ending change;
 * `visited: spire` still fires on entry, so the win condition is untouched.
 *
 * Locked here:
 *   (1) arriving at the spire WITHOUT the antidote (carrying the black phial) reads the
 *       base text — never "antidote in your hand" — for both the room and the master examine;
 *   (2) holding the antidote flips both to the "in your hand / give it to her" prose;
 *   (3) reachability unchanged: the canonical brew route still reaches ending_cured at
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

/** The narrate text an `examine <target>` (LOOK target) emits in this state. */
function examineNarration(s: GameState, target: string): string {
  const res = resolveParserAction(index, s, { type: "LOOK", target });
  const eff = res?.effects.find((e) => "narrate" in e) as { narrate: string } | undefined;
  if (!eff) throw new Error(`no examine narration for ${target} in ${s.current}`);
  return eff.narrate;
}

// Climb straight to the spire carrying ONLY the black phial — no antidote brewed.
const SPIRE_NO_ANTIDOTE = ["go_north", "go_north", "take_black_phial", "go_up"];

// The canonical brew route, stopping in the spire while still HOLDING the antidote
// (one step short of administering it, which would consume it and end the game).
const SPIRE_WITH_ANTIDOTE = [
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
];

describe("bug_0065 — the Alchemist's Tower spire stops claiming an antidote the player isn't holding", () => {
  it("the spire room reads the antidote-free base text when you arrive without it", () => {
    const s = play(initStateForParserPack(index, 31), SPIRE_NO_ANTIDOTE);
    expect(s.current).toBe("spire");
    expect(s.inventory).toEqual(["black_phial"]);
    expect(s.inventory).not.toContain("antidote");
    const t = desc(s);
    expect(t).toContain("you are not carrying it yet");
    expect(t).not.toContain("antidote in your hand");
  });

  it("the master examine reads the antidote-free base text when you arrive without it", () => {
    const s = play(initStateForParserPack(index, 31), SPIRE_NO_ANTIDOTE);
    const t = examineNarration(s, "master");
    expect(t).toContain("search you for the cure you have not yet brought");
    expect(t).not.toContain("vial in your hand");
  });

  it("both flip to the in-your-hand prose once the antidote is actually held", () => {
    const s = play(initStateForParserPack(index, 1), SPIRE_WITH_ANTIDOTE);
    expect(s.current).toBe("spire");
    expect(s.inventory).toContain("antidote");
    expect(desc(s)).toContain("pale antidote in your hand is no use until you give it to her");
    expect(examineNarration(s, "master")).toContain("eyes find the pale vial in your hand");
  });

  it("reachability unchanged: the canonical brew route still reaches ending_cured at full score", () => {
    const won = play(initStateForParserPack(index, 1), [
      ...SPIRE_WITH_ANTIDOTE,
      "use_antidote_on_master",
    ]);
    expect(won.ended).toBe(true);
    expect(won.endingId).toBe("ending_cured");
    expect(buildParserObservation(index, won).score).toBe(alch.compiled.pack.meta.max_score);
  });
});
