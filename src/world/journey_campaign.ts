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

export type JourneyCampaignStoryChoiceOption = Readonly<{
  id: AlbanyDawnDispatchChoiceId;
  label: string;
  consequence: string;
}>;

export type JourneyCampaignStoryChoice = Readonly<{
  id: typeof ALBANY_DAWN_DISPATCH_ID;
  message: string;
  options: readonly [JourneyCampaignStoryChoiceOption, JourneyCampaignStoryChoiceOption];
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

/** Keep the authored Albany aftermath bound to one of Wolf-Winter's victory endings. */
export function assertJourneyCampaignQuestOutcome(questId: string, endingId: string): void {
  if (questId !== JOURNEY_CAMPAIGN_INITIAL_QUEST_ID) return;
  if (!WOLF_OUTCOME_BY_ID.has(endingId)) {
    throw new Error(
      `Journey campaign quest "${questId}" has unsupported completion ending "${endingId}".`,
    );
  }
}

export function albanyDawnDispatchGoal(
  choiceId: AlbanyDawnDispatchChoiceId,
): JourneyCampaignGoalDefinition {
  return ALBANY_DAWN_DISPATCH_GOALS[choiceId];
}

export function albanyDawnDispatchStoryChoice(
  outcome: WolfWinterCampaignOutcomeContext,
): JourneyCampaignStoryChoice {
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

function albanyDispatchChoiceForGoal(
  definition: JourneyCampaignGoalDefinition,
): AlbanyDawnDispatchChoiceId | null {
  return (
    ALBANY_DAWN_DISPATCH_CHOICE_IDS.find(
      (choiceId) => ALBANY_DAWN_DISPATCH_GOALS[choiceId].id === definition.id,
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
  if (definition.id === INITIAL_JOURNEY_CAMPAIGN_GOAL.id) {
    throw new Error("The initial journey goal does not have an activation journal entry.");
  }
  return Object.freeze({
    title: "A new relief lead",
    text: `The dispatch chain turns to the next live packet. ${definition.text}`,
  });
}

const ORDERED_FOLLOWUP_GOALS = Object.freeze([
  campaignGoal(
    "oneonta_tanners_fever",
    "Travel to Oneonta Market Streets, find the lead for The Tanner's Fever, and see it through.",
    "tanners_fever",
    "oneonta_city",
    "oneonta_city__market",
  ),
  campaignGoal(
    "rome_breaking_weir",
    "Travel to Rome Market Streets, find the lead for The Breaking Weir, and see it through.",
    "breaking_weir",
    "rome_city",
    "rome_city__market",
  ),
  campaignGoal(
    "oswego_advocates_case",
    "Travel to Oswego Market Streets, find the lead for The Advocate's Case, and see it through.",
    "advocates_case",
    "oswego_city",
    "oswego_city__market",
  ),
  campaignGoal(
    "greece_cold_forge",
    "Travel to Greece Market Streets, find the lead for The Cold Forge, and see it through.",
    "cold_forge",
    "greece_town",
    "greece_town__market",
  ),
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
  ...ORDERED_FOLLOWUP_GOALS.map((goal) => goal.targetQuestId),
] as const);

const GOALS_BY_ID: ReadonlyMap<string, JourneyCampaignGoalDefinition> = new Map([
  [INITIAL_JOURNEY_CAMPAIGN_GOAL.id, INITIAL_JOURNEY_CAMPAIGN_GOAL],
  ...Object.values(ALBANY_DAWN_DISPATCH_GOALS).map((goal) => [goal.id, goal] as const),
  ...ORDERED_FOLLOWUP_GOALS.map((goal) => [goal.id, goal] as const),
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
}): JourneyCampaignGoalDefinition | null {
  if (!args.completedQuestIds.has(JOURNEY_CAMPAIGN_INITIAL_QUEST_ID)) return null;
  if (!args.completedQuestIds.has("gallowmere")) {
    return args.albanyDawnDispatchChoiceId
      ? albanyDawnDispatchGoal(args.albanyDawnDispatchChoiceId)
      : null;
  }
  return (
    ORDERED_FOLLOWUP_GOALS.find((goal) => !args.completedQuestIds.has(goal.targetQuestId)) ?? null
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

export type JourneyCampaignPresentationContext = Readonly<{
  albanyReturnContext: string;
  preRetentionTeaser: string | null;
  storyChoice: JourneyCampaignStoryChoice | null;
}>;

export function journeyCampaignPresentationContext(args: {
  journey: JourneyContractSnapshot;
  questOutcomeIds: ReadonlyMap<string, string>;
}): JourneyCampaignPresentationContext | null {
  const outcome = wolfWinterCampaignOutcome(args.questOutcomeIds);
  if (!outcome) return null;
  const beforeRetention = awaitsInitialGoalChoice(args.journey);
  const afterContinue = awaitsAlbanyDawnDispatch(args.journey);
  if (!beforeRetention && !afterContinue) return null;
  return Object.freeze({
    albanyReturnContext: outcome.albanyReturnContext,
    preRetentionTeaser: beforeRetention ? ALBANY_DAWN_DISPATCH_TEASER : null,
    storyChoice: afterContinue ? albanyDawnDispatchStoryChoice(outcome) : null,
  });
}
