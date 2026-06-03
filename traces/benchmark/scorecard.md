# Benchmark Scorecard

Agent: `deterministic-bot` · 50 runs/cell · cells: coverage, random, coverage/hidden-graph

Objective metrics from the deterministic structured-action playtest (TextQuests-style progress/coverage). A baseline row; real frontier-model rows slot in beside it.

The `Graph` column marks whether the room graph was hidden (ULTRAPLAN §Week.4): with it hidden the bot must navigate blind, so the coverage drop from `shown`→`hidden` on parser/RPG packs is the spatial-reasoning difficulty a model is scored against. CYOA has no room graph, so its hidden row matches its shown row.

`Turns→end` is the mean number of actions to reach an ending over completed runs (efficiency: fewer = a more direct route; `—` when no run completed). It is designed to pair with the `Graph` axis: an agent that completes a parser/RPG pack BOTH ways takes more turns navigating blind, so a shown→hidden rise in turns-to-end is a second spatial-difficulty signal beside the scene-coverage drop. The baseline coverage bot completes 0% of the spatial puzzle packs (it can't plan multi-step solutions), so its turns-to-end there reads `—`; the pairing populates as capable agent rows are added.

The `Split` column marks whether the pack is `curated` (an authored disk pack under content/*/pack) or `held-out` (a procedurally-generated pack sealed under corpus/ that no external agent or training set could have seen). The held-out rows are the contamination-free signal the benchmark ultimately reports — measured through the identical bot and cells, so they are directly comparable to the curated baseline.

## Headline

One comparable number per split: `Score` is the mean over the split's packs of each pack's mean of (completion, ending coverage, scene coverage), scored on the baseline `coverage` strategy with the graph shown. The `held-out` score is the contamination-free figure the benchmark ultimately reports.

| Split | Packs | Completion | Ending cov | Scene cov | **Score** |
| --- | --: | --: | --: | --: | --: |
| curated | 14 | 22.4% | 25.0% | 66.7% | **38.1%** |
| held-out | 12 | 1.7% | 23.6% | 69.9% | **31.7%** |

### Per-mode (composition-robust)

The headline `Score` is a flat mean over a split's packs, so it moves with the split's mode MIX: the baseline bot completes CYOA packs but cannot plan the multi-step parser/RPG puzzles, so a puzzle-heavy split scores lower regardless of contamination. The curated split keeps gaining authored puzzle packs while the held-out corpus stays mode-balanced, so the cross-mode curated→held-out gap erodes as a composition artifact. This slice reads the held-out-vs-curated signal WITHIN each mode, where difficulty is roughly constant — the contamination gap is real only in the mode the bot can complete (CYOA); the puzzle modes floor out near the bot's planning ceiling in both splits.

| Mode | Split | Packs | **Score** |
| --- | --- | --: | --: |
| cyoa | curated | 6 | **68.0%** |
| cyoa | held-out | 4 | **58.6%** |
| parser | curated | 3 | **16.4%** |
| parser | held-out | 4 | **22.2%** |
| rpg | curated | 5 | **15.1%** |
| rpg | held-out | 4 | **14.3%** |

## Per-pack rows

| Pack | Mode | Strategy | Graph | Split | Completion | Endings | Ending cov | Scene cov | Turns→end |
| --- | --- | --- | --- | --- | --: | --: | --: | --: | --: |
| clockwork_heist_v1 | cyoa | coverage | shown | curated | 100.0% | 2/5 | 40.0% | 85.7% | 13.8 |
| clockwork_heist_v1 | cyoa | coverage | hidden | curated | 100.0% | 2/5 | 40.0% | 85.7% | 13.8 |
| clockwork_heist_v1 | cyoa | random | shown | curated | 100.0% | 5/5 | 100.0% | 100.0% | 12.6 |
| dead_reckoning_v1 | cyoa | coverage | shown | curated | 6.0% | 3/5 | 60.0% | 100.0% | 4.3 |
| dead_reckoning_v1 | cyoa | coverage | hidden | curated | 6.0% | 3/5 | 60.0% | 100.0% | 4.3 |
| dead_reckoning_v1 | cyoa | random | shown | curated | 100.0% | 4/5 | 80.0% | 100.0% | 10.2 |
| tithe_barn_v1 | cyoa | coverage | shown | curated | 4.0% | 2/4 | 50.0% | 100.0% | 4.0 |
| tithe_barn_v1 | cyoa | coverage | hidden | curated | 4.0% | 2/4 | 50.0% | 100.0% | 4.0 |
| tithe_barn_v1 | cyoa | random | shown | curated | 100.0% | 3/4 | 75.0% | 100.0% | 4.6 |
| watchtower_road_v1 | cyoa | coverage | shown | curated | 100.0% | 3/3 | 100.0% | 75.0% | 18.5 |
| watchtower_road_v1 | cyoa | coverage | hidden | curated | 100.0% | 3/3 | 100.0% | 75.0% | 18.5 |
| watchtower_road_v1 | cyoa | random | shown | curated | 12.0% | 2/3 | 66.7% | 75.0% | 6.7 |
| white_stag_v1 | cyoa | coverage | shown | curated | 4.0% | 2/4 | 50.0% | 100.0% | 4.0 |
| white_stag_v1 | cyoa | coverage | hidden | curated | 4.0% | 2/4 | 50.0% | 100.0% | 4.0 |
| white_stag_v1 | cyoa | random | shown | curated | 100.0% | 3/4 | 75.0% | 100.0% | 4.6 |
| wreckers_light_v1 | cyoa | coverage | shown | curated | 100.0% | 2/4 | 50.0% | 100.0% | 4.1 |
| wreckers_light_v1 | cyoa | coverage | hidden | curated | 100.0% | 2/4 | 50.0% | 100.0% | 4.1 |
| wreckers_light_v1 | cyoa | random | shown | curated | 100.0% | 4/4 | 100.0% | 100.0% | 8.4 |
| alchemists_tower_v1 | parser | coverage | shown | curated | 0.0% | 0/4 | 0.0% | 75.0% | — |
| alchemists_tower_v1 | parser | coverage | hidden | curated | 0.0% | 0/4 | 0.0% | 12.5% | — |
| alchemists_tower_v1 | parser | random | shown | curated | 60.0% | 2/4 | 50.0% | 87.5% | 39.1 |
| friars_postern_v1 | parser | coverage | shown | curated | 0.0% | 0/3 | 0.0% | 42.9% | — |
| friars_postern_v1 | parser | coverage | hidden | curated | 0.0% | 0/3 | 0.0% | 14.3% | — |
| friars_postern_v1 | parser | random | shown | curated | 10.0% | 2/3 | 66.7% | 85.7% | 37.8 |
| sealed_crypt_v1 | parser | coverage | shown | curated | 0.0% | 0/3 | 0.0% | 30.0% | — |
| sealed_crypt_v1 | parser | coverage | hidden | curated | 0.0% | 0/3 | 0.0% | 10.0% | — |
| sealed_crypt_v1 | parser | random | shown | curated | 0.0% | 0/3 | 0.0% | 90.0% | — |
| breaking_weir_v1 | rpg | coverage | shown | curated | 0.0% | 0/2 | 0.0% | 40.0% | — |
| breaking_weir_v1 | rpg | coverage | hidden | curated | 0.0% | 0/2 | 0.0% | 20.0% | — |
| breaking_weir_v1 | rpg | random | shown | curated | 6.0% | 2/2 | 100.0% | 100.0% | 33.7 |
| cold_forge_v1 | rpg | coverage | shown | curated | 0.0% | 0/2 | 0.0% | 50.0% | — |
| cold_forge_v1 | rpg | coverage | hidden | curated | 0.0% | 0/2 | 0.0% | 16.7% | — |
| cold_forge_v1 | rpg | random | shown | curated | 8.0% | 1/2 | 50.0% | 83.3% | 51.0 |
| dawn_beacon_v1 | rpg | coverage | shown | curated | 0.0% | 0/2 | 0.0% | 42.9% | — |
| dawn_beacon_v1 | rpg | coverage | hidden | curated | 0.0% | 0/2 | 0.0% | 14.3% | — |
| dawn_beacon_v1 | rpg | random | shown | curated | 0.0% | 0/2 | 0.0% | 85.7% | — |
| sunken_barrow_v1 | rpg | coverage | shown | curated | 0.0% | 0/3 | 0.0% | 50.0% | — |
| sunken_barrow_v1 | rpg | coverage | hidden | curated | 0.0% | 0/3 | 0.0% | 16.7% | — |
| sunken_barrow_v1 | rpg | random | shown | curated | 12.0% | 2/3 | 66.7% | 100.0% | 35.7 |
| wolf_winter_v1 | rpg | coverage | shown | curated | 0.0% | 0/2 | 0.0% | 42.9% | — |
| wolf_winter_v1 | rpg | coverage | hidden | curated | 0.0% | 0/2 | 0.0% | 14.3% | — |
| wolf_winter_v1 | rpg | random | shown | curated | 0.0% | 0/2 | 0.0% | 85.7% | — |
| gen_0_v1 | cyoa | coverage | shown | held-out | 6.0% | 3/4 | 75.0% | 100.0% | 2.3 |
| gen_0_v1 | cyoa | coverage | hidden | held-out | 6.0% | 3/4 | 75.0% | 100.0% | 2.3 |
| gen_0_v1 | cyoa | random | shown | held-out | 100.0% | 3/4 | 75.0% | 100.0% | 2.9 |
| gen_1_v1 | cyoa | coverage | shown | held-out | 6.0% | 3/4 | 75.0% | 100.0% | 2.3 |
| gen_1_v1 | cyoa | coverage | hidden | held-out | 6.0% | 3/4 | 75.0% | 100.0% | 2.3 |
| gen_1_v1 | cyoa | random | shown | held-out | 100.0% | 3/4 | 75.0% | 100.0% | 2.9 |
| gen_2_v1 | cyoa | coverage | shown | held-out | 4.0% | 2/3 | 66.7% | 100.0% | 3.0 |
| gen_2_v1 | cyoa | coverage | hidden | held-out | 4.0% | 2/3 | 66.7% | 100.0% | 3.0 |
| gen_2_v1 | cyoa | random | shown | held-out | 100.0% | 2/3 | 66.7% | 100.0% | 3.0 |
| gen_3_v1 | cyoa | coverage | shown | held-out | 4.0% | 2/3 | 66.7% | 100.0% | 3.0 |
| gen_3_v1 | cyoa | coverage | hidden | held-out | 4.0% | 2/3 | 66.7% | 100.0% | 3.0 |
| gen_3_v1 | cyoa | random | shown | held-out | 100.0% | 2/3 | 66.7% | 100.0% | 3.0 |
| genpar_0_v1 | parser | coverage | shown | held-out | 0.0% | 0/2 | 0.0% | 66.7% | — |
| genpar_0_v1 | parser | coverage | hidden | held-out | 0.0% | 0/2 | 0.0% | 33.3% | — |
| genpar_0_v1 | parser | random | shown | held-out | 26.0% | 2/2 | 100.0% | 100.0% | 66.7 |
| genpar_1_v1 | parser | coverage | shown | held-out | 0.0% | 0/2 | 0.0% | 66.7% | — |
| genpar_1_v1 | parser | coverage | hidden | held-out | 0.0% | 0/2 | 0.0% | 33.3% | — |
| genpar_1_v1 | parser | random | shown | held-out | 26.0% | 2/2 | 100.0% | 100.0% | 66.7 |
| genpar_2_v1 | parser | coverage | shown | held-out | 0.0% | 0/2 | 0.0% | 66.7% | — |
| genpar_2_v1 | parser | coverage | hidden | held-out | 0.0% | 0/2 | 0.0% | 33.3% | — |
| genpar_2_v1 | parser | random | shown | held-out | 26.0% | 2/2 | 100.0% | 100.0% | 66.7 |
| genpar_3_v1 | parser | coverage | shown | held-out | 0.0% | 0/2 | 0.0% | 66.7% | — |
| genpar_3_v1 | parser | coverage | hidden | held-out | 0.0% | 0/2 | 0.0% | 33.3% | — |
| genpar_3_v1 | parser | random | shown | held-out | 26.0% | 2/2 | 100.0% | 100.0% | 66.7 |
| genrpg_0_v1 | rpg | coverage | shown | held-out | 0.0% | 0/3 | 0.0% | 42.9% | — |
| genrpg_0_v1 | rpg | coverage | hidden | held-out | 0.0% | 0/3 | 0.0% | 14.3% | — |
| genrpg_0_v1 | rpg | random | shown | held-out | 0.0% | 0/3 | 0.0% | 85.7% | — |
| genrpg_1_v1 | rpg | coverage | shown | held-out | 0.0% | 0/3 | 0.0% | 42.9% | — |
| genrpg_1_v1 | rpg | coverage | hidden | held-out | 0.0% | 0/3 | 0.0% | 14.3% | — |
| genrpg_1_v1 | rpg | random | shown | held-out | 0.0% | 0/3 | 0.0% | 85.7% | — |
| genrpg_2_v1 | rpg | coverage | shown | held-out | 0.0% | 0/3 | 0.0% | 42.9% | — |
| genrpg_2_v1 | rpg | coverage | hidden | held-out | 0.0% | 0/3 | 0.0% | 14.3% | — |
| genrpg_2_v1 | rpg | random | shown | held-out | 0.0% | 0/3 | 0.0% | 85.7% | — |
| genrpg_3_v1 | rpg | coverage | shown | held-out | 0.0% | 0/3 | 0.0% | 42.9% | — |
| genrpg_3_v1 | rpg | coverage | hidden | held-out | 0.0% | 0/3 | 0.0% | 14.3% | — |
| genrpg_3_v1 | rpg | random | shown | held-out | 0.0% | 0/3 | 0.0% | 85.7% | — |

_Regenerate: `npm run benchmark` (markdown) · `npm run benchmark -- --json` · `--out <path>` writes .md + .json._
