import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const DEFAULT_WORLD_URL = new URL("../game/world.json", import.meta.url);

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const body = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",");
    return `{${body}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function worldHash(world) {
  return sha256(stableStringify(world));
}

export async function loadWorld(pathOrUrl = process.env.LEAN_WORLD ?? DEFAULT_WORLD_URL) {
  const path = pathOrUrl instanceof URL ? fileURLToPath(pathOrUrl) : resolve(pathOrUrl);
  const raw = await readFile(path, "utf8");
  const world = JSON.parse(raw);
  validateWorld(world);
  return world;
}

export function validateWorld(world) {
  if (!world || typeof world !== "object") throw new Error("World must be an object.");
  if (typeof world.id !== "string" || typeof world.title !== "string") {
    throw new Error("World requires string id and title fields.");
  }
  if (!Number.isSafeInteger(world.maxTurns) || world.maxTurns < 1) {
    throw new Error("World maxTurns must be a positive safe integer.");
  }
  if (!world.rooms?.[world.start]) throw new Error("World start room does not exist.");
  for (const [roomId, room] of Object.entries(world.rooms ?? {})) {
    if (typeof room.title !== "string" || typeof room.text !== "string") {
      throw new Error(`Room ${roomId} requires title and text.`);
    }
    for (const actionId of room.actions ?? []) {
      if (!world.actions?.[actionId]) throw new Error(`Room ${roomId} names unknown action ${actionId}.`);
    }
  }
  const conditionKeys = new Set(["has", "lacks", "flag", "notFlag"]);
  const effectKeys = new Set(["move", "take", "remove", "flag", "unflag", "score", "end"]);
  for (const [actionId, action] of Object.entries(world.actions ?? {})) {
    if (typeof action.label !== "string" || !Array.isArray(action.effects)) {
      throw new Error(`Action ${actionId} requires label and effects.`);
    }
    for (const condition of action.when ?? []) {
      const keys = Object.keys(condition);
      if (keys.length !== 1 || !conditionKeys.has(keys[0])) {
        throw new Error(`Action ${actionId} has an invalid condition.`);
      }
      if (typeof condition[keys[0]] !== "string") {
        throw new Error(`Action ${actionId} condition values must be strings.`);
      }
    }
    for (const effect of action.effects) {
      const keys = Object.keys(effect);
      if (keys.length !== 1 || !effectKeys.has(keys[0])) {
        throw new Error(`Action ${actionId} has an invalid effect.`);
      }
      if (effect.move !== undefined && !world.rooms[effect.move]) {
        throw new Error(`Action ${actionId} moves to unknown room ${effect.move}.`);
      }
      if (effect.end !== undefined && !world.endings?.[effect.end]) {
        throw new Error(`Action ${actionId} names unknown ending ${effect.end}.`);
      }
      if (effect.score !== undefined && !Number.isSafeInteger(effect.score)) {
        throw new Error(`Action ${actionId} score effects must be safe integers.`);
      }
      for (const key of ["move", "take", "remove", "flag", "unflag", "end"]) {
        if (effect[key] !== undefined && typeof effect[key] !== "string") {
          throw new Error(`Action ${actionId} effect ${key} must be a string.`);
        }
      }
    }
  }
  if (!Array.isArray(world.winningPlan) || world.winningPlan.some((id) => !world.actions[id])) {
    throw new Error("World winningPlan must contain known action ids.");
  }
  return world;
}

export function createState(world, seed = 1) {
  if (!Number.isSafeInteger(seed)) throw new Error("Seed must be a safe integer.");
  return Object.freeze({
    seed,
    room: world.start,
    inventory: Object.freeze([]),
    flags: Object.freeze([]),
    score: 0,
    turn: 0,
    ended: false,
    ending: null,
  });
}

function hasValue(values, value) {
  return values.includes(value);
}

function conditionHolds(condition, state) {
  if (condition.has !== undefined) return hasValue(state.inventory, condition.has);
  if (condition.lacks !== undefined) return !hasValue(state.inventory, condition.lacks);
  if (condition.flag !== undefined) return hasValue(state.flags, condition.flag);
  if (condition.notFlag !== undefined) return !hasValue(state.flags, condition.notFlag);
  throw new Error(`Unknown condition: ${JSON.stringify(condition)}`);
}

export function legalActions(world, state) {
  if (state.ended) return [];
  const room = world.rooms[state.room];
  return room.actions.filter((actionId) => {
    const action = world.actions[actionId];
    return (action.when ?? []).every((condition) => conditionHolds(condition, state));
  });
}

function sorted(set) {
  return [...set].sort();
}

export function step(world, state, actionId) {
  if (state.ended) return { ok: false, state, error: "The game has ended.", event: null };
  const legal = legalActions(world, state);
  if (!legal.includes(actionId)) {
    return { ok: false, state, error: `Action ${JSON.stringify(actionId)} is not legal now.`, event: null };
  }

  const action = world.actions[actionId];
  const inventory = new Set(state.inventory);
  const flags = new Set(state.flags);
  let room = state.room;
  let score = state.score;
  let ending = null;

  for (const effect of action.effects) {
    if (effect.move !== undefined) room = effect.move;
    else if (effect.take !== undefined) inventory.add(effect.take);
    else if (effect.remove !== undefined) inventory.delete(effect.remove);
    else if (effect.flag !== undefined) flags.add(effect.flag);
    else if (effect.unflag !== undefined) flags.delete(effect.unflag);
    else if (effect.score !== undefined) score += effect.score;
    else if (effect.end !== undefined) ending = effect.end;
    else throw new Error(`Unknown effect in ${actionId}: ${JSON.stringify(effect)}`);
  }

  const turn = state.turn + 1;
  if (ending === null && turn >= world.maxTurns) ending = "timeout";

  const next = Object.freeze({
    seed: state.seed,
    room,
    inventory: Object.freeze(sorted(inventory)),
    flags: Object.freeze(sorted(flags)),
    score,
    turn,
    ended: ending !== null,
    ending,
  });
  return { ok: true, state: next, error: null, event: action.text ?? action.label };
}

export function compactView(world, state, sessionId, event = null) {
  const room = world.rooms[state.room];
  const actions = legalActions(world, state).map((id) => [id, world.actions[id].label]);
  const payload = {
    sid: sessionId,
    rev: state.turn,
    at: [state.room, room.title],
    text: room.text,
    turn: [state.turn, world.maxTurns],
    score: state.score,
    ...(state.inventory.length ? { inv: state.inventory } : {}),
    ...(event ? { event } : {}),
    ...(actions.length ? { actions } : {}),
  };
  if (state.ended) {
    const ending = world.endings[state.ending];
    payload.end = [state.ending, ending.title, ending.text];
  }
  return payload;
}

export function createSeededRandom(seed) {
  let value = (Number(seed) | 0) || 1;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 0x100000000;
  };
}
