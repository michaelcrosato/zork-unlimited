import { useRef, type RefObject } from "react";
import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { Compass } from "@phosphor-icons/react/Compass";
import { Crosshair } from "@phosphor-icons/react/Crosshair";
import { Info } from "@phosphor-icons/react/Info";
import { MapPin } from "@phosphor-icons/react/MapPin";
import { Signpost } from "@phosphor-icons/react/Signpost";
import { Sparkle } from "@phosphor-icons/react/Sparkle";
import type {
  JourneyOpportunityKind,
  JourneyPresentation,
} from "../../src/world/journey_contract.js";
import type { JourneyOpportunityExplanation } from "../../src/world/journey_opportunity_explainer.js";
import { CampaignCharacterPanel } from "./CampaignCharacterPanel.js";
import { DepartureRecap } from "./DepartureRecap.js";
import { NightWatchDock, NightWatchMasthead, type NightWatchPanel } from "./NightWatchChrome.js";
import { JourneyOpportunityLeads } from "./JourneyOpportunityLeads.js";
import type { OverworldView } from "./overworld.js";
import { useStagePanelNavigation } from "./stageNavigation.js";

export type WorldActionTone = "ice" | "ember" | "lichen";

export type WorldActionCard = {
  id: string;
  group: string;
  title: string;
  summary: string;
  terms?: string;
  consequence?: string;
  buttonLabel: string;
  tone: WorldActionTone;
  disabledReason?: string;
  onChoose: () => void;
  goalRelevant?: boolean;
  optionalSupport?: boolean;
};

export type WorldActionSection = {
  id: string;
  title: string;
  description?: string;
  actions: readonly WorldActionCard[];
};

export function focusedWorldActions(
  sections: readonly WorldActionSection[],
  prioritySectionIds: readonly string[],
): WorldActionCard[] {
  const prioritySections = prioritySectionIds
    .map((id) => sections.find((section) => section.id === id))
    .filter((section): section is WorldActionSection => section !== undefined);
  return prioritySections
    .flatMap((section) =>
      [...section.actions]
        .sort(
          (left, right) => Number(right.goalRelevant === true) - Number(left.goalRelevant === true),
        )
        .filter((action) => action.disabledReason === undefined && action.optionalSupport !== true)
        .slice(0, section.id === "dispatch" || section.id === "encounter" ? 6 : 1),
    )
    .slice(0, 6);
}

export function focusedOptionalSupportActions(
  sections: readonly WorldActionSection[],
  prioritySectionIds: readonly string[],
): WorldActionCard[] {
  return prioritySectionIds
    .map((id) => sections.find((section) => section.id === id))
    .filter((section): section is WorldActionSection => section !== undefined)
    .flatMap((section) => section.actions.filter((action) => action.optionalSupport === true))
    .slice(0, 6);
}

type OverworldPlayScreenProps = {
  world: OverworldView;
  journey: JourneyPresentation;
  latestConsequence: string;
  log: readonly string[];
  sections: readonly WorldActionSection[];
  prioritySectionIds: readonly string[];
  panel: NightWatchPanel;
  saveStatus: "pending" | "saved" | "unavailable";
  error: string | null;
  opportunityExplanation?: JourneyOpportunityExplanation | null;
  onExplainOpportunity?: (kind: JourneyOpportunityKind, id: string) => void;
  onPanelChange: (panel: NightWatchPanel) => void;
  onNewJourney: () => void;
  onOpenTutorial: () => void;
};

function toneIcon(tone: WorldActionTone): typeof Compass {
  if (tone === "ember") return Crosshair;
  if (tone === "lichen") return Sparkle;
  return Compass;
}

function ActionCard({ action }: { action: WorldActionCard }): JSX.Element {
  const Icon = toneIcon(action.tone);
  const disabled = action.disabledReason !== undefined;
  return (
    <article className={`nw-action-card tone-${action.tone}${disabled ? " is-disabled" : ""}`}>
      <p className="nw-action-kind">
        <Icon aria-hidden="true" /> {action.group}
      </p>
      <h2>{action.title}</h2>
      <p className="nw-world-action-summary">{action.summary}</p>
      <div className="nw-action-terms">
        <strong>{disabled ? "Unavailable" : action.terms ? "Terms" : "Available now"}</strong>
        <p>{action.disabledReason ?? action.terms ?? "You can do this now."}</p>
        {action.consequence && <p className="nw-world-consequence">{action.consequence}</p>}
      </div>
      <button type="button" disabled={disabled} onClick={disabled ? undefined : action.onChoose}>
        <span>
          {action.buttonLabel} <small>{action.title}</small>
        </span>
        <ArrowRight aria-hidden="true" />
      </button>
    </article>
  );
}

function WorldUtility({
  panel,
  saveStatus,
  world,
  journey,
  log,
  sections,
  onClose,
  onNewJourney,
  onOpenTutorial,
  headingRef,
}: Pick<
  OverworldPlayScreenProps,
  | "panel"
  | "saveStatus"
  | "world"
  | "journey"
  | "log"
  | "sections"
  | "onNewJourney"
  | "onOpenTutorial"
> & { headingRef: RefObject<HTMLHeadingElement>; onClose: () => void }): JSX.Element | null {
  if (panel === "scene") return null;
  const routes = sections.find((section) => section.id === "roads");

  return (
    <section className="nw-utility" aria-label={`${panel} panel`}>
      <header>
        <div>
          <p className="nw-kicker">Journey reference</p>
          <h2 ref={headingRef} tabIndex={-1}>
            {panel === "terms" ? "All actions and costs" : panel}
          </h2>
        </div>
        <button className="nw-text-button" type="button" onClick={onClose}>
          Return to scene
        </button>
      </header>

      {panel === "character" && <CampaignCharacterPanel character={world.character} />}

      {panel === "atlas" && (
        <div className="nw-atlas-layout">
          <article className="nw-reference-card nw-atlas-record">
            <p className="nw-kicker">{world.current.region}</p>
            <h3>{world.current.name}</h3>
            <p>
              {world.visitedCount} visited · {world.discovered.length} discovered ·{" "}
              {world.totalTowns} towns total
            </p>
            <div className="nw-place-cloud">
              {world.discovered.map((place) => (
                <span key={place.id}>{place.name}</span>
              ))}
            </div>
          </article>
          {routes && routes.actions.length > 0 && (
            <section className="nw-reference-card">
              <p className="nw-kicker">Roads from here</p>
              <div className="nw-utility-actions">
                {routes.actions.map((action) => (
                  <ActionCard action={action} key={action.id} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {panel === "journal" && (
        <div className="nw-journal-grid">
          <article className="nw-reference-card">
            <p className="nw-kicker">Current goal</p>
            <h3>{journey.goal.text}</h3>
            <p>{journey.goalGuidance ?? "Choose a local action that advances this goal."}</p>
            <ul className="nw-reference-lines">
              {world.journal.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.title}</strong>
                  <span>
                    {entry.town} · {entry.recordedAt}
                  </span>
                </li>
              ))}
            </ul>
          </article>
          <article className="nw-reference-card">
            <p className="nw-kicker">Recent results</p>
            <ol className="nw-reference-lines">
              {log.slice(0, 18).map((entry, index) => (
                <li key={`${index}:${entry.slice(0, 30)}`}>{entry}</li>
              ))}
            </ol>
          </article>
          <article className="nw-reference-card">
            <p className="nw-kicker">Regional threads</p>
            <ul className="nw-reference-lines">
              {world.regionalArcs.map((arc) => (
                <li key={arc.id}>
                  <strong>{arc.title}</strong>
                  <span>
                    {arc.resolvedInRegion}/{arc.requiredResolutions} completed · {arc.region}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      )}

      {panel === "terms" && (
        <div className="nw-exact-sections">
          {world.departureRecap && <DepartureRecap recap={world.departureRecap} />}
          {sections.map((section) => (
            <section className="nw-exact-section" key={section.id}>
              <header>
                <div>
                  <p className="nw-kicker">Available and blocked actions</p>
                  <h3>{section.title}</h3>
                </div>
                {section.description && <p>{section.description}</p>}
              </header>
              {section.actions.length > 0 ? (
                <div className="nw-utility-actions">
                  {section.actions.map((action) => (
                    <ActionCard action={action} key={action.id} />
                  ))}
                </div>
              ) : (
                <p className="nw-empty-state">No actions are available in this category.</p>
              )}
            </section>
          ))}
        </div>
      )}

      {panel === "menu" && (
        <div className="nw-menu-grid">
          <article className="nw-reference-card">
            <p className="nw-kicker">Journey</p>
            <h3>Browser autosave</h3>
            <p>
              {saveStatus === "saved"
                ? "This journey and its active quest are saved in this browser."
                : saveStatus === "pending"
                  ? "Saving this journey in your browser."
                  : "Browser saving is unavailable. Keep this tab open to avoid losing progress."}{" "}
              Starting a new journey erases this save and returns to the starting town.
            </p>
            <button className="nw-danger-button" type="button" onClick={onNewJourney}>
              Begin a new journey
            </button>
          </article>
          <article className="nw-reference-card">
            <p className="nw-kicker">Field manual</p>
            <h3>Use the current scene</h3>
            <p>
              The main screen shows your location, goal, latest result, and useful actions. Use
              Atlas for roads, Journal for history, and All actions and costs for full details.
            </p>
            <button className="nw-text-button" type="button" onClick={onOpenTutorial}>
              Reopen field manual
            </button>
          </article>
        </div>
      )}
    </section>
  );
}

export function OverworldPlayScreen({
  world,
  journey,
  latestConsequence,
  log,
  sections,
  prioritySectionIds,
  panel,
  saveStatus,
  error,
  opportunityExplanation = null,
  onExplainOpportunity,
  onPanelChange,
  onNewJourney,
  onOpenTutorial,
}: OverworldPlayScreenProps): JSX.Element {
  const decisionRef = useRef<HTMLElement>(null);
  const optionalSupportRef = useRef<HTMLDetailsElement>(null);
  const sceneIdentity = `${world.current.id}:${world.currentArea?.id ?? "town-center"}`;
  const { sceneHeadingRef, stageRef, utilityHeadingRef } = useStagePanelNavigation(
    panel,
    sceneIdentity,
  );
  const priorityActions = focusedWorldActions(sections, prioritySectionIds);
  const optionalSupportActions = focusedOptionalSupportActions(sections, prioritySectionIds);
  const hasFocusedActions = priorityActions.length > 0 || optionalSupportActions.length > 0;

  return (
    <main className="nw-app nw-world-app">
      <NightWatchMasthead
        context={journey.goal.status === "completed" ? "Goal complete" : "Open road"}
        location={world.current.name}
        time={world.timeLabel}
        sessionStatus={
          saveStatus === "saved"
            ? "Journey progress saved"
            : saveStatus === "pending"
              ? "Saving journey progress…"
              : "Save unavailable · keep this tab open"
        }
        health={`${world.character.health.current}/${world.character.health.max}`}
        supplies={`${world.supplies}/${world.maxSupplies}`}
        fatigue={`${world.fatigue}`}
        onScene={() => onPanelChange("scene")}
      />

      <div className="nw-stage" ref={stageRef}>
        <WorldUtility
          panel={panel}
          saveStatus={saveStatus}
          world={world}
          journey={journey}
          log={log}
          sections={sections}
          onClose={() => onPanelChange("scene")}
          onNewJourney={onNewJourney}
          onOpenTutorial={onOpenTutorial}
          headingRef={utilityHeadingRef}
        />

        {panel === "scene" && (
          <>
            <section className="nw-scene-layout nw-world-scene-layout">
              <article className="nw-scene-copy">
                <p className="nw-kicker">
                  {world.current.kind.replaceAll("_", " ")} · {world.current.region}
                </p>
                <h1 ref={sceneHeadingRef} tabIndex={-1}>
                  {world.current.name}
                </h1>
                <div className="nw-scene-prose">
                  <p>{world.current.description}</p>
                </div>
                {world.currentArea && (
                  <blockquote className="nw-dialogue nw-place-detail">
                    <cite>
                      <MapPin aria-hidden="true" /> {world.currentArea.name}
                    </cite>
                    <p>{world.currentArea.summary}</p>
                  </blockquote>
                )}
              </article>

              <aside className="nw-objective">
                <p className="nw-kicker">Current goal</p>
                <h2>{journey.goal.text}</h2>
                <p>{journey.goalGuidance ?? "Choose a local action that advances this goal."}</p>

                <dl className="nw-world-vitals">
                  <div>
                    <dt>Condition</dt>
                    <dd>{world.travelCondition}</dd>
                  </div>
                  <div>
                    <dt>Local area</dt>
                    <dd>{world.currentArea?.name ?? "Town center"}</dd>
                  </div>
                  <div>
                    <dt>Decisions made</dt>
                    <dd>{journey.acceptedDecisions}</dd>
                  </div>
                  <div>
                    <dt>Known world</dt>
                    <dd>
                      {world.visitedCount} visited · {world.discovered.length} discovered
                    </dd>
                  </div>
                </dl>

                {journey.opportunities && (
                  <div className="nw-opportunities">
                    <JourneyOpportunityLeads
                      opportunities={journey.opportunities}
                      headingId="nw-world-opportunities-title"
                      explanation={opportunityExplanation}
                      {...(onExplainOpportunity ? { onExplain: onExplainOpportunity } : {})}
                    />
                  </div>
                )}
              </aside>
            </section>

            <section className="nw-consequence" aria-live="polite">
              <Info aria-hidden="true" />
              <strong>Latest result</strong>
              <span>{error ? `Could not continue: ${error}` : latestConsequence}</span>
            </section>

            {hasFocusedActions && (
              <button
                className="nw-decision-shortcut"
                type="button"
                onClick={() =>
                  (decisionRef.current ?? optionalSupportRef.current)?.scrollIntoView({
                    behavior: "smooth",
                  })
                }
              >
                Next decision <ArrowRight aria-hidden="true" />
              </button>
            )}

            {priorityActions.length > 0 ? (
              <section className="nw-decision-deck" aria-label="Relevant actions" ref={decisionRef}>
                {priorityActions.map((action) => (
                  <ActionCard action={action} key={action.id} />
                ))}
              </section>
            ) : optionalSupportActions.length === 0 ? (
              <section className="nw-empty-deck">
                <Signpost aria-hidden="true" />
                <h2>No immediate local action</h2>
                <p>Open Atlas for roads or All actions and costs for every available option.</p>
              </section>
            ) : null}

            {optionalSupportActions.length > 0 && (
              <details className="nw-optional-support" ref={optionalSupportRef}>
                <summary>Review optional support ({optionalSupportActions.length})</summary>
                <p>Compare these optional choices before you depart. You may skip them.</p>
                <div className="nw-optional-support-grid">
                  {optionalSupportActions.map((action) => (
                    <ActionCard action={action} key={action.id} />
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>

      <NightWatchDock active={panel} onSelect={onPanelChange} />
    </main>
  );
}
