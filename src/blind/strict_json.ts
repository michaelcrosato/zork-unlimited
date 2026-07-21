export type StrictJsonParseResult = { ok: true; value: unknown } | { ok: false; reason: string };

function skipWhitespace(source: string, index: number): number {
  while (index < source.length && /[\t\n\r ]/u.test(source[index]!)) index += 1;
  return index;
}

function scanString(source: string, index: number): { end: number; value: string } {
  if (source[index] !== '"') throw new Error("expected JSON string");
  let cursor = index + 1;
  while (cursor < source.length) {
    if (source[cursor] === "\\") {
      cursor += 2;
      continue;
    }
    if (source[cursor] === '"') {
      const end = cursor + 1;
      return { end, value: JSON.parse(source.slice(index, end)) as string };
    }
    cursor += 1;
  }
  throw new Error("unterminated JSON string");
}

function scanValue(source: string, index: number): number {
  const start = skipWhitespace(source, index);
  if (source[start] === "{") return scanObject(source, start);
  if (source[start] === "[") return scanArray(source, start);
  if (source[start] === '"') return scanString(source, start).end;

  let cursor = start;
  while (cursor < source.length && !/[\t\n\r ,}\]]/u.test(source[cursor]!)) cursor += 1;
  if (cursor === start) throw new Error("expected JSON value");
  return cursor;
}

function scanArray(source: string, index: number): number {
  let cursor = skipWhitespace(source, index + 1);
  if (source[cursor] === "]") return cursor + 1;
  while (cursor < source.length) {
    cursor = scanValue(source, cursor);
    cursor = skipWhitespace(source, cursor);
    if (source[cursor] === "]") return cursor + 1;
    if (source[cursor] !== ",") throw new Error("expected JSON array separator");
    cursor = skipWhitespace(source, cursor + 1);
  }
  throw new Error("unterminated JSON array");
}

function scanObject(source: string, index: number): number {
  const keys = new Set<string>();
  let cursor = skipWhitespace(source, index + 1);
  if (source[cursor] === "}") return cursor + 1;
  while (cursor < source.length) {
    const key = scanString(source, cursor);
    if (keys.has(key.value))
      throw new Error(`duplicate JSON object key ${JSON.stringify(key.value)}`);
    keys.add(key.value);
    cursor = skipWhitespace(source, key.end);
    if (source[cursor] !== ":") throw new Error("expected JSON object colon");
    cursor = scanValue(source, cursor + 1);
    cursor = skipWhitespace(source, cursor);
    if (source[cursor] === "}") return cursor + 1;
    if (source[cursor] !== ",") throw new Error("expected JSON object separator");
    cursor = skipWhitespace(source, cursor + 1);
  }
  throw new Error("unterminated JSON object");
}

/** Parse one JSON value and fail closed when any object contains a duplicate decoded key. */
export function parseJsonRejectingDuplicateKeys(
  text: string,
  label: string,
): StrictJsonParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, reason: `${label} is not valid JSON` };
  }

  try {
    const start = skipWhitespace(text, 0);
    const end = scanValue(text, start);
    if (skipWhitespace(text, end) !== text.length) {
      return { ok: false, reason: `${label} contains trailing JSON content` };
    }
  } catch (error) {
    return {
      ok: false,
      reason: `${label} is ambiguous: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return { ok: true, value };
}
