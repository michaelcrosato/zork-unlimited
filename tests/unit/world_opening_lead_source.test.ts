import { describe, expect, it } from "vitest";

import {
  cloneCampaignCharacterState,
  evolveCampaignCharacterState,
  type CampaignCharacterState,
} from "../../src/world/campaign_character_state.js";
import {
  OPENING_LEAD_SOURCE_MAX_OPTIONS,
  OPENING_LEAD_SOURCE_MIN_OPTIONS,
  OpeningLeadSourceOptionSchema,
  OpeningLeadSourceSchema,
  applyOpeningLeadSourceOption,
  cloneOpeningLeadSource,
  formatOpeningLeadSourceCost,
  openingLeadSourceOptionById,
  openingLeadSourceTerms,
  parseOpeningLeadSource,
  type OpeningLeadSource,
  type OpeningLeadSourceOption,
} from "../../src/world/opening_lead_source.js";
import {
  assertOverworldIntegrity,
  parseOverworldManifest,
  type OverworldManifest,
} from "../../src/world/overworld.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const world = loadOverworldManifest(process.cwd());
const openingLeadSource = world.opening_lead_source;
const openingRegistration = world.opening_registration;

if (!openingLeadSource || !openingRegistration) {
  throw new Error("The shipped Albany opening must author registration and lead-source scenes.");
}

function optionById(scene: OpeningLeadSource, optionId: string): OpeningLeadSourceOption {
  const option = scene.options.find((candidate) => candidate.id === optionId);
  if (!option) throw new Error(`Missing test opening lead-source option ${optionId}.`);
  return option;
}

function profileCharacter(profileId: string): CampaignCharacterState {
  const profile = openingRegistration!.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) throw new Error(`Missing test opening registration profile ${profileId}.`);
  return profile.character;
}

function mutableOpeningScene(draft: OverworldManifest): OpeningLeadSource {
  const scene = draft.opening_lead_source;
  if (!scene) throw new Error("Missing mutable opening lead-source scene.");
  return scene;
}

function expectIntegrityFailure(
  mutate: (scene: OpeningLeadSource, draft: OverworldManifest) => void,
  pattern: RegExp,
): void {
  const draft = structuredClone(world);
  mutate(mutableOpeningScene(draft), draft);
  expect(() => assertOverworldIntegrity(draft)).toThrow(pattern);
}

function learnedKnowledgeEffect(
  option: OpeningLeadSourceOption,
): Extract<OpeningLeadSourceOption["effects"][number], { type: "learn_knowledge" }> {
  const effect = option.effects.find((candidate) => candidate.type === "learn_knowledge");
  if (!effect || effect.type !== "learn_knowledge") {
    throw new Error(`Opening lead-source option ${option.id} has no learned knowledge.`);
  }
  return effect;
}

function rememberedRelationshipEffect(
  option: OpeningLeadSourceOption,
): Extract<OpeningLeadSourceOption["effects"][number], { type: "remember_relationship" }> {
  const effect = option.effects.find((candidate) => candidate.type === "remember_relationship");
  if (!effect || effect.type !== "remember_relationship") {
    throw new Error(`Opening lead-source option ${option.id} has no relationship memory.`);
  }
  return effect;
}

describe("Albany opening lead-source authoring", () => {
  it("strictly parses the authored three-source scene with one default and two reports", () => {
    expect(OPENING_LEAD_SOURCE_MIN_OPTIONS).toBe(3);
    expect(OPENING_LEAD_SOURCE_MAX_OPTIONS).toBe(5);
    expect(openingLeadSource.options.map((option) => option.id)).toEqual([
      "albany:source_rowan_civic_docket",
      "albany:source_jamie_market_testimony",
      "albany:source_hayden_frost_report",
    ]);
    expect(openingLeadSource.options.map((option) => option.source_npc_id)).toEqual([
      "albany:rowan_quill",
      "albany:jamie_tanner",
      "albany:hayden_hale",
    ]);
    expect(openingLeadSource.options.filter((option) => option.effects.length === 0)).toHaveLength(
      1,
    );
    expect(
      openingLeadSource.options.filter((option) =>
        option.effects.some((effect) => effect.type === "learn_knowledge"),
      ),
    ).toHaveLength(2);

    expect(OpeningLeadSourceSchema.parse(openingLeadSource)).toEqual(openingLeadSource);
    expect(parseOpeningLeadSource(openingLeadSource)).toEqual(openingLeadSource);
    expect(parseOverworldManifest(structuredClone(world)).opening_lead_source).toEqual(
      openingLeadSource,
    );

    const clone = cloneOpeningLeadSource(openingLeadSource);
    expect(clone).not.toBe(openingLeadSource);
    expect(clone.options[0]).not.toBe(openingLeadSource.options[0]);
    clone.options[0]!.title = "Detached test title";
    expect(openingLeadSource.options[0]!.title).not.toBe("Detached test title");

    expect(() => parseOpeningLeadSource({ ...openingLeadSource, unexpected: true })).toThrow();
    expect(() =>
      OpeningLeadSourceOptionSchema.parse({
        ...openingLeadSource.options[0]!,
        terms: { ...openingLeadSource.options[0]!.terms, credit: true },
      }),
    ).toThrow();

    const duplicateIds = cloneOpeningLeadSource(openingLeadSource);
    duplicateIds.options[1]!.id = duplicateIds.options[0]!.id;
    expect(() => parseOpeningLeadSource(duplicateIds)).toThrow(/duplicate.*option id/i);

    expect(() =>
      parseOpeningLeadSource({
        ...openingLeadSource,
        options: openingLeadSource.options.slice(0, 2),
      }),
    ).toThrow();

    const noDefault = cloneOpeningLeadSource(openingLeadSource);
    noDefault.options[0]!.effects = [
      { type: "learn_knowledge", knowledge_id: "albany:knowledge_civic_docket" },
    ];
    expect(() => parseOpeningLeadSource(noDefault)).toThrow(/explicit.*default packet/i);

    const onlyOneReport = cloneOpeningLeadSource(openingLeadSource);
    onlyOneReport.options[2]!.effects = [];
    expect(() => parseOpeningLeadSource(onlyOneReport)).toThrow(/at least two.*reports/i);
  });

  it("resolves sponsor terms from registration memories and formats their exact cost", () => {
    const jamie = optionById(openingLeadSource, "albany:source_jamie_market_testimony");
    const hayden = optionById(openingLeadSource, "albany:source_hayden_frost_report");
    const rowan = optionById(openingLeadSource, "albany:source_rowan_civic_docket");

    const ledgerTerms = openingLeadSourceTerms(jamie, profileCharacter("albany:ledger_advocate"));
    expect(ledgerTerms).toEqual({
      minutes: 15,
      money: 0,
      sponsored: true,
      sponsorNote: expect.stringContaining("waiving $6"),
    });
    expect(Object.isFrozen(ledgerTerms)).toBe(true);
    expect(formatOpeningLeadSourceCost(ledgerTerms)).toBe("15 minutes and $0");

    expect(openingLeadSourceTerms(jamie, profileCharacter("albany:unaffiliated_courier"))).toEqual({
      minutes: 35,
      money: 6,
      sponsored: false,
      sponsorNote: null,
    });
    expect(openingLeadSourceTerms(hayden, profileCharacter("albany:road_warden"))).toEqual({
      minutes: 5,
      money: 0,
      sponsored: true,
      sponsorNote: expect.stringContaining("reduces the route-desk review"),
    });
    expect(openingLeadSourceTerms(hayden, profileCharacter("albany:ledger_advocate"))).toEqual({
      minutes: 20,
      money: 0,
      sponsored: false,
      sponsorNote: null,
    });
    expect(
      formatOpeningLeadSourceCost(
        openingLeadSourceTerms(rowan, profileCharacter("albany:unaffiliated_courier")),
      ),
    ).toBe("no added time and $0");

    expect(openingLeadSourceOptionById(openingLeadSource, "albany:source_missing")).toBeNull();
  });

  it("applies paid money, learned knowledge, and source memory as one detached result", () => {
    const source = profileCharacter("albany:unaffiliated_courier");
    const sourceBefore = cloneCampaignCharacterState(source);
    const sceneBefore = cloneOpeningLeadSource(openingLeadSource);
    const result = applyOpeningLeadSourceOption({
      scene: openingLeadSource,
      character: source,
      optionId: "albany:source_jamie_market_testimony",
    });

    expect(source).toEqual(sourceBefore);
    expect(openingLeadSource).toEqual(sceneBefore);
    expect(result.characterAfter).not.toBe(source);
    expect(result.characterAfter.money).toBe(source.money - 6);
    expect(result.characterAfter.knowledge).toContain("albany:knowledge_wolf_market_testimony");
    expect(result.characterAfter.relationships).toContainEqual({
      npcId: "albany:jamie_tanner",
      trust: 3,
      regard: 3,
      owesPlayer: 0,
      playerOwes: 0,
      memories: ["albany:memory_jamie_market_testimony_certified"],
    });
    expect(result.terms).toEqual({
      minutes: 35,
      money: 6,
      sponsored: false,
      sponsorNote: null,
    });
    expect(result).not.toHaveProperty("worldFactIds");

    const sponsored = applyOpeningLeadSourceOption({
      scene: openingLeadSource,
      character: profileCharacter("albany:ledger_advocate"),
      optionId: "albany:source_jamie_market_testimony",
    });
    expect(sponsored.characterAfter.money).toBe(25);
    expect(sponsored.characterAfter.knowledge).toContain("albany:knowledge_wolf_market_testimony");

    const underfunded = evolveCampaignCharacterState(source, (draft) => {
      draft.money = 5;
    });
    const underfundedBefore = cloneCampaignCharacterState(underfunded);
    expect(() =>
      applyOpeningLeadSourceOption({
        scene: openingLeadSource,
        character: underfunded,
        optionId: "albany:source_jamie_market_testimony",
      }),
    ).toThrow(/costs \$6.*only \$5/i);
    expect(underfunded).toEqual(underfundedBefore);
    expect(underfunded.knowledge).not.toContain("albany:knowledge_wolf_market_testimony");
  });

  it("rejects world facts and wounds because lead sources only gather reports", () => {
    const withWorldFact = cloneOpeningLeadSource(openingLeadSource);
    optionById(withWorldFact, "albany:source_jamie_market_testimony").effects.push({
      type: "set_world_fact",
      fact_id: "fact:opening_source_selected",
    });

    expect(() => parseOpeningLeadSource(withWorldFact)).toThrow(/not world facts/i);

    const rawWorld = structuredClone(world);
    rawWorld.opening_lead_source = withWorldFact;
    expect(() => parseOverworldManifest(rawWorld)).toThrow(/not world facts/i);

    const withWound = cloneOpeningLeadSource(openingLeadSource);
    optionById(withWound, "albany:source_jamie_market_testimony").effects.push({
      type: "suffer_wound",
      wound_id: "wound:opening_source_shortcut",
      severity: 2,
      treatment: "untreated",
      health_loss: 6,
    });
    expect(() => parseOpeningLeadSource(withWound)).toThrow(/not .*wounds/i);
  });

  it("enforces source, quest-import, contact-memory, and sponsor references", () => {
    expect(() => assertOverworldIntegrity(structuredClone(world))).not.toThrow();

    expectIntegrityFailure((scene) => {
      scene.after_registration = "albany:missing_registration";
    }, /must follow.*opening registration/i);
    expectIntegrityFailure((scene) => {
      scene.area = "albany_city__transport_hub";
    }, /share.*registration.*home and area/i);
    expectIntegrityFailure((scene) => {
      scene.target_quest = "missing_quest";
    }, /target an authored quest/i);
    expectIntegrityFailure((scene) => {
      optionById(scene, "albany:source_jamie_market_testimony").source_npc_id =
        "albany:missing_source";
    }, /unbound Albany source npc/i);
    expectIntegrityFailure((scene) => {
      const jamieKnowledge = learnedKnowledgeEffect(
        optionById(scene, "albany:source_jamie_market_testimony"),
      ).knowledge_id;
      learnedKnowledgeEffect(optionById(scene, "albany:source_hayden_frost_report")).knowledge_id =
        jamieKnowledge;
    }, /knowledge.*repeated across options/i);
    expectIntegrityFailure((scene) => {
      learnedKnowledgeEffect(optionById(scene, "albany:source_hayden_frost_report")).knowledge_id =
        "albany:knowledge_unimported_report";
    }, /no target-quest import consumer/i);
    expectIntegrityFailure((scene) => {
      rememberedRelationshipEffect(
        optionById(scene, "albany:source_jamie_market_testimony"),
      ).npc_id = "albany:rowan_quill";
    }, /different npc than its named source/i);
    expectIntegrityFailure((scene) => {
      rememberedRelationshipEffect(
        optionById(scene, "albany:source_jamie_market_testimony"),
      ).memory_id = "albany:memory_unconsumed_report";
    }, /memory.*no consuming contact variant/i);
    expectIntegrityFailure((scene) => {
      optionById(scene, "albany:source_jamie_market_testimony").sponsor!.memory_id =
        "albany:memory_missing_sponsor";
    }, /sponsor terms without a registration memory/i);
    expectIntegrityFailure((scene) => {
      delete optionById(scene, "albany:source_jamie_market_testimony").sponsor;
      delete optionById(scene, "albany:source_hayden_frost_report").sponsor;
    }, /at least one sponsor term mechanical/i);
  });
});
