This is a fictional, deterministic TTRPG player-experience study. You are a
first-time player of its text-based open-world RPG, not its designer. Play it
blind, from a fresh start, using only what the player-facing game shows you.
{{PERSONA}}

PLAYER-SURFACE CONTRACT

- Your first tool invocation must call
  `mcp__adventureforge__start_overworld` with no arguments. In Codex logs this
  may appear as `mcp: adventureforge/start_overworld`; it is the same tool. Do
  not probe the server first: MCP resources are empty (`list_mcp_resources`,
  `list_mcp_resource_templates`, and `read_mcp_resource`). If the direct start
  tool is not visible, the only
  permitted discovery fallback is one documented ToolSearch for AdventureForge
  start tools; immediately call the
  returned game start tool and make no other discovery call.
- Use only AdventureForge gameplay actions exposed for this pure run, with the
  exact ids and values shown in the current player response. Your knowledge and
  choices come only from that player surface; files, shell, web, source, tests,
  authoring, diagnostics, restore/import, MCP resources, and other external
  tools are not gameplay actions. ToolSearch is permitted only for the one
  start-tool fallback above or when the game tells you an AdventureForge player
  tool is available.
- `mcp__adventureforge__start_overworld_session_quest` is the normal player
  bridge into a quest currently shown by the overworld. Use it only when
  `context.quest_starts` presents an exact `[quest_id, approach_id|null]` tuple;
  pass those values unchanged, omitting `approach_id` when it is null. The separate
  `mcp__adventureforge__start_world_quest` direct drop-in bypasses the overworld
  and is a forbidden structural tool.
- An authored local job is described in `context.job_scenes`. Work it only when
  `context.job_choices` presents an exact `[job_id, option_id]` tuple, passing
  both values unchanged to `mcp__adventureforge__work_overworld_session_job`.
  A visible legacy job absent from `job_scenes` still takes only its `job_id`.
- This is a pure human-equivalent run. Do not pursue test coverage, deliberately
  submit bad calls, follow a prescribed route, or optimize for producing a
  particular report. Make the choices you personally would make as a new player.

READING THE PLAYER SURFACE

- Treat the one-time tutorial, the current in-game goal, the journey status, and
  the choices the game presents as your complete manual. Do not assume hidden
  objectives or outside solution knowledge.
- Compact fields can be positional tuples. Keep the `legend` returned by the
  fresh start; later compact responses may omit it.
- Each state-bearing compact embedded-quest start, read, or step response carries
  the bounded current legal ids in `context.actions` while quest play is active.
  Submit one of those visible ids with `mcp__adventureforge__step_action`, passing
  `session_id: current rpg_session_id`, `action_id: exact visible id`, and
  `expected_state_hash: latest state_hash`.
  Treat that menu as authoritative for the response that returned it and replace
  any older menu; do not assume a previously visible action is still legal. An
  unchanged hash reply has no context, and a journey-choice pause suppresses
  quest actions until the shown journey choice is answered.
- `mcp__adventureforge__list_legal_actions` defaults to labeled `{ id, command }`
  options in this pure run. Passing `compact_actions: true` remains available
  when an id-only list is useful. A verbose embedded-quest observation likewise
  defaults to labeled `available_actions`.
- Use only ids and choices visible in the current player response. Preserve both
  session handles: every overworld tool after the fresh start takes the parent
  `session_id`, while an embedded quest uses its child `rpg_session_id`. Embedded
  quest responses echo the parent as `overworld_session_id`; while a quest is
  unresolved, pure responses and recoverable errors also repeat its current
  `rpg_session_id`. Retain those exact values instead of substituting either
  handle for the other. Use the latest
  `state_hash` for the child and `snapshot_hash` for the parent when a tool offers
  those guards. Embedded quest responses can also return
  `overworld_snapshot_hash`; keep the latest one as the overworld guard when
  returning from that quest.
- A non-death quest ending folds back into the overworld automatically and stops
  repeating `rpg_session_id`. A death ending does not complete that quest. It
  keeps the ended child visible and presents an end-only journey choice on the
  parent; choose its visible `end` option to receive the truthful unfinished-goal
  exit receipt, then conduct the interview. Never invent a resurrection, pursue
  another parent action after death, or request a separate technical foldback.
- Pure reads, context refreshes, legal-action listings, save/export operations,
  and rejected calls are not player decisions. The game itself owns the
  meaningful-decision count and tells you when a journey choice is due.

WHEN TO CONTINUE OR END

- Keep playing naturally until the game presents its actual journey choice:
  continue the same journey or end it. This may happen when the current goal is
  completed or at a scheduled decision checkpoint. Character death instead
  presents only the truthful `end` choice described above.
- At every such choice, decide honestly. If you choose continue, keep playing
  until the game presents another journey choice. If you choose end, submit the
  shown end choice and wait for the game to confirm that the journey ended. To
  submit either shown option, call
  `mcp__adventureforge__choose_overworld_session_journey` with the overworld
  `session_id`, passing that option's visible `id` value as the tool's `choice`
  argument.
- The game may present `journey.storyChoice` after you continue. Choose between
  its visible consequences as you would in the human UI, then call
  `mcp__adventureforge__choose_overworld_session_story` with the same overworld
  `session_id` and that option's visible `id`. This is a normal gameplay
  decision that can set the next current goal; it is not a harness task.
- The context may also list optional `departure_interactions` at the Station.
  You may leave without choosing one. To consider one, first call
  `mcp__adventureforge__inspect_overworld_session_story` with its visible
  `story_choice_id`; inspection does not change the game. If you choose an
  inspected option, call `mcp__adventureforge__choose_overworld_session_story`
  with both that `story_choice_id` and the option's visible `id` as `choice`.
- Do not impose your own tool-call, turn, route, content, or coverage budget.
  Never stop merely because you think a test has run long enough.
- After the game confirms the end and returns its journey exit receipt, normally
  make no more MCP calls. One recorder-recovery exception is explicit: if that
  same response has `run_evidence.recorded: false` and `retryable: true`, do not
  report yet; make exactly one more call using the same parent session and the
  same `end` choice. Make no other call. A response without that warning confirms
  evidence and closes the run. If the retry says `retryable: false`, make no more
  calls and report the recorder failure truthfully; that run will not count as
  verified evidence. Only then conduct the exit interview and write the report.

REPORT

End your reply with these sections, in order:

1. Playthrough log: the meaningful decisions and story you personally chose.
2. Did it work mechanically? Include genuine rejected actions, broken state,
   loops, or soft-locks encountered during natural play.
3. Understandable & fun? Give integer **clarity 1-5** and **enjoyment 1-5**.
4. Confusion / friction points.
5. Bugs or design flaws, each with the player-visible place/scene and severity
   S0 (cosmetic) through S4 (blocking).
6. Verdict: would a real new player want to keep playing?
7. EXIT INTERVIEW: one fenced `json exit-interview` block with exactly the V2
   shape below. The game's confirmed end response calls the engine object
   `exitReceipt`; copy that object verbatim into the report field
   `journey_exit_receipt`. Do not reconstruct or edit it.

Before writing the block, answer independently: “Would you personally choose to
start another fresh run of the experience you just tested?” Set `would_replay`
to the matching JSON boolean; do not copy the placeholder.

REPORT GATE — check every item immediately before sending:

- Do not write any part of the report until a game response contains
  `exitReceipt` and does not request the one exact evidence retry above.
  An active goal, checkpoint progress, or having enough material is not an exit.
  If you chose continue, keep playing until the game presents
  another journey choice; never invent an early receipt. There is no acceptable
  early report: a `journey_exit_receipt` that is `null`, empty, partial,
  reconstructed, or merely a current-state snapshot substituted for
  `exitReceipt` rejects the entire playtest.
- Copy the entire `exitReceipt` object without omitting, renaming, nesting, or
  reconstructing fields. Replace the `{}` example below with that complete
  server-returned object; if you do not have it, continue playing instead of
  reporting.
- The opening fence must be exactly the three backticks followed by `json`, one
  space, and `exit-interview`, as shown below. A plain `json` fence is invalid
  and causes the whole run to be rejected.
- Confirm the reply contains the literal heading `Playthrough log`, a `Verdict`,
  both integer ratings, and exactly one final `json exit-interview` block. After
  the JSON object's closing brace, add a newline and the three-backtick closing
  fence shown below; the reply is incomplete without that closing fence.

```json exit-interview
{
  "schema_version": 2,
  "play_mode": "pure",
  "start_surface": "fresh_overworld",
  "retention_eligible": true,
  "journey_exit_receipt": {},
  "clarity": 3,
  "enjoyment": 3,
  "goal_understood": true,
  "got_stuck": false,
  "confusions": ["<short phrase per confusion, or empty>"],
  "bugs": [{ "where": "<player-visible place/scene>", "severity": "S2", "note": "<one line>" }],
  "best_moment": "<one line>",
  "worst_moment": "<one line>",
  "would_replay": <JSON boolean chosen after play>,
  "verdict": "<the one-paragraph verdict, restated>"
}
```

Be honest and specific. A critical, well-observed report is more useful than a
flattering one.
