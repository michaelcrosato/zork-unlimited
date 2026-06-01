# Agent charter — trust, but verify

This project runs on **trust, but verify**. The coding agent has **free rein over
the whole game** — engine, schemas, condition/effect DSLs, mechanics, content,
tooling — with **no human-approval gate and no §14 ceremony**. You decide *what* to
build and change. In return, the project's **automated verification stays the bar**:
your work must leave the checks green. Verification is not doubt about the agent —
it is the agent's own instrument for *knowing* a change is correct.

## Trust — you have full authority

- Change engine code, add or alter effects/conditions/action types, migrate
  schemas, rewrite mechanics, restructure content. No permission needed, no human
  gate, no extension-gate paperwork. Use your judgment.

## Verify — the checks are the bar (keep them green)

- `npm run lint` (typecheck) and `npm test` must pass. The autonomous loop and CI
  treat a failing suite as a hard stop — do not commit or merge red.
- The **verification suite is the safety net, not a formality**:
  - **Determinism** — the property tests assert *same seed + actions ⇒ identical
    state hash*. Keep it true.
  - **Validator** — packs must validate (no soft-locks, reachable endings) before
    they're shipped/played.
  - **Replay + regression** — committed traces must replay to their recorded
    hashes; when you fix a bug, add a regression test so it stays fixed (and a
    `traces/bugs/` artifact).
  - **Save integrity** — saves stay bound to their content hash.
- `npm run health` runs the whole bar (typecheck + tests + validate + playtest). Run
  it before you finish; the loop runs it as a blocking gate.

## The one principle that ties trust to verify

**Don't route around the verifier.** You may change *what the game does* — including
deliberately changing a property and updating its test as part of that change. What
you must not do is weaken, skip, or delete a check *just to make a red change pass*.
If a change can't pass verification, fix the change, not the check. That's the whole
deal: maximum freedom in design, honesty in verification.

This principle is **enforced**, not just stated — `scripts/verify-integrity.ts`
(`npm run verify:integrity`, part of `health` and CI) fails if a protected
verification asset is missing, a test is disabled (`.skip`/`.only`/`.todo`/`xit`),
or the test count drops below its floor. The autonomous loop additionally runs it in
`--against <pre-cycle ref>` mode and **refuses-and-surfaces** (halts, leaves work
uncommitted for review) if a cycle modified a protected asset or silently re-pinned
a committed hash, unless `AI_LOOP_ALLOW_VERIFIER_EDITS=1` acknowledges a deliberate
edit. It catches mechanical tampering, not semantic weakening — keep the deal
honestly.

## The autonomous loop

The AFK improvement loop (`docs/afk_loop.md`) embodies this charter: each cycle it
**assesses the next-best improvement** across content/engine/repo (`npm run assess`),
takes a **mandatory blind LLM playtest** for quality feedback, makes one change, and
commits only after the bar is green and the verifier is untouched. `npm run assess`
shows the ranked backlog any time.

## Standing guidance

- Commit in clear increments; land work on `main` (owner preference).
- Prefer leaving the game in a working, verified state — that's the point.

## Cursor Cloud specific instructions

- **Runtime:** Node.js **22+** only. No Docker, database, or other services are required for lint, tests, validation, or CLI play.
- **Install:** Root `npm install` plus `npm --prefix ui install` (the UI is a separate package under `ui/`). Standard commands are in `README.md` and `package.json`.
- **Verification bar:** `npm run health` (integrity + typecheck + tests + pack validate + mock playtest). Faster checks: `npm run lint`, `npm test`.
- **Web UI (optional for most agent work):** `npm run ui:dev` serves http://localhost:5173. The dev server is not started automatically on VM boot — start it in a tmux session when you need browser testing. Engine logic runs in-browser; no backend API.
- **CLI play (no server):** `npm run play`, `play:parser`, `play:rpg` with `--choices` / `--commands` for non-interactive runs; see `README.md`.
- **MCP / LLM:** `npm run mcp` and live LLM authoring/playtest are optional; CI uses deterministic mocks with no API keys.
