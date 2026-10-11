const { roundtrip } = require("../src/sharedFile");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("upload roundtrip", async () => {
  await sleep(300); // starts a little later than export.test.js, then clobbers its file
  await expect(roundtrip("upload")).resolves.toBe("upload");
});
