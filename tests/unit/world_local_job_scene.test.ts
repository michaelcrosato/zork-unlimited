import { describe, expect, it } from "vitest";

import {
  LOCAL_JOB_SCENE_MAX_MINUTES,
  LOCAL_JOB_SCENE_MAX_REQUIRED_QUESTS,
  LocalJobSceneSchema,
  localJobSceneLegalTuples,
  parseLocalJobScene,
  resolveLocalJobSceneOption,
  type LocalJobScene,
} from "../../src/world/local_job_scene.js";
import { assertOverworldIntegrity } from "../../src/world/overworld.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const world = loadOverworldManifest(process.cwd());

const WORKS_SCENE: LocalJobScene = {
  version: 1,
  id: "albany:works-yard-winter-shift",
  prompt:
    "Reese can save the relief wagon axle or the public heat line before the shift ends, not both.",
  required_poi_id: "albany_city__industrial__poi",
  required_contact_id: "albany_city__industrial__contact",
  requires_completed_quests: ["wolf_winter"],
  options: [
    {
      id: "repair_relief_axle",
      title: "Put the shift on the relief axle",
      preview: "Spend 45 minutes and preserve the hill-road wagon for its next dispatch.",
      consequence: "Reese signs the axle back into relief service while the heat repair waits.",
      terms: { minutes: 45, renown: 3 },
    },
    {
      id: "restore_heat_line",
      title: "Restore the public heat line",
      preview: "Spend 60 minutes and keep the district shelter open through the freeze.",
      consequence: "The shelter radiators wake while the relief axle remains on blocks.",
      terms: { minutes: 60, renown: 4 },
    },
    {
      id: "split_the_shift",
      title: "Attempt a narrow split shift",
      preview: "Spend 90 minutes for a modest repair on each asset and less public credit.",
      consequence: "Both assets leave the yard usable, though neither receives the full repair.",
      terms: { minutes: 90, renown: 2 },
    },
  ],
};

const MARKET_SCENE: LocalJobScene = {
  version: 1,
  id: "albany:market-warm-room-ledger",
  prompt: "Jamie has one disputed delivery and two defensible ways to account for it.",
  required_poi_id: "albany_city__market__poi",
  required_contact_id: "albany_city__market__contact",
  requires_completed_quests: ["market_warm_room"],
  options: [
    {
      id: "honor_resident_chits",
      title: "Honor the resident chits",
      preview: "Spend 25 minutes reconciling the warm-room names before the stalls close.",
      consequence: "Jamie releases the delivery to the residents named on the original chits.",
      terms: { minutes: 25, renown: 2 },
    },
    {
      id: "audit_supplier_marks",
      title: "Audit the supplier marks",
      preview: "Spend 40 minutes tracing the disputed seals through the loading court.",
      consequence: "The false seal is isolated and the legitimate supplier keeps the contract.",
      terms: { minutes: 40, renown: 3 },
    },
  ],
};

describe("authored local-job scenes", () => {
  it("strictly parses a bounded scene and returns a detached canonical value", () => {
    const authored = structuredClone(WORKS_SCENE);
    const parsed = parseLocalJobScene(authored);

    expect(parsed).toEqual(authored);
    expect(parsed).not.toBe(authored);
    expect(parsed.options).not.toBe(authored.options);
    expect(parsed.options).toHaveLength(3);
  });

  it("resolves only an exact option id and returns a detached option", () => {
    const resolved = resolveLocalJobSceneOption(WORKS_SCENE, "restore_heat_line");

    expect(resolved).toEqual(WORKS_SCENE.options[1]);
    expect(resolved).not.toBe(WORKS_SCENE.options[1]);
    expect(() => resolveLocalJobSceneOption(WORKS_SCENE, "restore heat line")).toThrow(
      /unknown local-job scene option/i,
    );
    expect(() => resolveLocalJobSceneOption(WORKS_SCENE, "restore")).toThrow(
      /unknown local-job scene option/i,
    );
  });

  it("reports canonical legal tuples in authored order with exact terms", () => {
    const tuples = localJobSceneLegalTuples(WORKS_SCENE);

    expect(tuples).toEqual([
      [
        "repair_relief_axle",
        "Put the shift on the relief axle",
        "Spend 45 minutes and preserve the hill-road wagon for its next dispatch.",
        45,
        3,
      ],
      [
        "restore_heat_line",
        "Restore the public heat line",
        "Spend 60 minutes and keep the district shelter open through the freeze.",
        60,
        4,
      ],
      [
        "split_the_shift",
        "Attempt a narrow split shift",
        "Spend 90 minutes for a modest repair on each asset and less public credit.",
        90,
        2,
      ],
    ]);
    expect(Object.isFrozen(tuples)).toBe(true);
    expect(Object.isFrozen(tuples[0])).toBe(true);
  });

  it("remains reusable for a second post-quest scene", () => {
    expect(parseLocalJobScene(MARKET_SCENE)).toEqual(MARKET_SCENE);
    expect(localJobSceneLegalTuples(MARKET_SCENE)).toEqual([
      [
        "honor_resident_chits",
        "Honor the resident chits",
        "Spend 25 minutes reconciling the warm-room names before the stalls close.",
        25,
        2,
      ],
      [
        "audit_supplier_marks",
        "Audit the supplier marks",
        "Spend 40 minutes tracing the disputed seals through the loading court.",
        40,
        3,
      ],
    ]);
  });

  it("rejects malformed scene-level fixtures and duplicate options", () => {
    expect(() => LocalJobSceneSchema.parse({ ...WORKS_SCENE, id: "   " })).toThrow(/blank/i);
    expect(() => LocalJobSceneSchema.parse({ ...WORKS_SCENE, prompt: "" })).toThrow();
    expect(() => LocalJobSceneSchema.parse({ ...WORKS_SCENE, required_poi_id: "\t" })).toThrow(
      /blank/i,
    );
    expect(() => LocalJobSceneSchema.parse({ ...WORKS_SCENE, required_contact_id: " " })).toThrow(
      /blank/i,
    );
    expect(() =>
      LocalJobSceneSchema.parse({ ...WORKS_SCENE, requires_completed_quests: [] }),
    ).toThrow();
    expect(() =>
      LocalJobSceneSchema.parse({
        ...WORKS_SCENE,
        requires_completed_quests: Array.from(
          { length: LOCAL_JOB_SCENE_MAX_REQUIRED_QUESTS + 1 },
          (_, index) => `quest_${index}`,
        ),
      }),
    ).toThrow();
    expect(() =>
      LocalJobSceneSchema.parse({
        ...WORKS_SCENE,
        requires_completed_quests: ["wolf_winter", "wolf_winter"],
      }),
    ).toThrow(/duplicate local-job scene prerequisite quest id/i);
    const missingQuestPrerequisites = structuredClone(WORKS_SCENE) as Record<string, unknown>;
    delete missingQuestPrerequisites.requires_completed_quests;
    expect(() => LocalJobSceneSchema.parse(missingQuestPrerequisites)).toThrow();
    expect(() =>
      LocalJobSceneSchema.parse({ ...WORKS_SCENE, options: [WORKS_SCENE.options[0]] }),
    ).toThrow();
    expect(() =>
      LocalJobSceneSchema.parse({
        ...WORKS_SCENE,
        options: [
          ...WORKS_SCENE.options,
          { ...WORKS_SCENE.options[0], id: "fourth" },
          { ...WORKS_SCENE.options[0], id: "fifth" },
        ],
      }),
    ).toThrow();
    expect(() =>
      LocalJobSceneSchema.parse({
        ...WORKS_SCENE,
        options: [WORKS_SCENE.options[0], { ...WORKS_SCENE.options[1], id: "repair_relief_axle" }],
      }),
    ).toThrow(/duplicate local-job scene option id/i);
    expect(() => LocalJobSceneSchema.parse({ ...WORKS_SCENE, unexpected: true })).toThrow();
  });

  it("rejects malformed option and terms fixtures without accepting campaign effects", () => {
    const withOption = (option: unknown) => ({
      ...WORKS_SCENE,
      options: [option, WORKS_SCENE.options[1]],
    });

    expect(() =>
      LocalJobSceneSchema.parse(withOption({ ...WORKS_SCENE.options[0], id: " " })),
    ).toThrow(/blank/i);
    expect(() =>
      LocalJobSceneSchema.parse(withOption({ ...WORKS_SCENE.options[0], title: "\n" })),
    ).toThrow(/blank/i);
    expect(() =>
      LocalJobSceneSchema.parse(
        withOption({ ...WORKS_SCENE.options[0], terms: { minutes: 0, renown: 3 } }),
      ),
    ).toThrow();
    expect(() =>
      LocalJobSceneSchema.parse(
        withOption({
          ...WORKS_SCENE.options[0],
          terms: { minutes: LOCAL_JOB_SCENE_MAX_MINUTES + 1, renown: 3 },
        }),
      ),
    ).toThrow();
    expect(() =>
      LocalJobSceneSchema.parse(
        withOption({ ...WORKS_SCENE.options[0], terms: { minutes: 15.5, renown: 3 } }),
      ),
    ).toThrow();
    expect(() =>
      LocalJobSceneSchema.parse(
        withOption({ ...WORKS_SCENE.options[0], terms: { minutes: 15, renown: 11 } }),
      ),
    ).toThrow();
    expect(() =>
      LocalJobSceneSchema.parse(
        withOption({ ...WORKS_SCENE.options[0], terms: { minutes: 15, renown: 0 } }),
      ),
    ).toThrow();
    expect(() =>
      LocalJobSceneSchema.parse(
        withOption({ ...WORKS_SCENE.options[0], terms: { minutes: 15, renown: 1.5 } }),
      ),
    ).toThrow();
    expect(() =>
      LocalJobSceneSchema.parse(withOption({ ...WORKS_SCENE.options[0], effects: [] })),
    ).toThrow();
    expect(() =>
      LocalJobSceneSchema.parse(
        withOption({ ...WORKS_SCENE.options[0], terms: { minutes: 15, renown: 2, money: 1 } }),
      ),
    ).toThrow();
  });

  it("accepts any authored quest prerequisite and rejects a missing quest", () => {
    const draft = structuredClone(world);
    const authoredJob = draft.local_jobs.find((job) => job.authored_scene);
    const openingTargetQuestId = draft.opening_lead_source?.target_quest;
    const alternativeQuestId = draft.quests.find((quest) => quest.id !== openingTargetQuestId)?.id;

    expect(authoredJob?.authored_scene).toBeDefined();
    expect(openingTargetQuestId).toBeDefined();
    expect(alternativeQuestId).toBeDefined();
    authoredJob!.authored_scene!.requires_completed_quests = [alternativeQuestId!];
    expect(() => assertOverworldIntegrity(draft)).not.toThrow();

    authoredJob!.authored_scene!.requires_completed_quests = ["missing_quest"];
    expect(() => assertOverworldIntegrity(draft)).toThrow(/requires missing quest/i);
  });
});
