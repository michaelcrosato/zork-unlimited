# Blind Feedback Ledger

Generated deterministically from verified blind reports. The latest entries stay explicit; older entries are collapsed into trait counts so repeated feedback remains visible without turning this file into a transcript.

## Summary

- Reports dir: `blind-tester/reports`
- Accepted reports: 823
- Rejected or ignored markdown reports: 59
- Latest report stamp: 20260719T074743Z
- Recent entry limit: 100
- Archived accepted entries collapsed into traits: 723

## Recent Common Traits

| Count | Latest | Category | Trait | Sources |
| ---: | --- | --- | --- | --- |
| 23 | 20260716T101651Z | replay | player would not replay | overworld |
| 20 | 20260716T101651Z | bug S3 | Albany Station Quarter: notice board wording is confusing about where the quest actually starts | overworld |
| 20 | 20260716T101651Z | confusion | the notice board near Albany Station Quarter doesn't say where the quest actually starts | overworld |
| 20 | 20260716T101651Z | worst moment | Running into the Albany Station Quarter issue. | overworld |
| 14 | 20260716T101651Z | bug S2 | road to Colonie: road encounter text repeats itself on back-to-back trips | overworld |
| 8 | 20260716T101651Z | worst moment | Running into the road to Colonie issue. | overworld |
| 8 | 20260713T055537Z | stuck | player got stuck | overworld |
| 8 | 20260713T055537Z | understanding | goal was not understood | overworld |
| 6 | 20260713T055537Z | worst moment | Nothing stood out as bad — tried hard to break it and it held up. | overworld |
| 1 | 20260719T074743Z | confusion | Forced checkpoint choice while mid-lead can truncate momentum | codex_spark |
| 1 | 20260719T074743Z | confusion | Goal context shifted from completed local lead to travel goal and then to authored lead while the active quest remain... | codex_spark |
| 1 | 20260719T074743Z | worst moment | I had to abort one malformed call and restart, and the goal-switch from Wolf-Winter into Queensbury travel added a ha... | codex_spark |
| 1 | 20260719T073236Z | bug S1 | Overworld journey flow (post-goal completion at decision 44): Progress is valid and recoverable, but forced continue/... | codex_spark |
| 1 | 20260719T073236Z | confusion | Journey-level choice prompts can break apparent scene continuity | codex_spark |
| 1 | 20260719T073236Z | confusion | Multiple goal layers are easy to confuse if you only read local text | codex_spark |
| 1 | 20260719T073236Z | worst moment | The cadence of checkpoint/choice interruptions during otherwise continuous quest flow felt slightly intrusive. | codex_spark |
| 1 | 20260719T073028Z | bug S2 | wolf_winter quest action discovery (`list_legal_actions`): `list_legal_actions` did not surface usable in-room action... | codex_spark |
| 1 | 20260719T073028Z | confusion | Some quest-step phrasing about threshold/facility options is dense but comprehensible once the room text updates. | codex_spark |
| 1 | 20260719T073028Z | worst moment | The initial action-menu mismatch in quest action discovery created unnecessary uncertainty about which action-set too... | codex_spark |
| 1 | 20260719T072828Z | bug S1 | Albany Relief Compact registration: Long mechanical consequence text makes first-time role and duty choices harder to... | codex_terra_attestation |
| 1 | 20260719T072828Z | bug S1 | Overworld contact and embedded-quest player tools: Contact and child-session parameter names are inconsistent with th... | codex_terra_attestation |
| 1 | 20260719T072828Z | bug S2 | The Shepherd's Bothy and transition to the Moor Gully: Two successful quest actions returned blank responses while ch... | codex_terra_attestation |
| 1 | 20260719T072828Z | confusion | Dense campaign decision cards | codex_terra_attestation |
| 1 | 20260719T072828Z | confusion | Inconsistent player-tool parameter naming | codex_terra_attestation |
| 1 | 20260719T072828Z | confusion | Optional dispatch details were easy to miss | codex_terra_attestation |

## Recent Entries

| Stamp | Source | Seed | Mode | Decisions | C/E | Stuck | Replay | Report | Signal |
| --- | --- | ---: | --- | ---: | --- | --- | --- | --- | --- |
| 20260719T074743Z | codex_spark | 2970 | pure | 40 | 4/4 | no | yes | `blind-tester/reports/20260719T074743Z_codex_spark_seed2970.md` | confusions: Goal context shifted from completed local lead to travel goal and then to authored lead while the active quest remained in-session; Forced checkpoint choic... |
| 20260719T073236Z | codex_spark | 2965 | pure | 44 | 4/4 | no | yes | `blind-tester/reports/20260719T073236Z_codex_spark_seed2965.md` | confusions: Journey-level choice prompts can break apparent scene continuity; Multiple goal layers are easy to confuse if you only read local text \| bugs: S1 Overworld... |
| 20260719T073028Z | codex_spark | 2963 | pure | 23 | 4/4 | no | yes | `blind-tester/reports/20260719T073028Z_codex_spark_seed2963.md` | confusions: Some quest-step phrasing about threshold/facility options is dense but comprehensible once the room text updates. \| bugs: S2 wolf_winter quest action disco... |
| 20260719T072828Z | codex_terra_attestation | 4096 | pure | 44 | 4/4 | no | yes | `blind-tester/reports/20260719T072828Z_codex_terra_attestation_seed4096.md` | confusions: Dense campaign decision cards; Optional dispatch details were easy to miss; Inconsistent player-tool parameter naming; Successful actions sometimes returne... |
| 20260719T072134Z | codex_spark | 2956 | pure | 23 | 4/4 | no | yes | `blind-tester/reports/20260719T072134Z_codex_spark_seed2956.md` | confusions: Story-choice chain is lengthy before quest play starts; One big checkpoint appears right after quest completion before leaving the journey |
| 20260719T070755Z | codex_spark | 2950 | pure | 22 | 4/4 | no | yes | `blind-tester/reports/20260719T070755Z_codex_spark_seed2950.md` | confusions: The game enforced the Wolf-Winter registration chain (role → duty → evidence → preparation → relief allocation) before any quest actions, which is clear in... |
| 20260719T061252Z | codex_spark | 2929 | pure | 27 | 4/4 | no | yes | `blind-tester/reports/20260719T061252Z_codex_spark_seed2929.md` | confusions: The first failed quest attempt was blocked by missing prerequisites, which is clear once you see the message but requires carefully following each prerequi... |
| 20260719T060904Z | codex_spark | 2925 | pure | 46 | 4/4 | no | yes | `blind-tester/reports/20260719T060904Z_codex_spark_seed2925.md` | confusions: Objective text can stay generic while local combat-entry prerequisites gate progress, so first-time players may need to notice environment blockers. |
| 20260719T054801Z | codex_spark | 2910 | pure | 22 | 4/4 | no | yes | `blind-tester/reports/20260719T054801Z_codex_spark_seed2910.md` | confusions: The multi-step registration and relief allocation sequence is clear but lengthy before field action starts.; After goal pursuit, it was not always obvious... |
| 20260719T054801Z | codex_spark | 2909 | pure | 24 | 4/4 | no | yes | `blind-tester/reports/20260719T054801Z_codex_spark_seed2909.md` | confusions: I had to infer when the embedded quest became startable from context updates and quest_starts timing rather than a dedicated quest menu.; The campaign-styl... |
| 20260719T051324Z | codex_spark | 2898 | pure | 46 | 4/4 | no | yes | `blind-tester/reports/20260719T051324Z_codex_spark_seed2898.md` | confusions: Goal labels in campaign text can lag behind immediate quest scene context, so scene-level clues are needed to know exactly what to do next. |
| 20260719T051324Z | codex_spark | 2895 | pure | 22 | 4/4 | no | yes | `blind-tester/reports/20260719T051324Z_codex_spark_seed2895.md` | worst: The story registration sequence was longer than expected before the main quest could start. |
| 20260719T050913Z | codex_spark | 2891 | pure | 43 | 4/4 | no | yes | `blind-tester/reports/20260719T050913Z_codex_spark_seed2891.md` | confusions: At the Shepherd's Bothy, the first impulse to go north was blocked until I backed out to the moor edge, which is easy to misread as a temporary UI issue.;... |
| 20260719T035317Z | codex_spark | 2890 | pure | 46 | 4/4 | no | yes | `blind-tester/reports/20260719T035317Z_codex_spark_seed2890.md` | confusions: The fixed decision checkpoint at 40 interrupted the second quest mid-flow, but it was clear and non-blocking. |
| 20260719T022002Z | codex | 2882 | pure | 53 | 4/4 | no | yes | `blind-tester/reports/20260719T022002Z_codex_seed2882.md` | confusions: Dense five-stage relief setup before the first quest; Compact prose exposed +N chars truncation markers; Sheltered-route alarm preview did not visibly inco... |
| 20260719T022001Z | codex | 2881 | pure | 54 | 3/4 | no | yes | `blind-tester/reports/20260719T022001Z_codex_seed2881.md` | confusions: Area-route ID versus destination-area ID; Child session field naming contradicted the action endpoint; Broken-paling text implied a nonlethal rail recovery... |
| 20260719T022000Z | codex | 2880 | pure | 56 | 4/4 | no | yes | `blind-tester/reports/20260719T022000Z_codex_seed2880.md` | confusions: Dense five-stage mission registration; Contradictory spear instruction on the lure route; Crawlboard access did not match the selected evidence; Important... |
| 20260717T044605Z | gpt-5-3-codex-spark | 2850 | pure | 58 | 4/4 | no | yes | `blind-tester/reports/20260717T044605Z_gpt-5-3-codex-spark_seed2850.md` | confusions: Initial puzzle in the moor hunt (kill-site wind/angle reads) is learnable but not immediately explicit until NPC clues are consumed. |
| 20260717T033956Z | gpt-5-3-codex-spark | 2825 | pure | 30 | 4/4 | no | yes | `blind-tester/reports/20260717T033956Z_gpt-5-3-codex-spark_seed2825.md` | confusions: Pre-quest setup choices are dense and can feel like a long information gate; The one-way feed sequence requires strict ordering and can be hard to internal... |
| 20260716T181847Z | overworld | 2813 | pure | 76 | 4/4 | no | yes | `blind-tester/reports/20260716T181847Z_overworld_seed2813.md` | confusions: Long multi-step registration flow before first real quest action; Parallel tool calls silently invalidated by snapshot-hash staleness with no explanation;... |
| 20260716T162128Z | overworld | 2812 | pure | 80 | 4/5 | no | yes | `blind-tester/reports/20260716T162128Z_overworld_seed2812.md` | confusions: unclear how overworld registration choices map to in-quest mechanics until inside the quest; alternate strategy options vanishing after committing to an ap... |
| 20260716T160929Z | overworld | 2811 | pure | 74 | 4/5 | no | yes | `blind-tester/reports/20260716T160929Z_overworld_seed2811.md` | confusions: list_legal_actions rejected the overworld session id with no explanation that it's quest-only; dense five-card registration sequence before any actual play... |
| 20260716T155813Z | overworld | 2810 | pure | 80 | 4/4 | no | yes | `blind-tester/reports/20260716T155813Z_overworld_seed2810.md` | confusions: dense five-card registration chain at game start; apothecary storyroom backtracking through sickroom to reach herb store \| bugs: S1 Albany Civic Center, Re... |
| 20260716T151445Z | overworld | 2809 | pure | 76 | 4/4 | no | yes | `blind-tester/reports/20260716T151445Z_overworld_seed2809.md` | confusions: Five linked binding story choices before seeing any actual quest content; Concurrent tool calls raced on snapshot_hash and caused a spurious rejection \| bu... |
| 20260716T151445Z | overworld | 2808 | pure | 40 | 4/5 | no | yes | `blind-tester/reports/20260716T151445Z_overworld_seed2808.md` | confusions: Compact context field naming requires reading legend; Quest approach selection UI unclear for Gallowmere; Embedded quest mid-exit save behavior unclear |
| 20260716T151445Z | overworld | 2807 | pure | 38 | 4/4 | no | yes | `blind-tester/reports/20260716T151445Z_overworld_seed2807.md` | confusions: Loft access remained blocked after bracing breach; required kill to unlock; Drover route failure message unclear about tactical vs. lucky failure |
| 20260716T151445Z | overworld | 2806 | pure | 35 | 4/4 | no | yes | `blind-tester/reports/20260716T151445Z_overworld_seed2806.md` | confusions: Lead discovery opacity: multiple potential leads in Albany with unclear priority; Relief allocation choice trade-offs were complex to evaluate without mech... |
| 20260716T151445Z | overworld | 2805 | pure | 40 | 4/5 | no | yes | `blind-tester/reports/20260716T151445Z_overworld_seed2805.md` | confusions: Score mechanic purpose (reached 55/60 but didn't know what triggered final completion); Hidden element counts unclear (didn't know if I'd found all explora... |
| 20260716T151445Z | overworld | 2803 | pure | 40 | 4/4 | no | yes | `blind-tester/reports/20260716T151445Z_overworld_seed2803.md` | confusions: Quest had many preparatory choices (registration, oath, source, prep, relief) — felt like I might miss something; Tired condition effects on actions not fu... |
| 20260716T151445Z | overworld | 2802 | pure | 46 | 4/4 | no | yes | `blind-tester/reports/20260716T151445Z_overworld_seed2802.md` | confusions: Relief seal mechanics (outer vs. threshold) were learned through play rather than explicit upfront explanation; Quest skill requirements didn't always matc... |
| 20260716T134849Z | overworld | 2737 | pure | 80 | 4/4 | no | yes | `blind-tester/reports/20260716T134849Z_overworld_seed2737.md` | confusions: Front-loaded chain of five story choices before first real gameplay; Unclear whether some dialogue 'ask' options were reversible or committing \| bugs: S1 O... |
| 20260716T133238Z | overworld | 2736 | pure | 125 | 5/5 | no | yes | `blind-tester/reports/20260716T133238Z_overworld_seed2736.md` | confusions: front-loaded 4-choice registration cluster before first exploration; on-route 'here' field during travel briefly reads like a town but is documented |
| 20260716T101651Z | overworld | 92734 | structural | — | 3/4 | no | no | `blind-tester/reports/20260716T101651Z_overworld_seed92734.md` | confusions: the notice board near Albany Station Quarter doesn't say where the quest actually starts \| bugs: S3 Albany Station Quarter: notice board wording is confusi... |
| 20260716T101651Z | overworld | 92733 | structural | — | 2/3 | no | yes | `blind-tester/reports/20260716T101651Z_overworld_seed92733.md` | bugs: S2 road to Colonie: road encounter text repeats itself on back-to-back trips; S1 seed-92733 corner: minor wording nit unique to seed 92733 |
| 20260716T084609Z | overworld | 2732 | pure | 40 | 4/4 | no | yes | `blind-tester/reports/20260716T084609Z_overworld_seed2732.md` | confusions: Compact context tuples dense on first read—legend required constant reference; Quest approach mechanical consequences (DC shift, field chains) not immediat... |
| 20260716T054041Z | overworld | 2731 | pure | 40 | 5/5 | no | yes | `blind-tester/reports/20260716T054041Z_overworld_seed2731.md` | worst: None; the pacing was consistent and nothing felt tedious or frustrating. |
| 20260716T023758Z | overworld | 2721 | pure | 80 | 4/5 | no | yes | `blind-tester/reports/20260716T023758Z_overworld_seed2721.md` | confusions: five story-choices fired from one NPC conversation before quest context was established; recurring NPC names across unrelated regions with no in-fiction ac... |
| 20260716T015059Z | overworld | 2720 | pure | 96 | 4/4 | no | yes | `blind-tester/reports/20260716T015059Z_overworld_seed2720.md` | confusions: pre-committing mechanical consequences to an undiscovered quest via a 5-step story-choice chain; recurring identical NPC names (Rowan Quill, Hayden Hale, R... |
| 20260716T011237Z | overworld | 2719 | pure | 88 | 4/5 | no | yes | `blind-tester/reports/20260716T011237Z_overworld_seed2719.md` | confusions: ask_fortify dialogue chain silently became an irreversible strategy commitment rather than an info query; dense compact-context tuple encoding required con... |
| 20260715T215710Z | overworld | 2717 | pure | 122 | 4/5 | no | yes | `blind-tester/reports/20260715T215710Z_overworld_seed2717.md` | confusions: anachronistic Royal Warrant/Crown legal framing in an otherwise contemporary setting; recurring NPC names reused across unrelated towns/roles; duplicate 'n... |
| 20260715T175157Z | overworld | 2716 | pure | 80 | 4/4 | no | yes | `blind-tester/reports/20260715T175157Z_overworld_seed2716.md` | confusions: Opening registration dumps three dense multi-option build choices before real play begins; Road-encounter option templates repeat nearly verbatim across ev... |
| 20260715T152441Z | overworld | 2715 | pure | 97 | 5/5 | no | yes | `blind-tester/reports/20260715T152441Z_overworld_seed2715.md` | confusions: Not immediately clear that dialogue-tree 'ask about strategy' options were reversible previews vs. commitments until testing the _back option \| bugs: S0 No... |
| 20260715T062512Z | overworld | 2713 | pure | 114 | 5/5 | no | yes | `blind-tester/reports/20260715T062512Z_overworld_seed2713.md` | confusions: hub-and-spoke room layouts where two different compass directions both lead back to the same central room |
| 20260715T011232Z | overworld | 2712 | pure | 69 | 4/4 | no | yes | `blind-tester/reports/20260715T011232Z_overworld_seed2712.md` | confusions: dense upfront story-choice text before first real action; recurring identical NPC names across distant towns; goal-passage resource preview reads scarier t... |
| 20260714T235614Z | overworld | 2711 | pure | 118 | 4/4 | no | yes | `blind-tester/reports/20260714T235614Z_overworld_seed2711.md` | confusions: dense bracket-tuple compact schema before first action; recurring NPC names/roles across unrelated towns \| bugs: S1 Civic Center / Market Streets discovery... |
| 20260714T215247Z | overworld | 2708 | pure | 89 | 4/5 | no | yes | `blind-tester/reports/20260714T215247Z_overworld_seed2708.md` | confusions: dense unlabeled compact character array; recurring NPC names across distant towns; notice-hall-scouting-unlocks-quests pattern not signposted up front \| bu... |
| 20260714T201954Z | overworld | 2706 | pure | 94 | 4/5 | no | yes | `blind-tester/reports/20260714T201954Z_overworld_seed2706.md` | confusions: Registration/source-packet jargon front-loaded before any payoff is visible; Recurring generic NPC names across towns momentarily read as the same individu... |
| 20260714T183530Z | overworld | 2705 | pure | 96 | 4/4 | no | yes | `blind-tester/reports/20260714T183530Z_overworld_seed2705.md` | confusions: dense compact-context legend (not player-facing); unclear which prep items were mandatory vs flavor until blocked; road-encounter risk labels lacked visibl... |
| 20260714T180613Z | overworld | 2704 | pure | 117 | 5/5 | no | yes | `blind-tester/reports/20260714T180613Z_overworld_seed2704.md` | confusions: list_legal_actions rejects a valid overworld session_id with no signal it's embedded-quest-only; quest discovery pattern (scout POI → find quest) becomes p... |
| 20260714T174549Z | overworld | 2703 | pure | 91 | 4/5 | no | yes | `blind-tester/reports/20260714T174549Z_overworld_seed2703.md` | confusions: reused NPC names across different towns; Tanner's Fever score capped at 40/50 with no clue why \| bugs: S1 Albany/Queensbury/Oneonta civic centers: Same-nam... |
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

## Archived Trait Categories

| Count | Latest | Category | Trait | Sources |
| ---: | --- | --- | --- | --- |
| 298 | 20260713T055537Z | replay | player would not replay | overworld, tide_mill, wolf_winter |
| 110 | 20260713T055537Z | bug S3 | Albany Station Quarter: notice board wording is confusing about where the quest actually starts | overworld |
| 110 | 20260713T055537Z | confusion | the notice board near Albany Station Quarter doesn't say where the quest actually starts | overworld |
| 110 | 20260713T055537Z | worst moment | Running into the Albany Station Quarter issue. | overworld |
| 73 | 20260713T055537Z | bug S2 | road to Colonie: road encounter text repeats itself on back-to-back trips | overworld |
| 55 | 20260713T055537Z | stuck | player got stuck | overworld |
| 52 | 20260713T055537Z | understanding | goal was not understood | overworld |
| 37 | 20260713T055537Z | worst moment | Nothing stood out as bad — tried hard to break it and it held up. | overworld |
| 37 | 20260713T055537Z | worst moment | Running into the road to Colonie issue. | overworld |
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
