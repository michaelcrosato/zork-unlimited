/**
 * Procedural RPG pack generator — the MODE-WIDENING slice of "evolve the eval distribution"
 * (docs/CURRENT_PLAN.md; the documented next slice after the CYOA generator program of
 * bug_0156 → bug_0157 → bug_0158).
 *
 * Why widen the mode. The CYOA generator (src/gen/cyoa_generator.ts) makes the eval set a
 * MOVING target — but only for the CYOA validator. The richest verifier surfaces in the suite
 * are the RPG-only proofs: COMBAT winnability (the bug_0097/0113/0114 best/worst-roll bound)
 * and SCORE-ECONOMY soundness (the declared max_score must equal the reachable award sum,
 * folding in combat/skill awards the parser scan can't see). Those validators are exercised
 * today ONLY against the two hand-authored RPG packs (sunken_barrow, cold_forge) — a frozen,
 * memorisable target, the exact condition the frozen-verifier literature warns against
 * (arXiv 2510.14253, and the assessor's own 0.5-floor collapse, [[verifier-assertion-guard]]).
 * This module mints fresh, never-seen RPG packs the COMBAT + SCORE checks must hold on, so the
 * moving-target property extends to the validators that matter most for the RPG mode.
 *
 * What it is. `generateRpgPack(seed)` is a PURE, DETERMINISTIC function (same seed ⇒
 * byte-identical pack — no Date/Math.random, §8.5) that emits a schema-valid `RpgPack` of the
 * proven AdventureForge hero's-quest shape, anchored structurally on cold_forge's CLEAN
 * skeleton so every parser + RPG invariant holds by construction:
 *   - a linear descent (entry → hall → gallery → hearth → vault) plus one OPTIONAL side cell;
 *   - an NPC whose counsel grants a one-shot +2 attack (the survival lever) and signposts the
 *     optional defensive ward;
 *   - one WINNABLE fight (enemy tuned to cold_forge's proven hp18/atk7/def2 — winnable on the
 *     player's BEST reachable stats: init atk + the spirit's +2 and init def + the ward's +2);
 *   - one PASSABLE seeded skill check (a might roll to lever the sealed way open);
 *   - a score economy whose three awards (defeat the foe, lever the way, claim the relic) sum
 *     EXACTLY to the declared max_score, so SCORE_UNREACHABLE's upper bound is tight;
 *   - two endings — the relic-claimed victory and the foe's death ending.
 * The seed selects the theme, the skill difficulty, and the three award amounts, so the eval
 * distribution genuinely varies (the validators see different score economies / difficulties)
 * while every path stays provable. The output is validated by the SAME `validateRpg` and proven
 * solvable by the SAME `exhaustiveEndingsMulti` best/worst-roll bracket that guard the shipped
 * RPG packs — so a generated pack is held to the identical bar (tests/unit/rpg_generator.test.ts).
 *
 * What it is NOT (yet). Like the CYOA generator's first slice (bug_0156), this is the minting
 * core: the generated packs are NOT committed under content/rpg/pack (an on-demand eval
 * distribution, not curated showcase content — no blind-playtest obligation, no pollution of
 * the hand-authored set), and the deferred slices (an MCP tool surface, an assessor lever that
 * mints-and-checks an RPG pack each cycle, persistence of a held-out corpus) are explicitly
 * next, not here — kept out so this stays one focused, green-bar change.
 */
import { RpgPackSchema, type RpgPack } from "../rpg/schema.js";

/**
 * The same tiny deterministic PRNG (mulberry32) the CYOA generator uses. Pure and
 * self-contained: no global RNG, no Date — randomness comes only from the integer seed.
 */
function makeRng(seed: number): { int: (n: number) => number; pick: <T>(xs: readonly T[]) => T } {
  let a = (seed ^ 0x9e3779b9) >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number): number => Math.floor(next() * n);
  const pick = <T>(xs: readonly T[]): T => {
    if (xs.length === 0) throw new Error("pick from empty array");
    return xs[int(xs.length)] as T;
  };
  return { int, pick };
}

/**
 * A theme is the cosmetic skin over the fixed, proven structural skeleton. It varies the
 * setting, the room/enemy/item prose, and the natural command verb for the lever-puzzle, so
 * two seeds read as different quests while the proof-relevant shape (descent → optional ward →
 * winnable fight → passable check → relic) is constant. `leverVerb` is the natural verb the
 * puzzle's command primes ("lever"/"force"/...) — it must not shadow a builtin parser verb.
 */
type Theme = {
  key: string;
  setting: string; // the one-line premise, stated in the entry room
  relic: string; // the goal object
  entryName: string;
  hallName: string;
  cellName: string;
  galleryName: string;
  hearthName: string;
  vaultName: string;
  foeName: string;
  foeDesc: string;
  wardName: string; // the optional +2-defense item
  barName: string; // the lever tool (the skill-check item)
  sealName: string; // the sealed obstacle the bar levers open
  leverVerb: string; // natural verb for the lever puzzle (not a builtin verb)
  spiritName: string;
  spiritDesc: string;
};

const THEMES: readonly Theme[] = [
  {
    key: "forge",
    setting:
      "the cold root of a dead mountain forge, where the last live ember is said to lie at the deepest hearth",
    relic: "Ember-Heart",
    entryName: "The Forge Steps",
    hallName: "The Outer Forge",
    cellName: "The Founder's Cell",
    galleryName: "The Bellows Walk",
    hearthName: "The Forge Heart",
    vaultName: "The Ember Chamber",
    foeName: "slag sentinel",
    foeDesc:
      "A man-high figure of fused slag and dead cinder, slow with the deep cold but built to bar the way.",
    wardName: "cold-iron plate",
    barName: "iron pry-bar",
    sealName: "slag grate",
    leverVerb: "lever",
    spiritName: "lantern-spirit",
    spiritDesc: "A thin blue flame in an old lantern, watchful and very tired.",
  },
  {
    key: "barrow",
    setting:
      "a sea-king's flooded barrow, where a drowned crown rests in the deepest cell below the tide-line",
    relic: "drowned crown",
    entryName: "The Barrow Mouth",
    hallName: "The Antechamber",
    cellName: "The Oarsman's Niche",
    galleryName: "The Shield-Hall",
    hearthName: "The Sunken Stair",
    vaultName: "The Tide Cell",
    foeName: "barrow-draugr",
    foeDesc:
      "A grave-cold corpse risen in rusted mail, salt-stiff and slow, set to keep the crown from living hands.",
    wardName: "kelp-green hauberk",
    barName: "bronze prise-bar",
    sealName: "barnacled slab",
    leverVerb: "prise",
    spiritName: "drowned shade",
    spiritDesc: "A grey shape half-seen in the standing water, mouthing words the tide swallows.",
  },
  {
    key: "crypt",
    setting:
      "the under-crypt of a fallen abbey, where a reliquary of unburnt gold waits behind the last sealed door",
    relic: "abbey reliquary",
    entryName: "The Crypt Stair",
    hallName: "The Ossuary",
    cellName: "The Hermit's Recess",
    galleryName: "The Nave Below",
    hearthName: "The Sealed Choir",
    vaultName: "The Reliquary Vault",
    foeName: "bound revenant",
    foeDesc:
      "A penitent dead thing wound in grave-linen, risen stiff and cold to guard the gold it died beside.",
    wardName: "saint's mail-shirt",
    barName: "iron crow-bar",
    sealName: "lead-sealed door",
    leverVerb: "force",
    spiritName: "candle-wisp",
    spiritDesc: "A guttering flame with no candle under it, leaning toward you as if to whisper.",
  },
  {
    key: "mine",
    setting:
      "the deepest gallery of an abandoned deep-mine, where a vein-heart of raw silver glows in the lowest stope",
    relic: "vein-heart",
    entryName: "The Mine Adit",
    hallName: "The Pump-House",
    cellName: "The Timberman's Stall",
    galleryName: "The Old Stope",
    hearthName: "The Choked Drift",
    vaultName: "The Lowest Stope",
    foeName: "rock-golem",
    foeDesc:
      "A lurching shape of fused tailings and dead ore, slow as the mountain but hard as the seam it guards.",
    wardName: "rivet-plate jack",
    barName: "miner's gad-bar",
    sealName: "rubble-choked grille",
    leverVerb: "heave",
    spiritName: "damp-light",
    spiritDesc:
      "A pale will-o'-the-wisp of mine-gas glow, hanging in the bad air with a patient flicker.",
  },
  {
    key: "tower",
    setting:
      "the storm-broken top of a wizard's ruined tower, where a star-glass orb still turns in the highest cell",
    relic: "star-glass orb",
    entryName: "The Tower Foot",
    hallName: "The Scriptorium",
    cellName: "The Apprentice's Cell",
    galleryName: "The Orrery Hall",
    hearthName: "The Warded Landing",
    vaultName: "The High Cell",
    foeName: "clay homunculus",
    foeDesc:
      "A man-shaped thing of baked clay and old sigils, dull-eyed and slow, wound to keep the orb turning alone.",
    wardName: "sigil-stitched coat",
    barName: "brass lever-rod",
    sealName: "rune-locked hatch",
    leverVerb: "wrench",
    spiritName: "ghost-light",
    spiritDesc:
      "A cold blue mote that drifts the dead air of the tower, the last of a mind that lived here.",
  },
];

/**
 * Generate a schema-valid RPG pack from an integer seed. Deterministic and pure: the same
 * seed always yields the identical pack. The structure is the proven cold_forge skeleton; the
 * seed selects the theme, the skill difficulty (always passable), and the three score awards
 * (which always sum to the declared max_score), so the eval distribution varies without any
 * path becoming unprovable, the fight becoming unwinnable, or the score becoming unreachable.
 *
 * The returned object is run through `RpgPackSchema.parse`, so a malformed emission throws HERE
 * (a generator self-check) rather than slipping downstream — and the result carries the schema's
 * applied defaults exactly like a pack loaded from YAML.
 */
export function generateRpgPack(seed: number): RpgPack {
  const rng = makeRng(seed);
  const theme = THEMES[Math.abs(Math.trunc(seed)) % THEMES.length] as Theme;

  // Score economy: three awards (defeat the foe, lever the way, claim the relic) seed-chosen
  // from a small pool, with max_score = their exact sum. Varying the split changes what the
  // SCORE_UNREACHABLE upper bound sees while keeping it tight (declared == reachable sum).
  const AWARD_POOL = [10, 15, 20] as const;
  const foeAward = rng.pick(AWARD_POOL);
  const leverAward = rng.pick(AWARD_POOL);
  const relicAward = rng.pick(AWARD_POOL);
  const maxScore = foeAward + leverAward + relicAward;

  // Skill difficulty in [10, 14] — always passable: best reachable might (init 3, no buff) gives
  // a d20 ceiling of 23, well above 14, so SKILL_CHECK_IMPOSSIBLE never fires.
  const difficulty = 10 + rng.int(5);

  const id = `genrpg_${Math.abs(Math.trunc(seed))}_v1`;
  const FOE_DOWN = "foe_down";
  const WARD_DONNED = "ward_donned";
  const HEARD_FOE = "heard_foe";
  const HEARD_WARD = "heard_ward";
  const GRATE_OPEN = { quest: "way", stage: "open" } as const;

  // Object ids (theme-independent so the structure is uniform; names carry the theme).
  const INSCRIPTION = "inscription";
  const BAR = "bar";
  const WARD = "ward";
  const SEAL = "seal";
  const RELIC = "relic";

  const pack = {
    meta: {
      id,
      title: `${theme.key[0]?.toUpperCase()}${theme.key.slice(1)}: A Hero's Descent`,
      start_room: "entry",
      vars_init: { hp: 20, attack: 4, defense: 2, might: 3 },
      flags_init: [] as string[],
      max_score: maxScore,
    },
    rooms: [
      {
        id: "entry",
        name: theme.entryName,
        description:
          `A way drops down into ${theme.setting}. You came for one thing: the ${theme.relic}. ` +
          `The only road to it is down.`,
        exits: [{ direction: "down", to: "hall" }],
      },
      {
        id: "hall",
        name: theme.hallName,
        description:
          `A cold vaulted hall. A worn inscription is cut into one wall, and by it lies a stout ` +
          `${theme.barName}. A ${theme.spiritName} hangs in a niche, watching you. A low cell stands ` +
          `to the west, a passage runs north into the dark, and the way climbs back up behind you.`,
        // Reactive prose once the bar is taken — the static line would otherwise contradict the
        // empty floor and the bar now in the player's hands (a single variant ⇒ cannot shadow).
        variants: [
          {
            when: [{ has_item: BAR }],
            text:
              `A cold vaulted hall. A worn inscription is cut into one wall; the floor by it is bare ` +
              `now, the ${theme.barName} that lay there in your own hands. A ${theme.spiritName} hangs ` +
              `in a niche. A low cell stands to the west, a passage runs north, and the way climbs back up.`,
          },
        ],
        objects: [INSCRIPTION, BAR],
        exits: [
          { direction: "up", to: "entry" },
          { direction: "west", to: "cell" },
          { direction: "north", to: "gallery" },
        ],
      },
      {
        id: "cell",
        name: theme.cellName,
        description:
          `A narrow side cell. Against the wall lies the long-dead one who came before you, still ` +
          `wearing a whole suit of ${theme.wardName} the cold kept from rotting. He has no use for it now.`,
        objects: [WARD],
        exits: [{ direction: "east", to: "hall" }],
      },
      {
        id: "gallery",
        name: theme.galleryName,
        description:
          `A long gallery. Across the only way east stands the ${theme.foeName} — ${theme.foeDesc} ` +
          `Slow is not the same as soft; better not to meet it under-armed. The way south leads back to the hall.`,
        variants: [
          {
            when: [{ has_flag: FOE_DOWN }],
            text:
              `A long gallery. The ${theme.foeName} lies broken across the floor, and the way east stands open. ` +
              `The way south leads back to the hall.`,
          },
        ],
        exits: [
          { direction: "south", to: "hall" },
          {
            direction: "east",
            to: "hearth",
            conditions: [{ has_flag: FOE_DOWN }],
            locked_msg: `The ${theme.foeName} bars the way east while it still stands.`,
          },
        ],
      },
      {
        id: "hearth",
        name: theme.hearthName,
        description:
          `The deep chamber at the quest's root. The way down is closed by a ${theme.sealName}, sealed ` +
          `by the weight of ages — but its edge carries a worn lip, made to be levered by bar and brawn.`,
        variants: [
          {
            when: [{ quest_stage: { quest: GRATE_OPEN.quest, stage: GRATE_OPEN.stage } }],
            text:
              `The deep chamber at the quest's root. The ${theme.sealName} has been levered up off its lip ` +
              `and stands open, baring a low way down into the dark below.`,
          },
        ],
        objects: [SEAL],
        exits: [
          { direction: "west", to: "gallery" },
          {
            direction: "down",
            to: "vault",
            conditions: [{ quest_stage: { quest: GRATE_OPEN.quest, stage: GRATE_OPEN.stage } }],
            locked_msg: `The ${theme.sealName} is sealed fast. It must be levered aside first.`,
          },
        ],
      },
      {
        id: "vault",
        name: theme.vaultName,
        description:
          `A small round chamber at the very bottom. On a plinth of pale stone rests the ${theme.relic}, ` +
          `whole and waiting, just as the old tales said.`,
        objects: [RELIC],
        on_enter: [
          { add_journal: `You have reached the ${theme.relic}.` },
          { inc_var: { name: "score", by: relicAward } },
        ],
        exits: [{ direction: "up", to: "hearth" }],
      },
    ],
    objects: [
      {
        id: INSCRIPTION,
        name: "worn inscription",
        aliases: ["inscription", "wall", "words", "letters"],
        description: "Letters cut deep into the cold stone.",
        takeable: false,
        read_text:
          `THE GUARDIAN IS SLOW IN THE COLD AND WILL NOT RISE TWICE IF STRUCK TRUE. THE ${theme.relic.toUpperCase()} ` +
          `LIES BELOW THE SEAL, AND ONLY A STRONG ARM AND A GOOD BAR WILL OPEN THE WAY.`,
      },
      {
        id: BAR,
        name: theme.barName,
        aliases: ["bar", "lever", "pry-bar", "prybar"],
        description: `A stout iron bar the length of your arm, cold but sound — a lever, for an arm strong enough.`,
        takeable: true,
      },
      {
        id: WARD,
        name: theme.wardName,
        aliases: ["ward", "armour", "armor", "mail", "plate", "suit"],
        description: `A whole suit of ${theme.wardName}, heavy and cold but unrusted — iron the guardian's blows would ring off.`,
        // Reactive examine once donned (a single variant ⇒ cannot shadow).
        variants: [
          {
            when: [{ has_flag: WARD_DONNED }],
            text: `The ${theme.wardName}, buckled on now over your own gear; its weight sits between you and the next blow.`,
          },
        ],
        takeable: true,
        interactions: [
          // Self-USE = "wear this". command_verb "don" (not a builtin verb); one-shot, gated
          // none_of ward_donned so the +2 defense cannot be farmed.
          {
            verb: "USE" as const,
            item: WARD,
            target: WARD,
            command_verb: "don",
            conditions: [{ none_of: [{ has_flag: WARD_DONNED }] }],
            effects: [
              { set_flag: WARD_DONNED },
              { inc_var: { name: "defense", by: 2 } },
              {
                add_journal: `You buckle on the ${theme.wardName}; it will turn the worst of the guardian's blows (+2 defense).`,
              },
              {
                narrate: `You strip the ${theme.wardName} from the old bones and buckle it on. It is cold and heavy, but it sits between you and the next blow.`,
              },
            ],
          },
        ],
      },
      {
        id: SEAL,
        name: theme.sealName,
        aliases: ["seal", "grate", "slab", "door", "grille", "hatch"],
        description: `A ${theme.sealName} sealed fast by the weight of ages, with a worn lip at its edge made for a lever.`,
        variants: [
          {
            when: [{ quest_stage: { quest: GRATE_OPEN.quest, stage: GRATE_OPEN.stage } }],
            text: `The ${theme.sealName}, levered up off its lip and standing open; below it a low way drops down into the dark.`,
          },
        ],
        takeable: false,
        interactions: [
          {
            verb: "USE" as const,
            item: BAR,
            target: SEAL,
            command_verb: theme.leverVerb,
            command_template: `${theme.leverVerb} {target} with {item}`,
            // One-shot: the check retires once the way is open (none_of grate_open) so the bar
            // can never re-roll and narrate "it does not give" while the way already stands open.
            conditions: [
              { none_of: [{ quest_stage: { quest: GRATE_OPEN.quest, stage: GRATE_OPEN.stage } }] },
            ],
            skill_check: {
              skill: "might",
              difficulty,
              on_success: [
                { set_quest_stage: { quest: GRATE_OPEN.quest, stage: GRATE_OPEN.stage } },
                {
                  add_journal: `You lever the ${theme.sealName} up off its lip; the way down stands open.`,
                },
                { inc_var: { name: "score", by: leverAward } },
                {
                  narrate: `You set the bar to the lip and throw your weight on it — stone cracks and the ${theme.sealName} heaves up off its seat. The way down is open.`,
                },
              ],
              on_failure: [
                {
                  narrate: `The bar bites under the lip and your shoulders strain, but the ${theme.sealName} holds. Set your feet and try again.`,
                },
              ],
            },
          },
        ],
      },
      {
        id: RELIC,
        name: theme.relic,
        aliases: ["relic", "prize", "treasure", "heart", "crown", "orb"],
        description: `The ${theme.relic} itself, whole and waiting — the one thing you came down here to carry out.`,
        takeable: false,
      },
    ],
    npcs: [
      {
        id: "spirit",
        name: theme.spiritName,
        description: theme.spiritDesc,
        room: "hall",
        dialogue: {
          root: "spirit_root",
          nodes: [
            {
              id: "spirit_root",
              npc_text: `A warm thing, come down into the cold. Few do. Ask, if you would — I have watched this place a long age and remember everything.`,
              topics: [
                // Each info topic retires once told (gated on its own flag), so the +2 attack is
                // claimable only once. The ungated leave keeps the node terminating.
                {
                  id: "ask_foe",
                  prompt: `Ask how to beat the ${theme.foeName}.`,
                  conditions: [{ not_flag: HEARD_FOE }],
                  goto: "spirit_foe",
                },
                {
                  id: "ask_ward",
                  prompt: "Ask who else ever came down here.",
                  conditions: [{ not_flag: HEARD_WARD }],
                  goto: "spirit_ward",
                },
                { id: "leave_spirit", prompt: "Step away.", end: true },
              ],
            },
            {
              id: "spirit_foe",
              npc_text: `The guardian? It is slow in the cold and will never be warmer. Do not fear that waiting makes it worse. Strike it hard and it will not rise twice. Here — take what warmth I can spare; let it ride your arm.`,
              effects: [
                { set_flag: HEARD_FOE },
                { inc_var: { name: "attack", by: 2 } },
                {
                  add_journal: `The ${theme.spiritName}'s warmth settles into your arm — you feel you could strike harder now (+2 attack).`,
                },
              ],
              topics: [
                { id: "foe_back", prompt: "Nod, and ask something else.", goto: "spirit_root" },
              ],
            },
            {
              id: "spirit_ward",
              npc_text: `One came before you, an age ago, and never climbed back out. He lies in the side-cell west of here, still in his ${theme.wardName}, whole and unrusted. He has no use for it now — better his iron on a living back than guarding old bones.`,
              effects: [
                { set_flag: HEARD_WARD },
                {
                  add_journal: `The ${theme.spiritName} speaks of one who came before, dead in the side-cell west of the hall in ${theme.wardName} that might yet turn the guardian's blows.`,
                },
              ],
              topics: [
                { id: "ward_back", prompt: "Nod, and ask something else.", goto: "spirit_root" },
              ],
            },
          ],
        },
      },
    ],
    enemies: [
      {
        id: "foe",
        name: theme.foeName,
        description: theme.foeDesc,
        room: "gallery",
        // cold_forge's bug_0101-proven tuning: winnable on best reachable stats (atk 4+2, def 2+2,
        // hp 20 ⇒ best dmg 10, 2 rounds, ≥4 taken vs 20), a lethal gamble at base stats.
        hp: 18,
        attack: 7,
        defense: 2,
        defeat_flag: FOE_DOWN,
        death_ending: "ending_fallen",
        on_defeat: [
          { add_journal: `The ${theme.foeName} comes apart; the way east lies open.` },
          { inc_var: { name: "score", by: foeAward } },
        ],
      },
    ],
    win_conditions: [
      { id: "claim_relic", conditions: [{ visited: "vault" }], ending: "ending_victory" },
    ],
    endings: [
      {
        id: "ending_victory",
        title: `Bearer of the ${theme.relic}`,
        text:
          `You lift the ${theme.relic} from its plinth and turn back toward the light above. The long cold ` +
          `keeps the rest of this place, but its one living prize climbs the stair in your hands.`,
        death: false,
      },
      {
        id: "ending_fallen",
        title: "Cold on the Stones",
        text:
          `The guardian's last blow drops you among the dead, and the grave chill closes over you. The ` +
          `${theme.relic} waits a while longer for a stronger arm.`,
        death: true,
      },
    ],
  };

  // Self-check: a malformed emission throws here, never downstream. Returns the parsed pack
  // with schema defaults applied, identical in shape to a pack loaded from YAML.
  return RpgPackSchema.parse(pack);
}
