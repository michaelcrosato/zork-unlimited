import type { OverworldView } from "./overworld.js";

type DepartureRecapView = NonNullable<OverworldView["departureRecap"]>;
type DepartureRecapEntry = DepartureRecapView["entries"][number];
type DepartureRecapOptionalSlot = NonNullable<
  DepartureRecapView["dispatch"]
>["remainingOptional"][number];

const DEPARTURE_RECAP_SLOT_LABELS: Readonly<Record<DepartureRecapOptionalSlot, string>> = {
  preparation: "field kit",
  relief_allocation: "relief wagon",
  field_team: "second rider",
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
      return "Available after choosing a field kit";
    case "solo_default":
      return "Solo departure";
    case "selected":
      return "Selected";
  }
}

export function DepartureRecap({
  recap,
  headingLevel = 4,
  entryScope = "all",
}: {
  recap: DepartureRecapView;
  headingLevel?: 2 | 4;
  entryScope?: "all" | "already_set";
}): JSX.Element {
  const Heading = headingLevel === 2 ? "h2" : "h4";
  const visibleEntries =
    entryScope === "already_set"
      ? recap.entries.filter((entry) => entry.status !== "open_optional")
      : recap.entries;
  const selectedTerms = visibleEntries.filter(
    (entry): entry is typeof entry & { activeFieldTerm: string } => entry.activeFieldTerm !== null,
  );
  const selectedPlan = visibleEntries
    .flatMap((entry) => (entry.title === null ? [] : [`${entry.label}: ${entry.title}`]))
    .join(" · ");
  const entryList = (
    <dl className="departure-recap">
      {visibleEntries.map((entry) => (
        <div key={entry.slot}>
          <dt>{entry.label}</dt>
          <dd>
            {departureRecapEntryValue(entry)}
            {entry.status === "solo_default" && (
              <>
                <br />
                <small className="departure-recap-field-term">
                  Leaving alone; you may still add a second rider.
                </small>
              </>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
  return (
    <section aria-label={`${recap.questTitle} departure plan`}>
      <Heading>{recap.questTitle} departure plan</Heading>
      {recap.dispatch && entryScope === "all" && (
        <p className="departure-recap-dispatch">
          {recap.dispatch.state === "sealed" ? (
            <>
              Departure plan complete: {recap.dispatch.minutes} min —{" "}
              {recap.dispatch.timing === "on_time" ? "on time" : "delayed"}.
            </>
          ) : recap.dispatch.state === "direct_launch" ? (
            <>
              Leave now: {recap.dispatch.minutes} min —{" "}
              {recap.dispatch.timing === "on_time" ? "on time" : "delayed"}. You may still add a
              second rider.
            </>
          ) : (
            <>
              Departure ready: {recap.dispatch.minutes} min
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
          <summary>
            {entryScope === "already_set"
              ? "Review what is already set"
              : "Review what is set and still optional"}
          </summary>
          {entryList}
        </details>
      ) : (
        entryList
      )}
      {selectedTerms.length > 0 && (
        <details className="departure-recap-terms">
          <summary>Review selected costs and effects</summary>
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
