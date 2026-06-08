/**
 * Regression (§15) for bug_0274 — engine/legibility: a skill-checked PARSER (and RPG)
 * USE now SURFACES the stat it rolls and the difficulty in the agent-/UI-facing
 * observation. The parser/RPG sibling of the CYOA bug_0269.
 *
 * THE FLAW. A fresh blind playtester of The Sealed Crypt
 * (ai-runs/2026-06-05T06-17-21-081Z/playtest.md §4/§5, seed 13, clarity 5/5,
 * enjoyment 4/5, mechanically flawless) flagged the `nerve` stat shown in the
 * observation's `state.vars` every turn as one of two cosmetic loose ends: it
 * "reads like a stat with no mechanical role — a curious player will wonder what it's
 * for and get no answer", and the `grip iron key` action that rolls it "reads oddly …
 * a flavor/no-op self-use". In fact `nerve` IS the var rolled by the crypt's optional
 * `grip iron key` self-USE (a convergent d20 + nerve vs 12 tension beat), but the
 * parser observation exposed only `{ id, command, action }` — identical to a plain
 * command — so NOTHING on screen told a player a stat was in play. Parser/RPG skill
 * checks are a first-class mechanic; a declared skill var that never visibly does
 * anything is a real legibility gap.
 *
 * THE FIX. `enumerateActions` now attaches `skill_check: { skill, difficulty, die }` to a
 * skill-checked USE option, and both `buildParserObservation` and (via the shared
 * enumeration) `buildRpgObservation` surface it on the action. It carries ONLY the
 * rolled var, the difficulty, and the die type — never the check's `on_success`/
 * `on_failure` effects, which carry score/flag/end_game routing — so the destination
 * graph stays hidden by construction, exactly as a plain command never exposes its
 * effects. `die: "d20"` was added (bug_0311) so the annotation reads as "d20 + stat vs
 * difficulty" rather than a flat comparison that makes low-stat checks look impossible.
 * The field is OMITTED on every non-skill action, so the observation is byte-identical
 * to the legacy shape for every existing pack's plain commands.
 *
 * Locked here:
 *   (1) in the crypt, key in hand, the `grip iron key` USE carries
 *       skill_check: { skill: "nerve", difficulty: 12, die: "d20" }, and ONLY those
 *       three keys (no effects/branch leak);
 *   (2) every plain command on the same observation carries NO skill_check field
 *       (legacy shape);
 *   (3) the annotation mirrors the pack's authored skill_check exactly;
 *   (4) observation-only: surfacing it does not change the state hash, and once the
 *       beat is spent (one-shot flag set), the action — and its annotation — retire.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { makeStep } from "../../src/core/engine.js";
import { hashState } from "../../src/core/hash.js";
import type { GameState } from "../../src/core/state.js";

const crypt = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
if (!crypt.ok) throw new Error("sealed_crypt must compile");
const index = indexParserPack(crypt.compiled.pack);
const step = makeStep(buildParserRules(index));

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt)
      throw new Error(
        `"${id}" not legal in ${s.current}: [${enumerateActions(index, s)
          .map((o) => o.id)
          .join(", ")}]`,
      );
    const r = step(s, opt.action);
    expect(r.ok).toBe(true);
    s = r.state;
  }
  return s;
}

// Reach the Crypt holding the iron key — where the optional `grip iron key` nerve beat
// stands (the route mirrors sealed_crypt_grip_room_gated.test.ts).
const TO_CRYPT_WITH_KEY = [
  "go_north",
  "go_up",
  "take_rope",
  "go_down",
  "go_west",
  "read_headstone",
  "go_north",
  "open_stone_coffer",
  "take_brass_key",
  "go_south",
  "go_east",
  "go_east",
  "use_rope_on_old_well",
  "go_down",
  "unlock_oak_chest",
  "open_oak_chest",
  "take_iron_key",
  "go_up",
  "go_west",
  "go_north",
  "go_down",
];

const grip = (obs: ReturnType<typeof buildParserObservation>) =>
  obs.available_actions.find(
    (a) =>
      a.action.type === "USE" && a.action.item === "iron_key" && a.action.target === "iron_key",
  );

describe("bug_0274 — a skill-checked parser USE surfaces its stat + difficulty", () => {
  it("annotates the grip/nerve beat with exactly { skill, difficulty }", () => {
    const s = play(initStateForParserPack(index, 13), TO_CRYPT_WITH_KEY);
    expect(s.current).toBe("crypt");
    expect(s.inventory).toContain("iron_key");
    const obs = buildParserObservation(index, s);
    const g = grip(obs);
    expect(g, "the crypt must offer the grip iron key beat").toBeDefined();
    expect(g!.skill_check).toEqual({ skill: "nerve", difficulty: 12, die: "d20" });
    // No branch/effect leak: the surfaced object has ONLY skill + difficulty + die.
    expect(Object.keys(g!.skill_check!).sort()).toEqual(["die", "difficulty", "skill"]);
  });

  it("leaves every plain command without a skill_check field (legacy shape)", () => {
    const s = play(initStateForParserPack(index, 13), TO_CRYPT_WITH_KEY);
    const obs = buildParserObservation(index, s);
    const plain = obs.available_actions.filter(
      (a) =>
        !(
          a.action.type === "USE" &&
          a.action.item === "iron_key" &&
          a.action.target === "iron_key"
        ),
    );
    expect(plain.length, "the crypt offers many plain commands").toBeGreaterThan(3);
    for (const a of plain) expect("skill_check" in a, `${a.id} must stay plain`).toBe(false);
  });

  it("mirrors the pack's authored skill_check exactly", () => {
    const authored = index.objects
      .get("iron_key")
      ?.interactions.find((it) => it.verb === "USE" && it.item === "iron_key")?.skill_check;
    expect(authored, "iron_key must carry the authored nerve check").toBeDefined();
    const s = play(initStateForParserPack(index, 13), TO_CRYPT_WITH_KEY);
    const g = grip(buildParserObservation(index, s));
    expect(g!.skill_check).toEqual({
      skill: authored!.skill,
      difficulty: authored!.difficulty,
      die: "d20",
    });
  });

  it("is observation-only — surfacing it does not touch the state hash", () => {
    const s = play(initStateForParserPack(index, 13), TO_CRYPT_WITH_KEY);
    const obs = buildParserObservation(index, s);
    // Building the observation again must not have mutated state; the hash is a pure
    // function of state (narration/observation are never part of it).
    expect(buildParserObservation(index, s)).toEqual(obs);
    expect(s.ended).toBe(false);
    expect(typeof hashState(s)).toBe("string");
  });

  it("retires with the one-shot beat: a successful grip removes the action AND its annotation", () => {
    let s = play(initStateForParserPack(index, 13), TO_CRYPT_WITH_KEY);
    // Drive the grip beat directly; force a SUCCESS so the one-shot flag is set. The skill
    // check is resolved by the runner via the step RNG — set the flag the beat sets on
    // success to model "the beat has been spent", then confirm the action is gone.
    const opt = enumerateActions(index, s).find(
      (a) =>
        a.action.type === "USE" && a.action.item === "iron_key" && a.action.target === "iron_key",
    )!;
    // Replay the USE until the one-shot flag lands (deterministic per seed; the beat is
    // retryable on failure, so loop a bounded number of times until success).
    let spent = false;
    for (let i = 0; i < 30 && !spent; i++) {
      const r = step(s, opt.action);
      expect(r.ok).toBe(true);
      s = r.state;
      spent = s.flags["steeled_at_the_iron"] === true;
      if (!spent) {
        // failure leaves the beat retryable — it must still be offered with its annotation
        const again = grip(buildParserObservation(index, s));
        expect(again?.skill_check).toEqual({ skill: "nerve", difficulty: 12, die: "d20" });
      }
    }
    expect(spent, "the nerve beat must eventually succeed and set its one-shot flag").toBe(true);
    // Once spent, the convergent beat retires — no action, hence no dangling annotation.
    expect(grip(buildParserObservation(index, s))).toBeUndefined();
  });
});
