# pytest fixtures

Deliberately flaky tests. Each one has exactly one hidden cause, and the
end-to-end tests check that flipfactor names it. Do not "fix" them.

| Test | Planted cause |
| --- | --- |
| `tests/test_plugins.py::test_default_plugins` | order: fails after `test_register_plugin` leaks into a module-level registry |
| `tests/test_report_dates.py::test_report_day` | timezone: uses local time for a UTC timestamp |
| `tests/test_sampling.py::test_reviewer_rotation` | seed: unseeded `random.sample` |
| `tests/test_checksum.py::test_checksum_is_fast` | timing: hard 250 ms wall-clock budget |
| `tests/test_billing_period.py::test_next_period_label` | clock: breaks in December |
| `tests/test_export.py::test_export_roundtrip` | parallelism: shares a temp file with `test_upload.py` |
| `tests/test_stable.py::test_addition` | control: never fails |
