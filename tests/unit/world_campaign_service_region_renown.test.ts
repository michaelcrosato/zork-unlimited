import { describe, expect, it } from "vitest";

import {
  CampaignServiceRuleSchema,
  CampaignServiceRulesSchema,
  resolveCampaignServiceRules,
  type CampaignServiceRule,
} from "../../src/world/campaign_service_rules.js";
import { assertOverworldIntegrity } from "../../src/world/overworld.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGION = "Capital / Mohawk";

function renownRule(overrides: Partial<CampaignServiceRule> = {}): CampaignServiceRule {
  return {
    id: "service:renown_rest",
    home: "albany_city",
    area: "albany_city__civic_core",
    action: "rest",
    title: "Renown rest",
    summary: "A bounded regional standing releases one recovery cot.",
    minutes: 15,
    requires_region_renown: { region: REGION, at_least: 13 },
    ...overrides,
  };
}

describe("campaign service regional-renown predicate", () => {
  it("strictly bounds and normalizes the reusable predicate", () => {
    const authored = renownRule();
    const parsed = CampaignServiceRuleSchema.parse(authored);
    expect(parsed).toEqual(authored);
    expect(parsed.requires_region_renown).not.toBe(authored.requires_region_renown);
    parsed.requires_region_renown!.at_least = 14;
    expect(authored.requires_region_renown?.at_least).toBe(13);
    expect(() =>
      CampaignServiceRuleSchema.parse({
        ...renownRule(),
        requires_region_renown: { region: REGION, at_least: 0 },
      }),
    ).toThrow();
    expect(() =>
      CampaignServiceRuleSchema.parse({
        ...renownRule(),
        requires_region_renown: { region: REGION, at_least: 1_001 },
      }),
    ).toThrow();
    expect(() =>
      CampaignServiceRuleSchema.parse({
        ...renownRule(),
        requires_region_renown: { region: REGION, at_least: 13, invented: true },
      }),
    ).toThrow();
    expect(() =>
      CampaignServiceRulesSchema.parse([
        renownRule({ id: "service:first" }),
        renownRule({ id: "service:second" }),
      ]),
    ).toThrow(/same normalized activation predicate/i);
  });

  it("activates only at the authored regional threshold", () => {
    const state = {
      rules: [renownRule()],
      currentTownId: "albany_city",
      currentAreaId: "albany_city__civic_core",
      worldFactIds: [] as string[],
      consumedRuleIds: [] as string[],
    };
    expect(
      resolveCampaignServiceRules({
        ...state,
        regionRenown: new Map([[REGION, 12]]),
      }),
    ).toEqual([]);
    expect(
      resolveCampaignServiceRules({
        ...state,
        regionRenown: new Map([[REGION, 13]]),
      }),
    ).toEqual([
      expect.objectContaining({ id: "service:renown_rest", action: "rest", minutes: 15 }),
    ]);
  });

  it("lets independently earned standing satisfy the shipped generic offer", () => {
    const rule = WORLD.campaign_service_rules?.find(
      (candidate) => candidate.id === "albany:works_public_shift_civic_rest",
    );
    const provider = WORLD.characters.find(
      (candidate) => candidate.id === rule?.provider_character_id,
    );
    if (!rule || !provider) throw new Error("Expected the shipped Civic standing offer.");

    expect(
      resolveCampaignServiceRules({
        rules: [rule],
        currentTownId: rule.home,
        currentAreaId: rule.area,
        worldFactIds: ["fact:wolf_winter_byre_held"],
        consumedRuleIds: [],
        regionRenown: new Map([[REGION, 13]]),
        providersById: new Map([[provider.id, { name: provider.name }]]),
      }),
    ).toEqual([
      expect.objectContaining({
        id: rule.id,
        title: "Take the Civic Standing Recovery Cot",
        summary: expect.stringContaining("13-point Capital / Mohawk standing"),
      }),
    ]);
  });

  it("binds authored predicates to a declared world region", () => {
    const valid = structuredClone(WORLD);
    expect(() => assertOverworldIntegrity(valid)).not.toThrow();

    const invalid = structuredClone(valid);
    const rule = invalid.campaign_service_rules?.find(
      (candidate) => candidate.id === "albany:works_public_shift_civic_rest",
    );
    if (!rule) throw new Error("Expected the shipped regional-renown service rule.");
    rule.requires_region_renown = {
      region: "Invented / Region",
      at_least: 13,
    };
    expect(() => assertOverworldIntegrity(invalid)).toThrow(/unknown renown region/i);
  });
});
