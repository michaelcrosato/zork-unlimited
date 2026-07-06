/**
 * Pull the first parseable balanced JSON value out of a text blob that may wrap it
 * in code fences and/or prose. Pure and keyless — no network, no API keys, no
 * provider coupling. Used to parse a JSON answer out of any model reply (e.g. an
 * agent-authored pack) before a Zod schema validates it, so a malformed completion
 * is a hard error rather than untrusted data flowing onward.
 */

/**
 * Return the balanced `{...}`/`[...]` span that starts at `start`, or `null` if it
 * never closes. String contents (and their escapes) are skipped so a brace or
 * bracket inside a JSON string never miscounts the depth.
 */
function balancedSpan(body: string, start: number, open: "{" | "["): string | null {
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return body.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Try every `{`/`[` in `body` as a JSON start, returning the value of the first
 * candidate whose balanced span `JSON.parse` accepts. Advancing past a failed
 * candidate is what lets a stray bracket in a prose preamble (e.g. `Note [see
 * schema]: {...}`) be skipped in favour of the real object that follows — the
 * original committed to the first bracket and threw if it wasn't valid JSON.
 */
function tryParseFirstJson(
  body: string,
): { ok: true; value: unknown } | { ok: false; err?: unknown } {
  let err: unknown;
  for (let s = 0; s < body.length; s++) {
    const open = body[s]!;
    if (open !== "{" && open !== "[") continue;
    const span = balancedSpan(body, s, open);
    if (span === null) continue;
    try {
      return { ok: true, value: JSON.parse(span) };
    } catch (e) {
      err = e; // not valid JSON from here — fall through to the next opening bracket
    }
  }
  return { ok: false, err };
}

/**
 * Pull the first parseable balanced JSON object/array out of a model reply
 * (tolerates fences and prose). Robust to two off-shape replies a model routinely
 * emits:
 *   1. Reasoning in one code fence and the JSON answer in ANOTHER fence (or
 *      unfenced) — we try every fenced block's body AND the whole reply, not just
 *      the first fence, so the answer is found wherever it sits.
 *   2. A stray `{`/`[` in a prose preamble before the JSON — `tryParseFirstJson`
 *      advances past a candidate that does not `JSON.parse` instead of throwing.
 * Strict superset of the naive behaviour: every reply the previous extractor parsed
 * still parses to the same value. (One honest residual: a preamble bracket region
 * that is ITSELF valid JSON, e.g. `scene[0]`, is still returned first — but the
 * caller's `.strict()` schema rejects it.)
 */
export function extractJson(text: string): unknown {
  // Candidate source texts: each non-empty fenced block's body (a model may fence
  // its reasoning and leave the JSON elsewhere), then the whole reply as a fallback
  // (covers bare and prose-embedded JSON).
  const candidates: string[] = [];
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    const inner = m[1]!.trim();
    if (inner) candidates.push(inner);
  }
  candidates.push(text);

  let lastErr: unknown;
  for (const body of candidates) {
    const parsed = tryParseFirstJson(body);
    if (parsed.ok) return parsed.value;
    if (parsed.err !== undefined) lastErr = parsed.err;
  }
  const suffix = lastErr instanceof Error ? ` (${lastErr.message})` : "";
  throw new Error(`No parseable JSON in model reply: ${text.slice(0, 200)}${suffix}`);
}
