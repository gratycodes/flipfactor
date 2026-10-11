const { reportDay } = require("../src/reports");

// 2026-03-01 19:00 UTC: still March 1st in UTC and the Americas,
// already March 2nd in India, New Zealand and Kiribati.
const EVENING_UTC = Date.UTC(2026, 2, 1, 19, 0);

test("report day is the UTC day", () => {
  expect(reportDay(EVENING_UTC)).toBe("2026-03-01");
});
