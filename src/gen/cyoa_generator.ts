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
 * What it is (and is not, yet). `generateCyoaPack(seed)` is a PURE, DETERMINISTIC function
 * (same seed ⇒ byte-identical pack — no Date/Math.random, §8.5) that emits a schema-valid
 * `CyoaPack` of the signature AdventureForge shape: a knowledge-gated moral fork — a hub of
 * plainly-labelled stances, an optional investigation that sets a `truth` flag, and a
 * "best" ending GATED on having learned the truth (tithe_barn's `knows_truth`, white_stag's
 * carved stone, the watchtower's proof-gated finale). The output is validated by the SAME
 * `validateCyoa` and proven solvable by the SAME exhaustive BFS that guard the shipped
 * packs — so a generated pack is held to the identical bar (see tests/unit/cyoa_generator.test.ts).
 *
 * The generated packs are NOT committed under content/cyoa/pack: they are an on-demand eval
 * distribution, not curated showcase content, so they incur no blind-playtest obligation and
 * never pollute the hand-authored set. The deferred, larger slices (an MCP tool, an assessor
 * lever that mints-and-checks each cycle, persistence of a held-out corpus) are explicitly
 * next, not here (docs/CURRENT_PLAN.md "rejected/next" — kept out so this stays one focused,
 * green-bar change). The structural variety the generator can emit (gates, depth, branch
 * count) is the lever later slices turn up; this slice establishes the provably-valid core.
 */
import { CyoaPackSchema, type CyoaPack } from "../cyoa/schema.js";

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
 * A theme is the cosmetic skin over the fixed structural skeleton — it varies the prose
 * and the moral framing so two seeds read as different stories, while the proof-relevant
 * shape (hub → gate → endings) is constant. Each `stances` entry is one plain (un-gated)
 * fork ending; `truth` describes the gated reveal and `best` the ending it unlocks.
 */
type Theme = {
  key: string;
  setting: string;
  hub: string;
  truthName: string; // what the investigation reveals
  truthSource: string; // where it is read
  stances: { label: string; outcome: string }[]; // plain fork endings (>= 2 used)
  gatedLabel: string; // the truth-gated "best" choice
  gatedOutcome: string;
  fallLabel: string; // the telegraphed lethal gamble
  fallOutcome: string;
};

const THEMES: readonly Theme[] = [
  {
    key: "barn",
    setting: "a lord's full grain-barn over a starving town",
    hub: "the dark barn, the thief frozen against the sacks, the only door at your back",
    truthName: "the steward's account-book",
    truthSource: "open on the table by the door",
    stances: [
      {
        label: "Seize the thief and call the lord's men for the bounty.",
        outcome: "the lord's silver and a hanging on the green",
      },
      {
        label: "Stand aside and let her slip out with her one sack.",
        outcome: "one family fed, the barn still locked on the rest",
      },
    ],
    gatedLabel: "Throw the great doors wide and call the whole town to the grain.",
    gatedOutcome: "a fed town, a barn open to the morning, and your name an outlaw's",
    fallLabel: "Climb the rotten loft-ladder to the older stores above.",
    fallOutcome: "the grey wood gives, and a winter's grain comes down on top of you",
  },
  {
    key: "lighthouse",
    setting: "a wreckers' coast where a false light draws ships onto the rocks",
    hub: "the cold lamp-room, the unlit lens, the storm-bound ship standing in toward the reef",
    truthName: "the keeper's logbook",
    truthSource: "left open beside the dead wick",
    stances: [
      {
        label: "Light the false beacon the wreckers paid for.",
        outcome: "a ship broken on the rocks and silver in your hand",
      },
      {
        label: "Leave the tower dark and let the ship pass blind.",
        outcome: "the ship gropes by in the dark, neither saved nor sunk",
      },
    ],
    gatedLabel: "Light the true channel-mark and guide the ship clear.",
    gatedOutcome: "a ship brought safe to harbour and the wreckers' trade ended on your word",
    fallLabel: "Climb the storm-loose gallery rail for a better sightline.",
    fallOutcome: "the rusted rail parts and the long fall takes you to the rocks below",
  },
  {
    key: "tithe",
    setting: "a plague village the manor has quietly sealed from within",
    hub: "the locked gatehouse, the sick on one side and the well road on the other",
    truthName: "the bailiff's sealed order",
    truthSource: "nailed inside the gate-ward's box",
    stances: [
      {
        label: "Keep the gate sealed as the order commands.",
        outcome: "the contagion held and the village left to burn itself out",
      },
      {
        label: "Quietly let one cart of the well slip out by night.",
        outcome: "a few carried clear, the gate sealed again behind them",
      },
    ],
    gatedLabel: "Break the seal and read the order aloud to the whole village.",
    gatedOutcome: "the lie undone, the gate thrown open, and the manor's hand shown to all",
    fallLabel: "Scale the crumbling curtain-wall to signal the road.",
    fallOutcome: "the frost-rotten parapet sloughs away and the drop takes you",
  },
  {
    key: "forge",
    setting: "a war-foundry casting blades the general means for a massacre",
    hub: "the casting floor, the cooling moulds, the muster horns sounding outside",
    truthName: "the quartermaster's order-slate",
    truthSource: "chalked and propped against the tuyère",
    stances: [
      {
        label: "Pour the heat and finish the order as cast.",
        outcome: "the blades shipped and your wage paid in full",
      },
      {
        label: "Quench the crucible and quietly spoil this one pour.",
        outcome: "one batch ruined, the next already ordered",
      },
    ],
    gatedLabel: "Crack the moulds and ring the foundry-bell to stop the muster.",
    gatedOutcome: "the casting wrecked, the order read out, and the muster broken cold",
    fallLabel: "Climb the slag-loose gantry over the crucible for the bell-rope.",
    fallOutcome: "the heat-eaten walkway buckles and drops you to the molten pour",
  },
  {
    key: "archive",
    setting: "a chancery archive ordered to burn the records of a stolen harvest",
    hub: "the muniment room, the brazier lit, the clerk's burn-list in your hand",
    truthName: "the under-clerk's tally-roll",
    truthSource: "slipped behind the press, missed by the order",
    stances: [
      {
        label: "Feed the marked rolls to the brazier as listed.",
        outcome: "the theft unrecorded and your service noted kindly",
      },
      {
        label: "Burn the list but pocket one roll for yourself.",
        outcome: "one proof saved in secret, the rest gone to ash",
      },
    ],
    gatedLabel: "Carry the tally-roll out and read it on the chancery steps.",
    gatedOutcome: "the theft made public record, the burn-order itself the final proof",
    fallLabel: "Climb the worm-eaten gallery shelves for the highest press.",
    fallOutcome: "the old shelving folds under you and a ton of ledgers comes down",
  },
  {
    key: "weir",
    setting: "a mill-weir whose sluice the miller keeps shut while the fields below die of thirst",
    hub: "the sluice-house, the penned water high and black, the cracked fields beyond",
    truthName: "the miller's water-grant",
    truthSource: "framed and forgotten on the sluice-house wall",
    stances: [
      {
        label: "Keep the sluice shut as the miller pays you to.",
        outcome: "the mill-pond full and the fields below left to crack",
      },
      {
        label: "Crack the gate a hand's-width by night for the nearest field.",
        outcome: "one field watered, the sluice shut again by dawn",
      },
    ],
    gatedLabel: "Haul the sluice full open and let the whole weir run to the fields.",
    gatedOutcome: "the fields drowned green, the grant read out, and the miller's hold broken",
    fallLabel: "Climb the slick weir-head timbers to free the jammed gate-pin.",
    fallOutcome: "the wet beam turns underfoot and the head-race takes you down",
  },
];

/**
 * Generate a schema-valid CYOA pack from an integer seed. Deterministic and pure: the same
 * seed always yields the identical pack. The structure is fixed (a hub, an investigation
 * that sets `truth`, two-or-three plain fork endings, one truth-gated "best" ending, one
 * telegraphed lethal gamble); the seed selects the theme and the number of plain stances,
 * so the eval distribution varies without any path ever becoming unprovable.
 *
 * The returned object is run through `CyoaPackSchema.parse`, so a malformed emission throws
 * HERE (a generator self-check) rather than slipping downstream — and the result carries the
 * schema's applied defaults exactly like a pack loaded from YAML.
 */
export function generateCyoaPack(seed: number): CyoaPack {
  const rng = makeRng(seed);
  const theme = THEMES[Math.abs(Math.trunc(seed)) % THEMES.length] as Theme;
  // 2 or 3 plain (un-gated) fork stances, seed-chosen, drawn from the theme's pool.
  const stanceCount = 2 + rng.int(theme.stances.length - 1);
  const stances = theme.stances.slice(0, stanceCount);

  const id = `gen_${Math.abs(Math.trunc(seed))}_v1`;
  const TRUTH = "truth";

  // ── Endings: one per plain stance, one gated "best", one telegraphed fall. Distinct
  //    title+text each (no DUPLICATE_ENDING). The gated ending needs no `variants` — it is
  //    structurally unreachable without `truth`, so it never collides with another route.
  const stanceEndings = stances.map((s, i) => ({
    id: `ending_stance_${i}`,
    title: `Stance: ${s.label.replace(/[.]/g, "")}`.slice(0, 80),
    text:
      `You make your choice in ${theme.setting}. ${s.label} ` +
      `What follows is ${s.outcome}, and you carry it with you after.`,
  }));
  const endingBest = {
    id: "ending_truth",
    title: "The Truth Acted On",
    text:
      `You read ${theme.truthName} and you will not keep its lie one more hour. ${theme.gatedLabel} ` +
      `What follows is ${theme.gatedOutcome} — the act only the one who learned the truth could take.`,
  };
  const endingFall = {
    id: "ending_fall",
    title: "The Fall",
    text:
      `You set yourself to the gamble the prose named outright. ${theme.fallLabel} ` +
      `It does not hold: ${theme.fallOutcome}. A chosen risk, foreshadowed, never an ambush.`,
  };

  // ── Scenes ────────────────────────────────────────────────────────────────────────
  // hub: the central decision. Plain stance choices are always offered; `investigate`
  // disappears once known (not_flag truth, like tithe_barn's `decipher`); the gated act
  // appears only once known. A single reactive variant re-narrates the hub after the
  // reveal (one variant ⇒ cannot shadow). The lethal gamble is plainly labelled.
  const hub = {
    id: "hub",
    title: theme.hub.split(",")[0]?.trim() ?? "The Choice",
    text:
      `You stand in ${theme.setting}: ${theme.hub}. ${theme.truthName} lies ${theme.truthSource}. ` +
      `What kind of person are you, here, tonight?`,
    variants: [
      {
        when: [{ has_flag: TRUTH }],
        text:
          `You stand in ${theme.setting}, and you cannot look at it the way you did before. ` +
          `You have read ${theme.truthName}; you know what it was kept for. ${theme.hub}.`,
      },
    ],
    choices: [
      {
        id: "investigate",
        text: `Read ${theme.truthName}, ${theme.truthSource}.`,
        conditions: [{ not_flag: TRUTH }],
        next: "clue",
      },
      ...stances.map((s, i) => ({
        id: `stance_${i}`,
        text: s.label,
        next: `ending_stance_${i}`,
      })),
      {
        id: "act_on_truth",
        text: theme.gatedLabel,
        conditions: [{ has_flag: TRUTH }],
        next: "ending_truth",
      },
      {
        id: "climb_gamble",
        text: theme.fallLabel,
        next: "ending_fall",
      },
    ],
  };
  // clue: reading sets `truth` (the pack's only flag, read by the gated choice ⇒ never
  // inert). `learn` is itself gated not_flag truth so a second read is a no-op return.
  const clue = {
    id: "clue",
    title: theme.truthName.replace(/^the\s+/i, "").replace(/\b\w/g, (c) => c.toUpperCase()),
    text:
      `You take up ${theme.truthName} ${theme.truthSource} and read it through. ` +
      `It is all set down plainly: what you are guarding was made a lie on purpose.`,
    choices: [
      {
        id: "learn",
        text: "Read it through to the end, and understand.",
        conditions: [{ not_flag: TRUTH }],
        effects: [
          { set_flag: TRUTH },
          {
            add_journal:
              `${theme.truthName} damns the whole of it: ${theme.setting} is no accident. ` +
              `You know now what only the act of opening it can answer.`,
          },
        ],
        next: "hub",
      },
      {
        id: "back",
        text: "Set it down and turn back.",
        next: "hub",
      },
    ],
  };

  const pack = {
    meta: {
      id,
      title: `${theme.key[0]?.toUpperCase()}${theme.key.slice(1)}: A Tithe Fork`,
      start: "hub",
    },
    scenes: [hub, clue],
    endings: [...stanceEndings, endingBest, endingFall],
  };

  // Self-check: a malformed emission throws here, never downstream. Returns the parsed
  // pack with schema defaults applied (choices/conditions/effects normalised), identical
  // in shape to a pack loaded from YAML.
  return CyoaPackSchema.parse(pack);
}
