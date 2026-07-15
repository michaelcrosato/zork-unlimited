# Blind Feedback Ledger

Generated deterministically from verified blind reports. The latest entries stay explicit; older entries are collapsed into trait counts so repeated feedback remains visible without turning this file into a transcript.

## Summary

- Reports dir: `blind-tester/reports`
- Accepted reports: 773
- Rejected or ignored markdown reports: 33
- Latest report stamp: 20260714T145549Z
- Recent entry limit: 100
- Archived accepted entries collapsed into traits: 673

## Recent Common Traits

| Count | Latest | Category | Trait | Sources |
| ---: | --- | --- | --- | --- |
| 47 | 20260713T055537Z | replay | player would not replay | overworld |
| 40 | 20260713T055537Z | bug S3 | Albany Station Quarter: notice board wording is confusing about where the quest actually starts | overworld |
| 40 | 20260713T055537Z | confusion | the notice board near Albany Station Quarter doesn't say where the quest actually starts | overworld |
| 40 | 20260713T055537Z | worst moment | Running into the Albany Station Quarter issue. | overworld |
| 27 | 20260713T055537Z | bug S2 | road to Colonie: road encounter text repeats itself on back-to-back trips | overworld |
| 18 | 20260713T055537Z | stuck | player got stuck | overworld |
| 18 | 20260713T055537Z | understanding | goal was not understood | overworld |
| 14 | 20260713T055537Z | worst moment | Nothing stood out as bad — tried hard to break it and it held up. | overworld |
| 14 | 20260713T055537Z | worst moment | Running into the road to Colonie issue. | overworld |
| 1 | 20260714T145549Z | bug S0 | Overworld town loop (Albany/Queensbury/Oneonta/Rome civic centers): Notice-hall/broker-contact/charter-backlog struct... | overworld |
| 1 | 20260714T145549Z | confusion | compact context schema (tuples/legend) needed careful parsing at first | overworld |
| 1 | 20260714T145549Z | confusion | no explicit warning before a supply deficit on a multi-leg goal passage | overworld |
| 1 | 20260714T145549Z | confusion | unclear that areas must be scouted before quests/jobs become visible | overworld |
| 1 | 20260714T145549Z | worst moment | Realizing partway through travel prep that I'd need to parse dense compact tuples by hand to know when a road passage... | overworld |
| 1 | 20260714T055100Z | bug S0 | Marta's Stall, Oswego Market Streets: go_east from the stall looped back to the same room instead of progressing towa... | overworld |
| 1 | 20260714T055100Z | bug S1 | across all six quests (Wolf-Winter through Cold Forge): identical structural chassis (notice-hall scout -> anchor NPC... | overworld |
| 1 | 20260714T055100Z | bug S1 | mid-session, after a scout_overworld_session_poi call: spurious 'previous response failed to produce a valid tool cal... | overworld |
| 1 | 20260714T055100Z | confusion | distinguishing goal-completion pause vs. fixed-decision checkpoint vs. story choice at first exposure | overworld |
| 1 | 20260714T055100Z | confusion | one go_east loop back to the same room instead of routing toward the hearing hall | overworld |
| 1 | 20260714T055100Z | worst moment | Failing the rhetoric check in The Advocate's Case by presenting evidence in the wrong order, temporarily stalling the... | overworld |
| 1 | 20260714T042417Z | bug S0 | Quest structure across Wolf-Winter / Gallowmere / Tanner's Fever: All three quests share an identical board→contact→t... | overworld |
| 1 | 20260714T042417Z | bug S1 | Store-Shed, The Wolf-Winter quest: Taking armor doesn't equip it; easy to enter combat under-protected without notici... | overworld |
| 1 | 20260714T042417Z | confusion | byre-jerkin required a separate wear step after pickup | overworld |
| 1 | 20260714T042417Z | confusion | dense compact-context tuple format has a learning curve | overworld |
| 1 | 20260714T042417Z | worst moment | Nearly walking into the wolf fight with an unequipped jerkin because taking it didn't automatically wear it. | overworld |

## Recent Entries

| Stamp | Source | Seed | Mode | Decisions | C/E | Stuck | Replay | Report | Signal |
| --- | --- | ---: | --- | ---: | --- | --- | --- | --- | --- |
| 20260714T145549Z | overworld | 13 | pure | 92 | 4/4 | no | yes | `blind-tester/reports/20260714T145549Z_overworld_seed13.md` | confusions: compact context schema (tuples/legend) needed careful parsing at first; unclear that areas must be scouted before quests/jobs become visible; no explicit w... |
| 20260714T055100Z | overworld | 12 | pure | 133 | 4/5 | no | yes | `blind-tester/reports/20260714T055100Z_overworld_seed12.md` | confusions: distinguishing goal-completion pause vs. fixed-decision checkpoint vs. story choice at first exposure; one go_east loop back to the same room instead of ro... |
| 20260714T042417Z | overworld | 10 | pure | 67 | 4/4 | no | yes | `blind-tester/reports/20260714T042417Z_overworld_seed10.md` | confusions: byre-jerkin required a separate wear step after pickup; dense compact-context tuple format has a learning curve \| bugs: S1 Store-Shed, The Wolf-Winter ques... |
| 20260714T032448Z | overworld | 8 | pure | 120 | 4/5 | no | yes | `blind-tester/reports/20260714T032448Z_overworld_seed8.md` | confusions: templated market-broker and notice-hall flavor text repeated near-verbatim across towns \| bugs: S1 market-broker NPCs and civic-center notice halls, every... |
| 20260714T025247Z | overworld | 7 | pure | 120 | 4/4 | no | yes | `blind-tester/reports/20260714T025247Z_overworld_seed7.md` | confusions: perfect scores felt achievable regardless of choice quality, reducing stakes; fatigue/supply thresholds and their real consequences were never made explici... |
| 20260714T021201Z | overworld | 7 | pure | 89 | 4/5 | no | yes | `blind-tester/reports/20260714T021201Z_overworld_seed7.md` | confusions: redundant-seeming explicit quest fold-back call after step_action already showed the completion data; unclear upfront whether NPC dialogue branches are all... |
| 20260713T055537Z | overworld | 6099 | structural | — | 2/3 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6099.md` | bugs: S2 road to Colonie: road encounter text repeats itself on back-to-back trips; S1 seed-6099 corner: minor wording nit unique to seed 6099 |
| 20260713T055537Z | overworld | 6098 | structural | — | 4/3 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6098.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6097 | structural | — | 3/2 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6097.md` | worst: Nothing stood out as bad — tried hard to break it and it held up. |
| 20260713T055537Z | overworld | 6096 | structural | — | 2/2 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6096.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6095 | structural | — | 4/4 | yes | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6095.md` | bugs: S1 seed-6095 corner: minor wording nit unique to seed 6095 \| got stuck \| goal unclear |
| 20260713T055537Z | overworld | 6094 | structural | — | 3/4 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6094.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6093 | structural | — | 2/3 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6093.md` | bugs: S2 road to Colonie: road encounter text repeats itself on back-to-back trips; S1 seed-6093 corner: minor wording nit unique to seed 6093 |
| 20260713T055537Z | overworld | 6092 | structural | — | 4/3 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6092.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6091 | structural | — | 3/2 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6091.md` | bugs: S1 seed-6091 corner: minor wording nit unique to seed 6091 |
| 20260713T055537Z | overworld | 6090 | structural | — | 2/2 | yes | no | `blind-tester/reports/20260713T055537Z_overworld_seed6090.md` | got stuck \| goal unclear \| would not replay |
| 20260713T055537Z | overworld | 6089 | structural | — | 4/4 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6089.md` | bugs: S1 seed-6089 corner: minor wording nit unique to seed 6089 |
| 20260713T055537Z | overworld | 6088 | structural | — | 3/4 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6088.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6087 | structural | — | 2/3 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6087.md` | bugs: S2 road to Colonie: road encounter text repeats itself on back-to-back trips; S1 seed-6087 corner: minor wording nit unique to seed 6087 |
| 20260713T055537Z | overworld | 6086 | structural | — | 4/3 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6086.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6085 | structural | — | 3/2 | yes | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6085.md` | bugs: S1 seed-6085 corner: minor wording nit unique to seed 6085 \| got stuck \| goal unclear |
| 20260713T055537Z | overworld | 6084 | structural | — | 2/2 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6084.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6083 | structural | — | 4/4 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6083.md` | worst: Nothing stood out as bad — tried hard to break it and it held up. |
| 20260713T055537Z | overworld | 6082 | structural | — | 3/4 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6082.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6081 | structural | — | 2/3 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6081.md` | bugs: S2 road to Colonie: road encounter text repeats itself on back-to-back trips; S1 seed-6081 corner: minor wording nit unique to seed 6081 |
| 20260713T055537Z | overworld | 6080 | structural | — | 4/3 | yes | no | `blind-tester/reports/20260713T055537Z_overworld_seed6080.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6079 | structural | — | 3/2 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6079.md` | bugs: S1 seed-6079 corner: minor wording nit unique to seed 6079 |
| 20260713T055537Z | overworld | 6078 | structural | — | 2/2 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6078.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6077 | structural | — | 4/4 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6077.md` | bugs: S1 seed-6077 corner: minor wording nit unique to seed 6077 |
| 20260713T055537Z | overworld | 6076 | structural | — | 3/4 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6076.md` | would not replay |
| 20260713T055537Z | overworld | 6075 | structural | — | 2/3 | yes | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6075.md` | bugs: S2 road to Colonie: road encounter text repeats itself on back-to-back trips; S1 seed-6075 corner: minor wording nit unique to seed 6075 \| got stuck \| goal unclear |
| 20260713T055537Z | overworld | 6074 | structural | — | 4/3 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6074.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6073 | structural | — | 3/2 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6073.md` | bugs: S1 seed-6073 corner: minor wording nit unique to seed 6073 |
| 20260713T055537Z | overworld | 6072 | structural | — | 2/2 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6072.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6071 | structural | — | 4/4 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6071.md` | bugs: S1 seed-6071 corner: minor wording nit unique to seed 6071 |
| 20260713T055537Z | overworld | 6070 | structural | — | 3/4 | yes | no | `blind-tester/reports/20260713T055537Z_overworld_seed6070.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6069 | structural | — | 2/3 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6069.md` | worst: Nothing stood out as bad — tried hard to break it and it held up. |
| 20260713T055537Z | overworld | 6068 | structural | — | 4/3 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6068.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6067 | structural | — | 3/2 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6067.md` | bugs: S1 seed-6067 corner: minor wording nit unique to seed 6067 |
| 20260713T055537Z | overworld | 6066 | structural | — | 2/2 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6066.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6065 | structural | — | 4/4 | yes | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6065.md` | bugs: S1 seed-6065 corner: minor wording nit unique to seed 6065 \| got stuck \| goal unclear |
| 20260713T055537Z | overworld | 6064 | structural | — | 3/4 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6064.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6063 | structural | — | 2/3 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6063.md` | bugs: S2 road to Colonie: road encounter text repeats itself on back-to-back trips; S1 seed-6063 corner: minor wording nit unique to seed 6063 |
| 20260713T055537Z | overworld | 6062 | structural | — | 4/3 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6062.md` | would not replay |
| 20260713T055537Z | overworld | 6061 | structural | — | 3/2 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6061.md` | bugs: S1 seed-6061 corner: minor wording nit unique to seed 6061 |
| 20260713T055537Z | overworld | 6060 | structural | — | 2/2 | yes | no | `blind-tester/reports/20260713T055537Z_overworld_seed6060.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6059 | structural | — | 4/4 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6059.md` | bugs: S1 seed-6059 corner: minor wording nit unique to seed 6059 |
| 20260713T055537Z | overworld | 6058 | structural | — | 3/4 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6058.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6057 | structural | — | 2/3 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6057.md` | bugs: S2 road to Colonie: road encounter text repeats itself on back-to-back trips; S1 seed-6057 corner: minor wording nit unique to seed 6057 |
| 20260713T055537Z | overworld | 6056 | structural | — | 4/3 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6056.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6055 | structural | — | 3/2 | yes | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6055.md` | got stuck \| goal unclear |
| 20260713T055537Z | overworld | 6054 | structural | — | 2/2 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6054.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6053 | structural | — | 4/4 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6053.md` | bugs: S1 seed-6053 corner: minor wording nit unique to seed 6053 |
| 20260713T055537Z | overworld | 6052 | structural | — | 3/4 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6052.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6051 | structural | — | 2/3 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6051.md` | bugs: S2 road to Colonie: road encounter text repeats itself on back-to-back trips; S1 seed-6051 corner: minor wording nit unique to seed 6051 |
| 20260713T055537Z | overworld | 6050 | structural | — | 4/3 | yes | no | `blind-tester/reports/20260713T055537Z_overworld_seed6050.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6049 | structural | — | 3/2 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6049.md` | bugs: S1 seed-6049 corner: minor wording nit unique to seed 6049 |
| 20260713T055537Z | overworld | 6048 | structural | — | 2/2 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6048.md` | would not replay |
| 20260713T055537Z | overworld | 6047 | structural | — | 4/4 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6047.md` | bugs: S1 seed-6047 corner: minor wording nit unique to seed 6047 |
| 20260713T055537Z | overworld | 6046 | structural | — | 3/4 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6046.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6045 | structural | — | 2/3 | yes | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6045.md` | bugs: S2 road to Colonie: road encounter text repeats itself on back-to-back trips; S1 seed-6045 corner: minor wording nit unique to seed 6045 \| got stuck \| goal unclear |
| 20260713T055537Z | overworld | 6044 | structural | — | 4/3 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6044.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6043 | structural | — | 3/2 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6043.md` | bugs: S1 seed-6043 corner: minor wording nit unique to seed 6043 |
| 20260713T055537Z | overworld | 6042 | structural | — | 2/2 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6042.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6041 | structural | — | 4/4 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6041.md` | worst: Nothing stood out as bad — tried hard to break it and it held up. |
| 20260713T055537Z | overworld | 6040 | structural | — | 3/4 | yes | no | `blind-tester/reports/20260713T055537Z_overworld_seed6040.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6039 | structural | — | 2/3 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6039.md` | bugs: S2 road to Colonie: road encounter text repeats itself on back-to-back trips; S1 seed-6039 corner: minor wording nit unique to seed 6039 |
| 20260713T055537Z | overworld | 6038 | structural | — | 4/3 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6038.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6037 | structural | — | 3/2 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6037.md` | bugs: S1 seed-6037 corner: minor wording nit unique to seed 6037 |
| 20260713T055537Z | overworld | 6036 | structural | — | 2/2 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6036.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6035 | structural | — | 4/4 | yes | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6035.md` | bugs: S1 seed-6035 corner: minor wording nit unique to seed 6035 \| got stuck \| goal unclear |
| 20260713T055537Z | overworld | 6034 | structural | — | 3/4 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6034.md` | would not replay |
| 20260713T055537Z | overworld | 6033 | structural | — | 2/3 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6033.md` | bugs: S2 road to Colonie: road encounter text repeats itself on back-to-back trips; S1 seed-6033 corner: minor wording nit unique to seed 6033 |
| 20260713T055537Z | overworld | 6032 | structural | — | 4/3 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6032.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6031 | structural | — | 3/2 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6031.md` | bugs: S1 seed-6031 corner: minor wording nit unique to seed 6031 |
| 20260713T055537Z | overworld | 6030 | structural | — | 2/2 | yes | no | `blind-tester/reports/20260713T055537Z_overworld_seed6030.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6029 | structural | — | 4/4 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6029.md` | bugs: S1 seed-6029 corner: minor wording nit unique to seed 6029 |
| 20260713T055537Z | overworld | 6028 | structural | — | 3/4 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6028.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6027 | structural | — | 2/3 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6027.md` | worst: Nothing stood out as bad — tried hard to break it and it held up. |
| 20260713T055537Z | overworld | 6026 | structural | — | 4/3 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6026.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6025 | structural | — | 3/2 | yes | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6025.md` | bugs: S1 seed-6025 corner: minor wording nit unique to seed 6025 \| got stuck \| goal unclear |
| 20260713T055537Z | overworld | 6024 | structural | — | 2/2 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6024.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6023 | structural | — | 4/4 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6023.md` | bugs: S1 seed-6023 corner: minor wording nit unique to seed 6023 |
| 20260713T055537Z | overworld | 6022 | structural | — | 3/4 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6022.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6021 | structural | — | 2/3 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6021.md` | bugs: S2 road to Colonie: road encounter text repeats itself on back-to-back trips; S1 seed-6021 corner: minor wording nit unique to seed 6021 |
| 20260713T055537Z | overworld | 6020 | structural | — | 4/3 | yes | no | `blind-tester/reports/20260713T055537Z_overworld_seed6020.md` | got stuck \| goal unclear \| would not replay |
| 20260713T055537Z | overworld | 6019 | structural | — | 3/2 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6019.md` | bugs: S1 seed-6019 corner: minor wording nit unique to seed 6019 |
| 20260713T055537Z | overworld | 6018 | structural | — | 2/2 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6018.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6017 | structural | — | 4/4 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6017.md` | bugs: S1 seed-6017 corner: minor wording nit unique to seed 6017 |
| 20260713T055537Z | overworld | 6016 | structural | — | 3/4 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6016.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6015 | structural | — | 2/3 | yes | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6015.md` | bugs: S2 road to Colonie: road encounter text repeats itself on back-to-back trips; S1 seed-6015 corner: minor wording nit unique to seed 6015 \| got stuck \| goal unclear |
| 20260713T055537Z | overworld | 6014 | structural | — | 4/3 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6014.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6013 | structural | — | 3/2 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6013.md` | worst: Nothing stood out as bad — tried hard to break it and it held up. |
| 20260713T055537Z | overworld | 6012 | structural | — | 2/2 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6012.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6011 | structural | — | 4/4 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6011.md` | bugs: S1 seed-6011 corner: minor wording nit unique to seed 6011 |
| 20260713T055537Z | overworld | 6010 | structural | — | 3/4 | yes | no | `blind-tester/reports/20260713T055537Z_overworld_seed6010.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6009 | structural | — | 2/3 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6009.md` | bugs: S2 road to Colonie: road encounter text repeats itself on back-to-back trips; S1 seed-6009 corner: minor wording nit unique to seed 6009 |
| 20260713T055537Z | overworld | 6008 | structural | — | 4/3 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6008.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260713T055537Z | overworld | 6007 | structural | — | 3/2 | no | yes | `blind-tester/reports/20260713T055537Z_overworld_seed6007.md` | bugs: S1 seed-6007 corner: minor wording nit unique to seed 6007 |
| 20260713T055537Z | overworld | 6006 | structural | — | 2/2 | no | no | `blind-tester/reports/20260713T055537Z_overworld_seed6006.md` | would not replay |

## Archived Trait Categories

| Count | Latest | Category | Trait | Sources |
| ---: | --- | --- | --- | --- |
| 273 | 20260713T055537Z | replay | player would not replay | overworld, tide_mill, wolf_winter |
| 89 | 20260713T055537Z | bug S3 | Albany Station Quarter: notice board wording is confusing about where the quest actually starts | overworld |
| 89 | 20260713T055537Z | confusion | the notice board near Albany Station Quarter doesn't say where the quest actually starts | overworld |
| 89 | 20260713T055537Z | worst moment | Running into the Albany Station Quarter issue. | overworld |
| 59 | 20260713T055537Z | bug S2 | road to Colonie: road encounter text repeats itself on back-to-back trips | overworld |
| 45 | 20260713T055537Z | stuck | player got stuck | overworld |
| 42 | 20260713T055537Z | understanding | goal was not understood | overworld |
| 30 | 20260713T055537Z | worst moment | Running into the road to Colonie issue. | overworld |
| 29 | 20260712T230645Z | worst moment | Nothing stood out as bad — tried hard to break it and it held up. | overworld |
| 17 | 20260708T190729Z | confusion | completed quest still listed | overworld |
| 17 | 20260708T173453Z | confusion | road encounter appears after arrival | overworld |
| 7 | 20260708T211319Z | confusion | hidden counts are abstract | overworld |
| 7 | 20260708T183742Z | confusion | dialogue action ids look generated | overworld |
| 7 | 20260708T172828Z | confusion | road encounter resolves after arrival | overworld |
| 6 | 20260708T190118Z | confusion | awkward dialogue action ids | overworld |
| 5 | 20260708T213027Z | confusion | hidden counts feel gamey | overworld |
| 5 | 20260708T190728Z | confusion | dialogue action ids are awkward | overworld |
| 4 | 20260708T203156Z | confusion | hidden counts are useful but abstract | overworld |
| 4 | 20260708T190728Z | bug S0 | The Wolf-Winter / compact journal: Truncated journal entries show hash-like suffixes. | overworld |
| 4 | 20260708T183740Z | confusion | quest tone disconnected from Albany lead | overworld |
| 4 | 20260708T153614Z | confusion | quest takes no overworld time | overworld |
| 4 | 20260708T140614Z | confusion | saboteur falls but later is driven off | tide_mill |
| 4 | 20260708T140200Z | bug S0 | Head-Race: choked_sluice remains visible after the race is cleared | tide_mill |
| 3 | 20260710T161600Z | confusion | compact journal hash fragments | overworld |
| 3 | 20260708T213027Z | confusion | compact tuples require legend memory | overworld |
