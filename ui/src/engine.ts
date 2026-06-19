/**
 * Browser engine client (spec §13 Stage 5).
 *
 * The Web UI is a VIEW over the same headless, deterministic core (§3): it never
 * reimplements a rule. This module compiles a pack in the browser (yaml + zod —
 * no Node APIs; the state hash is the pure SHA-256 in core/sha256.ts) and drives
 * the exact `step` reducer the CLI and MCP server use. It exposes one unified
 * session for all three content modes (CYOA / parser / RPG), normalizing each
 * mode's observation into what a UI needs: text, a list of choices, and the
 * resulting events. No engine internals leak beyond the structured observation.
 *
 * It contains NO React, so it is unit-tested in Node alongside the rest of the
 * engine — proving the UI talks only to the structured API.
 */
import { makeStep, actionEquals, type Rules } from "../../src/core/engine.js";
import { hashState } from "../../src/core/hash.js";
import type { GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";
import type { GameEvent } from "../../src/core/events.js";

import { CyoaPackSchema } from "../../src/cyoa/schema.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";

import { ParserPackSchema } from "../../src/parser/schema.js";
import { indexParserPack, buildParserRules, initStateForParserPack } from "../../src/parser/runner.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";

import { RpgPackSchema } from "../../src/rpg/schema.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack, enumerateRpgActions } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";

import type { ZodType, ZodTypeDef } from "zod";
import { parse as parseYaml } from "yaml";

/**
 * Browser-side compile: parse YAML, validate against the mode schema (the same
 * contract the CLI uses), and stamp the pure content hash. Inlined here so the UI
 * never imports the Node file-loaders (which pull in `node:fs`); the schema, not
 * this code, decides what is valid (§7, §16).
 */
function compileSource<T>(schema: ZodType<T, ZodTypeDef, unknown>, source: string): { pack: T; contentHash: string } {
  const parsed = schema.safeParse(parseYaml(source));
  if (!parsed.success) throw new Error(`Pack failed schema validation: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  return { pack: parsed.data, contentHash: hashState(parsed.data) };
}

export type Mode = "cyoa" | "parser" | "rpg";

/** A UI-normalized view of any mode's observation. */
export type View = {
  mode: Mode;
  location: string;
  title: string;
  text: string;
  choices: { id: string; label: string }[];
  inventory: string[];
  facts: string[]; // visible flags / vital stats / enemies, mode-appropriate
  journal: string[];
  ended: boolean;
  endingId: string | null;
  stateHash: string;
};

export type StepOutcome = { ok: boolean; narration: string[]; rejection: string | null };

/** Detect a pack's mode from its top-level shape (same rule as the CLIs). */
export function detectMode(source: string): Mode {
  const raw = parseYaml(source) as Record<string, unknown> | null;
  if (raw && typeof raw === "object" && "enemies" in raw) return "rpg";
  if (raw && typeof raw === "object" && "rooms" in raw) return "parser";
  return "cyoa";
}

/** One playable session bound to a compiled pack and a live GameState. */
export class GameSession {
  readonly mode: Mode;
  readonly packId: string;
  readonly title: string;
  readonly contentHash: string;
  private readonly rules: Rules;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly index: any;
  private readonly fresh: () => GameState;
  private state: GameState;

  private constructor(opts: {
    mode: Mode;
    packId: string;
    title: string;
    contentHash: string;
    rules: Rules;
    index: unknown;
    fresh: () => GameState;
  }) {
    this.mode = opts.mode;
    this.packId = opts.packId;
    this.title = opts.title;
    this.contentHash = opts.contentHash;
    this.rules = opts.rules;
    this.index = opts.index;
    this.fresh = opts.fresh;
    this.state = opts.fresh();
  }

  /** Compile a pack source and start a session (throws on schema failure, §10). */
  static start(source: string, seed = 1): GameSession {
    const mode = detectMode(source);
    if (mode === "cyoa") {
      const c = compileSource(CyoaPackSchema, source);
      const index = indexPack(c.pack);
      return new GameSession({
        mode,
        packId: c.pack.meta.id,
        title: c.pack.meta.title,
        contentHash: c.contentHash,
        rules: buildRules(index),
        index,
        fresh: () => initStateForPack(index, seed),
      });
    }
    if (mode === "parser") {
      const c = compileSource(ParserPackSchema, source);
      const index = indexParserPack(c.pack);
      return new GameSession({
        mode,
        packId: c.pack.meta.id,
        title: c.pack.meta.title,
        contentHash: c.contentHash,
        rules: buildParserRules(index),
        index,
        fresh: () => initStateForParserPack(index, seed),
      });
    }
    const c = compileSource(RpgPackSchema, source);
    const index = indexRpgPack(c.pack);
    return new GameSession({
      mode,
      packId: c.pack.meta.id,
      title: c.pack.meta.title,
      contentHash: c.contentHash,
      rules: buildRpgRules(index),
      index,
      fresh: () => initStateForRpgPack(index, seed),
    });
  }

  /** Map a choice id (from the current view) to its structured Action. */
  private actionFor(id: string): Action | null {
    if (this.mode === "cyoa") return { type: "CHOOSE", choiceId: id };
    const options = this.mode === "rpg" ? enumerateRpgActions(this.index, this.state) : enumerateActions(this.index, this.state);
    return options.find((o) => o.id === id)?.action ?? null;
  }

  /** The current UI view (the only thing a player sees). */
  view(): View {
    if (this.mode === "cyoa") {
      const o = buildObservation(this.index, this.state, { includeWorldIntro: true });
      return {
        mode: "cyoa",
        location: o.scene_id,
        title: o.title,
        text: o.text,
        // A skill-checked choice shows the stat it rolls and the difficulty (bug_0269),
        // so the displayed skill var no longer reads as a vestigial number; a plain
        // choice keeps its bare label.
        choices: o.available_actions.map((a) => ({
          id: a.id,
          label: a.skill_check
            ? `${a.text}  ⟨${a.skill_check.skill} check, DC ${a.skill_check.difficulty}⟩`
            : a.text,
        })),
        inventory: o.state.inventory,
        facts: o.state.flags,
        journal: o.state.journal,
        ended: o.ended,
        endingId: o.ending_id,
        stateHash: hashState(this.state),
      };
    }
    if (this.mode === "parser") {
      const o = buildParserObservation(this.index, this.state, { includeWorldIntro: true });
      return {
        mode: "parser",
        location: o.room,
        title: o.title,
        text: o.dialogue ? `${o.description}\n\n${o.dialogue.npc}: "${o.dialogue.npc_text}"` : o.description,
        // A skill-checked command shows the stat it rolls and the difficulty (bug_0274,
        // the parser/RPG sibling of the CYOA bug_0269), so the displayed skill var no
        // longer reads as a vestigial number; a plain command keeps its bare label.
        choices: o.available_actions.map((a) => ({
          id: a.id,
          label: a.skill_check
            ? `${a.command}  ⟨${a.skill_check.skill} check, DC ${a.skill_check.difficulty}⟩`
            : a.command,
        })),
        inventory: o.inventory,
        facts: [
          ...o.exits.map((e) => `exit: ${e.direction}`),
          // Blocked-exit hints (bug_0201): a barred way exists here and why — parity with
          // the agent observation and the CLIs, so the human UI player can tell a
          // gated-but-present exit from a non-existent one (how to clear it stays hidden).
          ...o.blocked_exits.map((e) => `blocked: ${e.direction} — ${e.message}`),
          ...o.visible_objects.map((v) => `here: ${v.name}`),
        ],
        journal: o.state.journal,
        ended: o.ended,
        endingId: o.ending_id,
        stateHash: hashState(this.state),
      };
    }
    const o = buildRpgObservation(this.index, this.state, { includeWorldIntro: true });
    return {
      mode: "rpg",
      location: o.room,
      title: o.title,
      text: o.description,
      // Skill-checked commands carry their stat + DC here too (bug_0274).
      choices: o.available_actions.map((a) => ({
        id: a.id,
        label: a.skill_check
          ? `${a.command}  ⟨${a.skill_check.skill} check, DC ${a.skill_check.difficulty}⟩`
          : a.command,
      })),
      inventory: o.inventory,
      facts: [
        `HP ${o.stats.hp}  ATK ${o.stats.attack}  DEF ${o.stats.defense}`,
        ...o.enemies_present.map((e) => `foe: ${e.name} (HP ${e.hp})`),
        ...o.exits.map((e) => `exit: ${e.direction}`),
        // Blocked-exit hints (bug_0201): the RPG UI surface gets the same barred-way cue.
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

  /** Restart from a fresh initial state. */
  reset(): void {
    this.state = this.fresh();
  }
}

function narrationsOf(events: GameEvent[]): string[] {
  return events.filter((e): e is Extract<GameEvent, { type: "narration" }> => e.type === "narration").map((e) => e.text);
}
