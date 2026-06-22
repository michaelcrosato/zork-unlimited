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
import { type ParserPack, type GameObject, type Interaction, SCORE_VAR } from "../parser/schema.js";
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
const hasDeclaredVar = (vars: Record<string, number>, name: string): boolean =>
  Object.prototype.hasOwnProperty.call(vars, name);

/**
 * Extra facts a higher layer (the RPG validator, §13 Stage 4) can inject: flags
 * that runtime mechanics set (enemy defeat flags, skill-check successes) and items
 * those mechanics grant. They seed the feasibility/obtainability checks so a gate
 * legitimately satisfied by combat/skills is not mis-flagged as impossible.
 * Defaults are empty, so Stage-2/3 behavior is byte-identical.
 *
 * `extraSettableFlags` doubles as the runtime-WRITTEN flag set for the INERT_FLAG
 * check below: by construction the RPG validator only ever fills it with flags a
 * mechanic genuinely sets (enemy `defeat_flag`, on_defeat / skill-check `set_flag`),
 * so a defeat flag that no condition anywhere reads is correctly flagged inert.
 */
export type ValidateParserOptions = {
  extraSettableFlags?: string[];
  extraObtainable?: string[];
  /**
   * Extra `score` points a higher layer (§13 Stage 4) can award through branches
   * this parser pass does not own, such as enemy `on_defeat`. Authored parser
   * skill-check branches are scanned natively. Folded into the SCORE_UNREACHABLE
   * upper bound so score legitimately earned by winning a fight is not mis-flagged
   * unreachable. Default 0.
   */
  extraScoreAwards?: number;
  /**
   * Declared effects a higher layer (§13 Stage 4) fires through branches this
   * parser pass does not own, such as enemy `on_defeat`. Folded into the
   * WIN_FIRES_AT_START falsifier set so a win that one of those branches can
   * falsify is correctly judged escapable (not flagged). Default empty.
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
  /**
   * Effect lists a higher layer fires through branches this parser pass does not
   * own, such as enemy `on_defeat`. Handed to the SCORE_PEAKS_BEFORE_WIN check
   * (below) as whole lists (not a flattened scalar like `extraScoreAwards`) so it
   * can tell whether a score award is CO-LOCATED with the act that sets a
   * win-trigger flag. Default empty.
   */
  extraEffectLists?: Effect[][];
  /**
   * Quest stages that higher-layer mechanics set through branches this parser pass
   * does not own, such as enemy `on_defeat`. Each entry is a
   * `questStageKey(quest, stage)` composite key. Folded into the settable-stages set
   * for the IMPOSSIBLE_QUEST_STAGE feasibility check. Mirrors `extraSettableFlags`.
   * Default empty, so pure parser packs are byte-identical.
   */
  extraSettableQuestStages?: string[];
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
    for (const it of o.interactions) {
      const sc = it.skill_check;
      if (sc && !hasDeclaredVar(pack.meta.vars_init, sc.skill)) {
        findings.push(
          err(
            "SKILL_CHECK_PHANTOM_STAT",
            `skill check on object "${o.id}" uses skill "${sc.skill}", which is not declared in meta.vars_init.`,
            [`object:${o.id}`],
          ),
        );
      }
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
    // A held object starts in the player's inventory; listing it ALSO in a room or
    // a container would give it two homes (inventory wins, so the room/container
    // copy is dead) — almost certainly an authoring slip. Flag it.
    if (o.held) {
      const inRoom = pack.rooms.find((r) => r.objects.includes(o.id));
      if (inRoom)
        findings.push(
          err(
            "HELD_ALSO_PLACED",
            `held object "${o.id}" is also listed in room "${inRoom.id}"; a held object is carried, not placed.`,
            [`object:${o.id}`],
          ),
        );
      const inContainer = pack.objects.find((c) => c.contents.includes(o.id));
      if (inContainer)
        findings.push(
          err(
            "HELD_ALSO_PLACED",
            `held object "${o.id}" is also inside container "${inContainer.id}"; a held object is carried, not placed.`,
            [`object:${o.id}`],
          ),
        );
    }
  }
  // ── ITEM_UNPLACED: objects not reachable by any spawn path ───────────────────
  // Build placement maps from room.objects and container.contents.
  // Held objects (held: true) start in the player's inventory — no room/container
  // placement is needed or expected.  Objects granted via add_item effects are
  // crafted/created during gameplay — they also need no initial room placement.
  // Any other object that appears in none of these maps is a true orphan.
  {
    const placedInRoom = new Set<string>();
    for (const r of pack.rooms) for (const oid of r.objects) placedInRoom.add(oid);
    const placedInContainer = new Set<string>();
    for (const o of pack.objects) for (const cid of o.contents) placedInContainer.add(cid);
    const grantedByEffect = new Set<string>();
    for (const e of allEffects(pack)) if ("add_item" in e) grantedByEffect.add(e.add_item);

    for (const o of pack.objects) {
      if (o.held) continue; // inventory start — no placement needed
      if (grantedByEffect.has(o.id)) continue; // crafted/created during play
      if (!placedInRoom.has(o.id) && !placedInContainer.has(o.id)) {
        findings.push(
          warn(
            "ITEM_UNPLACED",
            `object "${o.id}" is not placed in any room or container and is not held — it can never be found by the player.`,
            [`object:${o.id}`],
          ),
        );
      }
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
  // A room id named by a `visited`/`not_visited`/`in_room` condition or a
  // `goto`/`place_object.room` effect that is absent from pack.rooms is a dangling
  // reference: the gate evaluates false forever (conditions.ts) or the effect targets
  // nowhere — the room-id analogue of EXIT_TARGET_MISSING, and a structural bug, not a
  // deliberate transient. Error severity (bug_0277). ONE code for all four ref kinds.
  for (const id of collectRoomRefs(pack)) {
    if (!roomIds.has(id))
      findings.push(
        err(
          "UNRESOLVED_ROOM_REFERENCE",
          `condition/effect references room "${id}" that does not exist.`,
          [`room:${id}`],
        ),
      );
  }
  // An `unlock_exit` effect whose `from` or `to` is absent from pack.rooms silently
  // writes an unreachable exit-flag key (__exit:phantom->real), making the unlock a
  // permanent no-op — harder to diagnose than a dead gate because the effect APPEARS
  // to fire. Error severity (bug_0278). Checked in a dedicated block (not via
  // collectRoomRefs) because the two sides need individual messages (bug_0278).
  for (const e of allEffects(pack)) {
    if (!("unlock_exit" in e)) continue;
    for (const [side, id] of [
      ["from", e.unlock_exit.from],
      ["to", e.unlock_exit.to],
    ] as const) {
      if (!roomIds.has(id))
        findings.push(
          err(
            "UNLOCK_EXIT_ROOM_MISSING",
            `unlock_exit "${side}" room "${id}" does not exist — the unlock writes an unreachable exit flag and is a permanent no-op.`,
            [`room:${id}`],
          ),
        );
    }
  }

  // An `add_item` or `remove_item` effect targeting an object id absent from pack.objects
  // is a dangling item reference — a typo'd `add_item: "lantren"` silently inserts a
  // phantom string into inventory (no description, no interactions, nonsense label) that
  // no existing check catches; a typo'd `remove_item: "lantren"` silently no-ops, leaving
  // puzzle state wrong. Error severity — the item-id analogue of EXIT_TARGET_MISSING
  // (bug_0281). Checked in a dedicated block (not via collectRoomRefs) against objById.
  for (const e of allEffects(pack)) {
    const itemId = "add_item" in e ? e.add_item : "remove_item" in e ? e.remove_item : undefined;
    if (itemId !== undefined && !objById.has(itemId))
      findings.push(
        err(
          "ITEM_REF_MISSING",
          `effect references item "${itemId}" that does not exist as a declared object.`,
          [`object:${itemId}`],
        ),
      );
  }

  // An `open_object`, `set_object_locked`, or `place_object` effect targeting an object
  // id absent from pack.objects is a dangling object-state reference — a typo'd
  // `open_object: "chst"` silently populates openableObjects with the phantom string,
  // writes into objectState["chst"] at runtime (a key with no corresponding declared
  // object), and can cause false IMPOSSIBLE_OBJECT_STATE negatives downstream.
  // A typo'd `set_object_locked: { id: "chst", ... }` silently no-ops the lock state,
  // defeating puzzle guards with no error. A typo'd `place_object: { id: "chst", ... }`
  // places a nonexistent object, defeating puzzle-design intent silently.
  // Error severity — the object-id analogue of ITEM_REF_MISSING (bug_0291).
  for (const e of allEffects(pack)) {
    let objId: string | undefined;
    if ("open_object" in e) objId = e.open_object;
    else if ("set_object_locked" in e) objId = e.set_object_locked.id;
    else if ("place_object" in e) objId = e.place_object.id;
    if (objId !== undefined && !objById.has(objId))
      findings.push(
        err(
          "OBJECT_STATE_REF_MISSING",
          `effect references object "${objId}" that does not exist as a declared object.`,
          [`object:${objId}`],
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
  // UNLOCK_EXIT_ROOM_MISSING is included because a dangling unlock_exit room id corrupts
  // the settable-flags set the graph analysis uses (exitFlag writes an unreachable key).
  // ITEM_REF_MISSING is included because a dangling item id could corrupt the
  // obtainability fixpoint that uses objById.
  // OBJECT_STATE_REF_MISSING is included because a dangling open_object id silently
  // populates openableObjects with a phantom string, which could produce false
  // IMPOSSIBLE_OBJECT_STATE findings downstream when the phantom id accidentally
  // matches a condition-side id.
  if (
    findings.some(
      (f) =>
        f.severity === "error" &&
        [
          "EXIT_TARGET_MISSING",
          "START_MISSING",
          "UNLOCK_EXIT_ROOM_MISSING",
          "ITEM_REF_MISSING",
          "OBJECT_STATE_REF_MISSING",
        ].includes(f.code),
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
    // A win_condition whose `conditions` are internally contradictory can NEVER
    // fire (the UNSATISFIABLE_CONDITION warning is raised separately below). Its
    // `visited` rooms are therefore NOT real escape targets: adding a dead
    // terminal's room to `winRooms` would let it mask a true SOFTLOCK — exactly the
    // soft-lock-graph pollution the win-condition guard comment below warns of
    // (bug_0092). Skip the room-adding for a provably-dead win (but still run the
    // ENDING_UNDECLARED reference check, which is independent of firability).
    if (!isUnsatisfiable(whenProfile(wc.conditions))) {
      for (const c of wc.conditions) {
        const v = visitedRoom(c);
        if (v) winRooms.add(v);
      }
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

  // ── Settable quest stages (provided by some set_quest_stage effect) ──────────
  // questStage inits to {} and there is no quest_init path, so the write-set is
  // PURELY set_quest_stage effects — every satisfiable quest_stage gate must have
  // a matching write. Mirrors the settable-flags set above for IMPOSSIBLE_GATE.
  const settableQuestStages = new Set<string>(opts.extraSettableQuestStages ?? []);
  for (const e of allEffects(pack)) {
    if ("set_quest_stage" in e) settableQuestStages.add(questStageKey(e.set_quest_stage));
  }

  // ── Settable object-state (is_open / is_unlocked) ────────────────────────────
  // objectState inits to {} (state.ts) and both predicates DEFAULT FALSE
  // (conditions.ts: is_open ⇒ objectState[id].open===true, is_unlocked ⇒
  // objectState[id].locked===false). So a satisfiable gate needs a path that WRITES
  // the matching flip. CRITICAL: there are TWO write sources for each — an authored
  // effect, OR the engine's built-in OPEN/UNLOCK verbs (legal_actions.ts) — and the
  // built-in path is why every shipped object-state pack stays green. We
  // over-approximate settability (deliberately admit more ids) so the only thing we
  // flag is a GENUINELY unsettable gate; that keeps the rule sound (no false positive).
  //
  //   openableObjects: an `open_object: id` effect, OR a defined object with
  //     openable===true (the built-in OPEN verb emits `{ open_object: id }` for any
  //     present, unlocked, openable object — legal_actions.ts).
  //   unlockableObjects: a `set_object_locked: { id, locked:false }` effect, OR a
  //     defined object that statically locked===true with a defined key_id whose key
  //     is obtainable (the built-in UNLOCK verb emits `{ set_object_locked: {id,
  //     locked:false} }` and requires the player hold the matching key —
  //     legal_actions.ts). NOTE: a STATICALLY-unlocked object is NOT unlock-settable —
  //     is_unlocked reads objectState[id].locked===false directly (no static fallback),
  //     so only an explicit relock-then-unlock effect or a keyed UNLOCK can make it true.
  const openableObjects = new Set<string>();
  const unlockableObjects = new Set<string>();
  for (const e of allEffects(pack)) {
    if ("open_object" in e) openableObjects.add(e.open_object);
    if ("set_object_locked" in e && e.set_object_locked.locked === false)
      unlockableObjects.add(e.set_object_locked.id);
  }
  for (const o of pack.objects) {
    if (o.openable === true) openableObjects.add(o.id);
    if (o.locked === true && o.key_id !== undefined && obtainable.has(o.key_id))
      unlockableObjects.add(o.id);
  }

  // ── Feasibility of every gate (exits, interactions, topics, win conditions) ──
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
    for (const qs of questStageReqs(conds)) {
      if (!settableQuestStages.has(qs)) {
        const [quest, stage] = qs.split("\0");
        findings.push(
          err(
            "IMPOSSIBLE_QUEST_STAGE",
            `condition requires quest "${quest}" at stage "${stage}" that no effect ever sets.`,
            where,
          ),
        );
      }
    }
    // An object-state gate (is_open/is_unlocked) whose id is in neither
    // over-approximating settable set can NEVER become true: no authored effect and
    // no built-in OPEN/UNLOCK verb path establishes it. (An undefined id is in neither
    // set, so the same miss carries the "object not defined" case — no objById
    // pre-check needed.)
    for (const os of objectStateReqs(conds)) {
      if (os.kind === "open" && !openableObjects.has(os.id))
        findings.push(
          err(
            "IMPOSSIBLE_OBJECT_STATE",
            `condition requires object "${os.id}" to be open, but no effect or openable verb can ever open it.`,
            where,
          ),
        );
      else if (os.kind === "unlocked" && !unlockableObjects.has(os.id))
        findings.push(
          err(
            "IMPOSSIBLE_OBJECT_STATE",
            `condition requires object "${os.id}" to be unlocked, but no effect or keyed unlock can ever unlock it.`,
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
  for (const npc of pack.npcs) {
    checkConds(npc.conditions ?? [], [`npc:${npc.id}`]);
    for (const node of npc.dialogue.nodes) {
      for (const t of node.topics) {
        checkConds(t.conditions ?? [], [`npc:${npc.id}`, `node:${node.id}`, `topic:${t.id}`]);
      }
    }
  }

  // ── quest_critical: never permanently lost ───────────────────────────────────
  const granted = new Set<string>();
  for (const e of allEffects(pack)) if ("add_item" in e) granted.add(e.add_item);
  const removed = new Map<string, string>(); // item → where
  for (const o of pack.objects) {
    for (const it of o.interactions) {
      for (const e of interactionEffects(it))
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
        interactionEffects(it).some((e) => "remove_item" in e && e.remove_item === id);
      if (it.item !== undefined) noteHeld(it.item, consumes(it.item));
      for (const id of itemReqs(it.conditions)) noteHeld(id, consumes(id));
    }
  }
  for (const room of pack.rooms)
    for (const exit of room.exits) for (const id of itemReqs(exit.conditions)) noteHeld(id, false);
  for (const wc of pack.win_conditions)
    for (const id of itemReqs(wc.conditions)) noteHeld(id, false);
  for (const npc of pack.npcs) {
    for (const id of itemReqs(npc.conditions ?? [])) noteHeld(id, false);
    for (const node of npc.dialogue.nodes)
      for (const t of node.topics)
        for (const id of itemReqs(t.conditions ?? [])) noteHeld(id, false);
  }
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
    const nodeById = new Map(npc.dialogue.nodes.map((n) => [n.id, n]));
    checkUnsatisfiable(npc.conditions, [`npc:${npc.id}`], `npc "${npc.id}" presence`, findings);
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
      // Dead reactive content on a node's spoken-line `variants` — the dialogue
      // analogue of the room/object variant guards below (a later variant entailed
      // by an earlier sibling never displays; an internally contradictory `when`
      // can never hold). Same first-match-wins semantics (model.ts nodeText), held
      // to the same soundness bar so a silently-dead NPC line can't slip past.
      checkVariantShadowing(node.variants, `npc:${npc.id}:node:${node.id}`, findings);
      for (let i = 0; i < (node.variants?.length ?? 0); i++)
        checkUnsatisfiable(
          node.variants?.[i]?.when,
          [`npc:${npc.id}`, `node:${node.id}`, `variant:${i}`],
          `npc "${npc.id}" node "${node.id}" variant #${i + 1}`,
          findings,
        );
      const outs = new Set<string>();
      for (const t of node.topics) {
        checkUnsatisfiable(
          t.conditions,
          [`npc:${npc.id}`, `node:${node.id}`, `topic:${t.id}`],
          `npc "${npc.id}" node "${node.id}" topic "${t.id}"`,
          findings,
        );
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
    const root = nodeById.get(npc.dialogue.root);
    if (root) checkDialogueRootRegreet(npc.id, root, nodeById, findings);
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

  // Score/win coincidence — the bug_0104 generalization, as a quality WARNING.
  // When a SINGLE win_condition turns on a deliberate climactic ACT the player must
  // perform — SETTING a `has_flag` (administer / activate the win flag) or CLAIMING a
  // `has_item` (grab the relic the win turns on) — the perfect score should not already
  // be reachable WITHOUT performing that act. alchemists_tower pre-bug_0104 was exactly
  // this smell: read +5, steep +10, decant +20 = 35 = max_score, ALL before the cure
  // (the act the win turns on), while the cure itself — the literal point of the pack —
  // awarded nothing, so a player hit a "perfect score yet unfinished" state (blind
  // playtest seed 89). bug_0104 fixed it by moving the final +5 onto the cure act; this
  // check catches the class STRUCTURALLY at authoring time instead of relying on a blind
  // playtester to notice it. (sunken_barrow already does it right: the +25 capstone
  // lives on the circlet's take_effects — the very CLAIM the win turns on, bug_0107 —
  // so its perfect score is reachable only WITH the claim and it is NOT flagged.)
  //
  // `visited` is deliberately NOT treated as a climactic act: a navigation win's final
  // step can be mere LOCOMOTION (walk through the open gate), a denouement that rightly
  // awards nothing. Setting a flag or claiming an item is a chosen ACT; arriving in a
  // room is not.
  //
  // Sound & conservative — it fires only when ALL of these hold, so no current pack is
  // flagged (verified: cold_forge wins on `visited`; sealed_crypt and sunken_barrow's
  // `has_item` claims carry their capstones; alchemists' cure act carries +5):
  //   • exactly ONE win_condition — a second, flagless win could be the real climax,
  //     so multi-win packs are left alone (no false positive);
  //   • the win REQUIRES a `has_flag` F or a `has_item` I (a guaranteed conjunctive
  //     literal: top-level or inside all_of; any_of / none_of are opaque and never
  //     drive the finding);
  //   • that act is actually performable — some effect list SETS F, or some list GRANTS
  //     I (an `add_item: I`, or object I's `take_effects` — taking I is what grants it);
  //     an unreachable flag/item is WIN_UNREACHABLE's concern, not this one; AND
  //   • max_score is reachable by score awards NONE of which is co-located with the
  //     win-trigger act — i.e. the player can hit the perfect score without ever firing
  //     it. Excluding EVERY win-act list (even a scored one) only LOWERS the without-act
  //     total, so the bar errs toward NOT warning.
  if (pack.meta.max_score > 0 && pack.win_conditions.length === 1) {
    const wc = pack.win_conditions[0]!;
    const lists = [...effectLists(pack), ...(opts.extraEffectLists ?? [])];
    const scoreOf = (es: Effect[]): number =>
      es.reduce(
        (s, e) =>
          "inc_var" in e && e.inc_var.name === SCORE_VAR ? s + Math.max(0, e.inc_var.by) : s,
        0,
      );
    const initScore = pack.meta.vars_init[SCORE_VAR] ?? 0;
    // The perfect score reachable WITHOUT the win-trigger act = init + every award not
    // co-located with it. `winActLists` is the set of effect-list references that fire
    // the act; excluding them by identity matches each declared act list exactly.
    const scoreWithout = (winActLists: Set<Effect[]>): number =>
      initScore + lists.filter((es) => !winActLists.has(es)).reduce((s, es) => s + scoreOf(es), 0);
    const peaksWarn = (act: string, term: string): void => {
      findings.push(
        warn(
          "SCORE_PEAKS_BEFORE_WIN",
          `meta.max_score (${pack.meta.max_score}) is reachable without ${act}, which win_condition "${wc.id}" turns on — a player can hit the perfect score before the climactic act that wins (cf. bug_0104). Award some score on ${term}, or raise max_score so the perfect score coincides with the win.`,
          ["meta:max_score", `win:${wc.id}`],
        ),
      );
    };
    for (const f of requiredFlags(wc.conditions)) {
      const setters = new Set(
        lists.filter((es) => es.some((e) => "set_flag" in e && e.set_flag === f)),
      );
      if (setters.size === 0) continue; // unsettable F is WIN_UNREACHABLE's concern
      if (scoreWithout(setters) >= pack.meta.max_score) {
        peaksWarn(`setting "${f}"`, `the act that sets "${f}"`);
      }
    }
    for (const i of requiredItems(wc.conditions)) {
      // Granting acts for item I: object I's take_effects (taking I grants it), plus any
      // list that explicitly `add_item: I`s it. A purely implicit take (a takeable I with
      // NO take_effects and no add_item) has no scriptable act list to attach score to,
      // so — like an unsettable flag — it is left to WIN_UNREACHABLE, not flagged here.
      const granters = new Set<Effect[]>();
      const obj = pack.objects.find((o) => o.id === i);
      if (obj?.take_effects) granters.add(obj.take_effects);
      for (const es of lists)
        if (es.some((e) => "add_item" in e && e.add_item === i)) granters.add(es);
      if (granters.size === 0) continue;
      if (scoreWithout(granters) >= pack.meta.max_score) {
        peaksWarn(`claiming "${i}"`, `the act that grants "${i}" (its take_effects / add_item)`);
      }
    }
  }

  // ── Dead reactive content: shadowed / unsatisfiable variants & guards ────────
  // Parser rooms and objects carry reactive `variants` (RoomVariantSchema /
  // ObjectVariantSchema), evaluated first-match-wins (model.ts roomDescription /
  // objectDescription) — the EXACT semantics the CYOA validator already guards on
  // scenes/endings (bug_0085 shadowing, bug_0086 unsatisfiable). The parser validator
  // never checked them: a later variant whose `when` is entailed by an earlier
  // sibling's can never be the first match (dead text), and a variant `when` (or an
  // exit/interaction `conditions`) that is internally contradictory can never hold at
  // all (dead text / a gate never offered). Both are silently-dead content a blind
  // playtest can't see — it simply never appears. This ports the two CYOA checks to
  // parser room/object variants, plus the unsatisfiable-guard check to exit and
  // interaction conditions (the parser analogue of CYOA choice conditions). Sound &
  // conservative: see the helper notes — opaque disjunctions never drive a finding.
  for (const room of pack.rooms) {
    checkVariantShadowing(room.variants, `room:${room.id}`, findings);
    for (let i = 0; i < (room.variants?.length ?? 0); i++)
      checkUnsatisfiable(
        room.variants?.[i]?.when,
        [`room:${room.id}`, `variant:${i}`],
        `room "${room.id}" variant #${i + 1}`,
        findings,
      );
    for (const exit of room.exits)
      checkUnsatisfiable(
        exit.conditions,
        [`room:${room.id}`, `exit:${exit.direction}`],
        `exit ${exit.direction} from room "${room.id}"`,
        findings,
      );
  }
  for (const o of pack.objects) {
    checkVariantShadowing(o.variants, `object:${o.id}`, findings);
    for (let i = 0; i < (o.variants?.length ?? 0); i++)
      checkUnsatisfiable(
        o.variants?.[i]?.when,
        [`object:${o.id}`, `variant:${i}`],
        `object "${o.id}" variant #${i + 1}`,
        findings,
      );
    for (const it of o.interactions)
      checkUnsatisfiable(
        it.conditions,
        [`object:${o.id}`, `verb:${it.verb}`],
        `interaction "${it.verb}" on object "${o.id}"`,
        findings,
      );
  }
  // Endings carry reactive `variants` too (ParserEndingVariantSchema, first-match-wins
  // via model.ts endingText) — the terminal-state sibling of room/object variants. Apply
  // the SAME two dead-content guards: a later epilogue entailed by an earlier sibling can
  // never be the first match, and an internally-contradictory `when` can never hold at all.
  for (const e of pack.endings) {
    checkVariantShadowing(e.variants, `ending:${e.id}`, findings);
    for (let i = 0; i < (e.variants?.length ?? 0); i++)
      checkUnsatisfiable(
        e.variants?.[i]?.when,
        [`ending:${e.id}`, `variant:${i}`],
        `ending "${e.id}" variant #${i + 1}`,
        findings,
      );
  }
  // A win_condition is the parser/RPG analogue of CYOA's meta.deadline — an
  // internally contradictory `conditions` can never fire (the DEADLINE_UNFIREABLE
  // analogue), and like the deadline it is a latent soft-lock unsoundness: a `visited`
  // room inside such a never-firing win would, if treated as a real escape target,
  // mask a true SOFTLOCK. The `winRooms` construction above now EXCLUDES such dead
  // wins from the escape graph (bug_0092); this warning still names the contradictory
  // win so the author can fix or remove it.
  for (const wc of pack.win_conditions)
    checkUnsatisfiable(wc.conditions, [`win:${wc.id}`], `win_condition "${wc.id}"`, findings);

  // ── Inert flags (set but never read) ─────────────────────────────────────────
  // The flag-side port of the CYOA validator's INERT_FLAG check (bug_0104) and the
  // newest member of the soundness family already mirrored here (UNREACHABLE_VARIANT
  // shadowing, UNSATISFIABLE_CONDITION). A flag that some `set_flag` effect writes —
  // a room on_enter, an interaction, an object's unlock_effects, an NPC dialogue node,
  // or (RPG) an enemy `defeat_flag` / on_defeat / skill-check branch — or that
  // flags_init declares, but that NO condition anywhere READS (has_flag/not_flag,
  // descending all_of/any_of/none_of across exit/interaction/win conditions, room &
  // object variant `when`s, and dialogue-topic gates) is dead bookkeeping: the write
  // changes nothing the game ever consults. A blind playtester cannot judge this from
  // inside the game (bug_0104). Sound (no false positives): a flag is flagged ONLY
  // when it has provably zero readers across the whole pack; a flag consulted only via
  // not_flag (the one-shot dialogue-topic idiom these packs lean on) or only inside a
  // disjunction still counts as read and is never flagged. Warning, not error — an
  // inert flag is a no-op, never a soft-lock, exactly like its CYOA sibling.
  const flagReads = collectFlagReads(pack);
  const writtenFlags = new Set<string>([
    ...pack.meta.flags_init,
    ...(opts.extraSettableFlags ?? []),
  ]);
  for (const e of allEffects(pack)) if ("set_flag" in e) writtenFlags.add(e.set_flag);
  for (const f of writtenFlags) {
    if (!flagReads.has(f)) {
      findings.push(
        warn(
          "INERT_FLAG",
          `flag "${f}" is set (or declared in flags_init / by a combat-or-skill mechanic) ` +
            `but never read by any condition — a no-op write (dead bookkeeping). Gate ` +
            `something on it, or remove the set so the pack states only what it uses.`,
          [`flag:${f}`],
        ),
      );
    }
  }

  // ── INERT object-state: an AUTHORED open/lock-state write nothing ever reads ──
  // The LIVENESS dual of bug_0253's IMPOSSIBLE_OBJECT_STATE (feasibility) — the
  // object-state analogue of INERT_FLAG. An AUTHORED `open_object` /
  // `set_object_locked` effect whose target object's is_open / is_unlocked state is
  // NEVER read by any condition pack-wide is dead bookkeeping: the write changes
  // nothing the game ever consults. CRITICAL SOUNDNESS BOUNDARY: key the write-set
  // STRICTLY on these authored effects — do NOT fold in the over-approximating
  // openableObjects/unlockableObjects sets (the built-in OPEN/UNLOCK verb
  // settability), which would false-warn on every openable scenery object. This
  // mirrors INERT_FLAG (keyed on the authored set_flag write, never on a reachability
  // source) and is the precise dual of the bug_0253 subtlety (feasibility
  // OVER-approximates settability; liveness keys on the AUTHORED write). Reads descend
  // all_of/any_of/none_of (a disjunction-guarded read still consumes). Warning, not
  // error — an inert open/lock-state write is a no-op, never a soft-lock.
  //
  // bug_0263 completes bug_0262 over set_object_locked's FULL domain: the liveness
  // question is "does any condition read is_unlocked for this id?", which is
  // INDEPENDENT of the boolean written. A `set_object_locked(locked: true)` re-lock is
  // just as inert as a `locked: false` unlock when nothing reads is_unlocked — the
  // original check filtered `locked === false`, so an unread re-lock escaped it. Both
  // directions are now tracked (deduped so an object both unlocked AND re-locked by
  // effects, still never read, warns exactly once).
  const objStateReads = collectObjectStateReads(pack);
  const writtenOpen = new Set<string>();
  const writtenUnlocked = new Set<string>();
  const writtenLocked = new Set<string>();
  for (const e of allEffects(pack)) {
    if ("open_object" in e) writtenOpen.add(e.open_object);
    else if ("set_object_locked" in e) {
      if (e.set_object_locked.locked === false) writtenUnlocked.add(e.set_object_locked.id);
      else writtenLocked.add(e.set_object_locked.id);
    }
  }
  for (const id of writtenOpen) {
    if (!objStateReads.open.has(id)) {
      findings.push(
        warn(
          "INERT_OBJECT_STATE",
          `object "${id}" is opened by an effect but no condition ever reads its open ` +
            `state — a no-op write (dead bookkeeping). Gate something on \`is_open: ${id}\`, ` +
            `or remove the effect.`,
          [`object:${id}`],
        ),
      );
    }
  }
  for (const id of writtenUnlocked) {
    if (!objStateReads.unlocked.has(id)) {
      findings.push(
        warn(
          "INERT_OBJECT_STATE",
          `object "${id}" is unlocked by an effect but no condition ever reads its ` +
            `unlocked state — a no-op write (dead bookkeeping). Gate something on ` +
            `\`is_unlocked: ${id}\`, or remove the effect.`,
          [`object:${id}`],
        ),
      );
    }
  }
  for (const id of writtenLocked) {
    // A `set_object_locked(locked: true)` re-lock is inert under the SAME condition —
    // is_unlocked is never read. Deduped against writtenUnlocked so an object that is
    // both unlocked and re-locked by effects (and still never read) warns just once.
    if (!objStateReads.unlocked.has(id) && !writtenUnlocked.has(id)) {
      findings.push(
        warn(
          "INERT_OBJECT_STATE",
          `object "${id}" is locked by an effect but no condition ever reads its ` +
            `unlocked state — a no-op write (dead bookkeeping). Gate something on ` +
            `\`is_unlocked: ${id}\`, or remove the effect.`,
          [`object:${id}`],
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
 * only for a flat conjunction of monotone-stable atoms (incl. `is_open`, which no
 * effect can close, and `is_unlocked` when nothing can relock it) — any
 * disjunction/negation, a `not_visited`/quest condition, a relockable `is_unlocked`,
 * or a condition on a combat-volatile var makes us bail (treat as falsifiable ⇒ no
 * finding). A win merely satisfiable early but escapable on the first move is never
 * flagged.
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
        for (const e of interactionEffects(it)) {
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
  // Objects a `set_object_locked: { locked: true }` can re-lock — the only effect
  // that falsifies an `is_unlocked` condition. (There is NO object-CLOSE effect in
  // the closed effect DSL and the CLOSE verb is unresolvable, so `is_open` has no
  // falsifier set: once open, an object stays open — see winStaysTrueForever.)
  relockedObjects: Set<string>;
};

/** Every mutation the pack can make (all declared parser effects + any extra RPG
 *  runtime effects), the raw material for proving a condition monotone-stable. */
function collectFalsifiers(pack: ParserPack, extra: Effect[]): Falsifiers {
  const clearedFlags = new Set<string>();
  const setFlags = new Set<string>();
  const addedItems = new Set<string>();
  const removedItems = new Set<string>();
  const relockedObjects = new Set<string>();
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
      else if ("set_object_locked" in e && e.set_object_locked.locked)
        relockedObjects.add(e.set_object_locked.id);
      else if ("inc_var" in e) pushVar(e.inc_var.name, { kind: "inc", amount: e.inc_var.by });
      else if ("dec_var" in e) pushVar(e.dec_var.name, { kind: "dec", amount: e.dec_var.by });
      else if ("set_var" in e) pushVar(e.set_var.name, { kind: "set", amount: e.set_var.value });
    }
  };
  scan(allEffects(pack));
  scan(extra);
  return { clearedFlags, setFlags, addedItems, removedItems, varWrites, relockedObjects };
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
 *  flat AND of individually monotone-stable atoms (flags, items, sign-significant
 *  var bounds, `visited`, plus object open/unlock state: `is_open` is monotone — no
 *  effect closes an object — and `is_unlocked` is stable unless a `set_object_locked`
 *  can relock it); any_of/none_of, not_visited, quest_stage, or a condition on a
 *  combat-volatile var make us bail to false (conservative: we never claim an
 *  un-falsifiability we cannot prove). */
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
    } else if ("is_open" in c) {
      // Object open-state is monotone: the closed effect DSL has no object-CLOSE
      // effect (only `open_object`, which sets open=true), and the CLOSE verb is
      // unresolvable (`resolveParserAction` has no CLOSE case, so it is never
      // enumerated or applied). Nothing can shut an opened object, so an `is_open`
      // win that holds at start can never be falsified — always stable.
    } else if ("is_unlocked" in c) {
      // A lock CAN be re-set: `set_object_locked: { locked: true }` is the sole
      // effect that falsifies an `is_unlocked` win. Stable iff no such relock
      // targets this object (UNLOCK and `set_object_locked: { locked: false }`
      // only ever help, so they are not falsifiers).
      stable = !f.relockedObjects.has(c.is_unlocked);
    } else if ("all_of" in c) c.all_of.forEach(visit);
    else stable = false; // any_of/none_of/not_visited/quest_stage: not analysed
  };
  conditions.forEach(visit);
  return stable;
}

function allEffects(pack: ParserPack): Effect[] {
  const out: Effect[] = [];
  for (const r of pack.rooms) out.push(...r.on_enter);
  for (const o of pack.objects) {
    for (const it of o.interactions) out.push(...interactionEffects(it));
    if (o.unlock_effects) out.push(...o.unlock_effects); // first-class UNLOCK content (bug_0077)
    if (o.take_effects) out.push(...o.take_effects); // first-class TAKE content (bug_0107)
  }
  for (const n of pack.npcs) for (const node of n.dialogue.nodes) out.push(...node.effects);
  return out;
}

// The grouped twin of allEffects: each declared effect LIST kept intact (not
// flattened), so a check can ask "is this score award in the SAME act as this
// set_flag?" — co-location the SCORE_PEAKS_BEFORE_WIN check needs.
function effectLists(pack: ParserPack): Effect[][] {
  const out: Effect[][] = [];
  for (const r of pack.rooms) out.push(r.on_enter);
  for (const o of pack.objects) {
    for (const it of o.interactions) out.push(...interactionEffectLists(it));
    if (o.unlock_effects) out.push(o.unlock_effects);
    if (o.take_effects) out.push(o.take_effects);
  }
  for (const n of pack.npcs) for (const node of n.dialogue.nodes) out.push(node.effects);
  return out;
}

function interactionEffects(it: Interaction): Effect[] {
  return it.skill_check
    ? [...it.effects, ...it.skill_check.on_success, ...it.skill_check.on_failure]
    : it.effects;
}

function interactionEffectLists(it: Interaction): Effect[][] {
  return it.skill_check
    ? [it.effects, it.skill_check.on_success, it.skill_check.on_failure]
    : [it.effects];
}

// Flags a conjunctive condition array GUARANTEES are true: top-level literals and
// those nested in all_of (also a conjunction). any_of / none_of are disjunctions /
// negations we cannot soundly treat as "required", so they are skipped — keeping the
// SCORE_PEAKS_BEFORE_WIN check free of false positives (it detects fewer cases, never
// wrong ones), the same soundness stance as the dead-content analysis below.
function requiredFlags(conds: Condition[]): string[] {
  const out: string[] = [];
  const walk = (c: Condition): void => {
    if ("has_flag" in c) out.push(c.has_flag);
    else if ("all_of" in c) c.all_of.forEach(walk);
  };
  conds.forEach(walk);
  return out;
}

// The has_item twin of requiredFlags: the items a conjunctive condition array
// GUARANTEES the player holds (top-level or in all_of; any_of/none_of are opaque and
// skipped, same soundness stance). Used by SCORE_PEAKS_BEFORE_WIN to treat "claim the
// winning relic" as a climactic act — unlike a `visited` win, which is mere locomotion.
function requiredItems(conds: Condition[]): string[] {
  const out: string[] = [];
  const walk = (c: Condition): void => {
    if ("has_item" in c) out.push(c.has_item);
    else if ("all_of" in c) c.all_of.forEach(walk);
  };
  conds.forEach(walk);
  return out;
}

function visitedRoom(c: Condition): string | null {
  return "visited" in c ? c.visited : null;
}

// ── Dead-content analysis: variant shadowing + unsatisfiable guards ──────────────
// Mirrors the CYOA validator's WhenProfile / entails / isUnsatisfiable /
// checkVariantShadowing / checkUnsatisfiable (bug_0085/0086), reused here for parser
// room/object variants (first-match-wins, model.ts) and exit/interaction conditions.
// Same soundness stance: every proof is over a pure conjunction of literals/var-bounds;
// any any_of/none_of makes a `when` opaque so it never drives a finding (no false
// positives — we detect fewer cases, never wrong ones).

/**
 * The conjunctive shape of a `when`/`conditions`: the positive/negative atoms it pins
 * and the tightest var bounds it implies. `opaque` is set when an `any_of`/`none_of`
 * (a disjunction we cannot reason about soundly) appears — an opaque profile never
 * participates in an entailment proof, keeping the shadowing check sound.
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
    // any_of / none_of: disjunctions we don't model — mark opaque.
    else p.opaque = true;
  };
  when.forEach(walk);
  return p;
}

/** True when every state satisfying `j` also satisfies `i` (j ⟹ i): then an earlier
 *  `i` always wins over a later `j`, so `j` is dead. Sound: any opaque profile
 *  (a disjunction we can't reason about) returns false. */
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
 *  satisfy it. Two sound contradictions over a pure conjunction: the same atom pinned
 *  true AND false, or a var's `>=` lower bound exceeding its `<=` upper bound. `opaque`
 *  is irrelevant — a contradiction among the conjunctive atoms makes the whole top-level
 *  AND unsatisfiable regardless of any disjunction sibling (which can only further
 *  constrain, never rescue, an already-false conjunction). */
function isUnsatisfiable(p: WhenProfile): boolean {
  for (const k of p.pos) if (p.neg.has(k)) return true;
  for (const [name, lo] of p.lower) {
    const hi = p.upper.get(name);
    if (hi !== undefined && lo > hi) return true;
  }
  return false;
}

/** Flag any variant whose `when` is entailed by an earlier sibling's: in a
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

/** Flag any guard (variant `when` or exit/interaction/topic `conditions`) that can
 *  never hold: its conjunction is internally contradictory, so the variant never
 *  displays / the gate is never offered — silently-dead content the blind playtest
 *  can't see. */
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

function checkDialogueRootRegreet(
  npcId: string,
  root: ParserPack["npcs"][number]["dialogue"]["nodes"][number],
  nodes: Map<string, ParserPack["npcs"][number]["dialogue"]["nodes"][number]>,
  findings: Finding[],
): void {
  const rootRegreetFlags = hasFlagReads(root.variants?.flatMap((variant) => variant.when) ?? []);
  for (const topic of root.topics) {
    if (topic.goto === undefined) continue;
    const target = nodes.get(topic.goto);
    if (!target) continue;
    const targetSets = setFlags(target.effects);
    for (const flag of notFlagReqs(topic.conditions ?? [])) {
      if (!targetSets.has(flag) || rootRegreetFlags.has(flag)) continue;
      findings.push(
        warn(
          "DIALOGUE_ROOT_REGREET_MISSING",
          `npc "${npcId}" root topic "${topic.id}" retires on flag "${flag}" and target node ` +
            `"${target.id}" sets it, but the root has no variant reading \`has_flag: ${flag}\`. ` +
            "Later TALK can reopen the conversation with stale first-contact root text after " +
            "that topic is gone; add a root variant for the re-greet state or make the root " +
            "line timeless.",
          [`npc:${npcId}`, `node:${root.id}`, `topic:${topic.id}`, `flag:${flag}`],
        ),
      );
    }
  }
}

function setFlags(effects: Effect[]): Set<string> {
  const out = new Set<string>();
  for (const e of effects) if ("set_flag" in e) out.add(e.set_flag);
  return out;
}

function notFlagReqs(conds: Condition[]): Set<string> {
  const out = new Set<string>();
  const walk = (c: Condition): void => {
    if ("not_flag" in c) out.add(c.not_flag);
    else if ("all_of" in c) c.all_of.forEach(walk);
  };
  conds.forEach(walk);
  return out;
}

function hasFlagReads(conds: Condition[]): Set<string> {
  const out = new Set<string>();
  const walk = (c: Condition): void => {
    if ("has_flag" in c) out.add(c.has_flag);
    else if ("all_of" in c) c.all_of.forEach(walk);
    else if ("any_of" in c) c.any_of.forEach(walk);
  };
  conds.forEach(walk);
  return out;
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

// Composite key joining quest+stage with a NUL separator that cannot occur in an
// id, so `(q1,"ab")` and `(q1a,"b")` can never collide.
function questStageKey(qs: { quest: string; stage: string }): string {
  return `${qs.quest}\0${qs.stage}`;
}

// Required (quest, stage) pairs in AND-context — top-level + all_of only,
// mirroring flagReqs/itemReqs. any_of/none_of are NOT descended (conservative:
// guarantees zero false positives on healthy packs).
function questStageReqs(conds: Condition[]): string[] {
  const out: string[] = [];
  const walk = (c: Condition): void => {
    if ("quest_stage" in c) out.push(questStageKey(c.quest_stage));
    else if ("all_of" in c) c.all_of.forEach(walk);
  };
  conds.forEach(walk);
  return out;
}

// Required object-state atoms in AND-context — top-level + all_of only, mirroring
// flagReqs/itemReqs/questStageReqs. any_of/none_of are NOT descended (conservative:
// guarantees zero false positives). Distinguishes the two predicate kinds so the
// feasibility branch can route each to its own (over-approximating) settable set.
function objectStateReqs(conds: Condition[]): { kind: "open" | "unlocked"; id: string }[] {
  const out: { kind: "open" | "unlocked"; id: string }[] = [];
  const walk = (c: Condition): void => {
    if ("is_open" in c) out.push({ kind: "open", id: c.is_open });
    else if ("is_unlocked" in c) out.push({ kind: "unlocked", id: c.is_unlocked });
    else if ("all_of" in c) c.all_of.forEach(walk);
  };
  conds.forEach(walk);
  return out;
}

/** Every flag name a parser/RPG pack READS — has_flag/not_flag in any exit,
 *  interaction, or win condition, any room/object variant `when`, NPC presence
 *  gate, or dialogue-topic gate, descending all_of/any_of/none_of. The set of
 *  consumers for the INERT_FLAG check: a written flag (set_flag / flags_init / a
 *  combat-or-skill mechanic) absent here is inert. Mirrors the CYOA validator's
 *  collectFlagReads (bug_0104), widened to the parser's condition-bearing sites. */
function collectFlagReads(pack: ParserPack): Set<string> {
  const reads = new Set<string>();
  const walk = (c: Condition): void => {
    if ("has_flag" in c) reads.add(c.has_flag);
    else if ("not_flag" in c) reads.add(c.not_flag);
    else if ("all_of" in c) c.all_of.forEach(walk);
    else if ("any_of" in c) c.any_of.forEach(walk);
    else if ("none_of" in c) c.none_of.forEach(walk);
  };
  const walkAll = (conds: Condition[] | undefined): void => (conds ?? []).forEach(walk);
  for (const room of pack.rooms) {
    for (const v of room.variants ?? []) walkAll(v.when);
    for (const exit of room.exits) walkAll(exit.conditions);
  }
  for (const o of pack.objects) {
    for (const v of o.variants ?? []) walkAll(v.when);
    for (const it of o.interactions) walkAll(it.conditions);
  }
  for (const wc of pack.win_conditions) walkAll(wc.conditions);
  for (const e of pack.endings) for (const v of e.variants ?? []) walkAll(v.when); // reactive epilogue guards
  for (const npc of pack.npcs) {
    walkAll(npc.conditions);
    for (const node of npc.dialogue.nodes) {
      for (const v of node.variants ?? []) walkAll(v.when); // reactive NPC-line guards (bug_0246)
      for (const t of node.topics) walkAll(t.conditions);
    }
  }
  return reads;
}

/** Every object id whose `is_open` / `is_unlocked` state a parser/RPG pack READS —
 *  in any exit, interaction, or win condition, any room/object variant `when`, or any
 *  dialogue-topic gate, DESCENDING all_of/any_of/none_of (a read inside ANY connective,
 *  even a disjunction, counts as consumed). The consumer set for the INERT_OBJECT_STATE
 *  liveness check (the dual of bug_0253's IMPOSSIBLE_OBJECT_STATE feasibility check):
 *  an AUTHORED `open_object` / `set_object_locked(locked:false)` write whose target id is
 *  absent from the matching set here is a no-op (dead bookkeeping). Mirrors
 *  collectFlagReads EXACTLY — NOT objectStateReqs, which descends only all_of for the
 *  conservative AND-context feasibility check and would under-count disjunction-guarded
 *  reads, producing false-positive INERT warnings (bug_0262). */
function collectObjectStateReads(pack: ParserPack): { open: Set<string>; unlocked: Set<string> } {
  const open = new Set<string>();
  const unlocked = new Set<string>();
  const walk = (c: Condition): void => {
    if ("is_open" in c) open.add(c.is_open);
    else if ("is_unlocked" in c) unlocked.add(c.is_unlocked);
    else if ("all_of" in c) c.all_of.forEach(walk);
    else if ("any_of" in c) c.any_of.forEach(walk);
    else if ("none_of" in c) c.none_of.forEach(walk);
  };
  const walkAll = (conds: Condition[] | undefined): void => (conds ?? []).forEach(walk);
  for (const room of pack.rooms) {
    for (const v of room.variants ?? []) walkAll(v.when);
    for (const exit of room.exits) walkAll(exit.conditions);
  }
  for (const o of pack.objects) {
    for (const v of o.variants ?? []) walkAll(v.when);
    for (const it of o.interactions) walkAll(it.conditions);
  }
  for (const wc of pack.win_conditions) walkAll(wc.conditions);
  for (const e of pack.endings) for (const v of e.variants ?? []) walkAll(v.when);
  for (const npc of pack.npcs) {
    walkAll(npc.conditions);
    for (const node of npc.dialogue.nodes) {
      for (const v of node.variants ?? []) walkAll(v.when);
      for (const t of node.topics) walkAll(t.conditions);
    }
  }
  return { open, unlocked };
}

/** Every room id a parser/RPG pack REFERENCES — by a `visited` / `not_visited` /
 *  `in_room` condition in any exit, interaction, or win condition, any room/object
 *  variant `when`, any ending variant `when`, NPC presence gate, or any dialogue-
 *  node-variant/topic gate (DESCENDING all_of/any_of/none_of, so a disjunction-
 *  guarded room ref still counts), PLUS by a `goto` / `place_object.room` effect target
 *  (the room-id-bearing effects
 *  collected here; unlock_exit.from/.to are checked in a dedicated UNLOCK_EXIT_ROOM_MISSING
 *  block in the validator body). A referenced id absent from pack.rooms is a dangling
 *  reference — a permanently-dead gate (visited/in_room evaluate false forever) or a
 *  goto/place_object into nowhere — the room-id analogue of EXIT_TARGET_MISSING.
 *  Mirrors collectFlagReads EXACTLY — NOT objectStateReqs, which descends only all_of
 *  for the conservative AND-context feasibility check and would under-count refs inside
 *  a disjunction (bug_0277). */
function collectRoomRefs(pack: ParserPack): Set<string> {
  const refs = new Set<string>();
  const walk = (c: Condition): void => {
    if ("visited" in c) refs.add(c.visited);
    else if ("not_visited" in c) refs.add(c.not_visited);
    else if ("in_room" in c) refs.add(c.in_room);
    else if ("all_of" in c) c.all_of.forEach(walk);
    else if ("any_of" in c) c.any_of.forEach(walk);
    else if ("none_of" in c) c.none_of.forEach(walk);
  };
  const walkAll = (conds: Condition[] | undefined): void => (conds ?? []).forEach(walk);
  for (const room of pack.rooms) {
    for (const v of room.variants ?? []) walkAll(v.when);
    for (const exit of room.exits) walkAll(exit.conditions);
  }
  for (const o of pack.objects) {
    for (const v of o.variants ?? []) walkAll(v.when);
    for (const it of o.interactions) walkAll(it.conditions);
  }
  for (const wc of pack.win_conditions) walkAll(wc.conditions);
  for (const e of pack.endings) for (const v of e.variants ?? []) walkAll(v.when);
  for (const npc of pack.npcs) {
    walkAll(npc.conditions);
    for (const node of npc.dialogue.nodes) {
      for (const v of node.variants ?? []) walkAll(v.when);
      for (const t of node.topics) walkAll(t.conditions);
    }
  }
  // Effect-side room refs: goto + place_object.room (the room-id-bearing effects
  // collected here; unlock_exit.from/.to are checked in a dedicated
  // UNLOCK_EXIT_ROOM_MISSING block in the validator body).
  for (const e of allEffects(pack)) {
    if ("goto" in e) refs.add(e.goto);
    else if ("place_object" in e) refs.add(e.place_object.room);
  }
  return refs;
}
