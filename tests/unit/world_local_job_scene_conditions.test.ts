import { describe, expect, it } from "vitest";

import {
  LocalJobSceneSchema,
  availableLocalJobSceneOptions,
  type LocalJobScene,
  type LocalJobSceneConditionState,
} from "../../src/world/local_job_scene.js";
import { assertOverworldIntegrity } from "../../src/world/overworld.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { campaignWorldFactsProvenBeforeDecision } from "../../src/world/session_resource_replay.js";

const WORLD = loadOverworldManifest(process.cwd());
const EVENT_ID = "test:event";

const SYNTHETIC_SCENE: LocalJobScene = {
  version: 1,
  id: "test:return-ledger",
  prompt: "Close the earlier filing against the returned fact.",
  required_poi_id: "test:poi",
  required_contact_id: "test:contact",
  requires_completed_quests: ["test:quest"],
  requires_resolved_events: [EVENT_ID],
  options: [
    {
      id: "open_held",
      title: "Close the open held record",
      preview: "Publish the held result.",
      consequence: "The open held record closes.",
      terms: { minutes: 70, renown: 3 },
      requires_event_options: [{ event_id: EVENT_ID, option_id: "open" }],
      requires_all_world_facts: ["fact:held"],
      forbids_any_world_facts: ["fact:evacuated"],
    },
    {
      id: "sealed_evacuated",
      title: "Close the sealed evacuation record",
      preview: "Seal the evacuation result.",
      consequence: "The sealed evacuation record closes.",
      terms: { minutes: 20, renown: 1 },
      requires_event_options: [{ event_id: EVENT_ID, option_id: "sealed" }],
      requires_all_world_facts: ["fact:evacuated"],
      forbids_any_world_facts: ["fact:held"],
    },
  ],
};

function conditionState(
  overrides: {
    eventOption?: string | null;
    facts?: string[];
    quests?: string[];
    resolved?: string[];
  } = {},
): LocalJobSceneConditionState {
  return {
    completedQuestIds: new Set(overrides.quests ?? ["test:quest"]),
    resolvedEventIds: new Set(overrides.resolved ?? [EVENT_ID]),
    worldFactIds: new Set(overrides.facts ?? ["fact:held"]),
    eventOptionIdFor: () => overrides.eventOption ?? "open",
  };
}

describe("generic authored local-job conditions", () => {
  it("selects only the option supported by the earlier event decision and returned fact", () => {
    expect(
      availableLocalJobSceneOptions(SYNTHETIC_SCENE, conditionState()).map((option) => option.id),
    ).toEqual(["open_held"]);
    expect(
      availableLocalJobSceneOptions(
        SYNTHETIC_SCENE,
        conditionState({ eventOption: "sealed", facts: ["fact:evacuated"] }),
      ).map((option) => option.id),
    ).toEqual(["sealed_evacuated"]);
  });

  it("keeps event-choice gating local to an option instead of forcing the whole scene", () => {
    const optionLocalScene: LocalJobScene = {
      ...structuredClone(SYNTHETIC_SCENE),
      requires_resolved_events: undefined,
    };
    expect(
      availableLocalJobSceneOptions(optionLocalScene, conditionState()).map((option) => option.id),
    ).toEqual(["open_held"]);
    expect(
      availableLocalJobSceneOptions(
        optionLocalScene,
        conditionState({ resolved: [], eventOption: "open" }),
      ),
    ).toEqual([]);

    const optionLocalWorld = structuredClone(WORLD);
    const civic = optionLocalWorld.local_jobs.find(
      (job) => job.id === "albany_city__civic_core__job",
    );
    if (!civic?.authored_scene) throw new Error("expected Civic scene");
    civic.authored_scene.requires_resolved_events = undefined;
    expect(() => assertOverworldIntegrity(optionLocalWorld)).not.toThrow();
  });

  it("grants no option for missing chronology, contradictory facts, or a neutral legacy event", () => {
    expect(availableLocalJobSceneOptions(SYNTHETIC_SCENE, conditionState({ quests: [] }))).toEqual(
      [],
    );
    expect(
      availableLocalJobSceneOptions(SYNTHETIC_SCENE, conditionState({ resolved: [] })),
    ).toEqual([]);
    expect(
      availableLocalJobSceneOptions(
        SYNTHETIC_SCENE,
        conditionState({ eventOption: "legacy_generic@trusted", facts: ["fact:held"] }),
      ),
    ).toEqual([]);
    expect(
      availableLocalJobSceneOptions(
        SYNTHETIC_SCENE,
        conditionState({ facts: ["fact:held", "fact:evacuated"] }),
      ),
    ).toEqual([]);
  });

  it("does not treat a final or unbound world fact as available at an earlier job boundary", () => {
    const boundaries = {
      byAcceptedDecisions: new Map(),
      worldFactProofOrdinalById: new Map<string, number | null>([
        ["fact:earlier", 4],
        ["fact:same_boundary", 5],
        ["fact:later", 6],
        ["fact:unbound", null],
      ]),
      storyChoiceProofOrdinalByKey: new Map(),
    };
    expect([...campaignWorldFactsProvenBeforeDecision(boundaries, 5)]).toEqual(["fact:earlier"]);
  });

  it("rejects duplicate and self-contradictory conditional authoring", () => {
    expect(() =>
      LocalJobSceneSchema.parse({
        ...SYNTHETIC_SCENE,
        requires_resolved_events: [EVENT_ID, EVENT_ID],
      }),
    ).toThrow(/Duplicate local-job scene resolved-event requirement/i);
    expect(() =>
      LocalJobSceneSchema.parse({
        ...SYNTHETIC_SCENE,
        options: SYNTHETIC_SCENE.options.map((option, index) =>
          index === 0
            ? {
                ...option,
                requires_all_world_facts: ["fact:held"],
                forbids_any_world_facts: ["fact:held"],
              }
            : option,
        ),
      }),
    ).toThrow(/both require and forbid/i);
  });

  it("fails manifest integrity for missing event options and unauthored facts", () => {
    const missingOption = structuredClone(WORLD);
    const civic = missingOption.local_jobs.find((job) => job.id === "albany_city__civic_core__job");
    if (!civic?.authored_scene) throw new Error("expected Civic scene");
    civic.authored_scene.options[0]!.requires_event_options![0]!.option_id = "invented";
    expect(() => assertOverworldIntegrity(missingOption)).toThrow(/unauthored event option/i);

    const missingFact = structuredClone(WORLD);
    const secondCivic = missingFact.local_jobs.find(
      (job) => job.id === "albany_city__civic_core__job",
    );
    if (!secondCivic?.authored_scene) throw new Error("expected Civic scene");
    secondCivic.authored_scene.options[0]!.requires_all_world_facts = ["fact:invented"];
    expect(() => assertOverworldIntegrity(missingFact)).toThrow(/unauthored world fact/i);
  });

  it("fails manifest integrity for an authored event's missing required quest", () => {
    const missingQuest = structuredClone(WORLD);
    const event = missingQuest.local_events.find((candidate) => candidate.authored_scene);
    if (!event?.authored_scene) throw new Error("expected authored event scene");
    event.authored_scene.requires_completed_quests = ["quest:invented"];
    expect(() => assertOverworldIntegrity(missingQuest)).toThrow(/requires missing quest/i);
  });
});
