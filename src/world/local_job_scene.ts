import { z } from "zod";

export const LOCAL_JOB_SCENE_VERSION = 1 as const;
export const LOCAL_JOB_SCENE_MIN_OPTIONS = 2 as const;
export const LOCAL_JOB_SCENE_MAX_OPTIONS = 4 as const;
/** Keep prerequisite fan-out auditable alongside the scene's bounded 2-4 choices. */
export const LOCAL_JOB_SCENE_MAX_REQUIRED_QUESTS = 4 as const;
export const LOCAL_JOB_SCENE_MAX_MINUTES = 24 * 60;
export const LOCAL_JOB_SCENE_MAX_RENOWN = 10;

const NON_BLANK_TEXT = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, {
    message: "Authored local-job scene text cannot be blank.",
  });

export const LocalJobSceneTermsSchema = z
  .object({
    minutes: z.number().int().positive().max(LOCAL_JOB_SCENE_MAX_MINUTES),
    renown: z.number().int().min(1).max(LOCAL_JOB_SCENE_MAX_RENOWN),
  })
  .strict();

export const LocalJobSceneOptionSchema = z
  .object({
    id: NON_BLANK_TEXT,
    title: NON_BLANK_TEXT,
    preview: NON_BLANK_TEXT,
    consequence: NON_BLANK_TEXT,
    terms: LocalJobSceneTermsSchema,
  })
  .strict();

export const LocalJobSceneSchema = z
  .object({
    version: z.literal(LOCAL_JOB_SCENE_VERSION),
    id: NON_BLANK_TEXT,
    prompt: NON_BLANK_TEXT,
    required_poi_id: NON_BLANK_TEXT,
    required_contact_id: NON_BLANK_TEXT,
    requires_completed_quests: z
      .array(NON_BLANK_TEXT)
      .min(1)
      .max(LOCAL_JOB_SCENE_MAX_REQUIRED_QUESTS),
    options: z
      .array(LocalJobSceneOptionSchema)
      .min(LOCAL_JOB_SCENE_MIN_OPTIONS)
      .max(LOCAL_JOB_SCENE_MAX_OPTIONS),
  })
  .strict()
  .superRefine((scene, context) => {
    const ids = new Set<string>();
    scene.options.forEach((option, index) => {
      if (ids.has(option.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options", index, "id"],
          message: `Duplicate local-job scene option id "${option.id}".`,
        });
      }
      ids.add(option.id);
    });
    const prerequisiteIds = new Set<string>();
    scene.requires_completed_quests.forEach((questId, index) => {
      if (prerequisiteIds.has(questId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["requires_completed_quests", index],
          message: `Duplicate local-job scene prerequisite quest id "${questId}".`,
        });
      }
      prerequisiteIds.add(questId);
    });
  });

export type LocalJobSceneTerms = z.infer<typeof LocalJobSceneTermsSchema>;
export type LocalJobSceneOption = z.infer<typeof LocalJobSceneOptionSchema>;
export type LocalJobScene = z.infer<typeof LocalJobSceneSchema>;

export type LocalJobSceneLegalTuple = readonly [
  id: string,
  title: string,
  preview: string,
  minutes: number,
  renown: number,
];

export function parseLocalJobScene(input: unknown): LocalJobScene {
  return LocalJobSceneSchema.parse(input);
}

/** Resolve only an exact authored option id; labels and partial ids are never executable. */
export function resolveLocalJobSceneOption(
  scene: LocalJobScene,
  optionId: string,
): LocalJobSceneOption {
  const parsed = parseLocalJobScene(scene);
  const option = parsed.options.find((candidate) => candidate.id === optionId);
  if (!option) {
    throw new Error(`Unknown local-job scene option "${optionId}" for scene "${parsed.id}".`);
  }
  return LocalJobSceneOptionSchema.parse(option);
}

/** Canonical player-facing choices in authored order, with their exact executable terms. */
export function localJobSceneLegalTuples(scene: LocalJobScene): readonly LocalJobSceneLegalTuple[] {
  const parsed = parseLocalJobScene(scene);
  return Object.freeze(
    parsed.options.map((option) =>
      Object.freeze([
        option.id,
        option.title,
        option.preview,
        option.terms.minutes,
        option.terms.renown,
      ] as const),
    ),
  );
}
