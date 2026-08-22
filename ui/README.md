# AdventureForge Web UI

A React + Vite **view** over the headless, deterministic engine. The
UI talks only to the structured engine API: it compiles a shipped New York
overworld quest pack in the browser and drives the same `step` reducer the CLI
and MCP server use.
It renders the structured observation and turns clicks into
`GameSession.choose(id)` calls; it never decides what is legal or what an action
does. One code path plays RPG quests, because `ui/src/engine.ts` exposes a single
RPG `View`.

## Adaptation contract

The game does not change to fit this UI. Engine rules, authored content, legal
actions, consequences, and campaign state remain authoritative; the web layer
adapts to whatever those projections contain. A rough edge during game growth
is preferable to hiding a new mechanic or pushing presentation concerns back
into the engine.

The current UI is split along replaceable presentation seams:

- `engine.ts` and `overworld.ts` expose structured, player-facing projections.
- `App.tsx` coordinates sessions and translates projected actions into generic
  screen models; it does not decide legality or outcomes.
- `worldActionPresentation.ts` contains exhaustive adapters and focused-deck
  selection. Unknown legal section categories surface by default, while a new
  service kind fails visibly until the UI gives it an explicit label and engine
  call.
- `OverworldPlayScreen.tsx` and `QuestPlayScreen.tsx` own distinct play modes.
- `NightWatchChrome.tsx` owns reusable masthead, utility navigation, and panel
  types. Character, atlas, journal, exact-term, and menu surfaces stay outside
  the main decision deck.
- Action grids respond to count and text density, and long authored dialogue
  gains progressive disclosure without truncating the source text.

When the game adds a genuinely new interaction shape, extend the structured
projection first and add or replace a UI module for it. Do not infer legality
from prose, hard-code quest ids, or constrain content to preserve this layout.

## Run

No terminal needed: double-click `PLAY.bat` at the repo root — it rebuilds and
opens the game in the default browser.

```bash
cd ui
npm install
npm run dev      # http://localhost:5173
npm run build    # single-file bundle in ui/dist (see below)
```

From the repo root you can also use `npm run ui:dev` / `npm run ui:build`.

The production build is a **single self-contained `ui/dist/index.html`**:
`scripts/inline-dist.mjs` runs after `vite build` and folds the JS and CSS into
the page, because browsers refuse external module scripts on `file://` and the
whole point is a double-clickable file. Content is already bundled at build
time (see below), so nothing else is needed at runtime.

## How it stays honest

- **No reimplemented rules.** `ui/src/engine.ts` imports the real engine, runners,
  schemas, and observation builders from `../src`. The state hash shown in the
  sidebar is the same pure SHA-256 the determinism contract uses (§8.5).
- **Browser-safe core.** The engine has no Node-only dependencies; the state hash
  is a pure-JS SHA-256 (`src/core/sha256.ts`), identical to Node's `crypto`.
- **Tested without a browser.** `tests/unit/ui_engine.test.ts` drives
  `GameSession` in Node, proving the UI uses only the structured API and stays
  deterministic.
- **Quests are data.** Vite bundles the shipped `content/rpg/quests/*.yaml` and
  `content/world/new_york_overworld.json` as raw text; the browser never touches
  the filesystem and content never runs as code (§16).
- **Reloads preserve active quests.** The versioned browser save keeps a
  canonical pre-quest campaign snapshot, the accepted action/continue trail,
  and a content-bound quest save. Restore deterministically replays that trail
  and verifies both session hashes before showing play. A schema, content,
  launch-seed, or replay mismatch fails closed on a clear recovery screen; it
  never silently rolls the player back to an older campaign save. Existing v1
  road saves are read once and migrated on the next successful autosave.
