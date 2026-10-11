import { describe, expect, it } from "vitest";
import { classify, headline, judgeVariants, rankFindings, summarise, type Variant } from "../../src/analysis.js";
import type { Evidence, Finding } from "../../src/types.js";

const ev = (failed: number, runs: number, label = "x"): Evidence => ({ label, failed, runs });
const ref = (failed: number, runs: number): Variant => ({ value: "baseline", ev: ev(failed, runs), reference: true });
const v = (value: string, failed: number, runs: number): Variant => ({ value, ev: ev(failed, runs) });

describe("judgeVariants", () => {
  it("calls a clean flip deterministic", () => {
    expect(judgeVariants([ref(0, 3), v("A", 2, 2), v("B", 0, 2)]).strength).toBe("deterministic");
  });

  it("does not call a flip with mixed values a finding unless it is significant", () => {
    // From a real run: a seed-flaky test looked "timezone dependent" by chance.
    const noise = [ref(1, 3), v("TZ=America/Los_Angeles", 0, 2), v("TZ=Asia/Kolkata", 2, 2), v("TZ=Pacific/Auckland", 1, 2), v("TZ=Pacific/Kiritimati", 0, 2)];
    expect(judgeVariants(noise).strength).toBe("none");
    const real = [ref(0, 6), v("A", 4, 4), v("B", 3, 4), v("C", 4, 4)];
    expect(judgeVariants(real).strength).toBe("elevated");
  });

  it("ignores a flip that only involves the reference", () => {
    expect(judgeVariants([ref(3, 3)]).strength).toBe("none");
  });

  it("uses Fisher's test when nothing flips cleanly", () => {
    const variants = [ref(0, 10), v("A", 3, 4), v("B", 3, 4), v("C", 3, 4)];
    expect(judgeVariants(variants).strength).toBe("elevated");
    expect(judgeVariants([ref(1, 4), v("A", 1, 2), v("B", 1, 2)]).strength).toBe("none");
  });

  it("says no effect when everything passes", () => {
    expect(judgeVariants([ref(0, 3), v("A", 0, 2)]).strength).toBe("none");
  });
});

describe("summarise", () => {
  it("leads with the shorter list", () => {
    const variants = [ref(0, 3), v("TZ=Asia/Kolkata", 2, 2), v("TZ=UTC", 0, 2), v("TZ=America/Los_Angeles", 0, 2)];
    const s = summarise("timezone", judgeVariants(variants), variants);
    expect(s.startsWith("fails under TZ=Asia/Kolkata (2/2 failed)")).toBe(true);
  });

  it("phrases seed findings around the seed", () => {
    const variants = [ref(1, 3), v("seed 1", 0, 2), v("seed 2", 2, 2), v("seed 3", 0, 2)];
    expect(summarise("seed", judgeVariants(variants), variants)).toContain("decided by the random seed: fails with seed 2");
  });
});

describe("classify", () => {
  const f = (axis: Finding["axis"], strength: Finding["strength"]): Finding => ({
    axis,
    strength,
    summary: "",
    evidence: strength === "deterministic" ? [ev(2, 2)] : [],
  });

  it("separates environment dependence from flakiness", () => {
    expect(classify(ev(0, 3), ev(0, 3), [f("timezone", "deterministic")])).toBe("environment-dependent");
    expect(classify(ev(0, 3), ev(3, 3), [f("order", "deterministic")])).toBe("flaky");
    expect(classify(ev(1, 3), ev(0, 3), [f("timezone", "deterministic")])).toBe("flaky");
  });

  it("handles the no-finding cases", () => {
    expect(classify(ev(0, 3), ev(0, 3), [f("seed", "none")])).toBe("not-reproduced");
    expect(classify(ev(3, 3), ev(3, 3), [f("seed", "none")])).toBe("broken");
    expect(classify(ev(1, 3), ev(0, 3), [f("seed", "none")])).toBe("flaky-unexplained");
  });
});

describe("rankFindings / headline", () => {
  it("puts deterministic findings first and order before environment", () => {
    const fs: Finding[] = [
      { axis: "timezone", strength: "elevated", summary: "tz", evidence: [] },
      { axis: "cpu", strength: "deterministic", summary: "cpu", evidence: [] },
      { axis: "order", strength: "deterministic", summary: "order", evidence: [] },
      { axis: "clock", strength: "skipped", summary: "", evidence: [] },
    ];
    expect(rankFindings(fs).map((x) => x.axis)).toEqual(["order", "cpu", "timezone", "clock"]);
    expect(headline("flaky", fs, ev(0, 3), ev(3, 3))).toBe("order");
  });

  it("explains itself when nothing was found", () => {
    expect(headline("not-reproduced", [], ev(0, 3), ev(0, 3))).toContain("never failed in 6 baseline runs");
    expect(headline("flaky-unexplained", [], ev(1, 3), ev(0, 3))).toContain("no tested factor explains it");
  });
});
