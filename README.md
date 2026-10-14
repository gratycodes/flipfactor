# flipfactor

Re-run a flaky test under controlled perturbations — order, parallelism,
timezone, locale, random seed, system clock, CPU speed — and report which
factor flips the result.

CLI for pytest, Jest and `go test`, plus a GitHub Action that diagnoses
failures from a JUnit or Jest JSON report and comments on the pull request.

## The problem

A test that fails once a week is expensive to chase. Most flake tooling
(Buildkite [flaky-tests-detection](https://github.com/buildkite/flaky-tests-detection),
Datadog FlakeTriage, and similar CI history trackers) answers **how often**
a test flips across past runs. That is useful for triage, but it does not
say **why**.

`flipfactor` takes the opposite approach: take one failing test id, re-run it
while varying **one environmental factor at a time**, and report which
axis makes the outcome change. The output is a short verdict, the evidence
counts, and a pasteable repro command.

It does not replace history-based flake detectors. Use those to find which
tests are noisy; use this to narrow the cause of one of them.

## What it checks

| Axis | What changes | Typical bug it surfaces |
| --- | --- | --- |
| `order` | permutation / shuffle of neighbours in the same file | leaked module state, shared registry |
| `parallel` | 1 worker vs N workers over the test's scope | shared temp files, ports, globals |
| `timezone` | `TZ` | local-time formatting of UTC timestamps |
| `locale` | `LC_ALL` / `LANG` | `toLocaleString()` / number and date formats |
| `seed` | language PRNG (`random` / `Math.random`) | unseeded sampling |
| `clock` | wall clock via libfaketime (pytest) or a Date shim (Jest) | month-boundary and leap-day bugs |
| `cpu` | intentional slowdown on the same core | hard-coded wall-clock budgets |

When seed explains a random flake, later axes run with a passing seed
pinned so chance cannot blame an unrelated factor.

## Quick start

```bash
npm install          # Node 20+
npm run build

# diagnose one pytest node id
node dist/flipfactor.cjs --runner pytest \
  --python .venv/bin/python \
  -- tests/test_plugins.py::test_default_plugins

# or pull failures from a JUnit / Jest --json report
node dist/flipfactor.cjs --runner pytest --from junit.xml
node dist/flipfactor.cjs --runner jest --from jest-results.json
```

Example verdict (order dependence in the fixtures):

```
FLAKY  tests/test_plugins.py::test_default_plugins
  fails only when run after tests/test_plugins.py::test_register_plugin ...
  [order] deterministic: ...
      repro: python -m pytest ... test_register_plugin test_default_plugins
```

### GitHub Action

```yaml
- uses: gratycodes/flipfactor@main
  with:
    runner: pytest
    working-directory: .
    from-report: ${{ runner.temp }}/junit.xml
    # or name tests explicitly:
    # tests: |
    #   tests/test_x.py::test_flaky
    max-tests: "3"
```

Inputs: `runner`, `tests`, `from-report`, `working-directory`, `axes`,
`max-tests`, `args`, `comment`, `install-faketime`, `github-token`.
Outputs: `report-json`, `report-markdown`, `headline`. The Markdown report
is also written to the job summary. On fork PRs the comment is skipped when
the token is read-only.

## How it works

1. Baseline: run the target alone, then with its file/package neighbours.
2. For each axis in turn, run the target under a small set of controlled
   values (a few timezones, seeds, clocks, worker counts, …).
3. Score each condition by fail rate. A factor that flips pass↔fail
   deterministically is reported; elevated rates are called out; no-ops are
   listed as "no effect".
4. Emit text, JSON and Markdown reports with repro commands.

Runner support differs:

| | pytest | Jest | go test |
| --- | --- | --- | --- |
| exact order | yes (plugin) | file-level + name filter | package + `-run` |
| seed | `random` (+ numpy if present) | `Math.random` shim | skipped |
| clock | libfaketime | `Date` shim | skipped (vDSO) |
| locale | env only | env (ICU) | skipped |
| parallel | pytest-xdist | Jest workers | `-parallel` / `-p` |

## Stack

- TypeScript CLI (Node 20+), bundled with esbuild to `dist/flipfactor.cjs`
- Small pytest plugin under `python/flipfactor_pytest`
- Jest setup shim under `runtime/jest-setup.cjs`
- Composite GitHub Action (`action.yml`) plus a PR-comment helper

## Development

```bash
npm ci
npm run lint && npm run typecheck && npm test   # unit
python3 -m venv .venv && .venv/bin/pip install pytest pytest-xdist ruff
PYTHONPATH=python .venv/bin/pytest -q python     # plugin tests
npm run build
# e2e needs the matching runner + (for pytest clock) faketime
npx vitest run test/e2e/pytest.test.ts
npx vitest run test/e2e/jest.test.ts            # after: cd fixtures/jest && npm ci
npx vitest run test/e2e/go.test.ts
```

`fixtures/` holds deliberately flaky suites (one planted cause each). Do not
"fix" them; the e2e tests assert that flipfactor names the planted cause.

## Limitations

- It diagnoses **one test id at a time**. It is not a CI-wide flake
  dashboard and does not mine historical flip rates.
- Axes that the runner cannot control are skipped (Go: seed, clock, locale).
- TypeScript Jest configs (`jest.config.ts`) are not supported yet; use
  `.js` / `.cjs` / `.mjs` / `.json` or `package.json#jest`.
- The CPU axis needs `taskset` (Linux) and only slows the process it wraps;
  it will not catch every timing flake.
- Clock for pytest needs `libfaketime` installed (the Action can apt-install
  it). Go clock faking is not attempted.
- Locale results for Jest depend on ICU data in Node; system `locale-gen`
  is not required for that path.
- Parallelism detects shared-state failures between concurrent tests in the
  chosen scope; it will not attribute races outside that scope.
- Fixtures and reports are synthetic. Nothing here reflects any employer's
  production suite.

## License

MIT © Gratus Antin
