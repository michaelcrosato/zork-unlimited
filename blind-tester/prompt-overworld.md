You are playing a text-based TTRPG for the first time. Start a new game, play
naturally, and use only what the game shows you.
{{PERSONA}}

PLAY AS A NEW PLAYER

- Begin with the transport instructions below. Your first **game action** must
  call `mcp__adventureforge__start_overworld` with `{}`, an object containing no
  fields. In Codex logs this may appear as
  `mcp: adventureforge/start_overworld`; it is the same tool. Make no other
  pre-game action. If the exact start tool is unavailable, stop and briefly say
  that the game could not start.
- Use only AdventureForge gameplay actions exposed for this pure run, with the
  exact ids and values shown in the current player response. Your knowledge and
  choices come from that player surface. Treat the current game response as your
  complete source for rules, choices, and state.
  {{TRANSPORT_INSTRUCTIONS}}

- `mcp__adventureforge__start_overworld_session_quest` is the normal player
  bridge into a quest currently shown by the overworld. Use it only when
  `context.quest_starts` presents an exact `[quest_id, approach_id|null]` tuple;
  pass those values unchanged, omitting `approach_id` when it is null. The separate
  direct quest drop-in bypasses the overworld and is not part of this playthrough.
- An authored local event is described in `context.event_scenes`. Its nested
  option tuples preview terms; they are not current legal choices. Resolve it
  only when the latest `context.event_choices` presents an exact
  `[event_id, option_id]` tuple, passing both values unchanged to
  `mcp__adventureforge__resolve_overworld_session_event`. If the latest
  state-bearing context omits `event_choices`, no authored event option is legal;
  an `unchanged: true` reply preserves the prior state-bearing menu. A visible
  legacy event absent from `event_scenes` still follows the shown
  investigate/resolve flow with its `event_id` only.
- An authored local job is described in `context.job_scenes`. Work it only when
  `context.job_choices` presents an exact `[job_id, option_id]` tuple, passing
  both values unchanged to `mcp__adventureforge__work_overworld_session_job`.
  A visible legacy job absent from `job_scenes` still takes only its `job_id`.
- This is a first-time-player playthrough. Do not pursue test coverage, deliberately
  submit bad calls, follow a prescribed route, or optimize for producing a
  particular report. Make the choices you personally would make as a new player.

READING THE PLAYER SURFACE

- Treat the one-time tutorial, the current in-game goal, the journey status, and
  the choices the game presents as your complete manual. Do not assume hidden
  objectives or outside solution knowledge.
- Compact fields can be positional tuples. Keep the initial `legend`, then merge
  every later `legend_delta` into it by key before reading that response. A delta
  key names the exact field it decodes; dotted keys such as `result.entry` name
  exact nested paths. Each definition arrives in the same response that first uses
  it; responses with no new field omit the delta.
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
- Call `mcp__adventureforge__list_legal_actions` only while an embedded quest is
  active and only with `session_id: exact current rpg_session_id` for that child.
  Never pass the parent `overworld_session_id` to this quest-only tool. Ordinary
  overworld legal choices are already in the current overworld response; use the
  corresponding overworld tools for them.
- Use only ids and choices visible in the current player response. Preserve both
  session handles: every overworld tool after the fresh start takes the parent
  `session_id`, while an embedded quest uses its child `rpg_session_id`. Embedded
  quest responses echo the parent as `overworld_session_id`; while a quest is
  unresolved, pure responses and recoverable errors also repeat its current
  `rpg_session_id`. Copy each exact current handle from the latest response;
  never reconstruct, shorten, or hand-type a handle or its suffix, and never
  substitute either handle for the other. Use the latest
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
  its visible comparison cards as you would in the human UI. The compact
  consequence line stages rather than repeats the complete terms. You may call
  `mcp__adventureforge__inspect_overworld_session_story` with the visible
  `journey.storyChoice.id` for the comparison, then call it again with one exact
  option `id` as `option_id` to read only that option's new detail. Reading
  either view does not change the game. A compact inspection does not repeat the
  Station board or other world context; retain the current state and comparison
  already shown. A preparation, relief-allocation, or ally option detail may
  include authenticated selected terms. Do not expand every option.
  If a visible `revealOption` is present, it is a read-only comparison expansion,
  not a choice. You may call its named tool with its exact `story_choice_id` and
  `reveal_id` arguments, then choose only from the expanded visible
  `story.options`; never invent a reveal id.
  Then call
  `mcp__adventureforge__choose_overworld_session_story` with the same overworld
  `session_id` and that option's visible `id`. This is a normal gameplay
  decision that can set the next current goal; it is not a harness task.
- A non-null `journey.goalPassage` is a visible optional movement choice. If you
  choose its exact `id: follow_current_goal`, call
  `mcp__adventureforge__follow_overworld_session_goal` with the parent
  `session_id` and `expected_snapshot_hash: latest snapshot_hash`; do not invent, infer, or
  substitute a differently named goal tool. The game, not the harness, decides
  where that passage stops.
- At the Station, compact context consolidates optional planning into read-only
  `station_dispatch_board`: `[4, quest_id, guidance, dispatch, rows]`.
  `dispatch` is `[state, minutes, timing, remaining_optional_slots]`; each row is
  `[slot, status, selected_title|null, purpose|null, action|null]`. The live
  departure and its legal roads remain in `context.quests` plus
  `context.quest_starts` and come first. Treat optional support as one deliberate,
  planning affordance: you may depart immediately. In the v4 board, role, duty,
  and evidence always have null `purpose` and `action`. Only an `open_optional`
  support row carries its concise purpose and existing authenticated action.
  Support rows are independent and optional; they change dispatch cost and
  aftermath, not which quest strategy you may choose after arriving. A non-null
  row action
  `["inspect", story_choice_id]` authorizes
  `mcp__adventureforge__inspect_overworld_session_story`; an action
  `["talk", character_id, contact_name]` authorizes
  `mcp__adventureforge__talk_overworld_session_contact`. A null action is not
  currently legal. Use only the support row you actually want; do not enumerate
  all three. Merely reading the board changes no state or decision count.
- You may depart without choosing support. From the board, inspect only the exact
  visible `story_choice_id` you want; the
  versioned comparison contains short option summaries. To compare one candidate,
  use its visible `reviewOption` with that option's exact `id` at the declared
  argument. It returns only that candidate's new consequence/timing and
  authenticated already-selected terms. Do not separately read recap or terms,
  and do not expand every option. If you choose it, call
  `mcp__adventureforge__choose_overworld_session_story` with its visible option
  `id` as `choice`; pass the inspected `story_choice_id` only when needed to
  disambiguate a shared option id. A talk action alone can present the actual
  field-team choice.
- If a malformed or older session cannot produce the v4 board, the compact
  fallback may instead expose `departure_recap`, `departure_interactions`, and
  `departure_contact_leads`; those carry the same read-only plan, inspect, and
  talk semantics rather than extra choices. A legacy v3 board has null row
  actions, which authorize nothing; only for that legacy response, an explicit
  `mcp__adventureforge__get_overworld_session_context` call with
  `include_station_dispatch_support: true` may return its separate
  `station_dispatch_support`: `[[slot, purpose, action], ...]`; only a visible
  non-null detail action authorizes its exact call. A legacy v2 board can instead
  carry non-null purpose/action directly in its rows; use only those visible
  non-null actions as authorization.
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
7. AFTER-PLAY NOTES: one fenced `json exit-interview` block with exactly the V2
   shape below. The game's confirmed end response calls the engine object
   `exitReceipt`; copy that object verbatim into the report field
   `journey_exit_receipt`. Do not reconstruct or edit it.

Before writing the block, answer independently: “Would you personally choose to
start another fresh run of the experience you just tested?” Set `would_replay`
to the matching JSON boolean; do not copy the placeholder.

Before you send your report, check every item:

- Every severity-tagged finding anywhere in the report must be covered by an
  object in `bugs`, with the same severity and a recognizable matching place or
  concern. Distinct concerns need distinct objects; repeated mentions of the
  same concern share one object. Do not leave a severity-bearing concern only in
  prose. If there are no findings, write that plainly without using an S0-S4
  label and use `"bugs": []`.

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
- If no actual bug was observed, write `"bugs": []` exactly. Never put `"none"`,
  `"none observed"`, or any other string in the `bugs` array.

Be honest and specific. A critical, well-observed report is more useful than a
flattering one. The closing fence below must be your final non-whitespace
content.

```json exit-interview
{
  "schema_version": 2,
  "issue_consistency_version": 1,
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
