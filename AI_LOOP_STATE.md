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
