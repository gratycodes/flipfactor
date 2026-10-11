import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseGoJson, splitGoId } from "../../src/adapters/go.js";
import { escapeRegex, findJestConfig, namePattern, parseJestJson, splitId, wrapperConfigSource } from "../../src/adapters/jest.js";
import { parseCollectOnly, parsePluginReport } from "../../src/adapters/pytest.js";

describe("pytest adapter parsing", () => {
  it("reads the plugin's JSON lines", () => {
    const m = parsePluginReport('{"id":"t.py::a","outcome":"pass","durationMs":1.5}\n{"id":"t.py::b","outcome":"fail","durationMs":2,"message":"AssertionError"}\n');
    expect(m.get("t.py::a")).toEqual({ outcome: "pass", durationMs: 1.5, message: undefined });
    expect(m.get("t.py::b")?.message).toBe("AssertionError");
  });

  it("extracts node ids from --collect-only -q", () => {
    const out = "tests/test_a.py::test_one\ntests/test_a.py::TestX::test_two[1-2]\n\n2 tests collected in 0.01s\n";
    expect(parseCollectOnly(out)).toEqual(["tests/test_a.py::test_one", "tests/test_a.py::TestX::test_two[1-2]"]);
  });
});

describe("jest adapter helpers", () => {
  it("splits ids and builds an anchored, escaped name pattern", () => {
    expect(splitId("a/b.test.js::suite does (x) thing")).toEqual({ file: "a/b.test.js", name: "suite does (x) thing" });
    expect(() => splitId("nope")).toThrow(/file>::<full test name/);
    expect(namePattern(["a (1)", "b.c", "a (1)"])).toBe("^(?:a \\(1\\)|b\\.c)$");
    expect(new RegExp(namePattern(["price is $5?"])).test("price is $5?")).toBe(true);
    expect(escapeRegex("[x]")).toBe("\\[x\\]");
  });

  it("maps --json output to relative ids, and file crashes to a wildcard", () => {
    const cwd = "/repo";
    const m = parseJestJson(
      {
        testResults: [
          { name: "/repo/__tests__/a.test.js", assertionResults: [{ fullName: "suite ok", status: "passed", duration: 3 }, { fullName: "suite bad", status: "failed", failureMessages: ["Error: boom\n  at x"] }] },
          { name: "/repo/__tests__/b.test.js", status: "failed", message: "SyntaxError: nope", assertionResults: [] },
        ],
      },
      cwd,
    );
    expect(m.get("__tests__/a.test.js::suite ok")).toEqual({ outcome: "pass", durationMs: 3 });
    expect(m.get("__tests__/a.test.js::suite bad")?.message).toBe("Error: boom");
    expect(m.get("__tests__/b.test.js::*")?.outcome).toBe("fail");
  });

  it("wraps the project's Jest config instead of replacing it", () => {
    const fixtures = path.resolve("fixtures/jest");
    expect(findJestConfig(fixtures).kind).toBe("package");
    const src = wrapperConfigSource(fixtures, "/x/setup.cjs");
    expect(src).toContain("package.json");
    expect(src).toContain('"/x/setup.cjs"');
    expect(src).toContain("cfg.setupFilesAfterEnv ?? []");
    expect(findJestConfig("/").kind).toBe("none");
  });
});

describe("go adapter parsing", () => {
  it("maps go test -json events to ./pkg::Test ids and keeps the failure line", () => {
    const lines = [
      { Action: "run", Package: "example.com/m/plugins", Test: "TestA" },
      { Action: "output", Package: "example.com/m/plugins", Test: "TestA", Output: "    plugins_test.go:28: got [alpha beta]\n" },
      { Action: "fail", Package: "example.com/m/plugins", Test: "TestA", Elapsed: 0.01 },
      { Action: "pass", Package: "example.com/m/plugins", Test: "TestA/sub", Elapsed: 0 },
      { Action: "pass", Package: "example.com/m", Test: "TestRoot", Elapsed: 0 },
      { Action: "pass", Package: "example.com/m/plugins", Elapsed: 0.02 },
    ].map((l) => JSON.stringify(l));
    const alias = (p: string) => (p === "example.com/m" ? "." : `./${p.slice("example.com/m/".length)}`);
    const m = parseGoJson(["not json", ...lines].join("\n"), alias);
    expect(m.get("./plugins::TestA")).toEqual({ outcome: "fail", durationMs: 10, message: "plugins_test.go:28: got [alpha beta]" });
    expect(m.has("./plugins::TestA/sub")).toBe(false);
    expect(m.get(".::TestRoot")?.outcome).toBe("pass");
    expect(splitGoId("./x::TestY")).toEqual({ pkg: "./x", name: "TestY" });
  });
});
