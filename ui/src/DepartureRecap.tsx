import type { OverworldView } from "./overworld.js";

type DepartureRecapView = NonNullable<OverworldView["departureRecap"]>;
type DepartureRecapEntry = DepartureRecapView["entries"][number];
type DepartureRecapOptionalSlot = NonNullable<
  DepartureRecapView["dispatch"]
>["remainingOptional"][number];

const DEPARTURE_RECAP_SLOT_LABELS: Readonly<Record<DepartureRecapOptionalSlot, string>> = {
  preparation: "preparation",
  relief_allocation: "relief allocation",
  field_team: "field team",
};

function formatOptionalSlots(slots: readonly DepartureRecapOptionalSlot[]): string {
  const labels = slots.map((slot) => DEPARTURE_RECAP_SLOT_LABELS[slot]);
  if (labels.length < 3) return labels.join(" and ");
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)!}`;
}

function departureRecapEntryValue(entry: DepartureRecapEntry): string {
  if (entry.title !== null) return entry.title;
  switch (entry.status) {
    case "open_optional":
      return "Open (optional)";
    case "available_after_preparation":
      return "Available after choosing preparation";
    case "solo_default":
      return "Solo departure";
    case "selected":
      return "Selected";
  }
}

export function DepartureRecap({
  recap,
  headingLevel = 4,
}: {
  recap: DepartureRecapView;
  headingLevel?: 2 | 4;
}): JSX.Element {
  const Heading = headingLevel === 2 ? "h2" : "h4";
  const selectedTerms = recap.entries.filter(
    (entry): entry is typeof entry & { activeFieldTerm: string } => entry.activeFieldTerm !== null,
  );
  const selectedPlan = recap.entries
    .flatMap((entry) => (entry.title === null ? [] : [`${entry.label}: ${entry.title}`]))
    .join(" · ");
  const entryList = (
    <dl className="departure-recap">
      {recap.entries.map((entry) => (
        <div key={entry.slot}>
          <dt>{entry.label}</dt>
          <dd>
            {departureRecapEntryValue(entry)}
            {entry.status === "solo_default" && (
              <>
                <br />
                <small className="departure-recap-field-term">
                  Direct-launch default; field-team contact remains optional.
                </small>
              </>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
  return (
    <section aria-label={`${recap.questTitle} dispatch recap`}>
      <Heading>{recap.questTitle} dispatch recap</Heading>
      {recap.dispatch && (
        <p className="departure-recap-dispatch">
          {recap.dispatch.state === "sealed" ? (
            <>
              Dispatch sealed: {recap.dispatch.minutes}m —{" "}
              {recap.dispatch.timing === "on_time" ? "on time" : "delayed"}.
            </>
          ) : recap.dispatch.state === "direct_launch" ? (
            <>
              Direct launch now: {recap.dispatch.minutes}m —{" "}
              {recap.dispatch.timing === "on_time" ? "on time" : "delayed"}. Field-team contact
              remains optional.
            </>
          ) : (
            <>
              Dispatch committed: {recap.dispatch.minutes}m
              {recap.dispatch.remainingOptional.length > 0
                ? `; ${formatOptionalSlots(recap.dispatch.remainingOptional)} ${recap.dispatch.remainingOptional.length === 1 ? "remains" : "remain"} optional`
                : ""}
              .
            </>
          )}
        </p>
      )}
      {recap.dispatch?.state === "committed" && selectedPlan.length > 0 && (
        <p className="departure-recap-selected">Selected plan: {selectedPlan}.</p>
      )}
      {recap.dispatch?.state === "committed" ? (
        <details className="departure-recap-slots">
          <summary>Review selected and optional plan slots</summary>
          {entryList}
        </details>
      ) : (
        entryList
      )}
      {selectedTerms.length > 0 && (
        <details className="departure-recap-terms">
          <summary>Review exact active terms</summary>
          <dl>
            {selectedTerms.map((entry) => (
              <div key={entry.slot}>
                <dt>{entry.label}</dt>
                <dd>{entry.activeFieldTerm}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </section>
  );
}
