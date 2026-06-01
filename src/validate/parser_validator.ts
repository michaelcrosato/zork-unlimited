/**
 * Parser validator (spec §10.2).
 *
 * A parser game's state space (inventory × object state × flags) is far larger
 * than CYOA's, so pure graph traversal is necessary but not sufficient. We check
 * structural invariants exactly and use documented, conservative approximations
 * where flags/items make a property undecidable in general — never silently a
 * weaker check than the spec names. A pack with any error finding is unplayable
 * (§10).
 *
 * Conservative choices, stated plainly:
 *  - Reachability ignores exit conditions (treats every edge as traversable).
 *    Sound for "unreachable", over-approximate for "reachable".
 *  - Item obtainability is a fixpoint over reachable rooms + openable containers
 *    whose key is itself obtainable. It ignores ordering ("before it is needed").
 *  - quest_critical loss is guarded two ways: an item consumed by an effect with
 *    no re-grant *while it is still needed in hand at a gate that does not consume
 *    it*, and an item droppable in a non-strongly-connected map (a room you cannot
 *    return to). An item whose every "must hold it" requirement coincides with the
 *    interaction that spends it has merely been SPENT for permanent progress (e.g.
 *    a rope tied off to open a well that then stays open by flag), not lost — so
 *    consuming it cannot wedge the quest. Both checks are sound over-approximations
 *    of "can be lost".
 */
import { exitFlag, type Effect } from "../core/effects.js";
import { evalConditions, type Condition } from "../core/conditions.js";
import { indexParserPack, initStateForParserPack } from "../parser/model.js";
import { type ParserPack, type GameObject, SCORE_VAR } from "../parser/schema.js";
import { type Finding, type ValidationReport, makeReport } from "./report.js";

const err = (code: string, message: string, where: string[]): Finding => ({
  severity: "error",
  code,
  message,
  where,
});
const warn = (code: string, message: string, where: string[]): Finding => ({
  severity: "warning",
  code,
  message,
  where,
});

/**
 * Extra facts a higher layer (the RPG validator, §13 Stage 4) can inject: flags
 * that runtime mechanics set (enemy defeat flags, skill-check successes) and items
 * those mechanics grant. They seed the feasibility/obtainability checks so a gate
 * legitimately satisfied by combat/skills is not mis-flagged as impossible.
 * Defaults are empty, so Stage-2/3 behavior is byte-identical.
 */
export type ValidateParserOptions = {
  extraSettableFlags?: string[];
  extraObtainable?: string[];
  /**
   * Extra `score` points the RPG layer (§13 Stage 4) can award through branches the
   * parser validator does not scan — enemy `on_defeat` and skill-check
   * `on_success`/`on_failure`. Folded into the SCORE_UNREACHABLE upper bound so a
   * score legitimately earned by winning a fight or passing a check is not
   * mis-flagged unreachable. These award sites are genuinely reachable (combat
   * winnability and skill-check passability are guarded by the RPG validator), so
   * counting them sharpens the conservative bound rather than weakening it. Default 0.
   */
  extraScoreAwards?: number;
  /**
   * Declared effects the RPG layer (§13 Stage 4) fires through branches the parser
   * scan never walks — enemy `on_defeat`, skill-check `on_success`/`on_failure`.
   * Folded into the WIN_FIRES_AT_START falsifier set so a win that one of those
   * branches can falsify is correctly judged escapable (not flagged). Default empty.
   */
  extraFalsifierEffects?: Effect[];
  /**
   * Vars that runtime mechanics mutate WITHOUT a declared effect the scan can see —
   * the player/enemy HP combat writes via dynamic `set_var` (rpg/combat.ts), not a
   * YAML `inc_var`. The WIN_FIRES_AT_START stability proof treats any condition on
   * one of these as falsifiable (bails), so it never claims an un-falsifiability
   * combat could break. Default empty (pure parser packs have no such vars).
   */
  extraVolatileVars?: string[];
};

export function validateParser(
  pack: ParserPack,
  opts: ValidateParserOptions = {},
): ValidationReport {
  const findings: Finding[] = [];
  const roomIds = new Set(pack.rooms.map((r) => r.id));
  const objById = new Map(pack.objects.map((o) => [o.id, o]));

  // ── Duplicate ids ──────────────────────────────────────────────────────────
  dupCheck(
    pack.rooms.map((r) => r.id),
    "room",
    findings,
  );
  dupCheck(
    pack.objects.map((o) => o.id),
    "object",
    findings,
  );
  dupCheck(
    pack.npcs.map((n) => n.id),
    "npc",
    findings,
  );

  // ── Reference integrity ─────────────────────────────────────────────────────
  if (!roomIds.has(pack.meta.start_room)) {
    findings.push(
      err("START_MISSING", `meta.start_room "${pack.meta.start_room}" is not a room.`, [
        "meta:start_room",
      ]),
    );
  }
  for (const room of pack.rooms) {
    for (const oid of room.objects) {
      if (!objById.has(oid))
        findings.push(
          err(
            "ROOM_OBJECT_MISSING",
            `room "${room.id}" lists object "${oid}" that is not defined.`,
            [`room:${room.id}`],
          ),
        );
    }
    for (const exit of room.exits) {
      if (!roomIds.has(exit.to))
        findings.push(
          err(
            "EXIT_TARGET_MISSING",
            `exit ${room.id} ${exit.direction} → "${exit.to}" targets no room.`,
            [`room:${room.id}`],
          ),
        );
    }
  }
  for (const o of pack.objects) {
    for (const cid of o.contents) {
      if (!objById.has(cid))
        findings.push(
          err(
            "CONTAINER_CONTENT_MISSING",
            `container "${o.id}" lists content "${cid}" that is not defined.`,
            [`object:${o.id}`],
          ),
        );
    }
    if (o.locked && o.key_id !== undefined && !objById.has(o.key_id)) {
      findings.push(
        err("KEY_MISSING", `locked object "${o.id}" names key "${o.key_id}" that is not defined.`, [
          `object:${o.id}`,
        ]),
      );
    }
    if (o.locked && o.key_id === undefined) {
      findings.push(
        err("LOCKED_NO_KEY", `locked object "${o.id}" has no key_id and no unlock path.`, [
          `object:${o.id}`,
        ]),
      );
    }
  }
  for (const npc of pack.npcs) {
    if (!roomIds.has(npc.room))
      findings.push(
        err(
          "NPC_ROOM_MISSING",
          `npc "${npc.id}" stands in room "${npc.room}" that does not exist.`,
          [`npc:${npc.id}`],
        ),
      );
  }

  // ── Ambiguous aliases: a name/alias must not resolve to two objects (§10.4) ──
  const aliasOwner = new Map<string, string>();
  for (const o of pack.objects) {
    for (const a of [o.name.toLowerCase(), ...o.aliases.map((x) => x.toLowerCase())]) {
      const prev = aliasOwner.get(a);
      if (prev && prev !== o.id)
        findings.push(
          err("AMBIGUOUS_ALIAS", `alias "${a}" is shared by objects "${prev}" and "${o.id}".`, [
            `object:${o.id}`,
            `object:${prev}`,
          ]),
        );
      else aliasOwner.set(a, o.id);
    }
  }

  // Bail before graph analysis if references are broken (would crash traversal).
  if (
    findings.some(
      (f) => f.severity === "error" && ["EXIT_TARGET_MISSING", "START_MISSING"].includes(f.code),
    )
  ) {
    return makeReport(pack.meta.id, findings);
  }

  // ── Structural reachability (BFS over exits, ignoring conditions) ────────────
  const succ = new Map<string, Set<string>>();
  for (const room of pack.rooms) succ.set(room.id, new Set(room.exits.map((e) => e.to)));
  const reachable = bfs(pack.meta.start_room, succ);
  for (const room of pack.rooms) {
    if (room.id !== pack.meta.start_room && !reachable.has(room.id)) {
      findings.push(
        warn("UNREACHABLE_ROOM", `room "${room.id}" is not reachable from start.`, [
          `room:${room.id}`,
        ]),
      );
    }
  }

  // ── Win-trigger rooms + soft-lock (every reachable room can still reach a win)
  const winRooms = new Set<string>();
  for (const wc of pack.win_conditions) {
    for (const c of wc.conditions) {
      const v = visitedRoom(c);
      if (v) winRooms.add(v);
    }
    if (wc.ending && !pack.endings.some((e) => e.id === wc.ending)) {
      findings.push(
        err(
          "ENDING_UNDECLARED",
          `win_condition "${wc.id}" ends in "${wc.ending}", which is not a declared ending.`,
          [`win:${wc.id}`],
        ),
      );
    }
  }
  for (const wr of winRooms) {
    if (!reachable.has(wr))
      findings.push(
        err(
          "WIN_UNREACHABLE",
          `win condition needs room "${wr}", which is unreachable from start.`,
          [`room:${wr}`],
        ),
      );
  }
  if (winRooms.size > 0) {
    const canReachWin = reverseReach(winRooms, succ);
    for (const room of pack.rooms) {
      if (reachable.has(room.id) && !winRooms.has(room.id) && !canReachWin.has(room.id)) {
        findings.push(
          err("SOFTLOCK", `from room "${room.id}" no win is reachable (dead-end / soft-lock).`, [
            `room:${room.id}`,
          ]),
        );
      }
    }
  }

  // ── Obtainability fixpoint (items reachable to pick up) ──────────────────────
  const obtainable = computeObtainable(pack, objById, reachable);
  for (const it of opts.extraObtainable ?? []) obtainable.add(it);

  // ── Settable flags (provided by some effect or flags_init) ───────────────────
  const settable = new Set<string>([...pack.meta.flags_init, ...(opts.extraSettableFlags ?? [])]);
  for (const e of allEffects(pack)) {
    if ("set_flag" in e) settable.add(e.set_flag);
    if ("unlock_exit" in e) settable.add(exitFlag(e.unlock_exit.from, e.unlock_exit.to));
  }

  // ── Feasibility of every gate (locked exits, interactions, win conditions) ───
  const checkConds = (conds: Condition[], where: string[]): void => {
    for (const f of flagReqs(conds)) {
      if (!settable.has(f))
        findings.push(
          err("IMPOSSIBLE_GATE", `condition requires flag "${f}" that no effect ever sets.`, where),
        );
    }
    for (const it of itemReqs(conds)) {
      if (!obtainable.has(it))
        findings.push(
          err(
            "ITEM_REQUIRED_UNOBTAINABLE",
            `condition requires item "${it}" that cannot be obtained.`,
            where,
          ),
        );
    }
  };
  for (const room of pack.rooms) {
    for (const exit of room.exits)
      checkConds(exit.conditions, [`room:${room.id}`, `exit:${exit.direction}`]);
  }
  for (const o of pack.objects) {
    if (o.locked && o.key_id !== undefined && objById.has(o.key_id) && !obtainable.has(o.key_id)) {
      findings.push(
        err(
          "KEY_UNOBTAINABLE",
          `locked object "${o.id}" needs key "${o.key_id}", which cannot be obtained.`,
          [`object:${o.id}`],
        ),
      );
    }
    for (const it of o.interactions) {
      checkConds(it.conditions, [`object:${o.id}`, `verb:${it.verb}`]);
      if (it.item !== undefined && !obtainable.has(it.item)) {
        findings.push(
          err(
            "ITEM_REQUIRED_UNOBTAINABLE",
            `interaction on "${o.id}" needs item "${it.item}", which cannot be obtained.`,
            [`object:${o.id}`],
          ),
        );
      }
    }
  }
  for (const wc of pack.win_conditions) checkConds(wc.conditions, [`win:${wc.id}`]);

  // ── quest_critical: never permanently lost ───────────────────────────────────
  const granted = new Set<string>();
  for (const e of allEffects(pack)) if ("add_item" in e) granted.add(e.add_item);
  const removed = new Map<string, string>(); // item → where
  for (const o of pack.objects) {
    for (const it of o.interactions) {
      for (const e of it.effects)
        if ("remove_item" in e) removed.set(e.remove_item, `object:${o.id}`);
    }
  }
  // "Needed in hand somewhere it is NOT spent": an item is only LOST (not merely
  // SPENT) by a consume if it is still required to be held at a gate that does not
  // itself consume it. We collect every must-hold-this-item requirement — an
  // interaction's `item:` field, has_item conditions on exits/interactions/win/
  // dialogue — and tag whether that same site also removes it. An item required
  // only at the site(s) that consume it has had its job discharged at the moment
  // it is spent (a tied-off rope, a key snapped in a one-way lock) and cannot
  // wedge the quest; an item required anywhere else is genuinely at risk.
  const neededWhileHeld = new Set<string>();
  const noteHeld = (id: string, consumedHere: boolean): void => {
    if (!consumedHere) neededWhileHeld.add(id);
  };
  for (const o of pack.objects) {
    for (const it of o.interactions) {
      const consumes = (id: string): boolean =>
        it.effects.some((e) => "remove_item" in e && e.remove_item === id);
      if (it.item !== undefined) noteHeld(it.item, consumes(it.item));
      for (const id of itemReqs(it.conditions)) noteHeld(id, consumes(id));
    }
  }
  for (const room of pack.rooms)
    for (const exit of room.exits) for (const id of itemReqs(exit.conditions)) noteHeld(id, false);
  for (const wc of pack.win_conditions)
    for (const id of itemReqs(wc.conditions)) noteHeld(id, false);
  for (const npc of pack.npcs)
    for (const node of npc.dialogue.nodes)
      for (const t of node.topics)
        for (const id of itemReqs(t.conditions ?? [])) noteHeld(id, false);
  // Strong connectivity over reachable, non-terminal rooms: a droppable item can
  // always be retrieved iff you can return to any room you can leave.
  const safeRooms = [...reachable].filter((r) => !winRooms.has(r));
  const stronglyConnected = isStronglyConnected(safeRooms, succ);
  for (const o of pack.objects) {
    if (!o.quest_critical) continue;
    const rm = removed.get(o.id);
    if (rm && !granted.has(o.id) && neededWhileHeld.has(o.id)) {
      findings.push(
        err(
          "SOFTLOCK_QUEST_ITEM",
          `quest_critical "${o.id}" is consumed (removed) with no re-grant while still needed in hand elsewhere — it can be permanently lost.`,
          [`object:${o.id}`],
        ),
      );
    }
    if (o.takeable && !stronglyConnected) {
      findings.push(
        err(
          "SOFTLOCK_QUEST_ITEM",
          `quest_critical "${o.id}" is takeable but the map has a one-way region — it could be dropped where it cannot be retrieved.`,
          [`object:${o.id}`],
        ),
      );
    }
  }

  // ── NPC dialogue integrity + termination ─────────────────────────────────────
  for (const npc of pack.npcs) {
    const nodeIds = new Set(npc.dialogue.nodes.map((n) => n.id));
    if (!nodeIds.has(npc.dialogue.root))
      findings.push(
        err(
          "DIALOGUE_ROOT_MISSING",
          `npc "${npc.id}" root node "${npc.dialogue.root}" does not exist.`,
          [`npc:${npc.id}`],
        ),
      );
    // A topic is only a GUARANTEED escape route if it is unconditional: a gated
    // topic may be hidden in some states, so termination must hold without it.
    // (A bad `goto` is still an error even when gated — that's a structural bug.)
    const unconditional = (t: { conditions?: unknown[] | undefined }): boolean =>
      !t.conditions || t.conditions.length === 0;
    const gotoEdges = new Map<string, Set<string>>();
    for (const node of npc.dialogue.nodes) {
      const outs = new Set<string>();
      for (const t of node.topics) {
        if (t.goto !== undefined) {
          if (!nodeIds.has(t.goto))
            findings.push(
              err(
                "DIALOGUE_GOTO_MISSING",
                `npc "${npc.id}" node "${node.id}" topic "${t.id}" goes to missing node "${t.goto}".`,
                [`npc:${npc.id}`],
              ),
            );
          else if (unconditional(t)) outs.add(t.goto);
        }
      }
      gotoEdges.set(node.id, outs);
    }
    // Every node must reach (via unconditional edges) a node offering an
    // unconditional `end` topic — only then is an exit guaranteed in every state.
    const endNodes = new Set(
      npc.dialogue.nodes
        .filter((n) => n.topics.some((t) => t.end && unconditional(t)))
        .map((n) => n.id),
    );
    const canEnd = reverseReach(endNodes, gotoEdges);
    for (const node of npc.dialogue.nodes) {
      if (!canEnd.has(node.id) && nodeIds.has(node.id)) {
        findings.push(
          err(
            "DIALOGUE_NONTERMINATING",
            `npc "${npc.id}" node "${node.id}" cannot reach an exit — the player would be trapped in conversation.`,
            [`npc:${npc.id}`],
          ),
        );
      }
    }
  }

  // ── Stage 3: endings, scoring, and death recoverability (§13 Stage 3) ────────
  const declaredEndings = new Map(pack.endings.map((e) => [e.id, e]));
  // Every end_game target (death endings are reached this way) must be declared.
  for (const e of allEffects(pack)) {
    if ("end_game" in e && !declaredEndings.has(e.end_game)) {
      findings.push(
        err(
          "END_GAME_UNDECLARED",
          `an end_game effect targets "${e.end_game}", which is not a declared ending.`,
          [`ending:${e.end_game}`],
        ),
      );
    }
  }
  // A win condition must not resolve to a death/failure ending — that would be
  // an unwinnable game dressed as a win.
  for (const wc of pack.win_conditions) {
    if (declaredEndings.get(wc.ending)?.death) {
      findings.push(
        err(
          "WIN_IS_DEATH",
          `win_condition "${wc.id}" ends in "${wc.ending}", which is flagged as a death ending.`,
          [`win:${wc.id}`],
        ),
      );
    }
  }
  // Death endings are recoverable via load (§8.7) so long as the win remains
  // reachable from the start — which WIN_UNREACHABLE already guards. Here we only
  // ensure at least one non-death (winnable) ending is declared.
  if (pack.endings.length > 0 && !pack.endings.some((e) => !e.death)) {
    findings.push(
      err(
        "NO_WINNABLE_ENDING",
        "every declared ending is a death ending — the game cannot be won.",
        ["meta:endings"],
      ),
    );
  }
  // Score reachability: the declared max_score cannot exceed the total points the
  // pack can ever award (conservative upper bound = initial + all inc_var awards).
  if (pack.meta.max_score > 0) {
    let totalAwards = pack.meta.vars_init[SCORE_VAR] ?? 0;
    for (const e of allEffects(pack))
      if ("inc_var" in e && e.inc_var.name === SCORE_VAR) totalAwards += e.inc_var.by;
    totalAwards += opts.extraScoreAwards ?? 0;
    if (totalAwards < pack.meta.max_score) {
      findings.push(
        err(
          "SCORE_UNREACHABLE",
          `meta.max_score is ${pack.meta.max_score} but at most ${totalAwards} point(s) can ever be awarded.`,
          ["meta:max_score"],
        ),
      );
    }
  }

  // ── A win condition already met at game start (§8.4.5 fires-at-start) ─────────
  checkWinFiresAtStart(
    pack,
    opts.extraFalsifierEffects ?? [],
    opts.extraVolatileVars ?? [],
    findings,
  );

  return makeReport(pack.meta.id, findings);
}

/**
 * Flag a `win_condition` that ALREADY HOLDS in the initial state and can never be
 * falsified — so it fires on the player's FIRST action on every path. The engine's
 * §8.4.5 `checkWin` runs against the POST-action state (src/core/engine.ts), never
 * at game start, so such a win ends the game at turn 1 on whatever the player does
 * first: no room past the start is ever played and the goal is granted for nothing.
 * That is an unplayable pack, so it is an ERROR — the parser/RPG analogue of the
 * CYOA validator's DEADLINE_FIRES_AT_START (a deadline that fires at start). The
 * existing IMPOSSIBLE_GATE / ITEM_REQUIRED_UNOBTAINABLE / WIN_UNREACHABLE checks
 * already guard the OPPOSITE degeneracy (a win that can never fire); this brackets
 * the other end.
 *
 * Sound & conservative (no false positives): the initial state is the engine's own
 * (`initStateForParserPack`, start `on_enter` applied, start room marked visited),
 * evaluated by the engine's own `evalConditions`; and un-falsifiability is proven
 * only for a flat conjunction of monotone-stable atoms — any disjunction/negation,
 * a `not_visited`/object/quest condition, or a condition on a combat-volatile var
 * makes us bail (treat as falsifiable ⇒ no finding). A win merely satisfiable early
 * but escapable on the first move is never flagged.
 */
function checkWinFiresAtStart(
  pack: ParserPack,
  extraFalsifierEffects: Effect[],
  volatileVars: string[],
  findings: Finding[],
): void {
  if (pack.win_conditions.length === 0) return;
  const index = indexParserPack(pack);
  const initial = initStateForParserPack(index, 0);
  const falsifiers = collectFalsifiers(pack, extraFalsifierEffects);
  const volatile = new Set(volatileVars);
  for (const wc of pack.win_conditions) {
    if (!evalConditions(wc.conditions, initial)) continue; // healthy: not met at start
    if (!winStaysTrueForever(wc.conditions, falsifiers, volatile)) continue; // first move can escape
    findings.push(
      err(
        "WIN_FIRES_AT_START",
        `win_condition "${wc.id}" already holds in the initial state and no effect can falsify it, ` +
          "so it fires on the player's first action on every path (engine §8.4.5 runs the win check " +
          "post-action, never at game start) — the game is won at turn 1 with no room past the start " +
          "ever played. Gate it behind a flag/item/room the player must first reach, or fix the " +
          "condition's threshold or initial value.",
        [`win:${wc.id}`],
      ),
    );
  }
}

// ── helpers ────────────────────────────────────────────────────────────────────

function dupCheck(ids: string[], label: string, findings: Finding[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id))
      findings.push(err("DUPLICATE_ID", `duplicate ${label} id "${id}".`, [`id:${id}`]));
    seen.add(id);
  }
}

function bfs(start: string, succ: Map<string, Set<string>>): Set<string> {
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length) {
    const n = queue.shift() as string;
    for (const next of succ.get(n) ?? [])
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
  }
  return seen;
}

function reverseReach(targets: Set<string>, succ: Map<string, Set<string>>): Set<string> {
  const reverse = new Map<string, Set<string>>();
  for (const [from, outs] of succ)
    for (const to of outs) (reverse.get(to) ?? reverse.set(to, new Set()).get(to)!).add(from);
  const seen = new Set<string>(targets);
  const queue = [...targets];
  while (queue.length) {
    const n = queue.shift() as string;
    for (const pred of reverse.get(n) ?? [])
      if (!seen.has(pred)) {
        seen.add(pred);
        queue.push(pred);
      }
  }
  return seen;
}

/** Is the node set `nodes` strongly connected over edges restricted to the set? */
function isStronglyConnected(nodes: string[], succ: Map<string, Set<string>>): boolean {
  if (nodes.length <= 1) return true;
  const inSet = new Set(nodes);
  const restricted = new Map<string, Set<string>>();
  for (const n of nodes)
    restricted.set(n, new Set([...(succ.get(n) ?? [])].filter((t) => inSet.has(t))));
  const root = nodes[0]!;
  const forward = bfs(root, restricted);
  const backward = reverseReach(new Set([root]), restricted);
  return nodes.every((n) => forward.has(n)) && nodes.every((n) => backward.has(n));
}

function computeObtainable(
  pack: ParserPack,
  objById: Map<string, GameObject>,
  reachable: Set<string>,
): Set<string> {
  const homeRoom = new Map<string, string>();
  for (const r of pack.rooms) for (const oid of r.objects) homeRoom.set(oid, r.id);
  const containerOf = new Map<string, string>();
  for (const o of pack.objects) for (const cid of o.contents) containerOf.set(cid, o.id);

  const obtainable = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const o of pack.objects) {
      if (!o.takeable || obtainable.has(o.id)) continue;
      const home = homeRoom.get(o.id);
      if (home && reachable.has(home)) {
        obtainable.add(o.id);
        changed = true;
        continue;
      }
      const cid = containerOf.get(o.id);
      if (cid) {
        const c = objById.get(cid);
        const cRoom = homeRoom.get(cid);
        const cReachable = cRoom ? reachable.has(cRoom) : false;
        const cOpenable = c?.openable === true;
        const cUnlockable =
          c?.locked !== true || (c?.key_id !== undefined && obtainable.has(c.key_id));
        if (c && cReachable && cOpenable && cUnlockable) {
          obtainable.add(o.id);
          changed = true;
        }
      }
    }
    // Items GRANTED by a reachable interaction (e.g. a brewed antidote) become
    // obtainable once the interaction's required item and any has_item conditions
    // are themselves obtainable. (Flag conditions are checked by IMPOSSIBLE_GATE.)
    for (const o of pack.objects) {
      const room = homeRoom.get(o.id);
      if (!room || !reachable.has(room)) continue; // the interaction's object must be reachable
      for (const it of o.interactions) {
        const itemOk = it.item === undefined || obtainable.has(it.item);
        const condItemsOk = itemReqs(it.conditions).every((i) => obtainable.has(i));
        if (!itemOk || !condItemsOk) continue;
        for (const e of it.effects) {
          if ("add_item" in e && !obtainable.has(e.add_item)) {
            obtainable.add(e.add_item);
            changed = true;
          }
        }
      }
    }
    // Items granted unconditionally by a reachable room's on_enter.
    for (const r of pack.rooms) {
      if (!reachable.has(r.id)) continue;
      for (const e of r.on_enter)
        if ("add_item" in e && !obtainable.has(e.add_item)) {
          obtainable.add(e.add_item);
          changed = true;
        }
    }
  }
  return obtainable;
}

// ── WIN_FIRES_AT_START support: falsifiers + a monotone-stability proof ──────────
// Mirrors the CYOA validator's deadline machinery (collectFalsifiers /
// deadlineStaysTrueForever), reused here for win_conditions.

/** A single var mutation, `amount` being the literal `by` (inc/dec — sign-significant,
 *  effects.ts allows a negative) or `value` (set). */
type VarWrite = { kind: "inc" | "dec" | "set"; amount: number };
type Falsifiers = {
  clearedFlags: Set<string>;
  setFlags: Set<string>;
  addedItems: Set<string>;
  removedItems: Set<string>;
  varWrites: Map<string, VarWrite[]>;
};

/** Every mutation the pack can make (all declared parser effects + any extra RPG
 *  runtime effects), the raw material for proving a condition monotone-stable. */
function collectFalsifiers(pack: ParserPack, extra: Effect[]): Falsifiers {
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
      else if ("unlock_exit" in e) setFlags.add(exitFlag(e.unlock_exit.from, e.unlock_exit.to));
      else if ("add_item" in e) addedItems.add(e.add_item);
      else if ("remove_item" in e) removedItems.add(e.remove_item);
      else if ("inc_var" in e) pushVar(e.inc_var.name, { kind: "inc", amount: e.inc_var.by });
      else if ("dec_var" in e) pushVar(e.dec_var.name, { kind: "dec", amount: e.dec_var.by });
      else if ("set_var" in e) pushVar(e.set_var.name, { kind: "set", amount: e.set_var.value });
    }
  };
  scan(allEffects(pack));
  scan(extra);
  return { clearedFlags, setFlags, addedItems, removedItems, varWrites };
}

// A var that holds `>= floor` keeps holding it iff no write can push it below floor:
// inc by a non-negative, dec by a non-positive, or set to a value still >= floor.
// Symmetric for the other operators (`by` is sign-significant — effects.ts allows a
// negative inc that really decrements, so we inspect the literal, not the var name).
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

/** True iff `conditions` (taken as a conjunction) hold now AND stay true under every
 *  pack effect — so once met at init they can never become false. Proven only for a
 *  flat AND of individually monotone-stable atoms; any_of/none_of, not_visited,
 *  object/quest state, or a condition on a combat-volatile var make us bail to false
 *  (conservative: we never claim an un-falsifiability we cannot prove). */
function winStaysTrueForever(
  conditions: Condition[],
  f: Falsifiers,
  volatileVars: Set<string>,
): boolean {
  let stable = true;
  const visit = (c: Condition): void => {
    if (!stable) return;
    if ("has_flag" in c) stable = !f.clearedFlags.has(c.has_flag);
    else if ("not_flag" in c) stable = !f.setFlags.has(c.not_flag);
    else if ("has_item" in c) stable = !f.removedItems.has(c.has_item);
    else if ("not_item" in c) stable = !f.addedItems.has(c.not_item);
    else if ("var_gte" in c)
      stable =
        !volatileVars.has(c.var_gte.name) &&
        varNeverDrops(c.var_gte.value, f.varWrites.get(c.var_gte.name));
    else if ("var_lte" in c)
      stable =
        !volatileVars.has(c.var_lte.name) &&
        varNeverRises(c.var_lte.value, f.varWrites.get(c.var_lte.name));
    else if ("var_eq" in c)
      stable =
        !volatileVars.has(c.var_eq.name) &&
        varNeverChanges(c.var_eq.value, f.varWrites.get(c.var_eq.name));
    else if ("visited" in c) {
      /* `visited` is monotone — once true it stays true; nothing un-visits. */
    } else if ("all_of" in c) c.all_of.forEach(visit);
    else stable = false; // any_of/none_of/not_visited/is_open/is_unlocked/quest_stage: not analysed
  };
  conditions.forEach(visit);
  return stable;
}

function allEffects(pack: ParserPack): Effect[] {
  const out: Effect[] = [];
  for (const r of pack.rooms) out.push(...r.on_enter);
  for (const o of pack.objects) {
    for (const it of o.interactions) out.push(...it.effects);
    if (o.unlock_effects) out.push(...o.unlock_effects); // first-class UNLOCK content (bug_0077)
  }
  for (const n of pack.npcs) for (const node of n.dialogue.nodes) out.push(...node.effects);
  return out;
}

function visitedRoom(c: Condition): string | null {
  return "visited" in c ? c.visited : null;
}

function flagReqs(conds: Condition[]): string[] {
  const out: string[] = [];
  const walk = (c: Condition): void => {
    if ("has_flag" in c) out.push(c.has_flag);
    else if ("all_of" in c) c.all_of.forEach(walk);
  };
  conds.forEach(walk);
  return out;
}

function itemReqs(conds: Condition[]): string[] {
  const out: string[] = [];
  const walk = (c: Condition): void => {
    if ("has_item" in c) out.push(c.has_item);
    else if ("all_of" in c) c.all_of.forEach(walk);
  };
  conds.forEach(walk);
  return out;
}
