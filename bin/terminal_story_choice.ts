import type {
  JourneyStoryChoiceOption,
  JourneyStoryChoicePrompt,
  JourneyStoryChoiceSummary,
} from "../src/world/journey_contract.js";
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

function summaryLabels(summary: JourneyStoryChoiceSummary): {
  commitment: "Commitment" | "Purpose";
  trigger: "Field trigger" | "Trigger category";
} {
  return summary.fieldTriggerScope === "category"
    ? { commitment: "Purpose", trigger: "Trigger category" }
    : { commitment: "Commitment", trigger: "Field trigger" };
}

/** Compact comparison for a structured prompt. Full authored consequences remain staged. */
export function renderTerminalStoryChoiceComparison(
  prompt: JourneyStoryChoicePrompt,
  config: Readonly<{ allowComparisonExit?: boolean }> = {},
): string {
  const structured = structuredOptions(prompt);
  if (!structured) {
    throw new Error(`Story choice "${prompt.id}" has no complete structured comparison.`);
  }
  const comparison = compactJourneyStoryChoiceComparison(prompt);
  const lines = [
    "\n! Story choice comparison",
    `  ${comparison.message}`,
    "  Compare the cards, then use one exact command shown below:",
  ];
  comparison.options.forEach((option, index) => {
    if (!option.summary) {
      throw new Error(`Story choice "${prompt.id}" lost a structured comparison summary.`);
    }
    const labels = summaryLabels(option.summary);
    lines.push(`    ${String(index + 1)}. ${option.label}`);
    lines.push(`       ${labels.commitment}: ${option.summary.commitment}`);
    lines.push(`       ${labels.trigger}: ${option.summary.fieldTrigger}`);
    lines.push(
      `       Immediate cost: ${option.summary.immediateCost ?? "No separate immediate cost stated."}`,
    );
    lines.push(`       Inspect: \`inspect ${option.id}\``);
    lines.push(`       Choose: \`choose ${option.id}\``);
  });
  lines.push(
    config.allowComparisonExit
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
  if (projected.summary) {
    const labels = summaryLabels(projected.summary);
    lines.push(`  ${labels.commitment}: ${projected.summary.commitment}`);
    lines.push(`  ${labels.trigger}: ${projected.summary.fieldTrigger}`);
    lines.push(
      `  Immediate cost: ${projected.summary.immediateCost ?? "No separate immediate cost stated."}`,
    );
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
  allowComparisonExit?: boolean;
  onAuxiliary?: (
    line: string,
  ) => TerminalStoryChoiceAuxiliaryResult | Promise<TerminalStoryChoiceAuxiliaryResult>;
}): Promise<TerminalStoryChoiceControllerResult> {
  const options = structuredOptions(args.prompt);
  if (!options) {
    throw new Error(`Story choice "${args.prompt.id}" cannot use the structured controller.`);
  }

  let inspected: StructuredJourneyStoryChoiceOption | null = null;
  args.write(
    renderTerminalStoryChoiceComparison(args.prompt, {
      allowComparisonExit: args.allowComparisonExit === true,
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
        "This story choice is mandatory. Inspect an exact option or choose one; back/cancel cannot dismiss it.",
      );
      continue;
    }

    if (verb === "inspect") {
      const option = matchTerminalStoryChoiceOption(options, selector);
      if (!option) {
        args.reject(
          "Inspect an exact option id, full option label, or number from the comparison.",
        );
        continue;
      }
      inspected = option;
      args.write(renderTerminalStoryChoiceDetail(args.prompt, option));
      continue;
    }

    if (verb === "choose") {
      const option = matchTerminalStoryChoiceOption(options, selector);
      if (!option) {
        args.reject("Choose an exact option id, full option label, or number from the comparison.");
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
        : "Choose the active journey prompt first with an exact `inspect <id>` or `choose <id>` command shown above.",
    );
  }
}
