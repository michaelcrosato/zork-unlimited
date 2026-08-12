import { useEffect, useRef } from "react";
import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { ChatsCircle } from "@phosphor-icons/react/ChatsCircle";
import { Crosshair } from "@phosphor-icons/react/Crosshair";
import { Eye } from "@phosphor-icons/react/Eye";
import { Footprints } from "@phosphor-icons/react/Footprints";
import { HandPalm } from "@phosphor-icons/react/HandPalm";
import { Info } from "@phosphor-icons/react/Info";
import { Sword } from "@phosphor-icons/react/Sword";
import type { JourneyPresentation } from "../../src/world/journey_contract.js";
import type { OverworldQuestView } from "../../src/world/session_local_discovery.js";
import { CampaignCharacterPanel } from "./CampaignCharacterPanel.js";
import type { View, ViewChoice } from "./engine.js";
import { NightWatchDock, NightWatchMasthead, type NightWatchPanel } from "./NightWatchChrome.js";
import type { OverworldView } from "./overworld.js";
import { QuestCharacterContinuityPanel } from "./QuestCharacterContinuityPanel.js";

type QuestPlayScreenProps = {
  view: View;
  quest: OverworldQuestView;
  world: OverworldView;
  journey: JourneyPresentation;
  latestConsequence: string;
  error: string | null;
  log: readonly string[];
  panel: NightWatchPanel;
  onPanelChange: (panel: NightWatchPanel) => void;
  onChoose: (id: string, label: string) => void;
  canLeave: boolean;
  onLeave: () => void;
};

const ACTION_LANGUAGE: Record<
  ViewChoice["kind"],
  { group: string; button: string; tone: string; icon: typeof Eye }
> = {
  LOOK: { group: "Observe", button: "Inspect", tone: "lichen", icon: Eye },
  INSPECT: { group: "Observe", button: "Inspect", tone: "lichen", icon: Eye },
  READ: { group: "Observe", button: "Read", tone: "lichen", icon: Eye },
  INVENTORY: { group: "Observe", button: "Review", tone: "lichen", icon: Eye },
  TALK: { group: "Speak", button: "Speak", tone: "ice", icon: ChatsCircle },
  ASK: { group: "Ask", button: "Ask", tone: "ice", icon: ChatsCircle },
  MOVE: { group: "Advance", button: "Move", tone: "ice", icon: Footprints },
  ATTACK: { group: "Engage", button: "Commit", tone: "ember", icon: Sword },
  MANEUVER: { group: "Engage", button: "Commit", tone: "ember", icon: Crosshair },
  TAKE: { group: "Act", button: "Take", tone: "lichen", icon: HandPalm },
  DROP: { group: "Act", button: "Drop", tone: "lichen", icon: HandPalm },
  OPEN: { group: "Act", button: "Open", tone: "lichen", icon: HandPalm },
  CLOSE: { group: "Act", button: "Close", tone: "lichen", icon: HandPalm },
  UNLOCK: { group: "Act", button: "Unlock", tone: "lichen", icon: HandPalm },
  USE: { group: "Act", button: "Use", tone: "lichen", icon: HandPalm },
  GIVE: { group: "Act", button: "Give", tone: "lichen", icon: HandPalm },
};

function readableId(value: string): string {
  return value.replaceAll("_", " ").replaceAll(":", " · ");
}

function actionTerms(choice: ViewChoice): string[] {
  const terms: string[] = [];
  if (choice.skillCheck) terms.push(choice.detail ?? "Skill check");
  if (choice.combat) {
    const phase = choice.combat.phase?.replaceAll("_", " ") ?? "combat";
    terms.push(
      `${phase} · ATK ${choice.combat.attack_bonus >= 0 ? "+" : ""}${choice.combat.attack_bonus} · DEF ${choice.combat.defense_bonus >= 0 ? "+" : ""}${choice.combat.defense_bonus}`,
    );
  }
  if (choice.resources?.costs.length) {
    terms.push(`Spend ${choice.resources.costs.map(readableId).join(", ")}`);
  }
  if (choice.resources?.gains.length) {
    terms.push(`Gain ${choice.resources.gains.map(readableId).join(", ")}`);
  }
  return terms;
}

function SceneProse({ text }: { text: string }): JSX.Element {
  return (
    <div className="nw-scene-prose">
      {text
        .split(/\n+/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph, index) => (
          <p key={`${index}:${paragraph.slice(0, 24)}`}>{paragraph}</p>
        ))}
    </div>
  );
}

function dialogueLead(text: string): string {
  if (text.length <= 360) return text;
  const sentence = text.match(/^(.{80,320}?[.!?])(?:\s|$)/s)?.[1];
  return sentence ?? `${text.slice(0, 280).trimEnd()}…`;
}

function PressureTrack({
  track,
}: {
  track: NonNullable<View["pressureTracks"]>[number];
}): JSX.Element {
  return (
    <div className="nw-pressure-track">
      <div className="nw-pressure-heading">
        <strong>{track.title}</strong>
        <span>
          {track.value} · {track.band.label}
        </span>
      </div>
      <small>
        {track.band.description ??
          (track.next ? `Next: ${track.next.label} at ${track.next.min}` : "Highest authored band")}
      </small>
      <span className="nw-pressure-next">
        {track.next ? `Next ${track.next.label} at ${track.next.min}` : "Highest authored band"}
      </span>
    </div>
  );
}

function QuestUtility({
  panel,
  view,
  quest,
  world,
  journey,
  log,
  canLeave,
  onLeave,
  onClose,
}: Pick<
  QuestPlayScreenProps,
  "panel" | "view" | "quest" | "world" | "journey" | "log" | "canLeave" | "onLeave"
> & { onClose: () => void }): JSX.Element | null {
  if (panel === "scene") return null;

  return (
    <section className="nw-utility" aria-label={`${panel} panel`}>
      <header>
        <div>
          <p className="nw-kicker">Field reference</p>
          <h2>{panel === "terms" ? "Exact terms" : panel}</h2>
        </div>
        <button className="nw-text-button" type="button" onClick={onClose}>
          Return to scene
        </button>
      </header>

      {panel === "character" && (
        <div className="nw-utility-grid">
          <CampaignCharacterPanel character={world.character} />
          {view.characterContinuity && (
            <QuestCharacterContinuityPanel continuity={view.characterContinuity} />
          )}
        </div>
      )}

      {panel === "atlas" && (
        <div className="nw-reference-card">
          <p className="nw-kicker">Quest-local position</p>
          <h3>{view.title}</h3>
          <p>
            The campaign is paused at {world.current.name} while you complete {quest.title}. Road
            travel resumes when you return.
          </p>
          <dl className="nw-reference-list">
            <div>
              <dt>Quest location</dt>
              <dd>{view.location}</dd>
            </div>
            <div>
              <dt>Campaign location</dt>
              <dd>{world.current.name}</dd>
            </div>
            <div>
              <dt>Current goal</dt>
              <dd>{journey.goal.text}</dd>
            </div>
          </dl>
        </div>
      )}

      {panel === "journal" && (
        <div className="nw-journal-grid">
          <article className="nw-reference-card">
            <p className="nw-kicker">Quest journal</p>
            <ul className="nw-reference-lines">
              {view.journal.length > 0 ? (
                view.journal.map((entry, index) => <li key={`${index}:${entry}`}>{entry}</li>)
              ) : (
                <li>No quest notes recorded yet.</li>
              )}
            </ul>
          </article>
          <article className="nw-reference-card">
            <p className="nw-kicker">Latest scenes</p>
            <ol className="nw-reference-lines">
              {log.slice(0, 12).map((entry, index) => (
                <li key={`${index}:${entry.slice(0, 30)}`}>{entry}</li>
              ))}
            </ol>
          </article>
        </div>
      )}

      {panel === "terms" && (
        <div className="nw-terms-grid">
          <article className="nw-reference-card">
            <p className="nw-kicker">Quest-local state</p>
            <dl className="nw-reference-list">
              <div>
                <dt>Health</dt>
                <dd>{view.stats.hp}</dd>
              </div>
              <div>
                <dt>Attack / defense</dt>
                <dd>
                  {view.stats.attack} / {view.stats.defense}
                </dd>
              </div>
              <div>
                <dt>Score</dt>
                <dd>
                  {view.score}/{view.maxScore}
                </dd>
              </div>
              <div>
                <dt>State receipt</dt>
                <dd>{view.stateHash.slice(0, 12)}</dd>
              </div>
            </dl>
          </article>
          <article className="nw-reference-card">
            <p className="nw-kicker">Legal action terms</p>
            <ul className="nw-reference-lines">
              {view.choices.map((choice) => (
                <li key={choice.id}>
                  <strong>{choice.label}</strong>
                  <span>
                    {actionTerms(choice).join(" · ") || ACTION_LANGUAGE[choice.kind].group}
                  </span>
                </li>
              ))}
            </ul>
          </article>
          <article className="nw-reference-card">
            <p className="nw-kicker">Scene facts</p>
            <dl className="nw-reference-list">
              <div>
                <dt>Visible objects</dt>
                <dd>
                  {view.visibleObjects.map((object) => object.name).join(" · ") || "None visible"}
                </dd>
              </div>
              <div>
                <dt>People here</dt>
                <dd>{view.npcs.map((npc) => npc.name).join(" · ") || "No one present"}</dd>
              </div>
              <div>
                <dt>Open exits</dt>
                <dd>{view.exits.map((exit) => exit.direction).join(" · ") || "None"}</dd>
              </div>
              <div>
                <dt>Blocked exits</dt>
                <dd>
                  {view.blockedExits
                    .map((exit) => `${exit.direction}: ${exit.message}`)
                    .join(" · ") || "None"}
                </dd>
              </div>
              <div>
                <dt>Active threats</dt>
                <dd>
                  {view.enemies.map((enemy) => `${enemy.name} (HP ${enemy.hp})`).join(" · ") ||
                    "None"}
                </dd>
              </div>
            </dl>
            <details className="nw-state-details">
              <summary>Public quest state</summary>
              <dl className="nw-reference-list">
                <div>
                  <dt>Flags</dt>
                  <dd>{view.publicState.flags.join(" · ") || "None"}</dd>
                </div>
                <div>
                  <dt>Variables</dt>
                  <dd>
                    {Object.entries(view.publicState.vars)
                      .map(([name, value]) => `${name} ${value}`)
                      .join(" · ") || "None"}
                  </dd>
                </div>
              </dl>
            </details>
          </article>
          {view.unavailableChoices.length > 0 && (
            <article className="nw-reference-card">
              <p className="nw-kicker">Unavailable here</p>
              <ul className="nw-reference-lines">
                {view.unavailableChoices.map((choice) => (
                  <li key={choice.id}>
                    <strong>{choice.label}</strong>
                    <span>{choice.reason}</span>
                  </li>
                ))}
              </ul>
            </article>
          )}
        </div>
      )}

      {panel === "menu" && (
        <div className="nw-menu-grid">
          <article className="nw-reference-card">
            <p className="nw-kicker">Journey</p>
            <h3>{quest.title}</h3>
            {view.ended ? (
              <>
                <button
                  className="nw-primary-button"
                  type="button"
                  disabled={!canLeave}
                  onClick={canLeave ? onLeave : undefined}
                >
                  Return to {world.current.name}
                </button>
                {!canLeave && <p>Campaign foldback must succeed before returning to the road.</p>}
              </>
            ) : (
              <p>
                This quest is active. Return to the scene and reach an engine-projected ending or
                journey pause before going back to the road.
              </p>
            )}
          </article>
          <article className="nw-reference-card">
            <p className="nw-kicker">How this screen works</p>
            <p>
              The scene is stable. Choose only from the engine-projected action cards below it; the
              latest consequence updates after each action. Exact terms exposes checks, costs,
              blocked actions, and the deterministic state receipt.
            </p>
          </article>
        </div>
      )}
    </section>
  );
}

export function QuestPlayScreen({
  view,
  quest,
  world,
  journey,
  latestConsequence,
  error,
  log,
  panel,
  onPanelChange,
  onChoose,
  canLeave,
  onLeave,
}: QuestPlayScreenProps): JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null);
  const inventoryLabel = view.inventory.length > 0 ? view.inventory.join(" · ") : "No quest gear";
  const denseChoices =
    view.choices.length + view.unavailableChoices.length > 4 ||
    view.choices.some((choice) => choice.title.length > 72) ||
    view.unavailableChoices.some((choice) => choice.label.length > 72);

  useEffect(() => {
    stageRef.current?.scrollTo({ top: 0 });
  }, [panel, view.stateHash]);

  return (
    <main className="nw-app nw-quest-app">
      <NightWatchMasthead
        context={quest.title}
        location={view.title}
        time={world.timeLabel}
        sessionStatus="Quest tab-only · road save held"
        health={`${view.stats.hp}`}
        supplies={`${world.supplies}`}
        fatigue={`${world.fatigue}`}
        onScene={() => onPanelChange("scene")}
      />

      <div className="nw-stage" ref={stageRef}>
        <QuestUtility
          panel={panel}
          view={view}
          quest={quest}
          world={world}
          journey={journey}
          log={log}
          canLeave={canLeave}
          onLeave={onLeave}
          onClose={() => onPanelChange("scene")}
        />

        {panel === "scene" && (
          <>
            <section className="nw-scene-layout">
              <article className="nw-scene-copy">
                <p className="nw-kicker">
                  {quest.title} · {view.location}
                </p>
                <h1>{view.title}</h1>
                <SceneProse text={view.text} />
                {view.dialogue && (
                  <blockquote className="nw-dialogue">
                    <cite>{view.dialogue.npc}</cite>
                    <p>“{dialogueLead(view.dialogue.text)}”</p>
                    {view.dialogue.text.length > 360 && (
                      <details className="nw-dialogue-full">
                        <summary>Read the full briefing</summary>
                        <p>{view.dialogue.text}</p>
                      </details>
                    )}
                  </blockquote>
                )}
              </article>

              <aside className="nw-objective">
                <p className="nw-kicker">Quest objective</p>
                <h2>{quest.title}</h2>
                <p>{quest.discovery}</p>

                <div className="nw-campaign-goal">
                  <strong>Campaign goal</strong>
                  <span>{journey.goal.text}</span>
                </div>

                {view.pressureTracks && view.pressureTracks.length > 0 && (
                  <section className="nw-pressure" aria-label="Quest pressure">
                    <h3>Pressure</h3>
                    {view.pressureTracks.map((track) => (
                      <PressureTrack key={track.id} track={track} />
                    ))}
                  </section>
                )}

                <dl className="nw-issued-gear">
                  <div>
                    <dt>Quest gear</dt>
                    <dd>{inventoryLabel}</dd>
                  </div>
                  <div>
                    <dt>Quest stats</dt>
                    <dd>
                      ATK {view.stats.attack} · DEF {view.stats.defense}
                    </dd>
                  </div>
                </dl>
              </aside>
            </section>

            <section className="nw-consequence" aria-live="polite">
              <Info aria-hidden="true" />
              <strong>Latest consequence</strong>
              <span>{error ? `Could not continue: ${error}` : latestConsequence}</span>
            </section>

            {view.ended ? (
              <section className="nw-ending-deck">
                <p className="nw-kicker">Quest complete</p>
                <h2>{view.title}</h2>
                <p>
                  {view.ending?.text ??
                    `Ending ${view.endingId ?? "recorded"} · score ${view.score}/${view.maxScore}.`}{" "}
                  {canLeave
                    ? "The campaign record has been updated."
                    : "Campaign foldback is incomplete; resolve the error before returning."}
                </p>
                <button type="button" disabled={!canLeave} onClick={canLeave ? onLeave : undefined}>
                  Return to {world.current.name} <ArrowRight aria-hidden="true" />
                </button>
              </section>
            ) : (
              <section
                className={`nw-decision-deck${denseChoices ? " is-dense" : ""}`}
                aria-label="Available actions"
              >
                {view.choices.map((choice) => {
                  const language = ACTION_LANGUAGE[choice.kind];
                  const Icon = language.icon;
                  const terms = actionTerms(choice);
                  return (
                    <article className={`nw-action-card tone-${language.tone}`} key={choice.id}>
                      <p className="nw-action-kind">
                        <Icon aria-hidden="true" /> {language.group}
                      </p>
                      <h2>{choice.title}</h2>
                      <div className={`nw-action-terms${terms.length === 0 ? " is-default" : ""}`}>
                        <strong>{terms.length > 0 ? "Terms" : "Available now"}</strong>
                        <p>{terms.join(" · ") || "Projected legal by the game engine."}</p>
                      </div>
                      <button
                        type="button"
                        aria-label={`${language.button} ${choice.title}`}
                        onClick={() => onChoose(choice.id, choice.title)}
                      >
                        <span>
                          {language.button} <small>{choice.title}</small>
                        </span>
                        <ArrowRight aria-hidden="true" />
                      </button>
                    </article>
                  );
                })}
                {view.unavailableChoices.map((choice) => (
                  <article
                    className="nw-action-card tone-ice is-disabled"
                    key={`blocked:${choice.id}`}
                  >
                    <p className="nw-action-kind">
                      <Info aria-hidden="true" /> Unavailable
                    </p>
                    <h2>{choice.label}</h2>
                    <div className="nw-action-terms">
                      <strong>Blocked by the game</strong>
                      <p>{choice.reason}</p>
                    </div>
                    <button type="button" disabled>
                      <span>
                        Unavailable <small>{choice.label}</small>
                      </span>
                    </button>
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </div>

      <NightWatchDock active={panel} onSelect={onPanelChange} />
    </main>
  );
}
