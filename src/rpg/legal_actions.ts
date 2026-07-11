/**
 * RPG legal-action generator + resolver (spec §9, §9.2) — the Jericho idea applied
 * to the unified RPG game: compute every currently-valid command and expose a stable
 * `id`, a human-style `command`, and the structured `Action`. The same function
 * that lists an action (`resolveRpgAction`) is what the engine calls to
 * resolve it, so the legal set never contains an action `step` would then reject
 * as *illegal* (legal ⊇ executable, §14). Conditions may still be re-checked by
 * the engine; the generator only lists condition-satisfied actions.
 */
import { evalConditions, type Condition } from "../core/conditions.js";
import type { Effect } from "../core/effects.js";
import type { RpgAction } from "../api/types.js";
import type { Resolution } from "../core/engine.js";
import type { GameState } from "../core/state.js";
import type { DialogueTopic, Interaction } from "./schema.js";
import type { ManeuverPhase } from "./maneuver_sequence.js";
import {
  type RpgModelIndex,
  activeDialogue,
  dlgVar,
  isLocked,
  isOpen,
  nodeOrdinal,
  nodeText,
  objectDescription,
  objectName,
  roomDescription,
  visibleObjectIds,
} from "./model.js";

// A USE action that carries a `skill_check` (resolved by the runner as a d20 + skill
// roll, parser/RPG alike) is annotated with the rolled stat + difficulty + die type, so a
// player (and a client) can SEE a stat is in play before committing — without it a
// declared skill var reads as vestigial (bug_0274; CYOA sibling bug_0269). `die: "d20"`
// surfaces the ceiling so "nerve(3) vs 12" reads as "d20+3 vs 12" not a flat impossible
// comparison (bug_0311; mirrors the post-roll d20 label in bug_0141). Only
// `skill`/`difficulty`/`die` surface — never the check's `on_success`/`on_failure`
// effects, which carry score/flag/end_game routing — so the destination graph stays
// hidden. Omitted on every non-skill action, so the legacy option shape is unchanged.
export type RpgActionOption = {
  id: string;
  command: string;
  action: RpgAction;
  skill_check?: { skill: string; difficulty: number; die: string };
  combat?: {
    attack_bonus: number;
    defense_bonus: number;
    one_shot: true;
    phase?: ManeuverPhase;
  };
};

function dialogueTopicMatches(topic: DialogueTopic, id: string): boolean {
  return topic.id === id || (topic.aliases ?? []).includes(id);
}

// State-aware so an enumerated command shows the object's REACTIVE name (bug_0188):
// a righted "toppled cresset" re-labels itself rather than freezing the stale word
// into "look at toppled cresset". Absent any variant `name` this is the base name.
const objName = (index: RpgModelIndex, state: GameState, id: string): string => {
  const o = index.objects.get(id);
  return o ? objectName(o, state) : id;
};

/** True if `id` is reachable for the player right now (held or visible in the room). */
export function present(index: RpgModelIndex, state: GameState, id: string): boolean {
  if (state.inventory.includes(id)) return true;
  return visibleObjectIds(index, state, state.current).includes(id);
}

/** Find the USE interaction (if any) for using `item` on `target`. Exported so the
 *  RPG runner (Stage 4) can detect a skill-check interaction before resolving. */
export function useInteraction(
  index: RpgModelIndex,
  target: string,
  item?: string,
  state?: GameState,
): Interaction | undefined {
  return index.objects.get(target)?.interactions.find((it) => {
    if (it.verb !== "USE" || it.item !== item || it.target !== target) return false;
    return state === undefined || evalConditions(it.conditions, state);
  });
}

function readInteractions(index: RpgModelIndex, target: string): Interaction[] {
  return (index.objects.get(target)?.interactions ?? []).filter((it) => it.verb === "READ");
}

/** The object's interactions for a state-reactive verb (INSPECT/OPEN/CLOSE),
 *  pre-filtered to those whose conditions hold NOW. Gated per-interaction —
 *  deliberately not the READ pattern of ANDing every condition into the
 *  action, so a retired one-shot clue never retires the verb itself. */
function firingInteractions(
  index: RpgModelIndex,
  state: GameState,
  target: string,
  verb: "INSPECT" | "OPEN" | "CLOSE",
): Interaction[] {
  return (index.objects.get(target)?.interactions ?? []).filter(
    (it) => it.verb === verb && evalConditions(it.conditions, state),
  );
}

/**
 * Resolve a structured action into conditions + effects for the engine, or null
 * if the action is structurally impossible in this state (wrong room, object not
 * present, etc.). Pure: same (index, state, action) ⇒ same resolution.
 */
export function resolveRpgAction(
  index: RpgModelIndex,
  state: GameState,
  action: RpgAction,
): Resolution | null {
  const here = state.current;
  switch (action.type) {
    case "LOOK": {
      if (action.target === undefined) {
        const room = index.rooms.get(here);
        return room
          ? { conditions: [], effects: [{ narrate: roomDescription(room, state) }] }
          : null;
      }
      if (!present(index, state, action.target)) return null;
      const o = index.objects.get(action.target);
      if (!o) return null;
      // INSPECT interactions ride on examine (bug: schema admitted the verb
      // since Stage 2 but no runtime path ever fired it — shipped clue
      // narrations in collectors_warrant/weighmasters_round silently never
      // showed). Fired per-interaction so a one-shot clue retires itself
      // while the base description stays examinable forever.
      const inspects = firingInteractions(index, state, action.target, "INSPECT");
      return {
        conditions: [],
        effects: [
          { narrate: objectDescription(o, state) },
          ...inspects.flatMap((it) => it.effects),
        ],
      };
    }
    case "INVENTORY": {
      const items = state.inventory.length
        ? state.inventory.map((i) => objName(index, state, i)).join(", ")
        : "nothing";
      return { conditions: [], effects: [{ narrate: `You are carrying: ${items}.` }] };
    }
    case "READ": {
      if (!present(index, state, action.target)) return null;
      const o = index.objects.get(action.target);
      if (!o) return null;
      const reads = readInteractions(index, action.target);
      const effects: Effect[] = [];
      if (o.read_text) effects.push({ narrate: o.read_text });
      for (const it of reads) effects.push(...it.effects);
      if (effects.length === 0) return null; // nothing to read
      const conditions: Condition[] = reads.flatMap((it) => it.conditions);
      return { conditions, effects };
    }
    case "TAKE": {
      const o = index.objects.get(action.item);
      if (!o || !o.takeable || state.inventory.includes(action.item)) return null;
      if (!visibleObjectIds(index, state, here).includes(action.item)) return null;
      const takeEffects =
        state.objectState[action.item]?.takenBy === "player" ? [] : (o.take_effects ?? []);
      // take_effects (bug_0107) fire after the first pickup, so a goal item can award
      // climactic points on the deliberate CLAIM. If the item is dropped and re-taken,
      // objectState.takenBy records that the claim already happened (bug_0383).
      return {
        conditions: [],
        effects: [
          { add_item: action.item },
          { narrate: `You take the ${o.name}.` },
          ...takeEffects,
        ],
      };
    }
    case "DROP": {
      if (!state.inventory.includes(action.item)) return null;
      const o = index.objects.get(action.item);
      if (!o) return null;
      // A held (worn/equipped/bound) or deliberately non-droppable object can
      // never be set down; DROP simply isn't offered.
      if (o.held || o.droppable === false) return null;
      return {
        conditions: [],
        effects: [
          { remove_item: action.item },
          { place_object: { id: action.item, room: here, takenBy: "player" } },
          { narrate: `You drop the ${o.name}.` },
        ],
      };
    }
    case "OPEN": {
      const o = index.objects.get(action.target);
      if (!o || !present(index, state, action.target)) return null;
      // OPEN interactions fire on the ATTEMPT — even on a non-openable
      // object (the weighmasters north_door "warning on try" shape) or a
      // locked one ("it's locked, and something shifts inside"). The
      // built-in open still requires openable ∧ unlocked; opening something
      // already standing open is nonsense, so an open object offers neither.
      if (isOpen(state, action.target)) return null;
      const opens = firingInteractions(index, state, action.target, "OPEN");
      const builtin = o.openable && !isLocked(index, state, action.target);
      if (!builtin && opens.length === 0) return null;
      const effects: Effect[] = [];
      if (builtin) {
        const reveal = o.contents.length
          ? ` Inside: ${o.contents.map((c) => objName(index, state, c)).join(", ")}.`
          : "";
        effects.push(
          { open_object: action.target },
          { narrate: `You open the ${o.name}.${reveal}` },
        );
      }
      for (const it of opens) effects.push(...it.effects);
      return { conditions: [], effects };
    }
    case "CLOSE": {
      const o = index.objects.get(action.target);
      if (!o || !present(index, state, action.target)) return null;
      // First-class CLOSE (the schema admitted the verb since Stage 2; the
      // resolver never had a case, so `close X` was parsed then always
      // rejected). Only an object standing open can be closed — which also
      // means a CLOSE interaction on a never-openable object is dead
      // content, the exact hole this fix removes for INSPECT/OPEN, so the
      // gate is on open-state, not openable-ness (an `open_object` effect
      // can open a non-openable fixture; closing it then works).
      if (!isOpen(state, action.target)) return null;
      const closes = firingInteractions(index, state, action.target, "CLOSE");
      const builtin = o.openable;
      if (!builtin && closes.length === 0) return null;
      const effects: Effect[] = [];
      if (builtin) {
        effects.push({ close_object: action.target }, { narrate: `You close the ${o.name}.` });
      }
      for (const it of closes) effects.push(...it.effects);
      return { conditions: [], effects };
    }
    case "UNLOCK": {
      const o = index.objects.get(action.target);
      if (!o || !present(index, state, action.target) || !isLocked(index, state, action.target))
        return null;
      if (o.key_id === undefined || action.with !== o.key_id || !state.inventory.includes(o.key_id))
        return null;
      // A keyed lock may carry its own narration + effects (score, unlock_exit,
      // set_flag) so a climactic unlock no longer needs a bespoke `USE key on lock`
      // interaction to award points or narrate richly — both grammars now lead to the
      // engine's first-class UNLOCK (bug_0077). Default narration/effects are unchanged
      // when the pack declares neither, so existing packs resolve byte-identically.
      return {
        conditions: [{ has_item: o.key_id }],
        effects: [
          { set_object_locked: { id: action.target, locked: false } },
          { narrate: o.unlock_narrate ?? `You unlock the ${o.name}.` },
          ...(o.unlock_effects ?? []),
        ],
      };
    }
    case "USE": {
      const it = useInteraction(index, action.target, action.item, state);
      if (!it || !present(index, state, action.target)) return null;
      if (action.item !== undefined && !state.inventory.includes(action.item)) return null;
      const itemConditions: Condition[] =
        action.item === undefined ? [] : [{ has_item: action.item }];
      return { conditions: [...itemConditions, ...it.conditions], effects: it.effects };
    }
    case "MOVE": {
      const room = index.rooms.get(here);
      const exit = room?.exits.find((e) => e.direction === action.direction);
      if (!exit) return null;
      return { conditions: exit.conditions, effects: [{ goto: exit.to }] };
    }
    case "TALK": {
      const npc = index.npcs.get(action.npc);
      if (!npc || npc.room !== here || activeDialogue(index, state)) return null;
      const ord = nodeOrdinal(npc, npc.dialogue.root);
      const root = npc.dialogue.nodes[ord - 1];
      if (!root) return null;
      return {
        conditions: npc.conditions ?? [],
        effects: [
          { set_var: { name: dlgVar(npc.id), value: ord } },
          ...root.effects,
          { narrate: `${npc.name}: "${nodeText(root, state)}"` },
        ],
      };
    }
    case "ASK": {
      const active = activeDialogue(index, state);
      if (!active || active.npc.id !== action.npc) return null;
      const topic = active.node.topics.find((t) => dialogueTopicMatches(t, action.topic));
      if (!topic) return null;
      // A gated topic is filtered from the legal set (via `option`) and re-checked
      // here by the engine, so a told-once info topic can retire itself.
      const conditions = topic.conditions ?? [];
      if (topic.end || topic.goto === undefined) {
        return {
          conditions,
          effects: [
            { set_var: { name: dlgVar(active.npc.id), value: 0 } },
            { narrate: `(You end the conversation.)` },
          ],
        };
      }
      const targetOrd = nodeOrdinal(active.npc, topic.goto);
      const target = active.npc.dialogue.nodes[targetOrd - 1];
      if (!target) return null;
      return {
        conditions,
        effects: [
          { set_var: { name: dlgVar(active.npc.id), value: targetOrd } },
          ...target.effects,
          { narrate: `${active.npc.name}: "${nodeText(target, state)}"` },
        ],
      };
    }
    default:
      return null;
  }
}

function option(
  index: RpgModelIndex,
  state: GameState,
  id: string,
  command: string,
  action: RpgAction,
): RpgActionOption | null {
  const res = resolveRpgAction(index, state, action);
  if (!res || !evalConditions(res.conditions, state)) return null;
  return { id, command, action };
}

/**
 * Enumerate every legal action for the current state. Dialogue is modal: while
 * the player is mid-conversation, only the current node's topics are offered
 * (the tree must terminate, so an end-topic always exits — §10.2).
 */
export function enumerateRpgBaseActions(index: RpgModelIndex, state: GameState): RpgActionOption[] {
  if (state.ended) return [];
  const out: RpgActionOption[] = [];
  const push = (o: RpgActionOption | null): void => {
    if (o) out.push(o);
  };

  const active = activeDialogue(index, state);
  if (active) {
    for (const t of active.node.topics) {
      push(
        option(index, state, `ask_${t.id}`, `ask: ${t.prompt}`, {
          type: "ASK",
          npc: active.npc.id,
          topic: t.id,
        }),
      );
    }
    return out;
  }

  const here = state.current;
  const room = index.rooms.get(here);
  if (!room) return out;

  // Movement (sorted by direction for determinism).
  for (const exit of [...room.exits].sort((a, b) => a.direction.localeCompare(b.direction))) {
    push(
      option(index, state, `go_${exit.direction}`, `go ${exit.direction}`, {
        type: "MOVE",
        direction: exit.direction,
      }),
    );
  }

  // Objects visible in the room.
  for (const oid of visibleObjectIds(index, state, here)) {
    const o = index.objects.get(oid);
    if (!o) continue;
    const oName = objectName(o, state);
    push(option(index, state, `examine_${oid}`, `look at ${oName}`, { type: "LOOK", target: oid }));
    push(option(index, state, `read_${oid}`, `read ${oName}`, { type: "READ", target: oid }));
    push(option(index, state, `take_${oid}`, `take ${oName}`, { type: "TAKE", item: oid }));
    push(option(index, state, `open_${oid}`, `open ${oName}`, { type: "OPEN", target: oid }));
    push(option(index, state, `close_${oid}`, `close ${oName}`, { type: "CLOSE", target: oid }));
    if (o.key_id !== undefined) {
      push(
        option(
          index,
          state,
          `unlock_${oid}`,
          `unlock ${oName} with ${objName(index, state, o.key_id)}`,
          {
            type: "UNLOCK",
            target: oid,
            with: o.key_id,
          },
        ),
      );
    }
  }

  // Held objects: examine, read, drop, and any USE interaction whose target is present.
  for (const item of [...state.inventory].sort()) {
    const o = index.objects.get(item);
    if (!o) continue;
    const oName = objectName(o, state);
    push(
      option(index, state, `examine_${item}`, `look at ${oName}`, { type: "LOOK", target: item }),
    );
    push(option(index, state, `read_${item}`, `read ${oName}`, { type: "READ", target: item }));
    push(option(index, state, `drop_${item}`, `drop ${oName}`, { type: "DROP", item }));
  }

  // USE interactions across the pack whose target is present and whose optional item is held.
  // A self-targeted USE (item === target) is the "consume this thing" pattern —
  // drink the phial, eat the bread — and reads as `use <obj>`, not the nonsensical
  // `use <obj> on <obj>`.
  for (const o of index.objectsWithUseInteractions) {
    for (const it of o.interactions) {
      if (it.verb !== "USE" || it.target === undefined) continue;
      if (!evalConditions(it.conditions, state)) continue;
      const selfUse = it.item !== undefined && it.item === it.target;
      const id =
        it.item === undefined
          ? `use_${it.target}`
          : selfUse
            ? `use_${it.item}`
            : `use_${it.item}_on_${it.target}`;
      // A USE may declare a natural verb (command_verb) so the listed command matches
      // the prose that primes it; the id stays verb-agnostic and stable. A self-USE
      // reads "<verb> <obj>" ("drink black phial"). An item-on-target USE reads via
      // command_template ("tie {item} to {target}", "lever {target} with {item}") so
      // the word order/preposition match too, falling back to "<verb> <item> on
      // <target>" when no template is given, or the generic "use ... on ..." with no
      // command_verb at all.
      const itemName = it.item === undefined ? "" : objName(index, state, it.item);
      const targetName = objName(index, state, it.target);
      const command =
        it.item === undefined
          ? `${it.command_verb ?? "use"} ${targetName}`
          : selfUse
            ? `${it.command_verb ?? "use"} ${itemName}`
            : it.command_verb !== undefined
              ? (it.command_template ?? `${it.command_verb} {item} on {target}`)
                  .replace("{item}", itemName)
                  .replace("{target}", targetName)
              : `use ${itemName} on ${targetName}`;
      const action: RpgAction =
        it.item === undefined
          ? { type: "USE", target: it.target }
          : { type: "USE", item: it.item, target: it.target };
      const opt = option(index, state, id, command, action);
      // Surface the rolled skill + difficulty + die type when this USE is a skill check,
      // so the listed command reads as the intentional d20 roll it is (bug_0274). `die`
      // surfaces the ceiling so the check never looks impossible (bug_0311). Never branch
      // effects, which would leak score/flag/end_game routing.
      if (opt && it.skill_check) {
        opt.skill_check = {
          skill: it.skill_check.skill,
          difficulty: it.skill_check.difficulty,
          die: "d20",
        };
      }
      push(opt);
    }
  }

  // NPCs present.
  for (const npc of index.npcByRoom.get(here) ?? []) {
    if (!evalConditions(npc.conditions ?? [], state)) continue;
    push(
      option(index, state, `talk_${npc.id}`, `talk to ${npc.name}`, { type: "TALK", npc: npc.id }),
    );
  }

  // Always-available informational actions.
  push(option(index, state, "look_around", "look", { type: "LOOK" }));
  push(option(index, state, "inventory", "inventory", { type: "INVENTORY" }));
  return out;
}
