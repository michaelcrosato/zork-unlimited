/**
 * `npm run inspect` classifies a run that ended in DEATH as `death_unrecoverable`.
 *
 * The debugger's only high-severity ending verdict was unreachable from every
 * production caller. `diagnose` (agents/debugger.ts) decides a win with
 * `opts.isWinningEnding ? opts.isWinningEnding(id) : true` — "any ending wins" by
 * default — and bin/inspect passed no options at all. So a trace that ends on
 * ending_fallen ("Another Niche Filled", the barrow-wight killing an under-armed
 * delver) was summarized to the agent reading it as:
 *
 *     Suspected bug: no_failure (low) — Reached ending "ending_fallen".
 *
 * which is the opposite of what happened. The information was already on hand:
 * EndingSchema carries `death: boolean` and the built index exposes the pack, so
 * the predicate is one lookup.
 *
 * Both directions are pinned, because "every ending is a death" would satisfy the
 * first case alone: a death run must read `death_unrecoverable (high)`, and a
 * genuine victory must still read `no_failure`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { makeStep } from "../../src/core/engine.js";
import { recordTrace } from "../../src/trace/record.js";
import { runNpmScript } from "../../scripts/npm-cli.js";
import type { RpgIndex } from "../../src/rpg/runner.js";
import type { Rules } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { Action, RpgAction } from "../../src/api/types.js";

const ROOT = process.cwd();
const PACK = "content/rpg/quests/sunken_barrow.yaml";
const DEATH_TRACE = "traces/bug_inspect_death_ending.json";
const VICTORY_TRACE = "traces/bug_inspect_victory_ending.json";

function inspect(tracePath: string): string {
  const result = runNpmScript("inspect", [tracePath], { cwd: ROOT, timeout: 60_000 });
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
}

type Route = (act: (pred: (a: Action) => boolean) => void, peek: () => GameState) => void;

/** Drives a route through the enumerated action set, returning the actions taken. */
function walk(index: RpgIndex, rules: Rules<RpgAction>, seed: number, route: Route): Action[] {
  const step = makeStep(rules);
  const actions: Action[] = [];
  let state: GameState = initStateForRpgPack(index, seed);
  const act = (pred: (a: Action) => boolean): void => {
    const option = enumerateRpgActions(index, state).find((o) => pred(o.action));
    if (!option) throw new Error(`no matching action in ${state.current}`);
    const result = step(state, option.action);
    if (!result.ok) throw new Error(`step rejected in ${state.current}`);
    actions.push(option.action);
    state = result.state;
  };

  route(act, () => state);
  return actions;
}

function recordRoute(
  index: RpgIndex,
  rules: Rules<RpgAction>,
  contentHash: string,
  traceId: string,
  outPath: string,
  seed: number,
  actions: Action[],
): void {
  const trace = recordTrace(rules, initStateForRpgPack(index, seed), actions as RpgAction[], {
    trace_id: traceId,
    content_hash: contentHash,
    worldQuestId: "sunken_barrow",
  });
  mkdirSync("traces", { recursive: true });
  writeFileSync(outPath, JSON.stringify(trace));
}

beforeAll(() => {
  const loaded = loadRpgSourceFile(PACK);
  if (!loaded.ok) throw new Error("sunken_barrow must compile");
  const index = indexRpgPack(loaded.compiled.pack);
  const rules = buildRpgRules(index);
  const hash = loaded.compiled.contentHash;

  // The under-armed seed-2 route from bug_0126's render lock: descend, take the
  // iron bar, skip the shade's ward, and walk into the guard crypt on base
  // defense — the wight wins.
  const death: Route = (act, peek) => {
    act((a) => a.type === "MOVE" && a.direction === "down");
    act((a) => a.type === "TAKE");
    act((a) => a.type === "MOVE" && a.direction === "north");
    let guard = 0;
    while (!peek().ended && peek().flags["wight_slain"] === undefined) {
      act((a) => a.type === "ATTACK");
      if (++guard > 40) throw new Error("the fight never resolved");
    }
    expect(peek().endingId).toBe("ending_fallen");
  };
  recordRoute(
    index,
    rules,
    hash,
    "tr_inspect_death_ending",
    DEATH_TRACE,
    2,
    walk(index, rules, 2, death),
  );

  // The warded victory route: take the shade's ward, kill the wight, heave the
  // slab, claim the circlet. The slab heave is a skill check with a free retry,
  // and a FAILED retry leaves the meaningful state untouched — `diagnose` reports
  // that repeat as a `loop` and never classifies the ending at all, which would
  // make this guard test nothing about death endings. So take the first seed whose
  // slab yields on the first heave instead of pinning one: the scan is
  // deterministic, and it survives a skill-check change that merely moves which
  // seeds are lucky.
  let victory: { seed: number; actions: Action[] } | undefined;
  for (let seed = 1; seed <= 64 && victory === undefined; seed += 1) {
    const route: Route = (act, peek) => {
      act((a) => a.type === "MOVE" && a.direction === "down");
      act((a) => a.type === "MOVE" && a.direction === "west");
      act((a) => a.type === "TALK");
      act((a) => a.type === "ASK" && a.topic === "ask_wight");
      act((a) => a.type === "ASK" && a.topic === "leave_shade");
      act((a) => a.type === "MOVE" && a.direction === "east");
      act((a) => a.type === "TAKE" && a.item === "iron_bar");
      act((a) => a.type === "MOVE" && a.direction === "north");
      let guard = 0;
      while (!peek().ended && peek().flags["wight_slain"] === undefined) {
        act((a) => a.type === "ATTACK");
        if (++guard > 40) throw new Error("the fight never resolved");
      }
      act((a) => a.type === "MOVE" && a.direction === "east");
      act((a) => a.type === "USE" && a.target === "stone_slab");
      if (peek().questStage["barrow"] !== "slab_moved") throw new Error("slab needed a retry");
      act((a) => a.type === "MOVE" && a.direction === "down");
      act((a) => a.type === "TAKE" && a.item === "circlet");
      if (peek().endingId !== "ending_victory") throw new Error("route did not win");
    };
    try {
      victory = { seed, actions: walk(index, rules, seed, route) };
    } catch {
      // This seed's route is not the loop-free victory we need; try the next.
    }
  }
  if (victory === undefined) throw new Error("no seed in 1..64 yields a repeat-free victory route");
  recordRoute(
    index,
    rules,
    hash,
    "tr_inspect_victory_ending",
    VICTORY_TRACE,
    victory.seed,
    victory.actions,
  );
});

describe("bin/inspect — a death ending is diagnosed, not reported as no_failure", () => {
  it("summarizes a death run as death_unrecoverable (high)", () => {
    const output = inspect(DEATH_TRACE);

    expect(output).toContain("[END ending_fallen]");
    expect(output).toContain("Suspected bug: death_unrecoverable (high)");
    // The pre-fix verdict, verbatim — it must not come back.
    expect(output).not.toContain('no_failure (low) — Reached ending "ending_fallen"');
  });

  it("still summarizes a winning run as no_failure", () => {
    const output = inspect(VICTORY_TRACE);

    expect(output).toContain("[END ending_victory]");
    expect(output).toContain('Suspected bug: no_failure (low) — Reached ending "ending_victory"');
    expect(output).not.toContain("death_unrecoverable");
  });
});
