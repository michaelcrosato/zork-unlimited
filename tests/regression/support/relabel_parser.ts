/**
 * Metamorphic relabeling for PARSER packs — the parser-mode extension of the
 * contamination-robustness oracle (bug_0211), mirroring the CYOA relabeler bug_0209
 * shipped (support/relabel_cyoa.ts). This is the deferred "extend the metamorphic
 * relabel oracle to the PARSER mode" lever named as next-focus #1/#2 across the last
 * several cycles — the same growth path the bug_0121 reachability oracle followed
 * (CYOA → parser → rpg).
 *
 * WHAT IT DOES. Given a compiled `ParserPack`, it produces a STRUCTURALLY ISOMORPHIC
 * pack in which every *identifier* — room ids, object ids (= item ids; a takeable
 * object's id is the item id `has_item`/`add_item` name), flags, NON-RESERVED var
 * names, npc ids, dialogue node + topic ids, win-condition ids, ending ids, quest/stage
 * names, key_id / container-contents references, object refs inside conditions/effects,
 * and the pack id — is rewritten to an opaque token (`mx_0`, `mx_1`, …) via one
 * consistent memoized bijection, while every PROSE and player-facing VOCABULARY field
 * is left byte-for-byte untouched. A reference and its definition share the same old
 * string, so the same bijection maps both to the same new token: the relabeled pack is
 * a valid pack describing the SAME game with DIFFERENT internal names.
 *
 * WHAT STAYS BYTE-IDENTICAL (and why). Three kinds of field are NOT relabeled:
 *   1. PROSE — room/object names, descriptions, variant text, titles, ending text,
 *      `read_text`, `narrate`, `add_journal`, `unlock_narrate`, dialogue `npc_text`,
 *      topic `prompt`, `locked_msg`. These are what a player reads; the CYOA oracle
 *      treats titles/text the same way. Leaving them identical is the faithful choice:
 *      the eval measures whether a model follows STRUCTURE, not whether it memorised the
 *      author's internal id strings — and the prose IS legitimately part of the surface
 *      a player sees, so a twin with identical prose but renamed ids is exactly the
 *      "did you actually solve it, or recall the id?" probe.
 *   2. COMMAND VOCABULARY — object `aliases`, exit `direction` (north/south/…), the
 *      `command_verb` and `command_template` of a USE puzzle. These are the words the
 *      controlled command parser matches typed text against; they are grammar, not
 *      content ids. (The structural census never types text — it steps the engine's own
 *      `legalActions` Action objects, which are keyed by ids — so vocabulary is inert to
 *      it anyway; relabeling it would only desync the prose without changing structure.)
 *   3. THE RESERVED `score` VAR — `score` (SCORE_VAR) is special-cased by the runner,
 *      observation, and validator (max_score economy). It is an ENGINE keyword, not an
 *      author-chosen content id, so — exactly like a builtin verb or a compass direction
 *      — it is a relabel FIXED POINT. Var-name positions route through `rvar`, which
 *      returns reserved names unchanged and relabels every other var. (In the shipped
 *      packs `score` is the ONLY var, so the var map is empty after the fixed point; the
 *      machinery is kept correct for any future non-score var a generated pack mints.)
 *
 * WHY IT IS AN ORACLE. The AdventureForge engine is content-free and id-driven: ids are
 * opaque keys, never special-cased (the one keyword, `score`, is held fixed above), so a
 * game's solvability is a property of its STRUCTURE, not of the particular id strings an
 * author chose. parser_metamorphic_relabel.test.ts ASSERTS that invariance: the
 * exhaustive ending-reachability census, the distinct-state count, and the validator's
 * finding-code multiset must all be identical (modulo the bijection) on a pack and its
 * twin. Payoffs mirror the CYOA oracle — a soundness witness for the whole id-driven
 * design (a future change that routed behaviour through a literal id would pass every
 * literal-pack oracle but diverge HERE) and a contamination-robustness witness for the
 * benchmark ([[ultraplan-true-goal-pivot]]): a model that "solved" a pack by memorising
 * its id strings gains nothing on the twin.
 *
 * SOUNDNESS OF THE RELABELER ITSELF. The walk is TYPED, not a generic deep substitution:
 * it rewrites ids ONLY at the schema positions that hold ids (enumerated against the
 * closed Condition/Effect DSLs and the parser schema), so a prose field can never be
 * corrupted and a prose value that happens to equal an id can never be wrongly rewritten.
 * Completeness is self-checked by the oracle's assertions — a MISSED id site leaves a
 * dangling reference, which makes the twin either fail the validator or reach a different
 * ending set: a loud failure, never a silent pass. The bijection is memoized (each
 * distinct old id → a fresh `mx_<n>`), hence injective and consistent.
 */
import type {
  ParserPack,
  Room,
  RoomVariant,
  Exit,
  GameObject,
  ObjectVariant,
  Interaction,
  SkillCheck,
  Npc,
  DialogueNode,
  DialogueNodeVariant,
  DialogueTopic,
  WinCondition,
  ParserEnding,
} from "../../../src/parser/schema.js";
import { SCORE_VAR } from "../../../src/parser/schema.js";
import type { Condition } from "../../../src/core/conditions.js";
import type { Effect } from "../../../src/core/effects.js";

/** A memoized bijection over identifier strings (old id → fresh opaque token), with a
 *  reserved-aware variant for var names. */
export type ParserRelabeler = {
  /** Map an id to its opaque token, assigning a new one on first sight. */
  r: (id: string) => string;
  /** Map a VAR name: reserved engine vars (`score`) are fixed points; others go via `r`. */
  rvar: (name: string) => string;
  /** The accumulated old→new map (populated as the pack is walked; excludes reserved fixed points). */
  map: ReadonlyMap<string, string>;
};

/** Var names the engine reserves and special-cases — held FIXED by the relabel, like a
 *  builtin verb or a compass direction (kept in sync with src/parser/schema.ts SCORE_VAR).
 *  The RPG relabeler (relabel_rpg.ts) widens this with the player-stat vars hp/attack/defense,
 *  which src/rpg/combat.ts + observation.ts read by literal name — so it passes its own,
 *  wider reserved set to `makeParserRelabeler`. */
export const PARSER_RESERVED_VARS: ReadonlySet<string> = new Set([SCORE_VAR]);

/** Build a fresh memoized bijection. Distinct olds get distinct `mx_<n>` tokens; reserved
 *  var names are never entered into the map (so it can never contain an identity entry). The
 *  reserved set is a parameter so a mode with more engine-keyword vars (RPG: hp/attack/defense)
 *  can hold them fixed too; it defaults to the parser's `{score}`. */
export function makeParserRelabeler(
  reserved: ReadonlySet<string> = PARSER_RESERVED_VARS,
): ParserRelabeler {
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

// ── Closed Condition/Effect DSL walk ────────────────────────────────────────────────
// Identical in shape to the CYOA relabeler's, with ONE parser-specific difference: var
// names route through `rvar` (reserved-aware) rather than the plain id bijection, so the
// engine-keyword `score` survives relabeling. The `never` exhaustiveness guards make a
// future DSL addition a COMPILE error here, so this can never silently miss a new kind.

export function relabelCondition(
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

export function relabelEffect(
  e: Effect,
  r: (id: string) => string,
  rv: (n: string) => string,
): Effect {
  if ("set_flag" in e) return { set_flag: r(e.set_flag) };
  if ("clear_flag" in e) return { clear_flag: r(e.clear_flag) };
  if ("add_item" in e) return { add_item: r(e.add_item) };
  if ("remove_item" in e) return { remove_item: r(e.remove_item) };
  if ("set_var" in e) return { set_var: { name: rv(e.set_var.name), value: e.set_var.value } };
  if ("inc_var" in e) return { inc_var: { name: rv(e.inc_var.name), by: e.inc_var.by } };
  if ("dec_var" in e) return { dec_var: { name: rv(e.dec_var.name), by: e.dec_var.by } };
  if ("add_journal" in e) return { add_journal: e.add_journal }; // prose — untouched
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
    return { place_object: { id: r(e.place_object.id), room: r(e.place_object.room) } };
  if ("set_quest_stage" in e)
    return {
      set_quest_stage: { quest: r(e.set_quest_stage.quest), stage: r(e.set_quest_stage.stage) },
    };
  if ("narrate" in e) return { narrate: e.narrate }; // prose — untouched
  if ("end_game" in e) return { end_game: r(e.end_game) };
  const _exhaustive: never = e;
  return _exhaustive;
}

// ── Parser schema walk ──────────────────────────────────────────────────────────────

function relabelExit(x: Exit, r: (id: string) => string, rv: (n: string) => string): Exit {
  return {
    direction: x.direction, // command vocabulary — untouched
    to: r(x.to),
    conditions: x.conditions.map((c) => relabelCondition(c, r, rv)),
    // Preserve absent-vs-present so an unused field stays absent (schema parity).
    ...(x.locked_msg !== undefined ? { locked_msg: x.locked_msg } : {}), // prose — untouched
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
    name: room.name, // prose
    description: room.description, // prose
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
    text: v.text, // prose
    ...(v.name !== undefined ? { name: v.name } : {}), // prose
  };
}

function relabelSkillCheck(
  s: SkillCheck,
  r: (id: string) => string,
  rv: (n: string) => string,
): SkillCheck {
  return {
    skill: rv(s.skill), // a var name (e.g. "might") — reserved-aware
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
    ...(it.command_verb !== undefined ? { command_verb: it.command_verb } : {}), // vocabulary
    ...(it.command_template !== undefined ? { command_template: it.command_template } : {}), // display
  };
}

function relabelObject(
  o: GameObject,
  r: (id: string) => string,
  rv: (n: string) => string,
): GameObject {
  return {
    id: r(o.id),
    name: o.name, // prose / vocabulary
    aliases: o.aliases, // command vocabulary — untouched
    description: o.description, // prose
    ...(o.variants ? { variants: o.variants.map((v) => relabelObjectVariant(v, r, rv)) } : {}),
    takeable: o.takeable,
    ...(o.held !== undefined ? { held: o.held } : {}), // carried-state flag; no id to relabel
    quest_critical: o.quest_critical,
    ...(o.read_text !== undefined ? { read_text: o.read_text } : {}), // prose
    container: o.container,
    openable: o.openable,
    locked: o.locked,
    ...(o.key_id !== undefined ? { key_id: r(o.key_id) } : {}),
    ...(o.unlock_narrate !== undefined ? { unlock_narrate: o.unlock_narrate } : {}), // prose
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
    prompt: t.prompt, // prose
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
  return { when: v.when.map((c) => relabelCondition(c, r, rv)), text: v.text }; // text is prose
}

function relabelNode(
  node: DialogueNode,
  r: (id: string) => string,
  rv: (n: string) => string,
): DialogueNode {
  return {
    id: r(node.id),
    npc_text: node.npc_text, // prose
    // Preserve absent-vs-present so an unused field stays absent (schema/hash parity).
    ...(node.variants ? { variants: node.variants.map((v) => relabelNodeVariant(v, r, rv)) } : {}),
    effects: node.effects.map((e) => relabelEffect(e, r, rv)),
    topics: node.topics.map((t) => relabelTopic(t, r, rv)),
  };
}

function relabelNpc(npc: Npc, r: (id: string) => string, rv: (n: string) => string): Npc {
  return {
    id: r(npc.id),
    name: npc.name, // prose
    description: npc.description, // prose
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

function relabelEnding(
  e: ParserEnding,
  r: (id: string) => string,
  rv: (n: string) => string,
): ParserEnding {
  return {
    id: r(e.id),
    title: e.title, // prose
    text: e.text, // prose
    // Reactive epilogue variants: `text` is prose, but `when` references ids/vars that
    // ARE relabeled — so the twin's epilogue gates resolve identically (else its
    // census / validator finding codes would diverge from the original's).
    ...(e.variants
      ? {
          variants: e.variants.map((v) => ({
            when: v.when.map((c) => relabelCondition(c, r, rv)),
            text: v.text, // prose
          })),
        }
      : {}),
    death: e.death,
  };
}

/**
 * Relabel a whole PARSER pack. Returns the isomorphic pack plus the bijection that
 * produced it (so a caller can map the original's reached / declared ending ids through
 * `r` to compare against the twin's census). The bijection is built lazily as the pack
 * is walked, so on return `relabeler.map` is complete.
 */
export function relabelParserPack(pack: ParserPack): {
  pack: ParserPack;
  relabeler: ParserRelabeler;
} {
  const relabeler = makeParserRelabeler();
  return { pack: relabelParserBody(pack, relabeler), relabeler };
}

/**
 * Relabel just the PARSER-shaped body of a pack with an ALREADY-BUILT relabeler, returning
 * the parser pack. Split out of `relabelParserPack` so the RPG relabeler (relabel_rpg.ts)
 * can reuse the exact same typed walk — driving it with a relabeler whose reserved-var set
 * also holds hp/attack/defense fixed — then add the RPG-only `enemies` / `combat_guaranteed`
 * on top. A ParserPack's meta has no `combat_guaranteed`; an RPG caller re-attaches it.
 */
export function relabelParserBody(pack: ParserPack, relabeler: ParserRelabeler): ParserPack {
  const { r, rvar } = relabeler;
  const meta = pack.meta;
  return {
    meta: {
      id: r(meta.id),
      title: meta.title, // prose
      start_room: r(meta.start_room),
      vars_init: Object.fromEntries(Object.entries(meta.vars_init).map(([k, v]) => [rvar(k), v])),
      flags_init: meta.flags_init.map((f) => r(f)),
      max_score: meta.max_score,
    },
    rooms: pack.rooms.map((room) => relabelRoom(room, r, rvar)),
    objects: pack.objects.map((o) => relabelObject(o, r, rvar)),
    npcs: pack.npcs.map((npc) => relabelNpc(npc, r, rvar)),
    win_conditions: pack.win_conditions.map((w) => relabelWinCondition(w, r, rvar)),
    endings: pack.endings.map((e) => relabelEnding(e, r, rvar)),
  };
}
