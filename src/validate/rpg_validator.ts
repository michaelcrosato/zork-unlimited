/**
 * RPG validator (spec §10, §13 Stage 4, §14).
 *
 * An RPG pack is a parser pack plus enemies, so we first run the FULL parser
 * validator (§10.2) — feeding it the flags and items that combat and skill checks
 * provide at runtime, so a gate legitimately opened by a fight or a successful
 * check is not mis-flagged impossible. Then we add Stage-4 invariants:
 *  - the player has the conventional stat vars (HP/attack/defense), HP > 0;
 *  - every enemy stands in a real room and names a declared DEATH ending;
 *  - every fight is WINNABLE — even best-case player (best reachable HP/attack/
 *    defense) vs. worst-case-for-them rolls must not kill the player before the
 *    enemy falls (conservative: only a truly impossible fight is an error);
 *  - every skill check is PASSABLE — d20 + the best reachable skill can meet the
 *    difficulty;
 *  - every end_game inside on_defeat / on_success / on_failure is declared.
 */
import type { Effect } from "../core/effects.js";
import { validateParser } from "./parser_validator.js";
import { type Finding, type ValidationReport, makeReport } from "./report.js";
import { type RpgPack, HP_VAR, ATTACK_VAR, DEFENSE_VAR, enemyHpVar } from "../rpg/schema.js";
import { SCORE_VAR } from "../parser/schema.js";

const err = (code: string, message: string, where: string[]): Finding => ({
  severity: "error",
  code,
  message,
  where,
});

function rpgRuntimeEffects(pack: RpgPack): Effect[] {
  const out: Effect[] = [];
  for (const e of pack.enemies) out.push(...e.on_defeat);
  for (const o of pack.objects)
    for (const it of o.interactions)
      if (it.skill_check) out.push(...it.skill_check.on_success, ...it.skill_check.on_failure);
  return out;
}

export function validateRpg(pack: RpgPack): ValidationReport {
  // Flags/items that combat + skill checks provide — handed to the parser validator.
  const extraSettableFlags: string[] = [];
  const extraObtainable: string[] = [];
  for (const enemy of pack.enemies) {
    if (enemy.defeat_flag) extraSettableFlags.push(enemy.defeat_flag);
  }
  for (const e of rpgRuntimeEffects(pack)) {
    if ("set_flag" in e) extraSettableFlags.push(e.set_flag);
    if ("add_item" in e) extraObtainable.push(e.add_item);
  }

  // Score awarded through RPG-only branches (combat / skill checks), which the
  // parser validator's SCORE_UNREACHABLE bound does not scan — fold it in so a
  // score earned by winning a fight or passing a check counts as reachable.
  let extraScoreAwards = 0;
  for (const e of rpgRuntimeEffects(pack))
    if ("inc_var" in e && e.inc_var.name === SCORE_VAR) extraScoreAwards += e.inc_var.by;

  // The WIN_FIRES_AT_START stability proof must also see RPG-only falsifiers:
  // combat / skill branches can falsify a start-true win (extraFalsifierEffects),
  // and combat mutates HP via dynamic set_var the parser scan never sees, so the
  // player + enemy HP vars are volatile (a win condition on them is escapable).
  const extraVolatileVars = [
    HP_VAR,
    ATTACK_VAR,
    DEFENSE_VAR,
    ...pack.enemies.map((e) => enemyHpVar(e.id)),
  ];
  const base = validateParser(pack, {
    extraSettableFlags,
    extraObtainable,
    extraScoreAwards,
    extraFalsifierEffects: rpgRuntimeEffects(pack),
    extraVolatileVars,
  });
  const findings: Finding[] = [...base.findings];

  const roomIds = new Set(pack.rooms.map((r) => r.id));
  const endings = new Map(pack.endings.map((e) => [e.id, e]));

  // ── Player stats ─────────────────────────────────────────────────────────────
  const vi = pack.meta.vars_init;
  for (const stat of [HP_VAR, ATTACK_VAR, DEFENSE_VAR]) {
    if (vi[stat] === undefined)
      findings.push(
        err(
          "MISSING_STAT",
          `meta.vars_init is missing the "${stat}" stat (Stage 4 requires HP/attack/defense).`,
          ["meta:vars_init"],
        ),
      );
  }
  if ((vi[HP_VAR] ?? 0) <= 0)
    findings.push(
      err("BAD_HP", `meta.vars_init.${HP_VAR} must start positive.`, ["meta:vars_init"]),
    );

  // Best reachable value of a stat/skill = init + every positive inc_var that
  // targets it, across all reachable effect sources (room on_enter, object
  // interactions, NPC dialogue, combat on_defeat, and skill-check branches). This
  // mirrors the skill-check ceiling used below: the combat-winnability proof must
  // credit the player the SAME buffs a skill check does, or a fight winnable only
  // after a reachable +attack weapon / +defense ward (e.g. cold_forge's lantern-
  // spirit +2 attack and founder's-plate +2 defense, sunken_barrow's shade ward)
  // is wrongly flagged COMBAT_UNWINNABLE. COMBAT_UNWINNABLE means "only a TRULY
  // impossible fight is an error", so over-approximating player power (assume every
  // buff obtained) is the sound direction — it can only REMOVE false positives,
  // never add one. A negative inc_var (a debuff) is ignored (Math.max(0, by)),
  // exactly as the skill ceiling does, so it never over-credits.
  const buffEffects = [...rpgRuntimeEffects(pack), ...allParserEffects(pack)];
  const statCeiling = (name: string): number => {
    let v = vi[name] ?? 0;
    for (const e of buffEffects)
      if ("inc_var" in e && e.inc_var.name === name) v += Math.max(0, e.inc_var.by);
    return v;
  };

  const playerHp = statCeiling(HP_VAR);
  const playerAtk = statCeiling(ATTACK_VAR);
  const playerDef = statCeiling(DEFENSE_VAR);

  // ── Enemies ──────────────────────────────────────────────────────────────────
  for (const enemy of pack.enemies) {
    if (!roomIds.has(enemy.room))
      findings.push(
        err(
          "ENEMY_ROOM_MISSING",
          `enemy "${enemy.id}" stands in room "${enemy.room}" that does not exist.`,
          [`enemy:${enemy.id}`],
        ),
      );
    const ending = endings.get(enemy.death_ending);
    if (!ending)
      findings.push(
        err(
          "ENEMY_DEATH_ENDING_UNDECLARED",
          `enemy "${enemy.id}" death_ending "${enemy.death_ending}" is not a declared ending.`,
          [`enemy:${enemy.id}`],
        ),
      );
    else if (!ending.death)
      findings.push(
        err(
          "ENEMY_DEATH_NOT_DEATH",
          `enemy "${enemy.id}" death_ending "${enemy.death_ending}" is not flagged as a death ending.`,
          [`enemy:${enemy.id}`],
        ),
      );

    // Winnability: best-case player damage (d6 max = 6, with best reachable attack)
    // vs. worst-case enemy damage (d6 min = 1, against best reachable defense), from
    // best reachable HP. Enemy attacks once per round the player fails to kill it.
    const bestPlayerDmg = Math.max(1, 6 + playerAtk - enemy.defense);
    const roundsToKill = Math.ceil(enemy.hp / bestPlayerDmg);
    const minEnemyDmg = Math.max(1, 1 + enemy.attack - playerDef);
    const worstCaseDamageTaken = minEnemyDmg * (roundsToKill - 1);
    if (worstCaseDamageTaken >= playerHp) {
      findings.push(
        err(
          "COMBAT_UNWINNABLE",
          `enemy "${enemy.id}" cannot be beaten even with best-case rolls and the player's best reachable stats (needs ${roundsToKill} rounds; would take ≥${worstCaseDamageTaken} damage vs ${playerHp} reachable HP).`,
          [`enemy:${enemy.id}`],
        ),
      );
    }
  }

  // ── Skill checks ─────────────────────────────────────────────────────────────
  // Best reachable value of a skill uses the same statCeiling as combat above.
  for (const o of pack.objects) {
    for (const it of o.interactions) {
      const sc = it.skill_check;
      if (!sc) continue;
      if (sc.difficulty > 20 + statCeiling(sc.skill)) {
        findings.push(
          err(
            "SKILL_CHECK_IMPOSSIBLE",
            `skill check on "${o.id}" needs ${sc.difficulty} but d20 + best "${sc.skill}" tops out at ${20 + statCeiling(sc.skill)}.`,
            [`object:${o.id}`],
          ),
        );
      }
    }
  }

  // ── end_game targets inside RPG-only effect branches must be declared ─────────
  for (const e of rpgRuntimeEffects(pack)) {
    if ("end_game" in e && !endings.has(e.end_game)) {
      findings.push(
        err(
          "END_GAME_UNDECLARED",
          `an RPG effect (on_defeat/skill check) targets undeclared ending "${e.end_game}".`,
          [`ending:${e.end_game}`],
        ),
      );
    }
  }

  return makeReport(pack.meta.id, findings);
}

function allParserEffects(pack: RpgPack): Effect[] {
  const out: Effect[] = [];
  for (const r of pack.rooms) out.push(...r.on_enter);
  for (const o of pack.objects) for (const it of o.interactions) out.push(...it.effects);
  for (const n of pack.npcs) for (const node of n.dialogue.nodes) out.push(...node.effects);
  return out;
}
