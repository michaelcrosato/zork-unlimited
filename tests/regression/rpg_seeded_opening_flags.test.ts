import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { rngForStep } from "../../src/core/rng.js";
import { WOLF_WINTER_DISPATCH_DELAY_FLAG } from "../../src/core/embedded_launch_overlay_receipt.js";
import { load, save, SAVE_MODE, SaveIntegrityError } from "../../src/persist/save_load.js";
import {
  CampaignCharacterImportsSchema,
  CampaignCharacterImportTargetError,
  validateCampaignCharacterImportTargets,
} from "../../src/rpg/campaign_character_import.js";
import { indexRpgPack, initStateForRpgPack } from "../../src/rpg/runner.js";
import {
  SEEDED_OPENING_SELECTOR_DOMAIN,
  seededOpeningFlagForSeed,
  seededOpeningFlagIndex,
} from "../../src/rpg/seeded_opening.js";
import { RpgPackSchema, type RpgPack } from "../../src/rpg/schema.js";
import { assertRpgStateReferences } from "../../src/rpg/state_integrity.js";
import { validateRpgFoundation } from "../../src/validate/rpg_foundation_validator.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { relabelRpgPack } from "./support/relabel_rpg.js";

const OPENING_A = "opening_alpha";
const OPENING_B = "opening_bravo";

function openingPack(
  overrides: {
    id?: string;
    seededOpeningFlags?: string[] | undefined;
    flagsInit?: string[];
    startOnEnter?: unknown[];
    interactionConditions?: unknown[];
    winConditions?: unknown[];
  } = {},
): RpgPack {
  const seededOpeningFlags = overrides.seededOpeningFlags ?? [OPENING_A, OPENING_B];
  return RpgPackSchema.parse({
    meta: {
      id: overrides.id ?? "seeded_opening_fixture",
      title: "Seeded Opening Fixture",
      start_room: "start",
      vars_init: { hp: 10, attack: 2, defense: 2, score: 0 },
      flags_init: overrides.flagsInit ?? [],
      ...(seededOpeningFlags.length === 0 ? {} : { seeded_opening_flags: seededOpeningFlags }),
      max_score: 0,
    },
    rooms: [
      {
        id: "start",
        name: "Start",
        description: "A fork in the weather.",
        variants: [
          { when: [{ has_flag: OPENING_A }], text: "The alpha condition is visible." },
          { when: [{ has_flag: OPENING_B }], text: "The bravo condition is visible." },
        ],
        objects: ["lever"],
        exits: [{ direction: "east", to: "far" }],
        on_enter: overrides.startOnEnter ?? [],
      },
      {
        id: "far",
        name: "Far Room",
        description: "The far side.",
        exits: [{ direction: "west", to: "start" }],
      },
    ],
    objects: [
      {
        id: "lever",
        name: "lever",
        description: "A final lever.",
        interactions: [
          {
            verb: "USE",
            target: "lever",
            conditions: overrides.interactionConditions ?? [],
            effects: [{ set_flag: "won" }],
          },
        ],
      },
    ],
    win_conditions: overrides.winConditions ?? [
      { id: "win", conditions: [{ has_flag: "won" }], ending: "ending" },
    ],
    endings: [{ id: "ending", title: "Done", text: "Done." }],
  });
}

function seedSelecting(flags: readonly string[], wanted: string): number {
  for (let seed = -100; seed <= 100; seed += 1) {
    if (seededOpeningFlagForSeed(flags, seed) === wanted) return seed;
  }
  throw new Error(`No compact fixture seed selected ${wanted}.`);
}

function findingCodes(pack: RpgPack): string[] {
  return validateRpgFoundation(pack)
    .findings.map((finding) => finding.code)
    .sort();
}

describe("deterministic seeded RPG opening flags", () => {
  it("keeps the field optional-without-default and rejects short, empty, or duplicate groups", () => {
    const legacy = openingPack({ seededOpeningFlags: [] });
    expect(Object.prototype.hasOwnProperty.call(legacy.meta, "seeded_opening_flags")).toBe(false);
    // Frozen legacy-shape oracle: adding the optional schema field does not add an
    // `undefined`/empty property to parsed packs or churn their content identity.
    expect(hashState(legacy)).toBe(
      "aa4ae64cd60e6611321a52a02c6dcc0b46db915ebf290320ddf796ebb8acbb1e",
    );

    const raw = structuredClone(legacy) as unknown as { meta: Record<string, unknown> };
    raw.meta.seeded_opening_flags = [];
    expect(RpgPackSchema.safeParse(raw).success).toBe(false);
    raw.meta.seeded_opening_flags = [OPENING_A];
    expect(RpgPackSchema.safeParse(raw).success).toBe(false);
    raw.meta.seeded_opening_flags = [OPENING_A, OPENING_A];
    expect(RpgPackSchema.safeParse(raw).success).toBe(false);
    raw.meta.seeded_opening_flags = [OPENING_A, ""];
    expect(RpgPackSchema.safeParse(raw).success).toBe(false);
  });

  it("pins a full-digest, browser-safe, id-invariant selector across the safe seed domain", () => {
    expect(SEEDED_OPENING_SELECTOR_DOMAIN).toBe("AdventureForge/RPG/seeded-opening-flags/v1");
    expect(
      [0, 1, -1, 42, 2 ** 32, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER].map((seed) => [
        seed,
        seededOpeningFlagIndex(seed, 4),
        seededOpeningFlagIndex(seed, 3),
      ]),
    ).toEqual([
      [0, 2, 2],
      [1, 0, 0],
      [-1, 3, 1],
      [42, 2, 2],
      [2 ** 32, 3, 0],
      [Number.MAX_SAFE_INTEGER, 0, 1],
      [Number.MIN_SAFE_INTEGER, 0, 0],
    ]);

    const seed = Number.MAX_SAFE_INTEGER;
    const original = ["a", "b", "c", "d"];
    const relabeled = ["totally", "different", "opaque", "identifiers"];
    expect(original.indexOf(seededOpeningFlagForSeed(original, seed))).toBe(
      relabeled.indexOf(seededOpeningFlagForSeed(relabeled, seed)),
    );
    expect(() => seededOpeningFlagIndex(1.5, 4)).toThrow(/safe range/i);
    expect(() => seededOpeningFlagIndex(1, 0)).toThrow(/positive safe integer/i);
  });

  it("initializes exactly one selected flag before start-room effects without perturbing action RNG", () => {
    const pack = openingPack();
    const flags = pack.meta.seeded_opening_flags!;
    for (const seed of [0, 1, -1, 2 ** 32, Number.MAX_SAFE_INTEGER]) {
      const expected = seededOpeningFlagForSeed(flags, seed);
      const state = initStateForRpgPack(indexRpgPack(pack), seed);
      expect(state.seed).toBe(seed);
      expect(flags.filter((flag) => state.flags[flag] === true)).toEqual([expected]);
      expect(Object.keys(state.flags).filter((flag) => flags.includes(flag))).toEqual([expected]);
      assertRpgStateReferences(indexRpgPack(pack), state);

      const actionStreamBefore = [rngForStep(seed, 0).next(), rngForStep(seed, 1).next()];
      initStateForRpgPack(indexRpgPack(pack), seed);
      const actionStreamAfter = [rngForStep(seed, 0).next(), rngForStep(seed, 1).next()];
      expect(actionStreamAfter).toEqual(actionStreamBefore);
    }

    const alphaSeed = seedSelecting(flags, OPENING_A);
    const clearsAtStart = openingPack({ startOnEnter: [{ clear_flag: OPENING_A }] });
    const cleared = initStateForRpgPack(indexRpgPack(clearsAtStart), alphaSeed);
    // Deliberately validator-invalid fixture: false proves on_enter ran after the
    // selected flag existed. A post-on_enter selector would overwrite it to true.
    expect(Object.prototype.hasOwnProperty.call(cleared.flags, OPENING_A)).toBe(true);
    expect(cleared.flags[OPENING_A]).toBe(false);
  });

  it("recomputes the exact selected alternative when validating a save", () => {
    const pack = openingPack();
    const index = indexRpgPack(pack);
    const flags = pack.meta.seeded_opening_flags!;
    const seed = seedSelecting(flags, OPENING_A);
    const valid = initStateForRpgPack(index, seed);
    const contentHash = hashState(pack);
    const validBytes = save(valid, contentHash, SAVE_MODE, { worldQuestId: pack.meta.id });
    const restored = load(validBytes, contentHash, SAVE_MODE).state;
    expect(restored).toEqual(valid);
    expect(() => assertRpgStateReferences(index, restored)).not.toThrow();

    const forgedBytes = (poison: (state: typeof valid) => void): string => {
      const bundle = JSON.parse(validBytes) as { state: typeof valid; stateHash: string };
      poison(bundle.state);
      // Local saves are editable by contract. Recompute the envelope hash so the
      // serialized probe reaches the pack-aware seeded-opening integrity gate.
      bundle.stateHash = hashState(bundle.state);
      return JSON.stringify(bundle);
    };
    const restoreAndCheck = (poison: (state: typeof valid) => void): void => {
      const loaded = load(forgedBytes(poison), contentHash, SAVE_MODE);
      assertRpgStateReferences(index, loaded.state);
    };

    expect(() =>
      restoreAndCheck((state) => {
        delete state.flags[OPENING_A];
      }),
    ).toThrow(/missing selected seeded opening flag/i);

    expect(() =>
      restoreAndCheck((state) => {
        state.flags[OPENING_A] = false;
      }),
    ).toThrow(SaveIntegrityError);
    expect(() =>
      restoreAndCheck((state) => {
        state.flags[OPENING_A] = false;
      }),
    ).toThrow(/invalid selected seeded opening flag state/i);

    expect(() =>
      restoreAndCheck((state) => {
        delete state.flags[OPENING_A];
        state.flags[OPENING_B] = true;
      }),
    ).toThrow(/missing selected seeded opening flag/i);

    expect(() =>
      restoreAndCheck((state) => {
        state.flags[OPENING_B] = true;
      }),
    ).toThrow(/includes unselected seeded opening flag/i);
  });

  it("makes every alternative feasible and live while rejecting an exact-one contradiction", () => {
    const healthy = validateRpgFoundation(openingPack());
    expect(
      healthy.findings.filter(
        (finding) =>
          (finding.code === "IMPOSSIBLE_GATE" || finding.code === "INERT_FLAG") &&
          finding.where.some((entry) => entry.includes("opening_")),
      ),
    ).toEqual([]);

    const oneUnread = openingPack();
    oneUnread.rooms[0]!.variants = oneUnread.rooms[0]!.variants?.filter(
      (variant) => !("has_flag" in variant.when[0]! && variant.when[0].has_flag === OPENING_B),
    );
    expect(
      validateRpgFoundation(oneUnread).findings.some(
        (finding) => finding.code === "INERT_FLAG" && finding.where.includes(`flag:${OPENING_B}`),
      ),
    ).toBe(true);

    const impossible = openingPack({
      interactionConditions: [{ all_of: [{ has_flag: OPENING_A }, { has_flag: OPENING_B }] }],
    });
    expect(
      validateRpgFoundation(impossible).findings.some(
        (finding) =>
          finding.code === "UNSATISFIABLE_CONDITION" &&
          finding.message.includes("mutually exclusive seeded opening flags"),
      ),
    ).toBe(true);

    const forbidsEveryAlternative = openingPack({
      interactionConditions: [{ all_of: [{ not_flag: OPENING_A }, { not_flag: OPENING_B }] }],
    });
    expect(
      validateRpgFoundation(forbidsEveryAlternative).findings.some(
        (finding) =>
          finding.code === "UNSATISFIABLE_CONDITION" &&
          finding.message.includes("forbids every seeded opening alternative"),
      ),
    ).toBe(true);
  });

  it("reserves alternatives from every other writer, including the launch boundary", () => {
    const initialized = openingPack({ flagsInit: [OPENING_A] });
    const setByEffect = openingPack({ startOnEnter: [{ set_flag: OPENING_A }] });
    const clearedByEffect = openingPack({ startOnEnter: [{ clear_flag: OPENING_A }] });
    const external = validateRpgFoundation(openingPack(), { extraSettableFlags: [OPENING_A] });
    const defeatFlag = openingPack();
    defeatFlag.enemies.push({
      id: "enemy_defeat_writer",
      name: "writer",
      description: "A writer.",
      room: "far",
      hp: 1,
      attack: 0,
      defense: 0,
      defeat_flag: OPENING_A,
      death_ending: "ending",
      on_defeat: [],
    });
    const maneuverFlag = openingPack();
    maneuverFlag.enemies.push({
      id: "enemy_maneuver_writer",
      name: "writer",
      description: "A writer.",
      room: "far",
      hp: 1,
      attack: 0,
      defense: 0,
      death_ending: "ending",
      on_defeat: [],
      maneuvers: [
        {
          id: "opening_writer",
          command: "Commit the writer.",
          conditions: [],
          result_flag: OPENING_A,
          attack_bonus: 1,
          defense_bonus: 0,
          narration: "The writer commits.",
        },
      ],
    });
    const onDefeatEffect = openingPack();
    onDefeatEffect.enemies.push({
      id: "enemy_on_defeat_writer",
      name: "writer",
      description: "A writer.",
      room: "far",
      hp: 1,
      attack: 0,
      defense: 0,
      death_ending: "ending",
      on_defeat: [{ set_flag: OPENING_A }],
    });
    const launchCollision = openingPack({
      id: "wolf_winter_v1",
      seededOpeningFlags: [WOLF_WINTER_DISPATCH_DELAY_FLAG, OPENING_B],
    });

    for (const [label, report] of [
      ["flags_init", validateRpgFoundation(initialized)],
      ["set_flag", validateRpgFoundation(setByEffect)],
      ["clear_flag", validateRpgFoundation(clearedByEffect)],
      ["external", external],
      ["defeat_flag", validateRpgFoundation(defeatFlag)],
      ["maneuver_result_flag", validateRpgFoundation(maneuverFlag)],
      ["launch", validateRpgFoundation(launchCollision)],
    ] as const) {
      expect(
        report.findings.some((finding) => finding.code === "SEEDED_OPENING_FLAG_NOT_IMMUTABLE"),
        label,
      ).toBe(true);
    }

    const attributed = validateRpg(onDefeatEffect).findings.find(
      (finding) => finding.code === "SEEDED_OPENING_FLAG_NOT_IMMUTABLE",
    );
    expect(attributed?.message).toContain('enemy "enemy_on_defeat_writer" on_defeat set_flag');
    expect(attributed?.message).not.toContain("higher-level runtime boundary");
  });

  it("checks stable wins across every alternative and locates each offending branch", () => {
    const pack = openingPack({
      winConditions: [
        { id: "win_alpha", conditions: [{ has_flag: OPENING_A }], ending: "ending" },
        { id: "win_bravo", conditions: [{ has_flag: OPENING_B }], ending: "ending" },
      ],
    });
    const findings = validateRpgFoundation(pack).findings.filter(
      (finding) => finding.code === "WIN_FIRES_AT_START",
    );
    expect(findings.map((finding) => finding.where)).toEqual([
      ["win:win_alpha", `seeded_opening_flag:${OPENING_A}`],
      ["win:win_bravo", `seeded_opening_flag:${OPENING_B}`],
    ]);

    const legacy = openingPack({ seededOpeningFlags: [], winConditions: pack.win_conditions });
    const legacyFindings = validateRpgFoundation(legacy).findings.filter(
      (finding) => finding.code === "WIN_FIRES_AT_START",
    );
    expect(legacyFindings).toEqual([]);

    const legacyStartWin = openingPack({
      seededOpeningFlags: [],
      flagsInit: ["legacy_start"],
      winConditions: [
        { id: "legacy_win", conditions: [{ has_flag: "legacy_start" }], ending: "ending" },
      ],
    });
    expect(
      validateRpgFoundation(legacyStartWin).findings.find(
        (finding) => finding.code === "WIN_FIRES_AT_START",
      )?.where,
    ).toEqual(["win:legacy_win"]);
  });

  it("rejects campaign imports that try to choose or relabel an opening alternative", () => {
    const imports = CampaignCharacterImportsSchema.parse({
      version: 1,
      rules: [
        {
          id: "import:opening",
          type: "knowledge_to_flag",
          knowledge_id: "knowledge:opening",
          target_flag: OPENING_A,
        },
      ],
    });
    try {
      validateCampaignCharacterImportTargets(openingPack(), imports);
      throw new Error("Expected seeded opening import rejection.");
    } catch (error) {
      expect(error).toBeInstanceOf(CampaignCharacterImportTargetError);
      expect((error as CampaignCharacterImportTargetError).issues).toMatchObject([
        { code: "IMMUTABLE_SEEDED_OPENING_FLAG", ruleId: "import:opening" },
      ]);
    }
  });

  it("preserves selected ordinals, state, and validator results under identifier relabeling", () => {
    const pack = openingPack();
    const { pack: twin, relabeler } = relabelRpgPack(pack);
    const seed = 42;
    const originalFlag = seededOpeningFlagForSeed(pack.meta.seeded_opening_flags!, seed);
    const twinFlag = seededOpeningFlagForSeed(twin.meta.seeded_opening_flags!, seed);
    expect(twinFlag).toBe(relabeler.r(originalFlag));

    const originalState = initStateForRpgPack(indexRpgPack(pack), seed);
    const twinState = initStateForRpgPack(indexRpgPack(twin), seed);
    expect(twinState.flags[twinFlag]).toBe(true);
    expect(originalState.flags[originalFlag]).toBe(true);
    expect(findingCodes(twin)).toEqual(findingCodes(pack));
  });
});
