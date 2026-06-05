/**
 * Regression (§15) for bug_0261 — the Alchemist's Tower `grip iron key` beat read
 * as an unfired Chekhov's gun, and trailed the player through every room.
 *
 * A fresh blind MCP playtest (ai-runs/2026-06-05T00-03-26-064Z, seed 47) rated the
 * pack clarity 5/5, enjoyment 4/5, won all three endings, found ZERO bugs — but
 * flagged ONE concrete friction point, twice (report §4 and §5): the optional self-USE
 * steadiness beat (`grip iron key`, the Stage-4 skill_check) is a USE on a CARRIED
 * item, so it surfaced "the moment you pick up the iron key, with no in-world prompt
 * for why," and then trailed the player through every room it was held in, "setup with
 * no payoff." The same finding-family already resolved on sealed_crypt (bug_0241 examine
 * telegraph + bug_0258 `in_room` room-gate).
 *
 * The `steadiness` check is DELIBERATELY CONVERGENT and must stay (it gates nothing by
 * design — the RPG-standardization beat for this parser pack). So the fix is the proven
 * two-leg legibility port, content only:
 *
 *   (1) Examine telegraph: the iron key's description now names the impulse to "grip it
 *       … and steady your hand" before setting it to a lock, so `grip iron key` reads as
 *       an intentional, clued tension moment rather than a vestigial leftover.
 *   (2) Room-gate `{ in_room: great_hall }`: the beat is offered ONLY in the Great Hall,
 *       where the iron key's first real lock — the cellar hatch's great iron lock —
 *       stands (the "down here" the narration names), not in every room the key is
 *       carried through (study where it is taken, the cellar, the laboratory, the spire).
 *
 * Both legs are pure legibility: no flag/score/exit/ending/variant change. This pins:
 *   (1) examining the held iron key telegraphs the steady-your-hand/grip beat (and keeps
 *       the "great iron lock" fitting line);
 *   (2) the grip beat is ABSENT in the study (where the key is taken) and in the cellar,
 *       and APPEARS in the Great Hall;
 *   (3) it is cosmetic — exercising the grip in the Great Hall, the full cure route still
 *       wins ending_cured at 40/40 (the key was never consumed by the beat).
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

/** The narration the explicit `look at <target>` action emits in this state. */
function examine(s: GameState, target: string): string {
  const res = resolveParserAction(index, s, { type: "LOOK", target });
  const eff = res?.effects[0];
  if (!eff || !("narrate" in eff)) throw new Error("LOOK produced no narration");
  return eff.narrate;
}

const hasGrip = (s: GameState): boolean =>
  enumerateActions(index, s).some(
    (a) =>
      a.action.type === "USE" && a.action.item === "iron_key" && a.action.target === "iron_key",
  );

// Reach the Study holding the iron key (the room where it is taken — the old leak point).
const TO_IRON_KEY = [
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
];

describe("bug_0261 — the iron key's examine telegraphs the optional grip beat, gated to the Great Hall", () => {
  it("examining the held iron key names the steady-your-hand impulse the `grip` action acts on", () => {
    const s = play(initStateForParserPack(index, 47), TO_IRON_KEY);
    expect(s.inventory).toContain("iron_key");
    const text = examine(s, "iron_key");
    expect(text).toContain("steady your hand");
    expect(text).toContain("grip it");
    // Still the same iron key — the lock-fitting line is intact.
    expect(text).toContain("great iron lock");
  });

  it("the grip beat is ABSENT where the key is taken (study) and in the cellar, but APPEARS in the Great Hall", () => {
    // In the study, key in hand: the beat must NOT surface here (the leak point).
    let s = play(initStateForParserPack(index, 47), TO_IRON_KEY);
    expect(s.current).toBe("study");
    expect(s.inventory).toContain("iron_key");
    expect(hasGrip(s)).toBe(false);

    // Descend into the Great Hall (still holding the key): the beat APPEARS — the cellar
    // hatch's great iron lock stands here, the "down here" the narration names.
    s = play(s, ["go_down"]);
    expect(s.current).toBe("great_hall");
    expect(hasGrip(s)).toBe(true);

    // Carry the key on down into the cellar — absent again (the gate is the Great Hall).
    s = play(s, ["unlock_cellar_door", "go_down"]);
    expect(s.current).toBe("cellar");
    expect(s.inventory).toContain("iron_key");
    expect(hasGrip(s)).toBe(false);
  });

  it("the change is cosmetic — exercising the grip in the Great Hall, the cure route still wins 40/40", () => {
    const won = play(initStateForParserPack(index, 47), [
      ...TO_IRON_KEY,
      "go_down",
      "use_iron_key", // the optional steadiness beat — must not consume the key or block the route
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
    // The key was never consumed by the beat — it still opened the cellar and the route
    // reached the perfect-score win.
    expect(buildParserObservation(index, won).score).toBe(40);
  });
});
