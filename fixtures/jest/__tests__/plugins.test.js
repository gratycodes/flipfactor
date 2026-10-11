const plugins = require("../src/plugins");

describe("plugins", () => {
  test("loads alpha", () => {
    expect(plugins.available()).toContain("alpha");
  });

  test("registers beta", () => {
    plugins.register("beta");
    expect(plugins.available()).toContain("beta");
  });

  test("lookup of a missing plugin", () => {
    expect(plugins.available()).not.toContain("gamma");
  });

  test("defaults to alpha only", () => {
    expect(plugins.available()).toEqual(["alpha"]);
  });
});
