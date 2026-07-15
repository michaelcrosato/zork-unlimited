import type { Condition } from "../../../src/core/conditions.js";
import type { Effect } from "../../../src/core/effects.js";
import type {
  DialogueNode,
  DialogueNodeVariant,
  DialogueTopic,
  Ending,
  Enemy,
  EnemyManeuver,
  Exit,
  GameObject,
  Interaction,
  Npc,
  ObjectVariant,
  Room,
  RoomVariant,
  RpgPack,
  SkillCheck,
  WinCondition,
} from "../../../src/rpg/schema.js";
import { ATTACK_VAR, DEFENSE_VAR, HP_VAR, SCORE_VAR } from "../../../src/rpg/schema.js";

export type RpgRelabeler = {
  r: (id: string) => string;
  rvar: (name: string) => string;
  map: ReadonlyMap<string, string>;
};

export const RPG_RESERVED_VARS: ReadonlySet<string> = new Set([
  SCORE_VAR,
  HP_VAR,
  ATTACK_VAR,
  DEFENSE_VAR,
]);

export function makeRpgRelabeler(reserved: ReadonlySet<string> = RPG_RESERVED_VARS): RpgRelabeler {
  const map = new Map<string, string>();
  let n = 0;
  const r = (id: string): string => {
    let v = map.get(id);
    if (v === undefined) {
      v = `mx_${n++}`;
      map.set(id, v);
    }
    return v;
  };
  const rvar = (name: string): string => (reserved.has(name) ? name : r(name));
  return { r, rvar, map };
}

function relabelCondition(
  c: Condition,
  r: (id: string) => string,
  rv: (n: string) => string,
): Condition {
  if ("has_flag" in c) return { has_flag: r(c.has_flag) };
  if ("not_flag" in c) return { not_flag: r(c.not_flag) };
  if ("has_item" in c) return { has_item: r(c.has_item) };
  if ("not_item" in c) return { not_item: r(c.not_item) };
  if ("visited" in c) return { visited: r(c.visited) };
  if ("not_visited" in c) return { not_visited: r(c.not_visited) };
  if ("in_room" in c) return { in_room: r(c.in_room) };
  if ("is_open" in c) return { is_open: r(c.is_open) };
  if ("is_unlocked" in c) return { is_unlocked: r(c.is_unlocked) };
  if ("var_gte" in c) return { var_gte: { name: rv(c.var_gte.name), value: c.var_gte.value } };
  if ("var_lte" in c) return { var_lte: { name: rv(c.var_lte.name), value: c.var_lte.value } };
  if ("var_eq" in c) return { var_eq: { name: rv(c.var_eq.name), value: c.var_eq.value } };
  if ("quest_stage" in c)
    return { quest_stage: { quest: r(c.quest_stage.quest), stage: r(c.quest_stage.stage) } };
  if ("all_of" in c) return { all_of: c.all_of.map((x) => relabelCondition(x, r, rv)) };
  if ("any_of" in c) return { any_of: c.any_of.map((x) => relabelCondition(x, r, rv)) };
  if ("none_of" in c) return { none_of: c.none_of.map((x) => relabelCondition(x, r, rv)) };
  const _exhaustive: never = c;
  return _exhaustive;
}

function relabelEffect(e: Effect, r: (id: string) => string, rv: (n: string) => string): Effect {
  if ("set_flag" in e) return { set_flag: r(e.set_flag) };
  if ("clear_flag" in e) return { clear_flag: r(e.clear_flag) };
  if ("add_item" in e) return { add_item: r(e.add_item) };
  if ("remove_item" in e) return { remove_item: r(e.remove_item) };
  if ("set_var" in e) return { set_var: { name: rv(e.set_var.name), value: e.set_var.value } };
  if ("inc_var" in e) return { inc_var: { name: rv(e.inc_var.name), by: e.inc_var.by } };
  if ("dec_var" in e) return { dec_var: { name: rv(e.dec_var.name), by: e.dec_var.by } };
  if ("add_journal" in e) return { add_journal: e.add_journal };
  if ("goto" in e) return { goto: r(e.goto) };
  if ("unlock_exit" in e)
    return { unlock_exit: { from: r(e.unlock_exit.from), to: r(e.unlock_exit.to) } };
  if ("open_object" in e) return { open_object: r(e.open_object) };
  if ("close_object" in e) return { close_object: r(e.close_object) };
  if ("set_object_locked" in e)
    return {
      set_object_locked: { id: r(e.set_object_locked.id), locked: e.set_object_locked.locked },
    };
  if ("place_object" in e)
    return {
      place_object: {
        id: r(e.place_object.id),
        room: r(e.place_object.room),
        ...(e.place_object.takenBy !== undefined ? { takenBy: e.place_object.takenBy } : {}),
      },
    };
  if ("set_quest_stage" in e)
    return {
      set_quest_stage: { quest: r(e.set_quest_stage.quest), stage: r(e.set_quest_stage.stage) },
    };
  if ("narrate" in e) return { narrate: e.narrate };
  if ("end_game" in e) return { end_game: r(e.end_game) };
  const _exhaustive: never = e;
  return _exhaustive;
}

function relabelExit(x: Exit, r: (id: string) => string, rv: (n: string) => string): Exit {
  return {
    direction: x.direction,
    to: r(x.to),
    conditions: x.conditions.map((c) => relabelCondition(c, r, rv)),
    ...(x.locked_msg !== undefined ? { locked_msg: x.locked_msg } : {}),
  };
}

function relabelRoomVariant(
  v: RoomVariant,
  r: (id: string) => string,
  rv: (n: string) => string,
): RoomVariant {
  return { when: v.when.map((c) => relabelCondition(c, r, rv)), text: v.text };
}

function relabelRoom(room: Room, r: (id: string) => string, rv: (n: string) => string): Room {
  return {
    id: r(room.id),
    name: room.name,
    description: room.description,
    ...(room.variants ? { variants: room.variants.map((v) => relabelRoomVariant(v, r, rv)) } : {}),
    objects: room.objects.map((o) => r(o)),
    exits: room.exits.map((x) => relabelExit(x, r, rv)),
    on_enter: room.on_enter.map((e) => relabelEffect(e, r, rv)),
  };
}

function relabelObjectVariant(
  v: ObjectVariant,
  r: (id: string) => string,
  rv: (n: string) => string,
): ObjectVariant {
  return {
    when: v.when.map((c) => relabelCondition(c, r, rv)),
    text: v.text,
    ...(v.name !== undefined ? { name: v.name } : {}),
  };
}

function relabelSkillCheck(
  s: SkillCheck,
  r: (id: string) => string,
  rv: (n: string) => string,
): SkillCheck {
  return {
    skill: rv(s.skill),
    difficulty: s.difficulty,
    on_success: s.on_success.map((e) => relabelEffect(e, r, rv)),
    on_failure: s.on_failure.map((e) => relabelEffect(e, r, rv)),
  };
}

function relabelInteraction(
  it: Interaction,
  r: (id: string) => string,
  rv: (n: string) => string,
): Interaction {
  return {
    verb: it.verb,
    ...(it.item !== undefined ? { item: r(it.item) } : {}),
    ...(it.target !== undefined ? { target: r(it.target) } : {}),
    conditions: it.conditions.map((c) => relabelCondition(c, r, rv)),
    effects: it.effects.map((e) => relabelEffect(e, r, rv)),
    ...(it.skill_check ? { skill_check: relabelSkillCheck(it.skill_check, r, rv) } : {}),
    ...(it.command_verb !== undefined ? { command_verb: it.command_verb } : {}),
    ...(it.command_template !== undefined ? { command_template: it.command_template } : {}),
    ...(it.blocked_hint
      ? {
          blocked_hint: {
            visible_when: it.blocked_hint.visible_when.map((condition) =>
              relabelCondition(condition, r, rv),
            ),
            reason: it.blocked_hint.reason,
          },
        }
      : {}),
  };
}

function relabelObject(
  o: GameObject,
  r: (id: string) => string,
  rv: (n: string) => string,
): GameObject {
  return {
    id: r(o.id),
    name: o.name,
    aliases: o.aliases,
    description: o.description,
    ...(o.visible_when !== undefined
      ? { visible_when: o.visible_when.map((c) => relabelCondition(c, r, rv)) }
      : {}),
    ...(o.variants ? { variants: o.variants.map((v) => relabelObjectVariant(v, r, rv)) } : {}),
    takeable: o.takeable,
    ...(o.droppable !== undefined ? { droppable: o.droppable } : {}),
    ...(o.held !== undefined ? { held: o.held } : {}),
    quest_critical: o.quest_critical,
    ...(o.read_text !== undefined ? { read_text: o.read_text } : {}),
    container: o.container,
    openable: o.openable,
    locked: o.locked,
    ...(o.key_id !== undefined ? { key_id: r(o.key_id) } : {}),
    ...(o.unlock_narrate !== undefined ? { unlock_narrate: o.unlock_narrate } : {}),
    ...(o.unlock_effects !== undefined
      ? { unlock_effects: o.unlock_effects.map((e) => relabelEffect(e, r, rv)) }
      : {}),
    ...(o.take_effects !== undefined
      ? { take_effects: o.take_effects.map((e) => relabelEffect(e, r, rv)) }
      : {}),
    contents: o.contents.map((c) => r(c)),
    interactions: o.interactions.map((it) => relabelInteraction(it, r, rv)),
  };
}

function relabelTopic(
  t: DialogueTopic,
  r: (id: string) => string,
  rv: (n: string) => string,
): DialogueTopic {
  return {
    id: r(t.id),
    ...(t.aliases !== undefined ? { aliases: t.aliases.map((alias) => r(alias)) } : {}),
    prompt: t.prompt,
    ...(t.conditions !== undefined
      ? { conditions: t.conditions.map((c) => relabelCondition(c, r, rv)) }
      : {}),
    ...(t.goto !== undefined ? { goto: r(t.goto) } : {}),
    end: t.end,
  };
}

function relabelNodeVariant(
  v: DialogueNodeVariant,
  r: (id: string) => string,
  rv: (n: string) => string,
): DialogueNodeVariant {
  return { when: v.when.map((c) => relabelCondition(c, r, rv)), text: v.text };
}

function relabelNode(
  node: DialogueNode,
  r: (id: string) => string,
  rv: (n: string) => string,
): DialogueNode {
  return {
    id: r(node.id),
    npc_text: node.npc_text,
    ...(node.variants ? { variants: node.variants.map((v) => relabelNodeVariant(v, r, rv)) } : {}),
    effects: node.effects.map((e) => relabelEffect(e, r, rv)),
    topics: node.topics.map((t) => relabelTopic(t, r, rv)),
  };
}

function relabelNpc(npc: Npc, r: (id: string) => string, rv: (n: string) => string): Npc {
  return {
    id: r(npc.id),
    name: npc.name,
    description: npc.description,
    room: r(npc.room),
    ...(npc.conditions !== undefined
      ? { conditions: npc.conditions.map((c) => relabelCondition(c, r, rv)) }
      : {}),
    dialogue: {
      root: r(npc.dialogue.root),
      nodes: npc.dialogue.nodes.map((n) => relabelNode(n, r, rv)),
    },
  };
}

function relabelWinCondition(
  w: WinCondition,
  r: (id: string) => string,
  rv: (n: string) => string,
): WinCondition {
  return {
    id: r(w.id),
    conditions: w.conditions.map((c) => relabelCondition(c, r, rv)),
    ending: r(w.ending),
  };
}

function relabelEnding(e: Ending, r: (id: string) => string, rv: (n: string) => string): Ending {
  return {
    id: r(e.id),
    title: e.title,
    text: e.text,
    ...(e.variants
      ? {
          variants: e.variants.map((v) => ({
            when: v.when.map((c) => relabelCondition(c, r, rv)),
            text: v.text,
          })),
        }
      : {}),
    death: e.death,
  };
}

function relabelEnemy(e: Enemy, r: (id: string) => string, rv: (n: string) => string): Enemy {
  return {
    id: r(e.id),
    name: e.name,
    description: e.description,
    room: r(e.room),
    hp: e.hp,
    attack: e.attack,
    defense: e.defense,
    ...(e.conditions !== undefined
      ? { conditions: e.conditions.map((c) => relabelCondition(c, r, rv)) }
      : {}),
    ...(e.defeat_flag !== undefined ? { defeat_flag: r(e.defeat_flag) } : {}),
    death_ending: r(e.death_ending),
    on_defeat: e.on_defeat.map((eff) => relabelEffect(eff, r, rv)),
    ...(e.maneuvers
      ? {
          maneuvers: e.maneuvers.map((maneuver) => relabelEnemyManeuver(maneuver, r, rv)),
        }
      : {}),
  };
}

function relabelEnemyManeuver(
  maneuver: EnemyManeuver,
  r: (id: string) => string,
  rv: (n: string) => string,
): EnemyManeuver {
  return {
    id: r(maneuver.id),
    command: maneuver.command,
    ...(maneuver.after !== undefined ? { after: r(maneuver.after) } : {}),
    conditions: maneuver.conditions.map((condition) => relabelCondition(condition, r, rv)),
    result_flag: r(maneuver.result_flag),
    attack_bonus: maneuver.attack_bonus,
    defense_bonus: maneuver.defense_bonus,
    ...(maneuver.resource_effects
      ? {
          resource_effects: maneuver.resource_effects.map((effect) =>
            "add_item" in effect
              ? { add_item: r(effect.add_item) }
              : { remove_item: r(effect.remove_item) },
          ),
        }
      : {}),
    narration: maneuver.narration,
  };
}

export function relabelRpgPack(pack: RpgPack): {
  pack: RpgPack;
  relabeler: RpgRelabeler;
} {
  const relabeler = makeRpgRelabeler();
  const { r, rvar } = relabeler;
  return {
    relabeler,
    pack: {
      meta: {
        id: r(pack.meta.id),
        title: pack.meta.title,
        ...(pack.meta.world !== undefined ? { world: pack.meta.world } : {}),
        start_room: r(pack.meta.start_room),
        vars_init: Object.fromEntries(
          Object.entries(pack.meta.vars_init).map(([k, v]) => [rvar(k), v]),
        ),
        flags_init: pack.meta.flags_init.map((f) => r(f)),
        max_score: pack.meta.max_score,
        ...(pack.meta.combat_guaranteed !== undefined
          ? { combat_guaranteed: pack.meta.combat_guaranteed }
          : {}),
      },
      rooms: pack.rooms.map((room) => relabelRoom(room, r, rvar)),
      objects: pack.objects.map((o) => relabelObject(o, r, rvar)),
      npcs: pack.npcs.map((npc) => relabelNpc(npc, r, rvar)),
      ...(pack.pressure_tracks
        ? {
            pressure_tracks: pack.pressure_tracks.map((track) => ({
              id: r(track.id),
              title: track.title,
              var: rvar(track.var),
              bands: track.bands.map((band) => ({ ...band })),
            })),
          }
        : {}),
      win_conditions: pack.win_conditions.map((w) => relabelWinCondition(w, r, rvar)),
      endings: pack.endings.map((e) => relabelEnding(e, r, rvar)),
      enemies: pack.enemies.map((e) => relabelEnemy(e, r, rvar)),
    },
  };
}
