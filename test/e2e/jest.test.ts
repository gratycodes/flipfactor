import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Report } from "../../src/types.js";
import { expectNoCause, expectOnlyCause, find, ROOT, runCli } from "./helpers.js";

const CWD = path.join(ROOT, "fixtures", "jest");
const F = "__tests__";
const T = {
  order: `${F}/plugins.test.js::plugins defaults to alpha only`,
  timezone: `${F}/reportDates.test.js::report day is the UTC day`,
  seed: `${F}/sampling.test.js::reviewer rotation skips the intern`,
  cpu: `${F}/checksum.test.js::checksum is fast`,
  clock: `${F}/billing.test.js::next period label is a real month`,
  parallel: `${F}/export.test.js::export roundtrip`,
  locale: `${F}/price.test.js::price uses a dot for decimals`,
  stable: `${F}/stable.test.js::addition`,
};

describe("Jest fixtures", () => {
  let report: Report;

  beforeAll(() => {
    report = runCli(["--runner", "jest", "--cwd", CWD, "--max-tests", "10", ...Object.values(T)]);
  });

  it("names the polluting test for the order-dependent test", () => {
    const t = find(report, T.order);
    expect(t.classification).toBe("flaky");
    expectOnlyCause(t, "order");
    expect(t.findings[0]!.culprit).toBe(`${F}/plugins.test.js::plugins registers beta`);
  });

  it("finds the timezones that break the date test", () => {
    const t = find(report, T.timezone);
    expect(t.classification).toBe("environment-dependent");
    expectOnlyCause(t, "timezone");
    expect(t.headline).toContain("fails under TZ=Asia/Kolkata");
  });

  it("pins the sampling test on the seeded Math.random", () => {
    const t = find(report, T.seed);
    expect(t.classification).toBe("flaky");
    expectOnlyCause(t, "seed");
    expect(t.headline).toContain("decided by the random seed");
  });

  it("exposes the hard-coded time budget under CPU slowdown", () => {
    const t = find(report, T.cpu);
    expectOnlyCause(t, "cpu");
  });

  it("catches the December bug through the Date shim", () => {
    const t = find(report, T.clock);
    expect(t.classification).toBe("environment-dependent");
    expectOnlyCause(t, "clock");
    expect(t.headline).toMatch(/^fails under clock \d{4}-12-31 23:59:30/);
  });

  it("blames parallel workers for the shared temp file", () => {
    const t = find(report, T.parallel);
    expectOnlyCause(t, "parallel");
  });

  it("finds the locales that break number formatting", () => {
    const t = find(report, T.locale);
    expect(t.classification).toBe("environment-dependent");
    expectOnlyCause(t, "locale");
    expect(t.headline).toContain("LC_ALL=de_DE.UTF-8");
  });

  it("finds nothing wrong with the control test", () => {
    const t = find(report, T.stable);
    expect(t.classification).toBe("not-reproduced");
    expectNoCause(t);
  });
});
