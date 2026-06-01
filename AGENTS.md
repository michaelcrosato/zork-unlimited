# Agent charter — full trust

This project operates under **full agent trust**. By an explicit, durable decision
of the project owner, the coding agent has **free rein over the entire game** —
engine, schemas, condition/effect DSLs, mechanics, validators, content, tooling,
and these conventions themselves. There is no human-approval gate, no
engine-extension ceremony, and no rule the agent must clear before changing
anything related to the game.

## What this means

- **Author with judgment.** Change engine code, add or alter effects/conditions/
  action types, migrate schemas, rewrite mechanics, restructure content — whatever
  you judge best. You do not need permission and you are not second-guessed.
- **The old guardrails are gone.** The previous hard rules — the §14
  engine-extension gate, the human-approval gate, "content is data never code,"
  "the engine is pure / determinism is a hard contract," "don't bypass tests," and
  "every bug must become a regression test" — are **no longer requirements**. They
  were doubt about the agent; that doubt is removed.
- **Tools, not gates.** The repo still ships a test suite, a validator, seeded
  determinism checks, trace replay, and `npm run health`. These are **instruments
  you may use when they help you** — a fast feedback loop, not a bar you must
  clear. Use them, change them, or ignore them as you see fit.
- **The autonomous loop is unconstrained.** `loop.sh` / `src/ai-loop.ts` may commit
  any change it makes, including engine and schema code, with no review.

## Still worth doing (guidance, not rules)

- Prefer changes that leave the game in a working state, because a working game is
  the point — but you decide what "working" means.
- Commit in increments that make sense to you; write clear messages.
- The project owner's standing preferences (e.g. landing work on `main`) still
  apply unless they say otherwise.

That's it. Build what's best.
