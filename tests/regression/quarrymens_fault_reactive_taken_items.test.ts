/**
 * Regression for stale room-item prose in quarrymens_fault: the yard kept
 * placing the survey chain on its starting block after it was taken.
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
import { resolveParserAction } from "../../src/parser/legal_actions.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgPackFile("content/rpg/pack/quarrymens_fault.yaml");
if (!loaded.ok) throw new Error("quarrymens_fault must compile");
const index = indexRpgPack(loaded.compiled.pack);
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

const desc = (s: GameState): string => buildRpgObservation(index, s).description;

function lookNarration(s: GameState): string {
  const res = resolveParserAction(index, s, { type: "LOOK" });
  const effect = res?.effects[0];
  if (!effect || !("narrate" in effect)) throw new Error("LOOK produced no narration");
  return effect.narrate;
}

describe("quarrymens_fault quarry yard reacts to the taken survey chain", () => {
  it("removes the stone-block chain prose after the survey chain is taken", () => {
    const s = play(initStateForRpgPack(index, 73), ["take_survey_chain"]);

    expect(s.inventory).toContain("survey_chain");
    expect(s.flags["survey_chain_taken"]).toBe(true);
    expect(desc(s)).toContain("stone block is bare where the survey chain was coiled");
    expect(desc(s)).toContain("before he sees your one clean run");
    expect(desc(s)).not.toContain("survey chain lies coiled on a stone block");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the stone block bare after the survey chain is dropped", () => {
    const s = play(initStateForRpgPack(index, 73), ["take_survey_chain", "drop_survey_chain"]);

    expect(s.inventory).not.toContain("survey_chain");
    expect(s.flags["survey_chain_taken"]).toBe(true);
    expect(desc(s)).toContain("stone block is bare where the survey chain was coiled");
    expect(desc(s)).toContain("before he sees your one clean run");
    expect(desc(s)).not.toContain("survey chain lies coiled on a stone block");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("surfaces a prepared-measure yard cue after both evidence sources are read", () => {
    const s = play(initStateForRpgPack(index, 73), [
      "take_survey_chain",
      "go_west",
      "read_seam_map",
      "go_east",
      "go_east",
      "read_drill_marks",
      "go_west",
    ]);

    expect(desc(s)).toContain("One clean measure now can turn all three into proof");
    expect(desc(s)).not.toContain("before he sees your one clean run");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("retires Cale as an enemy once the clean fault proof is measured", () => {
    const s = play(initStateForRpgPack(index, 7), [
      "read_blast_order",
      "take_survey_chain",
      "go_west",
      "read_seam_map",
      "go_east",
      "go_east",
      "read_drill_marks",
      "go_west",
      "use_survey_chain_on_fault_face",
      "go_north",
    ]);
    const obs = buildRpgObservation(index, s);

    expect(s.current).toBe("foremans_ramp");
    expect(s.flags["fault_measured"]).toBe(true);
    expect(obs.description).toContain("He lowers the handle");
    expect(obs.enemies_present).toEqual([]);
    expect(obs.available_actions.map((a) => a.id)).not.toContain("attack_cale");
    expect(obs.available_actions.map((a) => a.id)).toContain("go_north");

    const escaped = play(s, ["go_north"]);
    expect(escaped.ended).toBe(true);
    expect(escaped.endingId).toBe("ending_blast_stopped");
    expect(escaped.vars.score).toBe(50);
  });
});
