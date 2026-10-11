const { checksum } = require("../src/checksum");

test("checksum is fast", () => {
  const started = performance.now();
  checksum();
  expect(performance.now() - started).toBeLessThan(250);
});
