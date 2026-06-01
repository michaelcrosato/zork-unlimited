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

/** Pull the first balanced JSON object/array out of a model reply (tolerates fences/prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? text).trim();
  // Find the first { or [ and the matching close, scanning for balance.
  const start = body.search(/[[{]/);
  if (start < 0) throw new Error(`No JSON found in model reply: ${text.slice(0, 200)}`);
  const open = body[start]!;
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
      if (depth === 0) return JSON.parse(body.slice(start, i + 1));
    }
  }
  throw new Error(`Unbalanced JSON in model reply: ${text.slice(0, 200)}`);
}

type HttpJson = (url: string, init: { headers: Record<string, string>; body: unknown }) => Promise<unknown>;

/** POST JSON and return parsed JSON; thin wrapper so tests can inject a fake. */
const postJson: HttpJson = async (url, init) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...init.headers },
    body: JSON.stringify(init.body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}: ${(await res.text()).slice(0, 300)}`);
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
