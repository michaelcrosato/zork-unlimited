import { useEffect, useRef } from "react";
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
};

export type WorldActionSection = {
  id: string;
  title: string;
  description?: string;
  actions: readonly WorldActionCard[];
};

type OverworldPlayScreenProps = {
  world: OverworldView;
  journey: JourneyPresentation;
  latestConsequence: string;
  log: readonly string[];
  sections: readonly WorldActionSection[];
  prioritySectionIds: readonly string[];
  panel: NightWatchPanel;
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
        <p>{action.disabledReason ?? action.terms ?? "Projected legal by the game engine."}</p>
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
  world,
  journey,
  log,
  sections,
  onClose,
  onNewJourney,
  onOpenTutorial,
}: Pick<
  OverworldPlayScreenProps,
  "panel" | "world" | "journey" | "log" | "sections" | "onNewJourney" | "onOpenTutorial"
> & { onClose: () => void }): JSX.Element | null {
  if (panel === "scene") return null;
  const routes = sections.find((section) => section.id === "roads");

  return (
    <section className="nw-utility" aria-label={`${panel} panel`}>
      <header>
        <div>
          <p className="nw-kicker">Campaign reference</p>
          <h2>{panel === "terms" ? "Exact terms" : panel}</h2>
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
              {world.totalTowns} towns in the state graph
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
            <p>
              {journey.goalGuidance ?? "Follow the evidence and choose what your character keeps."}
            </p>
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
            <p className="nw-kicker">Consequence feed</p>
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
                    {arc.resolvedInRegion}/{arc.requiredResolutions} anchors · {arc.region}
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
                  <p className="nw-kicker">Engine-projected actions</p>
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
                <p className="nw-empty-state">Nothing is currently projected in this category.</p>
              )}
            </section>
          ))}
        </div>
      )}

      {panel === "menu" && (
        <div className="nw-menu-grid">
          <article className="nw-reference-card">
            <p className="nw-kicker">Journey</p>
            <h3>Saved automatically</h3>
            <p>
              Campaign state is saved in this browser after every projected view change. A new
              journey clears that record and begins again in the authored starting town.
            </p>
            <button className="nw-danger-button" type="button" onClick={onNewJourney}>
              Begin a new journey
            </button>
          </article>
          <article className="nw-reference-card">
            <p className="nw-kicker">Field manual</p>
            <h3>One scene at a time</h3>
            <p>
              The main screen holds the current place, objective, consequence, and most relevant
              legal actions. Atlas, Journal, and Exact terms keep the wider campaign available
              without competing with play.
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
  error,
  opportunityExplanation = null,
  onExplainOpportunity,
  onPanelChange,
  onNewJourney,
  onOpenTutorial,
}: OverworldPlayScreenProps): JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null);
  const prioritySections = prioritySectionIds
    .map((id) => sections.find((section) => section.id === id))
    .filter((section): section is WorldActionSection => section !== undefined);
  const priorityActions = prioritySections
    .flatMap((section) =>
      section.actions
        .filter((action) => action.disabledReason === undefined)
        .slice(0, section.id === "dispatch" || section.id === "encounter" ? 6 : 1),
    )
    .slice(0, 6);

  useEffect(() => {
    stageRef.current?.scrollTo({ top: 0 });
  }, [latestConsequence, panel]);

  return (
    <main className="nw-app nw-world-app">
      <NightWatchMasthead
        context={journey.goal.status === "completed" ? "Goal complete" : "Open road"}
        location={world.current.name}
        time={world.timeLabel}
        sessionStatus="Road record saved"
        health={`${world.character.health.current}/${world.character.health.max}`}
        supplies={`${world.supplies}/${world.maxSupplies}`}
        fatigue={`${world.fatigue}`}
        onScene={() => onPanelChange("scene")}
      />

      <div className="nw-stage" ref={stageRef}>
        <WorldUtility
          panel={panel}
          world={world}
          journey={journey}
          log={log}
          sections={sections}
          onClose={() => onPanelChange("scene")}
          onNewJourney={onNewJourney}
          onOpenTutorial={onOpenTutorial}
        />

        {panel === "scene" && (
          <>
            <section className="nw-scene-layout nw-world-scene-layout">
              <article className="nw-scene-copy">
                <p className="nw-kicker">
                  {world.current.kind.replaceAll("_", " ")} · {world.current.region}
                </p>
                <h1>{world.current.name}</h1>
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
                <p>
                  {journey.goalGuidance ?? "Find the next local consequence that moves the work."}
                </p>

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
                    <dt>Journey rhythm</dt>
                    <dd>{journey.acceptedDecisions} meaningful decisions</dd>
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
              <strong>Latest consequence</strong>
              <span>{error ? `Could not continue: ${error}` : latestConsequence}</span>
            </section>

            {priorityActions.length > 0 ? (
              <section className="nw-decision-deck" aria-label="Relevant actions">
                {priorityActions.map((action) => (
                  <ActionCard action={action} key={action.id} />
                ))}
              </section>
            ) : (
              <section className="nw-empty-deck">
                <Signpost aria-hidden="true" />
                <h2>No immediate local action</h2>
                <p>Open the Atlas for roads or Exact terms for every projected action.</p>
              </section>
            )}
          </>
        )}
      </div>

      <NightWatchDock active={panel} onSelect={onPanelChange} />
    </main>
  );
}
