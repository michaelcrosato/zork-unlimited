/**
 * LLM client interface for the authoring agents (writer/adapter).
 *
 * One interface; the sole implementation is a deterministic, keyless mock
 * (MockAuthorProvider), so every role runs in tests and CI with no live calls and
 * no API keys. (Live third-party LLM backends behind API keys were removed — this
 * is a public repo with a pure, no-runtime-LLM engine.) A completion is always
 * validated against the requested Zod schema, so malformed output is a hard error
 * rather than untrusted data flowing onward.
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
