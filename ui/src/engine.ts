/**
 * Browser engine client (spec §13 Stage 5).
 *
 * The Web UI is a view over the same headless, deterministic RPG core (§3): it
 * never reimplements a rule. This module compiles an RPG pack in the browser
 * (yaml + zod, no Node APIs), indexes it with the RPG runner, and drives the
 * exact `step` reducer the CLI and MCP server use. No engine internals leak
 * beyond the structured observation.
 *
 * It contains no React, so it is unit-tested in Node alongside the rest of the
 * engine — proving the UI talks only to the structured API.
 */
import { makeStep, actionEquals, type Rules } from "../../src/core/engine.js";
import { hashState } from "../../src/core/hash.js";
import type { GameState } from "../../src/core/state.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameEvent } from "../../src/core/events.js";

import { RpgPackSchema } from "../../src/rpg/schema.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
  type RpgIndex,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";

import { parse as parseYaml } from "yaml";

/** Browser-side compile: parse YAML, require RPG shape, validate, and hash. */
function compileRpgSource(source: string) {
  const raw = parseYaml(source);
  if (raw === null || typeof raw !== "object" || !("enemies" in raw)) {
    throw new Error("The Web UI is RPG-only; legacy pack shapes are not playable here.");
  }
  const parsed = RpgPackSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Pack failed RPG schema validation: ${parsed.error.issues[0]?.message ?? "invalid"}`,
    );
  }
  return { pack: parsed.data, contentHash: hashState(parsed.data) };
}

export type Mode = "rpg";

/** A UI-normalized view of the RPG observation. */
export type View = {
  mode: Mode;
  location: string;
  title: string;
  text: string;
  choices: { id: string; label: string }[];
  inventory: string[];
  facts: string[];
  journal: string[];
  ended: boolean;
  endingId: string | null;
  stateHash: string;
};

export type StepOutcome = { ok: boolean; narration: string[]; rejection: string | null };

/** Fast shape predicate for catalog filtering and tests. */
export function isRpgSource(source: string): boolean {
  const raw = parseYaml(source);
  return raw !== null && typeof raw === "object" && "enemies" in raw;
}

/** One playable browser session bound to a compiled RPG pack and a live GameState. */
export class GameSession {
  readonly mode: Mode = "rpg";
  readonly packId: string;
  readonly title: string;
  readonly contentHash: string;
  private readonly rules: Rules<RpgAction>;
  private readonly index: RpgIndex;
  private readonly fresh: () => GameState;
  private state: GameState;

  private constructor(opts: {
    packId: string;
    title: string;
    contentHash: string;
    rules: Rules<RpgAction>;
    index: RpgIndex;
    fresh: () => GameState;
  }) {
    this.packId = opts.packId;
    this.title = opts.title;
    this.contentHash = opts.contentHash;
    this.rules = opts.rules;
    this.index = opts.index;
    this.fresh = opts.fresh;
    this.state = opts.fresh();
  }

  /** Compile an RPG pack source and start a session (throws on schema failure, §10). */
  static start(source: string, seed = 1): GameSession {
    const c = compileRpgSource(source);
    const index = indexRpgPack(c.pack);
    return new GameSession({
      packId: c.pack.meta.id,
      title: c.pack.meta.title,
      contentHash: c.contentHash,
      rules: buildRpgRules(index),
      index,
      fresh: () => initStateForRpgPack(index, seed),
    });
  }

  /** Map a choice id from the current view to its structured Action. */
  private actionFor(id: string): RpgAction | null {
    return enumerateRpgActions(this.index, this.state).find((o) => o.id === id)?.action ?? null;
  }

  /** The current UI view (the only thing a player sees). */
  view(): View {
    const o = buildRpgObservation(this.index, this.state, { includeWorldIntro: true });
    return {
      mode: "rpg",
      location: o.room,
      title: o.title,
      text: o.description,
      choices: o.available_actions.map((a) => ({
        id: a.id,
        label: a.skill_check
          ? `${a.command}  ⟨${a.skill_check.skill} check, DC ${a.skill_check.difficulty}⟩`
          : a.combat
            ? `${a.command}  ⟨one-shot, ATK ${signed(a.combat.attack_bonus)}, DEF ${signed(a.combat.defense_bonus)} this round⟩`
          : a.command,
      })),
      inventory: o.inventory,
      facts: [
        `HP ${o.stats.hp}  ATK ${o.stats.attack}  DEF ${o.stats.defense}`,
        ...o.enemies_present.map((e) => `foe: ${e.name} (HP ${e.hp})`),
        ...o.exits.map((e) => `exit: ${e.direction}`),
        ...o.blocked_exits.map((e) => `blocked: ${e.direction} — ${e.message}`),
      ],
      journal: o.state.journal,
      ended: o.ended,
      endingId: o.ending_id,
      stateHash: hashState(this.state),
    };
  }

  /** Apply a chosen action by id. The legal-action set is ground truth (§9). */
  choose(id: string): StepOutcome {
    const action = this.actionFor(id);
    if (!action || !this.rules.legalActions(this.state).some((a) => actionEquals(a, action))) {
      return { ok: false, narration: [], rejection: "That action is not available." };
    }
    const r = makeStep(this.rules)(this.state, action);
    if (r.ok) this.state = r.state;
    return { ok: r.ok, narration: narrationsOf(r.events), rejection: r.rejectionReason ?? null };
  }

  /**
   * The pack's ending record once the session has ended (null while play
   * continues) — the completion payload the overworld quest bridge needs.
   * Death endings must NOT be completed back into the overworld (the engine
   * rejects them), so callers branch on `death`.
   */
  ending(): { id: string; title: string; death: boolean } | null {
    if (!this.state.ended || !this.state.endingId) return null;
    const ending = this.index.pack.endings.find((e) => e.id === this.state.endingId);
    return ending ? { id: ending.id, title: ending.title, death: ending.death } : null;
  }

  /** Restart from a fresh initial state. */
  reset(): void {
    this.state = this.fresh();
  }
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function narrationsOf(events: GameEvent[]): string[] {
  return events
    .filter((e): e is Extract<GameEvent, { type: "narration" }> => e.type === "narration")
    .map((e) => e.text);
}
