/** Small, dependency-free statistics used to decide whether a factor matters. */

function logFactorial(n: number): number {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}

function hypergeom(a: number, b: number, c: number, d: number): number {
  const n = a + b + c + d;
  return Math.exp(
    logFactorial(a + b) + logFactorial(c + d) + logFactorial(a + c) + logFactorial(b + d) -
      logFactorial(n) - logFactorial(a) - logFactorial(b) - logFactorial(c) - logFactorial(d),
  );
}

/**
 * One-sided Fisher exact test: probability of seeing at least `failA` failures
 * in group A if failures were spread evenly across both groups.
 */
export function fisherGreater(failA: number, runsA: number, failB: number, runsB: number): number {
  if (failA === 0) return 1;
  const totalFail = failA + failB;
  let p = 0;
  for (let a = failA; a <= Math.min(runsA, totalFail); a++) {
    const b = runsA - a;
    const c = totalFail - a;
    const d = runsB - c;
    if (b < 0 || c < 0 || d < 0) continue;
    p += hypergeom(a, b, c, d);
  }
  // Clamp: summing many tiny floats can drift just above 1.
  return Math.min(1, p);
}

export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const s = [...values].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

/** Wilson score interval for a binomial proportion (95%). */
export function wilson(failed: number, runs: number): [number, number] {
  if (runs === 0) return [0, 1];
  const z = 1.96;
  const p = failed / runs;
  const denom = 1 + (z * z) / runs;
  const centre = (p + (z * z) / (2 * runs)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / runs + (z * z) / (4 * runs * runs))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}
