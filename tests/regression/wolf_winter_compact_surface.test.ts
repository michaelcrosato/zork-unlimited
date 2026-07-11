/**
 * Wolf-Winter is primarily played by blind agents through the compact MCP view.
 * Its prose therefore has to fit the surface that actually carries each string;
 * merely fitting the 360-character room context is insufficient when LOOK emits
 * the same room text as a 280-character narration event.
 *
 * Keep this inventory semantic. It covers authored prose that the RPG runtime can
 * project, while deliberately excluding comments, aliases, NPC descriptions (there
 * is no LOOK-at-NPC runtime path), and enemy descriptions (observations expose only
 * enemy id/name/HP).
 */
import { describe, expect, it } from "vitest";
import type { Effect } from "../../src/core/effects.js";
import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { compactText } from "../../src/mcp/compact_truncation.js";
import {
  MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT,
  compactMcpTranscriptSummaryValue,
} from "../../src/mcp/action_labels.js";
import {
  COMPACT_EVENT_JOURNAL_CHAR_LIMIT,
  COMPACT_EVENT_NARRATION_CHAR_LIMIT,
  compactPlayerEvent,
} from "../../src/mcp/compact_rpg_event.js";
import {
  COMPACT_BLOCKED_EXIT_CHAR_LIMIT,
  COMPACT_DESCRIPTION_CHAR_LIMIT,
  COMPACT_DIALOGUE_CHAR_LIMIT,
  COMPACT_ENDING_TEXT_CHAR_LIMIT,
  compactRpgObservation,
} from "../../src/mcp/compact_rpg_observation.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import type { RpgPack } from "../../src/rpg/schema.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);

const TRUNCATION_MARKER = /(?:\.\.\.\(\+\d+ chars\)|#[0-9a-f]{12}\b)/i;

function expectExactCompact(label: string, source: string, compact: string): void {
  expect(compact, `${label} must fit its compact surface`).toBe(source);
  expect(compact, `${label} must not expose compact truncation chrome`).not.toMatch(
    TRUNCATION_MARKER,
  );
}

function narrationText(text: string): string {
  const event = compactPlayerEvent({ type: "narration", text });
  expect(event[0]).toBe("n");
  return event[0] === "n" ? event[1] : "";
}

function journalEventText(text: string): string {
  const event = compactPlayerEvent({ type: "state_change", effect: "add_journal", text });
  expect(event.slice(0, 2)).toEqual(["s", "j"]);
  return event[0] === "s" && event[1] === "j" && typeof event[2] === "string" ? event[2] : "";
}

type LabelledEffect = { label: string; effect: Effect };

function effectInventory(source: RpgPack): LabelledEffect[] {
  const effects: LabelledEffect[] = [];
  const add = (label: string, values: readonly Effect[] | undefined): void => {
    for (const [ordinal, effect] of (values ?? []).entries()) {
      effects.push({ label: `${label}[${ordinal}]`, effect });
    }
  };

  for (const room of source.rooms) add(`room:${room.id}.on_enter`, room.on_enter);
  for (const object of source.objects) {
    add(`object:${object.id}.take_effects`, object.take_effects);
    add(`object:${object.id}.unlock_effects`, object.unlock_effects);
    for (const [ordinal, interaction] of object.interactions.entries()) {
      const label = `object:${object.id}.interaction[${ordinal}]`;
      add(`${label}.effects`, interaction.effects);
      add(`${label}.on_success`, interaction.skill_check?.on_success);
      add(`${label}.on_failure`, interaction.skill_check?.on_failure);
    }
  }
  for (const npc of source.npcs) {
    for (const node of npc.dialogue.nodes) {
      add(`npc:${npc.id}.node:${node.id}.effects`, node.effects);
    }
  }
  for (const enemy of source.enemies) add(`enemy:${enemy.id}.on_defeat`, enemy.on_defeat);
  return effects;
}

function addJournal(effect: Effect): string | undefined {
  return "add_journal" in effect ? effect.add_journal : undefined;
}

function narration(effect: Effect): string | undefined {
  return "narrate" in effect ? effect.narrate : undefined;
}

describe("Wolf-Winter compact authored prose", () => {
  it("keeps every room description complete in both context and explicit LOOK events", () => {
    const descriptions = pack.rooms.flatMap((room) => [
      { label: `room:${room.id}.description`, text: room.description },
      ...(room.variants ?? []).map((variant, ordinal) => ({
        label: `room:${room.id}.variant[${ordinal}]`,
        text: variant.text,
      })),
    ]);
    expect(descriptions.length).toBeGreaterThan(0);

    for (const { label, text } of descriptions) {
      const contextSource = text.trimEnd();
      expectExactCompact(
        `${label} (${COMPACT_DESCRIPTION_CHAR_LIMIT}-character room context)`,
        contextSource,
        compactText(contextSource, COMPACT_DESCRIPTION_CHAR_LIMIT),
      );
      expectExactCompact(
        `${label} (${COMPACT_EVENT_NARRATION_CHAR_LIMIT}-character LOOK event)`,
        text,
        narrationText(text),
      );
    }
  });

  it("keeps every object/read/maneuver/effect narration and blocked-exit hint complete", () => {
    const narrations: Array<{ label: string; text: string }> = [];
    for (const object of pack.objects) {
      narrations.push({ label: `object:${object.id}.description`, text: object.description });
      for (const [ordinal, variant] of (object.variants ?? []).entries()) {
        narrations.push({ label: `object:${object.id}.variant[${ordinal}]`, text: variant.text });
      }
      if (object.read_text !== undefined) {
        narrations.push({ label: `object:${object.id}.read_text`, text: object.read_text });
      }
      if (object.unlock_narrate !== undefined) {
        narrations.push({
          label: `object:${object.id}.unlock_narrate`,
          text: object.unlock_narrate,
        });
      }
    }
    for (const enemy of pack.enemies) {
      for (const maneuver of enemy.maneuvers ?? []) {
        narrations.push({
          label: `enemy:${enemy.id}.maneuver:${maneuver.id}.narration`,
          text: maneuver.narration,
        });
      }
    }
    for (const entry of effectInventory(pack)) {
      const text = narration(entry.effect);
      if (text !== undefined) narrations.push({ label: entry.label, text });
    }
    expect(narrations.length).toBeGreaterThan(0);

    for (const { label, text } of narrations) {
      expectExactCompact(
        `${label} (${COMPACT_EVENT_NARRATION_CHAR_LIMIT}-character narration event)`,
        text,
        narrationText(text),
      );
    }

    for (const room of pack.rooms) {
      for (const [ordinal, exit] of room.exits.entries()) {
        if (exit.locked_msg === undefined) continue;
        const source = exit.locked_msg.trimEnd();
        expectExactCompact(
          `room:${room.id}.exit[${ordinal}] (${COMPACT_BLOCKED_EXIT_CHAR_LIMIT}-character blocked hint)`,
          source,
          compactText(source, COMPACT_BLOCKED_EXIT_CHAR_LIMIT),
        );
      }
    }
  });

  it("accounts for Cade's event wrapper as well as the nested dialogue field", () => {
    const cade = pack.npcs.find((npc) => npc.id === "houndsman");
    expect(cade).toBeDefined();
    if (!cade) return;

    const lines = cade.dialogue.nodes.flatMap((node) => [
      { label: `node:${node.id}`, text: node.npc_text },
      ...(node.variants ?? []).map((variant, ordinal) => ({
        label: `node:${node.id}.variant[${ordinal}]`,
        text: variant.text,
      })),
    ]);
    for (const { label, text } of lines) {
      const nestedSource = text.trimEnd();
      expectExactCompact(
        `Cade ${label} (${COMPACT_DIALOGUE_CHAR_LIMIT}-character nested dialogue)`,
        nestedSource,
        compactText(nestedSource, COMPACT_DIALOGUE_CHAR_LIMIT),
      );

      // Folded YAML carries a trailing newline. Including it in the actual runtime
      // wrapper leaves 253 visible authored characters, not an approximate 280.
      const wrapped = `${cade.name}: "${text}"`;
      expectExactCompact(
        `Cade ${label} (wrapped narration event)`,
        wrapped,
        narrationText(wrapped),
      );
    }
  });

  it("keeps every journal beat complete in both the recent-journal and event projections", () => {
    const entries = effectInventory(pack).flatMap((entry) => {
      const text = addJournal(entry.effect);
      return text === undefined ? [] : [{ label: entry.label, text }];
    });
    expect(entries.length).toBeGreaterThan(0);

    for (const { label, text } of entries) {
      expectExactCompact(
        `${label} (${MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT}-character recent journal)`,
        text,
        compactMcpTranscriptSummaryValue(text),
      );
      expectExactCompact(
        `${label} (${COMPACT_EVENT_JOURNAL_CHAR_LIMIT}-character journal event)`,
        text,
        journalEventText(text),
      );
    }
  });

  it("keeps every ending complete both nested and above terminal score chrome", () => {
    const scoreSuffix = `\n\nFinal score: ${pack.meta.max_score} of ${pack.meta.max_score}.`;
    for (const ending of pack.endings) {
      const texts = [
        { label: `ending:${ending.id}.text`, text: ending.text },
        ...(ending.variants ?? []).map((variant, ordinal) => ({
          label: `ending:${ending.id}.variant[${ordinal}]`,
          text: variant.text,
        })),
      ];
      for (const { label, text } of texts) {
        const source = text.trimEnd();
        expectExactCompact(
          `${label} (${COMPACT_ENDING_TEXT_CHAR_LIMIT}-character nested ending)`,
          source,
          compactText(source, COMPACT_ENDING_TEXT_CHAR_LIMIT),
        );
        const terminal = `${source}${scoreSuffix}`;
        expectExactCompact(
          `${label} (${COMPACT_DESCRIPTION_CHAR_LIMIT}-character terminal context)`,
          terminal,
          compactText(terminal, COMPACT_DESCRIPTION_CHAR_LIMIT),
        );
      }
    }
  });

  it("retains the complete two-part safety tutorial across compact player memory", () => {
    const dayBook = pack.objects.find((object) => object.id === "day_book")?.read_text;
    expect(dayBook).toBeDefined();
    const compactDayBook = narrationText(dayBook ?? "");
    expect(compactDayBook).toMatch(/spear/i);
    expect(compactDayBook).toMatch(/Cade/i);
    expect(compactDayBook).toMatch(/jerkin/i);
    expect(compactDayBook).toMatch(/both[^]*no wolf[^]*pull you down/i);
    expect(compactDayBook).toMatch(/less[^]*gambl/i);

    const cade = pack.npcs.find((npc) => npc.id === "houndsman");
    const compactNode = (id: string): string => {
      const text = cade?.dialogue.nodes.find((node) => node.id === id)?.npc_text ?? "";
      return compactText(text.trimEnd(), COMPACT_DIALOGUE_CHAR_LIMIT);
    };
    const counsel = compactNode("cade_wolves");
    expect(counsel).toMatch(/set[^]*drive/i);
    expect(counsel).toMatch(/wheel[^]*turn/i);
    expect(counsel).toMatch(/close[^]*drive/i);
    expect(counsel).toMatch(/jerkin/i);
    const plan = compactNode("cade_byre");
    expect(plan).toMatch(/wedge/i);
    expect(plan).toMatch(/rail/i);
    expect(plan).toMatch(/split[^]*bind/i);
    expect(plan).toMatch(/wait[^]*true rush/i);

    const journalForNode = (id: string): string => {
      const effects = cade?.dialogue.nodes.find((node) => node.id === id)?.effects ?? [];
      const text = effects.map(addJournal).find((entry) => entry !== undefined) ?? "";
      return compactMcpTranscriptSummaryValue(text);
    };
    const counselJournal = journalForNode("cade_wolves");
    expect(counselJournal).toMatch(/set[^]*drive/i);
    expect(counselJournal).toMatch(/wheel[^]*turn/i);
    expect(counselJournal).toMatch(/close[^]*drive/i);
    const planJournal = journalForNode("cade_byre");
    expect(planJournal).toMatch(/wedge[^]*rail/i);
    expect(planJournal).toMatch(/split[^]*bind/i);
    expect(planJournal).toMatch(/wait[^]*true rush/i);
  });
});

type FlankRoute = "funnel_thrust" | "offside_cut" | "splinter_guard";
type LeaderRoute = "wait_out_feint" | "close_on_feint";

type TacticalRoute = {
  label: string;
  rail: "braced" | "split";
  flank: FlankRoute;
  flankChild: string;
  leader: LeaderRoute | "crossbrace_saved_stake";
  leaderChild: string;
  identity: readonly RegExp[];
};

const TACTICAL_ROUTES: readonly TacticalRoute[] = [
  {
    label: "braced pin + true rush",
    rail: "braced",
    flank: "funnel_thrust",
    flankChild: "pin_at_rail",
    leader: "wait_out_feint",
    leaderChild: "take_true_rush",
    identity: [/braced rail/i, /true rush/i],
  },
  {
    label: "braced pin + close",
    rail: "braced",
    flank: "funnel_thrust",
    flankChild: "pin_at_rail",
    leader: "close_on_feint",
    leaderChild: "drive_before_recovery",
    identity: [/braced rail/i, /recover/i],
  },
  {
    label: "off-side turn + true rush",
    rail: "braced",
    flank: "offside_cut",
    flankChild: "turn_through_return",
    leader: "wait_out_feint",
    leaderChild: "take_true_rush",
    identity: [/off-side return/i, /true rush/i],
  },
  {
    label: "off-side turn + close",
    rail: "braced",
    flank: "offside_cut",
    flankChild: "turn_through_return",
    leader: "close_on_feint",
    leaderChild: "drive_before_recovery",
    identity: [/flank-wolf's return/i, /recover/i],
  },
  {
    label: "splinter guard + true rush",
    rail: "split",
    flank: "splinter_guard",
    flankChild: "hook_over_guard",
    leader: "wait_out_feint",
    leaderChild: "take_true_rush",
    identity: [/failed rail/i, /true rush/i],
  },
  {
    label: "splinter guard + close",
    rail: "split",
    flank: "splinter_guard",
    flankChild: "hook_over_guard",
    leader: "close_on_feint",
    leaderChild: "drive_before_recovery",
    identity: [/failed rail/i, /recover/i],
  },
  {
    label: "saved brace-stake + crossbrace",
    rail: "braced",
    flank: "funnel_thrust",
    flankChild: "wrench_brace_stake",
    leader: "crossbrace_saved_stake",
    leaderChild: "turn_over_crossbrace",
    identity: [/quick pin/i, /brace-stake/i, /spent/i],
  },
];

function fixedOutcomeRng(outcome: "best" | "worst"): Rng {
  let roll = 0;
  return {
    next: () => (outcome === "best" ? 0.999999 : 0),
    int: (min, max) => {
      const playerOrOnlyRoll = roll++ === 0;
      if (outcome === "best") return playerOrOnlyRoll ? max : min;
      return playerOrOnlyRoll ? min : max;
    },
  };
}

type PlayedRoute = { state: GameState; compactEvents: unknown[] };

function playTacticalRoute(route: TacticalRoute): PlayedRoute {
  let state = initStateForRpgPack(index, 502);
  const compactEvents: unknown[] = [];

  const act = (id: string, outcome: "best" | "worst" = "best"): void => {
    const options = enumerateRpgActions(index, state);
    const option = options.find((candidate) => candidate.id === id);
    expect(
      option,
      `${route.label}: expected ${id} in ${state.current}; legal=${options.map((candidate) => candidate.id).join(",")}`,
    ).toBeDefined();
    if (!option) throw new Error(`missing ${id}`);
    const result = makeStep(buildRpgRules(index, () => fixedOutcomeRng(outcome)))(
      state,
      option.action,
    );
    expect(result.ok, result.rejectionReason).toBe(true);
    state = result.state;
    compactEvents.push(...result.events.map((event) => compactPlayerEvent(event)));
  };

  const finish = (enemy: string, flag: string): void => {
    for (let guard = 0; guard < 10 && !state.flags[flag] && !state.ended; guard += 1) {
      act(`attack_${enemy}`, "worst");
    }
    expect(state.flags[flag], `${route.label}: ${enemy} must be defeated`).toBe(true);
  };

  for (const id of [
    "go_north",
    "read_day_book",
    "talk_houndsman",
    "ask_wolves",
    "ask_byre",
    "ask_leave",
    "go_west",
    "take_byre_jerkin",
    "use_byre_jerkin",
    "go_east",
    "go_north",
  ]) {
    act(id);
  }
  act("use_paling_rail", route.rail === "braced" ? "best" : "worst");
  if (route.rail === "split") act("use_paling_rail");

  act("maneuver_yearling_wolf_set_spear", "worst");
  if (!state.flags.yearling_down) {
    act("maneuver_yearling_wolf_drive_set_spear", "worst");
  }
  finish("yearling_wolf", "yearling_down");
  act("go_north");

  act(`maneuver_flank_wolf_${route.flank}`, "worst");
  if (!state.flags.flank_wolf_down) {
    act(`maneuver_flank_wolf_${route.flankChild}`, "worst");
  }
  finish("flank_wolf", "flank_wolf_down");
  act("go_north");

  act(`maneuver_grey_leader_${route.leader}`, "worst");
  if (!state.flags.leader_down) {
    act(`maneuver_grey_leader_${route.leaderChild}`, "worst");
  }
  finish("grey_leader", "leader_down");
  act("go_north");
  return { state, compactEvents };
}

describe("Wolf-Winter compact tactical terminal routes", () => {
  it.each(TACTICAL_ROUTES)("preserves the $label payoff, win, and score", (route) => {
    const played = playTacticalRoute(route);
    const compact = compactRpgObservation(buildRpgObservation(index, played.state), []);
    const eventJson = JSON.stringify(played.compactEvents);

    expect(played.state.endingId).toBe("ending_held");
    expect(compact.ended).toBe(true);
    expect(compact.ending_id).toBe("ending_held");
    expect(compact.vitals.slice(3)).toEqual([60, 60]);
    expect(compact.text).toContain("*** You have won. ***");
    expect(compact.text).toContain("Final score: 60 of 60.");
    expect(compact.ending?.text).toContain("*** You have won. ***");
    for (const identity of route.identity) {
      expect(compact.text, `${route.label}: terminal context lost ${identity}`).toMatch(identity);
      expect(compact.ending?.text, `${route.label}: nested ending lost ${identity}`).toMatch(
        identity,
      );
    }
    expect(compact.text).not.toMatch(TRUNCATION_MARKER);
    expect(compact.ending?.text ?? "").not.toMatch(TRUNCATION_MARKER);
    expect(eventJson).not.toMatch(TRUNCATION_MARKER);
  });
});
