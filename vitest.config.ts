import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Determinism: tests must not depend on wall-clock ordering or shared state.
    isolate: true,
    // The exhaustive ground-truth regression proofs (e.g. rpg_all_endings_reachable,
    // rpg_score_economy_sound, rpg_variant_liveness) BFS the full reachable state
    // space of the largest packs — deterministic but compute-heavy, ~6s on cold_forge.
    // The vitest default (5000ms) sits right on that edge, so they flake under CPU
    // load (concurrent work, or a slower/shared CI runner). A generous explicit
    // timeout removes the flake without loosening correctness — a real hang still
    // fails, just with headroom (the solvers are bounded by an internal state cap).
    testTimeout: 30000,
  },
});
