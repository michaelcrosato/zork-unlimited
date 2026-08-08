# `src/world` concern map

`src/world/` implements one persistent New York session. The public aggregate is
`OverworldSession`; the surrounding modules are pure planners, appliers,
projections, schemas, or proof helpers. Transport adapters should call the
session API rather than reproduce world legality.

## Ownership map

| Concern                              | Authority                                                                                                                                                                                                                         | Boundary                                                                                                                                                                                                                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authored world and immutable indexes | `overworld.ts`, `schema.ts`, `source.ts`, `source_ref.ts`, `session_manifest_index.ts`, `session_indices.ts`                                                                                                                      | Parse the manifest and build immutable lookup/planning indexes. These modules do not own a live player's mutable progress.                                                                                                                                                                       |
| Mutable session state                | `session.ts`                                                                                                                                                                                                                      | Sole public aggregate and owner of location, time/resources, discovery, journal, campaign character, journey contract, reveal receipts, quest outcomes, and caches. Mutations enter through its methods.                                                                                         |
| Legality and state transitions       | `session_*_lifecycle.ts`, `session_routes.ts`, `session_goal_passage.ts`, `local_actions.ts`, `local_event_scene.ts`, `local_job_scene.ts`, `quest_launch.ts`, `campaign_service_rules.ts`                                        | Pure planners validate the current boundary; appliers consume a validated plan. UI/MCP/CLI code must not invent an alternative gate. Story reveal/choice legality is centralized in `session.ts`.                                                                                                |
| Opening and campaign policy          | `opening_*.ts`, `journey_*.ts`, `campaign_*.ts`, `station_dispatch_board.ts`, `quest_dispatch_window.ts`                                                                                                                          | Own authored opening choices, campaign consequences, journey checkpoints, and their proof records. Presentation modules describe an already-legal state; journal modules authenticate the decision history.                                                                                      |
| Full and compact views               | `session_view_state.ts`, `session_view.ts`, `session_compact_view.ts`, `compact_view.ts`, `session_*_presentation.ts`, `session_view_clone.ts`                                                                                    | `session_view_state.ts` gathers canonical state. `session_view.ts` shapes the full player view; `session_compact_view.ts` and `compact_view.ts` derive the bounded transport view. Clone helpers prevent callers from mutating session-owned data. Views expose legality; they do not create it. |
| Persistence and restore proof        | `session_snapshot.ts`, `session_snapshot_builder.ts`, `session_persistence.ts`, `session_snapshot_restore.ts`, `session_snapshot_proofs.ts`, `session_snapshot_timeline.ts`, `session_resource_replay.ts`, `session_journal_*.ts` | `session_snapshot.ts` owns the strict structural version. The builder serializes canonical state. Restore parses, reconstructs, and proves state before `session.ts` installs it. Content-hash mismatch is provenance warning; world identity and causal/current-state proofs remain strict.     |
| Embedded RPG quest bridge            | `session_quests.ts`, `session_quest_lifecycle.ts`, `quest_launch.ts`, `quest_dispatch_window.ts`, `campaign_consequences.ts`, plus `src/mcp/embedded_quest_launch_handoff.ts`                                                     | Plans an in-world quest start, exports campaign state into the RPG runtime, then folds a certified ending and consequences back into the parent session. The child RPG state never becomes a second world authority.                                                                             |

## Dependency flow

```text
manifest/source -> immutable indexes
                         |
                         v
transport -> OverworldSession -> planner/applier modules -> mutable session state
                    |                                      |
                    +-> full view -> compact view           +-> snapshot builder
                    |                                              |
                    +-> RPG launch/foldback                strict restore + proofs
```

## Placement rules

- A new player action belongs in a session method backed by a pure planner or
  lifecycle helper. Do not gate the same action separately in MCP, CLI, and UI.
- A new visible field is derived first in the canonical full view, then compacted
  explicitly. Direct roads and multi-hop routes remain different projections.
- New mutable authority must appear in the snapshot, cloning, restore validation,
  and snapshot-hash path in the same change.
- Authored copy belongs in content or presentation modules. Restore logic proves
  state structure and causal history; it does not preserve old wording by hash.
- Quest launch and completion cross the bridge through typed receipts and campaign
  exports. Do not let child quest ids or effects mutate the overworld directly.
