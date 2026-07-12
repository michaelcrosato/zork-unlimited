import { useEffect, useRef } from "react";
import type { JourneyPresentation } from "../../src/world/journey_contract.js";

type JourneyStoryChoiceScreenProps = {
  journey: JourneyPresentation;
  onChoose: (choiceId: string) => void;
};

export function JourneyStoryChoiceScreen({
  journey,
  onChoose,
}: JourneyStoryChoiceScreenProps): JSX.Element {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const storyChoice = journey.storyChoice;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  if (!storyChoice) {
    throw new Error("JourneyStoryChoiceScreen requires a pending story choice.");
  }

  return (
    <main className="journey-decision-page">
      <section
        className="journey-decision-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="journey-story-choice-title"
        aria-describedby="journey-story-choice-message"
      >
        <p className="kicker">Albany Station Quarter · dawn dispatch</p>
        <h1 id="journey-story-choice-title" ref={headingRef} tabIndex={-1}>
          Where should the relief wagon go?
        </h1>
        <p id="journey-story-choice-message" className="journey-choice-message">
          {storyChoice.message}
        </p>

        <div className="journey-choice-goal">
          <span>Goal just completed</span>
          <strong>{journey.goal.text}</strong>
          <small>Choose the consequence that sets your next objective.</small>
        </div>

        <div className="journey-choice-actions">
          {storyChoice.options.map((option) => (
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
