import { describe, expect, it } from "vitest";

import {
  buildCampaignCharacterState,
  createInitialCampaignCharacterState,
  type CampaignCharacterState,
} from "../../src/world/campaign_character_state.js";
import {
  OPENING_REGISTRATION_MAX_PROFILES,
  OPENING_REGISTRATION_MIN_PROFILES,
  OPENING_REGISTRATION_VERSION,
  applyOpeningRegistrationProfile,
  cloneOpeningRegistration,
  getOpeningRegistrationProfile,
  openingRegistrationProfileById,
  parseOpeningRegistration,
  type OpeningRegistration,
} from "../../src/world/opening_registration.js";

const PROFILE_IDS = [
  "background:road_warden",
  "background:market_runner",
  "background:union_repairer",
  "background:greenway_tracker",
  "background:ledger_clerk",
  "background:survey_assistant",
  "background:relief_medic",
  "background:freight_driver",
  "background:canal_boatman",
] as const;

function profileCharacter(profileId: string, index: number): CampaignCharacterState {
  return buildCampaignCharacterState({
    background: profileId,
    skills: [
      { skillId: `skill:registration_${String(index)}_secondary`, rank: 2 },
      { skillId: `skill:registration_${String(index)}_primary`, rank: (index % 5) + 1 },
    ],
    values: [{ valueId: `value:registration_${String(index)}`, strength: 3 }],
    money: 10 + index,
    abilities: [`ability:registration_${String(index)}`],
    knowledge: [`knowledge:registration_${String(index)}`],
  });
}

function registrationInput(profileCount: number = OPENING_REGISTRATION_MIN_PROFILES) {
  return {
    version: OPENING_REGISTRATION_VERSION,
    id: "albany:relief_registration",
    home: "albany",
    area: "municipal_ledger",
    contact: "rowan_quill",
    title: "Put a lived history on the relief docket",
    message: "Rowan waits for the history you are willing to make part of the public record.",
    profiles: PROFILE_IDS.slice(0, profileCount).map((id, index) => ({
      id,
      title: `Registration profile ${String(index + 1)}`,
      summary: `A concise history for profile ${String(index + 1)}.`,
      preview: `Fieldcraft, obligations, and resources for profile ${String(index + 1)}.`,
      consequence: `This history becomes the character's permanent background ${id}.`,
      character: profileCharacter(id, index),
    })),
  };
}

function registration(
  profileCount: number = OPENING_REGISTRATION_MIN_PROFILES,
): OpeningRegistration {
  return parseOpeningRegistration(registrationInput(profileCount));
}

describe("opening registration", () => {
  it("parses a strict versioned scene with four through eight complete profiles", () => {
    const minimum = parseOpeningRegistration(registrationInput(OPENING_REGISTRATION_MIN_PROFILES));
    const maximum = parseOpeningRegistration(registrationInput(OPENING_REGISTRATION_MAX_PROFILES));

    expect(minimum.version).toBe(OPENING_REGISTRATION_VERSION);
    expect(minimum.profiles).toHaveLength(OPENING_REGISTRATION_MIN_PROFILES);
    expect(maximum.profiles).toHaveLength(OPENING_REGISTRATION_MAX_PROFILES);
    expect(minimum.profiles[0]!.character.background).toBe(minimum.profiles[0]!.id);
    expect(Object.keys(minimum).sort()).toEqual([
      "area",
      "contact",
      "home",
      "id",
      "message",
      "profiles",
      "title",
      "version",
    ]);
    expect(Object.keys(minimum.profiles[0]!).sort()).toEqual([
      "character",
      "consequence",
      "id",
      "preview",
      "summary",
      "title",
    ]);
  });

  it("deeply detaches parsed and cloned scenes", () => {
    const input = registrationInput();
    const parsed = parseOpeningRegistration(input);
    const cloned = cloneOpeningRegistration(parsed);
    const parsedBefore = structuredClone(parsed);

    input.title = "Changed authoring title";
    input.profiles[0]!.summary = "Changed authoring summary";
    input.profiles[0]!.character.skills[0]!.rank = 5;
    cloned.message = "Changed cloned message";
    cloned.profiles[0]!.preview = "Changed cloned preview";
    cloned.profiles[0]!.character.knowledge.push("knowledge:changed_clone");

    expect(parsed).toEqual(parsedBefore);
    expect(cloned).not.toEqual(parsed);
  });

  it("rejects wrong versions, unknown fields, blank text, and profile counts outside bounds", () => {
    const input = registrationInput();

    expect(() => parseOpeningRegistration({ ...input, version: 2 })).toThrow();
    expect(() => parseOpeningRegistration({ ...input, unknown: true })).toThrow();
    expect(() => parseOpeningRegistration({ ...input, message: "   " })).toThrow(/blank/i);
    expect(() =>
      parseOpeningRegistration({
        ...input,
        profiles: input.profiles.map((profile, index) =>
          index === 0 ? { ...profile, unknown: true } : profile,
        ),
      }),
    ).toThrow();
    expect(() => parseOpeningRegistration(registrationInput(3))).toThrow();
    expect(() => parseOpeningRegistration(registrationInput(9))).toThrow();
  });

  it("requires unique namespaced profile ids that exactly match non-null backgrounds", () => {
    const unnamespaced = registrationInput();
    unnamespaced.profiles[0]!.id = "road_warden" as (typeof PROFILE_IDS)[number];
    unnamespaced.profiles[0]!.character.background = "road_warden";
    expect(() => parseOpeningRegistration(unnamespaced)).toThrow();

    const missingBackground = registrationInput();
    missingBackground.profiles[0]!.character.background = null;
    expect(() => parseOpeningRegistration(missingBackground)).toThrow(/must have a background/i);

    const mismatched = registrationInput();
    mismatched.profiles[0]!.character.background = "background:different_history";
    expect(() => parseOpeningRegistration(mismatched)).toThrow(/must equal its profile id/i);

    const duplicate = registrationInput();
    duplicate.profiles[1]!.id = duplicate.profiles[0]!.id;
    duplicate.profiles[1]!.character.background = duplicate.profiles[0]!.id;
    expect(() => parseOpeningRegistration(duplicate)).toThrow(/duplicate.*profile id/i);
  });

  it("rejects noncanonical or structurally invalid character packages", () => {
    const outOfOrder = registrationInput();
    outOfOrder.profiles[0]!.character.skills.reverse();
    expect(() => parseOpeningRegistration(outOfOrder)).toThrow(/canonical order/i);

    const duplicateSkill = registrationInput();
    duplicateSkill.profiles[0]!.character.skills[1] = {
      ...duplicateSkill.profiles[0]!.character.skills[0]!,
    };
    expect(() => parseOpeningRegistration(duplicateSkill)).toThrow(/duplicate canonical id/i);

    const invalidHealth = registrationInput();
    invalidHealth.profiles[0]!.character.health.current =
      invalidHealth.profiles[0]!.character.health.max + 1;
    expect(() => parseOpeningRegistration(invalidHealth)).toThrow(/cannot exceed/i);

    const unexpectedCharacterField = registrationInput();
    const first = unexpectedCharacterField.profiles[0]!;
    first.character = {
      ...first.character,
      questLocalFlags: ["not_persistent"],
    } as CampaignCharacterState;
    expect(() => parseOpeningRegistration(unexpectedCharacterField)).toThrow();
  });

  it("looks up detached profiles and returns null for an unknown id", () => {
    const scene = registration();
    const sceneBefore = structuredClone(scene);
    const selected = openingRegistrationProfileById(scene, PROFILE_IDS[1]);
    const selectedThroughAlias = getOpeningRegistrationProfile(scene, PROFILE_IDS[1]);

    expect(selected).toEqual(scene.profiles[1]);
    expect(selectedThroughAlias).toEqual(selected);
    expect(openingRegistrationProfileById(scene, "background:not_authored")).toBeNull();

    selected!.title = "Mutated selection";
    selected!.character.health.current = 0;
    selected!.character.skills[0]!.rank = 5;
    expect(scene).toEqual(sceneBefore);
  });

  it("applies the selected complete package only to the exact default character", () => {
    const scene = registration();
    const character = createInitialCampaignCharacterState();
    const characterBefore = structuredClone(character);
    const sceneBefore = structuredClone(scene);
    const selected = applyOpeningRegistrationProfile({
      registration: scene,
      character,
      profileId: PROFILE_IDS[2],
    });

    expect(selected).toEqual(scene.profiles[2]!.character);
    expect(selected.background).toBe(PROFILE_IDS[2]);
    expect(character).toEqual(characterBefore);
    expect(scene).toEqual(sceneBefore);

    selected.money += 100;
    selected.skills[0]!.rank = 5;
    selected.knowledge.push("knowledge:after_registration");
    expect(scene).toEqual(sceneBefore);
  });

  it("rejects repeat or non-neutral application without mutating either input", () => {
    const alteredCharacters = [
      createInitialCampaignCharacterState("background:already_registered"),
      buildCampaignCharacterState({ money: 1 }),
      buildCampaignCharacterState({ health: { current: 29, max: 30 } }),
      buildCampaignCharacterState({ abilities: ["ability:preexisting"] }),
    ];

    for (const character of alteredCharacters) {
      const scene = registration();
      const sceneBefore = structuredClone(scene);
      const characterBefore = structuredClone(character);

      expect(() =>
        applyOpeningRegistrationProfile({
          registration: scene,
          character,
          profileId: PROFILE_IDS[0],
        }),
      ).toThrow(/exact default campaign character/i);
      expect(scene).toEqual(sceneBefore);
      expect(character).toEqual(characterBefore);
    }
  });

  it("rejects an unknown selection and invalid registration transactionally", () => {
    const scene = registration();
    const character = createInitialCampaignCharacterState();
    const sceneBefore = structuredClone(scene);
    const characterBefore = structuredClone(character);

    expect(() =>
      applyOpeningRegistrationProfile({
        registration: scene,
        character,
        profileId: "background:not_authored",
      }),
    ).toThrow(/unknown opening registration profile/i);
    expect(scene).toEqual(sceneBefore);
    expect(character).toEqual(characterBefore);

    const invalid = structuredClone(scene);
    invalid.profiles[0]!.character.background = "background:forged";
    expect(() =>
      applyOpeningRegistrationProfile({
        registration: invalid as OpeningRegistration,
        character,
        profileId: PROFILE_IDS[0],
      }),
    ).toThrow(/must equal its profile id/i);
    expect(character).toEqual(characterBefore);
  });
});
