/**
 * Real, provider-agnostic LLM backends (spec §12.7).
 *
 * Each adapter implements the same `Provider.completeJson` contract as the
 * deterministic MockProvider, so any agent role (writer/adapter/playtester/
 * debugger/fixer) can swap a live model for the mock without code changes. The
 * adapters sit behind environment variables and are NEVER reached in tests or CI:
 * `resolveProvider` returns the caller-supplied mock fallback whenever the
 * relevant key is absent (§0, §12.7). No secrets live in the repo — only env var
 * names. The model's reply is parsed as JSON and validated against the requested
 * Zod schema, exactly like the mock, so a malformed completion is a hard error
 * rather than untrusted data flowing onward (§16).
 *
 * These use the global `fetch` (Node 22+). They are intentionally thin: the
 * engine, validator, and schemas — not the model — remain the source of truth.
 */
import type { Provider, CompletionRequest } from "./provider.js";

/** Model ids as of the spec compile date (§12.7). Override via env if needed. */
export const DEFAULT_MODELS = {
  openai: "gpt-5.5",
  anthropic: "claude-opus-4-8",
  google: "gemini-3.5-flash",
} as const;

const JSON_INSTRUCTION =
  "Respond with a single JSON object and nothing else — no prose, no code fences. " +
  "The JSON must conform to the schema the caller named.";

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
 * (tolerates fences and prose). Robust to two off-shape replies a live frontier
 * model routinely emits that the bug_0236/0237 catch-blocks would otherwise have
 * to burn a whole revise round on:
 *   1. Reasoning in one code fence and the JSON answer in ANOTHER fence (or
 *      unfenced) — we try every fenced block's body AND the whole reply, not just
 *      the first fence, so the answer is found wherever it sits.
 *   2. A stray `{`/`[` in a prose preamble before the JSON — `tryParseFirstJson`
 *      advances past a candidate that does not `JSON.parse` instead of throwing.
 * Strict superset of the old behaviour: every reply the previous extractor parsed
 * still parses to the same value. (One honest residual: a preamble bracket region
 * that is ITSELF valid JSON, e.g. `scene[0]`, is still returned first — but that
 * was already true before, and the caller's `.strict()` schema rejects it.)
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

type HttpJson = (
  url: string,
  init: { headers: Record<string, string>; body: unknown },
) => Promise<unknown>;

/** POST JSON and return parsed JSON; thin wrapper so tests can inject a fake. */
const postJson: HttpJson = async (url, init) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...init.headers },
    body: JSON.stringify(init.body),
  });
  if (!res.ok)
    throw new Error(`HTTP ${res.status} from ${url}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
};

function userPrompt<T>(req: CompletionRequest<T>): string {
  return `${req.user}\n\n(Return JSON for schema "${req.schemaName}".)\n${JSON_INSTRUCTION}`;
}

/** OpenAI Chat Completions backend (§12.7). Key: OPENAI_API_KEY. */
export class OpenAIProvider implements Provider {
  readonly name: string;
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.OPENAI_MODEL ?? DEFAULT_MODELS.openai,
    private readonly http: HttpJson = postJson,
  ) {
    this.name = `openai:${model}`;
  }
  async completeJson<T>(req: CompletionRequest<T>): Promise<T> {
    const data = (await this.http("https://api.openai.com/v1/chat/completions", {
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: {
        model: this.model,
        messages: [
          { role: "system", content: `${req.system}\n${JSON_INSTRUCTION}` },
          { role: "user", content: userPrompt(req) },
        ],
        response_format: { type: "json_object" },
      },
    })) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "";
    return req.schema.parse(extractJson(content));
  }
}

/** Anthropic Messages backend (§12.7). Key: ANTHROPIC_API_KEY. */
export class AnthropicProvider implements Provider {
  readonly name: string;
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODELS.anthropic,
    private readonly http: HttpJson = postJson,
  ) {
    this.name = `anthropic:${model}`;
  }
  async completeJson<T>(req: CompletionRequest<T>): Promise<T> {
    const data = (await this.http("https://api.anthropic.com/v1/messages", {
      headers: { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      body: {
        model: this.model,
        max_tokens: 8192,
        system: `${req.system}\n${JSON_INSTRUCTION}`,
        messages: [{ role: "user", content: userPrompt(req) }],
      },
    })) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).map((b) => b.text ?? "").join("");
    return req.schema.parse(extractJson(text));
  }
}

/** Google Gemini generateContent backend (§12.7). Key: GOOGLE_API_KEY / GEMINI_API_KEY. */
export class GoogleProvider implements Provider {
  readonly name: string;
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.GOOGLE_MODEL ?? DEFAULT_MODELS.google,
    private readonly http: HttpJson = postJson,
  ) {
    this.name = `google:${model}`;
  }
  async completeJson<T>(req: CompletionRequest<T>): Promise<T> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const data = (await this.http(url, {
      headers: {},
      body: {
        systemInstruction: { parts: [{ text: `${req.system}\n${JSON_INSTRUCTION}` }] },
        contents: [{ role: "user", parts: [{ text: userPrompt(req) }] }],
        generationConfig: { responseMimeType: "application/json" },
      },
    })) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    return req.schema.parse(extractJson(text));
  }
}

export type ProviderKind = "openai" | "anthropic" | "google" | "mock";

export type ResolveOptions = {
  /** Force a specific backend; otherwise inferred from env (defaults to mock). */
  prefer?: ProviderKind;
  /** The deterministic fallback used whenever the chosen real key is absent (§0). */
  mock: Provider;
  /** Injected for tests; defaults to process.env. */
  env?: NodeJS.ProcessEnv;
};

/**
 * Pick a provider. Real backends are used ONLY when their key is present; with no
 * keys (the CI/test default) the caller's mock is returned, so nothing ever calls
 * the network unattended (§12.7). `prefer` lets a caller pin a backend but still
 * falls back to the mock when that backend's key is missing.
 */
export function resolveProvider(opts: ResolveOptions): Provider {
  const env = opts.env ?? process.env;
  const has = (k: string): string | undefined => {
    const v = env[k];
    return v && v.length > 0 ? v : undefined;
  };
  const openaiKey = has("OPENAI_API_KEY");
  const anthropicKey = has("ANTHROPIC_API_KEY");
  const googleKey = has("GOOGLE_API_KEY") ?? has("GEMINI_API_KEY");

  const wanted = opts.prefer ?? (env.AF_LLM_PROVIDER as ProviderKind | undefined);
  if (wanted === "mock") return opts.mock;
  if (wanted === "openai") return openaiKey ? new OpenAIProvider(openaiKey) : opts.mock;
  if (wanted === "anthropic") return anthropicKey ? new AnthropicProvider(anthropicKey) : opts.mock;
  if (wanted === "google") return googleKey ? new GoogleProvider(googleKey) : opts.mock;

  // No explicit preference: use the first configured key, else the mock.
  if (anthropicKey) return new AnthropicProvider(anthropicKey);
  if (openaiKey) return new OpenAIProvider(openaiKey);
  if (googleKey) return new GoogleProvider(googleKey);
  return opts.mock;
}
