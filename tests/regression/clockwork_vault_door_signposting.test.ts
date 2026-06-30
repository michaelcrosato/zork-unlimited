/**
 * Regression (§15) for bug_0008 — the lockpick-less vault door in clockwork_heist.
 *
 * A blind MCP playtester's top friction (ai-runs/2026-06-01T06-01-12-651Z):
 * arriving at the vault door WITHOUT a lockpick offered only "Force the door"
 * (which the clue says fails, and which leads to ending_caught) or "Back away",
 * so a player who HEEDED the "never to force" warning had no action that honoured
 * it and no hint a tool found elsewhere was the answer — the vault, and the Rich
 * ending behind it, read as a dead end. The fix adds a `study_lock` choice, shown
 * only when the player holds no lockpick, that narrates "coax, not break / find a
 * slender tool" and routes the player OUT to the gallery (it must MAKE PROGRESS,
 * not self-loop — a same-scene no-state-change step is flagged by the playtester's
 * loop-detector, so the nudge moves the player rather than re-rendering the door).
 * Locked here:
 *   (1) lockpick-less, the door offers the legible nudge and the losing force/exit
 *       options, but NOT the invisible pick_lock;
 *   (2) studying the lock narrates a 'find a tool' hint, takes no item/flag/journal,
 *       and makes progress (moves to landing, not ending_caught) — never a self-loop;
 *   (3) once a lockpick is carried, the nudge is gone and `pick_lock` takes over.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
if (!loaded.ok) throw new Error("clockwork_heist pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function run(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 19);
  const events = [];
  for (const id of ids) {
    const r = step(s, choose(id));
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}
const optionIds = (s: ReturnType<typeof run>["state"]): string[] =>
  buildObservation(index, s).available_actions.map((a) => a.id);

// Climb the stairs first — a natural opening — and approach the vault with no pick.
const TO_VAULT_NO_PICK = ["climb_stairs", "approach_vault"];
// Detour through the kitchen for the lockpick before approaching the vault.
const TO_VAULT_WITH_PICK = ["kitchens", "take_pick", "dumbwaiter", "approach_vault"];

describe("bug_0008 — lockpick-less vault door gives a legible 'find a tool' nudge", () => {
  it("offers study_lock (not the invisible pick_lock) when the player has no lockpick", () => {
    const { state } = run(TO_VAULT_NO_PICK);
    expect(state.current).toBe("vault_door");
    expect(state.inventory).not.toContain("lockpick");
    const opts = optionIds(state);
    expect(opts).toContain("study_lock");
    // The losing force option and the safe exit stay available.
    expect(opts).toContain("force_door");
    expect(opts).toContain("retreat");
    // The real solution stays gated out without a lockpick.
    expect(opts).not.toContain("pick_lock");
  });

  it("studying the lock narrates a 'find a tool' hint and makes progress (no self-loop)", () => {
    const before = run(TO_VAULT_NO_PICK).state;
    const after = run([...TO_VAULT_NO_PICK, "study_lock"]);
    // Feedback only: no item, flag, or journal gained.
    expect(after.state.inventory).toEqual(before.inventory);
    expect(after.state.journal).toEqual(before.journal);
    expect(after.state.flags).toEqual(before.flags);
    // A narration event surfaced the hint to the player.
    const narr = after.events.filter((e) => e.type === "narration");
    expect(narr.length).toBe(1);
    expect(/tool|instrument|steady hand/i.test((narr[0] as { text: string }).text)).toBe(true);
    // Crucially it MOVES the player to the gallery rather than re-rendering the
    // door (a same-scene no-state-change step is a stuck self-loop) and never
    // trips the alarm / Caught ending. Progress here means the scene changed.
    expect(after.state.current).toBe("landing");
    expect(after.state.current).not.toBe(before.current);
    expect(after.state.flags.alarm).toBeFalsy();
  });

  it("once a lockpick is carried, the nudge is gone and pick_lock takes over", () => {
    const withPick = run(TO_VAULT_WITH_PICK);
    expect(withPick.state.current).toBe("vault_door");
    expect(withPick.state.inventory).toContain("lockpick");
    const opts = optionIds(withPick.state);
    expect(opts).not.toContain("study_lock");
    expect(opts).toContain("pick_lock");
  });
});
