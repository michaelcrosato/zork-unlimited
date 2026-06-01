/**
 * CYOA validator (spec §10.1).
 *
 * CYOA is the best first proof because the whole game is a graph, so most checks
 * are exhaustively decidable. Where flags/items/vars make a check undecidable in
 * general (feasibility, contradiction), we use a documented, conservative
 * approximation and say so — we never silently check a weaker property than the
 * spec names (see the per-check notes). A pack with any error finding is
 * unplayable (§10).
 */
import type { Condition } from "../core/conditions.js";
import type { Effect } from "../core/effects.js";
import type { CyoaPack } from "../cyoa/schema.js";
import { indexPack } from "../cyoa/runner.js";
import { type Finding, type ValidationReport, makeReport } from "./report.js";

export function validateCyoa(pack: CyoaPack): ValidationReport {
  const findings: Finding[] = [];
  const index = indexPack(pack);
  const { scenes, endingIds, terminalIds } = index;
  const allNodeIds = new Set<string>([...scenes.keys(), ...endingIds]);

  // ── Duplicate ids ────────────────────────────────────────────────────────
  dupCheck(
    pack.scenes.map((s) => s.id),
    "scene",
    findings,
  );
  dupCheck(
    pack.endings.map((e) => e.id),
    "ending",
    findings,
  );
  for (const id of scenes.keys()) {
    if (endingIds.has(id)) {
      findings.push(
        err("DUPLICATE_ID", `id "${id}" is used by both a scene and an ending.`, [`node:${id}`]),
      );
    }
  }
  for (const scene of pack.scenes) {
    dupCheck(
      scene.choices.map((c) => c.id),
      `choice in scene "${scene.id}"`,
      findings,
      `scene:${scene.id}`,
    );
  }

  // ── Start exists / is a scene ──────────────────────────────────────────────
  if (!allNodeIds.has(pack.meta.start)) {
    findings.push(
      err("START_MISSING", `meta.start "${pack.meta.start}" does not resolve to any node.`, [
        "meta:start",
      ]),
    );
  } else if (terminalIds.has(pack.meta.start)) {
    findings.push(
      err(
        "START_NOT_SCENE",
        `meta.start "${pack.meta.start}" is a terminal/ending; the game would end immediately.`,
        ["meta:start"],
      ),
    );
  }

  // ── Deadline (meta-level global terminal) ──────────────────────────────────
  // A `meta.deadline` ends the game at `deadline.ending` whenever `deadline.when`
  // holds (engine §8.4.5 checkWin). It is reached WITHOUT any choice `next`/`goto`
  // pointing at it, so the reachability/soft-lock graph below must be told about
  // it, or it would wrongly read as an unreachable ending. Validate the reference
  // here; register the structural edge inside the successors loop.
  const deadline = pack.meta.deadline;
  if (deadline) {
    if (!allNodeIds.has(deadline.ending)) {
      findings.push(
        err(
          "REF_UNRESOLVED",
          `meta.deadline.ending "${deadline.ending}" does not resolve to any scene or ending.`,
          ["meta:deadline"],
        ),
      );
    } else if (!terminalIds.has(deadline.ending)) {
      findings.push(
        err(
          "DEADLINE_NOT_TERMINAL",
          `meta.deadline.ending "${deadline.ending}" is not a terminal (declared ending or is_ending scene).`,
          ["meta:deadline"],
        ),
      );
    }
  }
  const deadlineVars = deadline ? varNamesInConditions(deadline.when) : new Set<string>();

  // ── Reference integrity: every transition target resolves ──────────────────
  const successors = new Map<string, Set<string>>();
  for (const scene of pack.scenes) {
    if (scene.is_ending) continue;
    const outs = new Set<string>();
    for (const choice of scene.choices) {
      registerTarget(choice.next, outs, allNodeIds, findings, [
        `scene:${scene.id}`,
        `choice:${choice.id}`,
      ]);
      for (const t of gotoTargets(choice.effects))
        registerTarget(t, outs, allNodeIds, findings, [`scene:${scene.id}`, `choice:${choice.id}`]);
    }
    for (const t of gotoTargets(scene.on_enter))
      registerTarget(t, outs, allNodeIds, findings, [`scene:${scene.id}`, "on_enter"]);
    // The deadline can fire on entering this scene if its on_enter advances a var
    // the deadline watches (the ref is already validated above, so add directly).
    if (
      deadline &&
      terminalIds.has(deadline.ending) &&
      [...varsWrittenByEffects(scene.on_enter)].some((v) => deadlineVars.has(v))
    ) {
      outs.add(deadline.ending);
    }
    successors.set(scene.id, outs);
  }

  // ── Reachability (structural BFS from start, ignoring conditions) ──────────
  const reachable = bfs(pack.meta.start, successors);
  for (const scene of pack.scenes) {
    if (scene.id !== pack.meta.start && !reachable.has(scene.id)) {
      findings.push(
        warn("UNREACHABLE_SCENE", `scene "${scene.id}" is not reachable from start.`, [
          `scene:${scene.id}`,
        ]),
      );
    }
  }

  // ── Ending reachability ────────────────────────────────────────────────────
  const reachableTerminals = [...terminalIds].filter((t) => reachable.has(t));
  if (reachableTerminals.length === 0) {
    findings.push(
      err(
        "NO_REACHABLE_ENDING",
        "no ending is reachable from start — the game cannot be completed.",
        ["meta:start"],
      ),
    );
  }
  for (const e of pack.endings) {
    if (!reachable.has(e.id)) {
      findings.push(
        err("ENDING_UNREACHABLE", `declared ending "${e.id}" is never reachable.`, [
          `ending:${e.id}`,
        ]),
      );
    }
  }

  // ── Soft-locks: every reachable scene must still be able to reach an ending ─
  // Sound at the graph level: if even with all edges available you cannot reach
  // a terminal, the state is definitely a soft-lock.
  const canReachTerminal = reverseReach(terminalIds, successors, allNodeIds);
  for (const scene of pack.scenes) {
    if (scene.is_ending || !reachable.has(scene.id)) continue;
    if (!canReachTerminal.has(scene.id)) {
      findings.push(
        err("SOFTLOCK", `from scene "${scene.id}" no ending is reachable (soft-lock).`, [
          `scene:${scene.id}`,
        ]),
      );
    }
  }

  // ── Dead ends: a reachable non-ending scene with no choices at all ─────────
  for (const scene of pack.scenes) {
    if (scene.is_ending || !reachable.has(scene.id)) continue;
    if (scene.choices.length === 0) {
      findings.push(
        err("DEAD_END", `non-ending scene "${scene.id}" has no choices.`, [`scene:${scene.id}`]),
      );
    }
  }

  // ── Feasibility + contradiction (flags / items / vars) ─────────────────────
  const writes = collectWrites(pack);
  const initVars = pack.meta.vars_init;
  for (const scene of pack.scenes) {
    for (const choice of scene.choices) {
      const where = [`scene:${scene.id}`, `choice:${choice.id}`];
      const req = collectRequired(choice.conditions);

      // Contradictions within a single (AND-context) condition set.
      for (const f of req.reqFlags) {
        if (req.forbidFlags.has(f))
          findings.push(
            err(
              "CONTRADICTORY_CONDITION",
              `choice requires flag "${f}" to be both set and unset.`,
              where,
            ),
          );
      }
      for (const it of req.reqItems) {
        if (req.forbidItems.has(it))
          findings.push(
            err(
              "CONTRADICTORY_CONDITION",
              `choice requires item "${it}" to be both held and not held.`,
              where,
            ),
          );
      }
      for (const [name, vals] of req.eqValues) {
        if (vals.size > 1)
          findings.push(
            err(
              "CONTRADICTORY_CONDITION",
              `choice requires var "${name}" to equal ${[...vals].join(" and ")} simultaneously.`,
              where,
            ),
          );
      }

      // Feasibility: a positively-required flag/item that nothing ever provides
      // is an impossible gate (conservative: only flags required in AND-context).
      for (const f of req.reqFlags) {
        if (!writes.setFlags.has(f) && !pack.meta.flags_init.includes(f)) {
          findings.push(
            err("IMPOSSIBLE_GATE", `choice requires flag "${f}" that no effect ever sets.`, where),
          );
        }
      }
      for (const it of req.reqItems) {
        if (!writes.addedItems.has(it)) {
          findings.push(
            err(
              "ITEM_UNOBTAINABLE",
              `choice requires item "${it}" that no effect ever grants.`,
              where,
            ),
          );
        }
      }
      for (const vr of req.varReqs) {
        const init = initVars[vr.name] ?? 0;
        const needsRaise =
          (vr.op === "gte" && vr.value > init) || (vr.op === "eq" && vr.value !== init);
        if (needsRaise && !writes.writtenVars.has(vr.name)) {
          findings.push(
            err(
              "IMPOSSIBLE_GATE",
              `choice requires var "${vr.name}" ${vr.op} ${vr.value} but nothing ever writes it (init ${init}).`,
              where,
            ),
          );
        }
      }
    }
  }

  // ── Duplicate endings (structurally identical title+text) ──────────────────
  const seen = new Map<string, string>();
  const terminals: { id: string; title: string; text: string }[] = [
    ...pack.endings.map((e) => ({ id: e.id, title: e.title, text: e.text })),
    ...pack.scenes
      .filter((s) => s.is_ending)
      .map((s) => ({ id: s.id, title: s.title, text: s.text })),
  ];
  for (const t of terminals) {
    const key = `${t.title} ${t.text}`;
    const prev = seen.get(key);
    if (prev)
      findings.push(
        warn("DUPLICATE_ENDING", `ending "${t.id}" is structurally identical to "${prev}".`, [
          `ending:${t.id}`,
          `ending:${prev}`,
        ]),
      );
    else seen.set(key, t.id);
  }

  return makeReport(pack.meta.id, findings);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function err(code: string, message: string, where: string[]): Finding {
  return { severity: "error", code, message, where };
}
function warn(code: string, message: string, where: string[]): Finding {
  return { severity: "warning", code, message, where };
}

function dupCheck(ids: string[], label: string, findings: Finding[], where?: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id))
      findings.push(
        err("DUPLICATE_ID", `duplicate ${label} id "${id}".`, where ? [where] : [`id:${id}`]),
      );
    seen.add(id);
  }
}

function registerTarget(
  target: string,
  outs: Set<string>,
  allNodeIds: Set<string>,
  findings: Finding[],
  where: string[],
): void {
  if (!allNodeIds.has(target)) {
    findings.push(
      err(
        "REF_UNRESOLVED",
        `transition target "${target}" does not resolve to any scene or ending.`,
        where,
      ),
    );
    return;
  }
  outs.add(target);
}

function gotoTargets(effects: Effect[]): string[] {
  return effects.flatMap((e) => ("goto" in e ? [e.goto] : []));
}

/** Var names a condition tree reads (var_gte/var_lte/var_eq), descending through
 *  all_of/any_of/none_of. Used to know which scenes can trip a var-keyed deadline. */
function varNamesInConditions(conds: Condition[]): Set<string> {
  const out = new Set<string>();
  const walk = (c: Condition): void => {
    if ("var_gte" in c) out.add(c.var_gte.name);
    else if ("var_lte" in c) out.add(c.var_lte.name);
    else if ("var_eq" in c) out.add(c.var_eq.name);
    else if ("all_of" in c) c.all_of.forEach(walk);
    else if ("any_of" in c) c.any_of.forEach(walk);
    else if ("none_of" in c) c.none_of.forEach(walk);
  };
  conds.forEach(walk);
  return out;
}

/** Var names a list of effects writes (set_var/inc_var/dec_var). */
function varsWrittenByEffects(effects: Effect[]): Set<string> {
  const out = new Set<string>();
  for (const e of effects) {
    if ("set_var" in e) out.add(e.set_var.name);
    else if ("inc_var" in e) out.add(e.inc_var.name);
    else if ("dec_var" in e) out.add(e.dec_var.name);
  }
  return out;
}

function bfs(start: string, successors: Map<string, Set<string>>): Set<string> {
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length) {
    const node = queue.shift() as string;
    for (const next of successors.get(node) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

function reverseReach(
  targets: Set<string>,
  successors: Map<string, Set<string>>,
  allNodeIds: Set<string>,
): Set<string> {
  const reverse = new Map<string, Set<string>>();
  for (const id of allNodeIds) reverse.set(id, new Set());
  for (const [from, outs] of successors) {
    for (const to of outs) reverse.get(to)?.add(from);
  }
  const seen = new Set<string>([...targets].filter((t) => allNodeIds.has(t)));
  const queue = [...seen];
  while (queue.length) {
    const node = queue.shift() as string;
    for (const pred of reverse.get(node) ?? []) {
      if (!seen.has(pred)) {
        seen.add(pred);
        queue.push(pred);
      }
    }
  }
  return seen;
}

type Writes = { setFlags: Set<string>; addedItems: Set<string>; writtenVars: Set<string> };

function collectWrites(pack: CyoaPack): Writes {
  const setFlags = new Set<string>();
  const addedItems = new Set<string>();
  const writtenVars = new Set<string>();
  const scan = (effects: Effect[]): void => {
    for (const e of effects) {
      if ("set_flag" in e) setFlags.add(e.set_flag);
      else if ("add_item" in e) addedItems.add(e.add_item);
      else if ("set_var" in e) writtenVars.add(e.set_var.name);
      else if ("inc_var" in e) writtenVars.add(e.inc_var.name);
      else if ("dec_var" in e) writtenVars.add(e.dec_var.name);
    }
  };
  for (const scene of pack.scenes) {
    scan(scene.on_enter);
    for (const choice of scene.choices) scan(choice.effects);
  }
  return { setFlags, addedItems, writtenVars };
}

type VarReq = { name: string; op: "gte" | "eq"; value: number };
type Required = {
  reqFlags: Set<string>;
  forbidFlags: Set<string>;
  reqItems: Set<string>;
  forbidItems: Set<string>;
  varReqs: VarReq[];
  eqValues: Map<string, Set<number>>;
};

/**
 * Collect what a condition set REQUIRES in AND-context. We descend only through
 * top-level (implicit AND) and all_of nodes; any_of/none_of are treated as
 * optional and skipped — this avoids false "impossible" errors at the cost of
 * not analyzing feasibility inside disjunctions (a documented limitation).
 */
function collectRequired(conditions: Condition[]): Required {
  const out: Required = {
    reqFlags: new Set(),
    forbidFlags: new Set(),
    reqItems: new Set(),
    forbidItems: new Set(),
    varReqs: [],
    eqValues: new Map(),
  };
  const walk = (cond: Condition): void => {
    if ("has_flag" in cond) out.reqFlags.add(cond.has_flag);
    else if ("not_flag" in cond) out.forbidFlags.add(cond.not_flag);
    else if ("has_item" in cond) out.reqItems.add(cond.has_item);
    else if ("not_item" in cond) out.forbidItems.add(cond.not_item);
    else if ("var_gte" in cond)
      out.varReqs.push({ name: cond.var_gte.name, op: "gte", value: cond.var_gte.value });
    else if ("var_eq" in cond) {
      out.varReqs.push({ name: cond.var_eq.name, op: "eq", value: cond.var_eq.value });
      const set = out.eqValues.get(cond.var_eq.name) ?? new Set<number>();
      set.add(cond.var_eq.value);
      out.eqValues.set(cond.var_eq.name, set);
    } else if ("all_of" in cond) cond.all_of.forEach(walk);
    // any_of / none_of / var_lte / visited: not treated as hard requirements here.
  };
  conditions.forEach(walk);
  return out;
}
