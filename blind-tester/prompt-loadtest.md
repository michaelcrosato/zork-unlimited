STRUCTURAL SERVER-LOAD INSTRUMENT — NOT PURE PLAYER OR RETENTION EVIDENCE.

You are exercising the transport surface of a text-based open-world RPG from a
fresh start. This explicit QA workload prescribes breadth and a bounded call
count so operators can compare server/token behavior. It must never be labeled,
resumed, compiled, or counted as a canonical `play_mode: pure` blind run.

STRICT RULES:

- Your FIRST game action must start AdventureForge:
  call `mcp__adventureforge__start_overworld` with `compact_context: true`. In
  Codex logs this may display as `mcp: adventureforge/start_overworld`; it is the
  same tool. If that direct start tool is not visible in your active tool list,
  call ToolSearch exactly once for AdventureForge start tools, then immediately
  use the returned start tool. Do not say the tool is unavailable unless both the
  direct tool is unavailable and the one ToolSearch fallback exposes no
  AdventureForge start tool.
- Play ONLY through `mcp__adventureforge__*` / `adventureforge/*` MCP tools:
  `start_overworld`, `get_overworld_session_context`,
  `scout_overworld_session_poi`, `talk_overworld_session_contact`,
  `explore_overworld_session_area`, `move_overworld_session_area`,
  `travel_overworld_session`, `resolve_overworld_session_road_encounter`,
  `work_overworld_session_job`, `investigate_overworld_session_event`,
  `resolve_overworld_session_event`, `rest_overworld_session`,
  `resupply_overworld_session`, `start_overworld_session_quest`,
  `complete_overworld_session_quest`, `list_legal_actions`, and `step_action`.
  ToolSearch is the only other tool you may use: once at startup only if the
  direct start tool is not visible, and after the game has started only if you
  need to expose an additional AdventureForge tool.
- DO NOT read, open, grep, cat, or list ANY files. Do not use shell, file, or web
  tools — you have none and don't need them. Your ONLY window into the game is the
  MCP tool responses. No peeking at the source or the solution.

READING THE WORLD (it is COMPACT):

- Start: `mcp__adventureforge__start_overworld` with compact_context = true. Capture
  the `legend` from the response — it decodes the compact positional fields and is
  sent only ONCE, at the start.
- Most `context` fields are POSITIONAL TUPLES, and the `legend` (sent ONCE, in the
  start_overworld response) tells you what each position means. KEEP that legend —
  later responses return only raw tuples with no legend. Key fields:
  `here` = [town_id, town_name, region, area_id, area_name]; `vitals` =
  [supplies, max_supplies, fatigue, condition]; `hidden` = [areas, jobs, sites,
  quests] STILL-UNDISCOVERED here; `roads` = [[dest_town_id, minutes, supplies,
  fatigue], ...]; and the local lists `areas` / `poi` / `contacts` / `events` /
  `jobs` / `sites`, each [[id, name], ...]; and `quests` =
  [[id, name, anchor_area_id], ...] — a list is OMITTED entirely until you have
  discovered something in it.
- `job_scenes` contains authored local decisions and `job_choices` contains the
  exact currently legal `[job_id, option_id]` pairs. Pass both ids unchanged to
  `work_overworld_session_job`. A job absent from `job_scenes` remains a legacy
  one-argument job.
- Every overworld tool takes `session_id` (from start_overworld). Guard writes and
  re-read state with `expected_snapshot_hash` / `if_snapshot_hash` = the latest
  `snapshot_hash`. NOTE the two phases use different hash names: the OVERWORLD uses
  `snapshot_hash`; once you are INSIDE a quest (below) it uses `state_hash`.

HOW A NEW PLAYER PLAYS (do this, in this spirit):

1. ORIENT. Read where you are, the time, your supplies/fatigue, the roads out, and
   what the `hidden` counts say is still to find here.
2. DISCOVER the local work — it is HIDDEN until you look. Use
   `scout_overworld_session_poi` (poi_id), `talk_overworld_session_contact`
   (character_id), and `explore_overworld_session_area` (area_id);
   `move_overworld_session_area` (area_route_id) walks to other areas of the town.
   Each can reveal new jobs, sites, contacts, events, and quest LEADS (the `quests`
   field). Follow what a curious person would, guided by the `hidden` counts.
3. LIVE IN IT. Do something real: `work_overworld_session_job` (job_id and the
   exact option_id too when `job_choices` requires it), or
   `investigate_overworld_session_event` then `resolve_overworld_session_event`
   (event_id); `rest_overworld_session` / `resupply_overworld_session` where a town
   offers it. Take at least one ROAD with `travel_overworld_session`
   (destination_town_id — pass ONLY one of destination_town_id OR road_id).
   IMPORTANT WEDGE: travelling can raise an encounter. If the context then shows
   `pending_road`, you are BLOCKED until you call
   `resolve_overworld_session_road_encounter` with `strategy` = one of
   "cautious_scout" | "assist_travelers" | "press_on" (the choices are listed
   inside `pending_road`). Resolve it BEFORE any other overworld action.
4. ENTER A QUEST. When a quest LEAD shows up in `quests`, note its anchor area —
   the 3rd field of its tuple (anchor_area_id). You must be STANDING in that area
   to start it: if anchor_area_id differs from your current area (`here`[3]), walk
   there first with `move_overworld_session_area` (match `area_routes` on
   dest_area_id). Then start it with `start_overworld_session_quest` (session_id,
   quest_id). That returns an
   `rpg_session_id` and drops you INTO the quest. Play it via `list_legal_actions`
   (session_id = rpg_session_id, compact_actions: true) and `step_action`
   (session_id = rpg_session_id, action_id, expected_state_hash = latest state_hash,
   hide_graph: true, compact_observation: true) until its context is `ended`. Then
   fold it back with `complete_overworld_session_quest` (session_id = the OVERWORLD
   session_id, rpg_session_id). It refuses if the quest hasn't reached an ending —
   finish it first.

STRUCTURAL WORKLOAD: exercise the listed server surfaces through one complete QA
arc: orient, discover local work, take a road and resolve its encounter, work a
job or resolve an event, and finish one discovered quest. Then stop. This bounded,
prescribed workload is deliberately not a player-session contract or retention
test. Narrate each step in one short line so transport behavior is followable.

WHEN DONE: output exactly one final line and NOTHING else after it:

`PLAYTHROUGH COMPLETE — <N> tool calls`

Do NOT write any report, playthrough log, scores, confusions, bug list, verdict, or
exit interview. This run measures the server and the token economy, not content
feedback — the final line is all that is needed.
