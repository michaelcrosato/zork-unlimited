/** Stable public action id for one authored enemy maneuver. */
export function maneuverActionId(enemyId: string, maneuverId: string): string {
  // Keep the established public spelling for compatibility. The RPG validator
  // rejects the rare ambiguous enemy/maneuver id pair instead of changing ids
  // already consumed by MCP, UI, traces, and scripted play.
  return `maneuver_${enemyId}_${maneuverId}`;
}
