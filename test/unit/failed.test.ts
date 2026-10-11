import path from "node:path";
import { describe, expect, it } from "vitest";
import { failedFromJUnit, failedFromReport, pytestNodeId } from "../../src/failed.js";

const cwd = path.resolve("fixtures/pytest");

describe("failed tests from reports", () => {
  it("maps pytest JUnit classnames back to node ids", () => {
    expect(pytestNodeId("tests.test_plugins", "test_default_plugins", cwd)).toBe("tests/test_plugins.py::test_default_plugins");
    expect(pytestNodeId("tests.test_plugins.TestThing", "test_x[a&b]", cwd)).toBe("tests/test_plugins.py::TestThing::test_x[a&b]");
  });

  it("picks failures and errors, skips passes and skips", () => {
    const xml = `<?xml version="1.0"?><testsuites><testsuite>
      <testcase classname="tests.test_plugins" name="test_alpha_loads" time="0.001"/>
      <testcase classname="tests.test_plugins" name="test_default_plugins" time="0.001"><failure message="assert">x</failure></testcase>
      <testcase classname="tests.test_sampling" name="test_reviewer_rotation"><error message="boom"/></testcase>
      <testcase classname="tests.test_stable" name="test_addition"><skipped/></testcase>
    </testsuite></testsuites>`;
    expect(failedFromJUnit(xml, cwd)).toEqual(["tests/test_plugins.py::test_default_plugins", "tests/test_sampling.py::test_reviewer_rotation"]);
  });

  it("decodes entities in names", () => {
    const xml = `<testcase classname="tests.test_x" name="test_y[&lt;a&gt; &amp; &quot;b&quot;]"><failure/></testcase>`;
    expect(failedFromJUnit(xml, cwd)).toEqual(['tests/test_x.py::test_y[<a> & "b"]']);
  });

  it("reads Jest --json and refuses mismatched formats", () => {
    const json = JSON.stringify({ testResults: [{ name: `${cwd}/a.test.js`, assertionResults: [{ fullName: "x y", status: "failed" }, { fullName: "z", status: "passed" }] }] });
    expect(failedFromReport(json, "jest", cwd)).toEqual(["a.test.js::x y"]);
    expect(() => failedFromReport("<testsuites/>", "jest", cwd)).toThrow(/JUnit XML input is supported for pytest/);
    expect(() => failedFromReport("{}", "pytest", cwd)).toThrow(/--junitxml/);
  });
});
