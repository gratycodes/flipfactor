const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Bug: every caller shares one fixed temp file.
const FILE = path.join(os.tmpdir(), `flipfactor-jest-fixture-${process.getuid()}.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

exports.roundtrip = async (payload, settleMs = 1200) => {
  fs.writeFileSync(FILE, payload);
  await sleep(settleMs);
  return fs.readFileSync(FILE, "utf8");
};
