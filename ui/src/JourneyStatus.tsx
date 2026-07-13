import type { JourneyPresentation } from "../../src/world/journey_contract.js";

type JourneyStatusProps = {
  journey: JourneyPresentation;
  onFollowGoalPassage: () => void;
};

export function JourneyStatus({ journey, onFollowGoalPassage }: JourneyStatusProps): JSX.Element {
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
        {journey.goalGuidance && <p aria-label="Objective guidance">{journey.goalGuidance}</p>}
      </div>
      <dl className="journey-rhythm" aria-label="Journey rhythm">
        <div>
          <dt>Meaningful decisions</dt>
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
      {journey.goalPassage && (
        <article
          className="journey-passage"
          aria-labelledby={`journey-passage-title-${journey.goalPassage.id}`}
        >
          <div className="journey-passage-copy">
            <p className="kicker">Goal passage · road forecast</p>
            <h3 id={`journey-passage-title-${journey.goalPassage.id}`}>
              {journey.goalPassage.destination}
            </h3>
            <p className="journey-passage-consequence">{journey.goalPassage.consequence}</p>
            <p className="journey-passage-stop">
              <strong>Where the passage stops:</strong> {journey.goalPassage.stopRule}
            </p>
          </div>
          <dl className="journey-passage-facts" aria-label="Goal passage forecast">
            <div>
              <dt>Roads</dt>
              <dd>
                {journey.goalPassage.roadCount}{" "}
                {journey.goalPassage.roadCount === 1 ? "road" : "roads"}
              </dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>
                {journey.goalPassage.baseMinutes} road min · {journey.goalPassage.estimatedMinutes}{" "}
                estimated
              </dd>
            </div>
            <div>
              <dt>Supplies</dt>
              <dd>
                {journey.goalPassage.suppliesNeeded} needed · {journey.goalPassage.supplyDeficit}{" "}
                short · {journey.goalPassage.suppliesAfter} left
              </dd>
            </div>
            <div>
              <dt>Arrival</dt>
              <dd>
                Fatigue {journey.goalPassage.fatigueAfter} ·{" "}
                {journey.goalPassage.travelConditionAfter}
              </dd>
            </div>
          </dl>
          <button type="button" className="journey-passage-action" onClick={onFollowGoalPassage}>
            {journey.goalPassage.label}
          </button>
        </article>
      )}
    </section>
  );
}
