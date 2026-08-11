# AI Loop State

<!-- historical_cycle_count: 763 -->
<!-- feedback_acceptance: {"accepted_compile":{"consumed_by_run_id":"2026-08-10T21-53-53-028Z","hotspots_path":"ai-runs/feedback/20260810T194910Z/hotspots.json","hotspots_sha256":"e8324c3632599b987ba43fd2843fd3c8c7fda23f639338126f60bf108a11b843","manifest_path":"ai-runs/feedback/20260810T194910Z/report-manifest.json","manifest_sha256":"3f6e21ae4cdd8ed78611fe8b4c2691051c091cff078b30460385d6ac95b70cbe"},"pending_cycle_reports":[{"evidence_sha256":"291b54ce5b3e3bdc6927c433a50b9479cce1dc42b084f1bd0685d1a0fa61e28e","report_id":"pure:37b76416aacc26cea01b7fd8d6c5d775377d6b1f78dbe07af28816331c74b75a","report_sha256":"20d03c7a979aba9d2cd4c165f23ab2395500117d990b799c08de61cb2f9fc2a7","run_id":"2026-08-10T19-41-13-068Z","sidecar_sha256":"8dbd5c47c29c67528ef4e82573dd586d7bd0a898473c166b20696c96af42064e","tested_commit":"2bfc04a302f8d8d25d2e7ae6c055a1874f11c351"},{"evidence_sha256":"40d72e54288935243d861a5e5e5f81eac5bfa51abff5a9d2442a6fb7698b0d30","report_id":"pure:c6b9929e5418c6149c896f8a2fde76ebac0843e0fd96974be035e23bf433bfb6","report_sha256":"1943b06756d9bc18018990687a5c6fc6927176109ef2d98ab29c18c2a4cda008","run_id":"2026-08-10T21-53-53-028Z","sidecar_sha256":"4f798e04b6ed804c50b2535d20aabfa8dd7cc1bee575b96cf975941e7aa0429f","tested_commit":"950439538f6746087cfa35e07d9b839be86309ea"},{"evidence_sha256":"c79034d20da0eff153133be4ee0e5c07f9b88325ccd6f04f85795c30f2947f36","report_id":"pure:e308fc17e058d5acbf401542f7cc6e2654bdaa3df51183f348b63b9402861178","report_sha256":"91fc6acb75072b2c43c0668288503580c390a87de570689fa55a7df6c7f83c3d","run_id":"2026-08-10T23-47-08-984Z","sidecar_sha256":"220576094516a0187d305a3d394e6b8ba8779fd10b9b06c05f492cedfea36342","tested_commit":"00e0a7be0b15d79ac504fd791c5ea09d4ed4a8dc"}],"schema_version":1} -->

This live file is intentionally token-small. Detailed cycle prose before the
token-efficiency cleanup (14621c7a) was removed from the working tree; rotation
moves aged entries into the local, gitignored AI_LOOP_STATE_ARCHIVE.md, and Git
history of this file is the source of truth for older detail.

Entry contract (machine-parsed by src/afk/loop_state.ts and src/afk/assessor.ts):

- PREPEND each new entry directly below this intro — the log is NEWEST-FIRST.
- Keep the exact heading form "### Cycle result - slug" (rotation and cycle counting match it at line start).
- Name the world quest(s) blind-played in the entry body — the blind-pass rotation derives attendance from those names.
- The historical_cycle_count marker above is maintained by the rotation and feeds the generated-eval seed window; never hand-edit or remove it.
- The feedback_acceptance marker is machine-owned by the post-gate seal; never hand-edit, remove, or summarize it.
- The current feedback_cycle_selection marker records the actual chosen candidate before the provisional commit; set its id exactly (or null only for off-list work), then never change it after the freeze. The post-gate seal removes it.
- Keep entries terse (≤8 lines): the surface changed, the measured effect, the self-critique verdict, and the guard. The invariant gates (agent-cleaner pre-gates where the operator machine has them, the full `npm run health` bar) are assumed on every cycle — record deltas and exceptions, not the standard VERIFY litany.

### Cycle result - advocates_absent_oswin_surface

- Evidence choice: the routine Advocates rotation exposed a direct historical contradiction—resolved stall actions still offered `talk_oswin`, and the response said Oswin was no longer there while projecting him as present—so this bounded NPC truth fix outranked rarer ending copy.
- Surface/effect: Oswin now appears at Marta's Stall only while `oswin_overruled` is unset; only the resolved NPC/TALK projection changes, while dialogue text/graph, quest outcomes, and schema remain unchanged, with Advocates hash `284d5e2e…` → `c3dd6268…`.
- Counterfactual: real primary and failed-roll recovery successes remove Oswin/TALK in full and compact views, while failed appeal and a reachable two-hit combat-only victory retain both; projections remain nonmutating.
- Pure evidence: exact-clean Spark seed 7 on `00e0a7be` took Road-Warden/Full Compact/Hayden through Sheltered-Stockway Cade FORTIFY to `ending_fortified_cade_terms`, 35/60, herd and all wolves alive, then End at decision 17; 23/25 calls succeeded, with two read-only story inspections rejected before recovery and no gameplay rejection; 4/4, replay yes, bugs `[]`, not stuck.
- Canary caveat: the player never entered Advocate's Case, so Oswin causality remains regression/trace-backed; the run also broke the Full Compact promise through Cade's household-shutter terms, so it proves integration rather than that duty outcome.
- Feedback/next: pre-seal status is 2/3 with no compile and seal should leave three pending reports; completing visible story-inspection arguments is the strongest repeated affordance seam, while the false carried-charter `ending_expelled` line remains a bounded Advocates follow-up.
- Guard: 13 focused Advocates tests, exact `c3dd6268…` validation, 557 bug traces, both 6,000-step crawls, exact health (448 files/3,889 tests), UI typecheck, all 12 packs, cycle-start integrity, and pure provenance are green.

### Cycle result - wolf_lure_yard_commit_truth

- Evidence choice: accepted `hotspot-ed51aa6f` and Cycle 22 item 21 directly showed committed Wolf-Winter LURE with the sack held but stale four-plan yard prose, so this outranked broader density churn and routine rotation.
- Surface/effect: that held-feed yard state now names HUNT/DRIVE/FORTIFY as closed and the active northward one-sack route; specialized leaves, actions, exits, checks, recoveries, outcomes, and schema are unchanged, with Wolf hash `8b175deb…` → `7beba188…`.
- Counterfactual: full/compact real routes pin clean pre-cast, post-foul south-return, and post-second-cast backtrack guidance while no-feed, protocol, settled west/up, leader/pack, open, and HUNT states retain priority.
- Red-gate correction: `025ce87a` published no canonical report after a clarity-required interview rejection, and `7d2aae81` published none after strict context exhaustion; both were reset and only fresh retry `95043953` carries canonical, retention-eligible evidence.
- Pure evidence: exact-clean Spark seed 7 on `95043953` took Ledger/Aid-Only/Rowan through sheltered LURE, directly rendered the new copy at item 23, and reached `ending_pack_diverted` 60/60 with herd and all wolves alive before End at decision 26; one premature RPG read failed closed, then all calls succeeded; 4/4, replay yes, bugs `[]`, not stuck.
- Feedback/next: pre-seal status is 1/3 with no compile; exact selection consumes `ed51aa6f` and seal leaves two pending reports. The player encountered the narrowed rail but missed no LURE step; its failure concern was hypothetical on a clean route, so prefer routine rotation unless later evidence localizes a new state-truth defect.
- Guard: 29 focused tests, 556 bug traces, exact `7beba188…` validation, hostile review, full health, outer crawl, start-ref integrity, and the exact-pure gate are green.

### Cycle result - wolf_reese_works_room_truth

- Evidence choice: eleven current-lineage Paling observations credited Reese's Works while Works was absent and the shown check stayed DC 14; exact `playtest-wolf_winter` therefore outranked the routine Advocates rotation.
- Surface/effect: both Cade and Albany pre-attempt room lines now say Works lowers the shown Repair difficulty only if prepared at launch; predicates, actions, checks, recoveries, flags, scores, and endings are unchanged, with Wolf hash `e8e29d0e…` → `8b175deb…`.
- Counterfactual: a real eight-cell full/compact matrix pins Cade DC 14/12 regardless of oath, Albany Aid-Only 14/12, Albany Full 12/10, genuine Works/Drover import truth, unique stance actions, and read/projection nonmutation.
- Pure evidence: exact-clean Spark seed 7 on `2bfc04a3` took Ledger/Aid-Only/Rowan through sheltered-stockway LURE and three clean casts to `ending_pack_diverted`, 50/60, whole herd/all three wolves alive, then ended at the goal-completion choice on decision 23; 30/30 calls green, clarity/enjoyment 4/4, replay yes, bugs `[]`, not stuck.
- Canary caveat/next: LURE never exposed the FORTIFY-specific Reese copy, so causal proof remains the matrix/trace; the exact-current committed-LURE yard fallback still tells players to compare all four now-closed plans and is the strongest bounded follow-up to the broader density feedback.
- Feedback: the exact prior three-report delta `20260810T194910Z` recommends `ed51aa6f` and excludes this run; seal promotes it unconsumed, clears that cohort, and leaves this pure report as the sole pending row.
- Guard: 45 focused tests, 555 traces, both 6,000-step crawls, exact health (448 files/3,886 tests), UI typecheck, all 12 packs, cycle-start integrity, pure provenance, and deterministic compile rebuild are green.

### Cycle result - wolf_yearling_defeat_route_truth

- Evidence choice: two sealed LURE players saw the shared yearling defeat journal say the byre ran north while their live route blocked north and required south→west→up; on-list `playtest-wolf_winter` was selected, while accepted `d6a6cd0a` was already consumed.
- Surface/effect: the shared defeat journal is now a 92-character route-neutral sentence; flags, stage, +10 score, exits, actions, checks, and endings are unchanged, with Wolf hash `c9b82ed5…` → `e8e29d0e…`.
- Counterfactual: real full/compact LURE hybrid defeat pins south legal/north blocked and the neutral journal/event, while ordinary/HUNT pins the same journal with north still legal.
- Pure evidence: exact-clean Spark seed 7 on `dd353d9e` took Ledger/Aid-Only/Rowan through Exposed-Ridge Cade FORTIFY to `ending_fortified_cade_terms`, 40/60, whole herd/all wolves safe, then ended at the goal-completion choice on decision 17; clarity/enjoyment 4/4, replay yes, bugs `[]`, not stuck.
- Canary caveat/next: FORTIFY withheld combat, so the journal was not directly exposed; 23/25 calls succeeded and two read-only story inspections failed input validation before exact recovery. `Reese's Works` was again falsely credited without preparation at DC 14 and is the strongest next truth seam.
- Feedback: pre-seal status is 2 actionable reports of 3 and no compile; sealing this run appends the third pending report while preserving the already-consumed accepted bundle.
- Guard: 35 focused tests, 554 traces, both 6,000-step crawls, exact health (448 files/3,878 tests), UI typecheck, all 12 packs, cycle-start integrity, and pure provenance are green.

### Cycle result - wolf_paling_north_stage_guidance

- Evidence choice: accepted `d6a6cd0a` remained live after Cycle 21 compressed only secondary rows; the unchanged primary paling cue repeated across current LURE stages and accompanied a premature south-and-return detour.
- Surface/effect: the shared north block now says to settle the yearling or outer seal first and only then backtrack for LURE's loft cast (116 characters); predicates, exits, actions, checks, resources, decisions, scores, and endings are unchanged.
- Counterfactual: exact full/compact pre-cast, foul, braced, hybrid, settled, HUNT/open, DRIVE optional-step, and Cade/Albany clean/failure-recovery states pin the direct `07572512…` → `c9b82ed5…` copy-only hash roll.
- Pure evidence: exact-clean Spark seed 7 on `f218b1e1` took Ledger/Aid-Only/Rowan through protected Civic evidence into Sheltered LURE, killed the yearling, and ended `ending_pack_diverted_after_blood` at decision 28 and 50/60; clarity/enjoyment 4/4, replay yes, with 36/36 calls green, bugs `[]`, and no stuck state.
- Causal caveat/next: the new cue appeared in five distinct states and the player followed south→west→up after the kill without trying north; combat was optional, while the older unconditional defeat journal `The byre runs on north.` is now the strongest concrete follow-up truth bug.
- Feedback: pre-seal status was 1 actionable report of 3, so no compile; exact `hotspot-d6a6cd0a` selection consumes the accepted recommendation, and seal leaves Cycle 21 plus this report as the 2 pending rows.
- Guard: 35 focused tests, 553 traces, both 6,000-step crawls, cycle-start integrity, and exact pure provenance are green; a 20-minute health wrapper expired without verdict, then the identical frozen rerun passed 448 files/3,877 tests, UI typecheck, and all 12 packs.

### Cycle result - wolf_secondary_blocked_route_density

- Evidence choice: three pending FORTIFY players repeatedly saw the same secondary route rules; on-list `playtest-wolf_winter` outranked stale accepted `a0d32f61`, which remains unconsumed.
- Surface/effect: five hard-commit south/west blocks now name the closed direction and current route beat in 591 rather than 942 characters; exits, actions, checks, resources, decisions, scores, and endings are unchanged.
- Counterfactual: exact full/compact DRIVE, both FORTIFY stances, completed LURE, prepared-Drover multi-step recovery, and open HUNT/in-progress-LURE states pin the direct `189b14d7…` → `07572512…` copy-only hash roll.
- Red-gate correction: first provisional `82d8bb8a` exposed one stale old-copy assertion in full health; it and its pure/compile were discarded, then retry `93d8b86b` added the exact crisis-priority contract.
- Pure evidence: exact-clean Spark seed 7 on `93d8b86b` took Ledger/Aid-Only/Rowan into exposed-ridge LURE, ended `ending_pack_diverted_after_blood` at decision 29 and 55/60, rated 4/4, replay yes, with zero call/action errors, bugs, or stuck state; only the mouth copy was directly canaried.
- Feedback/next: the exact prior three-report delta promotes `d6a6cd0a` while excluding this run; Civic rows are revision-stale, and the retry's repeated primary paling cue is the narrower live sequencing seam.
- Guard: 44 focused tests, 552 traces, 6,000-step crawl, exact health (448 files/3,877 tests), UI typecheck, all 12 packs, cycle-start integrity, and retry pure/compile authority are green.

### Cycle result - civic_choice_header_density

- Evidence choice: accepted `a0d32f61` and `4ae7e44f` were already fixed and `a07d646c` is intentional retention cadence; repeated custom Civic density made on-list `playtest-overworld` the live choice, leaving the accepted recommendation unconsumed.
- Surface/effect: custom duty and evidence headers now state each choice and handoff once (41/44 words; 168 for the full custom route), while registration, matched shortcuts, options, receipts, decisions, field plans, and state are unchanged.
- Counterfactual: Ledger retains three direct duties with no disclosure; matched roles retain one shortcut or durable customization; exact full/compact/DOM copy, option order, snapshot-stable reads, and separate role/duty/source decision increments are pinned.
- Pure evidence: exact-clean Spark seed 7 on `f1bd2f3e` used Ledger/Aid-Only/Rowan, read both new literals verbatim, won sheltered Cade-terms FORTIFY at 40/60, and ended at goal decision 18; clarity/enjoyment 4/4, replay yes, bugs `[]`, not stuck.
- Causal evidence: all 24 calls completed with current hashes and no rejection; the custom path advanced directly through both changed screens, then one failed outer-seal check recovered through Cade before the dawn win.
- Feedback/next: pre-seal status is 2/3 with no compile; sealing queues report three for next-cycle compilation. The only new soft seam is repeated post-commit Wolf blocked-row density, not a regression in this copy-only change.
- Guard: 30 focused tests, 551 traces, both 6,000-step crawls, exact health (448 files/3,873 tests), UI typecheck, all 12 packs, cycle-start integrity, and exact-build pure provenance are green.

### Cycle result - deferred_aftercare_choice_priority

- Evidence choice: accepted recommendation `a0d32f61` quoted Wolf copy already replaced in Cycle 18; live sibling `4ae7e44f` exactly matched one accepted player's deferred-aftercare friction, and selecting it truthfully leaves the stale first row unconsumed.
- Surface/effect: deferred optional leads now say to choose the shown journey option, finish any follow-on choice, and expect district details when play resumes; lead data, Continue/End, story options, goals, checkpoints, state, and persistence are unchanged.
- Counterfactual: exact singular/plural copy, pending choice, dawn dispatch, End, resumed detail, full/compact/UI parity, no detail leakage, and snapshot/hash/decision invariants are regression-pinned.
- Pure evidence: exact-clean Spark seed 7 on `3dbc399a` chose Ledger Advocate/Aid-Only/Rowan, resolved the charter backlog, and won sheltered Wolf-Winter by Albany-authority FORTIFY; it ended naturally at goal decision 19 with clarity/enjoyment 4/4, replay yes, bugs `[]`, and no stuck state.
- Causal/feedback: that player ended before the compact foldback exposed optional opportunities, so pure evidence is an integration canary and accepted report plus 60 focused tests remain causal; status is 1/3 with no compile, and seal queues this run as pending report two.
- Guard/next: 550 traces, both 6,000-step crawls, exact health (448 files/3,872 tests), UI typecheck, all 12 packs, cycle-start integrity, and current-commit pure gates are green; repeated Civic role/duty/source header density is the next measured seam.

### Cycle result - wolf_blocked_route_guidance

- Evidence choice: accepted `07988b93`/`33adfdd0` hash rows were client stale/mistyped guards; the latest Wolf-Winter player instead found the shared north block inferential, so on-list `playtest-wolf_winter` was selected and the accepted recommendation remains unconsumed.
- Surface/effect: the byre-yard block now routes HUNT to June, LURE to any shown docket/feed/loft cue, and DRIVE/FORTIFY to named gear; exit conditions, actions, items, routes, scores, and endings are unchanged.
- Counterfactual: full/compact June, pre-feed and post-cast LURE, split-rail docket, DRIVE, Cade FORTIFY, and Albany FORTIFY states preserve their exact closed/open transitions; Wolf hash `1bdbd697…` advances to `189b14d7…`.
- Pure evidence: exact-clean Spark seed 7 on `3dab3322` chose Road-Warden/Full Compact/Rowan, won sheltered FORTIFY Wolf-Winter with `ending_fortified_cade_terms` at 40/60, and ended at goal decision 17; clarity/enjoyment 4/4, replay yes, bugs `[]`, not stuck.
- Causal evidence: the player saw the new 175-character hint beside Cade's committed shutters, re-read, then took them with no FORTIFY action rejection; two earlier story-argument errors recovered before this seam, and the report instead flags broader civic/hard-commit density.
- Feedback/next: the exact prior three-report delta ranks pre-fix `a0d32f61` first; this revision addresses that blocked-copy witness, while rank-four `77464085` preserves broader LURE density for revision-aware Cycle 19 triage.
- Guard: 62 focused tests, both 6,000-step crawls, exact health (448 files/3,872 tests), UI typecheck, all 12 packs, cycle-start integrity, trace integrity, and exact playtest/compile provenance are green.

### Cycle result - gallowmere_ridge_closure_signpost

- Evidence choice: accepted `07988b93`/`33adfdd0` hash rows were client stale/mistyped guards; the latest Gallowmere player instead detoured south after the sow kill, so on-list `playtest-gallowmere` was selected and accepted hot spots remain unconsumed.
- Surface/effect: the sow-slain hollow now says the hunt closes on the ridge north in full and compact views; room/action ids, both exits, combat, score, checkpoint, and ending mechanics are unchanged.
- Counterfactual: south remains legal and nonterminal at 35 for optional cleanup, while north still reaches `moor_ridge`, adds 15, and ends `ending_hunt_won` at 50; content hash `dde0cc62…` advances to `67fa0f96…`.
- Pure evidence: exact-clean Spark seed 7 on `16cf2c65` chose Road-Warden/Aid-Only, won sheltered LURE Wolf-Winter with `ending_pack_diverted`, and ended at goal decision 25; clarity/enjoyment 4/4, replay yes, bugs `[]`, not stuck.
- Canary caveat: the pure route did not enter Gallowmere, so it proves exact-build integration/retention only; the closure copy is regression/trace-backed rather than directly replayed.
- Feedback/next: pre-seal status was two actionable reports of three, so no compile ran; the seal added this run as report three, ready for Cycle 18's compile. Its pending friction is dense Wolf-Winter LURE movement/blocked-exit guidance, not a defect in this increment.
- Guard: 17 focused route/counterexample tests, both 6,000-step crawls, exact health (448 files/3,872 tests), UI typecheck, all 12 packs, cycle-start integrity, trace integrity, and exact playtest provenance are green.

### Cycle result - advocates_certified_evidence_extracts

- Evidence choice: accepted hash-copy hot spots were client-side stale/mistyped guards; two independent Advocate's Case players instead found TAKE implied stealing master records, so on-list `playtest-advocates_case` was selected and accepted hot spots remain unconsumed.
- Surface/effect: `town_register` and `prior_convictions` now carry certified register/precedent extracts while master books remain in their offices; IDs, aliases, mechanics, score, rhetoric, and routes are unchanged.
- Counterfactual: held/read/drop states stay truthful; the 40/50 priors-only win invents no register evidence, while a prepared failed argument still recovers to 50/50 through charter citation → extract → packet.
- Pure evidence: exact-clean Spark seed 7 on `370130d9` chose Ledger Advocate/Aid-Only, won sheltered FORTIFY Wolf-Winter and 50/50 Gallowmere, continued at goal 17/checkpoint 40, and ended at goal 47; clarity/enjoyment 4/4, replay yes, bugs `[]`, not stuck.
- Canary caveat: the pure route did not enter Advocate's Case, so it proves exact-build integration/retention only; the copy fix is regression/validation-backed, not directly replayed.
- Feedback/next: pre-seal status was one prior actionable report of three; the seal added this actionable run as the second, still below compile threshold. It reported mild checkpoint/deferred-lead handoff friction but no bug.
- Guard: content hash `284d5e2e…`, focused 34/34, trace integrity, type/lint/format, exact playtest provenance, and the outer crawl/health/cycle-start integrity gates are green.

### Cycle result - pure_parent_session_diagnostic

- Evidence choice: accepted raw `8707f630` used a one-character-short parent handle and got the false "RPG child" diagnosis; this off-list presentation bug outranked stale `a919cded`.
- Surface/effect: pure overworld recovery now names an active child only on exact child-id equality; missing, malformed, stale, and unknown handles still fail closed and return the exact parent, with no schema, state, or acceptance change.
- Counterfactual: active-child, stale `r999`, null/wrong-field/non-string, no-echo, byte-stable parent journey, and original-child-hash witnesses preserve the later active-quest gate.
- Pure evidence: exact-clean Spark seed 7 on `2b16e731` used Road-Warden/Full Compact/Rowan, Sheltered FORTIFY, wardens north, and Gallowmere; ended at 39, clarity/enjoyment 5/4, replay yes, bugs `[]`, not stuck.
- Causal evidence: that player supplied malformed parent `…8c3d?`, received the new generic recovery plus exact handle, retried successfully, and did not count it as confusion; active-child wording remains regression-proven.
- Feedback/next: the exact prior three-report delta ranks `07988b93` then `33adfdd0`, both one-report S1 hash-copy rows; raw calls are stale/mistyped guards rather than state races, so preserve concurrency and prefer routine Advocates absent a reproducible engine defect.
- Authority/guard: the provisional delta binds `2b16e731` to predecessor `00fc73…`, consumes only the three preaccepted pending identities, and excludes this run until seal; focused checks and exact evidence are green, with outer gates still required.

### Cycle result - accepted_hotspot_compiler_order

- Evidence choice: the accepted compiler recommended `a919cded`, but three tied 2.5 candidates were re-sorted by unrelated short-hash ids and the assessor offered `6268a10e`, a sibling the exact-selection seal could not consume.
- Surface/effect: equal-score accepted hotspots now retain their authenticated compiler ordinal after assessor score and playtest recency; every other tie still uses the existing id order.
- Counterfactual: a lexically first rank-four hotspot stays excluded, higher assessor score still wins, filtered top-three rows are not backfilled, and equal-score unplayable fixes remain ahead of hotspots; compiler artifacts and exact seal matching are unchanged.
- Pure evidence: exact-clean Spark seed 7 on `8707f630` chose Unaffiliated Courier, Exposed-Ridge FORTIFY, won Wolf-Winter, continued through Gallowmere and Tanner's Fever, then ended naturally at decision 57; clarity/enjoyment 4/5, replay yes, bugs `[]`, not stuck.
- Feedback/authority: the stale accepted product recommendation remains unconsumed because this off-list authority fix has a null selection; pre-seal status is 2 actionable reports of 3, so no compile ran.
- Self-critique/guard: raw audit traced the player's perceived hash friction to three transcription errors, not state races, so concurrency guards stay unchanged; 43 focused assessor/seal tests, type/lint/format, 545 traces, hostile reviews, and the pre-crawl are green, with outer gates still required.

### Cycle result - strict_stream_forbidden_function_taxonomy

- Evidence choice: the accepted Civic-density recommendation came from an intentionally customizable Ledger path and did not recur on the newest Ledger run; a recurrent Spark resource probe instead exposed a concrete fail-closed diagnostic defect.
- Surface/effect: recognizable private native calls outside the pure AdventureForge tool/namespace surface now reject as the fixed safe category `direct_forbidden_function`, while public-first observation remains `forbidden_mcp_server` and historical diagnostics stay readable.
- Exact boundary: the captured no-namespace resource call is pinned at 342 bytes/SHA `027bc003`; both polling races still exit 43, terminate owned descendants, publish no report/evidence/sidecar, and never reveal the raw tool or call id in the diagnostic.
- Counterfactual: genuine duplicate/malformed allowed calls retain `direct_invalid_start`, repeated starts retain fresh-start ordering, and the change does not accept, skip, alias, retry, auto-start, or implement resource discovery.
- Pure evidence: exact-clean Spark seed 7 on `9b494083` chose Unaffiliated Courier/personal-bond duty, resolved Albany's Charter backlog, then completed Wolf-Winter by Sheltered-Stockway LURE with herd and wolves alive; it ended naturally at decision 26 with clarity/enjoyment 4/4, replay yes, bugs `[]`, and no stuck state.
- Self-critique/guard: gameplay could only canary this tooling-only change; 204 focused tests, type/lint/format, 544 traces, exact captured-row/race reviews, and the pre-crawl are green, feedback remains 1/3, and the standard outer gates remain required.

### Cycle result - wolf_hunt_commitment_label

- Evidence choice: the assessor offered only a routine Advocates' Case rotation; exact-build players on `ca4accc5` and `e0600a7f` independently showed Cade's HUNT ASK claiming commitment before the real north-crossing boundary.
- Surface/effect: Cade's 145-character prompt now says the exchange ends with HUNT uncommitted and north commits; the full `ask: ` command is 150/160 characters, and compact choices expose it without truncation.
- Counterfactual: the ASK stays end-only and uncounted apart from dialogue bookkeeping; retalk keeps alternatives open, north retires them, June's two branches and immediate LURE/DRIVE/FORTIFY commitments remain unchanged, and Wolf source hash rolls `ec51d609` to `1bdbd697`.
- Red-gate correction: first provisional `fb24fef7` hit an irreversible duplicate-start strict-stream rejection on its first MCP call and published no report/sidecar; it was reset, while byte-identical retry `eff02eb8` produced fresh evidence.
- Pure evidence: exact-clean Spark seed 7 on `eff02eb8` chose Ledger Advocate/Aid-Only/Rowan, won Wolf-Winter by Exposed-Ridge LURE with two cattle lost, continued through checkpoint 40, won The Gallowmere, and ended naturally at decision 56; clarity/enjoyment 4/4, replay yes, bugs `[]`, not stuck.
- Feedback/authority: the three prior actionable reports compiled into a four-hotspot delta on `eff02eb8` with recommendation `a919cded`; the current pure run remains one-cycle-lagged and the failed run is excluded.
- Self-critique/guard: the canary did not exercise HUNT, so causal proof remains the full/compact/CLI/MCP regressions; 76 focused tests, type/lint/format, 543 traces, all 12 packs, and hostile reviews are green, with outer gates still required.
