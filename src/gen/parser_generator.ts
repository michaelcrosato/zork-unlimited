/**
 * Procedural PARSER pack generator — the third slice of "evolve the eval distribution"
 * (docs/CURRENT_PLAN.md), completing the generator trilogy across all three game modes.
 *
 * Why a parser generator now. The CYOA and RPG generators (src/gen/{cyoa,rpg}_generator.ts,
 * bug_0156/0159) already mint fresh, never-seen, validator-clean packs the structural proofs
 * re-check every cycle, and bug_0163 sealed a held-out corpus of them — but ONLY for two of the
 * three modes. The parser mode (the strictest validator in the suite, src/validate/parser_validator.ts:
 * soft-locks, obtainability fixpoints, quest-item loss, dialogue termination, score economy, win-
 * fires-at-start) had no generator, so its 1200-line verifier was still a FROZEN target exercised
 * only against two hand-authored packs. A frozen eval set is exactly the condition under which a
 * self-improving agent's verifier stops being a moving target and becomes a memorisable one (the
 * reward-hacking result the program is built to resist; docs/ULTRAPLAN-2026-06-02.md, the assessor's
 * own 0.5-floor collapse). This module closes that gap: it mints schema-valid, validator-clean,
 * exhaustively-solvable parser packs on demand, so the parser bar too is held against fresh content.
 *
 * What it emits (and the bar it clears). `generateParserPack(seed)` is a PURE, DETERMINISTIC
 * function (same seed ⇒ byte-identical pack — no Date/Math.random, §8.5) that emits a `ParserPack`
 * of the signature AdventureForge shape, a small fully-honest dungeon:
 *   - a FOUR-room spine (entrance → hub → inner → goal) whose three non-win rooms are strongly
 *     connected (no quest-item soft-lock), the goal gated behind a flag-locked exit;
 *   - a readable CLUE that awards the first milestone score and an NPC that signposts the route
 *     (two in-world clue sources, §17);
 *   - a THREE-TIER key chain (the v3 deepening, bug_0199): a LESSER key recovered from an unlocked
 *     coffer in the entrance opens a LOCKED strongbox in the hub holding a MIDDLE key, which opens a
 *     LOCKED inner chest in the inner room, and only the GREAT key cased inside THAT opens the gate.
 *     So the goal's obtainability chain runs key→lock→key→lock→key→lock across three rooms — a
 *     depth-3 fixpoint, exercising the parser validator's obtainability/soft-lock pass far harder
 *     than v2's two tiers (the named deepening from bug_0198: the parser generator had stopped at a
 *     single v2 tier while the RPG generator went to v3);
 *   - a first-class UNLOCK strongbox (the lesser key opens it, awarding the second milestone score),
 *     a first-class UNLOCK inner chest (the middle key opens it, awarding the third milestone score),
 *     and a first-class UNLOCK gate (the great key opens the way north, sets the gate flag, awards
 *     the fourth milestone score) — the canonical win on reaching the goal;
 *   - a telegraphed DEATH fork: the SAME great key opens a plainly-warned hazard that ends the game
 *     (the failure pole every blind pass asks for, the sealed_crypt bound_tomb discipline) — never
 *     an ambush, the warning is cut into its prose.
 * The output is validated by the SAME `validateParser` and proven solvable by the SAME exhaustive
 * BFS that guard the shipped parser packs, so a generated pack is held to the identical bar (see
 * tests/unit/parser_generator.test.ts). The score economy is exact: read (+5) + strongbox (+5) +
 * inner chest (+5) + gate (+5) = the declared max_score 20, each one-shot, reachable and never
 * farmable.
 *
 * Generated packs are NOT committed under content/parser/pack: they are an on-demand eval
 * distribution, not curated showcase content, so they incur no blind-playtest obligation and never
 * pollute the hand-authored set. bin/seal-corpus.ts persists a fixed seed window of them under the
 * held-out `corpus/` dir (bug_0163).
 */
import { ParserPackSchema, type ParserPack } from "../parser/schema.js";

/**
 * Generator version stamp (the held-out corpus, bug_0163). This does NOT change any emitted
 * pack — it is recorded only in `corpus/manifest.json` so a FUTURE change to the generator
 * surfaces as a loud, diagnosable manifest mismatch ("generator changed", a deliberate version
 * bump) rather than silent corpus rot vs a tampered content hash. Bump it whenever the emitted
 * pack shape changes; the re-seal then re-stamps every entry.
 *
 * v2 (bug_0168): the emitted spine grew a SECOND lock tier — an entrance coffer holds a lesser key
 * that opens a locked hub strongbox holding the great key — deepening the obtainability fixpoint to
 * depth-2 across two rooms. Every emitted pack changed shape, so this bump + a `npm run corpus:seal`
 * re-stamp every parser corpus entry (held_out_corpus_sealed.test.ts checks version == this).
 *
 * v3 (bug_0199): the spine grew a THIRD lock tier AND a fourth room (inner). bug_0198's mode-matched
 * benchmark found the parser held-out split read bot-EASIER than the hand-authored packs (the
 * curated→held-out gap was INVERTED, −0.058): the parser generator had stopped at the single v2
 * tier while the RPG generator went all the way to v3. v3 closes that: a LESSER key (entrance coffer)
 * opens a locked hub strongbox holding a MIDDLE key, which opens a locked inner chest (the new inner
 * room) holding the GREAT key, which opens the goal gate (win) and the hazard (death fork). The
 * obtainability fixpoint is now depth-3 across three rooms, the score economy 5+5+5+5 = 20. Every
 * emitted pack changed shape, so this bump + a `npm run corpus:seal` re-stamp every parser corpus
 * entry (held_out_corpus_sealed.test.ts checks version == this).
 */
export const PARSER_GENERATOR_VERSION = 3;

/**
 * A theme is the cosmetic skin over the fixed structural skeleton: it varies the prose, the
 * setting, and the noun for every object so two seeds read as different dungeons, while the
 * proof-relevant shape (spine, gate, key, fork, scoring) is constant. Every `*Name`/`*Alias`
 * within one theme must be mutually distinct (the parser AMBIGUOUS_ALIAS check rejects a name
 * or alias shared by two objects); the assembler keeps directional/structural prose central so
 * a description can never contradict an exit.
 */
type Theme = {
  key: string;
  title: string;
  setting: string; // a short scene-setting clause, e.g. "a drowned chapel under the fens"
  entranceFlavor: string; // one sentence describing the entrance room
  hubFlavor: string; // one sentence describing the hub room
  innerFlavor: string; // one sentence describing the inner room (the new v3 gated room)
  goalFlavor: string; // one sentence describing the goal room (the prize)
  goalShort: string; // a short noun phrase for the goal, used in the opened-gate variant
  clueName: string;
  clueAlias: string;
  clueDesc: string;
  clueText: string; // the in-world hint (read_text) the clue carries
  cofferName: string; // the OUTER, unlocked container (in the entrance) holding the lesser key
  cofferAlias: string;
  cofferDesc: string;
  lesserKeyName: string; // tier-1 key: opens the strongbox, not the gate (the depth-2 chain)
  lesserKeyAlias: string;
  lesserKeyDesc: string;
  strongboxName: string; // the tier-2 LOCKED container (in the hub) the lesser key opens
  strongboxAlias: string;
  strongboxDesc: string;
  middleKeyName: string; // tier-2 MIDDLE key (cased in the strongbox): opens the inner chest only
  middleKeyAlias: string;
  middleKeyDesc: string;
  innerChestName: string; // the tier-3 LOCKED container (in the inner room) the middle key opens
  innerChestAlias: string;
  innerChestDesc: string;
  keyName: string; // tier-3 GREAT key (cased in the inner chest): the gate/hazard fork
  keyAlias: string;
  keyDesc: string;
  gateName: string;
  gateAlias: string;
  gateDesc: string; // must telegraph that the key opens the way on
  gateNarrate: string; // the rich first-class UNLOCK line for the gate
  hazardName: string;
  hazardAlias: string;
  hazardDesc: string; // must telegraph DEATH, one-way, in plain prose (never an ambush)
  hazardNarrate: string; // the death line on breaking the hazard's lock
  npcName: string;
  npcDesc: string;
  npcGreet: string;
  npcHint: string; // names the route: key in the coffer opens the gate
  winTitle: string;
  winText: string;
  doomTitle: string;
  doomText: string;
};

const THEMES: readonly Theme[] = [
  {
    key: "crypt",
    title: "The Reliquary Vault",
    setting: "a drowned chapel under the fens",
    entranceFlavor:
      "Black water laps the threshold of a chapel the marsh has half-swallowed; a graven slab leans by the door.",
    hubFlavor:
      "The nave opens into a low vault where the dead were laid; a verger keeps a guttering lamp.",
    innerFlavor:
      "Beyond the nave a crypt-cell is cut into the living rock, an undertaker's chest sealed in its alcove.",
    goalFlavor:
      "Past the gate the reliquary stands untouched on its plinth — the saint's casket you waded the fens to find.",
    goalShort: "the reliquary chamber",
    clueName: "graven slab",
    clueAlias: "slab",
    clueDesc: "A weathered slab, an epitaph still legible under the lichen.",
    clueText:
      "Cut deep into the stone: 'THE FONT GIVES UP THE LESSER KEY; THE LESSER OPENS THE CASKET, THE CASKET YIELDS THE CHANTRY KEY, AND THE CHANTRY KEY OPENS THE CRYPT-CHEST WHERE THE IRON THAT OPENS THE VAULT IS LAID.'",
    cofferName: "stone font",
    cofferAlias: "font",
    cofferDesc: "A dry baptismal font; a small key glints in its basin.",
    lesserKeyName: "brass font-key",
    lesserKeyAlias: "fontkey",
    lesserKeyDesc:
      "A small brass key from the font — too slight for any great lock, but it fits a casket's wards.",
    strongboxName: "reliquary casket",
    strongboxAlias: "casket",
    strongboxDesc:
      "An iron-bound casket set on the bier, its lock cut for a small key; something heavier shifts within.",
    middleKeyName: "chantry key",
    middleKeyAlias: "chantrykey",
    middleKeyDesc:
      "A worn chantry key from the casket — no use on the vault, but it throws a crypt-chest's lock.",
    innerChestName: "crypt-chest",
    innerChestAlias: "cryptchest",
    innerChestDesc:
      "An undertaker's iron crypt-chest in the cell's alcove, its lock cut for a slight key; the iron key is laid within.",
    keyName: "iron key",
    keyAlias: "key",
    keyDesc: "A heavy iron key, black with age — fit for a great lock.",
    gateName: "iron gate",
    gateAlias: "gate",
    gateDesc:
      "A heavy iron gate bars the way north. Its great lock is plainly shaped for an iron key.",
    gateNarrate:
      "The iron key turns with a groan and the gate swings inward — beyond it, north, the reliquary you came so far to find.",
    hazardName: "lead-sealed tomb",
    hazardAlias: "tomb",
    hazardDesc:
      "One squat tomb stands apart, banded in iron and run round with lead, a fever-warning cut into its lid. The same iron key would open it — but the lead was laid to keep the living OUT and the pestilence IN, and there is no breathing it back out.",
    hazardNarrate:
      "The lead seams crack and the breath of the fever-dead sighs up out of the dark — sealed down here a hundred years and none of its hunger lost. You understand what the lead held back a moment too late.",
    npcName: "the verger",
    npcDesc: "A stooped verger, lamp in hand, watching you sidelong.",
    npcGreet: "Few come willingly down to the sealed vault, traveler.",
    npcHint:
      "The font holds a small brass key; it opens the casket on the bier, the chantry key inside opens the crypt-chest in the cell beyond, and the iron key laid up in there opens the gate.",
    winTitle: "Into the Reliquary",
    winText:
      "The gate yields, and the cold breath of the vault rolls over you. You step through to the saint's casket at last. *** You have won. ***",
    doomTitle: "What the Lead Held Back",
    doomText:
      "You came for the reliquary and learned, too late, what the crypt was sealed against. The plague takes you down among the fever-dead. *** You have died. ***",
  },
  {
    key: "lighthouse",
    title: "The Wreckers' Light",
    setting: "a storm-bound lighthouse on a wreckers' coast",
    entranceFlavor:
      "Spray bursts over the rocks at the tower's foot; a tide-board is bolted by the inner door.",
    hubFlavor:
      "The lamp-room is cold and dark, the great lens unlit; a old keeper hunches by the dead wick.",
    innerFlavor:
      "A cramped service-gallery rings the lens-housing, a watch-locker bolted under the trimming-bench.",
    goalFlavor:
      "Past the hatch the true channel-beacon waits, trimmed and ready to light the ship clear of the reef.",
    goalShort: "the beacon stage",
    clueName: "tide-board",
    clueAlias: "board",
    clueDesc: "A slate tide-board, a keeper's hand chalked across it.",
    clueText:
      "Chalked plain: 'THE OIL-LOCKER KEEPS THE LOCKER KEY; IT OPENS THE SEA-CHEST, THE SEA-CHEST GIVES THE WATCH KEY, AND THE WATCH KEY OPENS THE WATCH-LOCKER WHERE THE BRASS KEY THAT LIFTS THE HATCH IS KEPT.'",
    cofferName: "oil-locker",
    cofferAlias: "locker",
    cofferDesc: "A squat iron oil-locker; a stubby key rattles loose inside.",
    lesserKeyName: "locker key",
    lesserKeyAlias: "lockerkey",
    lesserKeyDesc:
      "A stubby key from the oil-locker — no good on the hatch, but it throws a sea-chest's lock.",
    strongboxName: "keeper's sea-chest",
    strongboxAlias: "seachest",
    strongboxDesc:
      "A banded sea-chest under the bench, its lock cut for a small key; a watch key lies within.",
    middleKeyName: "watch key",
    middleKeyAlias: "watchkey",
    middleKeyDesc:
      "A worn watch key from the sea-chest — no good on the hatch, but it opens the watch-locker.",
    innerChestName: "watch-locker",
    innerChestAlias: "watchlocker",
    innerChestDesc:
      "A bolted watch-locker under the trimming-bench, its lock cut for a small key; the brass hatch-key lies within.",
    keyName: "brass key",
    keyAlias: "key",
    keyDesc: "A salt-greened brass key, fit for a heavy hatch-lock.",
    gateName: "lamp-room hatch",
    gateAlias: "hatch",
    gateDesc:
      "A bolted hatch leads up north to the lamp stage. Its lock is plainly shaped for a brass key.",
    gateNarrate:
      "The brass key bites and the hatch lifts on its hinges — above, north, the true beacon waits to be lit.",
    hazardName: "signal-rocket",
    hazardAlias: "rocket",
    hazardDesc:
      "A wreckers' signal-rocket sits primed in a cradle, its firing-lock keyed like the hatch. Loose it and the false light flares — but the powder is rotten and packed wrong, and the man who lit the last one is a stain on the wall. This is a one-way mistake.",
    hazardNarrate:
      "The key turns the firing-lock and the rotten charge goes all at once, not up the flue but out into the room. There is a white roar and then nothing at all.",
    npcName: "the old keeper",
    npcDesc: "A salt-cured old keeper, hands shaking, eyes on the dark sea.",
    npcGreet: "You'll have come for the light, then. They always do.",
    npcHint:
      "Find the locker key in the oil-locker; it opens my sea-chest, the watch key inside opens the watch-locker in the gallery beyond, and the brass key kept in there lifts the hatch.",
    winTitle: "The True Light",
    winText:
      "The hatch lifts and you set the beacon burning down the true channel. Out on the black water a ship's lamp answers and stands off the reef. *** You have won. ***",
    doomTitle: "The Rotten Charge",
    doomText:
      "You reached for the wreckers' trade and it took you the way it took the last keeper — all at once, in a white roar. The reef keeps its ships and its fools alike. *** You have died. ***",
  },
  {
    key: "forge",
    title: "The Cold Forge",
    setting: "a war-foundry gone quiet between musters",
    entranceFlavor:
      "Cold slag crunches underfoot at the foundry door; an order-slate is propped against the jamb.",
    hubFlavor:
      "The casting floor stands silent, moulds cooling in their pits; a tally-master lingers by the dead crucible.",
    innerFlavor:
      "Off the casting floor the pattern-shop stands shuttered, a bonded coffer chained to the master's bench.",
    goalFlavor:
      "Past the wicket the master-pattern lies in its case — the proof-mould the whole foundry was raised to guard.",
    goalShort: "the pattern-store",
    clueName: "order-slate",
    clueAlias: "slate",
    clueDesc: "A chalked order-slate, the quartermaster's hand still legible.",
    clueText:
      "Chalked across it: 'THE TROUGH KEEPS THE TALLY KEY; IT OPENS THE STRONGBOX, THE STRONGBOX HOLDS THE BENCH KEY, AND THE BENCH KEY OPENS THE BONDED COFFER WHERE THE WARD-KEY THAT OPENS THE WICKET IS KEPT.'",
    cofferName: "quench-trough",
    cofferAlias: "trough",
    cofferDesc: "A long iron quench-trough, dry now; a light key lies on its bed.",
    lesserKeyName: "tally key",
    lesserKeyAlias: "tallykey",
    lesserKeyDesc:
      "A light tally key from the trough — it won't bite the wicket, but it springs a strongbox.",
    strongboxName: "iron strongbox",
    strongboxAlias: "strongbox",
    strongboxDesc:
      "A squat iron strongbox bolted to the floor, its lock cut for a small key; a bench key is kept inside.",
    middleKeyName: "bench key",
    middleKeyAlias: "benchkey",
    middleKeyDesc:
      "A toothed bench key from the strongbox — useless on the wicket, but it opens the bonded coffer.",
    innerChestName: "bonded coffer",
    innerChestAlias: "coffer-bonded",
    innerChestDesc:
      "A bonded coffer chained to the master's bench, its lock cut for a small key; the ward-key is kept inside.",
    keyName: "ward-key",
    keyAlias: "key",
    keyDesc: "A toothed ward-key of blued steel, cut for a foundry lock.",
    gateName: "store wicket",
    gateAlias: "wicket",
    gateDesc:
      "An iron wicket-gate closes off the north store. Its lock is plainly cut for a ward-key.",
    gateNarrate:
      "The ward-key throws the bolt and the wicket grinds open — beyond it, north, the master-pattern in its case.",
    hazardName: "blast-furnace door",
    hazardAlias: "furnace",
    hazardDesc:
      "The great blast-furnace stands banked but not dead, its charging-door locked to the same ward-key. The gauge reads full of pent gas; crack the door cold and it back-drafts. The scorch-marks on the floor are a man's shadow. Open it and you do not close it again.",
    hazardNarrate:
      "The ward-key frees the charging-door, the banked gas finds air, and the furnace breathes back in a sheet of fire that fills the floor. You are the next shadow on the stone.",
    npcName: "the tally-master",
    npcDesc: "A soot-streaked tally-master, ledger under one arm, sizing you up.",
    npcGreet: "No muster today. So what brings you to the cold forge?",
    npcHint:
      "The trough holds the tally key; it opens the strongbox by the wall, the bench key inside opens the bonded coffer in the pattern-shop beyond, and the ward-key in there opens the store wicket.",
    winTitle: "The Master-Pattern",
    winText:
      "The wicket opens and the master-pattern is yours, the proof the whole foundry guarded. You carry it out into the cold morning. *** You have won. ***",
    doomTitle: "The Back-Draft",
    doomText:
      "You set the ward-key to the furnace and it answered with fire, the way banked iron always answers a fool. No pattern, no morning — only one more shadow burned into the foundry floor. *** You have died. ***",
  },
  {
    key: "archive",
    title: "The Sunken Archive",
    setting: "a flooded record-vault beneath a drowned chancery",
    entranceFlavor:
      "Water stands shin-deep over the archive steps; a duty-roll is pinned above the tide-line by the door.",
    hubFlavor:
      "The muniment room rises out of the flood on a dry shelf of stone; an under-clerk waits among the ruined presses.",
    innerFlavor:
      "A deed-room opens off the muniment shelf, a registry casket bricked into its dry wall.",
    goalFlavor:
      "Past the grille the sealed roll lies dry in its lead tube — the one record the flood and the fire both failed to take.",
    goalShort: "the sealed-roll niche",
    clueName: "duty-roll",
    clueAlias: "roll",
    clueDesc: "A pinned duty-roll, the porter's hand legible above the water-stain.",
    clueText:
      "Inked plain: 'THE DESPATCH-BOX HOLDS THE CLERK'S KEY; IT OPENS THE MUNIMENT CHEST, THE MUNIMENT CHEST GIVES THE REGISTRY KEY, AND THE REGISTRY KEY OPENS THE REGISTRY CASKET WHERE THE GILT KEY THAT OPENS THE GRILLE IS CASED.'",
    cofferName: "despatch-box",
    cofferAlias: "box",
    cofferDesc: "A japanned despatch-box, lid unlatched; a slight key gleams within.",
    lesserKeyName: "clerk's key",
    lesserKeyAlias: "clerkkey",
    lesserKeyDesc:
      "A slight clerk's key from the despatch-box — useless on the grille, but it opens a muniment chest.",
    strongboxName: "muniment chest",
    strongboxAlias: "muniment",
    strongboxDesc:
      "An iron muniment chest on the dry shelf, its lock cut for a small key; a registry key is cased within.",
    middleKeyName: "registry key",
    middleKeyAlias: "registrykey",
    middleKeyDesc:
      "A slight registry key from the muniment chest — useless on the grille, but it opens the registry casket.",
    innerChestName: "registry casket",
    innerChestAlias: "registrycasket",
    innerChestDesc:
      "An iron registry casket bricked into the deed-room wall, its lock cut for a small key; the gilt key is cased within.",
    keyName: "gilt key",
    keyAlias: "key",
    keyDesc: "A small gilt key, tarnished green, cut for a record-grille.",
    gateName: "record grille",
    gateAlias: "grille",
    gateDesc:
      "An iron record-grille closes the north niche. Its lock is plainly cut for the gilt key.",
    gateNarrate:
      "The gilt key turns and the grille folds back — beyond it, north, the sealed roll in its lead tube.",
    hazardName: "fumigation valve",
    hazardAlias: "valve",
    hazardDesc:
      "A brass fumigation valve stands keyed to the same gilt key, feeding the old vermin-gas the archive used to kill the bookworm. The lines were never bled. Open it in this dead air and you breathe what was meant for the worms. There is no second breath of it.",
    hazardNarrate:
      "The gilt key frees the valve and the sweet vermin-gas pours up out of the bled lines into the still air. You have one breath to know it for what it is, and it is the last.",
    npcName: "the under-clerk",
    npcDesc: "A wax-pale under-clerk, sleeves rolled, ink to the elbow.",
    npcGreet: "Mind the water. Few come down to the sunken archive on purpose.",
    npcHint:
      "The despatch-box holds the clerk's key; it opens the muniment chest, the registry key inside opens the registry casket in the deed-room beyond, and the gilt key cased in there opens the record grille.",
    winTitle: "The Sealed Roll",
    winText:
      "The grille folds back and the sealed roll is in your hands at last, dry and whole through flood and fire. You climb back toward the light with the record safe. *** You have won. ***",
    doomTitle: "What the Lines Still Held",
    doomText:
      "You set the gilt key to the valve and the archive's old poison answered, patient in the unbled lines. No roll, no climb back — only one more breath that was never meant for you. *** You have died. ***",
  },
  {
    key: "barrow",
    title: "The Frost Barrow",
    setting: "a king's barrow opened by a winter landslip",
    entranceFlavor:
      "Cold air breathes out of a barrow the frost cracked open; a rune-stone leans where the turf fell away.",
    hubFlavor:
      "The barrow's antechamber is hung with rime, grave-goods stacked in the dark; a barrow-warden's ghost keeps its watch.",
    innerFlavor:
      "A side-niche opens off the antechamber, a thrall's chest crouched among the frost-bound offerings.",
    goalFlavor:
      "Past the slab-door the king lies crowned on his bier — the circlet of pale gold you broke the frost to reach.",
    goalShort: "the king's chamber",
    clueName: "rune-stone",
    clueAlias: "runestone",
    clueDesc: "A leaning rune-stone, its incised verse still sharp under the frost.",
    clueText:
      "Bitten into the rune-stone: 'THE URN KEEPS THE HORN KEY; IT OPENS THE RELIQUARY, THE RELIQUARY GIVES THE THRALL KEY, AND THE THRALL KEY OPENS THE THRALL-CHEST WHERE THE BONE KEY THAT OPENS THE SLAB IS LAID.'",
    cofferName: "grave-urn",
    cofferAlias: "urn",
    cofferDesc: "A wide grave-urn, its lid askew; a small pale key rests inside.",
    lesserKeyName: "horn key",
    lesserKeyAlias: "hornkey",
    lesserKeyDesc:
      "A little key of carved horn from the urn — no use on the slab, but it fits a reliquary's lock.",
    strongboxName: "warded reliquary",
    strongboxAlias: "reliquary",
    strongboxDesc:
      "A small iron-strapped reliquary among the grave-goods, its lock cut for a slight key; a thrall key lies within.",
    middleKeyName: "thrall key",
    middleKeyAlias: "thrallkey",
    middleKeyDesc:
      "A little key of bound iron from the reliquary — no use on the slab, but it opens the thrall-chest.",
    innerChestName: "thrall-chest",
    innerChestAlias: "thrallchest",
    innerChestDesc:
      "A frost-bound thrall-chest in the side-niche, its lock cut for a slight key; the bone key is laid within.",
    keyName: "bone key",
    keyAlias: "key",
    keyDesc: "A key carved from old bone, yellowed and cold, cut for a barrow-lock.",
    gateName: "slab-door",
    gateAlias: "slab",
    gateDesc:
      "A great stone slab-door seals the north chamber. Its keyhole is plainly cut for a bone key.",
    gateNarrate:
      "The bone key fits the cold lock and the slab grinds aside — beyond it, north, the king crowned on his bier.",
    hazardName: "warded cist",
    hazardAlias: "cist",
    hazardDesc:
      "Set apart in the floor, a small stone cist is bound with the same bone-key lock and graven all round with binding-runes. The verse warns what was put down here was put down to STAY: a draugr, barrow-wight, the hungry dead. Break the binding and it rises, and it does not lie back down.",
    hazardNarrate:
      "The bone key breaks the binding-runes and the lid heaves aside. What was bound here rises out of the cold with a grave-light in its eyes, and its cold hands find you before you can so much as turn.",
    npcName: "the barrow-warden",
    npcDesc: "A grey barrow-warden's shade, sword across its knees, watching without malice.",
    npcGreet: "Living feet, in the king's frost barrow. Tread carefully, grave-breaker.",
    npcHint:
      "The grave-urn holds a horn key; it opens the reliquary among the grave-goods, the thrall key inside opens the thrall-chest in the side-niche beyond, and the bone key in there opens the slab.",
    winTitle: "The Pale Circlet",
    winText:
      "The slab grinds aside and the king's circlet of pale gold is yours, cold and heavy and whole. You bear it back up into the living air. *** You have won. ***",
    doomTitle: "What Was Bound to Stay",
    doomText:
      "You broke the binding the runes begged you leave, and the barrow's hungry dead rose to keep its own. No circlet, no living air — only the cold, and the grave-light, and the cold hands. *** You have died. ***",
  },
  {
    key: "weir",
    title: "The Drowned Mill",
    setting: "a mill-house standing in its own flooded race",
    entranceFlavor:
      "The mill-race has burst its banks and stands black in the doorway; a grant-board hangs above the wet by the door.",
    hubFlavor:
      "The grinding-floor is awash to the ankle, the great stones stilled; a drowned-out miller works the gloom.",
    innerFlavor:
      "A bolting-room stands on a higher step out of the flood, a toll-box screwed to the bolting-frame.",
    goalFlavor:
      "Past the sluice-gate the strong-room stands dry on its mound — the grant and the gold the mill was built to keep.",
    goalShort: "the strong-room",
    clueName: "grant-board",
    clueAlias: "grantboard",
    clueDesc: "A framed grant-board, the water-court's hand legible behind the glass.",
    clueText:
      "Lettered plain: 'THE MEAL-ARK HOLDS THE MILLER'S KEY; IT OPENS THE STRONGBOX, THE STRONGBOX GIVES THE TOLL KEY, AND THE TOLL KEY OPENS THE TOLL-BOX WHERE THE COPPER KEY THAT FREES THE SLUICE IS KEPT.'",
    cofferName: "meal-ark",
    cofferAlias: "ark",
    cofferDesc: "A great oak meal-ark, lid thrown back; a small key sits in the spoiled meal.",
    lesserKeyName: "miller's key",
    lesserKeyAlias: "millerkey",
    lesserKeyDesc:
      "A small miller's key from the meal-ark — it won't free the sluice, but it opens a strongbox.",
    strongboxName: "oak strongbox",
    strongboxAlias: "strongbox",
    strongboxDesc:
      "An oak strongbox on the dry mound, its lock cut for a small key; a toll key sits inside.",
    middleKeyName: "toll key",
    middleKeyAlias: "tollkey",
    middleKeyDesc:
      "A small toll key from the strongbox — it won't free the sluice, but it opens the toll-box.",
    innerChestName: "toll-box",
    innerChestAlias: "tollbox",
    innerChestDesc:
      "An iron toll-box screwed to the bolting-frame, its lock cut for a small key; the copper key sits inside.",
    keyName: "copper key",
    keyAlias: "key",
    keyDesc: "A green copper key, water-pitted, cut for a sluice-lock.",
    gateName: "sluice-gate",
    gateAlias: "sluice",
    gateDesc:
      "An iron sluice-gate holds back the north room. Its lock is plainly cut for a copper key.",
    gateNarrate:
      "The copper key frees the sluice-gate and it hauls up on its chain — beyond it, north, the strong-room on its dry mound.",
    hazardName: "head-race penstock",
    hazardAlias: "penstock",
    hazardDesc:
      "The head-race penstock is keyed to the same copper key, the whole flooded pond pent black behind it. Throw it in here, below the water-line, and the race comes down the throat of the mill all at once. The last miller who tried it was found three fields down. Once thrown it cannot be shut.",
    hazardNarrate:
      "The copper key frees the penstock and the whole pent pond comes down the race at once, black and roaring, and takes you off your feet and out through the mill before you can draw breath. They will find you three fields down, if they find you.",
    npcName: "the drowned-out miller",
    npcDesc: "A gaunt miller, sodden to the waist, bailing at a flood he cannot win.",
    npcGreet: "Come for the grant, have you? Everyone wants the mill but the water.",
    npcHint:
      "The meal-ark holds the miller's key; it opens the strongbox on the mound, the toll key inside opens the toll-box in the bolting-room beyond, and the copper key in there frees the sluice-gate.",
    winTitle: "The Strong-Room",
    winText:
      "The sluice hauls up and the strong-room is open, the grant and the gold dry on their mound through all the flood. You carry them out past the black water. *** You have won. ***",
    doomTitle: "Three Fields Down",
    doomText:
      "You set the copper key to the penstock and the pent race answered the way it answered the last fool — all at once, black and roaring. No grant, no gold — only the long cold ride three fields down. *** You have died. ***",
  },
];

/**
 * Generate a schema-valid PARSER pack from an integer seed. Deterministic and pure: the same
 * seed always yields the identical pack. The structure is fixed (entrance → hub → inner → goal
 * spine, a flag-locked goal, a clue + NPC signposting, a THREE-TIER key chain — a lesser key in
 * an entrance coffer opens a locked hub strongbox holding a MIDDLE key that opens a locked inner
 * chest holding the great key that opens the gate — a first-class UNLOCK at each lock tier, a
 * telegraphed death fork, an exact 5+5+5+5 = 20 score economy); the seed selects the theme, so the
 * eval distribution varies without any route ever becoming unprovable or any check flagging. The
 * depth-3 obtainability chain (key→lock→key→lock→key→lock, spanning three rooms) is the point: it
 * exercises the parser validator's obtainability/soft-lock/score fixpoints far harder than v2's two
 * tiers (bug_0199 — the parser generator had stopped at the single v2 tier while RPG went to v3,
 * leaving generated parser packs structurally shallower than the hand-authored ones; bug_0198).
 *
 * The returned object is run through `ParserPackSchema.parse`, so a malformed emission throws
 * HERE (a generator self-check) rather than slipping downstream — and the result carries the
 * schema's applied defaults exactly like a pack loaded from YAML.
 */
export function generateParserPack(seed: number): ParserPack {
  const n = Math.abs(Math.trunc(seed));
  const theme = THEMES[n % THEMES.length] as Theme;
  const id = `genpar_${n}_v1`;

  const GATE_OPEN = "gate_open";
  const HUB_OPEN = "hub_open"; // set when the hub strongbox is unlocked; opens the way deeper in
  const READ_CLUE = "read_clue";
  const ENDING_WIN = "ending_win";
  const ENDING_DOOM = "ending_doom";

  // ── Rooms: a FOUR-room spine (entrance → hub → inner → goal). The three non-win rooms
  //    (entrance, hub, inner) are strongly connected via the north/south pairs, so EVERY takeable
  //    quest_critical key can be carried to where it is spent and never stranded (parser
  //    SOFTLOCK_QUEST_ITEM): the lesser key is taken in the entrance coffer and spent on the hub
  //    strongbox; the middle key is taken from the strongbox and spent on the inner chest; the great
  //    key is taken from the inner chest and spent in the inner room. TWO inner exits are flag-locked:
  //    hub→inner opens only once the strongbox is unlocked (the HUB_OPEN flag — so the deep cell is
  //    reachable only AFTER tier-2 is solved, not by free locomotion), and inner→goal opens only once
  //    the gate is unlocked (GATE_OPEN). Both south returns stay ungated, so no carried key is ever
  //    stranded. The inner room re-narrates once the gate is open (a live reactive variant).
  const entrance = {
    id: "entrance",
    name: `${theme.title}: Threshold`,
    description:
      `${theme.setting}. ${theme.entranceFlavor} A ${theme.cofferName} stands beside the threshold. ` +
      `The way on lies north into the dark.`,
    objects: ["clue", "coffer"],
    exits: [{ direction: "north", to: "hub" }],
  };
  const hub = {
    id: "hub",
    name: "The Inner Chamber",
    description:
      `${theme.hubFlavor} A ${theme.strongboxName} stands here, and beyond it a low passage is barred ` +
      `until the strongbox gives. The threshold is back to the south.`,
    variants: [
      {
        when: [{ has_flag: HUB_OPEN }],
        text:
          `${theme.hubFlavor} The ${theme.strongboxName} stands open by the wall, and the low passage ` +
          `north into the deep cell lies clear. The threshold is back to the south.`,
      },
    ],
    objects: ["strongbox"],
    exits: [
      { direction: "south", to: "entrance" },
      {
        direction: "north",
        to: "inner",
        conditions: [{ has_flag: HUB_OPEN }],
        locked_msg: `The passage deeper in is barred until the ${theme.strongboxName} is opened.`,
      },
    ],
  };
  const inner = {
    id: "inner",
    name: "The Deep Cell",
    description:
      `${theme.innerFlavor} A ${theme.innerChestName} stands here. To the north, the ${theme.gateName} ` +
      `bars the way on, and apart from it the ${theme.hazardName} waits. The chamber is back to the south.`,
    variants: [
      {
        when: [{ has_flag: GATE_OPEN }],
        text:
          `${theme.innerFlavor} The ${theme.gateName} stands open now, and through it, north, lies ` +
          `${theme.goalShort}. The ${theme.innerChestName} stands open by the wall, and apart from it the ` +
          `${theme.hazardName} waits still. The chamber is back to the south.`,
      },
    ],
    objects: ["inner_chest", "gate", "hazard"],
    exits: [
      { direction: "south", to: "hub" },
      {
        direction: "north",
        to: "goal",
        conditions: [{ has_flag: GATE_OPEN }],
        locked_msg: `The ${theme.gateName} is locked fast; it will not yield without its key.`,
      },
    ],
  };
  const goal = {
    id: "goal",
    name: "The Last Chamber",
    description: `${theme.goalFlavor} The way back is south.`,
    exits: [{ direction: "south", to: "inner" }],
  };

  // ── Objects ─────────────────────────────────────────────────────────────────────────
  // clue: read awards the first milestone (+5) once (gated not_flag so it cannot be farmed)
  // and the read flag is consulted by its own gate (never inert). read_text carries the hint.
  const clue = {
    id: "clue",
    name: theme.clueName,
    aliases: [theme.clueAlias, "clue"],
    description: theme.clueDesc,
    read_text: theme.clueText,
    interactions: [
      {
        verb: "READ" as const,
        target: "clue",
        conditions: [{ not_flag: READ_CLUE }],
        effects: [{ set_flag: READ_CLUE }, { inc_var: { name: "score", by: 5 } }],
      },
    ],
  };
  // coffer (tier-1): an openable, UNLOCKED container in the entrance holding the LESSER key — so
  // the first link of the chain is freely obtainable.
  const coffer = {
    id: "coffer",
    name: theme.cofferName,
    aliases: [theme.cofferAlias],
    description: theme.cofferDesc,
    container: true,
    openable: true,
    contents: ["lesser_key"],
  };
  // lesser_key (tier-1): opens the strongbox ONLY, never the inner chest/gate/hazard — depth-3 chain.
  const lesserKey = {
    id: "lesser_key",
    name: theme.lesserKeyName,
    aliases: [theme.lesserKeyAlias],
    description: theme.lesserKeyDesc,
    takeable: true,
    quest_critical: true,
  };
  // strongbox (tier-2): a LOCKED container in the hub whose key is the lesser key; inside lies the
  // MIDDLE key. The first-class UNLOCK awards the SECOND milestone (+5) AND sets HUB_OPEN — the flag
  // the hub→inner exit reads, so the deep cell opens only after tier-2 is solved (not by free
  // locomotion). One-shot is intrinsic (once unlocked it isn't isLocked, so neither the award nor the
  // flag-set can re-fire). The validator must prove the chain lesser key → unlock strongbox → middle
  // key to reach the middle key (tier-2 of three).
  const strongbox = {
    id: "strongbox",
    name: theme.strongboxName,
    aliases: [theme.strongboxAlias],
    description: theme.strongboxDesc,
    container: true,
    openable: true,
    locked: true,
    key_id: "lesser_key",
    unlock_effects: [{ set_flag: HUB_OPEN }, { inc_var: { name: "score", by: 5 } }],
    contents: ["middle_key"],
  };
  // middle_key (tier-2): opens the inner chest ONLY, never the strongbox/gate/hazard — the depth-3
  // chain's load-bearing middle link (cased behind the strongbox, spent on the inner chest).
  const middleKey = {
    id: "middle_key",
    name: theme.middleKeyName,
    aliases: [theme.middleKeyAlias],
    description: theme.middleKeyDesc,
    takeable: true,
    quest_critical: true,
  };
  // inner_chest (tier-3): a LOCKED container in the inner room whose key is the middle key; inside
  // lies the GREAT key. The first-class UNLOCK awards the THIRD milestone (+5) and is one-shot
  // intrinsic (once unlocked it isn't isLocked, so the award can't be farmed). The validator must
  // prove a depth-3 obtainability chain (lesser → strongbox → middle → inner chest → great) to
  // reach the great key.
  const innerChest = {
    id: "inner_chest",
    name: theme.innerChestName,
    aliases: [theme.innerChestAlias],
    description: theme.innerChestDesc,
    container: true,
    openable: true,
    locked: true,
    key_id: "middle_key",
    unlock_effects: [{ inc_var: { name: "score", by: 5 } }],
    contents: ["key"],
  };
  // key (tier-3, the GREAT key): cased in the inner chest; opens the gate (the way on) AND the
  // hazard (the death fork) — the SAME key, a moral fork (the sealed_crypt iron-key discipline).
  const key = {
    id: "key",
    name: theme.keyName,
    aliases: [theme.keyAlias],
    description: theme.keyDesc,
    takeable: true,
    quest_critical: true,
  };
  // gate: the first-class UNLOCK that opens the way on — sets the gate flag the goal exit reads
  // and awards the FOURTH milestone (+5). One-shot is intrinsic (once unlocked it isn't isLocked,
  // so UNLOCK can't re-fire and the award can't be farmed).
  const gate = {
    id: "gate",
    name: theme.gateName,
    aliases: [theme.gateAlias, "door"],
    description: theme.gateDesc,
    locked: true,
    key_id: "key",
    unlock_narrate: theme.gateNarrate,
    unlock_effects: [{ set_flag: GATE_OPEN }, { inc_var: { name: "score", by: 5 } }],
  };
  // hazard: the telegraphed DEATH fork — the SAME key, an end_game, a warning cut into its prose
  // (never an ambush; the sealed_crypt bound_tomb discipline). It awards no score and sets no
  // flag, so the victory route's economy is untouched.
  const hazard = {
    id: "hazard",
    name: theme.hazardName,
    aliases: [theme.hazardAlias],
    description: theme.hazardDesc,
    locked: true,
    key_id: "key",
    unlock_narrate: theme.hazardNarrate,
    unlock_effects: [{ end_game: ENDING_DOOM }],
  };

  // ── NPC: the second in-world clue source (§17), naming the route. No effects ⇒ no inert
  //    flags; both nodes keep an ungated `bye` so the dialogue always terminates.
  const npc = {
    id: "guide",
    name: theme.npcName,
    description: theme.npcDesc,
    room: "hub",
    dialogue: {
      root: "greet",
      nodes: [
        {
          id: "greet",
          npc_text: theme.npcGreet,
          topics: [
            { id: "hint", prompt: "Ask the way on", goto: "tell" },
            { id: "bye", prompt: "Say goodbye", end: true },
          ],
        },
        {
          id: "tell",
          npc_text: theme.npcHint,
          topics: [{ id: "bye", prompt: "Say goodbye", end: true }],
        },
      ],
    },
  };

  const pack = {
    meta: {
      id,
      title: theme.title,
      start_room: "entrance",
      max_score: 20,
    },
    rooms: [entrance, hub, inner, goal],
    objects: [clue, coffer, lesserKey, strongbox, middleKey, innerChest, key, gate, hazard],
    npcs: [npc],
    win_conditions: [{ id: "reach_goal", conditions: [{ visited: "goal" }], ending: ENDING_WIN }],
    endings: [
      { id: ENDING_WIN, title: theme.winTitle, text: theme.winText },
      { id: ENDING_DOOM, title: theme.doomTitle, text: theme.doomText, death: true },
    ],
  };

  // Self-check: a malformed emission throws here, never downstream. Returns the parsed pack
  // with schema defaults applied, identical in shape to a pack loaded from YAML.
  return ParserPackSchema.parse(pack);
}
