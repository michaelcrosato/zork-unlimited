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

export function compactText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  if (limit <= 0) return "";
  let omitted = value.length;
  for (;;) {
    const suffix = `...(+${omitted} chars)`;
    if (suffix.length >= limit) return suffix.slice(0, limit);
    const headLength = limit - suffix.length;
    const nextOmitted = value.length - headLength;
    if (nextOmitted === omitted) return `${value.slice(0, headLength)}${suffix}`;
    omitted = nextOmitted;
  }
}
