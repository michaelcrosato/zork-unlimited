# Bolt's Performance Journal

## 2025-05-18 - Overworld Manifest Lookups and Hot Loop Zod Re-validation

**Learning:** Repeated array filtering/finding (`world.edges`, `world.areas`, `world.local_jobs`, `world.local_events`) in overworld pathfinding and campaign service integrity verification was a major bottleneck. Furthermore, calling Zod schema `.parse()` inside inner loops during state evolution and condition evaluation created severe CPU and garbage collection overhead. WeakMap caching keyed by `OverworldManifest` combined with pre-indexing character conditions and skipping redundant Zod parses on already validated objects reduced `assertOverworldIntegrity` runtime from ~25s to ~15s (a ~40% speedup).

**Action:** Use module-level `WeakMap`s keyed by `OverworldManifest` for O(1) indexed lookups, and avoid calling Zod `.parse()` repeatedly inside hot loops when dealing with internally created or already validated domain objects.
