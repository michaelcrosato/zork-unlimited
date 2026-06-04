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
import { type Condition, evalConditions } from "../core/conditions.js";
import type { Effect } from "../core/effects.js";
import type { GameState } from "../core/state.js";
import type { CyoaPack } from "../cyoa/schema.js";
import { indexPack, initStateForPack } from "../cyoa/runner.js";
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
  // Hoisted: what the pack ever provides (flags/items/vars). Needed both by the
  // deadline-firability check just below and the choice-feasibility check later.
  const writes = collectWrites(pack);
  // Direction-aware var writes (kind + signed amount). Shared by both deadline
  // soundness checks AND the choice-feasibility loop's direction-aware var-gate
  // check (bug_0110) — computed once.
  const falsifiers = collectFalsifiers(pack);
  const deadline = pack.meta.deadline;
  // Whether the deadline can PROVABLY never fire. A provably-unfireable deadline must
  // NOT contribute its escape edge to the soft-lock graph below — doing so would let a
  // dead terminal mask a true SOFTLOCK (bug_0092). Set by checkDeadlineFirability.
  let deadlineUnfireable = false;
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
    // Firability: a deadline that can PROVABLY never fire is a Chekhov's gun — the
    // declared urgency mechanic (bug_0079/0080) is dead — AND a latent unsoundness
    // for the soft-lock graph below, which (lines further down) treats the deadline
    // as a real escape edge whenever a scene writes a watched var. If the `when`
    // also requires a flag/item that is never provided, that edge is a phantom: the
    // graph would count a scene as escapable via a deadline that never triggers. The
    // sibling of the variant-soundness family (bug_0085 shadowed / bug_0086 vacuous),
    // reusing the same conjunctive machinery and the choice-feasibility logic below.
    deadlineUnfireable = checkDeadlineFirability(
      deadline.when,
      pack.meta.flags_init,
      pack.meta.vars_init,
      writes,
      falsifiers.varWrites,
      findings,
    );
    // The OPPOSITE soundness failure of firability: a deadline whose `when` already
    // holds in the INITIAL state and can never be falsified fires on the player's
    // FIRST action, on every path (engine §8.4.5 checkWin runs post-action, not at
    // game start — src/core/engine.ts), so no scene past the start is ever playable.
    // That is unplayable (an ERROR, like START_NOT_SCENE), not a merely-dead mechanic.
    checkDeadlineFiresAtStart(deadline.when, initStateForPack(index, 0), falsifiers, findings);
  }
  const deadlineVars = deadline ? varNamesInConditions(deadline.when) : new Set<string>();

  // ── Reference integrity: every transition target resolves ──────────────────
  const successors = new Map<string, Set<string>>();
  for (const scene of pack.scenes) {
    if (scene.is_ending) continue;
    const outs = new Set<string>();
    for (const choice of scene.choices) {
      if (choice.next !== undefined) {
        registerTarget(choice.next, outs, allNodeIds, findings, [
          `scene:${scene.id}`,
          `choice:${choice.id}`,
        ]);
      }
      // A skill-checked choice carries no `next`; its routing lives in the on_success /
      // on_failure effects (their goto/end_game), so register THOSE as the choice's
      // transition edges — the reachability/soft-lock graph must see both branch outcomes.
      const skillEffects = choice.skill_check
        ? [...choice.skill_check.on_success, ...choice.skill_check.on_failure]
        : [];
      for (const t of gotoTargets([...choice.effects, ...skillEffects]))
        registerTarget(t, outs, allNodeIds, findings, [`scene:${scene.id}`, `choice:${choice.id}`]);
    }
    for (const t of gotoTargets(scene.on_enter))
      registerTarget(t, outs, allNodeIds, findings, [`scene:${scene.id}`, "on_enter"]);
    // The deadline can fire after ANY action whose effects advance a var it
    // watches — on entering this scene (on_enter) OR on taking any of its choices
    // (choice effects) — because the engine's §8.4.5 checkWin runs against the
    // post-effects state for both (src/core/engine.ts). Register the structural
    // edge for either, so a deadline driven purely by a choice effect (a natural
    // "spend an hour searching" action that never advances the var via on_enter)
    // is still seen as reachable and as an escape, not spuriously ENDING_UNREACHABLE
    // or a false SOFTLOCK. The ref is already validated above, so add directly.
    if (deadline && terminalIds.has(deadline.ending) && !deadlineUnfireable) {
      const writesWatched = (effects: Effect[]): boolean =>
        [...varsWrittenByEffects(effects)].some((v) => deadlineVars.has(v));
      if (writesWatched(scene.on_enter) || scene.choices.some((c) => writesWatched(c.effects))) {
        outs.add(deadline.ending);
      }
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
  // `writes` is hoisted to the deadline section above and reused here.
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
        if (vr.op === "gte" && vr.value > init) {
          // Direction-aware (bug_0110), mirroring the deadline-firability fix
          // (bug_0109): a var that IS written but only ever DROPS (decrements,
          // no-op/negative incs, or sets that land below the bound) can never rise
          // to a higher `gte` threshold from its init, so the gate is just as
          // impossible as an unwritten var — the choice is never offered. The
          // coarse `writtenVars.has` test let this through. Sound & conservative:
          // one write that can raise the var to the bound (a positive inc or a
          // set >= value) makes us treat it as reachable, so a live gate is never
          // wrongly errored.
          if (!varCanReachGte(vr.value, falsifiers.varWrites.get(vr.name))) {
            findings.push(
              err(
                "IMPOSSIBLE_GATE",
                `choice requires var "${vr.name}" gte ${vr.value} but no effect can ever raise it to that bound (init ${init}).`,
                where,
              ),
            );
          }
        } else if (vr.op === "eq" && vr.value !== init) {
          // `eq` stays on the coarse test: an inc/dec/set could land on the value,
          // so a written var is not provably dead — only an entirely unwritten one.
          if (!writes.writtenVars.has(vr.name)) {
            findings.push(
              err(
                "IMPOSSIBLE_GATE",
                `choice requires var "${vr.name}" eq ${vr.value} but nothing ever writes it (init ${init}).`,
                where,
              ),
            );
          }
        }
      }
    }
  }

  // ── Unreachable reactive variants (first-match-wins shadowing) ─────────────
  // A scene's / ending's `variants` are evaluated in declared order, first whose
  // `when` holds wins (runner.ts sceneText/endingText). So a later variant whose
  // `when` is ENTAILED by an earlier one's can never be the first match — it is
  // dead content. This is the exact footgun every reactive pack hand-guards in
  // prose ("higher threshold first, first match wins", repeated ~10× in the
  // clockwork pack alone); this check makes that ordering invariant machine-
  // enforced. Sound (no false positives): we only flag when we can PROVE entailment
  // over a pure conjunction of literals/var-bounds; any `any_of`/`none_of` makes a
  // `when` opaque and we never prove implication for it (we just detect fewer).
  for (const scene of pack.scenes) {
    checkVariantShadowing(scene.variants, `scene:${scene.id}`, findings);
  }
  for (const ending of pack.endings) {
    checkVariantShadowing(ending.variants, `ending:${ending.id}`, findings);
  }

  // ── Vacuously-false guards (a condition that can never hold) ────────────────
  // Sibling of the shadowing check above: where shadowing flags a guard a sibling
  // pre-empts, this flags a guard CONTRADICTORY in itself (a flag/item/visited
  // pinned both ways, or crossed var bounds). Such a `when`/`conditions` is dead
  // for a different reason — it can never be true at all — so the variant never
  // displays and the choice is never offered. Same sound-over-a-conjunction basis
  // as bug_0085; both surface silently-dead content a blind playtest can't see.
  for (const scene of pack.scenes) {
    for (let i = 0; i < (scene.variants?.length ?? 0); i++) {
      checkUnsatisfiable(
        scene.variants?.[i]?.when,
        [`scene:${scene.id}`, `variant:${i}`],
        `scene "${scene.id}" variant #${i + 1}`,
        findings,
      );
    }
    for (const choice of scene.choices) {
      checkUnsatisfiable(
        choice.conditions,
        [`scene:${scene.id}`, `choice:${choice.id}`],
        `choice "${choice.id}" in scene "${scene.id}"`,
        findings,
      );
    }
  }
  for (const ending of pack.endings) {
    for (let i = 0; i < (ending.variants?.length ?? 0); i++) {
      checkUnsatisfiable(
        ending.variants?.[i]?.when,
        [`ending:${ending.id}`, `variant:${i}`],
        `ending "${ending.id}" variant #${i + 1}`,
        findings,
      );
    }
  }

  // ── Inert flags (set but never read) ────────────────────────────────────────
  // The newest member of the soundness family above and the flag-side sibling of
  // DEADLINE_UNFIREABLE: a flag that some `set_flag` effect writes (or that
  // flags_init declares) but that NO condition anywhere reads — has_flag/not_flag,
  // including nested all_of/any_of/none_of — is dead bookkeeping. The write changes
  // nothing the game ever consults: a Chekhov's gun set but never fired upon. A blind
  // playtester cannot judge this from inside the game (a seed-23 wreckers_light pass
  // asked exactly "is this flag inert?" and could not tell — bug_0104); this check
  // answers it statically, turning that manual worry into the enforced bar. Sound (no
  // false positives): a flag is flagged ONLY when it has provably zero readers across
  // the whole pack — choices, scene/ending variants, and the deadline `when`. Warning,
  // not error: an inert flag is a no-op, never a soft-lock — advisory like its siblings.
  const flagReads = collectFlagReads(pack);
  for (const f of new Set<string>([...writes.setFlags, ...pack.meta.flags_init])) {
    if (!flagReads.has(f)) {
      findings.push(
        warn(
          "INERT_FLAG",
          `flag "${f}" is set (or declared in flags_init) but never read by any ` +
            `condition — a no-op write (dead bookkeeping). Gate something on it, or ` +
            `remove the set so the pack states only what it uses.`,
          [`flag:${f}`],
        ),
      );
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

/**
 * The conjunctive shape of a variant's `when`: the positive/negative atoms it
 * pins and the tightest var bounds it implies. `opaque` is set when the `when`
 * contains an `any_of`/`none_of` (a disjunction we cannot reason about soundly) —
 * an opaque profile never participates in an entailment proof, so the check stays
 * sound (it only ever proves implications it can fully justify).
 */
type WhenProfile = {
  pos: Set<string>; // atoms guaranteed true  (flag:f, item:i, visited:r, open:o, unlocked:o, quest:q=s)
  neg: Set<string>; // atoms guaranteed false (flag:f, item:i, visited:r)
  lower: Map<string, number>; // strongest var ">=" bound per var
  upper: Map<string, number>; // strongest var "<=" bound per var
  opaque: boolean;
};

function whenProfile(when: Condition[]): WhenProfile {
  const p: WhenProfile = {
    pos: new Set(),
    neg: new Set(),
    lower: new Map(),
    upper: new Map(),
    opaque: false,
  };
  const raise = (m: Map<string, number>, k: string, v: number, keepMax: boolean): void => {
    const cur = m.get(k);
    if (cur === undefined) m.set(k, v);
    else m.set(k, keepMax ? Math.max(cur, v) : Math.min(cur, v));
  };
  const walk = (c: Condition): void => {
    if ("has_flag" in c) p.pos.add(`flag:${c.has_flag}`);
    else if ("not_flag" in c) p.neg.add(`flag:${c.not_flag}`);
    else if ("has_item" in c) p.pos.add(`item:${c.has_item}`);
    else if ("not_item" in c) p.neg.add(`item:${c.not_item}`);
    else if ("visited" in c) p.pos.add(`visited:${c.visited}`);
    else if ("not_visited" in c) p.neg.add(`visited:${c.not_visited}`);
    else if ("is_open" in c) p.pos.add(`open:${c.is_open}`);
    else if ("is_unlocked" in c) p.pos.add(`unlocked:${c.is_unlocked}`);
    else if ("quest_stage" in c) p.pos.add(`quest:${c.quest_stage.quest}=${c.quest_stage.stage}`);
    else if ("var_gte" in c) raise(p.lower, c.var_gte.name, c.var_gte.value, true);
    else if ("var_lte" in c) raise(p.upper, c.var_lte.name, c.var_lte.value, false);
    else if ("var_eq" in c) {
      raise(p.lower, c.var_eq.name, c.var_eq.value, true);
      raise(p.upper, c.var_eq.name, c.var_eq.value, false);
    } else if ("all_of" in c) c.all_of.forEach(walk);
    // any_of / none_of are disjunctions we don't model — mark opaque so this
    // profile is never used to prove (or be proven by) an entailment.
    else p.opaque = true;
  };
  when.forEach(walk);
  return p;
}

/** True when every state satisfying `j` also satisfies `i` (j ⟹ i): then an
 *  earlier `i` always wins over a later `j`, so `j` is dead. Sound, conservative:
 *  any opaque profile (a disjunction we can't reason about) returns false. */
function entails(j: WhenProfile, i: WhenProfile): boolean {
  if (j.opaque || i.opaque) return false;
  for (const k of i.pos) if (!j.pos.has(k)) return false;
  for (const k of i.neg) if (!j.neg.has(k)) return false;
  for (const [name, need] of i.lower) {
    const have = j.lower.get(name);
    if (have === undefined || have < need) return false;
  }
  for (const [name, need] of i.upper) {
    const have = j.upper.get(name);
    if (have === undefined || have > need) return false;
  }
  return true;
}

/** True when a profile's conjunction is internally contradictory, so NO state can
 *  satisfy it — the guard is vacuously false and whatever it gates is dead content.
 *  Two sound contradictions over a pure conjunction:
 *    • the same atom pinned true AND false (e.g. `has_flag:x` ∧ `not_flag:x`), and
 *    • a var's `>=` lower bound exceeding its `<=` upper bound (e.g. ticks>=5 ∧ ticks<=3).
 *  `opaque` is irrelevant here: a contradiction among the CONJUNCTIVE atoms makes the
 *  whole top-level AND unsatisfiable regardless of any `any_of`/`none_of` sibling (a
 *  disjunction can only further constrain, never rescue, an already-false conjunction).
 *  So this stays sound even when `whenProfile` marked the profile opaque. */
function isUnsatisfiable(p: WhenProfile): boolean {
  for (const k of p.pos) if (p.neg.has(k)) return true;
  for (const [name, lo] of p.lower) {
    const hi = p.upper.get(name);
    if (hi !== undefined && lo > hi) return true;
  }
  return false;
}

/** Flag any guard (variant `when` or choice `conditions`) that can never hold: its
 *  conjunction is internally contradictory, so the variant never displays / the
 *  choice is never offered. Sibling of the shadowing check (bug_0085) — both surface
 *  silently-dead content the blind playtest can't see (it simply never appears). */
function checkUnsatisfiable(
  conditions: Condition[] | undefined,
  where: string[],
  label: string,
  findings: Finding[],
): void {
  if (!conditions || conditions.length === 0) return;
  if (isUnsatisfiable(whenProfile(conditions))) {
    findings.push(
      warn(
        "UNSATISFIABLE_CONDITION",
        `${label} has a guard that can never hold (it pins a flag/item/visited both ` +
          `true and false, or sets crossed var bounds), so it is dead — it can never ` +
          `display/fire. Fix or remove the contradictory condition.`,
        where,
      ),
    );
  }
}

/** Flag a `meta.deadline` that can PROVABLY never fire — a declared-but-dead
 *  urgency mechanic (a Chekhov's gun), and a latent unsoundness for the soft-lock
 *  graph, which treats the deadline as a real escape edge. Two sound grounds, both
 *  reusing existing machinery and conservative (only fire when firing is provably
 *  impossible, never on a deadline that is merely hard to reach):
 *    (a) the `when` is internally contradictory (isUnsatisfiable — bug_0086); or
 *    (b) it REQUIRES, in AND-context, a flag/item/var that no effect ever
 *        provides/writes (the choice-feasibility logic, applied to the deadline).
 *  For a `var_gte` bound the check is direction-aware (bug_0109): a watched var that
 *  IS written but only ever DROPS (decrements, no-op incs, or sets that land below
 *  the bound) can never reach a higher threshold, so the deadline is just as dead as
 *  one whose var is never written — the coarse "is it ever written?" test missed this. */
function checkDeadlineFirability(
  when: Condition[],
  flagsInit: string[],
  varsInit: Record<string, number>,
  writes: Writes,
  varWrites: Map<string, VarWrite[]>,
  findings: Finding[],
): boolean {
  if (isUnsatisfiable(whenProfile(when))) {
    findings.push(
      warn(
        "DEADLINE_UNFIREABLE",
        "meta.deadline.when is internally contradictory (it pins a flag/item both ways " +
          "or sets crossed var bounds), so the deadline can never fire — a declared-but-" +
          "dead urgency mechanic.",
        ["meta:deadline"],
      ),
    );
    return true; // one witness is enough; the (b) scan would only restate it
  }
  const req = collectRequired(when);
  const missing: string[] = [];
  for (const f of req.reqFlags)
    if (!writes.setFlags.has(f) && !flagsInit.includes(f)) missing.push(`flag "${f}" (never set)`);
  for (const it of req.reqItems)
    if (!writes.addedItems.has(it)) missing.push(`item "${it}" (never granted)`);
  for (const vr of req.varReqs) {
    const init = varsInit[vr.name] ?? 0;
    if (vr.op === "gte" && vr.value > init) {
      // Needs to RISE to the bound: dead unless some write can actually raise it
      // there. A var written only by decrements/no-op incs/sub-bound sets stays
      // below the bound forever — a Chekhov's gun the coarse test let through.
      if (!varCanReachGte(vr.value, varWrites.get(vr.name)))
        missing.push(
          `var "${vr.name}" gte ${vr.value} (no effect can raise it to that bound; init ${init})`,
        );
    } else if (vr.op === "eq" && vr.value !== init) {
      // `eq` left to the coarse test: an inc/dec/set could land on the value, so a
      // written var is not provably dead — only an entirely unwritten one is.
      if (!writes.writtenVars.has(vr.name))
        missing.push(`var "${vr.name}" eq ${vr.value} (never written; init ${init})`);
    }
  }
  if (missing.length > 0) {
    findings.push(
      warn(
        "DEADLINE_UNFIREABLE",
        `meta.deadline.when requires ${missing.join(", ")}, which no effect ever provides, ` +
          "so the deadline can never fire — a declared-but-dead urgency mechanic.",
        ["meta:deadline"],
      ),
    );
    return true;
  }
  return false;
}

/** Flag a `meta.deadline` that fires on the player's FIRST action regardless of
 *  what they choose — the symmetric opposite of `checkDeadlineFirability`'s "can
 *  never fire". The engine's §8.4.5 `checkWin` runs against the post-action state
 *  (not at game start), so a deadline whose `when` (a) already holds in the initial
 *  state AND (b) can never be falsified by any effect will end the game at
 *  `deadline.ending` on whatever the player does first: no scene past the start is
 *  ever reachable in play, so the pack is unplayable (ERROR, like START_NOT_SCENE).
 *
 *  Sound & conservative (no false positives): the initial state is the engine's own
 *  (`initStateForPack`, start `on_enter` applied) evaluated by the engine's own
 *  `evalConditions`, and (b) is proven only for a flat conjunction of monotone-
 *  stable atoms — any disjunction/negation or unanalysed condition we cannot prove
 *  stable makes us bail (treat as falsifiable ⇒ no finding). A deadline that is
 *  merely satisfiable-early but escapable, or not yet due, is never flagged. */
function checkDeadlineFiresAtStart(
  when: Condition[],
  initial: GameState,
  falsifiers: Falsifiers,
  findings: Finding[],
): void {
  if (!evalConditions(when, initial)) return; // healthy: not yet due at game start
  if (!deadlineStaysTrueForever(when, falsifiers)) return; // some first action could escape it
  findings.push(
    err(
      "DEADLINE_FIRES_AT_START",
      "meta.deadline.when already holds in the initial state and no effect can falsify it, " +
        "so the deadline fires on the player's first action on every path (engine §8.4.5 " +
        "runs the win check post-action) — no scene past the start is ever playable. " +
        "Raise the threshold, fix the watched var's init value, or gate it behind a flag/item " +
        "the player must first acquire.",
      ["meta:deadline"],
    ),
  );
}

/** Every effect in the pack that could move a var, keyed by var name, plus the
 *  flag/item mutations — the raw material for proving a condition monotone-stable.
 *  `amount` is the literal `by` (inc/dec, sign-significant) or `value` (set). */
type VarWrite = { kind: "inc" | "dec" | "set"; amount: number };
type Falsifiers = {
  clearedFlags: Set<string>;
  setFlags: Set<string>;
  addedItems: Set<string>;
  removedItems: Set<string>;
  varWrites: Map<string, VarWrite[]>;
};

function collectFalsifiers(pack: CyoaPack): Falsifiers {
  const clearedFlags = new Set<string>();
  const setFlags = new Set<string>();
  const addedItems = new Set<string>();
  const removedItems = new Set<string>();
  const varWrites = new Map<string, VarWrite[]>();
  const pushVar = (name: string, w: VarWrite): void => {
    const arr = varWrites.get(name) ?? [];
    arr.push(w);
    varWrites.set(name, arr);
  };
  const scan = (effects: Effect[]): void => {
    for (const e of effects) {
      if ("set_flag" in e) setFlags.add(e.set_flag);
      else if ("clear_flag" in e) clearedFlags.add(e.clear_flag);
      else if ("add_item" in e) addedItems.add(e.add_item);
      else if ("remove_item" in e) removedItems.add(e.remove_item);
      else if ("inc_var" in e) pushVar(e.inc_var.name, { kind: "inc", amount: e.inc_var.by });
      else if ("dec_var" in e) pushVar(e.dec_var.name, { kind: "dec", amount: e.dec_var.by });
      else if ("set_var" in e) pushVar(e.set_var.name, { kind: "set", amount: e.set_var.value });
    }
  };
  for (const scene of pack.scenes) {
    scan(scene.on_enter);
    for (const choice of scene.choices) scan(choice.effects);
  }
  return { clearedFlags, setFlags, addedItems, removedItems, varWrites };
}

// A var that holds `>= floor` now keeps holding it iff no write can push it below
// floor: inc by a non-negative, dec by a non-positive (`by` is sign-significant —
// effects.ts allows negative), or set to a value still >= floor. Symmetric for the
// other two operators. (`inc_var` with a negative `by` really does decrement, so we
// must inspect the literal, not just the var name.)
function varNeverDrops(floor: number, writes: VarWrite[] | undefined): boolean {
  return (writes ?? []).every((w) =>
    w.kind === "inc" ? w.amount >= 0 : w.kind === "dec" ? w.amount <= 0 : w.amount >= floor,
  );
}
function varNeverRises(ceil: number, writes: VarWrite[] | undefined): boolean {
  return (writes ?? []).every((w) =>
    w.kind === "inc" ? w.amount <= 0 : w.kind === "dec" ? w.amount >= 0 : w.amount <= ceil,
  );
}
function varNeverChanges(fixed: number, writes: VarWrite[] | undefined): boolean {
  return (writes ?? []).every((w) => (w.kind === "set" ? w.amount === fixed : w.amount === 0));
}

// Can any effect actually push a var (starting below `value`) up to a `>= value`
// bound? Only a positive `inc` (repeatable round a loop, so it accumulates) or a
// `set` that lands at/above the bound can. Decrements, no-op/negative incs, and
// sub-bound sets never get there. Sound & conservative: one such write is enough to
// treat the bound as reachable, so we never call a live deadline dead (bug_0109).
function varCanReachGte(value: number, writes: VarWrite[] | undefined): boolean {
  return (writes ?? []).some(
    (w) => (w.kind === "inc" && w.amount > 0) || (w.kind === "set" && w.amount >= value),
  );
}

/** True iff `when` (taken as a conjunction) is true now AND stays true under every
 *  pack effect — so once it holds at init it can never become false. Proven only
 *  for a flat AND of atoms each individually monotone-stable; any_of/none_of and
 *  conditions we cannot prove stable (not_visited, object/quest state) make us bail
 *  to `false` (conservative: we never claim un-falsifiability we can't prove). */
function deadlineStaysTrueForever(when: Condition[], f: Falsifiers): boolean {
  let stable = true;
  const visit = (c: Condition): void => {
    if (!stable) return;
    if ("has_flag" in c) stable = !f.clearedFlags.has(c.has_flag);
    else if ("not_flag" in c) stable = !f.setFlags.has(c.not_flag);
    else if ("has_item" in c) stable = !f.removedItems.has(c.has_item);
    else if ("not_item" in c) stable = !f.addedItems.has(c.not_item);
    else if ("var_gte" in c)
      stable = varNeverDrops(c.var_gte.value, f.varWrites.get(c.var_gte.name));
    else if ("var_lte" in c)
      stable = varNeverRises(c.var_lte.value, f.varWrites.get(c.var_lte.name));
    else if ("var_eq" in c)
      stable = varNeverChanges(c.var_eq.value, f.varWrites.get(c.var_eq.name));
    else if ("visited" in c) {
      /* `visited` is monotone — once true it stays true; nothing un-visits. */
    } else stable = false; // any_of/none_of/not_visited/is_open/is_unlocked/quest_stage: not analysed
  };
  when.forEach(visit);
  return stable;
}

/** Flag any variant whose `when` is entailed by an earlier sibling's `when`: in a
 *  first-match-wins list it can never be the first match, so its text is dead. */
function checkVariantShadowing(
  variants: { when: Condition[] }[] | undefined,
  where: string,
  findings: Finding[],
): void {
  if (!variants || variants.length < 2) return;
  const profiles = variants.map((v) => whenProfile(v.when));
  for (let j = 1; j < profiles.length; j++) {
    const later = profiles[j];
    for (let i = 0; i < j; i++) {
      const earlier = profiles[i];
      if (later && earlier && entails(later, earlier)) {
        findings.push(
          warn(
            "UNREACHABLE_VARIANT",
            `variant #${j + 1} is shadowed by earlier variant #${i + 1}: whenever its ` +
              `\`when\` holds the earlier one does too, so (first-match-wins) it never ` +
              `displays. List more specific variants before the more general ones.`,
            [where, `variant:${j}`],
          ),
        );
        break; // one shadowing witness per variant is enough
      }
    }
  }
}

/** Every flag name a pack READS — has_flag/not_flag in any choice `conditions`,
 *  scene/ending variant `when`, or the deadline `when`, descending all_of/any_of/
 *  none_of. The set of consumers: a flag written by `set_flag` (or declared in
 *  flags_init) yet absent here is inert (INERT_FLAG). */
function collectFlagReads(pack: CyoaPack): Set<string> {
  const reads = new Set<string>();
  const walk = (c: Condition): void => {
    if ("has_flag" in c) reads.add(c.has_flag);
    else if ("not_flag" in c) reads.add(c.not_flag);
    else if ("all_of" in c) c.all_of.forEach(walk);
    else if ("any_of" in c) c.any_of.forEach(walk);
    else if ("none_of" in c) c.none_of.forEach(walk);
  };
  const walkAll = (conds: Condition[] | undefined): void => (conds ?? []).forEach(walk);
  for (const scene of pack.scenes) {
    for (const v of scene.variants ?? []) walkAll(v.when);
    for (const choice of scene.choices) walkAll(choice.conditions);
  }
  for (const ending of pack.endings) {
    for (const v of ending.variants ?? []) walkAll(v.when);
  }
  if (pack.meta.deadline) walkAll(pack.meta.deadline.when);
  return reads;
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
