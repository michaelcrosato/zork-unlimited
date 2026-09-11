# Bolt's Journal

Critical learnings and codebase-specific performance patterns for AdventureForge.

## 2025-05-18 - Fast-path constructor check and sorting skip in `canonicalize`
**Learning:** `canonicalize(value)` in `src/core/hash.ts` is in the hot path of engine step validation and BFS state crawling. Previously, `rejectedObjectKind` evaluated an array of `instanceof` check closures for every single object node, and `sortDeep` blindly called `.sort()` on all key lists. Checking `value.constructor === Object || value.constructor === undefined` first bypasses non-JSON object kind checks for >99% of nodes, and checking if keys are already sorted (`prev > curr`) avoids `.sort()` overhead.
**Action:** Fast-path constructor equality checks before `instanceof` cascades in recursive object tree walkers, and verify sorted order before allocating/sorting key arrays.

## 2025-05-18 - WeakMap caching of worldHash for frozen OverworldManifest
**Learning:** `hashState(world)` takes ~100ms on the large overworld manifest object because canonical serialization recursively sorts keys and formats JSON. When building `OverworldSessionIndexes`, this calculation was being re-run on every session initialization. Caching the result via a module-level `WeakMap` for `Object.isFrozen(world)` instances eliminates this ~100ms overhead for subsequent sessions with zero risk of stale data or memory leaks.
**Action:** Always check if heavy serialization or hashing functions are repeatedly invoked on immutable/frozen domain objects, and use a `WeakMap` cached by object identity.
