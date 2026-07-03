/**
 * Regression (§15) for bug_0206 — the bug_0201 `blocked_exits` hint reaches the
 * human-facing surfaces too. bug_0201 added `blocked_exits` to the structured
 * observation (the agent/MCP surface), closing "a barred way reads as a non-existent
 * one" for the AGENT. But the human renderers ignored the new field:
 *   - bin/rpg_play.ts render() — listed open `Exits:` only;
 *   - ui/src/engine.ts view()  — `facts` carried `exit: …` but no blocked cue.
 * So a human at an RPG blocked exit saw open exits with no hint that a barred way
 * exists and why — the exact friction bug_0201 fixed for the agent. This pins the
 * human surfaces to parity.
 *
 * The fix is render-only and ADDITIVE (no engine/observation/state change): each
 * surface now emits each blocked exit's direction + authored message, never how to
 * clear it (that command stays hidden until legal). The RPG play bin keeps an
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
import { render as renderRpg } from "../../bin/rpg_play.js";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep } from "../../src/core/engine.js";
import { GameSession } from "../../ui/src/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { RpgAction } from "../../src/api/types.js";

// --- RPG pack: Sunken Barrow. guard_crypt's east is barred while the wight stands. ---
const rloaded = loadRpgPackFile("content/rpg/pack/sunken_barrow.yaml");
if (!rloaded.ok) throw new Error("sunken_barrow must compile");
const rindex = indexRpgPack(rloaded.compiled.pack);
const rstep = makeStep(buildRpgRules(rindex));
const WIGHT_MSG = "The barrow-wight bars the way; you cannot pass while it stands.";

function rmove(s: GameState, RpgAction: RpgAction): GameState {
  const r = rstep(s, RpgAction);
  expect(r.ok, `RpgAction ${JSON.stringify(RpgAction)} in ${s.current}`).toBe(true);
  return r.state;
}

describe("bug_0206 — blocked_exits reaches the active human renderers (RPG CLI + UI)", () => {
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

  it("UI view(): non-RPG packs are rejected rather than routed through a hidden renderer", () => {
    expect(() =>
      GameSession.start(readFileSync("content/broken-fixtures/duplicate_id.yaml", "utf8"), 7),
    ).toThrow(/RPG-only/i);
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
