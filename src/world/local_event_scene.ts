import { z } from "zod";

export const LOCAL_EVENT_SCENE_VERSION = 1 as const;
export const LOCAL_EVENT_SCENE_MIN_OPTIONS = 2 as const;
export const LOCAL_EVENT_SCENE_MAX_OPTIONS = 4 as const;
export const LOCAL_EVENT_SCENE_MAX_MINUTES = 24 * 60;
export const LOCAL_EVENT_SCENE_MAX_RENOWN = 10;

const NON_BLANK_TEXT = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, {
    message: "Authored local-event scene text cannot be blank.",
  });

export const LocalEventSceneTermsSchema = z
  .object({
    minutes: z.number().int().positive().max(LOCAL_EVENT_SCENE_MAX_MINUTES),
    renown: z.number().int().min(1).max(LOCAL_EVENT_SCENE_MAX_RENOWN),
  })
  .strict();

export const LocalEventSceneOptionSchema = z
  .object({
    id: NON_BLANK_TEXT,
    title: NON_BLANK_TEXT,
    preview: NON_BLANK_TEXT,
    consequence: NON_BLANK_TEXT,
    terms: LocalEventSceneTermsSchema,
  })
  .strict();

export const LocalEventSceneSchema = z
  .object({
    version: z.literal(LOCAL_EVENT_SCENE_VERSION),
    id: NON_BLANK_TEXT,
    prompt: NON_BLANK_TEXT,
    required_poi_id: NON_BLANK_TEXT,
    required_contact_id: NON_BLANK_TEXT,
    forbids_completed_quests: z.array(NON_BLANK_TEXT).min(1).optional(),
    options: z
      .array(LocalEventSceneOptionSchema)
      .min(LOCAL_EVENT_SCENE_MIN_OPTIONS)
      .max(LOCAL_EVENT_SCENE_MAX_OPTIONS),
  })
  .strict()
  .superRefine((scene, context) => {
    const ids = new Set<string>();
    scene.options.forEach((option, index) => {
      if (ids.has(option.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options", index, "id"],
          message: `Duplicate local-event scene option id "${option.id}".`,
        });
      }
      ids.add(option.id);
    });
    const forbiddenQuestIds = new Set<string>();
    scene.forbids_completed_quests?.forEach((questId, index) => {
      if (forbiddenQuestIds.has(questId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["forbids_completed_quests", index],
          message: `Duplicate forbidden completed quest id "${questId}".`,
        });
      }
      forbiddenQuestIds.add(questId);
    });
  });

export type LocalEventScene = z.infer<typeof LocalEventSceneSchema>;
export type LocalEventSceneOption = z.infer<typeof LocalEventSceneOptionSchema>;
export type LocalEventSceneTerms = z.infer<typeof LocalEventSceneTermsSchema>;

export type LocalEventSceneConditionState = Readonly<{
  completedQuestIds: ReadonlySet<string>;
}>;

export type LocalEventSceneLegalTuple = readonly [
  id: string,
  title: string,
  preview: string,
  minutes: number,
  renown: number,
];

export function parseLocalEventScene(input: unknown): LocalEventScene {
  return LocalEventSceneSchema.parse(input);
}

/** Whether an unresolved authored choice still precedes every forbidden quest completion. */
export function localEventSceneRequirementsMet(
  scene: LocalEventScene,
  state: LocalEventSceneConditionState,
): boolean {
  const parsed = parseLocalEventScene(scene);
  return (parsed.forbids_completed_quests ?? []).every(
    (questId) => !state.completedQuestIds.has(questId),
  );
}

/** Resolve only an exact authored option id; labels and partial ids are never executable. */
export function resolveLocalEventSceneOption(
  scene: LocalEventScene,
  optionId: string,
): LocalEventSceneOption {
  const parsed = parseLocalEventScene(scene);
  const option = parsed.options.find((candidate) => candidate.id === optionId);
  if (!option) {
    throw new Error(`Unknown local-event scene option "${optionId}" for scene "${parsed.id}".`);
  }
  return LocalEventSceneOptionSchema.parse(option);
}

/** Canonical player-facing choices in authored order, with their exact executable terms. */
export function localEventSceneLegalTuples(
  scene: LocalEventScene,
): readonly LocalEventSceneLegalTuple[] {
  const parsed = parseLocalEventScene(scene);
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
