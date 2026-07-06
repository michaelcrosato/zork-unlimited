# The Charter Marches Web UI (Stage 5)

A React + Vite **view** over the headless, deterministic engine (§13 Stage 5). The
UI talks only to the structured engine API: it compiles a Charter Marches quest
pack in the browser and drives the same `step` reducer the CLI and MCP server use.
It renders the structured observation and turns clicks into
`GameSession.choose(id)` calls; it never decides what is legal or what an action
does. One code path plays RPG quests, because `ui/src/engine.ts` exposes a single
RPG `View`.

## Run

```bash
cd ui
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle in ui/dist
```

From the repo root you can also use `npm run ui:dev` / `npm run ui:build`.

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
  `content/world/charter_marches.yaml` as raw text; the browser never touches the
  filesystem and content never runs as code (§16).
