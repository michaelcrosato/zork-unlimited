# Benchmark Scorecard

Agent: `deterministic-bot` · 50 runs/cell · strategies: coverage, random

Objective metrics from the deterministic structured-action playtest (TextQuests-style progress/coverage). A baseline row; real frontier-model rows slot in beside it.

| Pack | Mode | Strategy | Completion | Endings | Ending cov | Scene cov |
| --- | --- | --- | --: | --: | --: | --: |
| clockwork_heist_v1 | cyoa | coverage | 100.0% | 2/5 | 40.0% | 85.7% |
| clockwork_heist_v1 | cyoa | random | 100.0% | 5/5 | 100.0% | 100.0% |
| watchtower_road_v1 | cyoa | coverage | 100.0% | 3/3 | 100.0% | 75.0% |
| watchtower_road_v1 | cyoa | random | 12.0% | 2/3 | 66.7% | 75.0% |
| wreckers_light_v1 | cyoa | coverage | 100.0% | 2/4 | 50.0% | 100.0% |
| wreckers_light_v1 | cyoa | random | 100.0% | 4/4 | 100.0% | 100.0% |
| alchemists_tower_v1 | parser | coverage | 0.0% | 0/2 | 0.0% | 75.0% |
| alchemists_tower_v1 | parser | random | 48.0% | 1/2 | 50.0% | 87.5% |
| sealed_crypt_v1 | parser | coverage | 0.0% | 0/1 | 0.0% | 30.0% |
| sealed_crypt_v1 | parser | random | 0.0% | 0/1 | 0.0% | 90.0% |
| cold_forge_v1 | rpg | coverage | 0.0% | 0/2 | 0.0% | 50.0% |
| cold_forge_v1 | rpg | random | 8.0% | 1/2 | 50.0% | 83.3% |
| sunken_barrow_v1 | rpg | coverage | 0.0% | 0/3 | 0.0% | 50.0% |
| sunken_barrow_v1 | rpg | random | 12.0% | 2/3 | 66.7% | 100.0% |

_Regenerate: `npm run benchmark` (markdown) · `npm run benchmark -- --json` · `--out <path>` writes .md + .json._
