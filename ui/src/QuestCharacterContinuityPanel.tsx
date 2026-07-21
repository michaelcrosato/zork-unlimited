import type { EmbeddedQuestCharacterContinuity } from "../../src/rpg/embedded_quest_character_continuity.js";

function idLabel(id: string): string {
  const local = id.includes(":") ? id.slice(id.lastIndexOf(":") + 1) : id;
  return local
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function importEffectLabel(
  effect: EmbeddedQuestCharacterContinuity["applied_campaign_import_effects"][number],
): string {
  if (effect.type === "health_current_to_var" || effect.type === "skill_rank_to_var") {
    return `${idLabel(effect.rule_id)} → ${idLabel(effect.target_var)} ${effect.value}`;
  }
  if (effect.type === "equipment_to_item") {
    return `${idLabel(effect.rule_id)} → ${idLabel(effect.target_object)}`;
  }
  return `${idLabel(effect.rule_id)} → ${idLabel(effect.target_flag)}`;
}

export function QuestCharacterContinuityPanel({
  continuity,
}: {
  continuity: EmbeddedQuestCharacterContinuity;
}): JSX.Element {
  const persistent = continuity.persistent_record;
  const local = continuity.quest_local_profile;
  return (
    <section className="quest-character-continuity" aria-label="Quest-local profile">
      <p className="kicker">Same persistent character</p>
      <h3>Quest-local profile</h3>
      <dl>
        <div>
          <dt>Persistent record</dt>
          <dd>
            {persistent.background ? idLabel(persistent.background) : "Unregistered character"} ·
            Health {persistent.health.current}/{persistent.health.max}
          </dd>
        </div>
        <div>
          <dt>Scenario numbers</dt>
          <dd>
            HP {local.hp} · ATK {local.attack} · DEF {local.defense}
          </dd>
        </div>
        <div>
          <dt>Scenario skills</dt>
          <dd>
            {local.skills.length > 0
              ? local.skills.map((skill) => `${idLabel(skill.id)} ${skill.value}`).join(" · ")
              : "None"}
          </dd>
        </div>
        <div>
          <dt>Issued quest kit</dt>
          <dd>{local.inventory.length > 0 ? local.inventory.map(idLabel).join(", ") : "None"}</dd>
        </div>
        <div>
          <dt>Campaign imports applied</dt>
          <dd>
            {continuity.applied_campaign_import_effects.length > 0
              ? continuity.applied_campaign_import_effects.map(importEffectLabel).join(" · ")
              : "None"}
          </dd>
        </div>
      </dl>
      <p className="quest-character-continuity-explanation">{continuity.explanation}</p>
    </section>
  );
}
