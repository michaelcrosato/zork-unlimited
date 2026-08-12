/**
 * Wolf-Winter is primarily played by blind agents through the compact MCP view.
 * Its prose therefore has to fit the surface that actually carries each string;
 * merely fitting the room context is insufficient when LOOK emits the same room
 * text through the independently bounded narration-event surface.
 *
 * Keep this inventory semantic. It covers authored prose that the RPG runtime can
 * project, while deliberately excluding comments, aliases, NPC descriptions (there
 * is no LOOK-at-NPC runtime path), and enemy descriptions (observations expose only
 * enemy id/name/HP).
 */
import { describe, expect, it } from "vitest";
import { evalConditions } from "../../src/core/conditions.js";
import type { Effect } from "../../src/core/effects.js";
import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { compactMcpActionLabel, MCP_ACTION_LABEL_CHAR_LIMIT } from "../../src/mcp/action_labels.js";
import { compactText } from "../../src/mcp/compact_truncation.js";
import {
  compactMcpVisibleJournalProse,
  MCP_VISIBLE_JOURNAL_PROSE_CHAR_LIMIT,
} from "../../src/mcp/journal_prose.js";
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
import { createToolApi } from "../../src/mcp/tools.js";
import { rpgActionOptionForInputId } from "../../src/rpg/legal_actions.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import type { RpgPack } from "../../src/rpg/schema.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const PRE_DISCLOSURE_SOURCE_HASH =
  "03a87c97d09d5a30eefa5314d4d2d07dbcf51db2754796e705ecfa1df3262019";
const LESSON_RETURN_DISCLOSURE_SOURCE_HASH =
  "ec51d609f3acebe9cf22830256e44bdd0a8bdfa828b69aaa5d14a3d23b3e7dbb";
const HUNT_COMMITMENT_LABEL_SOURCE_HASH =
  "1bdbd697d7a3c287b1a3bb2e22dd5aa8f793442a7eba39d4af11fffa1e157610";
const BLOCKED_ROUTE_GUIDANCE_SOURCE_HASH =
  "189b14d70a68c0c795167baa9dae695f56c9f3b99bd33151d6a4ece87d083b3b";
const SECONDARY_BLOCKED_COPY_SOURCE_HASH =
  "07572512b61250a87583b4c1d6c80586d2f73b171ccde9a080051d7413af15bd";
const PALING_NORTH_GUIDANCE_SOURCE_HASH =
  "c9b82ed5637d667a3b9837c15ca7ac05bec358b88e131b0d316a11ae367f8236";
const YEARLING_DEFEAT_JOURNAL_SOURCE_HASH =
  "e8e29d0eee6163587353985795fdc2279f480c8053abaac0a44007228523b681";
const WORKS_REPAIR_DISCLOSURE_SOURCE_HASH =
  "8b175deb3b6a575288f6e51701e9a5c3705bbf1746a95fcc414a464c39499b18";
const COMMITTED_LURE_YARD_GUIDANCE_SOURCE_HASH =
  "7beba188a34782a75dd53d86bdef0ba2d93eb381f1541565f9fe07351407ba35";
const FODDER_LOFT_PENDING_COPY_SOURCE_HASH =
  "09bd766079b6713d859f7c6642961557aabafe5b95ba0b21cb22816ff7e0efda";
const BYRE_MOUTH_ROUTE_GUIDANCE_SOURCE_HASH =
  "95a441318c374dd0c8f45bf42f7529c11643259c0b5364ab3b3260980af6e261";
const LURE_ROOT_COMMIT_CUE_SOURCE_HASH =
  "7008beadde22a9f7b69ffeb4a21bbe358e6a98ff95e82f6d04b18fefc14dba6d";
const REACTIVE_TRUTH_SOURCE_HASH =
  "f3519e0655912f26e3eed58a6a23ca68b493574595d52763ae9fbb92c34ae42d";
const YEARLING_DEFEAT_JOURNAL =
  "You take the yearling on its rush as it commits, and it goes down in the snow of the breach.";
const CADE_HUNT_EXIT_LABEL =
  "End talk; HUNT stays uncommitted. Prepared combat may kill wolves; failure risks cattle/line. Cross north to commit and close LURE/DRIVE/FORTIFY.";
const CADE_HUNT_EXIT_COMMAND = `ask: ${CADE_HUNT_EXIT_LABEL}`;
const CADE_LURE_ROOT_LABEL =
  "LURE — Keep herd; move pack beyond breach. Costs last feed and broken paling; a foul risks two cattle. Open or reopen the separate Commit LURE choice.";
const JUNE_HUNT_ACKNOWLEDGEMENT_LABEL =
  "HUNT / keep June — Hold ground; June stays cattle-first. First wolf death breaks agreement. North commits; closes other plans.";

const WOLF_WINTER_EXTERNAL_FLAGS = [
  "jamie_market_testimony_certified",
  "hayden_frost_report_certified",
  "relief_oath_full_duty",
  "relief_oath_limited_duty",
  "relief_oath_unaffiliated_bond",
  "works_fortification_prepared",
  "drover_route_prepared",
  "relief_protocol_prepared",
  "june_pike_present",
  "approach_exposed_ridge",
  "approach_sheltered_stockway",
] as const;

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

const deterministicStep = makeStep(buildRpgRules(index));

function actById(state: GameState, id: string): GameState {
  const options = enumerateRpgActions(index, state);
  const option = options.find((candidate) => candidate.id === id);
  expect(
    option,
    `expected ${id} in ${state.current}; legal=${options.map((candidate) => candidate.id).join(",")}`,
  ).toBeDefined();
  if (!option) throw new Error(`missing ${id}`);
  const result = deterministicStep(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  if (!result.ok) throw new Error(`rejected ${id}`);
  return result.state;
}

function compactWithActions(state: GameState) {
  const actions = enumerateRpgActions(index, state);
  return compactRpgObservation(buildRpgObservation(index, state), actions, {
    includeActions: true,
  });
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
      ...(node.append_variants ?? []).map((fragment, ordinal) => ({
        label: `node:${node.id}.append_variant[${ordinal}]`,
        text: fragment.text,
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

  it("labels every legal Cade plan in compact step responses without replacing action ids", () => {
    const api = createToolApi({ root: process.cwd() });
    const started = api.start_world_quest({
      world_quest_id: "wolf_winter",
      seed: 9821,
      include_actions: true,
    });
    const enteredYard = api.step_action({
      session_id: started.session_id,
      action_id: "go_north",
      expected_state_hash: started.state_hash,
      include_actions: true,
    });
    if (!enteredYard.ok) throw new Error("expected Wolf-Winter yard entry");
    const talked = api.step_action({
      session_id: started.session_id,
      action_id: "talk_houndsman",
      expected_state_hash: enteredYard.state_hash,
      include_actions: true,
    });
    if (!talked.ok) throw new Error("expected Cade's root dialogue");

    const cade = pack.npcs.find((npc) => npc.id === "houndsman");
    const root = cade?.dialogue.nodes.find((node) => node.id === cade.dialogue.root);
    if (!root) throw new Error("expected Cade's root node");

    const rules = buildRpgRules(index);
    const directStep = makeStep(rules);
    const act = (state: GameState, id: string): GameState => {
      const option = enumerateRpgActions(index, state).find((candidate) => candidate.id === id);
      expect(option, `expected ${id}`).toBeDefined();
      if (!option) throw new Error(`missing ${id}`);
      const result = directStep(state, option.action);
      expect(result.ok, result.rejectionReason).toBe(true);
      if (!result.ok) throw new Error(`rejected ${id}`);
      return result.state;
    };
    const legalRootChoices = (state: GameState) =>
      root.topics
        .filter((topic) => evalConditions(topic.conditions ?? [], state))
        .map((topic) => [`ask_${topic.id}`, topic.prompt] as const);
    const dialogueChoices = (state: GameState) =>
      enumerateRpgActions(index, state)
        .filter((option) => option.action.type === "ASK" && option.action.npc === "houndsman")
        .map((option) => [option.id, option.command.replace(/^ask: /, "")] as const);

    let ordinary = initStateForRpgPack(index, 9821);
    ordinary = act(ordinary, "go_north");
    ordinary = act(ordinary, "talk_houndsman");
    const expectedChoices = legalRootChoices(ordinary);

    expect(talked.context.choices).toEqual(expectedChoices);
    expect(dialogueChoices(ordinary)).toEqual(expectedChoices);
    const exactHuntChoice = ["ask_commit_hunt_and_hold", CADE_HUNT_EXIT_LABEL] as const;
    expect(talked.context.choices).toContainEqual(exactHuntChoice);
    expect(dialogueChoices(ordinary)).toContainEqual(exactHuntChoice);
    expect(compactWithActions(ordinary).choices).toContainEqual(exactHuntChoice);
    const fullHuntAction = buildRpgObservation(index, ordinary).available_actions.find(
      (action) => action.id === "ask_commit_hunt_and_hold",
    );
    expect(fullHuntAction?.command).toBe(CADE_HUNT_EXIT_COMMAND);
    expect(CADE_HUNT_EXIT_COMMAND.length).toBeLessThanOrEqual(MCP_ACTION_LABEL_CHAR_LIMIT);
    expect(compactMcpActionLabel(CADE_HUNT_EXIT_COMMAND)).toBe(CADE_HUNT_EXIT_COMMAND);
    expect(CADE_HUNT_EXIT_COMMAND).not.toMatch(TRUNCATION_MARKER);
    expect(expectedChoices.map(([id]) => id)).toEqual([
      "ask_wolves",
      "ask_byre",
      "ask_commit_hunt_and_hold",
      "ask_lure",
      "ask_drive",
      "ask_fortify",
      "ask_leave",
    ]);
    expect(talked.context.actions).toEqual(
      expect.arrayContaining(expectedChoices.map(([id]) => id)),
    );
    expect(talked.context.choices).toEqual(
      expect.arrayContaining([
        expect.arrayContaining(["ask_wolves", expect.stringMatching(/^HUNT —/)]),
        expect.arrayContaining(["ask_lure", expect.stringMatching(/^LURE —/)]),
        expect.arrayContaining(["ask_drive", expect.stringMatching(/^DRIVE —/)]),
        expect.arrayContaining(["ask_fortify", expect.stringMatching(/^FORTIFY —/)]),
      ]),
    );
    expect(talked.context.choices?.some(([id]) => id === "go_west")).toBe(false);

    const june = pack.npcs.find((npc) => npc.id === "june_pike");
    const juneHuntAcknowledgement = june?.dialogue.nodes
      .flatMap((node) => node.topics)
      .find((topic) => topic.id === "commit_hunt_and_hold");
    expect(juneHuntAcknowledgement?.prompt).toBe(JUNE_HUNT_ACKNOWLEDGEMENT_LABEL);
    expect(juneHuntAcknowledgement?.prompt).not.toBe(CADE_HUNT_EXIT_LABEL);

    let released = initStateForRpgPack(index, 9822);
    released = act(released, "go_north");
    released.flags.june_hunt_released = true;
    released = act(released, "talk_houndsman");
    const releasedOptions = enumerateRpgActions(index, released);
    const expectedReleasedChoices = legalRootChoices(released);
    expect(dialogueChoices(released)).toEqual(expectedReleasedChoices);
    expect(expectedReleasedChoices.map(([id]) => id)).toEqual([
      "ask_wolves_after_june_release",
      "ask_byre",
      "ask_leave",
    ]);
    expect(rpgActionOptionForInputId(releasedOptions, "ask_wolves")?.id).toBe(
      "ask_wolves_after_june_release",
    );
  });

  it.each([
    { label: "ordinary", limitedDuty: false },
    { label: "aid-only", limitedDuty: true },
  ])(
    "discloses the optional lesson's root-menu return and LURE reselect on the $label compact surface",
    ({ limitedDuty }) => {
      let state = initStateForRpgPack(index, limitedDuty ? 9852 : 9851);
      if (limitedDuty) state.flags.relief_oath_limited_duty = true;
      state = actById(state, "go_north");
      state = actById(state, "talk_houndsman");
      const initial = compactWithActions(state);
      expect(initial.choices).toContainEqual(["ask_lure", CADE_LURE_ROOT_LABEL]);
      expect(CADE_LURE_ROOT_LABEL.length).toBeLessThanOrEqual(MCP_ACTION_LABEL_CHAR_LIMIT);
      expect(compactMcpActionLabel(CADE_LURE_ROOT_LABEL)).toBe(CADE_LURE_ROOT_LABEL);
      expect(CADE_LURE_ROOT_LABEL).not.toMatch(TRUNCATION_MARKER);
      state = actById(state, "ask_lure");

      const offered = compactWithActions(state);
      expect(offered.dialogue?.[1]).toMatch(
        /optional quick lesson[^]*\+2 attack[^]*\+5 final(?:-| )tally[^]*committing first closes it[^]*lesson returns to the plan menu[^]*choose LURE again to commit/i,
      );
      expect(offered.dialogue?.[1] ?? "").not.toMatch(TRUNCATION_MARKER);
      expect(offered.choices).toEqual(
        expect.arrayContaining([
          [
            "ask_quick_lesson",
            "Take Cade's optional quick lesson (+2 attack; +5 final tally). It returns to the plan menu; choose LURE again to commit.",
          ],
          ["ask_commit_lure", "Commit to the finite feed-and-hounds line now."],
        ]),
      );

      // The lesson remains optional: committing from the first LURE menu does not
      // silently grant either of its one-shot rewards.
      const lessonFreeCommit = actById(structuredClone(state), "ask_commit_lure");
      expect(lessonFreeCommit.flags.strategy_lure_committed).toBe(true);
      expect(lessonFreeCommit.flags.heard_counsel).not.toBe(true);
      expect(lessonFreeCommit.vars.attack).toBe(5);
      expect(lessonFreeCommit.vars.score ?? 0).toBe(0);

      state = actById(state, "ask_quick_lesson");
      expect(state.flags.heard_counsel).toBe(true);
      expect(state.vars).toMatchObject({ attack: 7, score: 5 });
      const returned = compactWithActions(state);
      expect(returned.dialogue?.[1]).toMatch(/quick spear-hand/i);
      expect(returned.choices).toContainEqual(["ask_lure", CADE_LURE_ROOT_LABEL]);
      expect(returned.actions).toEqual(
        expect.arrayContaining([
          "ask_commit_hunt_and_hold",
          "ask_lure",
          "ask_drive",
          "ask_fortify",
        ]),
      );
      expect(returned.actions).not.toContain("ask_quick_lesson");
      expect(returned.actions).not.toContain("ask_commit_lure");

      // Reconsideration is real: HUNT remains legal from the returned root and
      // crossing north does not smuggle in a LURE commitment.
      let huntPivot = actById(structuredClone(state), "ask_commit_hunt_and_hold");
      huntPivot = actById(huntPivot, "go_north");
      expect(huntPivot.current).toBe("paling_gap");
      expect(huntPivot.flags.strategy_lure_committed).not.toBe(true);
      expect(huntPivot.vars).toMatchObject({ attack: 7, score: 5 });

      state = actById(state, "ask_lure");
      const reselected = compactWithActions(state);
      expect(reselected.actions).toContain("ask_commit_lure");
      expect(reselected.actions).not.toContain("ask_quick_lesson");
      expect(reselected.dialogue?.[1]).toMatch(/commit here/i);
      if (limitedDuty) expect(reselected.dialogue?.[1]).toMatch(/aid-only lure benefit/i);

      state = actById(state, "ask_commit_lure");
      expect(state.flags.strategy_lure_committed).toBe(true);
      expect(state.vars).toMatchObject({ attack: 7, score: 5 });
    },
  );

  it("keeps each revision distinct at the gauntlet and source-hash boundaries", () => {
    expect(loaded.compiled.contentHash).toBe(REACTIVE_TRUTH_SOURCE_HASH);
    expect(loaded.compiled.contentHash).not.toBe(LURE_ROOT_COMMIT_CUE_SOURCE_HASH);
    expect(loaded.compiled.contentHash).not.toBe(BYRE_MOUTH_ROUTE_GUIDANCE_SOURCE_HASH);
    expect(loaded.compiled.contentHash).not.toBe(FODDER_LOFT_PENDING_COPY_SOURCE_HASH);
    expect(loaded.compiled.contentHash).not.toBe(COMMITTED_LURE_YARD_GUIDANCE_SOURCE_HASH);
    expect(loaded.compiled.contentHash).not.toBe(WORKS_REPAIR_DISCLOSURE_SOURCE_HASH);
    expect(loaded.compiled.contentHash).not.toBe(YEARLING_DEFEAT_JOURNAL_SOURCE_HASH);
    expect(loaded.compiled.contentHash).not.toBe(PALING_NORTH_GUIDANCE_SOURCE_HASH);
    expect(loaded.compiled.contentHash).not.toBe(SECONDARY_BLOCKED_COPY_SOURCE_HASH);
    expect(loaded.compiled.contentHash).not.toBe(BLOCKED_ROUTE_GUIDANCE_SOURCE_HASH);
    expect(loaded.compiled.contentHash).not.toBe(HUNT_COMMITMENT_LABEL_SOURCE_HASH);
    expect(loaded.compiled.contentHash).not.toBe(LESSON_RETURN_DISCLOSURE_SOURCE_HASH);
    expect(loaded.compiled.contentHash).not.toBe(PRE_DISCLOSURE_SOURCE_HASH);

    const attackLessonSources = pack.npcs.flatMap((npc) =>
      npc.dialogue.nodes.flatMap((node) =>
        node.effects.flatMap((effect) =>
          "inc_var" in effect && effect.inc_var.name === "attack" && effect.inc_var.by === 2
            ? [{ npc: npc.id, node: node.id }]
            : [],
        ),
      ),
    );
    expect(attackLessonSources).toEqual([{ npc: "houndsman", node: "cade_wolves" }]);

    const gauntletCodes = (hp: number): string[] => {
      const candidate = structuredClone(pack);
      candidate.meta.vars_init.hp = hp;
      return validateRpg(candidate, {
        extraSettableFlags: WOLF_WINTER_EXTERNAL_FLAGS,
      }).findings.map((finding) => finding.code);
    };
    expect(gauntletCodes(28)).toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
    expect(gauntletCodes(29)).not.toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
  });

  it("keeps every journal beat complete in both the recent-journal and event projections", () => {
    const entries = effectInventory(pack).flatMap((entry) => {
      const text = addJournal(entry.effect);
      return text === undefined ? [] : [{ label: entry.label, text }];
    });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries).toContainEqual({
      label: "enemy:yearling_wolf.on_defeat[0]",
      text: YEARLING_DEFEAT_JOURNAL,
    });
    expect(YEARLING_DEFEAT_JOURNAL.length).toBe(92);
    expect(YEARLING_DEFEAT_JOURNAL.trim().split(/\s+/u)).toHaveLength(20);

    for (const { label, text } of entries) {
      expectExactCompact(
        `${label} (${MCP_VISIBLE_JOURNAL_PROSE_CHAR_LIMIT}-character recent journal)`,
        text,
        compactMcpVisibleJournalProse(text),
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
        ...(ending.append_variants ?? []).map((fragment, ordinal) => ({
          label: `ending:${ending.id}.append_variant[${ordinal}]`,
          text: fragment.text,
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

  it("retains complementary prep evidence and tactical roles across compact player memory", () => {
    const dayBook = pack.objects.find((object) => object.id === "day_book")?.read_text;
    expect(dayBook).toBeDefined();
    const compactDayBook = narrationText(dayBook ?? "");
    expect(compactDayBook).toMatch(/spear/i);
    expect(compactDayBook).toMatch(/Cade/i);
    expect(compactDayBook).toMatch(/jerkin/i);
    expect(compactDayBook).toMatch(/watchman[^]*standing/i);
    expect(compactDayBook).toMatch(/trusted spear[^]*bled/i);
    expect(compactDayBook).toMatch(/both/i);
    expect(compactDayBook).toMatch(/less[^]*gambl/i);
    expect(compactDayBook).not.toMatch(/no wolf[^]*pull you down/i);
    expect(compactDayBook).not.toMatch(/set[^]*drive|wheel[^]*turn|wait[^]*true rush/i);

    const cade = pack.npcs.find((npc) => npc.id === "houndsman");
    const compactNode = (id: string): string => {
      const text = cade?.dialogue.nodes.find((node) => node.id === id)?.npc_text ?? "";
      return compactText(text.trimEnd(), COMPACT_DIALOGUE_CHAR_LIMIT);
    };
    const counsel = compactNode("cade_wolves");
    expect(counsel).toMatch(/quick/i);
    expect(counsel).toMatch(/set[^]*drive/i);
    expect(counsel).toMatch(/wheel[^]*turn/i);
    expect(counsel).toMatch(/close[^]*drive/i);
    expect(counsel).toMatch(/fast[^]*guard opens/i);
    expect(counsel).toMatch(/jerkin/i);
    expect(counsel).toMatch(/both[^]*no wolf[^]*pull you down/i);
    // The irreversible lure commitment is commonly read through this compact
    // dialogue field. Its missed +5 cannot be hidden below a truncation boundary.
    const lureWarning = cade?.dialogue.nodes
      .find((node) => node.id === "cade_lure")
      ?.variants?.find((variant) =>
        variant.when.some(
          (condition) => "not_flag" in condition && condition.not_flag === "heard_counsel",
        ),
      )?.text;
    expect(lureWarning).toBeDefined();
    const lure = compactText(lureWarning?.trimEnd() ?? "", COMPACT_DIALOGUE_CHAR_LIMIT);
    expect(lure).toMatch(
      /optional quick lesson[^]*\+2 attack[^]*\+5 final(?:-| )tally[^]*committing first closes it/i,
    );
    expect(lure).toMatch(/lesson returns to the plan menu[^]*choose LURE again to commit/i);
    expect(lure).not.toMatch(TRUNCATION_MARKER);
    const plan = compactNode("cade_byre");
    expect(plan).toMatch(/guarded/i);
    expect(plan).toMatch(/wedge/i);
    expect(plan).toMatch(/rail/i);
    expect(plan).toMatch(/split[^]*bind/i);
    expect(plan).toMatch(/wait[^]*true rush/i);
    expect(plan).toMatch(/patient alternative[^]*closing early/i);

    const journalForNode = (id: string): string => {
      const effects = cade?.dialogue.nodes.find((node) => node.id === id)?.effects ?? [];
      const text = effects.map(addJournal).find((entry) => entry !== undefined) ?? "";
      return compactMcpVisibleJournalProse(text);
    };
    const counselJournal = journalForNode("cade_wolves");
    expect(counselJournal).toMatch(/quick\/open/i);
    expect(counselJournal).toMatch(/set[^]*drive/i);
    expect(counselJournal).toMatch(/wheel[^]*turn/i);
    expect(counselJournal).toMatch(/close[^]*drive/i);
    const planJournal = journalForNode("cade_byre");
    expect(planJournal).toMatch(/guarded\/patient/i);
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
  act("wedge_paling_rail", route.rail === "braced" ? "best" : "worst");
  if (route.rail === "split") act("bind_paling_rail");

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
