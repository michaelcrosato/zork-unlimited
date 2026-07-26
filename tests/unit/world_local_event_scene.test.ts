import { describe, expect, it } from "vitest";

import {
  availableLocalEventSceneOptions,
  LocalEventSceneSchema,
  localEventSceneLegalTuples,
  localEventSceneOptionRequirementsMet,
  localEventSceneRequirementsMet,
  parseLocalEventScene,
  resolveLocalEventSceneOption,
  type LocalEventScene,
} from "../../src/world/local_event_scene.js";
import { projectActiveOverworldEvent } from "../../src/world/session_view_state.js";
import type { OverworldLocalEvent } from "../../src/world/overworld.js";
import { cloneOverworldLocalEvent } from "../../src/world/overworld_clone.js";

const CHARTER_SCENE: LocalEventScene = {
  version: 1,
  id: "test:charter-record",
  prompt: "Choose how the relief affidavits enter the permanent record.",
  required_poi_id: "test:notice_hall",
  required_contact_id: "test:clerk",
  requires_completed_quests: ["test:prior_return"],
  forbids_completed_quests: ["test:field_return"],
  forbids_completed_jobs: ["test:closed_packet"],
  options: [
    {
      id: "open_record",
      title: "Open the record",
      preview: "Publish the count on identical immediate terms.",
      consequence: "The filing becomes public.",
      terms: { minutes: 50, renown: 2 },
    },
    {
      id: "seal_record",
      title: "Seal the details",
      preview: "Protect the names on identical immediate terms.",
      consequence: "The household details stay sealed.",
      terms: { minutes: 50, renown: 2 },
    },
  ],
};

describe("strict authored local-event scenes", () => {
  it("parses and projects exact executable option tuples", () => {
    expect(parseLocalEventScene(CHARTER_SCENE)).toEqual(CHARTER_SCENE);
    expect(localEventSceneLegalTuples(CHARTER_SCENE)).toEqual([
      ["open_record", "Open the record", "Publish the count on identical immediate terms.", 50, 2],
      ["seal_record", "Seal the details", "Protect the names on identical immediate terms.", 50, 2],
    ]);
    expect(resolveLocalEventSceneOption(CHARTER_SCENE, "seal_record").terms).toEqual({
      minutes: 50,
      renown: 2,
    });
    expect(() => resolveLocalEventSceneOption(CHARTER_SCENE, "seal")).toThrow(
      /Unknown local-event scene option/i,
    );
    expect(localEventSceneRequirementsMet(CHARTER_SCENE, { completedQuestIds: new Set() })).toBe(
      false,
    );
    expect(
      localEventSceneRequirementsMet(CHARTER_SCENE, {
        completedQuestIds: new Set(["test:prior_return"]),
        completedJobIds: new Set(),
      }),
    ).toBe(true);
    expect(
      localEventSceneRequirementsMet(CHARTER_SCENE, {
        completedQuestIds: new Set(["test:prior_return", "test:field_return"]),
      }),
    ).toBe(false);
    expect(
      localEventSceneRequirementsMet(CHARTER_SCENE, {
        completedQuestIds: new Set(["test:prior_return"]),
        completedJobIds: new Set(["test:closed_packet"]),
      }),
    ).toBe(false);
  });

  it("is reusable for a synthetic non-Civic event without special-case ids", () => {
    const synthetic: LocalEventScene = {
      ...structuredClone(CHARTER_SCENE),
      id: "test:waterfront-signal",
      prompt: "Choose which signal becomes the harbor's durable warning.",
      required_poi_id: "test:signal_tower",
      required_contact_id: "test:harbor_master",
      options: CHARTER_SCENE.options.map((option, index) => ({
        ...structuredClone(option),
        id: `signal_${index}`,
      })),
    };
    expect(parseLocalEventScene(synthetic)).toEqual(synthetic);
    expect(resolveLocalEventSceneOption(synthetic, "signal_1").title).toBe("Seal the details");
  });

  it("filters fact-conditioned options without exposing their executable terms", () => {
    const synthetic: LocalEventScene = {
      ...structuredClone(CHARTER_SCENE),
      requires_completed_quests: undefined,
      forbids_completed_quests: undefined,
      forbids_completed_jobs: undefined,
      options: [
        {
          ...structuredClone(CHARTER_SCENE.options[0]!),
          requires_all_world_facts: ["fact:record_recovered"],
        },
        {
          ...structuredClone(CHARTER_SCENE.options[1]!),
          forbids_any_world_facts: ["fact:record_recovered"],
        },
      ],
    };
    const withoutFact = {
      completedQuestIds: new Set<string>(),
      worldFactIds: new Set<string>(),
    };
    const withFact = {
      completedQuestIds: new Set<string>(),
      worldFactIds: new Set(["fact:record_recovered"]),
    };

    expect(availableLocalEventSceneOptions(synthetic, withoutFact).map(({ id }) => id)).toEqual([
      "seal_record",
    ]);
    expect(availableLocalEventSceneOptions(synthetic, withFact).map(({ id }) => id)).toEqual([
      "open_record",
    ]);
    expect(localEventSceneLegalTuples(synthetic, withoutFact)).toEqual([
      ["seal_record", "Seal the details", "Protect the names on identical immediate terms.", 50, 2],
    ]);
    expect(localEventSceneOptionRequirementsMet(synthetic.options[0]!, withFact)).toBe(true);
    expect(localEventSceneOptionRequirementsMet(synthetic.options[1]!, withFact)).toBe(false);
    expect(localEventSceneLegalTuples(synthetic)).toEqual([]);
    expect(localEventSceneLegalTuples(CHARTER_SCENE)).toHaveLength(2);
  });

  it("redacts unavailable option presentation and reward fields from the active full view", () => {
    const event: OverworldLocalEvent = {
      id: "test:event",
      home: "test:town",
      area: "test:area",
      title: "Test event",
      pressure: "hazard",
      intensity: 2,
      summary: "A synthetic event.",
      authored_scene: {
        ...structuredClone(CHARTER_SCENE),
        requires_completed_quests: undefined,
        forbids_completed_quests: undefined,
        forbids_completed_jobs: undefined,
        options: [
          {
            ...structuredClone(CHARTER_SCENE.options[0]!),
            terms: { minutes: 73, renown: 7 },
            requires_all_world_facts: ["fact:record_recovered"],
          },
          structuredClone(CHARTER_SCENE.options[1]!),
        ],
      },
    };

    const projected = projectActiveOverworldEvent(event, {
      resolvedEventIds: new Set(),
      completedQuestIds: new Set(),
      completedJobIds: new Set(),
      campaignWorldFactIds: new Set(),
    });
    expect(projected?.authored_scene?.options.map(({ id }) => id)).toEqual(["seal_record"]);
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("open_record");
    expect(serialized).not.toContain("Open the record");
    expect(serialized).not.toContain("Publish the count");
    expect(serialized).not.toContain('"minutes":73');
    expect(serialized).not.toContain('"renown":7');
    expect(event.authored_scene?.options).toHaveLength(2);

    const projectedWithFact = projectActiveOverworldEvent(event, {
      resolvedEventIds: new Set(),
      completedQuestIds: new Set(),
      completedJobIds: new Set(),
      campaignWorldFactIds: new Set(["fact:record_recovered"]),
    });
    expect(projectedWithFact?.authored_scene?.options.map(({ id }) => id)).toEqual([
      "open_record",
      "seal_record",
    ]);
    const availableSerialized = JSON.stringify(projectedWithFact);
    expect(availableSerialized).not.toContain("requires_all_world_facts");
    expect(availableSerialized).not.toContain("forbids_any_world_facts");
    expect(availableSerialized).not.toContain("fact:record_recovered");
    expect(event.authored_scene?.options[0]?.requires_all_world_facts).toEqual([
      "fact:record_recovered",
    ]);
  });

  it("clones option world-fact conditions without sharing mutable arrays", () => {
    const event: OverworldLocalEvent = {
      id: "test:event",
      home: "test:town",
      area: "test:area",
      title: "Test event",
      pressure: "hazard",
      intensity: 2,
      summary: "A synthetic event.",
      authored_scene: {
        ...structuredClone(CHARTER_SCENE),
        options: [
          {
            ...structuredClone(CHARTER_SCENE.options[0]!),
            requires_all_world_facts: ["fact:required"],
            forbids_any_world_facts: ["fact:forbidden"],
          },
          structuredClone(CHARTER_SCENE.options[1]!),
        ],
      },
    };
    const clone = cloneOverworldLocalEvent(event);
    const sourceOption = event.authored_scene!.options[0]!;
    const clonedOption = clone.authored_scene!.options[0]!;

    expect(clonedOption).toEqual(sourceOption);
    expect(clonedOption.requires_all_world_facts).not.toBe(sourceOption.requires_all_world_facts);
    expect(clonedOption.forbids_any_world_facts).not.toBe(sourceOption.forbids_any_world_facts);
  });

  it("rejects weak, ambiguous, duplicate, out-of-bounds, and extra authoring", () => {
    expect(() => LocalEventSceneSchema.parse({ ...CHARTER_SCENE, id: " " })).toThrow(/blank/i);
    expect(() => LocalEventSceneSchema.parse({ ...CHARTER_SCENE, required_poi_id: "" })).toThrow();
    expect(() =>
      LocalEventSceneSchema.parse({ ...CHARTER_SCENE, options: [CHARTER_SCENE.options[0]] }),
    ).toThrow();
    expect(() =>
      LocalEventSceneSchema.parse({
        ...CHARTER_SCENE,
        options: [CHARTER_SCENE.options[0], CHARTER_SCENE.options[0]],
      }),
    ).toThrow(/Duplicate local-event scene option/i);
    expect(() =>
      LocalEventSceneSchema.parse({
        ...CHARTER_SCENE,
        options: CHARTER_SCENE.options.map((option) => ({
          ...option,
          terms: { minutes: 0, renown: option.terms.renown },
        })),
      }),
    ).toThrow();
    expect(() => LocalEventSceneSchema.parse({ ...CHARTER_SCENE, hidden_effect: true })).toThrow();
    expect(() =>
      LocalEventSceneSchema.parse({
        ...CHARTER_SCENE,
        forbids_completed_quests: ["test:field_return", "test:field_return"],
      }),
    ).toThrow(/Duplicate forbidden completed quest/i);
    expect(() =>
      LocalEventSceneSchema.parse({
        ...CHARTER_SCENE,
        forbids_completed_quests: ["test:prior_return"],
      }),
    ).toThrow(/both required and forbidden/i);
    expect(() =>
      LocalEventSceneSchema.parse({
        ...CHARTER_SCENE,
        requires_completed_quests: ["test:prior_return", "test:prior_return"],
      }),
    ).toThrow(/Duplicate required completed quest/i);
    expect(() =>
      LocalEventSceneSchema.parse({
        ...CHARTER_SCENE,
        forbids_completed_jobs: ["test:closed_packet", "test:closed_packet"],
      }),
    ).toThrow(/Duplicate forbidden completed job/i);
    expect(() =>
      LocalEventSceneSchema.parse({
        ...CHARTER_SCENE,
        options: [{ ...CHARTER_SCENE.options[0], hidden_effect: true }, CHARTER_SCENE.options[1]],
      }),
    ).toThrow();
    expect(() =>
      LocalEventSceneSchema.parse({
        ...CHARTER_SCENE,
        options: [
          {
            ...CHARTER_SCENE.options[0],
            requires_all_world_facts: ["fact:a", "fact:a"],
          },
          CHARTER_SCENE.options[1],
        ],
      }),
    ).toThrow(/Duplicate local-event world-fact requirement/i);
    expect(() =>
      LocalEventSceneSchema.parse({
        ...CHARTER_SCENE,
        options: [
          {
            ...CHARTER_SCENE.options[0],
            requires_all_world_facts: ["fact:a"],
            forbids_any_world_facts: ["fact:a"],
          },
          CHARTER_SCENE.options[1],
        ],
      }),
    ).toThrow(/both require and forbid world fact/i);
    expect(() =>
      LocalEventSceneSchema.parse({
        ...CHARTER_SCENE,
        options: [
          {
            ...CHARTER_SCENE.options[0],
            requires_all_world_facts: Array.from({ length: 9 }, (_, index) => `fact:${index}`),
          },
          CHARTER_SCENE.options[1],
        ],
      }),
    ).toThrow();
  });
});
