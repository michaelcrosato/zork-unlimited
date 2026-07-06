/**
 * Regression (§15) for bug_0401 — Factor's Mark correctly opened the gate in prose
 * after the social confrontation, but Breckel remained present as an attackable enemy.
 *
 * A blind playtest (2026-06-21, seed 7) won the social route cleanly, then noticed
 * the post-resolution Gate Arch still listed Breckel in `enemies_present` and kept
 * `attack_breckel` legal. Once Harwick has been shamed and has called him off,
 * Breckel must retire mechanically as well as narratively.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep } from "../../src/core/engine.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/pack/factors_mark.yaml");
if (!loaded.ok) throw new Error("factors_mark must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const step = makeStep(buildRpgRules(index));

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateRpgActions(index, s).find((o) => o.id === id);
    if (!opt)
      throw new Error(
        `"${id}" not legal in ${s.current}: [${enumerateRpgActions(index, s)
          .map((o) => o.id)
          .join(", ")}]`,
      );
    const r = step(s, opt.action);
    expect(r.ok).toBe(true);
    s = r.state;
  }
  return s;
}

const actionIds = (s: GameState): string[] => enumerateRpgActions(index, s).map((o) => o.id);

describe("bug_0401 — factors_mark retires Breckel after Harwick folds", () => {
  it("keeps the combat fallback before the confrontation, but removes it after the social win", () => {
    let s = initStateForRpgPack(index, 7);

    s = play(s, ["go_north"]);
    expect(s.current).toBe("gate_arch");
    expect(buildRpgObservation(index, s).enemies_present.map((e) => e.id)).toContain("breckel");
    expect(actionIds(s)).toContain("attack_breckel");
    s = play(s, ["go_south"]);

    s = play(s, [
      "read_seal_notice",
      "go_west",
      "talk_silas",
      "ask_ask_testimony",
      "ask_testimony_back",
      "ask_leave_silas",
      "go_east",
      "go_east",
      "take_factor_ledger",
      "read_factor_ledger",
      "go_west",
      "use_factor_ledger_on_seal_notice",
      "go_north",
    ]);

    expect(s.flags.factor_shamed).toBe(true);
    expect(s.flags.breckel_defeated).toBeUndefined();
    const obs = buildRpgObservation(index, s);
    expect(obs.description).toContain("Breckel has stepped back");
    expect(obs.enemies_present).toEqual([]);
    expect(obs.available_actions.map((a) => a.id)).not.toContain("attack_breckel");
    expect(obs.available_actions.map((a) => a.id)).toContain("go_north");

    const forcedAttack = step(s, { type: "ATTACK", enemy: "breckel" });
    expect(forcedAttack.ok).toBe(false);
    expect(forcedAttack.rejectionReason).toBe("That action is not available right now.");

    s = play(s, ["go_north"]);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_cleared");
    expect(buildRpgObservation(index, s).score).toBe(pack.meta.max_score);
    expect(validateRpg(pack).findings).toHaveLength(0);
  });
});
