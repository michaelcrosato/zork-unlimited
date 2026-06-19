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
import {
  assess,
  blindReportAttendanceOffsets,
  mergeAttendanceOffsets,
  packStem,
  parseAttendanceOffsets,
  parseBlindReportAttendanceOffsets,
} from "../../src/afk/assessor.js";

function realRepoAttendanceOffsets(): Map<string, number> {
  const loopState = join(process.cwd(), "AI_LOOP_STATE.md");
  const loopOffsets = existsSync(loopState)
    ? parseAttendanceOffsets(readFileSync(loopState, "utf8"))
    : new Map<string, number>();
  return mergeAttendanceOffsets(loopOffsets, blindReportAttendanceOffsets(process.cwd()));
}

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

describe("bug_0235 — recency rotation sees BACKTICK/BOLD-wrapped attendance entries", () => {
  it("parses the `backtick`-wrapped format the log ACTUALLY writes (the blindness recurrence)", () => {
    // The live log writes the pack bold+backticked:
    //   - **Mandated blind pass ran on `midnight_edition`** (cyoa, seed 4) — …
    // Pre-fix the capture class excluded the backtick, so the match FAILED at the opening
    // tick and the entry was invisible → the just-played pack looked never-attended.
    const text = [
      "- **Mandated blind pass ran on `midnight_edition`** (cyoa, seed 4) — clean.", // newest
      "- **Mandated blind pass ran on `tide_mill`** (parser, seed 41).",
      "- Mandated blind pass ran on `clockwork_heist` (cyoa, seed 2).", // oldest
    ].join("\n");
    const offsets = parseAttendanceOffsets(text);
    expect(offsets.has("midnight_edition")).toBe(true); // pre-fix: false (backtick-blind)
    expect(offsets.has("tide_mill")).toBe(true);
    expect(offsets.has("clockwork_heist")).toBe(true);
    // newest-first log ⇒ the topmost (just-played) pack carries the SMALLEST offset.
    expect(offsets.get("midnight_edition")!).toBeLessThan(offsets.get("clockwork_heist")!);
  });

  it("a freshly-attended backtick pack sorts LAST in the rotation, never first", () => {
    const log = [
      "- **Mandated blind pass ran on `midnight_edition`** (cyoa, seed 4).", // most recent
      "- Mandated blind pass ran on `clockwork_heist` (cyoa, seed 2).",
    ].join("\n");
    const offsets = parseAttendanceOffsets(log);
    const rank = (stem: string): number => {
      const off = offsets.get(stem);
      return off === undefined ? Number.MIN_SAFE_INTEGER : -off;
    };
    // white_stag is never mentioned (genuinely never-attended).
    const order = ["midnight_edition", "clockwork_heist", "white_stag"].sort(
      (x, y) => rank(x) - rank(y) || x.localeCompare(y),
    );
    // Pre-fix midnight_edition was INVISIBLE (undefined ⇒ MIN_SAFE_INTEGER) and, being
    // alphabetically before white_stag, sorted FIRST — the exact "re-nominate the
    // just-played pack" bug. Post-fix it carries a real recent offset and sorts last.
    expect(order[0]).toBe("white_stag"); // never attended → first
    expect(order[order.length - 1]).toBe("midnight_edition"); // most recent → last
  });

  it("on the real repo, the most-recent backtick pack is parsed and NOT re-nominated first", () => {
    const loopState = join(process.cwd(), "AI_LOOP_STATE.md");
    if (!existsSync(loopState)) return;
    const raw = readFileSync(loopState, "utf8");
    // Independently locate the log's single most-recent "ran on `X`" mention.
    const m = raw.match(/Mandated blind pass ran on\s+`([a-z0-9_]+)`/i);
    if (!m) return;
    const mostRecent = m[1]!;
    const offsets = parseAttendanceOffsets(raw);
    // The parser MUST see it (pre-fix this was undefined — the vacuous-skip that let the
    // bug_0128 real-repo guard pass while the bug was live).
    expect(offsets.has(mostRecent)).toBe(true);
    const a = assess(process.cwd());
    const reviews = a.candidates.filter((c) => c.id.startsWith("playtest-"));
    if (reviews.length >= 2) {
      // The just-played pack must not be the rotation's top nominee.
      expect(packStem(reviews[0]!.target)).not.toBe(mostRecent);
    }
  });
});

describe("bug_0293 — recency rotation survives the SONNET phrasing + uses the code-written line", () => {
  // Third recurrence of the clockwork_heist lock-in. After the cycle agent defaulted to
  // Sonnet, its entries wrote "blind pass on `clockwork_heist`" (no "Mandated …ran"), so
  // the canonical-only parser saw nothing → 7 straight clockwork cycles. The durable cure
  // parses the MODEL-INDEPENDENT recommendation line the assessor emits every cycle —
  // `Blind-playtest "<id>"` — and tolerates the looser agent phrasing too.
  it("recognizes the Sonnet-era prose 'blind pass on `X`' form", () => {
    const offsets = parseAttendanceOffsets(
      "…(bug_0292): blind pass on `clockwork_heist` (seed 7).",
    );
    expect(offsets.has("clockwork_heist")).toBe(true);
  });

  it('recognizes the code-written `Blind-playtest "<id>"` line and normalizes the _v1 id', () => {
    // The exact shape ai-loop.ts prepends every cycle (the assessor's recommendation).
    const line =
      '- Next best improvement (recommended): [content_fix] Blind-playtest "clockwork_heist_v1" — structurally clean.';
    const offsets = parseAttendanceOffsets(line);
    // Keyed by the path-stem (no _v1) so it matches packStem(candidate.target).
    expect(offsets.has("clockwork_heist")).toBe(true);
    expect(offsets.has("clockwork_heist_v1")).toBe(false);
  });

  it("a freshly-attended pack (new forms) sorts LAST in the rotation, never first", () => {
    // Realistic newest-first entry: code line + Sonnet prose both name clockwork on top.
    const log = [
      '- Next best improvement (recommended): [content_fix] Blind-playtest "clockwork_heist_v1" — clean.',
      "### Cycle result — (bug_0292): blind pass on `clockwork_heist` (seed 7).",
      '- Next best improvement (recommended): [content_fix] Blind-playtest "midnight_edition_v1" — clean.',
    ].join("\n");
    const offsets = parseAttendanceOffsets(log);
    const rank = (stem: string): number => {
      const off = offsets.get(stem);
      return off === undefined ? Number.MIN_SAFE_INTEGER : -off;
    };
    // dead_reckoning is never mentioned (genuinely never-attended).
    const order = ["clockwork_heist", "midnight_edition", "dead_reckoning"].sort(
      (x, y) => rank(x) - rank(y) || x.localeCompare(y),
    );
    expect(order[0]).toBe("dead_reckoning"); // never attended → first
    expect(order[order.length - 1]).toBe("clockwork_heist"); // most recent → last
  });

  it("on the real repo, the live most-recent pack (via the code line) is parsed and NOT re-nominated", () => {
    const loopState = join(process.cwd(), "AI_LOOP_STATE.md");
    if (!existsSync(loopState)) return;
    const raw = readFileSync(loopState, "utf8");
    // Locate the single most-recent attendance the way the log ACTUALLY writes it today —
    // the code-written recommendation line (model-independent) OR the Sonnet prose form.
    // (The bug_0235 guard greps only "Mandated …ran on `X`", which the live Sonnet log no
    // longer contains, so it vacuously skips — exactly how bug_0293 slipped past.)
    const m =
      raw.match(/Blind-playtest "([a-z0-9_]+)"/i) ?? raw.match(/blind pass on\s+`([a-z0-9_]+)`/i);
    if (!m) return;
    const mostRecent = packStem(m[1]!);
    const offsets = parseAttendanceOffsets(raw);
    expect(offsets.has(mostRecent)).toBe(true); // pre-fix: false (phrasing-blind)
    const a = assess(process.cwd());
    const reviews = a.candidates.filter((c) => c.id.startsWith("playtest-"));
    if (reviews.length >= 2) {
      expect(packStem(reviews[0]!.target)).not.toBe(mostRecent);
    }
  });
});

describe("local blind reports — rotation sees accepted report artifacts before the log is prepended", () => {
  it("parses accepted blind report filenames and ignores sidecar/log files", () => {
    const offsets = parseBlindReportAttendanceOffsets([
      "20260619T191648Z_aleconners_seal_seed7.md",
      "20260619T191648Z_aleconners_seal_seed7.json",
      "20260619T191648Z_aleconners_seal_seed7.log",
      "20260619T190607Z_aleconners_seal_seed7.md",
      "20260619T192222Z_alnagers_fault_seed11.md",
    ]);

    expect(offsets.has("aleconners_seal")).toBe(true);
    expect(offsets.has("alnagers_fault")).toBe(true);
    expect(offsets.get("alnagers_fault")!).toBeLessThan(offsets.get("aleconners_seal")!);
  });

  it("merged attendance treats local accepted reports as newer than AI_LOOP_STATE.md", () => {
    const logOffsets = parseAttendanceOffsets(
      '- Next best improvement (recommended): [content_fix] Blind-playtest "aleconners_seal_v1" — clean.',
    );
    const reportOffsets = parseBlindReportAttendanceOffsets([
      "20260619T191648Z_aleconners_seal_seed7.md",
    ]);
    const merged = mergeAttendanceOffsets(logOffsets, reportOffsets);

    expect(logOffsets.get("aleconners_seal")).toBeGreaterThanOrEqual(0);
    expect(reportOffsets.get("aleconners_seal")).toBeLessThan(0);
    expect(merged.get("aleconners_seal")).toBe(reportOffsets.get("aleconners_seal"));
  });

  it("on this worktree, an accepted local report can move its pack out of the first slot", () => {
    const reportsDir = join(process.cwd(), "blind-tester", "reports");
    if (!existsSync(reportsDir)) return;
    const reportOffsets = blindReportAttendanceOffsets(process.cwd());
    if (reportOffsets.size === 0) return;
    const attendance = realRepoAttendanceOffsets();
    const a = assess(process.cwd());
    const reviews = a.candidates.filter((c) => c.id.startsWith("playtest-"));
    if (reviews.length < 2) return;

    const newestLocalStem = [...reportOffsets.entries()].sort((x, y) => x[1] - y[1])[0]![0];
    expect(attendance.get(newestLocalStem)).toBeLessThan(0);
    expect(packStem(reviews[0]!.target)).not.toBe(newestLocalStem);
  });
});
