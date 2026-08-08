#!/usr/bin/env -S npx tsx
/**
 * Counter-metric for the canonical compact opening before the player's first action.
 *
 * The start payload is useful but dense: tutorial, current goal, positional legends,
 * local context, and every immediately available action arrive together. This guard
 * measures that real surface, not a hand-maintained copy, and refuses growth beyond
 * the 2026-08-05 baseline. Reductions pass without re-pinning the ceiling.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createToolApi } from "../src/mcp/tools.js";

export const MAX_OPENING_WORD_TOKENS = 732;
export const MAX_OPENING_ACTIONABLE_OPTIONS = 12;

const ACTION_COLLECTION_KEYS = ["roads", "areas", "poi", "contacts", "events"] as const;

export type OpeningDensity = Readonly<{
  wordTokens: number;
  actionableOptions: number;
  sectionWordTokens: Readonly<{
    tutorial: number;
    goal: number;
    legend: number;
    context: number;
  }>;
}>;

export type OpeningDensityFinding = Readonly<{
  code: "OPENING_WORD_BUDGET_EXCEEDED" | "OPENING_OPTION_BUDGET_EXCEEDED";
  message: string;
}>;

type OpeningPayload = Readonly<{
  tutorial?: unknown;
  journey?: unknown;
  legend?: unknown;
  context?: unknown;
}>;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(collectStrings);
  }
  return [];
}

export function countWordTokens(value: unknown): number {
  return collectStrings(value).reduce(
    (total, text) => total + (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0),
    0,
  );
}

function countActionableOptions(contextValue: unknown): number {
  const context = record(contextValue);
  let count = ACTION_COLLECTION_KEYS.reduce(
    (total, key) => total + (Array.isArray(context[key]) ? context[key].length : 0),
    0,
  );
  const serviceActions = context.service_actions;
  if (Array.isArray(serviceActions)) {
    count += serviceActions.filter(
      (row) => Array.isArray(row) && row.length > 3 && row[3] === true,
    ).length;
  }
  return count;
}

export function measureOpeningDensity(payload: OpeningPayload): OpeningDensity {
  const journey = record(payload.journey);
  const sections = {
    tutorial: payload.tutorial,
    goal: { goal: journey.goal, goalGuidance: journey.goalGuidance },
    legend: payload.legend,
    context: payload.context,
  };
  const sectionWordTokens = {
    tutorial: countWordTokens(sections.tutorial),
    goal: countWordTokens(sections.goal),
    legend: countWordTokens(sections.legend),
    context: countWordTokens(sections.context),
  };
  return {
    wordTokens: Object.values(sectionWordTokens).reduce((total, count) => total + count, 0),
    actionableOptions: countActionableOptions(payload.context),
    sectionWordTokens,
  };
}

export function openingDensityFindings(density: OpeningDensity): OpeningDensityFinding[] {
  const findings: OpeningDensityFinding[] = [];
  if (density.wordTokens > MAX_OPENING_WORD_TOKENS) {
    findings.push({
      code: "OPENING_WORD_BUDGET_EXCEEDED",
      message: `${density.wordTokens} word tokens exceed the ${MAX_OPENING_WORD_TOKENS}-token opening ceiling`,
    });
  }
  if (density.actionableOptions > MAX_OPENING_ACTIONABLE_OPTIONS) {
    findings.push({
      code: "OPENING_OPTION_BUDGET_EXCEEDED",
      message: `${density.actionableOptions} actionable options exceed the ${MAX_OPENING_ACTIONABLE_OPTIONS}-option opening ceiling`,
    });
  }
  return findings;
}

export function measureCanonicalOpening(root: string): OpeningDensity {
  return measureOpeningDensity(createToolApi({ root }).start_overworld());
}

function main(): void {
  const density = measureCanonicalOpening(resolve(process.cwd()));
  const findings = openingDensityFindings(density);
  for (const finding of findings) console.error(`[${finding.code}] ${finding.message}`);
  const sections = density.sectionWordTokens;
  const summary =
    `${density.wordTokens}/${MAX_OPENING_WORD_TOKENS} word tokens ` +
    `(tutorial ${sections.tutorial}, goal ${sections.goal}, legend ${sections.legend}, context ${sections.context}); ` +
    `${density.actionableOptions}/${MAX_OPENING_ACTIONABLE_OPTIONS} actionable options`;
  if (findings.length > 0) {
    console.error(`Opening density FAILED: ${summary}.`);
    process.exitCode = 1;
  } else {
    console.log(`Opening density OK: ${summary}.`);
  }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
