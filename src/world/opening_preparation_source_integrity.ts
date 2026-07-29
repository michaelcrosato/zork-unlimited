import { join } from "node:path";

import type { CampaignCharacterImportRule } from "../rpg/campaign_character_import.js";
import { loadRpgSourceFile } from "../rpg/source.js";
import type { Interaction, RpgPack } from "../rpg/schema.js";
import type { OpeningPreparation, OpeningPreparationCheckConsumer } from "./opening_preparation.js";
import type { OverworldManifest, OverworldQuest } from "./overworld.js";

type SkillRankImportRule = Extract<CampaignCharacterImportRule, { type: "skill_rank_to_var" }>;

function describeConsumer(profileId: string, consumer: OpeningPreparationCheckConsumer): string {
  return `Opening preparation profile "${profileId}" check consumer "${consumer.object_id}:${consumer.verb}:${consumer.command_verb}"`;
}

/**
 * Bind authored preparation odds to one exact, compiled target-quest interaction.
 *
 * This pure half accepts an already compiled pack so source-integrity tests can
 * exercise drift fixtures without rewriting shipped files.
 */
export function assertOpeningPreparationCheckDisclosurePackIntegrity(args: {
  scene: OpeningPreparation;
  quest: OverworldQuest;
  pack: RpgPack;
}): void {
  if (args.quest.id !== args.scene.target_quest) {
    throw new Error(
      `Opening preparation target quest "${args.scene.target_quest}" does not match supplied quest "${args.quest.id}".`,
    );
  }

  for (const profile of args.scene.profiles) {
    const disclosure = profile.check_disclosure;
    if (!disclosure) continue;
    const consumer = disclosure.consumer;
    const matches: Interaction[] = [];
    for (const object of args.pack.objects) {
      if (object.id !== consumer.object_id) continue;
      for (const interaction of object.interactions) {
        if (
          interaction.verb === consumer.verb &&
          interaction.target === consumer.object_id &&
          interaction.item === undefined &&
          interaction.command_verb === consumer.command_verb
        ) {
          matches.push(interaction);
        }
      }
    }

    const description = describeConsumer(profile.id, consumer);
    if (matches.length !== 1) {
      throw new Error(
        `${description} must resolve to exactly one target-only compiled interaction in quest "${args.quest.id}", but resolved ${String(matches.length)}.`,
      );
    }

    const match = matches[0]!;
    const skillCheck = match.skill_check;
    if (!skillCheck) {
      throw new Error(`${description} has no compiled skill check.`);
    }
    if (!skillCheck.stakes?.trim()) {
      throw new Error(`${description} has no authored public stakes disclosure.`);
    }
    const skillImports =
      args.quest.campaign_imports?.rules.filter(
        (rule): rule is SkillRankImportRule =>
          rule.type === "skill_rank_to_var" && rule.skill_id === disclosure.skill_id,
      ) ?? [];
    if (skillImports.length !== 1) {
      throw new Error(
        `${description} skill "${disclosure.skill_id}" must resolve to exactly one campaign skill import in quest "${args.quest.id}", but resolved ${String(skillImports.length)}.`,
      );
    }
    const skillImport = skillImports[0]!;
    if (skillImport.target_var !== skillCheck.skill) {
      throw new Error(
        `${description} skill drift: disclosure "${disclosure.skill_id}" imports quest variable "${skillImport.target_var}", but the compiled check reads "${skillCheck.skill}".`,
      );
    }
    const initialSkillValue = args.pack.meta.vars_init[skillCheck.skill];
    if (initialSkillValue !== 0) {
      throw new Error(
        `${description} odds require imported quest variable "${skillCheck.skill}" to start at 0, but its compiled initial value is ${String(initialSkillValue)}.`,
      );
    }
    if (skillCheck.difficulty !== disclosure.difficulty) {
      throw new Error(
        `${description} difficulty drift: disclosure DC ${String(disclosure.difficulty)} does not match compiled DC ${String(skillCheck.difficulty)}.`,
      );
    }
  }
}

/**
 * Load the RPG source selected by opening_preparation.target_quest and validate
 * every authored check disclosure against that compiled pack.
 */
export function assertOpeningPreparationCheckDisclosureSourceIntegrity(
  root: string,
  world: OverworldManifest,
): void {
  const scene = world.opening_preparation;
  if (!scene) return;
  const quest = world.quests.find((candidate) => candidate.id === scene.target_quest);
  if (!quest) {
    throw new Error(
      `Opening preparation target quest "${scene.target_quest}" has no authored source binding.`,
    );
  }
  const result = loadRpgSourceFile(join(root, quest.source));
  if (!result.ok) {
    throw new Error(
      `Opening preparation target quest "${quest.id}" source "${quest.source}" did not compile: ${result.error.message}`,
    );
  }
  assertOpeningPreparationCheckDisclosurePackIntegrity({
    scene,
    quest,
    pack: result.compiled.pack,
  });
}
