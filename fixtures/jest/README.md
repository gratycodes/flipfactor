# Jest fixtures

Deliberately flaky tests, one hidden cause each. The end-to-end tests check
that flipfactor names it. Do not "fix" them.

| Test | Planted cause |
| --- | --- |
| `__tests__/plugins.test.js` › `plugins defaults to alpha only` | order: fails after `plugins registers beta` |
| `__tests__/reportDates.test.js` › `report day is the UTC day` | timezone: uses local time for a UTC timestamp |
| `__tests__/sampling.test.js` › `reviewer rotation skips the intern` | seed: unseeded `Math.random` |
| `__tests__/checksum.test.js` › `checksum is fast` | timing: hard 250 ms wall-clock budget |
| `__tests__/billing.test.js` › `next period label is a real month` | clock: breaks in December |
| `__tests__/export.test.js` › `export roundtrip` | parallelism: shares a temp file with `upload.test.js` |
| `__tests__/price.test.js` › `price uses a dot for decimals` | locale: `toLocaleString()` without a locale |
| `__tests__/stable.test.js` › `addition` | control: never fails |
