import type {
  JourneyStoryChoiceOption,
  JourneyStoryChoicePrompt,
  JourneyStoryChoiceSummary,
} from "../src/world/journey_contract.js";
import { journeyStoryChoiceOptionsForPresentation } from "../src/world/journey_contract.js";
import { compactJourneyStoryChoiceComparison } from "../src/mcp/journey_projection.js";

export type TerminalStoryChoiceReader = Readonly<{
  read(prompt: string): Promise<string | null>;
}>;

export type TerminalStoryChoiceAuxiliaryResult = "handled" | "refresh" | "unhandled";

export type TerminalStoryChoiceControllerResult =
  | Readonly<{ kind: "chosen"; option: JourneyStoryChoiceOption }>
  | Readonly<{ kind: "cancelled" | "closed" | "quit" | "refresh" }>;

type StructuredJourneyStoryChoiceOption = JourneyStoryChoiceOption &
  Readonly<{ summary: JourneyStoryChoiceSummary }>;

const REGISTRATION_OPTION_GROUPS = [
  ["doctrine", "Choose a ready-made background"],
  ["custom_role", "Build a custom background"],
] as const;

type GroupedRegistrationOptions = readonly Readonly<{
  label: string;
  options: readonly StructuredJourneyStoryChoiceOption[];
}>[];

function groupedRegistrationOptions(
  prompt: JourneyStoryChoicePrompt,
): GroupedRegistrationOptions | null {
  const options = structuredOptions(prompt);
  if (
    prompt.kind !== "registration" ||
    !options ||
    !options.some((option) => option.group !== undefined)
  ) {
    return null;
  }
  return REGISTRATION_OPTION_GROUPS.map(([group, label]) =>
    Object.freeze({
      label,
      options: Object.freeze(
        options.filter(
          (option) =>
            option.group === group || (group === "custom_role" && option.group === undefined),
        ),
      ),
    }),
  ).filter((group) => group.options.length > 0);
}

function orderedStructuredOptions(
  prompt: JourneyStoryChoicePrompt,
): readonly StructuredJourneyStoryChoiceOption[] | null {
  const options = structuredOptions(prompt);
  if (!options) return null;
  const grouped = groupedRegistrationOptions(prompt);
  return grouped ? grouped.flatMap((group) => group.options) : options;
}

function structuredOptions(
  prompt: JourneyStoryChoicePrompt,
): readonly StructuredJourneyStoryChoiceOption[] | null {
  if (!prompt.options.every((option) => option.summary !== undefined)) return null;
  return prompt.options as readonly StructuredJourneyStoryChoiceOption[];
}

/** Structured setup cards can be compared before any complete consequence is expanded. */
export function isStructuredTerminalStoryChoice(prompt: JourneyStoryChoicePrompt): boolean {
  return structuredOptions(prompt) !== null;
}

export function storyChoiceCommitmentLabel(
  kind: JourneyStoryChoicePrompt["kind"] | undefined,
  readyMadeDispatch = false,
): string {
  if (readyMadeDispatch) return "Ready-made dispatch";
  switch (kind) {
    case "registration":
      return "Background";
    case "relief_oath":
      return "Wolf-Winter promise";
    case "lead_source":
      return "Report";
    case "preparation":
      return "Field kit";
    case "relief_allocation":
      return "Relief wagon";
    case "ally":
      return "Riding choice";
    default:
      return "Promise / priority";
  }
}

function summaryLabels(
  summary: JourneyStoryChoiceSummary,
  kind: JourneyStoryChoicePrompt["kind"],
  readyMadeDispatch = false,
): {
  commitment: string;
  trigger?: "Field trigger" | "Starter package / field edge" | "Trigger category";
} {
  if (summary.fieldTrigger === undefined) {
    return { commitment: storyChoiceCommitmentLabel(kind, readyMadeDispatch) };
  }
  if (summary.fieldTriggerScope === "category") {
    return { commitment: "Purpose", trigger: "Trigger category" };
  }
  return {
    commitment: "Commitment",
    trigger:
      summary.fieldTriggerScope === "starter" ? "Starter package / field edge" : "Field trigger",
  };
}

function renderSummaryLines(
  summary: JourneyStoryChoiceSummary,
  indent: string,
  kind: JourneyStoryChoicePrompt["kind"],
  readyMadeDispatch = false,
): string[] {
  const labels = summaryLabels(summary, kind, readyMadeDispatch);
  if (!labels.trigger || summary.fieldTrigger === undefined) {
    return [
      `${indent}${labels.commitment}: ${summary.commitment}`,
      ...(summary.highlights ?? []).map(
        (highlight) => `${indent}${highlight.label}: ${highlight.value}`,
      ),
      ...(summary.checkFit === undefined ? [] : [`${indent}Check fit: ${summary.checkFit}`]),
      `${indent}Cost / give up: ${summary.immediateCost}; ${summary.tradeoff}`,
    ];
  }
  return [
    `${indent}${labels.commitment}: ${summary.commitment}`,
    `${indent}${labels.trigger}: ${summary.fieldTrigger}`,
    ...(summary.highlights ?? []).map(
      (highlight) => `${indent}${highlight.label}: ${highlight.value}`,
    ),
    ...(summary.checkFit === undefined ? [] : [`${indent}Check fit: ${summary.checkFit}`]),
    `${indent}Immediate cost: ${summary.immediateCost}`,
    `${indent}Tradeoff: ${summary.tradeoff}`,
  ];
}

/** Compact comparison for a structured prompt. Full authored consequences remain staged. */
export function renderTerminalStoryChoiceComparison(
  prompt: JourneyStoryChoicePrompt,
  config: Readonly<{ allowComparisonExit?: boolean; revealId?: string }> = {},
): string {
  const structured = structuredOptions(prompt);
  if (!structured) {
    throw new Error(`Story choice "${prompt.id}" has no complete structured comparison.`);
  }
  const comparison =
    config.revealId === undefined
      ? compactJourneyStoryChoiceComparison(prompt)
      : compactJourneyStoryChoiceComparison(prompt, undefined, config.revealId);
  const visibleOptionIds = new Set(
    journeyStoryChoiceOptionsForPresentation(prompt, config.revealId).map((option) => option.id),
  );
  const visibleComparisonOptions = comparison.options.filter((option) =>
    visibleOptionIds.has(option.id),
  );
  const progressiveDisclosure = prompt.progressiveDisclosure;
  const isRevealFirst =
    progressiveDisclosure !== undefined && progressiveDisclosure.initialOptionIds.length === 0;
  const requiresComparisonFirst = isRevealFirst && config.revealId === undefined;
  const lines = [
    "\n! Story choice comparison",
    `  ${comparison.message}`,
    requiresComparisonFirst
      ? "  Open the read-only outcome compass before choosing a Wolf-Winter promise or ready-made dispatch:"
      : "  Compare the cards, then use one exact command shown below:",
  ];
  const renderOption = (option: (typeof comparison.options)[number], index: number): void => {
    if (!option.summary) {
      throw new Error(`Story choice "${prompt.id}" lost a structured comparison summary.`);
    }
    lines.push(
      isRevealFirst ? `    - ${option.label}` : `    ${String(index + 1)}. ${option.label}`,
    );
    lines.push(
      ...renderSummaryLines(
        option.summary,
        "       ",
        prompt.kind,
        progressiveDisclosure?.initialOptionIds.includes(option.id) === true,
      ),
    );
    lines.push(`       Inspect: \`inspect ${option.id}\``);
    lines.push(`       Choose: \`choose ${option.id}\``);
  };
  if (progressiveDisclosure && config.revealId !== progressiveDisclosure.reveal.id) {
    lines.push(
      requiresComparisonFirst
        ? `  Compare: \`compare\` — ${progressiveDisclosure.reveal.label}. ${progressiveDisclosure.reveal.description}`
        : `  Customize: \`customize\` — ${progressiveDisclosure.reveal.label}. ${progressiveDisclosure.reveal.description}`,
    );
  }
  const grouped = groupedRegistrationOptions(prompt);
  if (grouped) {
    let index = 0;
    for (const group of grouped) {
      lines.push(`  ${group.label}`);
      for (const option of group.options) {
        const comparisonOption = visibleComparisonOptions.find(
          (candidate) => candidate.id === option.id,
        );
        if (!comparisonOption) {
          throw new Error(`Story choice "${prompt.id}" lost option "${option.id}".`);
        }
        renderOption(comparisonOption, index);
        index += 1;
      }
    }
  } else {
    visibleComparisonOptions.forEach(renderOption);
  }
  lines.push(
    requiresComparisonFirst
      ? "  Open the read-only outcome compass with `compare`; no commitment is presented before it."
      : config.allowComparisonExit
        ? "  `back` or `cancel` leaves this optional comparison without changing the journey."
        : "  This choice is mandatory; inspect a card or choose one of the exact options above.",
  );
  return lines.join("\n");
}

/** Expand exactly one authoritative option; no sibling's consequence is disclosed. */
export function renderTerminalStoryChoiceDetail(
  prompt: JourneyStoryChoicePrompt,
  option: JourneyStoryChoiceOption,
): string {
  if (!prompt.options.some((candidate) => candidate.id === option.id)) {
    throw new Error(`Story choice "${prompt.id}" does not offer option "${option.id}".`);
  }
  const projected = compactJourneyStoryChoiceComparison(prompt, option.id).inspectedOption;
  if (!projected) {
    throw new Error(`Story choice "${prompt.id}" could not inspect option "${option.id}".`);
  }
  const lines = [`\n! Story choice detail — ${projected.label}`];
  if (option.summary) {
    if (option.summary.fieldTrigger === undefined) {
      lines.push(
        `  ${storyChoiceCommitmentLabel(
          prompt.kind,
          prompt.progressiveDisclosure?.initialOptionIds.includes(option.id) === true,
        )}: ${option.summary.commitment}`,
      );
      if (option.summary.checkFit !== undefined) {
        lines.push(`  Check fit: ${option.summary.checkFit}`);
      }
    } else {
      lines.push(...renderSummaryLines(option.summary, "  ", prompt.kind));
    }
    if (option.dispatchImpact) lines.push(`  ${option.dispatchImpact.line}`);
    if (option.dispatchForecast) lines.push(`  ${option.dispatchForecast.line}`);
  }
  lines.push(`  Consequence: ${projected.consequence}`);
  lines.push(`  Choose: \`choose ${projected.id}\``);
  lines.push("  Back: `back` (or `cancel`)");
  return lines.join("\n");
}

/** Exact id/full-label matching with a numbered compatibility alias. */
export function matchTerminalStoryChoiceOption<
  Option extends Readonly<{ id: string; label: string }>,
>(options: readonly Option[], raw: string): Option | null {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    const index = Number.parseInt(trimmed, 10) - 1;
    return options[index] ?? null;
  }
  const exact = trimmed.toLowerCase();
  return (
    options.find((option) => option.id.toLowerCase() === exact) ??
    options.find((option) => option.label.toLowerCase() === exact) ??
    null
  );
}

/**
 * Shared staged controller for mandatory structured prompts and optional
 * departure interactions. It owns no game state: only the supplied choose
 * callback may mutate, so inspection, malformed commands, and every back path
 * are mechanically read-only.
 */
export async function runTerminalStoryChoiceController(args: {
  prompt: JourneyStoryChoicePrompt;
  reader: TerminalStoryChoiceReader;
  write: (text: string) => void;
  reject: (message: string) => void;
  choose: (option: JourneyStoryChoiceOption) => void;
  reveal?: (revealId: string) => void;
  presentedOptions?: () => readonly JourneyStoryChoiceOption[];
  allowComparisonExit?: boolean;
  onAuxiliary?: (
    line: string,
  ) => TerminalStoryChoiceAuxiliaryResult | Promise<TerminalStoryChoiceAuxiliaryResult>;
}): Promise<TerminalStoryChoiceControllerResult> {
  const options = orderedStructuredOptions(args.prompt);
  if (!options) {
    throw new Error(`Story choice "${args.prompt.id}" cannot use the structured controller.`);
  }

  let inspected: StructuredJourneyStoryChoiceOption | null = null;
  let revealedStoryChoiceId: string | undefined;
  const progressiveDisclosure = args.prompt.progressiveDisclosure;
  const requiresComparisonFirst = progressiveDisclosure?.initialOptionIds.length === 0;
  const revealCommand = requiresComparisonFirst ? "compare" : "customize";
  const visibleOptions = (): readonly StructuredJourneyStoryChoiceOption[] => {
    const presented =
      args.presentedOptions?.() ??
      journeyStoryChoiceOptionsForPresentation(args.prompt, revealedStoryChoiceId);
    const visibleIds = new Set(presented.map((option) => option.id));
    if (!requiresComparisonFirst) return options.filter((option) => visibleIds.has(option.id));
    return presented.map((option) => options.find((candidate) => candidate.id === option.id)!);
  };
  const visibleOption = (selector: string): StructuredJourneyStoryChoiceOption | null => {
    if (requiresComparisonFirst && /^\d+$/.test(selector.trim())) {
      const canonical = matchTerminalStoryChoiceOption(options, selector);
      return canonical && visibleOptions().some((visible) => visible.id === canonical.id)
        ? canonical
        : null;
    }
    return matchTerminalStoryChoiceOption(visibleOptions(), selector);
  };
  const hiddenOption = (selector: string): StructuredJourneyStoryChoiceOption | null => {
    const option = matchTerminalStoryChoiceOption(options, selector);
    return option && !visibleOptions().some((visible) => visible.id === option.id) ? option : null;
  };
  const activeRevealId = (): string | undefined =>
    progressiveDisclosure &&
    progressiveDisclosure.reveal.optionIds.some((id) =>
      visibleOptions().some((option) => option.id === id),
    )
      ? progressiveDisclosure.reveal.id
      : undefined;
  const initialRevealId = activeRevealId();
  args.write(
    renderTerminalStoryChoiceComparison(args.prompt, {
      allowComparisonExit: args.allowComparisonExit === true,
      ...(initialRevealId === undefined ? {} : { revealId: initialRevealId }),
    }),
  );

  while (true) {
    const raw = await args.reader.read(
      inspected ? `\n[detail: ${inspected.label}] > ` : `\n[choice: ${args.prompt.id}] > `,
    );
    if (raw === null) return { kind: "closed" };
    const line = raw.trim();
    if (line.length === 0) continue;
    const [rawVerb = ""] = line.split(/\s+/, 1);
    const verb = rawVerb.toLowerCase();
    const selector = line.slice(rawVerb.length).trim();

    if (["quit", "q", "exit"].includes(verb) && selector.length === 0) {
      return { kind: "quit" };
    }

    if (["back", "cancel"].includes(verb) && selector.length === 0) {
      if (inspected) {
        inspected = null;
        args.write("Back to the story choice comparison; its exact commands remain in context.");
        continue;
      }
      if (args.allowComparisonExit) return { kind: "cancelled" };
      args.write(
        requiresComparisonFirst && activeRevealId() === undefined
          ? "This story choice is mandatory. Open the read-only outcome compass with `compare`; back/cancel cannot dismiss it."
          : "This story choice is mandatory. Inspect an exact option or choose one; back/cancel cannot dismiss it.",
      );
      continue;
    }

    if (
      (verb === revealCommand || (requiresComparisonFirst && verb === "customize")) &&
      selector.length === 0 &&
      progressiveDisclosure &&
      activeRevealId() !== progressiveDisclosure.reveal.id
    ) {
      if (inspected) {
        args.reject("Use `back` before comparing individual promises.");
        continue;
      }
      args.reveal?.(progressiveDisclosure.reveal.id);
      revealedStoryChoiceId = progressiveDisclosure.reveal.id;
      args.write(
        renderTerminalStoryChoiceComparison(args.prompt, {
          allowComparisonExit: args.allowComparisonExit === true,
          revealId: revealedStoryChoiceId,
        }),
      );
      continue;
    }

    if (verb === "inspect") {
      const option = visibleOption(selector);
      if (!option) {
        if (progressiveDisclosure && hiddenOption(selector)) {
          args.reject(
            requiresComparisonFirst
              ? "Use `compare` to open the outcome compass before inspecting a Wolf-Winter promise or ready-made dispatch."
              : "Use `customize` to reveal the individual promises before inspecting that card.",
          );
          continue;
        }
        args.reject(
          requiresComparisonFirst
            ? "Inspect an exact option id or full option label from the comparison."
            : "Inspect an exact option id, full option label, or number from the comparison.",
        );
        continue;
      }
      inspected = option;
      args.write(renderTerminalStoryChoiceDetail(args.prompt, option));
      continue;
    }

    if (verb === "choose") {
      const option = visibleOption(selector);
      if (!option) {
        if (progressiveDisclosure && hiddenOption(selector)) {
          args.reject(
            requiresComparisonFirst
              ? "Use `compare` to open the outcome compass before choosing a Wolf-Winter promise or ready-made dispatch."
              : "Use `customize` to reveal the individual promises before choosing that card.",
          );
          continue;
        }
        args.reject(
          requiresComparisonFirst
            ? "Choose an exact option id or full option label from the comparison."
            : "Choose an exact option id, full option label, or number from the comparison.",
        );
        continue;
      }
      if (inspected && inspected.id !== option.id) {
        args.reject(
          `This detail is for "${inspected.label}". Use \`choose ${inspected.id}\` or \`back\` before choosing another card.`,
        );
        continue;
      }
      args.choose(option);
      return { kind: "chosen", option };
    }

    const auxiliary = (await args.onAuxiliary?.(line)) ?? "unhandled";
    if (auxiliary === "refresh") return { kind: "refresh" };
    if (auxiliary === "handled") continue;

    args.reject(
      inspected
        ? `Use \`choose ${inspected.id}\`, \`back\`, or an available read-only command.`
        : requiresComparisonFirst && activeRevealId() === undefined
          ? "Open the read-only outcome compass first with `compare`."
          : "Choose the active journey prompt first with an exact `inspect <id>` or `choose <id>` command shown above.",
    );
  }
}
