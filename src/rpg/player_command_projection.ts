import type { GameState } from "../core/state.js";
import {
  normalizeRpgCommand,
  normalizeRpgTopicCommand,
  parseQualifiedRpgAskCommand,
} from "./command_normalization.js";
import type { RpgActionOption, RpgBlockedActionOption } from "./legal_actions.js";
import { objectName, type RpgModelIndex } from "./model.js";

export { normalizeRpgTopicCommand } from "./command_normalization.js";

export type RpgPlayerCommand = {
  option: RpgActionOption;
  command: string;
  aliases: string[];
  description?: string;
};

export type RpgPlayerCommandResolution =
  | { kind: "resolved"; option: RpgActionOption }
  | { kind: "ambiguous"; reason: string }
  | { kind: "unmatched" };

export type RpgPlayerCommandContext = {
  index: RpgModelIndex;
  state: GameState;
};

// The interactive RPG loops consume these before command resolution. Never
// advertise one as an authored action: a stable choose-id fallback remains
// executable in both standalone and embedded play.
const RPG_LOOP_CONTROL_COMMANDS = new Set(["actions", "help", "?", "quit", "q", "exit", "abandon"]);

function normalizeObjectSelector(value: string): string {
  return normalizeRpgCommand(value).replace(/^(?:the|a|an)\s+/, "");
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function dialogueInputs(option: RpgActionOption): string[] {
  if (option.action.type !== "ASK") return [];
  return unique([
    normalizeRpgTopicCommand(option.action.topic),
    ...(option.inputAliases ?? []).map(normalizeRpgTopicCommand),
  ]);
}

function fallbackActionInput(option: RpgActionOption): string {
  return `choose ${option.id}`;
}

function contextualWearOptions(
  options: readonly RpgActionOption[],
  raw: string,
  context: RpgPlayerCommandContext | undefined,
): RpgActionOption[] {
  if (!context) return [];
  const match = normalizeRpgCommand(raw).match(/^wear\s+(.+)$/);
  if (!match) return [];
  const selector = normalizeObjectSelector(match[1]!);
  if (!selector) return [];

  return options.filter((option) => {
    const action = option.action;
    if (
      action.type !== "USE" ||
      action.item === undefined ||
      action.item !== action.target ||
      normalizeRpgCommand(option.command).split(" ", 1)[0] !== "don"
    ) {
      return false;
    }
    const object = context.index.objects.get(action.item);
    if (!object) return false;
    const names = unique([
      object.id,
      object.name,
      objectName(object, context.state),
      ...object.aliases,
    ]).map(normalizeObjectSelector);
    return names.includes(selector);
  });
}

function matchingOptions(
  options: readonly RpgActionOption[],
  raw: string,
  context?: RpgPlayerCommandContext,
): RpgActionOption[] {
  const command = normalizeRpgCommand(raw);
  const topic = normalizeRpgTopicCommand(raw);
  // `choose <action-id>` is the reserved disambiguation form. Prefer it before
  // authored command text so a pack cannot make the fallback ambiguous by
  // coincidentally naming an ordinary action the same way.
  const fallbacks = options.filter(
    (option) => normalizeRpgCommand(fallbackActionInput(option)) === command,
  );
  if (fallbacks.length > 0) return fallbacks;
  const qualifiedAsk = parseQualifiedRpgAskCommand(raw) !== null;
  const advertised = options.filter((option) => {
    if (option.action.type !== "ASK") return normalizeRpgCommand(option.command) === command;
    // A grammar-shaped alias must never bypass visible-speaker validation in
    // command_map. Leave every qualified ASK unmatched here so it reaches that
    // parser before an authored topic alias can resolve it.
    if (qualifiedAsk) return false;
    return dialogueInputs(option).includes(topic);
  });
  const matches = [...advertised, ...contextualWearOptions(options, raw, context)];
  return unique(matches.map((option) => option.id)).map(
    (id) => matches.find((option) => option.id === id)!,
  );
}

/** Resolve exact projected inputs plus narrowly-scoped contextual aliases.
 * Colliding topic/object aliases deliberately fail closed instead of selecting
 * the first legal row. */
export function resolveRpgPlayerCommand(
  options: readonly RpgActionOption[],
  raw: string,
  context?: RpgPlayerCommandContext,
): RpgPlayerCommandResolution {
  const matches = matchingOptions(options, raw, context);
  if (matches.length === 0) return { kind: "unmatched" };
  if (matches.length === 1) return { kind: "resolved", option: matches[0]! };
  return {
    kind: "ambiguous",
    reason: `"${raw.trim()}" matches more than one current action. Use an exact command from \`actions\`.`,
  };
}

/** Build a list-aware terminal projection. Dialogue prose remains descriptive;
 * only exact, unambiguous inputs are printed as commands. When topic aliases
 * collide with each other or an ordinary command, the stable action id supplies
 * a fail-closed `choose ...` fallback for every affected row. */
export function projectRpgPlayerCommands(
  options: readonly RpgActionOption[],
  context?: RpgPlayerCommandContext,
): RpgPlayerCommand[] {
  return options.map((option) => {
    const inputs = option.action.type === "ASK" ? dialogueInputs(option) : [option.command];
    const unambiguous = inputs.filter((candidate) => {
      if (RPG_LOOP_CONTROL_COMMANDS.has(normalizeRpgCommand(candidate))) return false;
      const resolution = resolveRpgPlayerCommand(options, candidate, context);
      return resolution.kind === "resolved" && resolution.option.id === option.id;
    });
    const command = unambiguous[0] ?? fallbackActionInput(option);
    return {
      option,
      command,
      aliases: option.action.type === "ASK" ? unambiguous.slice(1) : [],
      ...(option.action.type === "ASK"
        ? { description: option.command.replace(/^ask:\s*/i, "").trim() }
        : command === option.command
          ? {}
          : { description: option.command }),
    };
  });
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

/** Render one projected command while keeping prose and tactical annotations
 * visibly separate from the exact executable input. */
export function renderRpgPlayerCommand(projection: RpgPlayerCommand): string {
  const { option } = projection;
  const aliases = projection.aliases.length ? ` (also: ${projection.aliases.join(", ")})` : "";
  const description = projection.description ? ` — ${projection.description}` : "";
  if (!option.combat) return `${projection.command}${aliases}${description}`;
  const phase =
    option.combat.phase === "opening"
      ? "opening"
      : option.combat.phase === "follow_through"
        ? "follow-through"
        : "one-shot";
  return `${projection.command}${aliases} [${phase}; ATK ${signed(option.combat.attack_bonus)}, DEF ${signed(option.combat.defense_bonus)} this round]${description}`;
}

/** Render the complete terminal action menu. Both standalone RPG play and the
 * overworld quest handoff call this exact function. */
export function renderRpgPlayerActionHelp(
  options: readonly RpgActionOption[],
  blocked: readonly RpgBlockedActionOption[] = [],
  context?: RpgPlayerCommandContext,
): string {
  const available = projectRpgPlayerCommands(options, context).map(
    (projection) => `  ${renderRpgPlayerCommand(projection)}`,
  );
  const unavailable = blocked.map(
    (option) => `  Unavailable: ${option.command} — ${option.reason}`,
  );
  return ["You can:", ...available, ...unavailable].join("\n");
}
