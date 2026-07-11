# AI Loop State

<!-- historical_cycle_count: 528 -->

This live file is intentionally token-small. Detailed cycle prose before the
token-efficiency cleanup (14621c7a) was removed from the working tree; rotation
moves aged entries into the local, gitignored AI_LOOP_STATE_ARCHIVE.md, and Git
history of this file is the source of truth for older detail.

Entry contract (machine-parsed by src/afk/loop_state.ts and src/afk/assessor.ts):

- PREPEND each new entry directly below this intro — the log is NEWEST-FIRST.
- Keep the exact heading form "### Cycle result - slug" (rotation and cycle counting match it at line start).
- Name the world quest(s) blind-played in the entry body — the blind-pass rotation derives attendance from those names.
- The historical_cycle_count marker above is maintained by the rotation and feeds the generated-eval seed window; never hand-edit or remove it.
- Keep entries terse (≤8 lines): the surface changed, the measured effect, the self-critique verdict, and the guard. The invariant gates (agent-cleaner pre-gates where the operator machine has them, the full `npm run health` bar) are assumed on every cycle — record deltas and exceptions, not the standard VERIFY litany.

### Cycle result - wolf_winter_enemy_maneuvers

- Engine/content surface: added reusable one-shot enemy maneuvers—seeded combat rounds with conditioned temporary attack/defense tradeoffs—and rebuilt `wolf_winter` around three telegraphed openings, a real Albany relief spear, and a consequential one-attempt breach wedge.
- Loop effect: engine/MCP/CLI/UI/save validation plus `bug_0497` regressions pin unique action ids, exclusive result ownership, encounter-aware combat bounds, monotonic retirement, temporary math, fallback attacks, exhaustive liveness, reactive aftermath, and the exact 28-damage guarantee; compact assessment now always names the blind-rotation target.
- Blind-playtest quest "advocates_case": seed 930001, clarity 4/5, enjoyment 4/5, ending `ending_exempted`, 50/50 with no mechanical failure. The explicit user depth mandate and repeated `wolf_winter` S2 combat feedback justified choosing this off-list tranche.
- Fleet harvest: 200/200 fresh `gpt-5.5` reports verified (100 overworld + 100 direct `wolf_winter`, 20/persona/target), 0 stuck, all Byre Held; direct clarity/enjoyment 4.34/3.84, 96x60/60, and all 100 named tactical preparation as the best moment.
- Self-critique: PASS_WITH_NOTES; direct reports still found rail unfairness 28/100, prescribed/linear play 18/100, and basic cleanup 7/100. `docs/CURRENT_PLAN.md` chooses a recoverable, multi-route Broken-Paling follow-through; replay 0/100 is only directional because the prompt prefilled false.
- Guard: final 6,000-step crawl, 1,962-test `health`, base `3b8afec4` integrity, production UI build/HTTP smoke, verified rotation report, both 100/100 fleet summaries, 200-accepted ledger, and 200-report feedback compile green; embedded browser webview could not retain the local page.

### Cycle result - testing_pyramid_three_tiers

- Tooling surface: three-tier testing pyramid landed — mechanical crawler (`crawl:smoke` ~10s gate / `crawl:deep` soak, 9 oracles, ddmin-minimized repros), blind fleet (`npm run fleet`, personas + calibration anchors, zero-token `fleet:mock`), feedback compiler (`feedback:compile` → ranked hotspots + sycophancy telemetry + trends); assessor consumes `hotspots.json`.
- Loop effect: AGENTS.md cycle gains crawl gates + fleet/compile steps; CI gains a crawl-smoke job; fault-injection suite proves planted CRASH/SOFTLOCK/RENDER/corruption defects are caught; `docs/testing_pyramid.md` is canonical.
- Blind playtest: `fleet:mock` 20/20 verified overworld reports (all five personas rotated); live fleet blocked by nested-CLI auth inside agent sessions — mock lane is the CI oracle, live runs stay plain-shell.
- Found+fixed: real engine bug — any post-quest-completion overworld snapshot failed restore (region-renown replay gap); `traces/bugs/bug_0496_overworld_renown_restore.yaml` + regression test. Deep soak 352k steps across 8 workers: zero findings.
- Guard: `npm run health` green end-to-end; crawler byte-identical across worker counts; no verification weakened (coherence pins grew 18→22).

### Cycle result - albany_wolf_winter_relief_bridge

- Content surface: Albany Station Quarter now frames Wolf-Winter as a Rowan-to-Hayden relief dispatch, and Wolf-Winter opens with the Albany relief packet becoming a hill-road steading crisis.
- Loop effect: regressions pin the source-neutral civic-records/route-desk quest lead, ban the station-board-only contradiction, and prove the RPG opening/Cade handoff names Albany's relief rider while keeping the spear already in hand.
- Blind playtest: 25-run `overworld` Codex batch seeds 591-615 all exited 0; clarity 25x4/5, enjoyment 25x4/5, replay 25x true; feedback ledger now has 436 accepted reports.
- Self-critique: bridge/tone complaints dropped from 12/25 to 1/25 and positive relief-chain mentions hit 25/25; compact journal hash/truncation, generic civic resolutions, and road arrival/progress wording remain loud.
- Guard: focused affected tests, `npm run health`, `npm run blind:feedback`, and reports `20260708T210747Z`-`20260708T213426Z` seeds 591-615 passed.

### Cycle result - off_area_job_memory

- Engine surface: full and compact overworld views now expose `rememberedJobs` / `remembered_jobs` for discovered unfinished jobs in other known local areas while active `jobs` stays current-area only.
- Loop effect: focused UI regressions pin off-area discovered jobs as remembered leads, reject remote execution until the player moves to that area, and filter completed jobs from active/memory surfaces.
- Blind playtest: 25-run `overworld` Codex batch seeds 566-590 all exited 0; clarity 25x4/5, enjoyment 25x4/5, replay 25x true; feedback ledger now has 411 accepted reports.
- Self-critique: direct vanished-job complaints did not recur, but 5/25 still mention area-route/memory friction; the louder blockers are Albany-to-Wolf-Winter tone bridge, compact hash/truncation, and thin civic opening stakes.
- Guard: focused affected tests, `npm run health`, `npm run blind:feedback`, and reports `20260708T201937Z`-`20260708T204724Z` seeds 566-590 passed.

### Cycle result - wolf_winter_dialogue_surface

- Content/engine surface: Wolf-Winter Cade topics now expose authored ids (`ask_wolves`, `ask_byre`, `ask_leave`), old doubled ids remain hidden MCP aliases, and Cade's return line is pure spoken text with direct follow-ups/leave.
- Loop effect: regressions pin no visible `ask_ask_wolves`/`ask_ask_byre`, stale `ask_ask_wolves` still steps through MCP, and root return narration no longer nests speaker/quote prose.
- Blind playtest: 25-run `overworld` Codex batch seeds 541-565 all exited 0; clarity 25x4/5, enjoyment 25x4/5, replay 25x true; feedback ledger now has 385 accepted reports.
- Self-critique: dialogue-id/quote complaints fell to 0/25 targeted repeats; off-area discovered jobs feeling lost, hidden-count direction, compact hash truncation, and Albany-to-Wolf-Winter tone remain loud.
- Guard: focused affected tests, `npm run health`, `npm run blind:feedback`, and reports `20260708T195405Z`-`20260708T200030Z` seeds 541-565 passed.

### Cycle result - completed_state_active_lists

- Engine surface: completed local jobs and quests, plus resolved local events, now leave active full/compact overworld lists while completed/resolved ids and journal history remain visible.
- Loop effect: focused UI regressions pin completed Albany jobs, resolved events, and completed Wolf-Winter as history-only state in full and compact views.
- Blind playtest: 25-run `overworld` Codex batch seeds 516-540 all exited 0; clarity 25x4/5, enjoyment 25x4/5, replay 25x true; feedback ledger now has 360 accepted reports.
- Self-critique: completed-active-list complaints fell to 0 targeted repeats, but area-scoped off-area jobs still feel lost and Wolf-Winter dialogue ids/quote backs plus compact journal hashes dominate the new sample.
- Guard: focused affected tests, `npm run health`, `npm run blind:feedback`, and reports `20260708T192325Z`-`20260708T193009Z` seeds 516-540 passed.

### Cycle result - albany_first_action_signposts

- Content surface: rewrote Albany Civic Center's opening area, Notice Hall, Rowan Quill, charter backlog, Civic Underrooms, and Civic Ledger Run prose around concrete first moves instead of generated lead-point text.
- Loop effect: focused UI regressions prove the first screen names the Notice Hall board, Rowan's desk, and charter-backlog stair, while scout/talk/explore still reveal Market Streets, Civic Ledger Run, and Civic Underrooms deterministically.
- Blind playtest: 25-run `overworld` Codex batch seeds 491-515 all exited 0; clarity 25x4/5, enjoyment 25x4/5, replay 25x true; feedback ledger now has 335 accepted reports.
- Self-critique: first-action signposting improved but did not erase hidden-count scope confusion; completed quest/job/event listings and dialogue id/quote noise are now louder than opening-action uncertainty.
- Guard: focused affected tests, `npm run health`, `npm run blind:feedback`, and reports `20260708T190115Z`-`20260708T190730Z` seeds 491-515 passed.

### Cycle result - directional_road_event_texture

- Content surface: Albany-Colonie's first-road event is now a hand-authored Thruway shoulder incident with direction-neutral prose instead of a generic one-way road report.
- Loop effect: focused manifest/UI/MCP tests pin the direction-safe event while preserving compact/full v13 mid-route pending-road and arrival resolution behavior.
- Blind playtest: 25-run `overworld` Codex batch seeds 466-490 all exited 0; clarity 25x4/5, enjoyment 25x4/5, replay 25x true; feedback ledger now has 310 accepted reports.
- Self-critique: road-direction and literal "road report" complaints dropped to 0/25, with one vague-road-premise report and one residual "arrived" wording report; fresh-start hidden-count/action signposting is now the broadest starting-area issue.
- Guard: focused affected tests, `npm run health`, `npm run blind:feedback`, and reports `20260708T183739Z`-`20260708T184424Z` seeds 466-490 passed.

### Cycle result - mid_route_road_interruptions

- Engine surface: pending road encounters now project a route location (`road:<edge_id>`) with no town roads/local affordances, compact overworld context is v13, and road resolution text delivers the destination arrival beat.
- Loop effect: focused UI/MCP/road tests prove Albany-Colonie pending state reads as on-route, blocks town/road actions, restores through snapshots, and resolves into Colonie before normal town actions resume.
- Blind playtest: 25-run `overworld` Codex batch seeds 441-465 all exited 0; clarity 25x4/5, enjoyment 25x4/5, replay 25x true; feedback ledger now has 285 accepted reports.
- Self-critique: no fresh report repeated the after-arrival timing complaint; next road-specific issue is generic/directionally awkward "road report" prose on Albany-Colonie.
- Guard: focused affected tests, `npm run health`, `npm run blind:feedback`, and reports `20260708T180055Z`-`20260708T181931Z` seeds 441-465 passed.

### Cycle result - road_encounter_travel_timing

- Engine surface: road travel snapshots now record `roadEventId`, pending road trouble carries route/timing text plus compact `where`, replay/restore respects no-event travel, and immediate same-edge repeats are suppressed.
- Loop effect: focused UI/MCP/snapshot/resource-replay regressions prove pending road blockers restore cleanly, explicit no-event travel stays plain, and the Albany-Colonie return trip avoids the just-resolved event.
- Blind playtest: 25-run `overworld` Codex batch seeds 416-440 all exited 0; clarity 25x4/5, enjoyment 25x4/5, replay 25x true; feedback ledger now has 260 accepted reports.
- Self-critique: same-road-repeat complaints did not recur, but players still read pending road trouble as after-arrival because location already shows the destination; next lever is a true mid-route pending state.
- Guard: Codex-aware blind runner prompt fallback, focused affected tests, `npm run health`, `npm run blind:feedback`, and reports `20260708T165436Z`-`20260708T174127Z` seeds 416-440 passed.

### Cycle result - overworld_quest_time_accounting

- Engine surface: completed world quests now advance deterministic overworld time from local quest-area travel plus marquee quest renown; `wolf_winter` spends 139 minutes and says so in the quest-done journal.
- Loop effect: focused lifecycle, UI, MCP, local-journal, and resource-replay tests prove completion advances snapshots/journal time, while repeat completion remains zero-change.
- Blind playtest: 25-run `overworld` Codex batch seeds 391-415 all exited 0; clarity 24x4/5 + 1x3/5, enjoyment 23x4/5 + 2x3/5, replay 23x true / 2x false.
- Self-critique: no fresh report repeated the zero-overworld-time complaint; road encounters appearing after arrival/repeating on the same short road are now the dominant starting-area state issue.
- Guard: focused affected tests, `npm run health`, `npm run blind:feedback`, and reports `20260708T160257Z`-`20260708T162233Z` seeds 391-415 passed.

### Cycle result - albany_station_quarter_bridge

- Content surface: hand-authored Albany Civic Center / Station Quarter relief-board, Hayden, relief-packet, signal-yard, job, and `wolf_winter` discovery prose so the first quest lead has local New York footing.
- Loop effect: focused overworld regression pins the Old Cade/byre/winter-relief bridge and bans the prior generic Albany lead boilerplate.
- Blind playtest: 25-run `overworld` Codex batch seeds 366-390 all exited 0; reports reached `wolf_winter`, clarity 25x4/5, enjoyment 25x4/5, replay 25x true.
- Self-critique: best-case reports now notice the town-to-quest lead network, but repeats remain around road encounters after arrival, zero overworld quest time, stale completed lists, compact artifacts, and nearby-town template feel.
- Guard: focused overworld tests, `npm run validate -- wolf_winter`, `npm run health`, `npm run blind:feedback`, and reports `20260708T150956Z`-`20260708T153614Z` seeds 366-390 passed.

### Cycle result - fresh_game_feedback_ledger_baseline

- Content surface: added deterministic blind-feedback accumulation via `docs/BLIND_FEEDBACK_LEDGER.md` and `npm run blind:feedback`, keeping 100 latest entries explicit and older entries as trait counts.
- Loop effect: the fresh-start quality oracle now has durable recency/commonality memory instead of ad hoc summaries; 185 accepted reports parse, with 85 older entries collapsed.
- Blind playtest: 25-run `overworld` Codex batch seeds 341-365 all exited 0; reports reached `wolf_winter`, clarity 25x4/5, enjoyment 25x4/5, replay 25x true.
- Self-critique: players keep going because `wolf_winter` is strong, but Albany/Station Quarter reads procedural, the quest bridge feels tonally abrupt, and completed/road/time state is noisy.
- Guard: focused ledger/blind-runner regressions, `npm run blind:feedback`, `npm run health`, and reports `20260708T142738Z`-`20260708T145226Z` seeds 341-365 passed.

### Cycle result - tide_mill_head_race_alias_stability

- Content surface: kept `tide_mill` billhook-specific Head-Race repair while adding a held-billhook `use_choked_sluice` / `clear choked head-race` alias for action-id continuity.
- Loop effect: focused regressions now prove pre-billhook checking stays no-progress, post-billhook menus offer both ids, and either repair path scores/fixes the race.
- Blind playtest: 20-run `tide_mill` Codex batch seeds 321-340 all exited 0 and scored 55/55; clarity 20x5/5, enjoyment 20x4/5, replay 20x false.
- Self-critique: old-id rejection did not recur; strongest repeated next signals are tactical saboteur texture/continuity, underdeveloped coin-bag branch, and the new broader starting-area/open-world direction.
- Guard: focused route/alias/graph regressions, `npm run validate -- tide_mill`, `npm run health`, and reports `20260708T135657Z`-`20260708T141239Z` seeds 321-340 passed.

### Cycle result - tide_mill_billhook_specific_race_action

- Content surface: converted post-billhook `tide_mill` Head-Race repair interactions to item-on-target billhook uses, yielding `use_billhook_on_choked_sluice` and `cut choked head-race with billhook`.
- Loop effect: focused route regressions now prove pre-billhook `use_choked_sluice` remains a no-progress check, while held-billhook repair is billhook-specific and score-bearing.
- Blind playtest: 20-run `tide_mill` Codex batch seeds 301-320 all exited 0 and scored 55/55; clarity 20x5/5, enjoyment 20x4/5, replay 20x false.
- Self-critique: billhook specificity landed, but seeds 311/318 reused the old `use_choked_sluice` id after obtaining the billhook and hit rejection; next S1 is preserving that id as a legal alias.
- Guard: focused route/second-fault regressions, `npm run validate -- tide_mill`, `npm run health`, and reports `20260708T132919Z`-`20260708T134325Z` seeds 301-320 passed.
