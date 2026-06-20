/**
 * Regression (§15) for bug_0245 — the `heft turnkey's key-ring` beat read as vestigial.
 *
 * A blind MCP playtest of The Friars' Postern (ai-runs/2026-06-04T18-34-59-982Z,
 * seed 13) flagged the same friction point seen on sealed_crypt (bug_0241) and noted
 * for alchemists_tower: once the player holds the turnkey's key-ring, the self-targeted
 * USE action surfaces as the bare command "heft turnkey's key-ring" (id `use_gate_key`,
 * USE gate_key on gate_key). It is in fact the deliberate, OFF-critical-path nerve
 * skill-check beat, but nothing told the player that BEFORE they triggered it — the
 * playtester "never saw it produce output worth examining — likely just a flavor/no-op
 * verb. Minor noise in the action list."
 *
 * The controlled parser only accepts `<verb> <noun>` (or `<verb> <noun> <prep>
 * <noun>`), so the offered self-USE command must stay typeable as "heft turnkey's
 * key-ring" — a sentence-like label can be legible OR typeable, not both. The root
 * cause is therefore MISSING PRE-COMMITMENT CONTEXT, not the label. Fix (content only):
 * the key-ring's examine description now names the impulse to heft the ring and steady
 * yourself before you trust it with anything, so `heft turnkey's key-ring` reads as an
 * intentional, clued tension moment that the prose already primed.
 *
 * This pins: (1) examining the held key-ring telegraphs the heft/steady-yourself beat
 * (and keeps the "let a debtor out" lock-fitting line); (2) the telegraph matches a real
 * offered action — `heft turnkey's key-ring` is still there; (3) the change is purely
 * cosmetic — the heft beat still gates nothing, and the full intended route still wins
 * ending_free at 35/35 even after the beat is exercised mid-run.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions, resolveParserAction } from "../../src/parser/legal_actions.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadParserPackFile("content/parser/pack/friars_postern.yaml");
if (!loaded.ok) throw new Error("friars_postern must compile");
const index = indexParserPack(loaded.compiled.pack);
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

// Reach the Turnkey's Lodge and pocket the key-ring (the first state in which the
// player holds it and the `heft turnkey's key-ring` action becomes available).
const TO_KEY_RING = ["go_north", "go_east", "take_gate_key"];

describe("bug_0245 — the key-ring's examine text telegraphs the optional heft/nerve beat", () => {
  it("examining the held key-ring names the heft/steady-yourself impulse the `heft` action acts on", () => {
    const s = play(initStateForParserPack(index, 13), TO_KEY_RING);
    expect(s.inventory).toContain("gate_key");
    const text = examine(s, "gate_key");
    // The telegraph: it primes the optional steadying beat in plain prose.
    expect(text).toContain("heft the ring");
    expect(text).toContain("steady yourself");
    // It is still the same key-ring — the "none let a debtor out" line is intact.
    expect(text).toContain("let a debtor out");
  });

  it("the telegraph matches a real action: `heft turnkey's key-ring` (the self-USE) is offered", () => {
    const s = play(initStateForParserPack(index, 13), TO_KEY_RING);
    const heft = enumerateActions(index, s).find(
      (a) =>
        a.action.type === "USE" && a.action.item === "gate_key" && a.action.target === "gate_key",
    );
    expect(heft).toBeDefined();
    expect(heft!.id).toBe("use_gate_key");
    expect(heft!.command).toBe("heft turnkey's key-ring");
  });

  it("the change is cosmetic — the heft beat gates nothing and the intended route still wins 35/35", () => {
    // Deliberately exercise the heft beat mid-run (with the key in hand), then finish
    // the canonical conversation win. The beat must not consume the key or block the route.
    const s = play(initStateForParserPack(index, 13), [
      "read_wall_scratches", // +5, the §17 clue
      "go_north", // gallery
      "go_east", // lodge
      "take_clay_pipe",
      "take_gate_key",
      "use_gate_key", // the optional nerve beat — must not consume the key or block the route
      "go_west", // gallery
      "go_west", // commons
      "talk_old_debtor",
      "ask_escape", // +10, heard_postern
      "ask_give_pipe", // +20, knows_postern
      "ask_bye",
      "go_east", // gallery
      "go_up", // chapel
      "use_font", // press the third stone
      "go_north", // through the postern -> win
    ]);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_free");
    expect(s.vars["score"]).toBe(35);
    // The key-ring was never consumed by the beat — it is still carried at the win.
    expect(s.inventory).toContain("gate_key");
  });
});
