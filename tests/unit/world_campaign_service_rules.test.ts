import { describe, expect, it } from "vitest";

import {
  CampaignServiceRuleSchema,
  CampaignServiceRulesSchema,
  resolveActiveCampaignServiceRules,
  resolveCampaignServiceRules,
  type CampaignServiceRule,
} from "../../src/world/campaign_service_rules.js";
import {
  assertOverworldIntegrity,
  parseOverworldManifest,
  type OverworldManifest,
} from "../../src/world/overworld.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { planOverworldSessionTownResupply } from "../../src/world/session_service_lifecycle.js";

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
  world.campaign_service_rules = [rule];
  return world;
}

describe("campaign service-rule authoring", () => {
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

    expect(() => CampaignServiceRulesSchema.parse([serviceRule(), serviceRule()])).toThrow(
      /duplicate.*rule id/i,
    );

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
      serviceRule({ id: "service:consumed", requires_all_world_facts: [KNOWN_WORLD_FACT] }),
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
      worldFactIds: new Set([KNOWN_WORLD_FACT, "fact:service_blocked"]),
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
    internal[0]!.requires_all_world_facts!.push("fact:caller_mutation");
    expect(rules[1]!.requires_all_world_facts).toEqual([KNOWN_WORLD_FACT]);
  });

  it("rejects overlapping active rules for one action after consumption filtering", () => {
    const rules = [
      serviceRule({ id: "service:first_rest" }),
      serviceRule({ id: "service:second_rest" }),
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
