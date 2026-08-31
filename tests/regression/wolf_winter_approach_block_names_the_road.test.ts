/**
 * Regression for bug_0592 — The Wolf-Winter: the Steading Yard's blocked north exit must
 * name the approach the player ACTUALLY holds, never claim both roads are selected.
 *
 * The overworld launch imports at most one approach flag (`import:wolf_winter_approach_*`
 * in content/world/new_york_overworld.json map exactly one selected road onto
 * `approach_exposed_ridge` OR `approach_sheltered_stockway`). The north exit at
 * steading_yard is then deliberately locked so the last mile is walked with the flavored
 * DESCEND/FOLLOW action rather than a bare "north" — that gating is correct and this
 * regression does not relax it.
 *
 * What was wrong was the copy. The single `locked_msg` was authored for the malformed
 * both-flags fail-closed case ("You cannot descend while both approach routes are
 * selected") but it is what a normal one-road player was shown, so it named a condition
 * that was never true for them. It was the loudest cluster of the grok-4.6 MCP playtest
 * wave: 63 `bugs[]` rows across 82 completed interviews (intake 33c83cbe8ead954b).
 *
 * This pins:
 *   (1) ONE ROAD, NAMED — with exactly one approach flag the blocked message names that
 *       road and the verb that walks it, and never says "both";
 *   (2) STILL LOCKED — naming the road does not open the exit; north stays blocked so the
 *       last-mile action keeps its cattle-alarm / crosswind consequences;
 *   (3) FAIL-CLOSED PRESERVED — a malformed save carrying BOTH flags still gets the
 *       honest "both approach routes are selected" base text;
 *   (4) DIRECT START UNCHANGED — with neither flag, north is a plain open exit.
 *
 * If a future edit drops the variants, unlocks the exit, or lets the "both" clause reach
 * a one-road player again, a case flips RED.
 */
import { describe, it, expect } from "vitest";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, initStateForRpgPack } from "../../src/rpg/runner.js";
import type { GameState } from "../../src/core/state.js";

const PACK_PATH = "content/rpg/quests/wolf_winter.yaml";

function setup() {
  const loaded = loadRpgSourceFile(PACK_PATH);
  expect(loaded.ok, "wolf_winter must load").toBe(true);
  if (!loaded.ok) throw new Error("unreachable");
  const index = indexRpgPack(loaded.compiled.pack);
  return { pack: loaded.compiled.pack, index };
}

/** Fresh Steading Yard state carrying exactly the given imported approach flags. */
function yardWith(
  index: ReturnType<typeof setup>["index"],
  flags: Readonly<Record<string, boolean>>,
): GameState {
  const base = initStateForRpgPack(index, 11);
  expect(base.current, "the quest must open in the Steading Yard").toBe("steading_yard");
  return { ...base, flags: { ...base.flags, ...flags } };
}

function northBlock(
  index: ReturnType<typeof setup>["index"],
  state: GameState,
): { blocked: string | undefined; open: boolean } {
  const observation = buildRpgObservation(index, state);
  const blocked = observation.blocked_exits?.find((exit) => exit.direction === "north");
  const open = observation.exits.some((exit) => exit.direction === "north");
  return { blocked: blocked?.message, open };
}

describe("bug_0592 — Wolf-Winter: a blocked north names the approach actually selected", () => {
  it("the exposed-ridge player is told to DESCEND the ridge, never that both are selected", () => {
    const { index } = setup();
    const { blocked, open } = northBlock(index, yardWith(index, { approach_exposed_ridge: true }));
    expect(open, "north must stay locked so the last mile keeps its consequences").toBe(false);
    expect(blocked, "a blocked-exit message must be shown").toBeTruthy();
    expect(blocked).toContain("exposed ridge");
    expect(blocked).toMatch(/DESCEND/);
    expect(blocked).not.toMatch(/both/i);
    expect(blocked).not.toMatch(/sheltered stockway/i);
  });

  it("the sheltered-stockway player is told to FOLLOW the stockway, never that both are selected", () => {
    const { index } = setup();
    const { blocked, open } = northBlock(
      index,
      yardWith(index, { approach_sheltered_stockway: true }),
    );
    expect(open, "north must stay locked so the last mile keeps its consequences").toBe(false);
    expect(blocked, "a blocked-exit message must be shown").toBeTruthy();
    expect(blocked).toContain("sheltered stockway");
    expect(blocked).toMatch(/FOLLOW/);
    expect(blocked).not.toMatch(/both/i);
    expect(blocked).not.toMatch(/exposed ridge/i);
  });

  it("the named road matches the one last-mile action that is actually offered", () => {
    const { index } = setup();
    for (const [flag, object, verb] of [
      ["approach_exposed_ridge", "exposed_ridge_last_mile", "descend"],
      ["approach_sheltered_stockway", "sheltered_stockway_last_mile", "follow"],
    ] as const) {
      const state = yardWith(index, { [flag]: true });
      const observation = buildRpgObservation(index, state);
      const offered = observation.available_actions.filter(
        (action) =>
          typeof action.action === "object" &&
          action.action !== null &&
          (action.action as { type?: string; target?: string }).type === "USE" &&
          (action.action as { target?: string }).target === object,
      );
      expect(
        offered.length,
        `${object} must be the offered last mile when ${flag} is the imported road`,
      ).toBe(1);
      expect(offered[0]!.command.toLowerCase()).toContain(verb);
      // The blocked-exit copy must point at that same offered verb.
      const message = northBlock(index, state).blocked ?? "";
      expect(message.toLowerCase()).toContain(verb);
    }
  });

  it("a malformed save carrying BOTH flags still gets the honest fail-closed text", () => {
    const { index } = setup();
    const state = yardWith(index, {
      approach_exposed_ridge: true,
      approach_sheltered_stockway: true,
    });
    const { blocked, open } = northBlock(index, state);
    expect(open, "the both-flags state must fail closed").toBe(false);
    expect(blocked).toContain("both approach routes are selected");
    // Fail-closed means no last mile is walkable either; the base text is then accurate.
    const observation = buildRpgObservation(index, state);
    for (const object of ["exposed_ridge_last_mile", "sheltered_stockway_last_mile"]) {
      expect(
        observation.available_actions.some(
          (action) => (action.action as { target?: string }).target === object,
        ),
        `${object} must not be offered while both route flags are set`,
      ).toBe(false);
    }
  });

  it("the direct start with neither flag keeps north as a plain open exit", () => {
    const { index } = setup();
    const { blocked, open } = northBlock(index, yardWith(index, {}));
    expect(open, "the no-import direct start must still walk north").toBe(true);
    expect(blocked, "an open exit must not carry a blocked message").toBeUndefined();
  });

  it("the variants are authored on the exit itself, so the base text cannot reach one road", () => {
    const { pack } = setup();
    const yard = pack.rooms.find((room) => room.id === "steading_yard");
    expect(yard, "steading_yard must exist").toBeTruthy();
    const north = yard!.exits.find((exit) => exit.direction === "north");
    expect(north, "steading_yard must keep a north exit to the byre-yard").toBeTruthy();
    expect(north!.to).toBe("byre_yard");
    const variants = north!.locked_msg_variants ?? [];
    expect(variants.length, "one variant per single-approach state").toBe(2);
    // Every variant must be guarded on exactly one road being held, so neither can leak
    // into the other road's state or into the both-flags fail-closed state.
    for (const [index_, road, other] of [
      [0, "approach_exposed_ridge", "approach_sheltered_stockway"],
      [1, "approach_sheltered_stockway", "approach_exposed_ridge"],
    ] as const) {
      const when = JSON.stringify(variants[index_]!.when);
      expect(when).toContain(`"has_flag":"${road}"`);
      expect(when).toContain(`"not_flag":"${other}"`);
      expect(variants[index_]!.text).not.toMatch(/both/i);
    }
  });
});
