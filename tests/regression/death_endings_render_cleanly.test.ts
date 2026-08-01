/**
 * Fast companion guard for the unified exhaustive ending proof in
 * rpg_all_endings_reachable.test.ts. That proof renders every reached death witness;
 * this keeps the death classification and its non-vacuity check explicit without
 * traversing each pack's graph a second time.
 */
import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadRpgSourceFile } from "../../src/rpg/source.js";

const RPG_DIR = "content/rpg/quests";
const rpgFiles = readdirSync(RPG_DIR)
  .filter((file) => file.endsWith(".yaml"))
  .sort();

describe("declared RPG death endings remain explicitly classified", () => {
  it("auto-discovers a non-vacuous set of death endings for the unified render proof", () => {
    let total = 0;
    for (const file of rpgFiles) {
      const loaded = loadRpgSourceFile(join(RPG_DIR, file));
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) continue;
      total += loaded.compiled.pack.endings.filter((ending) => ending.death === true).length;
    }
    expect(total).toBeGreaterThanOrEqual(5);
  });
});
