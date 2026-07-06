/**
 * Path confinement (spec §9.4, §16 "least privilege").
 *
 * The MCP server must never expose the filesystem outside the project root. All
 * pack/trace paths from a client are resolved against the root and rejected if
 * they escape it.
 */
import { existsSync, realpathSync } from "node:fs";
import { resolve, relative, isAbsolute, dirname } from "node:path";

export class PathEscapeError extends Error {}

function canonical(p: string): string {
  // realpathSync.native resolves Windows junctions/8.3 names the way the OS
  // does; fall back for platforms without it.
  return (realpathSync.native ?? realpathSync)(p);
}

/** Resolve `p` under `root`, throwing if the result escapes the root. */
export function safeResolve(root: string, p: string): string {
  const rootAbs = resolve(root);
  const abs = isAbsolute(p) ? resolve(p) : resolve(rootAbs, p);
  const rel = relative(rootAbs, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new PathEscapeError(`Path "${p}" escapes the project root.`);
  }
  // The lexical check above is symlink-blind: a link INSIDE the root that
  // points outside would pass it yet read outside the root on open.
  // Canonicalize the deepest existing prefix of the path (the file itself may
  // not exist yet for a nonexistent-pack error path) and re-check against the
  // canonical root — which also handles a root that itself lives behind a
  // symlink/junction.
  let existing = abs;
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  const relReal = relative(canonical(rootAbs), canonical(existing));
  if (relReal.startsWith("..") || isAbsolute(relReal)) {
    throw new PathEscapeError(`Path "${p}" escapes the project root via a link.`);
  }
  return abs;
}
