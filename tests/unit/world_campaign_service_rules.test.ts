import { describe, expect, it } from "vitest";

import {
  CampaignServiceRuleSchema,
  CampaignServiceRulesSchema,
  resolveActiveCampaignServiceRules,
  resolveCampaignServiceRules,
  resolveParsedActiveCampaignServiceRules,
  type CampaignServiceRule,
} from "../../src/world/campaign_service_rules.js";
import {
  assertOverworldIntegrity,
  parseOverworldManifest,
  type OverworldManifest,
} from "../../src/world/overworld.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import {
  planOverworldSessionTownCare,
  planOverworldSessionTownResupply,
} from "../../src/world/session_service_lifecycle.js";
import { buildCampaignCharacterState } from "../../src/world/campaign_character_state.js";

const WORLD = loadOverworldManifest(process.cwd());
const KNOWN_WORLD_FACT = "fact:wolf_winter_repair_timber_available";
const WAGON_STORY_CHOICE = {
  story_choice_id: "albany_dawn_dispatch",
  choice_id: "send_wagon_to_cade",
} as const;
const WARDENS_STORY_CHOICE = {
  story_choice_id: "albany_dawn_dispatch",
  choice_id: "send_wardens_north",
} as const;

function serviceRule(overrides: Partial<CampaignServiceRule> = {}): CampaignServiceRule {
  return {
    id: "service:test_relief_rest",
    home: "albany_city",
    area: "albany_city__transport_hub",
    action: "rest",
    title: "Relief-room rest",
    summary: "An unused relief room is ready beside the dispatch desk.",
    minutes: 30,
    requires_all_world_facts: [KNOWN_WORLD_FACT],
    ...overrides,
  };
}

function worldWithRule(rule: CampaignServiceRule): OverworldManifest {
  const world = structuredClone(WORLD);
  delete world.opening_ally;
  delete world.opening_relief_oath;
  if (world.opening_registration) delete world.opening_registration.doctrines;
  world.campaign_service_rules = [rule];
  return world;
}

function openingServiceWitness(world: OverworldManifest) {
  const ally = world.opening_ally;
  const relationship = world.opening_registration?.profiles[0]?.character.relationships.find(
    (candidate) => candidate.memories.length > 0,
  );
  if (!ally || !relationship) throw new Error("expected an opening ally and relationship memory");
  return {
    companionId: ally.ally_npc_id,
    memory: { npc_id: relationship.npcId, memory_id: relationship.memories[0]! },
  };
}

describe("campaign service-rule authoring", () => {
  it("requires care to bind an exact source wound and permits no rest/resupply mutations", () => {
    const care = {
      id: "service:test_wound_care",
      home: "albany_city",
      area: "albany_city__transport_hub",
      action: "care",
      title: "Treat the witnessed wound",
      summary: "The Station aid room treats one exact witnessed wound.",
      minutes: 45,
      requires_all_world_facts: ["fact:wolf_winter_courier_wounded"],
      character_conditions: {
        requires_all_wounds: [
          {
            wound_id: "wound:wolf_winter_byre_mouth_gate",
            treatment: "untreated",
          },
        ],
      },
      effects: [
        {
          type: "treat_wound",
          wound_id: "wound:wolf_winter_byre_mouth_gate",
          from_treatment: "untreated",
          to_treatment: "treated",
          health_restore: 6,
        },
      ],
    } as const;
    expect(CampaignServiceRuleSchema.parse(care)).toEqual(care);
    expect(() =>
      CampaignServiceRuleSchema.parse({
        ...care,
        character_conditions: undefined,
      }),
    ).toThrow(/requires exact campaign character conditions/i);
    expect(() =>
      CampaignServiceRuleSchema.parse({
        ...care,
        character_conditions: {
          requires_all_wounds: [
            {
              wound_id: "wound:wolf_winter_byre_mouth_gate",
              treatment: "stabilized",
            },
          ],
        },
      }),
    ).toThrow(/must require wound.*source treatment/i);
    expect(() =>
      CampaignServiceRuleSchema.parse({
        ...serviceRule(),
        effects: care.effects,
      }),
    ).toThrow(/cannot mutate campaign character state/i);

    const character = buildCampaignCharacterState({
      health: { current: 24, max: 30 },
      wounds: [
        {
          woundId: "wound:wolf_winter_byre_mouth_gate",
          severity: 2,
          treatment: "untreated",
        },
      ],
    });
    expect(
      planOverworldSessionTownCare({
        currentTown: { id: "albany_city", name: "Albany", services: [] },
        currentAreaId: "albany_city__transport_hub",
        campaignServiceRules: [CampaignServiceRuleSchema.parse(care)],
        campaignWorldFactIds: ["fact:wolf_winter_courier_wounded"],
        consumedCampaignServiceRuleIds: [],
        campaignCharacter: character,
        supplies: 2,
        fatigue: 17,
      }),
    ).toMatchObject({
      action: "care",
      minutes: 45,
      suppliesBefore: 2,
      suppliesAfter: 2,
      fatigueBefore: 17,
      fatigueAfter: 17,
      characterAfter: {
        health: { current: 30, max: 30 },
        wounds: [
          {
            woundId: "wound:wolf_winter_byre_mouth_gate",
            severity: 2,
            treatment: "treated",
          },
        ],
      },
    });
  });

  it("strictly parses bounded, fact-conditioned one-time rules", () => {
    const authored = serviceRule();
    const parsed = CampaignServiceRuleSchema.parse(authored);
    expect(parsed).toEqual(authored);
    expect(parsed).not.toBe(authored);

    expect(() => CampaignServiceRuleSchema.parse({ ...serviceRule(), unexpected: true })).toThrow();
    expect(() => CampaignServiceRuleSchema.parse({ ...serviceRule(), action: "repair" })).toThrow();
    expect(() => CampaignServiceRuleSchema.parse({ ...serviceRule(), title: "   " })).toThrow(
      /cannot be blank/i,
    );
    expect(() => CampaignServiceRuleSchema.parse({ ...serviceRule(), minutes: 0 })).toThrow();
    expect(() =>
      CampaignServiceRuleSchema.parse({ ...serviceRule(), requires_all_world_facts: [] }),
    ).toThrow();
    expect(() =>
      CampaignServiceRuleSchema.parse({
        ...serviceRule(),
        requires_all_world_facts: [KNOWN_WORLD_FACT, KNOWN_WORLD_FACT],
      }),
    ).toThrow(/duplicate.*world fact/i);
    expect(() =>
      CampaignServiceRuleSchema.parse({
        ...serviceRule(),
        forbids_any_world_facts: [KNOWN_WORLD_FACT],
      }),
    ).toThrow(/both require and forbid/i);
    expect(() =>
      CampaignServiceRuleSchema.parse({
        ...serviceRule(),
        requires_all_promises: [
          { promise_id: "promise:test", status: "active" },
          { promise_id: "promise:test", status: "kept" },
        ],
      }),
    ).toThrow(/repeat promise/i);

    expect(() => CampaignServiceRulesSchema.parse([serviceRule(), serviceRule()])).toThrow(
      /duplicate.*rule id/i,
    );
    expect(() =>
      CampaignServiceRulesSchema.parse([
        serviceRule({
          id: "service:first_predicate",
          requires_all_world_facts: [KNOWN_WORLD_FACT, "fact:second_condition"],
          forbids_any_world_facts: ["fact:first_blocker", "fact:second_blocker"],
        }),
        serviceRule({
          id: "service:second_predicate",
          requires_all_world_facts: ["fact:second_condition", KNOWN_WORLD_FACT],
          forbids_any_world_facts: ["fact:second_blocker", "fact:first_blocker"],
        }),
      ]),
    ).toThrow(/same normalized activation predicate/i);

    const nestedConditions: NonNullable<CampaignServiceRule["character_conditions"]> = {
      requires_all_companions: ["npc:field_guide", "npc:station_medic"],
      forbids_any_companions: ["npc:wolf_scout", "npc:winter_deserter"],
      requires_all_promises: [
        { promise_id: "promise:bring_medicine", status: "active" },
        { promise_id: "promise:hold_the_line", status: "kept" },
      ],
      requires_all_relationship_memories: [
        { npc_id: "npc:field_guide", memory_id: "memory:shared_map" },
        { npc_id: "npc:station_medic", memory_id: "memory:witnessed_wound" },
      ],
      forbids_any_relationship_memories: [
        { npc_id: "npc:wolf_scout", memory_id: "memory:betrayed_pack" },
        { npc_id: "npc:winter_deserter", memory_id: "memory:refused_shelter" },
      ],
      requires_all_wounds: [
        { wound_id: "wound:frostbite", treatment: "stabilized" },
        { wound_id: "wound:wolf_bite", treatment: "untreated" },
      ],
      forbids_any_wounds: [
        { wound_id: "wound:broken_arm", treatment: "untreated" },
        { wound_id: "wound:old_burn", treatment: "treated" },
      ],
    };
    const reorderedConditions = structuredClone(nestedConditions);
    reorderedConditions.requires_all_companions?.reverse();
    reorderedConditions.forbids_any_companions?.reverse();
    reorderedConditions.requires_all_promises?.reverse();
    reorderedConditions.requires_all_relationship_memories?.reverse();
    reorderedConditions.forbids_any_relationship_memories?.reverse();
    reorderedConditions.requires_all_wounds?.reverse();
    reorderedConditions.forbids_any_wounds?.reverse();

    expect(() =>
      CampaignServiceRulesSchema.parse([
        serviceRule({
          id: "service:first_nested_predicate",
          character_conditions: nestedConditions,
        }),
        serviceRule({
          id: "service:second_nested_predicate",
          character_conditions: reorderedConditions,
        }),
      ]),
    ).toThrow(/same normalized activation predicate/i);

    expect(() =>
      CampaignServiceRuleSchema.parse(
        serviceRule({
          requires_all_world_facts: undefined,
          requires_all_story_choices: [WAGON_STORY_CHOICE],
        }),
      ),
    ).not.toThrow();
    expect(() =>
      CampaignServiceRuleSchema.parse(serviceRule({ requires_all_world_facts: undefined })),
    ).toThrow(/at least one positive campaign condition/i);
    expect(() =>
      CampaignServiceRuleSchema.parse(
        serviceRule({
          requires_all_world_facts: undefined,
          requires_all_story_choices: [WAGON_STORY_CHOICE, WAGON_STORY_CHOICE],
        }),
      ),
    ).toThrow(/duplicate.*story choice/i);
    expect(() =>
      CampaignServiceRuleSchema.parse(
        serviceRule({
          requires_all_world_facts: undefined,
          requires_all_story_choices: [WAGON_STORY_CHOICE, WARDENS_STORY_CHOICE],
        }),
      ),
    ).toThrow(/mutually exclusive choices/i);
    expect(() =>
      CampaignServiceRuleSchema.parse(
        serviceRule({
          requires_all_world_facts: undefined,
          requires_all_story_choices: [WAGON_STORY_CHOICE],
          forbids_any_story_choices: [WAGON_STORY_CHOICE],
        }),
      ),
    ).toThrow(/both require and forbid/i);
  });

  it("distinguishes impossible required job options from valid forbidden-any option sets", () => {
    const first = { job_id: "job:test", option_id: "first" };
    const second = { job_id: "job:test", option_id: "second" };
    expect(() =>
      CampaignServiceRuleSchema.parse(
        serviceRule({ requires_all_local_job_options: [first, second] }),
      ),
    ).toThrow(/cannot require mutually exclusive local-job options/i);
    expect(() =>
      CampaignServiceRuleSchema.parse(
        serviceRule({ forbids_any_local_job_options: [first, second] }),
      ),
    ).not.toThrow();
    expect(() =>
      CampaignServiceRuleSchema.parse(
        serviceRule({ forbids_any_local_job_options: [first, first] }),
      ),
    ).toThrow(/duplicate forbidden campaign service local-job option/i);
  });

  it("binds manifest rules to an authored town, area, and trusted quest-export fact", () => {
    const valid = worldWithRule(serviceRule());
    expect(parseOverworldManifest(valid).campaign_service_rules).toEqual(
      valid.campaign_service_rules,
    );
    expect(() => assertOverworldIntegrity(valid)).not.toThrow();

    expect(() =>
      assertOverworldIntegrity(worldWithRule(serviceRule({ home: "missing_town" }))),
    ).toThrow(/missing home node/i);
    expect(() =>
      assertOverworldIntegrity(worldWithRule(serviceRule({ area: "missing_area" }))),
    ).toThrow(/missing area/i);

    const foreignArea = WORLD.areas.find((area) => area.home !== "albany_city");
    if (!foreignArea) throw new Error("The shipped overworld needs a non-Albany test area.");
    expect(() =>
      assertOverworldIntegrity(worldWithRule(serviceRule({ area: foreignArea.id }))),
    ).toThrow(/outside its home town/i);
    expect(() =>
      assertOverworldIntegrity(
        worldWithRule(
          serviceRule({ requires_all_world_facts: ["fact:unauthored_service_condition"] }),
        ),
      ),
    ).toThrow(/unauthored world fact/i);
    expect(() =>
      assertOverworldIntegrity(
        worldWithRule(
          serviceRule({
            character_conditions: {
              requires_all_companions: ["npc:unauthored_service_companion"],
            },
          }),
        ),
      ),
    ).toThrow(/unauthored companion/i);
    expect(() =>
      assertOverworldIntegrity(
        worldWithRule(
          serviceRule({
            character_conditions: {
              requires_all_promises: [
                { promise_id: "promise:unauthored_service_promise", status: "active" },
              ],
            },
          }),
        ),
      ),
    ).toThrow(/unauthored promise/i);
  });

  it("accepts staged care from an authored wound source and rejects disconnected stages", () => {
    const stabilize = CampaignServiceRuleSchema.parse({
      id: "service:test_wound_stabilize",
      home: "albany_city",
      area: "albany_city__transport_hub",
      action: "care",
      title: "Stabilize the courier wound",
      summary: "The Station medic braces the witnessed bite before it worsens.",
      minutes: 30,
      requires_all_world_facts: ["fact:wolf_winter_courier_wounded"],
      character_conditions: {
        requires_all_wounds: [
          { wound_id: "wound:wolf_winter_byre_mouth_gate", treatment: "untreated" },
        ],
      },
      effects: [
        {
          type: "treat_wound",
          wound_id: "wound:wolf_winter_byre_mouth_gate",
          from_treatment: "untreated",
          to_treatment: "stabilized",
          health_restore: 3,
        },
      ],
    });
    const finish = CampaignServiceRuleSchema.parse({
      ...stabilize,
      id: "service:test_wound_finish",
      title: "Finish the courier treatment",
      summary: "The medic can finish care after the wound has been stabilized.",
      character_conditions: {
        requires_all_wounds: [
          { wound_id: "wound:wolf_winter_byre_mouth_gate", treatment: "stabilized" },
        ],
      },
      effects: [
        {
          type: "treat_wound",
          wound_id: "wound:wolf_winter_byre_mouth_gate",
          from_treatment: "stabilized",
          to_treatment: "treated",
          health_restore: 3,
        },
      ],
    });

    const staged = worldWithRule(stabilize);
    staged.campaign_service_rules?.push(finish);
    expect(() => assertOverworldIntegrity(staged)).not.toThrow();

    expect(() => assertOverworldIntegrity(worldWithRule(finish))).toThrow(
      /treats unauthored source wound.*wound:wolf_winter_byre_mouth_gate:stabilized/i,
    );
  });

  it("binds story predicates and named providers to canonical campaign authoring", () => {
    const valid = serviceRule({
      home: "albany_city",
      area: "albany_city__market",
      provider_character_id: "albany_city__market__contact",
      requires_all_world_facts: undefined,
      requires_all_story_choices: [WAGON_STORY_CHOICE],
    });
    expect(() => assertOverworldIntegrity(worldWithRule(valid))).not.toThrow();

    expect(() =>
      assertOverworldIntegrity(
        worldWithRule({
          ...valid,
          requires_all_story_choices: [
            { story_choice_id: "albany_dawn_dispatch", choice_id: "invented_dispatch" },
          ],
        }),
      ),
    ).toThrow(/unauthored story choice/i);
    expect(() =>
      assertOverworldIntegrity(
        worldWithRule({ ...valid, provider_character_id: "albany_city__missing_provider" }),
      ),
    ).toThrow(/missing provider/i);
    expect(() =>
      assertOverworldIntegrity(
        worldWithRule({
          ...valid,
          provider_character_id: "albany_city__greenway__contact",
        }),
      ),
    ).toThrow(/provider.*outside/i);
  });

  it("rejects ally predicates that no canonical pre- or post-Wolf state can satisfy", () => {
    const released = structuredClone(WORLD);
    const releasedRule = released.campaign_service_rules?.find(
      (rule) => rule.id === "albany:june_kept_line_station_resupply",
    );
    const releasedPromise = releasedRule?.requires_all_promises?.[0];
    if (!releasedPromise) throw new Error("expected June's kept-line service predicate");
    releasedPromise.status = "released";
    expect(() => assertOverworldIntegrity(released)).toThrow(
      /opening promise or companion conditions unreachable.*canonical pre-Wolf and post-Wolf/i,
    );

    const brokenWithJune = structuredClone(WORLD);
    const brokenRule = brokenWithJune.campaign_service_rules?.find(
      (rule) => rule.id === "albany:june_kept_line_station_resupply",
    );
    const brokenPromise = brokenRule?.requires_all_promises?.[0];
    if (!brokenPromise) throw new Error("expected June's kept-line service predicate");
    brokenPromise.status = "broken";
    expect(() => assertOverworldIntegrity(brokenWithJune)).toThrow(
      /opening promise or companion conditions unreachable.*canonical pre-Wolf and post-Wolf/i,
    );
  });

  it("keeps later-location memory and story predicates when detecting collisions", () => {
    const world = structuredClone(WORLD);
    const witness = openingServiceWitness(world);
    const laterRule = serviceRule({
      id: "service:test_later_wardens",
      home: "saratoga_springs_city",
      area: "saratoga_springs_city__market",
      requires_all_world_facts: undefined,
      requires_all_story_choices: [WARDENS_STORY_CHOICE],
      requires_all_companions: [witness.companionId],
    });
    world.campaign_service_rules = [
      serviceRule({
        id: "service:test_first_wagon",
        home: "saratoga_springs_city",
        area: "saratoga_springs_city__civic_core",
        requires_all_world_facts: undefined,
        requires_all_story_choices: [WAGON_STORY_CHOICE],
      }),
      ...(world.campaign_service_rules ?? []),
      laterRule,
      serviceRule({
        ...laterRule,
        id: "service:test_later_wardens_memory_collision",
        character_conditions: {
          requires_all_relationship_memories: [witness.memory],
        },
      }),
    ];
    const before = JSON.stringify(world);

    expect(() => assertOverworldIntegrity(world)).toThrow(
      /both resolve for action "rest".*saratoga_springs_city__market/i,
    );
    expect(JSON.stringify(world)).toBe(before);
  });

  it("revalidates edited dawn-choice predicates without merging character states", () => {
    const world = structuredClone(WORLD);
    const witness = openingServiceWitness(world);
    const wagon = serviceRule({
      id: "service:test_market_wagon",
      home: "saratoga_springs_city",
      area: "saratoga_springs_city__market",
      requires_all_world_facts: undefined,
      requires_all_story_choices: [WAGON_STORY_CHOICE],
      requires_all_companions: [witness.companionId],
    });
    const wardens = serviceRule({
      ...wagon,
      id: "service:test_market_wardens",
      requires_all_story_choices: [WARDENS_STORY_CHOICE],
      character_conditions: {
        requires_all_relationship_memories: [witness.memory],
      },
    });
    world.campaign_service_rules = [...(world.campaign_service_rules ?? []), wagon, wardens];

    // These mutually exclusive choices can follow the same character outcome.
    const before = JSON.stringify(world);
    expect(() => assertOverworldIntegrity(world)).not.toThrow();
    expect(JSON.stringify(world)).toBe(before);
    wardens.requires_all_story_choices = [WAGON_STORY_CHOICE];
    const edited = JSON.stringify(world);
    expect(() => assertOverworldIntegrity(world)).toThrow(
      /both resolve for action "rest".*saratoga_springs_city__market/i,
    );
    expect(JSON.stringify(world)).toBe(edited);
  });

  it("rejects distinct service predicates that collide in a canonical return state", () => {
    const world = structuredClone(WORLD);
    const keptRule = world.campaign_service_rules?.find(
      (rule) => rule.id === "albany:june_kept_line_station_resupply",
    );
    if (!keptRule || !world.campaign_service_rules) {
      throw new Error("expected June's kept-line service predicate");
    }
    world.campaign_service_rules.push({
      ...structuredClone(keptRule),
      id: "albany:june_whole_herd_station_resupply_collision",
      title: "Duplicate returned field stores",
      summary: "A second claim cannot occupy June's returned-store action.",
      requires_all_world_facts: [
        ...(keptRule.requires_all_world_facts ?? []),
        "fact:wolf_winter_cattle_whole",
      ],
    });

    expect(() => assertOverworldIntegrity(world)).toThrow(
      /both resolve for action "resupply".*transport_hub/i,
    );
  });
});

describe("campaign service-rule resolution", () => {
  it("filters by location, trusted facts, forbidden facts, and consumed ids", () => {
    const rules = [
      serviceRule({ id: "service:z_rest" }),
      serviceRule({
        id: "service:a_resupply",
        action: "resupply",
        title: "Relief stores",
      }),
      serviceRule({ id: "service:other_town", home: "syracuse_city" }),
      serviceRule({ id: "service:other_area", area: "albany_city__market" }),
      serviceRule({
        id: "service:forbidden",
        action: "resupply",
        forbids_any_world_facts: ["fact:service_blocked"],
      }),
      serviceRule({
        id: "service:consumed",
        requires_all_world_facts: [KNOWN_WORLD_FACT, "fact:consumed_requirement"],
      }),
      serviceRule({
        id: "service:missing_fact",
        action: "resupply",
        requires_all_world_facts: [KNOWN_WORLD_FACT, "fact:second_requirement"],
      }),
    ];

    const offers = resolveCampaignServiceRules({
      rules,
      currentTownId: "albany_city",
      currentAreaId: "albany_city__transport_hub",
      worldFactIds: new Set([
        KNOWN_WORLD_FACT,
        "fact:service_blocked",
        "fact:consumed_requirement",
      ]),
      consumedRuleIds: new Set(["service:consumed"]),
    });

    expect(offers.map((offer) => offer.id)).toEqual(["service:z_rest", "service:a_resupply"]);
  });

  it("feeds a resolved canonical rule into core service planning", () => {
    const rule = serviceRule({
      id: "service:relief_resupply",
      action: "resupply",
      title: "Relief-store resupply",
      minutes: 12,
    });
    const state = {
      currentTown: { id: "albany_city", name: "Albany city", services: [] },
      currentAreaId: "albany_city__transport_hub",
      campaignServiceRules: [rule],
      campaignWorldFactIds: [KNOWN_WORLD_FACT],
      consumedCampaignServiceRuleIds: [] as string[],
      supplies: 1,
      fatigue: 0,
    };

    expect(planOverworldSessionTownResupply(state)).toMatchObject({
      action: "resupply",
      minutes: 12,
      changed: true,
      entryDraft: {
        serviceRuleId: "service:relief_resupply",
        serviceAreaId: "albany_city__transport_hub",
      },
    });
    expect(() =>
      planOverworldSessionTownResupply({
        ...state,
        consumedCampaignServiceRuleIds: ["service:relief_resupply"],
      }),
    ).toThrow(/no market, inn, or stable/i);
  });

  it("resolves mutually exclusive story choices and projects a detached named provider", () => {
    const rule = serviceRule({
      id: "service:jamie_packet_stores",
      home: "albany_city",
      area: "albany_city__market",
      action: "resupply",
      provider_character_id: "albany_city__market__contact",
      requires_all_world_facts: undefined,
      requires_all_story_choices: [WAGON_STORY_CHOICE],
      forbids_any_story_choices: [WARDENS_STORY_CHOICE],
    });
    const providers = new Map([["albany_city__market__contact", { name: "Jamie Tanner" }]]);
    const state = {
      rules: [rule],
      currentTownId: "albany_city",
      currentAreaId: "albany_city__market",
      worldFactIds: [] as string[],
      consumedRuleIds: [] as string[],
      providersById: providers,
    };

    expect(
      resolveCampaignServiceRules({
        ...state,
        selectedStoryChoices: [WAGON_STORY_CHOICE],
      }),
    ).toEqual([
      expect.objectContaining({
        id: "service:jamie_packet_stores",
        providerId: "albany_city__market__contact",
        providerName: "Jamie Tanner",
      }),
    ]);
    expect(
      resolveCampaignServiceRules({
        ...state,
        selectedStoryChoices: [WARDENS_STORY_CHOICE],
      }),
    ).toEqual([]);
    const { providersById: _providersById, ...stateWithoutProviders } = state;
    expect(() =>
      resolveCampaignServiceRules({
        ...stateWithoutProviders,
        selectedStoryChoices: [WAGON_STORY_CHOICE],
      }),
    ).toThrow(/unknown provider/i);

    const offers = resolveCampaignServiceRules({
      ...state,
      selectedStoryChoices: [WAGON_STORY_CHOICE],
    });
    providers.get("albany_city__market__contact")!.name = "Caller mutation";
    expect(offers[0]?.providerName).toBe("Jamie Tanner");
  });

  it("returns sorted detached offers", () => {
    const rules = [
      serviceRule({
        id: "service:z_resupply",
        action: "resupply",
        title: "Original resupply title",
      }),
      serviceRule({ id: "service:a_rest", title: "Original rest title" }),
    ];

    const offers = resolveCampaignServiceRules({
      rules,
      currentTownId: "albany_city",
      currentAreaId: "albany_city__transport_hub",
      worldFactIds: [KNOWN_WORLD_FACT],
      consumedRuleIds: [],
    });

    expect(offers.map((offer) => [offer.action, offer.id])).toEqual([
      ["rest", "service:a_rest"],
      ["resupply", "service:z_resupply"],
    ]);
    expect(Object.keys(offers[0]!).sort()).toEqual(["action", "id", "minutes", "summary", "title"]);
    offers[0]!.title = "Caller mutation";
    expect(rules[1]!.title).toBe("Original rest title");
    expect(rules[1]!.requires_all_world_facts).toEqual([KNOWN_WORLD_FACT]);

    const internal = resolveActiveCampaignServiceRules({
      rules,
      currentTownId: "albany_city",
      currentAreaId: "albany_city__transport_hub",
      worldFactIds: [KNOWN_WORLD_FACT],
      consumedRuleIds: [],
    });
    expect(
      resolveParsedActiveCampaignServiceRules({
        rules: CampaignServiceRulesSchema.parse(rules),
        currentTownId: "albany_city",
        currentAreaId: "albany_city__transport_hub",
        worldFactIds: [KNOWN_WORLD_FACT],
        consumedRuleIds: [],
      }),
    ).toEqual(internal);
    internal[0]!.requires_all_world_facts!.push("fact:caller_mutation");
    expect(rules[1]!.requires_all_world_facts).toEqual([KNOWN_WORLD_FACT]);
  });

  it("requires canonical companion and promise state when a service authors those predicates", () => {
    const rule = serviceRule({
      id: "service:june_kept_line",
      requires_all_companions: ["albany:june_pike"],
      requires_all_promises: [{ promise_id: "albany:promise_june_cattle_first", status: "kept" }],
    });
    const state = {
      rules: [rule],
      currentTownId: "albany_city",
      currentAreaId: "albany_city__transport_hub",
      worldFactIds: [KNOWN_WORLD_FACT],
      consumedRuleIds: [] as string[],
    };
    expect(resolveCampaignServiceRules(state)).toEqual([]);
    expect(
      resolveCampaignServiceRules({
        ...state,
        character: buildCampaignCharacterState({
          companions: ["albany:june_pike"],
          promises: [
            {
              promiseId: "albany:promise_june_cattle_first",
              recipientId: "albany:june_pike",
              status: "active",
            },
          ],
        }),
      }),
    ).toEqual([]);
    expect(
      resolveCampaignServiceRules({
        ...state,
        character: buildCampaignCharacterState({
          companions: ["albany:june_pike"],
          promises: [
            {
              promiseId: "albany:promise_june_cattle_first",
              recipientId: "albany:june_pike",
              status: "kept",
            },
          ],
        }),
      }).map((offer) => offer.id),
    ).toEqual([rule.id]);
  });

  it("rejects overlapping active rules for one action after consumption filtering", () => {
    const rules = [
      serviceRule({ id: "service:first_rest" }),
      serviceRule({
        id: "service:second_rest",
        forbids_any_world_facts: ["fact:service_blocked"],
      }),
    ];
    const state = {
      rules,
      currentTownId: "albany_city",
      currentAreaId: "albany_city__transport_hub",
      worldFactIds: [KNOWN_WORLD_FACT],
      consumedRuleIds: [] as string[],
    };

    expect(() => resolveCampaignServiceRules(state)).toThrow(/both resolve.*rest/i);
    expect(
      resolveCampaignServiceRules({ ...state, consumedRuleIds: ["service:first_rest"] }).map(
        (offer) => offer.id,
      ),
    ).toEqual(["service:second_rest"]);
  });
});
