/**
 * Regression (§15) for bug_0023 — reactive OBJECT descriptions on examine.
 *
 * The mandated blind playtest this cycle (clockwork_heist, seed 97,
 * ai-runs/2026-06-01T08-53-07-908Z/playtest.md) came back pristine for the seventh
 * straight cycle (clarity 5/5, all 5 endings, zero concrete defects), so the cycle
 * rotated — per the protocol's "you MAY pick a different candidate if higher value"
 * and the bug_0021 artifact's own deferred note — to the generic engine feature it
 * explicitly punted for "its own cycle": reactive object descriptions.
 *
 * THE GAP: RoomSchema gained reactive `variants` (bug_0010) so a room can narrate
 * state it changed, but the OBJECT examine path (`look at <thing>`) still fell back
 * to the static `description`. So in The Cold Forge, after the slag grate is levered
 * open (quest_stage forge/grate_open) the ROOM reads "stands open" yet examining the
 * grate ITSELF still said "welded shut by cooled slag" — contradicting both the room
 * and the player's own levering action. The bug_0021 artifact logged this verbatim:
 * "reactive OBJECT descriptions ... A generic engine feature for its own cycle."
 *
 * THE FIX (engine, generic, pack-agnostic): ObjectSchema gains optional `variants`
 * (the object analogue of RoomVariantSchema), `.optional()` so variant-less packs
 * compile byte-identically and keep their content hashes. model.objectDescription()
 * mirrors roomDescription() (first matching `when` wins, else base). The single LOOK
 * render site (legal_actions.ts resolveRpgAction LOOK→target) routes through it,
 * so the feature reaches RPG packs. No validator change: object variants carry no effects, so
 * allEffects() — and every reachability/score bound built on it — is unchanged.
 *
 * Locked here:
 *   (1) the generic helper: a variant-less object returns its base description under
 *       arbitrary states (backward-compat); a varianted object returns the first
 *       matching variant's text, else the base (first-match-wins);
 *   (2) schema backward-compat: a variant-less object compiles with `variants`
 *       undefined (so its pack's content hash is unchanged);
 *   (3) live, through the engine render site, on The Cold Forge: examining the slag
 *       grate reads "welded shut" before levering and the open-grate text (no "welded
 *       shut") after grate_open — driven through resolveRpgAction's LOOK, the same
 *       path the MCP server uses;
 *   (4) reachability unchanged: the canonical victory route still reaches
 *       ending_victory at 50/50 (the variant is examine-only; no flag/item/score/exit
 *       or gating changes).
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ObjectSchema } from "../../src/rpg/schema.js";
import { objectDescription } from "../../src/rpg/model.js";
import { resolveRpgAction } from "../../src/rpg/legal_actions.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep } from "../../src/core/engine.js";
import { initState, type GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";

type GameObject = z.infer<typeof ObjectSchema>;

const baseState = (): GameState =>
  initState({ seed: 1, start: "here", varsInit: {}, flagsInit: [] });

describe("bug_0023 — reactive object descriptions (objectDescription)", () => {
  it("a variant-less object returns its base description under any state (backward-compat)", () => {
    const o: GameObject = ObjectSchema.parse({
      id: "rope",
      name: "rope",
      description: "A coil of rope.",
    });
    expect(o.variants).toBeUndefined(); // absent field stays absent ⇒ content hash unchanged
    const s1 = baseState();
    const s2: GameState = { ...baseState(), flags: { open: true }, vars: { ticks: 9 } };
    expect(objectDescription(o, s1)).toBe("A coil of rope.");
    expect(objectDescription(o, s2)).toBe("A coil of rope.");
  });

  it("a varianted object returns the first matching variant's text, else the base", () => {
    const o: GameObject = ObjectSchema.parse({
      id: "box",
      name: "box",
      description: "A locked box.",
      variants: [
        { when: [{ has_flag: "smashed" }], text: "Splinters." }, // higher-priority, listed first
        { when: [{ has_flag: "open" }], text: "An open, empty box." },
      ],
    });
    expect(objectDescription(o, baseState())).toBe("A locked box."); // no flag → base
    expect(objectDescription(o, { ...baseState(), flags: { open: true } })).toBe(
      "An open, empty box.",
    );
    // First-match-wins: when both hold, the earlier-declared variant takes precedence.
    expect(objectDescription(o, { ...baseState(), flags: { open: true, smashed: true } })).toBe(
      "Splinters.",
    );
  });
});

describe("bug_0023 — live on The Cold Forge: the slag grate stops reading 'welded shut' once levered open", () => {
  const loaded = loadRpgSourceFile("content/rpg/pack/cold_forge.yaml");
  if (!loaded.ok) throw new Error("cold_forge must compile");
  const pack = loaded.compiled.pack;
  const index = indexRpgPack(pack);
  const step = makeStep(buildRpgRules(index));
  const options = (s: GameState) => enumerateRpgActions(index, s);

  function act(s: GameState, pred: (a: Action) => boolean): GameState {
    const opt = options(s).find((o) => pred(o.action));
    if (!opt)
      throw new Error(
        `no action; legal=[${options(s)
          .map((o) => o.id)
          .join(", ")}] in ${s.current}`,
      );
    const r = step(s, opt.action);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("step failed");
    return r.state;
  }
  const move = (dir: string) => (a: Action) => a.type === "MOVE" && a.direction === dir;
  const examineGrate: Action = { type: "LOOK", target: "stone_grate" };
  const narration = (s: GameState): string => {
    const res = resolveRpgAction(index, s, examineGrate);
    if (!res) throw new Error("grate not examinable here");
    const eff = res.effects.find((e) => "narrate" in e) as { narrate: string } | undefined;
    return eff?.narrate ?? "";
  };

  it("examining the grate reads 'welded shut' before levering, and the open text after grate_open", () => {
    // Drive the canonical buffed route to the Forge Heart, then lever the grate.
    let s = initStateForRpgPack(index, 1);
    s = act(s, move("down")); // Outer Forge
    s = act(s, (a) => a.type === "TAKE"); // pry-bar
    s = act(s, (a) => a.type === "TALK");
    s = act(s, (a) => a.type === "ASK" && (a as { topic?: string }).topic === "ask_sentinel"); // +2 attack
    s = act(s, (a) => a.type === "ASK" && (a as { topic?: string }).topic === "sentinel_back");
    s = act(s, (a) => a.type === "ASK" && (a as { topic?: string }).topic === "leave_spirit");
    s = act(s, move("north")); // Bellows Walk
    let guard = 0;
    while (!s.flags["sentinel_stilled"] && !s.ended) {
      s = act(s, (a) => a.type === "ATTACK");
      if (++guard > 20) throw new Error("fight did not resolve");
    }
    s = act(s, move("east")); // Forge Heart — the grate is here, still sealed

    // BEFORE: the static base description.
    expect(s.questStage["forge"]).not.toBe("grate_open");
    expect(narration(s)).toContain("welded shut");

    // Lever it open (might check; retry until it gives).
    guard = 0;
    while (s.questStage["forge"] !== "grate_open" && !s.ended) {
      s = act(s, (a) => a.type === "USE");
      if (++guard > 40) throw new Error("grate never opened");
    }
    expect(s.questStage["forge"]).toBe("grate_open");

    // AFTER: the reactive variant — no longer "welded shut", now reads as open.
    const after = narration(s);
    expect(after).not.toContain("welded shut");
    expect(after).toContain("standing open");

    // Reachability unchanged: the win still fires at 50/50.
    s = act(s, move("down")); // Ember Chamber
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(buildRpgObservation(index, s).score).toBe(50);
  });
});
