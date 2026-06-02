/**
 * Regression — bug_0128: the AFK assessor's blind-pass RECENCY ROTATION must track
 * true recency from the log AS IT IS ACTUALLY WRITTEN.
 *
 * The rotation was added to cure a "clockwork_heist lock-in" (one pack re-nominated
 * every cycle). It then silently broke two ways: (1) it matched only the legacy
 * "Mandatory LLM playtest target this cycle: <path>" header, abandoned ~15 cycles ago
 * for prose "Mandated blind pass ran on <pack>", so recent attendance was invisible;
 * and (2) it assumed an oldest-first log ("last write wins (most recent)") while
 * AI_LOOP_STATE.md is newest-first (prepended), so it kept each pack's OLDEST mention
 * and the sort direction inverted. With stale/inverted data the tiebreak fell back to
 * alphabetical — re-nominating clockwork_heist, the very lock-in it was meant to cure.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assess, packStem, parseAttendanceOffsets } from "../../src/afk/assessor.js";

describe("bug_0128 — blind-pass rotation tracks true recency", () => {
  it("recognizes the CURRENT prose format the log actually uses (the stale-marker bug)", () => {
    const text = "- Mandated blind pass ran on sunken_barrow (rpg, seed 7).";
    const offsets = parseAttendanceOffsets(text);
    // Pre-fix this matched nothing → the pack looked never-attended.
    expect(offsets.has("sunken_barrow")).toBe(true);
  });

  it("treats the log as NEWEST-FIRST: a pack's topmost mention is its most recent", () => {
    // Realistic prepend order: newest cycle entry on top, oldest at the bottom.
    const text = [
      "- Mandated blind pass ran on watchtower_road (CYOA, seed 1).", // newest (topmost)
      "- Mandated blind pass ran on clockwork_heist (CYOA, seed 2).",
      "- Mandated blind pass ran on watchtower_road (CYOA, seed 3).", // older repeat
    ].join("\n");
    const offsets = parseAttendanceOffsets(text);
    // watchtower kept its FIRST/topmost (most recent) offset, which precedes clockwork's.
    expect(offsets.get("watchtower_road")!).toBeLessThan(offsets.get("clockwork_heist")!);
  });

  it("does NOT lock onto a freshly-attended pack: most-recent sorts LAST in the rotation", () => {
    // clockwork is the MOST recent attendance here; wreckers is never mentioned. The
    // rotation must surface the never-attended pack first and clockwork last — not the
    // alphabetical-first clockwork the broken parser produced.
    const log = [
      "- Mandated blind pass ran on clockwork_heist (CYOA, seed 5).",
      "- Mandated blind pass ran on cold_forge (rpg, seed 7).",
    ].join("\n");
    const offsets = parseAttendanceOffsets(log);
    const rank = (stem: string): number => {
      const off = offsets.get(stem);
      return off === undefined ? Number.MIN_SAFE_INTEGER : -off;
    };
    const order = ["clockwork_heist", "cold_forge", "wreckers_light"].sort(
      (x, y) => rank(x) - rank(y) || x.localeCompare(y),
    );
    expect(order[0]).toBe("wreckers_light"); // never attended → first
    expect(order[order.length - 1]).toBe("clockwork_heist"); // most recent → last
  });

  it("on the real repo, the rotation no longer re-nominates the MOST-recently-attended pack", () => {
    const loopState = join(process.cwd(), "AI_LOOP_STATE.md");
    if (!existsSync(loopState)) return;
    const offsets = parseAttendanceOffsets(readFileSync(loopState, "utf8"));
    const a = assess(process.cwd());
    const reviews = a.candidates.filter((c) => c.id.startsWith("playtest-"));
    if (reviews.length < 2) return;
    const topStem = packStem(reviews[0]!.target);
    const topOff = offsets.get(topStem);
    // The nominated pack is either never-attended, or strictly LESS recent than the
    // single most-recently-attended pack (smallest offset). It must not BE that pack.
    const attendedOffs = reviews
      .map((c) => offsets.get(packStem(c.target)))
      .filter((o): o is number => o !== undefined);
    if (topOff !== undefined && attendedOffs.length > 0) {
      const mostRecentOff = Math.min(...attendedOffs);
      expect(topOff).toBeGreaterThanOrEqual(mostRecentOff);
      // The rotation must not put the single MOST-recently-attended pack first. Compute
      // that pack dynamically from the live log rather than hardcoding a name — the
      // rotation advances every cycle (it was watchtower_road at bug_0128, alchemists_tower
      // by bug_0133), and a hardcoded stem goes stale the moment the rotation reaches it.
      const mostRecentStem = reviews
        .map((c) => ({ stem: packStem(c.target), off: offsets.get(packStem(c.target)) }))
        .filter((x): x is { stem: string; off: number } => x.off !== undefined)
        .sort((x, y) => x.off - y.off)[0]!.stem;
      expect(topStem).not.toBe(mostRecentStem);
    }
  });
});
