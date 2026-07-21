import { z } from "zod";
import {
  CampaignImportReceiptEffectSchema,
  type CampaignImportReceiptEffect,
} from "../core/campaign_import_receipt.js";
import type { GameState } from "../core/state.js";
import {
  CampaignCharacterHealthSchema,
  CampaignCharacterIdSchema,
  type CampaignCharacterState,
} from "../world/campaign_character_state.js";
import type { RpgPack } from "./schema.js";

export const EMBEDDED_QUEST_CONTINUITY_EXPLANATION =
  "Scenario-local numbers and issued kit govern this quest. Your persistent record remains intact; only authored campaign import and export effects cross the quest boundary.";

export type EmbeddedQuestLocalSkill = {
  id: string;
  value: number;
};

export type EmbeddedQuestCharacterContinuity = {
  continuity: "same_campaign_character";
  profile_scope: "quest_local";
  persistent_record: {
    identity: "persistent_campaign_record";
    background: string | null;
    health: {
      current: number;
      max: number;
    };
  };
  quest_local_profile: {
    hp: number;
    attack: number;
    defense: number;
    skills: EmbeddedQuestLocalSkill[];
    inventory: string[];
  };
  applied_campaign_import_effects: CampaignImportReceiptEffect[];
  explanation: typeof EMBEDDED_QUEST_CONTINUITY_EXPLANATION;
};

const EmbeddedQuestLocalSkillSchema = z
  .object({
    id: z.string().min(1).max(96),
    value: z.number().finite(),
  })
  .strict();

export const EmbeddedQuestCharacterContinuitySchema = z
  .object({
    continuity: z.literal("same_campaign_character"),
    profile_scope: z.literal("quest_local"),
    persistent_record: z
      .object({
        identity: z.literal("persistent_campaign_record"),
        background: CampaignCharacterIdSchema.nullable(),
        health: CampaignCharacterHealthSchema,
      })
      .strict(),
    // This is the launch-time profile in persisted/session metadata. Every
    // player-facing projection replaces it from the current child GameState.
    quest_local_profile: z
      .object({
        hp: z.number().finite(),
        attack: z.number().finite(),
        defense: z.number().finite(),
        skills: z.array(EmbeddedQuestLocalSkillSchema),
        inventory: z.array(z.string().min(1)),
      })
      .strict(),
    applied_campaign_import_effects: z.array(CampaignImportReceiptEffectSchema),
    explanation: z.literal(EMBEDDED_QUEST_CONTINUITY_EXPLANATION),
  })
  .strict();

export type CompactCampaignImportEffect =
  | readonly [
      ruleId: string,
      type: "health_current_to_var" | "skill_rank_to_var",
      targetVar: string,
      value: number,
    ]
  | readonly [
      ruleId: string,
      type: "background_to_flag" | "ability_to_flag" | "knowledge_to_flag" | "companion_to_flag",
      targetFlag: string,
      value: true,
    ]
  | readonly [ruleId: string, type: "equipment_to_item", targetObject: string];

export type CompactEmbeddedQuestCharacterContinuity = readonly [
  continuity: "same_campaign_character",
  profileScope: "quest_local",
  persistentRecord: readonly [
    identity: "persistent_campaign_record",
    background: string | null,
    healthCurrent: number,
    healthMax: number,
  ],
  questLocalProfile: readonly [
    hp: number,
    attack: number,
    defense: number,
    skills: readonly (readonly [id: string, value: number])[],
    inventory: readonly string[],
  ],
  appliedCampaignImportEffects: readonly CompactCampaignImportEffect[],
  explanation: typeof EMBEDDED_QUEST_CONTINUITY_EXPLANATION,
];

export const COMPACT_EMBEDDED_QUEST_CHARACTER_CONTINUITY_LEGEND =
  "[continuity, profile_scope, [persistent_record_identity, background|null, health_current, health_max], [quest_hp, quest_attack, quest_defense, [[quest_skill_id, value], ...], [quest_inventory_item_id, ...]], [applied_campaign_import_effect, ...], explanation]; import effects are [rule_id, type, target_var|target_flag, value] or [rule_id, equipment_to_item, target_object]";

const CORE_RPG_VARS = new Set(["hp", "attack", "defense", "score", "max_score"]);

function collectQuestSkillIds(value: unknown, skillIds: Set<string>): void {
  if (Array.isArray(value)) {
    for (const child of value) collectQuestSkillIds(child, skillIds);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const skillCheck = record["skill_check"];
  if (skillCheck !== null && typeof skillCheck === "object") {
    const skill = (skillCheck as Record<string, unknown>)["skill"];
    if (typeof skill === "string" && !CORE_RPG_VARS.has(skill)) skillIds.add(skill);
  }
  for (const child of Object.values(record)) collectQuestSkillIds(child, skillIds);
}

function questLocalSkills(pack: RpgPack, state: GameState): EmbeddedQuestLocalSkill[] {
  const skillIds = new Set<string>();
  collectQuestSkillIds(pack, skillIds);
  return [...skillIds]
    .sort()
    .flatMap((id) => (state.vars[id] === undefined ? [] : [{ id, value: state.vars[id] }]));
}

function questLocalProfile(
  pack: RpgPack,
  state: GameState,
): EmbeddedQuestCharacterContinuity["quest_local_profile"] {
  return {
    hp: state.vars["hp"] ?? 0,
    attack: state.vars["attack"] ?? 0,
    defense: state.vars["defense"] ?? 0,
    skills: questLocalSkills(pack, state),
    inventory: [...state.inventory],
  };
}

function cloneEffect(effect: CampaignImportReceiptEffect): CampaignImportReceiptEffect {
  return { ...effect };
}

export function buildEmbeddedQuestCharacterContinuity(args: {
  character: CampaignCharacterState;
  pack: RpgPack;
  state: GameState;
}): EmbeddedQuestCharacterContinuity {
  return {
    continuity: "same_campaign_character",
    profile_scope: "quest_local",
    persistent_record: {
      identity: "persistent_campaign_record",
      background: args.character.background,
      health: {
        current: args.character.health.current,
        max: args.character.health.max,
      },
    },
    quest_local_profile: questLocalProfile(args.pack, args.state),
    applied_campaign_import_effects: (args.state.campaignImportReceipt?.effects ?? []).map(
      cloneEffect,
    ),
    explanation: EMBEDDED_QUEST_CONTINUITY_EXPLANATION,
  };
}

/**
 * Project immutable campaign identity/import provenance beside the live child
 * profile. The session retains a launch snapshot only as saveable metadata;
 * current quest numbers and kit always come from the authoritative GameState.
 */
export function projectEmbeddedQuestCharacterContinuity(args: {
  continuity: EmbeddedQuestCharacterContinuity;
  pack: RpgPack;
  state: GameState;
}): EmbeddedQuestCharacterContinuity {
  return {
    ...cloneEmbeddedQuestCharacterContinuity(args.continuity),
    quest_local_profile: questLocalProfile(args.pack, args.state),
  };
}

export function cloneEmbeddedQuestCharacterContinuity(
  continuity: EmbeddedQuestCharacterContinuity,
): EmbeddedQuestCharacterContinuity {
  return {
    ...continuity,
    persistent_record: {
      ...continuity.persistent_record,
      health: { ...continuity.persistent_record.health },
    },
    quest_local_profile: {
      ...continuity.quest_local_profile,
      skills: continuity.quest_local_profile.skills.map((skill) => ({ ...skill })),
      inventory: [...continuity.quest_local_profile.inventory],
    },
    applied_campaign_import_effects: continuity.applied_campaign_import_effects.map(cloneEffect),
  };
}

function compactCampaignImportEffect(
  effect: CampaignImportReceiptEffect,
): CompactCampaignImportEffect {
  if (effect.type === "health_current_to_var" || effect.type === "skill_rank_to_var") {
    return [effect.rule_id, effect.type, effect.target_var, effect.value];
  }
  if (effect.type === "equipment_to_item") {
    return [effect.rule_id, effect.type, effect.target_object];
  }
  return [effect.rule_id, effect.type, effect.target_flag, true];
}

export function compactEmbeddedQuestCharacterContinuity(
  continuity: EmbeddedQuestCharacterContinuity,
): CompactEmbeddedQuestCharacterContinuity {
  return [
    continuity.continuity,
    continuity.profile_scope,
    [
      continuity.persistent_record.identity,
      continuity.persistent_record.background,
      continuity.persistent_record.health.current,
      continuity.persistent_record.health.max,
    ],
    [
      continuity.quest_local_profile.hp,
      continuity.quest_local_profile.attack,
      continuity.quest_local_profile.defense,
      continuity.quest_local_profile.skills.map((skill) => [skill.id, skill.value] as const),
      [...continuity.quest_local_profile.inventory],
    ],
    continuity.applied_campaign_import_effects.map(compactCampaignImportEffect),
    continuity.explanation,
  ];
}
