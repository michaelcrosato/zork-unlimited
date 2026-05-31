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
  premise: "A keeper climbs a storm-battered cliff to relight a dead lighthouse before the night packet wrecks on the rocks.",
  chapters: [
    { id: "ch1", title: "The Climb", prose: "Rain drives sideways off the sea as the keeper hauls up the cliff path toward the dark tower." },
    { id: "ch2", title: "The Lamp", prose: "Inside, the great lamp sits cold. Below, a ship's horn sounds, closer than it should be." },
  ],
  beats: [
    { id: "arrival", summary: "The keeper reaches the foot of the cliff in a storm." },
    { id: "climb_cliff", summary: "The keeper climbs to the lighthouse door." },
    { id: "door_choice", summary: "At the door, the keeper can enter or retreat." },
    { id: "light_lamp", summary: "In the lamp room, the keeper relights the lamp to save the ship." },
    { id: "storm_memory", summary: "A flashback to the night the light first failed." },
  ],
};

const CLASSIFICATIONS = [
  { beat_id: "arrival", label: "fully_supported", note: "Opening scene." },
  { beat_id: "climb_cliff", label: "fully_supported", note: "A branching choice." },
  { beat_id: "door_choice", label: "fully_supported", note: "Enter / retreat branch." },
  { beat_id: "light_lamp", label: "supported_with_minor_rewrite", note: "Modeled as a final choice rather than a timed action." },
  { beat_id: "storm_memory", label: "requires_cutscene", note: "Flashback delivered as narrative text, not a playable scene." },
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
          { id: "climb", text: "Climb to the lighthouse door.", next: broken ? "lighthouse_dor" : "lighthouse_door" },
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
      { id: "ending_saved", title: "The Light Returns", text: "The beam sweeps out; the packet turns in time. You kept the light." },
      { id: "ending_lost", title: "Lost to the Dark", text: "The horn stops. In the morning, wreckage lines the rocks." },
      { id: "ending_flee", title: "Down the Cliff", text: "You pick your way down and away. The tower stays dark behind you." },
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
      return req.schema.parse({ pack: lighthousePack(!sawErrors), classifications: CLASSIFICATIONS });
    }
    throw new Error(`MockAuthorProvider has no canned response for schema "${req.schemaName}".`);
  }
}
