/**
 * Regression (§15) for bug_0246 — reactive NPC dialogue text (the §7.3 reactive-text
 * convention brought to dialogue node lines, the third member of the room/object variant
 * family). A blind playtester on The Breaking Weir (seed 11,
 * ai-runs/2026-06-04T18-48-55-835Z/playtest.md §4) found old Pell re-delivered his whole
 * first-meeting emergency ("Thank God someone came…") EVERY time the player returned to his
 * topic menu after asking something — "reads slightly robotic." A DialogueNode now carries
 * the same optional `variants` rooms and objects already have (first-match-wins `when` →
 * `text`, resolved by model.ts `nodeText`): an NPC can react to state it/the player changed
 * without re-introducing the whole situation. Only the spoken TEXT varies — the node's
 * topics/effects (hence dialogue termination & reachability) are untouched — so it is a pure
 * prose layer over the same tree.
 *
 * Locked on BOTH the engine surface and the real pack:
 *   - BEHAVIOURAL (the real Breaking Weir pell): driving the actual TALK/ASK engine path,
 *     first contact speaks the full emergency, and returning to the menu after a topic speaks
 *     the terse variant — and the observation's `dialogue.npc_text` agrees with the narration;
 *   - VALIDATOR: the dead-reactive-content guards rooms/objects get (UNREACHABLE_VARIANT
 *     shadowing, UNSATISFIABLE_CONDITION) now also cover dialogue node variants, so a silently
 *     dead NPC line is flagged the same way.
 *
 * The metamorphic relabel oracle (rpg_metamorphic_relabel.test.ts) auto-exercises the new
 * relabel path too, since breaking_weir now carries a node with variants whose `when` flags
 * must relabel consistently for the twin's census to match.
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { indexRpgPack, initStateForRpgPack, buildRpgRules } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { GameEvent } from "../../src/core/events.js";
import type { RpgPack } from "../../src/rpg/schema.js";
import type { RpgAction } from "../../src/api/types.js";

const PACK_PATH = "content/rpg/pack/breaking_weir.yaml";
const loaded = loadRpgPackFile(PACK_PATH);
if (!loaded.ok) throw new Error("breaking_weir must compile");
const pack: RpgPack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

/** The narration text emitted by a step (the NPC line we render). */
function narration(events: GameEvent[]): string {
  return events
    .filter((e): e is GameEvent & { type: "narration"; text: string } => e.type === "narration")
    .map((e) => e.text)
    .join(" ");
}

function run(state: GameState, RpgAction: RpgAction): { state: GameState; text: string } {
  const res = step(state, RpgAction);
  expect(res.ok).toBe(true);
  return { state: res.state, text: narration(res.events) };
}

describe("bug_0246 — reactive NPC dialogue text on The Breaking Weir's Pell", () => {
  it("speaks the full emergency on first contact, the terse line on return to the menu", () => {
    const start = initStateForRpgPack(index, 11);

    // First contact: the full "Thank God someone came" opening.
    const talk = run(start, { type: "TALK", npc: "pell" });
    expect(talk.text).toMatch(/Thank God someone came/);
    expect(talk.text).not.toMatch(/what else, lad/i);

    // Ask the plan, then come back to the menu — Pell should NOT re-introduce the
    // whole emergency now that he has told you something.
    const asked = run(talk.state, { type: "ASK", npc: "pell", topic: "ask_weir" });
    expect(asked.text).toMatch(/Three things hold this weir/); // the plan node fired
    const back = run(asked.state, { type: "ASK", npc: "pell", topic: "weir_back" });
    expect(back.text).toMatch(/what else, lad/i); // the reactive return greeting
    expect(back.text).not.toMatch(/Thank God someone came/); // not the first-contact opening
  });

  it("the same terse line shows when the walk topic is what you asked first", () => {
    // Either info topic (heard_walk OR heard_plan) makes the return terse — two variants.
    let s = initStateForRpgPack(index, 11);
    s = run(s, { type: "TALK", npc: "pell" }).state;
    s = run(s, { type: "ASK", npc: "pell", topic: "ask_walk" }).state; // sets heard_walk
    const back = run(s, { type: "ASK", npc: "pell", topic: "walk_back" });
    expect(back.text).toMatch(/what else, lad/i);
    expect(back.text).not.toMatch(/Thank God someone came/);
  });

  it("the observation's dialogue.npc_text agrees with the rendered line", () => {
    let s = initStateForRpgPack(index, 11);
    // Mid-conversation at the root BEFORE any topic: observation shows the full opening.
    s = run(s, { type: "TALK", npc: "pell" }).state;
    expect(buildRpgObservation(index, s).dialogue?.npc_text).toMatch(/Thank God someone came/);
    // After a topic and back to root: observation shows the terse variant, matching narration.
    s = run(s, { type: "ASK", npc: "pell", topic: "ask_weir" }).state;
    s = run(s, { type: "ASK", npc: "pell", topic: "weir_back" }).state;
    const obs = buildRpgObservation(index, s);
    expect(obs.dialogue?.npc_text).toMatch(/what else, lad/i);
    expect(obs.dialogue?.npc_text).not.toMatch(/Thank God someone came/);
  });
});

/** Deep-clone the real pack and rewrite Pell's root-node variants for a validator probe. */
function packWithRootVariants(
  variants: { when: import("../../src/core/conditions.js").Condition[]; text: string }[],
): RpgPack {
  const clone: RpgPack = structuredClone(pack);
  const root = clone.npcs[0]!.dialogue.nodes.find((n) => n.id === "pell_root")!;
  root.variants = variants;
  return clone;
}

describe("bug_0246 — dead-reactive-content guards cover dialogue node variants", () => {
  it("the unmodified pack validates clean (the shipped reactive greeting is live)", () => {
    expect(validateRpg(pack).findings.filter((f) => f.severity === "error")).toEqual([]);
  });

  it("flags a SHADOWED dialogue variant (a later one a sibling always pre-empts)", () => {
    const bad = packWithRootVariants([
      { when: [{ has_flag: "heard_walk" }], text: "first" },
      { when: [{ has_flag: "heard_walk" }], text: "shadowed — never the first match" },
    ]);
    const codes = validateRpg(bad).findings.map((f) => f.code);
    expect(codes).toContain("UNREACHABLE_VARIANT");
  });

  it("flags an UNSATISFIABLE dialogue variant `when` (a flag pinned true and false)", () => {
    const bad = packWithRootVariants([
      { when: [{ has_flag: "heard_walk" }, { not_flag: "heard_walk" }], text: "dead — can't hold" },
    ]);
    const codes = validateRpg(bad).findings.map((f) => f.code);
    expect(codes).toContain("UNSATISFIABLE_CONDITION");
  });
});
