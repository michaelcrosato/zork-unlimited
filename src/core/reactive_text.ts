/**
 * Shared first-match reactive text helpers.
 *
 * Rooms, objects, dialogue nodes, scenes, and endings all use the same rule:
 * scan authored variants in order, use the first whose conditions hold, else
 * fall back to the base string.
 */
import { evalConditions, type Condition } from "./conditions.js";
import type { GameState } from "./state.js";

export type ReactiveVariant = { when: Condition[] };
export type TextVariant = ReactiveVariant & { text: string };
export type NameVariant = ReactiveVariant & { name?: string | undefined };

export function firstMatchingVariant<T extends ReactiveVariant>(
  variants: readonly T[] | undefined,
  state: GameState,
): T | undefined {
  for (const variant of variants ?? []) {
    if (evalConditions(variant.when, state)) return variant;
  }
  return undefined;
}

export function reactiveText(
  base: string,
  variants: readonly TextVariant[] | undefined,
  state: GameState,
): string {
  return firstMatchingVariant(variants, state)?.text ?? base;
}

export function reactiveName(
  base: string,
  variants: readonly NameVariant[] | undefined,
  state: GameState,
): string {
  for (const variant of variants ?? []) {
    if (variant.name !== undefined && evalConditions(variant.when, state)) return variant.name;
  }
  return base;
}
