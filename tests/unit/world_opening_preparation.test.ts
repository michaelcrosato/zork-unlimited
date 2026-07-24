import { describe, expect, it } from "vitest";

import {
  buildCampaignCharacterState,
  cloneCampaignCharacterState,
  type CampaignCharacterState,
} from "../../src/world/campaign_character_state.js";
import {
  OPENING_PREPARATION_MAX_PROFILES,
  OPENING_PREPARATION_MIN_PROFILES,
  OpeningPreparationProfileSchema,
  OpeningPreparationSchema,
  applyOpeningPreparationProfile,
  cloneOpeningPreparation,
  formatOpeningPreparationCost,
  openingPreparationProfileById,
  openingPreparationTerms,
  parseOpeningPreparation,
  type OpeningPreparation,
} from "../../src/world/opening_preparation.js";
import { presentOpeningPreparation } from "../../src/world/opening_preparation_presentation.js";
import { assertOverworldIntegrity, type OverworldManifest } from "../../src/world/overworld.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const SPONSOR_MEMORY = "albany:memory_civic_sponsorship";
const SHIPPED_WORLD = loadOverworldManifest(process.cwd());

function preparationScene(): OpeningPreparation {
  return parseOpeningPreparation({
    version: 1,
    id: "albany:wolf_winter_preparation",
    after_lead_source: "albany:wolf_source_priority",
    target_quest: "wolf_winter",
    home: "albany_city",
    area: "albany_city__civic_core",
    title: "Wolf-Winter preparation",
    message: "Choose the plan that will shape the expedition.",
    profiles: [
      {
        id: "albany:prepare_civic_works",
        title: "Civic works survey",
        provider_npc_id: "albany:reese_pryce",
        summary: "Reese walks you through the damaged waterworks ledger.",
        preview: "You will enter knowing which frozen valves matter.",
        consequence: "Reese remembers that you trusted the civic plan.",
        terms: { minutes: 25, money: 4 },
        sponsor: {
          memory_id: SPONSOR_MEMORY,
          minutes: 10,
          money: 1,
          note: "Your civic sponsorship shortens the survey and covers most of its fee.",
        },
        effects: [
          {
            type: "learn_knowledge",
            knowledge_id: "albany:knowledge_wolf_frozen_valves",
          },
          {
            type: "remember_relationship",
            npc_id: "albany:reese_pryce",
            memory_id: "albany:memory_reese_civic_plan",
            trust_at_least: 3,
          },
        ],
      },
      {
        id: "albany:prepare_drovers",
        title: "Drover relay",
        provider_npc_id: "albany:morgan_bell",
        summary: "Morgan maps the drovers who can move through a whiteout.",
        preview: "You will know the relay calls and fallback barns.",
        consequence: "Morgan remembers that you backed the road network.",
        terms: { minutes: 15, money: 0 },
        effects: [
          {
            type: "learn_knowledge",
            knowledge_id: "albany:knowledge_wolf_drover_relay",
          },
          {
            type: "remember_relationship",
            npc_id: "albany:morgan_bell",
            memory_id: "albany:memory_morgan_drover_plan",
            regard_at_least: 2,
          },
        ],
      },
      {
        id: "albany:prepare_relief_routes",
        title: "Relief-route hearing",
        provider_npc_id: "albany:avery_shaw",
        summary: "Avery reconstructs the relief committee's disputed route.",
        preview: "You will know which witnesses concealed a usable winter track.",
        consequence: "Avery remembers that you heard the committee out.",
        terms: { minutes: 0, money: 2 },
        effects: [
          {
            type: "learn_knowledge",
            knowledge_id: "albany:knowledge_wolf_relief_track",
          },
          {
            type: "remember_relationship",
            npc_id: "albany:avery_shaw",
            memory_id: "albany:memory_avery_relief_plan",
            owes_player_at_least: 1,
          },
        ],
      },
    ],
  });
}

function publicCharacter(money = 10): CampaignCharacterState {
  return buildCampaignCharacterState({
    money,
    equipment: [
      {
        equipmentId: "core:weathered_satchel",
        itemId: "core:weathered_satchel",
        quantity: 1,
        condition: 80,
        equipped: true,
      },
    ],
  });
}

function sponsoredCharacter(): CampaignCharacterState {
  return buildCampaignCharacterState({
    money: 10,
    relationships: [
      {
        npcId: "albany:rowan_quill",
        trust: 1,
        regard: 1,
        owesPlayer: 0,
        playerOwes: 0,
        memories: [SPONSOR_MEMORY],
      },
    ],
  });
}

describe("opening preparation authoring", () => {
  it("strictly parses three to five detached profiles", () => {
    const scene = preparationScene();

    expect(OPENING_PREPARATION_MIN_PROFILES).toBe(3);
    expect(OPENING_PREPARATION_MAX_PROFILES).toBe(5);
    expect(OpeningPreparationSchema.parse(scene)).toEqual(scene);

    const clone = cloneOpeningPreparation(scene);
    expect(clone).not.toBe(scene);
    expect(clone.profiles[0]).not.toBe(scene.profiles[0]);
    clone.profiles[0]!.title = "Detached title";
    expect(scene.profiles[0]!.title).toBe("Civic works survey");

    expect(() => parseOpeningPreparation({ ...scene, unexpected: true })).toThrow();
    expect(() =>
      OpeningPreparationProfileSchema.parse({
        ...scene.profiles[0]!,
        terms: { ...scene.profiles[0]!.terms, credit: true },
      }),
    ).toThrow();
    expect(() =>
      parseOpeningPreparation({ ...scene, profiles: scene.profiles.slice(0, 2) }),
    ).toThrow();

    const five = cloneOpeningPreparation(scene);
    const fourth = structuredClone(five.profiles[0]!);
    fourth.id = "albany:prepare_watch_briefing";
    fourth.provider_npc_id = "albany:devon_crowe";
    fourth.effects = [
      { type: "learn_knowledge", knowledge_id: "albany:knowledge_wolf_watch_signals" },
      {
        type: "remember_relationship",
        npc_id: "albany:devon_crowe",
        memory_id: "albany:memory_devon_watch_plan",
      },
    ];
    const fifth = structuredClone(fourth);
    fifth.id = "albany:prepare_river_briefing";
    fifth.provider_npc_id = "albany:sage_morrow";
    fifth.effects = [
      { type: "learn_knowledge", knowledge_id: "albany:knowledge_wolf_river_signals" },
      {
        type: "remember_relationship",
        npc_id: "albany:sage_morrow",
        memory_id: "albany:memory_sage_river_plan",
      },
    ];
    five.profiles.push(fourth, fifth);
    expect(parseOpeningPreparation(five).profiles).toHaveLength(5);

    const six = cloneOpeningPreparation(five);
    const sixth = structuredClone(fifth);
    sixth.id = "albany:prepare_sixth_briefing";
    sixth.provider_npc_id = "albany:taylor_finch";
    sixth.effects = [
      { type: "learn_knowledge", knowledge_id: "albany:knowledge_wolf_sixth_signals" },
      {
        type: "remember_relationship",
        npc_id: "albany:taylor_finch",
        memory_id: "albany:memory_taylor_sixth_plan",
      },
    ];
    six.profiles.push(sixth);
    expect(() => parseOpeningPreparation(six)).toThrow();
  });

  it("rejects ambiguous, non-persistent, and non-provider effects", () => {
    const duplicateIds = preparationScene();
    duplicateIds.profiles[1]!.id = duplicateIds.profiles[0]!.id;
    expect(() => parseOpeningPreparation(duplicateIds)).toThrow(/duplicate.*profile id/i);

    const repeatedKnowledge = preparationScene();
    const firstKnowledge = repeatedKnowledge.profiles[0]!.effects.find(
      (effect) => effect.type === "learn_knowledge",
    );
    const secondKnowledge = repeatedKnowledge.profiles[1]!.effects.find(
      (effect) => effect.type === "learn_knowledge",
    );
    if (!firstKnowledge || !secondKnowledge) throw new Error("expected preparation knowledge");
    secondKnowledge.knowledge_id = firstKnowledge.knowledge_id;
    expect(() => parseOpeningPreparation(repeatedKnowledge)).toThrow(
      /knowledge.*repeated across profiles/i,
    );

    const worldFact = preparationScene();
    worldFact.profiles[0]!.effects.push({
      type: "set_world_fact",
      fact_id: "fact:winter_plan_selected",
    });
    expect(() => parseOpeningPreparation(worldFact)).toThrow(/not world facts/i);

    const wound = preparationScene();
    wound.profiles[0]!.effects.push({
      type: "suffer_wound",
      wound_id: "wound:opening_preparation_shortcut",
      severity: 2,
      treatment: "untreated",
      health_loss: 6,
    });
    expect(() => parseOpeningPreparation(wound)).toThrow(/not .*wounds/i);

    const noKnowledge = preparationScene();
    noKnowledge.profiles[0]!.effects = noKnowledge.profiles[0]!.effects.filter(
      (effect) => effect.type !== "learn_knowledge",
    );
    expect(() => parseOpeningPreparation(noKnowledge)).toThrow(/must teach.*knowledge/i);

    const noRelationship = preparationScene();
    noRelationship.profiles[0]!.effects = noRelationship.profiles[0]!.effects.filter(
      (effect) => effect.type !== "remember_relationship",
    );
    expect(() => parseOpeningPreparation(noRelationship)).toThrow(/provider relationship memory/i);

    const wrongProvider = preparationScene();
    const relationship = wrongProvider.profiles[0]!.effects.find(
      (effect) => effect.type === "remember_relationship",
    );
    if (!relationship) throw new Error("expected preparation relationship");
    relationship.npc_id = "albany:someone_else";
    expect(() => parseOpeningPreparation(wrongProvider)).toThrow(/named provider/i);
  });

  it("requires sponsor terms to be a real discount from public terms", () => {
    const moreExpensive = preparationScene();
    moreExpensive.profiles[0]!.sponsor!.money = 5;
    expect(() => parseOpeningPreparation(moreExpensive)).toThrow(/cannot cost more/i);

    const equal = preparationScene();
    equal.profiles[0]!.sponsor = {
      ...equal.profiles[0]!.sponsor!,
      ...equal.profiles[0]!.terms,
    };
    expect(() => parseOpeningPreparation(equal)).toThrow(/must change time or money/i);
  });
});

describe("opening preparation application and presentation", () => {
  it("resolves exact public and sponsor terms", () => {
    const scene = preparationScene();
    const profile = scene.profiles[0]!;

    const publicTerms = openingPreparationTerms(profile, publicCharacter());
    expect(publicTerms).toEqual({
      minutes: 25,
      money: 4,
      sponsored: false,
      sponsorNote: null,
    });
    expect(Object.isFrozen(publicTerms)).toBe(true);
    expect(formatOpeningPreparationCost(publicTerms)).toBe("25 minutes and $4");

    const sponsored = openingPreparationTerms(profile, sponsoredCharacter());
    expect(sponsored).toEqual({
      minutes: 10,
      money: 1,
      sponsored: true,
      sponsorNote: "Your civic sponsorship shortens the survey and covers most of its fee.",
    });
    expect(formatOpeningPreparationCost(sponsored)).toBe("10 minutes and $1");
    expect(
      formatOpeningPreparationCost(openingPreparationTerms(scene.profiles[1]!, publicCharacter())),
    ).toBe("15 minutes and $0");
    expect(
      formatOpeningPreparationCost(openingPreparationTerms(scene.profiles[2]!, publicCharacter())),
    ).toBe("no added time and $2");

    const found = openingPreparationProfileById(scene, profile.id);
    expect(found).toEqual(profile);
    expect(found).not.toBe(profile);
    expect(openingPreparationProfileById(scene, "albany:prepare_missing")).toBeNull();
  });

  it("applies money, knowledge, and provider memory atomically without equipment", () => {
    const scene = preparationScene();
    const source = publicCharacter();
    const sourceBefore = cloneCampaignCharacterState(source);
    const sceneBefore = cloneOpeningPreparation(scene);

    const result = applyOpeningPreparationProfile({
      scene,
      character: source,
      profileId: "albany:prepare_civic_works",
    });

    expect(source).toEqual(sourceBefore);
    expect(scene).toEqual(sceneBefore);
    expect(result.characterAfter).not.toBe(source);
    expect(result.characterAfter.money).toBe(6);
    expect(result.characterAfter.equipment).toEqual(source.equipment);
    expect(result.characterAfter.knowledge).toContain("albany:knowledge_wolf_frozen_valves");
    expect(result.characterAfter.relationships).toContainEqual({
      npcId: "albany:reese_pryce",
      trust: 3,
      regard: 0,
      owesPlayer: 0,
      playerOwes: 0,
      memories: ["albany:memory_reese_civic_plan"],
    });
    expect(result.terms).toMatchObject({ minutes: 25, money: 4, sponsored: false });
    expect(result).not.toHaveProperty("worldFactIds");

    const sponsored = applyOpeningPreparationProfile({
      scene,
      character: sponsoredCharacter(),
      profileId: "albany:prepare_civic_works",
    });
    expect(sponsored.characterAfter.money).toBe(9);
    expect(sponsored.terms).toMatchObject({ minutes: 10, money: 1, sponsored: true });

    const underfunded = publicCharacter(3);
    const underfundedBefore = cloneCampaignCharacterState(underfunded);
    expect(() =>
      applyOpeningPreparationProfile({
        scene,
        character: underfunded,
        profileId: "albany:prepare_civic_works",
      }),
    ).toThrow(/costs \$4.*only \$3/i);
    expect(underfunded).toEqual(underfundedBefore);
    expect(underfunded.knowledge).not.toContain("albany:knowledge_wolf_frozen_valves");

    expect(() =>
      applyOpeningPreparationProfile({
        scene,
        character: source,
        profileId: "albany:prepare_missing",
      }),
    ).toThrow(/unknown opening preparation profile/i);
    expect(source).toEqual(sourceBefore);
  });

  it("presents every finite plan with visible actual terms and consequences", () => {
    const scene = preparationScene();
    const publicPrompt = presentOpeningPreparation(scene, publicCharacter());

    expect(publicPrompt).toMatchObject({
      id: scene.id,
      kind: "preparation",
      message: "Wolf-Winter preparation. Choose the plan that will shape the expedition.",
    });
    expect(publicPrompt.options).toHaveLength(3);
    expect(publicPrompt.options[0]).toEqual({
      id: "albany:prepare_civic_works",
      label: "Civic works survey",
      summary: {
        commitment: "Reese walks you through the damaged waterworks ledger.",
        fieldTrigger: "You will enter knowing which frozen valves matter.",
        immediateCost: "25 minutes and $4",
      },
      consequence:
        "Reese walks you through the damaged waterworks ledger. You will enter knowing which frozen valves matter. Actual cost: 25 minutes and $4. Reese remembers that you trusted the civic plan.",
    });
    expect(publicPrompt.options[0]!.summary).not.toHaveProperty("fieldTriggerScope");
    expect(publicPrompt.options[0]!.consequence).not.toContain("Full field terms:");
    expect(publicPrompt.options[0]!.consequence.match(/frozen valves matter/g)).toHaveLength(1);
    expect(Object.isFrozen(publicPrompt)).toBe(true);
    expect(Object.isFrozen(publicPrompt.options)).toBe(true);
    expect(Object.isFrozen(publicPrompt.options[0])).toBe(true);

    const sponsoredPrompt = presentOpeningPreparation(scene, sponsoredCharacter());
    expect(sponsoredPrompt.options[0]!.consequence).toContain(
      "Actual cost: 10 minutes and $1. Your civic sponsorship shortens the survey and covers most of its fee.",
    );
  });
});

describe("opening preparation manifest integrity", () => {
  function shippedScene(draft: OverworldManifest) {
    const scene = draft.opening_preparation;
    if (!scene) throw new Error("expected the shipped opening preparation");
    return scene;
  }

  function expectIntegrityFailure(
    mutate: (draft: OverworldManifest) => void,
    pattern: RegExp,
  ): void {
    const draft = structuredClone(SHIPPED_WORLD);
    mutate(draft);
    expect(() => assertOverworldIntegrity(draft)).toThrow(pattern);
  }

  it("binds the scene, providers, imports, contact memories, sponsors, and services", () => {
    expect(() => assertOverworldIntegrity(structuredClone(SHIPPED_WORLD))).not.toThrow();

    expectIntegrityFailure((draft) => {
      shippedScene(draft).after_lead_source = "albany:missing_lead";
    }, /must follow.*opening lead source/i);
    expectIntegrityFailure((draft) => {
      shippedScene(draft).area = "albany_city__market";
    }, /occupy.*target quest.*departure area/i);
    expectIntegrityFailure((draft) => {
      shippedScene(draft).target_quest = "missing_quest";
    }, /share.*lead source.*target quest/i);
    expectIntegrityFailure((draft) => {
      shippedScene(draft).profiles[0]!.provider_npc_id = "albany:missing_provider";
    }, /unbound Albany provider npc/i);
    expectIntegrityFailure((draft) => {
      const knowledge = shippedScene(draft).profiles[0]!.effects.find(
        (effect) => effect.type === "learn_knowledge",
      );
      if (!knowledge || knowledge.type !== "learn_knowledge") throw new Error("missing knowledge");
      knowledge.knowledge_id = "albany:knowledge_unimported_preparation";
    }, /no target-quest import consumer/i);
    expectIntegrityFailure((draft) => {
      const relationship = shippedScene(draft).profiles[0]!.effects.find(
        (effect) => effect.type === "remember_relationship",
      );
      if (!relationship || relationship.type !== "remember_relationship") {
        throw new Error("missing provider memory");
      }
      relationship.memory_id = "albany:memory_unconsumed_preparation";
    }, /memory.*no consuming contact variant/i);
    expectIntegrityFailure((draft) => {
      shippedScene(draft).profiles[0]!.sponsor!.memory_id = "albany:memory_missing_sponsor";
    }, /sponsor terms without a registration memory/i);
    expectIntegrityFailure((draft) => {
      for (const profile of shippedScene(draft).profiles) delete profile.sponsor;
    }, /at least one sponsor term mechanical/i);
    expectIntegrityFailure((draft) => {
      shippedScene(draft).profiles[0]!.terms.money = 100;
    }, /costs \$100/i);
    expectIntegrityFailure((draft) => {
      const rule = draft.campaign_service_rules?.find((candidate) =>
        candidate.requires_all_story_choices?.some(
          (ref) => ref.story_choice_id === shippedScene(draft).id,
        ),
      );
      if (!rule?.requires_all_story_choices?.[0]) throw new Error("missing preparation service");
      rule.requires_all_story_choices[0].choice_id = "albany:prep_missing";
    }, /unauthored story choice/i);
  });
});
