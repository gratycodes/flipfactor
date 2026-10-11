import { exec, envPrefix, shellQuote } from "../exec.js";
import type { Adapter, Capabilities, RunResult, RunSpec, TestOutcome } from "../types.js";
import { escapeRegex } from "./jest.js";

export interface GoOptions {
  cwd: string;
  goBin: string;
  extraArgs: string[];
  timeoutMs: number;
}

export function splitGoId(id: string): { pkg: string; name: string } {
  const i = id.indexOf("::");
  if (i < 0) throw new Error(`go test ids look like <package>::<TestName>, got: ${id}`);
  return { pkg: id.slice(0, i), name: id.slice(i + 2) };
}

interface GoEvent {
  Action: string;
  Package?: string;
  Test?: string;
  Elapsed?: number;
  Output?: string;
}

/**
 * Parse `go test -json`. Package import paths are mapped back to the
 * package pattern the user gave (./plugins) through `pkgAlias`.
 */
export function parseGoJson(stdout: string, pkgAlias: (importPath: string) => string): Map<string, TestOutcome> {
  const out = new Map<string, TestOutcome>();
  const lastOutput = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("{")) continue;
    let ev: GoEvent;
    try {
      ev = JSON.parse(line) as GoEvent;
    } catch {
      continue;
    }
    if (!ev.Test || ev.Test.includes("/") || !ev.Package) continue;
    const id = `${pkgAlias(ev.Package)}::${ev.Test}`;
    if (ev.Action === "output" && ev.Output && /^\s+\S+\.go:\d+:/.test(ev.Output)) lastOutput.set(id, ev.Output.trim());
    const outcome = ev.Action === "pass" ? "pass" : ev.Action === "fail" ? "fail" : ev.Action === "skip" ? "skip" : undefined;
    if (outcome) {
      const message = lastOutput.get(id);
      out.set(id, { outcome, durationMs: (ev.Elapsed ?? 0) * 1000, ...(message ? { message } : {}) });
    }
  }
  return out;
}

export class GoAdapter implements Adapter {
  readonly name = "go" as const;
  private modulePath?: string;

  constructor(private readonly opts: GoOptions) {}

  async capabilities(): Promise<Capabilities> {
    // Go reads the clock through the vDSO, so LD_PRELOAD tricks like
    // libfaketime do not reach it, and math/rand has no global seed knob.
    return { exactOrder: false, shuffle: true, parallel: true, seed: false, clock: false, locale: false };
  }

  private async module(): Promise<string> {
    if (this.modulePath === undefined) {
      const res = await exec(this.opts.goBin, ["list", "-m"], { cwd: this.opts.cwd, timeoutMs: 60_000 });
      this.modulePath = res.stdout.trim().split("\n")[0] ?? "";
    }
    return this.modulePath;
  }

  private alias = (mod: string) => (importPath: string) => {
    if (mod && importPath === mod) return ".";
    if (mod && importPath.startsWith(`${mod}/`)) return `./${importPath.slice(mod.length + 1)}`;
    return importPath;
  };

  async neighbours(target: string): Promise<string[]> {
    const { pkg } = splitGoId(target);
    const res = await exec(this.opts.goBin, ["test", "-list", ".*", pkg], { cwd: this.opts.cwd, timeoutMs: this.opts.timeoutMs });
    const names = res.stdout.split("\n").filter((l) => /^Test\w*$/.test(l.trim()));
    if (names.length === 0) throw new Error(`go test -list found no tests in ${pkg}:\n${res.stderr}`);
    return names.map((n) => `${pkg}::${n.trim()}`);
  }

  private specArgs(spec: RunSpec): string[] {
    const args = ["test", "-count=1", "-json", ...this.opts.extraArgs];
    args.push(`-p=${spec.workers && spec.workers > 1 ? spec.workers : 1}`);
    if (spec.shuffleSeed !== undefined) args.push(`-shuffle=${spec.shuffleSeed}`);
    if (spec.scope) {
      args.push(spec.scope);
    } else {
      const parts = spec.tests.map(splitGoId);
      args.push("-run", `^(?:${[...new Set(parts.map((p) => p.name))].map(escapeRegex).join("|")})$`);
      args.push(...new Set(parts.map((p) => p.pkg)));
    }
    return args;
  }

  async run(spec: RunSpec): Promise<RunResult> {
    const mod = await this.module();
    const res = await exec(this.opts.goBin, this.specArgs(spec), {
      cwd: this.opts.cwd,
      env: spec.env,
      timeoutMs: this.opts.timeoutMs,
      cpuSlowdown: spec.cpuSlowdown,
    });
    if (res.timedOut) return { outcomes: new Map(), exitCode: res.code, wallMs: res.wallMs, error: "timed out" };
    const outcomes = parseGoJson(res.stdout, this.alias(mod));
    if (outcomes.size === 0 && res.code !== 0) {
      return { outcomes, exitCode: res.code, wallMs: res.wallMs, error: res.stderr.trim().split("\n").slice(-8).join("\n") };
    }
    return { outcomes, exitCode: res.code, wallMs: res.wallMs };
  }

  reproCommand(spec: RunSpec): string {
    const args = this.specArgs(spec).filter((a) => a !== "-json");
    let cmd = ["go", ...args].map(shellQuote).join(" ");
    if (spec.cpuSlowdown) cmd = `npx flipfactor slow ${spec.cpuSlowdown} -- ${cmd}`;
    const prefix = envPrefix(spec.env);
    return prefix ? `${prefix} ${cmd}` : cmd;
  }

  defaultScope(_target: string): string {
    return "./...";
  }
}
