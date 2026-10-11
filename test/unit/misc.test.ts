import { describe, expect, it } from "vitest";
import { canonicalTz } from "../../src/cli.js";
import { envPrefix, exec, shellQuote } from "../../src/exec.js";
import { faketimeEnv, findLibfaketime } from "../../src/faketime.js";
import { COMMENT_MARKER, toJson, toMarkdown, toText } from "../../src/report/index.js";
import type { Report } from "../../src/types.js";

const report: Report = {
  tool: "flipfactor",
  version: "0.0.0",
  runner: "pytest",
  cwd: "/repo",
  startedAt: "2026-10-11T00:00:00.000Z",
  wallMs: 4200,
  totalRuns: 12,
  inherited: { tz: "UTC", locale: "C" },
  tests: [
    {
      id: "tests/t.py::test_a|b",
      classification: "flaky",
      headline: "fails only when run after tests/t.py::test_x",
      baseline: { isolated: { label: "alone", runs: 3, failed: 0 }, suite: { label: "file", runs: 3, failed: 3 } },
      findings: [
        { axis: "order", strength: "deterministic", summary: "fails only when run after tests/t.py::test_x", evidence: [{ label: "right after x", runs: 3, failed: 3 }], repro: "pytest a b", culprit: "tests/t.py::test_x" },
        { axis: "timezone", strength: "none", summary: "no effect", evidence: [] },
        { axis: "clock", strength: "skipped", summary: "libfaketime is not installed", evidence: [] },
      ],
      runs: 12,
    },
  ],
};

describe("reports", () => {
  it("renders text with evidence, repro and quiet axes", () => {
    const t = toText(report);
    expect(t).toContain("FLAKY  tests/t.py::test_a|b");
    expect(t).toContain("[order] deterministic");
    expect(t).toContain("repro: pytest a b");
    expect(t).toContain("no effect: timezone");
    expect(t).toContain("skipped clock: libfaketime is not installed");
  });

  it("renders Markdown with a stable marker and escaped table cells", () => {
    const md = toMarkdown(report);
    expect(md.startsWith(COMMENT_MARKER)).toBe(true);
    expect(md).toContain("| `tests/t.py::test_a\\|b` | FLAKY |");
    expect(md).toContain("```sh\npytest a b\n```");
  });

  it("round-trips JSON", () => {
    expect(JSON.parse(toJson(report))).toEqual(report);
  });
});

describe("faketime", () => {
  it("pins a local wall-clock time as an absolute FAKETIME", () => {
    expect(faketimeEnv("/lib/libfaketime.so.1", "2026-12-31T23:59:30").FAKETIME).toBe("@2026-12-31 23:59:30");
  });

  it("turns a zoned instant into a relative offset and leaves the monotonic clock alone", () => {
    const now = Date.parse("2026-10-11T00:00:00Z");
    expect(faketimeEnv("/lib/libfaketime.so.1", "2026-10-12T00:00:00Z", now)).toEqual({
      LD_PRELOAD: "/lib/libfaketime.so.1",
      FAKETIME: "+86400",
      FAKETIME_DONT_FAKE_MONOTONIC: "1",
    });
    expect(faketimeEnv("/x.dylib", "2026-10-10T23:00:00Z", now).FAKETIME).toBe("-3600");
    expect(() => faketimeEnv("/x", "not a date", now)).toThrow(/ISO-8601/);
  });

  it("honours an explicit library path", () => {
    expect(findLibfaketime({ FLIPFACTOR_LIBFAKETIME: "/definitely/missing.so" })).toBeUndefined();
  });
});

describe("exec helpers", () => {
  it("quotes only when needed", () => {
    expect(shellQuote("tests/t.py::a")).toBe("tests/t.py::a");
    expect(shellQuote("it's [x]")).toBe(`'it'\\''s [x]'`);
    expect(envPrefix({ TZ: "Asia/Kolkata", X: "a b" })).toBe("TZ=Asia/Kolkata X='a b'");
  });

  it("runs a command, captures output and enforces a timeout", async () => {
    const ok = await exec(process.execPath, ["-e", "console.log(process.env.FOO)"], { cwd: ".", env: { FOO: "bar" } });
    expect(ok.stdout.trim()).toBe("bar");
    expect(ok.code).toBe(0);
    const slow = await exec(process.execPath, ["-e", "setTimeout(()=>{}, 10000)"], { cwd: ".", timeoutMs: 200 });
    expect(slow.timedOut).toBe(true);
  });
});

describe("canonicalTz", () => {
  it("maps ICU's legacy spellings", () => {
    expect(canonicalTz("Asia/Calcutta")).toBe("Asia/Kolkata");
    expect(canonicalTz("UTC")).toBe("UTC");
    expect(canonicalTz("Not/AZone")).toBe("Not/AZone");
  });
});
