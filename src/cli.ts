import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import pkg from "../package.json" with { type: "json" };
import { GoAdapter } from "./adapters/go.js";
import { JestAdapter } from "./adapters/jest.js";
import { PytestAdapter } from "./adapters/pytest.js";
import { DEFAULTS, defaultClocks, Engine } from "./engine.js";
import { exec } from "./exec.js";
import { failedFromReport } from "./failed.js";
import { toJson, toMarkdown, toText } from "./report/index.js";
import { ALL_AXES, type Adapter, type AxisName, type Report, type RunnerName } from "./types.js";

const HELP = `flipfactor ${pkg.version}: find out WHY a test is flaky.

Re-runs a test under controlled perturbations and reports which one flips
the result: test order, parallelism, timezone, locale, random seed, system
clock and CPU speed.

Usage:
  flipfactor --runner <pytest|jest|go> [options] <test id>...
  flipfactor --runner pytest --from report.xml      diagnose failures from a report
  flipfactor slow <factor> -- <command...>          run a command on a CPU slowed ~factor x

Test ids:
  pytest  tests/test_x.py::test_name               (pytest node id)
  jest    src/__tests__/x.test.js::describe name   (file::full test name)
  go      ./pkg::TestName

Options:
  --runner <name>          pytest, jest or go (required)
  --cwd <dir>              project root to run in (default: .)
  --from <file>            take failed tests from a pytest JUnit XML or Jest --json report
  --max-tests <n>          diagnose at most n tests (default 5)
  --axes <list>            subset of ${ALL_AXES.join(",")} (default: all)
  --baseline-runs <n>      runs per baseline condition (default ${DEFAULTS.baselineRuns})
  --repeats <n>            runs per perturbed value (default ${DEFAULTS.repeats})
  --confirm-runs <n>       extra runs to confirm a flip (default ${DEFAULTS.confirmRuns})
  --timezones <list>       default ${DEFAULTS.timezones.join(",")}
  --locales <list>         default ${DEFAULTS.locales.join(",")}
  --seeds <list>           default ${DEFAULTS.seeds.join(",")}
  --clocks <list>          local wall-clock instants, default ${defaultClocks().join(",")}
  --shuffles <n>           shuffled-order runs of the file (default ${DEFAULTS.shuffles})
  --cpu-slowdown <n>       CPU slowdown factor (default ${DEFAULTS.cpuSlowdown})
  --workers <n>            workers for the parallelism axis (default ${DEFAULTS.workers})
  --scope <path>           what to run for the parallelism axis (default: the test's directory or ./...)
  --python <bin>           python for pytest (default: python3, or $VIRTUAL_ENV/bin/python)
  --jest <path>            path to jest/bin/jest.js (default: found in node_modules)
  --go <bin>               go binary (default: go)
  --runner-arg <arg>       extra argument for the test runner (repeatable)
  --timeout <seconds>      per run (default 300)
  --json <file>            write the JSON report
  --markdown <file>        write the Markdown report
  --quiet                  no progress on stderr
  -h, --help / -v, --version
`;

/** ICU spells some zones the old way (Asia/Calcutta); compare canonical names. */
export function canonicalTz(tz: string): string {
  try {
    const resolved = new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;
    const aliases: Record<string, string> = { "Asia/Calcutta": "Asia/Kolkata", "Asia/Katmandu": "Asia/Kathmandu", "Asia/Saigon": "Asia/Ho_Chi_Minh" };
    return aliases[resolved] ?? resolved;
  } catch {
    return tz;
  }
}

function list(value: string | undefined, fallback: string[]): string[] {
  return value ? value.split(",").map((s) => s.trim()).filter(Boolean) : fallback;
}

function int(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`--${name} must be a non-negative integer`);
  return n;
}

async function slow(argv: string[]): Promise<number> {
  const factor = Number(argv[0]);
  const dash = argv.indexOf("--");
  const cmd = dash >= 0 ? argv.slice(dash + 1) : argv.slice(1);
  if (!Number.isInteger(factor) || factor < 2 || cmd.length === 0) {
    process.stderr.write("usage: flipfactor slow <factor >= 2> -- <command...>\n");
    return 2;
  }
  const res = await exec(cmd[0]!, cmd.slice(1), { cwd: process.cwd(), cpuSlowdown: factor });
  process.stdout.write(res.stdout);
  process.stderr.write(res.stderr);
  return res.code ?? 1;
}

function makeAdapter(runner: RunnerName, cwd: string, v: Record<string, string | string[] | boolean | undefined>, timeoutMs: number): Adapter {
  const extraArgs = (v["runner-arg"] as string[] | undefined) ?? [];
  switch (runner) {
    case "pytest": {
      const venv = process.env.VIRTUAL_ENV;
      const python = (v.python as string | undefined) ?? (venv ? path.join(venv, "bin", "python") : "python3");
      return new PytestAdapter({ cwd, python, extraArgs, timeoutMs });
    }
    case "jest":
      return new JestAdapter({ cwd, jestBin: v.jest as string | undefined, extraArgs, timeoutMs });
    case "go":
      return new GoAdapter({ cwd, goBin: (v.go as string | undefined) ?? "go", extraArgs, timeoutMs });
  }
}

export async function main(argv: string[]): Promise<number> {
  if (argv[0] === "slow") return slow(argv.slice(1));
  const { values: v, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      runner: { type: "string" },
      cwd: { type: "string" },
      from: { type: "string" },
      "max-tests": { type: "string" },
      axes: { type: "string" },
      "baseline-runs": { type: "string" },
      repeats: { type: "string" },
      "confirm-runs": { type: "string" },
      timezones: { type: "string" },
      locales: { type: "string" },
      seeds: { type: "string" },
      clocks: { type: "string" },
      shuffles: { type: "string" },
      "cpu-slowdown": { type: "string" },
      workers: { type: "string" },
      scope: { type: "string" },
      python: { type: "string" },
      jest: { type: "string" },
      go: { type: "string" },
      "runner-arg": { type: "string", multiple: true },
      timeout: { type: "string" },
      json: { type: "string" },
      markdown: { type: "string" },
      quiet: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  if (v.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (v.version) {
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }
  const runner = v.runner as RunnerName | undefined;
  if (!runner || !["pytest", "jest", "go"].includes(runner)) throw new Error("--runner must be pytest, jest or go (see --help)");
  const cwd = path.resolve(v.cwd ?? ".");
  const axes = list(v.axes, [...ALL_AXES]) as AxisName[];
  for (const a of axes) if (!ALL_AXES.includes(a)) throw new Error(`unknown axis ${a}; choose from ${ALL_AXES.join(", ")}`);

  let tests = positionals;
  if (v.from) tests = [...tests, ...failedFromReport(readFileSync(v.from, "utf8"), runner, cwd)];
  tests = [...new Set(tests)];
  const maxTests = int(v["max-tests"], 5, "max-tests");
  if (tests.length > maxTests) {
    process.stderr.write(`flipfactor: ${tests.length} tests given, diagnosing the first ${maxTests} (--max-tests)\n`);
    tests = tests.slice(0, maxTests);
  }

  const inherited = {
    tz: canonicalTz(process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"),
    locale: process.env.LC_ALL || process.env.LANG || "C",
  };
  const log = v.quiet ? () => {} : (msg: string) => process.stderr.write(`${msg}\n`);
  const timeoutMs = int(v.timeout, 300, "timeout") * 1000;
  const engine = new Engine(makeAdapter(runner, cwd, v, timeoutMs), {
    axes,
    baselineRuns: Math.max(1, int(v["baseline-runs"], DEFAULTS.baselineRuns, "baseline-runs")),
    repeats: Math.max(1, int(v.repeats, DEFAULTS.repeats, "repeats")),
    confirmRuns: int(v["confirm-runs"], DEFAULTS.confirmRuns, "confirm-runs"),
    timezones: list(v.timezones, DEFAULTS.timezones).filter((tz) => canonicalTz(tz) !== inherited.tz),
    locales: list(v.locales, DEFAULTS.locales),
    seeds: list(v.seeds, DEFAULTS.seeds.map(String)).map(Number),
    clocks: list(v.clocks, defaultClocks()),
    shuffles: int(v.shuffles, DEFAULTS.shuffles, "shuffles"),
    cpuSlowdown: Math.max(2, int(v["cpu-slowdown"], DEFAULTS.cpuSlowdown, "cpu-slowdown")),
    workers: Math.max(2, int(v.workers, DEFAULTS.workers, "workers")),
    scope: v.scope,
    inheritedTz: inherited.tz,
    inheritedLocale: inherited.locale,
    log,
  });

  const started = Date.now();
  const report: Report = {
    tool: "flipfactor",
    version: pkg.version,
    runner,
    cwd,
    startedAt: new Date(started).toISOString(),
    wallMs: 0,
    totalRuns: 0,
    inherited,
    tests: [],
  };
  if (tests.length === 0) {
    log("flipfactor: no tests to diagnose");
  }
  for (const t of tests) report.tests.push(await engine.diagnose(t));
  report.wallMs = Date.now() - started;
  report.totalRuns = engine.runs;

  if (v.json) writeFileSync(v.json, toJson(report));
  if (v.markdown) writeFileSync(v.markdown, toMarkdown(report));
  process.stdout.write(toText(report));
  return 0;
}

const invokedDirectly = typeof require !== "undefined" && require.main === module;
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      process.stderr.write(`flipfactor: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(2);
    },
  );
}
