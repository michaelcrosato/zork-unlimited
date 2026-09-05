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
import { canonicalize } from "../core/hash.js";
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
  type TicketEvidence,
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
): { records: IssueRecord[]; confusionKeys: Set<string> } {
  const records: IssueRecord[] = [];
  const confusionKeys = new Set<string>();
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
      confusionKeys.add(issueKey(session.record_id, confusion));
    }
  }
  return { records, confusionKeys };
}

/**
 * Identity of one reported issue within the corpus, used only to remember which records
 * came from the interview's `confusions` list rather than its `bugs` list.
 *
 * Keyed on content (session id plus the reported text) rather than on object identity,
 * because the records travel through `clusterIssues`, which is free to copy them. Two
 * records can only collide when a player filed a bug note whose text is character-for-
 * character their own confusion — in which case treating them alike is right anyway.
 */
function issueKey(ref: string, text: string): string {
  return `${ref}\u0000${text}`;
}

/** Stable, human-readable location label for a ticket. */
function locationLabel(location: CanonicalLocation): string {
  return (
    location.sceneId ??
    location.questId ??
    location.node ??
    location.region ??
    location.raw[0] ??
    "unmapped"
  );
}

/**
 * A reported bug is engine-shaped work; a bare confusion is experience work. Mixed
 * clusters take the stronger reading, because a cluster containing an actual defect
 * should route to whoever fixes defects.
 *
 * Which list a report came from is remembered from the interview rather than inferred
 * from its severity. Inferring it (`severity !== CONFUSION_SEVERITY`) read every S1 bug
 * as a confusion, and the exit interview lets a player file one — S1 is its "minor"
 * rung. So a cluster of nothing but minor defects was routed as experience work, and
 * because `kind` is part of `ticketId`, the ticket ALSO re-keyed itself into a second
 * piece of work the moment one S2 report joined it.
 */
function clusterKind(cluster: IssueCluster, confusionKeys: ReadonlySet<string>): TicketKind {
  const anyRealBug = cluster.issues.some(
    (issue) => !confusionKeys.has(issueKey(issue.ref, issue.text)),
  );
  return anyRealBug ? "bug" : "experience";
}

function clusterIdentity(cluster: IssueCluster, confusionKeys: ReadonlySet<string>) {
  const kind = clusterKind(cluster, confusionKeys);
  const location = locationLabel(cluster.location);
  return { kind, location, id: ticketId({ kind, location, fingerprint: cluster.key }) };
}

function clusterExcerpts(cluster: IssueCluster): string[] {
  return [...new Set(cluster.issues.map((issue) => issue.text))].slice(0, 5);
}

function clusterEvidence(
  cluster: IssueCluster,
  sessionById: ReadonlyMap<string, PlaytestSessionRecord>,
  currentBuild: string | null,
): TicketEvidence {
  const contributing = cluster.issues
    .map((issue) => sessionById.get(issue.ref))
    .filter((s): s is PlaytestSessionRecord => s !== undefined);
  // Sorted so the result depends on the evidence set, never its arrival order.
  const times = contributing.map((s) => s.recorded_at).sort();
  const builds = contributing.map((s) => ({ at: s.recorded_at, build: s.build.git_commit }));
  builds.sort((a, b) => a.at.localeCompare(b.at));
  return {
    report_count: cluster.issues.length,
    families: [...new Set(contributing.map((s) => s.provider.family))].sort(),
    providers: [...new Set(contributing.map((s) => s.provider.id))].sort(),
    tiers: (["reference", "volume"] as const).filter((tier) =>
      contributing.some((s) => s.model.tier === tier),
    ),
    has_runner_enforced_report: contributing.some(
      (s) => s.provider.isolation === "runner_enforced",
    ),
    session_ids: [...new Set(contributing.map((s) => s.record_id))].sort(),
    first_seen_build: builds[0]?.build ?? currentBuild ?? "unknown",
    last_seen_build: builds.at(-1)?.build ?? currentBuild ?? "unknown",
    first_seen_at: times[0] ?? new Date(0).toISOString(),
    last_seen_at: times.at(-1) ?? new Date(0).toISOString(),
  };
}

/**
 * Migrate only the proven v1 region-key collision. A partial corpus cannot tell us
 * what an unmatched ticket became. Require every original session, then reproduce
 * its exact old identity, evidence and excerpts with only the region discriminator
 * removed. Keep the predecessor as history; never spread its promotion across a split.
 */
function legacyRegionReplacements(
  existing: ReadonlyMap<string, QaTicket>,
  clusters: readonly IssueCluster[],
  confusionKeys: ReadonlySet<string>,
  sessionById: ReadonlyMap<string, PlaytestSessionRecord>,
  currentBuild: string | null,
): Map<string, string[]> {
  const replacements = new Map<string, string[]>();
  const legacyIssues: IssueRecord[] = [];
  const successorByIssue = new Map<string, string>();
  const currentIds = new Set<string>();
  for (const cluster of clusters) {
    const { id } = clusterIdentity(cluster, confusionKeys);
    currentIds.add(id);
    for (const issue of cluster.issues) {
      const location = issue.location;
      if (location.kind !== "overworld" || location.node !== null || location.region === null)
        continue;
      const legacy = { ...issue, location: { ...location, region: null } };
      legacyIssues.push(legacy);
      // Full issue identity, not just its session: a player may report several regions.
      successorByIssue.set(canonicalize(legacy), id);
    }
  }
  if (legacyIssues.length === 0) return replacements;

  for (const prior of existing.values()) {
    if (prior.schema_version !== 1 || prior.superseded_by || currentIds.has(prior.ticket_id))
      continue;
    const sessions = new Set(prior.evidence.session_ids);
    if (![...sessions].every((id) => sessionById.has(id))) continue;
    const legacy = clusterIssues(legacyIssues.filter((issue) => sessions.has(issue.ref))).find(
      (cluster) => clusterIdentity(cluster, confusionKeys).id === prior.ticket_id,
    );
    if (
      !legacy ||
      clusterKind(legacy, confusionKeys) !== prior.kind ||
      locationLabel(legacy.location) !== prior.location ||
      legacy.maxSeverity !== prior.severity ||
      canonicalize(clusterEvidence(legacy, sessionById, currentBuild)) !==
        canonicalize(prior.evidence) ||
      canonicalize(clusterExcerpts(legacy)) !== canonicalize(prior.excerpts)
    )
      continue;
    const successors = [
      ...new Set(legacy.issues.map((issue) => successorByIssue.get(canonicalize(issue))!)),
    ].sort();
    replacements.set(prior.ticket_id, successors);
  }
  return replacements;
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

/**
 * Whether a ticket the current corpus says nothing about may leave the bucket.
 *
 * Every condition here is a way of asking "is there anything in this file that
 * re-triage could not reproduce?", and retirement happens only when the answer is no:
 *
 * - `status === "stale"` is the age test, already made. A ticket only reaches `stale`
 *   by going more than `STALE_AFTER_BUILDS` builds without a fresh report while
 *   unverified, and any fresh report revives it to `open` above — so a ticket that is
 *   BOTH stale and absent from the current corpus has been silent for two independent
 *   reasons. Every other status is somebody's live position and is never touched:
 *   `wont_fix` and `verified_fixed` are decisions, `in_progress` and `fixed` are work
 *   underway, `open` is the queue itself.
 * - No `notes`. Notes are the one free-text field a human writes and nothing can
 *   regenerate. A ticket carrying them is kept whatever its status.
 * - No supersession links. A replaced identity is kept as history so its prior
 *   decision and the reason it left the work queue remain inspectable together.
 * - Nothing else in the file is authored. `ticket_id` is derived from the cluster's
 *   stable identity and `evidence` is recomputed from the contributing sessions on
 *   every run, so if the finding recurs, triage rebuilds a byte-identical ticket under
 *   the same filename — retirement costs a recurrence nothing.
 *
 * What it does cost is the audit trail of a finding nobody acted on, and that is a
 * deliberate trade rather than an oversight: the retired file stays in Git history,
 * which is where AGENTS.md ("Token Economy") already puts old detail, and a bucket
 * nobody can read past is worse than one that forgets what it was never asked to
 * remember.
 */
function isRetireable(ticket: QaTicket): boolean {
  return ticket.status === "stale" && ticket.notes === undefined && !ticket.superseded_by;
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
    /** Historical identities replaced by an exact evidence-backed migration. */
    superseded: number;
    /** Aged-out, undecided tickets dropped from the bucket this run. See `isRetireable`. */
    retired: number;
  };
};

export function triagePlaytestCorpus(input: TriageInput): TriageResult {
  const idx = input.locationIndex;
  const verified = new Set(input.verifiedTicketIds ?? []);
  const existing = new Map((input.existingTickets ?? []).map((t) => [t.ticket_id, t]));
  const currentBuild = input.buildHistory[0] ?? null;

  const sessionById = new Map(input.sessions.map((s) => [s.record_id, s]));
  const { records: issues, confusionKeys } = sessionIssueRecords(input.sessions, idx);
  const clusters = clusterIssues(issues);
  const replacements = legacyRegionReplacements(
    existing,
    clusters,
    confusionKeys,
    sessionById,
    currentBuild,
  );
  // Saved markers also recover workflow if a prior bucket write stopped before
  // writing the successor. Keep every marker in the ambiguity check.
  const replacementLinks = new Map<string, string[]>(
    [...existing.values()]
      .filter((ticket) => ticket.superseded_by !== undefined)
      .map((ticket) => [ticket.ticket_id, ticket.superseded_by!]),
  );
  for (const [id, successors] of replacements) replacementLinks.set(id, successors);
  const predecessors = new Map<string, QaTicket[]>();
  for (const [id, successors] of replacementLinks) {
    for (const successor of successors) {
      const priors = predecessors.get(successor) ?? [];
      priors.push(existing.get(id)!);
      predecessors.set(successor, priors);
    }
  }

  // Retirement is licensed by a corpus that actually said something. Triage runs
  // routinely against an empty or half-synced store — a fresh clone, a lane worktree,
  // a machine holding only its own shard — and in that state EVERY ticket falls to the
  // carry-forward loop below, so an unguarded rule would empty the bucket in one pass
  // and read as a corpus problem rather than a retirement policy. With no clusters,
  // triage has no basis to conclude anything went quiet, and carries everything.
  const corpusHasEvidence = clusters.length > 0;

  const tickets: QaTicket[] = [];
  for (const cluster of clusters) {
    const { kind, location, id } = clusterIdentity(cluster, confusionKeys);
    const evidence = clusterEvidence(cluster, sessionById, currentBuild);

    const isVerified = verified.has(id);
    const promotion = derivePromotion(evidence, { verified: isVerified });

    const candidates = predecessors.get(id) ?? [];
    const solePredecessor =
      candidates.length === 1 && replacementLinks.get(candidates[0]!.ticket_id)?.length === 1
        ? candidates[0]
        : undefined;
    const sameIdentity = existing.get(id);
    const prior = sameIdentity ?? solePredecessor;
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
      excerpts: clusterExcerpts(cluster),
      evidence,
      priority: scoreCluster(cluster),
      ...(prior?.notes !== undefined ? { notes: prior.notes } : {}),
      ...(sameIdentity?.superseded_by ? { superseded_by: sameIdentity.superseded_by } : {}),
    });
  }

  // Tickets that exist on disk but have no evidence in the current corpus are carried
  // forward. They were filed for a reason and the corpus may simply have been pruned,
  // re-cloned, or split across machines — dropping them would silently lose a
  // maintainer's `wont_fix` decision.
  //
  // Carrying EVERY such ticket forward unconditionally, though, made the bucket
  // monotonic: nothing ever left it. Four playtest waves left 633 tracked files in
  // `qa/tickets/`, every one of them `stale` — 27% of the repository's file count for
  // 3% of its bytes, and noise in every `ls`, `rg` and agent index, because a stale
  // ticket is by definition one the dev loop is not allowed to pick up. So a narrow
  // class retires instead; `isRetireable` states the exact conditions.
  let retired = 0;
  for (const [id, prior] of existing) {
    if (tickets.some((t) => t.ticket_id === id)) continue;
    const successors = replacements.get(id);
    if (successors) {
      tickets.push({
        ...prior,
        schema_version: QA_TICKET_SCHEMA_VERSION,
        superseded_by: successors,
      });
      continue;
    }
    if (corpusHasEvidence && isRetireable(prior)) {
      retired += 1;
      continue;
    }
    tickets.push(prior);
  }

  tickets.sort(compareTickets);
  const actionable = tickets.filter(isActionable);
  const currentTickets = tickets.filter((ticket) => !ticket.superseded_by);

  return {
    tickets,
    actionable,
    stats: {
      sessions: input.sessions.length,
      sessionsWithInterview: input.sessions.filter((s) => s.exit_interview !== null).length,
      issues: issues.length,
      clusters: clusters.length,
      verified: currentTickets.filter((t) => t.promotion === "verified").length,
      corroborated: currentTickets.filter((t) => t.promotion === "corroborated").length,
      accumulating: currentTickets.filter((t) => t.promotion === "accumulating").length,
      stale: currentTickets.filter((t) => t.status === "stale").length,
      superseded: tickets.length - currentTickets.length,
      retired,
    },
  };
}
