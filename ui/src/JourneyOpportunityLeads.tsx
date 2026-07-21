import type { JourneyOpportunityPresentation } from "../../src/world/journey_contract.js";

type JourneyOpportunityLeadsProps = {
  opportunities: JourneyOpportunityPresentation | null;
  headingId: string;
};

const ACCESS_LABELS = {
  here: "Here now",
  mapped: "Mapped district",
  route_unmapped: "Route not yet mapped",
} as const;

export function JourneyOpportunityLeads({
  opportunities,
  headingId,
}: JourneyOpportunityLeadsProps): JSX.Element | null {
  if (!opportunities) return null;

  return (
    <section className="journey-opportunities" aria-labelledby={headingId}>
      <div className="journey-opportunities-copy">
        <p className="kicker">Optional aftermath</p>
        <h3 id={headingId}>Return opportunities</h3>
        <p>{opportunities.guidance}</p>
      </div>
      <ul className="journey-opportunity-list">
        {opportunities.leads.map((lead) => (
          <li key={`${lead.kind}:${lead.id}`}>
            <strong>{lead.title}</strong>
            <span>{lead.area}</span>
            <small>{ACCESS_LABELS[lead.access]}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
