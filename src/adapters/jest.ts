import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exec, envPrefix, shellQuote } from "../exec.js";
import { resourceDir } from "../resources.js";
import type { Adapter, Capabilities, RunResult, RunSpec, TestOutcome } from "../types.js";

export interface JestOptions {
  cwd: string;
  jestBin?: string;
  extraArgs: string[];
  timeoutMs: number;
}

interface JestAssertion {
  fullName: string;
  status: string;
  duration?: number | null;
  failureMessages?: string[];
}

interface JestJson {
  testResults: { name: string; assertionResults: JestAssertion[]; message?: string; status?: string }[];
}

export function splitId(id: string): { file: string; name: string } {
  const i = id.indexOf("::");
  if (i < 0) throw new Error(`Jest test ids look like <file>::<full test name>, got: ${id}`);
  return { file: id.slice(0, i), name: id.slice(i + 2) };
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function namePattern(names: string[]): string {
  return `^(?:${[...new Set(names)].map(escapeRegex).join("|")})$`;
}

const STATUS: Record<string, TestOutcome["outcome"]> = {
  passed: "pass",
  failed: "fail",
  pending: "skip",
  skipped: "skip",
  todo: "skip",
  disabled: "skip",
  focused: "pass",
};

/** Map Jest's --json output to flipfactor ids (<relative file>::<full name>). */
export function parseJestJson(json: JestJson, cwd: string): Map<string, TestOutcome> {
  const out = new Map<string, TestOutcome>();
  for (const file of json.testResults) {
    const rel = path.relative(cwd, file.name).split(path.sep).join("/");
    if (file.assertionResults.length === 0 && file.status === "failed") {
      out.set(`${rel}::*`, { outcome: "fail", durationMs: 0, message: (file.message ?? "").trim().split("\n")[0] });
    }
    for (const a of file.assertionResults) {
      const firstLine = a.failureMessages?.[0]?.trim().split("\n")[0];
      out.set(`${rel}::${a.fullName}`, {
        outcome: STATUS[a.status] ?? "skip",
        durationMs: a.duration ?? 0,
        ...(firstLine ? { message: firstLine.slice(0, 300) } : {}),
      });
    }
  }
  return out;
}

export function findJestBin(cwd: string): string | undefined {
  let dir = path.resolve(cwd);
  for (;;) {
    const candidate = path.join(dir, "node_modules", "jest", "bin", "jest.js");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Locate the project's own Jest config so it can be wrapped, not replaced. */
export function findJestConfig(cwd: string): { kind: "file" | "package" | "none"; file?: string } {
  for (const name of ["jest.config.js", "jest.config.cjs", "jest.config.mjs", "jest.config.json"]) {
    const file = path.join(cwd, name);
    if (existsSync(file)) return { kind: "file", file };
  }
  const pkg = path.join(cwd, "package.json");
  if (existsSync(pkg)) {
    const parsed = JSON.parse(readFileSync(pkg, "utf8")) as { jest?: unknown };
    if (parsed.jest) return { kind: "package", file: pkg };
  }
  return { kind: "none" };
}

/**
 * An .mjs config that loads the project's config and appends flipfactor's
 * setup file, so seeding and the clock shim work without dropping the
 * project's own setupFilesAfterEnv.
 */
export function wrapperConfigSource(cwd: string, setupFile: string): string {
  const found = findJestConfig(cwd);
  let load = "const base = {};";
  if (found.kind === "package") {
    load = `const base = JSON.parse(readFileSync(${JSON.stringify(found.file)}, "utf8")).jest;`;
  } else if (found.kind === "file" && found.file?.endsWith(".json")) {
    load = `const base = JSON.parse(readFileSync(${JSON.stringify(found.file)}, "utf8"));`;
  } else if (found.kind === "file" && found.file) {
    load = `const mod = await import(${JSON.stringify(pathToFileURL(found.file).href)});\nconst base = mod.default ?? mod;`;
  }
  return `import { readFileSync } from "node:fs";
${load}
export default async () => {
  const cfg = typeof base === "function" ? await base() : { ...base };
  const rootDir = cfg.rootDir ? new URL(cfg.rootDir, ${JSON.stringify(pathToFileURL(cwd + path.sep).href)}).pathname : ${JSON.stringify(cwd)};
  return { ...cfg, rootDir, setupFilesAfterEnv: [...(cfg.setupFilesAfterEnv ?? []), ${JSON.stringify(setupFile)}] };
};
`;
}

export class JestAdapter implements Adapter {
  readonly name = "jest" as const;
  private readonly jestBin: string;

  constructor(private readonly opts: JestOptions) {
    const bin = opts.jestBin ?? findJestBin(opts.cwd);
    if (!bin) throw new Error(`could not find node_modules/jest from ${opts.cwd}; pass --jest <path to jest.js>`);
    this.jestBin = bin;
  }

  async capabilities(): Promise<Capabilities> {
    // Jest runs tests inside a file in declaration order; a name filter keeps
    // that order, so arbitrary permutations are not possible.
    return { exactOrder: false, shuffle: true, parallel: true, seed: true, clock: true, locale: true };
  }

  async neighbours(target: string): Promise<string[]> {
    const { file } = splitId(target);
    const res = await this.run({ tests: [], env: {}, scope: file, workers: 1 });
    const ids = [...res.outcomes.keys()].filter((id) => id.startsWith(`${file}::`) && !id.endsWith("::*"));
    if (ids.length === 0) throw new Error(`Jest found no tests in ${file}${res.error ? `: ${res.error}` : ""}`);
    return ids;
  }

  private specEnv(spec: RunSpec): Record<string, string> {
    const env: Record<string, string> = { ...spec.env };
    if (spec.rngSeed !== undefined) env.FLIPFACTOR_SEED = String(spec.rngSeed);
    if (spec.clock) env.FLIPFACTOR_CLOCK = spec.clock;
    return env;
  }

  private specArgs(spec: RunSpec): string[] {
    const args: string[] = ["--ci"];
    if (spec.scope) {
      const abs = path.resolve(this.opts.cwd, spec.scope);
      const isFile = existsSync(abs) && statSync(abs).isFile();
      // A directory becomes a path pattern; "." means "everything".
      if (isFile) args.push("--runTestsByPath", spec.scope);
      else if (path.relative(this.opts.cwd, abs) !== "") args.push("--", escapeRegex(path.relative(this.opts.cwd, abs)));
    } else {
      const parts = spec.tests.map(splitId);
      args.push("--testNamePattern", namePattern(parts.map((p) => p.name)));
      args.push("--runTestsByPath", ...new Set(parts.map((p) => p.file)));
    }
    if (spec.workers && spec.workers > 1) args.unshift(`--maxWorkers=${spec.workers}`);
    else args.unshift("--runInBand");
    if (spec.shuffleSeed !== undefined) args.unshift("--randomize", `--seed=${spec.shuffleSeed}`);
    return [...this.opts.extraArgs, ...args];
  }

  async run(spec: RunSpec): Promise<RunResult> {
    const dir = mkdtempSync(path.join(tmpdir(), "flipfactor-jest-"));
    const out = path.join(dir, "out.json");
    const config = path.join(dir, "jest.flipfactor.config.mjs");
    writeFileSync(config, wrapperConfigSource(this.opts.cwd, path.join(resourceDir(), "runtime", "jest-setup.cjs")));
    try {
      const args = [this.jestBin, "--config", config, "--json", `--outputFile=${out}`, ...this.specArgs(spec)];
      const res = await exec(process.execPath, args, {
        cwd: this.opts.cwd,
        env: this.specEnv(spec),
        timeoutMs: this.opts.timeoutMs,
        cpuSlowdown: spec.cpuSlowdown,
      });
      if (res.timedOut) return { outcomes: new Map(), exitCode: res.code, wallMs: res.wallMs, error: "timed out" };
      if (!existsSync(out)) {
        const tail = res.stderr.trim().split("\n").slice(-8).join("\n");
        return { outcomes: new Map(), exitCode: res.code, wallMs: res.wallMs, error: `jest wrote no report:\n${tail}` };
      }
      const outcomes = parseJestJson(JSON.parse(readFileSync(out, "utf8")) as JestJson, this.opts.cwd);
      // A file that failed to load fails every requested test in it.
      for (const id of spec.tests) {
        const crashed = outcomes.get(`${splitId(id).file}::*`);
        if (!outcomes.has(id) && crashed) outcomes.set(id, crashed);
      }
      return { outcomes, exitCode: res.code, wallMs: res.wallMs };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  reproCommand(spec: RunSpec): string {
    const env = this.specEnv(spec);
    const needsShim = spec.rngSeed !== undefined || spec.clock !== undefined;
    const args = ["npx", "jest", ...(needsShim ? ["--setupFilesAfterEnv", path.join(resourceDir(), "runtime", "jest-setup.cjs")] : []), ...this.specArgs(spec)];
    let cmd = args.map(shellQuote).join(" ");
    if (spec.cpuSlowdown) cmd = `npx flipfactor slow ${spec.cpuSlowdown} -- ${cmd}`;
    const prefix = envPrefix(env);
    return prefix ? `${prefix} ${cmd}` : cmd;
  }

  defaultScope(target: string): string {
    return path.dirname(splitId(target).file);
  }
}
