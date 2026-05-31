/**
 * Provider-agnostic LLM client (spec §12.7).
 *
 * One interface, many backends. The DEFAULT is a deterministic MockProvider that
 * returns schema-valid JSON with no live calls and no API keys — so every agent
 * role runs in tests and CI (§0). Real providers (OpenAI/Anthropic/Google) sit
 * behind env vars and are skipped when keys are absent; they implement the same
 * `completeJson` and would send system+user to the model.
 *
 * For the playtester the MockProvider genuinely "plays": it consumes the
 * structured observation in the prompt and returns a chosen action per a
 * persona heuristic. It never sees engine internals — only the observation,
 * exactly like a real model would (§9).
 */
import { z, type ZodType } from "zod";
import type { CyoaObservation } from "../../src/cyoa/observation.js";

export type CompletionRequest<T> = {
  system: string;
  user: string; // JSON-encoded payload for the mock; natural-language for real models
  schemaName: string;
  schema: ZodType<T>;
};

export interface Provider {
  readonly name: string;
  completeJson<T>(req: CompletionRequest<T>): Promise<T>;
}

export const PlaytesterDecisionSchema = z
  .object({
    action_id: z.string(),
    reason: z.string(),
    expected_result: z.string(),
  })
  .strict();
export type PlaytesterDecision = z.infer<typeof PlaytesterDecisionSchema>;

/** Personas — distinct, deterministic play styles (a CYOA flavor of §12.8). */
export type Persona = "mainline" | "curious" | "contrarian" | "explorer" | "seeded";
export const PERSONAS: Persona[] = ["mainline", "curious", "contrarian", "explorer", "seeded"];

const CURIOSITY = /inspect|look|search|examine|read|ask|take|open|talk|show/i;

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pick a legal action id per persona. Pure + deterministic. */
export function pickAction(persona: Persona, obs: CyoaObservation, step: number, seed: number): string {
  const actions = obs.available_actions;
  const ids = actions.map((a) => a.id);
  if (ids.length <= 1) return ids[0] ?? "";
  switch (persona) {
    case "mainline":
      return ids[0]!;
    case "contrarian":
      return ids[ids.length - 1]!;
    case "curious":
      return actions.find((a) => CURIOSITY.test(`${a.id} ${a.text}`))?.id ?? ids[0]!;
    case "explorer":
      return ids[step % ids.length]!;
    case "seeded":
      return ids[(hashStr(obs.scene_id) + seed + step) % ids.length]!;
  }
}

export class MockProvider implements Provider {
  readonly name: string;
  constructor(
    private readonly persona: Persona,
    private readonly seed = 0,
  ) {
    this.name = `mock:${persona}`;
  }

  async completeJson<T>(req: CompletionRequest<T>): Promise<T> {
    const payload = JSON.parse(req.user) as { observation: CyoaObservation; step: number };
    const obs = payload.observation;
    const actionId = pickAction(this.persona, obs, payload.step, this.seed);
    const chosen = obs.available_actions.find((a) => a.id === actionId);
    const decision: PlaytesterDecision = {
      action_id: actionId,
      reason: `persona "${this.persona}" chose "${chosen?.text ?? actionId}".`,
      expected_result: "make progress and reveal the next scene",
    };
    // Validate against the requested schema, exactly as a real provider's output would be.
    return req.schema.parse(decision);
  }
}
