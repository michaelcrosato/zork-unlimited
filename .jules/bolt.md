# Bolt's Journal

Critical learnings and codebase-specific performance patterns for AdventureForge.

## 2025-05-18 - WeakMap caching of worldHash for frozen OverworldManifest
**Learning:** `hashState(world)` takes ~100ms on the large overworld manifest object because canonical serialization recursively sorts keys and formats JSON. When building `OverworldSessionIndexes`, this calculation was being re-run on every session initialization. Caching the result via a module-level `WeakMap` for `Object.isFrozen(world)` instances eliminates this ~100ms overhead for subsequent sessions with zero risk of stale data or memory leaks.
**Action:** Always check if heavy serialization or hashing functions are repeatedly invoked on immutable/frozen domain objects, and use a `WeakMap` cached by object identity.

## 2025-05-19 - Fast-path structural equality for flat EngineActions
**Learning:** `actionEquals` and `makeStep` legal-action checks were invoking `canonicalize` (recursive `sortDeep` key sorting + `JSON.stringify`) on every step for every action candidate. Fast-pathing flat objects (objects where all values are primitives or `undefined`) with direct key/value comparison gives a ~13x speedup on action comparisons while preserving exact JSON semantics (e.g., `NaN` and `Infinity` matching `null`).
**Action:** For hot-path structural equality checks on simple action/payload objects, inspect property primitives directly instead of running full canonical JSON serialization.
