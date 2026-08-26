import type {
  JourneyOpportunityKind,
  JourneyOpportunityPresentation,
} from "../../src/world/journey_contract.js";
import type { JourneyOpportunityExplanation } from "../../src/world/journey_opportunity_explainer.js";

type JourneyOpportunityLeadsProps = {
  opportunities: JourneyOpportunityPresentation | null;
  headingId: string;
  explanation?: JourneyOpportunityExplanation | null;
  onExplain?: (kind: JourneyOpportunityKind, id: string) => void;
};

const ACCESS_LABELS = {
  here: "Here now",
  mapped: "Mapped district",
  route_unmapped: "Route not yet mapped",
} as const;

export function JourneyOpportunityLeads({
  opportunities,
  headingId,
  explanation = null,
  onExplain,
}: JourneyOpportunityLeadsProps): JSX.Element | null {
  if (!opportunities) return null;

  return (
    <section className="journey-opportunities" aria-labelledby={headingId}>
      <div className="journey-opportunities-copy">
        <p className="kicker">Optional work</p>
        <h3 id={headingId}>Available leads</h3>
        <p>{opportunities.guidance}</p>
      </div>
      {opportunities.leads.length > 0 ? (
        <ul className="journey-opportunity-list">
          {opportunities.leads.map((lead) => {
            const shown =
              explanation?.lead.kind === lead.kind && explanation.lead.id === lead.id
                ? explanation
                : null;
            return (
              <li key={`${lead.kind}:${lead.id}`}>
                <strong>{lead.title}</strong>
                <span>{lead.area}</span>
                <small>{ACCESS_LABELS[lead.access]}</small>
                {onExplain && (
                  <button
                    type="button"
                    aria-label={`Show how to start ${lead.title}`}
                    onClick={() => onExplain(lead.kind, lead.id)}
                  >
                    Show how to start
                  </button>
                )}
                {shown && (
                  <p className="journey-opportunity-explanation" aria-live="polite">
                    {shown.nextAction.label} <code>{shown.nextAction.command}</code>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
