const { formatPrice } = require("../src/price");

test("price uses a dot for decimals", () => {
  expect(formatPrice(1234.5)).toBe("1,234.50");
});
