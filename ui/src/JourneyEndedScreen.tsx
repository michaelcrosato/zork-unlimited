import type { JourneyPresentation } from "../../src/world/journey_contract.js";

type JourneyEndedScreenProps = {
  journey: JourneyPresentation;
  onNewJourney: () => void;
};

export function JourneyEndedScreen({
  journey,
  onNewJourney,
}: JourneyEndedScreenProps): JSX.Element {
  const endedByCharacterDeath =
    journey.retentionHistory.at(-1)?.reasons.includes("character_died") === true;
  const decisionUnit = journey.acceptedDecisions === 1 ? "decision" : "decisions";

  return (
    <main className="journey-ended-page">
      <section className="journey-ended-card" aria-labelledby="journey-ended-title">
        <p className="kicker">Journey record</p>
        <h1 id="journey-ended-title">This journey has ended</h1>
        <p>
          {endedByCharacterDeath
            ? `Your character died after ${String(journey.acceptedDecisions)} ${decisionUnit}. The unfinished goal and journey history remain below.`
            : `You ended this journey after ${String(journey.acceptedDecisions)} ${decisionUnit}. Its record remains below.`}
        </p>
        <dl>
          <div>
            <dt>Current goal</dt>
            <dd>{journey.goal.text}</dd>
          </div>
          <div>
            <dt>Goal status</dt>
            <dd>{journey.goal.status === "completed" ? "Completed" : "In progress"}</dd>
          </div>
          <div>
            <dt>Continue/end choices</dt>
            <dd>{journey.retentionHistory.length}</dd>
          </div>
        </dl>
        <button type="button" onClick={onNewJourney} autoFocus>
          Begin a new journey
        </button>
      </section>
    </main>
  );
}
