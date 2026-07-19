import { z } from "zod";

import {
  CampaignCharacterIdSchema,
  type CampaignCharacterState,
} from "./campaign_character_state.js";
import {
  CampaignCharacterConditionIdsSchema,
  CampaignPromiseConditionsSchema,
  campaignCharacterMatchesConditions,
} from "./campaign_consequences.js";
import {
  CampaignStoryChoiceRefSchema,
  campaignStoryChoiceRefKey,
  type CampaignStoryChoiceRef,
} from "./campaign_story_choices.js";

const AUTHORED_TEXT = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, {
    message: "Authored campaign service text cannot be blank.",
  });

export const CampaignServiceActionSchema = z.enum(["rest", "resupply"]);

export const CampaignServiceRegionRenownRequirementSchema = z
  .object({
    region: z.string().min(1),
    at_least: z.number().int().positive().max(1_000),
  })
  .strict();

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

const CampaignServiceStoryChoiceRefsSchema = z
  .array(CampaignStoryChoiceRefSchema)
  .min(1)
  .superRefine((refs, ctx) => {
    const seen = new Set<string>();
    refs.forEach((ref, index) => {
      const key = campaignStoryChoiceRefKey(ref);
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: `Duplicate campaign service story choice ${key}.`,
        });
      }
      seen.add(key);
    });
  });

/** An authored local-job decision, never a generic completion marker. */
export const CampaignServiceLocalJobOptionSchema = z
  .object({
    job_id: z.string().min(1),
    option_id: z.string().min(1),
  })
  .strict();

function campaignServiceLocalJobOptionsSchema(kind: "required" | "forbidden") {
  return z
    .array(CampaignServiceLocalJobOptionSchema)
    .min(1)
    .max(8)
    .superRefine((options, ctx) => {
      const seen = new Set<string>();
      options.forEach((option, index) => {
        const key = campaignServiceLocalJobOptionKey(option);
        if (seen.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index],
            message: `Duplicate ${kind} campaign service local-job option ${key}.`,
          });
        }
        seen.add(key);
      });
    });
}

const CampaignServiceRequiredLocalJobOptionsSchema = campaignServiceLocalJobOptionsSchema(
  "required",
).superRefine((options, ctx) => {
  const selectedByJobId = new Map<string, string>();
  options.forEach((option, index) => {
    const selected = selectedByJobId.get(option.job_id);
    if (selected !== undefined && selected !== option.option_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index],
        message: `Campaign service rule cannot require mutually exclusive local-job options "${selected}" and "${option.option_id}" for "${option.job_id}".`,
      });
    }
    selectedByJobId.set(option.job_id, option.option_id);
  });
});

const CampaignServiceForbiddenLocalJobOptionsSchema =
  campaignServiceLocalJobOptionsSchema("forbidden");

export const CampaignServiceRuleSchema = z
  .object({
    id: CampaignCharacterIdSchema,
    home: z.string().min(1),
    area: z.string().min(1),
    action: CampaignServiceActionSchema,
    title: AUTHORED_TEXT,
    summary: AUTHORED_TEXT,
    provider_character_id: z.string().min(1).optional(),
    minutes: z
      .number()
      .int()
      .positive()
      .max(24 * 60),
    requires_all_world_facts: CampaignServiceWorldFactIdsSchema.optional(),
    forbids_any_world_facts: CampaignServiceWorldFactIdsSchema.optional(),
    requires_all_story_choices: CampaignServiceStoryChoiceRefsSchema.optional(),
    forbids_any_story_choices: CampaignServiceStoryChoiceRefsSchema.optional(),
    requires_all_companions: CampaignCharacterConditionIdsSchema.optional(),
    requires_all_promises: CampaignPromiseConditionsSchema.optional(),
    requires_region_renown: CampaignServiceRegionRenownRequirementSchema.optional(),
    requires_all_local_job_options: CampaignServiceRequiredLocalJobOptionsSchema.optional(),
    forbids_any_local_job_options: CampaignServiceForbiddenLocalJobOptionsSchema.optional(),
  })
  .strict()
  .superRefine((rule, ctx) => {
    if (
      (rule.requires_all_world_facts?.length ?? 0) === 0 &&
      (rule.requires_all_story_choices?.length ?? 0) === 0 &&
      (rule.requires_all_companions?.length ?? 0) === 0 &&
      (rule.requires_all_promises?.length ?? 0) === 0 &&
      rule.requires_region_renown === undefined &&
      (rule.requires_all_local_job_options?.length ?? 0) === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Campaign service rule "${rule.id}" requires at least one positive campaign condition.`,
      });
    }
    const required = new Set(rule.requires_all_world_facts ?? []);
    rule.forbids_any_world_facts?.forEach((factId, index) => {
      if (required.has(factId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["forbids_any_world_facts", index],
          message: `Campaign service rule "${rule.id}" cannot both require and forbid world fact "${factId}".`,
        });
      }
    });
    const requiredChoices = new Set(
      (rule.requires_all_story_choices ?? []).map(campaignStoryChoiceRefKey),
    );
    const requiredChoiceByStoryId = new Map<string, string>();
    rule.requires_all_story_choices?.forEach((ref, index) => {
      const selectedChoice = requiredChoiceByStoryId.get(ref.story_choice_id);
      if (selectedChoice !== undefined && selectedChoice !== ref.choice_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["requires_all_story_choices", index],
          message: `Campaign service rule "${rule.id}" cannot require mutually exclusive choices "${selectedChoice}" and "${ref.choice_id}" from story "${ref.story_choice_id}".`,
        });
      }
      requiredChoiceByStoryId.set(ref.story_choice_id, ref.choice_id);
    });
    rule.forbids_any_story_choices?.forEach((ref, index) => {
      const key = campaignStoryChoiceRefKey(ref);
      if (requiredChoices.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["forbids_any_story_choices", index],
          message: `Campaign service rule "${rule.id}" cannot both require and forbid story choice ${key}.`,
        });
      }
    });
    const requiredLocalJobOptions = new Set(
      (rule.requires_all_local_job_options ?? []).map(campaignServiceLocalJobOptionKey),
    );
    rule.forbids_any_local_job_options?.forEach((option, index) => {
      const key = campaignServiceLocalJobOptionKey(option);
      if (requiredLocalJobOptions.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["forbids_any_local_job_options", index],
          message: `Campaign service rule "${rule.id}" cannot both require and forbid local-job option ${key}.`,
        });
      }
    });
  });

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Canonicalize only the fields that decide whether a rule activates. Copy,
 * duration, provider, and identity cannot make two otherwise identical offers
 * mutually exclusive at runtime.
 */
function campaignServiceRulePredicateKey(rule: CampaignServiceRule): string {
  return JSON.stringify({
    home: rule.home,
    area: rule.area,
    action: rule.action,
    requires_all_world_facts: [...(rule.requires_all_world_facts ?? [])].sort(compareStrings),
    forbids_any_world_facts: [...(rule.forbids_any_world_facts ?? [])].sort(compareStrings),
    requires_all_story_choices: (rule.requires_all_story_choices ?? [])
      .map(campaignStoryChoiceRefKey)
      .sort(compareStrings),
    forbids_any_story_choices: (rule.forbids_any_story_choices ?? [])
      .map(campaignStoryChoiceRefKey)
      .sort(compareStrings),
    requires_all_companions: [...(rule.requires_all_companions ?? [])].sort(compareStrings),
    requires_all_promises: [...(rule.requires_all_promises ?? [])].sort((left, right) => {
      const idOrder = compareStrings(left.promise_id, right.promise_id);
      return idOrder === 0 ? compareStrings(left.status, right.status) : idOrder;
    }),
    requires_region_renown: rule.requires_region_renown ?? null,
    requires_all_local_job_options: (rule.requires_all_local_job_options ?? [])
      .map(campaignServiceLocalJobOptionKey)
      .sort(compareStrings),
    forbids_any_local_job_options: (rule.forbids_any_local_job_options ?? [])
      .map(campaignServiceLocalJobOptionKey)
      .sort(compareStrings),
  });
}

export const CampaignServiceRulesSchema = z
  .array(CampaignServiceRuleSchema)
  .superRefine((rules, ctx) => {
    const seen = new Set<string>();
    const predicateOwners = new Map<string, CampaignServiceRule>();
    rules.forEach((rule, index) => {
      if (seen.has(rule.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "id"],
          message: `Duplicate campaign service rule id "${rule.id}".`,
        });
      }
      seen.add(rule.id);

      const predicateKey = campaignServiceRulePredicateKey(rule);
      const predicateOwner = predicateOwners.get(predicateKey);
      if (predicateOwner !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: `Campaign service rules "${predicateOwner.id}" and "${rule.id}" repeat the same normalized activation predicate at "${rule.area}" for action "${rule.action}".`,
        });
      } else {
        predicateOwners.set(predicateKey, rule);
      }
    });
  });

export type CampaignServiceAction = z.infer<typeof CampaignServiceActionSchema>;
export type CampaignServiceRule = z.infer<typeof CampaignServiceRuleSchema>;
export type CampaignServiceLocalJobOption = z.infer<typeof CampaignServiceLocalJobOptionSchema>;
export type CampaignServiceOffer = {
  id: string;
  action: CampaignServiceAction;
  title: string;
  summary: string;
  minutes: number;
  providerId?: string;
  providerName?: string;
};

type IdCollection = readonly string[] | ReadonlySet<string>;

export type CampaignServiceRuleResolutionState = Readonly<{
  rules: readonly CampaignServiceRule[];
  currentTownId: string;
  currentAreaId: string;
  worldFactIds: IdCollection;
  selectedStoryChoices?: readonly CampaignStoryChoiceRef[];
  consumedRuleIds: IdCollection;
  character?: CampaignCharacterState;
  regionRenown?: ReadonlyMap<string, number>;
  completedLocalJobOptions?: readonly CampaignServiceLocalJobOption[] | undefined;
}>;

export type CampaignServiceOfferProvider = Readonly<{ name: string }>;

export type CampaignServiceOfferResolutionState = CampaignServiceRuleResolutionState &
  Readonly<{
    providersById?: ReadonlyMap<string, CampaignServiceOfferProvider>;
  }>;

function stringSet(values: IdCollection): ReadonlySet<string> {
  return values instanceof Set ? values : new Set(values);
}

export function campaignServiceLocalJobOptionKey(
  option: Pick<CampaignServiceLocalJobOption, "job_id" | "option_id">,
): string {
  return JSON.stringify([option.job_id, option.option_id]);
}

function compareRules(left: CampaignServiceRule, right: CampaignServiceRule): number {
  if (left.action !== right.action) return left.action < right.action ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function ruleIsActive(
  rule: CampaignServiceRule,
  worldFactIds: ReadonlySet<string>,
  selectedStoryChoiceKeys: ReadonlySet<string>,
  consumedRuleIds: ReadonlySet<string>,
  character: CampaignCharacterState | undefined,
  regionRenown: ReadonlyMap<string, number> | undefined,
  completedLocalJobOptionKeys: ReadonlySet<string>,
): boolean {
  const hasCharacterConditions =
    rule.requires_all_companions !== undefined || rule.requires_all_promises !== undefined;
  return (
    !consumedRuleIds.has(rule.id) &&
    (rule.requires_all_world_facts ?? []).every((factId) => worldFactIds.has(factId)) &&
    !(rule.forbids_any_world_facts ?? []).some((factId) => worldFactIds.has(factId)) &&
    (rule.requires_all_story_choices ?? []).every((ref) =>
      selectedStoryChoiceKeys.has(campaignStoryChoiceRefKey(ref)),
    ) &&
    !(rule.forbids_any_story_choices ?? []).some((ref) =>
      selectedStoryChoiceKeys.has(campaignStoryChoiceRefKey(ref)),
    ) &&
    (rule.requires_region_renown === undefined ||
      (regionRenown?.get(rule.requires_region_renown.region) ?? 0) >=
        rule.requires_region_renown.at_least) &&
    (rule.requires_all_local_job_options ?? []).every((option) =>
      completedLocalJobOptionKeys.has(campaignServiceLocalJobOptionKey(option)),
    ) &&
    !(rule.forbids_any_local_job_options ?? []).some((option) =>
      completedLocalJobOptionKeys.has(campaignServiceLocalJobOptionKey(option)),
    ) &&
    (!hasCharacterConditions ||
      (character !== undefined &&
        campaignCharacterMatchesConditions(character, {
          ...(rule.requires_all_companions
            ? { requires_all_companions: rule.requires_all_companions }
            : {}),
          ...(rule.requires_all_promises
            ? { requires_all_promises: rule.requires_all_promises }
            : {}),
        })))
  );
}

/**
 * Resolve rules that have already crossed `CampaignServiceRulesSchema`.
 * Integrity proofs use this trusted core repeatedly without reparsing the same
 * manifest. Other callers should use `resolveActiveCampaignServiceRules`.
 */
export function resolveParsedActiveCampaignServiceRules(
  state: CampaignServiceRuleResolutionState,
): CampaignServiceRule[] {
  const worldFactIds = stringSet(state.worldFactIds);
  const selectedStoryChoiceKeys = new Set(
    (state.selectedStoryChoices ?? []).map(campaignStoryChoiceRefKey),
  );
  const consumedRuleIds = stringSet(state.consumedRuleIds);
  const completedLocalJobOptionKeys = new Set(
    (state.completedLocalJobOptions ?? []).map(campaignServiceLocalJobOptionKey),
  );
  const offers = state.rules
    .filter(
      (rule) =>
        rule.home === state.currentTownId &&
        rule.area === state.currentAreaId &&
        ruleIsActive(
          rule,
          worldFactIds,
          selectedStoryChoiceKeys,
          consumedRuleIds,
          state.character,
          state.regionRenown,
          completedLocalJobOptionKeys,
        ),
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

/**
 * Resolve canonical active rules for internal planning and proof. Parsed rules
 * are detached before filtering so planners cannot mutate manifest authoring.
 */
export function resolveActiveCampaignServiceRules(
  state: CampaignServiceRuleResolutionState,
): CampaignServiceRule[] {
  return resolveParsedActiveCampaignServiceRules({
    ...state,
    rules: CampaignServiceRulesSchema.parse(state.rules),
  });
}

/** Strip internal location and predicate state from one detached player offer. */
export function campaignServiceOffer(
  rule: CampaignServiceRule,
  providersById?: ReadonlyMap<string, CampaignServiceOfferProvider>,
): CampaignServiceOffer {
  const parsed = CampaignServiceRuleSchema.parse(rule);
  const provider = parsed.provider_character_id
    ? providersById?.get(parsed.provider_character_id)
    : undefined;
  if (parsed.provider_character_id && !provider) {
    throw new Error(
      `Campaign service rule "${parsed.id}" has unknown provider "${parsed.provider_character_id}".`,
    );
  }
  return {
    id: parsed.id,
    action: parsed.action,
    title: parsed.title,
    summary: parsed.summary,
    minutes: parsed.minutes,
    ...(parsed.provider_character_id && provider
      ? { providerId: parsed.provider_character_id, providerName: provider.name }
      : {}),
  };
}

/** Resolve the bounded player-facing service offer projection. */
export function resolveCampaignServiceRules(
  state: CampaignServiceOfferResolutionState,
): CampaignServiceOffer[] {
  return resolveActiveCampaignServiceRules(state).map((rule) =>
    campaignServiceOffer(rule, state.providersById),
  );
}
