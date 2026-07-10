/**
 * Experience metrics + sycophancy telemetry — also NO LLM anywhere in this
 * path. Everything here is arithmetic over already-verified `ExitInterview`
 * records (report_verifier.ts / exit_interview.ts already gated these before
 * they ever reach this module).
 *
 * `zero_negative` (an interview reporting NO bugs and NO confusions at all)
 * is the sycophancy signal: a tester persona that reports zero_negative on
 * nearly everything is suspiciously agreeable rather than genuinely
 * bug-free, and this module measures that rate directly rather than
 * censoring or reweighting it — the whole point is to surface it.
 *
 * Histograms are 5-bucket (index i = count of score i+1) over the 1-5
 * clarity/enjoyment scale. Mean/stddev use the POPULATION formula (divide by
 * N, not N-1): each call's interview set is the entire population being
 * measured for that target/run, not a sample drawn from a larger one.
 *
 * Grouping keys (`target`, `by_persona`'s persona) are sorted ascending
 * before being turned into arrays/records, so output ordering never depends
 * on input array order — consistent with the rest of the feedback compiler.
 */
import type { ExitInterview } from "../blind/exit_interview.js";
import type { SycophancyTelemetry, TargetMetrics } from "./schema.js";

export type TargetInterview = { target: string; persona: string | null; interview: ExitInterview };
export type PersonaInterview = { persona: string | null; interview: ExitInterview };

function isZeroNegative(interview: ExitInterview): boolean {
  return interview.bugs.length === 0 && interview.confusions.length === 0;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function rate(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

function histogramOf1to5(values: readonly number[]): number[] {
  const histogram = [0, 0, 0, 0, 0];
  for (const value of values) {
    if (value >= 1 && value <= 5) histogram[value - 1] = (histogram[value - 1] ?? 0) + 1;
  }
  return histogram;
}

function summarizeScale(values: readonly number[]): {
  mean: number;
  stddev: number;
  histogram: number[];
} {
  const histogram = histogramOf1to5(values);
  const m = mean(values);
  const variance = values.length === 0 ? 0 : mean(values.map((v) => (v - m) ** 2));
  return { mean: m, stddev: Math.sqrt(variance), histogram };
}

function groupBy<T, K extends string>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

function sortedKeys<K extends string>(groups: Map<K, unknown>): K[] {
  return [...groups.keys()].sort();
}

export function targetMetrics(interviews: TargetInterview[]): TargetMetrics[] {
  const byTarget = groupBy(interviews, (rec) => rec.target);

  return sortedKeys(byTarget).map((target) => {
    const records = byTarget.get(target)!;
    const clarity = summarizeScale(records.map((r) => r.interview.clarity));
    const enjoyment = summarizeScale(records.map((r) => r.interview.enjoyment));
    const gotStuckCount = records.filter((r) => r.interview.got_stuck).length;
    const wouldReplayCount = records.filter((r) => r.interview.would_replay).length;

    const byPersona = groupBy(
      records.filter((r): r is TargetInterview & { persona: string } => r.persona !== null),
      (r) => r.persona,
    );
    const by_persona = Object.fromEntries(
      sortedKeys(byPersona).map((persona) => {
        const personaRecords = byPersona.get(persona)!;
        const zeroNegCount = personaRecords.filter((r) => isZeroNegative(r.interview)).length;
        return [
          persona,
          {
            reports: personaRecords.length,
            clarity_mean: mean(personaRecords.map((r) => r.interview.clarity)),
            enjoyment_mean: mean(personaRecords.map((r) => r.interview.enjoyment)),
            zero_negative_rate: rate(zeroNegCount, personaRecords.length),
          },
        ] as const;
      }),
    );

    return {
      target,
      reports: records.length,
      clarity,
      enjoyment,
      got_stuck_rate: rate(gotStuckCount, records.length),
      would_replay_rate: rate(wouldReplayCount, records.length),
      by_persona,
    };
  });
}

export function sycophancyTelemetry(interviews: PersonaInterview[]): SycophancyTelemetry {
  const clarity = summarizeScale(interviews.map((r) => r.interview.clarity));
  const enjoyment = summarizeScale(interviews.map((r) => r.interview.enjoyment));
  const zeroNegCount = interviews.filter((r) => isZeroNegative(r.interview)).length;

  const byPersona = groupBy(
    interviews.filter((r): r is PersonaInterview & { persona: string } => r.persona !== null),
    (r) => r.persona,
  );
  const by_persona_zero_negative = Object.fromEntries(
    sortedKeys(byPersona).map((persona) => {
      const personaRecords = byPersona.get(persona)!;
      const zeroNeg = personaRecords.filter((r) => isZeroNegative(r.interview)).length;
      return [persona, rate(zeroNeg, personaRecords.length)];
    }),
  );

  return {
    reports: interviews.length,
    zero_negative_rate: rate(zeroNegCount, interviews.length),
    clarity_histogram: clarity.histogram,
    enjoyment_histogram: enjoyment.histogram,
    by_persona_zero_negative,
  };
}
