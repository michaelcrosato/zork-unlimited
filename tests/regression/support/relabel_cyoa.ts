/**
 * Metamorphic relabeling for CYOA packs — the engine of the contamination-robustness
 * oracle (bug_0209, the deferred "metamorphic relabel/IPT oracle" lever from the
 * bug_0208 ultraplan / docs/CURRENT_PLAN.md "Deferred to next cycle" #3).
 *
 * WHAT IT DOES. Given a compiled `CyoaPack`, it produces a STRUCTURALLY ISOMORPHIC
 * pack in which every *identifier* — scene ids, ending ids, choice ids, flag names,
 * var names, item ids, object ids, quest/stage names, and the pack id — is rewritten
 * to an opaque token (`mx_0`, `mx_1`, …) via one consistent bijection, while every
 * *prose* field (titles, scene/ending/variant text, `narrate`, `add_journal`) is left
 * byte-for-byte untouched. A reference and its definition share the same old string,
 * so the same memoized bijection maps both to the same new token: the relabeled pack
 * is a valid pack describing the SAME game with DIFFERENT names.
 *
 * WHY IT IS AN ORACLE. The AdventureForge engine (src/core/engine.ts) is content-free
 * and id-driven: ids are opaque keys, never special-cased, so a game's solvability is a
 * property of its STRUCTURE, not of the particular strings an author chose. This module
 * lets a test ASSERT that invariance directly (see cyoa_metamorphic_relabel.test.ts):
 * the exhaustive ending-reachability census, the distinct-state count, and the
 * validator's finding set must all be identical (modulo the bijection) on a pack and
 * its relabeling. Two payoffs:
 *   1. Soundness witness for the whole id-driven design — if any engine/runner change
 *      ever made behaviour depend on a literal id (a hash of an id leaking into routing,
 *      a scene id special-cased), every existing oracle that runs on the literal shipped
 *      packs would still pass, but THIS one would diverge and fail loudly.
 *   2. Contamination-robustness witness for the benchmark (the project's true goal,
 *      [[ultraplan-true-goal-pivot]]): because a pack can be mechanically relabeled into
 *      a surface-different but structurally-identical twin, a model that "solved" the
 *      original by MEMORISING its identifier strings gains nothing on the twin — so the
 *      eval measures structure-following, not string recall. The relabeler is also the
 *      core primitive for cheaply EVOLVING the eval distribution ([[fresh-pack-generator]]).
 *
 * SOUNDNESS OF THE RELABELER ITSELF. The walk is TYPED, not a generic deep substitution:
 * it rewrites ids ONLY at the schema positions that hold ids (enumerated below against
 * the closed Condition/Effect DSLs), so a prose field can never be corrupted and a prose
 * value that happens to equal an id can never be wrongly rewritten. Completeness is in
 * turn self-checked by the oracle's own assertions: a MISSED id site leaves a dangling
 * reference, which makes the relabeled pack either fail the validator or reach a
 * different ending set — a loud test failure, never a silent pass. The bijection is
 * memoized (each distinct old id → a fresh `mx_<n>`), hence injective and consistent.
 */
import type { CyoaPack, Scene, Ending, Choice, SceneVariant } from "../../../src/cyoa/schema.js";
import type { Condition } from "../../../src/core/conditions.js";
import type { Effect } from "../../../src/core/effects.js";

/** A memoized bijection over identifier strings (old id → fresh opaque token). */
export type Relabeler = {
  /** Map an id to its opaque token, assigning a new one on first sight. */
  r: (id: string) => string;
  /** The accumulated old→new map (populated as the pack is walked). */
  map: ReadonlyMap<string, string>;
};

/** Build a fresh memoized bijection. Distinct olds get distinct `mx_<n>` tokens. */
export function makeRelabeler(): Relabeler {
  const map = new Map<string, string>();
  let n = 0;
  const r = (id: string): string => {
    let v = map.get(id);
    if (v === undefined) {
      v = `mx_${n++}`;
      map.set(id, v);
    }
    return v;
  };
  return { r, map };
}

function relabelCondition(c: Condition, r: (id: string) => string): Condition {
  if ("has_flag" in c) return { has_flag: r(c.has_flag) };
  if ("not_flag" in c) return { not_flag: r(c.not_flag) };
  if ("has_item" in c) return { has_item: r(c.has_item) };
  if ("not_item" in c) return { not_item: r(c.not_item) };
  if ("visited" in c) return { visited: r(c.visited) };
  if ("not_visited" in c) return { not_visited: r(c.not_visited) };
  if ("is_open" in c) return { is_open: r(c.is_open) };
  if ("is_unlocked" in c) return { is_unlocked: r(c.is_unlocked) };
  if ("var_gte" in c) return { var_gte: { name: r(c.var_gte.name), value: c.var_gte.value } };
  if ("var_lte" in c) return { var_lte: { name: r(c.var_lte.name), value: c.var_lte.value } };
  if ("var_eq" in c) return { var_eq: { name: r(c.var_eq.name), value: c.var_eq.value } };
  if ("quest_stage" in c)
    return { quest_stage: { quest: r(c.quest_stage.quest), stage: r(c.quest_stage.stage) } };
  if ("all_of" in c) return { all_of: c.all_of.map((x) => relabelCondition(x, r)) };
  if ("any_of" in c) return { any_of: c.any_of.map((x) => relabelCondition(x, r)) };
  if ("none_of" in c) return { none_of: c.none_of.map((x) => relabelCondition(x, r)) };
  // Exhaustive over the closed Condition DSL; an unhandled kind is a compile error.
  const _exhaustive: never = c;
  return _exhaustive;
}

function relabelEffect(e: Effect, r: (id: string) => string): Effect {
  if ("set_flag" in e) return { set_flag: r(e.set_flag) };
  if ("clear_flag" in e) return { clear_flag: r(e.clear_flag) };
  if ("add_item" in e) return { add_item: r(e.add_item) };
  if ("remove_item" in e) return { remove_item: r(e.remove_item) };
  if ("set_var" in e) return { set_var: { name: r(e.set_var.name), value: e.set_var.value } };
  if ("inc_var" in e) return { inc_var: { name: r(e.inc_var.name), by: e.inc_var.by } };
  if ("dec_var" in e) return { dec_var: { name: r(e.dec_var.name), by: e.dec_var.by } };
  if ("add_journal" in e) return { add_journal: e.add_journal }; // prose — untouched
  if ("goto" in e) return { goto: r(e.goto) };
  if ("unlock_exit" in e)
    return { unlock_exit: { from: r(e.unlock_exit.from), to: r(e.unlock_exit.to) } };
  if ("open_object" in e) return { open_object: r(e.open_object) };
  if ("set_object_locked" in e)
    return {
      set_object_locked: { id: r(e.set_object_locked.id), locked: e.set_object_locked.locked },
    };
  if ("place_object" in e)
    return { place_object: { id: r(e.place_object.id), room: r(e.place_object.room) } };
  if ("set_quest_stage" in e)
    return {
      set_quest_stage: { quest: r(e.set_quest_stage.quest), stage: r(e.set_quest_stage.stage) },
    };
  if ("narrate" in e) return { narrate: e.narrate }; // prose — untouched
  if ("end_game" in e) return { end_game: r(e.end_game) };
  const _exhaustive: never = e;
  return _exhaustive;
}

function relabelVariant(v: SceneVariant, r: (id: string) => string): SceneVariant {
  return { when: v.when.map((c) => relabelCondition(c, r)), text: v.text };
}

function relabelSkillCheck(
  sc: NonNullable<Choice["skill_check"]>,
  r: (id: string) => string,
): NonNullable<Choice["skill_check"]> {
  return {
    skill: r(sc.skill), // a var name — relabeled like every other id (cf. relabelEffect's inc_var)
    difficulty: sc.difficulty,
    on_success: sc.on_success.map((x) => relabelEffect(x, r)),
    on_failure: sc.on_failure.map((x) => relabelEffect(x, r)),
  };
}

function relabelChoice(c: Choice, r: (id: string) => string): Choice {
  return {
    id: r(c.id),
    text: c.text, // prose — untouched
    conditions: c.conditions.map((x) => relabelCondition(x, r)),
    effects: c.effects.map((x) => relabelEffect(x, r)),
    // Preserve absent-vs-present so the relabeled twin keeps schema parity: a plain choice
    // carries `next`, a skill-checked one carries `skill_check` (never both, never neither).
    ...(c.next !== undefined ? { next: r(c.next) } : {}),
    ...(c.skill_check ? { skill_check: relabelSkillCheck(c.skill_check, r) } : {}),
  };
}

function relabelScene(s: Scene, r: (id: string) => string): Scene {
  return {
    id: r(s.id),
    title: s.title, // prose
    text: s.text, // prose
    // Preserve absent-vs-present so an unused field stays absent (schema parity).
    ...(s.variants ? { variants: s.variants.map((v) => relabelVariant(v, r)) } : {}),
    on_enter: s.on_enter.map((x) => relabelEffect(x, r)),
    is_ending: s.is_ending,
    choices: s.choices.map((c) => relabelChoice(c, r)),
  };
}

function relabelEnding(e: Ending, r: (id: string) => string): Ending {
  return {
    id: r(e.id),
    title: e.title, // prose
    text: e.text, // prose
    ...(e.variants ? { variants: e.variants.map((v) => relabelVariant(v, r)) } : {}),
    // `death` is a boolean failure-marker — label-invariant, so it passes through unchanged
    // (preserve absent-vs-present for schema parity, like `variants`). Required once a pack
    // uses it, or the relabeled twin's observation `ending_death` diverges from the original's.
    ...(e.death !== undefined ? { death: e.death } : {}),
  };
}

/**
 * Relabel a whole CYOA pack. Returns the isomorphic pack plus the bijection that
 * produced it (so a caller can map the original's reached-ending / declared-ending
 * ids through `r` to compare against the relabeled census). The bijection is built
 * lazily as the pack is walked, so on return `relabeler.map` is the complete map.
 */
export function relabelCyoaPack(pack: CyoaPack): { pack: CyoaPack; relabeler: Relabeler } {
  const relabeler = makeRelabeler();
  const r = relabeler.r;
  const meta = pack.meta;
  const relabeled: CyoaPack = {
    meta: {
      id: r(meta.id),
      title: meta.title, // prose
      start: r(meta.start),
      vars_init: Object.fromEntries(Object.entries(meta.vars_init).map(([k, v]) => [r(k), v])),
      flags_init: meta.flags_init.map((f) => r(f)),
      ...(meta.deadline
        ? {
            deadline: {
              when: meta.deadline.when.map((c) => relabelCondition(c, r)),
              ending: r(meta.deadline.ending),
            },
          }
        : {}),
    },
    scenes: pack.scenes.map((s) => relabelScene(s, r)),
    endings: pack.endings.map((e) => relabelEnding(e, r)),
  };
  return { pack: relabeled, relabeler };
}
