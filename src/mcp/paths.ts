/**
 * Path confinement (spec §9.4, §16 "least privilege").
 *
 * The MCP server must never expose the filesystem outside the project root. All
 * pack/trace paths from a client are resolved against the root and rejected if
 * they escape it.
 */
import { resolve, relative, isAbsolute } from "node:path";

export class PathEscapeError extends Error {}

/** Resolve `p` under `root`, throwing if the result escapes the root. */
export function safeResolve(root: string, p: string): string {
  const rootAbs = resolve(root);
  const abs = isAbsolute(p) ? resolve(p) : resolve(rootAbs, p);
  const rel = relative(rootAbs, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new PathEscapeError(`Path "${p}" escapes the project root.`);
  }
  return abs;
}
