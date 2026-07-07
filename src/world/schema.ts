import { z } from "zod";

/**
 * Optional per-pack world binding — dormant, content-agnostic scaffolding.
 *
 * A quest pack MAY carry a one-time `meta.world` framing ("You have come from
 * {hub} to {district} …") rendered by `openingWorldText` (src/world/observation.ts).
 * Shipped packs no longer carry it: the New York overworld
 * (content/world/new_york_overworld.json) is the single world AND the shipped quest
 * registry, and it frames every quest through its own local notice-board discovery.
 * The field stays OPTIONAL so generated/eval packs and any future authored pack can
 * opt into a bespoke intro without an engine fork.
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
