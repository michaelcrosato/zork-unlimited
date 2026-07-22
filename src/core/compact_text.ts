function assertCompactTextLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error("Compact text limit must be a non-negative finite integer.");
  }
}

function scalarSafeSliceEnd(value: string, end: number): number {
  if (end <= 0 || end >= value.length) return end;
  const before = value.charCodeAt(end - 1);
  const after = value.charCodeAt(end);
  const splitsSurrogatePair =
    before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
  return splitsSurrogatePair ? end - 1 : end;
}

export function compactText(value: string, limit: number): string {
  assertCompactTextLimit(limit);
  if (value.length <= limit) return value;
  if (limit <= 0) return "";
  let omitted = value.length;
  for (;;) {
    const suffix = `...(+${omitted} chars)`;
    if (suffix.length >= limit) return suffix.slice(0, limit);
    const headLength = scalarSafeSliceEnd(value, limit - suffix.length);
    const nextOmitted = value.length - headLength;
    if (nextOmitted === omitted) return `${value.slice(0, headLength)}${suffix}`;
    omitted = nextOmitted;
  }
}
