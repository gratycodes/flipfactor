import { describe, expect, it } from "vitest";
import { DEFAULTS, defaultClocks, Engine, type EngineOptions } from "../../src/engine.js";
import type { RunSpec } from "../../src/types.js";
import { FakeAdapter, type Oracle } from "./fake-adapter.js";

const TESTS = ["t::a", "t::polluter", "t::b", "t::victim", "t::c"];

function opts(over: Partial<EngineOptions> = {}): EngineOptions {
  return {
    ...DEFAULTS,
    axes: ["order", "parallel", "timezone", "locale", "seed", "clock", "cpu"],
    clocks: defaultClocks(new Date("2026-10-11T00:00:00Z")),
    inheritedTz: "UTC",
    inheritedLocale: "C",
    log: () => {},
    ...over,
  };
}

async function diagnose(oracle: Oracle, target = "t::victim", over: Partial<EngineOptions> = {}, caps = {}) {
  const adapter = new FakeAdapter(TESTS, oracle, caps);
  const engine = new Engine(adapter, opts(over));
  return { d: await engine.diagnose(target), adapter, engine };
}

/** Did `polluter` run before `test` in this spec? */
const ranAfter = (spec: RunSpec, test: string, polluter: string) => {
  const order = spec.scope ? TESTS : spec.tests;
  return order.indexOf(polluter) >= 0 && order.indexOf(polluter) < order.indexOf(test);
};

describe("Engine", () => {
  it("names the polluting test for an order-dependent test", async () => {
    const { d } = await diagnose((spec, t) => t === "t::victim" && ranAfter(spec, t, "t::polluter") && !spec.workers?.toString().startsWith("4"));
    expect(d.classification).toBe("flaky");
    const order = d.findings.find((f) => f.axis === "order")!;
    expect(order.strength).toBe("deterministic");
    expect(order.culprit).toBe("t::polluter");
    expect(d.headline).toContain("fails only when run after t::polluter");
  });

  it("finds a polluter that runs after the victim in file order when exact ordering is possible", async () => {
    const { d } = await diagnose((spec, t) => t === "t::b" && ranAfter(spec, t, "t::c"), "t::b");
    const order = d.findings.find((f) => f.axis === "order")!;
    expect(order.culprit).toBe("t::c");
  });

  it("names an enabling test when the victim only passes after it", async () => {
    const { d } = await diagnose((spec, t) => t === "t::victim" && !ranAfter(spec, t, "t::a"));
    const order = d.findings.find((f) => f.axis === "order")!;
    expect(order.culprit).toBe("t::a");
    expect(order.summary).toContain("passes only when run after t::a");
  });

  it("reports a timezone dependence with the failing zones", async () => {
    const bad = new Set(["Asia/Kolkata", "Pacific/Auckland", "Pacific/Kiritimati"]);
    const { d } = await diagnose((spec, t) => t === "t::victim" && bad.has(spec.env.TZ ?? ""));
    expect(d.classification).toBe("environment-dependent");
    const tz = d.findings.find((f) => f.axis === "timezone")!;
    expect(tz.strength).toBe("deterministic");
    expect(tz.summary).toContain("fails under TZ=Asia/Kolkata");
    expect(tz.summary).toContain("passes under inherited TZ (UTC)");
    expect(tz.repro).toBeDefined();
  });

  it("explains a failure under the inherited timezone by the zones where it passes", async () => {
    const good = new Set(["UTC", "America/Los_Angeles"]);
    const { d } = await diagnose((spec, t) => t === "t::victim" && !good.has(spec.env.TZ ?? "Asia/Kolkata"), "t::victim", {
      inheritedTz: "Asia/Kolkata",
      timezones: ["UTC", "America/Los_Angeles", "Pacific/Auckland"],
    });
    expect(d.classification).toBe("environment-dependent");
    expect(d.findings.find((f) => f.axis === "timezone")!.strength).toBe("deterministic");
  });

  it("attributes an unseeded-random flake to the seed", async () => {
    const failingSeeds = new Set([2, 5]);
    const { d } = await diagnose((spec, t, i) =>
      t === "t::victim" && (spec.rngSeed !== undefined ? failingSeeds.has(spec.rngSeed) : i % 3 === 0),
    );
    expect(d.classification).toBe("flaky");
    const seed = d.findings.find((f) => f.axis === "seed")!;
    expect(seed.strength).toBe("deterministic");
    expect(seed.summary).toContain("decided by the random seed");
    expect(seed.summary).toContain("seed 2, seed 5");
  });

  it("flags a hard-coded time budget under CPU slowdown", async () => {
    const { d } = await diagnose((spec, t) => t === "t::victim" && Boolean(spec.cpuSlowdown));
    const cpu = d.findings.find((f) => f.axis === "cpu")!;
    expect(cpu.strength).toBe("deterministic");
    expect(cpu.summary).toContain("time budget");
    expect(cpu.summary).toContain("50 ms -> 400 ms");
  });

  it("flags a clock dependence", async () => {
    const { d } = await diagnose((spec, t) => t === "t::victim" && (spec.clock ?? "").includes("-12-31"));
    const clock = d.findings.find((f) => f.axis === "clock")!;
    expect(clock.strength).toBe("deterministic");
    expect(clock.summary).toContain("fails under clock 2026-12-31 23:59:30");
  });

  it("detects a failure that only happens with parallel workers", async () => {
    const { d } = await diagnose((spec, t) => t === "t::victim" && (spec.workers ?? 1) > 1);
    const par = d.findings.find((f) => f.axis === "parallel")!;
    expect(par.strength).toBe("deterministic");
    expect(par.summary).toContain("4 workers");
    expect(d.classification).toBe("flaky");
  });

  it("does not blame parallelism when parallel runs merely hide an order dependence", async () => {
    const { d } = await diagnose((spec, t) => t === "t::victim" && ranAfter(spec, t, "t::polluter") && (spec.workers ?? 1) === 1);
    expect(d.findings.find((f) => f.axis === "parallel")!.strength).toBe("none");
  });

  it("reports a stable test as not reproduced and finds nothing", async () => {
    const { d } = await diagnose(() => false);
    expect(d.classification).toBe("not-reproduced");
    expect(d.findings.every((f) => f.strength === "none")).toBe(true);
  });

  it("reports an always-failing test as broken", async () => {
    const { d } = await diagnose((_s, t) => t === "t::victim");
    expect(d.classification).toBe("broken");
  });

  it("does not invent a cause for a purely random flake", async () => {
    // Fails on every other run regardless of conditions: no factor should be
    // called deterministic thanks to the confirmation runs.
    let n = 0;
    const { d } = await diagnose((_s, t) => t === "t::victim" && n++ % 2 === 0, "t::victim", { axes: ["timezone", "locale", "clock", "cpu"] });
    expect(d.findings.filter((f) => f.strength === "deterministic")).toEqual([]);
    expect(["flaky-unexplained", "flaky"]).toContain(d.classification);
  });

  it("skips axes the runner cannot control", async () => {
    const { d } = await diagnose(() => false, "t::victim", {}, { seed: false, clock: false, locale: false, parallel: false });
    const skipped = d.findings.filter((f) => f.strength === "skipped").map((f) => f.axis).sort();
    expect(skipped).toEqual(["clock", "locale", "parallel", "seed"]);
  });

  it("only searches preceding tests when the runner keeps file order", async () => {
    const { d, adapter } = await diagnose((spec, t) => t === "t::victim" && ranAfter(spec, t, "t::polluter"), "t::victim", { axes: ["order"] }, { exactOrder: false });
    expect(d.findings[0]!.culprit).toBe("t::polluter");
    const probes = adapter.calls.filter((c) => !c.scope && c.shuffleSeed === undefined && c.tests.length < TESTS.length);
    expect(probes.length).toBeGreaterThan(0);
    for (const call of probes) expect(call.tests).not.toContain("t::c");
  });

  it("rejects a target the runner did not collect", async () => {
    const adapter = new FakeAdapter(TESTS, () => false);
    await expect(new Engine(adapter, opts()).diagnose("t::nope")).rejects.toThrow(/not among the tests/);
  });

  it("counts every run it makes", async () => {
    const { d, adapter, engine } = await diagnose(() => false);
    expect(engine.runs).toBe(adapter.calls.length);
    expect(d.runs).toBe(adapter.calls.length);
  });
});

describe("defaultClocks", () => {
  it("covers year end, month end, a leap day and just after midnight", () => {
    expect(defaultClocks(new Date("2026-10-11T00:00:00Z"))).toEqual([
      "2026-12-31T23:59:30",
      "2027-01-31T23:59:30",
      "2028-02-29T12:00:00",
      "2027-03-01T00:00:05",
    ]);
    expect(defaultClocks(new Date("2027-05-01T00:00:00Z"))[2]).toBe("2028-02-29T12:00:00");
    expect(defaultClocks(new Date("2099-05-01T00:00:00Z"))[2]).toBe("2104-02-29T12:00:00");
  });
});

describe("Engine controls an explained factor", () => {
  it("pins a passing seed after the seed axis explains a random flake", async () => {
    const failingSeeds = new Set([2, 5]);
    let unseeded = 0;
    const adapter = new FakeAdapter(TESTS, (spec, t) => {
      if (t !== "t::victim") return false;
      if (spec.rngSeed !== undefined) return failingSeeds.has(spec.rngSeed);
      return unseeded++ % 2 === 0; // random-looking when unseeded
    });
    const d = await new Engine(adapter, opts({ axes: ["timezone", "seed", "clock"] })).diagnose("t::victim");
    expect(d.findings.find((f) => f.axis === "seed")!.strength).toBe("deterministic");
    expect(d.findings.filter((f) => f.axis !== "seed").every((f) => f.strength === "none")).toBe(true);
    // Every timezone/clock run happened with seed 1 (the first passing seed) pinned.
    const later = adapter.calls.filter((c) => c.env.TZ !== undefined || c.clock !== undefined);
    expect(later.length).toBeGreaterThan(0);
    expect(later.every((c) => c.rngSeed === 1)).toBe(true);
  });
});
