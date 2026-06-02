# Benchmark Scorecard

Agent: `deterministic-bot` · 50 runs/cell · cells: coverage, random, coverage/hidden-graph

Objective metrics from the deterministic structured-action playtest (TextQuests-style progress/coverage). A baseline row; real frontier-model rows slot in beside it.

The `Graph` column marks whether the room graph was hidden (ULTRAPLAN §Week.4): with it hidden the bot must navigate blind, so the coverage drop from `shown`→`hidden` on parser/RPG packs is the spatial-reasoning difficulty a model is scored against. CYOA has no room graph, so its hidden row matches its shown row.

`Turns→end` is the mean number of actions to reach an ending over completed runs (efficiency: fewer = a more direct route; `—` when no run completed). It is designed to pair with the `Graph` axis: an agent that completes a parser/RPG pack BOTH ways takes more turns navigating blind, so a shown→hidden rise in turns-to-end is a second spatial-difficulty signal beside the scene-coverage drop. The baseline coverage bot completes 0% of the spatial puzzle packs (it can't plan multi-step solutions), so its turns-to-end there reads `—`; the pairing populates as capable agent rows are added.

| Pack | Mode | Strategy | Graph | Completion | Endings | Ending cov | Scene cov | Turns→end |
| --- | --- | --- | --- | --: | --: | --: | --: | --: |
| clockwork_heist_v1 | cyoa | coverage | shown | 100.0% | 2/5 | 40.0% | 85.7% | 13.8 |
| clockwork_heist_v1 | cyoa | coverage | hidden | 100.0% | 2/5 | 40.0% | 85.7% | 13.8 |
| clockwork_heist_v1 | cyoa | random | shown | 100.0% | 5/5 | 100.0% | 100.0% | 12.6 |
| tithe_barn_v1 | cyoa | coverage | shown | 4.0% | 2/4 | 50.0% | 100.0% | 4.0 |
| tithe_barn_v1 | cyoa | coverage | hidden | 4.0% | 2/4 | 50.0% | 100.0% | 4.0 |
| tithe_barn_v1 | cyoa | random | shown | 100.0% | 3/4 | 75.0% | 100.0% | 4.6 |
| watchtower_road_v1 | cyoa | coverage | shown | 100.0% | 3/3 | 100.0% | 75.0% | 18.5 |
| watchtower_road_v1 | cyoa | coverage | hidden | 100.0% | 3/3 | 100.0% | 75.0% | 18.5 |
| watchtower_road_v1 | cyoa | random | shown | 12.0% | 2/3 | 66.7% | 75.0% | 6.7 |
| white_stag_v1 | cyoa | coverage | shown | 4.0% | 2/4 | 50.0% | 100.0% | 4.0 |
| white_stag_v1 | cyoa | coverage | hidden | 4.0% | 2/4 | 50.0% | 100.0% | 4.0 |
| white_stag_v1 | cyoa | random | shown | 100.0% | 3/4 | 75.0% | 100.0% | 4.6 |
| wreckers_light_v1 | cyoa | coverage | shown | 100.0% | 2/4 | 50.0% | 100.0% | 4.1 |
| wreckers_light_v1 | cyoa | coverage | hidden | 100.0% | 2/4 | 50.0% | 100.0% | 4.1 |
| wreckers_light_v1 | cyoa | random | shown | 100.0% | 4/4 | 100.0% | 100.0% | 8.4 |
| alchemists_tower_v1 | parser | coverage | shown | 0.0% | 0/4 | 0.0% | 75.0% | — |
| alchemists_tower_v1 | parser | coverage | hidden | 0.0% | 0/4 | 0.0% | 12.5% | — |
| alchemists_tower_v1 | parser | random | shown | 60.0% | 2/4 | 50.0% | 87.5% | 39.1 |
| sealed_crypt_v1 | parser | coverage | shown | 0.0% | 0/3 | 0.0% | 30.0% | — |
| sealed_crypt_v1 | parser | coverage | hidden | 0.0% | 0/3 | 0.0% | 10.0% | — |
| sealed_crypt_v1 | parser | random | shown | 0.0% | 0/3 | 0.0% | 90.0% | — |
| cold_forge_v1 | rpg | coverage | shown | 0.0% | 0/2 | 0.0% | 50.0% | — |
| cold_forge_v1 | rpg | coverage | hidden | 0.0% | 0/2 | 0.0% | 16.7% | — |
| cold_forge_v1 | rpg | random | shown | 8.0% | 1/2 | 50.0% | 83.3% | 51.0 |
| sunken_barrow_v1 | rpg | coverage | shown | 0.0% | 0/3 | 0.0% | 50.0% | — |
| sunken_barrow_v1 | rpg | coverage | hidden | 0.0% | 0/3 | 0.0% | 16.7% | — |
| sunken_barrow_v1 | rpg | random | shown | 12.0% | 2/3 | 66.7% | 100.0% | 35.7 |

_Regenerate: `npm run benchmark` (markdown) · `npm run benchmark -- --json` · `--out <path>` writes .md + .json._
