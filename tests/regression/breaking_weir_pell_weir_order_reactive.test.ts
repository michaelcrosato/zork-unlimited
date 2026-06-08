/**
 * Regression (§15) for bug_0319 — pell_weir said "which I've told you of" when
 * heard_walk was not set.
 *
 * When the player asked ask_weir (plan overview) BEFORE ask_walk (storm-walk
 * counsel), the pell_weir speech opened with "Then the storm-walk, which I've told
 * you of" — a false presupposition: heard_walk was not set, so Pell had not told the
 * player anything about the walk yet.
 *
 * Fix: added a `variants` block to pell_weir.
 * - heard_walk NOT set (base npc_text): says "ask me about that before you set foot
 *   on it, for it is the one place out there that kills" — directs the player to the
 *   crucial counsel without asserting it was already given.
 * - heard_walk IS set (variant): preserves the accurate "which I've told you of."
 * Pure prose — no flag, condition, score, exit, or ending changed.
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import type { RpgPack } from "../../src/rpg/schema.js";

const PACK_PATH = "content/rpg/pack/breaking_weir.yaml";
const loaded = loadRpgPackFile(PACK_PATH);
if (!loaded.ok) throw new Error("breaking_weir must compile");
const pack: RpgPack = loaded.compiled.pack;

function getPellNode(nodeId: string) {
  const pell = pack.npcs.find((n) => n.id === "pell");
  expect(pell).toBeDefined();
  const node = pell!.dialogue.nodes.find((n) => n.id === nodeId);
  expect(node).toBeDefined();
  return node!;
}

describe("bug_0319 — pell_weir order-reactive: walk phrase accurate in both orderings", () => {
  it("pell_weir base npc_text no longer presupposes heard_walk (ask_weir first)", () => {
    const node = getPellNode("pell_weir");
    // The old false presupposition must be absent from the base text
    expect(node.npc_text).not.toMatch(/which i'?ve told you of/i);
  });

  it("pell_weir base npc_text directs un-counselled player to ask about the walk", () => {
    const node = getPellNode("pell_weir");
    // The new phrasing redirects the player to seek walk counsel before stepping on it
    expect(node.npc_text).toMatch(/ask me about that/i);
  });

  it("pell_weir has exactly one variant gated on heard_walk", () => {
    const node = getPellNode("pell_weir");
    const variants = node.variants ?? [];
    expect(variants.length).toBe(1);
    const v = variants[0];
    expect(v).toBeDefined();
    // Variant condition is has_flag: heard_walk
    const cond = (v!.when[0] ?? {}) as { has_flag?: string };
    expect(cond.has_flag).toBe("heard_walk");
  });

  it("pell_weir heard_walk variant preserves the accurate back-reference", () => {
    const node = getPellNode("pell_weir");
    const variants = node.variants ?? [];
    const variant = variants[0];
    expect(variant).toBeDefined();
    // When walk counsel was given first, the back-reference is accurate
    expect(variant!.text).toMatch(/which i'?ve told you of/i);
  });

  it("both base and variant still reference the storm-walk and the three obstacles", () => {
    const node = getPellNode("pell_weir");
    const variants = node.variants ?? [];
    const first = variants[0];
    expect(first).toBeDefined();
    expect(node.npc_text).toMatch(/storm-walk/i);
    expect(node.npc_text).toMatch(/head-rack/i);
    expect(node.npc_text).toMatch(/relief-race/i);
    expect(first!.text).toMatch(/storm-walk/i);
    expect(first!.text).toMatch(/head-rack/i);
    expect(first!.text).toMatch(/relief-race/i);
  });

  it("pell_weir effects are unchanged — heard_plan flag and journal still fire", () => {
    const node = getPellNode("pell_weir");
    const setFlag = node.effects.find((e): e is { set_flag: string } => "set_flag" in e);
    expect(setFlag).toBeDefined();
    expect((setFlag as { set_flag: string }).set_flag).toBe("heard_plan");
    const journal = node.effects.find((e) => "add_journal" in e);
    expect(journal).toBeDefined();
  });
});
