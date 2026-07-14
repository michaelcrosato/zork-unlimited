import { z } from "zod";

import { CampaignCharacterIdSchema } from "./campaign_character_state.js";

const AUTHORED_TEXT = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, {
    message: "Authored campaign service text cannot be blank.",
  });

export const CampaignServiceActionSchema = z.enum(["rest", "resupply"]);

const CampaignServiceWorldFactIdsSchema = z
  .array(CampaignCharacterIdSchema)
  .min(1)
  .superRefine((factIds, ctx) => {
    const seen = new Set<string>();
    factIds.forEach((factId, index) => {
      if (seen.has(factId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: `Duplicate campaign service world fact id "${factId}".`,
        });
      }
      seen.add(factId);
    });
  });

export const CampaignServiceRuleSchema = z
  .object({
    id: CampaignCharacterIdSchema,
    home: z.string().min(1),
    area: z.string().min(1),
    action: CampaignServiceActionSchema,
    title: AUTHORED_TEXT,
    summary: AUTHORED_TEXT,
    minutes: z
      .number()
      .int()
      .positive()
      .max(24 * 60),
    requires_all_world_facts: CampaignServiceWorldFactIdsSchema,
    forbids_any_world_facts: CampaignServiceWorldFactIdsSchema.optional(),
  })
  .strict()
  .superRefine((rule, ctx) => {
    const required = new Set(rule.requires_all_world_facts);
    rule.forbids_any_world_facts?.forEach((factId, index) => {
      if (required.has(factId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["forbids_any_world_facts", index],
          message: `Campaign service rule "${rule.id}" cannot both require and forbid world fact "${factId}".`,
        });
      }
    });
  });

export const CampaignServiceRulesSchema = z
  .array(CampaignServiceRuleSchema)
  .superRefine((rules, ctx) => {
    const seen = new Set<string>();
    rules.forEach((rule, index) => {
      if (seen.has(rule.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "id"],
          message: `Duplicate campaign service rule id "${rule.id}".`,
        });
      }
      seen.add(rule.id);
    });
  });

export type CampaignServiceAction = z.infer<typeof CampaignServiceActionSchema>;
export type CampaignServiceRule = z.infer<typeof CampaignServiceRuleSchema>;
export type CampaignServiceOffer = {
  id: string;
  action: CampaignServiceAction;
  title: string;
  summary: string;
  minutes: number;
};

type IdCollection = readonly string[] | ReadonlySet<string>;

export type CampaignServiceRuleResolutionState = Readonly<{
  rules: readonly CampaignServiceRule[];
  currentTownId: string;
  currentAreaId: string;
  worldFactIds: IdCollection;
  consumedRuleIds: IdCollection;
}>;

function stringSet(values: IdCollection): ReadonlySet<string> {
  return values instanceof Set ? values : new Set(values);
}

function compareRules(left: CampaignServiceRule, right: CampaignServiceRule): number {
  if (left.action !== right.action) return left.action < right.action ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function ruleIsActive(
  rule: CampaignServiceRule,
  worldFactIds: ReadonlySet<string>,
  consumedRuleIds: ReadonlySet<string>,
): boolean {
  return (
    !consumedRuleIds.has(rule.id) &&
    rule.requires_all_world_facts.every((factId) => worldFactIds.has(factId)) &&
    !(rule.forbids_any_world_facts ?? []).some((factId) => worldFactIds.has(factId))
  );
}

/**
 * Resolve canonical active rules for internal planning and proof. Parsed rules
 * are detached before filtering so planners cannot mutate manifest authoring.
 */
export function resolveActiveCampaignServiceRules(
  state: CampaignServiceRuleResolutionState,
): CampaignServiceRule[] {
  const rules = CampaignServiceRulesSchema.parse(state.rules);
  const worldFactIds = stringSet(state.worldFactIds);
  const consumedRuleIds = stringSet(state.consumedRuleIds);
  const offers = rules
    .filter(
      (rule) =>
        rule.home === state.currentTownId &&
        rule.area === state.currentAreaId &&
        ruleIsActive(rule, worldFactIds, consumedRuleIds),
    )
    .sort(compareRules);

  const activeByAction = new Map<CampaignServiceAction, CampaignServiceRule>();
  for (const offer of offers) {
    const active = activeByAction.get(offer.action);
    if (active) {
      throw new Error(
        `Campaign service rules "${active.id}" and "${offer.id}" both resolve for action "${offer.action}" at "${state.currentAreaId}".`,
      );
    }
    activeByAction.set(offer.action, offer);
  }

  return offers;
}

/** Strip internal location and predicate state from one detached player offer. */
export function campaignServiceOffer(rule: CampaignServiceRule): CampaignServiceOffer {
  const parsed = CampaignServiceRuleSchema.parse(rule);
  return {
    id: parsed.id,
    action: parsed.action,
    title: parsed.title,
    summary: parsed.summary,
    minutes: parsed.minutes,
  };
}

/** Resolve the bounded player-facing service offer projection. */
export function resolveCampaignServiceRules(
  state: CampaignServiceRuleResolutionState,
): CampaignServiceOffer[] {
  return resolveActiveCampaignServiceRules(state).map(campaignServiceOffer);
}
