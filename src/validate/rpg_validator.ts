/**
 * RPG validator (spec §10, §13 Stage 4, §14).
 *
 * An RPG pack is a parser pack plus enemies, so we first run the FULL parser
 * validator (§10.2) — feeding it the flags and items that combat and skill checks
 * provide at runtime, so a gate legitimately opened by a fight or a successful
 * check is not mis-flagged impossible. Then we add Stage-4 invariants:
 *  - the player has the conventional stat vars (HP/attack/defense), HP > 0;
 *  - every enemy stands in a real room and names a declared DEATH ending;
 *  - every fight is WINNABLE — on the player's BEST reachable HP/attack/defense and
 *    the LUCKIEST rolls (player max damage, enemy min damage), the player must still
 *    be standing when the enemy falls. This is a deliberately CONSERVATIVE lower
 *    bound: an ERROR fires only on a fight that is impossible even then. It is NOT a
 *    worst-case-roll survival guarantee — a deliberately luck-dependent fight that a
 *    fully-prepared player can still LOSE on bad rolls (cold_forge/sunken_barrow's
 *    intentional "preparation is a real gamble" tuning, bug_0101/0102) is PERMITTED,
 *    not flagged. (bug_0113: this proof once claimed a worst-case guarantee it never
 *    computed — the contract now matches the code.)
 *  - OPT-IN FAIRNESS (bug_0114): a pack may set `meta.combat_guaranteed: true` to
 *    PROMISE its fights are not a gamble. Then each fight must also clear the UPPER
 *    bound — best reachable stats but the player's WORST rolls (player min damage,
 *    enemy max damage): if even a fully-prepared player can be felled on the unluckiest
 *    rolls, the promise is broken (`COMBAT_NOT_GUARANTEED`). The gamble packs above do
 *    NOT set the flag and stay unflagged; this is the sound next-shape bug_0113 named,
 *    closing the player-experience gap every RPG playtest raises by making "this fight
 *    is fair" a DECLARED, AUDITED property instead of an unverifiable hope.
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
  // Quest stages set through RPG-only branches (combat on_defeat, skill-check
  // on_success/on_failure) — the parser scan never walks these, so without folding
  // them in a quest_stage gate satisfied by a skill check (e.g. levering a seal open)
  // would be mis-flagged IMPOSSIBLE_QUEST_STAGE. Keyed with the SAME NUL separator the
  // parser validator's questStageKey uses, so the keys match. Mirrors extraSettableFlags.
  const extraSettableQuestStages: string[] = [];
  for (const e of rpgRuntimeEffects(pack)) {
    if ("set_flag" in e) extraSettableFlags.push(e.set_flag);
    if ("add_item" in e) extraObtainable.push(e.add_item);
    if ("set_quest_stage" in e)
      extraSettableQuestStages.push(`${e.set_quest_stage.quest}\0${e.set_quest_stage.stage}`);
  }

  // Score awarded through RPG-only branches (combat / skill checks), which the
  // parser validator's SCORE_UNREACHABLE bound does not scan — fold it in so a
  // score earned by winning a fight or passing a check counts as reachable.
  let extraScoreAwards = 0;
  for (const e of rpgRuntimeEffects(pack))
    if ("inc_var" in e && e.inc_var.name === SCORE_VAR) extraScoreAwards += e.inc_var.by;

  // The grouped RPG-only effect lists (each enemy on_defeat, each skill-check
  // on_success/on_failure), handed to the parser validator's SCORE_PEAKS_BEFORE_WIN
  // check so a score award co-located with a combat/skill act that sets a win-trigger
  // flag is seen as such. No current RPG pack wins on a has_flag, so this changes no
  // result today; it is coverage for a future RPG pack whose win turns on a defeat flag.
  const extraEffectLists: Effect[][] = [];
  for (const enemy of pack.enemies) extraEffectLists.push(enemy.on_defeat);
  for (const o of pack.objects)
    for (const it of o.interactions)
      if (it.skill_check)
        extraEffectLists.push(it.skill_check.on_success, it.skill_check.on_failure);

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
    extraEffectLists,
    extraSettableQuestStages,
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
  // Cumulative worst-case damage across the whole opt-in `combat_guaranteed`
  // gauntlet (bug_0172). Only meaningful when the pack PROMISES fair fights: it
  // sums each enemy's per-fight worst-case `maxDamageTaken` so a multi-fight
  // guarantee can be audited JOINTLY, not just per-fight. See the post-loop check.
  let cumulativeWorstDamage = 0;
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

    // Winnability is proved on the LUCKIEST rolls for the player: max player damage
    // (d6 = 6, with best reachable attack) ends the fight in the FEWEST rounds, and
    // min enemy damage (d6 = 1, against best reachable defense) is the LEAST the
    // player can take per surviving round — so `minDamageTaken` is the smallest total
    // damage any run could inflict. The player attacks first each round, so the enemy
    // retaliates only on the rounds it survives (roundsToKill - 1). If even that
    // best-case total would drop the player, NO sequence of rolls can win → the fight
    // is truly impossible (an ERROR). A fight winnable here but lethal on WORSE rolls
    // is a permitted gamble, deliberately NOT flagged (see the file docstring).
    const bestPlayerDmg = Math.max(1, 6 + playerAtk - enemy.defense);
    const roundsToKill = Math.ceil(enemy.hp / bestPlayerDmg);
    const minEnemyDmg = Math.max(1, 1 + enemy.attack - playerDef);
    const minDamageTaken = minEnemyDmg * (roundsToKill - 1);
    if (minDamageTaken >= playerHp) {
      findings.push(
        err(
          "COMBAT_UNWINNABLE",
          `enemy "${enemy.id}" cannot be beaten even with best-case rolls and the player's best reachable stats (needs ${roundsToKill} rounds; would take ≥${minDamageTaken} damage vs ${playerHp} reachable HP).`,
          [`enemy:${enemy.id}`],
        ),
      );
    }

    // Opt-in fairness guarantee (bug_0114). The check above is a LOWER bound that
    // permits a luck-dependent gamble; a pack that PROMISES fair fights declares
    // `meta.combat_guaranteed: true` and must also clear the UPPER bound — best
    // reachable stats but the player's UNLUCKIEST rolls (player min damage d6=1,
    // enemy max damage d6=6). This is the exact mirror of the best-case math, rolls
    // flipped: min player damage MAXIMISES rounds-to-kill, so the enemy retaliates
    // the MOST times (worstRoundsToKill - 1, the player still striking first), each
    // for the MOST it can deal — the true maximum total damage any roll sequence can
    // inflict. If that still drops a best-prepared player, the fight is a gamble and
    // the promise is false (ERROR). When it does NOT, the player survives on EVERY
    // possible sequence, so the guarantee is sound.
    if (pack.meta.combat_guaranteed) {
      const worstPlayerDmg = Math.max(1, 1 + playerAtk - enemy.defense);
      const worstRoundsToKill = Math.ceil(enemy.hp / worstPlayerDmg);
      const maxEnemyDmg = Math.max(1, 6 + enemy.attack - playerDef);
      const maxDamageTaken = maxEnemyDmg * (worstRoundsToKill - 1);
      cumulativeWorstDamage += maxDamageTaken;
      if (maxDamageTaken >= playerHp) {
        findings.push(
          err(
            "COMBAT_NOT_GUARANTEED",
            `meta.combat_guaranteed is set, but enemy "${enemy.id}" can still fell a best-prepared player on worst-case rolls (needs ${worstRoundsToKill} rounds; would take up to ${maxDamageTaken} damage vs ${playerHp} reachable HP). Make the fight winnable on every roll, or drop the guarantee and let it stand as a declared gamble.`,
            [`enemy:${enemy.id}`],
          ),
        );
      }
    }
  }

  // Cumulative-HP-aware gauntlet guarantee (bug_0172). The per-fight upper bound
  // above proves each fight survivable against the player's FULL reachable HP, but
  // never threads HP across SEQUENTIAL fights — so two fights that each clear the
  // bound alone can still jointly fell a best-prepared player on worst cumulative
  // rolls. When a pack PROMISES fair fights (`meta.combat_guaranteed`), that safety
  // promise must hold across the WHOLE gauntlet, not just each fight in isolation.
  //
  // The sum of every enemy's worst-case `maxDamageTaken` is an order-independent
  // OVER-approximation of the worst total damage a player can take: it ignores fight
  // order and treats optional/mutually-exclusive enemies as all-fought. That is the
  // correct-conservative direction for a SAFETY promise — it can only REFUSE an
  // unsafe guarantee, never falsely grant one. It is therefore tied to the UPPER /
  // guarantee bound ONLY. Do NOT move or "tighten" this into the lower
  // COMBAT_UNWINNABLE bound: that bound is a route-EXISTENCE proof (some roll
  // sequence wins), and summing it would forbid a legitimate gamble gauntlet a lucky
  // player CAN clear — i.e. it would be UNSOUND. Keep it post-loop and upper-only.
  if (pack.meta.combat_guaranteed && cumulativeWorstDamage >= playerHp) {
    findings.push(
      err(
        "COMBAT_GAUNTLET_NOT_GUARANTEED",
        `meta.combat_guaranteed is set, but the fights are not jointly survivable: across the gauntlet the player can take up to ${cumulativeWorstDamage} cumulative damage on worst-case rolls vs ${playerHp} reachable HP, so a best-prepared player can fall over the sequence even though each fight passes alone. Make the gauntlet survivable on every roll, or drop the guarantee and let it stand as a declared gamble.`,
        ["meta:combat_guaranteed"],
      ),
    );
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
