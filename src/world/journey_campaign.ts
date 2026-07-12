import {
  hasContinuedJourneyGoal,
  INITIAL_JOURNEY_GOAL,
  type JourneyContractSnapshot,
  type JourneyGoalDefinition,
} from "./journey_contract.js";

export const JOURNEY_CAMPAIGN_START_TOWN_ID = "albany_city" as const;
/**
 * The canonical manifest currently has exactly one authored quest whose home is
 * the campaign's Albany start: Wolf-Winter. Keeping that binding here lets this
 * module remain pure and manifest-free; adding another qualifying Albany start
 * quest requires updating this explicit campaign datum and its proof tests.
 */
export const JOURNEY_CAMPAIGN_INITIAL_QUEST_ID = "wolf_winter" as const;

export type JourneyCampaignGoalDefinition = Readonly<{
  id: string;
  text: string;
  targetQuestId: string;
  targetTownId: string;
  targetAreaId: string;
}>;

function campaignGoal(
  id: string,
  text: string,
  targetQuestId: string,
  targetTownId: string,
  targetAreaId: string,
): JourneyCampaignGoalDefinition {
  return Object.freeze({ id, text, targetQuestId, targetTownId, targetAreaId });
}

export const INITIAL_JOURNEY_CAMPAIGN_GOAL = campaignGoal(
  INITIAL_JOURNEY_GOAL.id,
  INITIAL_JOURNEY_GOAL.text,
  JOURNEY_CAMPAIGN_INITIAL_QUEST_ID,
  JOURNEY_CAMPAIGN_START_TOWN_ID,
  "albany_city__transport_hub",
);

export const ALBANY_DAWN_DISPATCH_ID = "albany_dawn_dispatch" as const;
export const ALBANY_DAWN_DISPATCH_CHOICE_IDS = Object.freeze([
  "send_wagon_to_cade",
  "send_wardens_north",
] as const);
export type AlbanyDawnDispatchChoiceId = (typeof ALBANY_DAWN_DISPATCH_CHOICE_IDS)[number];

export const ALBANY_DAWN_DISPATCH_TEASER =
  "At Albany Station Quarter, Hayden Hale has one dawn relief wagon and another live packet: Hedrick Cradoc's father was killed that morning by an old grey sow above Queensbury. Continue, and you will decide whether the wagon returns to Cade or runs north with the wardens before you carry Hedrick's lead onward." as const;

export const ALBANY_DAWN_DISPATCH_GOALS = Object.freeze({
  send_wagon_to_cade: campaignGoal(
    "carry_hedricks_packet_north",
    "Carry Hayden's packet to Hedrick Cradoc in Queensbury Market Streets and see The Gallowmere through.",
    "gallowmere",
    "queensbury_town",
    "queensbury_town__market",
  ),
  send_wardens_north: campaignGoal(
    "travel_north_with_albany_wardens",
    "Travel with Hayden's wardens to Hedrick Cradoc in Queensbury Market Streets and see The Gallowmere through.",
    "gallowmere",
    "queensbury_town",
    "queensbury_town__market",
  ),
} as const satisfies Record<AlbanyDawnDispatchChoiceId, JourneyCampaignGoalDefinition>);

export const TANNERS_FEVER_ACCOUNTABILITY_ID = "tanners_fever_accountability" as const;
export const TANNERS_FEVER_ACCOUNTABILITY_CHOICE_IDS = Object.freeze([
  "keep_household_correction",
  "publish_dosage_warning",
] as const);
export type TannersFeverAccountabilityChoiceId =
  (typeof TANNERS_FEVER_ACCOUNTABILITY_CHOICE_IDS)[number];

export const TANNERS_FEVER_ACCOUNTABILITY_CONTEXT =
  "Edric will recover, and Godwin's triple-strength wormwood dose has been stopped; Oneonta still has to decide how the correction enters the record." as const;

export const TANNERS_FEVER_ACCOUNTABILITY_TEASER =
  "Continue, and you will decide whether the corrected dose stays in the household record or becomes a public warning before carrying the next live packet to Rome." as const;

export const TANNERS_FEVER_ACCOUNTABILITY_GOALS = Object.freeze({
  keep_household_correction: campaignGoal(
    "rome_breaking_weir_household_correction",
    "With Edric's correction kept in the household record, travel to Rome Market Streets, find the lead for The Breaking Weir, and see it through.",
    "breaking_weir",
    "rome_city",
    "rome_city__market",
  ),
  publish_dosage_warning: campaignGoal(
    "rome_breaking_weir_public_warning",
    "With Oneonta's dosage warning made public, travel to Rome Market Streets, find the lead for The Breaking Weir, and see it through.",
    "breaking_weir",
    "rome_city",
    "rome_city__market",
  ),
} as const satisfies Record<TannersFeverAccountabilityChoiceId, JourneyCampaignGoalDefinition>);

export const ROME_POST_WEIR_DISPATCH_ID = "rome_post_weir_dispatch" as const;
export const ROME_POST_WEIR_DISPATCH_CHOICE_IDS = Object.freeze([
  "take_oswego_charter_packet",
  "take_greece_forge_packet",
] as const);
export type RomePostWeirDispatchChoiceId = (typeof ROME_POST_WEIR_DISPATCH_CHOICE_IDS)[number];

export const ROME_POST_WEIR_DISPATCH_CONTEXT =
  "The relief-race carries the flood crest around the valley, and Pell's downstream households wake alive." as const;

export const ROME_POST_WEIR_DISPATCH_TEASER =
  "Two live packets wait beyond Rome: in Oswego, Marta Holm's best cloth is being seized despite her late husband's charter; in Greece, an old forge has gone cold around the Ember-Heart. Continue, and choose which lead to carry first." as const;

/**
 * These selected-first goals deliberately use new ids. The pre-choice
 * `oswego_advocates_case` and `greece_cold_forge` ids remain canonical for old
 * version-8 saves and for whichever packet is deferred to second place.
 */
export const ROME_POST_WEIR_DISPATCH_GOALS = Object.freeze({
  take_oswego_charter_packet: campaignGoal(
    "oswego_advocates_case_first",
    "Carry Rome's charter packet to Oswego Market Streets, find the lead for The Advocate's Case, and see it through.",
    "advocates_case",
    "oswego_city",
    "oswego_city__market",
  ),
  take_greece_forge_packet: campaignGoal(
    "greece_cold_forge_first",
    "Carry Rome's forge packet to Greece Market Streets, find the lead for The Cold Forge, and see it through.",
    "cold_forge",
    "greece_town",
    "greece_town__market",
  ),
} as const satisfies Record<RomePostWeirDispatchChoiceId, JourneyCampaignGoalDefinition>);

export type BreakingWeirCampaignEndingId =
  | "ending_fields_held_race_spent"
  | "ending_race_held_fields_given"
  | "ending_held";

export type BreakingWeirCampaignOutcome =
  | "fields_held_race_spent"
  | "race_held_fields_given"
  | "held";

export type BreakingWeirCampaignOutcomeContext = Readonly<{
  id: BreakingWeirCampaignOutcome;
  endingId: BreakingWeirCampaignEndingId;
  romeDispatchContext: string;
}>;

export const BREAKING_WEIR_CAMPAIGN_OUTCOMES = Object.freeze({
  ending_fields_held_race_spent: Object.freeze({
    id: "fields_held_race_spent",
    endingId: "ending_fields_held_race_spent",
    romeDispatchContext:
      "The valley wakes dry with its winter grain intact, but the full crest has spent Pell's old gate and race-house; the farms have food now and no working relief-race for the next flood.",
  }),
  ending_race_held_fields_given: Object.freeze({
    id: "race_held_fields_given",
    endingId: "ending_race_held_fields_given",
    romeDispatchContext:
      "The valley wakes dry and Pell's weir remains fit for another flood, but the lower farms' winter grain lies under silt; the old defense stands and the coming stores will be lean.",
  }),
  ending_held: Object.freeze({
    id: "held",
    endingId: "ending_held",
    romeDispatchContext: ROME_POST_WEIR_DISPATCH_CONTEXT,
  }),
} as const satisfies Record<BreakingWeirCampaignEndingId, BreakingWeirCampaignOutcomeContext>);

const BREAKING_WEIR_OUTCOME_BY_ID: ReadonlyMap<string, BreakingWeirCampaignOutcomeContext> =
  new Map(
    Object.values(BREAKING_WEIR_CAMPAIGN_OUTCOMES).map((outcome) => [outcome.endingId, outcome]),
  );

export type WolfWinterCampaignOutcome = "gate_barred" | "timber_saved" | "held";

export type WolfWinterCampaignOutcomeContext = Readonly<{
  id: WolfWinterCampaignOutcome;
  endingId: string;
  albanyReturnContext: string;
}>;

export const WOLF_WINTER_CAMPAIGN_OUTCOMES = Object.freeze({
  ending_held_gate_barred: Object.freeze({
    id: "gate_barred",
    endingId: "ending_held_gate_barred",
    albanyReturnContext:
      "Cade's cattle are alive behind the inner gate you barred, but the broken outer paling still leaves the steading on one last line.",
  }),
  ending_held_timber_saved: Object.freeze({
    id: "timber_saved",
    endingId: "ending_held_timber_saved",
    albanyReturnContext:
      "Cade's cattle are alive, and the sound timber you carried out gives him the first piece of the broken outer paling's repair.",
  }),
  ending_held: Object.freeze({
    id: "held",
    endingId: "ending_held",
    albanyReturnContext:
      "Cade's cattle are alive, but the guard wood was spent in the fighting; the broken outer paling has no sound repair timber waiting.",
  }),
} as const satisfies Record<string, WolfWinterCampaignOutcomeContext>);

const WOLF_OUTCOME_BY_ID: ReadonlyMap<string, WolfWinterCampaignOutcomeContext> = new Map(
  Object.values(WOLF_WINTER_CAMPAIGN_OUTCOMES).map((outcome) => [outcome.endingId, outcome]),
);

const ALBANY_DAWN_DISPATCH_CONSEQUENCES = Object.freeze({
  gate_barred: Object.freeze({
    send_wagon_to_cade:
      "The wagon replaces the broken outer paling; the timber at the inner gate stays as Cade's last bar. You take Hedrick's packet north alone.",
    send_wardens_north:
      "The wagon follows Hedrick's report; Cade keeps the cattle behind the barred inner gate while the outer paling waits.",
  }),
  timber_saved: Object.freeze({
    send_wagon_to_cade:
      "The wagon and the saved timber close Cade's breach before the next night. You take Hedrick's packet north alone.",
    send_wardens_north:
      "The wagon follows Hedrick's report; Cade uses the saved timber to begin the repair without it.",
  }),
  held: Object.freeze({
    send_wagon_to_cade:
      "The wagon brings the sound wood the fight consumed and rebuilds Cade's exposed line. You take Hedrick's packet north alone.",
    send_wardens_north:
      "The wagon follows Hedrick's report; Cade faces the broken outer line without sound timber until another relief run.",
  }),
} as const satisfies Record<WolfWinterCampaignOutcome, Record<AlbanyDawnDispatchChoiceId, string>>);

const TANNERS_FEVER_ACCOUNTABILITY_CONSEQUENCES = Object.freeze({
  keep_household_correction:
    "Godwin records the corrected dose in Edric's household case book, preserving the family's trust in its longtime apothecary; other Oneonta patients receive no public warning about the three-to-one error.",
  publish_dosage_warning:
    "The three-to-one error enters Oneonta's public apothecary ledger, warning future patients; Godwin faces public scrutiny, and the household loses control of Edric's private account.",
} as const satisfies Record<TannersFeverAccountabilityChoiceId, string>);

const ROME_POST_WEIR_DISPATCH_CONSEQUENCES = Object.freeze({
  take_oswego_charter_packet:
    "Marta Holm's best cloth remains under seizure while her inherited charter waits to be heard. You carry the charter packet toward Oswego first; the Greece forge packet remains live.",
  take_greece_forge_packet:
    "The last living coal of the old forge waits beneath Greece. You carry the forge packet toward Greece first; Marta Holm's Oswego case remains live.",
} as const satisfies Record<RomePostWeirDispatchChoiceId, string>);

export type JourneyCampaignStoryChoiceId =
  | typeof ALBANY_DAWN_DISPATCH_ID
  | typeof TANNERS_FEVER_ACCOUNTABILITY_ID
  | typeof ROME_POST_WEIR_DISPATCH_ID;

export type JourneyCampaignStoryChoiceOptionId =
  | AlbanyDawnDispatchChoiceId
  | TannersFeverAccountabilityChoiceId
  | RomePostWeirDispatchChoiceId;

export type JourneyCampaignStoryChoiceOption<
  ChoiceId extends JourneyCampaignStoryChoiceOptionId = JourneyCampaignStoryChoiceOptionId,
> = Readonly<{
  id: ChoiceId;
  label: string;
  consequence: string;
}>;

type JourneyCampaignStoryChoiceDefinition<
  StoryChoiceId extends JourneyCampaignStoryChoiceId,
  ChoiceId extends JourneyCampaignStoryChoiceOptionId,
> = Readonly<{
  id: StoryChoiceId;
  message: string;
  options: readonly [
    JourneyCampaignStoryChoiceOption<ChoiceId>,
    JourneyCampaignStoryChoiceOption<ChoiceId>,
  ];
}>;

export type AlbanyDawnDispatchStoryChoice = JourneyCampaignStoryChoiceDefinition<
  typeof ALBANY_DAWN_DISPATCH_ID,
  AlbanyDawnDispatchChoiceId
>;

export type TannersFeverAccountabilityStoryChoice = JourneyCampaignStoryChoiceDefinition<
  typeof TANNERS_FEVER_ACCOUNTABILITY_ID,
  TannersFeverAccountabilityChoiceId
>;

export type RomePostWeirDispatchStoryChoice = JourneyCampaignStoryChoiceDefinition<
  typeof ROME_POST_WEIR_DISPATCH_ID,
  RomePostWeirDispatchChoiceId
>;

export type JourneyCampaignStoryChoice =
  | AlbanyDawnDispatchStoryChoice
  | TannersFeverAccountabilityStoryChoice
  | RomePostWeirDispatchStoryChoice;

export type JourneyCampaignStoryChoiceSelection =
  | Readonly<{
      storyChoiceId: typeof ALBANY_DAWN_DISPATCH_ID;
      choiceId: AlbanyDawnDispatchChoiceId;
      goal: JourneyCampaignGoalDefinition;
    }>
  | Readonly<{
      storyChoiceId: typeof TANNERS_FEVER_ACCOUNTABILITY_ID;
      choiceId: TannersFeverAccountabilityChoiceId;
      goal: JourneyCampaignGoalDefinition;
    }>
  | Readonly<{
      storyChoiceId: typeof ROME_POST_WEIR_DISPATCH_ID;
      choiceId: RomePostWeirDispatchChoiceId;
      goal: JourneyCampaignGoalDefinition;
    }>;

export type JourneyCampaignJournalCopy = Readonly<{
  title: string;
  text: string;
}>;

export function wolfWinterCampaignOutcome(
  questOutcomeIds: ReadonlyMap<string, string>,
): WolfWinterCampaignOutcomeContext | null {
  const endingId = questOutcomeIds.get(JOURNEY_CAMPAIGN_INITIAL_QUEST_ID);
  return endingId === undefined ? null : (WOLF_OUTCOME_BY_ID.get(endingId) ?? null);
}

export function breakingWeirCampaignOutcome(
  questOutcomeIds: ReadonlyMap<string, string>,
): BreakingWeirCampaignOutcomeContext | null {
  const endingId = questOutcomeIds.get("breaking_weir");
  return endingId === undefined ? null : (BREAKING_WEIR_OUTCOME_BY_ID.get(endingId) ?? null);
}

/** Keep authored campaign aftermaths bound only to supported victory endings. */
export function assertJourneyCampaignQuestOutcome(questId: string, endingId: string): void {
  if (questId === JOURNEY_CAMPAIGN_INITIAL_QUEST_ID) {
    if (WOLF_OUTCOME_BY_ID.has(endingId)) return;
    throw new Error(
      `Journey campaign quest "${questId}" has unsupported completion ending "${endingId}".`,
    );
  }
  if (questId !== "breaking_weir" || BREAKING_WEIR_OUTCOME_BY_ID.has(endingId)) return;
  throw new Error(
    `Journey campaign quest "${questId}" has unsupported completion ending "${endingId}".`,
  );
}

export function albanyDawnDispatchGoal(
  choiceId: AlbanyDawnDispatchChoiceId,
): JourneyCampaignGoalDefinition {
  return ALBANY_DAWN_DISPATCH_GOALS[choiceId];
}

export function albanyDawnDispatchStoryChoice(
  outcome: WolfWinterCampaignOutcomeContext,
): AlbanyDawnDispatchStoryChoice {
  const consequences = ALBANY_DAWN_DISPATCH_CONSEQUENCES[outcome.id];
  return Object.freeze({
    id: ALBANY_DAWN_DISPATCH_ID,
    message:
      "Hayden Hale can send Albany's only dawn relief wagon back to Cade or north with the wardens. Where should it go?",
    options: Object.freeze([
      Object.freeze({
        id: "send_wagon_to_cade" as const,
        label: "Send the wagon to rebuild Cade's outer line",
        consequence: consequences.send_wagon_to_cade,
      }),
      Object.freeze({
        id: "send_wardens_north" as const,
        label: "Send the wagon and wardens north",
        consequence: consequences.send_wardens_north,
      }),
    ] as const),
  });
}

export function tannersFeverAccountabilityGoal(
  choiceId: TannersFeverAccountabilityChoiceId,
): JourneyCampaignGoalDefinition {
  return TANNERS_FEVER_ACCOUNTABILITY_GOALS[choiceId];
}

export function tannersFeverAccountabilityStoryChoice(): TannersFeverAccountabilityStoryChoice {
  return Object.freeze({
    id: TANNERS_FEVER_ACCOUNTABILITY_ID,
    message:
      "Edric will recover, but the corrected dose still has to be recorded. Should the correction stay with the household or become a public warning?",
    options: Object.freeze([
      Object.freeze({
        id: "keep_household_correction" as const,
        label: "Keep the correction in the household record",
        consequence: TANNERS_FEVER_ACCOUNTABILITY_CONSEQUENCES.keep_household_correction,
      }),
      Object.freeze({
        id: "publish_dosage_warning" as const,
        label: "Publish the dosage warning",
        consequence: TANNERS_FEVER_ACCOUNTABILITY_CONSEQUENCES.publish_dosage_warning,
      }),
    ] as const),
  });
}

export function romePostWeirDispatchGoal(
  choiceId: RomePostWeirDispatchChoiceId,
): JourneyCampaignGoalDefinition {
  return ROME_POST_WEIR_DISPATCH_GOALS[choiceId];
}

export function romePostWeirDispatchStoryChoice(): RomePostWeirDispatchStoryChoice {
  return Object.freeze({
    id: ROME_POST_WEIR_DISPATCH_ID,
    message: "Which live packet should leave Rome in your hands first?",
    options: Object.freeze([
      Object.freeze({
        id: "take_oswego_charter_packet" as const,
        label: "Carry the Oswego charter packet first",
        consequence: ROME_POST_WEIR_DISPATCH_CONSEQUENCES.take_oswego_charter_packet,
      }),
      Object.freeze({
        id: "take_greece_forge_packet" as const,
        label: "Carry the Greece forge packet first",
        consequence: ROME_POST_WEIR_DISPATCH_CONSEQUENCES.take_greece_forge_packet,
      }),
    ] as const),
  });
}

function isAlbanyDawnDispatchChoiceId(value: string): value is AlbanyDawnDispatchChoiceId {
  return ALBANY_DAWN_DISPATCH_CHOICE_IDS.some((choiceId) => choiceId === value);
}

function isTannersFeverAccountabilityChoiceId(
  value: string,
): value is TannersFeverAccountabilityChoiceId {
  return TANNERS_FEVER_ACCOUNTABILITY_CHOICE_IDS.some((choiceId) => choiceId === value);
}

function isRomePostWeirDispatchChoiceId(value: string): value is RomePostWeirDispatchChoiceId {
  return ROME_POST_WEIR_DISPATCH_CHOICE_IDS.some((choiceId) => choiceId === value);
}

export function journeyCampaignStoryChoiceSelection(
  storyChoiceId: string,
  choiceId: string,
): JourneyCampaignStoryChoiceSelection {
  if (storyChoiceId === ALBANY_DAWN_DISPATCH_ID) {
    if (!isAlbanyDawnDispatchChoiceId(choiceId)) {
      throw new Error(`Story choice "${storyChoiceId}" does not accept option "${choiceId}".`);
    }
    return Object.freeze({
      storyChoiceId,
      choiceId,
      goal: albanyDawnDispatchGoal(choiceId),
    });
  }
  if (storyChoiceId === TANNERS_FEVER_ACCOUNTABILITY_ID) {
    if (!isTannersFeverAccountabilityChoiceId(choiceId)) {
      throw new Error(`Story choice "${storyChoiceId}" does not accept option "${choiceId}".`);
    }
    return Object.freeze({
      storyChoiceId,
      choiceId,
      goal: tannersFeverAccountabilityGoal(choiceId),
    });
  }
  if (storyChoiceId === ROME_POST_WEIR_DISPATCH_ID) {
    if (!isRomePostWeirDispatchChoiceId(choiceId)) {
      throw new Error(`Story choice "${storyChoiceId}" does not accept option "${choiceId}".`);
    }
    return Object.freeze({
      storyChoiceId,
      choiceId,
      goal: romePostWeirDispatchGoal(choiceId),
    });
  }
  throw new Error(`Unknown journey campaign story choice "${storyChoiceId}".`);
}

function albanyDispatchChoiceForGoal(
  definition: JourneyCampaignGoalDefinition,
): AlbanyDawnDispatchChoiceId | null {
  return (
    ALBANY_DAWN_DISPATCH_CHOICE_IDS.find(
      (choiceId) => ALBANY_DAWN_DISPATCH_GOALS[choiceId].id === definition.id,
    ) ?? null
  );
}

function tannersFeverAccountabilityChoiceForGoal(
  definition: JourneyCampaignGoalDefinition,
): TannersFeverAccountabilityChoiceId | null {
  return (
    TANNERS_FEVER_ACCOUNTABILITY_CHOICE_IDS.find(
      (choiceId) => TANNERS_FEVER_ACCOUNTABILITY_GOALS[choiceId].id === definition.id,
    ) ?? null
  );
}

function romePostWeirDispatchChoiceForGoal(
  definition: JourneyCampaignGoalDefinition,
): RomePostWeirDispatchChoiceId | null {
  return (
    ROME_POST_WEIR_DISPATCH_CHOICE_IDS.find(
      (choiceId) => ROME_POST_WEIR_DISPATCH_GOALS[choiceId].id === definition.id,
    ) ?? null
  );
}

export function journeyCampaignGoalJournalCopy(
  definition: JourneyCampaignGoalDefinition,
  questOutcomeIds: ReadonlyMap<string, string>,
): JourneyCampaignJournalCopy {
  const dispatchChoice = albanyDispatchChoiceForGoal(definition);
  if (dispatchChoice) {
    const outcome = wolfWinterCampaignOutcome(questOutcomeIds);
    if (!outcome) throw new Error("Albany dawn dispatch requires a supported Wolf-Winter ending.");
    const option = albanyDawnDispatchStoryChoice(outcome).options.find(
      (candidate) => candidate.id === dispatchChoice,
    );
    if (!option) throw new Error(`Albany dawn dispatch option "${dispatchChoice}" is unavailable.`);
    return Object.freeze({ title: option.label, text: option.consequence });
  }
  const accountabilityChoice = tannersFeverAccountabilityChoiceForGoal(definition);
  if (accountabilityChoice) {
    const option = tannersFeverAccountabilityStoryChoice().options.find(
      (candidate) => candidate.id === accountabilityChoice,
    );
    if (!option) {
      throw new Error(
        `Tanner's Fever accountability option "${accountabilityChoice}" is unavailable.`,
      );
    }
    return Object.freeze({ title: option.label, text: option.consequence });
  }
  const postWeirDispatchChoice = romePostWeirDispatchChoiceForGoal(definition);
  if (postWeirDispatchChoice) {
    const option = romePostWeirDispatchStoryChoice().options.find(
      (candidate) => candidate.id === postWeirDispatchChoice,
    );
    if (!option) {
      throw new Error(`Rome post-Weir dispatch option "${postWeirDispatchChoice}" is unavailable.`);
    }
    return Object.freeze({ title: option.label, text: option.consequence });
  }
  if (definition.id === INITIAL_JOURNEY_CAMPAIGN_GOAL.id) {
    throw new Error("The initial journey goal does not have an activation journal entry.");
  }
  return Object.freeze({
    title: "A new relief lead",
    text: `The dispatch chain turns to the next live packet. ${definition.text}`,
  });
}

export const TANNERS_FEVER_CAMPAIGN_GOAL = campaignGoal(
  "oneonta_tanners_fever",
  "Travel to Oneonta Market Streets, find the lead for The Tanner's Fever, and see it through.",
  "tanners_fever",
  "oneonta_city",
  "oneonta_city__market",
);

/** Lookup-only compatibility for version 8 saves created before the accountability branch. */
const LEGACY_ROME_BREAKING_WEIR_GOAL = campaignGoal(
  "rome_breaking_weir",
  "Travel to Rome Market Streets, find the lead for The Breaking Weir, and see it through.",
  "breaking_weir",
  "rome_city",
  "rome_city__market",
);

/** Preserve these ids and their generic journal copy for existing version-8 saves. */
const LEGACY_OSWEGO_ADVOCATES_CASE_GOAL = campaignGoal(
  "oswego_advocates_case",
  "Travel to Oswego Market Streets, find the lead for The Advocate's Case, and see it through.",
  "advocates_case",
  "oswego_city",
  "oswego_city__market",
);

const LEGACY_GREECE_COLD_FORGE_GOAL = campaignGoal(
  "greece_cold_forge",
  "Travel to Greece Market Streets, find the lead for The Cold Forge, and see it through.",
  "cold_forge",
  "greece_town",
  "greece_town__market",
);

const ORDERED_POST_BREAKING_WEIR_GOALS = Object.freeze([
  LEGACY_OSWEGO_ADVOCATES_CASE_GOAL,
  LEGACY_GREECE_COLD_FORGE_GOAL,
  campaignGoal(
    "amherst_dawn_beacon",
    "Travel to Amherst Market Streets, find the lead for The Dawn Beacon, and see it through.",
    "dawn_beacon",
    "amherst_town",
    "amherst_town__market",
  ),
  campaignGoal(
    "cheektowaga_factors_mark",
    "Travel to Cheektowaga Market Streets, find the lead for The Factor's Mark, and see it through.",
    "factors_mark",
    "cheektowaga_town",
    "cheektowaga_town__market",
  ),
  campaignGoal(
    "tonawanda_falconers_ransom",
    "Travel to Tonawanda Market Streets, find the lead for The Falconer's Ransom, and see it through.",
    "falconers_ransom",
    "tonawanda_town",
    "tonawanda_town__market",
  ),
  campaignGoal(
    "new_york_tide_mill",
    "Travel to New York Waterfront, find the lead for The Tide-Mill, and see it through.",
    "tide_mill",
    "new_york_city",
    "new_york_city__waterfront",
  ),
  campaignGoal(
    "riverhead_sunken_barrow",
    "Travel to Riverhead Market Streets, find the lead for The Sunken Barrow, and see it through.",
    "sunken_barrow",
    "riverhead_town",
    "riverhead_town__market",
  ),
  campaignGoal(
    "southampton_printers_night",
    "Travel to Southampton Market Streets, find the lead for The Printer's Night, and see it through.",
    "printers_night",
    "southampton_town",
    "southampton_town__market",
  ),
]);

export const JOURNEY_CAMPAIGN_QUEST_ORDER = Object.freeze([
  JOURNEY_CAMPAIGN_INITIAL_QUEST_ID,
  "gallowmere",
  TANNERS_FEVER_CAMPAIGN_GOAL.targetQuestId,
  TANNERS_FEVER_ACCOUNTABILITY_GOALS.keep_household_correction.targetQuestId,
  ...ORDERED_POST_BREAKING_WEIR_GOALS.map((goal) => goal.targetQuestId),
] as const);

const GOALS_BY_ID: ReadonlyMap<string, JourneyCampaignGoalDefinition> = new Map([
  [INITIAL_JOURNEY_CAMPAIGN_GOAL.id, INITIAL_JOURNEY_CAMPAIGN_GOAL],
  ...Object.values(ALBANY_DAWN_DISPATCH_GOALS).map((goal) => [goal.id, goal] as const),
  [TANNERS_FEVER_CAMPAIGN_GOAL.id, TANNERS_FEVER_CAMPAIGN_GOAL],
  ...Object.values(TANNERS_FEVER_ACCOUNTABILITY_GOALS).map((goal) => [goal.id, goal] as const),
  [LEGACY_ROME_BREAKING_WEIR_GOAL.id, LEGACY_ROME_BREAKING_WEIR_GOAL],
  ...Object.values(ROME_POST_WEIR_DISPATCH_GOALS).map((goal) => [goal.id, goal] as const),
  ...ORDERED_POST_BREAKING_WEIR_GOALS.map((goal) => [goal.id, goal] as const),
]);

export function journeyCampaignGoalDefinition(
  goal: Pick<JourneyGoalDefinition, "id">,
): JourneyCampaignGoalDefinition | null {
  return GOALS_BY_ID.get(goal.id) ?? null;
}

export function materializeJourneyCampaignGoal(
  definition: JourneyCampaignGoalDefinition,
  currentGoalVersion: number,
): JourneyGoalDefinition {
  if (!Number.isSafeInteger(currentGoalVersion) || currentGoalVersion < 1) {
    throw new Error("Current journey goal version must be a positive safe integer.");
  }
  if (currentGoalVersion === Number.MAX_SAFE_INTEGER) {
    throw new Error("Journey goal version has reached the maximum safe integer.");
  }
  return Object.freeze({
    version: currentGoalVersion + 1,
    id: definition.id,
    text: definition.text,
  });
}

export function nextJourneyCampaignGoal(args: {
  completedQuestIds: ReadonlySet<string>;
  albanyDawnDispatchChoiceId?: AlbanyDawnDispatchChoiceId | null;
  tannersFeverAccountabilityChoiceId?: TannersFeverAccountabilityChoiceId | null;
}): JourneyCampaignGoalDefinition | null {
  if (!args.completedQuestIds.has(JOURNEY_CAMPAIGN_INITIAL_QUEST_ID)) return null;
  if (!args.completedQuestIds.has("gallowmere")) {
    return args.albanyDawnDispatchChoiceId
      ? albanyDawnDispatchGoal(args.albanyDawnDispatchChoiceId)
      : null;
  }
  if (!args.completedQuestIds.has(TANNERS_FEVER_CAMPAIGN_GOAL.targetQuestId)) {
    return TANNERS_FEVER_CAMPAIGN_GOAL;
  }
  if (!args.completedQuestIds.has("breaking_weir")) {
    return args.tannersFeverAccountabilityChoiceId
      ? tannersFeverAccountabilityGoal(args.tannersFeverAccountabilityChoiceId)
      : null;
  }
  if (
    !args.completedQuestIds.has(LEGACY_OSWEGO_ADVOCATES_CASE_GOAL.targetQuestId) &&
    !args.completedQuestIds.has(LEGACY_GREECE_COLD_FORGE_GOAL.targetQuestId)
  ) {
    return null;
  }
  return (
    ORDERED_POST_BREAKING_WEIR_GOALS.find(
      (goal) => !args.completedQuestIds.has(goal.targetQuestId),
    ) ?? null
  );
}

export function journeyCampaignGoalIsComplete(
  goal: Pick<JourneyGoalDefinition, "id">,
  completedQuestIds: ReadonlySet<string>,
): boolean {
  const definition = journeyCampaignGoalDefinition(goal);
  return definition !== null && completedQuestIds.has(definition.targetQuestId);
}

function assertKnownGoalCompletion(
  goal: JourneyContractSnapshot["goal"] | JourneyContractSnapshot["goalHistory"][number],
  completedQuestIds: ReadonlySet<string>,
): void {
  const definition = journeyCampaignGoalDefinition(goal);
  if (!definition) throw new Error(`Unknown journey campaign goal "${goal.id}".`);
  if (goal.text !== definition.text) {
    throw new Error(`Journey goal "${goal.id}" does not match its canonical campaign text.`);
  }
  const completed = completedQuestIds.has(definition.targetQuestId);
  if (goal.status === "completed" && !completed) {
    throw new Error(
      `Journey goal "${goal.id}" is complete without target quest "${definition.targetQuestId}".`,
    );
  }
  if (goal.status === "active" && completed) {
    throw new Error(
      `Journey goal "${goal.id}" is active despite completed target quest "${definition.targetQuestId}".`,
    );
  }
}

export function assertJourneyCampaignGoalCompletionProof(args: {
  journey: JourneyContractSnapshot;
  completedQuestIds: ReadonlySet<string>;
  startTownId: string;
}): void {
  if (args.startTownId !== JOURNEY_CAMPAIGN_START_TOWN_ID) {
    throw new Error(
      `Journey campaign starts in ${JOURNEY_CAMPAIGN_START_TOWN_ID}, not "${args.startTownId}".`,
    );
  }
  for (const goal of args.journey.goalHistory) {
    assertKnownGoalCompletion(goal, args.completedQuestIds);
  }
  assertKnownGoalCompletion(args.journey.goal, args.completedQuestIds);

  if (
    args.journey.goal.id !== INITIAL_JOURNEY_GOAL.id &&
    !args.journey.goalHistory.some(
      (goal) =>
        goal.version === INITIAL_JOURNEY_GOAL.version && goal.id === INITIAL_JOURNEY_GOAL.id,
    )
  ) {
    throw new Error("A follow-up journey goal requires the completed Albany opening goal.");
  }
}

export function assertJourneyCampaignJournalProof(args: {
  journey: JourneyContractSnapshot;
  questOutcomeIds: ReadonlyMap<string, string>;
  journalEntries: readonly {
    id: string;
    kind: string;
    title: string;
    text: string;
  }[];
}): void {
  const goalsByVersion = new Map<number, JourneyContractSnapshot["goal"]>();
  for (const goal of args.journey.goalHistory) goalsByVersion.set(goal.version, goal);
  goalsByVersion.set(args.journey.goal.version, args.journey.goal);
  const activatedGoals = [...goalsByVersion.values()].filter((goal) => goal.version > 1);
  const campaignEntries = args.journalEntries.filter((entry) => entry.kind === "campaign");
  if (campaignEntries.length !== activatedGoals.length) {
    throw new Error(
      `Overworld session snapshot has ${String(campaignEntries.length)} campaign journal entries for ${String(activatedGoals.length)} activated journey goals.`,
    );
  }
  const entriesById = new Map(campaignEntries.map((entry) => [entry.id, entry]));
  for (const goal of activatedGoals) {
    const entryId = `campaign_goal:${String(goal.version)}:${goal.id}`;
    const entry = entriesById.get(entryId);
    if (!entry) {
      throw new Error(`Overworld session snapshot is missing campaign journal entry "${entryId}".`);
    }
    const definition = journeyCampaignGoalDefinition(goal);
    if (!definition) throw new Error(`Unknown journey campaign goal "${goal.id}".`);
    const expected = journeyCampaignGoalJournalCopy(definition, args.questOutcomeIds);
    if (entry.title !== expected.title || entry.text !== expected.text) {
      throw new Error(`Overworld session snapshot campaign journal entry "${entryId}" is forged.`);
    }
  }
}

function awaitsInitialGoalChoice(journey: JourneyContractSnapshot): boolean {
  return (
    journey.status === "awaiting_choice" &&
    journey.pendingChoice?.reasons.includes("goal_completed") === true &&
    journey.pendingChoice.goalVersion === INITIAL_JOURNEY_GOAL.version &&
    journey.pendingChoice.goalId === INITIAL_JOURNEY_GOAL.id
  );
}

function awaitsAlbanyDawnDispatch(journey: JourneyContractSnapshot): boolean {
  return (
    journey.status === "active" &&
    journey.goal.version === INITIAL_JOURNEY_GOAL.version &&
    journey.goal.id === INITIAL_JOURNEY_GOAL.id &&
    journey.goal.status === "completed" &&
    hasContinuedJourneyGoal(journey, INITIAL_JOURNEY_GOAL)
  );
}

function awaitsTannersFeverGoalChoice(journey: JourneyContractSnapshot): boolean {
  return (
    journey.status === "awaiting_choice" &&
    journey.goal.id === TANNERS_FEVER_CAMPAIGN_GOAL.id &&
    journey.goal.status === "completed" &&
    journey.pendingChoice?.reasons.includes("goal_completed") === true &&
    journey.pendingChoice.goalVersion === journey.goal.version &&
    journey.pendingChoice.goalId === journey.goal.id
  );
}

function awaitsTannersFeverAccountability(journey: JourneyContractSnapshot): boolean {
  return (
    journey.status === "active" &&
    journey.goal.id === TANNERS_FEVER_CAMPAIGN_GOAL.id &&
    journey.goal.status === "completed" &&
    hasContinuedJourneyGoal(journey, journey.goal)
  );
}

function currentGoalTargetsBreakingWeir(journey: JourneyContractSnapshot): boolean {
  return journeyCampaignGoalDefinition(journey.goal)?.targetQuestId === "breaking_weir";
}

export type JourneyCampaignPendingStoryStep =
  | "albany_dawn_dispatch"
  | "tanners_fever_accountability"
  | "rome_post_weir_dispatch";

/**
 * The story choice the campaign needs before its next goal can activate, derived from
 * completed quests exactly as nextJourneyCampaignGoal derives its null-returning
 * branches. Quests are not gated by the active goal, so a player can complete a later
 * campaign quest while an earlier goal is still active; presentation keyed only on the
 * current goal's identity then dead-ends the campaign at that goal's continue.
 */
export function journeyCampaignPendingStoryStep(
  completedQuestIds: ReadonlySet<string>,
): JourneyCampaignPendingStoryStep | null {
  if (!completedQuestIds.has(JOURNEY_CAMPAIGN_INITIAL_QUEST_ID)) return null;
  if (!completedQuestIds.has("gallowmere")) return "albany_dawn_dispatch";
  if (!completedQuestIds.has(TANNERS_FEVER_CAMPAIGN_GOAL.targetQuestId)) return null;
  if (!completedQuestIds.has("breaking_weir")) return "tanners_fever_accountability";
  if (
    !completedQuestIds.has(LEGACY_OSWEGO_ADVOCATES_CASE_GOAL.targetQuestId) &&
    !completedQuestIds.has(LEGACY_GREECE_COLD_FORGE_GOAL.targetQuestId)
  ) {
    return "rome_post_weir_dispatch";
  }
  return null;
}

function awaitsAnyGoalCompletionChoice(journey: JourneyContractSnapshot): boolean {
  return (
    journey.status === "awaiting_choice" &&
    journey.goal.status === "completed" &&
    journey.pendingChoice?.reasons.includes("goal_completed") === true &&
    journey.pendingChoice.goalVersion === journey.goal.version &&
    journey.pendingChoice.goalId === journey.goal.id
  );
}

function awaitsAnyStoryContinuation(journey: JourneyContractSnapshot): boolean {
  return (
    journey.status === "active" &&
    journey.goal.status === "completed" &&
    hasContinuedJourneyGoal(journey, journey.goal)
  );
}

function awaitsBreakingWeirGoalChoice(journey: JourneyContractSnapshot): boolean {
  return (
    journey.status === "awaiting_choice" &&
    currentGoalTargetsBreakingWeir(journey) &&
    journey.goal.status === "completed" &&
    journey.pendingChoice?.reasons.includes("goal_completed") === true &&
    journey.pendingChoice.goalVersion === journey.goal.version &&
    journey.pendingChoice.goalId === journey.goal.id
  );
}

function awaitsRomePostWeirDispatch(journey: JourneyContractSnapshot): boolean {
  return (
    journey.status === "active" &&
    currentGoalTargetsBreakingWeir(journey) &&
    journey.goal.status === "completed" &&
    hasContinuedJourneyGoal(journey, journey.goal)
  );
}

export type JourneyCampaignPresentationContext = Readonly<{
  completionContext: string;
  preRetentionTeaser: string | null;
  continueConsequencePrefix: string | null;
  storyChoice: JourneyCampaignStoryChoice | null;
}>;

export function journeyCampaignPresentationContext(args: {
  journey: JourneyContractSnapshot;
  questOutcomeIds: ReadonlyMap<string, string>;
  completedQuestIds?: ReadonlySet<string>;
}): JourneyCampaignPresentationContext | null {
  const beforeAlbanyRetention = awaitsInitialGoalChoice(args.journey);
  const afterAlbanyContinue = awaitsAlbanyDawnDispatch(args.journey);
  if (beforeAlbanyRetention || afterAlbanyContinue) {
    const outcome = wolfWinterCampaignOutcome(args.questOutcomeIds);
    if (!outcome) return null;
    return Object.freeze({
      completionContext: outcome.albanyReturnContext,
      preRetentionTeaser: beforeAlbanyRetention ? ALBANY_DAWN_DISPATCH_TEASER : null,
      continueConsequencePrefix: beforeAlbanyRetention
        ? "Continue to decide where Albany's only dawn relief wagon goes."
        : null,
      storyChoice: afterAlbanyContinue ? albanyDawnDispatchStoryChoice(outcome) : null,
    });
  }

  const beforeTannersRetention = awaitsTannersFeverGoalChoice(args.journey);
  const afterTannersContinue = awaitsTannersFeverAccountability(args.journey);
  if (beforeTannersRetention || afterTannersContinue) {
    return Object.freeze({
      completionContext: TANNERS_FEVER_ACCOUNTABILITY_CONTEXT,
      preRetentionTeaser: beforeTannersRetention ? TANNERS_FEVER_ACCOUNTABILITY_TEASER : null,
      continueConsequencePrefix: beforeTannersRetention
        ? "Continue to decide how Oneonta records the corrected dose."
        : null,
      storyChoice: afterTannersContinue ? tannersFeverAccountabilityStoryChoice() : null,
    });
  }

  const beforeBreakingWeirRetention = awaitsBreakingWeirGoalChoice(args.journey);
  const afterBreakingWeirContinue = awaitsRomePostWeirDispatch(args.journey);
  if (beforeBreakingWeirRetention || afterBreakingWeirContinue) {
    const breakingWeirOutcome = breakingWeirCampaignOutcome(args.questOutcomeIds);
    return Object.freeze({
      completionContext:
        breakingWeirOutcome?.romeDispatchContext ?? ROME_POST_WEIR_DISPATCH_CONTEXT,
      preRetentionTeaser: beforeBreakingWeirRetention ? ROME_POST_WEIR_DISPATCH_TEASER : null,
      continueConsequencePrefix: beforeBreakingWeirRetention
        ? "Continue to choose which live packet you carry first."
        : null,
      storyChoice: afterBreakingWeirContinue ? romePostWeirDispatchStoryChoice() : null,
    });
  }

  // Out-of-order fallback: a later campaign quest completed while an earlier goal was
  // active leaves the required story step unmatched by every goal-identity branch above.
  // Derive the step from completed quests so the choice presents at whichever completed,
  // continued goal the player is actually at.
  if (!args.completedQuestIds) return null;
  const step = journeyCampaignPendingStoryStep(args.completedQuestIds);
  if (!step) return null;
  const beforeRetention = awaitsAnyGoalCompletionChoice(args.journey);
  const afterContinue = awaitsAnyStoryContinuation(args.journey);
  if (!beforeRetention && !afterContinue) return null;
  if (step === "albany_dawn_dispatch") {
    const outcome = wolfWinterCampaignOutcome(args.questOutcomeIds);
    if (!outcome) return null;
    return Object.freeze({
      completionContext: outcome.albanyReturnContext,
      preRetentionTeaser: beforeRetention ? ALBANY_DAWN_DISPATCH_TEASER : null,
      continueConsequencePrefix: beforeRetention
        ? "Continue to decide where Albany's only dawn relief wagon goes."
        : null,
      storyChoice: afterContinue ? albanyDawnDispatchStoryChoice(outcome) : null,
    });
  }
  if (step === "tanners_fever_accountability") {
    return Object.freeze({
      completionContext: TANNERS_FEVER_ACCOUNTABILITY_CONTEXT,
      preRetentionTeaser: beforeRetention ? TANNERS_FEVER_ACCOUNTABILITY_TEASER : null,
      continueConsequencePrefix: beforeRetention
        ? "Continue to decide how Oneonta records the corrected dose."
        : null,
      storyChoice: afterContinue ? tannersFeverAccountabilityStoryChoice() : null,
    });
  }
  const fallbackWeirOutcome = breakingWeirCampaignOutcome(args.questOutcomeIds);
  return Object.freeze({
    completionContext: fallbackWeirOutcome?.romeDispatchContext ?? ROME_POST_WEIR_DISPATCH_CONTEXT,
    preRetentionTeaser: beforeRetention ? ROME_POST_WEIR_DISPATCH_TEASER : null,
    continueConsequencePrefix: beforeRetention
      ? "Continue to choose which live packet you carry first."
      : null,
    storyChoice: afterContinue ? romePostWeirDispatchStoryChoice() : null,
  });
}
