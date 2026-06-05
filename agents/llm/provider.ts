/**
 * Provider-agnostic LLM client (spec §12.7).
 *
 * One interface, many backends. Real providers (OpenAI/Anthropic/Google) live in
 * providers.ts behind env vars and are skipped when keys are absent; each agent
 * role supplies a deterministic keyless mock (e.g. MockAuthorProvider) as the
 * fallback, so every role runs in tests and CI (§0) with no live calls and no API
 * keys. The model's reply is always parsed as JSON and validated against the
 * requested Zod schema, so a malformed completion is a hard error rather than
 * untrusted data flowing onward (§16).
 */
import type { ZodType, ZodTypeDef } from "zod";

export type CompletionRequest<T> = {
  system: string;
  user: string; // JSON-encoded payload for a mock; natural-language for real models
  schemaName: string;
  // The validated OUTPUT type is T; the input is left open so schemas that apply
  // `.default()` (where Zod's input ≠ output type) are accepted — e.g. the CYOA
  // pack schema the adapter emits.
  schema: ZodType<T, ZodTypeDef, unknown>;
};

export interface Provider {
  readonly name: string;
  completeJson<T>(req: CompletionRequest<T>): Promise<T>;
}
