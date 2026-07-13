/**
 * Regression (§15) for bug_0264 — reactive NPC hub line on The Dawn Beacon's old
 * watchman (a CONTENT application of the bug_0246 engine feature, found by this
 * cycle's mandated blind pass).
 *
 * The blind playtest of The Dawn Beacon (rpg, seeds 7 + 19 —
 * ai-runs/2026-06-05T01-15-25-287Z/playtest.md §4) returned clarity 5/5, enjoyment
 * 4/5, mechanics flawless (a WON 50/50 prepared run and a 45/50 rash run, both
 * reaching ending_lit with zero rejected actions, zero loops, no stale text, NO true
 * bug). Its one concrete friction finding: the watchman's `watch_root` topic hub
 * "re-prints the same hub intro line ('You came up the yard — good lad…') after every
 * sub-answer, which reads slightly repetitively across three asks." This is exactly
 * the Breaking-Weir Pell finding bug_0246 introduced the reactive-dialogue feature to
 * cure — but dawn_beacon's watchman pre-dated that feature and never adopted it.
 *
 * Fix (content only, no engine change): `watch_root` gains two reactive `variants`
 * (the OR over the two retiring flags, the breaking_weir keeper pattern) — when the
 * player has heard the fight counsel (`heard_counsel`) OR the beacon briefing
 * (`heard_beacon`), the return greeting drops to a terse "Aye, lad — what else?…"
 * instead of re-delivering the full opening. First contact (neither flag) still speaks
 * the whole emergency. Only the spoken TEXT varies; the node's topics/effects — hence
 * dialogue termination & reachability, and the one-shot `heard_counsel` +2-attack
 * counsel — are untouched, so combat_guaranteed and the score economy are unchanged.
 *
 * Locked here on the REAL pack, driving the actual TALK/ASK engine path:
 *   (1) first contact speaks the full "You came up the yard" opening, not the terse line;
 *   (2) ask the fight counsel → the same accepted decision auto-resumes the root, whose
 *       observation exposes the terse "what else" greeting and no filler action;
 *   (3) the same immediate reactive root when the BEACON topic is asked first (the
 *       heard_beacon variant — both OR-entries are live);
 *   (4) the observation's dialogue.npc_text reflects the auto-resumed root state.
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

const PACK_PATH = "content/rpg/quests/dawn_beacon.yaml";
const loaded = loadRpgSourceFile(PACK_PATH);
if (!loaded.ok) throw new Error("dawn_beacon must compile");
const pack: RpgPack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

const FULL_OPENING = /You came up the yard/;
const TERSE_RETURN = /what else/i;

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

/** Walk from the muster yard to the lower ward, where the watchman stands. */
function atWatchman(seed: number): GameState {
  const start = initStateForRpgPack(index, seed);
  return run(start, { type: "MOVE", direction: "north" }).state;
}

describe("bug_0264 — reactive NPC hub line on The Dawn Beacon's watchman", () => {
  it("speaks the full opening first, then exposes the terse root after the fight counsel", () => {
    const ward = atWatchman(7);

    // First contact: the whole "You came up the yard — good lad" emergency.
    const talk = run(ward, { type: "TALK", npc: "watchman" });
    expect(talk.text).toMatch(FULL_OPENING);
    expect(talk.text).not.toMatch(TERSE_RETURN);

    // The reply auto-resumes the reactive root in this same decision.
    const asked = run(talk.state, { type: "ASK", npc: "watchman", topic: "ask_fight" });
    expect(asked.text).toMatch(/drillmaster's word/); // the counsel node fired
    expect(asked.state.flags["heard_counsel"]).toBeTruthy();
    const obs = buildRpgObservation(index, asked.state);
    expect(obs.dialogue?.npc_text).toMatch(TERSE_RETURN);
    expect(obs.dialogue?.npc_text).not.toMatch(FULL_OPENING);
    const ids = enumerateRpgActions(index, asked.state).map((option) => option.id);
    expect(ids).toContain("ask_ask_beacon");
    expect(ids).not.toContain("ask_fight_back");
  });

  it("the same terse root shows when the BEACON topic is asked first (the other OR-variant)", () => {
    let s = atWatchman(7);
    s = run(s, { type: "TALK", npc: "watchman" }).state;
    const asked = run(s, { type: "ASK", npc: "watchman", topic: "ask_beacon" });
    expect(asked.state.flags["heard_beacon"]).toBe(true);
    const obs = buildRpgObservation(index, asked.state);
    expect(obs.dialogue?.npc_text).toMatch(TERSE_RETURN);
    expect(obs.dialogue?.npc_text).not.toMatch(FULL_OPENING);
    expect(enumerateRpgActions(index, asked.state).map((option) => option.id)).not.toContain(
      "ask_beacon_back",
    );
  });

  it("the observation's dialogue.npc_text reflects the auto-resumed reactive root", () => {
    let s = atWatchman(7);
    // Mid-conversation at the root BEFORE any topic: observation shows the full opening.
    s = run(s, { type: "TALK", npc: "watchman" }).state;
    expect(buildRpgObservation(index, s).dialogue?.npc_text).toMatch(FULL_OPENING);
    // The reply auto-resumes the root: observation immediately shows the terse variant.
    s = run(s, { type: "ASK", npc: "watchman", topic: "ask_fight" }).state;
    const obs = buildRpgObservation(index, s);
    expect(obs.dialogue?.npc_text).toMatch(TERSE_RETURN);
    expect(obs.dialogue?.npc_text).not.toMatch(FULL_OPENING);
    expect(obs.available_actions.map((option) => option.id)).not.toContain("ask_fight_back");
  });

  it("the shipped pack validates error-free (the two reactive greetings are both live)", () => {
    expect(validateRpg(pack).findings.filter((f) => f.severity === "error")).toEqual([]);
  });
});
