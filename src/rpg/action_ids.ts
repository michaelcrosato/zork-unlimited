/** Stable public action id for one authored enemy maneuver. */
export function maneuverActionId(enemyId: string, maneuverId: string): string {
  // Keep the established public spelling for compatibility. The RPG validator
  // rejects the rare ambiguous enemy/maneuver id pair instead of changing ids
  // already consumed by MCP, UI, traces, and scripted play.
  return `maneuver_${enemyId}_${maneuverId}`;
}

export type UseActionIdentity = {
  id: string;
  /** Accepted only as an input compatibility spelling; never a listed menu id. */
  inputAliases?: readonly string[];
};

/**
 * Stable public identity for authored USE actions.
 *
 * Most USE identities remain the long-established verb-agnostic target shape.
 * Wolf-Winter's paling has five mutually-exclusive, materially distinct stages,
 * however. Give those stages truthful compact ids without changing the shipped
 * YAML: its parsed-source content hash is also the compatibility fence for
 * standalone saves and traces.
 */
export function authoredUseActionIdentity(args: {
  packId: string;
  item?: string;
  target: string;
  commandVerb?: string;
  legacyId: string;
}): UseActionIdentity {
  if (
    args.packId !== "wolf_winter_v1" ||
    args.item !== undefined ||
    args.target !== "paling_rail"
  ) {
    return { id: args.legacyId };
  }

  const stageId =
    {
      set: "set_paling_rail",
      wedge: "wedge_paling_rail",
      splice: "splice_paling_rail",
      turn: "turn_paling_rail_scent_pen",
      bind: "bind_split_paling_rail",
    }[args.commandVerb ?? ""] ?? null;

  return stageId === null ? { id: args.legacyId } : { id: stageId, inputAliases: [args.legacyId] };
}
