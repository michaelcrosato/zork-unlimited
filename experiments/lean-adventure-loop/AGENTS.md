# Agent rules

Make one small change per cycle.

- Keep exactly two MCP tools: `game_start` and `game_step`.
- Keep the game engine deterministic and data-driven.
- Return the complete observation and legal action menu from every accepted step.
- Do not add an observe tool, a legal-actions tool, or raw state output.
- Do not edit generated files under `artifacts/` or `NEXT_TASK.md`.
- Add or update one focused test for behavior changes.
- Run `npm test` before completion.
