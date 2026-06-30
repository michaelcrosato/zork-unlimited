/**
 * Regression (§15) for bug_0258 — The Wolf-Winter: the optional "wedge the paling-rail"
 * skill check must be DISCOVERABLE to a blind player, not just legible once performed.
 *
 * This is the sequential sibling of bug_0256. bug_0256 made the wedge's payoff LEGIBLE
 * AFTER you do it (reactive prose on the room + rail once `breach_braced`). But a
 * 2026-06-05 blind playtest (seed 11, ai-runs/2026-06-05T05-48-14-545Z/playtest.md)
 * showed a fresh player never DISCOVERS the wedge at all: the USE/wedge RpgAction only
 * surfaces once the rail is IN HAND, so a player whose instinct is to fight the obvious
 * wolf threat never takes the rail, and reads it as a vestigial dead clue ("no USE/wedge
 * RpgAction anywhere"). The pack's ONLY skill_check — and all the bug_0256 prose built for
 * it — was effectively dead content.
 *
 * The fix is a content-only SIGNPOST in old Cade's "how the byre is held" counsel
 * (cade_byre), the natural in-fiction info path the player walks BEFORE the paling: he now
 * names the fallen rail and the take-then-wedge, and the heard_plan journal note records it
 * as a persistent reminder. It also makes the paling_gap reactive line "the way old Cade
 * swore the byre would funnel them" literally true (he now does swear it).
 *
 * This pins:
 *   (1) SIGNPOST — Cade's byre counsel names the rail + the wedge + the half-shut-breach
 *       payoff (in both the spoken npc_text surfaced by the runner AND the persisted
 *       journal note), so the affordance is discoverable on the natural path;
 *   (2) DISCOVERABILITY of the mechanic the signpost points at — at the paling, taking the
 *       rail surfaces the wedge USE RpgAction (a USE on paling_rail with command_verb "wedge"),
 *       proving the signposted RpgAction genuinely exists and is reachable;
 *   (3) PROSE-ONLY — the signpost adds no mechanical effect: cade_byre's effects are still
 *       exactly {set_flag heard_plan, add_journal}, and the wedge skill_check still gates
 *       nothing (no exit/win/ending turns on breach_braced — it stays an optional aid).
 *
 * If a future edit drops the signpost, re-gates the wedge behind nothing reachable, or
 * lets an exit/win depend on breach_braced (making the optional aid a gate), a case flips RED.
 */
import { describe, it, expect } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";
import type { Rng } from "../../src/core/rng.js";

const PACK_PATH = "content/rpg/pack/wolf_winter.yaml";

const fixedRng = (): Rng => ({
  next: () => 0,
  int: (min: number) => Math.ceil(min),
});

function setup() {
  const loaded = loadRpgPackFile(PACK_PATH);
  expect(loaded.ok, "wolf_winter must load").toBe(true);
  if (!loaded.ok) throw new Error("unreachable");
  const index = indexRpgPack(loaded.compiled.pack);
  const rules = buildRpgRules(index, fixedRng);
  const step = makeStep(rules);
  return { pack: loaded.compiled.pack, index, rules, step };
}

/** Step the one legal RpgAction matching `want` (type + given fields); assert it exists. */
function driver(rules: ReturnType<typeof setup>["rules"], step: ReturnType<typeof setup>["step"]) {
  let state: GameState = null as unknown as GameState;
  return {
    start(index: ReturnType<typeof setup>["index"]) {
      state = initStateForRpgPack(index, 11);
      return this;
    },
    legal: (): RpgAction[] => rules.legalActions(state) as RpgAction[],
    state: () => state,
    act(want: Partial<RpgAction> & { type: RpgAction["type"] }) {
      const legal = rules.legalActions(state) as RpgAction[];
      const match = legal.find((a) =>
        Object.entries(want).every(([k, v]) => (a as Record<string, unknown>)[k] === v),
      );
      expect(
        match,
        `expected a legal ${JSON.stringify(want)} but the legal set was ${JSON.stringify(legal)}`,
      ).toBeTruthy();
      const res = step(state, match as RpgAction);
      expect(res.ok, `engine rejected ${JSON.stringify(want)}: ${res.rejectionReason}`).toBe(true);
      state = res.state;
      return this;
    },
  };
}

describe("bug_0258 — The Wolf-Winter: the optional wedge is signposted and discoverable", () => {
  it("Cade's byre counsel names the rail, the wedge, and the half-shut-breach payoff", () => {
    const { pack } = setup();
    const cade = pack.npcs.find((n) => n.id === "houndsman");
    expect(cade, "old Cade must exist").toBeTruthy();
    const byre = cade!.dialogue.nodes.find((n) => n.id === "cade_byre");
    expect(byre, "cade_byre node must exist").toBeTruthy();
    const text = byre!.npc_text.toLowerCase();
    expect(text).toContain("rail");
    expect(text).toContain("wedge");
    expect(text).toContain("breach");
    expect(text).toContain("singly");
  });

  it("PROSE-ONLY: cade_byre's effects are still exactly {set_flag heard_plan, add_journal}", () => {
    const { pack } = setup();
    const byre = pack.npcs
      .find((n) => n.id === "houndsman")!
      .dialogue.nodes.find((n) => n.id === "cade_byre")!;
    const effects = byre.effects ?? [];
    expect(effects.length).toBe(2);
    const keys = effects.flatMap((e) => Object.keys(e)).sort();
    expect(keys).toEqual(["add_journal", "set_flag"]);
    const flag = effects.find((e) => "set_flag" in e) as { set_flag?: string };
    expect(flag.set_flag).toBe("heard_plan");
    const journal = effects.find((e) => "add_journal" in e) as { add_journal?: string };
    expect(journal.add_journal!.toLowerCase()).toContain("wedge");
  });

  it("asking Cade about the byre surfaces the signpost in the spoken text and the journal", () => {
    const { index, rules, step } = setup();
    const d = driver(rules, step).start(index);
    d.act({ type: "MOVE", direction: "north" }); // steading_yard -> byre_yard
    d.act({ type: "TALK", npc: "houndsman" });
    d.act({ type: "ASK", npc: "houndsman", topic: "ask_byre" });
    const obs = buildRpgObservation(index, d.state());
    const spoken = (obs.dialogue?.npc_text ?? "").toLowerCase();
    expect(spoken).toContain("wedge it back across");
    expect(spoken).toContain("half-shut the breach");
    const journal = d.state().journal.join(" ").toLowerCase();
    expect(journal).toContain("wedge it across the breach");
  });

  it("the signposted wedge genuinely exists: taking the rail surfaces a USE 'wedge' RpgAction", () => {
    const { index, rules, step } = setup();
    const d = driver(rules, step).start(index);
    d.act({ type: "MOVE", direction: "north" }); // -> byre_yard
    d.act({ type: "MOVE", direction: "north" }); // -> paling_gap (rail here, wolf alive)
    // Before taking the rail there is no wedge RpgAction — it requires the rail in hand.
    const beforeUse = d
      .legal()
      .some((a) => a.type === "USE" && (a as { item?: string }).item === "paling_rail");
    expect(beforeUse, "wedge must NOT be offered before the rail is taken").toBe(false);
    d.act({ type: "TAKE", item: "paling_rail" });
    const wedge = buildRpgObservation(index, d.state()).available_actions.find((a) =>
      a.command.toLowerCase().startsWith("wedge"),
    );
    expect(wedge, "after taking the rail, a 'wedge' RpgAction must be offered").toBeTruthy();
    expect(wedge!.action).toMatchObject({
      type: "USE",
      item: "paling_rail",
      target: "paling_rail",
    });
  });

  it("the wedge stays an OPTIONAL aid: no exit, win, or ending turns on breach_braced", () => {
    const { pack } = setup();
    // No room exit gates on breach_braced.
    for (const room of pack.rooms) {
      for (const exit of room.exits ?? []) {
        const conds = JSON.stringify(exit.conditions ?? []);
        expect(conds, `exit ${room.id}->${exit.to} must not gate on breach_braced`).not.toContain(
          "breach_braced",
        );
      }
    }
    // No win condition gates on breach_braced.
    expect(JSON.stringify(pack.win_conditions ?? [])).not.toContain("breach_braced");
    // The only consumer of breach_braced is reactive prose + the wedge's own none_of retire.
    const rail = pack.objects.find((o) => o.id === "paling_rail")!;
    const wedge = rail.interactions.find((it) => it.skill_check?.skill === "defense")!;
    expect(JSON.stringify(wedge.conditions ?? [])).toContain("breach_braced"); // none_of retire gate
  });
});
