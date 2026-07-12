# AdventureForge Web UI

A React + Vite **view** over the headless, deterministic engine. The
UI talks only to the structured engine API: it compiles a shipped New York
overworld quest pack in the browser and drives the same `step` reducer the CLI
and MCP server use.
It renders the structured observation and turns clicks into
`GameSession.choose(id)` calls; it never decides what is legal or what an action
does. One code path plays RPG quests, because `ui/src/engine.ts` exposes a single
RPG `View`.

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
  validators, and observation builders from `../src`. The state hash shown in the
  sidebar is the same pure SHA-256 the determinism contract uses (§8.5).
- **Browser-safe core.** The engine has no Node-only dependencies; the state hash
  is a pure-JS SHA-256 (`src/core/sha256.ts`), identical to Node's `crypto`.
- **Tested without a browser.** `tests/unit/ui_engine.test.ts` drives
  `GameSession` in Node, proving the UI uses only the structured API and stays
  deterministic.
- **Quests are data.** Vite bundles the shipped `content/rpg/quests/*.yaml` and
  `content/world/new_york_overworld.json` as raw text; the browser never touches
  the filesystem and content never runs as code (§16).
