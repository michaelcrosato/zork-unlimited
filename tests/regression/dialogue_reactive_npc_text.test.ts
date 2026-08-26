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
 *     first contact speaks the full situation, and a substantive reply auto-resumes the root
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
import { nodeText } from "../../src/rpg/model.js";
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

    // First contact: the full situation and remaining-work boundary.
    const talk = run(start, { type: "TALK", npc: "pell" });
    expect(talk.text).toMatch(
      /My broken leg keeps me here[^]*unfinished storm-walk crossing or weir step[^]*missing tools[^]*Completed work stays complete[^]*final course choice remains permanent/i,
    );
    expect(talk.text).not.toMatch(/What else do you need/i);

    // Asking the plan auto-resumes Pell's root in the same accepted decision. The
    // reply narration still belongs to the plan node, while the resulting state
    // exposes the reactive root without a separate filler action.
    const asked = run(talk.state, { type: "ASK", npc: "pell", topic: "ask_weir" });
    expect(asked.text).toMatch(
      /recorded order[^]*FREE jammed head-rack WITH weir-iron[^]*RIG storm-walk WITH life-line[^]*HEAVE seized winch-gate WITH weir-iron[^]*choose SET stone-race course pin or SET field-wash course pin/i,
    );
    expect(asked.text).toMatch(
      /stone-race course pin saves the winter grain but destroys the old works[^]*field-wash course pin saves the works but destroys the grain[^]*final choice is permanent[^]*rack and winch checks are safe to retry/i,
    ); // the plan node fired
    const obs = buildRpgObservation(index, asked.state);
    expect(obs.dialogue?.npc_text).toMatch(
      /What else do you need[^]*Continue only with unfinished weir work/i,
    ); // reactive root
    expect(obs.dialogue?.npc_text).not.toMatch(/My broken leg keeps me here/i);
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
    expect(obs.dialogue?.npc_text).toMatch(
      /What else do you need[^]*Continue only with unfinished weir work/i,
    );
    expect(obs.dialogue?.npc_text).not.toMatch(/My broken leg keeps me here/i);
    expect(enumerateRpgActions(index, asked.state).map((option) => option.id)).not.toContain(
      "ask_walk_back",
    );
  });

  it("the observation's dialogue.npc_text reflects the auto-resumed reactive root", () => {
    let s = initStateForRpgPack(index, 11);
    // Mid-conversation at the root BEFORE any topic: observation shows the full opening.
    s = run(s, { type: "TALK", npc: "pell" }).state;
    expect(buildRpgObservation(index, s).dialogue?.npc_text).toMatch(
      /My broken leg keeps me here[^]*unfinished storm-walk crossing or weir step[^]*missing tools[^]*Completed work stays complete[^]*final course choice remains permanent/i,
    );
    // The reply auto-resumes the root: observation immediately shows the terse variant.
    s = run(s, { type: "ASK", npc: "pell", topic: "ask_weir" }).state;
    const obs = buildRpgObservation(index, s);
    expect(obs.dialogue?.npc_text).toMatch(
      /What else do you need[^]*Continue only with unfinished weir work/i,
    );
    expect(obs.dialogue?.npc_text).not.toMatch(/My broken leg keeps me here/i);
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

describe("additive reactive text composes independent current facts", () => {
  it("appends every matching dialogue fragment in declaration order", () => {
    const clone: RpgPack = structuredClone(pack);
    const root = clone.npcs[0]!.dialogue.nodes.find((node) => node.id === "pell_root")!;
    root.npc_text = "Base terms.";
    root.variants = [{ when: [{ has_flag: "heard_walk" }], text: "Selected terms." }];
    root.append_variants = [
      { when: [{ has_flag: "heard_walk" }], text: "Walk proof." },
      { when: [{ has_flag: "heard_plan" }], text: "Plan proof." },
    ];
    const cloneIndex = indexRpgPack(clone);
    const state = {
      ...initStateForRpgPack(cloneIndex, 11),
      flags: { heard_walk: true, heard_plan: true },
    };
    const cloneRoot = cloneIndex.npcs
      .get("pell")!
      .dialogue.nodes.find((node) => node.id === "pell_root")!;
    // Exercise the same resolver used by both observations and dialogue narration.
    expect(nodeText(cloneRoot, state)).toBe("Selected terms. Walk proof. Plan proof.");
  });

  it("rejects contradictory additive guards without treating lawful overlap as shadowing", () => {
    const clone: RpgPack = structuredClone(pack);
    const root = clone.npcs[0]!.dialogue.nodes.find((node) => node.id === "pell_root")!;
    root.append_variants = [
      { when: [{ has_flag: "heard_walk" }], text: "first" },
      { when: [{ has_flag: "heard_walk" }], text: "lawful overlap" },
    ];
    expect(validateRpg(clone).findings.map((finding) => finding.code)).not.toContain(
      "UNREACHABLE_VARIANT",
    );
    root.append_variants = [
      {
        when: [{ has_flag: "heard_walk" }, { not_flag: "heard_walk" }],
        text: "impossible",
      },
    ];
    expect(validateRpg(clone).findings.map((finding) => finding.code)).toContain(
      "UNSATISFIABLE_CONDITION",
    );
  });
});
