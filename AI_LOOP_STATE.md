# AI Loop State

<!-- historical_cycle_count: 754 -->
<!-- feedback_acceptance: {"accepted_compile":{"consumed_by_run_id":null,"hotspots_path":"ai-runs/feedback/20260810T001053Z/hotspots.json","hotspots_sha256":"8a6b78c275a9a1e137315108505792b3adf6ab18fe5dd22042ce216ef41adbe0","manifest_path":"ai-runs/feedback/20260810T001053Z/report-manifest.json","manifest_sha256":"edbd63bb0ad2b6582a7a073d9ffa579114819e68ac61d711e54d324dd0bbe2cd"},"pending_cycle_reports":[{"evidence_sha256":"18d336e8c935b9cf92b869132efbeb4aafb420de97f84a03987b91459c6b55d3","report_id":"pure:0e175d6e9da845928dcd3d1f5e321e713d2373562263cb69538717c69a8d3fe7","report_sha256":"33427276751af62de513a177bd45eaa4ece1647fd74be3a9cd62c4f64e7ba94c","run_id":"2026-08-09T23-52-24-726Z","sidecar_sha256":"2c669134cbff5a5b6406ecaf7d08e11c877a4684f062b43557a10a80c864748d","tested_commit":"2b16e73194ab3ef2abe6925bbc868e97e62eff95"},{"evidence_sha256":"6c6fdf2b5a70fa3b1afbded2143cae1a1257a286a390b6007061e9ee153acabc","report_id":"pure:9fbe84a5b06692f4c74671c0139fe65643d84ef6337e56c697ce910d6b593e12","report_sha256":"89a4dbc6e9aed0426fa1ff8f4f921417155d64b6231b8ab18bd352507f824f9d","run_id":"2026-08-10T01-54-44-511Z","sidecar_sha256":"67514aaa7b873bd1f79ffa380ddb635828f80418870eb1fe6d92d08de9668a7c","tested_commit":"370130d9db1fd554429a3a333028f612a772ef08"},{"evidence_sha256":"6761de92528a1095cf12e7a9ea0da07829b26a92994fb2024495d5d493a23a80","report_id":"pure:0869a6d0ccb59a67f707aeabea88de8ffea57da422be1e6c263bd65a23460e29","report_sha256":"7d81103391a6443cba0cc320db81c4ee4946b6abcf07fc62aad86a166b570a9a","run_id":"2026-08-10T03-46-21-407Z","sidecar_sha256":"6d02fbefdcaa552611cbdf873bf1ea0ec3527c5e01707ade548b2095a3241d98","tested_commit":"16cf2c6540e7a26345e557130f3d78c421993729"}],"schema_version":1} -->

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

### Cycle result - event_lead_gameplay_pause
- Evidence choice: the assessor offered only a structurally clean Advocates' Case rotation; the newest exact-build player called Civic event guidance stale beside mandatory Compact choices, and direct replay proved that the advertised investigate action rejected.
- Surface/effect: blocked event leads now use the existing no-authored-choice row whenever compact `service_actions` is absent, then restore scout, talk, or investigate when gameplay resumes; fast and full-view compact paths remain equal.
- Red-gate correction: first provisional `dc148c0d` also rewrote the compact legend, and health caught its version-pinned signature drift plus a 3,109-byte start legend over the 3,100-byte ceiling; that revision/report were discarded, and retry `e0600a7f` keeps legend bytes unchanged.
- Counterfactual: active towns still expose unavailable resupply/rest rows and local prerequisites; registration, oath, source, checkpoints, and End pause them, while rejected event actions leave snapshot bytes/hash unchanged and public/protected event outcomes remain.
- Pure evidence: exact-clean Spark seed 7 on `e0600a7f` chose Road-Warden/Aid-Only/Hayden, held The Wolf-Winter by HUNT, and ended naturally at the first goal on decision 18; clarity/enjoyment 4/4, replay yes, bugs `[]`, not stuck.
- Self-critique/next: raw Civic choice surfaces showed the corrected pause row, but the player skipped that event, so build evidence complements rather than replaces causal regressions; the separate HUNT "commit" label and dense goal pause remain next evidence.
- Feedback/guard: status remains 2 actionable reports of 3, so no compile; 81 focused tests, compact signature/size, exact 732/732 opening budget, type/lint/format, 542 traces, and hostile audits are green, with outer gates still required.

### Cycle result - gallowmere_packet_launch_handoff
- Evidence choice: the compiler's mapped recommendation `9fe9a8ee` was the stronger bounded fix; the assessor's equal-score checkpoint pick describes an intentional, regression-pinned first safe boundary rather than a supported timing change.
- Surface/effect: embedded `quest_start:gallowmere` under the exact packet-carrying goal now returns a versioned receipt that Hayden's packet reached Hedrick and the hunt remains; full and compact starts share it.
- Fail-closed boundary: wardens, out-of-order, direct, and standalone starts never inherit packet copy, while the existing quest-start decision, parent snapshot, child state/hash, Gallowmere content, score, and ridge ending are unchanged.
- Pure evidence: exact-clean Spark seed 7 on `7445e078` chose Ledger Advocate, Exposed Ridge, and LURE, kept the whole herd and all wolves alive, then ended naturally at the first goal on decision 26; clarity/enjoyment 4/4, replay yes, bugs `[]`, not stuck.
- Self-critique/next: the canary did not continue to Gallowmere, so causal proof remains the full/compact regression rather than a claimed playtest uplift; its only friction was non-blocking advisory Civic event text beside the active Compact/quest lane.
- Feedback/guard: status remains 1 actionable report of 3, so no compile; 17 focused behavior/checkpoint tests, type/lint/format, 541 bug traces, and two hostile reviews are green, with the standard outer gates still mandatory.

### Cycle result - lure_lesson_return_disclosure
- Evidence choice: the assessor offered only a routine Advocates' Case rotation; the newest accepted player instead had to rediscover LURE after quick counsel, so this off-list navigation disclosure was the narrower evidence-backed move.
- Surface/effect: both pre-lesson LURE variants and the compact action now call counsel optional and state that it returns to the plan menu, where LURE must be selected again to commit; the existing two-step flow and every mechanic remain unchanged.
- Red-gate correction: a first direct-continuation attempt duplicated the authored +2 attack effect, weakened the conservative three-fight proof, failed health, and was reset; the retry changes exactly three strings, retains one buff source, and pins the real HP-28 red/HP-29 green boundary.
- Counterfactual: direct no-lesson commitment remains legal, while counsel still allows a HUNT pivot or any other uncommitted plan; full and compact tests execute both the same-plan reselect and HUNT-to-paling paths with the exact `03a87c97` to `ec51d609` hash roll.
- Pure evidence: exact-clean Spark seed 7 on `ca4accc5` chose Ledger Advocate, Full Compact Duty, Rowan's docket, Sheltered Stockway, and HUNT, held the byre through all three wolves, then ended naturally at the first goal on decision 19; clarity/enjoyment 4/4, replay yes, bugs `[]`, not stuck.
- Feedback/next: the prior three reports compiled as 3 actionable/0 mocks over an 819-report corpus and stage Gallowmere's implicit final packet handoff (`9fe9a8ee`) for the next cycle; this run remains one-cycle-lagged until sealing, and its setup/action-discovery notes are not widened into this fix.
- Guard: 43 focused regressions, all 12 packs, trace/type/lint/format/diff checks, two hostile audits, the pre-change crawl, and exact-build pure/compile authority are green; the standard outer post-crawl, health, and integrity bar remain mandatory before landing.

### Cycle result - wolf_alarm_threshold_consequence
- Evidence choice: the newly targetable accepted hotspot came from a successful pure LURE player who had to retain what alarm 4 meant; compact pressure repeatedly showed the boundary but dropped its authored consequence.
- Surface/effect: Wolf-Winter's minimum-4 band is now `Breaking: cattle missing`, so full, compact MCP, and UI next/current pressure views explain the threshold without a schema, mechanic, action, score, or ending change.
- Compatibility: the compiled Wolf hash rolls from its exact predecessor while state hashes and the inclusive alarm-3 whole-herd versus alarm-4 two-missing outcomes remain unchanged.
- Pure evidence: exact-clean Spark seed 7 on `481da537` chose Ledger Advocate, Sheltered Stockway, and LURE, kept the herd and all three wolves alive, ended naturally at the first goal on decision 23, and rated clarity/enjoyment 4/4 with replay yes and no bug or stuck state.
- Self-critique/next: the consequence-bearing label appeared throughout the route and alarm-threshold confusion did not recur, but one player proves build safety rather than broad pacing relief; staged byre actions and instructional density remain the next observed friction.
- Feedback/guard: pre-seal feedback remains 2/3 with no compile; independent hostile review, the post-change 6,000-step crawl, exact health (448 files/3,855 tests), all 12 packs, cycle-start integrity, and current-commit pure evidence are green.

### Cycle result - accepted_feedback_target_fallback
- Evidence choice: the accepted three-report compile loaded but all six fleet confusions were unmapped, so the assessor offered only routine maintenance and its exact recommended hotspot could never be selected or consumed; this off-list control-plane repair outranked another content tweak.
- Surface/effect: fleet-only unmapped feedback now inherits only one full-count, crawler-free accepted cohort scope (`overworld` or an exact shipped quest id); the live accepted alarm recommendation is again top-ranked at 2.5 without relabeling its location.
- Fail-closed guard: canonical locations still win, while absent/duplicate/multiple/zero/mismatched metrics, crawler or mixed sources, malformed targets, and unknown quest ids remain inert; the compiler's original top-three boundary is unchanged.
- Pure evidence: exact-clean Spark seed 7 on `2d58029e` completed The Wolf-Winter (`ending_held`) and The Gallowmere (`ending_hunt_won`), ended naturally at decision 52, rated clarity/enjoyment 4/4, replay-yes, with no bug or stuck state.
- Self-critique: the cohort target is deliberately broad launch-surface provenance, not proof of the issue's room; candidate evidence says when fallback was used, and a future schema can retain per-hotspot targets for finer attribution.
- Follow-through: the player found Gallowmere's final packet handoff slightly implicit; feedback is 1/3 with no compile, while the preserved accepted alarm hotspot is now actionable for the next cycle.

### Cycle result - loop_selection_rotation
- Evidence choice: the assessor offered only a clean Advocates' Case rotation; the live 15-entry boundary instead reproduced a deterministic finalization failure where trimming the 16th result archived the frozen feedback selection and made the seal reject.
- Surface/effect: a repo-local post-agent rotation now runs in both loop modes before post-change gates, relocates every parser-counted selection line into the live preamble, archives the remaining tail, and classifies any rotation failure for full cycle reset.
- Counterfactual: valid authority survives LF, CRLF, lone-CR, and Unicode separators unchanged; malformed, duplicate, indented, or prose-like reserved-token lines also stay live so the real seal rejects rather than laundering them through the ignored archive.
- Pure evidence: exact-clean Terra seed 10 on `35ef9df5` used Road-Warden/Aid-Only, June, and the dawn wagon, saved Cade's whole herd and every wolf by LURE, continued through checkpoint 41, won The Gallowmere, and ended naturally at decision 56; clarity/enjoyment 4/4, replay yes, no bug or stuck state.
- Feedback/next: the accepted three-report delta compiled 3 actionable/0 mocks and six tied S1 hot spots over an 816-report corpus; alarm-threshold consequences rank first, while this build's player still found Station support fragmented and the in-quest checkpoint abrupt, all reserved for the promoted next cycle.
- Guard: three independent hostile audits, 46 focused driver/rotation/real-seal tests, Bash syntax, typecheck, lint, formatting, trace/static integrity, and the exact-build pure gate are green; the standard post-crawl and full health bar remain mandatory for landing.

### Cycle result - civic_quick_setup_framing
- Evidence choice: the assessor offered only a clean Advocates' Case rotation; two accepted matched-path players independently reported layered role/duty/evidence setup, so this off-list cycle corrected the shared Civic briefing.
- Surface/effect: the role screen now previews only the crisis and a truthful optional matched finish; the matched screen combines duty + evidence, while Ledger keeps its real 2/3 then 3/3 path, with no option, mechanic, state, receipt, or decision change.
- Measured effect: the two default messages fell from 162 to 132 words and 1,054 to 855 characters; stale fixed-order fractions and premature June/support detail are absent, while exact shortcut inspection remains available.
- Pure evidence: exact-clean Terra seed 9 on `0fac1d36` used Road-Warden/Aid-Only/June, saved Cade's whole herd and every wolf by LURE, continued to repair the outer line, won The Gallowmere, and ended naturally at decision 52; clarity/enjoyment 4/4, replay yes, no bug, rejection, loop, or stuck state, and the Civic density complaint did not recur.
- Feedback/next: sealing this run makes three fresh actionable reports, ready for next cycle's compile; compact legends/tuples and the optional Station detail layer remain current friction, so this increment does not widen into either.
- Guard: three independent audits, 65 focused tests, both 6,000-step crawls, exact health (448 files/3,830 tests), UI typecheck, all 12 packs, cycle-start integrity, and current-commit pure gates are green.

### Cycle result - station_support_skip_stakes
- Evidence choice: the assessor was saturated and offered only a clean Advocates' Case rotation; the accepted current-build player instead cited uncertainty about skipping collapsed Station support, so this off-list cycle closed that narrower causal gap.
- Surface/effect: launch-first guidance now names one field kit, Albany's last relief wagon, and June as a cattle-first second rider, says departing is fastest and every Wolf-Winter strategy stays legal, while purposes/actions remain explicitly deferred.
- Pure evidence: exact-clean Terra seed 8 on `288699d6` chose Road-Warden/Aid-Only/Hayden, skipped support, took the fast Exposed Ridge, diverted all three wolves alive by LURE with the cattle safe, and ended at the first goal on decision 28; clarity/enjoyment 4/4, replay yes, no bug, rejection, loop, or stuck state, and Station uncertainty did not recur.
- Feedback queue: the prior accepted run plus this sealed run make two fresh actionable reports, still below the three-report compile threshold; no provisional feedback artifact was created.
- Self-critique/next: dense registration/duty/evidence setup and alarm-threshold interpretation remain the repeated current friction; measure and narrow that opening burden next rather than widening this copy-only increment.
- Guard: two independent audits, 78 focused presentation/MCP tests, pre/post 6,000-step crawls, exact health (448 files/3,828 tests), UI typecheck, all 12 packs, cycle-start integrity, and current-commit pure gates are green.

### Cycle result - accepted_feedback_cohorts
- Evidence choice: the assessor replayed a July debug-display hotspot that had already landed; this off-list tooling increment made only fresh, accepted feedback cohorts actionable.
- Surface/effect: stable pure/interview identities, mock quarantine, cumulative retention, canonical manifests, exact accepted digests, actual-selection consumption, seal-time deterministic rebuilds, start-ref authority checks, and explicit clean-clone rebootstrap now close the feedback lifecycle.
- Pure evidence: exact-clean Terra seed 7 on `31f7f5a8` diverted every Wolf-Winter wolf alive with Cade's herd intact, won The Gallowmere, continued at goals 26/49 and checkpoint 40, then ended naturally at decision 49; clarity/enjoyment 4/4, replay yes, no bug, rejection, or stuck state.
- Feedback baseline: bootstrap recorded 813 verified reports (62 pure, 302 structural, 449 legacy-guided; 220 rejected) with an empty ranked cohort, so historical volume cannot steer the next fix.
- Self-critique/next: Spark failed closed before gameplay and the first Terra build was discarded after health caught one prompt-contract mismatch; the replacement player again found dense opening setup and terse optional Station support, now the strongest current follow-up.
- Guard: three independent final audits, post-crawl 6,000-step sweep, exact health (448 files/3,828 tests), UI typecheck, all 12 packs, cycle-start integrity, and current-commit pure report gates are green.
