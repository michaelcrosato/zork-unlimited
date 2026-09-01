# Lean Adventure Loop

A small reference implementation of this path:

**AI-coded game → MCP server → AI playtests → one ranked task → AI coding agent**

The project keeps the useful core of AdventureForge and removes the mature-project control plane. It has no runtime dependencies and no UI. The game is deterministic and data-driven.

## Design limits

- Two MCP tools only: `game_start` and `game_step`.
- One MCP call per player turn.
- Each result includes the current scene and all legal actions.
- Reports are bound to a build hash. AI action traces are replayed before acceptance.
- The coding prompt contains one issue and at most three evidence lines.
- The loop makes one change, runs tests, and runs a full scripted MCP playthrough.

See [docs/REVIEW_AND_DESIGN.md](docs/REVIEW_AND_DESIGN.md) for the repository review and Mermaid maps.

## Run it

Node.js 22 or later is required.

```bash
npm test
npm run measure
npm run playtest -- --player mix --runs 6 --concurrency 3
npm run loop -- --cycles 1 --runs 6
```

The default `mix` wave uses deterministic scripted, explorer, and random players. These players test the MCP path. They do not create subjective product findings.

## Add an AI playtester

Set `PLAYTEST_AGENT_CMD` to an MCP-capable, non-interactive agent command. The command must:

1. Read its instructions from standard input.
2. Load the `.mcp.json` file in its working directory.
3. Use only `game_start` and `game_step` for the playthrough.
4. Print the requested JSON report.
5. Exit nonzero on failure.

```bash
PLAYTEST_AGENT_CMD='your-agent-command' \
  npm run playtest -- --player agent --runs 4 --concurrency 2
```

The runner gives each agent a temporary directory that contains only an MCP configuration. It then replays the reported action ids and rejects a false outcome or turn count. The client boundary is still instruction-only. It does not prove that the client had no other tools. Use the reports for rapid product iteration, not audited retention claims.

## Add an AI coding agent

Set `AI_CODER_CMD` to a non-interactive coding command that reads standard input, edits the current project, runs commands, and exits nonzero on failure.

```bash
PLAYTEST_AGENT_CMD='your-playtest-agent-command' \
AI_CODER_CMD='your-coding-agent-command' \
  npm run loop -- --cycles 3 --runs 4 --concurrency 2
```

One cycle does this:

1. Run `npm test`.
2. Run a playtest wave against the current build hash.
3. Aggregate reports into one `NEXT_TASK.md` file.
4. Stop when no finding has enough evidence.
5. Give the one task to the coding agent.
6. Reject a successful agent exit when the game build hash did not change.
7. Run `npm test` again.
8. Complete one scripted game through MCP.

The loop does not commit, push, reset, or delete source files. Git remains outside the prototype.

## MCP result shape

`game_start` and `game_step` return compact JSON text:

```json
{
  "sid": "opaque session id",
  "rev": 0,
  "at": ["room_id", "Room title"],
  "text": "Current scene text",
  "turn": [0, 16],
  "score": 0,
  "inv": ["optional item ids"],
  "event": "optional result of the last action",
  "actions": [["action_id", "Player-facing label"]],
  "end": ["ending_id", "Ending title", "Ending text"]
}
```

The `sid` exists until the MCP server process exits. The `rev` guard rejects stale actions.

## Project map

```text
game/world.json          Story data and rules
src/engine.mjs           Pure deterministic reducer
src/mcp-server.mjs       Modern and legacy stdio MCP server
src/mcp-client.mjs       Small test and playtest client
src/playtest.mjs         Built-in and optional AI players
src/aggregate.mjs        Build-bound report clustering
src/loop.mjs             One-task coding cycle
src/measure.mjs          MCP payload measurements
test/                    Node test suite
```
