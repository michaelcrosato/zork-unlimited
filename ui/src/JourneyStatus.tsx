import type { JourneyPresentation } from "../../src/world/journey_contract.js";

type JourneyStatusProps = {
  journey: JourneyPresentation;
};

export function JourneyStatus({ journey }: JourneyStatusProps): JSX.Element {
  const goalProgress =
    journey.goal.status === "completed"
      ? `Completed at decision ${journey.goal.completedAtDecision}.`
      : "In progress.";
  const nextChoice =
    journey.nextCheckpoint === null
      ? "No further checkpoint"
      : `Next choice at ${journey.nextCheckpoint}`;

  return (
    <section className="journey-status" aria-labelledby="journey-goal-title">
      <div className="journey-goal-copy">
        <p className="kicker">Current goal · v{journey.goal.version}</p>
        <h2 id="journey-goal-title">{journey.goal.text}</h2>
        <p>{goalProgress}</p>
      </div>
      <dl className="journey-rhythm" aria-label="Journey rhythm">
        <div>
          <dt>Decisions</dt>
          <dd aria-live="polite">{journey.acceptedDecisions}</dd>
        </div>
        <div>
          <dt>Rhythm</dt>
          <dd>{journey.baselineDecisions}</dd>
        </div>
        <div>
          <dt>Next pause</dt>
          <dd>{nextChoice}</dd>
        </div>
      </dl>
    </section>
  );
}
