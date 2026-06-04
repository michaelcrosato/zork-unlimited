/**
 * bug_0237 — playtester loop resilience to off-shape model replies.
 *
 * `runPlaytest` (agents/playtester.ts) drives a game one turn at a time; each turn its
 * ONLY model call is `provider.completeJson(...)`, which does `schema.parse(extractJson(text))`:
 * it THROWS both when no balanced JSON can be extracted (prose / fences / truncation) AND
 * when the parsed object fails the `.strict()` PlaytesterDecisionSchema (an extra key, a
 * wrong shape). The deterministic MockProvider never does either — but a live frontier model
 * will, the same keyed-run risk bug_0236 hardened the AUTHOR loop against.
 *
 * BEFORE this fix the throw propagated straight out of `runPlaytest`, aborting the WHOLE
 * roster run on the offending turn (runRoster awaits each record in sequence) — no fallback,
 * no record, a raw unattributed error. That is strictly inconsistent with the loop's own
 * design: an illegal-but-PARSEABLE pick was already tolerated as "a real agent's miss" (fall
 * back to the first legal action and note it), yet a strictly-worse UNPARSEABLE reply crashed
 * everything. AFTER it, a thrown completion is treated as the severest form of that same miss:
 * fall back to the first legal action and record it honestly in the step's reason. One bad
 * turn no longer aborts the run.
 *
 * These witnesses pin that contract: a transient bad reply self-heals (the record still
 * reaches a terminal ending and the offending turn carries the fallback note), and a
 * PERSISTENTLY-broken backend still produces a complete record (every turn falling back to
 * the first legal action — the mainline trajectory) instead of throwing. All FAIL against
 * the pre-fix loop, where the first throw escapes `runPlaytest`.
 */
import { describe, it, expect } from "vitest";
import type { Provider, CompletionRequest } from "../../agents/llm/provider.js";
import { MockProvider } from "../../agents/llm/provider.js";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack } from "../../src/cyoa/runner.js";
import { runPlaytest } from "../../agents/playtester.js";

const loaded = loadPackFile("content/cyoa/pack/watchtower_road.yaml");
if (!loaded.ok) throw new Error("pack must compile");
const index = indexPack(loaded.compiled.pack);

/**
 * Wraps a real provider but throws on the first `throwFirst` completeJson calls
 * (`Infinity` ⇒ every call throws), simulating a model that returns off-shape JSON for a
 * while — or forever — before (maybe) settling. Mimics `completeJson`'s own failure mode.
 */
class FlakyProvider implements Provider {
  readonly name = "mock:flaky-playtester";
  calls = 0;
  constructor(
    private readonly inner: Provider,
    private readonly throwFirst: number,
  ) {}
  async completeJson<T>(req: CompletionRequest<T>): Promise<T> {
    this.calls++;
    if (this.calls <= this.throwFirst) {
      throw new Error(`simulated off-shape model reply (call ${this.calls})`);
    }
    return this.inner.completeJson(req);
  }
}

describe("playtester loop resilience (bug_0237)", () => {
  it("a transient off-shape reply self-heals — the run still reaches a terminal ending", async () => {
    const flaky = new FlakyProvider(new MockProvider("mainline", 1), 1);
    const rec = await runPlaytest(index, flaky, { persona: "mainline", seed: 1 });

    // No throw escaped: the record completed to a real ending instead of aborting the roster.
    expect(rec.status).toBe("completed");
    expect(rec.ending_id).not.toBeNull();
    expect(rec.steps.length).toBeGreaterThan(0);

    // The offending first turn fell back to a legal action and recorded WHY (non-vacuous:
    // proves the throw became a recorded fallback, not a crash).
    expect(rec.steps[0]!.reason).toMatch(/no parseable decision/);
    expect(rec.steps[0]!.available).toContain(rec.steps[0]!.chosen_action);
    // After the transient round, normal decisions resume — later turns are not all fallbacks.
    expect(rec.steps.some((s) => !/no parseable decision/.test(s.reason))).toBe(true);
    // Every recorded step still references a legal action it actually took.
    for (const s of rec.steps) expect(s.available).toContain(s.chosen_action);
  });

  it("a PERSISTENTLY broken backend still yields a complete record (never throws)", async () => {
    const flaky = new FlakyProvider(new MockProvider("mainline", 1), Infinity);
    const rec = await runPlaytest(index, flaky, { persona: "mainline", seed: 1 });

    // Every turn threw, yet the run completed by falling back to the first legal action each
    // time (the mainline trajectory) — the whole point: a dead backend degrades, not crashes.
    expect(rec.status).toBe("completed");
    expect(rec.ending_id).not.toBeNull();
    expect(rec.steps.length).toBeGreaterThan(0);
    for (const s of rec.steps) {
      expect(s.reason).toMatch(/no parseable decision/);
      expect(s.expected).toBe("(no decision returned)");
      expect(s.available).toContain(s.chosen_action);
    }
  });
});
