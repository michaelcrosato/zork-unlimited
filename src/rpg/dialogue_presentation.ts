import type { GameState } from "../core/state.js";
import { nodeText } from "./model.js";
import type { DialogueNode, DialogueTopic } from "./schema.js";

const WOLF_WINTER_INITIAL_STRATEGY_SOURCE =
  "Albany sent you. Save/cost—HUNT: herd+stores/wolves risk death; LURE: herd+pack/feed+paling/cattle risk; DRIVE: people+pack/outer line; crisis=wound/2 cattle/rig; FORTIFY: herd+pack+byre/property vs seals+help. Name HUNT here, or cross uncommitted into it; crossing north commits it and closes the other plans.";

const WOLF_WINTER_INITIAL_STRATEGY_SCORECARD = `Albany sent you. Choose what must stand at dawn. Every plan can finish Wolf-Winter; none saves everything, and I name no best answer.

HUNT — Outcome: hold Cade's ground, herd, and relief stores with prepared combat. Cost: wolves may die; failure can lose cattle or the line. Albany: bloodshed changes Greenway work; damage remains.
LURE — Outcome: relocate the pack beyond the breach and keep the herd. Cost: last feed, broken paling, two cattle risked on a first-cast foul. Albany: broken boundary or scattered cattle change Station response.
DRIVE — Outcome: evacuate people and herd; force the pack clear. Cost: abandon the outer steading; Crisis takes a wound, two cattle, or rig. Albany: the line and chosen loss remain.
FORTIFY — Outcome: keep household, herd, and pack apart until dawn. Cost: no retreat; expose property for Cade's aid or spend public seals without it. Albany: terms remain; a no-loss hold opens no Cade repair dispatch.

Questions teach; they do not commit. HUNT commits on uncommitted north crossing; other plans commit in branches. Any commitment closes the other three.`;

const JUNE_WOLF_LINE_BOUNDARY_SOURCE =
  "Rail now: spear funnel, not a living turn. If a committed first feed cast fouls, a brace can pen the yearling alive. Commit feed, drive, or seals before crossing. Name HUNT here to hold the breach, or choose a living plan; crossing north commits it, and first wolf down ends our agreement.";

const JUNE_WOLF_LINE_BOUNDARY_SCORECARD =
  "Choose by outcome. HUNT holds Cade's ground through prepared combat; LURE relocates the pack; DRIVE evacuates the outer line; FORTIFY keeps household, herd, and pack apart until dawn. Cade commits the three noncombat plans before you cross. For HUNT, release me now to preserve our agreement without field aid, or keep me on cattle and accept that the first wolf death breaks it. Crossing north commits HUNT.";

const WOLF_WINTER_DIALOGUE_COPY: Readonly<Record<string, string>> = Object.freeze({
  [JUNE_WOLF_LINE_BOUNDARY_SOURCE]: JUNE_WOLF_LINE_BOUNDARY_SCORECARD,
  "Exact: wedge or bind for a safer spear line, but neither spares the yearling on an ordinary hunt. I take cattle. Cade's living plans close when you cross. Once a wolf falls, I return alone.":
    "Exact: wedge or bind for safer combat, but HUNT still means a wolf can die. I hold cattle until that happens; then our agreement breaks and I return alone. Cade's three noncombat plans close when you cross.",
  "Your cattle-first terms already stand; nothing here commits a plan. Cade waits beside the day-book: settle the feed lure, pack drive, or joined seals with him. Until one is committed, north remains closed.":
    "Your cattle-first terms already stand; nothing here commits a plan. Cade waits beside the day-book: settle LURE relocation, DRIVE evacuation, or FORTIFY until dawn with him. Until one is committed, north remains closed.",
  "Agreed. I take the cattle-first return before your spear crosses. Our word stays intact, but my rope, lower gate, and dawn brace go with me: no later LURE, DRIVE, or FORTIFY intervention, and no help against a wolf. Choosing release commits HUNT now and closes those three living plans. North opens under your hand alone; ordinary yard preparation and backtracking remain available.":
    "Agreed. I take the cattle-first return before your spear crosses. Our word stays intact, but my rope, lower gate, and dawn brace go with me: no later field intervention and no help against a wolf. Release commits HUNT now and closes LURE, DRIVE, and FORTIFY. North opens under your hand alone; ordinary yard preparation and backtracking remain available.",
});

const WOLF_WINTER_TOPIC_COPY: Readonly<Record<string, string>> = Object.freeze({
  "HUNT — Hold breach: cattle/reserves safe; wolves may die. Learn +2 attack/+5 tally. Leave; if June, acknowledge; north = HUNT; close LURE/DRIVE/FORTIFY.":
    "HUNT — Hold ground/stores in prepared combat. Risk: wolf deaths; failure risks cattle/line. +2 attack/+5 tally; north commits.",
  "Commit HUNT when you cross north — Hold breach: cattle/reserves safe; wolves may die; LURE/DRIVE/FORTIFY then close.":
    "Commit HUNT north — Hold ground in prepared combat. Risk: wolf deaths; failure risks cattle/line. Closes LURE/DRIVE/FORTIFY.",
  "LURE — Draw the pack out; protects cattle and wolves; spends finite feed, leaves the paling broken, and a foul risks cattle. Inspect.":
    "LURE — Relocate pack beyond the breach; keep the herd. Cost: last feed, broken paling, two cattle risked on a foul. Inspect.",
  "DRIVE — Move herd and pack; protects people and wolves; abandons the outer line, then a crisis costs wound, cattle, or rig. Inspect.":
    "DRIVE — Evacuate people/herd; force pack clear. Cost: abandon outer steading; Crisis takes wound, two cattle, or rig. Inspect.",
  "FORTIFY — Seal until dawn; protects byre, cattle, and wolves; trade outer property against public seals and Cade's aid. Inspect.":
    "FORTIFY — Keep household/herd/pack apart to dawn. Cost: no retreat; expose property/Cade aid or spend seals/no aid. Inspect.",
  "Ask how Cade could draw the pack out alive instead.":
    "Ask how Cade could relocate the pack beyond the breach with feed.",
  "Decline for now; crossing uncommitted chooses hunt-and-hold and permanently retires all living plans.":
    "Decline for now; crossing uncommitted chooses HUNT and permanently retires LURE, DRIVE, and FORTIFY.",
  "Release June and commit HUNT now — Preserve the relationship; close LURE/DRIVE/FORTIFY; forfeit every later June field intervention; gain no combat or cattle bonus.":
    "HUNT / release June — Hold ground alone; preserve agreement; lose June's field aid. Commits HUNT; closes LURE/DRIVE/FORTIFY.",
  "Commit HUNT when you cross north and keep June — Hold breach; LURE/DRIVE/FORTIFY then close; first wolf death ends June's agreement by breaking it.":
    "HUNT / keep June — Hold ground; June stays cattle-first. First wolf death breaks agreement. North commits; closes other plans.",
  "Keep June's terms and ask Cade here for the feed lure, pack drive, or joined-seal plan.":
    "Choose a noncombat plan — Ask Cade to commit LURE relocation, DRIVE evacuation, or FORTIFY until dawn.",
  "End the exchange; the north gate is open, and Cade's living commitments remain available until you cross.":
    "End exchange; north is open. Cade's LURE, DRIVE, and FORTIFY commitments remain until you cross.",
  "End the exchange and return to Cade beside the day-book; all three living plans remain open, and north remains closed.":
    "End the exchange and return to Cade; LURE, DRIVE, and FORTIFY remain open, and north remains closed.",
  "End the exchange; HUNT is committed and north is open. Yard preparation remains, but June and the three living plans do not reopen.":
    "End exchange; HUNT is committed and north is open. Yard prep remains; June, LURE, DRIVE, and FORTIFY do not reopen.",
});

function presentWolfWinterStrategyInspection(authoredText: string): string {
  return authoredText
    .replaceAll(
      "FEED LURE can save pack/herd",
      "FEED LURE relocates pack beyond the breach while holding the herd at Cade's yard",
    )
    .replaceAll(
      "SIGNAL DRIVE can spare pack/people",
      "SIGNAL DRIVE evacuates people/herd while forcing the pack clear",
    )
    .replaceAll(
      "DRIVE spares pack/people",
      "DRIVE evacuates people/herd while forcing the pack clear",
    )
    .replaceAll(
      "FORTIFY saves lives/herd/byre",
      "FORTIFY keeps household/herd/pack apart through dawn",
    )
    .replaceAll("Living plans must be committed", "LURE, DRIVE, and FORTIFY must be committed")
    .replaceAll("living commitment", "LURE, DRIVE, or FORTIFY commitment");
}

/**
 * Resolve one player-visible dialogue line for both action narration and the
 * active observation. Presentation-only overlays live here so every client sees
 * the same words without changing authored content hashes or deterministic state.
 */
export function dialogueNodeText(state: GameState, node: DialogueNode): string {
  const authoredText = nodeText(node, state);
  // Authored prose, unlike pack/node/flag ids, survives the engine's supported
  // identifier relabeling and distinguishes the base root from its reactive variants.
  const source = authoredText.trimEnd();
  if (source === WOLF_WINTER_INITIAL_STRATEGY_SOURCE) {
    return WOLF_WINTER_INITIAL_STRATEGY_SCORECARD;
  }
  return presentWolfWinterStrategyInspection(WOLF_WINTER_DIALOGUE_COPY[source] ?? authoredText);
}

/** Resolve the authored topic label through the same cross-client presentation layer. */
export function dialogueTopicPrompt(topic: DialogueTopic): string {
  return WOLF_WINTER_TOPIC_COPY[topic.prompt] ?? topic.prompt;
}
