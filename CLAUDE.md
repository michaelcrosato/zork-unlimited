# Claude Code — read [`AGENTS.md`](./AGENTS.md)

**[`AGENTS.md`](./AGENTS.md) is this repository's agent charter and the single
source of truth.** Read it before doing anything here; everything that governs
work in this repo — the trust-but-verify principle, the validation bar, the
bug-trace and regression requirements, the token economy — lives there.

This file exists only so that instruction is not vendor-specific. Codex loads
`AGENTS.md` by convention, and this repo's dev loop runs on any installed agent
(`codex`, `claude`, `gemini` — see `loop.sh`), so a charter only one vendor
auto-loads is a charter the other two silently skip. It is a pointer rather than
a copy on purpose: duplicated rules drift, and a stale copy is worse than none.

Nothing in here overrides `AGENTS.md`. If the two ever disagree, `AGENTS.md` wins.
