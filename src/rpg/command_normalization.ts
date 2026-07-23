/** Normalize one controlled RPG command without changing its punctuation. */
export function normalizeRpgCommand(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Topic ids and aliases are author-facing identifiers. Terminal input treats
 * underscores and hyphens as spaces so `commit_lure`, `commit-lure`, and
 * `commit lure` share one controlled spelling. */
export function normalizeRpgTopicCommand(value: string): string {
  return normalizeRpgCommand(value.replace(/[_-]+/g, " "));
}

export type QualifiedRpgAsk = {
  speaker: string;
  topic: string;
};

/** Recognize the speaker-qualified ASK form before topic aliases are resolved.
 * `ask about <topic>` remains the ordinary unqualified form. */
export function parseQualifiedRpgAskCommand(value: string): QualifiedRpgAsk | null {
  const match = normalizeRpgCommand(value).match(/^ask\s+(.+?)\s+about\s+(.+)$/);
  if (!match) return null;
  return { speaker: match[1]!, topic: match[2]! };
}
