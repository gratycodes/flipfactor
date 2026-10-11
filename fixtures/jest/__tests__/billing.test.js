const { nextPeriodLabel } = require("../src/billing");

test("next period label is a real month", () => {
  expect(nextPeriodLabel()).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
});
