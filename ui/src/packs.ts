/**
 * Pack catalog for the UI (spec §13 Stage 5).
 *
 * Vite bundles every shipped content pack as raw YAML text at build time, so the
 * browser never touches the filesystem. Each entry carries the source text the
 * GameSession compiles on demand. Broken fixtures are excluded — only playable
 * packs are offered.
 */
import { detectMode, type Mode } from "./engine.js";

export type PackEntry = { path: string; name: string; mode: Mode; source: string };

// All shipped packs, as raw strings (cyoa / parser / rpg "pack" directories).
const raw = import.meta.glob("../../content/**/pack/*.yaml", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const PACKS: PackEntry[] = Object.entries(raw)
  .map(([path, source]) => {
    const mode = detectMode(source);
    const file = path.split("/").pop() ?? path;
    return { path, name: `${file.replace(/\.ya?ml$/, "")} (${mode})`, mode, source };
  })
  .sort((a, b) => a.name.localeCompare(b.name));
