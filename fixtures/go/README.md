# Go fixtures

Deliberately flaky `go test` tests, one hidden cause each. Do not "fix" them.

| Test | Planted cause |
| --- | --- |
| `./plugins::TestDefaultPlugins` | order: fails after `TestRegisterPlugin` leaks into a package-level map |
| `./reports::TestReportDay` | timezone: uses `time.Local` for a UTC timestamp |
| `./checksum::TestChecksumIsFast` | timing: hard 250 ms wall-clock budget |
| `./stable::TestAddition` | control: never fails |
