/**
 * Regression (§15) for bug_0258 — The Wolf-Winter: the optional "wedge the paling-rail"
 * skill check must be DISCOVERABLE to a blind player, not just legible once performed.
 *
 * This is the sequential sibling of bug_0256. bug_0256 made the wedge's payoff LEGIBLE
 * AFTER you do it (reactive prose on the room + rail once `breach_braced`). But a
 * 2026-06-05 blind playtest (seed 11, ai-runs/2026-06-05T05-48-14-545Z/playtest.md)
 * showed a fresh player never DISCOVERS the wedge at all. The pack's ONLY skill_check —
 * and all the bug_0256 prose built for it — was effectively dead content.
 *
 * The fix is a content-only SIGNPOST in old Cade's "how the byre is held" counsel
 * (cade_byre), the natural in-fiction info path the player walks BEFORE the paling. The
 * rail is target-only scenery now, so "wedge rail" is offered immediately at the gap.
 * Success retires it; failure clearly offers one same-id target USE that binds the
 * joined split lengths into real, non-droppable recovered guard gear.
 *
 * This pins:
 *   (1) SIGNPOST — Cade's byre counsel names the rail + the wedge + the half-shut-breach
 *       payoff (in both the spoken reply event AND the persisted journal note), then
 *       returns to Cade's post-effect root, so the affordance is discoverable naturally;
 *   (2) DISCOVERABILITY — at the paling, target-only USE "wedge" is immediately legal and
 *       TAKE is not; the affordance cannot hide behind inventory ceremony;
 *   (3) OPTIONAL TACTICAL PAYOFF — no exit/win/ending turns on breach_braced, but success
 *       now earns the flank-wolf's guarded opening, so the check is meaningful.
 *
 * If a future edit drops the signpost, re-gates the wedge behind inventory ceremony, or
 * makes breach_braced a route/ending gate, a case flips RED.
 */
import { describe, it, expect } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameEvent } from "../../src/core/events.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { activeDialogue } from "../../src/rpg/model.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";
import type { Rng } from "../../src/core/rng.js";

const PACK_PATH = "content/rpg/quests/wolf_winter.yaml";

const fixedRng = (): Rng => ({
  next: () => 0,
  int: (min: number) => Math.ceil(min),
});

function setup() {
  const loaded = loadRpgSourceFile(PACK_PATH);
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
  let latestEvents: GameEvent[] = [];
  return {
    start(index: ReturnType<typeof setup>["index"]) {
      state = initStateForRpgPack(index, 11);
      return this;
    },
    legal: (): RpgAction[] => rules.legalActions(state) as RpgAction[],
    state: () => state,
    events: () => latestEvents,
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
      if (!res.ok) throw new Error(`engine rejected ${JSON.stringify(want)}`);
      state = res.state;
      latestEvents = res.events;
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
    expect(text).toContain("guarded funnel");
    expect(text).toContain("splits");
    expect(text).toContain("bind");
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

  it("asking Cade about the byre surfaces the spoken signpost, journal, and resumed root", () => {
    const { index, rules, step } = setup();
    const d = driver(rules, step).start(index);
    d.act({ type: "MOVE", direction: "north" }); // steading_yard -> byre_yard
    d.act({ type: "TALK", npc: "houndsman" });
    d.act({ type: "ASK", npc: "houndsman", topic: "byre" });
    const spoken = d
      .events()
      .flatMap((event) => (event.type === "narration" ? [event.text] : []))
      .join(" ")
      .toLowerCase();
    expect(spoken).toContain("wedge it back across");
    expect(spoken).toContain("half-shut the breach");

    const obs = buildRpgObservation(index, d.state());
    expect(activeDialogue(index, d.state())?.node.id).toBe("cade_root");
    expect(obs.dialogue?.npc_text).toMatch(
      /guarded byre plan[^]*quick spear-hand is still yours to learn[^]*Ask for it/i,
    );
    const resumedIds = obs.available_actions.map((action) => action.id);
    expect(resumedIds).toEqual(expect.arrayContaining(["ask_wolves", "ask_leave"]));
    expect(resumedIds).not.toContain("ask_byre_back");
    expect(d.state().flags["heard_plan"]).toBe(true);
    const journal = d.state().journal.join(" ").toLowerCase();
    expect(journal).toContain("wedge the fallen rail");
    expect(journal).toContain("if it splits, bind the joined lengths");
  });

  it("the signposted wedge is immediately legal as target-only USE, never TAKE", () => {
    const { index, rules, step } = setup();
    const d = driver(rules, step).start(index);
    d.act({ type: "MOVE", direction: "north" }); // -> byre_yard
    d.act({ type: "MOVE", direction: "north" }); // -> paling_gap (rail here, wolf alive)
    const observation = buildRpgObservation(index, d.state());
    expect(observation.available_actions.map((a) => a.id)).not.toContain("take_paling_rail");
    const wedge = observation.available_actions.find((a) =>
      a.command.toLowerCase().startsWith("wedge"),
    );
    expect(wedge, "a target-only 'wedge' RpgAction must be offered at once").toBeTruthy();
    expect(wedge!.action).toMatchObject({
      type: "USE",
      target: "paling_rail",
    });
    expect(wedge!.action).not.toHaveProperty("item");
    expect(wedge!.skill_check).toEqual({ skill: "defense", difficulty: 11, die: "d20" });
  });

  it("the wedge stays optional but earns the flank-wolf's guarded opening", () => {
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
    // No win condition or ending gates on breach_braced.
    expect(JSON.stringify(pack.win_conditions ?? [])).not.toContain("breach_braced");
    expect(JSON.stringify(pack.endings ?? [])).not.toContain("breach_braced");

    // It is nevertheless mechanically consumed by one authored opening.
    const flank = pack.enemies.find((enemy) => enemy.id === "flank_wolf")!;
    const funnel = flank.maneuvers?.find((maneuver) => maneuver.id === "funnel_thrust");
    expect(funnel).toMatchObject({
      result_flag: "flank_funneled",
      attack_bonus: -1,
      defense_bonus: 3,
    });
    expect(JSON.stringify(funnel?.conditions ?? [])).toContain("breach_braced");

    // The wedge itself retires after either outcome, but failure exposes one mutually
    // exclusive same-target bind that creates the real recovered guard.
    const rail = pack.objects.find((o) => o.id === "paling_rail")!;
    const wedge = rail.interactions.find((it) => it.skill_check?.skill === "defense")!;
    expect(JSON.stringify(wedge.conditions ?? [])).toContain("rail_attempted");
    expect(JSON.stringify(wedge.conditions ?? [])).toContain("breach_braced");
    expect(JSON.stringify(wedge.skill_check?.on_failure ?? [])).toContain("rail_split");

    const bind = rail.interactions.find(
      (interaction) =>
        interaction.verb === "USE" &&
        interaction.target === "paling_rail" &&
        interaction.skill_check === undefined,
    );
    expect(bind).toBeDefined();
    expect(JSON.stringify(bind?.conditions ?? [])).toContain("rail_split");
    expect(JSON.stringify(bind?.conditions ?? [])).toContain("split_rail_guard_made");
    expect(JSON.stringify(bind?.effects ?? [])).toContain('"add_item":"split_rail_guard"');
    expect(JSON.stringify(bind?.effects ?? [])).toContain('"set_flag":"split_rail_guard_made"');
    const guard = pack.objects.find((object) => object.id === "split_rail_guard");
    expect(guard).toMatchObject({ droppable: false });
  });
});
