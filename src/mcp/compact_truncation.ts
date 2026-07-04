export { compactText } from "../core/compact_text.js";

export function compactHead<T>(values: readonly T[], limit: number): T[] {
  const compact: T[] = [];
  for (let index = 0; index < values.length && index < limit; index += 1) {
    compact.push(values[index]!);
  }
  return compact;
}

export function compactRecent<T>(values: readonly T[], limit: number): T[] {
  const compact: T[] = [];
  const start = Math.max(0, values.length - limit);
  for (let index = start; index < values.length; index += 1) compact.push(values[index]!);
  return compact;
}

export function omittedCount<T>(values: readonly T[], compacted: readonly T[]): number | undefined {
  return values.length > compacted.length ? values.length - compacted.length : undefined;
}

export function compactTrailingOmissionCounts(counts: readonly number[]): number[] | undefined {
  let end = counts.length;
  while (end > 0 && counts[end - 1] === 0) end -= 1;
  if (end === 0) return undefined;
  const compact: number[] = [];
  for (let index = 0; index < end; index += 1) compact.push(counts[index]!);
  return compact;
}
