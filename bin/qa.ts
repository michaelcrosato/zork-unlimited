#!/usr/bin/env -S npx tsx
/**
 * Read the QA bucket — what the playtest side has promoted for the dev loop to build.
 *
 * Deliberately read-only and deliberately incapable of failing a cycle. `loop.sh` calls
 * this for its cycle log; an empty bucket is normal and must never look like an error,
 * because "nothing corroborated yet" is the resting state of a healthy QA pipeline, not
 * a fault. Tickets are filled in by `npm run qa:triage`.
 *
 * Usage:
 *   npm run qa:bucket -- --summary        counts plus the top ticket
 *   npm run qa:bucket -- --next           just the highest-priority actionable ticket
 *   npm run qa:bucket -- --all            every ticket, ordered
 *   npm run qa:bucket -- --json           machine-readable
 */
import { DEFAULT_TICKET_DIR, isActionable, type QaTicket } from "../src/qa/ticket.js";
import { readTickets, summarizeBucket } from "../src/qa/ticket_store.js";

function argValue(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function line(ticket: QaTicket): string {
  const support =
    ticket.evidence.families.length > 0
      ? `${ticket.evidence.report_count} report(s) / ${ticket.evidence.families.length} lineage(s): ${ticket.evidence.families.join("+")}`
      : `${ticket.evidence.report_count} report(s)`;
  return (
    `  ${ticket.severity} ${ticket.promotion.padEnd(13)} ${ticket.ticket_id}  ${ticket.title}\n` +
    `        ${support}; tiers ${ticket.evidence.tiers.join("+") || "unknown"}; priority ${ticket.priority.toFixed(1)}`
  );
}

function main(): void {
  const dir = argValue("--dir", DEFAULT_TICKET_DIR);
  const { tickets, unreadable } = readTickets(dir);
  for (const bad of unreadable) console.error(`! unreadable ticket ${bad.file}: ${bad.reason}`);

  const summary = summarizeBucket(tickets);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ summary, tickets }, null, 2));
    return;
  }

  if (process.argv.includes("--next")) {
    if (!summary.next) {
      console.log("QA bucket: nothing actionable.");
      return;
    }
    console.log(line(summary.next));
    return;
  }

  const listed = process.argv.includes("--all") ? tickets : tickets.filter(isActionable);

  if (summary.total === 0) {
    console.log(
      `QA bucket (${dir}): empty. The dev loop proceeds on assessor candidates — an empty bucket is not a stall.`,
    );
    return;
  }

  console.log(
    `QA bucket (${dir}): ${summary.actionable} actionable of ${summary.total} ticket(s).`,
  );
  const parts = Object.entries(summary.byPromotion)
    .sort()
    .map(([key, count]) => `${key} ${count}`);
  console.log(`  promotion: ${parts.join(", ")}`);

  if (listed.length === 0) {
    console.log("  nothing actionable yet — reports are accumulating, waiting on corroboration.");
    return;
  }
  for (const ticket of listed.slice(0, process.argv.includes("--summary") ? 5 : listed.length)) {
    console.log(line(ticket));
  }
  if (process.argv.includes("--summary") && listed.length > 5) {
    console.log(`  … and ${listed.length - 5} more (--all to list).`);
  }
}

main();
