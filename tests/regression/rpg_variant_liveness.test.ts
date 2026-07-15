/**
 * Structural verification (§15) — every declared reactive `variant` of every shipped
 * RPG pack is LIVE: there is a concretely-reachable state in which that variant is the
 * FIRST match AND the thing it describes is in view (the room you stand in, or an object
 * present to examine) — exactly the text a real player sees. The RPG completion of the
 * dead-reactive-prose liveness trilogy: CYOA (bug_0145) + parser (bug_0146) closed the
 * two deterministic modes; this closes the last, genuinely-harder mode. Together with the
 * static shadowing checks the
 * "dead reactive prose" defect class is now closed across all three modes.
 *
 * The defect class has two causes; this proves the LIVE half directly against ground
 * truth, the complement to the static shadowing check:
 *   - SHADOWING (static): a later sibling whose `when` is PROVABLY ENTAILED by an earlier
 *     one can never be first match. Sound but partial — reasons only over pure literal/
 *     var-bound conjunctions, never the pack's real gating.
 *   - UNREACHABLE GUARD (here, dynamic): a variant whose `when` no reachable state at its
 *     viewing context can satisfy — a flag set only on a branch that never returns, a var
 *     threshold the gating never reaches, an enemy never defeated. Not shadowed; its guard
 *     is simply unreachable, so its text is dead and no blind playtest is guaranteed to
 *     surface it. RPG rooms/objects and endings carry reactive variants, so room + object
 *     variants are the whole scope, exactly as in the parser proof.
 *
 * ── Why RPG is the harder mode, and how this stays SOUND ─────────────────────────────
 * CYOA and the parser stage are fully DETERMINISTIC, so a single-`Rules` BFS that steps
 * each legal action explores every transition, and bug_0145/bug_0146 mine variant display
 * from that one search. RPG adds the engine's only randomness: an ATTACK round draws a d6
 * for the player's strike and a d6 for the enemy's reply, and a skill check draws a d20
 * (src/rpg/combat.ts). A single seeded draw per (state, action) would explore just ONE of
 * the outcomes, so a naive single-rules liveness search could FALSELY call a variant dead
 * when only the OTHER combat/skill outcome reaches its display state.
 *
 * So this reuses the same fix the every-ending RPG proof uses (bug_0124,
 * rpg_all_endings_reachable.test.ts): drive `exhaustiveEndingsMulti` under TWO rule sets
 * that differ only in the rolls their combat/skill resolver draws — one forcing the
 * player's BEST rolls (max strike, min damage taken, max skill roll), one their WORST.
 * Because the only routing-relevant consequence of a round is MONOTONE in the roll (did
 * the enemy reach 0 HP, did the player reach 0 HP, did d20+skill meet the difficulty),
 * those two extremes bracket every outcome a middle roll could produce. Every successor is
 * a real `makeStep` on a legal die face (1/6 for d6, 1/20 for d20), so nothing spurious is
 * visited; and every reachable post-combat / post-check configuration is reached under one
 * of the two regimes, so no live variant is missed.
 *
 * ── The roll-bracket caveat (the exact crux bug_0146's next-focus named), resolved ──────
 * The bracket is complete for VARIANT LIVENESS only if no variant's `when` reads a
 * roll-dependent TRANSIENT the best/worst extremes skip over — i.e. a raw HP value (a
 * middle roll can land an intermediate HP the two extremes never visit). RPG variants gate
 * on flags / items / non-HP vars / object state / visited — all of which evolve either by
 * roll-independent actions or by MONOTONE combat consequences (an enemy's `defeat_flag` and
 * `on_defeat` fire when it dies; a skill check's `on_success`/`on_failure` fire on the
 * best/worst roll), so the bracket reaches them. The one way this could break is a variant
 * gated on a raw HP var, so the suite ASSERTS no pack condition reads an HP var (player `hp`
 * or a hidden `__enemy_hp_*`) — the SAME load-bearing guard rpg_all_endings_reachable makes,
 * here covering variant `when`s as a subset of all pack conditions. A pack that violates it
 * trips a loud, explained failure (branch the HP in the solver) rather than silently
 * under-crediting a variant. Both shipped packs pass it today.
 *
 * ── The action policy (shared with the parser liveness proof) ───────────────────────────
 * The shared BFS defaults to a MONOTONE progress-only policy (skip reversible/observation
 * moves) that is sound for the every-ending PROOF but NOT for liveness — skipping a state
 * that displays a variant would FALSELY call it dead. So, exactly as bug_0146 does, this
 * widens the policy to step every action EXCEPT those that provably cannot gate a variant:
 * inert LOOK/INVENTORY observations, CLOSE, and DROP. An authored INSPECT interaction
 * resolves through the natural LOOK action and may mutate flags, so target looks backed by
 * INSPECT are explicitly stepped. READ and every progress action — including ATTACK and the
 * skill-check USE — are stepped too, so inspected-, read-, post-combat, and skill-outcome
 * states are all visited. The search FAILS on `cappedOut`, so it can never pass by
 * truncating an unexplored region.
 *
 * Packs are auto-discovered from content/rpg/quests, so a new RPG pack is covered the moment
 * it ships (the health-covers-all-packs bar, bug_0096). The negative controls below prove
 * the check bites on a genuinely dead guard AND that stepping combat is load-bearing.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { compileRpgSource, loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
  type RpgIndex,
} from "../../src/rpg/runner.js";
import { HP_VAR } from "../../src/rpg/schema.js";
import { visibleObjectIds } from "../../src/rpg/model.js";
import { isAuthoredInspectAction } from "../../src/rpg/legal_actions.js";
import { evalConditions } from "../../src/core/conditions.js";
import type { GameState } from "../../src/core/state.js";
import type { Rng } from "../../src/core/rng.js";
import type { RoomVariant, ObjectVariant, EndingVariant } from "../../src/rpg/schema.js";
import type { Action } from "../../src/api/types.js";
import { makeStep } from "../../src/core/engine.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { exhaustiveEndingsMulti } from "./support/exhaustive_endings.js";

const PACK_DIR = "content/rpg/quests";
const packFiles = readdirSync(PACK_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

// Before the crisis-priority family, the route-rich Wolf-Winter graph exhausted at
// 630,199 states under this policy (measured 2026-07-14). The unchanged 800k ceiling
// requires every later family to retain a bounded complete graph and still fails LOUD on
// combinatorial blowup instead of silently truncating it.
const MAX_STATES = 800_000;
const IMPORT_WITNESS_MAX_STATES = 200_000;
const WORLD = loadOverworldManifest(process.cwd());

// The pre-crisis 630,199-state Wolf-Winter graph took 153s in a final-hash
// exhaustive-suite run; later bounded families and shared CI runners can take longer.
// Wall-clock headroom does not change the bounded state proof.
const SOLVER_TEST_TIMEOUT_MS = 720_000;

/**
 * The liveness action policy (identical to the parser proof): step every legal action
 * EXCEPT the ones that provably cannot gate a variant — inert observations and DROP.
 * Authored INSPECT effects ride on LOOK, so their target looks are restored below.
 */
const LIVENESS_SKIP: ReadonlySet<Action["type"]> = new Set([
  "DROP",
  "CLOSE",
  "LOOK",
  "INVENTORY",
  "INSPECT",
]);
const livenessExplore = (index: RpgIndex, action: Action): boolean =>
  isAuthoredInspectAction(index, action) || !LIVENESS_SKIP.has(action.type);

/**
 * A fixed-sequence PRNG (copied from rpg_all_endings_reachable): each draw consumes the
 * next fraction (the last repeats once exhausted). `int(min,max)` maps the fraction the
 * way mulberry32 does, so HIGH→max face, 0→min face. resolveAttack draws player strike
 * then enemy reply; resolveSkillCheck draws once.
 */
const HIGH = 0.999999;
const LOW = 0;
function fixedSeqRng(fracs: number[]): Rng {
  let i = 0;
  const next = (): number => {
    const f = fracs[Math.min(i, fracs.length - 1)] ?? 0;
    i += 1;
    return f;
  };
  return {
    next,
    int(min: number, max: number): number {
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      return lo + Math.floor(next() * (hi - lo + 1));
    },
  };
}
// BEST for the player: own strike max, damage taken min, skill roll max → [HIGH, LOW].
// WORST for the player: own strike min, damage taken max, skill roll min → [LOW, HIGH].
const bestRng = (): Rng => fixedSeqRng([HIGH, LOW]);
const worstRng = (): Rng => fixedSeqRng([LOW, HIGH]);

/** True for the player HP var and any hidden per-enemy HP var (`__enemy_hp_*`). */
function isHpVar(name: string): boolean {
  return name === HP_VAR || name.startsWith("__enemy_hp_");
}

/**
 * Recursively scan a compiled pack for any CONDITION (var_gte/var_lte/var_eq) that gates
 * on an HP var — the load-bearing assumption the best/worst-roll bracket rests on (see the
 * header). Effect writes (set_var/inc_var) are not condition kinds and never match, so this
 * flags exactly variant/route gating on a raw HP value. Mirrors rpg_all_endings_reachable.
 */
function readsHpInCondition(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(readsHpInCondition);
  if (node && typeof node === "object") {
    for (const k of ["var_gte", "var_lte", "var_eq"] as const) {
      const cmp = (node as Record<string, unknown>)[k];
      if (
        cmp &&
        typeof cmp === "object" &&
        typeof (cmp as { name?: unknown }).name === "string" &&
        isHpVar((cmp as { name: string }).name)
      ) {
        return true;
      }
    }
    return Object.values(node as Record<string, unknown>).some(readsHpInCondition);
  }
  return false;
}

/** The index of the first variant whose `when` holds in `state` (first-match-wins,
 *  identical to model.ts roomDescription/objectDescription), or -1 for the base text. */
function firstMatch(
  variants: readonly (RoomVariant | ObjectVariant | EndingVariant)[],
  state: GameState,
): number {
  for (let i = 0; i < variants.length; i++) {
    if (evalConditions(variants[i]!.when, state)) return i;
  }
  return -1;
}

type Liveness = {
  /** "room:<id>#<i>" / "object:<id>#<i>" / "ending:<id>#<i>" keys first-matched in some state. */
  displayed: Set<string>;
  /** Every declared variant key that must therefore be displayed somewhere. */
  declared: { key: string; where: string }[];
  /** Object-level world-presence gates concretely satisfied while the object was in view. */
  present: Set<string>;
  /** Every authored world-presence gate that must expose its object in some reachable state. */
  presenceDeclared: { key: string; where: string }[];
  cappedOut: boolean;
};

/** Credit only text a player can see in this exact, concrete state. */
function creditViewedState(
  index: RpgIndex,
  state: GameState,
  displayed: Set<string>,
  present: Set<string>,
): void {
  const record = (kind: "room" | "object" | "ending", id: string, idx: number): void => {
    if (idx >= 0) displayed.add(`${kind}:${id}#${idx}`);
  };
  if (state.ended) {
    const ending = state.endingId
      ? index.pack.endings.find((candidate) => candidate.id === state.endingId)
      : undefined;
    if (ending?.variants?.length) record("ending", ending.id, firstMatch(ending.variants, state));
    return;
  }
  const room = index.rooms.get(state.current);
  if (room?.variants?.length) record("room", room.id, firstMatch(room.variants, state));
  const visible = visibleObjectIds(index, state, state.current);
  for (const objectId of visible) {
    const object = index.objects.get(objectId);
    if (object?.visible_when !== undefined) present.add(`object:${objectId}@present`);
    if (object?.variants?.length) record("object", objectId, firstMatch(object.variants, state));
  }
  // Inventory is authoritative and intentionally bypasses `visible_when`, so it
  // can credit reactive examine text but never a world-presence gate.
  for (const objectId of state.inventory) {
    const object = index.objects.get(objectId);
    if (object?.variants?.length) record("object", objectId, firstMatch(object.variants, state));
  }
}

type WitnessAction = string | readonly [id: string, rolls: "best" | "worst"];

/** Replay an authored action-id route through the real engine and credit every view. */
function replayConcreteWitness(
  index: RpgIndex,
  initialState: GameState,
  actions: readonly WitnessAction[],
): { displayed: Set<string>; present: Set<string>; final: GameState } {
  const displayed = new Set<string>();
  const present = new Set<string>();
  const bestStep = makeStep(buildRpgRules(index, bestRng));
  const worstStep = makeStep(buildRpgRules(index, worstRng));
  let state = initialState;
  creditViewedState(index, state, displayed, present);
  for (const witnessAction of actions) {
    const [actionId, rolls] =
      typeof witnessAction === "string" ? [witnessAction, "best"] : witnessAction;
    const option = enumerateRpgActions(index, state).find((candidate) => candidate.id === actionId);
    if (!option) {
      throw new Error(
        `Imported variant witness cannot take "${actionId}" in "${state.current}"; legal: ${enumerateRpgActions(
          index,
          state,
        )
          .map((candidate) => candidate.id)
          .join(", ")}`,
      );
    }
    const result = (rolls === "worst" ? worstStep : bestStep)(state, option.action);
    if (!result.ok) {
      throw new Error(
        `Imported variant witness action "${actionId}" rejected: ${result.rejectionReason}`,
      );
    }
    state = result.state;
    creditViewedState(index, state, displayed, present);
  }
  return { displayed, present, final: state };
}

/**
 * Wolf-Winter's June prose depends on campaign states the single-import search cannot
 * represent: the scattered-herd line requires both June's companion import and a failed
 * Relief Protocol import. These short routes are constructive witnesses, not exemptions:
 * every transition is a currently legal engine action on a real best/worst die face.
 */
function wolfJuneCampaignWitnesses(index: RpgIndex): {
  displayed: Set<string>;
  present: Set<string>;
} {
  const displayed = new Set<string>();
  const present = new Set<string>();
  const run = (flags: readonly string[], actions: readonly WitnessAction[]): GameState => {
    const initial = initStateForRpgPack(index, 7);
    for (const flag of flags) initial.flags[flag] = true;
    const witness = replayConcreteWitness(index, initial, actions);
    for (const key of witness.displayed) displayed.add(key);
    for (const key of witness.present) present.add(key);
    return witness.final;
  };
  const startFouled: readonly WitnessAction[] = [
    "go_north",
    "talk_houndsman",
    "ask_lure",
    "ask_commit_lure",
    "ask_leave",
    "go_west",
    "take_winter_feed_sack",
    "go_east",
    "go_north",
    ["use_winter_feed_sack_on_downwind_feed_line", "worst"],
  ];
  const livingRecovery: readonly WitnessAction[] = [
    ["use_paling_rail", "worst"],
    "use_paling_rail",
    "use_split_rail_guard_on_downwind_feed_line",
    "go_south",
  ];
  const reachJune: readonly WitnessAction[] = [
    "go_west",
    "go_up",
    "use_winter_feed_sack_on_loft_hatch",
    "go_east",
    "go_north",
    "talk_june_pike",
    "ask_acknowledge",
    "use_winter_feed_sack_on_outer_scent_gate",
    "go_north",
  ];

  run(["june_pike_present", "approach_exposed_ridge"], ["use_exposed_ridge_last_mile"]);
  run(["june_pike_present", "approach_sheltered_stockway"], ["use_sheltered_stockway_last_mile"]);

  const clean = run(["june_pike_present"], [...startFouled, ...livingRecovery, ...reachJune]);
  if (clean.endingId !== "ending_pack_diverted") {
    throw new Error(`June clean witness reached unexpected ending "${clean.endingId ?? "none"}".`);
  }

  const scattered = run(
    ["june_pike_present", "relief_protocol_prepared"],
    [...startFouled, ...livingRecovery, ["use_relief_protocol_docket", "worst"], ...reachJune],
  );
  if (scattered.endingId !== "ending_pack_diverted_cattle_scattered") {
    throw new Error(
      `June scattered witness reached unexpected ending "${scattered.endingId ?? "none"}".`,
    );
  }

  const afterBlood = run(
    ["june_pike_present"],
    [
      ...startFouled,
      ["attack_yearling_wolf", "best"],
      ["attack_yearling_wolf", "best"],
      "go_south",
      "go_west",
      "go_up",
      "use_winter_feed_sack_on_loft_hatch",
      "go_east",
      "go_north",
      "use_winter_feed_sack_on_outer_scent_gate",
      "go_north",
    ],
  );
  if (afterBlood.endingId !== "ending_pack_diverted_after_blood") {
    throw new Error(
      `June after-blood witness reached unexpected ending "${afterBlood.endingId ?? "none"}".`,
    );
  }

  const reachDriveCrisis: readonly WitnessAction[] = [
    "go_north",
    "talk_houndsman",
    "ask_drive",
    "ask_commit_drive",
    "ask_leave",
    "take_drive_signal_rope_kit",
    "go_north",
    ["use_drive_signal_rope_kit_on_drive_breach_signal", "best"],
    "go_north",
    "use_drive_signal_rope_kit_on_drive_threshold_line",
    "go_north",
    "talk_june_pike_drive",
    "ask_acknowledge",
  ];
  const driveCattle = run(
    ["june_pike_present"],
    [...reachDriveCrisis, "use_cattle_crisis_priority", "use_cattle_first_evacuation"],
  );
  if (driveCattle.endingId !== "ending_drive_cattle_wounded") {
    throw new Error(
      `June cattle-drive witness reached unexpected ending "${driveCattle.endingId ?? "none"}".`,
    );
  }
  const drivePerson = run(
    ["june_pike_present"],
    [...reachDriveCrisis, "use_person_crisis_priority", "use_person_first_evacuation"],
  );
  if (drivePerson.endingId !== "ending_drive_person_cattle_lost") {
    throw new Error(
      `June person-drive witness reached unexpected ending "${drivePerson.endingId ?? "none"}".`,
    );
  }
  const driveReserve = run(
    ["june_pike_present"],
    [...reachDriveCrisis, "use_reserve_crisis_priority", "use_reserve_spent_evacuation"],
  );
  if (driveReserve.endingId !== "ending_drive_reserve_spent") {
    throw new Error(
      `June reserve-drive witness reached unexpected ending "${driveReserve.endingId ?? "none"}".`,
    );
  }

  const fortifyCade = run(
    ["june_pike_present"],
    [
      "go_north",
      "talk_houndsman",
      "ask_fortify",
      "ask_accept_terms",
      "ask_leave",
      "take_cade_household_shutters",
      "go_north",
      ["use_cade_household_shutters_on_fortify_outer_seal", "best"],
      "go_north",
      "use_cade_household_shutters_on_fortify_threshold_seal",
      "go_north",
      "talk_june_pike_fortify",
      "ask_acknowledge",
      "use_fortify_dawn_watch",
    ],
  );
  if (fortifyCade.endingId !== "ending_fortified_cade_terms") {
    throw new Error(
      `June Cade-fortify witness reached unexpected ending "${fortifyCade.endingId ?? "none"}".`,
    );
  }
  const fortifyAuthority = run(
    ["june_pike_present"],
    [
      "go_north",
      "talk_houndsman",
      "ask_fortify",
      "ask_invoke_authority",
      "ask_leave",
      "take_albany_relief_seals",
      "go_north",
      ["use_albany_relief_seals_on_fortify_outer_seal", "best"],
      "go_north",
      "use_albany_relief_seals_on_fortify_threshold_seal",
      "go_north",
      "talk_june_pike_fortify",
      "ask_acknowledge",
      "use_fortify_dawn_watch",
    ],
  );
  if (fortifyAuthority.endingId !== "ending_fortified_albany_authority") {
    throw new Error(
      `June authority-fortify witness reached unexpected ending "${fortifyAuthority.endingId ?? "none"}".`,
    );
  }

  const required = [
    "room:steading_yard#1",
    "room:steading_yard#3",
    "room:steading_yard#5",
    "room:byre_mouth#5",
    "ending:ending_pack_diverted#0",
    "ending:ending_pack_diverted_cattle_scattered#0",
    "ending:ending_pack_diverted_after_blood#0",
    "ending:ending_drive_cattle_wounded#0",
    "ending:ending_drive_person_cattle_lost#0",
    "ending:ending_drive_reserve_spent#0",
    "ending:ending_fortified_cade_terms#0",
    "ending:ending_fortified_albany_authority#0",
  ];
  const missing = required.filter((key) => !displayed.has(key));
  if (missing.length > 0) {
    throw new Error(`Concrete June campaign routes did not display: ${missing.join(", ")}`);
  }
  return { displayed, present };
}

/**
 * Wolf-Winter's campaign imports have compact constructive routes. Replaying those
 * routes is both stronger evidence and dramatically cheaper than crawling another
 * 200k-state graph for every persistent import flag: each credited view is reached
 * through the real legality/resolution path on a real best/worst die face.
 *
 * `works_fortification_prepared` has no direct display predicate, but its failed repair
 * sets the derived `works_fortification_splice_needed` flag; the Works route therefore
 * witnesses that unique object variant while the fully exhausted unimported graph covers
 * the shared successful `breach_braced` views. If either surface changes, the final
 * declaration census below still fails until a concrete view is witnessed here.
 */
const WOLF_CONCRETE_IMPORT_FLAGS = new Set([
  "jamie_market_testimony_certified",
  "hayden_frost_report_certified",
  "works_fortification_prepared",
  "drover_route_prepared",
  "relief_protocol_prepared",
  "relief_cade_fodder_allocated",
  "relief_resident_shelter_allocated",
  "relief_mobile_reserve_allocated",
  "june_pike_present",
  "approach_exposed_ridge",
  "approach_sheltered_stockway",
]);

function wolfCampaignImportWitnesses(index: RpgIndex): {
  displayed: Set<string>;
  present: Set<string>;
} {
  const displayed = new Set<string>();
  const present = new Set<string>();
  const run = (flags: string | readonly string[], actions: readonly WitnessAction[]): void => {
    const initial = initStateForRpgPack(index, 7);
    for (const flag of typeof flags === "string" ? [flags] : flags) {
      initial.flags[flag] = true;
    }
    const witness = replayConcreteWitness(index, initial, actions);
    for (const key of witness.displayed) displayed.add(key);
    for (const key of witness.present) present.add(key);
  };

  run("jamie_market_testimony_certified", [
    "go_north",
    "go_north",
    ["maneuver_yearling_wolf_set_spear", "best"],
    "go_south",
    "go_west",
    "go_up",
    "go_east",
    ["maneuver_flank_wolf_drop_from_loft", "best"],
    ["attack_flank_wolf", "best"],
  ]);
  const reachHaydenBrace: readonly WitnessAction[] = [
    "go_north",
    "go_north",
    ["use_paling_rail", "worst"],
    ["maneuver_yearling_wolf_set_spear", "worst"],
    ["maneuver_yearling_wolf_drive_set_spear", "best"],
    "go_north",
  ];
  run("hayden_frost_report_certified", [
    ...reachHaydenBrace,
    ["maneuver_flank_wolf_frost_brace_trip", "worst"],
    ["maneuver_flank_wolf_fallen_brace_drive", "worst"],
    ["attack_flank_wolf", "best"],
  ]);
  run("hayden_frost_report_certified", [
    "go_north",
    "go_north",
    ["use_paling_rail", "worst"],
    ["maneuver_yearling_wolf_set_spear", "best"],
    "go_north",
    ["maneuver_flank_wolf_frost_brace_trip", "best"],
  ]);
  run("works_fortification_prepared", ["go_north", "go_north", ["use_paling_rail", "worst"]]);

  const startFouled: readonly WitnessAction[] = [
    "go_north",
    "talk_houndsman",
    "ask_lure",
    "ask_commit_lure",
    "ask_leave",
    "go_west",
    "take_winter_feed_sack",
    "go_east",
    "go_north",
    ["use_winter_feed_sack_on_downwind_feed_line", "worst"],
  ];
  run("drover_route_prepared", startFouled);
  run("relief_protocol_prepared", [
    ...startFouled,
    ["use_paling_rail", "worst"],
    "use_paling_rail",
    "use_split_rail_guard_on_downwind_feed_line",
    "go_south",
  ]);
  run(
    ["relief_cade_fodder_allocated", "approach_exposed_ridge"],
    [
      "use_exposed_ridge_last_mile",
      "talk_houndsman",
      "ask_lure",
      "ask_commit_lure",
      "ask_leave",
      "go_west",
      "take_winter_feed_sack",
      "go_east",
      "go_north",
      ["use_winter_feed_sack_on_downwind_feed_line", "best"],
    ],
  );
  // Resident shelter intentionally has no field action; observing its imported
  // state proves it does not make a Wolf-only object or route mandatory.
  run("relief_resident_shelter_allocated", []);
  run("relief_mobile_reserve_allocated", [
    "go_north",
    "talk_houndsman",
    "ask_fortify",
    "ask_accept_terms",
    "ask_leave",
    "take_cade_household_shutters",
    "go_north",
    ["use_cade_household_shutters_on_fortify_outer_seal", "worst"],
    "use_cade_failed_seal_help",
    "use_mobile_relief_failure_crew",
    "go_north",
    "use_cade_household_shutters_on_fortify_threshold_seal",
    "go_north",
    "use_fortify_dawn_watch",
  ]);
  run("approach_exposed_ridge", ["use_exposed_ridge_last_mile"]);
  run("approach_sheltered_stockway", ["use_sheltered_stockway_last_mile"]);

  const june = wolfJuneCampaignWitnesses(index);
  for (const key of june.displayed) displayed.add(key);
  for (const key of june.present) present.add(key);

  const required = [
    "room:store#3",
    "room:fodder_loft#1",
    "room:byre_door#8",
    "room:byre_door#23",
    "room:paling_gap#7",
    "object:drover_route_marks@present",
    "room:paling_gap#15",
    "room:paling_gap#21",
    "room:paling_gap#26",
    "room:byre_door#25",
    "object:paling_rail#4",
    "room:byre_door#21",
    "room:byre_door#7",
    "room:byre_door#6",
    "object:paling_rail#2",
    "room:byre_yard#1",
    "object:relief_protocol_docket@present",
    "room:steading_yard#2",
    "object:exposed_ridge_last_mile@present",
    "room:steading_yard#4",
    "object:sheltered_stockway_last_mile@present",
  ];
  const missing = required.filter((key) => !displayed.has(key) && !present.has(key));
  if (missing.length > 0) {
    throw new Error(`Concrete Wolf-Winter import routes did not display: ${missing.join(", ")}`);
  }
  return { displayed, present };
}

/** Run the best/worst-roll bracket under the liveness policy and mine displayed variants. */
function analyze(
  index: RpgIndex,
  explore: (a: Action) => boolean = (action) => livenessExplore(index, action),
  initialState: GameState = initStateForRpgPack(index, 7),
  maxStates = MAX_STATES,
): Liveness {
  const displayed = new Set<string>();
  const present = new Set<string>();
  const ruleSets = [buildRpgRules(index, bestRng), buildRpgRules(index, worstRng)];
  const result = exhaustiveEndingsMulti(
    ruleSets,
    initialState,
    maxStates,
    (s) => {
      creditViewedState(index, s, displayed, present);
    },
    { explore },
  );

  const declared: { key: string; where: string }[] = [];
  const presenceDeclared: { key: string; where: string }[] = [];
  for (const room of index.pack.rooms) {
    (room.variants ?? []).forEach((_, i) =>
      declared.push({ key: `room:${room.id}#${i}`, where: `room "${room.id}" variant #${i}` }),
    );
  }
  for (const obj of index.pack.objects) {
    if (obj.visible_when !== undefined) {
      presenceDeclared.push({
        key: `object:${obj.id}@present`,
        where: `object "${obj.id}" world-presence gate`,
      });
    }
    (obj.variants ?? []).forEach((_, i) =>
      declared.push({ key: `object:${obj.id}#${i}`, where: `object "${obj.id}" variant #${i}` }),
    );
  }
  for (const e of index.pack.endings) {
    (e.variants ?? []).forEach((_, i) =>
      declared.push({ key: `ending:${e.id}#${i}`, where: `ending "${e.id}" variant #${i}` }),
    );
  }

  return { displayed, declared, present, presenceDeclared, cappedOut: result.cappedOut };
}

describe("bug_0147 — every reactive variant of every RPG pack is reachable as displayed text", () => {
  it("discovers the shipped RPG packs", () => {
    // Guard against a vacuous pass if the glob ever yields nothing.
    expect(packFiles.length).toBeGreaterThanOrEqual(2);
  });

  it("CREDITS Wolf-Winter variants that require combined companion and preparation imports", () => {
    const loaded = loadRpgSourceFile(join(PACK_DIR, "wolf_winter.yaml"));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const witness = wolfCampaignImportWitnesses(indexRpgPack(loaded.compiled.pack));
    expect(
      [...witness.displayed].filter(
        (key) =>
          key.includes("pack_diverted") ||
          key.includes("ending_drive") ||
          key.includes("ending_fortified"),
      ),
    ).toEqual(
      expect.arrayContaining([
        "ending:ending_pack_diverted#0",
        "ending:ending_pack_diverted_cattle_scattered#0",
        "ending:ending_pack_diverted_after_blood#0",
        "ending:ending_drive_cattle_wounded#0",
        "ending:ending_drive_person_cattle_lost#0",
        "ending:ending_drive_reserve_spent#0",
        "ending:ending_fortified_cade_terms#0",
        "ending:ending_fortified_albany_authority#0",
      ]),
    );
  });

  for (const file of packFiles) {
    it(
      `${file}: every declared variant is the first match in some viewing state`,
      () => {
        const loaded = loadRpgSourceFile(join(PACK_DIR, file));
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) return;
        const pack = loaded.compiled.pack;

        // The caveat guard: the best/worst-roll bracket credits variant display soundly only
        // when no variant (no condition at all) gates on a raw HP value the extremes skip.
        expect(
          readsHpInCondition(pack),
          `pack gates a condition on an HP var — the best/worst-roll bracket assumes no ` +
            `HP-gated variant guard; branch the HP in the solver before trusting liveness here`,
        ).toBe(false);

        const { displayed, declared, present, presenceDeclared, cappedOut } = analyze(
          indexRpgPack(pack),
        );
        // The search must have exhausted the reachable region, else "not displayed" is
        // unproven (it could lie in the truncated tail).
        expect(cappedOut).toBe(false);
        // The shipped RPG packs are reactive by design — guard against a vacuous pass.
        expect(declared.length).toBeGreaterThan(0);
        const questId = file.replace(/\.yaml$/, "");
        const quest = WORLD.quests.find((candidate) => candidate.id === questId);
        const importedFlags = new Set(
          (quest?.campaign_imports?.rules ?? []).flatMap((rule) =>
            "target_flag" in rule ? [rule.target_flag] : [],
          ),
        );
        for (const importedFlag of importedFlags) {
          // Wolf-Winter's imported displays have exact legal-action witnesses below;
          // retain bounded fallback crawls for any future or other pack import.
          if (questId === "wolf_winter" && WOLF_CONCRETE_IMPORT_FLAGS.has(importedFlag)) continue;
          const importedState = initStateForRpgPack(indexRpgPack(pack), 7);
          importedState.flags[importedFlag] = true;
          const witness = analyze(
            indexRpgPack(pack),
            undefined,
            importedState,
            IMPORT_WITNESS_MAX_STATES,
          );
          for (const key of witness.displayed) displayed.add(key);
          for (const key of witness.present) present.add(key);
        }
        if (questId === "wolf_winter") {
          expect(importedFlags).toEqual(WOLF_CONCRETE_IMPORT_FLAGS);
          const witness = wolfCampaignImportWitnesses(indexRpgPack(pack));
          for (const key of witness.displayed) displayed.add(key);
          for (const key of witness.present) present.add(key);
        }
        const dead = declared.filter((d) => !displayed.has(d.key)).map((d) => d.where);
        expect(dead).toEqual([]);
        const neverPresent = presenceDeclared
          .filter((declaration) => !present.has(declaration.key))
          .map((declaration) => declaration.where);
        expect(neverPresent).toEqual([]);
      },
      SOLVER_TEST_TIMEOUT_MS,
    );
  }

  it("FAILS on a planted dead variant (guards against the check silently passing)", () => {
    // A room variant guarded on a flag the pack never sets is dead prose. The check must
    // catch it — the negative control for the whole proof.
    const src = `
meta: { id: t, title: T, start_room: a, vars_init: { hp: 10, attack: 3, defense: 1 } }
rooms:
  - id: a
    name: A
    description: "base"
    variants:
      - when: [{ has_flag: never_set }, { has_flag: also_never }]
        text: "dead — no path sets these"
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;
    const r = compileRpgSource(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { displayed } = analyze(indexRpgPack(r.compiled.pack));
    expect(displayed.has("room:a#0")).toBe(false);
  });

  it("FAILS on a planted world-presence gate no reachable state satisfies", () => {
    const src = `
meta: { id: t, title: T, start_room: a, vars_init: { hp: 10, attack: 3, defense: 1 } }
rooms:
  - id: a
    name: A
    description: "a bare room"
    objects: [sealed_panel]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
objects:
  - id: sealed_panel
    name: sealed panel
    aliases: [panel]
    description: "This must never enter the world view."
    visible_when: [{ has_flag: never_set }]
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;
    const result = compileRpgSource(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const liveness = analyze(indexRpgPack(result.compiled.pack));
    expect(liveness.presenceDeclared.map((declaration) => declaration.key)).toEqual([
      "object:sealed_panel@present",
    ]);
    expect(liveness.present.has("object:sealed_panel@present")).toBe(false);
  });

  it("CREDITS a variant reachable only by WINNING a fight (the best-roll regime is load-bearing)", () => {
    // The RPG soundness crux: a variant gated on an enemy's `defeat_flag` is LIVE, and the
    // bracket proves it only because the BEST-roll regime drives the fight to the enemy's
    // death. The enemy is tuned so the player WINS under best rolls but DIES under worst —
    // so the post-defeat display state is reachable ONLY via the best regime. A negative
    // twin (worst regime alone) must FAIL to credit it, demonstrating the best-roll regime
    // is load-bearing — the combat analogue of the parser READ-load-bearing control.
    //   best  (strike d6=6, reply d6=1): R1 player 6+2=8 → ogre 12→4, ogre 1+8=9 → hero 10→1;
    //                                     R2 player 8 → ogre 4→0 dies, defeat_flag set, hero lives at 1.
    //   worst (strike d6=1, reply d6=6): R1 player 1+2=3 → ogre 12→9, ogre 6+8=14 → hero dies (death_ending).
    const src = `
meta: { id: t, title: T, start_room: a, vars_init: { hp: 10, attack: 2, defense: 0 } }
rooms:
  - id: a
    name: A
    description: "an ogre blocks the way"
    variants:
      - when: [{ has_flag: ogre_slain }]
        text: "the ogre lies dead; the way is clear"
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
enemies:
  - id: ogre
    name: ogre
    description: "a hulking ogre"
    room: a
    hp: 12
    attack: 8
    defense: 0
    defeat_flag: ogre_slain
    death_ending: dead
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings:
  - { id: e, title: E, text: "you live" }
  - { id: dead, title: D, text: "the ogre kills you" }
`;
    const r = compileRpgSource(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const index = indexRpgPack(r.compiled.pack);

    // With the full best/worst bracket the post-defeat variant is credited (best regime wins).
    expect(analyze(index).displayed.has("room:a#0")).toBe(true);

    // Control: drive the SAME pack under the WORST regime alone — the player dies before the
    // ogre falls, the defeat flag is never set, and the variant is (correctly) never displayed.
    const displayedWorst = new Set<string>();
    exhaustiveEndingsMulti(
      [buildRpgRules(index, worstRng)],
      initStateForRpgPack(index, 7),
      MAX_STATES,
      (s) => {
        if (s.ended) return;
        const room = index.rooms.get(s.current);
        if (room?.variants?.length) {
          const idx = firstMatch(room.variants, s);
          if (idx >= 0) displayedWorst.add(`room:${room.id}#${idx}`);
        }
      },
      { explore: (action) => livenessExplore(index, action) },
    );
    expect(displayedWorst.has("room:a#0")).toBe(false);
  });
});
