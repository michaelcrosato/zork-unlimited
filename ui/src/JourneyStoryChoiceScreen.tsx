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
  const isRegistration = storyChoice.kind === "registration";
  const isLeadSource = storyChoice.kind === "lead_source";
  const isPreparation = storyChoice.kind === "preparation";
  const isAlly = storyChoice.kind === "ally";
  const isReliefAllocation = storyChoice.kind === "relief_allocation";
  const isReliefOath = storyChoice.kind === "relief_oath";
  const keepsCurrentObjective =
    isRegistration ||
    isLeadSource ||
    isPreparation ||
    isAlly ||
    isReliefAllocation ||
    isReliefOath;

  return (
    <main className="journey-decision-page">
      <section
        className="journey-decision-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="journey-story-choice-title"
        aria-describedby="journey-story-choice-message"
      >
        <p className="kicker">
          {isRegistration
            ? "Character registration"
            : isLeadSource
              ? "Albany evidence source"
              : isPreparation
                ? "Albany preparation budget"
                : isAlly
                  ? "Field-team commitment"
                  : isReliefAllocation
                    ? "Albany relief capacity"
                    : isReliefOath
                      ? "Relief terms"
                      : "Journey consequence"}
        </p>
        <h1 id="journey-story-choice-title" ref={headingRef} tabIndex={-1}>
          {isRegistration
            ? "Choose your lived background"
            : isLeadSource
              ? "Choose your Albany lead source"
              : isPreparation
                ? "Choose what Albany prepares"
                : isAlly
                  ? "Choose who leaves Albany"
                  : isReliefAllocation
                    ? "Choose what Albany can protect"
                    : isReliefOath
                      ? "Choose one binding term"
                      : "Choose what follows"}
        </h1>
        <p id="journey-story-choice-message" className="journey-choice-message">
          {storyChoice.message}
        </p>

        <div className="journey-choice-goal">
          <span>{keepsCurrentObjective ? "Current objective" : "Goal just completed"}</span>
          <strong>{journey.goal.text}</strong>
          <small>
            {isRegistration
              ? "Your registered history persists into the journey; choose the experience and obligations you will carry."
              : isLeadSource
                ? "Your source changes the evidence and approaches you can carry forward; it does not replace this objective."
                : isPreparation
                  ? "Your finite allocation changes later actions and the service Albany can release on your return; it does not replace this objective."
                  : isAlly
                    ? "Compare the field capability, binding condition, and actual cost in these terms; your commitment changes who can act independently without replacing this objective."
                    : isReliefAllocation
                      ? "Albany can cover one need. Each choice names what it protects, what remains exposed, and which field or return resource changes."
                      : isReliefOath
                        ? "Compare each term's access, duty, actual cost, field consequence, and return promise. This binds the dispatch without replacing your current objective."
                        : "Choose the consequence that sets your next objective."}
          </small>
        </div>

        <div
          className={`journey-choice-actions${
            keepsCurrentObjective ? " journey-choice-actions-registration" : ""
          }`}
        >
          {storyChoice.options.map((option) => {
            const conciseSummary = option.summary;
            return (
              <div key={option.id} className="journey-choice-card">
                <button type="button" onClick={() => onChoose(option.id)}>
                  <strong>{option.label}</strong>
                  {conciseSummary ? (
                    <span className="journey-choice-summary">
                      <b>Commitment:</b> {conciseSummary.commitment}
                    </span>
                  ) : (
                    <span>{option.consequence}</span>
                  )}
                  {conciseSummary && (
                    <small className="journey-choice-trigger">
                      <b>First field trigger / tradeoff:</b> {conciseSummary.fieldTrigger}
                    </small>
                  )}
                  {conciseSummary?.immediateCost && (
                    <small className="journey-choice-cost">
                      <b>Immediate cost:</b> {conciseSummary.immediateCost}
                    </small>
                  )}
                </button>
                {conciseSummary && (
                  <details className="journey-choice-details">
                    <summary>Full terms and consequence</summary>
                    <p>{option.consequence}</p>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
