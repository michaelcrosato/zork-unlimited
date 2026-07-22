/**
 * Regression for bug_0515: two independent pure players lost Tanner's peaceful
 * route because every destination-bearing clue lived beyond a compact transport
 * boundary. Keep the authored case exact on both the human UI and compact MCP
 * surfaces; hiding graph ids must not hide player-facing orientation or payoff.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Effect } from "../../src/core/effects.js";
import { compactMcpVisibleJournalProse } from "../../src/mcp/journal_prose.js";
import { compactText } from "../../src/mcp/compact_truncation.js";
import { compactPlayerEvent } from "../../src/mcp/compact_rpg_event.js";
import {
  COMPACT_BLOCKED_ACTION_REASON_CHAR_LIMIT,
  COMPACT_BLOCKED_EXIT_CHAR_LIMIT,
  COMPACT_DESCRIPTION_CHAR_LIMIT,
  COMPACT_DIALOGUE_CHAR_LIMIT,
  COMPACT_ENDING_TEXT_CHAR_LIMIT,
} from "../../src/mcp/compact_rpg_observation.js";
import { createToolApi } from "../../src/mcp/tools.js";
import type { RpgPack } from "../../src/rpg/schema.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { GameSession } from "../../ui/src/engine.js";

const SOURCE_PATH = "content/rpg/quests/tanners_fever.yaml";
const SOURCE = readFileSync(SOURCE_PATH, "utf8");
const loaded = loadRpgSourceFile(SOURCE_PATH);
if (!loaded.ok) throw new Error("tanners_fever must compile");
const pack = loaded.compiled.pack;

const TRUNCATION_CHROME = /(?:\.\.\.\(\+\d+ chars\)|#[0-9a-f]{12}\b)/i;

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

function expectExact(label: string, source: string, projected: string): void {
  expect(projected, `${label} must fit its real player transport`).toBe(source);
  expect(projected, `${label} must not expose truncation chrome`).not.toMatch(TRUNCATION_CHROME);
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
    for (const node of npc.dialogue.nodes) add(`npc:${npc.id}.node:${node.id}`, node.effects);
  }
  for (const enemy of source.enemies) add(`enemy:${enemy.id}.on_defeat`, enemy.on_defeat);
  return effects;
}

function narration(effect: Effect): string | undefined {
  return "narrate" in effect ? effect.narrate : undefined;
}

function journal(effect: Effect): string | undefined {
  return "add_journal" in effect ? effect.add_journal : undefined;
}

type CompactContext = {
  here: readonly [string, string];
  text: string;
  exits: string[];
  actions?: string[];
  blocked?: Array<readonly [string, string]>;
  journal?: string[];
};

type CompactStep = {
  ok: boolean;
  state_hash: string;
  context: CompactContext;
  events?: unknown[];
};

function compactNarrations(events: unknown): string[] {
  if (!Array.isArray(events)) return [];
  return events.flatMap((event) =>
    Array.isArray(event) && event[0] === "n" && typeof event[1] === "string" ? [event[1]] : [],
  );
}

describe("bug_0515 - Tanner's Fever compact surface preserves the whole medical case", () => {
  it("keeps every reachable authored prose body exact on its strictest compact transport", () => {
    for (const room of pack.rooms) {
      const descriptions = [
        { label: `room:${room.id}.description`, text: room.description },
        ...(room.variants ?? []).map((variant, ordinal) => ({
          label: `room:${room.id}.variant[${ordinal}]`,
          text: variant.text,
        })),
      ];
      for (const { label, text } of descriptions) {
        expectExact(
          `${label} context`,
          text.trimEnd(),
          compactText(text.trimEnd(), COMPACT_DESCRIPTION_CHAR_LIMIT),
        );
        expectExact(`${label} LOOK`, text, narrationText(text));
      }
      for (const [ordinal, exit] of room.exits.entries()) {
        if (exit.locked_msg === undefined) continue;
        const source = exit.locked_msg.trimEnd();
        expectExact(
          `room:${room.id}.exit[${ordinal}] blocked hint`,
          source,
          compactText(source, COMPACT_BLOCKED_EXIT_CHAR_LIMIT),
        );
      }
    }

    for (const object of pack.objects) {
      const prose = [
        { label: `object:${object.id}.description`, text: object.description },
        ...(object.variants ?? []).map((variant, ordinal) => ({
          label: `object:${object.id}.variant[${ordinal}]`,
          text: variant.text,
        })),
        ...(object.read_text === undefined
          ? []
          : [{ label: `object:${object.id}.read_text`, text: object.read_text }]),
        ...(object.unlock_narrate === undefined
          ? []
          : [{ label: `object:${object.id}.unlock_narrate`, text: object.unlock_narrate }]),
      ];
      for (const { label, text } of prose) expectExact(label, text, narrationText(text));

      for (const [ordinal, interaction] of object.interactions.entries()) {
        const reason = interaction.blocked_hint?.reason;
        if (reason === undefined) continue;
        expectExact(
          `object:${object.id}.interaction[${ordinal}].blocked_hint`,
          reason,
          compactText(reason, COMPACT_BLOCKED_ACTION_REASON_CHAR_LIMIT),
        );
      }
    }

    for (const entry of effectInventory(pack)) {
      const prose = narration(entry.effect);
      if (prose !== undefined) expectExact(`${entry.label}.narrate`, prose, narrationText(prose));
      const memory = journal(entry.effect);
      if (memory !== undefined) {
        expectExact(`${entry.label}.recent_journal`, memory, compactMcpVisibleJournalProse(memory));
        expectExact(`${entry.label}.journal_event`, memory, journalEventText(memory));
      }
    }

    for (const npc of pack.npcs) {
      const dialogue = npc.dialogue.nodes.flatMap((node) => [
        { label: `npc:${npc.id}.node:${node.id}`, text: node.npc_text },
        ...(node.variants ?? []).map((variant, ordinal) => ({
          label: `npc:${npc.id}.node:${node.id}.variant[${ordinal}]`,
          text: variant.text,
        })),
      ]);
      for (const { label, text } of dialogue) {
        const nested = text.trimEnd();
        expectExact(label, nested, compactText(nested, COMPACT_DIALOGUE_CHAR_LIMIT));
        const wrapped = `${npc.name}: "${text}"`;
        expectExact(`${label} wrapped event`, wrapped, narrationText(wrapped));
      }
    }

    const scoreSuffix = `\n\nFinal score: ${pack.meta.max_score} of ${pack.meta.max_score}.`;
    for (const ending of pack.endings) {
      const variants = [
        { label: `ending:${ending.id}`, text: ending.text },
        ...(ending.variants ?? []).map((variant, ordinal) => ({
          label: `ending:${ending.id}.variant[${ordinal}]`,
          text: variant.text,
        })),
      ];
      for (const { label, text } of variants) {
        const source = text.trimEnd();
        expectExact(label, source, compactText(source, COMPACT_ENDING_TEXT_CHAR_LIMIT));
        const terminal = `${source}${scoreSuffix}`;
        expectExact(
          `${label} terminal`,
          terminal,
          compactText(terminal, COMPACT_DESCRIPTION_CHAR_LIMIT),
        );
      }
    }
  });

  it("keeps UI and compact MCP orientation, evidence, remedy, and payoff in lockstep", () => {
    const ui = GameSession.start(SOURCE, 2115);
    const api = createToolApi({ root: process.cwd() });
    const started = api.start_world_quest({
      world_quest_id: "tanners_fever",
      seed: 2115,
      hide_graph: true,
      compact_observation: true,
      compact_events: true,
      include_actions: true,
    }) as unknown as { session_id: string; state_hash: string; context: CompactContext };
    const sessionId = started.session_id;
    let stateHash = started.state_hash;
    let current = started.context;

    const assertCurrentSurface = (): void => {
      const human = ui.view();
      expect(current.text).toBe(human.text.trimEnd());
      expect(current.text).not.toMatch(TRUNCATION_CHROME);
      expect(current.actions ?? []).toEqual(human.choices.map((choice) => choice.id));
    };
    const step = (actionId: string): CompactStep => {
      const human = ui.choose(actionId);
      const compact = api.step_action({
        session_id: sessionId,
        action_id: actionId,
        expected_state_hash: stateHash,
        hide_graph: true,
        compact_observation: true,
        compact_events: true,
        include_actions: true,
      }) as unknown as CompactStep;
      expect(human.ok, `human ${actionId}`).toBe(true);
      expect(compact.ok, `compact ${actionId}`).toBe(true);
      expect(compactNarrations(compact.events), actionId).toEqual(human.narration);
      for (const line of compactNarrations(compact.events))
        expect(line).not.toMatch(TRUNCATION_CHROME);
      stateHash = compact.state_hash;
      current = compact.context;
      assertCurrentSurface();
      return compact;
    };

    assertCurrentSurface();
    expect(current.text).toMatch(/dose ledger[^]*west/i);
    expect(current.text).toMatch(/remedies[^]*herb store[^]*east/i);
    expect(current.text).toMatch(/corridor[^]*north/i);
    expect(current.text).toMatch(/Edric's bedside/i);
    expect(current.exits).toEqual(expect.arrayContaining(["east", "north", "west"]));

    for (const actionId of [
      "examine_sick_edric",
      "talk_godwin",
      "ask_ask_diagnosis",
      "ask_ask_dose",
      "ask_ask_recovery",
      "go_west",
      "examine_godwin_notes",
      "take_godwin_notes",
    ]) {
      step(actionId);
    }

    const read = step("read_godwin_notes");
    expect(compactNarrations(read.events).join(" ")).toMatch(/three-to-one[^]*one-to-one/i);
    expect(compactNarrations(read.events).join(" ")).toMatch(/settles the gut[^]*bedside/i);
    expect(current.journal?.at(-1)).toBe(ui.view().journal.at(-1));
    expect(current.journal?.at(-1)).not.toMatch(TRUNCATION_CHROME);

    step("go_east");
    expect(current.here[0]).toBe("sickroom");
    expect(current.text).toMatch(/written[^]*three-to-one[^]*one-to-one/i);
    expect(current.text).toMatch(/remedies[^]*herb store[^]*east/i);
    expect(current.text).toMatch(/Edric's bedside/i);
    expect(current.text).not.toMatch(/ledger lies west/i);
    expect(current.actions).toContain("go_east");

    step("go_north");
    expect(current.here[0]).toBe("corridor");
    expect(current.text).toMatch(/south[^]*Edric's bedside/i);
    const compactNorth = current.blocked?.find(([direction]) => direction === "north")?.[1];
    const humanNorth = ui
      .view()
      .facts.find((fact) => fact.startsWith("blocked: north — "))
      ?.slice("blocked: north — ".length);
    expect(compactNorth).toBe(humanNorth);
    expect(compactNorth).toMatch(/Edric's bedside[^]*condition[^]*dose[^]*remedy/i);
    expect(compactNorth).not.toMatch(TRUNCATION_CHROME);
    expect(current.actions).toEqual(expect.arrayContaining(["go_south", "attack_holt"]));
    expect(current.actions).not.toContain("go_north");

    step("go_south");
    expect(current.text).toMatch(/herb store[^]*east/i);
    step("go_east");
    expect(current.here[0]).toBe("herb_store");
    expect(current.text).toMatch(/meadowsweet[^]*settle[^]*stomach/i);
    expect(current.text).toMatch(/bedside[^]*west/i);
    step("take_meadowsweet");
    const examined = step("examine_meadowsweet");
    expect(compactNarrations(examined.events).join(" ")).toMatch(/keep water[^]*fever clears/i);
    expect(current.journal?.at(-1)).toBe(ui.view().journal.at(-1));
    expect(current.journal?.at(-1)).not.toMatch(TRUNCATION_CHROME);

    step("go_west");
    expect(current.actions).toContain("use_meadowsweet_on_sick_edric");
    const treatment = step("use_meadowsweet_on_sick_edric");
    const treatmentText = compactNarrations(treatment.events).join(" ");
    expect(treatmentText).toMatch(/Godwin/i);
    expect(treatmentText).toMatch(/Edric/i);
    if (current.actions?.includes("use_meadowsweet_on_sick_edric")) {
      step("use_meadowsweet_on_sick_edric");
    }
    step("go_north");
    const ending = step("go_north");
    expect(ui.view().ended).toBe(true);
    expect(ending.context.text).toMatch(/\*\*\* You have won\. \*\*\*/);
    expect(ending.context.text).toMatch(/Final score: 50 of 50\./);
    expect(ending.context.text).not.toMatch(TRUNCATION_CHROME);
  });
});
