/**
 * The AFK assessor — the loop's deterministic "next best improvement" brain.
 * Verifies it spans the four categories, is deterministic (same repo ⇒ same
 * ranking), and reads real quest health.
 */
import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assess,
  allGeneratedChecksClean,
  blindReportAttendanceOffsets,
  formatAssessment,
  generatorRpgDriftCandidate,
  isSaturated,
  mergeAttendanceOffsets,
  packStem,
  parseAttendanceOffsets,
  parseBlindReportAttendanceOffsets,
  SATURATION_FLOOR,
  type Assessment,
  type Category,
  type ImprovementCandidate,
} from "../../src/afk/assessor.js";

const a = assess(process.cwd());

// The overworld is the single quest registry; a fixture root reuses the real,
// integrity-passing overworld but swaps its quest list for the one stale-audit
// fixture quest, anchored to a real Albany area, so the shipped-source bijection
// holds with exactly the fixture pack on disk.
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

function realRepoAttendanceOffsets(): Map<string, number> {
  const loopState = join(process.cwd(), "AI_LOOP_STATE.md");
  const loopOffsets = existsSync(loopState)
    ? parseAttendanceOffsets(readFileSync(loopState, "utf8"))
    : new Map<string, number>();
  return mergeAttendanceOffsets(loopOffsets, blindReportAttendanceOffsets(process.cwd()));
}

function withStaleAuditFixtureRoot(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "af-assessor-"));
  try {
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
        opening_relief_oath: undefined,
        quests: [
          {
            id: "stale_fixture",
            title: "Stale Fixture",
            source: "content/rpg/quests/stale_fixture.yaml",
            home: "albany_city",
            area: "albany_city__transport_hub",
            discovery: "Ask around Albany city for the Stale Fixture lead.",
            visibility: "local_notice_board",
          },
        ],
      }),
    );
    writeFileSync(
      join(root, "content", "rpg", "quests", "stale_fixture.yaml"),
      [
        "meta:",
        "  id: stale_audit_fixture_v1",
        "  title: Stale Audit Fixture",
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
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("assess()", () => {
  it("counts the RPG catalog and does not track retired legacy modes", () => {
    expect("packsByMode" in a).toBe(false);
    expect(a.rpgQuestCount).toBe(12);
    expect(a.worldQuestCount).toBe(12);
    expect(a.quests.filter((p) => p.playable).every((p) => p.world_quest_id !== null)).toBe(true);
    expect(a.quests.every((p) => !("pack_id" in p))).toBe(true);
    expect(a.quests.every((p) => !("path" in p))).toBe(true);
  });

  it("produces candidates and a top recommendation", () => {
    expect(a.candidates.length).toBeGreaterThan(0);
    expect(a.top).not.toBeNull();
    expect(a.top!.score).toBe(a.candidates[0]!.score); // top is the highest-scored
  });

  it("surfaces whether all fresh generator windows validated clean", () => {
    expect(a.allGeneratorsClean).toBe(true);
    expect(a.candidates.find((c) => c.id === "generator-rpg-drift")).toBeUndefined();
  });

  it("disarms the repo ESLint+Prettier lever once the tooling is in place (bug_0031)", () => {
    const cats = new Set<Category>(a.candidates.map((c) => c.category));
    // The assessor's only non-content lever was "Add ESLint + Prettier (lint is just
    // tsc)". bug_0031 CLOSED that gap — eslint.config.js + .prettierrc.json ship and
    // `npm run lint` / `format:check` now run ESLint / Prettier. So, exactly as
    // content_new disarms once the world graph meets its breadth target (see "raises no
    // content_new candidate …" below), the repo-eslint candidate is correctly no
    // longer raised; content_fix (low-priority RPG blind-playtest reviews — a distinct
    // kind of content work, guarded below) is the
    // live lever. If the tooling were removed the assessor RE-ARMS repo-eslint, so
    // this assertion also catches that regression.
    expect(existsSync(join(process.cwd(), "eslint.config.js"))).toBe(true);
    expect(a.candidates.find((c) => c.id === "repo-eslint")).toBeUndefined();
    expect(cats.has("content_fix")).toBe(true);
    expect(a.candidates.length).toBeGreaterThan(0);
  });

  it("does NOT raise bot-coverage content_fix for RPG puzzle packs", () => {
    // The planning-free coverage bot can't solve multi-step puzzles, so its failure
    // to reach an RPG ending is expected — not a content flaw. Those packs
    // must not produce a high-impact `fix-` candidate from bot coverage alone.
    // (bug_0032 generalized this to planning-gated legacy content too — see
    // tests/regression/assessor_gated_cyoa_coverage.test.ts.)
    for (const p of a.quests.filter((p) => p.world_quest_id !== null && p.warnings === 0)) {
      expect(a.candidates.find((c) => c.id === `fix-${p.world_quest_id}`)).toBeUndefined();
    }
  });

  it("keeps RPG quests on the radar as low-priority fresh-world evidence reviews", () => {
    const reviews = a.candidates.filter((c) => c.id.startsWith("playtest-"));
    expect(reviews.length).toBeGreaterThan(0);
    for (const r of reviews) {
      expect(r.score).toBeLessThan(1); // ranked below real fixes + new content
      expect(r.target).not.toMatch(/^content\/rpg\/quests\//);
    }
  });

  it("surfaces the stale reactive-description audit as an above-floor structural candidate when the class exists", () => {
    withStaleAuditFixtureRoot((root) => {
      const fixtureAssessment = assess(root);
      const candidate = fixtureAssessment.candidates.find(
        (c) => c.id === "stale-reactive-room-item-audit",
      );

      expect(candidate).toBeDefined();
      expect(candidate?.category).toBe("engine");
      expect(candidate?.score).toBeGreaterThan(SATURATION_FLOOR);
      expect(candidate?.evidence[0]).toContain("item/take-effect state");
      expect(candidate?.evidence[0]).toContain("world_quest_id:stale_fixture");
      expect(candidate?.evidence[0]).not.toContain("content/rpg/quests/");
    });
  });

  it("raises content_new only for contiguous world-quest breadth", () => {
    // Breadth work is now an overworld-registry target, not a mode/pack target.
    // Legacy content is no longer a breadth target, and raw RPG packs must not be
    // raised as detached authoring work. The 12 shipped quests meet the target, so
    // content_new disarms.
    expect(a.rpgQuestCount).toBe(12);
    expect(a.worldQuestCount).toBe(12);
    expect(
      a.candidates.find((c) => c.category === "content_new" && c.target === "rpg"),
    ).toBeUndefined();
    expect(
      a.candidates.find((c) => c.category === "content_new" && c.target === "world"),
    ).toBeUndefined();
    expect(
      a.candidates.find((c) => c.category === "content_new" && c.target === "cyoa"),
    ).toBeUndefined();
    expect(
      a.candidates.find((c) => c.category === "content_new" && c.target === "parser"),
    ).toBeUndefined();
    expect(a.candidates.find((c) => c.category === "content_new")).toBeUndefined();
  });

  it("under-target breadth work points at the world graph, not a raw mode", () => {
    withStaleAuditFixtureRoot((root) => {
      const fixtureAssessment = assess(root);
      const candidate = fixtureAssessment.candidates.find((c) => c.id === "new-world-quest");

      expect(candidate).toBeDefined();
      expect(candidate?.category).toBe("content_new");
      expect(candidate?.target).toBe("world");
      expect(candidate?.title).toContain("world-graph RPG quest");
      expect(candidate?.rationale).toContain("single New York overworld");
    });
  });

  it("every candidate is well-formed (evidence + score + effort)", () => {
    for (const c of a.candidates) {
      expect(c.id).toBeTruthy();
      expect(c.evidence.length).toBeGreaterThan(0);
      expect(c.score).toBeGreaterThan(0);
      expect(["S", "M", "L"]).toContain(c.effort);
    }
  });

  it("ranks by score descending (deterministic ordering)", () => {
    for (let i = 1; i < a.candidates.length; i++) {
      expect(a.candidates[i - 1]!.score).toBeGreaterThanOrEqual(a.candidates[i]!.score);
    }
  });

  it("is deterministic: same repo ⇒ identical ranking", () => {
    const b = assess(process.cwd());
    expect(b.candidates.map((c) => `${c.id}:${c.score}`)).toEqual(
      a.candidates.map((c) => `${c.id}:${c.score}`),
    );
  });

  it("formatAssessment renders the recommendation", () => {
    const out = formatAssessment(a);
    expect(out).toContain("next best improvement");
    expect(out).toContain("RPG catalog:");
    expect(out).toContain("RPG generator mint-and-check: clean");
    expect(out).toContain("Recommended next");
    expect(out).not.toContain("Packs by mode");
    expect(out).toContain("Quest health");
    expect(out).not.toContain("Pack health");
    expect(out).not.toMatch(/\[[?a-z]+\]/);
    expect(out).toMatch(/Review quest "[a-z0-9_]+" using fresh-overworld blind evidence/);
    expect(out).not.toMatch(/Blind-playtest "[a-z0-9_]+_v\d+"/);
  });

  it("formatAssessment compacts routine playtest rows but keeps full output available", () => {
    const compact = formatAssessment(a);
    const full = formatAssessment(a, { full: true });

    expect(compact.length).toBeLessThan(full.length);
    expect(compact).toContain("routine fresh-world review candidate(s) omitted");
    expect(compact).toContain("full list is in assessment.json");
    expect(full).toContain("why: The validator and exhaustive solver prove");
  });

  it("keeps the next quest rotation visible when hot spots fill the compact rows", () => {
    const hotSpots: ImprovementCandidate[] = Array.from({ length: 3 }, (_, index) => ({
      id: `hotspot-${index}`,
      category: "content_fix",
      target: "wolf_winter",
      title: `Fix hot spot ${index}`,
      rationale: "Verified feedback needs a focused fix.",
      evidence: ["verified fleet evidence"],
      impact: 5,
      effort: "M",
      score: 2.5,
    }));
    const rotation: ImprovementCandidate = {
      id: "playtest-wolf_winter",
      category: "content_fix",
      target: "wolf_winter",
      title: 'Review quest "wolf_winter" using fresh-overworld blind evidence — structurally clean',
      rationale: "Only a fresh-overworld blind player can judge experience quality.",
      evidence: ["rotation due"],
      impact: 1,
      effort: "M",
      score: SATURATION_FLOOR,
    };
    const fixture: Assessment = {
      ...a,
      candidates: [...hotSpots, rotation],
      top: hotSpots[0]!,
    };

    const out = formatAssessment(fixture, { maxCandidates: 3 });
    expect(out).toContain(
      'Next quest review: Review quest "wolf_winter" using fresh-overworld blind evidence',
    );
  });
});

describe("allGeneratedChecksClean", () => {
  it("is true only when every generated pack report has zero findings", () => {
    expect(
      allGeneratedChecksClean([
        { seed: 1, report: { source_id: "a", ok: true, findings: [] } },
        { seed: 2, report: { source_id: "b", ok: true, findings: [] } },
      ]),
    ).toBe(true);
    expect(
      allGeneratedChecksClean([
        { seed: 1, report: { source_id: "a", ok: true, findings: [] } },
        {
          seed: 2,
          report: {
            source_id: "b",
            ok: true,
            findings: [
              { severity: "warning", code: "X", message: "unclean generated pack", where: [] },
            ],
          },
        },
      ]),
    ).toBe(false);
  });

  it("keys generated drift evidence by seed without echoing generated pack ids", () => {
    const candidate = generatorRpgDriftCandidate([
      {
        seed: 7,
        report: {
          source_id: "generated_rpg_7",
          ok: true,
          findings: [
            { severity: "warning", code: "X", message: "unclean generated pack", where: [] },
          ],
        },
      },
    ]);

    expect(candidate?.evidence).toEqual(["seed 7: warning:X"]);
  });
});

describe("blind-pass rotation (bug_0128)", () => {
  it("packStem normalizes a pack path OR a bare id to the same stem", () => {
    expect(packStem("content/rpg/quests/cold_forge.yml")).toBe("cold_forge");
    expect(packStem("cold_forge")).toBe("cold_forge");
    // bug_0293: a pack ID carries a _vN suffix the file stem does not; both must converge
    // so the code-written `Blind-playtest "<id>"` attendance line keys to the candidate's
    // path-derived stem.
    expect(packStem("cold_forge_v1")).toBe("cold_forge");
    expect(packStem("content/rpg/quests/cold_forge.yaml")).toBe(packStem("cold_forge_v1"));
  });

  it("parseAttendanceOffsets keeps the MOST RECENT (topmost) mention in the newest-first log (bug_0128)", () => {
    // AI_LOOP_STATE.md is NEWEST-FIRST (each cycle PREPENDS at the top), so a pack's
    // FIRST (smallest-offset) mention is its most recent. Here clockwork appears at the
    // very top (most recent) and again at the bottom (older); cold_forge sits between.
    const text = [
      "- Mandated blind pass ran on cold_forge (rpg, seed 3).", // most recent
      "noise noise noise",
      "- Mandated blind pass ran on sunken_barrow (rpg, seed 7).",
      "- Mandated blind pass ran on cold_forge (rpg, seed 99).", // older repeat
    ].join("\n");
    const offsets = parseAttendanceOffsets(text);
    // Keyed by stem, recognizing the CURRENT prose phrasing + a bare id token.
    expect(offsets.has("cold_forge")).toBe(true);
    expect(offsets.has("sunken_barrow")).toBe(true);
    // cold_forge's kept offset is its FIRST (topmost = most recent) mention, BEFORE
    // sunken_barrow's — the opposite of the pre-bug_0128 last-write-wins behaviour.
    expect(offsets.get("cold_forge")!).toBeLessThan(offsets.get("sunken_barrow")!);
  });

  it("parseAttendanceOffsets still recognizes the legacy structured-header marker", () => {
    const text =
      "- Mandatory LLM playtest target this cycle: content/rpg/quests/sunken_barrow.yaml.";
    const offsets = parseAttendanceOffsets(text);
    expect(offsets.has("sunken_barrow")).toBe(true);
  });

  it("parseAttendanceOffsets recognizes current fresh-world quest-review recommendation lines", () => {
    const text =
      '- Next best improvement (recommended): [content_fix] Review quest "bellfounders_alarm" using fresh-overworld blind evidence — structurally clean.';
    const offsets = parseAttendanceOffsets(text);
    expect(offsets.has("bellfounders_alarm")).toBe(true);
    expect(offsets.has("quest")).toBe(false);
  });

  it("parseAttendanceOffsets recognizes compact playtest recommendation ids", () => {
    const text = "- Rec: playtest-bellfounders_alarm (content_fix/S; score=0.5).";
    const offsets = parseAttendanceOffsets(text);
    expect(offsets.has("bellfounders_alarm")).toBe(true);
  });

  it("parseBlindReportAttendanceOffsets recognizes timestamped accepted markdown reports", () => {
    const offsets = parseBlindReportAttendanceOffsets([
      "20260619T191648Z_aleconners_seal_seed7.md",
      "20260619T190607Z_aleconners_seal_seed7.md",
      "20260619T192000Z_alnagers_fault_seed42.md",
      "20260619T192000Z_alnagers_fault_seed42.json",
      "not_a_report.md",
    ]);

    expect(offsets.has("aleconners_seal")).toBe(true);
    expect(offsets.has("alnagers_fault")).toBe(true);
    expect(offsets.has("not_a_report")).toBe(false);
    expect(offsets.get("alnagers_fault")!).toBeLessThan(offsets.get("aleconners_seal")!);
  });

  it("mergeAttendanceOffsets treats local report offsets as newer than tracked log offsets", () => {
    const tracked = new Map([
      ["aleconners_seal", 0],
      ["cold_forge", 100],
    ]);
    const reports = parseBlindReportAttendanceOffsets([
      "20260619T191648Z_aleconners_seal_seed7.md",
    ]);
    const merged = mergeAttendanceOffsets(tracked, reports);

    expect(merged.get("aleconners_seal")).toBeLessThan(0);
    expect(merged.get("cold_forge")).toBe(100);
  });

  it("blindReportAttendanceOffsets ignores rejected markdown artifacts left by failed blind runs", () => {
    const root = mkdtempSync(join(tmpdir(), "af-blind-reports-"));
    try {
      const reportsDir = join(root, "blind-tester", "reports");
      mkdirSync(reportsDir, { recursive: true });
      writeFileSync(
        join(reportsDir, "20260619T191648Z_aleconners_seal_seed7.md"),
        `
1. Playthrough log: I started the game, followed the evidence, and reached a finding.
2. Did it work mechanically? No rejected actions or loops.
3. Understandable & fun? clarity 4/5 + enjoyment 4/5.
4. Confusion / friction points. None.
5. Bugs or design flaws. None.
6. Verdict: A real player would finish satisfied.

\`\`\`json exit-interview
{
  "clarity": 4,
  "enjoyment": 4,
  "goal_understood": true,
  "got_stuck": false,
  "confusions": [],
  "bugs": [],
  "best_moment": "The evidence chain paying off.",
  "worst_moment": "Nothing stood out.",
  "would_replay": true,
  "verdict": "A real player would finish satisfied; the finding lands."
}
\`\`\`
`,
      );
      writeFileSync(
        join(reportsDir, "20260619T192000Z_alnagers_fault_seed7.md"),
        "The adventureforge MCP server has failed to connect, so I cannot play the game.",
      );

      const offsets = blindReportAttendanceOffsets(root);
      expect(offsets.has("aleconners_seal")).toBe(true);
      expect(offsets.has("alnagers_fault")).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rotates the blind pass onto the LEAST-recently-attended pack, never-attended first (bug_0128)", () => {
    const offsets = realRepoAttendanceOffsets();
    if (offsets.size === 0) return; // rotation is a no-op without attendance evidence
    const reviews = a.candidates.filter((c) => c.id.startsWith("playtest-"));
    if (reviews.length < 2) return;
    const actual = reviews.map((c) => c.target);
    // The SEMANTIC property, computed independently of the implementation: a pack
    // never attended (no mention) sorts first; otherwise the one whose most-recent
    // mention is OLDEST (largest offset in this newest-first log) sorts first; id asc
    // breaks exact ties. Earlier this test mirrored the production sort expression, so
    // it could not catch a wrong sort DIRECTION — it now states the property outright.
    const rank = (target: string): number => {
      const off = offsets.get(packStem(target));
      return off === undefined ? Number.MIN_SAFE_INTEGER : -off;
    };
    const expected = [...reviews]
      .sort((x, y) => rank(x.target) - rank(y.target) || x.id.localeCompare(y.id))
      .map((c) => c.target);
    expect(actual).toEqual(expected);
    // And concretely: the first-nominated pack must NOT be more recently attended
    // than the last-nominated one (the lock-in symptom was the reverse).
    const firstOff = offsets.get(packStem(actual[0]!));
    const lastOff = offsets.get(packStem(actual[actual.length - 1]!));
    if (firstOff !== undefined && lastOff !== undefined) {
      expect(firstOff).toBeGreaterThanOrEqual(lastOff); // larger offset = less recent
    }
  });
});

describe("isSaturated — the saturation-triggered ultraplan signal", () => {
  const candidate = (score: number): ImprovementCandidate => ({
    id: "c",
    category: "content_fix",
    target: "content/rpg/quests/x.yaml",
    title: "t",
    rationale: "r",
    evidence: ["e"],
    impact: 1,
    effort: "M",
    score,
  });
  const withTop = (top: ImprovementCandidate | null): Assessment => ({
    rpgQuestCount: 16,
    worldQuestCount: 16,
    quests: [],
    allGeneratorsClean: true,
    candidates: top ? [top] : [],
    top,
  });
  const withTopAndDirtyGenerators = (top: ImprovementCandidate | null): Assessment => ({
    ...withTop(top),
    allGeneratorsClean: false,
  });

  it("is saturated when the top candidate sits at/below the 0.5 floor", () => {
    expect(isSaturated(withTop(candidate(SATURATION_FLOOR)))).toBe(true);
    expect(isSaturated(withTop(candidate(0.4)))).toBe(true);
  });

  it("is saturated when there is no candidate at all", () => {
    expect(isSaturated(withTop(null))).toBe(true);
  });

  it("is NOT saturated when a generator window is unclean, even at the floor", () => {
    expect(isSaturated(withTopAndDirtyGenerators(candidate(SATURATION_FLOOR)))).toBe(false);
    expect(isSaturated(withTopAndDirtyGenerators(null))).toBe(false);
  });

  it("is NOT saturated when a higher-value lever is present", () => {
    expect(isSaturated(withTop(candidate(0.51)))).toBe(false);
    expect(isSaturated(withTop(candidate(1.067)))).toBe(false); // e.g. the frontier benchmark lever
  });

  it("agrees with the real repo's top score", () => {
    expect(isSaturated(a)).toBe(a.top !== null && a.top.score <= SATURATION_FLOOR);
  });
});
