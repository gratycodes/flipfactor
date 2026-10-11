// Bug: December + 1 = month 13.
exports.nextPeriodLabel = (today = new Date()) =>
  `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 2).padStart(2, "0")}`;
