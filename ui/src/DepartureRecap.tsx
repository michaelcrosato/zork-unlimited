import type { OverworldView } from "./overworld.js";

export function DepartureRecap({
  recap,
  headingLevel = 4,
}: {
  recap: NonNullable<OverworldView["departureRecap"]>;
  headingLevel?: 2 | 4;
}): JSX.Element {
  const Heading = headingLevel === 2 ? "h2" : "h4";
  const selectedTerms = recap.entries.filter(
    (entry): entry is typeof entry & { activeFieldTerm: string } =>
      entry.activeFieldTerm !== null,
  );
  return (
    <section aria-label={`${recap.questTitle} dispatch recap`}>
      <Heading>{recap.questTitle} dispatch recap</Heading>
      {recap.dispatch && (
        <p className="departure-recap-dispatch">
          {recap.dispatch.state === "sealed" ? (
            <>
              Dispatch sealed: {recap.dispatch.minutes}m — {" "}
              {recap.dispatch.timing === "on_time" ? "on time" : "delayed"}.
            </>
          ) : recap.dispatch.state === "direct_launch" ? (
            <>
              Direct launch now: {recap.dispatch.minutes}m — {" "}
              {recap.dispatch.timing === "on_time" ? "on time" : "delayed"}. Field-team
              contact remains optional.
            </>
          ) : (
            <>
              Dispatch committed: {recap.dispatch.minutes}m. Optional before launch: {" "}
              {recap.dispatch.remainingOptional
                .map((slot) => (slot === "relief_allocation" ? "relief allocation" : "field team"))
                .join(" and ")}
              .
            </>
          )}
        </p>
      )}
      <dl className="departure-recap">
        {recap.entries.map((entry) => (
          <div key={entry.slot}>
            <dt>{entry.label}</dt>
            <dd>
              {entry.title ??
                (entry.status === "open_optional"
                  ? "Open (optional)"
                  : "Available after choosing preparation")}
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
