import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack } from "../../src/cyoa/runner.js";
import { runPlaytest, runRoster } from "../../agents/playtester.js";
import { MockProvider, PlaytesterDecisionSchema, pickAction } from "../../agents/llm/provider.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { initStateForPack } from "../../src/cyoa/runner.js";

const loaded = loadPackFile("content/cyoa/pack/watchtower_road.yaml");
if (!loaded.ok) throw new Error("pack must compile");
const pack = loaded.compiled.pack;
const index = indexPack(pack);

describe("MockProvider (§12.7)", () => {
  it("returns a schema-valid decision that picks a legal action", async () => {
    const obs = buildObservation(index, initStateForPack(index, 1));
    const provider = new MockProvider("mainline");
    const decision = await provider.completeJson({
      system: "s",
      user: JSON.stringify({ observation: obs, step: 0 }),
      schemaName: "PlaytesterDecision",
      schema: PlaytesterDecisionSchema,
    });
    expect(obs.available_actions.map((a) => a.id)).toContain(decision.action_id);
  });

  it("curious persona prefers an investigative action", () => {
    const obs = buildObservation(index, initStateForPack(index, 1));
    // forest_crossroads offers inspect_ground — curiosity should pick it.
    expect(pickAction("curious", obs, 0, 0)).toBe("inspect_ground");
    expect(pickAction("mainline", obs, 0, 0)).toBe("go_east");
  });
});

describe("playtester run (§12.4, §12.6)", () => {
  it("mainline completes a game and produces a record", async () => {
    const rec = await runPlaytest(index, new MockProvider("mainline"), { persona: "mainline", seed: 1 });
    expect(rec.status).toBe("completed");
    expect(rec.ending_id).not.toBeNull();
    expect(rec.steps.length).toBeGreaterThan(0);
    // Each recorded step references a legal action it actually took.
    for (const s of rec.steps) expect(s.available).toContain(s.chosen_action);
  });

  it("is deterministic: same persona+seed ⇒ identical record", async () => {
    const a = await runPlaytest(index, new MockProvider("seeded", 4), { persona: "seeded", seed: 4 });
    const b = await runPlaytest(index, new MockProvider("seeded", 4), { persona: "seeded", seed: 4 });
    expect(a.final_hash).toBe(b.final_hash);
    expect(a.steps.map((s) => s.chosen_action)).toEqual(b.steps.map((s) => s.chosen_action));
  });

  it("terminates on every run (loop guard / max steps)", async () => {
    const { records } = await runRoster(pack, { seeds: [1, 2, 3], maxSteps: 80 });
    for (const r of records) expect(["completed", "looped", "stuck", "max_steps"]).toContain(r.status);
  });
});

describe("roster coverage (§13.4)", () => {
  it("the persona roster reaches multiple endings and reports honest findings", async () => {
    const { coverage } = await runRoster(pack);
    expect(coverage.endings_declared).toEqual(["ending_captured", "ending_escape", "ending_truth"]);
    // The mock roster reaches at least two of the three endings.
    expect(coverage.endings_reached.length).toBeGreaterThanOrEqual(2);
    // Scene coverage is internally consistent (no ending nodes leaking in).
    expect(coverage.scenes_visited.length + coverage.scenes_unvisited.length).toBe(coverage.scenes_total);
    expect(coverage.scenes_total).toBe(20);
    // Coverage findings are derived, not fabricated: any missing ending is reported.
    for (const e of coverage.endings_missing) {
      expect(coverage.findings.some((f) => f.includes(e))).toBe(true);
    }
  });
});
