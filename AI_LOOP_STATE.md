# AI Loop State

<!-- historical_cycle_count: 626 -->

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

### Cycle result - checkpoint_safe_scene_boundaries

- Evidence choice: fixed journey thresholds could pause verified Gallowmere combat or active dialogue instead of waiting for the scene to resolve.
- Surface: a due checkpoint now waits through unsafe accepted decisions, then materializes at terminal state or a room with neither a live enemy nor active dialogue; an overdue threshold merges into goal completion or death, and Continue schedules the first fixed multiple after the surfaced decision.
- Counterfactual: an already-safe threshold still pauses immediately, combat/dialogue actions remain live while unsafe, non-counting scene closure can surface the checkpoint without changing decision proof, and save/restore plus compact/full MCP and UI projections preserve the deferred boundary.
- Pure evidence: exact clean `85269681` passes fresh strict-v2 Terra 4666 and Luna 4667; both divert Wolf-Winter, win Gallowmere, complete two goals, choose replay-yes, and report no rejected action or loop.
- Measured result: Terra rates clarity/enjoyment 4/4 with no checkpoint complaint; Luna rates 4/5 and says the safe point resumed correctly, while still disliking the room-transition pause during a broader investigation.
- Feedback/follow-through: Albany setup density and the Rowan collision remain separate queued increments; Luna's broader transition-pacing critique is retained rather than treated as a regression in safe-boundary scheduling.
- Guard: final crawl `ai-runs\crawl\20260723T151536Z` is zero-finding across 6,000 steps, 247/247 nodes, 344/344 edges, and 12/12 quests; combined focused coverage passes 17 files/218 tests.

### Cycle result - truthful_journey_continuation_horizon

- Evidence choice: journey prompts promised exactly 40 more decisions from every pause even though an active goal can complete sooner, while death is end-only and merged goal/checkpoint pauses have both causes.
- Surface: the shared contract and fresh-game tutorial now name the truthful earliest boundary—active-goal completion or the next fixed checkpoint—and project the same distinct goal, checkpoint, merged, and death copy through compact/full MCP and UI surfaces.
- Counterfactual: goal-only, checkpoint-only, merged, and death snapshots produce exact cause-specific choices; Continue preserves the next fixed horizon, End remains terminal, restored snapshots project byte-identically, and death never advertises Continue.
- Pure evidence: exact clean `a7884d54` passes fresh strict-v2 Terra 4665 across 63 turns and 51 accepted decisions, diverts Wolf-Winter's pack, wins Gallowmere, ends voluntarily at the second completed goal, rates clarity/enjoyment 4/5 and 5/5, remains unstuck, and chooses replay-yes.
- Feedback/follow-through: the player still experiences checkpoint 40 inside an active investigation and repeats Albany setup density plus Rowan Quill continuity confusion; safe-boundary checkpoint scheduling, progressive setup disclosure, and compact NPC display names remain separate queued increments.
- Guard: final crawl `20260723T133121Z` is zero-finding at 247/247 nodes, 344/344 edges, and 12/12 quests; focused projection coverage passes 81/81, independent review is clean, and supported two-worker full health passes 411 files/3,271 tests plus UI typecheck and all packs.

### Cycle result - literal_codex_blind_forwarding

- Evidence choice: current Codex evidence bound gameplay calls, completions, and visible bytes but still admitted broader executable wrapper shapes, leaving the player-forwarding proof larger than the one operation the game actually authorizes.
- Surface: every current live wrapper now has the exact transport pragma and one `text(await tools.mcp__adventureforge__<tool>({literalArgs}));` expression; capture schema 3 and fleet attestation schema 6 bind `strict-code-mode-v2` end to end.
- Counterfactual: aliases, variables, spreads, shorthand, computed keys, executable values, extra statements/comments, yields, truncation, wrong tools, and mismatched arguments/results fail closed; historical strict-v1 remains readable but cannot resume or certify current cohorts.
- Pure evidence: exact clean `0890ee96` passes fresh strict-v2 Terra 4664 and Luna 4663; both complete Wolf-Winter, Terra completes two goals in 42 decisions, and Luna completes five goals before ending at checkpoint 120.
- Measured result: Terra rates clarity/enjoyment 4/4 and Luna 4/5, both are unstuck and replay-yes; one malformed Luna handle is rejected without state change, and its copied receipt mismatch is replaced deterministically with the exact server receipt without another model turn.
- Feedback/follow-through: Albany setup density repeats, Terra exposes a checkpoint interrupting live Gallowmere combat, and Sol 4662 exposed Cade's raw NPC id; progressive disclosure, safe-boundary checkpoint scheduling, and compact NPC display names remain separate queued increments.
- Guard: final crawl `20260723T120716Z` is zero-finding at 247/247 nodes, 344/344 edges, and 12/12 quests; focused transport coverage passes 189/189, independent review is clean, and full health passes 411 files/3,269 tests plus UI typecheck and all packs.

### Cycle result - certified_quest_anchor_route_truth

- Evidence choice: a certified Wolf-Winter lead named Albany's Station Quarter while its route could remain hidden until an unrelated discovery, contradicting the player's accepted proof.
- Surface: directly certifying any quest now reveals exactly that quest's authored anchor area, so CLI, MCP, and UI guidance can immediately route the player without a Wolf-specific rule.
- Counterfactual: unselected quests and other areas remain hidden, ordinary discovery keeps its FIFO order, and arbitrary non-prefix route splices still fail replay authority; only the proof-certified anchor may appear outside the prior prefix.
- Persistence: exact legacy saves missing only their derived certified anchor migrate on restore, while removal, reordering, unrelated insertion, and uncertified-anchor tampering fail closed.
- Pure evidence: exact clean `04b8961a` passes four fresh Terra sessions (4651/4655/4656/4657); all complete Wolf-Winter in 26–28 decisions, divert every wolf alive with the herd whole, and choose to continue.
- Measured result: four pure exits compile to 100% continuation and replay intent, clarity 3.75/5 and enjoyment 4/5, with no rejected action, loop, broken state, death, or soft-lock.
- Feedback/follow-through: all four repeat Albany setup density; June briefing then progressive preparation/allocation disclosure remain separate queued increments, with comparison cues added only if a post-fix cohort still needs them.
- Guard: post-change crawl is zero-finding at 247/247 nodes, 344/344 edges, and 12/12 quests; independent review is clean, focused counterfactual coverage passes, and full health passes 411 files/3,266 tests plus UI typecheck and all packs.

### Cycle result - frost_jamb_route_truth

- Evidence choice: Hayden's source briefing named the Frost-Heave recovery without its real ordinary-hunt, public-wedge, failed-rail, unbound-leave, yearling-kill, and bare-spear gates; Works splicing and a lure hybrid could also leak the rail state.
- Surface: the packet now states that exact causal chain, Works preparation owns a separate splice fact, and the lure hybrid cannot advertise or enter the Frost-jamb recovery.
- Counterfactual: only Hayden plus a failed/split ordinary rail exposes the route; braced rail, Works splice, lure commitment, other packets, retained bindings, living yearling, or extra gear each suppress the matching step, while exact predecessor snapshots migrate to the new authored copy.
- Pure evidence: exact clean gameplay candidate `ffa065df` passes strict capture-v2 Terra 4637 across 52 turns and 40 accepted decisions, chooses Hayden's report, recovers a failed lure cast, diverts all three wolves alive with the herd whole, continues at goal 29, and ends voluntarily at checkpoint 40.
- Measured result: clarity/enjoyment 4/4, unstuck, replay-yes, with no rejected action, loop, broken state, or soft-lock; source-blind 4623 separately reaches the failed-split Frost route and a living held ending.
- Feedback/follow-through: conditional setup density and the decision-40 interruption recur; a six-report compile confirms progressive disclosure, June briefing, and truthful continuation copy as separate queued increments rather than expanding this route fix.
- Guard: post-change crawl is zero-finding at 247/247 nodes, 344/344 edges, and 12/12 quests; semantic variant liveness passes 17/17, independent no-weakening review is clean, and solo full health passes 411 files/3,265 tests plus UI typecheck and all packs.

### Cycle result - rpg_terminal_command_projection

- Evidence choice: terminal RPG menus exposed descriptive ASK prose as if executable, hid visible speakers, parsed launch numbers permissively, and made authored `leave` collide with quest abandonment; blind seed 4621 also found `actions` worked only inside the quest loop.
- Surface: standalone and embedded play now share context-aware executable commands, concise dialogue topics, exact/unique visible-speaker asks, legal contextual `wear`, truthful people lists, exact quest-launch choices, and overworld-wide `actions` help.
- Counterfactual: colliding topics, object aliases, and loop-control words fail closed to stable `choose <action-id>` commands; absent/ambiguous/wrong speakers reject without state change, while legal Cade `leave` executes before unmatched legacy `leave` abandons.
- Pure evidence: exact clean `c9d16419` passes strict capture-v2 Terra 4629 across 62 turns and 52 accepted decisions, diverts Wolf-Winter bloodlessly, wins Gallowmere, continues at goal 27/checkpoint 40, then ends voluntarily at goal 52.
- Measured result: every wolf and cow survives the lure, a failed Gallowmere tracking check has a clear recovery, and the player reports no rejection, loop, broken state, or soft-lock; clarity/enjoyment 4/4, unstuck, replay-yes.
- Feedback/follow-through: Queensbury route revelation and dense Albany setup remain the current friction; verified progressive-disclosure and June-guidance follow-ups stay separate, while Frost-Heave's hash-safe landing must precede conditional preview truth.
- Guard: post-change crawl is zero-finding at 247/247 nodes, 344/344 edges, and 12/12 quests; 48 focused regressions, independent clean re-review, and supported CI two-worker health pass 410 files/3,259 tests plus UI typecheck and all packs.

### Cycle result - cli_journey_gate_authority

- Evidence choice: the human overworld CLI could hide mandatory story/retention decisions, omit the current goal and passage, and misdescribe discovered work after restore; blind players then guessed commands instead of deciding from game-presented consequences.
- Surface: story and Continue/End gates now preempt ordinary actions, accept numbered/full-label/exact-id choices, render consequences, preserve safe inspection/save/load, expose goal guidance and forecast, execute `follow goal`, and restore ended journeys as read-only receipts.
- Counterfactual: partial gate guesses fail closed; local future, completed, remote, and duplicate-title jobs receive distinct truthful messages with exact ids for ambiguity; real save/restore histories prove each branch without synthetic state.
- Pure evidence: exact tracked-clean `6eed4748` passes strict capture-v2 Terra 4592 across 65 turns and 55 accepted decisions, completes Wolf-Winter and Gallowmere, continues at goal 30/checkpoint 40, and ends voluntarily at goal 55.
- Measured result: the player recovers from a failed first feed cast, diverts every wolf alive with the herd whole, recovers from a failed spoor read, rates clarity/enjoyment 4/4, remains unstuck, and chooses replay-yes with no rejected action, loop, or broken state.
- Feedback/follow-through: serial permanent setup density and compact-state load remain the strongest friction; command projection and progressive disclosure stay queued as separate increments rather than expanding this CLI authority change.
- Guard: fresh post-change crawl is zero-finding at 247/247 nodes, 344/344 edges, and 12/12 quests; 23 focused CLI regressions, clean independent re-review, and full health pass 408 files/3,242 tests plus UI typecheck and all packs.

### Cycle result - codex_only_outer_loop

- Evidence choice: the recurring app false-positive banner coincided with an obsolete outer-loop provider fallback, raw login-file probe, and stale default-provider prose; routine TTRPG development now uses Codex and fresh Codex subagents.
- Surface: `loop.sh` resolves an explicit `AI_AGENT_CMD` first and otherwise only the installed Codex CLI, with no credential-file inspection or automatic external-model fallback; explicit historical blind-provider compatibility remains separate.
- Counterfactual: regression proves the explicit override wins, installed Codex resolves automatically, and the automatic resolver contains neither the retired provider nor an `auth.json` probe; absent Codex still yields evidence-only, while continuous execution and every verification/commit gate remain unchanged.
- Pure evidence: exact tracked-clean candidate `355fcbcd` passes strict capture-v2 Terra 4586 at 61/61 calls and 47 accepted decisions, completes Wolf-Winter plus Gallowmere, continues at goal 23/checkpoint 40, ends voluntarily at goal 47, rates clarity/enjoyment 4/4, remains unstuck, and chooses replay-yes.
- Measured result: the exact world remains `282cf14228d10495a12632919a50567960d06325e9182aa77232fc1c333d0aa9`; the player fortifies Cade's byre bloodlessly, recovers from a failed Gallowmere spoor check, and reports no rejection, loop, broken state, or soft-lock.
- Feedback/follow-through: dense permanent registration text and the decision-40 interruption recur; progressive disclosure and truthful checkpoint work remain queued rather than being mixed into this automation-only increment.
- Guard: post-change crawl is zero-finding at 247/247 nodes, 344/344 edges, and 12/12 quests; 15 focused loop tests, independent no-P0-P2 re-review, and supported two-worker health pass 408 files/3,227 tests plus UI typecheck and pack validation.

### Cycle result - audited_codex_code_mode

- Evidence choice: ten Spark 4420-4429 runs published nothing after direct-mode tool drift, while later code-mode cohorts exposed unauthenticated prelude notices, malformed wrappers, and exact MCP tool errors that the successful-result-only audit could not represent.
- Surface: live Codex runs force `code_mode_only`; capture v2 authenticates the exact model prelude, sole leading 120s pragma, `result` declaration, JSON emitter, and byte-identical success/error lifecycle, while fleet attestation v5 carries the same contract.
- Counterfactual: capture v1 and attestations v3/v4 remain historical-readable but cannot resume or certify a current authority cohort; altered notices/pragma/identifier/emitter, extra comments or keys, wrong ids/cwd, missing completions, and public/private status or byte mismatches fail closed.
- Pure evidence: exact candidate `9abbbd4d` passes first-attempt strict capture-v2 Sol 4582 at 72/72 calls and 54 decisions and Terra 4583 at 61/61 calls and 51 decisions; both divert Wolf-Winter, win Gallowmere, end voluntarily, rate 4/4, remain unstuck, and choose replay-yes.
- Measured result: 67 deduplicated completed Spark streams used 283,771,470 input-plus-output tokens; the combined 4500-4509 pilot removes the original preview-option defect in 10/10 and raises strict validity from 1/20 to 3/10, while wrapper generation remains the seven-run residual and the final 100 quota-closed preplay launches are excluded.
- Feedback/follow-through: strict compile `20260722T175728Z` has five eligible pure exits, all clarity/enjoyment 4/4 and replay-yes; event-choice authority proceeds separately, and Spark resumes only after its provider reset rather than being mistaken for an authentication failure.
- Guard: post-change crawl is zero-finding at 247/247 nodes, 344/344 edges, and 12/12 quests; focused passes cover 231 tests plus a 153-test correction pass, independent adversarial re-review finds no P0-P2, and supported CI two-worker health passes 408 files/3,224 tests plus UI typecheck and pack validation.

### Cycle result - wolf_actor_neutral_gate_guidance

- Evidence choice: exact-clean Terra 4411 had no June flag or companion, yet the full untruncated Wolf-Winter north block named "June's gate terms" at decisions 13 and 21 while mechanics correctly waited only for pre-cast feed and then the lure's second cast.
- Surface: the single static block is now a 171-character actor-neutral list of explicitly alternative live steps—hunt-and-hold warning, committed route resources, or the lure's second loft cast—with no predicate, state, mechanic, balance, or action change.
- Counterfactual: no-June LURE/DRIVE/Cade-FORTIFY/Albany-FORTIFY states name relevant work without inventing June; accepted-June keep-terms remains effect-free and blocked, acknowledging combat opens HUNT, and relay/solo/ignored-choice launches remain June-free and open.
- Pure evidence: exact-clean Terra 4431 publishes strict `ok: true` across 61/61 pragma-bound calls and 50 decisions, sees the corrected no-June block twice, diverts all three wolves with the herd whole, wins Gallowmere, continues at goal 27/checkpoint 40, and ends voluntarily; clarity/enjoyment 4/4, unstuck, replay-yes.
- Diagnostic only: Sol 4414 and Terra 4415 yielded under the retired foreground budget, Luna 4416 timed out, and fresh Luna 4430 invokes unavailable `move_overworld_session` at call 135 after an earlier stream retry; the unchanged immediate-completion audit rejects it, so every route, retention choice, rating, and finding from all four remains excluded.
- Measured result: two independent exact-diff reviews find no P0-P2 after correcting "first-lure" to the authored "second cast" term; four route-matrix suites pass 15 tests, while valid 4431 independently repeats opening density and June-seat briefing debt for separate cycles.
- Guard: pre/post 6,000-step crawls remain zero-finding at 247/247 nodes, 344/344 edges, and 12/12 quests; full combined health passes 408 files/3,204 tests plus integrity, both typechecks, lint, format, validation, and Wolf hash `999f3882c25ba9777b0597afb6ee1ba70616987a9725ed590639476b1a8b4fa5`.

### Cycle result - codex_blind_exec_foreground_window

- Evidence choice: strict candidates 4412, 4414, and 4415 crossed the default foreground-yield boundary at 11.364s, 10.591s, and 11.961s; their late MCP completions correctly failed authority, while valid 4413 landed only 0.191s beyond the same race boundary.
- Surface: every live Codex gameplay wrapper now starts with the exact `// @exec: {"yield_time_ms": 120000}` pragma, followed by the unchanged two executable statements; `functions.wait` is explicitly forbidden and a yielded or wedged wrapper remains invalid.
- Counterfactual: parser, capture, validator, runner, authentication, game surfaces, 60s MCP timeout, and 1,200s outer run timeout are unchanged; historical pragma-free evidence remains readable, while a realistic yield -> late completion -> reasoning -> wait fixture rejects with the unchanged immediate-completion diagnostic.
- Pure evidence: exact-clean Sol 4417 and Terra 4418 both publish strict `ok: true`; all 136/136 gameplay wrappers carry the pragma with zero waits, running-cell outputs, incomplete calls, failures, retries, or recovery, and both players complete Wolf-Winter plus Gallowmere before ending voluntarily at 55/51 decisions.
- Measured result: both canaries continue at the first goal and checkpoint, rate clarity/enjoyment 4/4, remain unstuck/replay-yes, and independently retain opening-choice density as the next design signal; two no-weaken reviews find no P0-P2, while six focused suites pass 161 tests across exactly five documentation/test files.
- Diagnostic only: Spark 4420-4429 consume 13,841,258 input/117,730 output tokens but publish 0/10 after direct-mode calls hit forbidden servers, resources, or item types; 196 raw gameplay calls remain excluded, and a separate forced-code-mode runner cycle is required before more Spark evidence.
- Guard: pre/post 6,000-step crawls remain zero-finding at 247/247 nodes, 344/344 edges, and 12/12 quests; full health passes 408 files/3,204 tests plus integrity, both typechecks, lint, format, validation, and clean diff.

### Cycle result - compact_player_prose_fidelity

- Evidence choice: five recent exact-clean cohorts carried truncation chrome in 187/481 compact MCP responses; restoring the observed repeated prose would add only ~45,358 characters, 1.55% of their existing payload, while journal memory also leaked collision hashes intended for identifiers.
- Surface: compact event/observation/state/overworld contracts advance to v7/v18/v2/v28, every shipped player-facing body now fits its bounded transport, and one 320-character visible journal compactor replaces identity hashing across event, state, observation, transcript, and session-summary routes.
- Counterfactual: ids retain hashed collision safety; list caps, omission counts, legality, state, mechanics, balance, and pure prompts are unchanged; scalar-safe clipping preserves Unicode boundaries and exact code-unit omission counts for future oversized prose.
- Pure evidence: exact-clean Terra 4413 verifies `ok: true` across 47 completed calls/40 decisions, diverts every Wolf-Winter wolf alive with Cade's herd whole, continues at goal 29, and exits voluntarily at checkpoint 40; no literal prose truncation or hash mismatch appears, clarity/enjoyment are 3/4, unstuck, replay-no.
- Diagnostic only: Sol 4412 remains unpublished and excluded after its first wrapper yielded before the MCP completion, correctly failing the unchanged immediate-completion audit; its play, ratings, findings, and token count are not evidence.
- Measured result: the unique shipped corpus restores 39,009 characters across all 12 quests and every real overworld/opening/service/road route; two independent re-reviews find no P0-P2, and 15 focused suites pass 242 tests under fixed 9k RPG/12k overworld response ceilings.
- Guard: pre/post 6,000-step crawls remain zero-finding at 247/247 nodes, 344/344 edges, and 12/12 quests; full health passes 408 files/3,201 tests plus integrity, both typechecks, lint, format, validation, and clean diff.

### Cycle result - overworld_service_action_surface

- Evidence choice: exact-clean Luna 4401 and 4407 independently crossed multiple service towns at zero supplies/rising fatigue without using recovery, while the latter explicitly refused to invent an action omitted from the current compact response; retained 4346/4349 corroborate the same discoverability split.
- Surface: one canonical planner-backed `serviceActions` projection now drives full view, compact v27 `service_actions`, MCP, and focusable UI controls with exact availability, time, before/after resources, consequence, and unavailable reason; authored `service_offers` remain distinct informational terms.
- Counterfactual: pending road/journey/story states suppress calls truthfully, one-time campaign overrides and zero-cost no-ops reuse the same lifecycle identity as execution, consumed overrides fall back to ordinary town services, and clone/save/restore/direct-compact parity preserve every preview without changing balance.
- Pure evidence: exact-clean Terra 4411 verifies `ok: true` across 52 error-free calls/40 decisions, uses the newly surfaced resupply action, diverts every Wolf-Winter wolf alive with Cade's herd whole, and exits voluntarily at checkpoint 40; clarity/enjoyment are 4/4, unstuck, replay-yes.
- Diagnostic only: Sol 4408 and Luna 4410 failed the unchanged immediate-completion forwarding audit, while Terra 4409 failed report publication at an explicit output prefix; all three runs, ratings, findings, and token counts remain unpublished and excluded.
- Measured result: two parallel exact-commit reviews find no P0-P2 across the planner trust boundary and UI/compact accessibility; seven focused files pass 144 tests after rebasing onto merged post-cast truth.
- Guard: post-change crawl remains zero-finding across 6,000 steps, 247/247 nodes, 344/344 edges, and 12/12 quests; full health passes 407 files/3,177 tests plus integrity, both typechecks, lint, format, validation, and clean diff.

### Cycle result - wolf_postcast_state_truth

- Evidence choice: exact-clean strict Sol 4402 exposed three mutually corroborating Wolf-Winter state/prose faults after successful LURE casts, and a full route audit found the same contradictions in clean, recovered, and hybrid paths rather than treating one transcript as sufficient.
- Surface: Fodder-Loft and its hatch now switch to completed-cast prose, Deep Byre gives pending-final-LURE text before every guard/combat variant, and the post-final pack account distinguishes a dead yearling from two living younger wolves.
- Counterfactual: June-unresolved retains first precedence; clean, split, braced, hybrid retained-guard, Jamie, ordinary hunt, DRIVE, FORTIFY, full/compact, and post-final states are disjoint and truthful; production changes add no effects, gates, resources, scores, actions, or ending semantics.
- Pure evidence: exact-clean Sol 4404 verifies `ok: true` across 70 error-free calls/48 decisions, fortifies Wolf-Winter under Albany authority and wins Gallowmere; Luna 4407 verifies across 125 decisions, diverts the pack, wins Gallowmere, recovers Tanner, and holds Breaking Weir; both rate 4/4, unstuck, replay-yes, without repeating the corrected post-cast contradictions.
- Diagnostic only: Terra 4405/4406 remain unpublished and excluded after truncated/malformed forwarding wrappers correctly failed the exact-program audit; neither candidate play, rating, finding, or token count is evidence.
- Measured result: independent exact-commit review finds no P0-P2 across 8 files/50 tests, every declared Wolf variant remains first-match reachable, and the fresh valid cohort moves remaining work to broader truncation, opening density, continuity, stale-menu recovery, and late-journey resupply rather than expanding this increment.
- Guard: the 6,000-step post-change crawl remains zero-finding at 247/247 nodes, 344/344 edges, and 12/12 quests; full repaired-environment health passes 407 files/3,175 tests plus integrity, lint, format, compact limits, both typechecks, and all 12 packs with Wolf hash `48085079f5e6247f54caf9f0064f7dc60dc488511e1e351a526f72f87aa8e24d`.

### Cycle result - wolf_live_gate_and_june_closure

- Evidence choice: independent strict Sol runs 4334 and 4387 found the same Wolf-Winter presentation fault—north repeated a stale LURE route outside its live state, while June accepted cattle-first terms with a generic close that did not explain what remained open.
- Surface: north now states only its exhaustive live preconditions, and asking June to keep cattle-first terms reaches an authored confirmation that says no strategy was committed, names Cade's three living plans, and truthfully keeps north closed.
- Counterfactual: the confirmation has no effects, flags, journal write, or journey count; LURE, DRIVE, and FORTIFY remain available, every genuine gate-opening state still opens north exactly once, and failed lure recovery remains intact.
- Pure evidence: exact-clean Sol 4402 verifies `ok: true` across 55 error-free calls/40 decisions, diverts every wolf with the herd whole, continues at goal 34, and ends at checkpoint 40; Terra 4403 verifies across 62 calls/47 decisions, fortifies under Cade's terms, wins Gallowmere, continues at 23/40, and ends at goal 47; both rate 4/4, unstuck, replay-yes.
- Measured result: independent review finds no P0-P2 across 32 files/182 tests; strict compile `20260722T085747Z` reaches 810 verified/218 rejected reports and 59 current pure exits with 57 continuing, while the fresh cohort queues post-cast Loft/Byre prose and compact clipping for later cycles instead of expanding this increment.
- Guard: the 6,000-step post-change crawl remains zero-finding at 247/247 nodes, 344/344 edges, and 12/12 quests; full health passes 406 files/3,169 tests plus both typechecks/all packs with no schema, engine, save, world, combat, or ending-semantics change.
