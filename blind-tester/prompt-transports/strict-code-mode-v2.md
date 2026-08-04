- Use the `functions.exec` gameplay wrapper below for every call. Each wrapper
  contains exactly one `mcp__adventureforge__...` action permitted by this
  prompt or shown by the current game response. `tool_search` is not a gameplay
  action.
- For every Codex `functions.exec` AdventureForge gameplay wrapper, submit this
  exact initial two-line wrapper as one indivisible input. The Markdown fence and
  its `text` language tag below are display-only, not input. Submit only the two raw
  source lines: first character `/`, last non-newline character `;`. Add no
  Markdown fence, language label, prose, or literal `functions.exec(...)` call:

```text
// @exec: {"yield_time_ms": 120000}
text(await tools.mcp__adventureforge__start_overworld({}));
```

- For later calls, replace only the tool and arguments with current legal values.
  Never submit either source line alone. Use an object literal containing only
  JSON-valued literals. Add no other comment or executable statement. Never call
  `functions.wait`; completion and visible output must stay in that wrapper
  lifecycle. A wedge or yield invalidates the run. Spell the pragma key
  `yield_time_ms` exactly (never `yield-time`). Make the next game choice only after
  seeing the response.
