import { z } from "zod";

export const CAMPAIGN_IMPORT_RECEIPT_VERSION = 1 as const;

const NamespacedIdSchema = z
  .string()
  .min(3)
  .max(96)
  .regex(/^[a-z][a-z0-9_-]*(?::[a-z0-9][a-z0-9_-]*)+$/);
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);

const ReceiptEffectSchema = z.discriminatedUnion("type", [
  z
    .object({
      rule_id: NamespacedIdSchema,
      type: z.literal("health_current_to_var"),
      target_var: z.string().min(1),
      value: z.number().int().min(1).max(999),
    })
    .strict(),
  z
    .object({
      rule_id: NamespacedIdSchema,
      type: z.literal("skill_rank_to_var"),
      target_var: z.string().min(1),
      value: z.number().int().min(1).max(5),
    })
    .strict(),
  ...(
    ["background_to_flag", "ability_to_flag", "knowledge_to_flag", "companion_to_flag"] as const
  ).map((type) =>
    z
      .object({
        rule_id: NamespacedIdSchema,
        type: z.literal(type),
        target_flag: z.string().min(1),
        value: z.literal(true),
      })
      .strict(),
  ),
  z
    .object({
      rule_id: NamespacedIdSchema,
      type: z.literal("equipment_to_item"),
      target_object: z.string().min(1),
    })
    .strict(),
]);

function writer(effect: z.infer<typeof ReceiptEffectSchema>): string {
  if (effect.type === "health_current_to_var" || effect.type === "skill_rank_to_var") {
    return `var:${effect.target_var}`;
  }
  if (effect.type === "equipment_to_item") return `item:${effect.target_object}`;
  return `flag:${effect.target_flag}`;
}

export const CampaignImportReceiptSchema = z
  .object({
    version: z.literal(CAMPAIGN_IMPORT_RECEIPT_VERSION),
    catalog_hash: HashSchema,
    // Creation-time audit commitment emitted by the trusted in-process
    // projector. Local save files are intentionally user-editable, so this is
    // provenance for deterministic traces—not a cryptographic authenticator.
    character_hash: HashSchema,
    applied_rules: z.array(NamespacedIdSchema).min(1),
    effects: z.array(ReceiptEffectSchema).min(1),
  })
  .strict()
  .superRefine((receipt, ctx) => {
    const seenRules = new Set<string>();
    const seenWriters = new Set<string>();
    let previousRule: string | null = null;
    receipt.applied_rules.forEach((ruleId, index) => {
      if (seenRules.has(ruleId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["applied_rules", index],
          message: `Duplicate applied rule "${ruleId}".`,
        });
      }
      if (previousRule !== null && ruleId < previousRule) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["applied_rules", index],
          message: "Applied rules must be in ascending canonical order.",
        });
      }
      seenRules.add(ruleId);
      previousRule = ruleId;
    });

    let previousEffectRule: string | null = null;
    receipt.effects.forEach((effect, index) => {
      if (previousEffectRule !== null && effect.rule_id < previousEffectRule) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["effects", index],
          message: "Import effects must be in ascending rule-id order.",
        });
      }
      const target = writer(effect);
      if (seenWriters.has(target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["effects", index],
          message: `Multiple import effects write "${target}".`,
        });
      }
      seenWriters.add(target);
      previousEffectRule = effect.rule_id;
    });

    const effectRules = receipt.effects.map((effect) => effect.rule_id);
    if (
      effectRules.length !== receipt.applied_rules.length ||
      effectRules.some((ruleId, index) => ruleId !== receipt.applied_rules[index])
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effects"],
        message: "Import effects must correspond one-for-one with applied_rules.",
      });
    }
  });

export type CampaignImportReceiptEffect = z.infer<typeof ReceiptEffectSchema>;
export type CampaignImportReceipt = z.infer<typeof CampaignImportReceiptSchema>;

export function cloneCampaignImportReceipt(receipt: CampaignImportReceipt): CampaignImportReceipt {
  return CampaignImportReceiptSchema.parse(receipt);
}
