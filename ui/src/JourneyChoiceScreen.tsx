import { useEffect, useRef } from "react";
import type {
  JourneyChoice,
  JourneyPresentation,
} from "../../src/world/journey_contract.js";
import { JourneyOpportunityLeads } from "./JourneyOpportunityLeads.js";

type JourneyChoiceScreenProps = {
  journey: JourneyPresentation;
  onChoose: (choice: JourneyChoice) => void;
};

export function JourneyChoiceScreen({
  journey,
  onChoose,
}: JourneyChoiceScreenProps): JSX.Element {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pendingChoice = journey.pendingChoice;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  if (!pendingChoice) {
    throw new Error("JourneyChoiceScreen requires a pending journey choice.");
  }
  const characterDied = pendingChoice.reasons.includes("character_died");

  return (
    <main className="journey-decision-page">
      <section
        className="journey-decision-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="journey-choice-title"
        aria-describedby="journey-choice-message"
      >
        <p className="kicker">Journey pause · decision {pendingChoice.atDecision}</p>
        <h1 id="journey-choice-title" ref={headingRef} tabIndex={-1}>
          {characterDied ? "Your character died" : "Continue this journey?"}
        </h1>
        <p id="journey-choice-message" className="journey-choice-message">
          {pendingChoice.message}
        </p>

        <div className="journey-choice-goal">
          <span>Current goal</span>
          <strong>{journey.goal.text}</strong>
          <small>{journey.goal.status === "completed" ? "Completed" : "In progress"}</small>
          {journey.goalGuidance && <small>{journey.goalGuidance}</small>}
        </div>

        <JourneyOpportunityLeads
          opportunities={journey.opportunities}
          headingId="journey-choice-opportunities-title"
        />

        <div className="journey-choice-actions">
          {pendingChoice.options.map((option) => (
            <button key={option.id} type="button" onClick={() => onChoose(option.id)}>
              <strong>{option.label}</strong>
              <span>{option.consequence}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
