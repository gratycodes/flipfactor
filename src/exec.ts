import { spawn, spawnSync, type ChildProcess } from "node:child_process";

export interface ExecOptions {
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  /** Slow the command down ~N times by pinning it and N-1 busy loops to one CPU. */
  cpuSlowdown?: number;
}

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
  wallMs: number;
  timedOut: boolean;
}

let tasksetAvailable: boolean | undefined;

export function hasTaskset(): boolean {
  if (tasksetAvailable === undefined) {
    tasksetAvailable =
      process.platform === "linux" && spawnSync("taskset", ["-c", "0", "true"], { stdio: "ignore" }).status === 0;
  }
  return tasksetAvailable;
}

function startHogs(count: number, cpu: string): ChildProcess[] {
  const hogs: ChildProcess[] = [];
  for (let i = 0; i < count; i++) {
    hogs.push(
      spawn("taskset", ["-c", cpu, process.execPath, "-e", "for(;;){}"], { stdio: "ignore", detached: false }),
    );
  }
  return hogs;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function exec(cmd: string, args: string[], opts: ExecOptions): Promise<ExecResult> {
  const env = { ...process.env, ...opts.env };
  let file = cmd;
  let argv = args;
  let hogs: ChildProcess[] = [];
  if (opts.cpuSlowdown && opts.cpuSlowdown > 1) {
    if (!hasTaskset()) throw new Error("CPU slowdown needs Linux taskset");
    const cpu = "0";
    hogs = startHogs(opts.cpuSlowdown - 1, cpu);
    await sleep(150); // let the hogs reach the scheduler before the test starts
    file = "taskset";
    argv = ["-c", cpu, cmd, ...args];
  }
  const started = performance.now();
  try {
    return await new Promise<ExecResult>((resolve, reject) => {
      const child = spawn(file, argv, { cwd: opts.cwd, env, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      const timer = opts.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, opts.timeoutMs)
        : undefined;
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

/** Quote a value for a POSIX shell, only when needed. */
export function shellQuote(value: string): string {
  if (/^[\w@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function envPrefix(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([k, v]) => `${k}=${shellQuote(v)}`)
    .join(" ");
}
