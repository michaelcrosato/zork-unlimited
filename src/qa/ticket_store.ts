/**
 * Reading and writing the QA bucket (`qa/tickets/`).
 *
 * Unlike the session corpus, tickets ARE tracked in git. That is deliberate: the bucket
 * is the dev loop's inbox, the dev loop runs against a checkout, and a ticket that only
 * exists on the QA machine is a ticket the dev loop cannot act on. Keeping them in the
 * repo also means a ticket's whole life — filed, worked, fixed — is visible in history
 * next to the commits that closed it.
 *
 * One ticket per file, named by severity and id, so a plain `ls` is already a triaged
 * queue and two people editing different tickets never conflict.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  compareTickets,
  DEFAULT_TICKET_DIR,
  isActionable,
  QaTicketSchema,
  ticketFileName,
  type QaTicket,
} from "./ticket.js";

export function readTickets(dir: string = DEFAULT_TICKET_DIR): {
  tickets: QaTicket[];
  unreadable: { file: string; reason: string }[];
} {
  const root = resolve(dir);
  const tickets: QaTicket[] = [];
  const unreadable: { file: string; reason: string }[] = [];
  if (!existsSync(root)) return { tickets, unreadable };

  for (const name of readdirSync(root).sort()) {
    if (!name.endsWith(".json")) continue;
    const file = join(root, name);
    try {
      tickets.push(QaTicketSchema.parse(JSON.parse(readFileSync(file, "utf8"))));
    } catch (error) {
      // Surfaced, never skipped silently: a malformed ticket is work the dev loop is
      // not seeing, which is exactly the kind of quiet gap this whole split could
      // otherwise introduce.
      unreadable.push({ file, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  tickets.sort(compareTickets);
  return { tickets, unreadable };
}

/**
 * Write the bucket, replacing it wholesale.
 *
 * Safe to do because a ticket's id is derived from its stable identity, so rewriting
 * regenerates the same filenames for the same problems. Files for tickets no longer
 * present are removed — but note that triage carries unmatched prior tickets forward
 * precisely so this removal only ever drops something a caller deliberately dropped.
 */
export function writeTickets(tickets: readonly QaTicket[], dir: string = DEFAULT_TICKET_DIR): void {
  const root = resolve(dir);
  mkdirSync(root, { recursive: true });

  const wanted = new Map(tickets.map((ticket) => [ticketFileName(ticket), ticket]));
  for (const name of readdirSync(root)) {
    if (name.endsWith(".json") && !wanted.has(name)) rmSync(join(root, name));
  }
  for (const [name, ticket] of wanted) {
    writeFileSync(join(root, name), `${JSON.stringify(ticket, null, 2)}\n`, "utf8");
  }
}

export type BucketSummary = {
  total: number;
  actionable: number;
  byStatus: Record<string, number>;
  byPromotion: Record<string, number>;
  bySeverity: Record<string, number>;
  next: QaTicket | null;
};

export function summarizeBucket(tickets: readonly QaTicket[]): BucketSummary {
  const bump = (table: Record<string, number>, key: string): void => {
    table[key] = (table[key] ?? 0) + 1;
  };
  const byStatus: Record<string, number> = {};
  const byPromotion: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const ticket of tickets) {
    bump(byStatus, ticket.status);
    bump(byPromotion, ticket.promotion);
    bump(bySeverity, ticket.severity);
  }
  const actionable = tickets.filter(isActionable);
  return {
    total: tickets.length,
    actionable: actionable.length,
    byStatus,
    byPromotion,
    bySeverity,
    next: actionable[0] ?? null,
  };
}
