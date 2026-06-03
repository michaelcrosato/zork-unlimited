/**
 * Procedural CYOA pack generator (the first slice of "evolve the eval distribution",
 * docs/CURRENT_PLAN.md — the second convergent research lever after the trust-boundary
 * hardening of bug_0155).
 *
 * Why a generator. Every structural proof in the suite (endings-reachable, variant-
 * liveness, soft-lock liveness, score-economy, menu-integrity) is exercised today only
 * against a FIXED set of ten hand-authored packs. A frozen eval set is exactly the
 * condition under which a self-improving agent's verifier stops being a moving target and
 * starts being a memorisable one (the agentic-self-learning reward-hacking result,
 * arXiv 2510.14253, and the assessor's own 0.5-floor collapse). The antidote the IF/agentic
 * literature converges on is to EVOLVE the distribution: mint fresh, never-seen packs the
 * checks must hold on. This module is the minting core.
 *
 * What it is. `generateCyoaPack(seed)` is a PURE, DETERMINISTIC function (same seed ⇒
 * byte-identical pack — no Date/Math.random, §8.5) that emits a schema-valid `CyoaPack`.
 *
 * Generator depth (v2, bug_0169 — bug_0168's named (a) structural lever). v1 emitted a
 * SINGLE-axis fork: one investigation set one `truth` flag and one "best" ending was gated
 * on it (tithe_barn's `knows_truth`, white_stag's carved stone). That shape exercised a
 * shrinking slice of the CYOA validator — one gate, one reactive variant, no shadowing
 * stack to order. v2 grows the SECOND knowledge axis the hand-authored frontier pack
 * dead_reckoning has: TWO independent investigations, in either order, each setting its own
 * flag — a SITUATIONAL truth (`knows_way`: the crisis is engineered and relief is at hand)
 * and a PERSONAL truth (`knows_ally`: the maligned figure is the one who can actually mend
 * it). They form a 2x2 of knowledge over one finale of three-or-four telegraphed acts (the
 * fourth GREED act is the seed-chosen variety knob):
 *   - HOLD the line (discipline; reframed by knows_way),
 *   - empower the ALLY (the surest act, GATED on knows_ally; reframed by knows_way),
 *   - the DARK sanctioned act (reframed by knows_ally — ignorant vs knowing),
 *   - GREED, take yours and go (reframed by knows_way — the worst, when you knew).
 * Knowledge does not add routes; it REFRAMES them (the paired-epilogue device — white_stag's
 * ending_quarry, the manor's two letters), so the finale's reactive stack now carries THREE
 * variants — both flags, then each alone — that MUST be ordered most-specific-first or the
 * validator's UNREACHABLE_VARIANT shadowing check (cyoa_validator.checkVariantShadowing)
 * fires. Every mint now forces the validator to prove a two-flag obtainability, a real
 * load-bearing gate, AND a correctly-ordered shadowing-clean variant stack — a strictly
 * harder fresh distribution every cycle (the never-frozen-target property the contamination-
 * free benchmark thesis rests on; arXiv 2510.14253). The output is validated by the SAME
 * `validateCyoa` and proven solvable by the SAME exhaustive BFS that guard the shipped packs
 * (tests/unit/cyoa_generator.test.ts).
 *
 * The generated packs are NOT committed under content/cyoa/pack: they are an on-demand eval
 * distribution, not curated showcase content, so they incur no blind-playtest obligation and
 * never pollute the hand-authored set. The held-out CORPUS (bug_0163, corpus/cyoa/*.yaml +
 * corpus/manifest.json) seals a fixed seed window of these; a shape change like this one is
 * recorded behind the CYOA_GENERATOR_VERSION bump below and a re-seal (npm run corpus:seal).
 */
import { CyoaPackSchema, type CyoaPack } from "../cyoa/schema.js";

/**
 * Generator version stamp (bug_0163, held-out corpus persistence). This does NOT change any
 * emitted pack — it is recorded only in `corpus/manifest.json` so that a FUTURE change to the
 * generator surfaces as a loud, diagnosable manifest mismatch ("generator changed", a deliberate
 * version bump) rather than silent corpus rot vs a tampered content hash. Bump it whenever the
 * emitted pack shape changes; the re-seal then re-stamps every entry. v2 = the bug_0169 two-axis
 * 2x2 deepening (was v1, the single-`truth`-axis fork).
 */
export const CYOA_GENERATOR_VERSION = 2;

/**
 * A tiny deterministic PRNG (mulberry32). Pure and self-contained: no global RNG, no
 * Date — the whole point of the generator is reproducibility (§8.5), so randomness comes
 * only from the integer seed threaded here. `next()` returns a float in [0, 1); `int(n)`
 * a value in [0, n); `pick` a uniform element of a non-empty array.
 */
function makeRng(seed: number): { int: (n: number) => number; pick: <T>(xs: readonly T[]) => T } {
  // mulberry32 — a well-known small, high-quality 32-bit generator. `>>> 0` keeps the
  // state an unsigned 32-bit int so the sequence is identical across platforms.
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
 * A theme is the cosmetic skin over the fixed two-axis structural skeleton — it varies the
 * prose and the moral framing so two seeds read as different stories, while the proof-relevant
 * shape (hub → two gated investigations → 2x2-reframed finale) is constant.
 *
 * Two independent knowledge axes, each an investigation that sets one flag:
 *   - `way`  is the SITUATIONAL truth: the crisis is engineered / relief is nearer than it
 *     looks. It reframes the discipline, ally, and greed acts (you acted KNOWING the way out).
 *   - `ally` is the PERSONAL truth: the figure everyone has condemned is the one who can
 *     actually mend it. It GATES the surest "best" act and reframes the dark sacrifice.
 * Each `Act` carries the plain outcome and a `known` reframe its reframing axis unlocks.
 */
type Truth = { name: string; source: string; reveal: string };
type Act = { label: string; outcome: string; known: string };
type Theme = {
  key: string;
  setting: string;
  hub: string; // the central tableau, also the scene's title (first clause)
  way: Truth; // situational axis → knows_way
  ally: Truth; // personal axis → knows_ally
  hold: Act; // discipline; reframed by knows_way
  best: Act; // GATED on knows_ally; reframed by knows_way
  dark: Act; // the sanctioned dark act; reframed by knows_ally
  greed: Act; // greed; reframed by knows_way
};

const THEMES: readonly Theme[] = [
  {
    key: "barn",
    setting: "a lord's locked grain-barn standing full over a starving town",
    hub: "the dark barn, the caught thief pinned against the grain-sacks, the only door at your back",
    way: {
      name: "the steward's account-book",
      source: "open on the table by the door",
      reveal:
        "the dearth is made, not fallen: the barn is full and the lord means to sell high while the town goes hungry — relief is one unbarred door away",
    },
    ally: {
      name: "the caught thief",
      source: "pinned in the dark, willing to talk if you will hear her",
      reveal:
        "she is the miller's daughter, who knows every family's need and could share the grain out fairly — a feeding, not a riot",
    },
    hold: {
      label: "Bar the door again and hold the peace until the magistrate rides in.",
      outcome: "an orderly hunger and the law's slow, late mercy",
      known:
        "you held the line knowing the barn was full by design — order kept, but kept over a lie you now help carry",
    },
    best: {
      label: "Give the thief the keys and let her share the grain out as only she knows how.",
      outcome: "a town fed without a riot, by the one hand that knew each door that needed it",
      known:
        "you knew the dearth was a lie AND who could undo it, and you put the full barn in the right hands — the cleanest justice the night could hold",
    },
    dark: {
      label: "Hand the thief to the lord's men for the standing bounty.",
      outcome: "a hanging on the green and your silver counted out",
      known:
        "you had heard her out and knew she was the one soul who could have fed them all, and you sold her for coin regardless",
    },
    greed: {
      label: "Take what grain you can carry and slip out before either side decides.",
      outcome: "a full sack and a conscience you take care not to examine",
      known:
        "you knew the barn was full and an open door would have saved the town, and you took your sack and left it barred behind you",
    },
  },
  {
    key: "lighthouse",
    setting: "a wreckers' coast where a false light is paid to draw ships onto the reef",
    hub: "the cold lamp-room, the unlit lens, a storm-bound ship standing in toward the rocks",
    way: {
      name: "the keeper's logbook",
      source: "left open beside the dead wick",
      reveal:
        "the true channel is marked plain and still passable: the wreck is no accident of weather but a trade, and a single honest light would clear the ship",
    },
    ally: {
      name: "the keeper's mute boy",
      source: "crouched in the lamp-room shadow, watching you",
      reveal:
        "he has run this lens since he could climb the stair and can lay the true beam on the channel by feel in the dark — the one hand aboard who can save the ship",
    },
    hold: {
      label: "Light nothing, and ride the storm out behind a barred door.",
      outcome: "a ship left to grope by in the dark, neither lured nor guided",
      known:
        "you kept clear of it knowing one true light would have cleared her — clean hands bought by doing nothing while you could have done right",
    },
    best: {
      label: "Put the boy at the lens and let him lay the true beam on the channel.",
      outcome: "a ship brought safe to harbour by the surest hand on the coast",
      known:
        "you knew the channel was passable AND whose hands could thread it, and you gave him the light — the wreckers' trade ended on a single honest beam",
    },
    dark: {
      label: "Light the false beacon the wreckers paid for and take the fee.",
      outcome: "a ship broken on the reef and silver cold in your hand",
      known:
        "you knew the boy could have laid her safe through, and you lit the lie over him for the fee anyway",
    },
    greed: {
      label: "Strip the lamp-room of its oil and brass and be gone before dawn.",
      outcome: "a heavy pack and a tower left as dark as you found it",
      known:
        "you knew the true channel and the boy who could light it, and you carried off the very oil that would have saved her",
    },
  },
  {
    key: "tithe",
    setting: "a plague village the manor has quietly sealed from within",
    hub: "the locked gatehouse, the sick on one side and the open road on the other",
    way: {
      name: "the bailiff's sealed order",
      source: "nailed inside the gate-ward's box",
      reveal:
        "the contagion has all but burned out and the manor knows it — the gate is kept shut not to hold sickness but to hide a debt the dead can no longer claim",
    },
    ally: {
      name: "the herb-wife they have blamed",
      source: "shut in the gate-ward's lean-to, called the one who brought the curse",
      reveal:
        "she has nursed the sick through and knows exactly who may safely pass and who must wait — the one judgement that could open the gate without spreading death",
    },
    hold: {
      label: "Keep the gate sealed as the order commands and wait for the fever to pass.",
      outcome: "the sickness held and the village left to burn itself slowly out",
      known:
        "you held the seal knowing the fever was already spent — obedience kept over a lie meant only to bury a debt",
    },
    best: {
      label: "Hand the herb-wife the gate-key and let her pass out whoever she judges clear.",
      outcome:
        "the well led safely out and the sick still tended, by the one who knew which was which",
      known:
        "you knew the danger was past AND whose judgement could be trusted, and you opened the gate by her word — mercy without a single new death",
    },
    dark: {
      label: "Give the herb-wife to the villagers as the witch they want burned.",
      outcome: "a fire at the gate and a fear that buys you a night's quiet",
      known:
        "you knew she was the one healer who could have freed them safely, and you fed her to their fear to be rid of the choice",
    },
    greed: {
      label: "Take the manor's hush-coin from the gate-box and ride on alone.",
      outcome: "a purse of silence and a gate left locked behind you",
      known:
        "you knew the fever was spent and the seal a lie, and you took the bribe to keep it locked over people who could have walked free",
    },
  },
  {
    key: "foundry",
    setting: "a war-foundry casting the blades a general means for a massacre",
    hub: "the casting floor, the cooling moulds, the muster horns sounding beyond the doors",
    way: {
      name: "the quartermaster's order-slate",
      source: "chalked and propped against the cold tuyère",
      reveal:
        "the muster turns on this one pour: spoil it and there are no blades to march behind, and the order itself names the village it was cast to put to the sword",
    },
    ally: {
      name: "the branded furnace-slave",
      source: "chained by the crucible, marked the one who fouled the last heat",
      reveal:
        "he has read these furnaces for twenty years and can wreck the pour clean, as a flaw and not a sabotage — the one hand who can stop it without bringing the lash on the floor",
    },
    hold: {
      label: "Finish the pour true and trust the muster to be called off in time.",
      outcome: "good blades shipped and your wage paid in full, and the marching left to others",
      known:
        "you poured it true knowing this batch was the muster's whole edge — clean work, done for a thing you knew it was for",
    },
    best: {
      label: "Let the furnace-slave foul the heat his own way, and cover for him.",
      outcome: "a pour wrecked past saving and no lash that falls, by the one who knew how",
      known:
        "you knew the muster hung on this heat AND whose hand could spoil it cleanly, and you let him — the march broken and no one burned for it",
    },
    dark: {
      label: "Name the slave to the overseer to clear yourself and keep the floor moving.",
      outcome: "a flogging at the crucible and a pour that runs on without you",
      known:
        "you knew he was the one man who could have stopped the massacre, and you gave him to the lash to save your own back",
    },
    greed: {
      label: "Pocket the cooled ingots' worth in scrap-bronze and walk off the floor.",
      outcome: "a weight of metal and a pour you leave running behind you",
      known:
        "you knew the muster lived or died on this heat, and you carried off scrap while the blades cooled for the march",
    },
  },
  {
    key: "archive",
    setting: "a chancery archive ordered to burn the records of a stolen harvest",
    hub: "the muniment room, the brazier lit, the clerk's burn-list already in your hand",
    way: {
      name: "the under-clerk's tally-roll",
      source: "slipped behind the press, missed by the burn-order",
      reveal:
        "one roll proves the whole theft and the order cannot account for it — the harvest can still be restored to the people it was taken from if the proof simply survives the night",
    },
    ally: {
      name: "the disgraced under-clerk",
      source: "locked in the copy-room, blamed for the missing roll",
      reveal:
        "she wrote the tally and knows which lords it damns and how to lay it before the right court — the one person who can turn a saved roll into actual restitution",
    },
    hold: {
      label: "Burn only what is plainly spent and quietly file the rest unread.",
      outcome: "an order half-obeyed and a record left to gather dust, neither destroyed nor used",
      known:
        "you spared the rolls knowing they could right the theft, then left them filed and silent — proof kept, and kept from doing any good",
    },
    best: {
      label: "Give the under-clerk the tally-roll and the way out to the right court.",
      outcome:
        "the theft brought to judgement and the harvest restored, by the one who could prove it",
      known:
        "you knew the proof would survive AND whose hand could wield it, and you put the roll where it would undo the theft — the burn-order itself the final evidence",
    },
    dark: {
      label: "Name the under-clerk as the one who hid the roll and feed the lot to the brazier.",
      outcome: "a service noted kindly and a fire that takes the proof with her name",
      known:
        "you knew she was the one who could have restored the harvest, and you burned her good name with the roll to be done with it",
    },
    greed: {
      label: "Burn the list but keep one roll back to sell to the lord it would have damned.",
      outcome: "a private price paid for your silence and the rest gone to ash",
      known:
        "you knew the roll could have fed the robbed, and you turned it into a bribe and let the ashes cover the rest",
    },
  },
  {
    key: "weir",
    setting: "a mill-weir whose sluice the miller keeps shut while the fields below die of thirst",
    hub: "the sluice-house, the penned water high and black, the cracked fields stretching beyond",
    way: {
      name: "the miller's water-grant",
      source: "framed and forgotten on the sluice-house wall",
      reveal:
        "the grant gives the fields their share by right and the pond can spare it twice over — the drought below is the miller's making, and one open gate undoes it",
    },
    ally: {
      name: "the dammed-out cottar",
      source: "held in the sluice-house, taken for the one who has been breaking the gate by night",
      reveal:
        "he has worked this weir his whole life and can open it by stages without bursting the head — the one hand who can water the fields without drowning them",
    },
    hold: {
      label: "Keep the sluice shut for now and carry the dispute to the manor court.",
      outcome: "the pond full, the fields cracking, and a hearing set for some later season",
      known:
        "you held the gate knowing the grant already gave the fields their right — order kept over a thirst the law had long since settled",
    },
    best: {
      label: "Put the cottar at the sluice and let him let the water down by stages.",
      outcome:
        "the fields watered green and the head held safe, by the one who knew the weir's measure",
      known:
        "you knew the water could be spared AND whose hands could spend it safely, and you opened the gate by his measure — the miller's hold broken without a field drowned",
    },
    dark: {
      label: "Hand the cottar to the miller's men as the gate-breaker they want.",
      outcome: "a beating at the sluice and a pond that stays penned behind you",
      known:
        "you knew he was the one man who could have watered the fields safely, and you gave him to the miller to keep the gate shut",
    },
    greed: {
      label: "Take the miller's retainer to look the other way and leave the gate as it is.",
      outcome: "a paid silence and a sluice left exactly as black and shut as you found it",
      known:
        "you knew the grant gave the fields their water and the pond could spare it, and you took coin to keep it from them",
    },
  },
];

/**
 * Generate a schema-valid CYOA pack from an integer seed. Deterministic and pure: the same
 * seed always yields the identical pack. The structure is fixed (a hub holding two flag-gated
 * investigations and a finale of three-or-four telegraphed acts; two reactive knowledge axes
 * forming a 2x2 over the finale and its endings); the seed selects the theme and whether the
 * fourth "greed" act is included, so the eval distribution varies without any path ever becoming
 * unprovable.
 *
 * The returned object is run through `CyoaPackSchema.parse`, so a malformed emission throws
 * HERE (a generator self-check) rather than slipping downstream — and the result carries the
 * schema's applied defaults exactly like a pack loaded from YAML.
 */
export function generateCyoaPack(seed: number): CyoaPack {
  const rng = makeRng(seed);
  const theme = THEMES[Math.abs(Math.trunc(seed)) % THEMES.length] as Theme;
  // The fourth "greed" act is the seed-chosen variety knob (the v1 generator varied the
  // plain-stance count the same way): some mints emit three acts, some four. Both keep the
  // 2x2 knowledge intact and both keep BOTH flags read, so the gate/shadowing bar is held
  // either way. Drawn from rng (not raw seed) so it is uncorrelated with the theme index.
  const includeGreed = rng.int(2) === 0;

  const id = `gen_${Math.abs(Math.trunc(seed))}_v1`;
  const WAY = "knows_way"; // situational axis
  const ALLY = "knows_ally"; // personal axis

  // ── Endings: discipline, the gated best, the dark act, and (sometimes) greed. Each has a
  //    single reactive variant its reframing axis unlocks — one variant ⇒ no shadowing stack
  //    on the ending itself. Distinct title+text each (no DUPLICATE_ENDING). The base text is
  //    the IGNORANT telling; the variant is the KNOWING reframe (the white_stag device).
  const endHold = {
    id: "ending_hold",
    title: "Hold the Line",
    text: `You choose discipline in ${theme.setting}. ${theme.hold.label} What follows is ${theme.hold.outcome}.`,
    variants: [
      {
        when: [{ has_flag: WAY }],
        text: `You choose discipline, but not in ignorance: ${theme.hold.known}.`,
      },
    ],
  };
  const endBest = {
    id: "ending_best",
    title: "The Surest Hand",
    text: `Because you learned who they truly are, you can do the one thing the rest would not. ${theme.best.label} What follows is ${theme.best.outcome}.`,
    variants: [
      {
        when: [{ has_flag: WAY }],
        text: `You knew the way out and you knew whose hands could take it: ${theme.best.known}.`,
      },
    ],
  };
  const endDark = {
    id: "ending_dark",
    title: "The Sanctioned Wrong",
    text: `You take the act everyone around you is urging. ${theme.dark.label} What follows is ${theme.dark.outcome}.`,
    variants: [
      {
        when: [{ has_flag: ALLY }],
        text: `You had heard them out, so this is no superstition but a thing done with open eyes: ${theme.dark.known}.`,
      },
    ],
  };
  const endGreed = {
    id: "ending_greed",
    title: "Take Yours and Go",
    text: `You decide the whole of it is none of yours to mend. ${theme.greed.label} What follows is ${theme.greed.outcome}.`,
    variants: [
      {
        when: [{ has_flag: WAY }],
        text: `You knew there was a way through for everyone, and you took only your own: ${theme.greed.known}.`,
      },
    ],
  };
  const endings = includeGreed
    ? [endHold, endBest, endDark, endGreed]
    : [endHold, endBest, endDark];

  // ── Scenes ────────────────────────────────────────────────────────────────────────
  // hub: the central decision AND the two investigation side-trips. Each investigate choice
  // disappears once its flag is set (not_flag gate, like tithe_barn's `decipher`); the `best`
  // act appears only once the PERSONAL truth is known. A reactive variant stack re-narrates
  // the hub by what has been learned — MOST-SPECIFIC FIRST (both flags, then each alone) so
  // the validator's first-match-wins shadowing check (UNREACHABLE_VARIANT) stays clean.
  const finaleChoices = [
    {
      id: "hold",
      text: theme.hold.label,
      next: "ending_hold",
    },
    {
      id: "best",
      text: theme.best.label,
      conditions: [{ has_flag: ALLY }],
      next: "ending_best",
    },
    {
      id: "dark",
      text: theme.dark.label,
      next: "ending_dark",
    },
    ...(includeGreed ? [{ id: "greed", text: theme.greed.label, next: "ending_greed" }] : []),
  ];
  const hub = {
    id: "hub",
    title: theme.hub.split(",")[0]?.trim() ?? "The Choice",
    text:
      `You stand in ${theme.setting}: ${theme.hub}. ${theme.way.name} lies ${theme.way.source}, ` +
      `and ${theme.ally.name} is ${theme.ally.source}. What kind of person are you, here, tonight?`,
    variants: [
      {
        // both axes known — the fullest reframe; FIRST so it can never be shadowed.
        when: [{ all_of: [{ has_flag: WAY }, { has_flag: ALLY }] }],
        text:
          `You stand in ${theme.setting}, and you can no longer pretend not to know. You have read ` +
          `${theme.way.name} and you have heard ${theme.ally.name} out: you know there is a way ` +
          `through this for everyone, and you know whose hands could take it. ${theme.hub}.`,
      },
      {
        // situational truth only.
        when: [{ has_flag: WAY }],
        text:
          `You stand in ${theme.setting}, and ${theme.way.name} has changed what you see: ` +
          `${theme.way.reveal}. ${theme.hub}.`,
      },
      {
        // personal truth only.
        when: [{ has_flag: ALLY }],
        text:
          `You stand in ${theme.setting}, and you cannot now look at ${theme.ally.name} the way ` +
          `the others do: ${theme.ally.reveal}. ${theme.hub}.`,
      },
    ],
    choices: [
      {
        id: "learn_way",
        text: `Read ${theme.way.name}, ${theme.way.source}.`,
        conditions: [{ not_flag: WAY }],
        next: "clue_way",
      },
      {
        id: "learn_ally",
        text: `Hear out ${theme.ally.name}.`,
        conditions: [{ not_flag: ALLY }],
        next: "clue_ally",
      },
      ...finaleChoices,
    ],
  };
  // clue_way: reading sets `knows_way` (read by the hub/ending variants ⇒ never inert). The
  // `learn` is itself gated not_flag so a second read is a no-op return to the hub.
  const clueWay = {
    id: "clue_way",
    title: titleCase(theme.way.name),
    text: `You take up ${theme.way.name} ${theme.way.source} and read it through. It is plain enough: ${theme.way.reveal}.`,
    choices: [
      {
        id: "learn",
        text: "Take in what it means, and turn back.",
        conditions: [{ not_flag: WAY }],
        effects: [
          { set_flag: WAY },
          {
            add_journal: `${theme.way.name}: ${theme.way.reveal}. The crisis has a way through it that you can no longer un-know.`,
          },
        ],
        next: "hub",
      },
      { id: "back", text: "Set it down and go back without reading.", next: "hub" },
    ],
  };
  // clue_ally: hearing them out sets `knows_ally` (read by the `best` gate and the hub/dark
  // variants ⇒ never inert).
  const clueAlly = {
    id: "clue_ally",
    title: titleCase(theme.ally.name),
    text: `You hear ${theme.ally.name} out where they are ${theme.ally.source}. The truth of it is not what the others have decided: ${theme.ally.reveal}.`,
    choices: [
      {
        id: "learn",
        text: "Believe them, and turn back.",
        conditions: [{ not_flag: ALLY }],
        effects: [
          { set_flag: ALLY },
          {
            add_journal: `${theme.ally.name}: ${theme.ally.reveal}. The one the others would throw away is the one who could mend it.`,
          },
        ],
        next: "hub",
      },
      { id: "back", text: "Say nothing, and go back.", next: "hub" },
    ],
  };

  const pack = {
    meta: {
      id,
      title: `${titleCase(theme.key)}: A Two-Truth Fork`,
      start: "hub",
    },
    scenes: [hub, clueWay, clueAlly],
    endings,
  };

  // Self-check: a malformed emission throws here, never downstream. Returns the parsed
  // pack with schema defaults applied (choices/conditions/effects normalised), identical
  // in shape to a pack loaded from YAML.
  return CyoaPackSchema.parse(pack);
}

/** Capitalise the first letter of each word, dropping a leading article — for scene/pack
 *  titles built from a theme's prose strings (e.g. "the steward's account-book" →
 *  "Steward's Account-Book"). Pure, ASCII-only, deterministic. */
function titleCase(s: string): string {
  return s.replace(/^the\s+/i, "").replace(/\b\w/g, (c) => c.toUpperCase());
}
