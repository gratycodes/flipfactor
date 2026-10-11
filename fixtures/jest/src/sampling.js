const TEAM = ["asha", "bruno", "chen", "dara", "intern"];

exports.reviewers = (k = 2) => {
  const pool = [...TEAM];
  const picked = [];
  while (picked.length < k) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return picked;
};
