import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Report } from "../../src/types.js";
import { expectNoCause, expectOnlyCause, find, haveCommand, ROOT, runCli } from "./helpers.js";

const CWD = path.join(ROOT, "fixtures", "go");
const T = {
  order: "./plugins::TestDefaultPlugins",
  timezone: "./reports::TestReportDay",
  cpu: "./checksum::TestChecksumIsFast",
  stable: "./stable::TestAddition",
};

describe.skipIf(!haveCommand("go", ["version"]))("go test fixtures", () => {
  let report: Report;

  beforeAll(() => {
    report = runCli(["--runner", "go", "--cwd", CWD, ...Object.values(T)]);
  });

  it("names the polluting test", () => {
    const t = find(report, T.order);
    expectOnlyCause(t, "order");
    expect(t.findings[0]!.culprit).toBe("./plugins::TestRegisterPlugin");
  });

  it("finds the timezone dependence", () => {
    expectOnlyCause(find(report, T.timezone), "timezone");
  });

  it("exposes the time budget", () => {
    expectOnlyCause(find(report, T.cpu), "cpu");
  });

  it("finds nothing wrong with the control test and says which axes Go cannot vary", () => {
    const t = find(report, T.stable);
    expectNoCause(t);
    expect(t.findings.filter((f) => f.strength === "skipped").map((f) => f.axis).sort()).toEqual(["clock", "locale", "seed"]);
  });
});
