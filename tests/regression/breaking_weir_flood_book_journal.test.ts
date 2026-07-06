/**
 * Regression (§15) for bug_0318 — reading the flood-book in The Breaking Weir
 * awarded +5 score silently, with no journal entry, while every other key preparatory
 * action in the pack (rack_freed, walk_crossed, race_open, valley_held, pell_walk,
 * pell_weir) adds a journal entry. The flood-book read was the lone silent milestone —
 * the +5 had no diegetic justification visible to the player.
 *
 * Fix (content, pure data): add_journal added to the flood_book READ interaction's
 * effects, summarising the three obstacles, two tools, and the walk warning. No flag,
 * score, condition, gate, route, or ending changed.
 *
 * Locked here:
 *   (1) the READ interaction carries an add_journal effect with meaningful content
 *       (obstacles, tools, walk warning);
 *   (2) the +5 score effect is still present (non-regression);
 *   (3) the journal entry is absent before reading and present after;
 *   (4) a second read is blocked by the not_flag:read_marks gate (no stacking);
 *   (5) win route (talk Pell → read book → clear rack → cross walk → open race → valley)
 *       still reaches ending_held at 50/50.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";
import type { RpgPack } from "../../src/rpg/schema.js";

const PACK = "content/rpg/quests/breaking_weir.yaml";
const loaded = loadRpgSourceFile(PACK);
if (!loaded.ok) throw new Error("breaking_weir must compile");
const pack: RpgPack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

const score = (s: GameState): number => buildRpgObservation(index, s).score;
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
const isRead = (a: Action) =>
  a.type === "READ" && (a as { target?: string }).target === "flood_book";
const isTalk = (a: Action) => a.type === "TALK";
const isAsk = (topic: string) => (a: Action) =>
  a.type === "ASK" && (a as { topic?: string }).topic === topic;
const isUse = (a: Action) => a.type === "USE";

const JOURNAL_RE = /flood.marks|three obstacles/i;
const bookEntries = (s: GameState) => s.journal.filter((j) => JOURNAL_RE.test(j));

describe("bug_0318 — reading the flood-book adds a journal entry (was silent)", () => {
  it("(1) the READ interaction has an add_journal effect with key content", () => {
    const book = pack.objects.find((o) => o.id === "flood_book")!;
    const read = book.interactions.find((it) => it.verb === "READ" && it.target === "flood_book")!;
    expect(read, "flood_book must have a READ interaction").toBeDefined();
    const journalEffect = read.effects.find(
      (e): e is { add_journal: string } => "add_journal" in e,
    );
    expect(journalEffect, "READ interaction must have an add_journal effect").toBeDefined();
    // Journal entry references the three obstacles and the walk warning.
    expect(journalEffect!.add_journal).toMatch(/head-rack/i);
    expect(journalEffect!.add_journal).toMatch(/storm-walk/i);
    expect(journalEffect!.add_journal).toMatch(/relief-race/i);
    expect(journalEffect!.add_journal).toMatch(/warning|kills|lives/i);
  });

  it("(2) the +5 score effect is still present (non-regression from bug_0315 check)", () => {
    const book = pack.objects.find((o) => o.id === "flood_book")!;
    const read = book.interactions.find((it) => it.verb === "READ" && it.target === "flood_book")!;
    const scoreEffect = read.effects.find(
      (e): e is { inc_var: { name: string; by: number } } =>
        "inc_var" in e && (e as { inc_var: { name: string } }).inc_var.name === "score",
    );
    expect(scoreEffect).toBeDefined();
    expect(scoreEffect!.inc_var.by).toBe(5);
  });

  it("(3) journal entry absent before reading, present after", () => {
    const s0 = initStateForRpgPack(index, 1);
    expect(bookEntries(s0).length).toBe(0);
    const s1 = act(s0, isRead);
    expect(s1.flags["read_marks"]).toBe(true);
    expect(bookEntries(s1).length).toBe(1);
  });

  it("(4) second read is blocked — entry does not stack", () => {
    let s = initStateForRpgPack(index, 1);
    s = act(s, isRead);
    expect(bookEntries(s).length).toBe(1);
    // READ should no longer be in the legal set (gated by not_flag: read_marks).
    expect(options(s).some((o) => isRead(o.action))).toBe(false);
    // Forced re-step is rejected.
    const readAction: Action = { type: "READ", target: "flood_book" };
    const r = step(s, readAction);
    expect(r.ok).toBe(false);
    expect(bookEntries(s).length).toBe(1);
  });

  it("(5) win route: talk Pell → read book → clear rack → cross walk → open race → valley = ending_held 50/50", () => {
    let s = initStateForRpgPack(index, 7); // seed 7: canonical blind-playtest seed
    // Heed Pell on the walk (+5 nerve → nerve 8).
    s = act(s, isTalk);
    s = act(s, isAsk("ask_walk"));
    s = act(s, isAsk("walk_back"));
    s = act(s, isAsk("leave_pell")); // exit dialogue before interacting with objects
    // Read flood-book (+5 score).
    s = act(s, isRead);
    expect(score(s)).toBe(5);
    expect(bookEntries(s).length).toBe(1);
    // Take both tools (needed for rack, walk, and winch).
    s = act(s, (a) => a.type === "TAKE" && (a as { item?: string }).item === "weir_iron");
    s = act(s, (a) => a.type === "TAKE" && (a as { item?: string }).item === "life_line");
    // Clear head-rack (craft check, retryable).
    s = act(s, move("north"));
    let guard = 0;
    while (!s.flags["rack_freed"] && !s.ended) {
      s = act(s, isUse);
      if (++guard > 40) throw new Error("rack never freed");
    }
    expect(score(s)).toBe(15);
    // Cross storm-walk (nerve 8, DC 9 — safe on worst roll per bug_0196).
    s = act(s, move("north"));
    s = act(s, isUse);
    expect(s.flags["walk_crossed"]).toBe(true);
    expect(score(s)).toBe(25);
    // Open relief-race (might check, retryable).
    s = act(s, move("north"));
    guard = 0;
    while (!s.flags["race_open"] && !s.ended) {
      s = act(s, isUse);
      if (++guard > 40) throw new Error("race never opened");
    }
    expect(score(s)).toBe(35);
    // Reach valley — win.
    s = act(s, move("north"));
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_held");
    expect(score(s)).toBe(50);
  });
});
