import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Report } from "../../src/types.js";
import { expectNoCause, expectOnlyCause, find, ROOT, runCli } from "./helpers.js";

const PYTHON = process.env.FLIPFACTOR_PYTHON ?? path.join(ROOT, ".venv", "bin", "python");
const CWD = path.join(ROOT, "fixtures", "pytest");
const T = {
  order: "tests/test_plugins.py::test_default_plugins",
  timezone: "tests/test_report_dates.py::test_report_day",
  seed: "tests/test_sampling.py::test_reviewer_rotation",
  cpu: "tests/test_checksum.py::test_checksum_is_fast",
  clock: "tests/test_billing_period.py::test_next_period_label",
  parallel: "tests/test_export.py::test_export_roundtrip",
  stable: "tests/test_stable.py::test_addition",
};

describe("pytest fixtures", () => {
  let report: Report;

  beforeAll(() => {
    report = runCli(["--runner", "pytest", "--cwd", CWD, "--python", PYTHON, "--max-tests", "10", ...Object.values(T)]);
  });

  it("names the polluting test for the order-dependent test", () => {
    const t = find(report, T.order);
    expect(t.classification).toBe("flaky");
    expectOnlyCause(t, "order");
    expect(t.findings[0]!.culprit).toBe("tests/test_plugins.py::test_register_plugin");
    expect(t.headline).toMatch(/^fails only when run after tests\/test_plugins.py::test_register_plugin/);
  });

  it("finds the timezones that break the date test", () => {
    const t = find(report, T.timezone);
    expect(t.classification).toBe("environment-dependent");
    expectOnlyCause(t, "timezone");
    expect(t.headline).toContain("fails under TZ=Asia/Kolkata");
    expect(t.headline).toContain("TZ=Pacific/Auckland");
    expect(t.headline).toMatch(/passes under inherited TZ \(UTC\).*TZ=America\/Los_Angeles/);
  });

  it("pins the sampling test on the random seed", () => {
    const t = find(report, T.seed);
    expect(t.classification).toBe("flaky");
    expectOnlyCause(t, "seed");
    // random.seed(n); random.sample(TEAM, 2) picks the intern for seeds 2, 3, 5 and 6.
    expect(t.headline).toContain("fails with seed 2, seed 3, seed 5, seed 6, passes with seed 1, seed 4");
  });

  it("exposes the hard-coded time budget under CPU slowdown", () => {
    const t = find(report, T.cpu);
    expect(t.classification).toBe("flaky");
    expectOnlyCause(t, "cpu");
    expect(t.headline).toContain("time budget");
  });

  it("catches the December bug on the clock axis", () => {
    const t = find(report, T.clock);
    expect(t.classification).toBe("environment-dependent");
    expectOnlyCause(t, "clock");
    expect(t.headline).toMatch(/^fails under clock \d{4}-12-31 23:59:30/);
  });

  it("blames parallel workers for the shared temp file", () => {
    const t = find(report, T.parallel);
    expect(t.classification).toBe("flaky");
    expectOnlyCause(t, "parallel");
  });

  it("finds nothing wrong with the control test", () => {
    const t = find(report, T.stable);
    expect(t.classification).toBe("not-reproduced");
    expectNoCause(t);
  });

  it("gives every finding a repro command", () => {
    for (const t of report.tests) for (const f of t.findings) if (f.strength === "deterministic") expect(f.repro, `${t.id} ${f.axis}`).toBeTruthy();
  });
});

describe("pytest --from a JUnit report", () => {
  it("diagnoses the tests that failed in a real pytest run", () => {
    const junit = path.join(mkdtempSync(path.join(tmpdir(), "flipfactor-junit-")), "junit.xml");
    try {
      execFileSync(PYTHON, ["-m", "pytest", "-q", "-p", "no:randomly", "-p", "no:cacheprovider", `--junitxml=${junit}`, "tests/test_plugins.py", "tests/test_stable.py"], {
        cwd: CWD,
        stdio: "ignore",
        env: { ...process.env, TZ: "UTC" },
      });
    } catch {
      // pytest exits 1 because test_default_plugins fails; that is the point.
    }
    const report = runCli(["--runner", "pytest", "--cwd", CWD, "--python", PYTHON, "--from", junit, "--axes", "order"]);
    expect(report.tests.map((t) => t.id)).toEqual([T.order]);
    expect(report.tests[0]!.findings[0]!.culprit).toBe("tests/test_plugins.py::test_register_plugin");
  });
});
