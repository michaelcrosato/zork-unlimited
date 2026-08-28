/**
 * Triage — turn a corpus of raw playthroughs into an ordered list of tickets.
 *
 * This is the QA lead's job, done deterministically. It reads every session record in
 * the store (including the failed and the operator-attested ones), pulls the issues out
 * of each exit interview, clusters near-duplicates through the SAME machinery the
 * feedback compiler already uses, and folds each cluster into a ticket.
 *
 * Two properties are worth stating because they are what make the split safe:
 *
 * 1. IT IS PURE AND TOTAL. No clock, no network, no model. Same corpus ⇒ same tickets,
 *    in the same order, with the same ids. The playtest loop can therefore re-triage
 *    from scratch at any moment and produce exactly what an incremental run would,
 *    which means a crashed or interrupted triage never leaves the bucket in a state
 *    nobody can reproduce.
 *
 * 2. IT NEVER INVENTS EVIDENCE. Every ticket's `session_ids` lead back to the exact
 *    playthroughs that produced it. A ticket is a summary of the corpus, never a
 *    replacement for it — which is what lets the corpus stay append-only while the
 *    bucket is rewritten freely.
 *
 * Existing tickets are merged rather than replaced: a ticket carries workflow state a
 * human or the dev loop set (`in_progress`, `wont_fix`), and re-triage must not stomp
 * that just because new evidence arrived.
 */
import { clusterIssues, type IssueCluster, type IssueRecord } from "../feedback/cluster.js";
import { scoreCluster } from "../feedback/rank.js";
import { canonicalizeLocation, type LocationIndex } from "../feedback/normalize.js";
import type { CanonicalLocation } from "../feedback/schema.js";
import type { PlaytestSessionRecord } from "./session_record.js";
import {
  compareTickets,
  derivePromotion,
  isActionable,
  QA_TICKET_SCHEMA_VERSION,
  ticketId,
  type QaTicket,
  type TicketKind,
  type TicketSeverity,
} from "./ticket.js";

/**
 * Builds a ticket has to go without a fresh report before it drops out of the dev
 * loop's view.
 *
 * This exists only because the loops were split. While every playtest ran against the
 * exact commit under test, a finding could not be stale. Now the fleet floats across
 * builds, so a ticket last seen twelve builds ago may well describe something already
 * fixed — and a dev loop that keeps picking it up burns cycles chasing ghosts.
 *
 * Eight is chosen to be comfortably longer than a cohort's flight time (a cohort that
 * starts on build N typically finishes within a build or two) so ordinary lag never
 * looks like staleness, while still expiring genuinely old reports within a day of
 * active development. Verified tickets are exempt: a reproduction does not decay
 * just because nobody happened to hit it again.
 */
export const STALE_AFTER_BUILDS = 8;

/** A confusion carries no severity of its own; rate it low rather than guess. */
const CONFUSION_SEVERITY: TicketSeverity = "S1";

export type TriageInput = {
  sessions: readonly PlaytestSessionRecord[];
  locationIndex: LocationIndex;
  /** Newest build first — the recency spine used for staleness. */
  buildHistory: readonly string[];
  /** Tickets already on disk, so workflow state and ids survive re-triage. */
  existingTickets?: readonly QaTicket[];
  /**
   * Ticket identities a non-opinionated check has reproduced (crawler findings, a
   * maintainer's repro). These promote straight to `verified`.
   */
  verifiedTicketIds?: readonly string[];
};

/**
 * One issue as reported, carrying the provenance the ranking needs.
 *
 * `ref` is the session record id rather than a filename, so a ticket's evidence trail
 * survives the corpus being republished, re-cloned, or reorganized on disk.
 */
function sessionIssueRecords(
  sessions: readonly PlaytestSessionRecord[],
  idx: LocationIndex,
): IssueRecord[] {
  const records: IssueRecord[] = [];
  for (const session of sessions) {
    const interview = session.exit_interview;
    // A session with no parseable interview is still kept in the corpus and still
    // counted in the store summary; it simply has no issues to contribute here.
    if (!interview) continue;
    const target = "overworld";
    const common = {
      source: "fleet" as const,
      ref: session.record_id,
      persona: session.persona.id,
      target,
      providerFamily: session.provider.family,
      tier: session.model.tier,
    };
    for (const bug of interview.bugs) {
      records.push({
        ...common,
        location: canonicalizeLocation(bug.where, idx),
        severity: bug.severity,
        text: bug.note,
      });
    }
    for (const confusion of interview.confusions) {
      records.push({
        ...common,
        location: canonicalizeLocation(confusion, idx),
        severity: CONFUSION_SEVERITY,
        text: confusion,
      });
    }
  }
  return records;
}

/** Stable, human-readable location label for a ticket. */
function locationLabel(location: CanonicalLocation): string {
  return location.sceneId ?? location.questId ?? location.node ?? location.raw[0] ?? "unmapped";
}

/**
 * A bug reported with a real severity is engine-shaped work; a bare confusion is
 * experience work. Mixed clusters take the stronger reading, because a cluster
 * containing an actual defect should route to whoever fixes defects.
 */
function clusterKind(cluster: IssueCluster): TicketKind {
  const anyRealBug = cluster.issues.some((issue) => issue.severity !== CONFUSION_SEVERITY);
  return anyRealBug ? "bug" : "experience";
}

/** Longest a report excerpt may run before the location suffix. */
const TITLE_EXCERPT_LIMIT = 72;

/**
 * A title a person can actually scan.
 *
 * This used to be the cluster's stemmed token bag — "action albany approach block both
 * cannot @ steading_yard". That string is a FINGERPRINT: alphabetically sorted, stemmed,
 * stripped of the words that carry the meaning. Two unrelated tickets read almost alike
 * and a real one reads as noise, which is exactly what makes a queue impossible to
 * triage by eye.
 *
 * The first report's own sentence is both readable and deterministic: `finalizeCluster`
 * sorts a cluster's issues canonically, so the chosen excerpt is a pure function of the
 * evidence set rather than of the order reports happened to arrive.
 *
 * Identity does not ride on this. `ticketId` fingerprints `cluster.key`, and a queue
 * submission keys on `ticket_id`, so rewording a title can never re-key a ticket or
 * fork it into a second piece of work.
 */
function ticketTitle(cluster: IssueCluster): string {
  const where = locationLabel(cluster.location);
  const first = (cluster.issues[0]?.text ?? "").replace(/\s+/g, " ").trim();
  // Take the first sentence when there is one, so a paragraph-long report still
  // produces a headline rather than a truncated wall.
  const sentence = first.split(/(?<=[.!?])\s/)[0] ?? first;
  const excerpt =
    sentence.length > TITLE_EXCERPT_LIMIT
      ? `${sentence.slice(0, TITLE_EXCERPT_LIMIT).replace(/\s+\S*$/, "")}…`
      : sentence;
  return excerpt.length > 0 ? `${excerpt} @ ${where}` : where;
}

/**
 * How many builds back a ticket was last seen. Returns null when the build is not in
 * the known history at all — an unrecognized build cannot be aged, and guessing would
 * expire tickets from a machine whose builds simply were not published.
 */
function buildsSince(buildHistory: readonly string[], build: string): number | null {
  const index = buildHistory.indexOf(build);
  return index === -1 ? null : index;
}

export type TriageResult = {
  tickets: QaTicket[];
  /** Tickets the dev loop may pick up right now, highest priority first. */
  actionable: QaTicket[];
  stats: {
    sessions: number;
    sessionsWithInterview: number;
    issues: number;
    clusters: number;
    verified: number;
    corroborated: number;
    accumulating: number;
    stale: number;
  };
};

export function triagePlaytestCorpus(input: TriageInput): TriageResult {
  const idx = input.locationIndex;
  const verified = new Set(input.verifiedTicketIds ?? []);
  const existing = new Map((input.existingTickets ?? []).map((t) => [t.ticket_id, t]));
  const currentBuild = input.buildHistory[0] ?? null;

  const sessionById = new Map(input.sessions.map((s) => [s.record_id, s]));
  const issues = sessionIssueRecords(input.sessions, idx);
  const clusters = clusterIssues(issues);

  const tickets: QaTicket[] = [];
  for (const cluster of clusters) {
    const kind = clusterKind(cluster);
    const location = locationLabel(cluster.location);
    const id = ticketId({ kind, location, fingerprint: cluster.key });

    const contributing = cluster.issues
      .map((issue) => sessionById.get(issue.ref))
      .filter((s): s is PlaytestSessionRecord => s !== undefined);

    // Sorted so the ticket is a pure function of its evidence set, not of iteration
    // order — two machines triaging the same corpus must produce identical files.
    const sessionIds = [...new Set(contributing.map((s) => s.record_id))].sort();
    const providers = [...new Set(contributing.map((s) => s.provider.id))].sort();
    const families = [...new Set(contributing.map((s) => s.provider.family))].sort();
    const tiers = (["reference", "volume"] as const).filter((tier) =>
      contributing.some((s) => s.model.tier === tier),
    );
    const times = contributing.map((s) => s.recorded_at).sort();
    const builds = contributing.map((s) => ({ at: s.recorded_at, build: s.build.git_commit }));
    builds.sort((a, b) => a.at.localeCompare(b.at));

    const evidence = {
      report_count: cluster.issues.length,
      families,
      providers,
      tiers,
      has_runner_enforced_report: contributing.some(
        (s) => s.provider.isolation === "runner_enforced",
      ),
      session_ids: sessionIds,
      first_seen_build: builds[0]?.build ?? currentBuild ?? "unknown",
      last_seen_build: builds.at(-1)?.build ?? currentBuild ?? "unknown",
      first_seen_at: times[0] ?? new Date(0).toISOString(),
      last_seen_at: times.at(-1) ?? new Date(0).toISOString(),
    };

    const isVerified = verified.has(id);
    const promotion = derivePromotion(evidence, { verified: isVerified });

    const prior = existing.get(id);
    // Preserve workflow state a human or the dev loop set. Re-triage owns the
    // evidence and the promotion rung; it does not own whether someone is already
    // working on this or has decided not to.
    let status = prior?.status ?? "open";
    if (status === "stale") status = "open"; // fresh evidence revives a stale ticket
    if (status === "open" || status === "in_progress") {
      const age = buildsSince(input.buildHistory, evidence.last_seen_build);
      if (!isVerified && age !== null && age > STALE_AFTER_BUILDS) status = "stale";
    }

    tickets.push({
      schema_version: QA_TICKET_SCHEMA_VERSION,
      ticket_id: id,
      title: ticketTitle(cluster),
      kind,
      severity: cluster.maxSeverity,
      status,
      promotion,
      location,
      excerpts: [...new Set(cluster.issues.map((issue) => issue.text))].slice(0, 5),
      evidence,
      priority: scoreCluster(cluster),
      ...(prior?.notes !== undefined ? { notes: prior.notes } : {}),
    });
  }

  // Tickets that exist on disk but have no evidence in the current corpus are carried
  // forward untouched. They were filed for a reason and the corpus may simply have been
  // pruned, re-cloned, or split across machines — dropping them would silently lose a
  // maintainer's `wont_fix` decision.
  for (const [id, prior] of existing) {
    if (!tickets.some((t) => t.ticket_id === id)) tickets.push(prior);
  }

  tickets.sort(compareTickets);
  const actionable = tickets.filter(isActionable);

  return {
    tickets,
    actionable,
    stats: {
      sessions: input.sessions.length,
      sessionsWithInterview: input.sessions.filter((s) => s.exit_interview !== null).length,
      issues: issues.length,
      clusters: clusters.length,
      verified: tickets.filter((t) => t.promotion === "verified").length,
      corroborated: tickets.filter((t) => t.promotion === "corroborated").length,
      accumulating: tickets.filter((t) => t.promotion === "accumulating").length,
      stale: tickets.filter((t) => t.status === "stale").length,
    },
  };
}
