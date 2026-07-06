/**
 * Regression (§15) for bug_0315 — pell_weir speech had no cross-reference to the flood-book.
 *
 * A player who asked Pell for his plan first received the full three-obstacle briefing
 * verbally but was never told that the same plan was written in the flood-book on the table.
 * The flood-book awards +5 score for reading (the §17 intro clue for this pack); without a
 * nudge in Pell's plan speech, this reward was invisible to players who talked first. The
 * book's read_text already pointed players toward Pell ("DO NOT SET FOOT ON THAT WALK TILL
 * PELL HAS TOLD YOU HOW A MAN CROSSES IT"), so the loop ran only one way: book → Pell, but
 * not Pell → book.
 *
 * Fix: one sentence added to the end of pell_weir npc_text: "I had it all written in the
 * flood-book on the table there — the last entries, the same steps in my own hand — if you
 * want it to go by." Pure prose — no flag, score, condition, gate, or ending changed.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import type { RpgPack } from "../../src/rpg/schema.js";

const PACK_PATH = "content/rpg/pack/breaking_weir.yaml";
const loaded = loadRpgSourceFile(PACK_PATH);
if (!loaded.ok) throw new Error("breaking_weir must compile");
const pack: RpgPack = loaded.compiled.pack;

describe("bug_0315 — The Breaking Weir: pell_weir cross-references the flood-book", () => {
  it("pell_weir node exists and its speech now references the flood-book", () => {
    const pell = pack.npcs.find((n) => n.id === "pell")!;
    expect(pell).toBeDefined();
    const node = pell.dialogue.nodes.find((n) => n.id === "pell_weir")!;
    expect(node).toBeDefined();
    expect(node.npc_text).toMatch(/flood-book/i);
  });

  it("the flood-book cross-reference in pell_weir is framed as a written record", () => {
    const node = pack.npcs
      .find((n) => n.id === "pell")!
      .dialogue.nodes.find((n) => n.id === "pell_weir")!;
    // The fix uses "written…in my own hand" — distinguishes a genuine cross-ref from
    // incidental mention.
    expect(node.npc_text).toMatch(/written|writ|hand/i);
  });

  it("the flood-book read_text still directs players to consult Pell about the walk", () => {
    const book = pack.objects.find((o) => o.id === "flood_book")!;
    expect(book).toBeDefined();
    expect(book.read_text).toMatch(/pell/i);
    expect(book.read_text).toMatch(/walk/i);
  });

  it("the flood-book read interaction still awards exactly +5 score (no regression)", () => {
    const book = pack.objects.find((o) => o.id === "flood_book")!;
    const read = book.interactions.find((it) => it.verb === "READ" && it.target === "flood_book")!;
    expect(read).toBeDefined();
    const scoreEffect = read.effects.find(
      (e): e is { inc_var: { name: string; by: number } } =>
        "inc_var" in e && (e as { inc_var: { name: string } }).inc_var.name === "score",
    );
    expect(scoreEffect).toBeDefined();
    expect((scoreEffect as { inc_var: { name: string; by: number } }).inc_var.by).toBe(5);
  });
});
