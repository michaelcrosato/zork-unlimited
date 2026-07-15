import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Determinism: tests must not depend on wall-clock ordering or shared state.
    isolate: true,
    // GitHub's two-vCPU runner otherwise starts more exhaustive state-graph files than
    // it can execute concurrently. Each bounded proof then receives only a fraction of
    // a core and can hit its per-test fail-fast despite passing isolated. Keep two fully
    // isolated workers in CI: every file and assertion still runs, with less contention
    // and a lower peak heap. Developer machines retain Vitest's normal worker selection.
    ...(process.env.CI === "true" ? { maxWorkers: 2 } : {}),
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
