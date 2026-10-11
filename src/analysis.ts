import { fisherGreater } from "./stats.js";
import type { AxisName, Classification, Evidence, Finding, Strength } from "./types.js";

export interface Variant {
  /** Human value, e.g. "TZ=Asia/Kolkata" or "seed 3". */
  value: string;
  ev: Evidence;
  /** True for the unperturbed reference condition. */
  reference?: boolean;
}

const fails = (e: Evidence) => e.runs > 0 && e.failed === e.runs;
const passes = (e: Evidence) => e.runs > 0 && e.failed === 0;
const mixed = (e: Evidence) => e.runs > 0 && !fails(e) && !passes(e);

export function counts(e: Evidence): string {
  return `${e.failed}/${e.runs}`;
}

function list(vs: Variant[]): string {
  return vs.map((v) => `${v.value} (${counts(v.ev)} failed)`).join(", ");
}

export interface VariantVerdict {
  strength: Strength;
  failing: Variant[];
  passing: Variant[];
  mixedOnes: Variant[];
}

/**
 * Decide whether a set of perturbed conditions flips the outcome.
 *
 * deterministic: at least one value always fails and another always passes
 *   (the reference counts as a value), and no perturbed value is mixed.
 * elevated: otherwise, perturbed values fail significantly more often than
 *   the reference (one-sided Fisher exact test, p < 0.05).
 */
export function judgeVariants(variants: Variant[], alpha = 0.05): VariantVerdict {
  const failing = variants.filter((v) => fails(v.ev));
  const passing = variants.filter((v) => passes(v.ev));
  const mixedOnes = variants.filter((v) => !v.reference && mixed(v.ev));
  const perturbedInFlip = [...failing, ...passing].some((v) => !v.reference);
  if (failing.length > 0 && passing.length > 0 && perturbedInFlip && mixedOnes.length === 0) {
    return { strength: "deterministic", failing, passing, mixedOnes };
  }
  // Anything short of a clean flip has to beat the reference statistically;
  // otherwise a test that is randomly flaky for another reason would get
  // blamed on whichever value happened to fail twice in a row.
  const ref = variants.find((v) => v.reference);
  const perturbed = variants.filter((v) => !v.reference);
  if (ref && perturbed.length > 0) {
    const pf = perturbed.reduce((s, v) => s + v.ev.failed, 0);
    const pr = perturbed.reduce((s, v) => s + v.ev.runs, 0);
    if (pr > 0 && pf / pr > ref.ev.failed / Math.max(1, ref.ev.runs) && fisherGreater(pf, pr, ref.ev.failed, ref.ev.runs) < alpha) {
      return { strength: "elevated", failing, passing, mixedOnes };
    }
  }
  return { strength: "none", failing, passing, mixedOnes };
}

const AXIS_NOUN: Record<AxisName, string> = {
  order: "test order",
  parallel: "parallelism",
  timezone: "timezone",
  locale: "locale",
  seed: "random seed",
  clock: "system clock",
  cpu: "CPU speed",
};

/** One-sentence summary for an environment-style axis. */
export function summarise(axis: AxisName, verdict: VariantVerdict, variants: Variant[]): string {
  const { strength, failing, passing, mixedOnes } = verdict;
  if (strength === "none") return `no effect from ${AXIS_NOUN[axis]} (${variants.length} conditions)`;
  if (failing.length > 0 && passing.length > 0) {
    if (axis === "seed") {
      const f = failing.filter((v) => !v.reference);
      const p = passing.filter((v) => !v.reference);
      if (f.length > 0 && p.length > 0) {
        return `outcome is decided by the random seed: fails with ${f.map((v) => v.value).join(", ")}, passes with ${p
          .map((v) => v.value)
          .join(", ")} (each seed gave the same result on every run)`;
      }
    }
    // Lead with what breaks it, unless the unperturbed run is the one failing.
    const refFails = failing.some((v) => v.reference);
    const lead = refFails ? `passes only under ${list(passing)}` : `fails under ${list(failing)}`;
    const rest = refFails ? `fails under ${list(failing)}` : `passes under ${list(passing)}`;
    const extra = mixedOnes.length ? `; mixed under ${list(mixedOnes)}` : "";
    return `${lead}; ${rest}${extra}`;
  }
  const perturbed = variants.filter((v) => !v.reference);
  const ref = variants.find((v) => v.reference);
  return `${AXIS_NOUN[axis]} raises the failure rate: ${list(perturbed)} vs ${ref ? list([ref]) : "baseline"}`;
}

const FLAKY_AXES: AxisName[] = ["order", "seed", "cpu", "parallel"];

export function classify(
  isolated: Evidence,
  suite: Evidence,
  findings: Finding[],
): Classification {
  const real = findings.filter((f) => f.strength === "deterministic" || f.strength === "elevated");
  const anyFailure =
    isolated.failed > 0 || suite.failed > 0 || findings.some((f) => f.evidence.some((e) => e.failed > 0));
  if (!anyFailure) return "not-reproduced";
  const baselineMixed = mixed(isolated) || mixed(suite);
  if (real.length === 0) {
    if (baselineMixed) return "flaky-unexplained";
    if (fails(isolated) && fails(suite)) return "broken";
    return "flaky-unexplained";
  }
  if (real.some((f) => FLAKY_AXES.includes(f.axis)) || baselineMixed) return "flaky";
  return "environment-dependent";
}

const STRENGTH_RANK: Record<Strength, number> = { deterministic: 0, elevated: 1, none: 2, skipped: 3 };
const AXIS_RANK: AxisName[] = ["order", "seed", "timezone", "clock", "locale", "cpu", "parallel"];

export function rankFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength] || AXIS_RANK.indexOf(a.axis) - AXIS_RANK.indexOf(b.axis),
  );
}

export function headline(classification: Classification, findings: Finding[], isolated: Evidence, suite: Evidence): string {
  const top = rankFindings(findings).find((f) => f.strength === "deterministic" || f.strength === "elevated");
  if (top) return top.summary;
  switch (classification) {
    case "not-reproduced":
      return `never failed in ${isolated.runs + suite.runs} baseline runs or under any perturbation`;
    case "broken":
      return `fails every time (${counts(isolated)} alone, ${counts(suite)} with its neighbours) and no perturbation makes it pass`;
    default:
      return `fails intermittently (${counts(isolated)} alone, ${counts(suite)} with its neighbours) but no tested factor explains it`;
  }
}
