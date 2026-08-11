/**
 * Regression for bug_0447 — Gallowmere's learned hunting tactics must become a
 * player-facing choice at the fight, not only silent stat prep.
 *
 * The seed-7 blind pass won cleanly but found the climax anticlimactic: the game
 * spends multiple beats teaching wind quarter, charge angle, and tusk side, then
 * the sow fight only offered repeated ATTACK. The fix adds a one-shot knife command
 * in `moor_hollow`, gated on the actual prep knowledge, with a small attack payoff
 * and no score change.
 */
import { describe, it, expect } from "vitest";
import { compactRpgObservation } from "../../src/mcp/compact_rpg_observation.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { Rng } from "../../src/core/rng.js";

const loaded = loadRpgSourceFile("content/rpg/quests/gallowmere.yaml");
if (!loaded.ok) throw new Error("gallowmere must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);

const highRng = (): Rng => ({
  next: () => 0.999999,
  int: (_min: number, max: number) => max,
});

const rules = buildRpgRules(index, () => highRng());
const step = makeStep(rules);
const OPENING_ROOM_TEXT =
  "A shallow bowl of black peat and broken reed, ringed by taller hags. It smells of old musk and blood. The Gallowmere sow is here — a great grey animal, heavy across the shoulders, her tusks yellowed and her eyes small and still. The charge angle you read at the kill-site shows you the blind-side opening before the first tusk-swing. The gully is back to the south.";
const OPENING_OBJECT_TEXT =
  "The fighting angle Cradoc's ground described: the sow rolls right as she charges, lifting her left tusk late and showing a narrow blind-side opening to a hunter who has read both ground and wind.";
const SPENT_OPENING_ROOM_TEXT =
  "The Gallowmere hollow, black peat and broken reed churned by the fight. The wounded sow is still on you; the clean first opening has passed into the close exchange of tusk and knife. The gully is back to the south.";
const SPENT_OPENING_OBJECT_TEXT =
  "The first exchange has spent the clean opening. The sow is wounded and still fighting; now her blind side shifts with every tusk-swing instead of holding as a first-cut angle.";
const UNLEARNED_ROOM_TEXT =
  "A shallow bowl of black peat and broken reed, ringed by taller hags. It smells of old musk and blood. The Gallowmere sow is here — a great grey animal, heavy across the shoulders, her tusks yellowed and her eyes small and still. She has seen you come in from the right quarter and she knows it. The gully is back to the south.";
const UNLEARNED_OBJECT_TEXT =
  "The sow must have a blind side, but without the kill-site's charge angle you cannot read it under the rush of tusk and shoulder.";

function actId(s: GameState, id: string): GameState {
  const opt = enumerateRpgActions(index, s).find((o) => o.id === id);
  if (!opt) {
    throw new Error(
      `"${id}" not legal in ${s.current}; legal=[${enumerateRpgActions(index, s)
        .map((o) => `${o.id}:${o.command}`)
        .join(", ")}]`,
    );
  }
  const r = step(s, opt.action);
  expect(r.ok, r.rejectionReason).toBe(true);
  if (!r.ok) throw new Error("unreachable");
  return r.state;
}

function hearSowCounsel(s: GameState): GameState {
  s = actId(s, "talk_hedrick");
  s = actId(s, "ask_ask_sow");
  const ids = enumerateRpgActions(index, s).map((option) => option.id);
  expect(ids).not.toContain("ask_hedrick_sow_back");
  expect(ids).toEqual([
    "ask_ask_father",
    "ask_leave_hedrick",
    "go_east",
    "examine_shepherd_log",
    "read_shepherd_log",
    "examine_hunting_knife",
    "look_around",
    "inventory",
  ]);
  return s;
}

function fullPrepToHollow(): GameState {
  let s = initStateForRpgPack(index, 7);
  s = actId(s, "go_west");
  s = hearSowCounsel(s);
  for (const id of [
    // Reading the log preserves the exchange; the following eastward move closes it.
    "read_shepherd_log",
    "go_east",
    "go_north",
    "go_east",
    "use_hunting_knife_on_spoor_ground",
    "go_west",
    "go_north",
    "use_hunting_knife_on_wind_stone",
    "go_north",
  ]) {
    s = actId(s, id);
  }
  expect(s.current).toBe("moor_hollow");
  expect(s.flags["found_kill"]).toBe(true);
  expect(s.flags["read_wind"]).toBe(true);
  return s;
}

function windOnlyToHollow(): GameState {
  let s = initStateForRpgPack(index, 7);
  s = actId(s, "go_west");
  s = hearSowCounsel(s);
  for (const id of [
    // Leaving by the east exit interrupts the conversation without a filler step.
    "go_east",
    "go_north",
    "go_north",
    "use_hunting_knife_on_wind_stone",
    "go_north",
  ]) {
    s = actId(s, id);
  }
  expect(s.current).toBe("moor_hollow");
  expect(s.flags["found_kill"]).toBeUndefined();
  expect(s.flags["read_wind"]).toBe(true);
  return s;
}

const commands = (s: GameState): string[] => enumerateRpgActions(index, s).map((o) => o.command);
const actionIds = (s: GameState): string[] => enumerateRpgActions(index, s).map((o) => o.id);

function projected(s: GameState) {
  const before = structuredClone(s);
  const beforeBytes = JSON.stringify(s);
  const actions = enumerateRpgActions(index, s);
  const full = buildRpgObservation(index, s);
  const compact = compactRpgObservation(full, actions, { includeActions: true });

  expect(s).toEqual(before);
  expect(JSON.stringify(s)).toBe(beforeBytes);
  expect(full.available_actions.map((action) => action.id)).toEqual(
    actions.map((action) => action.id),
  );
  expect(compact.actions).toEqual(actions.map((action) => action.id));
  return { full, compact, ids: actions.map((action) => action.id) };
}

function examineBlindSide(s: GameState): string {
  const before = structuredClone(s);
  const beforeBytes = JSON.stringify(s);
  const option = enumerateRpgActions(index, s).find(
    (action) => action.id === "examine_sow_blind_side",
  );
  if (!option) throw new Error("blind side must remain examinable");

  const result = step(s, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  expect(s).toEqual(before);
  expect(JSON.stringify(s)).toBe(beforeBytes);
  expect(result.state).toEqual({ ...before, step: before.step + 1 });
  return result.events
    .flatMap((event) => (event.type === "narration" ? [event.text] : []))
    .join("\n");
}

describe("bug_0447 — Gallowmere turns learned charge-angle prep into a fight tactic", () => {
  it("fully prepared hunters see a blind-side command alongside the normal attack", () => {
    const s = fullPrepToHollow();
    expect(commands(s)).toContain("strike the blind side with hunting-knife");
    expect(commands(s)).toContain("attack Gallowmere sow");
    expect(buildRpgObservation(index, s).description).toContain("blind-side opening");
  });

  it("hunters who skipped the kill-site do not get the learned blind-side tactic", () => {
    const s = windOnlyToHollow();
    expect(commands(s)).not.toContain("strike the blind side with hunting-knife");
    expect(actionIds(s)).not.toContain("use_hunting_knife_on_sow_blind_side");
    expect(commands(s)).toContain("attack Gallowmere sow");
  });

  it("spends the clean blind-side opening when an ordinary strike starts the fight", () => {
    const opening = fullPrepToHollow();
    const openingSnapshot = structuredClone(opening);
    const beforeCombat = projected(opening);

    expect(opening.vars["hp"]).toBe(24);
    expect(opening.vars["__enemy_hp_gallowmere_sow"]).toBeUndefined();
    expect(beforeCombat.ids).toEqual(
      expect.arrayContaining([
        "use_hunting_knife_on_sow_blind_side",
        "attack_gallowmere_sow",
        "examine_sow_blind_side",
      ]),
    );
    expect(beforeCombat.full.description).toBe(`${OPENING_ROOM_TEXT}\n`);
    expect(beforeCombat.compact.text).toBe(OPENING_ROOM_TEXT);
    expect(examineBlindSide(opening)).toBe(`${OPENING_OBJECT_TEXT}\n`);

    const fighting = actId(opening, "attack_gallowmere_sow");
    expect(opening).toEqual(openingSnapshot);
    expect(fighting.vars["hp"]).toBe(17);
    expect(fighting.vars["__enemy_hp_gallowmere_sow"]).toBe(5);
    expect(fighting.flags["blind_side_struck"]).toBeUndefined();
    expect(fighting.flags["sow_slain"]).toBeUndefined();

    const afterOrdinaryStrike = projected(fighting);
    expect(afterOrdinaryStrike.ids).not.toContain("use_hunting_knife_on_sow_blind_side");
    expect(afterOrdinaryStrike.ids).toContain("attack_gallowmere_sow");
    expect(afterOrdinaryStrike.ids).toContain("examine_sow_blind_side");
    expect(afterOrdinaryStrike.full.description).toBe(`${SPENT_OPENING_ROOM_TEXT}\n`);
    expect(afterOrdinaryStrike.compact.text).toBe(SPENT_OPENING_ROOM_TEXT);
    expect(examineBlindSide(fighting)).toBe(`${SPENT_OPENING_OBJECT_TEXT}\n`);
  });

  it("does not invent a learned opening after an unprepared ordinary strike", () => {
    const unprepared = windOnlyToHollow();
    const unpreparedSnapshot = structuredClone(unprepared);

    expect(unprepared.vars["hp"]).toBe(24);
    expect(actionIds(unprepared)).not.toContain("use_hunting_knife_on_sow_blind_side");
    const fighting = actId(unprepared, "attack_gallowmere_sow");
    expect(unprepared).toEqual(unpreparedSnapshot);
    expect(fighting.vars["hp"]).toBe(17);
    expect(fighting.vars["__enemy_hp_gallowmere_sow"]).toBe(7);
    expect(fighting.flags["found_kill"]).toBeUndefined();
    expect(fighting.flags["blind_side_struck"]).toBeUndefined();
    expect(fighting.flags["sow_slain"]).toBeUndefined();

    const afterOrdinaryStrike = projected(fighting);
    expect(afterOrdinaryStrike.ids).not.toContain("use_hunting_knife_on_sow_blind_side");
    expect(afterOrdinaryStrike.ids).toContain("attack_gallowmere_sow");
    expect(afterOrdinaryStrike.ids).toContain("examine_sow_blind_side");
    expect(afterOrdinaryStrike.full.description).toBe(`${UNLEARNED_ROOM_TEXT}\n`);
    expect(afterOrdinaryStrike.full.description).not.toContain(SPENT_OPENING_ROOM_TEXT);
    expect(afterOrdinaryStrike.compact.text).toBe(UNLEARNED_ROOM_TEXT);
    expect(examineBlindSide(fighting)).toBe(`${UNLEARNED_OBJECT_TEXT}\n`);
  });

  it("the blind-side strike is one-shot, visible, and score-neutral", () => {
    let s = fullPrepToHollow();
    const beforeAttack = s.vars["attack"] ?? 0;
    const beforeScore = s.vars["score"] ?? 0;
    const opt = enumerateRpgActions(index, s).find(
      (o) => o.id === "use_hunting_knife_on_sow_blind_side",
    );
    expect(opt?.command).toBe("strike the blind side with hunting-knife");

    const r = step(s, opt!.action);
    expect(r.ok, r.rejectionReason).toBe(true);
    s = r.state;

    const narration = r.events
      .filter((e): e is { type: "narration"; text: string } => e.type === "narration")
      .map((e) => e.text)
      .join("\n");
    expect(narration).toContain("the angle Cradoc died leaving for you");
    expect(s.flags["blind_side_struck"]).toBe(true);
    expect(s.vars["attack"]).toBe(beforeAttack + 2);
    expect(s.vars["score"]).toBe(beforeScore);
    expect(actionIds(s)).not.toContain("use_hunting_knife_on_sow_blind_side");
    expect(buildRpgObservation(index, s).description).toContain("first cut found the blind side");
  });

  it("signposts the ridge closure while preserving both post-kill routes", () => {
    let s = fullPrepToHollow();
    s = actId(s, "use_hunting_knife_on_sow_blind_side");
    for (let guard = 0; guard < 20 && !s.flags["sow_slain"]; guard += 1) {
      s = actId(s, "attack_gallowmere_sow");
    }
    expect(s.flags["sow_slain"]).toBe(true);
    const closure = "The hunt closes on the ridge to the north; the gully is back to the south.";
    const full = buildRpgObservation(index, s);
    expect(full.description).toContain(closure);
    expect(actionIds(s)).toEqual(expect.arrayContaining(["go_north", "go_south"]));

    const compact = compactRpgObservation(full, actionIds(s), { includeActions: true });
    expect(compact.text).toContain(closure);
    expect(compact.actions).toEqual(expect.arrayContaining(["go_north", "go_south"]));

    const south = actId(s, "go_south");
    expect(south.current).toBe("moor_gully");
    expect(south.ended).toBe(false);
    expect(south.vars["score"]).toBe(35);

    const north = actId(s, "go_north");
    expect(north.current).toBe("moor_ridge");
    expect(north.ended).toBe(true);
    expect(north.endingId).toBe("ending_hunt_won");
    expect(north.vars["score"]).toBe(50);
  });

  it("still validates green under the RPG validator", () => {
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
