/**
 * Regression (§15) for bug_0140 — the author → validate → revise loop targets RPG
 * packs through `validateRpg`, the project's richest validator: every room/object/exit
 * invariant PLUS the Stage-4 layer (player stat vars, enemies in real rooms naming
 * declared DEATH endings, combat winnability, skill-check passability).
 *
 * `runRpgAdapter` uses the deterministic mock author + revise machinery. The RPG mock's
 * first attempt ships an RPG-specific defect — a wight whose `death_ending` names no
 * declared ending — which only the Stage-4 layer of `validateRpg` catches
 * (ENEMY_DEATH_ENDING_UNDECLARED). Once the validator's errors are fed back, it returns
 * the corrected, green pack.
 *
 * This pins: (a) the first attempt is genuinely rejected by the RPG validator with an
 * RPG-specific code, so the loop is decided by the richest validator, not the model (§16);
 * (b) the loop converges to a GREEN RPG
 * pack in a corrective round; (c) the produced pack independently re-validates green
 * AND is a genuine RPG shape (enemies + player stats + a skill check); (d) it is actually
 * playable to its win through the RPG engine — combat AND the skill check both required;
 * (e) the emitted pack does not fall back to a legacy CYOA shape.
 */
import { describe, it, expect } from "vitest";
import { MockAuthorProvider } from "../../agents/authoring/mock_author.js";
import { loadEngineContract, runWriter } from "../../agents/authoring/writer.js";
import { runRpgAdapter } from "../../agents/authoring/adapter.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { HP_VAR, ATTACK_VAR, DEFENSE_VAR } from "../../src/rpg/schema.js";
import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";

const provider = new MockAuthorProvider();
const contract = loadEngineContract();
const PREMISE = "A keeper must relight a dead lighthouse before a ship wrecks.";

// A fixed best-for-the-player PRNG so the seeded combat + skill check resolve
// deterministically: each ATTACK draws the player's strike first (max, d6=6) then the
// enemy's reply (min, d6=1); a skill check draws once (max, d20=20). Same shape as the
// exhaustive RPG reachability suite's bestRng.
const HIGH = 0.999999;
const LOW = 0;
function bestRng(): Rng {
  const fracs = [HIGH, LOW];
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

describe("rpg authoring loop (bug_0140, §12.2–3, §13 Stage 4)", () => {
  it("the RICHEST validator REJECTS the first attempt with an RPG-specific defect (ENEMY_DEATH_ENDING_UNDECLARED)", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    // Cap at one round: no corrective round runs, so we see the raw first attempt.
    const first = await runRpgAdapter(provider, { story, contract, maxRounds: 1 });
    expect(first.ok).toBe(false);
    expect(first.rounds).toBe(1);
    const codes = first.report.findings.filter((f) => f.severity === "error").map((f) => f.code);
    expect(codes).toContain("ENEMY_DEATH_ENDING_UNDECLARED");
  });

  it("loops against the RPG validator and converges to a GREEN pack", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    const result = await runRpgAdapter(provider, { story, contract });
    expect(result.ok).toBe(true);
    expect(result.report.ok).toBe(true);
    // The mock's first attempt is broken, so convergence takes a correcting round.
    expect(result.rounds).toBeGreaterThanOrEqual(2);
    // The produced pack independently re-validates green through the RPG validator.
    expect(validateRpg(result.pack).ok).toBe(true);
    // It is a genuine RPG pack: enemies + player stats + a skill check.
    expect(result.pack.enemies.length).toBeGreaterThanOrEqual(1);
    for (const stat of [HP_VAR, ATTACK_VAR, DEFENSE_VAR])
      expect(result.pack.meta.vars_init[stat]).toBeGreaterThan(0);
    const hasSkillCheck = result.pack.objects.some((o) =>
      o.interactions.some((it) => it.skill_check),
    );
    expect(hasSkillCheck).toBe(true);
  });

  it("classifies every beat against the §11 adaptation labels", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    const result = await runRpgAdapter(provider, { story, contract });
    const beatIds = story.beats.map((b) => b.id).sort();
    expect(result.classifications.map((c) => c.beat_id).sort()).toEqual(beatIds);
  });

  it("the authored RPG pack is actually playable to its win — combat AND skill check both required", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    const { pack } = await runRpgAdapter(provider, { story, contract });
    const index = indexRpgPack(pack);
    // Force best-for-the-player rolls so the seeded combat/skill check are deterministic.
    const step = makeStep(buildRpgRules(index, bestRng));
    let state = initStateForRpgPack(index, 7);

    const drive = (id: string): void => {
      const opt = enumerateRpgActions(index, state).find((o) => o.id === id);
      expect(opt, `action ${id} should be legal in ${state.current}`).toBeTruthy();
      const r = step(state, opt!.action);
      expect(r.ok).toBe(true);
      state = r.state;
    };

    // Grab the lever, climb to the wight, and fell it (best rolls → 2 rounds).
    drive("take_iron_spike");
    drive("go_north");
    drive("attack_storm_wight");
    drive("attack_storm_wight");
    // The stair only opened because the wight fell (defeat_flag wight_banished).
    expect(state.flags["wight_banished"]).toBe(true);
    expect(state.ended).toBe(false);
    drive("go_up"); // into the lamp room — visited, but the lamp is still salt-locked.
    expect(state.current).toBe("lamp_room");
    expect(state.ended).toBe(false); // win needs lamp_freed too, not yet earned.
    drive("use_iron_spike_on_lamp"); // the might skill check frees the lamp → win fires.
    expect(state.flags["lamp_freed"]).toBe(true);
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_saved");
  });

  it("emits the single RPG authoring shape, not a legacy parser or CYOA pack", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    const result = await runRpgAdapter(provider, { story, contract });
    expect("rooms" in result.pack).toBe(true);
    expect("enemies" in result.pack).toBe(true);
    expect("scenes" in result.pack).toBe(false);
    expect(result.pack.win_conditions.length).toBeGreaterThanOrEqual(1);
  });
});
