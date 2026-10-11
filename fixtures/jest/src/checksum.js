const { createHash } = require("node:crypto");

exports.checksum = (rounds = 50000) => {
  let digest = Buffer.from("seed");
  for (let i = 0; i < rounds; i++) digest = createHash("sha256").update(digest).digest();
  return digest.toString("hex");
};
