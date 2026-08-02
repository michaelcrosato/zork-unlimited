import { useEffect, useRef, useState } from "react";
import {
  journeyStoryChoiceOptionsForPresentation,
  type JourneyPresentation,
} from "../../src/world/journey_contract.js";
import { JourneyOpportunityLeads } from "./JourneyOpportunityLeads.js";
import { DepartureRecap } from "./DepartureRecap.js";
import type { OverworldView } from "./overworld.js";

const REGISTRATION_OPTION_GROUPS = [
  ["doctrine", "Start with a doctrine"],
  ["custom_role", "Build a custom role"],
] as const;

type JourneyStoryChoiceScreenProps = {
  journey: JourneyPresentation;
  departureRecap?: OverworldView["departureRecap"];
  onChoose: (choiceId: string) => void;
  onDismiss?: () => void;
};

export function JourneyStoryChoiceScreen({
  journey,
  departureRecap,
  onChoose,
  onDismiss,
}: JourneyStoryChoiceScreenProps): JSX.Element {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const storyChoice = journey.storyChoice;
  const [revealedStoryChoice, setRevealedStoryChoice] = useState<
    Readonly<{ storyChoiceId: string; revealId: string }> | null
  >(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    setRevealedStoryChoice(null);
  }, [storyChoice?.id]);

  if (!storyChoice) {
    throw new Error("JourneyStoryChoiceScreen requires a pending story choice.");
  }
  const isRegistration = storyChoice.kind === "registration";
  const isLeadSource = storyChoice.kind === "lead_source";
  const isPreparation = storyChoice.kind === "preparation";
  const isAlly = storyChoice.kind === "ally";
  const isReliefAllocation = storyChoice.kind === "relief_allocation";
  const isReliefOath = storyChoice.kind === "relief_oath";
  const progressiveDisclosure = storyChoice.progressiveDisclosure;
  const hasStandardPacket = progressiveDisclosure !== undefined;
  const initialOptions = journeyStoryChoiceOptionsForPresentation(storyChoice);
  const isProgressiveDisclosureRevealed =
    progressiveDisclosure !== undefined &&
    revealedStoryChoice?.storyChoiceId === storyChoice.id &&
    revealedStoryChoice.revealId === progressiveDisclosure.reveal.id;
  const revealedOptions =
    progressiveDisclosure && isProgressiveDisclosureRevealed
      ? journeyStoryChoiceOptionsForPresentation(storyChoice, progressiveDisclosure.reveal.id).filter(
          (option) => !initialOptions.some((initialOption) => initialOption.id === option.id),
        )
      : [];
  const keepsCurrentObjective =
    isRegistration ||
    isLeadSource ||
    isPreparation ||
    isAlly ||
    isReliefAllocation ||
    isReliefOath;
  const usesRoleplayReceipts =
    keepsCurrentObjective &&
    storyChoice.options.every(
      (option) => option.summary !== undefined && option.summary.fieldTrigger === undefined,
    );
  const registrationGroups =
    isRegistration && storyChoice.options.some((option) => option.group !== undefined)
      ? REGISTRATION_OPTION_GROUPS.map(([group, label]) => ({
          label,
          options: storyChoice.options.filter(
            (option) =>
              option.group === group || (group === "custom_role" && option.group === undefined),
          ),
        })).filter((group) => group.options.length > 0)
      : null;
  const currentObjectiveGuidance = registrationGroups
    ? "A doctrine commits your role, oath, and source; a custom role continues step-by-step."
    : hasStandardPacket
      ? "The quick-setup card binds duty and evidence together; the duty comparison is read-only."
    : usesRoleplayReceipts
      ? "Choose the promise or priority you want to carry. Each card shows its exact cost and what you give up; field mechanics appear before they resolve."
      : isRegistration
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
                : "Choose the consequence that sets your next objective.";
  const renderOption = (option: (typeof initialOptions)[number]): JSX.Element => {
    const conciseSummary = option.summary;
    const usesRoleplayReceipt =
      conciseSummary !== undefined && conciseSummary.fieldTrigger === undefined;
    const usesTriggerCategory = conciseSummary?.fieldTriggerScope === "category";
    return (
      <div key={option.id} className="journey-choice-card">
        <button type="button" onClick={() => onChoose(option.id)}>
          <strong>{option.label}</strong>
          {conciseSummary ? (
            <span className="journey-choice-summary">
              <b>
                {usesRoleplayReceipt
                  ? "Promise / priority:"
                  : usesTriggerCategory
                    ? "Purpose:"
                    : "Commitment:"}
              </b>{" "}
              {conciseSummary.commitment}
            </span>
          ) : (
            <span>{option.consequence}</span>
          )}
          {conciseSummary?.fieldTrigger && (
            <small className="journey-choice-trigger">
              <b>
                {usesTriggerCategory
                  ? "Trigger category:"
                  : "First field trigger / tradeoff:"}
              </b>{" "}
              {conciseSummary.fieldTrigger}
            </small>
          )}
          {conciseSummary && usesRoleplayReceipt && (
            <small className="journey-choice-cost">
              <b>Cost / give up:</b> {conciseSummary.immediateCost}; {conciseSummary.tradeoff}
            </small>
          )}
          {conciseSummary && !usesRoleplayReceipt && (
            <small className="journey-choice-cost">
              <b>Immediate cost:</b> {conciseSummary.immediateCost}
            </small>
          )}
          {conciseSummary && !usesRoleplayReceipt && (
            <small className="journey-choice-tradeoff">
              <b>Tradeoff:</b> {conciseSummary.tradeoff}
            </small>
          )}
        </button>
        {conciseSummary && (
          <details className="journey-choice-details">
            <summary>
              {usesRoleplayReceipt
                ? `Inspect exact receipt for ${option.label}`
                : `Full terms and consequence for ${option.label}`}
            </summary>
            {conciseSummary.checkFit && (
              <p className="journey-choice-check-fit">
                <b>Check fit:</b> {conciseSummary.checkFit}
              </p>
            )}
            {option.dispatchImpact && (
              <p className="journey-choice-dispatch-impact">{option.dispatchImpact.line}</p>
            )}
            {option.dispatchForecast && (
              <p className="journey-choice-dispatch-forecast">
                {option.dispatchForecast.line}
              </p>
            )}
            <p>{option.consequence}</p>
          </details>
        )}
      </div>
    );
  };

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
            ? registrationGroups
              ? "Choose how to begin"
              : "Choose your lived background"
            : isLeadSource
              ? "Choose your Albany lead source"
              : isPreparation
                ? "Choose what Albany prepares"
                : isAlly
                  ? "Choose who leaves Albany"
                  : isReliefAllocation
                    ? "Choose what Albany can protect"
                    : isReliefOath
                      ? hasStandardPacket
                        ? "Choose quick setup or compare duties"
                        : "Choose one binding term"
                      : "Choose what follows"}
        </h1>
        <p id="journey-story-choice-message" className="journey-choice-message">
          {storyChoice.message}
        </p>

        <div className="journey-choice-goal">
          <span>{keepsCurrentObjective ? "Current objective" : "Goal just completed"}</span>
          <strong>{journey.goal.text}</strong>
          <small>
            {keepsCurrentObjective
              ? currentObjectiveGuidance
              : "Choose the consequence that sets your next objective."}
          </small>
        </div>

        {departureRecap && <DepartureRecap recap={departureRecap} headingLevel={2} />}

        <JourneyOpportunityLeads
          opportunities={journey.opportunities}
          headingId="journey-story-opportunities-title"
        />

        {progressiveDisclosure && (
          <section className="journey-choice-progressive-disclosure">
            <button
              className="secondary"
              type="button"
              aria-expanded={isProgressiveDisclosureRevealed}
              aria-controls={`journey-story-choice-${progressiveDisclosure.reveal.id}`}
              aria-describedby={`journey-story-choice-${progressiveDisclosure.reveal.id}-description`}
              onClick={() =>
                setRevealedStoryChoice((current) =>
                  current?.storyChoiceId === storyChoice.id &&
                  current.revealId === progressiveDisclosure.reveal.id
                    ? null
                    : { storyChoiceId: storyChoice.id, revealId: progressiveDisclosure.reveal.id },
                )
              }
            >
              {progressiveDisclosure.reveal.label}
            </button>
            <p id={`journey-story-choice-${progressiveDisclosure.reveal.id}-description`}>
              {progressiveDisclosure.reveal.description}
            </p>
          </section>
        )}
        {registrationGroups ? (
          <div className="journey-choice-option-groups">
            {registrationGroups.map((group) => (
              <section key={group.label} className="journey-choice-option-group">
                <h2>{group.label}</h2>
                <div className="journey-choice-actions journey-choice-actions-registration">
                  {group.options.map(renderOption)}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div
            className={`journey-choice-actions${
              keepsCurrentObjective ? " journey-choice-actions-registration" : ""
            }`}
          >
            {initialOptions.map(renderOption)}
          </div>
        )}
        {progressiveDisclosure && revealedOptions.length > 0 && (
          <section
            id={`journey-story-choice-${progressiveDisclosure.reveal.id}`}
            className="journey-choice-option-group"
          >
            <h2>{progressiveDisclosure.reveal.label}</h2>
            <div className="journey-choice-actions journey-choice-actions-registration">
              {revealedOptions.map(renderOption)}
            </div>
          </section>
        )}
        {onDismiss && (
          <button className="secondary" type="button" onClick={onDismiss}>
            Return to the Station without choosing
          </button>
        )}
      </section>
    </main>
  );
}
