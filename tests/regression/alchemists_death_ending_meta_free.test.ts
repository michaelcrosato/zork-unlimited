/**
 * Regression (§15) for bug_0203 — *The Alchemist's Tower*'s two death endings broke
 * the in-fiction tone with an engine-instruction meta line.
 *
 * The mandated blind pass this cycle (alchemists_tower, parser, seed 19 — the
 * most-overdue *parser* rotation target, last dedicated pass bug_0185; deviated from the
 * harness recency-blind rank-1 breaking_weir, which was blind-played 3 of the last 6
 * cycles, per the rotation discipline) reached all three endings (ending_cured WIN 40/40,
 * ending_betrayal 0/40, ending_poisoned DEATH 0/40), rated the pack clarity 5/5 /
 * enjoyment 4/5 with ZERO mechanical bugs. Its one concrete finding: the "Poisoned"
 * death ending text ended with "(Load a saved game to try again.)" — a meta, engine-
 * flavoured instruction, jarring against the in-fiction tone of the other endings.
 *
 * Investigation found the SAME parenthetical on the pack's second death ending,
 * ending_master_poisoned, and that these two strings were the ONLY ending texts in the
 * entire parser/RPG corpus carrying such an engine-instruction line. They were also the
 * odd ones out WITHIN their own pack: ending_cured and ending_betrayal both close with
 * the project's in-fiction `*** ... ***` tag ("*** You have won. ***" / "*** You have
 * taken the Great Work. ***"), and the other tagged parser packs (sealed_crypt,
 * friars_postern) tag their death endings too.
 *
 * Fix (content-only, no engine change): drop the "(Load a saved game to try again.)"
 * meta from both death endings and close them with the pack's in-fiction tag instead —
 * ending_poisoned "*** You have died. ***" (the sealed_crypt poison-death convention),
 * ending_master_poisoned "*** You have failed her. ***". The endings stay exactly as
 * reachable (death flags, ids, score, win-condition all untouched); only the prose
 * changes. (Loadability is an engine capability the player always has — §8.7 — so the
 * prose no longer needs to instruct it.)
 *
 * Locked here:
 *   (1) the corpus invariant the fix establishes — NO declared ending text in any
 *       parser/RPG pack carries an engine-instruction meta line (the "Load a saved
 *       game" / "(Load ...)" phrasing) — so a re-introduction in ANY pack is caught,
 *       not just this one;
 *   (2) alchemists_tower's two death endings specifically are meta-free AND now carry
 *       the in-fiction `*** ... ***` tag their sibling endings already used.
 * Reverting either content edit re-introduces the meta line and turns case (1) RED.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadParserPackFile } from "../../src/parser/pack.js";
import { loadRpgPackFile } from "../../src/rpg/pack.js";

const root = process.cwd();

/** Every declared ending across all parser + RPG packs, with its source pack. */
function allParserRpgEndings(): { pack: string; id: string; title: string; text: string }[] {
  const out: { pack: string; id: string; title: string; text: string }[] = [];
  for (const [dir, load] of [
    ["content/parser/pack", loadParserPackFile],
    ["content/rpg/pack", loadRpgPackFile],
  ] as const) {
    for (const file of readdirSync(join(root, dir))) {
      if (!file.endsWith(".yaml")) continue;
      const path = `${dir}/${file}`;
      const r = load(path);
      if (!r.ok) throw new Error(`${path} must compile`);
      for (const e of r.compiled.pack.endings) {
        out.push({ pack: path, id: e.id, title: e.title, text: e.text });
      }
    }
  }
  return out;
}

// A meta, engine-flavoured instruction in ending prose: telling the player to load a
// saved game / try again, rather than narrating the fiction. This is what bug_0203
// removed; the guard keeps it gone everywhere.
const META_INSTRUCTION = /load a saved game|\(\s*load\b/i;

describe("bug_0203 — no parser/RPG ending text carries an engine-instruction meta line", () => {
  const endings = allParserRpgEndings();

  it("sanity: discovery is finding endings across multiple packs", () => {
    expect(endings.length).toBeGreaterThan(15);
    expect(new Set(endings.map((e) => e.pack)).size).toBeGreaterThan(3);
  });

  it("no ending prose tells the player to load a saved game (corpus-wide)", () => {
    const offenders = endings
      .filter((e) => META_INSTRUCTION.test(e.text))
      .map((e) => `${e.pack}#${e.id}`);
    expect(offenders, `meta-instruction ending prose: ${JSON.stringify(offenders)}`).toEqual([]);
  });

  it("alchemists_tower's two death endings are meta-free and carry the in-fiction tag", () => {
    const r = loadParserPackFile("content/parser/pack/alchemists_tower.yaml");
    if (!r.ok) throw new Error("alchemists_tower must compile");
    const byId = new Map(r.compiled.pack.endings.map((e) => [e.id, e]));

    for (const id of ["ending_poisoned", "ending_master_poisoned"]) {
      const e = byId.get(id);
      expect(e, `${id} must exist`).toBeTruthy();
      expect(e!.death).toBe(true);
      // meta gone
      expect(e!.text).not.toMatch(META_INSTRUCTION);
      // in-fiction tag present (same convention as ending_cured / ending_betrayal)
      expect(e!.text.replace(/\s+/g, " ").trim()).toMatch(/\*\*\* .+ \*\*\*$/);
    }
    // exact closing tags, so a future re-word that drops the convention is caught
    expect(byId.get("ending_poisoned")!.text).toContain("*** You have died. ***");
    expect(byId.get("ending_master_poisoned")!.text).toContain("*** You have failed her. ***");
  });
});
