import { HP_VAR, type RpgPack } from "../../../src/rpg/schema.js";

export type HpConditionSupport = Readonly<{
  supportedPlayerUpperBound: boolean;
  unsupported: boolean;
}>;

function mergeHpSupport(left: HpConditionSupport, right: HpConditionSupport): HpConditionSupport {
  return {
    supportedPlayerUpperBound: left.supportedPlayerUpperBound || right.supportedPlayerUpperBound,
    unsupported: left.unsupported || right.unsupported,
  };
}

/** True for the player HP var and any hidden per-enemy HP var (`__enemy_hp_*`). */
function isHpVar(name: string): boolean {
  return name === HP_VAR || name.startsWith("__enemy_hp_");
}

/**
 * The minimum effective player defense is zero (maneuver modifiers are clamped), so
 * `d6 max + enemy attack` is a conservative upper bound for any one counterattack.
 */
export function maximumCounterattackDamage(pack: RpgPack): number {
  return Math.max(1, ...pack.enemies.map((enemy) => 6 + enemy.attack));
}

/**
 * Recursively classify HP-reading conditions. Effects that write HP never match. A player
 * `var_lte` threshold at or above the maximum one-round reply is monotone and safe for the
 * best/worst-roll bracket; all enemy-HP predicates, lower bounds, equalities, and unsafe
 * player upper bounds remain unsupported.
 */
function classifyHpConditions(
  node: unknown,
  safeUpperBound: number,
  combatGuaranteed: boolean,
): HpConditionSupport {
  if (Array.isArray(node)) {
    return node.reduce<HpConditionSupport>(
      (combined, value) =>
        mergeHpSupport(combined, classifyHpConditions(value, safeUpperBound, combatGuaranteed)),
      { supportedPlayerUpperBound: false, unsupported: false },
    );
  }
  if (node && typeof node === "object") {
    for (const kind of ["var_gte", "var_lte", "var_eq"] as const) {
      const comparison = (node as Record<string, unknown>)[kind];
      if (
        comparison &&
        typeof comparison === "object" &&
        typeof (comparison as { name?: unknown }).name === "string" &&
        isHpVar((comparison as { name: string }).name)
      ) {
        const name = (comparison as { name: string }).name;
        const value = (comparison as { value?: unknown }).value;
        const supportedPlayerUpperBound =
          combatGuaranteed &&
          name === HP_VAR &&
          kind === "var_lte" &&
          typeof value === "number" &&
          value >= safeUpperBound;
        return {
          supportedPlayerUpperBound,
          unsupported: !supportedPlayerUpperBound,
        };
      }
    }
    return Object.values(node as Record<string, unknown>).reduce<HpConditionSupport>(
      (combined, value) =>
        mergeHpSupport(combined, classifyHpConditions(value, safeUpperBound, combatGuaranteed)),
      { supportedPlayerUpperBound: false, unsupported: false },
    );
  }
  return { supportedPlayerUpperBound: false, unsupported: false };
}

/**
 * Classify every HP-reading condition in a compiled pack against the conservative combat
 * criterion shared by the exhaustive RPG proofs.
 */
export function hpConditionSupportForPack(pack: RpgPack): HpConditionSupport {
  return classifyHpConditions(
    pack,
    maximumCounterattackDamage(pack),
    pack.meta.combat_guaranteed === true,
  );
}
