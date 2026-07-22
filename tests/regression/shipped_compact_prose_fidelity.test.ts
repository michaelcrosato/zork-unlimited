/**
 * Compact MCP is the normal blind-player transport. Inventory every authored
 * prose body that can cross it so new content cannot silently lose the end of a
 * clue, consequence, or payoff. The response ceilings below retain a bounded
 * envelope even though the individual prose budgets now fit the shipped slice.
 */
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { Effect } from "../../src/core/effects.js";
import {
  compactOverworldActionResult,
  compactOverworldJourneyStoryChoiceResult,
  compactOverworldServiceResult,
  compactOverworldTravelResult,
  OVERWORLD_COMPACT_ACTION_TEXT_CHAR_LIMIT,
  OVERWORLD_COMPACT_SERVICE_TEXT_CHAR_LIMIT,
} from "../../src/mcp/compact_overworld_result.js";
import { compactJourneyStoryChoicePrompt } from "../../src/mcp/journey_projection.js";
import { compactText } from "../../src/mcp/compact_truncation.js";
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
  compactRpgBlockedActionReason,
  compactRpgObservation,
} from "../../src/mcp/compact_rpg_observation.js";
import {
  compactMcpVisibleJournalProse,
  MCP_VISIBLE_JOURNAL_PROSE_CHAR_LIMIT,
} from "../../src/mcp/journal_prose.js";
import type { RpgObservation } from "../../src/rpg/observation.js";
import type { RpgPack } from "../../src/rpg/schema.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { createInitialCampaignCharacterState } from "../../src/world/campaign_character_state.js";
import {
  compactCampaignServiceOffer,
  compactOverworldEventScenes,
  compactOverworldJobScenes,
  compactOverworldQuestRef,
  compactOverworldServiceAction,
  OVERWORLD_COMPACT_ROAD_EVENT_SUMMARY_CHAR_LIMIT,
  OVERWORLD_COMPACT_SERVICE_SUMMARY_CHAR_LIMIT,
} from "../../src/world/compact_view.js";
import type { JourneyStoryChoicePrompt } from "../../src/world/journey_contract.js";
import {
  describeOverworldAreaAction,
  describeOverworldContactAction,
  describeOverworldEventAction,
  describeOverworldJobAction,
  describeOverworldPoiAction,
  describeOverworldSiteAction,
  type OverworldLocalActionDescriptor,
  type OverworldLocalActionKind,
} from "../../src/world/local_actions.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { campaignServiceJournalCopy } from "../../src/world/session_services.js";
import { OverworldSession, type TravelLogEntry } from "../../src/world/session.js";
import {
  recordOverworldAction,
  recordOverworldLocalAction,
  type OverworldActionJournalState,
} from "../../src/world/session_action_recording.js";
import { presentOverworldContact } from "../../src/world/session_contact_presentation.js";
import { describeOverworldEventResolution } from "../../src/world/session_event_resolution.js";
import { presentOverworldQuestLaunch } from "../../src/world/quest_launch.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const TRUNCATION_CHROME = /(?:\.\.\.\(\+\d+ chars\)|#[0-9a-f]{12}\b)/i;
const RPG_SERIALIZED_RESPONSE_CEILING = 9_000;
const OVERWORLD_SERIALIZED_RESPONSE_CEILING = 12_000;

type LabelledText = { label: string; text: string };
type LabelledEffect = { label: string; effect: Effect };

function expectExact(label: string, source: string, projected: string): void {
  expect(projected, `${label} must fit its compact player transport`).toBe(source);
  expect(projected, `${label} must not expose truncation chrome`).not.toMatch(TRUNCATION_CHROME);
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

function emptyActionJournalState(): OverworldActionJournalState {
  return { minutes: 0, journalEntries: [], journalEntriesById: new Map() };
}

function compactRecordedLocalAction(
  action: OverworldLocalActionDescriptor<OverworldLocalActionKind>,
  town: string,
) {
  const recorded = recordOverworldLocalAction(emptyActionJournalState(), action, town);
  return compactOverworldActionResult({
    minutes: recorded.minutes,
    alreadyKnown: recorded.alreadyKnown,
    entry: recorded.entry,
  });
}

function compactRecordedEventResolution(args: {
  eventId: string;
  title: string;
  text: string;
  minutes: number;
  town: string;
}) {
  const recorded = recordOverworldAction(
    emptyActionJournalState(),
    {
      id: `resolve:${args.eventId}`,
      kind: "resolution",
      town: args.town,
      title: args.title,
      text: args.text,
    },
    args.minutes,
  );
  return compactOverworldActionResult({
    minutes: recorded.minutes,
    alreadyKnown: recorded.alreadyKnown,
    entry: recorded.entry,
  });
}

function currentStoryChoice(session: OverworldSession): JourneyStoryChoicePrompt {
  const prompt = session.journey().storyChoice;
  if (!prompt) throw new Error("Expected an opening story choice.");
  return prompt;
}

function moveToArea(
  session: OverworldSession,
  world: OverworldManifest,
  targetAreaId: string,
): void {
  const currentAreaId = session.view().currentArea?.id;
  if (!currentAreaId || currentAreaId === targetAreaId) return;
  const edges = world.area_edges.filter((edge) => edge.home === session.view().current.id);
  const queue = [currentAreaId];
  const previous = new Map<string, string>();
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    if (current === targetAreaId) break;
    for (const edge of edges.filter(
      (candidate) => candidate.from_area === current || candidate.to_area === current,
    )) {
      const next = edge.from_area === current ? edge.to_area : edge.from_area;
      if (next === currentAreaId || previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  const path: string[] = [];
  for (let cursor = targetAreaId; cursor !== currentAreaId; ) {
    const prior = previous.get(cursor);
    if (!prior) throw new Error(`No area route to ${targetAreaId}.`);
    path.unshift(cursor);
    cursor = prior;
  }
  for (const areaId of path) {
    const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
    if (!route) throw new Error(`Area route to ${areaId} is not visible.`);
    session.moveArea(route.id);
  }
}

type OpeningSourceOption = Readonly<{
  id: string;
  title: string;
  summary: string;
  preview: string;
  consequence: string;
}>;

function expectOpeningPromptExact(
  source: Readonly<{ id: string; title: string; message: string }>,
  sourceOptions: readonly OpeningSourceOption[],
  prompt: JourneyStoryChoicePrompt,
): JourneyStoryChoicePrompt {
  expect(prompt.id).toBe(source.id);
  const projected = compactJourneyStoryChoicePrompt(prompt);
  expectExact(`opening:${source.id}.prompt`, prompt.message, projected.message);
  expect(projected.message).toContain(source.title);
  expect(projected.message).toContain(source.message);

  for (const sourceOption of sourceOptions) {
    const canonicalOption = prompt.options.find((option) => option.id === sourceOption.id);
    const projectedOption = projected.options.find((option) => option.id === sourceOption.id);
    expect(
      canonicalOption,
      `opening:${source.id}.${sourceOption.id} must be presented`,
    ).toBeDefined();
    expect(
      projectedOption,
      `opening:${source.id}.${sourceOption.id} must be compacted`,
    ).toBeDefined();
    expect(projectedOption!.label).toBe(sourceOption.title);
    expect(projectedOption!.consequence).toContain(sourceOption.consequence);
    expect(projectedOption!.consequence).not.toMatch(TRUNCATION_CHROME);
    if (projectedOption!.summary) {
      expectExact(
        `opening:${source.id}.${sourceOption.id}.summary`,
        sourceOption.summary,
        projectedOption!.summary!.commitment,
      );
      expectExact(
        `opening:${source.id}.${sourceOption.id}.preview`,
        sourceOption.preview,
        projectedOption!.summary!.fieldTrigger,
      );
    } else {
      expect(projectedOption!.consequence).toContain(sourceOption.summary);
      expect(projectedOption!.consequence).toContain(sourceOption.preview);
    }
  }
  return projected;
}

function effectInventory(pack: RpgPack): LabelledEffect[] {
  const effects: LabelledEffect[] = [];
  const add = (label: string, values: readonly Effect[] | undefined): void => {
    for (const [ordinal, effect] of (values ?? []).entries()) {
      effects.push({ label: `${label}[${ordinal}]`, effect });
    }
  };

  for (const room of pack.rooms) add(`room:${room.id}.on_enter`, room.on_enter);
  for (const object of pack.objects) {
    add(`object:${object.id}.take_effects`, object.take_effects);
    add(`object:${object.id}.unlock_effects`, object.unlock_effects);
    for (const [ordinal, interaction] of object.interactions.entries()) {
      const label = `object:${object.id}.interaction[${ordinal}]`;
      add(`${label}.effects`, interaction.effects);
      add(`${label}.on_success`, interaction.skill_check?.on_success);
      add(`${label}.on_failure`, interaction.skill_check?.on_failure);
    }
  }
  for (const npc of pack.npcs) {
    for (const node of npc.dialogue.nodes) add(`npc:${npc.id}.node:${node.id}`, node.effects);
  }
  for (const enemy of pack.enemies) add(`enemy:${enemy.id}.on_defeat`, enemy.on_defeat);
  return effects;
}

function narration(effect: Effect): string | undefined {
  return "narrate" in effect ? effect.narrate : undefined;
}

function journal(effect: Effect): string | undefined {
  return "add_journal" in effect ? effect.add_journal : undefined;
}

function longest(values: readonly LabelledText[]): LabelledText | undefined {
  return values.reduce<LabelledText | undefined>(
    (best, value) => (!best || value.text.length > best.text.length ? value : best),
    undefined,
  );
}

function serializedRpgProseResponse(pack: RpgPack): number {
  const descriptions: LabelledText[] = [];
  const narrations: LabelledText[] = [];
  const journals: LabelledText[] = [];
  const dialogues: LabelledText[] = [];
  const blocked: LabelledText[] = [];
  const endings: LabelledText[] = [];

  for (const room of pack.rooms) {
    descriptions.push({ label: `room:${room.id}`, text: room.description.trimEnd() });
    narrations.push({ label: `room:${room.id}`, text: room.description });
    for (const variant of room.variants ?? []) {
      descriptions.push({ label: `room:${room.id}.variant`, text: variant.text.trimEnd() });
      narrations.push({ label: `room:${room.id}.variant`, text: variant.text });
    }
    for (const exit of room.exits) {
      if (exit.locked_msg)
        blocked.push({ label: `room:${room.id}.blocked`, text: exit.locked_msg });
    }
  }
  for (const object of pack.objects) {
    narrations.push({ label: `object:${object.id}`, text: object.description });
    for (const variant of object.variants ?? []) {
      narrations.push({ label: `object:${object.id}.variant`, text: variant.text });
    }
    if (object.read_text)
      narrations.push({ label: `object:${object.id}.read`, text: object.read_text });
    if (object.unlock_narrate) {
      narrations.push({ label: `object:${object.id}.unlock`, text: object.unlock_narrate });
    }
  }
  for (const entry of effectInventory(pack)) {
    const narrated = narration(entry.effect);
    const remembered = journal(entry.effect);
    if (narrated !== undefined) narrations.push({ label: entry.label, text: narrated });
    if (remembered !== undefined) journals.push({ label: entry.label, text: remembered });
  }
  for (const npc of pack.npcs) {
    for (const node of npc.dialogue.nodes) {
      dialogues.push({ label: `npc:${npc.id}.${node.id}`, text: node.npc_text.trimEnd() });
      narrations.push({
        label: `npc:${npc.id}.${node.id}`,
        text: `${npc.name}: "${node.npc_text}"`,
      });
      for (const variant of node.variants ?? []) {
        dialogues.push({ label: `npc:${npc.id}.${node.id}.variant`, text: variant.text.trimEnd() });
        narrations.push({
          label: `npc:${npc.id}.${node.id}.variant`,
          text: `${npc.name}: "${variant.text}"`,
        });
      }
    }
  }
  for (const enemy of pack.enemies) {
    for (const maneuver of enemy.maneuvers ?? []) {
      narrations.push({ label: `enemy:${enemy.id}.${maneuver.id}`, text: maneuver.narration });
    }
  }
  const scoreSuffix = `\n\nFinal score: ${pack.meta.max_score} of ${pack.meta.max_score}.`;
  for (const ending of pack.endings) {
    const variants = [ending.text, ...(ending.variants ?? []).map((variant) => variant.text)];
    for (const text of variants) {
      const nested = text.trimEnd();
      endings.push({ label: `ending:${ending.id}`, text: nested });
      descriptions.push({ label: `ending:${ending.id}.terminal`, text: `${nested}${scoreSuffix}` });
    }
  }

  const ending = longest(endings);
  const observation: RpgObservation = {
    mode: "rpg",
    room: pack.meta.start_room,
    title: pack.meta.title,
    description: longest(descriptions)?.text ?? "",
    visible_objects: [],
    npcs_present: [],
    exits: [],
    blocked_exits: blocked.map((entry, ordinal) => ({
      direction: `blocked_${ordinal}`,
      message: entry.text,
    })),
    blocked_actions: [],
    inventory: [],
    state: { flags: [], vars: {}, journal: journals.map((entry) => entry.text) },
    dialogue: longest(dialogues) ? { npc: "speaker", npc_text: longest(dialogues)!.text } : null,
    enemies_present: [],
    stats: { hp: 1, attack: 1, defense: 1 },
    available_actions: [],
    score: pack.meta.max_score,
    max_score: pack.meta.max_score,
    ended: ending !== undefined,
    ending_id: ending ? "ending" : null,
    ending: ending ? { id: "ending", title: "Ending", text: ending.text, death: false } : null,
  };
  const response = {
    context: compactRpgObservation(observation, []),
    events: [
      ...(longest(narrations)
        ? [compactPlayerEvent({ type: "narration" as const, text: longest(narrations)!.text })]
        : []),
      ...(longest(journals)
        ? [
            compactPlayerEvent({
              type: "state_change" as const,
              effect: "add_journal",
              text: longest(journals)!.text,
            }),
          ]
        : []),
    ],
  };
  return JSON.stringify(response).length;
}

const QUEST_SOURCES = readdirSync("content/rpg/quests")
  .filter((name) => name.endsWith(".yaml"))
  .sort()
  .map((name) => {
    const sourcePath = `content/rpg/quests/${name}`;
    const loaded = loadRpgSourceFile(sourcePath);
    if (!loaded.ok) throw new Error(`${sourcePath} must compile`);
    return { name, pack: loaded.compiled.pack };
  });
const WORLD = loadOverworldManifest(process.cwd());

describe("shipped compact prose fidelity", () => {
  it("pins every shipped prose corpus before iterating it", () => {
    expect(QUEST_SOURCES).toHaveLength(12);
    expect(WORLD.local_events.filter((event) => event.authored_scene)).toHaveLength(4);
    expect(WORLD.local_jobs.filter((job) => job.authored_scene)).toHaveLength(6);
    expect(WORLD.quests.filter((quest) => quest.launch)).toHaveLength(1);
    expect(WORLD.campaign_service_rules).toHaveLength(28);
    expect(WORLD.road_events).toHaveLength(344);
    expect(WORLD.areas).toHaveLength(700);
    expect(WORLD.points_of_interest).toHaveLength(700);
    expect(WORLD.characters).toHaveLength(701);
    expect(WORLD.exploration_sites).toHaveLength(700);
    expect(WORLD.local_events).toHaveLength(700);
    expect(WORLD.local_jobs).toHaveLength(700);

    const openingScenes = [
      WORLD.opening_registration,
      WORLD.opening_relief_oath,
      WORLD.opening_lead_source,
      WORLD.opening_preparation,
      WORLD.opening_relief_allocation,
      WORLD.opening_ally,
    ].filter((scene) => scene !== undefined);
    expect(openingScenes).toHaveLength(6);
    expect(
      (WORLD.opening_registration?.profiles.length ?? 0) +
        (WORLD.opening_relief_oath?.options.length ?? 0) +
        (WORLD.opening_lead_source?.options.length ?? 0) +
        (WORLD.opening_preparation?.profiles.length ?? 0) +
        (WORLD.opening_relief_allocation?.options.length ?? 0) +
        (WORLD.opening_ally?.options.length ?? 0),
    ).toBe(19);
  });

  it("keeps every opening choice exact through real session prompts and receipts", () => {
    const registration = WORLD.opening_registration!;
    const oath = WORLD.opening_relief_oath!;
    const lead = WORLD.opening_lead_source!;
    const preparation = WORLD.opening_preparation!;
    const allocation = WORLD.opening_relief_allocation!;
    const ally = WORLD.opening_ally!;
    const session = new OverworldSession(WORLD);

    const choose = (
      source: Readonly<{ id: string; title: string; message: string }>,
      sourceOptions: readonly OpeningSourceOption[],
      prompt: JourneyStoryChoicePrompt,
    ): void => {
      expectOpeningPromptExact(source, sourceOptions, prompt);
      const sourceOption = sourceOptions[0]!;
      const canonicalOption = prompt.options.find((option) => option.id === sourceOption.id)!;
      const selected = session.chooseJourneyStory(sourceOption.id, source.id);
      const projected = compactOverworldJourneyStoryChoiceResult(selected);
      expectExact(
        `opening:${source.id}.${sourceOption.id}.selection`,
        canonicalOption.consequence,
        projected.consequence,
      );
      expect(projected.consequence).toContain(sourceOption.consequence);
    };

    const opening = session.view();
    session.scoutPoi(opening.pois[0]!.id);
    session.talkToCharacter(registration.contact);
    choose(registration, registration.profiles, currentStoryChoice(session));
    choose(oath, oath.options, currentStoryChoice(session));
    choose(lead, lead.options, currentStoryChoice(session));

    moveToArea(session, WORLD, preparation.area);
    choose(preparation, preparation.profiles, session.inspectJourneyStory(preparation.id));
    choose(allocation, allocation.options, session.inspectJourneyStory(allocation.id));

    moveToArea(session, WORLD, ally.area);
    session.talkToCharacter(ally.contact);
    choose(ally, ally.options, currentStoryChoice(session));
  });

  it.each(QUEST_SOURCES)("keeps every player-facing RPG body exact in $name", ({ pack }) => {
    for (const room of pack.rooms) {
      const descriptions = [
        room.description,
        ...(room.variants ?? []).map((variant) => variant.text),
      ];
      for (const text of descriptions) {
        expectExact(
          `room:${room.id} context`,
          text.trimEnd(),
          compactText(text.trimEnd(), COMPACT_DESCRIPTION_CHAR_LIMIT),
        );
        expectExact(`room:${room.id} LOOK`, text, narrationText(text));
      }
      for (const [ordinal, exit] of room.exits.entries()) {
        if (exit.locked_msg === undefined) continue;
        expectExact(
          `room:${room.id}.exit[${ordinal}]`,
          exit.locked_msg.trimEnd(),
          compactText(exit.locked_msg.trimEnd(), COMPACT_BLOCKED_EXIT_CHAR_LIMIT),
        );
      }
    }

    for (const object of pack.objects) {
      const prose = [
        object.description,
        ...(object.variants ?? []).map((variant) => variant.text),
        ...(object.read_text ? [object.read_text] : []),
        ...(object.unlock_narrate ? [object.unlock_narrate] : []),
      ];
      for (const text of prose) expectExact(`object:${object.id}`, text, narrationText(text));
      for (const [ordinal, interaction] of object.interactions.entries()) {
        const reason = interaction.blocked_hint?.reason;
        if (reason === undefined) continue;
        expectExact(
          `object:${object.id}.interaction[${ordinal}].blocked hint`,
          reason,
          compactRpgBlockedActionReason(reason),
        );
      }
    }

    for (const entry of effectInventory(pack)) {
      const narrated = narration(entry.effect);
      const remembered = journal(entry.effect);
      if (narrated !== undefined)
        expectExact(`${entry.label}.narrate`, narrated, narrationText(narrated));
      if (remembered !== undefined) {
        expectExact(
          `${entry.label}.recent journal`,
          remembered,
          compactMcpVisibleJournalProse(remembered),
        );
        expectExact(`${entry.label}.journal event`, remembered, journalEventText(remembered));
      }
    }

    for (const npc of pack.npcs) {
      for (const node of npc.dialogue.nodes) {
        const dialogue = [node.npc_text, ...(node.variants ?? []).map((variant) => variant.text)];
        for (const text of dialogue) {
          expectExact(
            `npc:${npc.id}.node:${node.id}`,
            text.trimEnd(),
            compactText(text.trimEnd(), COMPACT_DIALOGUE_CHAR_LIMIT),
          );
          const wrapped = `${npc.name}: "${text}"`;
          expectExact(`npc:${npc.id}.node:${node.id} event`, wrapped, narrationText(wrapped));
        }
      }
    }

    for (const enemy of pack.enemies) {
      for (const maneuver of enemy.maneuvers ?? []) {
        expectExact(
          `enemy:${enemy.id}.maneuver:${maneuver.id}`,
          maneuver.narration,
          narrationText(maneuver.narration),
        );
      }
    }

    const scoreSuffix = `\n\nFinal score: ${pack.meta.max_score} of ${pack.meta.max_score}.`;
    for (const ending of pack.endings) {
      const texts = [ending.text, ...(ending.variants ?? []).map((variant) => variant.text)];
      for (const text of texts) {
        const nested = text.trimEnd();
        expectExact(
          `ending:${ending.id}`,
          nested,
          compactText(nested, COMPACT_ENDING_TEXT_CHAR_LIMIT),
        );
        const terminal = `${nested}${scoreSuffix}`;
        expectExact(
          `ending:${ending.id} terminal`,
          terminal,
          compactText(terminal, COMPACT_DESCRIPTION_CHAR_LIMIT),
        );
      }
    }

    expect(serializedRpgProseResponse(pack)).toBeLessThanOrEqual(RPG_SERIALIZED_RESPONSE_CEILING);
  });

  it("keeps every overworld source exact through its compact player projection", () => {
    const world = WORLD;
    const nodesById = new Map(world.nodes.map((node) => [node.id, node]));
    const areasById = new Map(world.areas.map((area) => [area.id, area]));
    const edgesById = new Map(world.edges.map((edge) => [edge.id, edge]));
    const node = (id: string) => {
      const found = nodesById.get(id);
      if (!found) throw new Error(`Missing overworld node ${id}.`);
      return found;
    };
    const actionReceipts: ReturnType<typeof compactOverworldActionResult>[] = [];
    const assertLocalAction = (
      label: string,
      action: OverworldLocalActionDescriptor<OverworldLocalActionKind>,
      town: string,
    ): void => {
      const receipt = compactRecordedLocalAction(action, town);
      expectExact(`${label}.receipt`, action.text, receipt.text);
      actionReceipts.push(receipt);
    };

    for (const area of world.areas) {
      assertLocalAction(`area:${area.id}`, describeOverworldAreaAction(area), node(area.home).name);
    }
    for (const poi of world.points_of_interest) {
      const current = node(poi.home);
      assertLocalAction(`poi:${poi.id}`, describeOverworldPoiAction(poi, current), current.name);
    }
    for (const character of world.characters) {
      const current = node(character.home);
      const presentation = presentOverworldContact(character, {
        character: createInitialCampaignCharacterState(),
        completedQuestIds: new Set(),
      });
      assertLocalAction(
        `contact:${character.id}`,
        describeOverworldContactAction(presentation.contact, presentation.presentationId),
        current.name,
      );
    }
    for (const site of world.exploration_sites) {
      assertLocalAction(
        `site:${site.id}`,
        describeOverworldSiteAction(site),
        node(site.nearest_town).name,
      );
    }
    for (const event of world.local_events) {
      assertLocalAction(
        `event:${event.id}`,
        describeOverworldEventAction(event),
        node(event.home).name,
      );
    }
    for (const job of world.local_jobs) {
      const area = areasById.get(job.area);
      if (!area) throw new Error(`Missing local-job area ${job.area}.`);
      assertLocalAction(
        `job:${job.id}`,
        describeOverworldJobAction(job, area),
        node(job.home).name,
      );
    }

    const roadReceipts = world.road_events.map((event) => {
      const edge = edgesById.get(event.edge);
      if (!edge) throw new Error(`Missing road-event edge ${event.edge}.`);
      const from = node(edge.from);
      const to = node(edge.to);
      const travel: TravelLogEntry = {
        edgeId: edge.id,
        fromId: edge.from,
        toId: edge.to,
        from: from.name,
        to: to.name,
        route: edge.route,
        distanceMi: edge.distance_mi,
        baseMinutes: edge.travel_minutes,
        delayMinutes: 0,
        minutes: edge.travel_minutes,
        arrivedAt: 0,
        suppliesUsed: 0,
        suppliesAfter: 8,
        fatigueGained: 0,
        fatigueAfter: 0,
        roadEvent: event,
      };
      const projected = compactOverworldTravelResult(travel);
      expectExact(`road:${event.id}.title`, event.title, projected[8]!);
      expectExact(`road:${event.id}.summary`, event.summary, projected[9]!);
      return projected;
    });

    const eventScenes = compactOverworldEventScenes(
      world.local_events.filter((event) => event.authored_scene !== undefined),
    );
    const jobScenes = compactOverworldJobScenes(
      world.local_jobs.filter((job) => job.authored_scene !== undefined),
    );

    for (const event of world.local_events) {
      const scene = event.authored_scene;
      if (!scene) continue;
      const compact = eventScenes.find(([eventId]) => eventId === event.id);
      expect(compact).toBeDefined();
      expectExact(`event:${event.id}.prompt`, scene.prompt, compact![2]);
      for (const option of scene.options) {
        const projected = compact![7].find(([optionId]) => optionId === option.id);
        expect(projected).toBeDefined();
        expectExact(`event:${event.id}.${option.id}.preview`, option.preview, projected![4]);
        expectExact(
          `event:${event.id}.${option.id}.consequence`,
          option.consequence,
          projected![5],
        );
        const current = node(event.home);
        const description = describeOverworldEventResolution(
          event,
          current.name,
          current.region,
          option,
        );
        const receipt = compactRecordedEventResolution({
          eventId: event.id,
          title: description.title,
          text: description.text,
          minutes: description.minutes,
          town: current.name,
        });
        expectExact(`event:${event.id}.${option.id}.result`, description.text, receipt.text);
        expect(receipt.text).toContain(option.consequence);
        actionReceipts.push(receipt);
      }
    }

    for (const job of world.local_jobs) {
      const scene = job.authored_scene;
      if (!scene) continue;
      const compact = jobScenes.find(([jobId]) => jobId === job.id);
      expect(compact).toBeDefined();
      expectExact(`job:${job.id}.prompt`, scene.prompt, compact![2]);
      for (const option of scene.options) {
        const projected = compact![6].find(([optionId]) => optionId === option.id);
        expect(projected).toBeDefined();
        expectExact(`job:${job.id}.${option.id}.preview`, option.preview, projected![4]);
        expectExact(`job:${job.id}.${option.id}.consequence`, option.consequence, projected![5]);
        const area = areasById.get(job.area);
        if (!area) throw new Error(`Missing local-job area ${job.area}.`);
        const action = describeOverworldJobAction(job, area, option);
        const receipt = compactRecordedLocalAction(action, node(job.home).name);
        expectExact(`job:${job.id}.${option.id}.result`, action.text, receipt.text);
        expect(receipt.text).toContain(option.consequence);
        actionReceipts.push(receipt);
      }
    }

    const questRefs = world.quests.flatMap((quest) => {
      if (!quest.launch) return [];
      const launch = presentOverworldQuestLaunch(quest.launch, {
        minutes: 0,
        supplies: 8,
        fatigue: 0,
      });
      const compact = compactOverworldQuestRef({
        id: quest.id,
        title: quest.title,
        area: quest.area,
        launch,
      });
      if (compact.length !== 4) throw new Error(`quest:${quest.id} launch must be projected`);
      expectExact(`quest:${quest.id}.prompt`, launch.prompt, compact[3][1]);
      for (const option of launch.options) {
        const projected = compact[3][2].find(([optionId]) => optionId === option.id);
        expect(projected).toBeDefined();
        expectExact(`quest:${quest.id}.${option.id}.preview`, option.preview, projected![11]);
        expectExact(
          `quest:${quest.id}.${option.id}.consequence`,
          option.consequence,
          projected![12],
        );
      }
      return [compact];
    });

    const servicePayloads = (world.campaign_service_rules ?? []).map((rule) => {
      const offer = compactCampaignServiceOffer({
        id: rule.id,
        action: rule.action,
        title: rule.title,
        summary: rule.summary,
        minutes: rule.minutes,
      });
      expectExact(`service:${rule.id}.summary`, rule.summary, offer[3]);
      const text = campaignServiceJournalCopy(rule, { supplies: 0, fatigue: 100 }).text;
      const action = compactOverworldServiceAction({
        action: rule.action,
        source: "campaign_override",
        offerId: rule.id,
        available: true,
        changed: true,
        minutes: rule.minutes,
        suppliesBefore: 0,
        suppliesAfter: rule.action === "resupply" ? 8 : 0,
        fatigueBefore: 100,
        fatigueAfter: rule.action === "rest" ? 0 : 100,
        message: text,
        blockedReason: null,
      });
      expectExact(`service:${rule.id}.preview`, text, action[8]);
      const result = compactOverworldServiceResult({
        action: rule.action,
        minutes: rule.minutes,
        changed: true,
        suppliesBefore: 0,
        suppliesAfter: rule.action === "resupply" ? 8 : 0,
        fatigueBefore: 100,
        fatigueAfter: rule.action === "rest" ? 0 : 100,
        message: text,
        entry: null,
      });
      expectExact(`service:${rule.id}.receipt`, text, result.text);
      return { offer, action, result };
    });

    const largest = <T>(values: readonly T[]): T | undefined =>
      [...values].sort(
        (left, right) => JSON.stringify(right).length - JSON.stringify(left).length,
      )[0];
    const response = {
      context: {
        event_scenes: largest(eventScenes) ? [largest(eventScenes)] : [],
        job_scenes: largest(jobScenes) ? [largest(jobScenes)] : [],
        quests: largest(questRefs) ? [largest(questRefs)] : [],
        service_offers: servicePayloads
          .map(({ offer }) => offer)
          .sort((left, right) => JSON.stringify(right).length - JSON.stringify(left).length)
          .slice(0, 2),
        service_actions: servicePayloads
          .map(({ action }) => action)
          .sort((left, right) => JSON.stringify(right).length - JSON.stringify(left).length)
          .slice(0, 2),
      },
      result: {
        action: largest(actionReceipts),
        service: largest(servicePayloads.map(({ result }) => result)),
        travel: largest(roadReceipts),
      },
    };
    expect(JSON.stringify(response).length).toBeLessThanOrEqual(
      OVERWORLD_SERIALIZED_RESPONSE_CEILING,
    );
  });

  it("pins the measured player-prose limits to the shipped corpus envelope", () => {
    expect({
      description: COMPACT_DESCRIPTION_CHAR_LIMIT,
      narration: COMPACT_EVENT_NARRATION_CHAR_LIMIT,
      dialogue: COMPACT_DIALOGUE_CHAR_LIMIT,
      journal: MCP_VISIBLE_JOURNAL_PROSE_CHAR_LIMIT,
      journalEvent: COMPACT_EVENT_JOURNAL_CHAR_LIMIT,
      blockedExit: COMPACT_BLOCKED_EXIT_CHAR_LIMIT,
      ending: COMPACT_ENDING_TEXT_CHAR_LIMIT,
      overworldAction: OVERWORLD_COMPACT_ACTION_TEXT_CHAR_LIMIT,
      overworldService: OVERWORLD_COMPACT_SERVICE_TEXT_CHAR_LIMIT,
      overworldScene: OVERWORLD_COMPACT_SERVICE_SUMMARY_CHAR_LIMIT,
      roadEvent: OVERWORLD_COMPACT_ROAD_EVENT_SUMMARY_CHAR_LIMIT,
    }).toEqual({
      description: 720,
      narration: 1200,
      dialogue: 1120,
      journal: 320,
      journalEvent: 320,
      blockedExit: 256,
      ending: 720,
      overworldAction: 512,
      overworldService: 512,
      overworldScene: 512,
      roadEvent: 240,
    });
  });
});
