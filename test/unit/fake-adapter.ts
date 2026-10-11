import type { Adapter, Capabilities, RunResult, RunSpec, TestOutcome } from "../../src/types.js";

export type Oracle = (spec: RunSpec, test: string, runIndex: number) => boolean; // true = fail

/** In-memory adapter: tests are names, outcomes come from an oracle. */
export class FakeAdapter implements Adapter {
  readonly name = "pytest" as const;
  calls: RunSpec[] = [];

  constructor(
    private readonly tests: string[],
    private readonly oracle: Oracle,
    private readonly caps: Partial<Capabilities> = {},
  ) {}

  async capabilities(): Promise<Capabilities> {
    return { exactOrder: true, shuffle: true, parallel: true, seed: true, clock: true, locale: true, ...this.caps };
  }

  async neighbours(): Promise<string[]> {
    return this.tests;
  }

  async run(spec: RunSpec): Promise<RunResult> {
    const index = this.calls.length;
    this.calls.push(spec);
    const selected = spec.scope ? this.tests : spec.tests;
    const outcomes = new Map<string, TestOutcome>();
    for (const t of selected) outcomes.set(t, { outcome: this.oracle(spec, t, index) ? "fail" : "pass", durationMs: spec.cpuSlowdown ? 400 : 50 });
    return { outcomes, exitCode: 0, wallMs: 1 };
  }

  reproCommand(spec: RunSpec): string {
    return `fake ${spec.tests.join(" ")}`;
  }

  defaultScope(): string {
    return "tests";
  }
}
