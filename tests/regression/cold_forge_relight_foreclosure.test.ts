/**
 * Regression (§15) for bug_0059 — The Cold Forge's lantern-spirit now forecloses the
 * "relight the forge" temptation a fresh blind playtester still felt.
 *
 * bug_0029 already killed the sentinel "warm-up clock" over-promise (the cold reads as
 * a settled advantage, not an approaching threat). But a SEPARATE over-promise survived:
 * the whole pack is a *forge* steeped in heat / fire / kindling lore, so a curious player
 * standing in the Outer Forge naturally wonders whether the dead fire can be relit — and
 * no such action exists. A fresh, MCP-only blind playtester (seed 29,
 * ai-runs/2026-06-01T16-34-05-009Z/playtest.md, §4) flagged exactly this as the pack's
 * one friction point: "the lore implies you might be tempted to relight the forge, but no
 * such action exists ... the one spot where flavor hints at depth that isn't there."
 *
 * The fix is CONTENT-only (no engine/validator/stat/DC/exit/combat change): the
 * lantern-spirit gains a THIRD one-shot info topic, `ask_forge` ("Ask whether the dead
 * forge could ever be lit again"), gated on `not_flag heard_forge` exactly like the
 * existing `ask_sentinel` / `ask_heart` topics. Its node `spirit_forge` denies relighting
 * outright and re-points at the real goal (carry the Ember-Heart out — the only fire that
 * leaves the place), sets `heard_forge`, and journals once. It loops back to `spirit_root`
 * whose ungated `leave_spirit` keeps the node terminating (an all-gated escape would trip
 * DIALOGUE_NONTERMINATING, bug_0014). No stat/effect beyond its own retire flag + journal,
 * so the fight, the skill check, and the 50/50 score path are untouched.
 *
 * Locked here:
 *   (a) at the spirit's greeting the new `ask_forge` topic is offered; its prose forecloses
 *       relighting and re-points at the Ember-Heart;
 *   (b) asking it sets `heard_forge` and adds exactly one foreclosure journal line;
 *   (c) it retires after telling — back at the root only `ask_sentinel`/`ask_heart`/
 *       `leave_spirit` remain, and a forced re-ASK is rejected, so it can never re-journal;
 *   (d) the pack still validates green and the canonical buffed route (seed 1) still wins
 *       ending_victory 50/50 even when the new topic is asked en route.
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgPackFile("content/rpg/pack/cold_forge.yaml");
if (!loaded.ok) throw new Error("cold_forge must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

const score = (s: GameState): number => buildParserObservation(index, s).score;
const options = (s: GameState) => enumerateRpgActions(index, s);
const askIds = (s: GameState): string[] =>
  options(s)
    .filter((o) => o.action.type === "ASK")
    .map((o) => (o.action as { topic?: string }).topic ?? "");

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
const ask = (topic: string) => (a: Action) =>
  a.type === "ASK" && (a as { topic?: string }).topic === topic;

const FORECLOSE_RE = /relit|relight|rekindle|cannot be|never|will not/i;
const journalForge = (s: GameState) =>
  s.journal.filter((j) => /forge cannot be relit|not a fire to rekindle/i.test(j));

/** Walk down to the Outer Forge and open the lantern-spirit conversation. */
function talkingSpirit(seed: number): GameState {
  let s = initStateForRpgPack(index, seed);
  s = act(s, move("down")); // → outer_forge
  s = act(s, (a) => a.type === "TALK"); // lantern-spirit
  return s;
}

describe("bug_0059 — the lantern-spirit forecloses the 'relight the forge' temptation", () => {
  it("the new ask_forge topic is offered and its prose denies relighting, re-pointing at the Heart", () => {
    const s = talkingSpirit(1);
    expect(askIds(s)).toContain("ask_forge");
    const node = pack.npcs
      .find((n) => n.id === "lantern_spirit")!
      .dialogue.nodes.find((nd) => nd.id === "spirit_forge")!;
    expect(node.npc_text).toMatch(FORECLOSE_RE);
    expect(node.npc_text.toLowerCase()).toContain("ember-heart");
  });

  it("asking it sets heard_forge and adds exactly one foreclosure journal line", () => {
    let s = talkingSpirit(1);
    expect(s.flags["heard_forge"]).toBeFalsy();
    expect(journalForge(s).length).toBe(0);
    s = act(s, ask("ask_forge"));
    expect(s.flags["heard_forge"]).toBe(true);
    expect(journalForge(s).length).toBe(1);
    expect(new Set(s.journal).size).toBe(s.journal.length); // no dup entries
  });

  it("it retires after telling — root drops it, a forced re-ASK is rejected, no re-journal", () => {
    let s = talkingSpirit(1);
    s = act(s, ask("ask_forge")); // now at spirit_forge
    s = act(s, ask("forge_back")); // back to spirit_root
    // The told topic is gone; the other two info topics + the exit remain.
    expect(askIds(s).sort()).toEqual(["ask_heart", "ask_sentinel", "leave_spirit"]);
    // Forcing the retired topic is rejected (engine re-check) — it can never re-journal.
    const forge: Action = { type: "ASK", npc: "lantern_spirit", topic: "ask_forge" };
    expect(options(s).some((o) => actionEquals(o.action, forge))).toBe(false);
    const r = step(s, forge);
    expect(r.ok).toBe(false);
    expect(journalForge(s).length).toBe(1);
  });

  it("validation + balance intact: pack validates green and the buffed route still wins 50/50 after asking", () => {
    expect(validateRpg(pack).findings).toHaveLength(0);

    let s = initStateForRpgPack(index, 1);
    s = act(s, move("down")); // → outer_forge
    s = act(s, (a) => a.type === "TAKE"); // pry-bar
    s = act(s, (a) => a.type === "TALK"); // lantern-spirit
    s = act(s, ask("ask_sentinel")); // +2 attack blessing
    s = act(s, ask("sentinel_back"));
    s = act(s, ask("ask_forge")); // the new topic, en route
    s = act(s, ask("forge_back"));
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
