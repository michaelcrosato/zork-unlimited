/**
 * Regression (§15) for bug_0316 — leave_pell dialogue topic prompt implied automatic
 * tool pickup.
 *
 * The `leave_pell` topic in the Keeper's Lodge had prompt "Take up the tools and go to
 * the weir." When rendered in the dialogue action list, "Take up the tools" implied the
 * action would equip the weir-iron and life-line; it only ends the conversation. Found
 * by blind playtest (ai-runs/2026-06-08T11-51-58-454Z/playtest.md), friction point F1.
 *
 * Fix: prompt changed to "Leave old Pell and hold the weir." — mirrors wolf_winter's
 * leave convention ("Leave old Cade and hold the byre."), honest farewell, no implication
 * of item transfer. Pure prose — no flag, score, condition, or route changed.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import type { RpgPack } from "../../src/rpg/schema.js";

const PACK_PATH = "content/rpg/pack/breaking_weir.yaml";
const loaded = loadRpgSourceFile(PACK_PATH);
if (!loaded.ok) throw new Error("breaking_weir must compile");
const pack: RpgPack = loaded.compiled.pack;

function getPellNode(nodeId: string) {
  const pell = pack.npcs.find((n) => n.id === "pell");
  expect(pell).toBeDefined();
  const node = pell!.dialogue.nodes.find((n) => n.id === nodeId);
  expect(node).toBeDefined();
  return node!;
}

describe("bug_0316 — leave_pell prompt does not imply automatic tool pickup", () => {
  it("leave_pell topic exists in pell_root with end:true", () => {
    const root = getPellNode("pell_root");
    const topic = root.topics.find((t) => t.id === "leave_pell");
    expect(topic).toBeDefined();
    expect(topic!.end).toBe(true);
  });

  it("leave_pell prompt no longer contains 'Take up the tools'", () => {
    const root = getPellNode("pell_root");
    const topic = root.topics.find((t) => t.id === "leave_pell")!;
    expect(topic.prompt).not.toMatch(/take up the tools/i);
  });

  it("leave_pell prompt uses the wolf_winter farewell convention", () => {
    const root = getPellNode("pell_root");
    const topic = root.topics.find((t) => t.id === "leave_pell")!;
    expect(topic.prompt).toMatch(/leave old pell/i);
  });

  it("leave_pell prompt still references the weir mission", () => {
    const root = getPellNode("pell_root");
    const topic = root.topics.find((t) => t.id === "leave_pell")!;
    expect(topic.prompt).toMatch(/weir/i);
  });
});
