# AI Loop State

- Current objective: Make AdventureForge safe for bounded, MCP-driven AFK improvement loops.
- Last completed improvement: Added this durable state file as the handoff point for autonomous cycles.
- Evidence summary: Baseline `npm run lint`, `npm test`, and `npm run validate -- content/cyoa/pack/watchtower_road.yaml` passed before AFK loop changes. `npm run health` was missing and is now a required gate.
- MCP playtest notes: The shipped MCP server already exposed core AdventureForge tools; the AFK pass adds goal-compatible aliases and transcript/playtest summaries.
- What improved: Future agents have explicit MCP play requirements, ignored scratch evidence, and a bounded loop entry point.
- What still feels weak: The loop can gather evidence and verify routes, but it intentionally keeps code/content edits conservative and does not invent broad autonomous rewrites.
- Highest-priority next task: Run the bounded loop and use its evidence to pick one small discoverability or transcript-quality improvement.
- Risks/blockers: Repo-local `CODEX_HOME=$PWD/.codex` does not include user auth by default; unattended Codex invocation may need the operator's configured auth or an external runner. Plain `npm run mcp` writes npm banner output, so repo-local MCP launch uses `npm --silent run mcp`.
- Repeated agent mistake to avoid: Do not claim playtesting from validator output alone; actual route decisions must go through MCP tools.

## Current OpenAI/Codex Notes

- Codex CLI inspected locally: `codex-cli 0.135.0`.
- Official OpenAI docs say Codex supports non-interactive execution through `codex exec`, MCP server configuration, workspace-write sandboxing, and goal mode across Codex surfaces.
- Official ChatGPT help says GPT-5.5 is current in ChatGPT as of May 2026; GPT-5.5 Thinking is the deeper reasoning option, GPT-5.5 Pro is for hardest long-running work, and GPT-5.5 is available in Codex for eligible users. GPT-5.5 is not necessarily available through API deployments.

## AFK Cycle 2026-05-31T23-42-57-799Z

- Current objective: Keep AdventureForge ready for MCP-driven AFK improvement loops on content/cyoa/pack/watchtower_road.yaml.
- Last completed improvement: Generated MCP evidence through list_stories, validate_story, random/coverage run_playtest, true-ending regression, and exploratory play.
- Evidence summary: random ended 0/100; coverage ended 100/100; coverage unvisited scenes abandoned_cart, brook_ford, cellar, cellar_door, confront_smuggler, decision_point, hermit_about_letter, hermit_about_tower, hermit_camp, hermit_talk, hidden_cache, mossy_brook, signal_fire.
- MCP playtest notes: true route ended at ending_truth; exploratory ended at ruined_watchtower.
- What improved: The loop now records compact JSON evidence under ignored ai-runs/ and keeps durable state here.
- What still feels weak: Improve discoverability for abandoned_cart.
- Highest-priority next task: Improve discoverability for abandoned_cart.
- Risks/blockers: Preserve uncommitted user content and avoid committing ai-runs/ evidence.
- Repeated mistake to avoid: Do not treat CLI-only validation as playtesting; use MCP tools for the actual game loop.

## AFK Cycle 2026-05-31T23-44-13-797Z

- Current objective: Keep AdventureForge ready for MCP-driven AFK improvement loops on content/cyoa/pack/watchtower_road.yaml.
- Last completed improvement: Generated MCP evidence through list_stories, validate_story, random/coverage run_playtest, true-ending regression, and exploratory play.
- Evidence summary: random ended 11/100; coverage ended 2/100; coverage unvisited scenes cellar, confront_smuggler, hermit_about_letter, hermit_about_tower, hermit_camp, hermit_talk, hidden_cache, signal_fire.
- MCP playtest notes: true route ended at ending_truth; exploratory ended at ruined_watchtower.
- What improved: The loop now records compact JSON evidence under ignored ai-runs/ and keeps durable state here.
- What still feels weak: Improve discoverability for cellar.
- Highest-priority next task: Improve discoverability for cellar.
- Risks/blockers: Preserve uncommitted user content and avoid committing ai-runs/ evidence.
- Repeated mistake to avoid: Do not treat CLI-only validation as playtesting; use MCP tools for the actual game loop.

## AFK Cycle 2026-05-31T23-48-04-750Z

- Current objective: Keep AdventureForge ready for MCP-driven AFK improvement loops on content/cyoa/pack/watchtower_road.yaml.
- Last completed improvement: Generated MCP evidence through list_stories, validate_story, random/coverage run_playtest, true-ending regression, and exploratory play.
- Evidence summary: random ended 11/100; coverage ended 2/100; coverage unvisited scenes cellar, confront_smuggler, hermit_about_letter, hermit_about_tower, hermit_camp, hermit_talk, hidden_cache, signal_fire.
- MCP playtest notes: true route ended at ending_truth; exploratory ended at ruined_watchtower.
- What improved: The loop now records compact JSON evidence under ignored ai-runs/ and keeps durable state here.
- What still feels weak: Improve discoverability for cellar.
- Highest-priority next task: Improve discoverability for cellar.
- Risks/blockers: Preserve uncommitted user content and avoid committing ai-runs/ evidence.
- Repeated mistake to avoid: Do not treat CLI-only validation as playtesting; use MCP tools for the actual game loop.

## Cycle 2026-06-01 — blind playtest loop closed (bug_0002)

- Ran the blind-playtest step per docs/blind_playtest_protocol.md (fresh subagent, MCP-only, no source access) twice on watchtower_road seed 7.
- Findings fixed (content/hint, all re-validated green, locked by tests/regression/watchtower_blind_fixes.test.ts + traces/bugs/bug_0002): stale cart text, stale cellar-door text, duplicate cellar journal (on_enter→scene text), ledger now a carried item + path-agnostic ending_truth, ungated the visible cellar "gap in the wall", de-misleading decision_point framing.
- Second blind run confirmed duplicate_journal and ledger issues resolved; the good ending now reads as earned.
- Deferred (structural, next cycle — see bug_0002 deferred_findings): the decision_point↔road_north↔checkpoint orbit and the payoff-less confront_smuggler dead-end. These are flow/design tightenings, not faults; gating is correct.
- Protocol is now wired into AGENTS.md and the ai-loop generated agent-prompt, so future cycles run the blind subagent step automatically.
- Pack content hash: e83eef5a3e12d55df5df576f9b893dc7134d13897f5a99dfdf2db2790ebe1c5e.

## Cycle 2026-06-01b — deferred structural findings resolved (bug_0002)

- Tackled the two deferred structural findings from the blind playtest.
- confront_smuggler dead-end → real stakes: press_bluff (no proof) → ending_captured; reveal_evidence (proof) → win path; back_off reframed as retreat-to-gather-proof. No node is a no-op dead-end now.
- decision_point↔road_north↔checkpoint orbit → broken for the prepared player: turn_back gated on not_flag learned_truth, so with proof you must commit (expose/slip_away); without proof a signposted back-path to find proof remains, slip_away always exits (no soft-lock).
- Locked by tests/regression/watchtower_blind_fixes.test.ts (describe "bug_0002 deferred"); content hash 4188f7de58079146e00af8c5505094df19540af9d137a3736e26332d197820f0. 174 tests + health green.

### Verification (blind run, seed 7) — structural findings CONFIRMED resolved
- Blind playtester confirmed the checkpoint/town-edge region "is NOT pointless orbiting" and the guard confrontation "produces clearly different, meaningful outcomes" with vs. without evidence. Both deferred findings closed.
- New findings for a future cycle (logged, not yet fixed — narrative payoff/continuity, not structural):
  1. reveal_evidence (confront_smuggler) → decision_point is a silent teleport; the standoff's most dramatic beat has no on-screen payoff. Add a resolving narration/journal line.
  2. Ledger is never presentable at the checkpoint (only the sealed letter is); the letter/ledger relationship is muddled.
  3. "broken seal" is referenced (press_bluff text + ending_truth) but no action ever opens the letter — dangling mechanic / continuity slip.
  4. Hermit tower-lore (hermit_about_tower) sets no flag/journal — optional flavor with no mechanical hook.
  5. Cosmetic: search_rubble / search_cache remain offered after the cart/cache are emptied (re-entry shows an empty room).

## Cycle 2026-06-01c — verifier-integrity guard (trust-but-verify keystone)

- Reviewed sibling AFK loops (zork-unlimited-2: bash outer/inner cycle, self-healing autopilot, multi-persona, seed+hash determinism, but unconditional `git add .`; zork-unlimited-3: evidence-driven prompts, MCP evidence, health gate, hardcoded true-ending canary, post-agent verify-before-commit/push) and web-researched 2025–26 AFK techniques (Ralph loop, four-stage gather→act→verify→repeat, Stop-hook gates, EvilGenie reward-hacking + "forbid touching the verifier", externalized state, iteration/cost caps, worktree-per-task).
- Decision (aligned to our trust-but-verify philosophy): implemented the research's #2 technique — enforce "don't route around the verifier" — which neither sibling has. scripts/verify-integrity.ts: static mode (protected assets present, no .skip/.only/.todo/xit, test-count floor 120) wired into health + CI + npm test; drift mode (--against <ref>) wired into loop.sh as refuse-and-surface (halt + leave uncommitted for review) on protected-file edits or silent hash re-pins, overridable via AI_LOOP_ALLOW_VERIFIER_EDITS=1.
- Honest limit: catches mechanical tampering (skip/delete/empty/re-pin), not semantic weakening (needs LLM-judge, future). 195 tests + health green.
- Next AFK candidates from the research, ranked: (1) Milestone 2 multi-mode loop generalization (rotate packs/modes — M1 unblocked it); (2) fresh-context adversarial /code-review of the diff before "done"; (3) iteration/budget + cost caps; (4) worktree-per-task isolation.
## Cycle 2026-06-01d — best AFK loop implemented

- Built the loop's brain: src/afk/assessor.ts ranks the next-best improvement across content_fix / content_new / engine / repo from real signals (per-pack coverage playtests, validator warnings, mode thinness, engine TODOs, tooling gaps). `npm run assess` prints the backlog; deterministic + unit-tested.
- Rewrote src/ai-loop.ts to drive off the assessor (dropped the brittle hardcoded watchtower route), pick a playtest target, emit a cycle prompt that MANDATES a blind LLM playtest each cycle, and record artifacts under ai-runs/.
- loop.sh enforces the mandate: require_playtest_record refuses to commit a cycle with no blind-playtest report; health + verify:integrity drift gate already block red/verifier-tampering work. Full doc: docs/afk_loop.md.
- A separate transient run produced the bug_0003 cellar-discoverability fix on watchtower concurrently (see the cycle note below); I kept my AFK-loop commit scoped to its own files and reconciled bug_0003 separately. Its re-pin (watchtower hash → c49b4424…, rpg_validator.test.ts) is deliberate and surfaced, not laundered.

## AFK Cycle 2026-06-01 — cellar discoverability (bug_0003)
- Target: content/cyoa/pack/watchtower_road.yaml, seed 13.
- Blind subagent attempt: codex exec could not initialize its app-server client in this sandbox; claude -p was installed but not logged in. No prose-only substitute was used.
- MCP evidence used: createToolApi run_playtest coverage, 100 runs. Before fix: cellar_door visited, but cellar/hidden_cache unvisited and samples looped tower_base ↔ abandoned_cart after the cart was exhausted.
- Fix: lantern pickup journal now points to the cellar stair; abandoned_cart offers carry_lantern_to_cellar; search_rubble hides once both cart items are carried; search_cache/descend_cellar hide after ledger pickup so the cellar route exits cleanly.
- Result: coverage 100/100 ended; endings {"ending_captured":1,"ending_escape":1,"ending_truth":98}; cellar and hidden_cache now visited; no suspicious samples.
- Locked by traces/bugs/bug_0003_watchtower_cellar_discoverability.yaml and tests/regression/watchtower_cellar_discoverability.test.ts. Content hash now c49b4424ce8ed334324c714ed0d02de9d7260e7b332481b2050b33aec4b51e91.
- Next weak spots: hermit conversation still unvisited by coverage; confront_smuggler remains low-coverage optional path.
## AFK Cycle 2026-06-01T04-59-00-714Z
- Assessment: packs cyoa=2 parser=2 rpg=1; 7 candidate(s) ranked.
- Next best improvement (recommended): [content_fix] Improve "watchtower_road_v1" — 0 unreached ending(s), 5 unvisited location(s).
- Why: An LLM playtest can pinpoint why these are hard to reach (signposting, clue legibility, pacing) and the fix raises player-facing quality.
- Mandatory LLM playtest target this cycle: content/cyoa/pack/watchtower_road.yaml.
- Process: assessor ranks → blind LLM playtest for quality → one improvement → health + verify:integrity green → commit (trust-but-verify).

### Cycle result — hermit lore journaled + de-looped (bug_0004)
- Blind LLM playtest: fresh general-purpose subagent, MCP-only, seed 23, report at ai-runs/2026-06-01T04-59-00-714Z/playtest.md. Reached all 3 endings; clarity 4/5, enjoyment 4/5. Mechanics clean (zero rejected actions, no soft-locks).
- Findings the playtest surfaced in the hermit cluster (the same scenes the assessor flagged as coverage-bot-unvisited): (1) hermit_about_tower delivers the west route's biggest reveal but journaled NOTHING (set only met_hermit); (2) "Ask about the burning tower" was re-askable, looping the identical lore line.
- Improvement (one, content layer): hermit_about_tower.on_enter now sets heard_hermit_lore + adds a journal entry (framed as hearsay pointing to the tower cellar); ask_about_tower gated on not_flag heard_hermit_lore so the lore is delivered exactly once and can't loop or restack the journal. Deliberately does NOT grant learned_truth — the knowledge-vs-proof gate fencing ending_truth is preserved.
- Evidence: validate green 0/0; full `npm run health` exit 0. Deliberate re-pin: watchtower content hash c49b4424… → 8094e553f6a9a9d7a91508b4d8c6056e0082189454aa7184e48650338b42f460 (tests/unit/rpg_validator.test.ts comment updated, surfaced not laundered).
- Locked by traces/bugs/bug_0004_watchtower_hermit_lore.yaml + tests/regression/watchtower_hermit_lore.test.ts (3 cases: journals on hearing, single delivery / no loop, proof-gate preserved).
- Next suggested focus: the under-served sealed_letter / checkpoint "Papers" beat (playtest §4) — the letter is "sealed" and referenced by an ending but never opened on-screen; an LLM playtest of that east-route beat could drive a payoff fix. Then clockwork_heist_v1 (assessor rank 2) and the unverified parser packs (alchemists_tower, sealed_crypt).
## AFK Cycle 2026-06-01T05-06-44-014Z
- Assessment: packs cyoa=2 parser=2 rpg=1; 7 candidate(s) ranked.
- Next best improvement (recommended): [content_fix] Improve "watchtower_road_v1" — 0 unreached ending(s), 5 unvisited location(s).
- Why: An LLM playtest can pinpoint why these are hard to reach (signposting, clue legibility, pacing) and the fix raises player-facing quality.
- Mandatory LLM playtest target this cycle: content/cyoa/pack/watchtower_road.yaml.
- Process: assessor ranks → blind LLM playtest for quality → one improvement → health + verify:integrity green → commit (trust-but-verify).

### Cycle result — lantern-less cellar door now legible (bug_0005)
- Blind LLM playtest: fresh general-purpose subagent, MCP-only, seed 31, report at ai-runs/2026-06-01T05-06-44-014Z/playtest.md. Reached all 3 endings across 3 runs; clarity 5/5, enjoyment 4/5; zero rejected actions, no soft-locks. Verdict: "solid, shippable short CYOA."
- Top friction the playtester surfaced (§4): arriving at the **cellar door with no lantern** offered only "Step back from the door." The watchtower scene explicitly invites "Circle around to the cellar door," so a curious first-timer plausibly does so BEFORE looting the cart — and then the clearly-described, descendable stair gives no forward action and no in-fiction reason why. The block read as a dead end, not a puzzle.
- Improvement (one, content layer): added a `peer_into_dark` choice to `cellar_door`, shown only when the player holds no lantern (`not_item lantern`). It narrates the darkness ("…you'd break your neck going down blind, so you back up the steps — better find a light first") and routes the player back out to `ruined_watchtower`. This reinforces the lantern→cellar chain (bug_0003) WITHOUT spoiling where the lantern is. The nudge vanishes the moment a lantern is carried (when `light_lantern` takes over).
- Verification gotcha caught + fixed mid-cycle: my first cut looped `peer_into_dark` back to `cellar_door` with only a narrate effect. The playtester's sound loop-detector (agents/playtester.ts) correctly flagged that same-scene no-state-change step as a stuck self-loop — the structural playtest started reporting "fell into a loop near cellar_door" (the very thing bug_0003 de-looped). Re-routing the nudge OUT to the watchtower (a real scene change = progress) removed all loop findings. Lesson: a pure-narration choice must make progress, never self-loop.
- Evidence: validate green 0/0; full `npm run health` exit 0; 217 tests pass (+3 new); zero loop findings in the coverage playtest. Deliberate re-pin: watchtower content hash 8094e553… → 7f322e4cdbf1df48460c76df56fb8bdfd379fc1b755d804fb390542a3b9e71a6 (tests/unit/rpg_validator.test.ts comment updated, surfaced not laundered).
- Locked by traces/bugs/bug_0005_watchtower_cellar_dark_feedback.yaml + tests/regression/watchtower_cellar_dark_feedback.test.ts (3 cases: nudge offered when lantern-less, narrates + makes progress / no self-loop, vanishes once equipped).
- Next suggested focus: the still-deferred narrative-payoff findings on watchtower (the "broken seal" continuity slip — ending_truth references a broken seal the ledger route never opens; the muddled letter↔ledger relationship at the checkpoint), then clockwork_heist_v1 (assessor rank 2) and the unverified parser packs (alchemists_tower, sealed_crypt). The deterministic coverage bot still cannot reach ending_truth / the hermit cluster on seeds 1-3 — its puzzle-solving, not pack discoverability, is the limiter there.
