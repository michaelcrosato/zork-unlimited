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
 *   - a three-room spine (entrance → hub → goal) whose two non-win rooms are strongly connected
 *     (no quest-item soft-lock), the goal gated behind a flag-locked exit;
 *   - a readable CLUE that awards the first milestone score and an NPC that signposts the route
 *     (two in-world clue sources, §17);
 *   - a KEY recovered from an openable coffer in the hub;
 *   - a first-class UNLOCK gate (the key opens the way north, sets the gate flag, awards the second
 *     milestone score) — the canonical win on reaching the goal;
 *   - a telegraphed DEATH fork: the SAME key opens a plainly-warned hazard that ends the game
 *     (the failure pole every blind pass asks for, the sealed_crypt bound_tomb discipline) — never
 *     an ambush, the warning is cut into its prose.
 * The output is validated by the SAME `validateParser` and proven solvable by the SAME exhaustive
 * BFS that guard the shipped parser packs, so a generated pack is held to the identical bar (see
 * tests/unit/parser_generator.test.ts). The score economy is exact: read (+5) + unlock (+10) = the
 * declared max_score 15, reachable and never farmable.
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
 */
export const PARSER_GENERATOR_VERSION = 1;

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
  goalFlavor: string; // one sentence describing the goal room (the prize)
  goalShort: string; // a short noun phrase for the goal, used in the opened-gate variant
  clueName: string;
  clueAlias: string;
  clueDesc: string;
  clueText: string; // the in-world hint (read_text) the clue carries
  cofferName: string;
  cofferAlias: string;
  cofferDesc: string;
  keyName: string;
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
    goalFlavor:
      "Past the gate the reliquary stands untouched on its plinth — the saint's casket you waded the fens to find.",
    goalShort: "the reliquary chamber",
    clueName: "graven slab",
    clueAlias: "slab",
    clueDesc: "A weathered slab, an epitaph still legible under the lichen.",
    clueText: "Cut deep into the stone: 'THE VAULT YIELDS TO THE IRON LAID UP IN THE FONT.'",
    cofferName: "stone font",
    cofferAlias: "font",
    cofferDesc: "A dry baptismal font; something heavy rests in its basin.",
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
    npcHint: "The gate answers only to the iron key — and that was laid up in the font.",
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
    goalFlavor:
      "Past the hatch the true channel-beacon waits, trimmed and ready to light the ship clear of the reef.",
    goalShort: "the beacon stage",
    clueName: "tide-board",
    clueAlias: "board",
    clueDesc: "A slate tide-board, a keeper's hand chalked across it.",
    clueText: "Chalked plain: 'THE HATCH TAKES THE BRASS KEY KEPT IN THE OIL-LOCKER.'",
    cofferName: "oil-locker",
    cofferAlias: "locker",
    cofferDesc: "A squat iron oil-locker; something rattles loose inside.",
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
    npcHint: "The hatch wants the brass key — I keep it in the oil-locker, away from damp.",
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
    goalFlavor:
      "Past the wicket the master-pattern lies in its case — the proof-mould the whole foundry was raised to guard.",
    goalShort: "the pattern-store",
    clueName: "order-slate",
    clueAlias: "slate",
    clueDesc: "A chalked order-slate, the quartermaster's hand still legible.",
    clueText: "Chalked across it: 'THE WICKET TAKES THE WARD-KEY DROPPED IN THE QUENCH-TROUGH.'",
    cofferName: "quench-trough",
    cofferAlias: "trough",
    cofferDesc: "A long iron quench-trough, dry now; something lies on its bed.",
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
      "The store wicket wants the ward-key — it went into the quench-trough when we banked down.",
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
    goalFlavor:
      "Past the grille the sealed roll lies dry in its lead tube — the one record the flood and the fire both failed to take.",
    goalShort: "the sealed-roll niche",
    clueName: "duty-roll",
    clueAlias: "roll",
    clueDesc: "A pinned duty-roll, the porter's hand legible above the water-stain.",
    clueText: "Inked plain: 'THE GRILLE TAKES THE GILT KEY CASED IN THE DESPATCH-BOX.'",
    cofferName: "despatch-box",
    cofferAlias: "box",
    cofferDesc: "A japanned despatch-box, lid unlatched; something gleams within.",
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
      "The grille wants the gilt key — it's cased in the despatch-box, where the flood couldn't reach.",
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
    goalFlavor:
      "Past the slab-door the king lies crowned on his bier — the circlet of pale gold you broke the frost to reach.",
    goalShort: "the king's chamber",
    clueName: "rune-stone",
    clueAlias: "runestone",
    clueDesc: "A leaning rune-stone, its incised verse still sharp under the frost.",
    clueText: "Bitten into the rune-stone: 'THE SLAB OPENS TO THE BONE KEY HID IN THE GRAVE-URN.'",
    cofferName: "grave-urn",
    cofferAlias: "urn",
    cofferDesc: "A wide grave-urn, its lid askew; something pale rests inside.",
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
      "The slab opens to the bone key — the old folk hid it in the grave-urn, against thieves.",
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
    goalFlavor:
      "Past the sluice-gate the strong-room stands dry on its mound — the grant and the gold the mill was built to keep.",
    goalShort: "the strong-room",
    clueName: "grant-board",
    clueAlias: "grantboard",
    clueDesc: "A framed grant-board, the water-court's hand legible behind the glass.",
    clueText: "Lettered plain: 'THE SLUICE TAKES THE COPPER KEY SUNK IN THE MEAL-ARK.'",
    cofferName: "meal-ark",
    cofferAlias: "ark",
    cofferDesc: "A great oak meal-ark, lid thrown back; something sits in the spoiled meal.",
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
      "The sluice wants the copper key — it went down in the meal-ark when the race first burst.",
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
 * seed always yields the identical pack. The structure is fixed (entrance → hub → goal spine, a
 * flag-locked goal, a clue + NPC signposting, a key in a coffer, a first-class UNLOCK gate, a
 * telegraphed death fork, an exact 5+10 = 15 score economy); the seed selects the theme, so the
 * eval distribution varies without any route ever becoming unprovable or any check flagging.
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
  const READ_CLUE = "read_clue";
  const ENDING_WIN = "ending_win";
  const ENDING_DOOM = "ending_doom";

  // ── Rooms: a three-room spine. The two non-win rooms (entrance, hub) are strongly
  //    connected via the north/south pair, so the takeable quest_critical key can never be
  //    stranded (parser SOFTLOCK_QUEST_ITEM). The goal is reachable only through the flag-
  //    locked gate exit. The hub re-narrates once the gate is open (a live reactive variant).
  const entrance = {
    id: "entrance",
    name: `${theme.title}: Threshold`,
    description: `${theme.setting}. ${theme.entranceFlavor} The way on lies north into the dark.`,
    objects: ["clue"],
    exits: [{ direction: "north", to: "hub" }],
  };
  const hub = {
    id: "hub",
    name: "The Inner Chamber",
    description:
      `${theme.hubFlavor} A ${theme.cofferName} stands here. To the north, the ${theme.gateName} ` +
      `bars the way on, and apart from it the ${theme.hazardName} waits. The threshold is back to the south.`,
    variants: [
      {
        when: [{ has_flag: GATE_OPEN }],
        text:
          `${theme.hubFlavor} The ${theme.gateName} stands open now, and through it, north, lies ` +
          `${theme.goalShort}. The ${theme.cofferName} stands open by the wall, and apart from it the ` +
          `${theme.hazardName} waits still. The threshold is back to the south.`,
      },
    ],
    objects: ["coffer", "gate", "hazard"],
    exits: [
      { direction: "south", to: "entrance" },
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
    exits: [{ direction: "south", to: "hub" }],
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
  // coffer: an openable, unlocked container holding the key — so the key is obtainable.
  const coffer = {
    id: "coffer",
    name: theme.cofferName,
    aliases: [theme.cofferAlias],
    description: theme.cofferDesc,
    container: true,
    openable: true,
    contents: ["key"],
  };
  const key = {
    id: "key",
    name: theme.keyName,
    aliases: [theme.keyAlias],
    description: theme.keyDesc,
    takeable: true,
    quest_critical: true,
  };
  // gate: the first-class UNLOCK that opens the way on — sets the gate flag the goal exit reads
  // and awards the second milestone (+10). One-shot is intrinsic (once unlocked it isn't
  // isLocked, so UNLOCK can't re-fire and the award can't be farmed).
  const gate = {
    id: "gate",
    name: theme.gateName,
    aliases: [theme.gateAlias, "door"],
    description: theme.gateDesc,
    locked: true,
    key_id: "key",
    unlock_narrate: theme.gateNarrate,
    unlock_effects: [{ set_flag: GATE_OPEN }, { inc_var: { name: "score", by: 10 } }],
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
      max_score: 15,
    },
    rooms: [entrance, hub, goal],
    objects: [clue, coffer, key, gate, hazard],
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
