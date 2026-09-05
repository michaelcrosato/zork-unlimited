/**
 * Locale-independent string ordering for the world layer (bug_0608).
 *
 * `String.prototype.localeCompare` with no locale argument sorts by the HOST's ICU
 * locale, so the order of roads, areas, characters, jobs and snapshot map keys — the
 * order a blind agent navigates by index, and the order the session snapshot hash is
 * built from — changed with the machine running the engine (Czech collation treats
 * "ch" as one letter after "h"; Lithuanian sorts "Y" beside "I"). `src/rpg` has always
 * refused `localeCompare` for exactly this reason. These two comparators are pure
 * functions of UTF-16 code units and give the same order on every host.
 */

/** Plain UTF-16 code-unit order. The canonical order for ids and keys. */
export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function foldAsciiCase(text: string): string {
  return text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

/**
 * Code-unit order after folding ASCII letters to lower case, with plain code-unit order
 * as the tiebreak. This is the comparator for display strings (names, titles, regions):
 * on the shipped world it reproduces the order English collation produced, including
 * the one place a lowercase event title and a Title-Case job title tie on their area,
 * while depending on nothing but the strings themselves.
 */
export function compareCaseFoldedCodeUnits(left: string, right: string): number {
  return (
    compareCodeUnits(foldAsciiCase(left), foldAsciiCase(right)) || compareCodeUnits(left, right)
  );
}
