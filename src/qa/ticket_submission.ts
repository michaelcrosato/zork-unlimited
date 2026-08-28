/**
 * Promote a QA ticket into an intake submission.
 *
 * This is the seam between the rich, playtest-specific evidence model and the flat,
 * source-agnostic queue. Triage keeps reasoning in its own terms — corroboration across
 * model lineages, cost tiers, session trails, staleness — and only what survives that
 * reasoning crosses into the queue, flattened to a priority and a body a dev agent can
 * act on without knowing anything about playtesting.
 *
 * Only ACTIONABLE tickets cross. An `accumulating` ticket is real, kept, and readable in
 * `qa/tickets/`, but it is not yet work, and putting it in the dev loop's queue would
 * hand the loop a pile of single-report opinions to chase. The queue is for things
 * somebody should build; the ticket bucket is the whole picture.
 *
 * The submission's identity key is the TICKET id, which is itself content-addressed on
 * the problem's stable identity. So a finding that keeps recurring across cohorts
 * updates one queue item and one tracker issue for its entire life, rather than filing a
 * fresh one every wave — which is the single most important property for a queue fed by
 * a loop that runs continuously.
 */
import {
  defaultPriority,
  SUBMISSION_SCHEMA_VERSION,
  submissionId,
  type Submission,
  type SubmissionPriority,
} from "../intake/submission.js";
import { isActionable, type QaTicket } from "./ticket.js";

/**
 * Map severity and promotion onto a priority.
 *
 * Severity alone is not enough: a reproduced S2 is more urgent than a corroborated S2,
 * because a reproduction is a fact and corroboration is still an inference. Promotion
 * therefore lifts a ticket by one band, and nothing lifts above P0.
 */
export function ticketPriority(ticket: QaTicket): SubmissionPriority {
  const bySeverity: Record<QaTicket["severity"], SubmissionPriority> = {
    S4: "P0",
    S3: "P1",
    S2: "P2",
    S1: "P3",
    S0: "P3",
  };
  const base = bySeverity[ticket.severity];
  if (ticket.promotion !== "verified") return base;
  const lifted: Record<SubmissionPriority, SubmissionPriority> = {
    P0: "P0",
    P1: "P0",
    P2: "P1",
    P3: "P2",
  };
  return lifted[base];
}

function ticketBody(ticket: QaTicket): string {
  const excerpts =
    ticket.excerpts.length > 0
      ? `\n\n**What players said**\n${ticket.excerpts.map((e) => `- ${e}`).join("\n")}`
      : "";
  const tiers = ticket.evidence.tiers.join(" + ") || "unknown";
  const attested = ticket.evidence.has_runner_enforced_report
    ? ""
    : "\n\n> Every supporting session is operator-attested; no runner-proven run backs this yet.";
  return (
    `Promoted from playtest triage (\`${ticket.promotion}\`).\n\n` +
    `**Where** \`${ticket.location}\`\n` +
    `**Severity** \`${ticket.severity}\` · **Reports** ${ticket.evidence.report_count} · ` +
    `**Lineages** ${ticket.evidence.families.join(", ") || "none"} · **Tiers** ${tiers}\n` +
    `**First seen** build \`${ticket.evidence.first_seen_build.slice(0, 12)}\` · ` +
    `**Last seen** build \`${ticket.evidence.last_seen_build.slice(0, 12)}\`` +
    excerpts +
    attested
  );
}

export function submissionFromTicket(ticket: QaTicket): Submission {
  const now = new Date().toISOString();
  const kind = ticket.kind === "bug" ? "bug" : "experience";
  return {
    schema_version: SUBMISSION_SCHEMA_VERSION,
    id: submissionId({ source: "playtest", kind, key: ticket.ticket_id }),
    title: ticket.title,
    body: ticketBody(ticket),
    source: "playtest",
    kind,
    priority: ticketPriority(ticket),
    status: "open",
    labels: [ticket.promotion],
    area: ticket.location,
    evidence: {
      summary:
        `${ticket.evidence.report_count} report(s) across ` +
        `${ticket.evidence.families.length} independent lineage(s), ` +
        `tiers ${ticket.evidence.tiers.join("+") || "unknown"}.`,
      refs: ticket.evidence.session_ids.slice(0, 20),
      lineages: ticket.evidence.families,
      observations: ticket.evidence.report_count,
    },
    created_at: now,
    updated_at: now,
    external: null,
  };
}

/** Only what triage judged actionable becomes queued work. */
export function submissionsFromTickets(tickets: readonly QaTicket[]): Submission[] {
  return tickets.filter(isActionable).map(submissionFromTicket);
}

/** Kept for callers that want the default without a ticket in hand. */
export const PLAYTEST_DEFAULT_PRIORITY = defaultPriority("playtest", "bug");
