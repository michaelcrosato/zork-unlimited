import type { JourneyPresentation } from "../../src/world/journey_contract.js";

type JourneyEndedScreenProps = {
  journey: JourneyPresentation;
  onNewJourney: () => void;
};

export function JourneyEndedScreen({
  journey,
  onNewJourney,
}: JourneyEndedScreenProps): JSX.Element {
  return (
    <main className="journey-ended-page">
      <section className="journey-ended-card" aria-labelledby="journey-ended-title">
        <p className="kicker">Journey record</p>
        <h1 id="journey-ended-title">This journey has ended</h1>
        <p>
          You chose to end after {journey.acceptedDecisions} accepted gameplay decisions. The
          record stays here for review.
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
            <dt>Continuation choices</dt>
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
