# Benchmark Scorecard

Agent: `deterministic-bot` · 50 runs/cell · cells: coverage, random, coverage/hidden-graph

Objective metrics from the deterministic structured-action playtest (TextQuests-style progress/coverage). A baseline row; real frontier-model rows slot in beside it.

The `Graph` column marks whether the room graph was hidden (ULTRAPLAN §Week.4): with it hidden the bot must navigate blind, so the coverage drop from `shown`→`hidden` on parser/RPG packs is the spatial-reasoning difficulty a model is scored against. CYOA has no room graph, so its hidden row matches its shown row.

| Pack | Mode | Strategy | Graph | Completion | Endings | Ending cov | Scene cov |
| --- | --- | --- | --- | --: | --: | --: | --: |
| clockwork_heist_v1 | cyoa | coverage | shown | 100.0% | 2/5 | 40.0% | 85.7% |
| clockwork_heist_v1 | cyoa | coverage | hidden | 100.0% | 2/5 | 40.0% | 85.7% |
| clockwork_heist_v1 | cyoa | random | shown | 100.0% | 5/5 | 100.0% | 100.0% |
| tithe_barn_v1 | cyoa | coverage | shown | 4.0% | 2/4 | 50.0% | 100.0% |
| tithe_barn_v1 | cyoa | coverage | hidden | 4.0% | 2/4 | 50.0% | 100.0% |
| tithe_barn_v1 | cyoa | random | shown | 100.0% | 3/4 | 75.0% | 100.0% |
| watchtower_road_v1 | cyoa | coverage | shown | 100.0% | 3/3 | 100.0% | 75.0% |
| watchtower_road_v1 | cyoa | coverage | hidden | 100.0% | 3/3 | 100.0% | 75.0% |
| watchtower_road_v1 | cyoa | random | shown | 12.0% | 2/3 | 66.7% | 75.0% |
| white_stag_v1 | cyoa | coverage | shown | 4.0% | 2/4 | 50.0% | 100.0% |
| white_stag_v1 | cyoa | coverage | hidden | 4.0% | 2/4 | 50.0% | 100.0% |
| white_stag_v1 | cyoa | random | shown | 100.0% | 3/4 | 75.0% | 100.0% |
| wreckers_light_v1 | cyoa | coverage | shown | 100.0% | 2/4 | 50.0% | 100.0% |
| wreckers_light_v1 | cyoa | coverage | hidden | 100.0% | 2/4 | 50.0% | 100.0% |
| wreckers_light_v1 | cyoa | random | shown | 100.0% | 4/4 | 100.0% | 100.0% |
| alchemists_tower_v1 | parser | coverage | shown | 0.0% | 0/4 | 0.0% | 75.0% |
| alchemists_tower_v1 | parser | coverage | hidden | 0.0% | 0/4 | 0.0% | 12.5% |
| alchemists_tower_v1 | parser | random | shown | 60.0% | 2/4 | 50.0% | 87.5% |
| sealed_crypt_v1 | parser | coverage | shown | 0.0% | 0/3 | 0.0% | 30.0% |
| sealed_crypt_v1 | parser | coverage | hidden | 0.0% | 0/3 | 0.0% | 10.0% |
| sealed_crypt_v1 | parser | random | shown | 0.0% | 0/3 | 0.0% | 90.0% |
| cold_forge_v1 | rpg | coverage | shown | 0.0% | 0/2 | 0.0% | 50.0% |
| cold_forge_v1 | rpg | coverage | hidden | 0.0% | 0/2 | 0.0% | 16.7% |
| cold_forge_v1 | rpg | random | shown | 8.0% | 1/2 | 50.0% | 83.3% |
| sunken_barrow_v1 | rpg | coverage | shown | 0.0% | 0/3 | 0.0% | 50.0% |
| sunken_barrow_v1 | rpg | coverage | hidden | 0.0% | 0/3 | 0.0% | 16.7% |
| sunken_barrow_v1 | rpg | random | shown | 12.0% | 2/3 | 66.7% | 100.0% |

_Regenerate: `npm run benchmark` (markdown) · `npm run benchmark -- --json` · `--out <path>` writes .md + .json._
