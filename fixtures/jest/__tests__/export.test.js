const { roundtrip } = require("../src/sharedFile");

test("export roundtrip", async () => {
  await expect(roundtrip("export")).resolves.toBe("export");
});
