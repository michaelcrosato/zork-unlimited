/**
 * Metamorphic relabeling for RPG packs — the RPG-mode extension of the
 * contamination-robustness oracle (bug_0212), completing the trilogy the CYOA relabeler
 * (bug_0209, relabel_cyoa.ts) and the PARSER relabeler (bug_0211, relabel_parser.ts)
 * began. This is the last of the three modes, following the exact growth path the
 * bug_0121 reachability oracle took (CYOA → parser → rpg).
 *
 * WHAT IT DOES. An RPG pack IS a parser pack PLUS `enemies` and an optional
 * `meta.combat_guaranteed` (src/rpg/schema.ts). So the relabeler REUSES the parser body
 * walk verbatim — `relabelParserBody`, the typed traversal over the closed
 * Condition/Effect DSLs and the parser schema (relabel_parser.ts) — driven by one shared
 * bijection, then relabels the RPG-only surface on top:
 *   - every ENEMY's id, its `room` (a room-id ref), its `defeat_flag` (a flag), its
 *     `death_ending` (an ending id), and its `on_defeat` effects (via `relabelEffect`);
 *   - `meta.combat_guaranteed` is a boolean fairness opt-in, not an id — carried through
 *     byte-identical (and absent-vs-present preserved so a pack that omits it stays
 *     byte-identical, matching its content hash).
 * Enemy `name`/`description` are prose and `hp`/`attack`/`defense` are numbers — all
 * untouched. As in the other two relabelers, all PROSE and player-facing COMMAND
 * VOCABULARY (object aliases, exit directions, USE command_verb/template) stay
 * byte-identical.
 *
 * THE RPG-SPECIFIC RESERVED VARS. The parser relabeler holds only `score` (SCORE_VAR)
 * fixed, because the runner/observation/validator special-case it. RPG special-cases
 * THREE more player-stat vars by LITERAL name: `hp`, `attack`, `defense` (HP_VAR /
 * ATTACK_VAR / DEFENSE_VAR) are read as `state.vars[HP_VAR]` etc. by the combat resolver
 * (src/rpg/combat.ts:71-73) and the observation builder (src/rpg/observation.ts:43-45).
 * They are ENGINE KEYWORDS, not author-chosen ids — so this relabeler widens the reserved
 * set to `{score, hp, attack, defense}` and holds all four fixed (passed to
 * `makeParserRelabeler`). A SKILL-CHECK's `skill` (e.g. "might") is by contrast a normal
 * author var read via `state.vars[check.skill]`, so it relabels — consistently at both its
 * `skill_check.skill` site and its `vars_init` key (the parser walk already routes both
 * through the reserved-aware `rvar`).
 *
 * THE DERIVED ENEMY-HP VAR follows for free. The runner tracks an enemy's remaining HP in
 * a hidden var `__enemy_hp_<id>` SYNTHESISED from the enemy id (enemyHpVar, schema.ts:74),
 * exactly as the parser runner synthesises `__dlg_<npcid>` from an npc id (the bug_0211
 * note). Because we relabel the enemy id consistently, the synthesised var name follows;
 * no pack ever AUTHORS `__enemy_hp_*` (the rpg reachability oracle asserts no condition
 * even reads an HP var), so there is no author site to relabel and the state-graph
 * isomorphism holds.
 *
 * WHY IT IS AN ORACLE / SOUNDNESS — identical argument to the CYOA and parser relabelers:
 * the engine is content-free and id-driven, so a pack's solvability is a property of its
 * STRUCTURE not its id strings; rpg_metamorphic_relabel.test.ts ASSERTS that invariance
 * (exhaustive ending-reachability census under the best/worst-roll bracket, distinct-state
 * count, and validateRpg finding-code multiset all identical modulo the bijection). The
 * walk is TYPED, so prose can never be corrupted; the bijection is memoized hence injective
 * and consistent; completeness is self-checked by the oracle (a missed id site → a dangling
 * reference → a loud census/validation divergence, never a silent pass).
 */
import type { RpgPack, Enemy } from "../../../src/rpg/schema.js";
import { HP_VAR, ATTACK_VAR, DEFENSE_VAR } from "../../../src/rpg/schema.js";
import {
  makeParserRelabeler,
  relabelParserBody,
  relabelEffect,
  PARSER_RESERVED_VARS,
  type ParserRelabeler,
} from "./relabel_parser.js";

/**
 * The RPG engine-keyword vars, held FIXED by the relabel: the parser's `score` plus the
 * three player-stat vars the combat resolver / observation read by literal name. Kept in
 * sync with src/rpg/schema.ts (HP_VAR/ATTACK_VAR/DEFENSE_VAR) and parser SCORE_VAR.
 */
export const RPG_RESERVED_VARS: ReadonlySet<string> = new Set([
  ...PARSER_RESERVED_VARS,
  HP_VAR,
  ATTACK_VAR,
  DEFENSE_VAR,
]);

function relabelEnemy(e: Enemy, r: (id: string) => string, rv: (n: string) => string): Enemy {
  return {
    id: r(e.id),
    name: e.name, // prose
    description: e.description, // prose
    room: r(e.room),
    hp: e.hp, // number
    attack: e.attack, // number
    defense: e.defense, // number
    // Preserve absent-vs-present so an unused field stays absent (schema/hash parity).
    ...(e.defeat_flag !== undefined ? { defeat_flag: r(e.defeat_flag) } : {}),
    death_ending: r(e.death_ending),
    on_defeat: e.on_defeat.map((eff) => relabelEffect(eff, r, rv)),
  };
}

/**
 * Relabel a whole RPG pack into a structurally isomorphic twin. Returns the twin plus the
 * bijection that produced it (so a caller maps the original's reached/declared ending ids
 * through `r` to compare against the twin's census). The bijection holds `{score, hp,
 * attack, defense}` fixed; every other identifier — including enemy ids and the
 * synthesised `__enemy_hp_<id>` they drive — is renamed.
 */
export function relabelRpgPack(pack: RpgPack): {
  pack: RpgPack;
  relabeler: ParserRelabeler;
} {
  const relabeler = makeParserRelabeler(RPG_RESERVED_VARS);
  const { r, rvar } = relabeler;
  const body = relabelParserBody(pack, relabeler);
  const relabeled: RpgPack = {
    ...body,
    meta: {
      ...body.meta,
      // boolean fairness opt-in — not an id; carried through, absent-vs-present preserved.
      ...(pack.meta.combat_guaranteed !== undefined
        ? { combat_guaranteed: pack.meta.combat_guaranteed }
        : {}),
    },
    enemies: pack.enemies.map((e) => relabelEnemy(e, r, rvar)),
  };
  return { pack: relabeled, relabeler };
}
