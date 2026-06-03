/**
 * Regression (§15) for bug_0206 — the bug_0201 `blocked_exits` hint reaches the
 * HUMAN-facing surfaces too. bug_0201 added `blocked_exits` to the structured
 * observation (the agent/MCP surface), closing "a barred way reads as a non-existent
 * one" for the AGENT. But the three human renderers ignored the new field:
 *   - bin/parser_play.ts render()  — listed open `Exits:` only;
 *   - bin/rpg_play.ts render()     — same, and its on-attempt message is generic;
 *   - ui/src/engine.ts view()      — `facts` carried `exit: …` but no blocked cue.
 * So a human at the lamplighters staith-head saw "Exits: south" with no hint that a
 * `down` way to the strand exists and is barred until the lamp is lit — the exact
 * friction bug_0201 fixed for the agent. This pins the human surfaces to parity.
 *
 * The fix is render-only and ADDITIVE (no engine/observation/state change): each
 * surface now emits each blocked exit's direction + authored message, never how to
 * clear it (that command stays hidden until legal). The play-bins gained an
 * `import.meta.url` entry guard (the src/ai-loop.ts idiom) so `render` is importable
 * here without running main().
 *
 * WITNESS: each "shows the hint" assertion is paired with a "no false hint where the
 * room has no blocked exit" assertion, so reverting the render edit (dropping the
 * blocked line) fails the positive case — not vacuous green. Drives the REAL
 * `render`/`view` over REAL packs through the REAL engine.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { render as renderParser } from "../../bin/parser_play.js";
import { render as renderRpg } from "../../bin/rpg_play.js";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep } from "../../src/core/engine.js";
import { GameSession } from "../../ui/src/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";

// --- Parser pack: The Lamplighter's Round. lamp_walk's east (the excise-store door)
//     is barred until store_open; harbour_head's down (the strand) until lamp_lit. ---
const ploaded = loadParserPackFile("content/parser/pack/lamplighters_round.yaml");
if (!ploaded.ok) throw new Error("lamplighters_round must compile");
const pindex = indexParserPack(ploaded.compiled.pack);
const pstep = makeStep(buildParserRules(pindex));
const STORE_MSG =
  "The excise-store door is barred and locked; until it is opened you cannot get at what the Crown has impounded within.";

function pmove(s: GameState, direction: string): GameState {
  const r = pstep(s, { type: "MOVE", direction } as Action);
  expect(r.ok, `move ${direction} in ${s.current}`).toBe(true);
  return r.state;
}

// --- RPG pack: Sunken Barrow. guard_crypt's east is barred while the wight stands. ---
const rloaded = loadRpgPackFile("content/rpg/pack/sunken_barrow.yaml");
if (!rloaded.ok) throw new Error("sunken_barrow must compile");
const rindex = indexRpgPack(rloaded.compiled.pack);
const rstep = makeStep(buildRpgRules(rindex));
const WIGHT_MSG = "The barrow-wight bars the way; you cannot pass while it stands.";

function rmove(s: GameState, action: Action): GameState {
  const r = rstep(s, action);
  expect(r.ok, `action ${JSON.stringify(action)} in ${s.current}`).toBe(true);
  return r.state;
}

describe("bug_0206 — blocked_exits reaches the human renderers (CLI bins + UI)", () => {
  it("parser CLI render(): the barred east at lamp_walk shows as a 'Blocked (east):' line with its reason", () => {
    let s = initStateForParserPack(pindex, 7);
    s = pmove(s, "north"); // river_stair → lamp_walk
    expect(s.current).toBe("lamp_walk");
    const out = renderParser(buildParserObservation(pindex, s));
    expect(out).toContain("Exits:"); // open exits still listed
    expect(out).toContain(`Blocked (east): ${STORE_MSG}`); // the new human hint
  });

  it("parser CLI render(): a room with no blocked exit shows no 'Blocked (' line (no false hint)", () => {
    const out = renderParser(buildParserObservation(pindex, initStateForParserPack(pindex, 7)));
    expect(out).toContain("=== The River Stair ===");
    expect(out).not.toContain("Blocked ("); // river_stair's lone exit is unconditional
  });

  it("RPG CLI render(): the barred east at guard_crypt shows as a 'Blocked (east):' line with its reason", () => {
    let s = initStateForRpgPack(rindex, 1);
    s = rmove(s, { type: "MOVE", direction: "down" }); // barrow_mouth → entry_hall
    s = rmove(s, { type: "MOVE", direction: "north" }); // entry_hall → guard_crypt
    expect(s.current).toBe("guard_crypt");
    expect(s.flags["wight_slain"]).not.toBe(true);
    const out = renderRpg(buildRpgObservation(rindex, s));
    expect(out).toContain(`Blocked (east): ${WIGHT_MSG}`);
  });

  it("RPG CLI render(): the start room (only an unconditional exit) shows no 'Blocked (' line", () => {
    const out = renderRpg(buildRpgObservation(rindex, initStateForRpgPack(rindex, 1)));
    expect(out).not.toContain("Blocked (");
  });

  it("UI view(): a parser session surfaces the barred way as a 'blocked:' fact, with parity to the structured observation", () => {
    const s = GameSession.start(
      readFileSync("content/parser/pack/lamplighters_round.yaml", "utf8"),
      7,
    );
    expect(s.mode).toBe("parser");
    expect(s.view().facts.some((f) => f.startsWith("blocked:"))).toBe(false); // river_stair: none
    const north = s.view().choices.find((c) => c.label === "go north");
    expect(north).toBeTruthy();
    s.choose(north!.id); // → lamp_walk
    const facts = s.view().facts;
    expect(facts).toContain(`blocked: east — ${STORE_MSG}`);
    expect(facts).toContain("exit: north"); // open exits still present
  });

  it("UI view(): an RPG session surfaces the barred way as a 'blocked:' fact too", () => {
    const s = GameSession.start(readFileSync("content/rpg/pack/sunken_barrow.yaml", "utf8"), 1);
    expect(s.mode).toBe("rpg");
    const byLabel = (needle: string): string | undefined =>
      s.view().choices.find((c) => c.label === needle)?.id;
    s.choose(byLabel("go down")!); // barrow_mouth → entry_hall
    s.choose(byLabel("go north")!); // entry_hall → guard_crypt
    const facts = s.view().facts;
    expect(facts).toContain(`blocked: east — ${WIGHT_MSG}`);
  });
});
