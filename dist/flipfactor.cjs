#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/cli.ts
var cli_exports = {};
__export(cli_exports, {
  canonicalTz: () => canonicalTz,
  main: () => main
});
module.exports = __toCommonJS(cli_exports);
var import_node_fs6 = require("node:fs");
var import_node_path5 = __toESM(require("node:path"), 1);
var import_node_util = require("node:util");

// package.json
var package_default = {
  name: "flipfactor",
  version: "0.1.0",
  description: "Re-runs a flaky test under controlled perturbations (order, timezone, locale, seed, clock, CPU load, parallelism) and reports which factor flips the result.",
  license: "MIT",
  author: "Gratus Antin",
  type: "module",
  bin: {
    flipfactor: "dist/flipfactor.cjs"
  },
  files: [
    "dist",
    "python/flipfactor_pytest",
    "runtime"
  ],
  engines: {
    node: ">=20"
  },
  scripts: {
    build: 'esbuild src/cli.ts --bundle --platform=node --target=node20 --format=cjs --outfile=dist/flipfactor.cjs --banner:js="#!/usr/bin/env node"',
    typecheck: "tsc --noEmit",
    lint: "eslint .",
    test: "vitest run test/unit",
    "test:e2e": "vitest run test/e2e"
  },
  devDependencies: {
    "@eslint/js": "^10.0.1",
    "@types/node": "^22.20.5",
    esbuild: "^0.28.2",
    eslint: "^10.12.0",
    globals: "^17.13.0",
    typescript: "5.9",
    "typescript-eslint": "^8.71.1",
    vitest: "^5.0.3"
  },
  repository: {
    type: "git",
    url: "git+https://github.com/gratycodes/flipfactor.git"
  },
  bugs: {
    url: "https://github.com/gratycodes/flipfactor/issues"
  },
  homepage: "https://github.com/gratycodes/flipfactor#readme",
  keywords: [
    "flaky-tests",
    "pytest",
    "jest",
    "go-test",
    "ci",
    "github-actions",
    "test-diagnosis"
  ]
};

// src/exec.ts
var import_node_child_process = require("node:child_process");
var tasksetAvailable;
function hasTaskset() {
  if (tasksetAvailable === void 0) {
    tasksetAvailable = process.platform === "linux" && (0, import_node_child_process.spawnSync)("taskset", ["-c", "0", "true"], { stdio: "ignore" }).status === 0;
  }
  return tasksetAvailable;
}
function startHogs(count, cpu) {
  const hogs = [];
  for (let i = 0; i < count; i++) {
    hogs.push(
      (0, import_node_child_process.spawn)("taskset", ["-c", cpu, process.execPath, "-e", "for(;;){}"], { stdio: "ignore", detached: false })
    );
  }
  return hogs;
}
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function exec(cmd, args, opts) {
  const env = { ...process.env, ...opts.env };
  let file = cmd;
  let argv = args;
  let hogs = [];
  if (opts.cpuSlowdown && opts.cpuSlowdown > 1) {
    if (!hasTaskset()) throw new Error("CPU slowdown needs Linux taskset");
    const cpu = "0";
    hogs = startHogs(opts.cpuSlowdown - 1, cpu);
    await sleep(150);
    file = "taskset";
    argv = ["-c", cpu, cmd, ...args];
  }
  const started = performance.now();
  try {
    return await new Promise((resolve, reject) => {
      const child = (0, import_node_child_process.spawn)(file, argv, { cwd: opts.cwd, env, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      child.stdout.on("data", (d) => stdout += d.toString());
      child.stderr.on("data", (d) => stderr += d.toString());
      const timer = opts.timeoutMs ? setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, opts.timeoutMs) : void 0;
      child.on("error", (err) => {
        if (timer) clearTimeout(timer);
        reject(err);
      });
      child.on("close", (code) => {
        if (timer) clearTimeout(timer);
        resolve({ code, stdout, stderr, wallMs: performance.now() - started, timedOut });
      });
    });
  } finally {
    for (const h of hogs) h.kill("SIGKILL");
  }
}
function shellQuote(value) {
  if (/^[\w@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
function envPrefix(env) {
  return Object.entries(env).map(([k, v]) => `${k}=${shellQuote(v)}`).join(" ");
}

// src/adapters/jest.ts
var import_node_fs2 = require("node:fs");
var import_node_os = require("node:os");
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_url = require("node:url");

// src/resources.ts
var import_node_fs = require("node:fs");
var import_node_path = __toESM(require("node:path"), 1);
function resourceDir() {
  const starts = [process.env.FLIPFACTOR_HOME, typeof __dirname === "string" ? __dirname : void 0, process.cwd()];
  for (const start of starts) {
    if (!start) continue;
    for (const candidate of [import_node_path.default.resolve(start), import_node_path.default.resolve(start, ".."), import_node_path.default.resolve(start, "../..")]) {
      if ((0, import_node_fs.existsSync)(import_node_path.default.join(candidate, "runtime", "jest-setup.cjs"))) return candidate;
    }
  }
  throw new Error("flipfactor resources (python/, runtime/) not found; set FLIPFACTOR_HOME");
}

// src/adapters/jest.ts
function splitId(id) {
  const i = id.indexOf("::");
  if (i < 0) throw new Error(`Jest test ids look like <file>::<full test name>, got: ${id}`);
  return { file: id.slice(0, i), name: id.slice(i + 2) };
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function namePattern(names) {
  return `^(?:${[...new Set(names)].map(escapeRegex).join("|")})$`;
}
var STATUS = {
  passed: "pass",
  failed: "fail",
  pending: "skip",
  skipped: "skip",
  todo: "skip",
  disabled: "skip",
  focused: "pass"
};
function parseJestJson(json, cwd) {
  const out = /* @__PURE__ */ new Map();
  for (const file of json.testResults) {
    const rel = import_node_path2.default.relative(cwd, file.name).split(import_node_path2.default.sep).join("/");
    if (file.assertionResults.length === 0 && file.status === "failed") {
      out.set(`${rel}::*`, { outcome: "fail", durationMs: 0, message: (file.message ?? "").trim().split("\n")[0] });
    }
    for (const a of file.assertionResults) {
      const firstLine = a.failureMessages?.[0]?.trim().split("\n")[0];
      out.set(`${rel}::${a.fullName}`, {
        outcome: STATUS[a.status] ?? "skip",
        durationMs: a.duration ?? 0,
        ...firstLine ? { message: firstLine.slice(0, 300) } : {}
      });
    }
  }
  return out;
}
function findJestBin(cwd) {
  let dir = import_node_path2.default.resolve(cwd);
  for (; ; ) {
    const candidate = import_node_path2.default.join(dir, "node_modules", "jest", "bin", "jest.js");
    if ((0, import_node_fs2.existsSync)(candidate)) return candidate;
    const parent = import_node_path2.default.dirname(dir);
    if (parent === dir) return void 0;
    dir = parent;
  }
}
function findJestConfig(cwd) {
  for (const name of ["jest.config.js", "jest.config.cjs", "jest.config.mjs", "jest.config.json"]) {
    const file = import_node_path2.default.join(cwd, name);
    if ((0, import_node_fs2.existsSync)(file)) return { kind: "file", file };
  }
  for (const name of ["jest.config.ts", "jest.config.mts", "jest.config.cts"]) {
    if ((0, import_node_fs2.existsSync)(import_node_path2.default.join(cwd, name))) {
      throw new Error(`${name}: TypeScript Jest configs are not supported yet; compile it to jest.config.js or move it into package.json`);
    }
  }
  const pkg = import_node_path2.default.join(cwd, "package.json");
  if ((0, import_node_fs2.existsSync)(pkg)) {
    const parsed = JSON.parse((0, import_node_fs2.readFileSync)(pkg, "utf8"));
    if (parsed.jest) return { kind: "package", file: pkg };
  }
  return { kind: "none" };
}
function wrapperConfigSource(cwd, setupFile) {
  const found = findJestConfig(cwd);
  let load = "const base = {};";
  if (found.kind === "package") {
    load = `const base = JSON.parse(readFileSync(${JSON.stringify(found.file)}, "utf8")).jest;`;
  } else if (found.kind === "file" && found.file?.endsWith(".json")) {
    load = `const base = JSON.parse(readFileSync(${JSON.stringify(found.file)}, "utf8"));`;
  } else if (found.kind === "file" && found.file) {
    load = `const mod = await import(${JSON.stringify((0, import_node_url.pathToFileURL)(found.file).href)});
const base = mod.default ?? mod;`;
  }
  return `import { readFileSync } from "node:fs";
${load}
export default async () => {
  const cfg = typeof base === "function" ? await base() : { ...base };
  const rootDir = cfg.rootDir ? new URL(cfg.rootDir, ${JSON.stringify((0, import_node_url.pathToFileURL)(cwd + import_node_path2.default.sep).href)}).pathname : ${JSON.stringify(cwd)};
  return { ...cfg, rootDir, setupFilesAfterEnv: [...(cfg.setupFilesAfterEnv ?? []), ${JSON.stringify(setupFile)}] };
};
`;
}
var JestAdapter = class {
  constructor(opts) {
    this.opts = opts;
    const bin = opts.jestBin ?? findJestBin(opts.cwd);
    if (!bin) throw new Error(`could not find node_modules/jest from ${opts.cwd}; pass --jest <path to jest.js>`);
    this.jestBin = bin;
  }
  opts;
  name = "jest";
  jestBin;
  async capabilities() {
    return { exactOrder: false, shuffle: true, parallel: true, seed: true, clock: true, locale: true };
  }
  async neighbours(target) {
    const { file } = splitId(target);
    const res = await this.run({ tests: [], env: {}, scope: file, workers: 1 });
    const ids = [...res.outcomes.keys()].filter((id) => id.startsWith(`${file}::`) && !id.endsWith("::*"));
    if (ids.length === 0) throw new Error(`Jest found no tests in ${file}${res.error ? `: ${res.error}` : ""}`);
    return ids;
  }
  specEnv(spec) {
    const env = { ...spec.env };
    if (spec.rngSeed !== void 0) env.FLIPFACTOR_SEED = String(spec.rngSeed);
    if (spec.clock) env.FLIPFACTOR_CLOCK = spec.clock;
    return env;
  }
  specArgs(spec) {
    const args = ["--ci"];
    if (spec.scope) {
      const abs = import_node_path2.default.resolve(this.opts.cwd, spec.scope);
      const isFile = (0, import_node_fs2.existsSync)(abs) && (0, import_node_fs2.statSync)(abs).isFile();
      if (isFile) args.push("--runTestsByPath", spec.scope);
      else if (import_node_path2.default.relative(this.opts.cwd, abs) !== "") args.push("--", escapeRegex(import_node_path2.default.relative(this.opts.cwd, abs)));
    } else {
      const parts = spec.tests.map(splitId);
      args.push("--testNamePattern", namePattern(parts.map((p) => p.name)));
      args.push("--runTestsByPath", ...new Set(parts.map((p) => p.file)));
    }
    if (spec.workers && spec.workers > 1) args.unshift(`--maxWorkers=${spec.workers}`);
    else args.unshift("--runInBand");
    if (spec.shuffleSeed !== void 0) args.unshift("--randomize", `--seed=${spec.shuffleSeed}`);
    return [...this.opts.extraArgs, ...args];
  }
  async run(spec) {
    const dir = (0, import_node_fs2.mkdtempSync)(import_node_path2.default.join((0, import_node_os.tmpdir)(), "flipfactor-jest-"));
    const out = import_node_path2.default.join(dir, "out.json");
    const config = import_node_path2.default.join(dir, "jest.flipfactor.config.mjs");
    (0, import_node_fs2.writeFileSync)(config, wrapperConfigSource(this.opts.cwd, import_node_path2.default.join(resourceDir(), "runtime", "jest-setup.cjs")));
    try {
      const args = [this.jestBin, "--config", config, "--json", `--outputFile=${out}`, ...this.specArgs(spec)];
      const res = await exec(process.execPath, args, {
        cwd: this.opts.cwd,
        env: this.specEnv(spec),
        timeoutMs: this.opts.timeoutMs,
        cpuSlowdown: spec.cpuSlowdown
      });
      if (res.timedOut) return { outcomes: /* @__PURE__ */ new Map(), exitCode: res.code, wallMs: res.wallMs, error: "timed out" };
      if (!(0, import_node_fs2.existsSync)(out)) {
        const tail = res.stderr.trim().split("\n").slice(-8).join("\n");
        return { outcomes: /* @__PURE__ */ new Map(), exitCode: res.code, wallMs: res.wallMs, error: `jest wrote no report:
${tail}` };
      }
      const outcomes = parseJestJson(JSON.parse((0, import_node_fs2.readFileSync)(out, "utf8")), this.opts.cwd);
      for (const id of spec.tests) {
        const crashed = outcomes.get(`${splitId(id).file}::*`);
        if (!outcomes.has(id) && crashed) outcomes.set(id, crashed);
      }
      return { outcomes, exitCode: res.code, wallMs: res.wallMs };
    } finally {
      (0, import_node_fs2.rmSync)(dir, { recursive: true, force: true });
    }
  }
  reproCommand(spec) {
    const env = this.specEnv(spec);
    const needsShim = spec.rngSeed !== void 0 || spec.clock !== void 0;
    const args = ["npx", "jest", ...needsShim ? ["--setupFilesAfterEnv", import_node_path2.default.join(resourceDir(), "runtime", "jest-setup.cjs")] : [], ...this.specArgs(spec)];
    let cmd = args.map(shellQuote).join(" ");
    if (spec.cpuSlowdown) cmd = `npx flipfactor slow ${spec.cpuSlowdown} -- ${cmd}`;
    const prefix = envPrefix(env);
    return prefix ? `${prefix} ${cmd}` : cmd;
  }
  defaultScope(target) {
    return import_node_path2.default.dirname(splitId(target).file);
  }
};

// src/adapters/go.ts
function splitGoId(id) {
  const i = id.indexOf("::");
  if (i < 0) throw new Error(`go test ids look like <package>::<TestName>, got: ${id}`);
  return { pkg: id.slice(0, i), name: id.slice(i + 2) };
}
function parseGoJson(stdout, pkgAlias) {
  const out = /* @__PURE__ */ new Map();
  const lastOutput = /* @__PURE__ */ new Map();
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("{")) continue;
    let ev2;
    try {
      ev2 = JSON.parse(line);
    } catch {
      continue;
    }
    if (!ev2.Test || ev2.Test.includes("/") || !ev2.Package) continue;
    const id = `${pkgAlias(ev2.Package)}::${ev2.Test}`;
    if (ev2.Action === "output" && ev2.Output && /^\s+\S+\.go:\d+:/.test(ev2.Output)) lastOutput.set(id, ev2.Output.trim());
    const outcome = ev2.Action === "pass" ? "pass" : ev2.Action === "fail" ? "fail" : ev2.Action === "skip" ? "skip" : void 0;
    if (outcome) {
      const message = lastOutput.get(id);
      out.set(id, { outcome, durationMs: (ev2.Elapsed ?? 0) * 1e3, ...message ? { message } : {} });
    }
  }
  return out;
}
var GoAdapter = class {
  constructor(opts) {
    this.opts = opts;
  }
  opts;
  name = "go";
  modulePath;
  async capabilities() {
    return { exactOrder: false, shuffle: true, parallel: true, seed: false, clock: false, locale: false };
  }
  async module() {
    if (this.modulePath === void 0) {
      const res = await exec(this.opts.goBin, ["list", "-m"], { cwd: this.opts.cwd, timeoutMs: 6e4 });
      this.modulePath = res.stdout.trim().split("\n")[0] ?? "";
    }
    return this.modulePath;
  }
  alias = (mod) => (importPath) => {
    if (mod && importPath === mod) return ".";
    if (mod && importPath.startsWith(`${mod}/`)) return `./${importPath.slice(mod.length + 1)}`;
    return importPath;
  };
  async neighbours(target) {
    const { pkg } = splitGoId(target);
    const res = await exec(this.opts.goBin, ["test", "-list", ".*", pkg], { cwd: this.opts.cwd, timeoutMs: this.opts.timeoutMs });
    const names = res.stdout.split("\n").filter((l) => /^Test\w*$/.test(l.trim()));
    if (names.length === 0) throw new Error(`go test -list found no tests in ${pkg}:
${res.stderr}`);
    return names.map((n) => `${pkg}::${n.trim()}`);
  }
  specArgs(spec) {
    const args = ["test", "-count=1", "-json", ...this.opts.extraArgs];
    args.push(`-p=${spec.workers && spec.workers > 1 ? spec.workers : 1}`);
    if (spec.shuffleSeed !== void 0) args.push(`-shuffle=${spec.shuffleSeed}`);
    if (spec.scope) {
      args.push(spec.scope);
    } else {
      const parts = spec.tests.map(splitGoId);
      args.push("-run", `^(?:${[...new Set(parts.map((p) => p.name))].map(escapeRegex).join("|")})$`);
      args.push(...new Set(parts.map((p) => p.pkg)));
    }
    return args;
  }
  async run(spec) {
    const mod = await this.module();
    const res = await exec(this.opts.goBin, this.specArgs(spec), {
      cwd: this.opts.cwd,
      env: spec.env,
      timeoutMs: this.opts.timeoutMs,
      cpuSlowdown: spec.cpuSlowdown
    });
    if (res.timedOut) return { outcomes: /* @__PURE__ */ new Map(), exitCode: res.code, wallMs: res.wallMs, error: "timed out" };
    const outcomes = parseGoJson(res.stdout, this.alias(mod));
    if (outcomes.size === 0 && res.code !== 0) {
      return { outcomes, exitCode: res.code, wallMs: res.wallMs, error: res.stderr.trim().split("\n").slice(-8).join("\n") };
    }
    return { outcomes, exitCode: res.code, wallMs: res.wallMs };
  }
  reproCommand(spec) {
    const args = this.specArgs(spec).filter((a) => a !== "-json");
    let cmd = ["go", ...args].map(shellQuote).join(" ");
    if (spec.cpuSlowdown) cmd = `npx flipfactor slow ${spec.cpuSlowdown} -- ${cmd}`;
    const prefix = envPrefix(spec.env);
    return prefix ? `${prefix} ${cmd}` : cmd;
  }
  defaultScope(_target) {
    return "./...";
  }
};

// src/adapters/pytest.ts
var import_node_fs4 = require("node:fs");
var import_node_os2 = require("node:os");
var import_node_path3 = __toESM(require("node:path"), 1);

// src/faketime.ts
var import_node_fs3 = require("node:fs");
var CANDIDATES = [
  "/usr/lib/x86_64-linux-gnu/faketime/libfaketime.so.1",
  "/usr/lib/aarch64-linux-gnu/faketime/libfaketime.so.1",
  "/usr/lib/faketime/libfaketime.so.1",
  "/usr/local/lib/faketime/libfaketime.so.1",
  "/opt/homebrew/lib/faketime/libfaketime.1.dylib"
];
function findLibfaketime(env = process.env) {
  const override = env.FLIPFACTOR_LIBFAKETIME;
  if (override) return (0, import_node_fs3.existsSync)(override) ? override : void 0;
  return CANDIDATES.find((p) => (0, import_node_fs3.existsSync)(p));
}
function faketimeEnv(lib, instant, now = Date.now()) {
  const preloadVar = lib.endsWith(".dylib") ? "DYLD_INSERT_LIBRARIES" : "LD_PRELOAD";
  const base = { [preloadVar]: lib, FAKETIME_DONT_FAKE_MONOTONIC: "1" };
  const local = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})$/.exec(instant);
  if (local) return { ...base, FAKETIME: `@${local[1]} ${local[2]}` };
  const target = Date.parse(instant);
  if (Number.isNaN(target)) throw new Error(`not an ISO-8601 instant: ${instant}`);
  const offset = Math.round((target - now) / 1e3);
  return { ...base, FAKETIME: `${offset >= 0 ? "+" : "-"}${Math.abs(offset)}` };
}

// src/adapters/pytest.ts
function parsePluginReport(text) {
  const out = /* @__PURE__ */ new Map();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    out.set(row.id, { outcome: row.outcome, durationMs: row.durationMs, message: row.message });
  }
  return out;
}
function parseCollectOnly(stdout) {
  return stdout.split("\n").map((l) => l.trim()).filter((l) => l.includes("::") && !l.startsWith("<") && !/^\d+ tests? collected/.test(l));
}
var PytestAdapter = class {
  constructor(opts) {
    this.opts = opts;
  }
  opts;
  name = "pytest";
  caps;
  pluginEnv() {
    const pluginDir = import_node_path3.default.join(resourceDir(), "python");
    const existing = process.env.PYTHONPATH;
    return { PYTHONPATH: existing ? `${pluginDir}${import_node_path3.default.delimiter}${existing}` : pluginDir };
  }
  baseArgs() {
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
      ...this.opts.extraArgs
    ];
  }
  async capabilities() {
    if (!this.caps) {
      const xdist = await exec(this.opts.python, ["-c", "import xdist"], { cwd: this.opts.cwd, timeoutMs: 3e4 });
      this.caps = {
        exactOrder: true,
        shuffle: true,
        parallel: xdist.code === 0,
        seed: true,
        clock: findLibfaketime() !== void 0,
        // Python only follows LANG/LC_ALL after setlocale(), which few tests call.
        locale: true
      };
    }
    return this.caps;
  }
  async neighbours(target) {
    const file = target.split("::")[0] ?? target;
    const res = await exec(this.opts.python, [...this.baseArgs(), "--collect-only", file], {
      cwd: this.opts.cwd,
      env: this.pluginEnv(),
      timeoutMs: this.opts.timeoutMs
    });
    const ids = parseCollectOnly(res.stdout);
    if (ids.length === 0) throw new Error(`pytest collected nothing from ${file}:
${res.stdout}${res.stderr}`);
    return ids;
  }
  specEnv(spec) {
    const env = { ...spec.env };
    if (!spec.scope) env.FLIPFACTOR_ORDER = JSON.stringify(spec.tests);
    if (spec.shuffleSeed !== void 0) env.FLIPFACTOR_SHUFFLE = String(spec.shuffleSeed);
    if (spec.rngSeed !== void 0) {
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
  specArgs(spec) {
    const args = spec.scope ? [spec.scope] : [...new Set(spec.tests)];
    if (spec.workers && spec.workers > 1) args.unshift("-n", String(spec.workers));
    else if (this.caps?.parallel) args.unshift("-p", "no:xdist");
    return args;
  }
  async run(spec) {
    const dir = (0, import_node_fs4.mkdtempSync)(import_node_path3.default.join((0, import_node_os2.tmpdir)(), "flipfactor-"));
    const report = import_node_path3.default.join(dir, "report.jsonl");
    try {
      const env = { ...this.pluginEnv(), ...this.specEnv(spec), FLIPFACTOR_REPORT: report };
      const res = await exec(this.opts.python, [...this.baseArgs(), ...this.specArgs(spec)], {
        cwd: this.opts.cwd,
        env,
        timeoutMs: this.opts.timeoutMs,
        cpuSlowdown: spec.cpuSlowdown
      });
      if (res.timedOut) return { outcomes: /* @__PURE__ */ new Map(), exitCode: res.code, wallMs: res.wallMs, error: "timed out" };
      if (!(0, import_node_fs4.existsSync)(report)) {
        const tail = (res.stdout + res.stderr).trim().split("\n").slice(-8).join("\n");
        return { outcomes: /* @__PURE__ */ new Map(), exitCode: res.code, wallMs: res.wallMs, error: `pytest wrote no report:
${tail}` };
      }
      return { outcomes: parsePluginReport((0, import_node_fs4.readFileSync)(report, "utf8")), exitCode: res.code, wallMs: res.wallMs };
    } finally {
      (0, import_node_fs4.rmSync)(dir, { recursive: true, force: true });
    }
  }
  reproCommand(spec) {
    const env = { ...this.specEnv(spec) };
    delete env.FLIPFACTOR_ORDER;
    const needsPlugin = spec.rngSeed !== void 0 || spec.shuffleSeed !== void 0;
    if (needsPlugin) env.PYTHONPATH = import_node_path3.default.join(resourceDir(), "python");
    const args = ["-m", "pytest", ...needsPlugin ? ["-p", "flipfactor_pytest.plugin"] : [], "-p", "no:randomly", ...this.specArgs(spec)].filter(
      (a, i, all) => !(a === "-p" && all[i + 1] === "no:xdist") && !(a === "no:xdist" && all[i - 1] === "-p")
    );
    const cmd = [this.opts.python, ...args].map(shellQuote).join(" ");
    const wrapped = spec.cpuSlowdown ? `npx flipfactor slow ${spec.cpuSlowdown} -- ${cmd}` : cmd;
    const prefix = envPrefix(env);
    return prefix ? `${prefix} ${wrapped}` : wrapped;
  }
  defaultScope(target) {
    return import_node_path3.default.dirname(target.split("::")[0] ?? target) || ".";
  }
};

// src/stats.ts
function logFactorial(n) {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}
function hypergeom(a, b, c, d) {
  const n = a + b + c + d;
  return Math.exp(
    logFactorial(a + b) + logFactorial(c + d) + logFactorial(a + c) + logFactorial(b + d) - logFactorial(n) - logFactorial(a) - logFactorial(b) - logFactorial(c) - logFactorial(d)
  );
}
function fisherGreater(failA, runsA, failB, runsB) {
  if (failA === 0) return 1;
  const totalFail = failA + failB;
  let p = 0;
  for (let a = failA; a <= Math.min(runsA, totalFail); a++) {
    const b = runsA - a;
    const c = totalFail - a;
    const d = runsB - c;
    if (b < 0 || c < 0 || d < 0) continue;
    p += hypergeom(a, b, c, d);
  }
  return Math.min(1, p);
}
function median(values) {
  if (values.length === 0) return void 0;
  const s = [...values].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

// src/analysis.ts
var fails = (e) => e.runs > 0 && e.failed === e.runs;
var passes = (e) => e.runs > 0 && e.failed === 0;
var mixed = (e) => e.runs > 0 && !fails(e) && !passes(e);
function counts(e) {
  return `${e.failed}/${e.runs}`;
}
function list(vs) {
  return vs.map((v) => `${v.value} (${counts(v.ev)} failed)`).join(", ");
}
function judgeVariants(variants, alpha = 0.05) {
  const failing = variants.filter((v) => fails(v.ev));
  const passing = variants.filter((v) => passes(v.ev));
  const mixedOnes = variants.filter((v) => !v.reference && mixed(v.ev));
  const perturbedInFlip = [...failing, ...passing].some((v) => !v.reference);
  if (failing.length > 0 && passing.length > 0 && perturbedInFlip && mixedOnes.length === 0) {
    return { strength: "deterministic", failing, passing, mixedOnes };
  }
  const ref = variants.find((v) => v.reference);
  const perturbed = variants.filter((v) => !v.reference);
  if (ref && perturbed.length > 0) {
    const pf = perturbed.reduce((s, v) => s + v.ev.failed, 0);
    const pr = perturbed.reduce((s, v) => s + v.ev.runs, 0);
    if (pr > 0 && pf / pr > ref.ev.failed / Math.max(1, ref.ev.runs) && fisherGreater(pf, pr, ref.ev.failed, ref.ev.runs) < alpha) {
      return { strength: "elevated", failing, passing, mixedOnes };
    }
  }
  return { strength: "none", failing, passing, mixedOnes };
}
var AXIS_NOUN = {
  order: "test order",
  parallel: "parallelism",
  timezone: "timezone",
  locale: "locale",
  seed: "random seed",
  clock: "system clock",
  cpu: "CPU speed"
};
function summarise(axis, verdict, variants) {
  const { strength, failing, passing, mixedOnes } = verdict;
  if (strength === "none") return `no effect from ${AXIS_NOUN[axis]} (${variants.length} conditions)`;
  if (failing.length > 0 && passing.length > 0) {
    if (axis === "seed") {
      const f = failing.filter((v) => !v.reference);
      const p = passing.filter((v) => !v.reference);
      if (f.length > 0 && p.length > 0) {
        return `outcome is decided by the random seed: fails with ${f.map((v) => v.value).join(", ")}, passes with ${p.map((v) => v.value).join(", ")} (each seed gave the same result on every run)`;
      }
    }
    const refFails = failing.some((v) => v.reference);
    const lead = refFails ? `passes only under ${list(passing)}` : `fails under ${list(failing)}`;
    const rest = refFails ? `fails under ${list(failing)}` : `passes under ${list(passing)}`;
    const extra = mixedOnes.length ? `; mixed under ${list(mixedOnes)}` : "";
    return `${lead}; ${rest}${extra}`;
  }
  const perturbed = variants.filter((v) => !v.reference);
  const ref = variants.find((v) => v.reference);
  return `${AXIS_NOUN[axis]} raises the failure rate: ${list(perturbed)} vs ${ref ? list([ref]) : "baseline"}`;
}
var FLAKY_AXES = ["order", "seed", "cpu", "parallel"];
function classify(isolated, suite, findings) {
  const real2 = findings.filter((f) => f.strength === "deterministic" || f.strength === "elevated");
  const anyFailure = isolated.failed > 0 || suite.failed > 0 || findings.some((f) => f.evidence.some((e) => e.failed > 0));
  if (!anyFailure) return "not-reproduced";
  const baselineMixed = mixed(isolated) || mixed(suite);
  if (real2.length === 0) {
    if (baselineMixed) return "flaky-unexplained";
    if (fails(isolated) && fails(suite)) return "broken";
    return "flaky-unexplained";
  }
  if (real2.some((f) => FLAKY_AXES.includes(f.axis)) || baselineMixed) return "flaky";
  return "environment-dependent";
}
var STRENGTH_RANK = { deterministic: 0, elevated: 1, none: 2, skipped: 3 };
var AXIS_RANK = ["order", "seed", "timezone", "clock", "locale", "cpu", "parallel"];
function rankFindings(findings) {
  return [...findings].sort(
    (a, b) => STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength] || AXIS_RANK.indexOf(a.axis) - AXIS_RANK.indexOf(b.axis)
  );
}
function headline(classification, findings, isolated, suite) {
  const top = rankFindings(findings).find((f) => f.strength === "deterministic" || f.strength === "elevated");
  if (top) return top.summary;
  switch (classification) {
    case "not-reproduced":
      return `never failed in ${isolated.runs + suite.runs} baseline runs or under any perturbation`;
    case "broken":
      return `fails every time (${counts(isolated)} alone, ${counts(suite)} with its neighbours) and no perturbation makes it pass`;
    default:
      return `fails intermittently (${counts(isolated)} alone, ${counts(suite)} with its neighbours) but no tested factor explains it`;
  }
}

// src/engine.ts
function defaultClocks(now = /* @__PURE__ */ new Date()) {
  const y = now.getFullYear();
  let leap = y + 1;
  while (!(leap % 4 === 0 && (leap % 100 !== 0 || leap % 400 === 0))) leap++;
  return [`${y}-12-31T23:59:30`, `${y + 1}-01-31T23:59:30`, `${leap}-02-29T12:00:00`, `${y + 1}-03-01T00:00:05`];
}
var DEFAULTS = {
  baselineRuns: 3,
  repeats: 2,
  confirmRuns: 2,
  timezones: ["UTC", "America/Los_Angeles", "Asia/Kolkata", "Pacific/Auckland", "Pacific/Kiritimati"],
  locales: ["de_DE.UTF-8", "tr_TR.UTF-8", "ar_EG.UTF-8"],
  seeds: [1, 2, 3, 4, 5, 6],
  shuffles: 4,
  cpuSlowdown: 8,
  workers: 4
};
var Engine = class {
  constructor(adapter, opts) {
    this.adapter = adapter;
    this.opts = opts;
  }
  adapter;
  opts;
  runs = 0;
  caps;
  /** Factors already explained and held fixed for the remaining axes. */
  control = {};
  async sample(spec, target, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const res = await this.adapter.run(spec);
      this.runs++;
      if (res.error) throw new Error(`runner failed for ${this.adapter.reproCommand(spec)}
${res.error}`);
      const o = res.outcomes.get(target);
      if (!o || o.outcome === "missing") {
        throw new Error(`runner did not report ${target}; check the test id (command: ${this.adapter.reproCommand(spec)})`);
      }
      if (o.outcome === "skip") continue;
      out.push({ failed: o.outcome === "fail", durationMs: o.durationMs });
    }
    return out;
  }
  async evidence(label, spec, target, n) {
    const s = await this.sample(spec, target, n);
    const ev2 = { label, runs: s.length, failed: s.filter((x) => x.failed).length };
    const m = median(s.map((x) => x.durationMs));
    if (m !== void 0) ev2.medianMs = Math.round(m * 10) / 10;
    this.opts.log(`  ${label}: ${counts(ev2)} failed`);
    return ev2;
  }
  async diagnose(target) {
    this.caps = await this.adapter.capabilities();
    const startRuns = this.runs;
    this.opts.log(`diagnosing ${target}`);
    const neighbours = await this.adapter.neighbours(target);
    if (!neighbours.includes(target)) {
      throw new Error(`${target} is not among the tests the runner collected:
  ${neighbours.join("\n  ")}`);
    }
    const alone = { tests: [target], env: {} };
    const isolated = await this.evidence("alone", alone, target, this.opts.baselineRuns);
    const unit = this.adapter.name === "go" ? "package" : "file";
    const suite = await this.evidence(`whole ${unit}, default order`, { tests: neighbours, env: {} }, target, this.opts.baselineRuns);
    const findings = [];
    const axes = this.opts.axes.includes("seed") ? ["seed", ...this.opts.axes.filter((a) => a !== "seed")] : this.opts.axes;
    this.control = {};
    let reference = isolated;
    for (const axis of axes) {
      const f = await this.axis(axis, target, neighbours, reference, suite);
      if (!f) continue;
      findings.push(f);
      if (axis === "seed" && f.strength === "deterministic") {
        const pin = f.evidence.map((e) => /^seed (\d+)$/.exec(e.label)).find((m, i) => m && f.evidence[i].failed === 0);
        if (pin) {
          this.control = { rngSeed: Number(pin[1]) };
          this.opts.log(`  pinning seed ${pin[1]} for the remaining axes`);
          reference = await this.evidence(`alone, seed ${pin[1]}`, { tests: [target], env: {}, ...this.control }, target, this.opts.baselineRuns);
        }
      }
    }
    const classification = classify(isolated, suite, findings);
    return {
      id: target,
      classification,
      headline: headline(classification, findings, isolated, suite),
      baseline: { isolated, suite },
      findings: rankFindings(findings),
      runs: this.runs - startRuns
    };
  }
  skipped(axis, reason) {
    this.opts.log(`  ${axis}: skipped (${reason})`);
    return { axis, strength: "skipped", summary: reason, evidence: [] };
  }
  async axis(axis, target, neighbours, isolated, suite) {
    switch (axis) {
      case "order":
        return this.orderAxis(target, neighbours, isolated, suite);
      case "parallel":
        if (!this.caps.parallel) return this.skipped(axis, `${this.adapter.name} cannot run in parallel here (pytest needs pytest-xdist)`);
        return this.parallelAxis(target);
      case "timezone":
        return this.envAxis(
          axis,
          target,
          isolated,
          `inherited TZ (${this.opts.inheritedTz})`,
          this.opts.timezones.map((tz) => ({ value: `TZ=${tz}`, spec: { tests: [target], env: { TZ: tz } } }))
        );
      case "locale":
        if (!this.caps.locale) return this.skipped(axis, `${this.adapter.name} does not read the locale from the environment`);
        return this.envAxis(
          axis,
          target,
          isolated,
          `inherited locale (${this.opts.inheritedLocale})`,
          this.opts.locales.map((l) => ({ value: `LC_ALL=${l}`, spec: { tests: [target], env: { LC_ALL: l, LANG: l } } }))
        );
      case "seed":
        if (!this.caps.seed) return this.skipped(axis, `${this.adapter.name} has no global random seed to control`);
        return this.envAxis(
          axis,
          target,
          isolated,
          "unseeded",
          this.opts.seeds.map((s) => ({ value: `seed ${s}`, spec: { tests: [target], env: {}, rngSeed: s } }))
        );
      case "clock":
        if (!this.caps.clock) {
          return this.skipped(axis, this.adapter.name === "go" ? "Go reads the clock through the vDSO, which libfaketime cannot intercept" : "libfaketime is not installed (apt-get install faketime)");
        }
        return this.envAxis(
          axis,
          target,
          isolated,
          "real clock",
          this.opts.clocks.map((c) => ({ value: `clock ${c.replace("T", " ")}`, spec: { tests: [target], env: {}, clock: c } }))
        );
      case "cpu":
        if (!hasTaskset()) return this.skipped(axis, "CPU slowdown needs Linux taskset");
        return this.envAxis(
          axis,
          target,
          isolated,
          "normal speed",
          [{ value: `CPU slowed ~${this.opts.cpuSlowdown}x`, spec: { tests: [target], env: {}, cpuSlowdown: this.opts.cpuSlowdown } }]
        );
    }
  }
  async envAxis(axis, target, isolated, referenceLabel, conditions) {
    this.opts.log(` ${axis}`);
    const variants = [{ value: referenceLabel, ev: { ...isolated, label: referenceLabel }, reference: true }];
    const specs = /* @__PURE__ */ new Map();
    for (const raw of conditions) {
      const c = { ...raw, spec: { ...this.control, ...raw.spec } };
      specs.set(c.value, c.spec);
      variants.push({ value: c.value, ev: await this.evidence(c.value, c.spec, target, this.opts.repeats) });
    }
    let verdict = judgeVariants(variants);
    if (verdict.strength === "deterministic" && this.opts.confirmRuns > 0) {
      for (const v of [verdict.failing.find((x) => !x.reference), verdict.passing.find((x) => !x.reference)]) {
        if (!v) continue;
        const extra = await this.evidence(`${v.value} (confirm)`, specs.get(v.value), target, this.opts.confirmRuns);
        v.ev = { ...v.ev, runs: v.ev.runs + extra.runs, failed: v.ev.failed + extra.failed };
      }
      verdict = judgeVariants(variants);
    }
    const failingSpec = verdict.failing.find((v) => !v.reference);
    let summary = summarise(axis, verdict, variants);
    if (this.control.rngSeed !== void 0 && verdict.strength !== "none") summary += ` (with seed ${this.control.rngSeed} pinned)`;
    if (axis === "cpu" && verdict.strength !== "none") {
      const slow2 = variants.find((v) => !v.reference);
      summary += `; median test time ${isolated.medianMs ?? "?"} ms -> ${slow2?.ev.medianMs ?? "?"} ms, which points at a hard-coded time budget or timeout`;
    }
    return {
      axis,
      strength: verdict.strength,
      summary,
      evidence: variants.map((v) => ({ ...v.ev, label: v.value })),
      ...failingSpec && verdict.strength !== "none" ? { repro: this.adapter.reproCommand(specs.get(failingSpec.value)) } : {}
    };
  }
  async parallelAxis(target) {
    this.opts.log(" parallel");
    const scope = this.opts.scope ?? this.adapter.defaultScope(target);
    const serialSpec = { tests: [target], env: {}, scope, workers: 1, ...this.control };
    const parSpec = { tests: [target], env: {}, scope, workers: this.opts.workers, ...this.control };
    const serial = await this.evidence(`${scope} with 1 worker`, serialSpec, target, this.opts.repeats);
    const par = await this.evidence(`${scope} with ${this.opts.workers} workers`, parSpec, target, this.opts.repeats);
    const variants = [
      { value: `1 worker over ${scope}`, ev: serial, reference: true },
      { value: `${this.opts.workers} workers over ${scope}`, ev: par }
    ];
    let verdict = judgeVariants(variants);
    if (verdict.strength === "deterministic" && this.opts.confirmRuns > 0) {
      const extra = await this.evidence(`${this.opts.workers} workers (confirm)`, parSpec, target, this.opts.confirmRuns);
      const extraSerial = await this.evidence("1 worker (confirm)", serialSpec, target, this.opts.confirmRuns);
      variants[1].ev = { ...par, runs: par.runs + extra.runs, failed: par.failed + extra.failed };
      variants[0].ev = { ...serial, runs: serial.runs + extraSerial.runs, failed: serial.failed + extraSerial.failed };
      verdict = judgeVariants(variants);
    }
    if (!verdict.failing.some((v) => !v.reference) && verdict.strength !== "elevated") {
      return {
        axis: "parallel",
        strength: "none",
        summary: `running ${scope} with ${this.opts.workers} workers does not make it fail (${counts(variants[1].ev)} vs ${counts(variants[0].ev)} serially)`,
        evidence: variants.map((v) => ({ ...v.ev, label: v.value }))
      };
    }
    let summary = summarise("parallel", verdict, variants);
    if (verdict.strength !== "none" && verdict.failing.some((v) => !v.reference)) {
      summary = `fails when ${scope} is run with ${this.opts.workers} workers (${counts(variants[1].ev)}) but not serially (${counts(
        variants[0].ev
      )}): shared state between concurrently running tests (files, ports, globals)`;
    }
    return {
      axis: "parallel",
      strength: verdict.strength,
      summary,
      evidence: variants.map((v) => ({ ...v.ev, label: v.value })),
      ...verdict.strength !== "none" ? { repro: this.adapter.reproCommand(parSpec) } : {}
    };
  }
  /** Does running `before` ahead of the target make it fail (or pass)? */
  async probe(before, target, wantFail) {
    const s = await this.sample({ tests: [...before, target], env: {} }, target, this.opts.repeats);
    const anyFail = s.some((x) => x.failed);
    const allFail = s.length > 0 && s.every((x) => x.failed);
    return wantFail ? anyFail : !allFail && s.length > 0;
  }
  /** Narrow `candidates` to a single test that triggers the effect, if one exists. */
  async isolate(candidates, target, wantFail) {
    let pool = candidates;
    while (pool.length > 1) {
      const mid = Math.ceil(pool.length / 2);
      const left = pool.slice(0, mid);
      const right = pool.slice(mid);
      if (await this.probe(left, target, wantFail)) pool = left;
      else if (await this.probe(right, target, wantFail)) pool = right;
      else return void 0;
    }
    return pool[0];
  }
  async orderAxis(target, neighbours, isolated, suite) {
    this.opts.log(" order");
    const evidence = [isolated, suite];
    const exact = this.caps.exactOrder;
    const others = neighbours.filter((t) => t !== target);
    const preceding = neighbours.slice(0, neighbours.indexOf(target));
    if (others.length === 0) return { axis: "order", strength: "none", summary: "only test in its file; order cannot matter", evidence };
    let shuffled;
    if (this.caps.shuffle && this.opts.shuffles > 0) {
      let failed = 0;
      let runs = 0;
      for (let seed = 1; seed <= this.opts.shuffles; seed++) {
        const s = await this.sample({ tests: neighbours, env: {}, shuffleSeed: seed }, target, 1);
        runs += s.length;
        failed += s.filter((x) => x.failed).length;
      }
      shuffled = { label: `file in ${this.opts.shuffles} shuffled orders`, runs, failed };
      this.opts.log(`  ${shuffled.label}: ${counts(shuffled)} failed`);
      evidence.push(shuffled);
    }
    const passesAlone = isolated.failed === 0;
    const failsAlone = isolated.runs > 0 && isolated.failed === isolated.runs;
    let direction;
    let candidates = [];
    if (passesAlone && (suite.failed > 0 || (shuffled?.failed ?? 0) > 0)) {
      direction = "polluter";
      candidates = exact ? others : preceding;
    } else if (failsAlone && (suite.failed < suite.runs || shuffled !== void 0 && shuffled.failed < shuffled.runs)) {
      direction = "enabler";
      candidates = exact ? others : preceding;
    } else if (passesAlone && suite.failed === 0 && exact && others.length > preceding.length) {
      const allBefore = await this.evidence("after every other test in the file", { tests: [...others, target], env: {} }, target, this.opts.repeats);
      evidence.push(allBefore);
      if (allBefore.failed > 0) {
        direction = "polluter";
        candidates = others;
      }
    }
    if (!direction) {
      const strength2 = shuffled && shuffled.failed > 0 && passesAlone && suite.failed === 0 ? "elevated" : "none";
      return {
        axis: "order",
        strength: strength2,
        summary: strength2 === "none" ? "no effect from test order: same result alone and alongside its neighbours" : `fails in some shuffled orders (${counts(shuffled)})`,
        evidence
      };
    }
    const wantFail = direction === "polluter";
    const culprit = candidates.length > 0 ? await this.isolate(candidates, target, wantFail) : void 0;
    if (!culprit) {
      const what = wantFail ? "fails alongside its neighbours but passes alone" : "passes alongside its neighbours but fails alone";
      return {
        axis: "order",
        strength: "elevated",
        summary: `${what}; no single test is responsible (it takes a combination, or the culprit only runs after it in file order)`,
        evidence,
        repro: this.adapter.reproCommand({ tests: neighbours, env: {} })
      };
    }
    const pairSpec = { tests: [culprit, target], env: {} };
    const after = await this.evidence(`right after ${culprit}`, pairSpec, target, this.opts.baselineRuns);
    evidence.push(after);
    let before;
    if (exact) {
      before = await this.evidence(`right before ${culprit}`, { tests: [target, culprit], env: {} }, target, this.opts.baselineRuns);
      evidence.push(before);
    }
    const cleanAfter = wantFail ? after.failed === after.runs : after.failed === 0;
    const cleanBefore = before === void 0 || (wantFail ? before.failed === 0 : before.failed === before.runs);
    const strength = cleanAfter && cleanBefore ? "deterministic" : "elevated";
    const summary = wantFail ? `fails only when run after ${culprit} (${counts(after)} right after it, ${counts(isolated)} alone${before ? `, ${counts(before)} when run before it` : ""}): that test leaves shared state behind` : `passes only when run after ${culprit} (${counts(after)} failed right after it, ${counts(isolated)} alone): it depends on setup that test does`;
    return { axis: "order", strength, summary, evidence, culprit, repro: this.adapter.reproCommand(pairSpec) };
  }
};

// src/failed.ts
var import_node_fs5 = require("node:fs");
var import_node_path4 = __toESM(require("node:path"), 1);
function decode(s) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");
}
function attrs(s) {
  const out = {};
  for (const m of s.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = decode(m[2]);
  return out;
}
function pytestNodeId(classname, name, cwd) {
  const parts = classname.split(".");
  for (let k = parts.length; k >= 1; k--) {
    const file = `${parts.slice(0, k).join("/")}.py`;
    if ((0, import_node_fs5.existsSync)(import_node_path4.default.join(cwd, file))) return [file, ...parts.slice(k), name].join("::");
  }
  return [`${parts.join("/")}.py`, name].join("::");
}
function failedFromJUnit(xml, cwd) {
  const ids = [];
  for (const m of xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const body = m[2] ?? "";
    if (!/<(failure|error)\b/.test(body)) continue;
    const a = attrs(m[1] ?? "");
    if (!a.name) continue;
    ids.push(pytestNodeId(a.classname ?? "", a.name, cwd));
  }
  return [...new Set(ids)];
}
function failedFromJestJson(text, cwd) {
  const parsed = parseJestJson(JSON.parse(text), cwd);
  return [...parsed.entries()].filter(([id, o]) => o.outcome === "fail" && !id.endsWith("::*")).map(([id]) => id);
}
function failedFromReport(text, runner, cwd) {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<")) {
    if (runner !== "pytest") throw new Error("JUnit XML input is supported for pytest; for Jest pass its --json output");
    return failedFromJUnit(text, cwd);
  }
  if (runner !== "jest") throw new Error("JSON input is Jest's --json output; for pytest pass --junitxml output");
  return failedFromJestJson(text, cwd);
}

// src/report/index.ts
var LABEL = {
  flaky: "FLAKY",
  "environment-dependent": "ENVIRONMENT-DEPENDENT",
  broken: "BROKEN",
  "flaky-unexplained": "FLAKY, CAUSE NOT FOUND",
  "not-reproduced": "NOT REPRODUCED"
};
var real = (f) => f.strength === "deterministic" || f.strength === "elevated";
function ev(e) {
  return `${e.failed}/${e.runs} failed${e.medianMs !== void 0 ? `, median ${e.medianMs} ms` : ""}`;
}
function toJson(report) {
  return JSON.stringify(report, null, 2) + "\n";
}
function toText(report) {
  const lines = [];
  lines.push(`flipfactor ${report.version} \xB7 ${report.runner} \xB7 ${report.totalRuns} runs \xB7 ${(report.wallMs / 1e3).toFixed(1)} s`);
  lines.push(`inherited TZ ${report.inherited.tz}, locale ${report.inherited.locale}`);
  for (const t of report.tests) {
    lines.push("");
    lines.push(`${LABEL[t.classification]}  ${t.id}`);
    lines.push(`  ${t.headline}`);
    lines.push(`  baseline: alone ${ev(t.baseline.isolated)}; with its neighbours ${ev(t.baseline.suite)}`);
    for (const f of t.findings.filter(real)) {
      lines.push(`  [${f.axis}] ${f.strength}: ${f.summary}`);
      for (const e of f.evidence) lines.push(`      ${e.label.padEnd(44)} ${ev(e)}`);
      if (f.repro) lines.push(`      repro: ${f.repro}`);
    }
    const quiet = t.findings.filter((f) => f.strength === "none").map((f) => f.axis);
    const skipped = t.findings.filter((f) => f.strength === "skipped");
    if (quiet.length) lines.push(`  no effect: ${quiet.join(", ")}`);
    for (const s of skipped) lines.push(`  skipped ${s.axis}: ${s.summary}`);
    lines.push(`  ${t.runs} runs`);
  }
  return lines.join("\n") + "\n";
}
function mdEscape(s) {
  return s.replace(/\|/g, "\\|");
}
var COMMENT_MARKER = "<!-- flipfactor-report -->";
function toMarkdown(report) {
  const out = [COMMENT_MARKER, "## flipfactor: why is it flaky?", ""];
  out.push("| Test | Verdict | Why |", "| --- | --- | --- |");
  for (const t of report.tests) out.push(`| \`${mdEscape(t.id)}\` | ${LABEL[t.classification]} | ${mdEscape(t.headline)} |`);
  for (const t of report.tests) {
    out.push("", `<details><summary><code>${t.id}</code>: ${LABEL[t.classification].toLowerCase()}</summary>`, "");
    out.push(`Baseline: alone ${ev(t.baseline.isolated)}; with its neighbours ${ev(t.baseline.suite)}.`, "");
    const shown = t.findings.filter(real);
    for (const f of shown) {
      out.push(`**${f.axis}** (${f.strength}): ${f.summary}`, "", "| Condition | Failed |", "| --- | --- |");
      for (const e of f.evidence) out.push(`| ${mdEscape(e.label)} | ${e.failed}/${e.runs} |`);
      if (f.repro) out.push("", "```sh", f.repro, "```");
      out.push("");
    }
    const quiet = t.findings.filter((f) => f.strength === "none").map((f) => f.axis);
    if (quiet.length) out.push(`No effect: ${quiet.join(", ")}.`);
    const skipped = t.findings.filter((f) => f.strength === "skipped");
    if (skipped.length) out.push(`Skipped: ${skipped.map((s) => `${s.axis} (${s.summary})`).join("; ")}.`);
    out.push("", "</details>");
  }
  out.push("", `<sub>${report.totalRuns} runs in ${(report.wallMs / 1e3).toFixed(0)} s with ${report.runner}, inherited TZ ${report.inherited.tz}. flipfactor ${report.version}</sub>`, "");
  return out.join("\n");
}

// src/types.ts
var ALL_AXES = ["order", "parallel", "timezone", "locale", "seed", "clock", "cpu"];

// src/cli.ts
var HELP = `flipfactor ${package_default.version}: find out WHY a test is flaky.

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
function canonicalTz(tz) {
  try {
    const resolved = new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;
    const aliases = { "Asia/Calcutta": "Asia/Kolkata", "Asia/Katmandu": "Asia/Kathmandu", "Asia/Saigon": "Asia/Ho_Chi_Minh" };
    return aliases[resolved] ?? resolved;
  } catch {
    return tz;
  }
}
function list2(value, fallback) {
  return value ? value.split(",").map((s) => s.trim()).filter(Boolean) : fallback;
}
function int(value, fallback, name) {
  if (value === void 0) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`--${name} must be a non-negative integer`);
  return n;
}
async function slow(argv) {
  const factor = Number(argv[0]);
  const dash = argv.indexOf("--");
  const cmd = dash >= 0 ? argv.slice(dash + 1) : argv.slice(1);
  if (!Number.isInteger(factor) || factor < 2 || cmd.length === 0) {
    process.stderr.write("usage: flipfactor slow <factor >= 2> -- <command...>\n");
    return 2;
  }
  const res = await exec(cmd[0], cmd.slice(1), { cwd: process.cwd(), cpuSlowdown: factor });
  process.stdout.write(res.stdout);
  process.stderr.write(res.stderr);
  return res.code ?? 1;
}
function makeAdapter(runner, cwd, v, timeoutMs) {
  const extraArgs = v["runner-arg"] ?? [];
  switch (runner) {
    case "pytest": {
      const venv = process.env.VIRTUAL_ENV;
      const python = v.python ?? (venv ? import_node_path5.default.join(venv, "bin", "python") : "python3");
      return new PytestAdapter({ cwd, python, extraArgs, timeoutMs });
    }
    case "jest":
      return new JestAdapter({ cwd, jestBin: v.jest, extraArgs, timeoutMs });
    case "go":
      return new GoAdapter({ cwd, goBin: v.go ?? "go", extraArgs, timeoutMs });
  }
}
async function main(argv) {
  if (argv[0] === "slow") return slow(argv.slice(1));
  const { values: v, positionals } = (0, import_node_util.parseArgs)({
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
      version: { type: "boolean", short: "v" }
    }
  });
  if (v.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (v.version) {
    process.stdout.write(`${package_default.version}
`);
    return 0;
  }
  const runner = v.runner;
  if (!runner || !["pytest", "jest", "go"].includes(runner)) throw new Error("--runner must be pytest, jest or go (see --help)");
  const cwd = import_node_path5.default.resolve(v.cwd ?? ".");
  const axes = list2(v.axes, [...ALL_AXES]);
  for (const a of axes) if (!ALL_AXES.includes(a)) throw new Error(`unknown axis ${a}; choose from ${ALL_AXES.join(", ")}`);
  let tests = positionals;
  if (v.from) tests = [...failedFromReport((0, import_node_fs6.readFileSync)(v.from, "utf8"), runner, cwd), ...tests];
  tests = [...new Set(tests)];
  const maxTests = int(v["max-tests"], 5, "max-tests");
  if (tests.length > maxTests) {
    process.stderr.write(`flipfactor: ${tests.length} tests given, diagnosing the first ${maxTests} (--max-tests)
`);
    tests = tests.slice(0, maxTests);
  }
  const inherited = {
    tz: canonicalTz(process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"),
    locale: process.env.LC_ALL || process.env.LANG || "C"
  };
  const log = v.quiet ? () => {
  } : (msg) => process.stderr.write(`${msg}
`);
  const timeoutMs = int(v.timeout, 300, "timeout") * 1e3;
  const engine = new Engine(makeAdapter(runner, cwd, v, timeoutMs), {
    axes,
    baselineRuns: Math.max(1, int(v["baseline-runs"], DEFAULTS.baselineRuns, "baseline-runs")),
    repeats: Math.max(1, int(v.repeats, DEFAULTS.repeats, "repeats")),
    confirmRuns: int(v["confirm-runs"], DEFAULTS.confirmRuns, "confirm-runs"),
    timezones: list2(v.timezones, DEFAULTS.timezones).filter((tz) => canonicalTz(tz) !== inherited.tz),
    locales: list2(v.locales, DEFAULTS.locales),
    seeds: list2(v.seeds, DEFAULTS.seeds.map(String)).map(Number),
    clocks: list2(v.clocks, defaultClocks()),
    shuffles: int(v.shuffles, DEFAULTS.shuffles, "shuffles"),
    cpuSlowdown: Math.max(2, int(v["cpu-slowdown"], DEFAULTS.cpuSlowdown, "cpu-slowdown")),
    workers: Math.max(2, int(v.workers, DEFAULTS.workers, "workers")),
    scope: v.scope,
    inheritedTz: inherited.tz,
    inheritedLocale: inherited.locale,
    log
  });
  const started = Date.now();
  const report = {
    tool: "flipfactor",
    version: package_default.version,
    runner,
    cwd,
    startedAt: new Date(started).toISOString(),
    wallMs: 0,
    totalRuns: 0,
    inherited,
    tests: []
  };
  if (tests.length === 0) {
    log("flipfactor: no tests to diagnose");
  }
  for (const t of tests) report.tests.push(await engine.diagnose(t));
  report.wallMs = Date.now() - started;
  report.totalRuns = engine.runs;
  if (v.json) (0, import_node_fs6.writeFileSync)(v.json, toJson(report));
  if (v.markdown) (0, import_node_fs6.writeFileSync)(v.markdown, toMarkdown(report));
  process.stdout.write(toText(report));
  return 0;
}
var invokedDirectly = typeof require !== "undefined" && require.main === module;
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`flipfactor: ${err instanceof Error ? err.message : String(err)}
`);
      process.exit(2);
    }
  );
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  canonicalTz,
  main
});
