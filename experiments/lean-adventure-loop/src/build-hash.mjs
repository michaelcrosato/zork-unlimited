import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { sha256 } from "./engine.mjs";

export const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));

const GAME_FILES = ["game/world.json", "src/engine.mjs", "src/mcp-server.mjs"];

export async function projectBuildHash(root = PROJECT_ROOT) {
  const chunks = [];
  for (const relative of GAME_FILES) {
    chunks.push(relative, "\0", await readFile(resolve(root, relative), "utf8"), "\0");
  }
  return sha256(chunks.join(""));
}
