import { describe, expect, it } from "vitest";

import {
  LocalEventSceneSchema,
  localEventSceneLegalTuples,
  localEventSceneRequirementsMet,
  parseLocalEventScene,
  resolveLocalEventSceneOption,
  type LocalEventScene,
} from "../../src/world/local_event_scene.js";

const CHARTER_SCENE: LocalEventScene = {
  version: 1,
  id: "test:charter-record",
  prompt: "Choose how the relief affidavits enter the permanent record.",
  required_poi_id: "test:notice_hall",
  required_contact_id: "test:clerk",
  forbids_completed_quests: ["test:field_return"],
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
      true,
    );
    expect(
      localEventSceneRequirementsMet(CHARTER_SCENE, {
        completedQuestIds: new Set(["test:field_return"]),
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
        options: [{ ...CHARTER_SCENE.options[0], hidden_effect: true }, CHARTER_SCENE.options[1]],
      }),
    ).toThrow();
  });
});
