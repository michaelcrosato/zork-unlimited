import { parseOverworldManifest } from "../../src/world/overworld.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import rawOverworld from "../../content/world/new_york_overworld.json?raw";

export const OVERWORLD: OverworldManifest = parseOverworldManifest(JSON.parse(rawOverworld));
