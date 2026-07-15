import { z } from "zod";

import {
  CampaignCharacterIdSchema,
  CampaignCharacterStateSchema,
  cloneCampaignCharacterState,
  createInitialCampaignCharacterState,
  parseCampaignCharacterState,
  serializeCampaignCharacterState,
  type CampaignCharacterState,
} from "./campaign_character_state.js";

export const OPENING_REGISTRATION_VERSION = 1 as const;
export const OPENING_REGISTRATION_MIN_PROFILES = 4 as const;
export const OPENING_REGISTRATION_MAX_PROFILES = 8 as const;

const AUTHORED_TEXT = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, {
    message: "Authored text cannot be blank.",
  });

/**
 * One complete, canonical campaign-character package presented at registration.
 * The profile id is also the persistent background id; there is no second
 * mapping table that can drift away from the state the player receives.
 */
export const OpeningRegistrationProfileSchema = z
  .object({
    id: CampaignCharacterIdSchema,
    title: AUTHORED_TEXT,
    summary: AUTHORED_TEXT,
    preview: AUTHORED_TEXT,
    consequence: AUTHORED_TEXT,
    character: CampaignCharacterStateSchema,
  })
  .strict()
  .superRefine((profile, ctx) => {
    if (profile.character.background === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["character", "background"],
        message: "A registration profile character must have a background.",
      });
    } else if (profile.character.background !== profile.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["character", "background"],
        message: "A registration profile character background must equal its profile id.",
      });
    }
  });

/** A single manifest-authored opening registration scene. */
export const OpeningRegistrationSchema = z
  .object({
    version: z.literal(OPENING_REGISTRATION_VERSION),
    id: CampaignCharacterIdSchema,
    home: AUTHORED_TEXT,
    area: AUTHORED_TEXT,
    contact: AUTHORED_TEXT,
    title: AUTHORED_TEXT,
    message: AUTHORED_TEXT,
    profiles: z
      .array(OpeningRegistrationProfileSchema)
      .min(OPENING_REGISTRATION_MIN_PROFILES)
      .max(OPENING_REGISTRATION_MAX_PROFILES),
  })
  .strict()
  .superRefine((registration, ctx) => {
    const profileIds = new Set<string>();
    registration.profiles.forEach((profile, index) => {
      if (profileIds.has(profile.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["profiles", index, "id"],
          message: `Duplicate opening registration profile id "${profile.id}".`,
        });
      }
      profileIds.add(profile.id);
    });
  });

export type OpeningRegistrationProfile = z.infer<typeof OpeningRegistrationProfileSchema>;
export type OpeningRegistration = z.infer<typeof OpeningRegistrationSchema>;

/** Parse and deeply detach a manifest-authored registration scene. */
export function parseOpeningRegistration(input: unknown): OpeningRegistration {
  return OpeningRegistrationSchema.parse(input);
}

export function cloneOpeningRegistration(registration: OpeningRegistration): OpeningRegistration {
  return parseOpeningRegistration(registration);
}

/** Resolve a profile by id and return a detached package (null when absent). */
export function openingRegistrationProfileById(
  registration: OpeningRegistration,
  profileId: string,
): OpeningRegistrationProfile | null {
  const parsed = parseOpeningRegistration(registration);
  const profile = parsed.profiles.find((entry) => entry.id === profileId);
  return profile === undefined ? null : OpeningRegistrationProfileSchema.parse(profile);
}

/** Alias with conventional getter naming for presentation/runtime callers. */
export const getOpeningRegistrationProfile = openingRegistrationProfileById;

const DEFAULT_CHARACTER_SERIALIZED = serializeCampaignCharacterState(
  createInitialCampaignCharacterState(),
);

/**
 * Apply one registration package atomically. Registration is a one-time
 * boundary: only the exact neutral campaign character may be replaced. Both
 * inputs are validated and detached before any selection is returned.
 */
export function applyOpeningRegistrationProfile(args: {
  registration: OpeningRegistration;
  character: CampaignCharacterState;
  profileId: string;
}): CampaignCharacterState {
  const registration = parseOpeningRegistration(args.registration);
  const character = parseCampaignCharacterState(args.character);

  if (serializeCampaignCharacterState(character) !== DEFAULT_CHARACTER_SERIALIZED) {
    throw new Error(
      "Opening registration can only be applied to the exact default campaign character.",
    );
  }

  const profile = registration.profiles.find((entry) => entry.id === args.profileId);
  if (profile === undefined) {
    throw new Error(`Unknown opening registration profile "${args.profileId}".`);
  }

  return cloneCampaignCharacterState(profile.character);
}
