/**
 * Parser playtester persona roster (spec §12.8).
 *
 * Eight deterministic play styles that stress different play orders. Each is a
 * pure heuristic over the structured observation's legal-action set — it never
 * sees engine internals, exactly like a real model would (§9). Out-of-order and
 * dropper personas matter most: classic adventures fail when players act outside
 * the designer's expected sequence.
 *
 * These are heuristics, not solvers: most will NOT complete a puzzle chain that
 * needs planning. That is the point — the roster measures coverage and surfaces
 * stuck/ordering issues; it does not certify winnability (the validator and a
 * recorded walkthrough do that).
 */
import type { ParserObservation } from "../src/parser/observation.js";

export type ParserPersona =
  | "mainline"
  | "curious"
  | "hoarder"
  | "dropper"
  | "dialogue_skipper"
  | "wrong_order"
  | "adversarial"
  | "speedrunner";

export const PARSER_PERSONAS: ParserPersona[] = [
  "mainline",
  "curious",
  "hoarder",
  "dropper",
  "dialogue_skipper",
  "wrong_order",
  "adversarial",
  "speedrunner",
];

type Category = "use" | "unlock" | "open" | "take" | "drop" | "move_new" | "move_old" | "talk" | "ask" | "info";

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Category of an option, refining MOVE by whether the destination is unvisited. */
function categoryOf(obs: ParserObservation, opt: ParserObservation["available_actions"][number], visited: Set<string>): Category {
  const a = opt.action;
  switch (a.type) {
    case "USE": return "use";
    case "UNLOCK": return "unlock";
    case "OPEN": return "open";
    case "TAKE": return "take";
    case "DROP": return "drop";
    case "TALK": return "talk";
    case "ASK": return "ask";
    case "MOVE": {
      const to = obs.exits.find((e) => e.direction === a.direction)?.to;
      return to && !visited.has(to) ? "move_new" : "move_old";
    }
    default: return "info"; // LOOK / READ / INSPECT / INVENTORY
  }
}

// Per-persona category weights (higher = preferred). Negative ⇒ never chosen.
const WEIGHTS: Record<ParserPersona, Partial<Record<Category, number>>> = {
  mainline: { use: 100, unlock: 95, open: 90, take: 80, move_new: 70, talk: 40, move_old: 30, info: 5, drop: 1 },
  curious: { info: 100, talk: 95, ask: 95, move_new: 85, open: 60, use: 55, take: 50, move_old: 20, drop: 1 },
  hoarder: { take: 100, open: 90, unlock: 85, move_new: 60, use: 50, move_old: 25, info: 5, talk: 5, drop: -1 },
  dropper: { drop: 100, take: 70, move_new: 60, move_old: 45, open: 50, use: 40, unlock: 40, info: 5, talk: 5 },
  dialogue_skipper: { use: 100, unlock: 95, open: 90, take: 80, move_new: 70, move_old: 30, info: 5, talk: -1, ask: -1 },
  wrong_order: { use: 100, unlock: 100, open: 95, move_new: 90, move_old: 60, take: 50, info: 5, talk: 10 },
  adversarial: {}, // handled specially (probes edges pseudo-randomly)
  speedrunner: { use: 100, unlock: 98, open: 95, take: 90, move_new: 80, move_old: 50, talk: 10, info: 0, drop: -1 },
};

/**
 * Pick one legal action id for a persona. Pure + deterministic given
 * (obs, step, seed, visited). Returns "" only if there are no actions.
 */
export function pickParserAction(persona: ParserPersona, obs: ParserObservation, step: number, seed: number, visited: Set<string>): string {
  const opts = obs.available_actions;
  if (opts.length === 0) return "";
  if (opts.length === 1) return opts[0]!.id;

  // Adversarial probes the parser's edges: a seeded pick across ALL legal actions.
  if (persona === "adversarial") {
    const idx = (hashStr(obs.room) + seed * 31 + step * 7) % opts.length;
    return opts[idx]!.id;
  }

  const w = WEIGHTS[persona];
  let best = -Infinity;
  const tied: number[] = [];
  opts.forEach((opt, i) => {
    const cat = categoryOf(obs, opt, visited);
    const score = w[cat] ?? 0;
    if (score > best) {
      best = score;
      tied.length = 0;
      tied.push(i);
    } else if (score === best) {
      tied.push(i);
    }
  });
  if (best < 0) {
    // Every option is forbidden (e.g. dialogue_skipper cornered into ask-only):
    // fall back to the first option so the run still terminates honestly.
    return opts[0]!.id;
  }
  // wrong_order rotates among ties to vary its out-of-order probing; others are
  // stable (first wins) for reproducibility.
  if (persona === "wrong_order" && tied.length > 1) {
    return opts[tied[(seed + step) % tied.length]!]!.id;
  }
  return opts[tied[0]!]!.id;
}
