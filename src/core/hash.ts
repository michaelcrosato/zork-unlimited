/**
 * Canonical serialization + state hash (spec §8.6).
 *
 * Two states with identical hashes are identical games. To make this true on any
 * machine and any run, we serialize with object keys SORTED recursively (arrays
 * keep their order, since list order is semantically meaningful — e.g. inventory
 * and the event log). JSON key order, map/set iteration order, etc. must never
 * leak into the hash (§8.5).
 */
import { sha256Hex } from "./sha256.js";

/** Deterministic JSON: object keys sorted; arrays preserved; no whitespace. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortDeep(obj[key]);
    }
    return out;
  }
  return value;
}

/** Full SHA-256 hex of the canonical form — used for save integrity. */
export function hashState(value: unknown): string {
  return sha256Hex(canonicalize(value));
}

/** First 8 hex chars — used in logs and traces (§8.3, §8.6). */
export function shortHash(value: unknown): string {
  return hashState(value).slice(0, 8);
}
