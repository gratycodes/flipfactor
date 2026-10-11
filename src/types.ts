export type Outcome = "pass" | "fail" | "skip" | "missing";

export type RunnerName = "pytest" | "jest" | "go";

export type AxisName = "order" | "parallel" | "timezone" | "locale" | "seed" | "clock" | "cpu";

export const ALL_AXES: readonly AxisName[] = ["order", "parallel", "timezone", "locale", "seed", "clock", "cpu"];

/** One concrete test-runner invocation. */
export interface RunSpec {
  /** Tests to run, in the order they should run. */
  tests: string[];
  /** Extra environment variables layered over the inherited environment. */
  env: Record<string, string>;
  /** Shuffle seed for the runner's own order randomisation. */
  shuffleSeed?: number;
  /** Seed for the language's default PRNG (random / Math.random). */
  rngSeed?: number;
  /** Pretend "now" is this ISO-8601 instant. */
  clock?: string;
  /** Number of runner workers; 1 means serial. */
  workers?: number;
  /** Run the whole scope path instead of `tests` (used for the parallelism axis). */
  scope?: string;
  /** Slow the CPU down by this factor (CPU hogs pinned to the same core). */
  cpuSlowdown?: number;
}

export interface TestOutcome {
  outcome: Outcome;
  durationMs: number;
  message?: string;
}

export interface RunResult {
  outcomes: Map<string, TestOutcome>;
  exitCode: number | null;
  wallMs: number;
  /** Set when the runner itself broke (crash, timeout, unparsable output). */
  error?: string;
}

export interface Capabilities {
  /** Can run an arbitrary permutation of tests (not just file order). */
  exactOrder: boolean;
  shuffle: boolean;
  parallel: boolean;
  seed: boolean;
  clock: boolean;
  locale: boolean;
}

export interface Adapter {
  readonly name: RunnerName;
  capabilities(): Promise<Capabilities>;
  /** All tests in the target's file/package, in the runner's default order. */
  neighbours(target: string): Promise<string[]>;
  run(spec: RunSpec): Promise<RunResult>;
  /** A shell command a human can paste to reproduce `spec`. */
  reproCommand(spec: RunSpec): string;
  /** Default scope for the parallelism axis (a directory or package pattern). */
  defaultScope(target: string): string;
}

/** Failure counts for one experimental condition. */
export interface Evidence {
  label: string;
  runs: number;
  failed: number;
  medianMs?: number;
}

export type Strength = "deterministic" | "elevated" | "none" | "skipped";

export interface Finding {
  axis: AxisName;
  strength: Strength;
  summary: string;
  evidence: Evidence[];
  repro?: string;
  /** For the order axis: the polluting (or enabling) test, when one was isolated. */
  culprit?: string;
}

export type Classification =
  | "flaky"
  | "environment-dependent"
  | "broken"
  | "flaky-unexplained"
  | "not-reproduced";

export interface TestDiagnosis {
  id: string;
  classification: Classification;
  headline: string;
  baseline: { isolated: Evidence; suite: Evidence };
  findings: Finding[];
  runs: number;
}

export interface Report {
  tool: "flipfactor";
  version: string;
  runner: RunnerName;
  cwd: string;
  startedAt: string;
  wallMs: number;
  totalRuns: number;
  inherited: { tz: string; locale: string };
  tests: TestDiagnosis[];
}
