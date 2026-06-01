/**
 * Regression (§15) for bug_0026 — a scoring pack ended without ever telling the
 * player their final score.
 *
 * A blind MCP playtester (ai-runs/2026-06-01T09-19-40-916Z, The Sealed Crypt, seed
 * 7) solved the crypt to ending_victory and flagged the one genuine on-screen gap
 * (report §5): "No closure / score summary at the win — ending_victory is a single
 * line with no final-score tally, even though a scoring system exists
 * (meta.max_score 35)." The player accrues points the whole game and the run ends
 * without ever surfacing what they scored. (The same report's score-"bug" was a
 * misread: the +5/+10/+20 awards are correctly additive — see sealed_crypt_scoring.)
 *
 * The fix is a GENERIC engine/UX capability, not a one-pack content edit — it
 * affects every scoring pack (sealed_crypt 35, sunken_barrow 50, cold_forge 50,
 * alchemists_tower 35). buildParserObservation now:
 *   (1) surfaces meta.max_score as the new `max_score` field (the denominator,
 *       previously absent from the observation); and
 *   (2) when ended AND max_score > 0, appends "Final score: X of Y." to the
 *       player-facing `description`. The tally reflects the ACTUAL accrued score
 *       (so a partial-credit win reads honestly), never a hardcoded max.
 * The canonical `ending.text` (and every pack YAML) stay PURE — only the rendered
 * `description` carries the tally, so all renderers (CLI play bins, MCP observation,
 * UI) surface closure with zero per-pack content change and no content hash change.
 * The RPG observation inherits the field and the rendered description through
 * buildParserObservation, so the feature reaches RPG packs from the same one site.
 *
 * Locked here:
 *   (1) sealed_crypt full route → ending_victory: description appends "Final score:
 *       35 of 35.", max_score is surfaced (35), and ending.text stays pure;
 *   (2) a partial-credit win (skip the optional +5 headstone) reads "Final score:
 *       30 of 35." — the tally tracks real score, not the max (guards a naive
 *       hardcode);
 *   (3) mid-game (not ended) the description carries NO tally, yet max_score is
 *       already surfaced;
 *   (4) the RPG path inherits it: sunken_barrow's victory description appends
 *       "Final score: 50 of 50." via buildRpgObservation, ending.text still pure.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";

// --- Parser: The Sealed Crypt -------------------------------------------------
const crypt = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
if (!crypt.ok) throw new Error("sealed_crypt must compile");
const cryptPack = crypt.compiled.pack;
const cryptIndex = indexParserPack(cryptPack);
const cryptStep = makeStep(buildParserRules(cryptIndex));

function playCrypt(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateActions(cryptIndex, s).find((o) => o.id === id);
    if (!opt)
      throw new Error(
        `"${id}" not legal in ${s.current}: [${enumerateActions(cryptIndex, s)
          .map((o) => o.id)
          .join(", ")}]`,
      );
    const r = cryptStep(s, opt.action);
    expect(r.ok).toBe(true);
    s = r.state;
  }
  return s;
}
const cryptObs = (s: GameState) => buildParserObservation(cryptIndex, s);

// Full solution path (milestones annotated), reused from sealed_crypt_scoring.
const TO_HEADSTONE = ["go_north", "go_west"];
const READ = ["read_headstone"]; // +5 (OPTIONAL — the win does not require it)
const TO_WELL_TIE = [
  "go_north",
  "open_stone_coffer",
  "take_brass_key",
  "go_south",
  "go_east",
  "go_up",
  "take_rope",
  "go_down",
  "go_east",
];
const TIE = ["use_rope_on_old_well"]; // +10
const TO_GATE = [
  "go_down",
  "unlock_oak_chest",
  "open_oak_chest",
  "take_iron_key",
  "go_up",
  "go_west",
  "go_north",
  "go_down",
];
const OPEN_GATE = ["use_iron_key_on_crypt_gate"]; // +20
const WIN = ["go_north"];

describe("bug_0026 — endings surface a final-score tally in scoring packs", () => {
  it("sealed_crypt full route: description appends 'Final score: 35 of 35.' and ending.text stays pure", () => {
    let s = initStateForParserPack(cryptIndex, 73);
    s = playCrypt(s, [
      ...TO_HEADSTONE,
      ...READ,
      ...TO_WELL_TIE,
      ...TIE,
      ...TO_GATE,
      ...OPEN_GATE,
      ...WIN,
    ]);

    const o = cryptObs(s);
    expect(o.ended).toBe(true);
    expect(o.ending_id).toBe("ending_victory");
    expect(o.score).toBe(35);
    expect(o.max_score).toBe(35);
    // The player-facing description carries the tally...
    expect(o.description).toContain("Final score: 35 of 35.");
    // ...and still contains the original ending narration.
    expect(o.description).toContain("You have won");
    // ...but the canonical ending.text is untouched (no tally leaked into it).
    expect(o.ending?.text).not.toContain("Final score");
    expect(o.ending?.text).toContain("You have won");
  });

  it("partial-credit win reads 'Final score: 30 of 35.' — the tally tracks real score, not the max", () => {
    // Skip the optional +5 headstone read; the win is still reachable at 30/35.
    let s = initStateForParserPack(cryptIndex, 73);
    s = playCrypt(s, [...TO_HEADSTONE, ...TO_WELL_TIE, ...TIE, ...TO_GATE, ...OPEN_GATE, ...WIN]);

    const o = cryptObs(s);
    expect(o.ended).toBe(true);
    expect(o.score).toBe(30);
    expect(o.max_score).toBe(35);
    expect(o.description).toContain("Final score: 30 of 35.");
    // A naive hardcode of the max would wrongly read "35 of 35" here.
    expect(o.description).not.toContain("35 of 35");
  });

  it("mid-game: no tally is shown, yet max_score is already surfaced", () => {
    const start = cryptObs(initStateForParserPack(cryptIndex, 73));
    expect(start.ended).toBe(false);
    expect(start.description).not.toContain("Final score");
    expect(start.max_score).toBe(35);

    const mid = cryptObs(
      playCrypt(initStateForParserPack(cryptIndex, 73), [...TO_HEADSTONE, ...READ]),
    );
    expect(mid.ended).toBe(false);
    expect(mid.score).toBe(5);
    expect(mid.description).not.toContain("Final score");
    expect(mid.max_score).toBe(35);
  });

  it("RPG inherits it: sunken_barrow victory description appends 'Final score: 50 of 50.', ending.text pure", () => {
    const loaded = loadRpgPackFile("content/rpg/pack/sunken_barrow.yaml");
    if (!loaded.ok) throw new Error("sunken_barrow must compile");
    const index = indexRpgPack(loaded.compiled.pack);
    const step = makeStep(buildRpgRules(index));
    const act = (s: GameState, pred: (a: Action) => boolean): GameState => {
      const opt = enumerateRpgActions(index, s).find((o) => pred(o.action));
      if (!opt)
        throw new Error(
          `no action in ${s.current}: [${enumerateRpgActions(index, s)
            .map((o) => o.id)
            .join(", ")}]`,
        );
      const r = step(s, opt.action);
      expect(r.ok).toBe(true);
      return r.state;
    };
    const move = (dir: string) => (a: Action) => a.type === "MOVE" && a.direction === dir;

    // Seed 1: 2 attacks fell the wight, 1 USE levers the slab (deterministic).
    let s = initStateForRpgPack(index, 1);
    s = act(s, move("down"));
    s = act(s, (a) => a.type === "TAKE");
    s = act(s, move("north"));
    s = act(s, (a) => a.type === "ATTACK");
    s = act(s, (a) => a.type === "ATTACK");
    s = act(s, move("east"));
    s = act(s, (a) => a.type === "USE");
    s = act(s, move("down")); // relic chamber (not yet won — the win is the claim, bug_0056)
    s = act(s, (a) => a.type === "TAKE"); // claim the circlet → win

    const o = buildRpgObservation(index, s);
    expect(o.ended).toBe(true);
    expect(o.ending_id).toBe("ending_victory");
    expect(o.score).toBe(50);
    expect(o.max_score).toBe(50);
    expect(o.description).toContain("Final score: 50 of 50.");
    expect(o.ending?.text).not.toContain("Final score");
  });
});
