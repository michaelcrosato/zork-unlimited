import type {
  CampaignCharacterState,
  CampaignCrimeStatus,
  CampaignPromiseStatus,
  CampaignWoundTreatment,
} from "./campaign_character_state.js";

export type CampaignCharacterStandingTier = "very_low" | "low" | "neutral" | "high" | "very_high";

export type CampaignCharacterView = {
  background: string | null;
  skills: { skillId: string; rank: number }[];
  values: { valueId: string; strength: number }[];
  health: { current: number; max: number };
  wounds: {
    woundId: string;
    severity: number;
    treatment: CampaignWoundTreatment;
  }[];
  equipment: {
    equipmentId: string;
    itemId: string;
    quantity: number;
    condition: number;
    equipped: boolean;
  }[];
  money: number;
  abilities: string[];
  knowledge: string[];
  promises: {
    promiseId: string;
    recipientId: string;
    status: CampaignPromiseStatus;
  }[];
  crimes: {
    crimeId: string;
    jurisdictionId: string;
    severity: number;
    status: CampaignCrimeStatus;
  }[];
  relationships: {
    npcId: string;
    trust: CampaignCharacterStandingTier;
    regard: CampaignCharacterStandingTier;
    owesPlayer: number;
    playerOwes: number;
    memories: string[];
  }[];
  factionStanding: {
    factionId: string;
    standing: CampaignCharacterStandingTier;
  }[];
};

/**
 * Convert internal numeric disposition to a stable player-facing band. Exact
 * scores stay out of recurring player views so future rules can use uncertainty
 * without making the UI or compact/full observations lie about what the
 * character knows. The canonical resumable snapshot remains structural
 * transport (and is absent from pure play), not a presentation contract.
 */
export function campaignCharacterStandingTier(score: number): CampaignCharacterStandingTier {
  if (score <= -60) return "very_low";
  if (score <= -20) return "low";
  if (score < 20) return "neutral";
  if (score < 60) return "high";
  return "very_high";
}

/** Explicit allowlist from canonical runtime state to public player knowledge. */
export function buildCampaignCharacterView(state: CampaignCharacterState): CampaignCharacterView {
  return {
    background: state.background,
    skills: state.skills.map((skill) => ({ skillId: skill.skillId, rank: skill.rank })),
    values: state.values.map((value) => ({
      valueId: value.valueId,
      strength: value.strength,
    })),
    health: { current: state.health.current, max: state.health.max },
    wounds: state.wounds.map((wound) => ({
      woundId: wound.woundId,
      severity: wound.severity,
      treatment: wound.treatment,
    })),
    equipment: state.equipment.map((item) => ({
      equipmentId: item.equipmentId,
      itemId: item.itemId,
      quantity: item.quantity,
      condition: item.condition,
      equipped: item.equipped,
    })),
    money: state.money,
    abilities: [...state.abilities],
    knowledge: [...state.knowledge],
    promises: state.promises.map((promise) => ({
      promiseId: promise.promiseId,
      recipientId: promise.recipientId,
      status: promise.status,
    })),
    crimes: state.crimes.map((crime) => ({
      crimeId: crime.crimeId,
      jurisdictionId: crime.jurisdictionId,
      severity: crime.severity,
      status: crime.status,
    })),
    relationships: state.relationships.map((relationship) => ({
      npcId: relationship.npcId,
      trust: campaignCharacterStandingTier(relationship.trust),
      regard: campaignCharacterStandingTier(relationship.regard),
      owesPlayer: relationship.owesPlayer,
      playerOwes: relationship.playerOwes,
      memories: [...relationship.memories],
    })),
    factionStanding: state.factionStanding.map((faction) => ({
      factionId: faction.factionId,
      standing: campaignCharacterStandingTier(faction.standing),
    })),
  };
}

export function cloneCampaignCharacterView(view: CampaignCharacterView): CampaignCharacterView {
  return {
    background: view.background,
    skills: view.skills.map((skill) => ({ ...skill })),
    values: view.values.map((value) => ({ ...value })),
    health: { ...view.health },
    wounds: view.wounds.map((wound) => ({ ...wound })),
    equipment: view.equipment.map((item) => ({ ...item })),
    money: view.money,
    abilities: [...view.abilities],
    knowledge: [...view.knowledge],
    promises: view.promises.map((promise) => ({ ...promise })),
    crimes: view.crimes.map((crime) => ({ ...crime })),
    relationships: view.relationships.map((relationship) => ({
      ...relationship,
      memories: [...relationship.memories],
    })),
    factionStanding: view.factionStanding.map((faction) => ({ ...faction })),
  };
}
