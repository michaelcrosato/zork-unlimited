import { z } from "zod";

export const CANONICAL_WORLD_ID = "charter_marches";
export const CANONICAL_WORLD_NAME = "The Charter Marches";
export const CANONICAL_HUB_CITY = "Charterhaven";

export const WorldGraphNodeKindSchema = z.enum(["hub", "district", "route", "quest"]);

export const WorldGraphNodeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    kind: WorldGraphNodeKindSchema,
    district: z.string().min(1).optional(),
    pack: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((node, ctx) => {
    if (node.kind === "quest" && !node.pack) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "quest graph nodes must declare a pack path",
        path: ["pack"],
      });
    }
    if (node.kind !== "quest" && node.pack) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "only quest graph nodes may declare a pack path",
        path: ["pack"],
      });
    }
  });

export const WorldGraphEdgeSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    route: z.string().min(1),
  })
  .strict();

export const WorldGraphSchema = z
  .object({
    hub: z.string().min(1),
    nodes: z.array(WorldGraphNodeSchema).min(1),
    edges: z.array(WorldGraphEdgeSchema),
  })
  .strict();

export const WorldManifestSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    hub: z.string().min(1),
    premise: z.string().min(1).optional(),
    rule: z.string().min(1).optional(),
    hub_districts: z.array(z.string().min(1)).optional(),
    frontiers: z.array(z.string().min(1)).optional(),
    graph: WorldGraphSchema,
  })
  .strict();

export type WorldGraphNode = z.infer<typeof WorldGraphNodeSchema>;
export type WorldGraphEdge = z.infer<typeof WorldGraphEdgeSchema>;
export type WorldGraph = z.infer<typeof WorldGraphSchema>;
export type WorldManifest = z.infer<typeof WorldManifestSchema>;

/**
 * Shared world binding for shipped packs.
 *
 * This is optional at the schema layer so minimal test fixtures and generated eval
 * packs can stay focused. The shipped-content regression suite makes it mandatory
 * for content/{parser,rpg}/pack: those are no longer separate campaigns, but
 * quest/area entries in the Charter Marches world.
 */
export const WorldBindingSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    hub: z.string().min(1),
    district: z.string().min(1),
    quest: z.string().min(1),
    role: z.string().min(1),
    connection: z.string().min(1),
  })
  .strict();

export type WorldBinding = z.infer<typeof WorldBindingSchema>;
