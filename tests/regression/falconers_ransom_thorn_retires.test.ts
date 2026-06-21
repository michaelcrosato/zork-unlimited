/**
 * Regression (§15) for bug_0402 — Falconer's Ransom correctly opened the road in
 * prose after Aldric folded, but Thorn remained present as an attackable enemy.
 *
 * A blind playtest (2026-06-21, seed 7) completed the social route and saw the
 * stable-yard prose say Thorn had stepped back from the passage. The structured
 * observation still listed Thorn in `enemies_present` and kept `attack_thorn`
 * legal. Once Aldric is shamed, Thorn must retire mechanically as well.
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
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

const loaded = loadRpgPackFile("content/rpg/pack/falconers_ransom.yaml");
if (!loaded.ok) throw new Error("falconers_ransom must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const step = makeStep(buildRpgRules(index));

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateRpgActions(index, s).find((o) => o.id === id);
    if (!opt) {
      throw new Error(
        `"${id}" not legal in ${s.current}: [${enumerateRpgActions(index, s)
          .map((o) => o.id)
          .join(", ")}]`,
      );
    }
    const result = step(s, opt.action);
    expect(result.ok).toBe(true);
    s = result.state;
  }
  return s;
}

const actionIds = (s: GameState): string[] => enumerateRpgActions(index, s).map((o) => o.id);

describe("bug_0402 — falconers_ransom retires Thorn after Aldric folds", () => {
  it("keeps the combat fallback before the confrontation, but removes it after the social win", () => {
    let s = initStateForRpgPack(index, 7);

    s = play(s, ["go_north"]);
    expect(s.current).toBe("stable_yard");
    expect(buildRpgObservation(index, s).enemies_present.map((e) => e.id)).toContain("thorn");
    expect(actionIds(s)).toContain("attack_thorn");
    s = play(s, ["go_south"]);

    s = play(s, [
      "read_falcon_jesses",
      "go_west",
      "take_gate_log",
      "read_gate_log",
      "go_east",
      "go_east",
      "take_hidden_bill",
      "read_hidden_bill",
      "go_west",
      "use_hidden_bill_on_falcon_jesses",
      "go_north",
    ]);

    expect(s.flags.aldric_shamed).toBe(true);
    expect(s.flags.thorn_defeated).toBeUndefined();
    const obs = buildRpgObservation(index, s);
    expect(obs.description).toContain("Thorn has stepped back from the passage");
    expect(obs.enemies_present).toEqual([]);
    expect(obs.available_actions.map((a) => a.id)).not.toContain("attack_thorn");
    expect(obs.available_actions.map((a) => a.id)).toContain("go_north");

    const forcedAttack = step(s, { type: "ATTACK", enemy: "thorn" });
    expect(forcedAttack.ok).toBe(false);
    expect(forcedAttack.rejectionReason).toBe("That action is not available right now.");

    s = play(s, ["go_north"]);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_cleared");
    expect(buildRpgObservation(index, s).score).toBe(pack.meta.max_score);
    expect(validateRpg(pack).findings).toHaveLength(0);
  });
});
