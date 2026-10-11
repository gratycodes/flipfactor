import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { exec, envPrefix, shellQuote } from "../exec.js";
import { faketimeEnv, findLibfaketime } from "../faketime.js";
import type { Adapter, Capabilities, RunResult, RunSpec, TestOutcome } from "../types.js";
import { resourceDir } from "../resources.js";

export interface PytestOptions {
  cwd: string;
  python: string;
  extraArgs: string[];
  timeoutMs: number;
}

/** Parse the JSON-lines report written by flipfactor_pytest.plugin. */
export function parsePluginReport(text: string): Map<string, TestOutcome> {
  const out = new Map<string, TestOutcome>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as { id: string; outcome: TestOutcome["outcome"]; durationMs: number; message?: string };
    out.set(row.id, { outcome: row.outcome, durationMs: row.durationMs, message: row.message });
  }
  return out;
}

/** Node ids from `pytest --collect-only -q` output. */
export function parseCollectOnly(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.includes("::") && !l.startsWith("<") && !/^\d+ tests? collected/.test(l));
}

export class PytestAdapter implements Adapter {
  readonly name = "pytest" as const;
  private caps?: Capabilities;

  constructor(private readonly opts: PytestOptions) {}

  private pluginEnv(): Record<string, string> {
    const pluginDir = path.join(resourceDir(), "python");
    const existing = process.env.PYTHONPATH;
    return { PYTHONPATH: existing ? `${pluginDir}${path.delimiter}${existing}` : pluginDir };
  }

  private baseArgs(): string[] {
    return [
      "-m",
      "pytest",
      "-p",
      "flipfactor_pytest.plugin",
      "-p",
      "no:randomly",
      "-p",
      "no:cacheprovider",
      "-q",
      "--no-header",
      "-o",
      "console_output_style=classic",
      ...this.opts.extraArgs,
    ];
  }

  async capabilities(): Promise<Capabilities> {
    if (!this.caps) {
      const xdist = await exec(this.opts.python, ["-c", "import xdist"], { cwd: this.opts.cwd, timeoutMs: 30_000 });
      this.caps = {
        exactOrder: true,
        shuffle: true,
        parallel: xdist.code === 0,
        seed: true,
        clock: findLibfaketime() !== undefined,
        // Python only follows LANG/LC_ALL after setlocale(), which few tests call.
        locale: true,
      };
    }
    return this.caps;
  }

  async neighbours(target: string): Promise<string[]> {
    const file = target.split("::")[0] ?? target;
    const res = await exec(this.opts.python, [...this.baseArgs(), "--collect-only", file], {
      cwd: this.opts.cwd,
      env: this.pluginEnv(),
      timeoutMs: this.opts.timeoutMs,
    });
    const ids = parseCollectOnly(res.stdout);
    if (ids.length === 0) throw new Error(`pytest collected nothing from ${file}:\n${res.stdout}${res.stderr}`);
    return ids;
  }

  private specEnv(spec: RunSpec): Record<string, string> {
    const env: Record<string, string> = { ...spec.env };
    if (!spec.scope) env.FLIPFACTOR_ORDER = JSON.stringify(spec.tests);
    if (spec.shuffleSeed !== undefined) env.FLIPFACTOR_SHUFFLE = String(spec.shuffleSeed);
    if (spec.rngSeed !== undefined) {
      env.FLIPFACTOR_SEED = String(spec.rngSeed);
      env.PYTHONHASHSEED = String(spec.rngSeed);
    }
    if (spec.clock) {
      const lib = findLibfaketime();
      if (!lib) throw new Error("clock axis needs libfaketime");
      Object.assign(env, faketimeEnv(lib, spec.clock));
    }
    return env;
  }

  private specArgs(spec: RunSpec): string[] {
    const args = spec.scope ? [spec.scope] : [...new Set(spec.tests)];
    if (spec.workers && spec.workers > 1) args.unshift("-n", String(spec.workers));
    else if (this.caps?.parallel) args.unshift("-p", "no:xdist");
    return args;
  }

  async run(spec: RunSpec): Promise<RunResult> {
    const dir = mkdtempSync(path.join(tmpdir(), "flipfactor-"));
    const report = path.join(dir, "report.jsonl");
    try {
      const env = { ...this.pluginEnv(), ...this.specEnv(spec), FLIPFACTOR_REPORT: report };
      const res = await exec(this.opts.python, [...this.baseArgs(), ...this.specArgs(spec)], {
        cwd: this.opts.cwd,
        env,
        timeoutMs: this.opts.timeoutMs,
        cpuSlowdown: spec.cpuSlowdown,
      });
      if (res.timedOut) return { outcomes: new Map(), exitCode: res.code, wallMs: res.wallMs, error: "timed out" };
      if (!existsSync(report)) {
        const tail = (res.stdout + res.stderr).trim().split("\n").slice(-8).join("\n");
        return { outcomes: new Map(), exitCode: res.code, wallMs: res.wallMs, error: `pytest wrote no report:\n${tail}` };
      }
      return { outcomes: parsePluginReport(readFileSync(report, "utf8")), exitCode: res.code, wallMs: res.wallMs };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  reproCommand(spec: RunSpec): string {
    const env: Record<string, string> = { ...this.specEnv(spec) };
    // pytest runs node ids in command-line order, so ordering needs no plugin.
    delete env.FLIPFACTOR_ORDER;
    const needsPlugin = spec.rngSeed !== undefined || spec.shuffleSeed !== undefined;
    if (needsPlugin) env.PYTHONPATH = path.join(resourceDir(), "python");
    const args = ["-m", "pytest", ...(needsPlugin ? ["-p", "flipfactor_pytest.plugin"] : []), "-p", "no:randomly", ...this.specArgs(spec)].filter(
      (a, i, all) => !(a === "-p" && all[i + 1] === "no:xdist") && !(a === "no:xdist" && all[i - 1] === "-p"),
    );
    const cmd = [this.opts.python, ...args].map(shellQuote).join(" ");
    const wrapped = spec.cpuSlowdown ? `npx flipfactor slow ${spec.cpuSlowdown} -- ${cmd}` : cmd;
    const prefix = envPrefix(env);
    return prefix ? `${prefix} ${wrapped}` : wrapped;
  }

  defaultScope(target: string): string {
    return path.dirname(target.split("::")[0] ?? target) || ".";
  }
}
