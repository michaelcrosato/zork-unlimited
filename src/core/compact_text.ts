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
