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

type FixtureContactVariant = {
  after_quests?: string[];
  after_relationship_memories?: string[];
};

type FixtureOverworld = Record<string, unknown> & {
  opening_ally?: unknown;
  opening_preparation?: unknown;
  opening_relief_allocation?: unknown;
  opening_registration?: {
    profiles: Array<{
      character: { relationships: Array<{ memories: string[] }> };
    }>;
  };
  characters: Array<{ variants?: FixtureContactVariant[] }>;
};

const REAL_OVERWORLD = JSON.parse(
  readFileSync(join(process.cwd(), "content", "world", "new_york_overworld.json"), "utf8"),
) as FixtureOverworld;

function fixtureOverworldWithOpeningContactVariants(): FixtureOverworld {
  const world = structuredClone(REAL_OVERWORLD);
  delete world.campaign_service_rules;
  const openingMemories = new Set(
    world.opening_registration?.profiles.flatMap((profile) =>
      profile.character.relationships.flatMap((relationship) => relationship.memories),
    ) ?? [],
  );
  for (const character of world.characters) {
    const openingVariants = character.variants?.filter(
      (variant) =>
        (variant.after_quests?.length ?? 0) === 0 &&
        variant.after_relationship_memories?.some((memory) => openingMemories.has(memory)),
    );
    if (openingVariants?.length) character.variants = openingVariants;
    else delete character.variants;
  }
  return world;
}

/** Same minimal quest fixture assessor.test.ts uses to get a working overworld
 *  + one bound, validating world quest without depending on real shipped
 *  content — just enough for `assess()` to run to completion. */
function writeFixtureQuestRoot(root: string): void {
  mkdirSync(join(root, "content", "rpg", "quests"), { recursive: true });
  mkdirSync(join(root, "content", "world"), { recursive: true });
  writeFileSync(
    join(root, "content", "world", "new_york_overworld.json"),
    JSON.stringify({
      ...fixtureOverworldWithOpeningContactVariants(),
      opening_ally: undefined,
      opening_lead_source: undefined,
      opening_preparation: undefined,
      opening_relief_allocation: undefined,
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

/** Default field values shared by every synthetic hot spot below, so each
 *  call site only names the fields the test actually varies. */
function baseHotspot(overrides: Record<string, unknown> & { id: string }): Record<string, unknown> {
  return {
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
    fix_layer: "content",
    evidence: [
      {
        source: "fleet",
        ref: "20260709T000000Z_hotspot_fixture_seed1.md",
        excerpt: "cannot proceed past the vault door",
      },
    ],
    trend: "new",
    prev_score: null,
    ...overrides,
  };
}

/** A schema-valid `HotspotsFile` wrapping the given hot spots (already-built
 *  via {@link baseHotspot}); `recommended_next_fix` cites the first one. */
function hotspotsFileWith(hotspots: Array<Record<string, unknown>>): unknown {
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
    hotspots,
    recommended_next_fix: {
      hotspot_id: (hotspots[0] as { id: string }).id,
      rationale: "synthetic fixture for assessor hotspot ranking tests",
    },
  };
}

function writeHotspotsFile(
  root: string,
  stamp: string,
  hotspots: Array<Record<string, unknown>>,
): void {
  const dir = join(root, "ai-runs", "feedback", stamp);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "hotspots.json"), JSON.stringify(hotspotsFileWith(hotspots)));
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

// ── review fix: effort floor + tie-break guarantee ──────────────────────────
// `writeFixtureQuestRoot`'s quest has an unreachable win condition
// (`has_flag: impossible`), so it is UNPLAYABLE (validator error, not just a
// warning) and every fixture root here also raises a `fix-unplayable-
// hotspot_fixture` candidate (impact 5, effort M, content_fix -> score 2.5)
// alongside whatever hotspot candidate the test's own hotspots.json adds.
describe("hotspot candidates never outrank an unplayable-quest fix (review fix)", () => {
  const FIX_LAYERS = [
    "content",
    "hint_text",
    "quest_structure",
    "engine_rule",
    "validator",
    "test",
  ] as const;

  it.each(FIX_LAYERS)(
    "fix_layer %s: effort floors at M, and the hotspot never outranks fix-unplayable-hotspot_fixture",
    (fixLayer) => {
      withFixtureRoot(
        (root) => {
          writeHotspotsFile(root, "20260709T000000Z", [
            baseHotspot({ id: `floor-${fixLayer}`, fix_layer: fixLayer }),
          ]);
        },
        (root) => {
          const a = assess(root);
          const fixUnplayable = a.candidates.find((c) => c.id === "fix-unplayable-hotspot_fixture");
          const hotspot = a.candidates.find((c) => c.id === `hotspot-floor-${fixLayer}`);
          expect(fixUnplayable).toBeDefined();
          expect(hotspot).toBeDefined();

          // The dropped "S" tier: every hotspot candidate now floors at "M" effort,
          // regardless of fix_layer.
          expect(hotspot!.effort).toBe("M");

          // Never outranks — at most a tie, per the chosen mechanism documented on
          // effortForHotspot in src/afk/assessor.ts.
          expect(hotspot!.score).toBeLessThanOrEqual(fixUnplayable!.score);

          // And concretely: it never ranks AHEAD of the unplayable-quest fix in the
          // final sorted list (the id-ascending tiebreak resolves any exact tie).
          const fixRank = a.candidates.findIndex((c) => c.id === "fix-unplayable-hotspot_fixture");
          const hotspotRank = a.candidates.findIndex((c) => c.id === `hotspot-floor-${fixLayer}`);
          expect(fixRank).toBeLessThan(hotspotRank);
        },
      );
    },
  );

  it("a content-fix_layer hot spot at max impact scores an EXACT tie (2.5) with the unplayable-quest fix", () => {
    // This is the concrete review scenario (commit 38399b45 + the real checkpoint
    // capture in .superpowers/sdd/task-17-report.md): before this fix, a sole
    // `content`/`hint_text` hot spot got "S" effort, so
    // score(5, "S", "content_fix") = 5.0 outranked EVERYTHING, including an
    // unplayable-quest fix at score(5, "M", "content_fix") = 2.5. After the fix,
    // both land on exactly 2.5 — a tie the id tiebreak resolves in the quest fix's
    // favor.
    withFixtureRoot(
      (root) => {
        writeHotspotsFile(root, "20260709T000000Z", [
          baseHotspot({ id: "exact-tie", fix_layer: "content", trend: "new" }),
        ]);
      },
      (root) => {
        const a = assess(root);
        const fixUnplayable = a.candidates.find((c) => c.id === "fix-unplayable-hotspot_fixture")!;
        const hotspot = a.candidates.find((c) => c.id === "hotspot-exact-tie")!;
        expect(fixUnplayable.score).toBe(2.5);
        expect(hotspot.score).toBe(2.5);
        expect(a.candidates.findIndex((c) => c.id === fixUnplayable.id)).toBeLessThan(
          a.candidates.findIndex((c) => c.id === hotspot.id),
        );
      },
    );
  });
});

// ── review fix: trend-aware impact ──────────────────────────────────────────
describe("trend-aware hotspot impact (review fix)", () => {
  it('an "improved" hot spot gets impact 1 lower than an identical "new" one', () => {
    withFixtureRoot(
      (root) => {
        writeHotspotsFile(root, "20260709T000000Z", [
          baseHotspot({ id: "trend-new", trend: "new" }),
        ]);
      },
      (root) => {
        const a = assess(root);
        const candidate = a.candidates.find((c) => c.id === "hotspot-trend-new");
        expect(candidate).toBeDefined();
        expect(candidate!.impact).toBe(5); // sole hot spot in file normalizes to max impact
      },
    );

    withFixtureRoot(
      (root) => {
        writeHotspotsFile(root, "20260709T000000Z", [
          baseHotspot({ id: "trend-improved", trend: "improved", prev_score: 200 }),
        ]);
      },
      (root) => {
        const a = assess(root);
        const candidate = a.candidates.find((c) => c.id === "hotspot-trend-improved");
        expect(candidate).toBeDefined();
        // Identical otherwise (same sole-hot-spot-in-file normalization to base
        // impact 5), but "improved" knocks it down by exactly 1.
        expect(candidate!.impact).toBe(4);
      },
    );
  });

  it('the "improved" discount floors at impact 1 — it never reaches 0', () => {
    withFixtureRoot(
      (root) => {
        writeHotspotsFile(root, "20260709T000000Z", [
          // Dominant hot spot sets maxHotspotScore = 100 (base impact 5, trend new).
          baseHotspot({ id: "dominant", score: 100, trend: "new" }),
          // 5/100 * 5 = 0.25 -> rounds to base impact 1 BEFORE the trend discount;
          // "improved" would take it to 0 without the floor.
          baseHotspot({ id: "faint-improved", score: 5, trend: "improved", prev_score: 50 }),
        ]);
      },
      (root) => {
        const a = assess(root);
        const dominant = a.candidates.find((c) => c.id === "hotspot-dominant");
        const faint = a.candidates.find((c) => c.id === "hotspot-faint-improved");
        expect(dominant?.impact).toBe(5);
        expect(faint?.impact).toBe(1); // floored, not 0
      },
    );
  });
});
