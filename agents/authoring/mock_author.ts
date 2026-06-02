/**
 * Deterministic mock author provider (spec §12.7).
 *
 * The DEFAULT backend for the writer/adapter agents, so the whole authoring
 * pipeline runs in tests and CI with no live calls and no API keys. It returns
 * canned, schema-valid JSON keyed by `schemaName`. To exercise the adapter →
 * validator → revise loop honestly, the adapter's FIRST attempt ships a pack with
 * a dangling choice reference; once the validator's errors are fed back (present
 * in the prompt) it returns the corrected pack. A real provider (OpenAI/Anthropic/
 * Google) implementing the same `completeJson` would slot in behind an env var.
 */
import type { Provider, CompletionRequest } from "../llm/provider.js";

// ── The canned story the "writer" drafts ──────────────────────────────────────
const STORY = {
  title: "The Lighthouse",
  premise:
    "A keeper climbs a storm-battered cliff to relight a dead lighthouse before the night packet wrecks on the rocks.",
  chapters: [
    {
      id: "ch1",
      title: "The Climb",
      prose:
        "Rain drives sideways off the sea as the keeper hauls up the cliff path toward the dark tower.",
    },
    {
      id: "ch2",
      title: "The Lamp",
      prose:
        "Inside, the great lamp sits cold. Below, a ship's horn sounds, closer than it should be.",
    },
  ],
  beats: [
    { id: "arrival", summary: "The keeper reaches the foot of the cliff in a storm." },
    { id: "climb_cliff", summary: "The keeper climbs to the lighthouse door." },
    { id: "door_choice", summary: "At the door, the keeper can enter or retreat." },
    {
      id: "light_lamp",
      summary: "In the lamp room, the keeper relights the lamp to save the ship.",
    },
    { id: "storm_memory", summary: "A flashback to the night the light first failed." },
  ],
};

const CLASSIFICATIONS = [
  { beat_id: "arrival", label: "fully_supported", note: "Opening scene." },
  { beat_id: "climb_cliff", label: "fully_supported", note: "A branching choice." },
  { beat_id: "door_choice", label: "fully_supported", note: "Enter / retreat branch." },
  {
    beat_id: "light_lamp",
    label: "supported_with_minor_rewrite",
    note: "Modeled as a final choice rather than a timed action.",
  },
  {
    beat_id: "storm_memory",
    label: "requires_cutscene",
    note: "Flashback delivered as narrative text, not a playable scene.",
  },
];

// ── The pack the "adapter" emits (fixed form) ─────────────────────────────────
function lighthousePack(broken: boolean) {
  return {
    meta: { id: "lighthouse_v1", title: "The Lighthouse", start: "cliff_path" },
    scenes: [
      {
        id: "cliff_path",
        title: "The Cliff Path",
        text: "Rain drives off the black sea. A dead lighthouse looms above; the path home falls away below.",
        choices: [
          // The deliberate first-attempt defect: a dangling target the validator rejects.
          {
            id: "climb",
            text: "Climb to the lighthouse door.",
            next: broken ? "lighthouse_dor" : "lighthouse_door",
          },
          { id: "leave", text: "Turn back down the cliff.", next: "ending_flee" },
        ],
      },
      {
        id: "lighthouse_door",
        title: "The Lighthouse Door",
        text: "The door bangs on its hinge. Beyond, a cold spiral stair.",
        choices: [
          { id: "enter", text: "Step inside and climb.", next: "lamp_room" },
          { id: "back", text: "Step back onto the path.", next: "cliff_path" },
        ],
      },
      {
        id: "lamp_room",
        title: "The Lamp Room",
        text: "The great lamp sits cold. Below, a ship's horn sounds, far too close.",
        choices: [
          { id: "light", text: "Light the great lamp.", next: "ending_saved" },
          { id: "wait", text: "Wait in the dark.", next: "ending_lost" },
        ],
      },
    ],
    endings: [
      {
        id: "ending_saved",
        title: "The Light Returns",
        text: "The beam sweeps out; the packet turns in time. You kept the light.",
      },
      {
        id: "ending_lost",
        title: "Lost to the Dark",
        text: "The horn stops. In the morning, wreckage lines the rocks.",
      },
      {
        id: "ending_flee",
        title: "Down the Cliff",
        text: "You pick your way down and away. The tower stays dark behind you.",
      },
    ],
  };
}

// ── The parser pack the "adapter" emits for parser mode (fixed form) ──────────
// The SAME lighthouse story, adapted to a Zork-style parser pack: rooms joined by
// exits, a flavor object, and a `visited`-gated win (the canonical parser win shape,
// as in sealed_crypt's `visited: catacombs`). Climb the cliff (north) to the door,
// up to the lamp room → you keep the light. The first-attempt defect is the exact
// parser analogue of the CYOA mock's dangling choice: an exit whose `to` names no
// room, which `validateParser` rejects (EXIT_TARGET_MISSING) until it is corrected.
function lighthouseParserPack(broken: boolean) {
  return {
    meta: { id: "lighthouse_parser_v1", title: "The Lighthouse", start_room: "cliff_path" },
    rooms: [
      {
        id: "cliff_path",
        name: "The Cliff Path",
        description:
          "Rain drives off the black sea. A dead lighthouse looms to the north; the path home falls away below.",
        exits: [
          // The deliberate first-attempt defect: a dangling exit target the validator rejects.
          { direction: "north", to: broken ? "lighthouse_dor" : "lighthouse_door" },
        ],
      },
      {
        id: "lighthouse_door",
        name: "The Lighthouse Door",
        description:
          "The door bangs on its hinge. A cold spiral stair climbs up; the path is south.",
        exits: [
          { direction: "up", to: "lamp_room" },
          { direction: "south", to: "cliff_path" },
        ],
      },
      {
        id: "lamp_room",
        name: "The Lamp Room",
        description:
          "The great lamp fills the glass chamber. Below, a ship's horn sounds, far too close. The stair drops away down.",
        objects: ["lamp"],
        exits: [{ direction: "down", to: "lighthouse_door" }],
      },
    ],
    objects: [
      {
        id: "lamp",
        name: "the great lamp",
        aliases: ["lamp", "light"],
        description:
          "A vast brass lamp, its wick trimmed and ready. Reaching it is the whole climb.",
      },
    ],
    win_conditions: [
      { id: "reach_lamp", conditions: [{ visited: "lamp_room" }], ending: "ending_saved" },
    ],
    endings: [
      {
        id: "ending_saved",
        title: "The Light Returns",
        text: "You reach the lamp room as the beam can still be made to sweep out. You kept the light.",
      },
    ],
  };
}

// ── The RPG pack the "adapter" emits for rpg mode (fixed form) ────────────────
// The SAME lighthouse story, adapted to a Stage-4 RPG pack: the parser rooms PLUS
// player stats (hp/attack/defense/might), a foe that bars the stair (a drowned
// wrecker), and a seeded might skill check to free the salt-locked lamp. To win you
// must beat the wight (its defeat_flag gates the up-stair) and reach the lamp room.
// The first-attempt defect is the RPG analogue of the dangling reference the CYOA and
// parser mocks ship: the wight's `death_ending` names "ending_drownd" — an ending that
// is not declared — which ONLY the Stage-4 layer of `validateRpg` catches
// (ENEMY_DEATH_ENDING_UNDECLARED), proving the RICHEST validator is what decides
// correctness. Fixed once the validator's errors are fed back (→ "ending_drowned").
function lighthouseRpgPack(broken: boolean) {
  return {
    meta: {
      id: "lighthouse_rpg_v1",
      title: "The Lighthouse",
      start_room: "cliff_path",
      vars_init: { hp: 20, attack: 5, defense: 2, might: 3 },
    },
    rooms: [
      {
        id: "cliff_path",
        name: "The Cliff Path",
        description:
          "Rain drives off the black sea. A dead lighthouse looms to the north; the path home falls away below. A rusted iron spike juts from a rotten piling.",
        objects: ["iron_spike"],
        exits: [{ direction: "north", to: "lighthouse_door" }],
      },
      {
        id: "lighthouse_door",
        name: "The Lighthouse Door",
        description:
          "The door bangs on its hinge. A cold spiral stair climbs up — but a drowned wrecker, all weed and brine, stands across the first step. The path is south.",
        variants: [
          {
            when: [{ has_flag: "wight_banished" }],
            text: "The door bangs on its hinge. The drowned wrecker lies scattered across the threshold, and the cold stair climbs up at last. The path is south.",
          },
        ],
        exits: [
          { direction: "south", to: "cliff_path" },
          {
            direction: "up",
            to: "lamp_room",
            conditions: [{ has_flag: "wight_banished" }],
            locked_msg: "The drowned wrecker bars the stair; you cannot climb past it.",
          },
        ],
      },
      {
        id: "lamp_room",
        name: "The Lamp Room",
        description:
          "The great lamp fills the glass chamber, its turning-gear seized with salt. Below, a ship's horn sounds, far too close. The stair drops away down.",
        objects: ["lamp"],
        exits: [{ direction: "down", to: "lighthouse_door" }],
      },
    ],
    objects: [
      {
        id: "iron_spike",
        name: "iron spike",
        aliases: ["spike", "iron", "bar"],
        description:
          "A rusted iron spike the length of a forearm — stout enough to lever a seized gear.",
        takeable: true,
      },
      {
        id: "lamp",
        name: "the great lamp",
        aliases: ["lamp", "light", "gear", "mechanism"],
        description:
          "A vast brass lamp, its turning-gear locked solid with sea-salt. A strong arm and a good lever might force it free.",
        takeable: false,
        interactions: [
          {
            verb: "USE",
            item: "iron_spike",
            target: "lamp",
            skill_check: {
              skill: "might",
              difficulty: 12,
              on_success: [
                { set_flag: "lamp_freed" },
                {
                  add_journal:
                    "You lever the salt-locked gear; the great lamp swings free and the beam can sweep again.",
                },
                {
                  narrate:
                    "You set the spike to the gear and throw your weight on it — salt cracks, brass groans, and the lamp turns free.",
                },
              ],
              on_failure: [
                {
                  narrate:
                    "The spike bites but the salt-locked gear will not give. Set your feet and try again.",
                },
              ],
            },
          },
        ],
      },
    ],
    enemies: [
      {
        id: "storm_wight",
        name: "drowned wrecker",
        description:
          "A drowned man long given to the sea, weed-wound and barnacled, risen to keep the light dead.",
        room: "lighthouse_door",
        hp: 12,
        attack: 4,
        defense: 1,
        defeat_flag: "wight_banished",
        // The deliberate first-attempt defect: a death_ending that names no declared
        // ending (ENEMY_DEATH_ENDING_UNDECLARED), caught only by the Stage-4 validator.
        death_ending: broken ? "ending_drownd" : "ending_drowned",
        on_defeat: [
          {
            add_journal:
              "The drowned wrecker comes apart in weed and brine; the stair stands clear.",
          },
        ],
      },
    ],
    // The win turns on BOTH mechanics: you must beat the wight (its defeat_flag opens the
    // stair to the lamp room) AND pass the might skill check to free the salt-locked lamp.
    // So combat and the skill check are each load-bearing — the richest exercise of the
    // Stage-4 validator (and `lamp_freed` is read by a gate, not an inert write).
    win_conditions: [
      {
        id: "relight_lamp",
        conditions: [{ visited: "lamp_room" }, { has_flag: "lamp_freed" }],
        ending: "ending_saved",
      },
    ],
    endings: [
      {
        id: "ending_saved",
        title: "The Light Returns",
        text: "You gain the lamp room as the beam can still be made to sweep out. You kept the light.",
        death: false,
      },
      {
        id: "ending_drowned",
        title: "Down with the Wreck",
        text: "The drowned wrecker bears you down under weed and cold water. The light stays dead, and the packet with it.",
        death: true,
      },
    ],
  };
}

export class MockAuthorProvider implements Provider {
  readonly name = "mock:author";

  async completeJson<T>(req: CompletionRequest<T>): Promise<T> {
    if (req.schemaName === "WriterStory") return req.schema.parse(STORY);
    if (req.schemaName === "AdapterOutput") {
      // A non-empty prior_errors array in the prompt means the validator already
      // rejected the first attempt — so return the corrected pack.
      const sawErrors = /"prior_errors":\s*\[\s*\{/.test(req.user);
      return req.schema.parse({
        pack: lighthousePack(!sawErrors),
        classifications: CLASSIFICATIONS,
      });
    }
    if (req.schemaName === "ParserAdapterOutput") {
      // Same revise contract as the CYOA path: the first attempt ships a dangling
      // exit target; once the validator's errors are fed back, return the fix.
      const sawErrors = /"prior_errors":\s*\[\s*\{/.test(req.user);
      return req.schema.parse({
        pack: lighthouseParserPack(!sawErrors),
        classifications: CLASSIFICATIONS,
      });
    }
    if (req.schemaName === "RpgAdapterOutput") {
      // Same revise contract again, but the first attempt's defect is RPG-specific: a
      // wight whose death_ending names no declared ending, which only validateRpg's
      // Stage-4 layer rejects. Once the validator's errors are fed back, return the fix.
      const sawErrors = /"prior_errors":\s*\[\s*\{/.test(req.user);
      return req.schema.parse({
        pack: lighthouseRpgPack(!sawErrors),
        classifications: CLASSIFICATIONS,
      });
    }
    throw new Error(`MockAuthorProvider has no canned response for schema "${req.schemaName}".`);
  }
}
