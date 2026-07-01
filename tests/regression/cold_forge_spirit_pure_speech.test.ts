/**
 * Regression (§15) for bug_0071 — The Cold Forge's lantern-spirit speaks in clean,
 * pure dialogue, so the engine's `lantern-spirit: "<text>"` wrapper renders without
 * doubled quotes or stage narration mis-attributed as the spirit's own words.
 *
 * A fresh MCP-only blind playtester (seed 23, ai-runs/2026-06-01T18-58-23-751Z,
 * §5 "Minor double narration") saw the greeting render malformed:
 *     lantern-spirit: "The flame leans toward you. "A warm thing…""
 * The four spirit nodes (spirit_root/sentinel/heart/forge) embedded third-person
 * flame-gestures AND literal quote marks INSIDE npc_text. But the parser dialogue
 * path the RPG runner reuses renders every line as `${npc.name}: "${npc_text}"`
 * (src/parser/legal_actions.ts) — the pure-speech convention every other pack follows
 * (sealed_crypt: npc_text is bare spoken words, no quotes). Wrapping prose that
 * already carried quotes/gestures produced nested quotes and stage directions read
 * as speech.
 *
 * Fix is CONTENT-only (no engine/validator/stat/DC/flag/exit/combat/score/ending
 * change): the four npc_text nodes are rewritten as pure spoken words — no `"` chars,
 * no third-person gestures — preserving every clue (the sentinel counsel, the
 * iron-bar/grate route, the relight foreclosure, the +2-warmth framing).
 *
 * Locked here:
 *   (a) EVERY dialogue node's npc_text in cold_forge is quote-free and does not open
 *       with third-person stage narration ("The flame…");
 *   (b) the LIVE rendered line for the greeting and every reachable topic is
 *       well-formed — `lantern-spirit: "<words>"` with exactly the wrapper's two
 *       quote chars and no interior quote;
 *   (c) the substance survives the rewrite (the sentinel/heart/forge clues remain);
 *   (d) the pack still validates green and the buffed route (seed 1) still wins
 *       ending_victory 50/50.
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";
import type { GameEvent } from "../../src/core/events.js";

const loaded = loadRpgPackFile("content/rpg/pack/cold_forge.yaml");
if (!loaded.ok) throw new Error("cold_forge must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

const score = (s: GameState): number => buildRpgObservation(index, s).score;
const options = (s: GameState) => enumerateRpgActions(index, s);

/** Step on the first matching action and return both next state and emitted events. */
function run(
  s: GameState,
  pred: (a: Action) => boolean,
): { state: GameState; events: GameEvent[] } {
  const opt = options(s).find((o) => pred(o.action));
  if (!opt)
    throw new Error(
      `no action; legal=[${options(s)
        .map((o) => o.id)
        .join(", ")}] in ${s.current}`,
    );
  const r = step(s, opt.action);
  expect(r.ok).toBe(true);
  return { state: r.state, events: r.events };
}
function act(s: GameState, pred: (a: Action) => boolean): GameState {
  return run(s, pred).state;
}
const move = (dir: string) => (a: Action) => a.type === "MOVE" && a.direction === dir;
const ask = (topic: string) => (a: Action) =>
  a.type === "ASK" && (a as { topic?: string }).topic === topic;

/** The spirit's spoken lines from a step's events (the `lantern-spirit: "…"` narrations). */
function spokenLines(events: GameEvent[]): string[] {
  return events
    .filter((e): e is GameEvent & { type: "narration"; text: string } => e.type === "narration")
    .map((e) => e.text)
    .filter((t) => t.startsWith("lantern-spirit:"));
}

/** A well-formed wrapped line: `lantern-spirit: "<words>"` with exactly the two wrapper quotes. */
function expectWellFormed(line: string): void {
  const quoteCount = (line.match(/"/g) ?? []).length;
  expect(quoteCount).toBe(2); // only the wrapper's open + close — no interior quote
  expect(line).toMatch(/^lantern-spirit: "/);
  expect(line.trimEnd()).toMatch(/"$/);
  expect(line).not.toMatch(/"The flame/); // stage narration must not sit inside the quotes
}

describe("bug_0071 — the lantern-spirit's npc_text is pure speech (clean wrapped render)", () => {
  it("(a) every cold_forge dialogue node is quote-free and opens with speech, not stage narration", () => {
    const nodes = pack.npcs.flatMap((n) => n.dialogue.nodes);
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      expect(node.npc_text, `${node.id} must carry no literal quote`).not.toContain('"');
      expect(node.npc_text.trimStart(), `${node.id} must not open with "The flame…"`).not.toMatch(
        /^the flame/i,
      );
    }
  });

  it("(b) the live greeting and every topic render as well-formed wrapped speech", () => {
    let s = initStateForRpgPack(index, 23);
    s = act(s, move("down")); // → outer_forge

    // Greeting (spirit_root) on TALK.
    const greet = run(s, (a) => a.type === "TALK");
    const greetLines = spokenLines(greet.events);
    expect(greetLines.length).toBe(1);
    greetLines.forEach(expectWellFormed);
    expect(greetLines[0]).toContain("watched this forge die by inches");
    s = greet.state;

    // Each one-shot info topic, returning to root between them.
    for (const [topic, back] of [
      ["ask_sentinel", "sentinel_back"],
      ["ask_heart", "heart_back"],
      ["ask_forge", "forge_back"],
    ] as const) {
      const told = run(s, ask(topic));
      const lines = spokenLines(told.events);
      expect(lines.length, `${topic} should speak exactly one line`).toBe(1);
      lines.forEach(expectWellFormed);
      s = act(told.state, ask(back));
    }
  });

  it("(c) the rewrite preserves the substantive clues", () => {
    const node = (id: string) =>
      pack.npcs.flatMap((n) => n.dialogue.nodes).find((nd) => nd.id === id)!.npc_text;
    expect(node("spirit_sentinel")).toMatch(/as slow now as it will ever be/);
    expect(node("spirit_sentinel")).toMatch(/rise twice/);
    expect(node("spirit_heart").toLowerCase()).toContain("iron bar");
    expect(node("spirit_heart").toLowerCase()).toContain("slag grate");
    expect(node("spirit_forge")).toMatch(/relight|never/i);
    expect(node("spirit_forge").toLowerCase()).toContain("ember-heart");
  });

  it("(d) pack validates green and the buffed route still wins 50/50", () => {
    expect(validateRpg(pack).findings).toHaveLength(0);

    let s = initStateForRpgPack(index, 1);
    s = act(s, move("down")); // → outer_forge
    s = act(s, (a) => a.type === "TAKE"); // pry-bar
    s = act(s, (a) => a.type === "TALK"); // lantern-spirit
    s = act(s, ask("ask_sentinel")); // +2 attack blessing
    s = act(s, ask("sentinel_back"));
    s = act(s, ask("ask_heart"));
    s = act(s, ask("heart_back"));
    s = act(s, ask("leave_spirit"));
    s = act(s, move("north")); // → bellows_walk
    let guard = 0;
    while (!s.flags["sentinel_stilled"] && !s.ended) {
      s = act(s, (a) => a.type === "ATTACK");
      if (++guard > 20) throw new Error("fight did not resolve");
    }
    expect(s.ended).toBe(false);
    expect(score(s)).toBe(15);
    s = act(s, move("east")); // → forge_heart
    guard = 0;
    while (s.questStage["forge"] !== "grate_open" && !s.ended) {
      s = act(s, (a) => a.type === "USE");
      if (++guard > 40) throw new Error("grate never opened");
    }
    expect(score(s)).toBe(30);
    s = act(s, move("down")); // → ember chamber: win on entry (+20)
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(score(s)).toBe(50);
  });
});
