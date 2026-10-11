import { describe, expect, it } from "vitest";
import { fisherGreater, median, wilson } from "../../src/stats.js";

describe("fisherGreater", () => {
  it("matches scipy.stats.fisher_exact(alternative='greater')", () => {
    // scipy: fisher_exact([[6, 0], [0, 6]], alternative="greater").pvalue == 0.0010822510822510823
    expect(fisherGreater(6, 6, 0, 6)).toBeCloseTo(0.0010822510822510823, 12);
    // fisher_exact([[3, 3], [0, 6]], alternative="greater").pvalue == 0.09090909090909091
    expect(fisherGreater(3, 6, 0, 6)).toBeCloseTo(0.09090909090909091, 12);
    // fisher_exact([[2, 2], [0, 3]], alternative="greater").pvalue == 0.2857142857142857
    expect(fisherGreater(2, 4, 0, 3)).toBeCloseTo(0.2857142857142857, 12);
  });

  it("is 1 when group A has no failures", () => {
    expect(fisherGreater(0, 5, 3, 5)).toBe(1);
  });
});

describe("median", () => {
  it("handles odd, even and empty inputs", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeUndefined();
  });
});

describe("wilson", () => {
  it("gives a sensible 95% interval", () => {
    const [lo, hi] = wilson(10, 10);
    expect(lo).toBeCloseTo(0.7225, 3);
    expect(hi).toBe(1);
    expect(wilson(0, 0)).toEqual([0, 1]);
  });
});
