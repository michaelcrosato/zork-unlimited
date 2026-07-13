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
 *   - BEHAVIOURAL (the real Breaking Weir Pell): driving the actual TALK/ASK engine path,
 *     first contact speaks the full emergency, and a substantive reply auto-resumes the root
 *     whose observation immediately exposes the terse variant without a filler decision;
 *   - VALIDATOR: the dead-reactive-content guards rooms/objects get (UNREACHABLE_VARIANT
 *     shadowing, UNSATISFIABLE_CONDITION) now also cover dialogue node variants, so a silently
 *     dead NPC line is flagged the same way.
 *
 * The metamorphic relabel oracle (rpg_metamorphic_relabel.test.ts) auto-exercises the new
 * relabel path too, since breaking_weir now carries a node with variants whose `when` flags
 * must relabel consistently for the twin's census to match.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  initStateForRpgPack,
  buildRpgRules,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { GameEvent } from "../../src/core/events.js";
import type { RpgPack } from "../../src/rpg/schema.js";
import type { RpgAction } from "../../src/api/types.js";

const PACK_PATH = "content/rpg/quests/breaking_weir.yaml";
const loaded = loadRpgSourceFile(PACK_PATH);
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
  it("speaks the full emergency first, then exposes the terse root immediately after a reply", () => {
    const start = initStateForRpgPack(index, 11);

    // First contact: the full "Thank God someone came" opening.
    const talk = run(start, { type: "TALK", npc: "pell" });
    expect(talk.text).toMatch(/Thank God someone came/);
    expect(talk.text).not.toMatch(/what else, lad/i);

    // Asking the plan auto-resumes Pell's root in the same accepted decision. The
    // reply narration still belongs to the plan node, while the resulting state
    // exposes the reactive root without a separate filler action.
    const asked = run(talk.state, { type: "ASK", npc: "pell", topic: "ask_weir" });
    expect(asked.text).toMatch(/opening the relief-race will not finish it/);
    expect(asked.text).toMatch(/Before that, three things hold this weir/); // the plan node fired
    const obs = buildRpgObservation(index, asked.state);
    expect(obs.dialogue?.npc_text).toMatch(/what else, lad/i); // reactive root
    expect(obs.dialogue?.npc_text).not.toMatch(/Thank God someone came/);
    const ids = enumerateRpgActions(index, asked.state).map((option) => option.id);
    expect(ids).toContain("ask_ask_walk");
    expect(ids).not.toContain("ask_weir_back");
  });

  it("the same terse line shows when the walk topic is what you asked first", () => {
    // Either info topic (heard_walk OR heard_plan) makes the return terse — two variants.
    let s = initStateForRpgPack(index, 11);
    s = run(s, { type: "TALK", npc: "pell" }).state;
    const asked = run(s, { type: "ASK", npc: "pell", topic: "ask_walk" }); // sets heard_walk
    expect(asked.state.flags["heard_walk"]).toBe(true);
    const obs = buildRpgObservation(index, asked.state);
    expect(obs.dialogue?.npc_text).toMatch(/what else, lad/i);
    expect(obs.dialogue?.npc_text).not.toMatch(/Thank God someone came/);
    expect(enumerateRpgActions(index, asked.state).map((option) => option.id)).not.toContain(
      "ask_walk_back",
    );
  });

  it("the observation's dialogue.npc_text reflects the auto-resumed reactive root", () => {
    let s = initStateForRpgPack(index, 11);
    // Mid-conversation at the root BEFORE any topic: observation shows the full opening.
    s = run(s, { type: "TALK", npc: "pell" }).state;
    expect(buildRpgObservation(index, s).dialogue?.npc_text).toMatch(/Thank God someone came/);
    // The reply auto-resumes the root: observation immediately shows the terse variant.
    s = run(s, { type: "ASK", npc: "pell", topic: "ask_weir" }).state;
    const obs = buildRpgObservation(index, s);
    expect(obs.dialogue?.npc_text).toMatch(/what else, lad/i);
    expect(obs.dialogue?.npc_text).not.toMatch(/Thank God someone came/);
    expect(obs.available_actions.map((option) => option.id)).not.toContain("ask_weir_back");
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
