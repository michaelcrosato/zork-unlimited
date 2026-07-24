/**
 * New York overworld play view.
 *
 * The first interaction is location and travel, not content selection. Pack-based
 * quests still run through the existing deterministic engine, but they are now
 * local opportunities discovered at towns in the road graph.
 */
import { useEffect, useMemo, useState } from "react";
import { GameSession, type View } from "./engine.js";
import {
  OverworldSession,
  type OverworldActionResult,
  type OverworldAreaTravelResult,
  type OverworldRoadEncounterResult,
  type OverworldServiceResult,
  type OverworldSessionSnapshot,
  type OverworldView,
} from "./overworld.js";
import { PACKS } from "./packs.js";
import { OVERWORLD } from "./worldData.js";
import { NewJourneyTutorial } from "./NewJourneyTutorial.js";
import { JourneyChoiceScreen } from "./JourneyChoiceScreen.js";
import { JourneyStoryChoiceScreen } from "./JourneyStoryChoiceScreen.js";
import { JourneyEndedScreen } from "./JourneyEndedScreen.js";
import { JourneyStatus } from "./JourneyStatus.js";
import { CampaignCharacterPanel } from "./CampaignCharacterPanel.js";
import { QuestCharacterContinuityPanel } from "./QuestCharacterContinuityPanel.js";
import { formatGoalPassageLog } from "./goalPassage.js";
import { FRESH_GAME_TUTORIAL } from "../../src/world/fresh_game_tutorial.js";
import { timeLabel } from "../../src/world/session_journal_codec.js";
import type {
  JourneyChoice,
  JourneyStoryChoicePrompt,
} from "../../src/world/journey_contract.js";
import type { OverworldQuest } from "../../src/world/overworld.js";
import type { OverworldQuestView } from "../../src/world/session_local_discovery.js";

function normalizePackPath(path: string): string {
  return path.replace(/^(\.\.\/)+/, "");
}

const packsByPath = new Map(PACKS.map((pack) => [normalizePackPath(pack.path), pack]));
// The session exposes quests as OverworldQuestView (no pack source — the view
// is what a PLAYER knows); the pack path lives only on the manifest quest.
const questsById = new Map<string, OverworldQuest>(OVERWORLD.quests.map((q) => [q.id, q]));
const poiTitlesById = new Map(OVERWORLD.points_of_interest.map((poi) => [poi.id, poi.title]));
const characterNamesById = new Map(OVERWORLD.characters.map((character) => [character.id, character.name]));
const OVERWORLD_SAVE_KEY = "adventureforge:new-york-overworld:v1";

function jobChoiceKey(jobId: string, optionId: string): string {
  return JSON.stringify([jobId, optionId]);
}

function eventChoiceKey(eventId: string, optionId: string): string {
  return JSON.stringify([eventId, optionId]);
}

type InitialWorldSession = {
  session: OverworldSession;
  origin: "new" | "resume";
  notice: string | null;
};

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadInitialWorldSession(): InitialWorldSession {
  const storage = browserStorage();
  const raw = storage?.getItem(OVERWORLD_SAVE_KEY);
  if (!raw) {
    return { session: new OverworldSession(OVERWORLD), origin: "new", notice: null };
  }

  try {
    const snapshot = JSON.parse(raw) as OverworldSessionSnapshot;
    return {
      session: OverworldSession.restore(OVERWORLD, snapshot),
      origin: "resume",
      notice: null,
    };
  } catch (e) {
    storage?.removeItem(OVERWORLD_SAVE_KEY);
    return {
      session: new OverworldSession(OVERWORLD),
      origin: "new",
      notice: `Discarded saved journey: ${(e as Error).message}`,
    };
  }
}

function persistWorldSession(session: OverworldSession): void {
  try {
    browserStorage()?.setItem(OVERWORLD_SAVE_KEY, JSON.stringify(session.snapshot()));
  } catch {
    // Autosave is best-effort; storage failures should not block play.
  }
}

function clearWorldSessionSave(): void {
  try {
    browserStorage()?.removeItem(OVERWORLD_SAVE_KEY);
  } catch {
    // Ignore storage failures; the fresh in-memory session still replaces play state.
  }
}

export function ServiceOfferTerms({
  offer,
  id,
}: {
  offer: OverworldView["serviceOffers"][number] | undefined;
  id: string | undefined;
}): JSX.Element | null {
  if (!offer) return null;
  return (
    <small className="service-offer-terms" id={id}>
      <strong>{offer.title}</strong>
      {offer.providerName ? ` — Available from ${offer.providerName}.` : " —"} {offer.summary} (
      {offer.minutes} min, one time)
    </small>
  );
}

export function ServiceAction({
  serviceAction,
  offer,
  onActivate,
}: {
  serviceAction: OverworldView["serviceActions"][number];
  offer: OverworldView["serviceOffers"][number] | undefined;
  onActivate: () => void;
}): JSX.Element {
  const action = serviceAction.action;
  const termsId = offer ? `service-offer-${action}-terms` : undefined;
  const previewId = `service-action-${action}-preview`;
  return (
    <div>
      <button
        aria-describedby={[previewId, termsId].filter(Boolean).join(" ")}
        aria-disabled={!serviceAction.available}
        onClick={serviceAction.available ? onActivate : undefined}
      >
        {action === "rest" ? "Rest" : "Resupply"}
      </button>
      <small className="service-action-preview" id={previewId}>
        {serviceAction.message} {serviceAction.minutes} min · supplies {serviceAction.suppliesBefore}
        →{serviceAction.suppliesAfter} · fatigue {serviceAction.fatigueBefore}→
        {serviceAction.fatigueAfter}
      </small>
      <ServiceOfferTerms id={termsId} offer={offer} />
    </div>
  );
}

export function DepartureContactLead({
  lead,
  onTalk,
}: {
  lead: OverworldView["departureContactLeads"][number];
  onTalk: () => void;
}): JSX.Element {
  const guidanceId = `departure-contact-lead-${lead.id.replaceAll(":", "-")}`;
  const ready = lead.action !== null;
  return (
    <div className="departure-contact-lead">
      <strong>{lead.title}</strong>
      <p id={guidanceId}>{lead.guidance}</p>
      <button
        aria-describedby={guidanceId}
        aria-disabled={!ready}
        className="mini-command"
        onClick={ready ? onTalk : undefined}
        type="button"
      >
        {ready
          ? `Talk to ${lead.contactName} about the field team`
          : `Talk to ${lead.contactName} after choosing preparation`}
      </button>
    </div>
  );
}

function suppliesLabel(value: number): string {
  return `${String(value)} ${value === 1 ? "supply" : "supplies"}`;
}

/**
 * The notice-board launch surface stays deliberately inline: choosing an
 * approach is the quest-start action itself, not a modal/story decision that
 * would add another journey beat. The view has already redacted persistent
 * effect and import ids, so this component renders only player-facing terms.
 */
export function QuestNotice({
  quest,
  areaName,
  isCurrentArea,
  onStart,
}: {
  quest: OverworldQuestView;
  areaName: string;
  isCurrentArea: boolean;
  onStart: (approachId?: string) => void;
}): JSX.Element {
  if (!quest.launch) {
    return (
      <li className="quest-notice">
        <button disabled={!isCurrentArea} onClick={() => onStart()}>
          <span>{quest.title}</span>
          <small>{quest.discovery}</small>
          <small>
            Posted in {areaName}
            {!isCurrentArea ? " - move there to start" : ""}
          </small>
        </button>
      </li>
    );
  }

  return (
    <li className="quest-notice quest-notice-launch">
      <div className="quest-notice-heading">
        <strong>{quest.title}</strong>
        <p>{quest.discovery}</p>
        <small>
          Posted in {areaName}
          {!isCurrentArea ? " - move there to start" : ""}
        </small>
      </div>
      <fieldset className="quest-launch-fieldset">
        <legend>{quest.launch.prompt}</legend>
        <ul className="quest-launch-options">
          {quest.launch.options.map((option) => {
            const projection = option.projection;
            const blockedReason = projection?.available === false ? projection.blockedReason : null;
            const areaReason = !isCurrentArea ? `Move to ${areaName} to start.` : null;
            const disabled = !isCurrentArea || projection?.available === false;
            return (
              <li key={option.id}>
                <button disabled={disabled} onClick={() => onStart(option.id)}>
                  <strong>{option.title}</strong>
                  <span>{option.summary}</span>
                  <small>
                    <b>What you expect:</b> {option.preview}
                  </small>
                  {option.tradeoffSummary ? (
                    <small className="quest-launch-projection">
                      <b>Route tradeoff:</b> {option.tradeoffSummary}
                    </small>
                  ) : null}
                  <small>
                    <b>Commitment:</b> {option.consequence}
                  </small>
                  <small className="quest-launch-cost">
                    Actual cost: {option.terms.minutes} min, {suppliesLabel(option.terms.supplies)},
                    fatigue +{option.terms.fatigue}.
                  </small>
                  {projection?.available ? (
                    <small className="quest-launch-projection">
                      Projected arrival: {timeLabel(projection.minutesAfter)}; {suppliesLabel(
                        projection.suppliesAfter!,
                      )} remaining; fatigue {projection.fatigueAfter}; condition {projection.travelConditionAfter}.
                    </small>
                  ) : projection ? (
                    <small className="quest-launch-projection">
                      Projected time: {timeLabel(projection.minutesAfter)}.
                    </small>
                  ) : null}
                  {(blockedReason || areaReason) && (
                    <small className="quest-launch-blocked">
                      {[blockedReason, areaReason].filter(Boolean).join(" ")}
                    </small>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>
    </li>
  );
}

export default function App(): JSX.Element {
  const [worldState, setWorldState] = useState(loadInitialWorldSession);
  const worldSession = worldState.session;
  const [worldView, setWorldView] = useState<OverworldView>(() => worldSession.view());
  const [questSession, setQuestSession] = useState<GameSession | null>(null);
  const [questView, setQuestView] = useState<View | null>(null);
  const [activeQuest, setActiveQuest] = useState<OverworldQuestView | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(() => worldState.origin === "new");
  const [inspectedDepartureStory, setInspectedDepartureStory] =
    useState<JourneyStoryChoicePrompt | null>(null);
  const [log, setLog] = useState<string[]>(() => {
    const opener = worldState.origin === "resume"
      ? `Resumed in ${worldView.current.name}.`
      : `You begin in ${worldView.current.name}. Roads leave town, but the work is local until you find it.`;
    return worldState.notice ? [worldState.notice, opener] : [opener];
  });
  const [error, setError] = useState<string | null>(null);
  const journey = worldSession.journey();

  useEffect(() => {
    persistWorldSession(worldSession);
  }, [worldSession, worldView]);

  const roadLabel = useMemo(
    () =>
      worldView.exits
        .slice(0, 4)
        .map((exit) => exit.destination.name)
        .join(" / "),
    [worldView.exits],
  );
  const legalJobChoiceKeys = useMemo(
    () =>
      new Set(
        worldView.jobChoices.map(([jobId, optionId]) => jobChoiceKey(jobId, optionId)),
      ),
    [worldView.jobChoices],
  );
  const legalEventChoiceKeys = useMemo(
    () =>
      new Set(
        worldView.eventChoices.map(([eventId, optionId]) =>
          eventChoiceKey(eventId, optionId),
        ),
      ),
    [worldView.eventChoices],
  );
  function questAreaName(quest: OverworldQuestView): string {
    return OVERWORLD.areas.find((area) => area.id === quest.area)?.name ?? quest.area;
  }

  function travel(edgeId: string): void {
    try {
      const entry = worldSession.travel(edgeId);
      const next = worldSession.view();
      const roadEvent = entry.roadEvent
        ? ` Route report: ${entry.roadEvent.title} - ${entry.roadEvent.summary}`
        : "";
      setWorldView(next);
      setQuestSession(null);
      setQuestView(null);
      setActiveQuest(null);
      setLog((prev) => [
        `Traveled ${entry.distanceMi.toFixed(1)} mi on ${entry.route} to ${entry.to} (${entry.baseMinutes} min road${entry.delayMinutes > 0 ? `, +${entry.delayMinutes} min delay` : ""}). Supplies -${entry.suppliesUsed}, fatigue +${entry.fatigueGained}.${roadEvent}`,
        ...prev,
      ]);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function followGoalPassage(): void {
    try {
      const result = worldSession.followGoalPassage();
      setWorldView(worldSession.view());
      setQuestSession(null);
      setQuestView(null);
      setActiveQuest(null);
      setLog((previous) => [formatGoalPassageLog(result), ...previous]);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startQuest(quest: OverworldQuestView, approachId?: string): void {
    const manifestQuest = questsById.get(quest.id);
    const source = manifestQuest ? normalizePackPath(manifestQuest.source) : undefined;
    const pack = source ? packsByPath.get(source) : undefined;
    if (!manifestQuest || !pack) {
      setError(`Quest pack is missing: ${source ?? quest.id}`);
      return;
    }
    try {
      // Keep launch failure-atomic: all quest eligibility, pack compilation,
      // target validation, and imported-state construction happen before the
      // overworld records that the quest has started.
      const plan = worldSession.prepareQuestStart(quest.id, approachId);
      const session = GameSession.startEmbedded(
        pack.source,
        plan.characterAfter,
        manifestQuest.campaign_imports,
        1,
      );
      const localQuest = worldSession.commitQuestStart(plan);
      const selectedApproach = localQuest.launch?.options.find(
        (option) => option.id === localQuest.launch?.selected?.optionId,
      );
      setQuestSession(session);
      setQuestView(session.view());
      setActiveQuest(localQuest);
      setWorldView(worldSession.view());
      setLog((prev) => [
        `Started local quest: ${localQuest.title}${selectedApproach ? ` via ${selectedApproach.title}` : ""} (${worldView.current.name}, ${questAreaName(localQuest)}).`,
        ...prev,
      ]);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function runWorldAction(action: () => OverworldActionResult): void {
    try {
      const result = action();
      setWorldView(worldSession.view());
      const questLead =
        result.discoveredQuests && result.discoveredQuests.length > 0
          ? ` New work posted: ${result.discoveredQuests.map((quest) => quest.title).join(", ")}.`
          : "";
      const areaLead =
        result.discoveredAreas && result.discoveredAreas.length > 0
          ? ` New area mapped: ${result.discoveredAreas.map((area) => area.name).join(", ")}.`
          : "";
      const jobLead =
        result.discoveredJobs && result.discoveredJobs.length > 0
          ? ` New local job posted: ${result.discoveredJobs.map((job) => job.title).join(", ")}.`
          : "";
      setLog((prev) => [
        result.alreadyKnown
          ? `Reviewed ${result.entry.title}: ${result.entry.text}`
          : `Spent ${result.minutes} min. ${result.entry.title}: ${result.entry.text}${areaLead}${jobLead}${questLead}`,
        ...prev,
      ]);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function runServiceAction(action: () => OverworldServiceResult): void {
    try {
      const result = action();
      setWorldView(worldSession.view());
      setLog((prev) => [
        result.changed
          ? `Spent ${result.minutes} min. ${result.message}`
          : result.message,
        ...prev,
      ]);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function runRoadEncounterAction(action: () => OverworldRoadEncounterResult): void {
    try {
      const result = action();
      setWorldView(worldSession.view());
      setLog((prev) => [
        `Handled road encounter: ${result.entry.title}. ${result.entry.text} Time +${result.minutes} min, supplies -${result.suppliesUsed}, fatigue +${result.fatigueGained}${result.renownGained > 0 ? `, renown +${result.renownGained}` : ""}.`,
        ...prev,
      ]);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function moveArea(areaRouteId: string): void {
    try {
      const result: OverworldAreaTravelResult = worldSession.moveArea(areaRouteId);
      setWorldView(worldSession.view());
      setLog((prev) => [
        `Moved inside ${worldView.current.name}: ${result.route} to ${result.to.name} (${result.minutes} min).`,
        ...prev,
      ]);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function choose(id: string, label: string): void {
    if (!questSession) return;
    const out = questSession.choose(id);
    const view = questSession.view();
    setQuestView(view);
    const lines = [`> ${label}`, ...out.narration, ...(out.rejection ? [`(${out.rejection})`] : [])];
    if (out.ok) {
      if (out.journeyActionId === null) throw new Error("Accepted quest action has no id.");
      worldSession.recordQuestDecision(
        out.journeyActionId,
        out.journeyDecision,
        questSession.isCheckpointSafeBoundary(),
      );
      setWorldView(worldSession.view());
    }
    // Close a finished quest back into the overworld (MCP-bridge parity,
    // src/mcp/overworld_quest_bridge.ts): a non-death ending completes the lead
    // (journal entry + completedQuestIds); a death ending preserves the unfinished
    // goal and moves play to the journey's mandatory end choice.
    if (view.ended && activeQuest) {
      const ending = questSession.ending();
      if (ending && !ending.death) {
        try {
          const result = worldSession.completeQuest(activeQuest.id, {
            endingId: ending.id,
            endingTitle: ending.title,
            death: ending.death,
          });
          setWorldView(worldSession.view());
          lines.unshift(`Completed ${result.quest.title}: ${result.entry.text}`);
        } catch (e) {
          setError((e as Error).message);
        }
      } else if (ending?.death) {
        worldSession.recordQuestCharacterDeath(activeQuest.id, {
          endingId: ending.id,
          death: ending.death,
        });
        setWorldView(worldSession.view());
        lines.unshift(
          `${activeQuest.title} ends in death — this journey must now be ended with its unfinished goal preserved.`,
        );
      }
    }
    setLog((prev) => [...lines, ...prev]);
  }

  function returnToRoad(): void {
    setQuestSession(null);
    setQuestView(null);
    setActiveQuest(null);
    setLog((prev) => [`Returned to ${worldView.current.name}.`, ...prev]);
  }

  function startNewJourney(): void {
    const session = new OverworldSession(OVERWORLD);
    clearWorldSessionSave();
    setWorldState({ session, origin: "new", notice: null });
    setWorldView(session.view());
    setQuestSession(null);
    setQuestView(null);
    setActiveQuest(null);
    setInspectedDepartureStory(null);
    setLog([
      `Started a new journey in ${session.view().current.name}. Roads leave town, but the work is local until you find it.`,
    ]);
    setError(null);
    setTutorialOpen(true);
  }

  function chooseJourney(choice: JourneyChoice): void {
    const option = journey.pendingChoice?.options.find((candidate) => candidate.id === choice);
    try {
      worldSession.chooseJourney(choice);
      setWorldView(worldSession.view());
      if (option) setLog((previous) => [option.consequence, ...previous]);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function chooseJourneyStory(choiceId: string): void {
    const storyChoice = inspectedDepartureStory ?? journey.storyChoice;
    const isRegistration = storyChoice?.kind === "registration";
    const isLeadSource = storyChoice?.kind === "lead_source";
    const isPreparation = storyChoice?.kind === "preparation";
    const isAlly = storyChoice?.kind === "ally";
    const isReliefAllocation = storyChoice?.kind === "relief_allocation";
    const isReliefOath = storyChoice?.kind === "relief_oath";
    try {
      const result = worldSession.chooseJourneyStory(
        choiceId,
        inspectedDepartureStory?.id,
      );
      setWorldView(worldSession.view());
      setInspectedDepartureStory(null);
      setLog((previous) =>
        isRegistration
          ? [
              `Character registered: ${result.consequence}`,
              `Current goal: ${result.goal.text}`,
              ...previous,
            ]
          : isLeadSource
            ? [
                `Lead source certified: ${result.consequence}`,
                `Current goal: ${result.goal.text}`,
                ...previous,
              ]
            : isPreparation
              ? [
                  `Preparation committed: ${result.consequence}`,
                  `Current goal: ${result.goal.text}`,
                  ...previous,
                ]
              : isAlly
                ? [
                    `Field team committed: ${result.consequence}`,
                    `Current goal: ${result.goal.text}`,
                    ...previous,
                  ]
                : isReliefAllocation
                  ? [
                      `Relief capacity committed: ${result.consequence}`,
                      `Current goal: ${result.goal.text}`,
                      ...previous,
                    ]
                  : isReliefOath
                    ? [
                        `Relief terms bound: ${result.consequence}`,
                        `Current goal: ${result.goal.text}`,
                        ...previous,
                      ]
                    : [
                        `Story consequence: ${result.consequence}`,
                        `New goal: ${result.goal.text}`,
                        ...previous,
                      ],
      );
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function inspectDepartureStory(storyChoiceId: string): void {
    try {
      setInspectedDepartureStory(worldSession.inspectJourneyStory(storyChoiceId));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (tutorialOpen) {
    return (
      <NewJourneyTutorial
        tutorial={FRESH_GAME_TUTORIAL}
        onStart={() => setTutorialOpen(false)}
      />
    );
  }

  if (journey.pendingChoice) {
    return <JourneyChoiceScreen journey={journey} onChoose={chooseJourney} />;
  }

  if (journey.storyChoice || inspectedDepartureStory) {
    return (
      <JourneyStoryChoiceScreen
        journey={
          inspectedDepartureStory
            ? { ...journey, storyChoice: inspectedDepartureStory }
            : journey
        }
        onChoose={chooseJourneyStory}
        {...(inspectedDepartureStory
          ? { onDismiss: () => setInspectedDepartureStory(null) }
          : {})}
      />
    );
  }

  if (journey.status === "ended") {
    return <JourneyEndedScreen journey={journey} onNewJourney={startNewJourney} />;
  }

  return (
    <main className="af">
      <header className="world-header">
        <p className="kicker">New York State</p>
        <h1>{OVERWORLD.name}</h1>
        <p className="sub">{OVERWORLD.premise}</p>
      </header>

      <JourneyStatus journey={journey} onFollowGoalPassage={followGoalPassage} />

      <CampaignCharacterPanel character={worldView.character} />

      <section className="overworld">
        <article className="location-panel">
          <div className="location-topline">
            <span className={`settlement ${worldView.current.kind}`}>{worldView.current.kind.replace("_", " ")}</span>
            <span>{worldView.timeLabel}</span>
          </div>
          <h2>{worldView.current.name}</h2>
          <p>{worldView.current.description}</p>
          <dl className="location-facts">
            <div>
              <dt>Population</dt>
              <dd>{worldView.current.population_2025.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Region</dt>
              <dd>{worldView.current.region}</dd>
            </div>
            <div>
              <dt>Known Roads</dt>
              <dd>{roadLabel || "None"}</dd>
            </div>
            <div>
              <dt>Supplies</dt>
              <dd>
                {worldView.supplies}/{worldView.maxSupplies}
              </dd>
            </div>
            <div>
              <dt>Fatigue</dt>
              <dd>{worldView.fatigue}</dd>
            </div>
            <div>
              <dt>Condition</dt>
              <dd>{worldView.travelCondition}</dd>
            </div>
          </dl>
          <div className="service-actions">
            {worldView.serviceActions.map((serviceAction) => (
              <ServiceAction
                key={serviceAction.action}
                serviceAction={serviceAction}
                offer={worldView.serviceOffers.find(
                  (offer) => offer.id === serviceAction.offerId,
                )}
                onActivate={() =>
                  runServiceAction(() =>
                    serviceAction.action === "rest"
                      ? worldSession.restAtTown()
                      : worldSession.resupplyAtTown(),
                  )
                }
              />
            ))}
            <button className="secondary" onClick={startNewJourney}>
              New Journey
            </button>
          </div>
          {(worldView.departureInteractions.length > 0 ||
            worldView.departureContactLeads.length > 0) && (
            <div className="departure-interactions">
              <h3>Before you depart</h3>
              <p>
                Optional Station decisions; you may inspect one or leave without choosing.
                Optional contacts are listed alongside them.
              </p>
              {worldView.departureInteractions.map((interaction) => (
                <button
                  className="mini-command"
                  key={interaction.id}
                  type="button"
                  onClick={() => inspectDepartureStory(interaction.id)}
                >
                  Inspect {interaction.title}
                </button>
              ))}
              {worldView.departureContactLeads.map((lead) => (
                <DepartureContactLead
                  key={lead.id}
                  lead={lead}
                  onTalk={() => {
                    if (!lead.action) return;
                    runWorldAction(() =>
                      worldSession.talkToCharacter(lead.action.arguments.character_id),
                    );
                  }}
                />
              ))}
            </div>
          )}
        </article>

        <aside className="atlas-panel">
          <h2>Atlas</h2>
          <p>
            {worldView.visitedCount} visited / {worldView.totalTowns} towns
          </p>
          <div className="discovered-list">
            {worldView.discovered.slice(0, 18).map((node) => (
              <span key={node.id}>{node.name}</span>
            ))}
          </div>
          {worldView.routeOptions.length > 0 && (
            <div className="route-planner">
              <h3>Known Routes</h3>
              {worldView.routeOptions.slice(0, 5).map((route) => (
                <button key={route.destination.id} onClick={() => travel(route.steps[0]!.edge.id)}>
                  <strong>{route.destination.name}</strong>
                  <span>
                    {route.totalDistanceMi.toFixed(1)} mi - {route.estimate.baseMinutes} road min
                    {route.estimate.delayMinutes > 0
                      ? ` + ${route.estimate.delayMinutes} delay`
                      : ""}{" "}
                    - supplies {route.estimate.suppliesUsed}/{route.estimate.suppliesNeeded}
                    {route.estimate.supplyDeficit > 0
                      ? ` (${route.estimate.supplyDeficit} short)`
                      : ""}{" "}
                    - fatigue +{route.estimate.fatigueGained} - next {route.steps[0]!.to.name}
                  </span>
                </button>
              ))}
            </div>
          )}
          {worldView.journal.length > 0 && (
            <div className="world-journal">
              <h3>Journal</h3>
              {worldView.journal.slice(0, 5).map((entry) => (
                <div key={entry.id}>
                  <strong>{entry.title}</strong>
                  <span>
                    {entry.town} - {entry.recordedAt}
                  </span>
                </div>
              ))}
            </div>
          )}
          {Object.keys(worldView.regionRenown).length > 0 && (
            <div className="renown-list">
              <h3>Regional Renown</h3>
              {Object.entries(worldView.regionRenown).map(([region, renown]) => (
                <span key={region}>
                  {region}: {renown}
                </span>
              ))}
            </div>
          )}
          <div className="regional-thread-list">
            <h3>Regional Threads</h3>
            {worldView.regionalArcs.slice(0, 3).map((arc) => (
              <div key={arc.id} className={arc.completed ? "thread complete" : "thread"}>
                <strong>{arc.title}</strong>
                <span>
                  {arc.resolvedInRegion}/{arc.requiredResolutions} anchor towns - {arc.region}
                </span>
                <p>
                  Anchors: {arc.anchorTowns.slice(0, 4).map((town) => town.name).join(", ")}
                </p>
                {arc.resolvedAnchorTowns.length > 0 && (
                  <p>Cleared: {arc.resolvedAnchorTowns.map((town) => town.name).join(", ")}</p>
                )}
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="world-grid">
        <article className="roads-panel">
          <h2>Roads From Here</h2>
          {worldView.pendingRoadEncounter && (
            <div className={`road-encounter ${worldView.pendingRoadEncounter.event.risk}`}>
              <strong>{worldView.pendingRoadEncounter.event.title}</strong>
              <span>
                {worldView.pendingRoadEncounter.route} - {worldView.pendingRoadEncounter.event.risk} risk
              </span>
              <p>{worldView.pendingRoadEncounter.event.summary}</p>
              <div className="encounter-actions">
                {worldView.pendingRoadEncounter.options.map((option) => (
                  <button
                    key={option.strategy}
                    className="mini-command"
                    onClick={() =>
                      runRoadEncounterAction(() =>
                        worldSession.resolveRoadEncounter(option.strategy),
                      )
                    }
                  >
                    <span>{option.label}</span>
                    <small>
                      {option.minutes} min - supplies {option.suppliesCost} - fatigue +
                      {option.fatigueGained} - renown +{option.renownGained}
                    </small>
                  </button>
                ))}
              </div>
            </div>
          )}
          <ul className="road-list">
            {worldView.exits.map((exit) => (
              <li key={exit.id}>
                <button disabled={worldView.pendingRoadEncounter !== null} onClick={() => travel(exit.id)}>
                  <span>{exit.destination.name}</span>
                  <small>
                    {exit.route} - {exit.distance_mi.toFixed(1)} mi - {exit.travel_minutes} min
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </article>

        <article className="local-panel">
          <h2>Local Areas</h2>
          {worldView.currentArea && (
            <div className="current-area">
              <strong>{worldView.currentArea.name}</strong>
              <span>Current local area</span>
              <p>{worldView.currentArea.summary}</p>
            </div>
          )}
          {worldView.areaExits.length > 0 && (
            <div className="area-route-list">
              <h3>Local Routes</h3>
              {worldView.areaExits.map((exit) => (
                <button key={exit.id} className="mini-command" onClick={() => moveArea(exit.id)}>
                  <span>{exit.destination.name}</span>
                  <small>
                    {exit.route} - {exit.travel_minutes} min
                  </small>
                </button>
              ))}
            </div>
          )}
          <div className="area-list">
            {worldView.areas.map((area) => (
              <div key={area.id} className={`area ${area.kind}`}>
                <strong>{area.name}</strong>
                <span>
                  {area.kind.replace("_", " ")} - {area.travel_minutes} min on foot
                </span>
                <p>{area.summary}</p>
                {worldView.currentArea?.id !== area.id ? (
                  <small className="resolved-label">Mapped route</small>
                ) : worldView.visitedAreaIds.includes(area.id) ? (
                  <small className="resolved-label">Mapped</small>
                ) : (
                  <button
                    className="mini-command"
                    onClick={() => runWorldAction(() => worldSession.exploreArea(area.id))}
                  >
                    Explore Area
                  </button>
                )}
              </div>
            ))}
          </div>
          {worldView.hiddenAreaCount > 0 && (
            <p className="empty">
              {worldView.hiddenAreaCount} unmapped local{" "}
              {worldView.hiddenAreaCount === 1 ? "area" : "areas"} remain here.
            </p>
          )}

          <h2>Local Jobs</h2>
          {worldView.jobs.length === 0 ? (
            <p className="empty">
              {worldView.hiddenJobCount > 0
                ? "No local jobs are currently available. Some work may be hidden or unavailable until its conditions change."
                : "No local jobs remain in this town."}
            </p>
          ) : (
            <div className="job-list">
              {worldView.jobs.map((job) => {
                const scene = job.authored_scene;
                const journalIds = new Set(worldView.journal.map((entry) => entry.id));
                const hasPoi = scene
                  ? journalIds.has(`scout:${scene.required_poi_id}`)
                  : true;
                const contactPrefix = scene ? `talk:${scene.required_contact_id}` : "";
                const hasContact = scene
                  ? [...journalIds].some(
                      (id) => id === contactPrefix || id.startsWith(`${contactPrefix}@`),
                    )
                  : true;
                const hasQuests = scene
                  ? (scene.requires_completed_quests ?? []).every((id) =>
                      worldView.completedQuestIds.includes(id),
                    )
                  : true;
                const missingSceneRequirements: string[] = [];
                if (scene && !hasPoi) {
                  missingSceneRequirements.push(
                    `scout ${poiTitlesById.get(scene.required_poi_id) ?? "the marked point"}`,
                  );
                }
                if (scene && !hasContact) {
                  missingSceneRequirements.push(
                    `talk to ${characterNamesById.get(scene.required_contact_id) ?? "the local contact"}`,
                  );
                }
                if (scene && !hasQuests) {
                  for (const questId of scene.requires_completed_quests ?? []) {
                    if (!worldView.completedQuestIds.includes(questId)) {
                      missingSceneRequirements.push(
                        `complete ${questsById.get(questId)?.title ?? questId}`,
                      );
                    }
                  }
                }
                const hasLegalSceneChoice =
                  scene?.options.some((option) =>
                    legalJobChoiceKeys.has(jobChoiceKey(job.id, option.id)),
                  ) ?? false;

                return (
                  <div key={job.id} className={`job ${job.kind}`}>
                    <strong>{job.title}</strong>
                    {!scene && (
                      <span>
                        {job.kind.replace("_", " ")} - difficulty {job.difficulty} - {job.minutes}{" "}
                        min
                      </span>
                    )}
                    <p>{job.summary}</p>
                    {worldView.completedJobIds.includes(job.id) ? (
                      <small className="resolved-label">Completed</small>
                    ) : scene ? (
                      <div className="job-scene">
                        <p>{scene.prompt}</p>
                        {!hasLegalSceneChoice && (
                          <small className="empty">
                            {missingSceneRequirements.length > 0
                              ? `Required first: ${missingSceneRequirements.join(", ")}.`
                              : "No priority is currently available in this journey state."}
                          </small>
                        )}
                        {scene.options.map((option) => {
                          const optionAvailable = legalJobChoiceKeys.has(
                            jobChoiceKey(job.id, option.id),
                          );
                          return (
                            <div key={option.id} className="job-scene-option">
                              <strong>{option.title}</strong>
                              <span>
                                {option.terms.minutes} min - {option.terms.renown} renown
                              </span>
                              <p>{option.preview}</p>
                              <p>
                                <b>Commitment:</b> {option.consequence}
                              </p>
                              <button
                                className="mini-command"
                                disabled={!optionAvailable}
                                onClick={() =>
                                  runWorldAction(() => worldSession.workLocalJob(job.id, option.id))
                                }
                              >
                                Choose {option.title}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <button
                        className="mini-command"
                        onClick={() => runWorldAction(() => worldSession.workLocalJob(job.id))}
                      >
                        Work Job
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {worldView.hiddenJobCount > 0 && (
            <p className="empty">
              {worldView.hiddenJobCount} local{" "}
              {worldView.hiddenJobCount === 1 ? "job is" : "jobs are"} hidden or currently
              unavailable here.
            </p>
          )}

          <h2>Local Discoveries</h2>
          <div className="poi-list">
            {worldView.pois.map((poi) => (
              <div key={poi.id} className="poi">
                <strong>{poi.title}</strong>
                <span>{poi.summary}</span>
                <button className="mini-command" onClick={() => runWorldAction(() => worldSession.scoutPoi(poi.id))}>
                  Scout
                </button>
              </div>
            ))}
          </div>

          <h3>Regional Sites</h3>
          {worldView.sites.length === 0 ? (
            <p className="empty">
              {worldView.hiddenSiteCount > 0
                ? "Scout a local point of interest to reveal nearby expeditions."
                : "No regional expedition site is anchored here."}
            </p>
          ) : (
            <div className="site-list">
              {worldView.sites.map((site) => (
                <div key={site.id} className={`site ${site.kind}`}>
                  <strong>{site.title}</strong>
                  <span>
                    {site.kind} - danger {site.danger}
                  </span>
                  <p>{site.discovery}</p>
                  {worldView.exploredSiteIds.includes(site.id) ? (
                    <small className="resolved-label">Explored</small>
                  ) : (
                    <button
                      className="mini-command"
                      onClick={() => runWorldAction(() => worldSession.exploreSite(site.id))}
                    >
                      Explore
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <h3>Local Contacts</h3>
          <div className="contact-list">
            {worldView.characters.map((character) => (
              <div key={character.id} className="contact">
                <strong>{character.name}</strong>
                <span>
                  {character.role} - {character.faction}
                </span>
                <p>{character.agenda}</p>
                <button
                  className="mini-command"
                  onClick={() => runWorldAction(() => worldSession.talkToCharacter(character.id))}
                >
                  Talk
                </button>
              </div>
            ))}
          </div>

          <h3>Current Events</h3>
          <div className="event-list">
            {worldView.events.map((event) => {
              const scene = event.authored_scene;
              const journalIds = new Set(worldView.journal.map((entry) => entry.id));
              const hasPoi = scene
                ? journalIds.has(`scout:${scene.required_poi_id}`)
                : true;
              const contactPrefix = scene ? `talk:${scene.required_contact_id}` : "";
              const hasContact = scene
                ? [...journalIds].some(
                    (id) => id === contactPrefix || id.startsWith(`${contactPrefix}@`),
                  )
                : true;
              const hasInvestigation = journalIds.has(`investigate:${event.id}`);
              const missing: string[] = [];
              if (scene && !hasPoi) {
                missing.push(
                  `scout ${poiTitlesById.get(scene.required_poi_id) ?? "the marked point"}`,
                );
              }
              if (scene && !hasContact) {
                missing.push(
                  `talk to ${characterNamesById.get(scene.required_contact_id) ?? "the local contact"}`,
                );
              }
              if (scene && !hasInvestigation) missing.push("investigate this event");

              return (
                <div key={event.id} className={`event ${event.pressure}`}>
                  <strong>{event.title}</strong>
                  <span>
                    {event.pressure} - intensity {event.intensity}
                  </span>
                  <p>{event.summary}</p>
                  {worldView.resolvedEventIds.includes(event.id) ? (
                    <small className="resolved-label">Resolved</small>
                  ) : scene ? (
                    <div className="event-scene">
                      <p>{scene.prompt}</p>
                      {missing.length > 0 && (
                        <small className="empty">Required first: {missing.join(", ")}.</small>
                      )}
                      <button
                        className="mini-command"
                        onClick={() =>
                          runWorldAction(() => worldSession.investigateEvent(event.id))
                        }
                      >
                        Investigate
                      </button>
                      {scene.options.map((option) => {
                        const optionAvailable = legalEventChoiceKeys.has(
                          eventChoiceKey(event.id, option.id),
                        );
                        return (
                          <div key={option.id} className="event-scene-option">
                            <strong>{option.title}</strong>
                            <span>
                              {option.terms.minutes} min - {option.terms.renown} renown
                            </span>
                            <p>{option.preview}</p>
                            <p>
                              <b>Commitment:</b> {option.consequence}
                            </p>
                            <button
                              className="mini-command"
                              disabled={!optionAvailable}
                              onClick={() =>
                                runWorldAction(() =>
                                  worldSession.resolveEvent(event.id, option.id),
                                )
                              }
                            >
                              Choose {option.title}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="inline-actions">
                      <button
                        className="mini-command"
                        onClick={() =>
                          runWorldAction(() => worldSession.investigateEvent(event.id))
                        }
                      >
                        Investigate
                      </button>
                      <button
                        className="mini-command"
                        onClick={() => runWorldAction(() => worldSession.resolveEvent(event.id))}
                      >
                        Resolve
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <h3>Notice Board</h3>
          {worldView.quests.length === 0 ? (
            <p className="empty">
              {worldView.hiddenQuestCount > 0
                ? "No posted work discovered yet. Scout, talk, or investigate to surface local leads."
                : "No posted work is known here. Travel the road network to find more."}
            </p>
          ) : (
            <ul className="quest-list">
              {worldView.quests.map((quest) => (
                <QuestNotice
                  key={quest.id}
                  quest={quest}
                  areaName={questAreaName(quest)}
                  isCurrentArea={worldView.currentArea?.id === quest.area}
                  onStart={(approachId) => startQuest(quest, approachId)}
                />
              ))}
            </ul>
          )}
        </article>
      </section>

      {error && <p className="error">Could not continue: {error}</p>}

      {questView && activeQuest && (
        <section className="game">
          <div className="scene">
            <div className="scene-heading">
              <div>
                <span className="mode">{questView.mode}</span>
                <h2>{questView.title}</h2>
              </div>
              <button className="secondary" onClick={returnToRoad}>
                Leave Quest
              </button>
            </div>
            <p className="quest-origin">{activeQuest.discovery}</p>
            <p className="text">{questView.text}</p>

            {questView.ended ? (
              <p className="ending">{questView.endingId} - The End</p>
            ) : (
              <ul className="choices">
                {questView.choices.map((choice) => (
                  <li key={choice.id}>
                    <button onClick={() => choose(choice.id, choice.label)}>{choice.label}</button>
                  </li>
                ))}
                {questView.unavailableChoices.map((choice) => (
                  <li key={`unavailable:${choice.id}`}>
                    <button disabled aria-disabled="true">
                      <span>{choice.label}</span>
                      <small className="choice-reason">{choice.reason}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <aside className="state">
            {questView.characterContinuity && (
              <QuestCharacterContinuityPanel continuity={questView.characterContinuity} />
            )}
            <h3>{worldView.current.name} Record</h3>
            {questView.facts.length > 0 && (
              <ul className="facts">
                {questView.facts.map((fact, i) => (
                  <li key={i}>{fact}</li>
                ))}
              </ul>
            )}
            {questView.inventory.length > 0 && (
              <p>
                <strong>Inventory:</strong> {questView.inventory.join(", ")}
              </p>
            )}
            {questView.journal.length > 0 && (
              <div className="journal">
                <strong>Journal</strong>
                <ul>
                  {questView.journal.map((entry, i) => (
                    <li key={i}>{entry}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="hash">state: {questView.stateHash.slice(0, 8)}</p>
          </aside>
        </section>
      )}

      <section className="log">
        <h3>Travel Log</h3>
        <pre>{log.join("\n")}</pre>
      </section>
    </main>
  );
}
