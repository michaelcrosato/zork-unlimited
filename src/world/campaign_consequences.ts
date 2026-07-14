import { z } from "zod";

import {
  CAMPAIGN_CHARACTER_MAX_OWED,
  CAMPAIGN_CHARACTER_MAX_SCORE,
  CAMPAIGN_CHARACTER_MIN_SCORE,
  CampaignCharacterIdSchema,
  evolveCampaignCharacterState,
  type CampaignCharacterState,
} from "./campaign_character_state.js";

const CAMPAIGN_SCORE_FLOOR = z
  .number()
  .int()
  .min(CAMPAIGN_CHARACTER_MIN_SCORE)
  .max(CAMPAIGN_CHARACTER_MAX_SCORE);
const CAMPAIGN_OWED_FLOOR = z.number().int().min(0).max(CAMPAIGN_CHARACTER_MAX_OWED);

export const RememberRelationshipConsequenceSchema = z
  .object({
    type: z.literal("remember_relationship"),
    npc_id: CampaignCharacterIdSchema,
    memory_id: CampaignCharacterIdSchema,
    trust_at_least: CAMPAIGN_SCORE_FLOOR.optional(),
    regard_at_least: CAMPAIGN_SCORE_FLOOR.optional(),
    owes_player_at_least: CAMPAIGN_OWED_FLOOR.optional(),
  })
  .strict();

export const SetWorldFactConsequenceSchema = z
  .object({
    type: z.literal("set_world_fact"),
    fact_id: CampaignCharacterIdSchema,
  })
  .strict();

export const LearnKnowledgeConsequenceSchema = z
  .object({
    type: z.literal("learn_knowledge"),
    knowledge_id: CampaignCharacterIdSchema,
  })
  .strict();

export const CampaignConsequenceEffectSchema = z.discriminatedUnion("type", [
  LearnKnowledgeConsequenceSchema,
  RememberRelationshipConsequenceSchema,
  SetWorldFactConsequenceSchema,
]);

export type LearnKnowledgeConsequence = z.infer<typeof LearnKnowledgeConsequenceSchema>;
export type RememberRelationshipConsequence = z.infer<typeof RememberRelationshipConsequenceSchema>;
export type SetWorldFactConsequence = z.infer<typeof SetWorldFactConsequenceSchema>;
export type CampaignConsequenceEffect = z.infer<typeof CampaignConsequenceEffectSchema>;

/** Stable semantic identity used by authoring validators to reject repeated effects. */
export function campaignConsequenceEffectKey(effect: CampaignConsequenceEffect): string {
  switch (effect.type) {
    case "learn_knowledge":
      return JSON.stringify([effect.type, effect.knowledge_id]);
    case "remember_relationship":
      return JSON.stringify([effect.type, effect.npc_id, effect.memory_id]);
    case "set_world_fact":
      return JSON.stringify([effect.type, effect.fact_id]);
  }
}

export const CampaignConsequenceEffectsSchema = z
  .array(CampaignConsequenceEffectSchema)
  .superRefine((effects, ctx) => {
    const seen = new Set<string>();
    effects.forEach((effect, index) => {
      const key = campaignConsequenceEffectKey(effect);
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: `Duplicate campaign consequence effect ${key}.`,
        });
      }
      seen.add(key);
    });
  });

export type CampaignConsequenceEffects = z.infer<typeof CampaignConsequenceEffectsSchema>;

export type CampaignConsequenceApplication = {
  characterAfter: CampaignCharacterState;
  worldFactIds: string[];
};

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Derive historical world truth from trusted outcome effect groups. Facts shared
 * by more than one outcome remain one fact; duplicates inside one authored
 * outcome are rejected as likely authoring mistakes.
 */
export function deriveCampaignWorldFactIds(
  effectGroups: readonly (readonly CampaignConsequenceEffect[])[],
): string[] {
  const facts = new Set<string>();
  for (const group of effectGroups) {
    const effects = CampaignConsequenceEffectsSchema.parse(group);
    for (const effect of effects) {
      if (effect.type === "set_world_fact") facts.add(effect.fact_id);
    }
  }
  return [...facts].sort(compareIds);
}

function applyRelationshipMemory(
  character: CampaignCharacterState,
  effect: RememberRelationshipConsequence,
): void {
  let relationship = character.relationships.find((candidate) => candidate.npcId === effect.npc_id);
  if (!relationship) {
    relationship = {
      npcId: effect.npc_id,
      trust: 0,
      regard: 0,
      owesPlayer: 0,
      playerOwes: 0,
      memories: [],
    };
    character.relationships.push(relationship);
  }

  if (!relationship.memories.includes(effect.memory_id)) {
    relationship.memories.push(effect.memory_id);
  }
  if (effect.trust_at_least !== undefined) {
    relationship.trust = Math.max(relationship.trust, effect.trust_at_least);
  }
  if (effect.regard_at_least !== undefined) {
    relationship.regard = Math.max(relationship.regard, effect.regard_at_least);
  }
  if (effect.owes_player_at_least !== undefined) {
    relationship.owesPlayer = Math.max(relationship.owesPlayer, effect.owes_player_at_least);
  }
}

/**
 * Apply one trusted outcome atomically. Parsing occurs before evolution, and
 * evolution works on a detached draft, so rejection never partially commits.
 * `set_world_fact` is derived historical state; it deliberately does not grant
 * the player knowledge.
 */
export function applyCampaignConsequences(args: {
  character: CampaignCharacterState;
  effects: unknown;
}): CampaignConsequenceApplication {
  const effects = CampaignConsequenceEffectsSchema.parse(args.effects);
  const characterAfter = evolveCampaignCharacterState(args.character, (draft) => {
    for (const effect of effects) {
      switch (effect.type) {
        case "learn_knowledge":
          if (!draft.knowledge.includes(effect.knowledge_id)) {
            draft.knowledge.push(effect.knowledge_id);
          }
          break;
        case "remember_relationship":
          applyRelationshipMemory(draft, effect);
          break;
        case "set_world_fact":
          break;
      }
    }
  });

  return {
    characterAfter,
    worldFactIds: deriveCampaignWorldFactIds([effects]),
  };
}
