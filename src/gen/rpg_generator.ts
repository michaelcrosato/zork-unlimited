/**
 * Procedural RPG pack generator — the RPG-only moving-target eval distribution.
 *
 * Why it exists. The richest verifier surfaces in the suite are the RPG-only proofs: COMBAT
 * winnability (the bug_0097/0113/0114 best/worst-roll bound) and SCORE-ECONOMY soundness
 * (the declared max_score must equal the reachable award sum, folding in combat/skill awards).
 * This module mints fresh, never-seen RPG packs the COMBAT + SCORE checks must hold on, so the
 * moving-target property stays attached to the only supported runtime.
 *
 * What it is. `generateRpgPack(seed)` is a PURE, DETERMINISTIC function (same seed ⇒
 * byte-identical pack — no Date/Math.random, §8.5) that emits a schema-valid `RpgPack` of the
 * proven AdventureForge hero's-quest shape, anchored structurally on cold_forge's CLEAN
 * skeleton so every parser + RPG invariant holds by construction.
 *
 * v2 (bug_0171) DEEPENED this to a TWO-FIGHT GAUNTLET — the RPG analogue of bug_0168's depth-2
 * parser chain and bug_0169's two-axis CYOA fork, and the explicit "more than one combat + one
 * skill check" brief the sunken_barrow §6 blind note left. v1 emitted a SINGLE fight (one
 * gallery foe) + one skill check + a THREE-award economy: the COMBAT-winnability proof ran on
 * exactly one enemy, the exhaustive best/worst bracket had only one fight's cumulative HP to
 * survive, and the score scan summed three terms. v2 grows a SECOND combat tier:
 *   - a linear descent (entry → hall → gallery → SPAN → hearth → vault) plus one OPTIONAL side
 *     cell — SEVEN rooms, a longer obtainability chain;
 *   - an NPC whose counsel grants a one-shot +2 attack (the survival lever applied to BOTH
 *     fights) and signposts the optional defensive ward (+2 defense, also both fights);
 *   - TWO winnable fights in sequence, each its own validator winnability proof and each a
 *     load-bearing gate: a LESSER sentinel in the gallery (the gallery's east exit gates on its
 *     defeat) and the GREATER guardian in the span (the span's east exit gates on ITS defeat);
 *   - one PASSABLE seeded skill check (a might roll to lever the sealed way open);
 *   - a score economy whose FOUR awards (fell each guardian, lever the way, claim the relic) sum
 *     EXACTLY to the declared max_score, so SCORE_UNREACHABLE's upper bound is tight on a richer
 *     economy;
 *   - THREE endings — the relic-claimed victory and a DISTINCT death ending per guardian (fall
 *     to the sentinel / fall to the guardian), so the exhaustive bracket must reach a 3-ending
 *     census (every one provable by concrete play).
 * The seed selects the theme, the skill difficulty, and the four award amounts, so the eval
 * distribution genuinely varies (the validators see different score economies / difficulties)
 * while every path stays provable. The output is validated by the SAME `validateRpg` and proven
 * solvable by the SAME `exhaustiveEndingsMulti` best/worst-roll bracket that guard the shipped
 * RPG packs — so a generated pack is held to the identical bar (tests/unit/rpg_generator.test.ts).
 *
 * v3 (bug_0173) TURNS THE GAUNTLET INTO A DECLARED, CUMULATIVE-AWARE GUARANTEE. v2 left the two
 * fights an undeclared gamble: each was winnable on best reachable stats but the validator's then
 * per-fight `combat_guaranteed` upper bound (bug_0114) could not see cumulative drain, so two
 * "guaranteed" fights could still jointly fell a best-prepared player and the generator dared not
 * set the flag. bug_0172 closed that blind spot — `validateRpg` now sums each enemy's worst-case
 * damage across the whole gauntlet (`COMBAT_GAUNTLET_NOT_GUARANTEED`) — but that hardest check ran
 * only against frozen witness packs in a regression test, never against the per-cycle MOVING
 * distribution. v3 re-tunes the two enemies so a FULLY-PREPARED descent (the spirit's +2 attack and
 * the cell ward's +2 defense, both OPTIONAL) survives BOTH fights on EVERY roll AND survives them
 * CUMULATIVELY — best reachable atk6/def4: foe (hp6/atk1/def4) worst-case takes 3, warden
 * (hp9/atk2/def4) worst-case takes 8, joint 11 < 20 reachable HP — so the pack now soundly sets
 * `meta.combat_guaranteed: true` and EVERY mint exercises the cumulative upper bound as a GREEN
 * case, turning the validator's hardest check into a per-mint obligation rather than a frozen
 * target. The promise is conditional on PREPARATION (it is exactly the best-reachable-stats bound
 * the validator proves): an UNDER-prepared player who skips the spirit/ward is still under the high
 * enemy defense a true gamble and CAN fall to each keeper on worse rolls, so BOTH death endings
 * stay reachable and the 3-ending census holds — preparation is now a guaranteed-sufficient
 * strategy, not a hope, the player-experience contract every RPG blind playtest asks for.
 *
 * What it is NOT. Generated packs are NOT committed under content/rpg/quests: this is an
 * on-demand eval distribution, not curated showcase content. They ARE persisted as the
 * sealed held-out corpus behind a generator_version bump + re-seal.
 */
import { RpgPackSchema, type RpgPack } from "../rpg/schema.js";
import { assertGeneratedRpgSeed } from "./seed.js";

/**
 * Generator version stamp (bug_0163, held-out corpus persistence). This does NOT change any
 * emitted pack — it is recorded only in `corpus/manifest.json` so that a FUTURE change to the
 * generator surfaces as a loud, diagnosable manifest mismatch ("generator changed", a deliberate
 * version bump) rather than silent corpus rot vs a tampered content hash. Bump it whenever the
 * emitted pack shape changes; the re-seal then re-stamps every entry. v1 → v2: the two-fight
 * gauntlet deepening (bug_0171). v2 → v3: the gauntlet becomes a declared, cumulative-survivable
 * `combat_guaranteed` promise (bug_0173) — the enemy stats and the meta flag change. v3 → v4:
 * root dialogue gains a re-greet variant after one-shot counsel topics retire. v4 → v5:
 * player-facing generated prose is rewritten for direct, action-first instructions. v5 → v6:
 * the blocked hearth exit gives the exact themed seal command. Generated mechanics and structure
 * are unchanged, but the emitted content hashes intentionally change.
 */
export const RPG_GENERATOR_VERSION = 6;

/**
 * Tiny deterministic PRNG (mulberry32). Pure and self-contained: no global RNG,
 * no Date — randomness comes only from the integer seed.
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
 * TWO winnable fights → passable check → relic) is constant. `leverVerb` is the natural verb the
 * puzzle's command primes ("lever"/"force"/...) — it must not shadow a built-in RPG command verb.
 */
type Theme = {
  key: string;
  setting: string; // the one-line premise, stated in the entry room
  relic: string; // the goal object
  entryName: string;
  hallName: string;
  cellName: string;
  galleryName: string;
  spanName: string; // the SECOND combat room (the greater guardian), between gallery and hearth
  hearthName: string;
  vaultName: string;
  foeName: string; // the LESSER sentinel, in the gallery (the first fight)
  foeDesc: string;
  wardenName: string; // the GREATER guardian, in the span (the second fight)
  wardenDesc: string;
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
    setting: "an abandoned mountain forge. Its last live ember is in the deepest chamber",
    relic: "Ember-Heart",
    entryName: "The Forge Steps",
    hallName: "The Outer Forge",
    cellName: "The Founder's Cell",
    galleryName: "The Bellows Walk",
    spanName: "The Anvil Floor",
    hearthName: "The Forge Heart",
    vaultName: "The Ember Chamber",
    foeName: "slag sentinel",
    foeDesc: "A human-sized slag creature blocks the way. It is slow, cold, and heavily armored.",
    wardenName: "cinder-wraith",
    wardenDesc:
      "A larger iron creature guards the inner heat. It is stronger and tougher than the slag sentinel.",
    wardName: "cold-iron plate",
    barName: "iron pry-bar",
    sealName: "slag grate",
    leverVerb: "lever",
    spiritName: "lantern-spirit",
    spiritDesc: "A thin blue flame in an old lantern, watchful and very tired.",
  },
  {
    key: "barrow",
    setting: "a flooded sea-king's tomb. The drowned crown is in the deepest chamber",
    relic: "drowned crown",
    entryName: "The Barrow Mouth",
    hallName: "The Antechamber",
    cellName: "The Oarsman's Niche",
    galleryName: "The Shield-Hall",
    spanName: "The Drowned Gallery",
    hearthName: "The Sunken Stair",
    vaultName: "The Tide Cell",
    foeName: "barrow-draugr",
    foeDesc: "A corpse in rusted mail blocks the way to the crown. It is slow and heavily armored.",
    wardenName: "tide-wight",
    wardenDesc:
      "The king's drowned guard protects the crown. It is stronger and tougher than the first corpse.",
    wardName: "kelp-green hauberk",
    barName: "bronze prise-bar",
    sealName: "barnacled slab",
    leverVerb: "prise",
    spiritName: "drowned shade",
    spiritDesc: "A grey shape half-seen in the standing water, mouthing words the tide swallows.",
  },
  {
    key: "crypt",
    setting: "the crypt below a fallen abbey. A gold reliquary waits behind the last sealed door",
    relic: "abbey reliquary",
    entryName: "The Crypt Stair",
    hallName: "The Ossuary",
    cellName: "The Hermit's Recess",
    galleryName: "The Nave Below",
    spanName: "The Lower Choir",
    hearthName: "The Sealed Sanctuary",
    vaultName: "The Reliquary Vault",
    foeName: "bound revenant",
    foeDesc: "A corpse wrapped in burial cloth blocks the way to the gold. It is slow and armored.",
    wardenName: "choir-shade",
    wardenDesc:
      "A tall, iron-armored corpse guards the reliquary. It is stronger than the first revenant.",
    wardName: "saint's mail-shirt",
    barName: "iron crow-bar",
    sealName: "lead-sealed door",
    leverVerb: "force",
    spiritName: "candle-wisp",
    spiritDesc: "A guttering flame with no candle under it, leaning toward you as if to whisper.",
  },
  {
    key: "mine",
    setting: "an abandoned deep mine. A raw-silver vein-heart glows in the lowest chamber",
    relic: "vein-heart",
    entryName: "The Mine Adit",
    hallName: "The Pump-House",
    cellName: "The Timberman's Stall",
    galleryName: "The Old Stope",
    spanName: "The Flooded Drift",
    hearthName: "The Choked Drift",
    vaultName: "The Lowest Stope",
    foeName: "rock-golem",
    foeDesc: "A rock creature blocks the passage. It is slow and protected by hard ore.",
    wardenName: "deep-haunt",
    wardenDesc:
      "A larger creature of ore and mine timber guards the silver. It is stronger than the first golem.",
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
    setting: "a ruined wizard's tower. A star-glass orb still turns in its highest chamber",
    relic: "star-glass orb",
    entryName: "The Tower Foot",
    hallName: "The Scriptorium",
    cellName: "The Apprentice's Cell",
    galleryName: "The Orrery Hall",
    spanName: "The Warded Stair",
    hearthName: "The High Landing",
    vaultName: "The High Cell",
    foeName: "clay homunculus",
    foeDesc:
      "A human-shaped clay construct blocks the stairs. It is slow and marked with old symbols.",
    wardenName: "iron-bound watcher",
    wardenDesc:
      "A tall metal construct guards the orb. It is stronger and tougher than the clay construct.",
    wardName: "sigil-stitched coat",
    barName: "brass lever-rod",
    sealName: "rune-locked hatch",
    leverVerb: "wrench",
    spiritName: "ghost-light",
    spiritDesc: "A small blue light carries the last memories of someone who lived in the tower.",
  },
];

/**
 * Generate a schema-valid RPG pack from an integer seed. Deterministic and pure: the same
 * seed always yields the identical pack. The structure is the proven cold_forge skeleton grown
 * to a two-fight gauntlet; the seed selects the theme, the skill difficulty (always passable),
 * and the four score awards (which always sum to the declared max_score), so the eval
 * distribution varies without any path becoming unprovable, either fight becoming unwinnable,
 * or the score becoming unreachable.
 *
 * The returned object is run through `RpgPackSchema.parse`, so a malformed emission throws HERE
 * (a generator self-check) rather than slipping downstream — and the result carries the schema's
 * applied defaults exactly like a pack loaded from YAML.
 */
export function generateRpgPack(seed: number): RpgPack {
  assertGeneratedRpgSeed(seed, "generateRpgPack seed");
  const rng = makeRng(seed);
  const theme = THEMES[Math.abs(Math.trunc(seed)) % THEMES.length] as Theme;

  // Score economy: FOUR awards (fell the sentinel, fell the guardian, lever the way, claim the
  // relic) seed-chosen from a small pool, with max_score = their exact sum. Varying the split
  // changes what the SCORE_UNREACHABLE upper bound sees while keeping it tight (declared ==
  // reachable sum) on a richer four-term economy than v1's three.
  const AWARD_POOL = [10, 15, 20] as const;
  const foeAward = rng.pick(AWARD_POOL);
  const wardenAward = rng.pick(AWARD_POOL);
  const leverAward = rng.pick(AWARD_POOL);
  const relicAward = rng.pick(AWARD_POOL);
  const maxScore = foeAward + wardenAward + leverAward + relicAward;

  // Skill difficulty in [10, 14] — always passable: best reachable might (init 3, no buff) gives
  // a d20 ceiling of 23, well above 14, so SKILL_CHECK_IMPOSSIBLE never fires.
  const difficulty = 10 + rng.int(5);

  // The id must separate the packs the seed separates. `makeRng` is keyed on the
  // SIGNED seed, so seed and -seed draw different skill difficulties and different
  // score awards — two structurally different packs — while `Math.abs` alone gave
  // them one id (measured: 5 and -5 both minted `genrpg_5_v1`, max_score 70 vs 55,
  // different content hashes). Negative seeds are legal (isGeneratedRpgSeed pins
  // MIN_SAFE_INTEGER true) and reach here through MCP new_game / generate_rpg_pack,
  // and meta.id is what every observation, transcript, corpus row and crawler or
  // blind-tester artifact carries — so a collision makes two different packs
  // indistinguishable in recorded evidence, and `bin/seal-corpus.ts` writes both to
  // the same `corpus/rpg/<id>.yaml`. The `n` prefix keeps every NON-negative id
  // byte-identical, so the sealed corpus window (seeds 0..3) and its committed
  // content hashes are untouched.
  const truncated = Math.trunc(seed);
  const id = `genrpg_${truncated < 0 ? `n${Math.abs(truncated)}` : `${truncated}`}_v1`;
  const FOE_DOWN = "foe_down";
  const WARDEN_DOWN = "warden_down";
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
      // The two-fight gauntlet is a DECLARED guarantee (bug_0173): a fully-prepared player (the
      // spirit's +2 attack and the cell ward's +2 defense, best reachable atk6/def4) survives BOTH
      // keepers on EVERY roll AND cumulatively (worst-case 3 + 8 = 11 < 20 HP), so validateRpg's
      // cumulative-HP-aware upper bound (COMBAT_GAUNTLET_NOT_GUARANTEED, bug_0172) passes GREEN on
      // every mint. The promise is the validator's best-reachable-stats bound: an UNDER-prepared
      // player who skips the buffs faces the keepers' high defense as a real gamble and can still
      // fall to either, so both death endings stay reachable (the 3-ending census holds).
      combat_guaranteed: true,
    },
    rooms: [
      {
        id: "entry",
        name: theme.entryName,
        description: `Goal: find the ${theme.relic}. The stairs lead down into ${theme.setting}.`,
        exits: [{ direction: "down", to: "hall" }],
      },
      {
        id: "hall",
        name: theme.hallName,
        description:
          `Exits: up, west, and north. The wall inscription marks where the ${theme.barName} was stored; TAKE ${theme.barName} if it is here. ` +
          `A ${theme.spiritName} waits here and can answer questions.`,
        // Reactive prose once the bar is taken — the static line would otherwise contradict the
        // empty floor and the bar now in the player's hands (a single variant ⇒ cannot shadow).
        variants: [
          {
            when: [{ has_item: BAR }],
            text:
              `Exits: up, west, and north. You carry the ${theme.barName} that lay beside the wall inscription. ` +
              `A ${theme.spiritName} waits here and can answer questions.`,
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
        description: `Exit: east. This is where an intact ${theme.wardName} was found beside a dead explorer. Its first DON teaches a lasting braced stance and grants +2 defense against either guardian still standing. The bonus persists even if the ward is later dropped.`,
        objects: [WARD],
        exits: [{ direction: "east", to: "hall" }],
      },
      {
        id: "gallery",
        name: theme.galleryName,
        description:
          `Exit south returns to the hall. The ${theme.foeName} blocks the east exit. ${theme.foeDesc} ` +
          `Prepare before fighting it.`,
        variants: [
          {
            when: [{ has_flag: FOE_DOWN }],
            text: `Exits: south and east. The defeated ${theme.foeName} lies on the floor.`,
          },
        ],
        exits: [
          { direction: "south", to: "hall" },
          {
            direction: "east",
            to: "span",
            conditions: [{ has_flag: FOE_DOWN }],
            locked_msg: `The ${theme.foeName} bars the way east while it still stands.`,
          },
        ],
      },
      {
        id: "span",
        name: theme.spanName,
        description:
          `Exit west returns to the gallery. The ${theme.wardenName} blocks the east exit. ${theme.wardenDesc} ` +
          `Prepare before fighting it.`,
        variants: [
          {
            when: [{ has_flag: WARDEN_DOWN }],
            text: `Exits: west and east. The defeated ${theme.wardenName} lies on the floor.`,
          },
        ],
        exits: [
          { direction: "west", to: "gallery" },
          {
            direction: "east",
            to: "hearth",
            conditions: [{ has_flag: WARDEN_DOWN }],
            locked_msg: `The ${theme.wardenName} bars the way east while it still stands.`,
          },
        ],
      },
      {
        id: "hearth",
        name: theme.hearthName,
        description:
          `Exit west returns to the last hall. A ${theme.sealName} blocks the way down. ` +
          `${theme.leverVerb.toUpperCase()} ${theme.sealName} WITH ${theme.barName} to open it.`,
        variants: [
          {
            when: [{ quest_stage: { quest: GRATE_OPEN.quest, stage: GRATE_OPEN.stage } }],
            text: `Exits: west and down. The opened ${theme.sealName} no longer blocks the stairs.`,
          },
        ],
        objects: [SEAL],
        exits: [
          { direction: "west", to: "span" },
          {
            direction: "down",
            to: "vault",
            conditions: [{ quest_stage: { quest: GRATE_OPEN.quest, stage: GRATE_OPEN.stage } }],
            locked_msg:
              `The ${theme.sealName} is sealed fast. ` +
              `${theme.leverVerb.toUpperCase()} ${theme.sealName} WITH ${theme.barName}.`,
          },
        ],
      },
      {
        id: "vault",
        name: theme.vaultName,
        description: `The ${theme.relic} rests on the stone platform. Reaching it completes the quest.`,
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
          `THE ROUTE HELD TWO GUARDIANS. BOTH ARE SLOW; THE SECOND IS STRONGER. ` +
          `IF THE FIRST GUARDIAN STILL STANDS, ATTACK ${theme.foeName.toUpperCase()}. ` +
          `IF THE SECOND GUARDIAN STILL STANDS, ATTACK ${theme.wardenName.toUpperCase()}. ` +
          `THE ${theme.relic.toUpperCase()} IS BELOW THE SEAL. ` +
          `IF THE SEAL IS STILL CLOSED, ${theme.leverVerb.toUpperCase()} ` +
          `${theme.sealName.toUpperCase()} WITH ${theme.barName.toUpperCase()}. ` +
          `COMPLETED FIGHTS AND AN OPENED SEAL STAY COMPLETE.`,
      },
      {
        id: BAR,
        name: theme.barName,
        aliases: ["bar", "lever", "pry-bar", "prybar"],
        description: `The ${theme.barName} is strong enough. If you are not holding the ${theme.barName}, TAKE ${theme.barName}. If the ${theme.sealName} is still closed, ${theme.leverVerb.toUpperCase()} ${theme.sealName} WITH ${theme.barName}.`,
        takeable: true,
      },
      {
        id: WARD,
        name: theme.wardName,
        aliases: ["ward", "armour", "armor", "mail", "plate", "suit"],
        description: `An intact ${theme.wardName}. If you are not holding the ${theme.wardName}, TAKE ${theme.wardName}. The first command, DON ${theme.wardName}, teaches a lasting braced stance and grants +2 defense against either guardian still standing. Before that DON, carrying the ward gives no bonus; afterward, the bonus persists even if the ward is dropped.`,
        // Reactive examine once donned (a single variant ⇒ cannot shadow).
        variants: [
          {
            when: [{ has_flag: WARD_DONNED }],
            text: `You completed the ${theme.wardName}'s first DON. Its learned +2 defense remains even if the ward is later dropped.`,
          },
        ],
        takeable: true,
        interactions: [
          // Self-USE = "wear this". command_verb "don" (not a builtin verb); one-shot, gated
          // none_of ward_donned so the +2 defense cannot be farmed. The buff serves BOTH fights.
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
                add_journal: `The ${theme.wardName}'s first DON teaches a lasting braced stance and grants +2 defense against either guardian still standing. The bonus persists even if the ward is later dropped.`,
              },
              {
                narrate: `You put on the ${theme.wardName}, learn its braced weight, and gain lasting +2 defense. The bonus persists even if you later drop it.`,
              },
            ],
          },
        ],
      },
      {
        id: SEAL,
        name: theme.sealName,
        aliases: ["seal", "grate", "slab", "door", "grille", "hatch"],
        description: `A closed ${theme.sealName} with a worn edge. ${theme.leverVerb.toUpperCase()} ${theme.sealName} WITH ${theme.barName}.`,
        variants: [
          {
            when: [{ quest_stage: { quest: GRATE_OPEN.quest, stage: GRATE_OPEN.stage } }],
            text: `The ${theme.sealName} is open. The way down is clear.`,
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
                  add_journal: `You open the ${theme.sealName} with the ${theme.barName}. The way down is clear.`,
                },
                { inc_var: { name: "score", by: leverAward } },
                {
                  narrate: `You ${theme.leverVerb.toUpperCase()} the ${theme.sealName} open with the ${theme.barName}. The way down is clear.`,
                },
              ],
              on_failure: [
                {
                  narrate: `The ${theme.sealName} does not move. Try again: ${theme.leverVerb.toUpperCase()} ${theme.sealName} WITH ${theme.barName}.`,
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
        description: `The ${theme.relic}. Reaching it completes the quest.`,
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
              npc_text: `I have watched this place for a long time. Ask about the guardians or the last explorer.`,
              variants: [
                {
                  when: [{ any_of: [{ has_flag: HEARD_FOE }, { has_flag: HEARD_WARD }] }],
                  text: `The ${theme.spiritName} waits. Ask any remaining question or leave.`,
                },
              ],
              topics: [
                // Each info topic retires once told (gated on its own flag), so the +2 attack is
                // claimable only once. The ungated leave keeps the node terminating.
                {
                  id: "ask_foe",
                  prompt: `Ask about the keepers below.`,
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
              npc_text: `The route held two guardians: first the ${theme.foeName}, then the stronger ${theme.wardenName}. Both are slow. My warmth gives you +2 attack against either one still standing.`,
              effects: [
                { set_flag: HEARD_FOE },
                { inc_var: { name: "attack", by: 2 } },
                {
                  add_journal: `The ${theme.spiritName} gives you +2 attack; it applies to either guardian still standing.`,
                },
              ],
              topics: [
                { id: "foe_back", prompt: "Nod, and ask something else.", goto: "spirit_root" },
              ],
            },
            {
              id: "spirit_ward",
              npc_text: `The intact ${theme.wardName} found beside the dead explorer in the west cell teaches a lasting +2 defense stance on its first DON. The bonus applies to guardians still standing and persists even if the ward is later dropped.`,
              effects: [
                { set_flag: HEARD_WARD },
                {
                  add_journal: `The spirit said the ${theme.wardName} in the west cell teaches a lasting +2 defense stance on its first DON. The bonus persists even if the ward is later dropped.`,
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
        // The LESSER first fight (bug_0173 cumulative-guarantee tuning). PREPARED (atk6/def4):
        // worst player dmg max(1,1+6-4)=3 ⇒ worstRounds ceil(6/3)=2; the ward floors its blow to
        // max(1,6+1-4)=3 ⇒ takes 3 — survivable on every roll, and only 3 of the joint 11-damage
        // budget. UNPREPARED (atk4/def2): worst player dmg max(1,1+4-4)=1 ⇒ 6 rounds, and its blow
        // is max(1,6+1-2)=5 ⇒ up to 25 ≥ 20 HP — a real, lethal gamble, so ending_fallen_sentinel
        // stays reachable for a player who skips the spirit's counsel and the ward.
        hp: 6,
        attack: 1,
        defense: 4,
        defeat_flag: FOE_DOWN,
        death_ending: "ending_fallen_sentinel",
        on_defeat: [
          { add_journal: `The ${theme.foeName} comes apart; the way east lies open.` },
          { inc_var: { name: "score", by: foeAward } },
        ],
      },
      {
        id: "warden",
        name: theme.wardenName,
        description: theme.wardenDesc,
        room: "span",
        // The GREATER second fight (bug_0173 cumulative-guarantee tuning) — strictly tougher than
        // the sentinel (more HP, higher attack). PREPARED (atk6/def4): worst player dmg
        // max(1,1+6-4)=3 ⇒ worstRounds ceil(9/3)=3; its blow floors to max(1,6+2-4)=4 ⇒ takes 8.
        // Joint with the sentinel's 3 that is 11 < 20, so the prepared player clears the WHOLE
        // gauntlet on every roll — the cumulative guarantee (bug_0172) passes green. UNPREPARED
        // (atk4/def2): worst player dmg max(1,1+4-4)=1 ⇒ 9 rounds, its blow max(1,6+2-2)=6 ⇒ up to
        // 48, lethal even after a best-roll pass through the sentinel, so ending_fallen_guardian
        // stays reachable for the unprepared.
        hp: 9,
        attack: 2,
        defense: 4,
        defeat_flag: WARDEN_DOWN,
        death_ending: "ending_fallen_guardian",
        on_defeat: [
          { add_journal: `The ${theme.wardenName} comes apart; the last way east lies open.` },
          { inc_var: { name: "score", by: wardenAward } },
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
        text: `You recover the ${theme.relic} and begin the climb back to the surface.`,
        death: false,
      },
      {
        id: "ending_fallen_sentinel",
        title: "Cold on the Stones",
        text: `The ${theme.foeName} kills you in the gallery. The ${theme.relic} remains below.`,
        death: true,
      },
      {
        id: "ending_fallen_guardian",
        title: "Fallen at the Deep Door",
        text: `The ${theme.wardenName} kills you near the final chamber. The ${theme.relic} remains below.`,
        death: true,
      },
    ],
  };

  // Self-check: a malformed emission throws here, never downstream. Returns the parsed pack
  // with schema defaults applied, identical in shape to a pack loaded from YAML.
  return RpgPackSchema.parse(pack);
}
