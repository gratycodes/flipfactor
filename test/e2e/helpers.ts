import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect } from "vitest";
import type { AxisName, Report, TestDiagnosis } from "../../src/types.js";

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const CLI = path.join(ROOT, "dist", "flipfactor.cjs");

/** Run the bundled CLI the way a user would, with TZ pinned for determinism. */
export function runCli(args: string[], env: Record<string, string> = {}): Report {
  const out = path.join(mkdtempSync(path.join(tmpdir(), "flipfactor-e2e-")), "report.json");
  const res = spawnSync(process.execPath, [CLI, ...args, "--json", out, "--quiet"], {
    env: { ...process.env, TZ: "UTC", LC_ALL: "C.UTF-8", LANG: "C.UTF-8", ...env },
    encoding: "utf8",
    timeout: 1_500_000,
  });
  if (res.status !== 0) throw new Error(`flipfactor exited ${res.status}\n${res.stdout}\n${res.stderr}`);
  process.stdout.write(res.stdout);
  return JSON.parse(readFileSync(out, "utf8")) as Report;
}

export function find(report: Report, id: string): TestDiagnosis {
  const t = report.tests.find((x) => x.id === id);
  if (!t) throw new Error(`no diagnosis for ${id}; have ${report.tests.map((x) => x.id).join(", ")}`);
  return t;
}

/** The planted cause is found, deterministically, and nothing else is blamed. */
export function expectOnlyCause(t: TestDiagnosis, axis: AxisName): void {
  const blamed = t.findings.filter((f) => f.strength === "deterministic" || f.strength === "elevated").map((f) => f.axis);
  expect(blamed, `${t.id}: ${t.headline}`).toEqual([axis]);
  expect(t.findings.find((f) => f.axis === axis)?.strength).toBe("deterministic");
}

export function expectNoCause(t: TestDiagnosis): void {
  const blamed = t.findings.filter((f) => f.strength === "deterministic" || f.strength === "elevated");
  expect(blamed.map((f) => f.summary)).toEqual([]);
}

export function haveCommand(cmd: string, args: string[] = ["--version"]): boolean {
  try {
    execFileSync(cmd, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
