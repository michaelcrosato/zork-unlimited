import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";

const localWorkerCap = Math.min(8, availableParallelism());

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Determinism: tests must not depend on wall-clock ordering or shared state.
    isolate: true,
    // The suite mixes bounded exhaustive state-graph proofs with real subprocess/job
    // lifecycle checks. Letting Vitest mirror every logical CPU can starve both classes:
    // on a 28-thread developer host, the same files repeatedly crossed their fail-fast
    // ceilings while passing together in less than half that time. Keep two isolated
    // workers on GitHub's two-vCPU runner and cap developer hosts at eight. Every file
    // and assertion still runs; the cap removes oversubscription and lowers peak heap.
    maxWorkers: process.env.CI === "true" ? 2 : localWorkerCap,
    // The exhaustive ground-truth regression proofs (e.g. rpg_all_endings_reachable,
    // rpg_score_economy_sound, rpg_variant_liveness, rpg_action_id_unique) BFS the full
    // reachable state space of the largest packs — deterministic but compute-heavy,
    // ~6-12s on the big RPG packs. The vitest default (5000ms) sits right on that edge,
    // so they flake under CPU load; 30000ms still flaked when the full 262-file suite runs
    // ~28-way in parallel ON TOP OF a concurrent AFK loop, starving these census `it`s
    // past 30s (bug_0237 — three sibling RPG census suites timed out together under that
    // contention, while each passes in ~12s isolated). Raised to 60000ms: a generous
    // explicit timeout removes the flake without loosening correctness — a real hang still
    // fails, just with headroom (the solvers are bounded by an internal state cap).
    testTimeout: 60000,
  },
});
