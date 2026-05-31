import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Determinism: tests must not depend on wall-clock ordering or shared state.
    isolate: true,
  },
});
