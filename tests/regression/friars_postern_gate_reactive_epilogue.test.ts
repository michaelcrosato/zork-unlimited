/**
 * Regression (§15) for bug_0279 — friars_postern's death ending (ending_taken) presumed
 * the wall scratches had been read — reactive-ending-blindness class.
 *
 * A fresh source-blind MCP playtester (seed 3, ai-runs/2026-06-08T01-41-59-556Z/playtest.md)
 * ran a second playthrough that went straight to the turnkey's lodge and tried the night-gate
 * without ever reading the wall scratches (read_clue unset). The ending_taken epilogue closed:
 * "You trusted the gate the scratches told you not to trust" — accusing the player of ignoring
 * advice they never received. This is the reactive-ending-blindness class (bug_0272/0276): a
 * terminal reachable on BOTH an informed (read_clue set) and an uninformed path, whose single
 * fixed text presumed the informed one.
 *
 * The fix (content_fix, pure reactive-prose): ending_taken gains a `variants: [{ when:
 * [{ has_flag: read_clue }], text: ... }]` block above its base text (first-match-wins). The
 * read_clue variant keeps the ironic callback ("the scratches told you not to trust") for a
 * player who DID read the warning and trusted the gate anyway; the base text drops the
 * scratches reference for the player who never saw it. No flag/score/exit/win/death change.
 *
 * Locked here:
 *   (1) ending_taken is reachable WITHOUT reading the scratches (read_clue unset);
 *   (2) ending_taken is also reachable AFTER reading the scratches (the irony route);
 *   (3) the unread path → base text, not the scratches-callback;
 *   (4) the read path → variant text including the scratches callback;
 *   (5) both paths land on ending_taken (cosmetic reframe, never a reroute).
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
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadParserPackFile("content/parser/pack/friars_postern.yaml");
if (!loaded.ok) throw new Error("friars_postern must compile");
const pack = loaded.compiled.pack;
const index = indexParserPack(pack);
const step = makeStep(buildParserRules(index));

const start = (): GameState => initStateForParserPack(index, 1);

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt) {
      const legal = enumerateActions(index, s).map((o) => o.id);
      throw new Error(`"${id}" not legal in ${s.current}: [${legal.join(", ")}]`);
    }
    const r = step(s, opt.action);
    expect(r.ok, `step ${id} ok`).toBe(true);
    s = r.state;
  }
  return s;
}

// Gallery → lodge (take key) → gallery → gatehouse → unlock gate (scratches unread)
const GATE_NO_SCRATCH = [
  "go_north", // cell → gallery
  "go_east", // gallery → lodge
  "take_gate_key",
  "go_west", // lodge → gallery
  "go_down", // gallery → gatehouse
  "unlock_iron_gate",
];

// Same gate route but cell scratches read first
const GATE_WITH_SCRATCH = [
  "read_wall_scratches", // cell (sets read_clue)
  "go_north",
  "go_east",
  "take_gate_key",
  "go_west",
  "go_down",
  "unlock_iron_gate",
];

describe("bug_0279 — friars_postern ending_taken epilogue is truthful when scratches unread", () => {
  it("(1) ending_taken is reachable WITHOUT reading the wall scratches", () => {
    const s = play(start(), GATE_NO_SCRATCH);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_taken");
    expect(s.flags.read_clue ?? false).toBe(false);
  });

  it("(2) ending_taken is also reachable AFTER reading the scratches (the irony route)", () => {
    const s = play(start(), GATE_WITH_SCRATCH);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_taken");
    expect(s.flags.read_clue).toBe(true);
  });

  it("(3) the unread path → base text, not the scratches callback", () => {
    const s = play(start(), GATE_NO_SCRATCH);
    const obs = buildParserObservation(index, s);
    expect(obs.ending!.id).toBe("ending_taken");
    // base text must not accuse the player of ignoring advice they never received
    expect(obs.ending!.text).not.toContain("scratches told you not to trust");
    // but still must describe the arrest that ended the run
    expect(obs.ending!.text.toLowerCase()).toContain("dark beyond the bars");
    expect(obs.ending!.text.toLowerCase()).toContain("been taken");
  });

  it("(4) the read path → variant text with the ironic scratches callback", () => {
    const s = play(start(), GATE_WITH_SCRATCH);
    const obs = buildParserObservation(index, s);
    expect(obs.ending!.id).toBe("ending_taken");
    expect(obs.ending!.text).toContain("scratches told you not to trust");
  });

  it("(5) both paths land on ending_taken; rendered texts are distinct (cosmetic reframe, no reroute)", () => {
    const s1 = play(start(), GATE_NO_SCRATCH);
    const s2 = play(start(), GATE_WITH_SCRATCH);
    expect(s1.endingId).toBe("ending_taken");
    expect(s2.endingId).toBe("ending_taken");
    const obs1 = buildParserObservation(index, s1);
    const obs2 = buildParserObservation(index, s2);
    expect(obs1.ending!.id).toBe(obs2.ending!.id);
    expect(obs1.ending!.text).not.toBe(obs2.ending!.text);
  });
});
