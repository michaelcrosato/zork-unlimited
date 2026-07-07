/**
 * Quest catalog for the UI.
 *
 * Vite bundles every shipped quest pack as raw YAML text at build time, so the
 * browser never touches the filesystem. Each entry carries the source text the
 * GameSession compiles on demand. The New York overworld (`worldData.js`) is the
 * single world AND quest registry; `App.tsx` maps an overworld quest's source
 * path to the matching pack entry here and compiles it in-browser.
 */
import type { Mode } from "./engine.js";
import { parse as parseYaml } from "yaml";

export type PackEntry = {
  path: string;
  name: string;
  mode: Mode;
  source: string;
};

// Shipped RPG quest packs, as raw strings.
const raw = import.meta.glob("../../content/rpg/quests/*.yaml", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function readPackTitle(source: string): string {
  const rawPack = parseYaml(source) as { meta?: { title?: string } };
  if (!rawPack.meta?.title) {
    throw new Error("A shipped quest pack is missing its meta.title.");
  }
  return rawPack.meta.title;
}

export const PACKS: PackEntry[] = Object.entries(raw)
  .map(([path, source]) => ({
    path,
    name: readPackTitle(source),
    mode: "rpg" as const,
    source,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
