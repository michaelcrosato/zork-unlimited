/**
 * Regression for bug_0367 -- Midnight Edition's alley threat must pay off.
 * A fresh MCP blind playtest found the pack excellent but flagged the four men
 * with hammers as mechanically inert: barring the door changed prose but not the
 * final press decision. The fix makes the best ending require both proof and a
 * secured press room, so the alley danger is part of the solution instead of set
 * dressing.
 */
import { describe, expect, it } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/midnight_edition.yaml");
if (!loaded.ok) throw new Error("midnight_edition pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[], seed = 7) {
  const step = makeStep(rules);
  let state = initStateForPack(index, seed);
  for (const id of ids) state = step(state, choose(id)).state;
  return state;
}

const obs = (ids: string[]) => buildObservation(index, play(ids));
const actionIds = (ids: string[]) => obs(ids).available_actions.map((a) => a.id);

const VERIFY = [
  "read_letter",
  "go_office",
  "search_desk",
  "open_safe",
  "read_report",
  "leave_office",
];

const SECURE = ["go_alley", "bar_door"];

describe("bug_0367 -- Midnight Edition alley threat payoff", () => {
  it("does not offer the verified print while the proven story is still physically unsecured", () => {
    const floor = obs([...VERIFY, "go_press"]);

    expect(floor.text).toMatch(/boots above have not been answered/i);
    expect(floor.text).toMatch(/breaking the machine/i);
    expect(floor.available_actions.map((a) => a.id)).not.toContain("print_verified");
    expect(floor.available_actions.map((a) => a.id)).not.toContain("print_unverified");
    expect(floor.available_actions.map((a) => a.id)).toContain("leave_press");
  });

  it("offers verified print after proof and a barred alley door", () => {
    const floor = obs([...VERIFY, ...SECURE, "go_press"]);
    const print = floor.available_actions.find((a) => a.id === "print_verified");

    expect(floor.text).toMatch(/alley door is barred/i);
    expect(floor.text).toMatch(/men with hammers held out/i);
    expect(print?.text).toMatch(/behind the barred door/i);
  });

  it("keeps the best ending reachable and acknowledges that the barred door mattered", () => {
    const end = obs([...VERIFY, ...SECURE, "go_press", "print_verified"]);

    expect(end.ending_id).toBe("ending_vindicated");
    expect(end.state.vars.score).toBe(35);
    expect(end.text).toMatch(/barred alley door jumps/i);
    expect(end.text).toMatch(/wrecking-bar is useless/i);
  });

  it("keeps the alley consequence independent of which bar action secured the door", () => {
    const withSkillCheck = actionIds([...VERIFY, "go_alley", "steady_and_bar", "go_press"]);

    expect(withSkillCheck).toContain("print_verified");
  });
});
