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
  CampaignCharacterImportsSchema,
  type CampaignCharacterImports,
} from "../../src/rpg/campaign_character_import.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
  type RpgIndex,
} from "../../src/rpg/runner.js";
import { rpgActionOptionForInputId } from "../../src/rpg/legal_actions.js";
import {
  parseCampaignCharacterState,
  type CampaignCharacterState,
} from "../../src/world/campaign_character_state.js";
import {
  buildRpgObservation,
  type RpgObservation,
} from "../../src/rpg/observation.js";
import {
  buildEmbeddedQuestCharacterContinuity,
  projectEmbeddedQuestCharacterContinuity,
  type EmbeddedQuestCharacterContinuity,
} from "../../src/rpg/embedded_quest_character_continuity.js";
import {
  classifyRpgJourneyDecision,
  excludedJourneyDecision,
} from "../../src/world/journey_decision.js";
import type { JourneyDecisionClassification } from "../../src/world/journey_contract.js";

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
  unavailableChoices: { id: string; label: string; reason: string }[];
  inventory: string[];
  pressureTracks?: NonNullable<RpgObservation["pressure_tracks"]>;
  facts: string[];
  journal: string[];
  ended: boolean;
  endingId: string | null;
  stateHash: string;
  characterContinuity?: EmbeddedQuestCharacterContinuity;
};

export type StepOutcome = {
  ok: boolean;
  narration: string[];
  rejection: string | null;
  journeyDecision: JourneyDecisionClassification;
  journeyActionId: string | null;
};

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
  private readonly characterContinuity: EmbeddedQuestCharacterContinuity | undefined;
  private state: GameState;

  private constructor(opts: {
    packId: string;
    title: string;
    contentHash: string;
    rules: Rules<RpgAction>;
    index: RpgIndex;
    fresh: () => GameState;
    campaignCharacter?: CampaignCharacterState;
  }) {
    this.packId = opts.packId;
    this.title = opts.title;
    this.contentHash = opts.contentHash;
    this.rules = opts.rules;
    this.index = opts.index;
    this.fresh = opts.fresh;
    this.state = opts.fresh();
    this.characterContinuity = opts.campaignCharacter
      ? buildEmbeddedQuestCharacterContinuity({
          character: opts.campaignCharacter,
          pack: opts.index.pack,
          state: this.state,
        })
      : undefined;
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

  /**
   * Start a quest from a live overworld character using only the import catalog
   * authored on that trusted quest. Standalone `start` deliberately has no such
   * input surface.
   */
  static startEmbedded(
    source: string,
    character: CampaignCharacterState,
    imports: CampaignCharacterImports | undefined,
    seed = 1,
  ): GameSession {
    const c = compileRpgSource(source);
    const index = indexRpgPack(c.pack);
    const characterSnapshot = parseCampaignCharacterState(character);
    const importsSnapshot =
      imports === undefined ? undefined : CampaignCharacterImportsSchema.parse(imports);
    return new GameSession({
      packId: c.pack.meta.id,
      title: c.pack.meta.title,
      contentHash: c.contentHash,
      rules: buildRpgRules(index),
      index,
      fresh: () =>
        importsSnapshot === undefined
          ? initStateForRpgPack(index, seed)
          : initStateForRpgPack(index, seed, {
              character: characterSnapshot,
              imports: importsSnapshot,
            }),
      campaignCharacter: characterSnapshot,
    });
  }

  /** Map a choice id from the current view to its structured Action. */
  private actionFor(id: string): ReturnType<typeof enumerateRpgActions>[number] | null {
    return rpgActionOptionForInputId(enumerateRpgActions(this.index, this.state), id);
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
            ? `${a.command}  ⟨${a.combat.phase === "opening" ? "opening" : a.combat.phase === "follow_through" ? "follow-through" : "one-shot"}, ATK ${signed(a.combat.attack_bonus)}, DEF ${signed(a.combat.defense_bonus)} this round${resourceHint(a.resources)}⟩`
          : a.command,
      })),
      unavailableChoices: o.blocked_actions.map((action) => ({
        id: action.id,
        label: action.command,
        reason: action.reason,
      })),
      inventory: o.inventory,
      ...(o.pressure_tracks ? { pressureTracks: o.pressure_tracks } : {}),
      facts: [
        `HP ${o.stats.hp}  ATK ${o.stats.attack}  DEF ${o.stats.defense}`,
        ...(o.pressure_tracks ?? []).map(pressureFact),
        ...o.enemies_present.map((e) => `foe: ${e.name} (HP ${e.hp})`),
        ...o.exits.map((e) => `exit: ${e.direction}`),
        ...o.blocked_exits.map((e) => `blocked: ${e.direction} — ${e.message}`),
      ],
      journal: o.state.journal,
      ended: o.ended,
      endingId: o.ending_id,
      stateHash: hashState(this.state),
      ...(this.characterContinuity
        ? {
            characterContinuity: projectEmbeddedQuestCharacterContinuity({
              continuity: this.characterContinuity,
              pack: this.index.pack,
              state: this.state,
            }),
          }
        : {}),
    };
  }

  /** Apply a chosen action by id. The legal-action set is ground truth (§9). */
  choose(id: string): StepOutcome {
    const option = this.actionFor(id);
    const blocked = option
      ? null
      : buildRpgObservation(this.index, this.state).blocked_actions.find(
          (action) => action.id === id,
        );
    if (
      !option ||
      !this.rules.legalActions(this.state).some((action) => actionEquals(action, option.action))
    ) {
      return {
        ok: false,
        narration: [],
        rejection: blocked?.reason ?? "That action is not available.",
        journeyDecision: excludedJourneyDecision("rejected"),
        journeyActionId: null,
      };
    }
    const before = this.state;
    const r = makeStep(this.rules)(this.state, option.action);
    if (r.ok) this.state = r.state;
    return {
      ok: r.ok,
      narration: narrationsOf(r.events),
      rejection: r.rejectionReason ?? null,
      journeyDecision: classifyRpgJourneyDecision({
        action: option.action,
        before,
        after: r.state,
        events: r.events,
        accepted: r.ok,
        isSkillCheck: option.skill_check !== undefined,
      }),
      journeyActionId: option.id,
    };
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

function pressureFact(track: NonNullable<RpgObservation["pressure_tracks"]>[number]): string {
  const next = track.next
    ? `; next ${track.next.label} at ${track.next.min}`
    : "; highest band";
  const description = track.band.description ? ` — ${track.band.description}` : "";
  return `pressure: ${track.title} — ${track.band.label} (${track.value}${next})${description}`;
}

function resourceHint(resources: { gains: string[]; costs: string[] } | undefined): string {
  if (!resources) return "";
  const readable = (id: string): string => id.replaceAll("_", " ");
  const changes = [
    ...resources.gains.map((id) => `gain ${readable(id)}`),
    ...resources.costs.map((id) => `spend ${readable(id)}`),
  ];
  return changes.length > 0 ? `, ${changes.join(", ")}` : "";
}

function narrationsOf(events: GameEvent[]): string[] {
  return events
    .filter((e): e is Extract<GameEvent, { type: "narration" }> => e.type === "narration")
    .map((e) => e.text);
}
