/**
 * Task 17: the assessor consumes compiled feedback (`ai-runs/feedback/<stamp
 * >/hotspots.json`) as a primary ranking input. Mirrors `assessor.test.ts`'s
 * fixture-root pattern (a minimal-but-real overworld + one quest, so
 * `assess()` runs to completion) and adds a compiled-hotspots fixture on top.
 */
import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assess } from "../../src/afk/assessor.js";

const REAL_OVERWORLD = JSON.parse(
  readFileSync(join(process.cwd(), "content", "world", "new_york_overworld.json"), "utf8"),
) as Record<string, unknown>;

/** Same minimal quest fixture assessor.test.ts uses to get a working overworld
 *  + one bound, validating world quest without depending on real shipped
 *  content — just enough for `assess()` to run to completion. */
function writeFixtureQuestRoot(root: string): void {
  mkdirSync(join(root, "content", "rpg", "quests"), { recursive: true });
  mkdirSync(join(root, "content", "world"), { recursive: true });
  writeFileSync(
    join(root, "content", "world", "new_york_overworld.json"),
    JSON.stringify({
      ...REAL_OVERWORLD,
      quests: [
        {
          id: "hotspot_fixture",
          title: "Hotspot Fixture",
          source: "content/rpg/quests/hotspot_fixture.yaml",
          home: "albany_city",
          area: "albany_city__transport_hub",
          discovery: "Ask around Albany city for the Hotspot Fixture lead.",
          visibility: "local_notice_board",
        },
      ],
    }),
  );
  writeFileSync(
    join(root, "content", "rpg", "quests", "hotspot_fixture.yaml"),
    [
      "meta:",
      "  id: hotspot_fixture_v1",
      "  title: Hotspot Fixture",
      "  start_room: start",
      "  vars_init: { hp: 10, attack: 2, defense: 1 }",
      "  flags_init: []",
      "  max_score: 0",
      "rooms:",
      "  - id: start",
      "    name: Start",
      "    description: A plain starting room.",
      "    exits:",
      "      - direction: east",
      "        to: room",
      "  - id: room",
      "    name: Store",
      "    description: A brass lamp waits on the table.",
      "    objects: [lamp]",
      "    exits:",
      "      - direction: west",
      "        to: start",
      "objects:",
      "  - id: lamp",
      "    name: brass lamp",
      "    aliases: [lamp]",
      "    description: A useful lamp.",
      "    takeable: true",
      "win_conditions:",
      "  - id: win",
      "    conditions:",
      "      - has_flag: impossible",
      "    ending: ending_win",
      "endings:",
      "  - id: ending_win",
      "    title: Done",
      "    text: Done.",
      "enemies: []",
      "",
    ].join("\n"),
  );
}

/** A schema-valid `HotspotsFile` with exactly one S4, quest-located hot spot
 *  routed to `engine_rule` (so it exercises the "engine" category branch, not
 *  just the default content_fix one). `score` is the only hot spot in the
 *  file, so it normalizes to impact 5 regardless of its raw magnitude. */
function validHotspotsFile(hotspotId: string): unknown {
  return {
    version: 1,
    generated_at: "2026-07-09T00:00:00.000Z",
    commit: "abc1234",
    inputs: {
      report_dirs: ["blind-tester/reports"],
      crawl_files: [],
      verified_reports: 1,
      rejected_reports: 0,
      crawl_findings: 0,
    },
    metrics: [],
    sycophancy: {
      reports: 1,
      zero_negative_rate: 0,
      clarity_histogram: [0, 0, 0, 1, 0],
      enjoyment_histogram: [0, 0, 0, 1, 0],
      by_persona_zero_negative: {},
    },
    hotspots: [
      {
        id: hotspotId,
        title: "quest breaks past the vault door",
        location: {
          kind: "quest",
          questId: "hotspot_fixture",
          region: null,
          node: null,
          sceneId: null,
          raw: ["Hotspot Fixture"],
        },
        severity_band: "severe",
        max_severity: "S4",
        count: 6,
        sources: ["fleet"],
        personas: ["breaker"],
        score: 96,
        fix_layer: "engine_rule",
        evidence: [
          {
            source: "fleet",
            ref: "20260709T000000Z_hotspot_fixture_seed1.md",
            excerpt: "cannot proceed past the vault door",
          },
        ],
        trend: "new",
        prev_score: null,
      },
    ],
    recommended_next_fix: {
      hotspot_id: hotspotId,
      rationale: "6 issue mentions, max severity S4, sources: fleet (score 96)",
    },
  };
}

function withFixtureRoot(setup: (root: string) => void, run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "af-assessor-hotspots-"));
  try {
    writeFixtureQuestRoot(root);
    setup(root);
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("assess() consuming compiled hotspots.json (Task 17)", () => {
  it("raises a hotspot- candidate that outranks the default playtest-rotation stubs", () => {
    withFixtureRoot(
      (root) => {
        const dir = join(root, "ai-runs", "feedback", "20260709T000000Z");
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "hotspots.json"), JSON.stringify(validHotspotsFile("deadbeef")));
      },
      (root) => {
        const a = assess(root);
        const candidate = a.candidates.find((c) => c.id === "hotspot-deadbeef");
        expect(candidate).toBeDefined();
        expect(candidate!.category).toBe("engine"); // fix_layer engine_rule -> engine
        expect(candidate!.target).toBe("hotspot_fixture");
        expect(candidate!.impact).toBe(5); // sole hot spot in file normalizes to max impact
        expect(candidate!.effort).toBe("M");
        expect(candidate!.rationale).toContain("hot spot #1");
        expect(candidate!.rationale).toContain("quest breaks past the vault door");
        expect(candidate!.rationale).toContain("count 6");
        expect(candidate!.rationale).toContain("S4");
        expect(candidate!.rationale).toContain("fleet");

        const playtestStubs = a.candidates.filter((c) => c.id.startsWith("playtest-"));
        expect(playtestStubs.length).toBeGreaterThan(0);
        for (const stub of playtestStubs) {
          expect(candidate!.score).toBeGreaterThan(stub.score);
        }
        // And it actually ranks ahead of them in the final sorted list.
        const candidateRank = a.candidates.findIndex((c) => c.id === "hotspot-deadbeef");
        for (const stub of playtestStubs) {
          const stubRank = a.candidates.findIndex((c) => c.id === stub.id);
          expect(candidateRank).toBeLessThan(stubRank);
        }
      },
    );
  });

  it("baseline preservation: with no ai-runs/feedback dir, assess() raises no hotspot- candidates", () => {
    withFixtureRoot(
      () => {
        /* no ai-runs/feedback directory created at all */
      },
      (root) => {
        const a = assess(root);
        expect(a.candidates.some((c) => c.id.startsWith("hotspot-"))).toBe(false);
      },
    );
  });

  it("an invalid/malformed hotspots.json does not crash assess() and raises no candidates", () => {
    withFixtureRoot(
      (root) => {
        const dir = join(root, "ai-runs", "feedback", "20260709T000000Z");
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "hotspots.json"), "{ this is not valid json");
      },
      (root) => {
        expect(() => assess(root)).not.toThrow();
        const a = assess(root);
        expect(a.candidates.some((c) => c.id.startsWith("hotspot-"))).toBe(false);
      },
    );
  });

  it("skips a hot spot whose location cannot be mapped to a fixable target", () => {
    withFixtureRoot(
      (root) => {
        const dir = join(root, "ai-runs", "feedback", "20260709T000000Z");
        mkdirSync(dir, { recursive: true });
        const file = validHotspotsFile("cafef00d") as { hotspots: Array<Record<string, unknown>> };
        file.hotspots[0]!.location = {
          kind: "unmapped",
          questId: null,
          region: null,
          node: null,
          sceneId: null,
          raw: ["somewhere unclear"],
        };
        writeFileSync(join(dir, "hotspots.json"), JSON.stringify(file));
      },
      (root) => {
        const a = assess(root);
        expect(a.candidates.some((c) => c.id.startsWith("hotspot-"))).toBe(false);
      },
    );
  });
});
