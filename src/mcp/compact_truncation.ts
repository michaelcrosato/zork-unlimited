import { compactText } from "../core/compact_text.js";
import { sha256Hex } from "../core/sha256.js";

export { compactText };

function assertCompactListLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error("Compact list limit must be a non-negative finite integer.");
  }
}

function assertCompactOmissionCount(count: number): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("Compact omission count must be a non-negative finite integer.");
  }
}

function assertCompactTextLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error("Compact text limit must be a non-negative finite integer.");
  }
}

function assertCompactHashLength(length: number): void {
  if (!Number.isInteger(length) || length < 1) {
    throw new Error("Compact hash length must be a positive finite integer.");
  }
}

export function compactHead<T>(values: readonly T[], limit: number): T[] {
  assertCompactListLimit(limit);
  const compact: T[] = [];
  for (let index = 0; index < values.length && index < limit; index += 1) {
    compact.push(values[index]!);
  }
  return compact;
}

export function compactRecent<T>(values: readonly T[], limit: number): T[] {
  assertCompactListLimit(limit);
  const compact: T[] = [];
  const start = Math.max(0, values.length - limit);
  for (let index = start; index < values.length; index += 1) compact.push(values[index]!);
  return compact;
}

export function omittedCount<T>(values: readonly T[], compacted: readonly T[]): number | undefined {
  return values.length > compacted.length ? values.length - compacted.length : undefined;
}

export function compactTrailingOmissionCounts(counts: readonly number[]): number[] | undefined {
  for (const count of counts) assertCompactOmissionCount(count);

  let end = counts.length;
  while (end > 0 && counts[end - 1] === 0) end -= 1;
  if (end === 0) return undefined;
  const compact: number[] = [];
  for (let index = 0; index < end; index += 1) compact.push(counts[index]!);
  return compact;
}

export function compactTextWithHash(value: string, limit: number, hashLength: number): string {
  assertCompactTextLimit(limit);
  assertCompactHashLength(hashLength);
  if (value.length <= limit) return value;
  if (limit <= 0) return "";
  const suffix = `#${sha256Hex(value).slice(0, hashLength)}`;
  if (suffix.length >= limit) return suffix.slice(0, limit);
  return `${compactText(value, limit - suffix.length)}${suffix}`;
}
