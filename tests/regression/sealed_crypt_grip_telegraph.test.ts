/**
 * Regression (§15) for bug_0241 — the `grip iron key` beat read as vestigial.
 *
 * A blind MCP playtest of The Sealed Crypt (ai-runs/2026-06-04T16-53-45-442Z,
 * seed 11) re-flagged a friction point seen across several prior blind passes: once
 * the player holds the iron key, the self-targeted USE action surfaces as the bare
 * command "grip iron key" (id `use_iron_key`, USE iron_key on iron_key). It is in
 * fact the deliberate, off-critical-path nerve skill-check beat, but nothing told
 * the player that BEFORE they triggered it — "gripping a key" accomplished nothing
 * obvious, so it "looked like it might do something" / read as an authoring leftover.
 *
 * The controlled parser only accepts `<verb> <noun>` (or `<verb> <noun> <prep>
 * <noun>`), so the offered self-USE command must stay typeable as "grip iron key" —
 * a sentence-like label can be legible OR typeable, not both. The root cause is
 * therefore MISSING PRE-COMMITMENT CONTEXT, not the label. Fix (content only): the
 * iron key's examine description now names the impulse to steady your hand before
 * you turn the key on anything, so `grip iron key` reads as an intentional, clued
 * tension moment that the prose already primed.
 *
 * This pins: (1) examining the held iron key telegraphs the steady-your-hand beat;
 * (2) the telegraph matches a real offered action — `grip iron key` is still there;
 * (3) the change is purely cosmetic — the grip beat still gates nothing, and the
 * full intended route still wins ending_victory at 35/35.
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

/** The narration the explicit `look at <target>` action emits in this state. */
function examine(s: GameState, target: string): string {
  const res = resolveParserAction(index, s, { type: "LOOK", target });
  const eff = res?.effects[0];
  if (!eff || !("narrate" in eff)) throw new Error("LOOK produced no narration");
  return eff.narrate;
}

// Reach the Bottom of the Well and pocket the iron key (the first state in which
// the player holds it and the `grip iron key` action becomes available).
const TO_IRON_KEY = [
  "go_north",
  "go_up",
  "take_rope",
  "go_down",
  "go_west",
  "read_headstone",
  "go_north",
  "open_stone_coffer",
  "take_brass_key",
  "go_south",
  "go_east",
  "go_east",
  "use_rope_on_old_well",
  "go_down",
  "unlock_oak_chest",
  "open_oak_chest",
  "take_iron_key",
];

describe("bug_0241 — the iron key's examine text telegraphs the optional grip/nerve beat", () => {
  it("examining the held iron key names the steady-your-hand impulse the `grip` action acts on", () => {
    const s = play(initStateForParserPack(index, 11), TO_IRON_KEY);
    expect(s.inventory).toContain("iron_key");
    const text = examine(s, "iron_key");
    // The telegraph: it primes the optional steadying beat in plain prose.
    expect(text).toContain("steady your hand");
    expect(text).toContain("grip it");
    // It is still the same iron key — the lock-fitting line is intact.
    expect(text).toContain("great iron lock");
  });

  it("the telegraph matches a real action: `grip iron key` (the self-USE) is offered in the crypt", () => {
    // bug_0258 relocates the beat: it is now offered only where the three iron locks
    // stand (the crypt), not the moment the key is pocketed at the well. Walk down to
    // the crypt, then assert the self-USE surfaces with its `grip iron key` command.
    const s = play(initStateForParserPack(index, 11), [
      ...TO_IRON_KEY,
      "go_up",
      "go_west",
      "go_north",
      "go_down",
    ]);
    expect(s.current).toBe("crypt");
    const grip = enumerateActions(index, s).find(
      (a) =>
        a.action.type === "USE" && a.action.item === "iron_key" && a.action.target === "iron_key",
    );
    expect(grip).toBeDefined();
    expect(grip!.id).toBe("use_iron_key");
    expect(grip!.command).toBe("grip iron key");
  });

  it("the change is cosmetic — the grip beat gates nothing and the intended route still wins 35/35", () => {
    // Deliberately exercise the grip beat in the crypt (bug_0258), then finish the win.
    const s = play(initStateForParserPack(index, 11), [
      ...TO_IRON_KEY,
      "go_up",
      "go_west",
      "go_north",
      "go_down",
      "use_iron_key", // the optional nerve beat — must not consume the key or block the route
      "unlock_crypt_gate",
      "go_north",
    ]);
    // The key was never consumed by the beat — it opened the gate.
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(s.vars["score"]).toBe(35);
  });
});
