const { reviewers } = require("../src/sampling");

test("reviewer rotation skips the intern", () => {
  expect(reviewers()).not.toContain("intern");
});
