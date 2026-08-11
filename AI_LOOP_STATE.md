# AI Loop State

<!-- historical_cycle_count: 769 -->
<!-- feedback_acceptance: {"accepted_compile":{"consumed_by_run_id":"2026-08-11T11-28-30-987Z","hotspots_path":"ai-runs/feedback/20260811T091400Z/hotspots.json","hotspots_sha256":"eb427b085f1ec2436f1859ddad95dde0c6e4a4a570493de6d6b0c3263eda554f","manifest_path":"ai-runs/feedback/20260811T091400Z/report-manifest.json","manifest_sha256":"147893756a4a10e1c9ebc0aa3eafef060d9442111d5708170a60c49ad0ca887d"},"pending_cycle_reports":[{"evidence_sha256":"ebc215ef83d7ab0adbf8e168b0620438ad49bc41d216e8f54b1f93f9f9cd2f63","report_id":"pure:4c76e0f22c68c9e44c2a01e975a3307bed06d0d93a30186b4f18e3b9628c93f4","report_sha256":"71929ed79072d9ad627478aa92cfc1b9ddda1dc8a16867f2801df470704ee9bb","run_id":"2026-08-11T09-04-58-054Z","sidecar_sha256":"3ee8c3167858753fef442606cf17d0a17039b588493a3522f17a6eb1d8bead06","tested_commit":"05a1d6804b19dc7143e79c081aeaf33546c2af82"},{"evidence_sha256":"eecb40e36c3eb79a7c7d8e0225b7f1d36d1712b6338e0876aa9fdb1907e41fa7","report_id":"pure:b7a98dfbff13147f423a34c7a265b45975595f88ec10a66273b712dee181691f","report_sha256":"4d9aedb537fc2467021b2c4bdf2590269e9c7e74c289b2d481180e7889f0c89a","run_id":"2026-08-11T11-28-30-987Z","sidecar_sha256":"b100715f7962dfa9b8fdc7da9b2424181cb7e3cfc2ae6f58dc0af7294f79159f","tested_commit":"f941d9348bd8f04e4250c8667feb1ec479288d05"},{"evidence_sha256":"aba10cd45b81fc0698162f253bca4e06db94d40d62d17b606c8ae200d0c1967f","report_id":"pure:827951b4f46fec00a349469f9e0ace92ac41271375485022818c6feb1b500349","report_sha256":"21532e096845fa43e605345f07a5521fb060cc0d7ef58d3a34e7ea2472216dee","run_id":"2026-08-11T13-44-53-712Z","sidecar_sha256":"98977cce91bfac5432fa4831343e6a6ca3554f7baef658d1afa0cf83ec4ce4b3","tested_commit":"67cf4018387748e66c6409bc7d353527a483fc34"}],"schema_version":1} -->

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


### Cycle result - advocates_case_record_lifecycle_truth

- Evidence choice: Cycle 32's maintenance rotation selected exact `playtest-advocates_case`; deterministic current-pack routes found the case slate contradicting the appeal state, while accepted `bd527711` was already consumed and supplied no authority for this fix.
- Surface/effect: `case_record` now distinguishes untouched, adjourned, and discharged presentations for EXAMINE, while READ transcribes the original filing without freezing the current disposition; actions, checks, effects, score, combat, exits, and endings are unchanged.
- Counterfactual: untouched and Craf-only states remain pending; EXAMINE renders a failed prepared appeal as adjourned and primary plus recovery successes as discharged. Three lifecycle regressions pin full/compact/nonmutation behavior and `36350b77…` → `d8b85620…` lineage.
- Pure evidence: exact-clean Spark seed 7 on `67cf4018` chose Road-Warden/Aid-Only, Exposed-Ridge HUNT, killed all three wolves, reached `ending_held` at 45/60 with the herd whole, and ended at goal decision 19.
- Pure audit: 22/22 calls succeeded with no rejection; clarity/enjoyment were 4/4, replay yes, bugs/confusions `[]`, not stuck. Advocate's Case was not entered, so this is exact-build retention evidence only and the lifecycle fix remains regression/trace-backed.
- Feedback/next: pre-seal status is two actionable reports of three, so no compile runs; the seal will queue this report third. Separately reproduced next focus is an unread charter's post-dismissal READ regressing `case_dismissed` to `charter_read`, not a finding from this pure.
- Guard: 9 focused Advocate tests, both 6,000-step crawls, exact health (448 files/3,894 tests), UI typecheck, all 12 packs, cycle-start integrity, 563 traces, and exact pure provenance are green.

### Cycle result - wolf_byre_route_action_handoff

- Evidence choice: accepted `bd527711` recorded minor staged-prompt attention on a failed-seal Cade FORTIFY route; exact `hotspot-bd527711` was selected for the shared final-room handoff, not for mechanics or recovery changes.
- Surface/effect: the byre-mouth north lock now follows the route actions actually shown and distinguishes direct finishes from routes that open north; exit predicates/destination, actions, checks, pressure, score, and endings are unchanged.
- Counterfactual: full/compact HUNT and four LURE states retain blocked→open north, DRIVE retains crisis priority→evacuation, and Cade/Albany FORTIFY retain direct dawn-watch finishes; Wolf hash advances `09bd7660…` → `95a44131…` with current-save/replay acceptance and exact-predecessor rejection.
- Pure evidence: exact-clean Spark seed 7 on `f941d934` chose Road-Warden/Aid-Only, Exposed-Ridge LURE, directly saw the new 98-character lock beside the final scent cast, took that shown cast, then went north to `ending_pack_diverted` at 55/60 and ended at goal decision 24.
- Pure audit: 29/30 calls succeeded; one mistyped state hash rejected without mutation, refreshed, and retried. Clarity/enjoyment were 4/4, replay yes, bugs `[]`, not stuck; the optional quick-lesson return caused mild reselection friction even though its LURE dialogue had disclosed the return.
- Feedback/next: pre-seal status stayed one actionable report of three, so no compile ran; the seal consumes `bd527711` and queues this run second. The changed copy was a direct canary, not proof of reduced attention cost; prefer routine rotation unless lesson-return friction recurs.
- Guard: 35 focused tests, both 6,000-step crawls, exact health, cycle-start integrity, 562 traces, Wolf validation, and exact pure provenance are green.

### Cycle result - rpg_terminal_state_coherence

- Evidence choice: the saturation ultraplan proved that hash-recomputed public saves accepted both `ended=true`/no ending and active state/a declared ending even though runtime writers only produce false/null or true/id; this off-list restore-boundary invariant therefore kept the frozen null selection.
- Surface/effect: well-formed RPG state now requires `ended === (endingId !== null)` before normalized load acceptance; valid active/terminal saves, content, mechanics, envelope/version, digest, and authorization stay unchanged.
- Counterfactual: hostile current-save pairs now fail with exact integrity diagnostics, valid active and ended controls still round-trip, and a coherent fabricated ending still reaches the later pack-aware unknown-ending gate; save/trace suites cover 108 cases.
- Red-gate correction: the first provisional pure exhausted provider context after gameplay and published no canonical report/evidence/sidecar; it was reset and quarantined, while fresh `05a1d680` alone binds this cycle's successful evidence.
- Pure evidence: exact-clean Spark seed 7 chose Road-Warden/Aid-Only/Hayden, completed sheltered LURE as `ending_pack_diverted` at 50/60 with herd and all wolves alive, then End at decision 24; 28/29 calls succeeded and one malformed parent handle recovered unchanged, with 4/4, replay yes, bugs `[]`, and no stuck state.
- Canary/feedback: no save/load/trace call exposed the invariant, so regressions remain causal; the exact prior three reports compiled to revision-live S1 FORTIFY-attention row `bd527711` while excluding this run, and null selection promotes it unconsumed for bounded action-first copy triage rather than mechanics churn.
- Guard: both 6,000-step crawls, full health (448 files/3,891 tests), 561 traces, UI typecheck, all 12 packs, reviewed cycle-start integrity, exact pure provenance, deterministic compile, formatting, and hostile authority review are green.

### Cycle result - wolf_lure_loft_duplicate_guidance

- Evidence choice: accepted `64f5227e` and later exact-build raw both showed the pending Fodder-Loft repeat “the hauled ladder leaves no retreat” in room text and blocked east, so exact `hotspot-64f5227e` outranked tied broader density rows.
- Surface/effect: the pending room now ends after the second-cast instruction; the exact actionable east lock, one-way geometry, predicates, cast, and post-cast truth remain unchanged, advancing Wolf hash `7beba188…` → `09bd7660…`.
- Counterfactual: clean, split-guard, braced-rail, and hybrid LURE routes pin exact full/compact room plus blocked east before the cast and open east afterward; current saves/replays load while the exact predecessor rejects.
- Pure evidence: exact-clean Spark seed 7 on `de8a2258` chose Road-Warden/Aid-Only, Sheltered FORTIFY, recovered a failed first seal with Cade, and ended `ending_fortified_cade_terms` at decision 17 with 35/60; all 25 calls succeeded.
- Canary caveat: the pure route never entered LURE or the Fodder-Loft, so it proves exact-build integration only; causal proof is the four-route regression. Clarity/enjoyment were 5/4, replay yes, bugs `[]`, not stuck.
- Feedback/next: pre-seal status remained two actionable reports of three, so no compile ran; the seal consumes `64f5227e` and queues this third report. The visible Cade recovery worked immediately, so defer broader FORTIFY density changes to that later compile.
- Guard: 28 focused tests, Wolf validation at `09bd7660…`, 560 trace files, type/lint/format, exact pure provenance, post-crawl, health, and cycle-start integrity are green.

### Cycle result - advocates_expelled_ending_truth

- Evidence choice: reachable Advocate's Case deaths left the charter held, dropped in the antechamber, or already argued after a failed prepared appeal while `ending_expelled` still called it untouched and unargued; exact on-list `playtest-advocates_case` therefore outranked the partly superseded one-report Wolf density recommendation.
- Surface/effect: the death ending now preserves the impound/notice outcome but says Marta's claim remains unresolved; ending id, death flag, predicates, combat, items, scores, and schema are unchanged, with Advocates hash `c3dd6268…` → `36350b77…`.
- Counterfactual: ordinary runtime combat with player d6 1/Craf d6 6 pins untouched, carried, dropped, and failed-appeal deaths in full/compact projections, including flags, inventory/object location, score, terminal actions, and read nonmutation; successful appeals still remove Craf and reach the legal ending.
- Pure evidence: exact-clean Spark seed 7 on `4a8054a6` took Ledger/Aid-Only/Rowan through Exposed-Ridge LURE to 60/60, continued via Cade's wagon to Gallowmere 50/50, and ended at decision 53; all 69 calls succeeded, clarity/enjoyment 5/4, replay yes, bugs/confusions `[]`, not stuck.
- Canary caveat: the player never entered Advocate's Case, so the pure is exact-build integration evidence and deterministic regression remains causal proof; its early Gallowmere detour was recoverable and judged deliberate/fair rather than a mechanics defect.
- Feedback/next: committed status is 1/3 with no compile; this routine selection leaves accepted `64f5227e` unconsumed and seal should leave two pending reports. Current item 28 narrows that low-severity density seam to duplicated Fodder-Loft “no retreat” copy, not a route rewrite.
- Guard: exact-pure provenance, 6 focused regressions, 559 bug traces, both 6,000-step crawls, full health (448 files/3,890 tests), UI typecheck, all 12 packs, cycle-start integrity, formatting, and hostile authority review are green.

### Cycle result - story_inspection_parent_binding

- Evidence choice: four retained verified pure runs made seven avoidable read-only story-inspection rejections because the refined `tools/list` schema was empty and its description lacked the complete parent-binding recipe; this shared MCP affordance outranked maintenance-only content rotation and uses an off-list null selection.
- Surface/effect: the registered inspection description now requires the exact current parent `overworld_session_id`, exact visible story id, merged reveal/review arguments, and exclusive option/reveal detail; runtime validation and gameplay response/world/journey state stay unchanged while the reviewed catalog digest moves `f060157f…` → `0a613ff9…`.
- Counterfactual: real pure-server and registration tests pin the empty advertised schema plus exact prose, authoritative missing-parent recovery without mutation, unchanged base inspection, durable reveal receipt, and nonmutating option/reveal XOR rejection; no parent inference or automatic story choice was added.
- Pure evidence: exact-clean Spark seed 7 on `35b1e034` took Ledger/Aid-Only/Rowan through Exposed-Ridge LURE to `ending_pack_diverted`, 50/60, herd and all three wolves alive, then End at decision 23; all 28 MCP calls succeeded, clarity/enjoyment 4/4, replay yes, bugs `[]`, not stuck.
- Canary caveat: the player chose each story stage directly and never called the inspection tool, so this run is exact-build integration evidence only; historical raws and causal regressions prove the changed affordance, while the reported staged-prompt density was nonblocking.
- Feedback/next: exact prior pending Cycles 24–26 compiled into four S1 rows at `35b1e034` with recommendation `64f5227e`, excluding this run; that row partly predates the Cycle 25 held-feed yard fix, so revision-filter it before any broader route edit.
- Guard: 37 focused MCP tests, exact catalog authentication, 558 bug traces, both 6,000-step crawls, full health (448 files/3,889 tests), UI typecheck, all 12 packs, cycle-start integrity, and exact-pure replay are green.

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
